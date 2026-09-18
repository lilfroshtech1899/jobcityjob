/**
 * Domain service – provider-agnostic create / verify / webhook complete
 */
import { randomUUID } from "crypto";
import {
  UNLOCK_AMOUNT_NGN,
  UNLOCK_AMOUNT_KOBO,
  UNLOCK_CURRENCY
} from "./types.js";

export class PaymentService {
  /**
   * @param {object} opts
   * @param {object} opts.store
   * @param {Record<string, object>} opts.providers
   * @param {string} opts.defaultProvider
   * @param {Function} opts.unlockContacts
   */
  constructor({ store, providers, defaultProvider = "manual", unlockContacts }) {
    this.store = store;
    this.providers = providers;
    this.defaultProvider = defaultProvider;
    this.unlockContacts = unlockContacts;
  }

  async create({ employerId, candidateIds, email, provider, metadata }) {
    if (!employerId) throw new Error("employerId required");
    if (!candidateIds || !candidateIds.length) throw new Error("candidateIds required");

    const name = (provider || this.defaultProvider).toLowerCase();
    const adapter = this.providers[name];
    if (!adapter) throw new Error("Unknown payment provider: " + name);

    const id = randomUUID().replace(/-/g, "").slice(0, 12);
    const reference = "JCJ_" + id;

    const payment = await this.store.insert({
      id,
      reference,
      employerId,
      candidateIds: [...candidateIds],
      amountNGN: UNLOCK_AMOUNT_NGN,
      amountMinor: UNLOCK_AMOUNT_KOBO,
      currency: UNLOCK_CURRENCY,
      status: "pending",
      provider: name,
      email: email || null,
      metadata: metadata || {},
      createdAt: new Date().toISOString()
    });

    const session = await adapter.initialize({
      reference,
      amountMinor: UNLOCK_AMOUNT_KOBO,
      amountNGN: UNLOCK_AMOUNT_NGN,
      currency: UNLOCK_CURRENCY,
      email: email || "employer@jobcityjob.app",
      metadata: {
        paymentId: id,
        employerId,
        candidateIds,
        ...(metadata || {})
      }
    });

    return { payment, session };
  }

  async verifyAndComplete(reference) {
    const payment = await this.store.findByReference(reference);
    if (!payment) throw new Error("Payment not found");
    if (payment.status === "success") {
      return { payment, completed: true, alreadyCompleted: true };
    }

    const adapter = this.providers[payment.provider];
    if (!adapter) throw new Error("Provider missing: " + payment.provider);

    const result = await adapter.verify(reference);
    return this._applyVerification(payment, result);
  }

  async handleWebhook(providerName, headers, rawBody) {
    const adapter = this.providers[providerName];
    if (!adapter) return { ignored: true, reason: "unknown provider" };

    const event = await adapter.parseWebhook(headers, rawBody);
    if (!event) return { ignored: true };

    const payment = await this.store.findByReference(event.reference);
    if (!payment) return { ignored: true, reason: "payment not found" };

    return this._applyVerification(payment, event);
  }

  async manualConfirm(reference, adminNote) {
    const payment = await this.store.findByReference(reference);
    if (!payment) throw new Error("Payment not found");
    if (payment.status === "success") {
      return { payment, completed: true, alreadyCompleted: true };
    }
    return this._applyVerification(payment, {
      status: "success",
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      providerRef: "manual:" + (adminNote || "admin")
    });
  }

  async _applyVerification(payment, result) {
    if (result.status !== "success") {
      const updated = await this.store.update(payment.id, {
        status: result.status === "pending" ? "processing" : "failed",
        failureReason: result.status || "failed"
      });
      return { payment: updated, completed: false };
    }

    if (result.currency && String(result.currency).toUpperCase() !== UNLOCK_CURRENCY) {
      throw new Error("Currency mismatch: expected NGN");
    }
    if (typeof result.amountMinor === "number" && result.amountMinor < payment.amountMinor) {
      throw new Error("Amount too low");
    }

    const updated = await this.store.update(payment.id, {
      status: "success",
      paidAt: new Date().toISOString(),
      providerRef: result.providerRef || payment.providerRef || null,
      failureReason: null
    });

    await this.unlockContacts(updated);
    return { payment: updated, completed: true, alreadyCompleted: false };
  }
}
