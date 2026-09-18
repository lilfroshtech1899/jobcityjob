/* ============================================================
 * Jobcityjob — runtime config generator (single source of truth)
 * Runs at deploy time (Vercel buildCommand) to inject the real
 * Supabase project URL / anon key and Paystack PUBLIC key from
 * environment variables into js/env-config.js.
 *
 * Env vars (set in Vercel → Project → Settings → Environment Variables,
 * or in a local .env file at the project root):
 *   SUPABASE_URL         e.g. https://xyzcompany.supabase.co
 *   SUPABASE_ANON_KEY    the anon (public) key
 *   PAYSTACK_PUBLIC_KEY  Paystack PUBLIC key (pk_live_... / pk_test_...)
 *
 * A local `.env` file is loaded if present, but never overrides values
 * already set in the environment (e.g. Vercel build env).
 *
 * If variables are missing, it writes the placeholder template instead
 * so local development / direct file upload still works (the app falls
 * back gracefully until you configure the values).
 *
 * NEVER put SUPABASE service_role key or PAYSTACK_SECRET_KEY in .env vars
 * read by this script — the generated file ships to the browser.
 *
 * Usage:  node scripts/gen-env-config.js
 * ============================================================ */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = join(__dirname, "..", "js", "env-config.js");

/** Minimal .env loader — does not override env vars already set by the host. */
function loadEnvFile(file) {
  let raw = "";
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || key in process.env) continue;
    process.env[key] = value;
  }
}

// Load project-root .env so local builds work without a host env system.
loadEnvFile(join(__dirname, "..", ".env"));

const url = (process.env.SUPABASE_URL || "").trim();
const anon = (process.env.SUPABASE_ANON_KEY || "").trim();
const pk = (process.env.PAYSTACK_PUBLIC_KEY || "pk_test_REPLACE_WITH_YOUR_KEY").trim();

const isUnset = (v) => !v || /REPLACE|your_/i.test(v);
const configured = !isUnset(url) && !isUnset(anon);
const pkConfigured = !isUnset(pk);
const pkPlaceholder = !pkConfigured;

function template(u, a, p) {
  return `/* ========== Jobcityjob runtime configuration ==========
 * GENERATED FILE — do not edit by hand.
 * Produced at build time from environment variables by
 * \`node scripts/gen-env-config.js\` (see vercel.json buildCommand).
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
const JOBCITYJOB_SUPABASE_URL = ${JSON.stringify(u)};
const JOBCITYJOB_SUPABASE_ANON_KEY = ${JSON.stringify(a)};
const JOBCITYJOB_PAYSTACK_PUBLIC_KEY = ${JSON.stringify(p)};

const jobcitySupabase = (window.supabase && ${JSON.stringify(u)})
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
    /^https:\\/\\//.test(JOBCITYJOB_SUPABASE_URL) &&
    /\\.supabase\\.co/.test(JOBCITYJOB_SUPABASE_URL) &&
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
  console.warn("[jobcityjob] Supabase not configured: set SUPABASE_URL / SUPABASE_ANON_KEY, then run \`node scripts/gen-env-config.js\` (or redeploy with the host env vars set).");
}
if (!window.PaystackPop || typeof window.PaystackPop.setup !== "function") {
  console.warn("[jobcityjob] Paystack SDK not loaded — check that https://js.paystack.co/v1/inline.js is reachable (ad-blockers can block it).");
} else if (!JOBCITYJOB_PAYSTACK_PUBLIC_KEY || JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("REPLACE") >= 0 || JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("your_") === 0) {
  console.warn("[jobcityjob] Paystack public key not set: add PAYSTACK_PUBLIC_KEY, then run \`node scripts/gen-env-config.js\` (or redeploy with the host env var set).");
}
`;
}

mkdirSync(dirname(outFile), { recursive: true });
const hasExisting = existsSync(outFile);

if (configured) {
  writeFileSync(outFile, template(url, anon, pk), "utf8");
  if (pkConfigured) {
    console.log("[jobcityjob] env-config written from environment variables (Supabase + Paystack configured).");
  } else {
    console.warn("[jobcityjob] env-config written — Supabase configured, but PAYSTACK_PUBLIC_KEY is missing/placeholder.");
  }
  if (pkPlaceholder) {
    console.warn("[jobcityjob] NOTE: a placeholder PAYSTACK_PUBLIC_KEY was written — openPaystack will show the 'Paystack is not configured yet' toast until a real pk_live_/pk_test_ key is provided.");
  }
} else if (hasExisting) {
  console.warn("[jobcityjob] SUPABASE_URL / SUPABASE_ANON_KEY not set in the build env — keeping the real values already in js/env-config.js instead of overwriting them with placeholders. To rotate keys without a code commit, set them in Vercel -> Project -> Settings -> Environment Variables and redeploy.");
} else {
  writeFileSync(outFile, template(url, anon, pk), "utf8");
  console.warn("[jobcityjob] env-config written with empty/placeholder values — set SUPABASE_URL, SUPABASE_ANON_KEY, PAYSTACK_PUBLIC_KEY and re-run.");
  if (pkPlaceholder) {
    console.warn("[jobcityjob] NOTE: a placeholder PAYSTACK_PUBLIC_KEY was written — openPaystack will show the 'Paystack is not configured yet' toast until a real pk_live_/pk_test_ key is provided.");
  }
}