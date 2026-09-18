/**
 * Optional standalone payments API server
 *   node server/payments/index.js
 *
 * Uses only Node's built-in http module — no express dependency.
 * Exports `paymentService` so other programs can import the domain
 * service directly without spinning up the HTTP server.
 */
import "../load-env.js";

import http from "http";
import { PaymentService } from "./PaymentService.js";
import { paymentStore } from "./store.js";
import { unlockContacts } from "./unlock.js";
import { createProviders } from "./providers/index.js";

const service = new PaymentService({
  store: paymentStore,
  providers: createProviders(),
  defaultProvider: process.env.PAYMENT_DEFAULT_PROVIDER || "manual",
  unlockContacts
});

export { service as paymentService };

import { pathToFileURL } from "node:url";

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const port = Number(process.env.PAYMENTS_PORT || 3010);

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const readBody = () =>
    new Promise((resolve) => {
      let d = "";
      req.on("data", (c) => (d += c));
      req.on("end", () => {
        try {
          resolve(d ? JSON.parse(d) : {});
        } catch {
          resolve({});
        }
      });
    });

  try {
    if (req.method === "POST" && url.pathname === "/api/payments/create") {
      const body = await readBody();
      const result = await service.create(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...result }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/payments/verify") {
      const body = await readBody();
      const result = await service.verifyAndComplete(body.reference);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...result }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/payments/manual/confirm") {
      const body = await readBody();
      const result = await service.manualConfirm(body.reference, body.note);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...result }));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/payments/")) {
      const ref = decodeURIComponent(url.pathname.replace("/api/payments/", ""));
      const p = await paymentStore.findByReference(ref);
      res.writeHead(p ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(p ? { ok: true, payment: p } : { ok: false }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        service: "jobcityjob-payments",
        feeNGN: 100,
        endpoints: [
          "POST /api/payments/create",
          "POST /api/payments/verify",
          "POST /api/payments/manual/confirm",
          "GET /api/payments/:reference"
        ]
      })
    );
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});

if (isMain) {
  server.listen(port, () => {
    console.log("Jobcityjob payments API on http://127.0.0.1:" + port);
  });
}
