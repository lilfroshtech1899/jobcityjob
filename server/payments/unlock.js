/**
 * Bridge: when payment succeeds, unlock contacts for employer.
 * Production: write to your real DB / notify the SPA via API.
 * Demo: appends a JSON event file the admin tools can inspect.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS = process.env.UNLOCK_EVENTS_FILE || path.join(__dirname, "unlock-events.json");

export async function unlockContacts(payment) {
  if (!payment || payment.status !== "success") {
    throw new Error("Cannot unlock: payment not successful");
  }
  const event = {
    at: new Date().toISOString(),
    paymentId: payment.id,
    reference: payment.reference,
    employerId: payment.employerId,
    candidateIds: payment.candidateIds || [],
    amountNGN: payment.amountNGN,
    provider: payment.provider
  };
  let all = [];
  try {
    if (fs.existsSync(EVENTS)) all = JSON.parse(fs.readFileSync(EVENTS, "utf8"));
  } catch (_) {}
  // idempotent: skip if same paymentId already unlocked
  if (all.some((e) => e.paymentId === payment.id)) {
    return { ok: true, already: true, event };
  }
  all.push(event);
  fs.writeFileSync(EVENTS, JSON.stringify(all, null, 2));
  console.log("[Jobcityjob] Contacts unlocked for", payment.employerId, "refs", payment.candidateIds);
  return { ok: true, already: false, event };
}
