/**
 * Jobcityjob — minimal .env loader (zero dependencies).
 *
 * Loads KEY=VALUE pairs from the project-root `.env` (../.env) and, if
 * present, a `server/.env`. Host-provided environment variables always
 * win — this never overrides values already in process.env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function load(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
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

// Project-root .env (where SUPABASE_URL, PAYSTACK_SECRET_KEY, etc. live).
load(path.join(__dirname, "..", ".env"));
// Optional server-local overrides.
load(path.join(__dirname, ".env"));

export default process.env;