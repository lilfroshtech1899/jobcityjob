/* ========== Jobcityjob runtime configuration ==========
 * GENERATED FILE — do not edit by hand.
 * Produced at build time from environment variables by
 * `node scripts/gen-env-config.js` (see vercel.json buildCommand).
 *
 * Env vars read:
 *   SUPABASE_URL         Supabase Dashboard → Settings → API → Project URL
 *   SUPABASE_ANON_KEY    Supabase Dashboard → Settings → API → anon PUBLIC key
 *   PAYSTACK_PUBLIC_KEY  Paystack Dashboard → Settings → API Keys → PUBLIC key
 *
 * The Supabase anon key and Paystack public key are safe to embed
 * client-side. NEVER put your SUPABASE service_role key or your
 * PAYSTACK_SECRET_KEY in this file.
 */
const JOBCITYJOB_SUPABASE_URL = "https://ffysafjrnoqqbbvpzalw.supabase.co";
const JOBCITYJOB_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeXNhZmpybm9xcWJidnB6YWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTc1NjYsImV4cCI6MjEwNDQzMzU2Nn0.PrZJM4XiVa9kjeOFOCTVSlB8GWaROHISBRuBX4uy3z8";
const JOBCITYJOB_PAYSTACK_PUBLIC_KEY = "pk_live_4d90b405c81b41d07190c89159c0a1daa5cf994f";

const jobcitySupabase = (window.supabase && "https://ffysafjrnoqqbbvpzalw.supabase.co")
  ? window.supabase.createClient(JOBCITYJOB_SUPABASE_URL, JOBCITYJOB_SUPABASE_ANON_KEY)
  : null;

const JOB_CITY_DB = {
  tables: {
    users: "jc_users",
    employees: "jc_employees",
    payments: "jc_payments",
    unlocks: "jc_unlocks",
    blog: "jc_blog",
    ratings: "jc_ratings",
    emailEvents: "jc_email_events",
    settings: "jc_settings"
  },
  get col() { return jobcitySupabase; }
};

function supabaseReady() {
  return !!jobcitySupabase &&
    /^https:\/\//.test(JOBCITYJOB_SUPABASE_URL) &&
    /\.supabase\.co/.test(JOBCITYJOB_SUPABASE_URL) &&
    /^eyJ/.test(JOBCITYJOB_SUPABASE_ANON_KEY) &&
    !/your_|REPLACE/i.test(JOBCITYJOB_SUPABASE_URL + " " + JOBCITYJOB_SUPABASE_ANON_KEY);
}

function paystackReady() {
  return !!window.PaystackPop &&
    typeof window.PaystackPop.setup === "function" &&
    JOBCITYJOB_PAYSTACK_PUBLIC_KEY &&
    JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("REPLACE") < 0 &&
    JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("your_") < 0;
}

/* Lightweight startup diagnostics — DevTools console only; harmless in production. */
if (!window.supabase) {
  console.warn("[jobcityjob] Supabase SDK not loaded — check that https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2 is reachable (ad-blockers/offline can block it).");
} else if (!JOBCITYJOB_SUPABASE_URL || JOBCITYJOB_SUPABASE_URL.indexOf("your_") === 0 || JOBCITYJOB_SUPABASE_ANON_KEY.indexOf("your_") === 0) {
  console.warn("[jobcityjob] Supabase not configured: set SUPABASE_URL / SUPABASE_ANON_KEY, then run `node scripts/gen-env-config.js` (or redeploy with the host env vars set).");
}
if (!window.PaystackPop || typeof window.PaystackPop.setup !== "function") {
  console.warn("[jobcityjob] Paystack SDK not loaded — check that https://js.paystack.co/v1/inline.js is reachable (ad-blockers can block it).");
} else if (!JOBCITYJOB_PAYSTACK_PUBLIC_KEY || JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("REPLACE") >= 0 || JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("your_") === 0) {
  console.warn("[jobcityjob] Paystack public key not set: add PAYSTACK_PUBLIC_KEY, then run `node scripts/gen-env-config.js` (or redeploy with the host env var set).");
}
