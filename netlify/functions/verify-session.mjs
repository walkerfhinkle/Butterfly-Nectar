// GET /api/verify-session?session_id=cs_...
// Returns { paid, firstName } so the site only shows "payment received" for real payments.

import { verifySession } from "../lib/verify.mjs";
import { getStripe, json, respond } from "../lib/http.mjs";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  return respond(async () => {
    const sessionId = new URL(req.url).searchParams.get("session_id");
    return verifySession({ stripe: getStripe(), sessionId });
  });
};

export const config = { path: "/api/verify-session" };
