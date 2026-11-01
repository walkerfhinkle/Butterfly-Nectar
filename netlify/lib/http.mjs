// Small helpers shared by the three Netlify functions.

import Stripe from "stripe";
import { HttpError } from "./checkout.mjs";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(500, "Checkout isn't configured yet (STRIPE_SECRET_KEY is missing).");
  return new Stripe(key);
}

// Wraps a function body so errors become clean JSON responses (and are logged).
export async function respond(fn) {
  try {
    return json(await fn());
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    console.error(`[${status}]`, err && err.message);
    // Only show the customer messages we wrote ourselves.
    const message = err instanceof HttpError ? err.message : "Something went wrong. Please try again.";
    return json({ error: message }, status);
  }
}
