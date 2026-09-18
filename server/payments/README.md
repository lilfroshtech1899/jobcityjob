# Jobcityjob Payments Module (provider-agnostic)

Unlock fee: **₦100 NGN** per job (employer pays).

## Providers
| Adapter | Use |
|---------|-----|
| `manual` | Bank details + admin confirm (default, works offline) |
| `paystack` | Cards / transfer / USSD |
| `monnify` | Dynamic virtual account bank transfer |

## Quick start (no Express required)
```bash
cd server/payments
PAYMENT_DEFAULT_PROVIDER=manual node index.js
# POST http://127.0.0.1:3010/api/payments/create
```

## Create payment
```json
POST /api/payments/create
{
  "employerId": "user_1",
  "candidateIds": ["candidate-1"],
  "email": "employer@example.com",
  "provider": "monnify"
}
```

## Verify
```json
POST /api/payments/verify
{ "reference": "JCJ_..." }
```

## Manual confirm (admin)
```json
POST /api/payments/manual/confirm
{ "reference": "JCJ_...", "note": "bank seen" }
```

## Env
```
PAYMENT_DEFAULT_PROVIDER=paystack
PAYSTACK_PUBLIC_KEY=pk_live_...
PAYSTACK_SECRET_KEY=sk_live_...
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=
MONNIFY_CONTRACT_CODE=
MONNIFY_BASE_URL=https://sandbox.monnify.com
ADMIN_CONFIRM_TOKEN=
```

## Frontend integration
- Load the SDK in `index.html`: `<script src="https://js.paystack.co/v1/inline.js"></script>`
- Set your public key via the `PAYSTACK_PUBLIC_KEY` environment variable. It is injected into
  `js/env-config.js` (alongside the Supabase config) by `node scripts/gen-env-config.js` at build time.
- Set `window.JOBCITYJOB_PAYMENTS_URL` (e.g. in `index.html` before `app.js`) to point at this
  server so the card flow can verify and auto-confirm payments, e.g.
  ```html
  <script>window.JOBCITYJOB_PAYMENTS_URL = "https://api.yourdomain.com";</script>
  ```
- Without a payments server, successful Paystack payments unlock contacts directly from
  the browser callback (usable in test mode). The Paystack webhook (`POST /api/webhooks/paystack`)
  is the production-safe path.

## Express mount
```js
import express from "express";
import { paymentsRouter, webhooksRouter } from "./payments/routes.js";
app.use("/api/payments", paymentsRouter);
app.use("/api/webhooks", webhooksRouter);
```

Webhooks: `POST /api/webhooks/paystack`, `POST /api/webhooks/monnify`
