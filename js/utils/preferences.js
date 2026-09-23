/* ========== Jobcityjob storage helpers ==========
 * Persistent business data now lives in MySQL via the PHP API (see js/services/database.js).
 * This module only handles lightweight, non-durable browser prefs
 * (language, currency, welcome-music) that are specific to the local
 * visitor and need not be synced across devices.
 */
const JOBCITYJOB_APP_VERSION = "2.0.0";

const PREFS_KEYS = {
  lang: "jobcityjob_lang",
  currency: "jobcityjob_currency",
  music: "jobcityjob_music"
};

function storeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === "") return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Jobcityjob store parse failed for", key, err);
    return fallback;
  }
}

function storeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error("Jobcityjob store write failed for", key, err);
    return false;
  }
}

const JobcityjobStore = {
  getPref(key, fallback) {
    return storeRead(PREFS_KEYS[key] || key, fallback);
  },
  setPref(key, value) {
    return storeWrite(PREFS_KEYS[key] || key, value);
  }
};
