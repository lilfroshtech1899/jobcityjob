# Jobcityjob — International Job Matching Platform

Complete static web app (plus optional Node server modules) for global employee/employer matching.

**Brand:** Jobcityjob  
**Base fee:** ₦100 (NGN) per job unlock — employer pays; employees free  
**Database:** [Supabase](https://supabase.com) (Postgres + Auth) — all business data centralized

---

## Quick start — connect Supabase

The whole site uses **Supabase** as its data layer. Nothing is stored in a browser-local database
anymore; every user, employee profile, payment, blog post, rating and email event is shared across
all visitors via your Supabase project.

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL editor → New query** and run the entire contents of **`supabase/migrations/0001_schema.sql`**,
   then **`supabase/migrations/0002_payments_upgrade.sql`** (adds the `jc_unlocks` audit table that records
   every worker-credential delivery, plus payment indexes).
   Together they create every table (`jc_users`, `jc_employees`, `jc_payments`, `jc_unlocks`,
   `jc_blog`, `jc_ratings`, `jc_email_events`, `jc_settings`) and enable row-level security.
3. Open **Settings → API** and copy:
   - **Project URL**
   - **anon public key**

4. Set these as environment variables on your host — **not** in source files:

   ```env
   SUPABASE_URL=https://xyzcompany.supabase.co
   SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
   PAYSTACK_PUBLIC_KEY=YOUR-PAYSTACK-PUBLIC-KEY   (optional — only for the card flow)
   ```

   - **Vercel:** Project → Settings → Environment Variables → Add these values. A `buildCommand` (`node scripts/generate-runtime-config.js`) injects them into `js/config/runtime-config.js` at each deploy.
   - **Other hosts:** run `node scripts/generate-runtime-config.js` as a build step, or see `README` notes below.

   > The Supabase anon key and Paystack public key are safe to embed client-side. **Never** use your Supabase `service_role` key or your Paystack secret key in frontend config.

5. Upload all files to your host. `js/config/runtime-config.js` is committed only as a placeholder template and is regenerated at every build. Server-side secrets (e.g. `PAYSTACK_SECRET_KEY`) are read from environment variables by `server/*` at runtime and never ship to the browser.

### Auth (Supabase Auth, email + password)

- Registration / login now use **Supabase Auth** with proper password hashing — plain-text
  passwords are no longer stored anywhere.
- The first time you register, Supabase may send a **confirm-email** link depending on your
  project's "Confirm email" setting (Authentication → Providers → Email). For instant login in
  demo/testing you can turn that off.

### Employee data

The employer talent search reads live rows from the `jc_employees` table (Supabase). No
bundled/demo profiles exist in the codebase — employees appear only after they register on the site.

---

## Deploy (static site)

1. Unzip this package.
2. Upload **all files and folders** at the web root (`index.html` must be at the domain root).
3. Or drag the unzipped folder to [Netlify Drop](https://app.netlify.com/drop).

A build step (`node scripts/generate-runtime-config.js`) injects your Supabase/Paystack keys into
`js/config/runtime-config.js`. `netlify.toml` and `vercel.json` run it automatically; on other hosts either
run it once after setting the env vars or commit a fully configured `js/config/runtime-config.js`. No npm
packages are required for the main site.

### Included host configs
- `netlify.toml` — Netlify
- `vercel.json` — Vercel
- `_redirects` — SPA-style fallback
- `404.html` — friendly not-found page
- `robots.txt`, `sitemap.xml` — SEO

---

## What works after hosting

| Feature | Status |
|---------|--------|
| Multi-language / multi-currency UI | Yes |
| Employee registration (free) | Yes (Supabase Auth) |
| Employer registration | Yes (Supabase Auth) |
| Categorised employee profile form | Yes |
| **Country-specific fields (ISO 3166-1 alpha-2)** | Yes |
| Employer search + ATS match scoring | Yes |
| Payment flow ₦100 / currency equivalent (Paystack) | Yes |
| Admin bank details + payment confirmation | Yes (password via `JOBCITYJOB_ADMIN_HASH`) |
| Unlock contacts → employer message centre | Yes |
| WhatsApp / SMS / email invite buttons | Yes (deep links + mailto) |
| Community experiences (blog) | Yes (Supabase) |
| Ratings & recommendations | Yes (Supabase) |
| Welcome music control | Yes |
| FX display (SWR cache + live/public rates) | Yes |
| Central shared database (no per-browser data) | Yes (Supabase) |
| Responsive (phone / tablet / desktop) | Yes |

**Admin access:** visit `/desk` on the deployed site (or `/#desk` on a plain static preview such
as VS Code Live Server — the committed `desk/index.html` stub redirects `/desk` → `/#desk`). The
admin UI is injected client-side only on that route, so it never ships in the homepage source. The
password is compared as the **SHA-256 hex digest** (64 lowercase hex chars) of the admin secret,
which `scripts/generate-runtime-config.js` injects into `js/config/runtime-config.js` from
`JOBCITYJOB_ADMIN_HASH` (digest) or `JOBCITYJOB_ADMIN_PASSWORD` (plaintext, hashed at build).
If neither is set, `/desk` reports "Admin access not configured" and stays locked (fail-closed). The
gate is client-side by design (an SPA ships the hash to every browser), so treat it as a UI gate —
enforce real authorization server-side (`x-admin-token` in `server/payments/index.js`) or with
Supabase RLS before handling real money. A legacy base64 hash (`btoa`) is still accepted for
existing deployments. No default password ships with the code.

---

## File map

```
index.html          Main single-page app
css/styles.css      Styles
js/app.js           All UI logic, forms, search, payment, ATS, invites
js/config/          Runtime configuration
  runtime-config.js GENERATED runtime config (Supabase client + Paystack public key)
js/data/            Static reference data
  reference-data.js Countries (ISO alpha-2), currencies (ISO 4217 style),
                    COUNTRY_FORM_RULES, pricing constants
  translations.js   UI translations (i18n)
js/services/        Backend / network services
  database.js       Supabase data-access layer (all tables)
  exchange-rates.js FX rates — stale-while-revalidate
js/utils/           Small helpers
  preferences.js    Lightweight browser prefs (lang/currency/music only)
scripts/            Build-time helpers
  generate-runtime-config.js Injects SUPABASE_URL / SUPABASE_ANON_KEY / PAYSTACK_PUBLIC_KEY into js/config/runtime-config.js
  build.js                    Assembles the static SPA into public/ for Vercel
supabase/migrations/  SQL migrations (run in order in the Supabase SQL editor)
  0001_schema.sql                    Creates every table + RLS
  0002_payments_upgrade.sql         jc_unlocks audit table + payment indexes
server/             Optional Node helpers (email webhooks, payments, FX cron)
```

Script load order (already in `index.html`):

```
supabase-js (CDN) → data/reference-data.js → data/translations.js → config/runtime-config.js → services/database.js → utils/preferences.js → services/exchange-rates.js → app.js
```

---

## Optional server features

### Email webhooks
```bash
cd server
npm init -y && npm install express
node email-webhooks.js
```
See `server/README.md`. Bounce/complaint events can be inserted into `jc_email_events` via
PostgREST so they appear in the admin panel.

### FX cron (recommended at scale)
```bash
cd server
node exchange-rates-cron.js
# writes ../fx-rates.json — place next to index.html
```
See `server/crontab.example`.

---

## Paystack verification (Supabase Edge Function)

Card payments use **Paystack inline checkout** with the public key from `PAYSTACK_PUBLIC_KEY`
(see Quick start). After checkout, the frontend sends the Paystack reference to a Supabase
Edge Function — **it never marks an order as paid by itself**:

```
Customer pays in Paystack popup
        ↓
Paystack returns reference
        ↓
supabase.functions.invoke("verify-payment", { reference, orderId })
        ↓
Edge Function verifies with Paystack (PAYSTACK_SECRET_KEY, server-side)
        ↓
Verified? → confirms jc_payments + unlocks contacts into employer Message Centre
```

### Deploy the function

```bash
# 1. Install the Supabase CLI
# 2. Link your project
supabase functions deploy verify-payment --project-ref YOUR_PROJECT_REF
```

### Required secrets (set in Supabase → Functions → verify-payment → Secrets, or with the CLI)

```env
PAYSTACK_SECRET_KEY=sk_live_...
SUPABASE_SERVICE_ROLE_KEY=...
```

- The Paystack secret key lives only in `api/config.php` (gitignored); it never ships to the browser.
- `payments.verify` (in `api/endpoints/payments.php`) is the **only** path that confirms a payment:
  it verifies the reference with Paystack server-side and, on success, atomically sets
  `jc_payments.status = 'confirmed'` and writes the `jc_unlocks` rows. There is no admin-confirm
  endpooint anywhere — card, USSD, and bank-transfer (virtual account) payments are all confirmed
  automatically by Paystack.
- Every delivered credential is written to `jc_unlocks` (one row per candidate per payment) so the
  admin can audit exactly which worker contacts were released, when, and under which payment.

---

## Production notes

- **Supabase RLS** is enabled in `supabase/migrations/0001_schema.sql`, but the policies are
  intentionally permissive for this demo: sensitive tables (`jc_users`, `jc_employees`,
  `jc_payments`, `jc_email_events`, `jc_unlocks`) are readable by **any signed-in account**
  (`USING (true)`), and `jc_users` / `jc_payments` / `jc_settings` are updatable by any signed-in
  account. That means a registered visitor could read other users' contact details or modify rows.
  **This is not production-safe for real money or personal data.** Before launch, replace these
  with owner-scoped policies (e.g. `auth.uid() = auth_id` for `jc_users`, `auth.uid() = employer_id`
  for `jc_payments`) plus a dedicated admin role, and move the admin confirm/unlock flow to a
  service-role Edge Function instead of the browser. The admin console (`/desk`) currently must be
  used while signed in to an account that the policies allow to read the pending payments.
- Change the admin password and payment integration before going live with real money.
- Exchange rates, pricing constants and demo talent live in `js/data/reference-data.js`; adjust as needed.
- Google Search Console: submit `https://YOUR-DOMAIN/sitemap.xml`.

---

## Brand & standards

- Brand name: **Jobcityjob**
- Countries: **ISO 3166-1 alpha-2** (`NG`, `US`, `GB`, …)
- Currencies: **ISO 4217-style** codes (`NGN`, `USD`, …)
- Phones: encourage **E.164** (`+234…`) for WhatsApp/SMS

---

## Payments are confirmed automatically by Paystack

There is **no admin payment-confirmation code** anywhere in the project. Browser payment flows call
server-side `payments.verify` (in `api/endpoints/payments.php`), which verifies the reference with
Paystack using the secret key and, on success, atomically sets `jc_payments.status = 'confirmed'`
and writes the `jc_unlocks` rows. Confirmation happens automatically and only via Paystack — no
`manualConfirm`, `confirmAndUnlockPayment`, or admin-confirm button exists (the legacy Node
`server/payments/` module that exposed an admin confirm route was removed).
