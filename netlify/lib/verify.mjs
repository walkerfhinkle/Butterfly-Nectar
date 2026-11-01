// Lets the site confirm, with Stripe, that a payment really succeeded before it shows
// the "payment received" pop-up. Returns only what the pop-up needs.

import { HttpError } from "./checkout.mjs";

export async function verifySession({ stripe, sessionId }) {
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    throw new HttpError(400, "Missing or invalid session.");
  }
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    throw new HttpError(404, "Session not found.");
  }
  const paid = session.payment_status === "paid";
  const fullName = (session.customer_details && session.customer_details.name) || "";
  const firstName = fullName.trim().split(/\s+/)[0] || "";
  return { paid, firstName: paid ? firstName : "" };
}
