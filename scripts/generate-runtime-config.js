/* ============================================================
 * Jobcityjob — runtime config generator (single source of truth)
 * Runs at deploy time (Vercel buildCommand) to inject the PHP API
 * base URL and Paystack PUBLIC key from environment variables into
 * js/config/runtime-config.js.
 *
 * Env vars (set in Vercel → Project → Settings → Environment Variables,
 * or in a local .env file at the project root):
 *   JOBCITYJOB_API_URL    base URL of the PHP REST API
 *                         (defaults to "api/index.php")
 *   PAYSTACK_PUBLIC_KEY   Paystack PUBLIC key (pk_live_... / pk_test_...)
 *
 * A local `.env` file is loaded if present, but never overrides values
 * already set in the environment (e.g. Vercel build env).
 *
 * If variables are missing, it writes the placeholder template instead
 * so local development / direct file upload still works (the app falls
 * back gracefully until you configure the values).
 *
 * NEVER put the PAYSTACK_SECRET_KEY or MySQL credentials in env vars
 * read by this script — the generated file ships to the browser.
 *
 * Usage:  node scripts/generate-runtime-config.js
 * ============================================================ */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = join(__dirname, "..", "js", "config", "runtime-config.js");

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

const apiUrl = (process.env.JOBCITYJOB_API_URL || process.env.API_URL || "api/index.php").trim();
const pk = (process.env.PAYSTACK_PUBLIC_KEY || "pk_test_REPLACE_WITH_YOUR_KEY").trim();

// Admin gate: accepts a ready SHA-256 hex digest (JOBCITYJOB_ADMIN_HASH) or a
// plaintext secret (JOBCITYJOB_ADMIN_PASSWORD) that is hashed here. Only the
// digest ever ships in the generated file; the plaintext never reaches the
// browser or the repo. When neither is provided the value is "" and the admin
// panel stays locked (fail-closed) until one is configured.
const hashEnv = (process.env.JOBCITYJOB_ADMIN_HASH || "").trim();
const adminPass = (process.env.JOBCITYJOB_ADMIN_PASSWORD || "").trim();
let adminHash = "";
if (/^[0-9a-f]{64}$/i.test(hashEnv)) {
  adminHash = hashEnv.toLowerCase();
} else if (adminPass) {
  adminHash = createHash("sha256").update(adminPass).digest("hex");
}

const isUnset = (v) => !v || /REPLACE|your_/i.test(v);
const configured = !isUnset(apiUrl) && !isUnset(pk);
const pkConfigured = !isUnset(pk);
const pkPlaceholder = !pkConfigured;

function template(api, p, h) {
  return `/* ========== Jobcityjob runtime configuration ==========
 * GENERATED FILE — do not edit by hand.
 * Produced at build time from environment variables by
 * \`node scripts/generate-runtime-config.js\` (see vercel.json buildCommand).
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
const JOBCITYJOB_API_URL = ${JSON.stringify(api)};
const JOBCITYJOB_PAYSTACK_PUBLIC_KEY = ${JSON.stringify(p)};
const JOBCITYJOB_ADMIN_HASH = ${JSON.stringify(h)};

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
  console.warn("[jobcityjob] PHP API not configured: set the JOBCITYJOB_API_URL env var (default is api/index.php), then run \`node scripts/generate-runtime-config.js\` (or redeploy with the host env var set).");
}
if (!window.PaystackPop || typeof window.PaystackPop.setup !== "function") {
  console.warn("[jobcityjob] Paystack SDK not loaded — check that https://js.paystack.co/v1/inline.js is reachable (ad-blockers can block it).");
} else if (!JOBCITYJOB_PAYSTACK_PUBLIC_KEY || JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("REPLACE") >= 0 || JOBCITYJOB_PAYSTACK_PUBLIC_KEY.indexOf("your_") === 0) {
  console.warn("[jobcityjob] Paystack public key not set: add PAYSTACK_PUBLIC_KEY, then run \`node scripts/generate-runtime-config.js\` (or redeploy with the host env var set).");
}
`;
}

mkdirSync(dirname(outFile), { recursive: true });
const hasExisting = existsSync(outFile);

if (configured) {
  writeFileSync(outFile, template(apiUrl, pk, adminHash), "utf8");
  if (pkConfigured) {
    console.log("[jobcityjob] runtime config written from environment variables (PHP API + Paystack configured)." + (adminHash ? " Admin hash injected." : ""));
  } else {
    console.warn("[jobcityjob] runtime config written — PHP API configured, but PAYSTACK_PUBLIC_KEY is missing/placeholder.");
  }
  if (!adminHash) {
    console.warn("[jobcityjob] NOTE: no admin hash — /desk will stay locked until JOBCITYJOB_ADMIN_HASH or JOBCITYJOB_ADMIN_PASSWORD is set.");
  }
  if (pkPlaceholder) {
    console.warn("[jobcityjob] NOTE: a placeholder PAYSTACK_PUBLIC_KEY was written — openPaystack will show the 'Paystack is not configured yet' toast until a real pk_live_/pk_test_ key is provided.");
  }
} else if (hasExisting) {
  console.warn("[jobcityjob] PAYSTACK_PUBLIC_KEY not set in the build env — keeping the real values already in js/config/runtime-config.js instead of overwriting them with placeholders. To rotate keys without a code commit, set them in Vercel -> Project -> Settings -> Environment Variables and redeploy.");
} else {
  writeFileSync(outFile, template(apiUrl, pk, adminHash), "utf8");
  console.warn("[jobcityjob] runtime config written with empty/placeholder values — set JOBCITYJOB_API_URL and PAYSTACK_PUBLIC_KEY and re-run.");
  if (pkPlaceholder) {
    console.warn("[jobcityjob] NOTE: a placeholder PAYSTACK_PUBLIC_KEY was written — openPaystack will show the 'Paystack is not configured yet' toast until a real pk_live_/pk_test_ key is provided.");
  }
}