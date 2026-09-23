/* ========== Jobcityjob PHP/MySQL Data Access Layer ==========
 * All persistent data lives in MySQL/MariaDB and is reached through the
 * PHP REST-style API (api/index.php). The browser NEVER talks to MySQL
 * directly and NEVER holds server secrets — only the Paystack PUBLIC key
 * (runtime-config.js) and this module's API path.
 *
 * This module exposes the same async helpers app.js always used, so the
 * UI logic is unchanged. Read functions return empty values when the API
 * is not configured, so the site still renders without a backend.
 */
const JCDB = (() => {
  // CSRF token issued per-session by the PHP API (auth.session / auth.profile)
  // and echoed back on state-changing calls so index.php can verify it. The
  // token is keyed to the session cookie; never survives a page reload request.
  let csrfToken = null;
  let csrfRefreshing = null;

  function apiBase() {
    return (typeof JOBCITYJOB_API_URL !== "undefined") ? JOBCITYJOB_API_URL : "api/index.php";
  }

  function apiUrl(route, opts) {
    const base = apiBase();
    const q = new URLSearchParams();
    q.set("r", route);
    if (opts.query) {
      Object.entries(opts.query).forEach(([k, v]) => {
        if (v != null && v !== "") q.set(k, String(v));
      });
    }
    return base + (base.indexOf("?") >= 0 ? "&" : "?") + q.toString();
  }

  // Re-fetch the session-scoped CSRF token once; concurrent callers share the
  // same in-flight request.
  function refreshCsrf() {
    if (csrfRefreshing) return csrfRefreshing;
    csrfRefreshing = (async () => {
      try {
        const res = await fetch(apiUrl("auth.session", {}), {
          credentials: "include",
          headers: { "Accept": "application/json" }
        });
        const data = await res.json();
        if (data && data.csrf_token) csrfToken = data.csrf_token;
      } catch (_) {
        // keep whatever token we already hold
      } finally {
        csrfRefreshing = null;
      }
      return csrfToken;
    })();
    return csrfRefreshing;
  }

  async function request(url, init, retried) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new Error("API unreachable: " + ((err && err.message) || err));
    }

    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }

    // Read-only responses carry the session's CSRF token — keep it fresh.
    if (data && data.csrf_token) csrfToken = data.csrf_token;

    if (!res.ok) {
      const code = data && data.code;
      // Session token missing/stale: re-sync it once, then retry so the user
      // isn't forced to reload the page.
      if (!retried && res.status === 403 && (code === "csrf_required" || code === "csrf_mismatch")) {
        await refreshCsrf();
        if (csrfToken) {
          init.headers = Object.assign({}, init.headers, { "X-CSRF-Token": csrfToken });
          return request(url, init, true);
        }
      }
      const msg = (data && data.message) || ("Request failed with status " + res.status);
      const e = new Error(msg);
      e.status = res.status;
      e.code = code;
      throw e;
    }
    return data || {};
  }

  async function api(route, opts = {}) {
    if (typeof apiReady !== "function" || !apiReady()) {
      throw new Error("PHP API not configured: set JOBCITYJOB_API_URL in js/config/runtime-config.js.");
    }
    const init = {
      method: opts.body != null ? "POST" : "GET",
      credentials: "include",
      headers: { "Accept": "application/json" }
    };
    if (opts.body != null) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    if (csrfToken) init.headers["X-CSRF-Token"] = csrfToken;
    return request(apiUrl(route, opts), init, false);
  }

  /* ---------- Users (profiles + session) ---------- */
  async function signUp(email, password, profile) {
    if (!apiReady()) return null;
    const data = await api("auth.signup", { body: { email, password, ...(profile || {}) } });
    return data; // { user, session }
  }

  async function createProfileRow(user, profile) {
    const data = await api("users.ensure", {
      body: { type: profile.type, name: profile.name, country: profile.country }
    });
    return (data && data.user) || null;
  }

  async function signIn(email, password) {
    if (!apiReady()) return null;
    const data = await api("auth.signin", { body: { email, password } });
    return (data && data.user) || null;
  }

  async function signOut() {
    if (!apiReady()) return;
    try { await api("auth.signout", { body: {} }); } catch (_) {}
  }

  async function getSession() {
    if (!apiReady()) return null;
    const data = await api("auth.session");
    return (data && data.session) || null;
  }

  async function currentProfile() {
    if (!apiReady()) return null;
    const data = await api("auth.profile");
    return (data && data.profile) || null;
  }

  async function updateUserProfile(userId, patch) {
    const data = await api("profile.update", { body: { id: userId, patch } });
    return (data && data.row) || null;
  }

  async function getUserByEmail(email) {
    const data = await api("users.by_email", { query: { email } });
    return (data && data.user) || null;
  }

  async function getUserById(userId) {
    const data = await api("users.get", { query: { id: userId } });
    return (data && data.user) || null;
  }

  /* ---------- Employees ---------- */
  async function listEmployees() {
    if (!apiReady()) return [];
    const data = await api("employees.list");
    return (data && data.employees) || [];
  }

  async function getEmployee(id) {
    const data = await api("employees.get", { query: { id } });
    return (data && data.employee) || null;
  }

  async function getEmployeeByUser(userId) {
    const data = await api("employees.by_user", { query: { userId } });
    return (data && data.employee) || null;
  }

  async function saveEmployee(profile) {
    const data = await api("employees.save", { body: { profile } });
    return (data && data.employee) || null;
  }

  /* ---------- Payments ---------- */
  async function listPayments(employerId) {
    const data = await api("payments.list", { query: { employer_id: employerId } });
    return (data && data.payments) || [];
  }

  async function listPendingPayments() {
    const data = await api("payments.pending");
    return (data && data.payments) || [];
  }

  async function getPayment(payId) {
    const data = await api("payments.get", { query: { id: payId } });
    return (data && data.payment) || null;
  }

  async function createPayment(payload) {
    const data = await api("payments.create", { body: { payment: payload } });
    return (data && data.payment) || null;
  }

  /* Server-side Paystack verification. The PHP backend verifies the
   * reference with Paystack using the server-only secret key, confirms
   * the payment in MySQL and delivers the purchased contacts. There is
   * no browser path that marks an order as paid. */
  async function verifyPayment(payload) {
    if (!apiReady()) return { ok: false, verified: false, message: "PHP API not configured." };
    const data = await api("payments.verify", { body: payload || {} });
    return data || {};
  }

  /* ---------- Unlocks (audit trail — read-only from the browser) ---------- */
  async function listUnlocks(employerId) {
    if (!apiReady()) return [];
    const data = await api("unlocks.list", { query: { employer_id: employerId } });
    return (data && data.unlocks) || [];
  }

  /* ---------- Admin overview stats (server-verified admin session) ---------- */
  let _adminStats = null;

  async function adminStats() {
    const data = await api("admin.stats");
    if (data && typeof data.users === "number") _adminStats = data;
    return data || { users: 0, unlocks: 0, total: 0, paidCount: 0 };
  }

  async function countUsers() {
    return (await adminStats()).users;
  }

  async function countUnlocks() {
    return (await adminStats()).unlocks;
  }

  async function totalConfirmedPaid() {
    const s = await adminStats();
    return { count: s.paidCount, total: s.total };
  }

  /* ---------- Blog ---------- */
  async function listBlog() {
    if (!apiReady()) return [];
    const data = await api("blog.list");
    return (data && data.posts) || [];
  }

  async function saveBlog(post) {
    const data = await api("blog.save", { body: { post } });
    return (data && data.post) || null;
  }

  async function likeBlog(id, likes) {
    await api("blog.like", { body: { id, likes } });
  }

  /* ---------- Ratings ---------- */
  async function listRatings() {
    if (!apiReady()) return [];
    const data = await api("ratings.list");
    return (data && data.ratings) || [];
  }

  async function saveRating(rating) {
    const data = await api("ratings.save", { body: { rating } });
    return (data && data.rating) || null;
  }

  /* ---------- Email events ---------- */
  async function listEmailEvents() {
    if (!apiReady()) return [];
    const data = await api("email_events.list");
    return (data && data.events) || [];
  }

  async function recordEmailEvent(evt) {
    const data = await api("email_events.record", { body: { event: evt } });
    return (data && data.event) || null;
  }

  /* ---------- Settings (key/value — write requires admin session) ---------- */
  async function getSetting(key) {
    if (!apiReady()) return null;
    const data = await api("settings.get", { query: { key } });
    return (data && data.value) || null;
  }

  async function setSetting(key, value) {
    await api("settings.set", { body: { key, value } });
  }

  /* ---------- Admin session (server-side password check) ---------- */
  async function adminLogin(password) {
    const data = await api("auth.admin_login", { body: { password } });
    _adminStats = null;
    return data || {};
  }

  async function adminLogout() {
    const data = await api("auth.admin_logout", { body: {} });
    _adminStats = null;
    return data || {};
  }

  return {
    signUp, signIn, signOut, getSession, currentProfile, createProfileRow,
    updateUserProfile, getUserByEmail, getUserById,
    listEmployees, getEmployee, getEmployeeByUser, saveEmployee,
    listPayments, listPendingPayments, getPayment, createPayment, verifyPayment,
    listUnlocks, countUsers, countUnlocks, totalConfirmedPaid,
    listBlog, saveBlog, likeBlog,
    listRatings, saveRating,
    listEmailEvents, recordEmailEvent,
    getSetting, setSetting,
    adminLogin, adminLogout
  };
})();