# Butterfly Nectar: Stripe setup checklist

## How an order works

1. Customer picks a jar, chooses a quantity, adds to cart.
2. **Checkout** sends them to Stripe's secure payment page (shows the 72-hour turnaround). Stripe collects their name, email, phone, and shipping address.
3. Customer pays. Stripe sends them back to the site, which **double-checks with Stripe that the payment really succeeded**, then shows the centered "Payment received" pop-up.
4. Separately, Stripe notifies the site's webhook (server to server). Only after the webhook confirms the payment is **paid** does Imani get the email at shopbutterflynectar@gmail.com: payment received, 72-hour clock started, what they bought, who it's for, where it goes.

The email is triggered by Stripe's confirmation only. Visiting the thank-you page does not send anything, and neither does an unpaid or abandoned checkout.

Money goes straight to Imani's own Stripe account. No splits, no Stripe Connect.

---

## Part 1: Set up now (Stripe test mode, no real money)

You can do all of this before the LLC is finished.

### 1. Put the site on Netlify
GitHub Pages can't run the checkout code (it only serves static files), so the site moves to Netlify. It's free, allows commercial use, and still deploys automatically whenever you push to GitHub.

1. Sign up at netlify.com with the GitHub login.
2. **Add new site → Import an existing project → GitHub → Butterfly-Nectar**.
3. Leave the settings as they are (`netlify.toml` already has them) and click **Deploy**.

You'll get a temporary address like `something.netlify.app`. Use that for testing.

### 2. Resend (sends the order email)
1. Sign up at resend.com **using shopbutterflynectar@gmail.com**. Until your own domain is verified, Resend only delivers to the account's own address, which is exactly where the orders go.
2. **API Keys → Create API Key** (permission: Sending access). Copy it.

### 3. Stripe test keys and webhook
1. In Stripe, make sure **Test mode** is on.
2. **Developers → API keys**: copy the **Secret key** (`sk_test_...`).
3. **Developers → Webhooks → Add endpoint**
   - URL: `https://YOUR-SITE.netlify.app/api/stripe-webhook`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
4. Open the new endpoint and copy its **Signing secret** (`whsec_...`).

### 4. Give Netlify the keys
Netlify → **Site configuration → Environment variables**, add:

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | the `sk_test_...` key |
| `STRIPE_WEBHOOK_SECRET` | the `whsec_...` secret |
| `RESEND_API_KEY` | the `re_...` key |

Then **Deploys → Trigger deploy → Deploy site** so the functions pick them up.

Keep these keys out of GitHub and out of the site files. They only live in Netlify.

### 5. Do a test order
Add something to the cart, check out, and pay with Stripe's test card `4242 4242 4242 4242` (any future date, any 3-digit CVC, any ZIP). You should see the pop-up, and the email should arrive within a minute. Check Spam the first time and click "Not spam".

If no email arrives: Stripe → Developers → Webhooks → your endpoint → **Event deliveries** shows whether Stripe's call succeeded, and Netlify → **Logs → Functions** shows the error.

---

## Part 2: After the LLC is done (going live)

1. In Stripe, finish **account activation** with the LLC details (legal name, EIN, bank account for payouts). Stripe will walk you through it.
2. Switch Stripe to **Live mode** and repeat step 3 above: copy the `sk_live_...` key and create a **new webhook endpoint** (same URL, same two events). Live mode has its own signing secret.
3. In Netlify, replace `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` with the live values, then trigger a new deploy.
4. Place one real order for the cheapest jar and refund it afterward in the Stripe dashboard. That confirms the whole chain with real money.

---

## Part 3: Point butterflynectar.shop at Netlify

Do this when you're ready to launch, since it moves the domain off GitHub Pages.

1. Netlify → **Domain management → Add a domain** → `butterflynectar.shop`.
2. Netlify shows the DNS records it needs. In Squarespace (Domains → DNS → Custom records), **delete GitHub's four A records, four AAAA records, and the `www` CNAME**, then add the records Netlify lists.
3. In the GitHub repo, **Settings → Pages**, turn Pages off so the two don't compete.
4. Back in Netlify, enable **HTTPS** (it issues the certificate automatically once DNS has updated).
5. In Stripe → Webhooks, update the endpoint URL to `https://butterflynectar.shop/api/stripe-webhook` (or leave the `.netlify.app` one; both work).

---

## Nice-to-haves (not required)

- **Stripe receipts to customers:** Stripe → Settings → Customer emails → turn on "Successful payments". Stripe then emails each customer their receipt.
- **Stripe branding:** Settings → Branding. Add the logo and brand colors so checkout matches the site.
- **Email from your own domain:** in Resend, verify butterflynectar.shop (it gives you DNS records to add in Squarespace), then set `EMAIL_FROM` in Netlify to something like `Butterfly Nectar Orders <orders@butterflynectar.shop>`.

---

## Changing prices or products

Prices live in **three places**; change them together:

1. `netlify/lib/products.mjs` (what customers are actually charged)
2. `assets/shop-config.js` (what the cart shows)
3. The price text on the Products page in `index.html`

With Node installed, `npm install` then `npm test` fails if files 1 and 2 disagree.

## Things not set up yet

- **Shipping charges:** none are added. Customers pay the jar price only. If Imani wants to charge shipping, it's a small addition to `netlify/lib/checkout.mjs`.
- **Sales tax:** not collected. Worth asking an accountant once the LLC is set up; Stripe Tax can handle it.
- **Ship-to countries:** United States only.
