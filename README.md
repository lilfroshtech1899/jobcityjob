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
2. Open **SQL editor → New query** and run the entire contents of **`supabase-schema.sql`**,
   then **`supabase-payments-upgrade.sql`** (adds the `jc_unlocks` audit table that records
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

   - **Vercel:** Project → Settings → Environment Variables → Add these values. A `buildCommand` (`node scripts/gen-env-config.js`) injects them into `js/env-config.js` at each deploy.
   - **Other hosts:** run `node scripts/gen-env-config.js` as a build step, or see `README` notes below.

   > The Supabase anon key and Paystack public key are safe to embed client-side. **Never** use your Supabase `service_role` key or your Paystack secret key in frontend config.

5. Upload all files to your host. `js/env-config.js` is committed only as a placeholder template and is regenerated at every build. Server-side secrets (e.g. `PAYSTACK_SECRET_KEY`) are read from environment variables by `server/*` at runtime and never ship to the browser.

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

A build step (`node scripts/gen-env-config.js`) injects your Supabase/Paystack keys into
`js/env-config.js`. `netlify.toml` and `vercel.json` run it automatically; on other hosts either
run it once after setting the env vars or commit a fully configured `js/env-config.js`. No npm
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

**Admin access:** open Admin from the site UI. The password is the **SHA-256 hex digest** (64
lowercase hex chars) of the admin secret, supplied as `window.JOBCITYJOB_ADMIN_HASH` (e.g. set in
`index.html` before `app.js`, or via the Supabase config build step). Generate one with
`node -e "console.log(crypto.createHash('sha256').update('YOUR-PASSWORD').digest('hex'))"`.
A legacy base64 hash (`btoa`) is still accepted for existing deployments. No default password ships with the code.

---

## File map

```
index.html          Main single-page app
css/styles.css      Styles
js/data.js          Countries (ISO alpha-2), currencies (ISO 4217 style),
                    mock talent, COUNTRY_FORM_RULES, pricing constants
js/i18n.js          Translations
js/env-config.js    GENERATED runtime config (Supabase client + Paystack public key)
js/db.js            Supabase data-access layer (all tables)
js/storage.js       Lightweight browser prefs (lang/currency/music only)
js/fx.js            FX rates — stale-while-revalidate
js/app.js           All UI logic, forms, search, payment, ATS, invites
scripts/            Build-time helpers
  gen-env-config.js Injects SUPABASE_URL / SUPABASE_ANON_KEY / PAYSTACK_PUBLIC_KEY into js/env-config.js
supabase-schema.sql Run this in the Supabase SQL editor to create tables
supabase-payments-upgrade.sql Run after the schema: jc_unlocks audit table + payment indexes
server/             Optional Node helpers (email webhooks, payments)
```

Script load order (already in `index.html`):

```
supabase-js (CDN) → data.js → i18n.js → env-config.js → db.js → storage.js → fx.js → app.js
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
node fx-cron.js
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

- `SUPABASE_URL` and the service role key are used server-side; the secret key never ships to the browser.
- Only after the Edge Function confirms does the employer's Message Centre / ATS pipeline unlock.
- Every delivered credential is written to `jc_unlocks` (one row per candidate per payment) so the
  admin can audit exactly which worker contacts were released, when, and under which payment.
- If the Edge Function is unreachable, `verifyPaystackOnServer` falls back to delivering the
  purchased credentials from the browser (the Paystack callback only fires after a successful
  charge) and marks the payment confirmed — test-mode safety net.
- Bank transfers still use the admin confirm flow (`confirmAndUnlockPayment`), which is a manual server/admin action, not a client callback.

---

## Production notes

- **Supabase RLS** is enabled with least-privilege policies in `supabase-schema.sql`: sensitive
  tables (`jc_users`, `jc_employees`, `jc_payments`, `jc_email_events`) are read-able only by the
  `authenticated` role, and employee rows are only updatable by their owner. The admin console
  (`/desk`) must therefore be used while signed in to a Supabase account. Extend the policies (e.g.
  add role-based `WITH CHECK`) before going live with real money.
- Change the admin password and payment integration before going live with real money.
- Exchange rates, pricing constants and demo talent live in `js/data.js`; adjust as needed.
- Google Search Console: submit `https://YOUR-DOMAIN/sitemap.xml`.

---

## Brand & standards

- Brand name: **Jobcityjob**
- Countries: **ISO 3166-1 alpha-2** (`NG`, `US`, `GB`, …)
- Currencies: **ISO 4217-style** codes (`NGN`, `USD`, …)
- Phones: encourage **E.164** (`+234…`) for WhatsApp/SMS

---

## Payments API (optional server)

Provider-agnostic module under `server/payments/`:

- **manual** – admin confirm (default)
- **paystack** – cards / USSD / transfer
- **monnify** – dynamic virtual account (bank transfer)

```bash
cd server/payments
node index.js
# POST /api/payments/create  { employerId, candidateIds, provider }
```

See `server/payments/README.md`. The static site demo still uses in-browser payment simulation
+ admin confirm, but payment records are persisted to `jc_payments` in Supabase.
