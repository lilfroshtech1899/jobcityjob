/**
 * Jobcityjob – server-side FX rates (cron + HTTP)
 *
 * Fetches USD-based rates once, derives NGN-per-unit for each currency,
 * writes public/fx-rates.json for the static site (or serves via Express).
 *
 * Usage:
 *   node exchange-rates-cron.js              # fetch once and write JSON
 *   node exchange-rates-cron.js --serve      # fetch + serve API on PORT (default 3003)
 *   node exchange-rates-cron.js --loop 12     # refresh every N hours (in-process)
 *
 * System cron example (Linux) - run every 12 hours:
 *   0 * /12 * * *  becomes: minute 0, every 12th hour
 *   cd /path/to/jobcityjob/server && node exchange-rates-cron.js
 *   (see server/crontab.example)
 *
 * Env:
 *   FX_OUT=../public/fx-rates.json   output path
 *   PORT=3003
 *   FX_BASE_URL=https://your-cdn-or-api.example.com  (optional, embedded in JSON)
 */

import "./load-env.js"; // load project-root .env (optional FX_OUT override)

import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENDPOINTS = [
  "https://open.er-api.com/v6/latest/USD",
  "https://api.exchangerate-api.com/v4/latest/USD",
];

const SYMBOLS = {
  NGN: "₦", USD: "$", EUR: "€", GBP: "£", INR: "₹", JPY: "¥", CNY: "¥",
  BRL: "R$", AED: "د.إ", ZAR: "R", CAD: "C$", AUD: "A$", GHS: "GH₵", KES: "KSh",
};

const OUT =
  process.env.FX_OUT ||
  path.join(__dirname, "..", "fx-rates.json");

async function fetchUsdRates() {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      const json = await res.json();
      const rates = json.rates || json.conversion_rates;
      if (!rates?.NGN) throw new Error("NGN missing");
      return { rates, source: url, timeNextUpdate: json.time_next_update_utc || null };
    } catch (e) {
      lastErr = e;
      console.warn("FX fetch failed:", e.message);
    }
  }
  throw lastErr || new Error("All FX endpoints failed");
}

/** Build Jobcityjob shape: ngnPerUnit for each code */
function buildPayload(usdRates, meta = {}) {
  const ngnPerUsd = Number(usdRates.NGN);
  const currencies = {
    NGN: { symbol: SYMBOLS.NGN, ngnPerUnit: 1, name: "Nigerian Naira" },
  };

  for (const [code, unitsPerUsd] of Object.entries(usdRates)) {
    if (code === "NGN" || code === "USD") continue;
    const u = Number(unitsPerUsd);
    if (!u || u <= 0) continue;
    currencies[code] = {
      symbol: SYMBOLS[code] || code + " ",
      ngnPerUnit: ngnPerUsd / u,
      name: code,
    };
  }
  currencies.USD = {
    symbol: SYMBOLS.USD,
    ngnPerUnit: ngnPerUsd,
    name: "US Dollar",
  };

  return {
    format: "jobcityjob-fx",
    version: 1,
    baseFeeNGN: Number(process.env.BASE_PRICE_NGN) || 100,
    base: "NGN",
    fetchedAt: new Date().toISOString(),
    source: meta.source || null,
    timeNextUpdateUtc: meta.timeNextUpdate || null,
    currencies,
    note: "Fee is ₦100 or equivalent. Server-updated rates.",
  };
}

function writePayload(payload) {
  const dir = path.dirname(OUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log("Wrote", OUT, "at", payload.fetchedAt, "source:", payload.source);
  return payload;
}

function readCached() {
  try {
    if (!fs.existsSync(OUT)) return null;
    return JSON.parse(fs.readFileSync(OUT, "utf8"));
  } catch {
    return null;
  }
}

export async function refreshFx() {
  const { rates, source, timeNextUpdate } = await fetchUsdRates();
  const payload = buildPayload(rates, { source, timeNextUpdate });
  return writePayload(payload);
}

function startServer(payloadRef) {
  const port = Number(process.env.PORT) || 3003;
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=21600");

    if (req.method === "GET" && (req.url === "/fx-rates.json" || req.url === "/api/fx" || req.url === "/")) {
      const body = JSON.stringify(payloadRef.current || readCached() || { error: "no rates yet" });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
      return;
    }
    if (req.method === "POST" && req.url === "/api/fx/refresh") {
      // Optional: protect with header in production
      refreshFx()
        .then((p) => {
          payloadRef.current = p;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, fetchedAt: p.fetchedAt }));
        })
        .catch((err) => {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
        });
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });
  server.listen(port, () => console.log(`Jobcityjob FX API http://127.0.0.1:${port}/fx-rates.json`));
}

async function main() {
  const args = process.argv.slice(2);
  const serve = args.includes("--serve");
  const loopIdx = args.indexOf("--loop");
  const loopHours = loopIdx >= 0 ? Number(args[loopIdx + 1]) || 12 : 0;

  let payload = null;
  try {
    payload = await refreshFx();
  } catch (err) {
    console.error("Initial fetch failed:", err.message);
    payload = readCached();
    if (!payload) process.exitCode = 1;
  }

  const ref = { current: payload };

  if (serve) startServer(ref);

  if (loopHours > 0) {
    const ms = loopHours * 60 * 60 * 1000;
    console.log(`In-process refresh every ${loopHours}h`);
    setInterval(() => {
      refreshFx()
        .then((p) => {
          ref.current = p;
        })
        .catch((e) => console.error("Scheduled refresh failed:", e.message));
    }, ms);
  }

  if (!serve && loopHours <= 0) {
    // one-shot cron mode
    process.exit(process.exitCode || 0);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
