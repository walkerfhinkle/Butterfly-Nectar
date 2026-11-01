// Builds and sends the "new paid order" email for Imani.
// Sending goes through Resend (https://resend.com), one HTTPS call, no extra packages.

import { TURNAROUND_HOURS } from "./products.mjs";

const TZ = "America/New_York";

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function money(cents, currency = "usd") {
  const amount = (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency.toLowerCase() === "usd" ? `$${amount}` : `${amount} ${currency.toUpperCase()}`;
}

function formatDeadline(date) {
  return date.toLocaleString("en-US", {
    timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit"
  }) + " ET";
}

// Newer Stripe API versions moved shipping details under collected_information.
function getShipping(session) {
  return session.shipping_details
    || (session.collected_information && session.collected_information.shipping_details)
    || null;
}

function addressLines(name, address) {
  if (!address) return [];
  const cityLine = [address.city, address.state].filter(Boolean).join(", ");
  return [
    name,
    address.line1,
    address.line2,
    [cityLine, address.postal_code].filter(Boolean).join(" "),
    address.country && address.country !== "US" ? address.country : ""
  ].filter(Boolean);
}

export function buildOrderEmail(session, now = new Date()) {
  const customer = session.customer_details || {};
  const shipping = getShipping(session);
  const lineItems = (session.line_items && session.line_items.data) || [];
  const currency = session.currency || "usd";
  const total = money(session.amount_total ?? 0, currency);
  const deadline = formatDeadline(new Date(now.getTime() + TURNAROUND_HOURS * 3600 * 1000));

  const shipName = (shipping && shipping.name) || customer.name || "";
  const shipTo = addressLines(shipName, shipping && shipping.address);
  const customerName = customer.name || shipName || "Customer";

  const paymentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent && session.payment_intent.id) || "";
  const dashboardUrl = paymentId
    ? `https://dashboard.stripe.com${session.livemode ? "" : "/test"}/payments/${paymentId}`
    : "";

  const banner = `PAYMENT RECEIVED. The ${TURNAROUND_HOURS}-hour turnaround is now in effect. Please process this order by ${deadline}.`;

  // ---------- plain text ----------
  const textLines = [
    banner,
    "",
    "ORDER",
    ...lineItems.map((li) => `  ${li.quantity} x ${li.description}  ${money(li.amount_total, currency)}`),
    `  TOTAL PAID: ${total}`,
    "",
    "CUSTOMER",
    `  ${customerName}`,
    customer.email ? `  ${customer.email}` : "",
    customer.phone ? `  ${customer.phone}` : "",
    "",
    "SHIP / DELIVER TO",
    ...(shipTo.length ? shipTo.map((l) => `  ${l}`) : ["  (no address collected)"]),
    "",
    paymentId ? `Stripe payment: ${paymentId}` : "",
    dashboardUrl,
    `Checkout session: ${session.id}`,
    "",
    "Reply to this email to reach the customer directly."
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));

  // ---------- HTML ----------
  const rows = lineItems.map((li) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #E8DFD3;">${escapeHtml(li.description)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;text-align:center;">${escapeHtml(li.quantity)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #E8DFD3;text-align:right;">${escapeHtml(money(li.amount_total, currency))}</td>
      </tr>`).join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAF5EF;font-family:Arial,Helvetica,sans-serif;color:#1A2B3C;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#122747;color:#ffffff;border-radius:6px;padding:20px 22px;">
      <div style="font-size:18px;font-weight:bold;margin-bottom:6px;">Payment received</div>
      <div style="font-size:15px;line-height:1.5;">The ${TURNAROUND_HOURS}-hour turnaround is now in effect. Please process this order by <strong>${escapeHtml(deadline)}</strong>.</div>
    </div>

    <div style="background:#ffffff;border:1px solid #E8DFD3;border-radius:6px;padding:20px 22px;margin-top:14px;">
      <div style="font-size:12px;letter-spacing:.06em;color:#3F918E;font-weight:bold;margin-bottom:8px;">ORDER</div>
      <table style="width:100%;border-collapse:collapse;font-size:15px;">${rows}
        <tr>
          <td style="padding:12px 0 0;font-weight:bold;" colspan="2">Total paid</td>
          <td style="padding:12px 0 0;text-align:right;font-weight:bold;">${escapeHtml(total)}</td>
        </tr>
      </table>
    </div>

    <div style="background:#ffffff;border:1px solid #E8DFD3;border-radius:6px;padding:20px 22px;margin-top:14px;font-size:15px;line-height:1.55;">
      <div style="font-size:12px;letter-spacing:.06em;color:#3F918E;font-weight:bold;margin-bottom:8px;">CUSTOMER</div>
      ${escapeHtml(customerName)}<br>
      ${customer.email ? `<a href="mailto:${escapeHtml(customer.email)}" style="color:#1B3E72;">${escapeHtml(customer.email)}</a><br>` : ""}
      ${customer.phone ? `${escapeHtml(customer.phone)}<br>` : ""}
      <div style="font-size:12px;letter-spacing:.06em;color:#3F918E;font-weight:bold;margin:16px 0 8px;">SHIP / DELIVER TO</div>
      ${shipTo.length ? shipTo.map(escapeHtml).join("<br>") : "(no address collected)"}
    </div>

    <div style="font-size:13px;color:#4B5A6B;margin-top:14px;line-height:1.6;">
      ${paymentId ? `Stripe payment: ${dashboardUrl ? `<a href="${escapeHtml(dashboardUrl)}" style="color:#1B3E72;">${escapeHtml(paymentId)}</a>` : escapeHtml(paymentId)}<br>` : ""}
      Checkout session: ${escapeHtml(session.id)}<br>
      Reply to this email to reach the customer directly.
    </div>
  </div>
</body></html>`;

  const subject = `Payment received: ${total} from ${customerName} (process within ${TURNAROUND_HOURS} hrs)`;
  return { subject, text: textLines.join("\n"), html, replyTo: customer.email || undefined };
}

// Sends through Resend. Throws on any failure so the webhook can tell Stripe to retry.
export async function sendEmail({ to, from, subject, text, html, replyTo, idempotencyKey, apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html,
      ...(replyTo ? { reply_to: replyTo } : {})
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}
