/*
 * Jobcityjob — verify-payment Supabase Edge Function (Deno)
 *
 * Strictly direct Paystack payment verification for customer orders.
 *
 * Flow:
 *   1. CORS preflight (OPTIONS) handled first.
 *   2. Accepts JSON: { reference, orderId } (paymentId also accepted as an alias).
 *   3. Verifies { reference } with Paystack using the official endpoint
 *      https://api.paystack.co/transaction/verify/:reference and the
 *      server-only PAYSTACK_SECRET_KEY.
 *   4. Only proceeds when Paystack status === "success".
 *   5. Loads the order (jc_payments) by orderId.
 *   6. Compares Paystack amount (minor units / kobo) with the order's total —
 *      rejects on mismatch.
 *   7. Atomically marks the order paid (idempotent — a reference can only be
 *      processed once) and stores reference / amount / status / payment date.
 *   8. Delivers the purchased worker credentials into the employer's
 *      Message Centre + ATS pipeline and records each grant in jc_unlocks
 *      (run supabase-payments-upgrade.sql so that table exists).
 *
 * Secrets (Edge Function environment — NEVER exposed to the browser):
 *   PAYSTACK_SECRET_KEY
 *   SUPABASE_SERVICE_ROLE_KEY  (admin credentials, used only inside this function)
 *
 * Deploy:
 *   supabase functions deploy verify-payment --project-ref <ref>
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify/";

const T = { users: "jc_users", employees: "jc_employees", payments: "jc_payments", unlocks: "jc_unlocks" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, code: "method_not_allowed", message: "Only POST is supported." }, 405);
    }

    const body = await req.json().catch(() => ({}));
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    const orderId = (
      typeof body.orderId === "string" ? body.orderId.trim() :
      typeof body.paymentId === "string" ? body.paymentId.trim() :
      ""
    );

    // 1) Missing inputs
    if (!reference) return json({ ok: false, code: "missing_reference", message: "Missing transaction reference." }, 400);
    if (!orderId) return json({ ok: false, code: "missing_order_id", message: "Missing order ID." }, 400);

    // 2) Server-side env must be present
    if (!PAYSTACK_SECRET_KEY) return json({ ok: false, code: "server_error", message: "PAYSTACK_SECRET_KEY not configured." }, 500);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, code: "server_error", message: "Supabase admin credentials not configured." }, 500);

    // 3) Verify with Paystack (secret stays server-side)
    const psResponse = await fetch(PAYSTACK_VERIFY_URL + encodeURIComponent(reference), {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    let psJson = {};
    try { psJson = await psResponse.json(); } catch { /* non-JSON body */ }

    if (!psResponse.ok || psJson.status !== true) {
      return json({
        ok: false, code: "invalid_transaction",
        message: psJson.message || "Paystack could not find this transaction.",
      }, 400);
    }

    const tx = psJson.data || {};
    const txStatus = String(tx.status || "").toLowerCase();

    if (txStatus !== "success") {
      return json({
        ok: false, code: "payment_failed",
        message: `Payment is not successful (status: ${tx.status || "unknown"}).`,
      }, 200);
    }

    const amountPaidMinor = Number(tx.amount || 0); // minor units (kobo)
    const currency = tx.currency || "NGN";
    const paymentDate = tx.paid_at ? new Date(tx.paid_at).toISOString() : new Date().toISOString();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4) Retrieve the order by orderId
    const { data: orderRows, error: orderErr } = await supabase
      .from(T.payments).select("*").eq("id", orderId).limit(1);
    if (orderErr) return json({ ok: false, code: "server_error", message: orderErr.message }, 500);
    const order = (orderRows && orderRows[0]) || null;
    if (!order) return json({ ok: false, code: "order_not_found", message: "Order not found." }, 404);

    // 5) Amount guard — compare Paystack charge (kobo) against the order total
    const expectedMinor = Number(order.amount_kobo) || Math.round(Number(order.amount_ngn) * 100) || null;
    if (expectedMinor == null) {
      return json({ ok: false, code: "amount_mismatch", message: "Order has no recorded amount to verify against." }, 422);
    }
    if (expectedMinor !== amountPaidMinor) {
      return json({
        ok: false, code: "amount_mismatch",
        message: `Amount mismatch: expected ${expectedMinor} minor units, Paystack charged ${amountPaidMinor}.`,
        expectedAmountMinor: expectedMinor,
        paidAmountMinor: amountPaidMinor,
      }, 422);
    }

    // 6) Atomic idempotent claim — only the first request flips the order to confirmed
    const { data: updated, error: updErr } = await supabase
      .from(T.payments)
      .update({
        status: "confirmed",
        ref: reference,
        confirmed_at: paymentDate,
        amount_kobo: amountPaidMinor,
        amount_ngn: Math.round(amountPaidMinor / 100),
        currency: currency,
      })
      .eq("id", orderId)
      .in("status", ["pending", "pending_confirmation", "pending_payment"])
      .select("id");

    if (updErr) return json({ ok: false, code: "server_error", message: updErr.message }, 500);
    if (!updated || updated.length === 0) {
      return json({
        ok: false, code: "already_processed", alreadyPaid: true,
        message: "This transaction reference has already been processed.",
        orderId,
      }, 200);
    }

    // 7) Server-side side effect: deliver purchased contacts to the employer
    try {
      await unlockContacts(supabase, order);
    } catch (err) {
      console.error("[verify-payment] contact delivery failed (payment is confirmed):", err);
    }

    return json({
      ok: true, code: "success", verified: true,
      orderId,
      reference: tx.reference || reference,
      amountPaidMinor,
      amountPaid: amountPaidMinor / 100,
      amountPaidLabel: (currency === "NGN" ? "₦" : currency + " ") + (amountPaidMinor / 100),
      currency,
      paymentDate,
      status: "confirmed",
    });
  } catch (err) {
    return json({ ok: false, code: "server_error", message: (err && err.message) || String(err) }, 500);
  }
});

/**
 * Unlock purchased candidate contacts into the employer's
 * jc_users.messages and jc_users.pipeline. Runs only after the
 * payment has been verified and confirmed.
 */
async function unlockContacts(supabase, order) {
  const employerId = order.employer_id;
  const candidateIds = order.candidate_ids || [];
  if (!employerId || !candidateIds.length) return;

  const { data: empRow } = await supabase.from(T.users).select("*").eq("id", employerId).maybeSingle();
  if (!empRow) return;

  const { data: employees } = await supabase.from(T.employees).select("*");
  const messages = empRow.messages || [];
  const pipeline = empRow.pipeline || [];
  let changed = false;

  for (const cid of candidateIds) {
    const emp = (employees || []).find((e) => String(e.id) === String(cid));
    if (!emp) continue;
    changed = true;

    const wa = emp.whatsapp || emp.phone || "";
    const contact = {
      candidateId: String(emp.id),
      candidateName: emp.full_name || emp.fullName,
      phone: emp.phone,
      whatsapp: wa,
      email: emp.email,
      jobTitle: emp.job_title || emp.jobTitle,
      city: emp.city,
      country: emp.country_name || emp.country,
      education: emp.education,
      experienceYears: emp.experience_years || emp.experienceYears,
      skills: emp.skills,
      industry: emp.industry || emp.job_category || emp.job_title,
      resumeText: emp.resume_text || emp.summary || "",
      matchScore: null,
      at: new Date().toISOString(),
    };

    if (!messages.some((m) => String(m.candidateId) === String(emp.id))) messages.unshift(contact);
    if (!pipeline.some((x) => String(x.candidateId) === String(emp.id))) {
      pipeline.unshift({
        ...contact,
        stage: "new",
        notes: "",
        history: [{ stage: "new", at: new Date().toISOString() }],
      });
    }

    // Audit trail: one jc_unlocks row per delivered candidate.
    const unlockId = "unl_" + (order.id || "pay") + "_" + String(emp.id);
    const { error: unlErr } = await supabase
      .from(T.unlocks)
      .upsert([{
        id: unlockId,
        payment_id: order.id || null,
        employer_id: String(employerId),
        candidate_id: String(emp.id),
        method: order.method || "paystack",
        source: "edge",
        amount_ngn: order.amount_ngn || null,
        amount_usd: order.amount_usd || null,
        candidate_name: emp.full_name || emp.fullName,
        phone: emp.phone,
        whatsapp: wa,
        email: emp.email,
        job_title: emp.job_title || emp.jobTitle,
        city: emp.city,
        country: emp.country_name || emp.country,
        education: emp.education,
        experience_years: emp.experience_years || emp.experienceYears,
        skills: emp.skills || [],
        resume_text: emp.resume_text || emp.summary || "",
        unlocked_at: new Date().toISOString(),
      }], { onConflict: "id" });
    if (unlErr) console.warn("[verify-payment] jc_unlocks write failed:", unlErr.message);
  }

  if (changed) {
    await supabase.from(T.users).update({ messages, pipeline }).eq("id", employerId);
  }
}