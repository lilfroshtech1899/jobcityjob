/**
 * Monnify bank-transfer adapter – dynamic virtual accounts
 * Env: MONNIFY_API_KEY, MONNIFY_SECRET_KEY, MONNIFY_CONTRACT_CODE
 * Base: sandbox.monnify.com or api.monnify.com
 *
 * Monnify amounts are often in major units (Naira); we convert to/from kobo
 * at the boundary so PaymentService always uses minor units.
 */
const BASE = process.env.MONNIFY_BASE_URL || "https://sandbox.monnify.com";

export class MonnifyAdapter {
  get name() {
    return "monnify";
  }

  get #apiKey() {
    return process.env.MONNIFY_API_KEY || "";
  }
  get #secret() {
    return process.env.MONNIFY_SECRET_KEY || "";
  }
  get #contract() {
    return process.env.MONNIFY_CONTRACT_CODE || "";
  }

  async #token() {
    const basic = Buffer.from(this.#apiKey + ":" + this.#secret).toString("base64");
    const res = await fetch(BASE + "/api/v1/auth/login", {
      method: "POST",
      headers: { Authorization: "Basic " + basic }
    });
    const json = await res.json();
    const token = json.responseBody?.accessToken || json.responseBody?.token;
    if (!token) throw new Error("Monnify auth failed");
    return token;
  }

  async initialize({ reference, amountNGN, amountMinor, currency, email, metadata }) {
    if (!this.#apiKey || !this.#secret || !this.#contract) {
      return {
        provider: "monnify",
        mode: "config-missing",
        reference,
        amountNGN: amountNGN || amountMinor / 100,
        note: "Set MONNIFY_API_KEY, MONNIFY_SECRET_KEY, MONNIFY_CONTRACT_CODE",
        transfer: {
          bankName: "Configure Monnify",
          accountName: "Jobcityjob",
          accountNumber: "—",
          narration: reference
        }
      };
    }

    const token = await this.#token();
    const amountMajor = amountNGN != null ? amountNGN : amountMinor / 100;

    const initRes = await fetch(BASE + "/api/v1/merchant/transactions/init-transaction", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: amountMajor,
        customerEmail: email,
        paymentReference: reference,
        paymentDescription: "Jobcityjob contact unlock",
        currencyCode: currency || "NGN",
        contractCode: this.#contract,
        paymentMethods: ["ACCOUNT_TRANSFER"],
        redirectUrl: process.env.MONNIFY_REDIRECT_URL || "https://jobcityjob.app/",
        metadata: metadata || {}
      })
    });
    const initJson = await initRes.json();
    const body = initJson.responseBody || {};
    if (!initJson.requestSuccessful && initJson.responseCode !== "0") {
      throw new Error(initJson.responseMessage || "Monnify init failed");
    }

    let transfer = null;
    if (body.transactionReference) {
      try {
        const vaRes = await fetch(BASE + "/api/v1/merchant/bank-transfer/init-payment", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            transactionReference: body.transactionReference,
            bankCode: process.env.MONNIFY_VA_BANK_CODE || undefined
          })
        });
        const vaJson = await vaRes.json();
        const va = vaJson.responseBody || {};
        transfer = {
          accountNumber: va.accountNumber,
          accountName: va.accountName,
          bankName: va.bankName,
          expiresInSeconds: va.accountDurationSeconds || 2400,
          transactionReference: body.transactionReference
        };
      } catch (e) {
        console.warn("Monnify VA fetch failed", e.message);
      }
    }

    return {
      provider: "monnify",
      authorizationUrl: body.checkoutUrl || null,
      providerRef: body.transactionReference,
      transfer,
      publicKey: null
    };
  }

  async verify(reference) {
    if (!this.#apiKey || !this.#secret) {
      return { status: "pending", amountMinor: 0, currency: "NGN" };
    }
    const token = await this.#token();
    const url =
      BASE +
      "/api/v2/merchant/transactions/query?paymentReference=" +
      encodeURIComponent(reference);
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token }
    });
    const json = await res.json();
    const list = json.responseBody?.content || json.responseBody || [];
    const row = Array.isArray(list) ? list[0] : list;
    if (!row) return { status: "pending", amountMinor: 0, currency: "NGN" };

    const statusRaw = (row.paymentStatus || row.paymentStatusDescription || "").toUpperCase();
    const paid = statusRaw === "PAID" || statusRaw === "OVERPAID";
    const amountMajor = Number(row.amountPaid != null ? row.amountPaid : row.amount || 0);
    return {
      ok: paid,
      status: paid ? "success" : statusRaw === "PENDING" ? "pending" : "failed",
      amountMinor: Math.round(amountMajor * 100),
      currency: row.currencyCode || "NGN",
      providerRef: row.transactionReference
    };
  }

  async parseWebhook(headers, rawBody) {
    const crypto = await import("crypto");
    const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const sig =
      headers["monnify-signature"] ||
      headers["Monnify-Signature"] ||
      headers["monnify_signature"];
    if (this.#secret && sig) {
      // Common pattern: SHA512(secret + body) — confirm against current Monnify docs for your account
      const hash = crypto.createHash("sha512").update(this.#secret + body).digest("hex");
      if (hash !== sig && hash.toLowerCase() !== String(sig).toLowerCase()) {
        // Some integrations use HMAC; try HMAC-SHA512 as fallback
        const hmac = crypto.createHmac("sha512", this.#secret).update(body).digest("hex");
        if (hmac !== sig && hmac.toLowerCase() !== String(sig).toLowerCase()) {
          throw new Error("Invalid Monnify webhook signature");
        }
      }
    }
    const event = JSON.parse(body);
    const d = event.eventData || event.data || event;
    const ref = d.paymentReference || d.transactionReference;
    const statusRaw = String(d.paymentStatus || event.eventType || "").toUpperCase();
    const paid =
      statusRaw.includes("SUCCESS") ||
      statusRaw === "PAID" ||
      statusRaw.includes("PAYMENT_COMPLETION");
    if (!ref) return null;
    if (!paid && !statusRaw.includes("PAID")) return null;

    const amountMajor = Number(d.amountPaid != null ? d.amountPaid : d.amount || 0);
    return {
      reference: d.paymentReference || ref,
      status: "success",
      amountMinor: Math.round(amountMajor * 100),
      currency: d.currencyCode || "NGN",
      providerRef: d.transactionReference
    };
  }
}
