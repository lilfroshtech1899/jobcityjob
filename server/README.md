# Jobcityjob email webhooks

## Run (example)

```bash
cd server
npm init -y
npm install express
node email-webhooks.js
```

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

## Currency rates cron (`fx-cron.js`)

Fetches live FX once on the server and writes `fx-rates.json` for the static site.

### One-shot (for system crontab)

```bash
cd /path/to/jobcityjob/server
node fx-cron.js
```

Writes `../fx-rates.json` (override with `FX_OUT=/var/www/jobcityjob/fx-rates.json`).

### Linux crontab (every 12 hours)

```cron
0 */12 * * * cd /var/www/jobcityjob/server && /usr/bin/node fx-cron.js >> /var/log/jobcityjob-fx.log 2>&1
```

### Serve JSON API + optional in-process loop

```bash
node fx-cron.js --serve --loop 12
# GET http://localhost:3003/fx-rates.json
```

### Front-end

Browsers load `fx-rates.json` from the same origin first (see `js/fx.js`).
Only if that fails do they call public FX APIs.

Optional before scripts:

```html
<script>window.JOBCITYJOB_FX_URL = "https://api.yourdomain.com/fx-rates.json";</script>
```

---

## Provider-agnostic payments (`server/payments/`)

Unified module for **₦100 NGN** unlocks. `index.js` builds its own `http` server — no Express dependency required.

```bash
# From Node (ESM)
import { paymentService } from './payments/index.js';

const { payment, session } = await paymentService.create({
  employerId: 'emp_1',
  candidateIds: ['c1', 'c2'],
  email: 'employer@company.com',
});

// Frontend: use session.clientConfig with the Paystack SDK
// After pay:
await paymentService.verifyAndComplete(payment.reference);

// Webhook:
await paymentService.handleWebhook('paystack', { headers, rawBody });

// Admin manual bank:
await paymentService.manualConfirm(payment.reference, "bank transfer seen");
```

Set `PAYMENT_DEFAULT_PROVIDER=paystack|manual` and the matching API keys.
See `server/payments/README.md`.
