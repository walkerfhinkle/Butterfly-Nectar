// ============================================================
// Butterfly Nectar — product catalog (front-end display copy)
// ============================================================
// EDIT THIS to set real products and prices. Amounts are in CENTS
// (Stripe's convention) to avoid floating-point rounding issues —
// 1800 means $18.00.
//
// IMPORTANT: this file only controls what shoppers SEE on the
// page. The actual amount charged is re-priced from scratch on
// the backend, using the matching list in netlify/lib/products.mjs —
// browsers can't be trusted to report their own prices back
// honestly. If you change a price or add a product here, make the
// same change in netlify/lib/products.mjs, or checkout will charge the
// backend's (old) number instead of this one.

window.BN_PRODUCTS = [
  { id: "bn-1oz", name: "Butterfly Nectar — 1oz Jar", price: 930 },
  { id: "bn-2oz", name: "Butterfly Nectar — 2oz Jar", price: 1488 },
  { id: "bn-4oz", name: "Butterfly Nectar — 4oz Jar", price: 2139 },
  { id: "bn-8oz", name: "Butterfly Nectar — 8oz Jar", price: 2790 }
];
