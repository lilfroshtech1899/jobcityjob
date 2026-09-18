import { paymentStore } from "./store.js";
import { UNLOCK_AMOUNT_KOBO, UNLOCK_CURRENCY } from "./types.js";

/**
 * Idempotent fulfillment: mark success and signal unlock.
 * In production, write to the same DB the app uses for employer message centre.
 * For the static demo, the admin UI / client polls or receives a push after webhook.
 *
 * @param {import('./types.js').Payment} payment
 * @param {import('./types.js').VerifyResult} verify
 * @param {{ onUnlock?: (payment: object) => void | Promise<void> }} [hooks]
 */
export async function fulfill(payment, verify, hooks = {}) {
  if (!payment) return { ok: false, message: "payment not found" };

  if (payment.fulfilled || payment.status === "success") {
    return { ok: true, already: true, payment, message: "Already fulfilled" };
  }

  const expected = payment.amountMinor || UNLOCK_AMOUNT_KOBO;
  const currency = (verify.currency || payment.currency || UNLOCK_CURRENCY).toUpperCase();
  const paid = Number(verify.amountMinor);

  if (verify.status !== "success" && !verify.ok) {
    paymentStore.update(payment.id, { status: verify.status || "failed" });
    return { ok: false, message: verify.message || "Not successful" };
  }

  if (Number.isFinite(paid) && paid < expected) {
    paymentStore.update(payment.id, { status: "failed" });
    return { ok: false, message: `Underpaid: got ${paid} kobo, need ${expected}` };
  }

  if (currency && currency !== (payment.currency || UNLOCK_CURRENCY).toUpperCase()) {
    paymentStore.update(payment.id, { status: "failed" });
    return { ok: false, message: `Currency mismatch: ${currency}` };
  }

  const updated = paymentStore.update(payment.id, {
    status: "success",
    fulfilled: true,
    paidAt: new Date().toISOString(),
    providerRef: verify.providerRef || payment.providerRef,
  });

  if (typeof hooks.onUnlock === "function") {
    await hooks.onUnlock(updated);
  }

  // Side-effect hook for Jobcityjob: unlock is implemented by the app layer
  // (same outcome as admin confirmPayment in the SPA).
  console.log("[fulfill] unlocked", {
    reference: updated.reference,
    employerId: updated.employerId,
    candidates: updated.candidateIds?.length,
  });

  return { ok: true, payment: updated };
}
