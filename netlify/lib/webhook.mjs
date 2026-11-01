// Stripe webhook: the ONLY thing that triggers the order email.
//
// Stripe calls this URL, server to server, after a payment. We:
//   1. verify the request really came from Stripe (signature check),
//   2. confirm with Stripe that the payment is "paid",
//   3. only then email Imani.
// Landing on the site's thank-you URL never sends anything.

import { HttpError } from "./checkout.mjs";
import { buildOrderEmail } from "./email.mjs";

const PAID_EVENTS = new Set([
  "checkout.session.completed",               // card payments: paid right away
  "checkout.session.async_payment_succeeded"  // delayed methods: paid later
]);

export async function handleStripeWebhook({ stripe, rawBody, signature, webhookSecret, sendOrderEmail, now = new Date() }) {
  if (!webhookSecret) throw new HttpError(500, "STRIPE_WEBHOOK_SECRET is not set.");
  if (!signature) throw new HttpError(400, "Missing Stripe signature.");

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    throw new HttpError(400, "Invalid Stripe signature.");
  }

  if (!PAID_EVENTS.has(event.type)) {
    return { received: true, emailed: false, reason: "event ignored" };
  }

  const eventSession = event.data.object;
  if (eventSession.payment_status !== "paid") {
    // e.g. a delayed payment still pending; the async_payment_succeeded event comes later
    return { received: true, emailed: false, reason: "not paid yet" };
  }

  // Ask Stripe directly (don't just trust the event payload) and pull the line items.
  const session = await stripe.checkout.sessions.retrieve(eventSession.id, { expand: ["line_items"] });
  if (session.payment_status !== "paid") {
    return { received: true, emailed: false, reason: "not paid yet" };
  }

  const email = buildOrderEmail(session, now);
  // If this throws, the function returns 500 and Stripe retries the webhook automatically.
  await sendOrderEmail({ ...email, idempotencyKey: `order-${session.id}` });
  return { received: true, emailed: true };
}
