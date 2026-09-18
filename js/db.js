/* ========== Jobcityjob Supabase Data Access Layer ==========
 * All persistent data now lives in Supabase tables. This module
 * exposes async helpers used by app.js. Read functions return empty
 * arrays when Supabase is not configured, so the site still renders
 * without a backend during development.
 */
const JCDB = (() => {
  const T = JOB_CITY_DB.tables;

  async function run(table, fn) {
    if (!supabaseReady()) {
      throw new Error("Supabase not configured: set SUPABASE_URL and SUPABASE_ANON_KEY in .env (or Vercel env vars) and rebuild.");
    }
    const { data, error } = await fn();
    if (error) throw error;
    return data;
  }

  /* ---------- Users (profiles + session) ---------- */
  async function signUp(email, password, profile) {
    if (!supabaseReady()) return null;
    const { data, error } = await jobcitySupabase.auth.signUp({
      email, password,
      options: { data: profile }
    });
    if (error) throw error;
    return data;
  }

  async function createProfileRow(user, profile) {
    // Insert business profile row as the now-authenticated user.
    const { error } = await jobcitySupabase
      .from(T.users)
      .insert([{
        id: user.id,
        email: user.email,
        auth_id: user.id,
        type: profile.type,
        name: profile.name,
        country: profile.country,
        profile_complete: false,
        messages: [],
        pipeline: []
      }]);
    if (error) throw error;
    return user;
  }

  async function signIn(email, password) {
    if (!supabaseReady()) return null;
    const { data, error } = await jobcitySupabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async function signOut() {
    if (!supabaseReady()) return;
    await jobcitySupabase.auth.signOut();
  }

  async function getSession() {
    if (!supabaseReady()) return null;
    const { data } = await jobcitySupabase.auth.getSession();
    return data.session || null;
  }

  async function currentProfile() {
    if (!supabaseReady()) return null;
    const session = await getSession();
    if (!session) return null;
    const { data } = await jobcitySupabase
      .from(T.users)
      .select("*")
      .eq("auth_id", session.user.id)
      .maybeSingle();
    return data || null;
  }

  async function updateUserProfile(userId, patch) {
    return run(T.users, () => jobcitySupabase
      .from(T.users).update(patch).eq("id", userId));
  }

  async function getUserByEmail(email) {
    return run(T.users, () => jobcitySupabase
      .from(T.users).select("*").eq("email", email).maybeSingle());
  }

  async function getUserById(userId) {
    return run(T.users, () => jobcitySupabase
      .from(T.users).select("*").eq("id", userId).maybeSingle());
  }

  /* ---------- Employees ---------- */
  async function listEmployees() {
    if (!supabaseReady()) return [];
    const { data, error } = await jobcitySupabase
      .from(T.employees).select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function getEmployee(id) {
    return run(T.employees, () => jobcitySupabase
      .from(T.employees).select("*").eq("id", id).maybeSingle());
  }

  async function getEmployeeByUser(userId) {
    return run(T.employees, () => jobcitySupabase
      .from(T.employees).select("*").eq("user_id", userId).maybeSingle());
  }

  async function saveEmployee(profile) {
    const existing = await getEmployeeByUser(profile.userId || profile.user_id);
    if (existing) {
      await run(T.employees, () => jobcitySupabase
        .from(T.employees).update(profile).eq("id", existing.id));
      return { ...existing, ...profile };
    }
    const rows = await run(T.employees, () => jobcitySupabase
      .from(T.employees).insert([profile]).select());
    return rows && rows[0];
  }

  /* ---------- Payments ---------- */
  async function listPayments(employerId) {
    return run(T.payments, () => {
      let q = jobcitySupabase.from(T.payments).select("*").order("created_at", { ascending: false });
      if (employerId) q = q.eq("employer_id", employerId);
      return q;
    });
  }

  async function listPendingPayments() {
    return run(T.payments, () => jobcitySupabase
      .from(T.payments).select("*").eq("status", "pending_confirmation")
      .order("created_at", { ascending: false }));
  }

  async function getPayment(payId) {
    return run(T.payments, () => jobcitySupabase
      .from(T.payments).select("*").eq("id", payId).maybeSingle());
  }

  async function createPayment(payload) {
    const rows = await run(T.payments, () => jobcitySupabase
      .from(T.payments).upsert([payload], { onConflict: "id" }).select());
    return rows && rows[0];
  }

  async function confirmPayment(payId, extra) {
    return run(T.payments, () => jobcitySupabase
      .from(T.payments)
      .update({ status: "confirmed", confirmed_at: new Date().toISOString(), ...(extra||{}) })
      .eq("id", payId));
  }

  /* ---------- Unlocks (worker credentials delivered to employers) ---------- */
  async function recordUnlock(unlock) {
    const rows = await run(T.unlocks, () => jobcitySupabase
      .from(T.unlocks).insert([unlock]).select());
    return rows && rows[0];
  }

  async function listUnlocks(employerId) {
    if (!supabaseReady()) return [];
    let q = jobcitySupabase.from(T.unlocks).select("*").order("unlocked_at", { ascending: false });
    if (employerId) q = q.eq("employer_id", employerId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  /* Fire-and-wait server-side verification via a Supabase Edge Function.
   * The frontend never marks a payment as paid by itself — the Edge
   * Function verifies the reference with Paystack (secret server-side)
   * and confirms + unlocks only after verification succeeds. */
  async function verifyPayment(payload) {
    if (!supabaseReady()) return { ok: false, verified: false, message: "Supabase not configured." };
    const { data, error } = await jobcitySupabase.functions.invoke("verify-payment", { body: payload || {} });
    if (error) throw error;
    return data || {};
  }

  /* ---------- Blog ---------- */
  async function listBlog() {
    if (!supabaseReady()) return [];
    const { data, error } = await jobcitySupabase
      .from(T.blog).select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function saveBlog(post) {
    const rows = await run(T.blog, () => jobcitySupabase
      .from(T.blog).insert([post]).select());
    return rows && rows[0];
  }

  async function likeBlog(id, likes) {
    return run(T.blog, () => jobcitySupabase
      .from(T.blog).update({ likes }).eq("id", id));
  }

  /* ---------- Ratings ---------- */
  async function listRatings() {
    if (!supabaseReady()) return [];
    const { data, error } = await jobcitySupabase
      .from(T.ratings).select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function saveRating(rating) {
    const rows = await run(T.ratings, () => jobcitySupabase
      .from(T.ratings).insert([rating]).select());
    return rows && rows[0];
  }

  /* ---------- Email events ---------- */
  async function listEmailEvents() {
    if (!supabaseReady()) return [];
    const { data, error } = await jobcitySupabase
      .from(T.emailEvents).select("*").order("created_at", { ascending: false }).limit(2000);
    if (error) throw error;
    return data || [];
  }

  async function recordEmailEvent(evt) {
    const rows = await run(T.emailEvents, () => jobcitySupabase
      .from(T.emailEvents).insert([evt]).select());
    return rows && rows[0];
  }

  /* ---------- Settings (bank details etc.) ---------- */
  async function getSetting(key) {
    if (!supabaseReady()) return null;
    const { data } = await jobcitySupabase
      .from(T.settings).select("value").eq("key", key).maybeSingle();
    return data ? data.value : null;
  }

  async function setSetting(key, value) {
    if (!supabaseReady()) return;
    const { data } = await jobcitySupabase.from(T.settings).select("key").eq("key", key).maybeSingle();
    if (data) {
      return run(T.settings, () => jobcitySupabase
        .from(T.settings).update({ value, updated_at: new Date().toISOString() }).eq("key", key));
    }
    return run(T.settings, () => jobcitySupabase
      .from(T.settings).insert([{ key, value, updated_at: new Date().toISOString() }]));
  }

  return {
    signUp, signIn, signOut, getSession, currentProfile, createProfileRow,
    updateUserProfile, getUserByEmail, getUserById,
    listEmployees, getEmployee, getEmployeeByUser, saveEmployee,
    listPayments, listPendingPayments, getPayment, createPayment, confirmPayment, verifyPayment,
    recordUnlock, listUnlocks,
    listBlog, saveBlog, likeBlog,
    listRatings, saveRating,
    listEmailEvents, recordEmailEvent,
    getSetting, setSetting
  };
})();
