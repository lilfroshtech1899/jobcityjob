/**
 * Jobcityjob – Email delivery & bounce webhooks
 *
 * Mount on your backend (Express example).
 * Supports common payload shapes from Resend, SendGrid, Amazon SES (SNS),
 * and a simple generic JSON format for testing.
 *
 * Env:
 *   RESEND_WEBHOOK_SECRET   – optional Svix/Resend signing secret
 *   SENDGRID_WEBHOOK_VERIFY – optional basic shared secret header
 *   JOBCITYJOB_API_SECRET      – protect admin list endpoint
 */

import "./load-env.js"; // load project-root .env (PAYSTACK/API secrets)

import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "email-events.json");

/** Persist events to a local JSON file (swap for Redis/Postgres in production) */
function loadEvents() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveEvents(events) {
  const trimmed = events.slice(0, 5000); // cap growth
  fs.writeFileSync(DATA_FILE, JSON.stringify(trimmed, null, 2));
}

function appendEvent(evt) {
  const events = loadEvents();
  events.unshift({
    id: evt.id || crypto.randomUUID(),
    at: evt.at || new Date().toISOString(),
    ...evt,
  });
  saveEvents(events);
  return events[0];
}

/** Normalize provider-specific payloads → Jobcityjob event */
function normalizeEvent(raw, source) {
  // --- Resend (email.* events) ---
  if (source === "resend" || raw?.type?.startsWith?.("email.")) {
    const type = String(raw.type || "");
    const data = raw.data || {};
    let status = "unknown";
    if (type.includes("bounced") || type.includes("failed")) status = "bounced";
    else if (type.includes("complained")) status = "complained";
    else if (type.includes("delivered")) status = "delivered";
    else if (type.includes("opened")) status = "opened";
    else if (type.includes("clicked")) status = "clicked";
    else if (type.includes("sent") || type.includes("delivery_delayed")) status = type.split(".").pop();

    const to = Array.isArray(data.to) ? data.to[0] : data.to || data.email;
    return {
      provider: "resend",
      status,
      email: to,
      messageId: data.email_id || data.id || raw.id,
      bounceType: data.bounce?.type || data.bounce_type || null,
      reason: data.bounce?.message || data.failed?.reason || data.reason || type,
      rawType: type,
    };
  }

  // --- SendGrid event array ---
  if (source === "sendgrid" || Array.isArray(raw)) {
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map((item) => {
      const ev = String(item.event || "").toLowerCase();
      let status = ev;
      if (ev === "bounce" || ev === "blocked" || ev === "dropped") status = "bounced";
      if (ev === "spamreport") status = "complained";
      return {
        provider: "sendgrid",
        status,
        email: item.email,
        messageId: item.sg_message_id || item["smtp-id"],
        bounceType: item.type || item.bounce_classification || null,
        reason: item.reason || item.response || ev,
        rawType: ev,
      };
    });
  }

  // --- Amazon SES via SNS ---
  if (source === "ses" || raw?.Type === "Notification" || raw?.notificationType) {
    let body = raw;
    if (typeof raw.Message === "string") {
      try {
        body = JSON.parse(raw.Message);
      } catch {
        body = raw;
      }
    }
    const nType = body.notificationType || body.eventType;
    const mail = body.mail || {};
    const bounce = body.bounce || {};
    const complaint = body.complaint || {};
    let status = "unknown";
    if (nType === "Bounce") status = "bounced";
    else if (nType === "Complaint") status = "complained";
    else if (nType === "Delivery") status = "delivered";

    const recipients =
      (bounce.bouncedRecipients || complaint.complainedRecipients || mail.destination || []).map(
        (r) => (typeof r === "string" ? r : r.emailAddress)
      );

    return recipients.map((email) => ({
      provider: "ses",
      status,
      email,
      messageId: mail.messageId,
      bounceType: bounce.bounceType || null,
      reason: bounce.bouncedRecipients?.[0]?.diagnosticCode || nType,
      rawType: nType,
    }));
  }

  // --- Generic Jobcityjob test payload ---
  // { "status": "bounced", "email": "a@b.com", "messageId": "...", "reason": "..." }
  if (raw?.email && raw?.status) {
    return {
      provider: raw.provider || "generic",
      status: String(raw.status).toLowerCase(),
      email: raw.email,
      messageId: raw.messageId || null,
      bounceType: raw.bounceType || null,
      reason: raw.reason || null,
      rawType: raw.status,
      candidateId: raw.candidateId || null,
      employerId: raw.employerId || null,
    };
  }

  return null;
}

function asArray(normalized) {
  if (!normalized) return [];
  return Array.isArray(normalized) ? normalized : [normalized];
}

/** Hard bounces & complaints → suppress future sends */
export function isSuppressed(email, events = loadEvents()) {
  const addr = String(email || "").toLowerCase().trim();
  return events.some(
    (e) =>
      String(e.email || "").toLowerCase() === addr &&
      (e.status === "bounced" || e.status === "complained") &&
      e.bounceType !== "Transient" // SES soft bounce
  );
}

export function createEmailWebhookRouter() {
  const router = express.Router();

  // Resend / generic JSON
  router.post("/webhooks/email/resend", express.json({ type: "*/*" }), (req, res) => {
    // Optional: verify Svix signature if RESEND_WEBHOOK_SECRET is set
    const events = asArray(normalizeEvent(req.body, "resend"));
    events.forEach((e) => appendEvent(e));
    res.status(200).json({ ok: true, accepted: events.length });
  });

  // SendGrid posts a JSON array
  router.post("/webhooks/email/sendgrid", express.json({ type: "*/*" }), (req, res) => {
    const events = asArray(normalizeEvent(req.body, "sendgrid"));
    events.forEach((e) => appendEvent(e));
    res.status(200).json({ ok: true, accepted: events.length });
  });

  // SES SNS (may be text/plain JSON)
  router.post(
    "/webhooks/email/ses",
    express.text({ type: "*/*" }),
    (req, res) => {
      let body = req.body;
      try {
        body = typeof body === "string" ? JSON.parse(body) : body;
      } catch {
        /* keep raw */
      }
      // SNS subscription handshake
      if (body?.Type === "SubscriptionConfirmation" && body.SubscribeURL) {
        console.log("SES SNS confirm URL:", body.SubscribeURL);
        // In production: fetch(body.SubscribeURL) to confirm
        return res.status(200).send("Confirm subscription manually or via fetch");
      }
      const events = asArray(normalizeEvent(body, "ses"));
      events.forEach((e) => appendEvent(e));
      res.status(200).json({ ok: true, accepted: events.length });
    }
  );

  // Generic test + multi-provider
  router.post("/webhooks/email", express.json(), (req, res) => {
    const events = asArray(normalizeEvent(req.body, req.body?.provider || "generic"));
    if (!events.length) {
      return res.status(400).json({ ok: false, error: "Unrecognized payload" });
    }
    const saved = events.map((e) => appendEvent(e));
    res.status(200).json({ ok: true, events: saved });
  });

  // List recent events (protect in production)
  router.get("/webhooks/email/events", (req, res) => {
    const secret = process.env.JOBCITYJOB_API_SECRET;
    if (secret && req.header("X-Jobcityjob-Key") !== secret) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    const status = req.query.status;
    let events = loadEvents();
    if (status) events = events.filter((e) => e.status === status);
    res.json({ ok: true, events: events.slice(0, 200) });
  });

  // Suppression check before send
  router.get("/webhooks/email/suppressed", (req, res) => {
    const email = req.query.email;
    if (!email) return res.status(400).json({ ok: false, error: "email required" });
    res.json({ ok: true, email, suppressed: isSuppressed(email) });
  });

  return router;
}

/** Guard to call before sendInterviewEmail */
export function assertNotSuppressed(email) {
  if (isSuppressed(email)) {
    const err = new Error("Recipient is suppressed due to bounce or complaint");
    err.code = "EMAIL_SUPPRESSED";
    throw err;
  }
}

// Standalone run: node server/email-webhooks.js
if (process.argv[1] && process.argv[1].includes("email-webhooks")) {
  const app = express();
  app.use(createEmailWebhookRouter());
  const port = process.env.PORT || 3002;
  app.listen(port, () => console.log(`Jobcityjob email webhooks on :${port}`));
}
