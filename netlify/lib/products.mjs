// ============================================================
// Butterfly Nectar — product catalog (SERVER-SIDE, authoritative)
// ============================================================
// This is the list that decides what customers are actually CHARGED.
// The checkout function never trusts a price from the browser.
//
// Prices are in CENTS (Stripe's convention): 930 = $9.30.
//
// To change a price: edit this file AND assets/shop-config.js (what
// visitors see on the page), plus the price text in index.html.
// `npm test` fails if this file and assets/shop-config.js disagree.

export const PRODUCTS = [
  { id: "bn-1oz", name: "Butterfly Nectar — 1oz Jar", price: 930 },
  { id: "bn-2oz", name: "Butterfly Nectar — 2oz Jar", price: 1488 },
  { id: "bn-4oz", name: "Butterfly Nectar — 4oz Jar", price: 2139 },
  { id: "bn-8oz", name: "Butterfly Nectar — 8oz Jar", price: 2790 }
];

export const MAX_QTY_PER_ITEM = 20;

export const TURNAROUND_HOURS = 72;
