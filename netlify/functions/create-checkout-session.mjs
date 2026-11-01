// POST /api/create-checkout-session   body: { items: [{ id, qty }] }
// Returns { url } for Stripe's hosted checkout page.

import { createCheckoutSession, HttpError } from "../lib/checkout.mjs";
import { getStripe, json, respond } from "../lib/http.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  return respond(async () => {
    let body;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    const siteUrl = process.env.SITE_URL || new URL(req.url).origin;
    return createCheckoutSession({ stripe: getStripe(), items: body && body.items, siteUrl });
  });
};

export const config = { path: "/api/create-checkout-session" };
