import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import Stripe from "stripe";

import { PRODUCTS } from "../netlify/lib/products.mjs";
import { buildLineItems, createCheckoutSession, HttpError } from "../netlify/lib/checkout.mjs";
import { verifySession } from "../netlify/lib/verify.mjs";
import { buildOrderEmail, sendEmail } from "../netlify/lib/email.mjs";
import { handleStripeWebhook } from "../netlify/lib/webhook.mjs";

const SECRET = "whsec_test_secret";
const realStripe = new Stripe("sk_test_dummy"); // only used for its offline signature code

// ---- fixtures -------------------------------------------------------------
function paidSession(overrides = {}) {
  return {
    id: "cs_test_abc123",
    payment_status: "paid",
    livemode: false,
    currency: "usd",
    amount_total: 3720,
    payment_intent: "pi_test_999",
    customer_details: { name: "Jane Doe", email: "jane@example.com", phone: "+13175551234" },
    shipping_details: {
      name: "Jane Doe",
      address: { line1: "123 Main St", line2: "Apt 4", city: "Noblesville", state: "IN", postal_code: "46060", country: "US" }
    },
    line_items: { data: [
      { description: "Butterfly Nectar — 1oz Jar", quantity: 1, amount_total: 930 },
      { description: "Butterfly Nectar — 8oz Jar", quantity: 1, amount_total: 2790 }
    ] },
    ...overrides
  };
}

function signedEvent(type, session) {
  const payload = JSON.stringify({ id: "evt_1", object: "event", type, data: { object: session } });
  const signature = realStripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { payload, signature };
}

function stubStripe(sessionForRetrieve) {
  const calls = { retrieve: 0 };
  return {
    calls,
    webhooks: realStripe.webhooks,
    checkout: { sessions: {
      retrieve: async () => { calls.retrieve++; return sessionForRetrieve; },
      create: async (params) => { calls.created = params; return { url: "https://checkout.stripe.com/c/pay/cs_test_xyz" }; }
    } }
  };
}

// ---- catalog --------------------------------------------------------------
test("front-end catalog (assets/shop-config.js) matches the server catalog", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL("../assets/shop-config.js", import.meta.url), "utf8"), sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.BN_PRODUCTS)), PRODUCTS);
});

// ---- checkout session -----------------------------------------------------
test("line items are re-priced from the server catalog, ignoring client prices", () => {
  const items = buildLineItems([{ id: "bn-4oz", qty: 2, price: 1 }, { id: "bn-1oz", qty: 1 }]);
  assert.equal(items[0].price_data.unit_amount, 2139);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[1].price_data.unit_amount, 930);
});

test("bad carts are rejected", () => {
  for (const bad of [[], null, [{ id: "nope", qty: 1 }], [{ id: "bn-1oz", qty: 0 }], [{ id: "bn-1oz", qty: 21 }], [{ id: "bn-1oz", qty: 1.5 }], [{ id: "bn-1oz", qty: "abc" }]]) {
    assert.throws(() => buildLineItems(bad), HttpError, JSON.stringify(bad));
  }
});

test("checkout session asks for address + phone and shows the 72-hour message", async () => {
  const stripe = stubStripe();
  const { url } = await createCheckoutSession({ stripe, items: [{ id: "bn-2oz", qty: 3 }], siteUrl: "https://butterflynectar.shop" });
  const p = stripe.calls.created;
  assert.match(url, /^https:\/\/checkout\.stripe\.com/);
  assert.equal(p.mode, "payment");
  assert.deepEqual(p.shipping_address_collection.allowed_countries, ["US"]);
  assert.equal(p.phone_number_collection.enabled, true);
  assert.match(p.custom_text.submit.message, /72 hours/);
  assert.match(p.custom_text.shipping_address.message, /72 hours/);
  assert.match(p.success_url, /^https:\/\/butterflynectar\.shop\/\?checkout=success&session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.equal(p.payment_intent_data.transfer_data, undefined); // no splits / Connect
  assert.equal(p.payment_intent_data.application_fee_amount, undefined);
});

// ---- verify ---------------------------------------------------------------
test("verify-session reports paid + first name only when actually paid", async () => {
  assert.deepEqual(await verifySession({ stripe: stubStripe(paidSession()), sessionId: "cs_test_abc123" }), { paid: true, firstName: "Jane" });
  assert.deepEqual(await verifySession({ stripe: stubStripe(paidSession({ payment_status: "unpaid" })), sessionId: "cs_test_abc123" }), { paid: false, firstName: "" });
  await assert.rejects(verifySession({ stripe: stubStripe(), sessionId: "../etc/passwd" }), HttpError);
});

// ---- email content --------------------------------------------------------
test("order email leads with payment received + 72 hours, and includes all order details", () => {
  const { subject, text, html, replyTo } = buildOrderEmail(paidSession(), new Date("2026-11-02T20:00:00Z"));
  assert.match(subject, /Payment received: \$37\.20 from Jane Doe/);
  assert.match(text.split("\n")[0], /PAYMENT RECEIVED.*72-hour turnaround.*Thursday, November 5/);
  assert.match(html, /Payment received/);
  for (const needle of ["Jane Doe", "jane@example.com", "+13175551234", "123 Main St", "Apt 4", "Noblesville, IN 46060", "1oz Jar", "8oz Jar", "$37.20", "pi_test_999"]) {
    assert.ok(text.includes(needle), `text missing ${needle}`);
    assert.ok(html.includes(needle), `html missing ${needle}`);
  }
  assert.equal(replyTo, "jane@example.com");
});

test("order email escapes customer-supplied text", () => {
  const evil = paidSession({ customer_details: { name: "<script>alert(1)</script>", email: "a@b.co" } });
  const { html } = buildOrderEmail(evil);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("email works with the newer Stripe shape (collected_information.shipping_details)", () => {
  const s = paidSession();
  s.collected_information = { shipping_details: s.shipping_details };
  delete s.shipping_details;
  assert.ok(buildOrderEmail(s).text.includes("123 Main St"));
});

test("sendEmail posts to Resend and throws on failure", async () => {
  let seen;
  await sendEmail({ to: "x@y.z", from: "a@b.c", subject: "s", text: "t", html: "h", apiKey: "re_1", idempotencyKey: "order-1",
    fetchImpl: async (url, opts) => { seen = { url, opts }; return { ok: true }; } });
  assert.equal(seen.url, "https://api.resend.com/emails");
  assert.equal(seen.opts.headers["Idempotency-Key"], "order-1");
  await assert.rejects(sendEmail({ to: "x", from: "a", subject: "s", apiKey: "re_1", fetchImpl: async () => ({ ok: false, status: 422, text: async () => "bad" }) }), /422/);
  await assert.rejects(sendEmail({ to: "x", from: "a", subject: "s" }), /RESEND_API_KEY/);
});

// ---- webhook: the "email only after confirmed payment" rule ---------------
async function runWebhook({ type, eventSession, retrieved, signatureOverride }) {
  const { payload, signature } = signedEvent(type, eventSession);
  const sent = [];
  let error;
  let result;
  try {
    result = await handleStripeWebhook({
      stripe: stubStripe(retrieved), rawBody: payload, signature: signatureOverride ?? signature, webhookSecret: SECRET,
      sendOrderEmail: async (email) => { sent.push(email); }
    });
  } catch (e) { error = e; }
  return { sent, error, result };
}

test("paid checkout.session.completed -> exactly one email", async () => {
  const { sent, result } = await runWebhook({ type: "checkout.session.completed", eventSession: paidSession(), retrieved: paidSession() });
  assert.equal(sent.length, 1);
  assert.equal(result.emailed, true);
  assert.equal(sent[0].idempotencyKey, "order-cs_test_abc123");
});

test("unpaid session -> NO email", async () => {
  const unpaid = paidSession({ payment_status: "unpaid" });
  const { sent, result } = await runWebhook({ type: "checkout.session.completed", eventSession: unpaid, retrieved: unpaid });
  assert.equal(sent.length, 0);
  assert.equal(result.emailed, false);
});

test("event says paid but Stripe says otherwise -> NO email", async () => {
  const { sent } = await runWebhook({ type: "checkout.session.completed", eventSession: paidSession(), retrieved: paidSession({ payment_status: "unpaid" }) });
  assert.equal(sent.length, 0);
});

test("delayed payment: pending sends nothing, later success sends the email", async () => {
  const pending = paidSession({ payment_status: "unpaid" });
  assert.equal((await runWebhook({ type: "checkout.session.completed", eventSession: pending, retrieved: pending })).sent.length, 0);
  assert.equal((await runWebhook({ type: "checkout.session.async_payment_succeeded", eventSession: paidSession(), retrieved: paidSession() })).sent.length, 1);
});

test("forged or tampered requests are rejected with 400 and send nothing", async () => {
  const forged = await runWebhook({ type: "checkout.session.completed", eventSession: paidSession(), retrieved: paidSession(), signatureOverride: "t=1,v1=deadbeef" });
  assert.equal(forged.error.status, 400);
  assert.equal(forged.sent.length, 0);

  const { payload, signature } = signedEvent("checkout.session.completed", paidSession());
  await assert.rejects(handleStripeWebhook({ stripe: stubStripe(paidSession()), rawBody: payload.replace("3720", "1"), signature, webhookSecret: SECRET, sendOrderEmail: async () => { throw new Error("should not send"); } }), { status: 400 });
});

test("unrelated events are acknowledged without emailing", async () => {
  const { sent, result } = await runWebhook({ type: "charge.succeeded", eventSession: { id: "ch_1" }, retrieved: paidSession() });
  assert.equal(sent.length, 0);
  assert.equal(result.received, true);
});

test("if the email fails, the webhook errors so Stripe retries", async () => {
  const { payload, signature } = signedEvent("checkout.session.completed", paidSession());
  await assert.rejects(handleStripeWebhook({ stripe: stubStripe(paidSession()), rawBody: payload, signature, webhookSecret: SECRET, sendOrderEmail: async () => { throw new Error("Resend down"); } }), /Resend down/);
});
