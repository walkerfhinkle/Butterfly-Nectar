// Smoke-tests the three Netlify wrappers with real Request objects (no network).
import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fn_secret";
delete process.env.RESEND_API_KEY;

const checkout = (await import("../netlify/functions/create-checkout-session.mjs")).default;
const verify = (await import("../netlify/functions/verify-session.mjs")).default;
const webhook = (await import("../netlify/functions/stripe-webhook.mjs")).default;
const stripe = new Stripe("sk_test_dummy");

test("create-checkout-session: rejects GET, bad JSON, empty cart, unknown product", async () => {
  assert.equal((await checkout(new Request("https://x.test/api/create-checkout-session"))).status, 405);
  const post = (body) => checkout(new Request("https://x.test/api/create-checkout-session", { method: "POST", body }));
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post(JSON.stringify({ items: [] }))).status, 400);
  assert.equal((await post(JSON.stringify({ items: [{ id: "hack", qty: 1 }] }))).status, 400);
});

test("verify-session: rejects missing/invalid ids", async () => {
  assert.equal((await verify(new Request("https://x.test/api/verify-session"))).status, 400);
  assert.equal((await verify(new Request("https://x.test/api/verify-session?session_id=bad"))).status, 400);
});

test("stripe-webhook: unsigned and badly signed requests get 400", async () => {
  const req = (headers) => webhook(new Request("https://x.test/api/stripe-webhook", { method: "POST", body: "{}", headers }));
  assert.equal((await req({})).status, 400);
  assert.equal((await req({ "stripe-signature": "t=1,v1=bad" })).status, 400);
});

test("stripe-webhook: a correctly signed but unrelated event is accepted (200)", async () => {
  const payload = JSON.stringify({ id: "evt_2", object: "event", type: "customer.created", data: { object: {} } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_fn_secret" });
  const res = await webhook(new Request("https://x.test/api/stripe-webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).emailed, false);
});
