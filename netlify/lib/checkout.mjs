// Creates a Stripe Checkout Session from the cart.
// Payments go straight to Imani's own Stripe account: standard single-merchant
// charge, no Connect, no splits.

import { PRODUCTS, MAX_QTY_PER_ITEM, TURNAROUND_HOURS } from "./products.mjs";

const TURNAROUND_TEXT =
  `Handmade by Imani. Your order will be processed within ${TURNAROUND_HOURS} hours of payment.`;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Turns the browser's cart ([{id, qty}]) into Stripe line items, re-pricing every
// item from the server-side catalog. Anything unexpected is rejected.
export function buildLineItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "Your cart is empty.");
  }
  if (items.length > 20) {
    throw new HttpError(400, "Too many items in the cart.");
  }

  const merged = new Map(); // combine duplicate ids
  for (const item of items) {
    const product = PRODUCTS.find((p) => p.id === (item && item.id));
    if (!product) throw new HttpError(400, "Unknown product.");
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
      throw new HttpError(400, `Quantity must be between 1 and ${MAX_QTY_PER_ITEM}.`);
    }
    merged.set(product.id, (merged.get(product.id) || 0) + qty);
  }

  return [...merged].map(([id, qty]) => {
    const product = PRODUCTS.find((p) => p.id === id);
    if (qty > MAX_QTY_PER_ITEM) {
      throw new HttpError(400, `Quantity must be between 1 and ${MAX_QTY_PER_ITEM}.`);
    }
    return {
      quantity: qty,
      price_data: {
        currency: "usd",
        unit_amount: product.price, // always from the server catalog
        product_data: { name: product.name }
      }
    };
  });
}

export async function createCheckoutSession({ stripe, items, siteUrl }) {
  const line_items = buildLineItems(items);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items,

    // Imani ships/delivers herself, so she needs the customer's address and phone.
    shipping_address_collection: { allowed_countries: ["US"] },
    phone_number_collection: { enabled: true },

    // The 72-hour turnaround, shown on Stripe's checkout page itself.
    custom_text: {
      shipping_address: { message: TURNAROUND_TEXT },
      submit: { message: TURNAROUND_TEXT }
    },

    payment_intent_data: { description: "Butterfly Nectar order" },

    // {CHECKOUT_SESSION_ID} is filled in by Stripe. The site uses it to double-check the
    // payment with the server before showing the "payment received" pop-up.
    success_url: `${siteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/?checkout=cancelled#products`
  });

  return { url: session.url };
}
