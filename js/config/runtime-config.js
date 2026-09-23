/* ========== Jobcityjob runtime configuration ==========
 * GENERATED FILE — do not edit by hand.
 * Produced at build time from environment variables by
 * `node scripts/generate-runtime-config.js` (see vercel.json buildCommand).
 *
 * Env vars read:
 *   JOBCITYJOB_API_URL           base URL of the PHP REST API
 *                                (defaults to "api/index.php")
 *   PAYSTACK_PUBLIC_KEY          Paystack Dashboard → Settings → API Keys → PUBLIC key
 *   JOBCITYJOB_ADMIN_HASH        (optional) SHA-256 hex of the admin password
 *   JOBCITYJOB_ADMIN_PASSWORD    (optional) admin plaintext → hashed here; never shipped
 *
 * Only the Paystack PUBLIC key and the admin hash ship to the browser —
 * NEVER put your PAYSTACK_SECRET_KEY or MySQL credentials in this file.
 */
const JOBCITYJOB_API_URL = "api/index.php";
const JOBCITYJOB_PAYSTACK_PUBLIC_KEY = "pk_live_4d90b405c81b41d07190c89159c0a1daa5cf994f";
const JOBCITYJOB_ADMIN_HASH = "d31c17c8e51cbdc6c854b8227b1fd0dcc87ecd1aa33b28b5a395d2733206a711";

// app.js reads the admin gate hash via window.* — mirror it so the password
// check works from any classic script on the page.
window.JOBCITYJOB_ADMIN_HASH = JOBCITYJOB_ADMIN_HASH;

function apiReady() {
  return !!JOBCITYJOB_API_URL &&
    JOBCITYJOB_API_URL.indexOf("REPLACE") < 0 &&
    JOBCITYJOB_API_URL.indexOf("your_") < 0;
}

function paystackReady() {
  return !!window.PaystackPop &&
    typeof window.PaystackPop.setup === "function" &&
    JOBCITYJOB_PAYSTACK_PUBLIC_KEY &&
    JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("REPLACE") < 0 &&
    JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("your_") < 0;
}

/* Lightweight startup diagnostics — DevTools console only; harmless in production. */
if (!apiReady()) {
  console.warn("[jobcityjob] PHP API not configured: set the JOBCITYJOB_API_URL env var (default is api/index.php), then run `node scripts/generate-runtime-config.js` (or redeploy with the host env var set).");
}
if (!window.PaystackPop || typeof window.PaystackPop.setup !== "function") {
  console.warn("[jobcityjob] Paystack SDK not loaded — check that https://js.paystack.co/v1/inline.js is reachable (ad-blockers can block it).");
} else if (!JOBCITYJOB_PAYSTACK_PUBLIC_KEY || JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("REPLACE") >= 0 || JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("your_") === 0) {
  console.warn("[jobcityjob] Paystack public key not set: add PAYSTACK_PUBLIC_KEY, then run `node scripts/generate-runtime-config.js` (or redeploy with the host env var set).");
}
