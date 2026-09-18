/* ========== Jobcityjob FX – Stale-While-Revalidate ==========
 * Base fee: ₦100. Equivalents use cached rates immediately, then
 * revalidate in the background (SWR).
 *
 * soft TTL (FX_FRESH_MS):  treat cache as "fresh" — skip network if not forced
 * hard TTL (FX_CACHE_MS):  still usable when stale; always revalidate in bg
 * past hard TTL:           still show last rates, but mark expired + revalidate
 */
const FX_CACHE_KEY = "jobcityjob_fx_cache";
const FX_FRESH_MS = 6 * 60 * 60 * 1000;   // 6h – prefer no network
const FX_CACHE_MS = 12 * 60 * 60 * 1000;  // 12h – soft-while-revalidate window
const FX_SERVER_URLS = [
  (typeof window !== "undefined" && window.JOBCITYJOB_FX_URL) || null,
  "fx-rates.json",
  "/fx-rates.json",
  "https://open.er-api.com/v6/latest/USD",
  "https://api.exchangerate-api.com/v4/latest/USD"
].filter(Boolean);
const FX_ENDPOINTS = FX_SERVER_URLS;

const JobcityjobFX = {
  lastUpdated: null,
  source: "bundled",
  updating: false,
  state: "idle", // idle | fresh | stale | revalidating | expired | bundled

  applyUsdRates(usdRates) {
    if (!usdRates || typeof usdRates !== "object") return false;
    const ngnPerUsd = Number(usdRates.NGN);
    if (!ngnPerUsd || ngnPerUsd <= 0) return false;
    Object.keys(CURRENCIES).forEach(code => {
      if (code === "NGN") {
        CURRENCIES[code].ngnPerUnit = 1;
        return;
      }
      const unitsPerUsd = Number(usdRates[code]);
      if (!unitsPerUsd || unitsPerUsd <= 0) return;
      CURRENCIES[code].ngnPerUnit = ngnPerUsd / unitsPerUsd;
    });
    try {
      if (typeof BASE_PRICE_NGN !== "undefined" && CURRENCIES.USD && typeof window !== "undefined") {
        BASE_PRICE_USD = BASE_PRICE_NGN / CURRENCIES.USD.ngnPerUnit;
      }
    } catch (_) {}
    return true;
  },

  loadCache() {
    try {
      const raw = localStorage.getItem(FX_CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.rates || !data.fetchedAt) return null;
      return data;
    } catch {
      return null;
    }
  },

  saveCache(rates, source) {
    const payload = {
      fetchedAt: new Date().toISOString(),
      source: source || "api",
      rates
    };
    try {
      localStorage.setItem(FX_CACHE_KEY, JSON.stringify(payload));
    } catch (_) {}
    this.lastUpdated = payload.fetchedAt;
    this.source = payload.source;
    return payload;
  },

  cacheAgeMs(cache) {
    if (!cache || !cache.fetchedAt) return Infinity;
    return Date.now() - new Date(cache.fetchedAt).getTime();
  },

  isFresh(cache) {
    return this.cacheAgeMs(cache) < FX_FRESH_MS;
  },

  isUsable(cache) {
    // SWR: still serve past "fresh" until hard max; even then we may serve last-known
    return !!(cache && cache.rates);
  },

  isWithinSWRWindow(cache) {
    const age = this.cacheAgeMs(cache);
    return age >= FX_FRESH_MS && age < FX_CACHE_MS;
  },

  /** Serve stale (or fresh) cache into CURRENCIES; return cache meta */
  serveFromCache(cache, label) {
    if (!cache || !cache.rates) return false;
    this.applyUsdRates(cache.rates);
    this.lastUpdated = cache.fetchedAt;
    this.source = label || cache.source || "cache";
    if (this.isFresh(cache)) this.state = "fresh";
    else if (this.isWithinSWRWindow(cache)) this.state = "stale";
    else this.state = "expired";
    return true;
  },

  async fetchFromNetwork() {
    let lastErr = null;
    for (const url of FX_ENDPOINTS) {
      try {
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();

        if (json.format === "jobcityjob-fx" && json.currencies) {
          Object.keys(json.currencies).forEach(code => {
            if (!CURRENCIES[code]) {
              CURRENCIES[code] = { symbol: code + " ", ngnPerUnit: 1, name: code };
            }
            const row = json.currencies[code];
            if (row && row.ngnPerUnit > 0) {
              CURRENCIES[code].ngnPerUnit = row.ngnPerUnit;
              if (row.symbol) CURRENCIES[code].symbol = row.symbol;
            }
          });
          const synthetic = { NGN: CURRENCIES.USD ? CURRENCIES.USD.ngnPerUnit : 1550, USD: 1 };
          Object.keys(CURRENCIES).forEach(code => {
            if (code === "NGN" || code === "USD") return;
            const npu = CURRENCIES[code].ngnPerUnit;
            if (npu > 0 && synthetic.NGN) synthetic[code] = synthetic.NGN / npu;
          });
          return { rates: synthetic, source: url, applied: true };
        }

        const rates = json.rates || json.conversion_rates;
        if (!rates || !rates.NGN) throw new Error("NGN missing in response");
        return { rates, source: url };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("All FX endpoints failed");
  },

  /**
   * Stale-While-Revalidate:
   *  - Always paint from cache when present (caller may have done this already)
   *  - If fresh and !force → skip network
   *  - If stale/expired/missing → revalidate in background (or await if options.awaitRevalidate)
   */
  async refresh(options = {}) {
    const force = !!options.force;
    const awaitRevalidate = !!options.awaitRevalidate;
    if (this.updating && !force) {
      return { ok: false, reason: "busy", state: this.state };
    }

    const cache = this.loadCache();

    // 1) Serve stale/fresh immediately if not already applied by bootstrap
    if (cache && this.isUsable(cache)) {
      this.serveFromCache(cache, this.isFresh(cache) ? "cache" : "cache-stale");
      if (typeof updatePriceDisplay === "function") updatePriceDisplay();
      this.updateUI();
    }

    // 2) Fresh enough → no network (unless force)
    if (!force && cache && this.isFresh(cache)) {
      this.state = "fresh";
      this.updateUI();
      return { ok: true, from: "cache-fresh", at: cache.fetchedAt, state: this.state };
    }

    // 3) Revalidate (SWR background)
    const revalidate = async () => {
      this.updating = true;
      this.state = "revalidating";
      this.updateUI();
      try {
        const result = await this.fetchFromNetwork();
        if (!result.applied) this.applyUsdRates(result.rates);
        const saved = this.saveCache(result.rates, result.source);
        this.state = "fresh";
        this.source = result.applied ? "server" : "network";
        if (typeof updatePriceDisplay === "function") updatePriceDisplay();
        this.updateUI();
        return { ok: true, from: this.source, at: saved.fetchedAt, state: this.state };
      } catch (netErr) {
        if (cache && this.isUsable(cache)) {
          this.serveFromCache(cache, "cache-stale");
          if (typeof updatePriceDisplay === "function") updatePriceDisplay();
          this.updateUI();
          return {
            ok: true,
            from: "stale-fallback",
            at: cache.fetchedAt,
            state: this.state,
            warning: String(netErr.message || netErr)
          };
        }
        this.state = "bundled";
        this.source = "bundled";
        this.updateUI();
        return { ok: false, from: "bundled", error: String(netErr.message || netErr), state: this.state };
      } finally {
        this.updating = false;
        this.updateUI();
      }
    };

    if (awaitRevalidate) return revalidate();
    // Fire-and-forget background revalidation
    const p = revalidate();
    return { ok: true, from: cache ? "stale-while-revalidate" : "revalidating", pending: p, state: this.state };
  },

  updateUI() {
    if (typeof updatePriceDisplay === "function") updatePriceDisplay();
    const label = {
      idle: "FX: idle",
      fresh: "FX rates: up to date",
      stale: "FX rates: showing cached (refreshing…)",
      revalidating: "FX rates: revalidating…",
      expired: "FX rates: cached copy (updating…)",
      bundled: "FX rates: built-in reference (offline)"
    };
    const text = label[this.state] || "FX rates";
    const when = this.lastUpdated ? " · " + new Date(this.lastUpdated).toLocaleString() : "";
    const src = this.source ? " · " + this.source : "";
    const full = text + when + src;
    ["fxStatus", "fxStatusAdmin"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = full;
    });
  },

  async forceRefresh() {
    const result = await this.refresh({ force: true, awaitRevalidate: true });
    if (typeof toast === "function") {
      if (result.ok && (result.from === "network" || result.from === "server")) {
        toast("Currency rates revalidated from live data.", "success");
      } else if (result.ok) {
        toast("Still showing cached rates (" + result.from + ").", "success");
      } else {
        toast("Revalidate failed — built-in rates kept. " + (result.error || ""), "error");
      }
    }
    return result;
  },

  /** Explicit SWR entry: paint cache now, revalidate in background */
  staleWhileRevalidate() {
    const cache = this.loadCache();
    if (cache && this.isUsable(cache)) {
      this.serveFromCache(cache);
    } else {
      this.state = "bundled";
      this.source = "bundled";
    }
    if (typeof updatePriceDisplay === "function") updatePriceDisplay();
    this.updateUI();
    // Background revalidate (does not block UI)
    this.refresh({ force: false, awaitRevalidate: false });
  }
};

document.addEventListener("DOMContentLoaded", () => {
  JobcityjobFX.staleWhileRevalidate();
});
