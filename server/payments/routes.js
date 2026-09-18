/**
 * Express routes for Jobcityjob payments
 */
import { Router } from "express";
import { PaymentService } from "./PaymentService.js";
import { paymentStore } from "./store.js";
import { unlockContacts } from "./unlock.js";
import { createProviders } from "./providers/index.js";

const providers = createProviders();
const service = new PaymentService({
  store: paymentStore,
  providers,
  defaultProvider: process.env.PAYMENT_DEFAULT_PROVIDER || "manual",
  unlockContacts
});

export const paymentsRouter = Router();
export const webhooksRouter = Router();

paymentsRouter.post("/create", async (req, res) => {
  try {
    const { employerId, candidateIds, email, provider, metadata } = req.body || {};
    const result = await service.create({ employerId, candidateIds, email, provider, metadata });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

paymentsRouter.post("/verify", async (req, res) => {
  try {
    const { reference } = req.body || {};
    if (!reference) return res.status(400).json({ ok: false, error: "reference required" });
    const result = await service.verifyAndComplete(reference);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

paymentsRouter.post("/manual/confirm", async (req, res) => {
  try {
    const { reference, note } = req.body || {};
    if (process.env.ADMIN_CONFIRM_TOKEN && req.headers["x-admin-token"] !== process.env.ADMIN_CONFIRM_TOKEN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const result = await service.manualConfirm(reference, note);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

paymentsRouter.get("/:reference", async (req, res) => {
  const p = await paymentStore.findByReference(req.params.reference);
  if (!p) return res.status(404).json({ ok: false, error: "not found" });
  res.json({ ok: true, payment: p });
});

function makeWebhook(provider) {
  return async (req, res) => {
    try {
      const raw = req.rawBody != null ? req.rawBody : JSON.stringify(req.body || {});
      const result = await service.handleWebhook(provider, req.headers, raw);
      res.status(200).json({ ok: true, ...result });
    } catch (e) {
      console.error("webhook error", provider, e.message);
      res.status(400).json({ ok: false, error: e.message });
    }
  };
}

webhooksRouter.post("/paystack", makeWebhook("paystack"));
webhooksRouter.post("/monnify", makeWebhook("monnify"));

export { service as paymentService };
