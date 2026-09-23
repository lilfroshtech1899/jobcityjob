# Jobcityjob email webhooks

## Run (example)

```bash
cd server
npm init -y
npm install express
node email-webhooks.js
```

## Local site preview

The standalone run also serves the **built SPA** from `../public`, so you can
preview client-side routes locally exactly like the deployed hosts:

```bash
npm run preview        # from the repo root: builds public/ + serves on :5500
# open http://localhost:5500/desk  → admin login page
# open http://localhost:5500/      → home page
```

or manually:

```bash
node scripts/build.js   # from the repo root, to (re)generate public/
cd server && node email-webhooks.js
```

It listens on **port 5500** (same as the deployed site) on **all interfaces**
(`0.0.0.0`), so it works locally *and* from other devices on your network —
the console prints both the `localhost` and LAN IP URLs. On Windows, allow the
Node.js firewall prompt (or add a rule for TCP 5500) so other devices can
reach it.

> **No terminal?** You can also preview with a plain static server — e.g. VS
> Code **Live Server** (also on port 5500): open the project root as a
> workspace, click "Go Live", and visit `/#desk`. The committed
> `desk/index.html` stub redirects `/desk` → `/#desk`, so the admin page works
> even though a plain static server can't rewrite client-side routes.
>
> **For a full-fidelity preview** (local *and* LAN, same port 5500), stop that
> static server (VS Code status bar → "Stop Live Server") and run one of the
> commands above; the Express preview warns you if the port is still taken and
> serves `/webhooks/**` too. `/webhooks/**` routes keep priority;
> `express.static` + an `index.html` catch-all handle everything else (the
> same `/* → /index.html` fallback Vercel, Netlify, and Cloudflare Pages use).
> Override the port with `PORT=5501 node email-webhooks.js`.

## Configure provider

| Provider | Webhook URL |
|----------|-------------|
| Resend | `https://api.yourdomain.com/webhooks/email/resend` |
| SendGrid | `https://api.yourdomain.com/webhooks/email/sendgrid` |
| Amazon SES (SNS) | `https://api.yourdomain.com/webhooks/email/ses` |

## Before sending

```js
import { assertNotSuppressed } from "./email-webhooks.js";
assertNotSuppressed(candidateEmail); // throws if bounced/complained
```

Hard bounces and spam complaints are stored in `email-events.json` (replace with a database in production).


---

## Currency rates cron (`exchange-rates-cron.js`)

Fetches live FX once on the server and writes `fx-rates.json` for the static site.

### One-shot (for system crontab)

```bash
cd /path/to/jobcityjob/server
node exchange-rates-cron.js
```

Writes `../fx-rates.json` (override with `FX_OUT=/var/www/jobcityjob/fx-rates.json`).

### Linux crontab (every 12 hours)

```cron
0 */12 * * * cd /var/www/jobcityjob/server && /usr/bin/node exchange-rates-cron.js >> /var/log/jobcityjob-fx.log 2>&1
```

### Serve JSON API + optional in-process loop

```bash
node exchange-rates-cron.js --serve --loop 12
# GET http://localhost:3003/fx-rates.json
```

### Front-end

Browsers load `fx-rates.json` from the same origin first (see `js/services/exchange-rates.js`).
Only if that fails do they call public FX APIs.

Optional before scripts:

```html
<script>window.JOBCITYJOB_FX_URL = "https://api.yourdomain.com/fx-rates.json";</script>
```

---

## Payments are confirmed automatically by Paystack

There is now **no provider-agnostic Node payments module** (the old `server/payments/` was
removed). Payment confirmation is done server-side in the PHP API only: `payments.verify`
(card / USSD / transfer) calls Paystack's verify endpoint with the secret key and, on success,
atomically writes `jc_payments.status = 'confirmed'` and the `jc_unlocks` rows for the employer.
There is no `manualConfirm` / `confirmAndUnlockPayment` / admin-confirm code anywhere — an admin
cannot approve a payment; Paystack is the sole confirmation source. See `api/endpoints/payments.php`.
