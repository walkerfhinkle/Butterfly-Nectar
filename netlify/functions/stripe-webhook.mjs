// POST /api/stripe-webhook   (called by Stripe, not by the site)
// Verifies the payment, then emails Imani the order details.

import { handleStripeWebhook } from "../lib/webhook.mjs";
import { sendEmail } from "../lib/email.mjs";
import { getStripe, json, respond } from "../lib/http.mjs";

const DEFAULT_TO = "shopbutterflynectar@gmail.com";
// onboarding@resend.dev works immediately for testing. Once butterflynectar.shop is verified
// in Resend, set EMAIL_FROM to something like: Butterfly Nectar Orders <orders@butterflynectar.shop>
const DEFAULT_FROM = "Butterfly Nectar Orders <onboarding@resend.dev>";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  return respond(async () => {
    const rawBody = await req.text(); // must be the untouched body for signature checking
    return handleStripeWebhook({
      stripe: getStripe(),
      rawBody,
      signature: req.headers.get("stripe-signature"),
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      sendOrderEmail: (email) => sendEmail({
        ...email,
        to: process.env.EMAIL_TO || DEFAULT_TO,
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        apiKey: process.env.RESEND_API_KEY
      })
    });
  });
};

export const config = { path: "/api/stripe-webhook" };
