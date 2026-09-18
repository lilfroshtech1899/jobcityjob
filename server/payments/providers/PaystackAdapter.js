/**
 * Paystack adapter – cards, transfer, USSD
 * Env: PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY
 * Amounts: kobo (minor units)
 */
const BASE = process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

export class PaystackAdapter {
  get name() {
    return "paystack";
  }

  get #secret() {
    return process.env.PAYSTACK_SECRET_KEY || "";
  }

  get #public() {
    return process.env.PAYSTACK_PUBLIC_KEY || "";
  }

  async initialize({ reference, amountMinor, currency, email, metadata }) {
    if (!this.#secret) {
      return {
        provider: "paystack",
        publicKey: this.#public || "pk_test_REPLACE",
        mode: "config-missing",
        reference,
        amountMinor,
        note: "Set PAYSTACK_SECRET_KEY to initialize live transactions"
      };
    }
    const res = await fetch(BASE + "/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.#secret,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reference,
        amount: amountMinor,
        currency: currency || "NGN",
        email,
        metadata
      })
    });
    const json = await res.json();
    if (!json.status) {
      throw new Error(json.message || "Paystack initialize failed");
    }
    return {
      provider: "paystack",
      publicKey: this.#public,
      accessCode: json.data.access_code,
      authorizationUrl: json.data.authorization_url,
      providerRef: json.data.reference
    };
  }

  async verify(reference) {
    if (!this.#secret) {
      return { status: "pending", amountMinor: 0, currency: "NGN" };
    }
    const res = await fetch(BASE + "/transaction/verify/" + encodeURIComponent(reference), {
      headers: { Authorization: "Bearer " + this.#secret }
    });
    const json = await res.json();
    const data = json.data || {};
    const ok = data.status === "success";
    return {
      ok,
      status: ok ? "success" : data.status === "abandoned" ? "cancelled" : "failed",
      amountMinor: data.amount || 0,
      currency: data.currency || "NGN",
      providerRef: data.id != null ? String(data.id) : reference
    };
  }

  async parseWebhook(headers, rawBody) {
    const crypto = await import("crypto");
    const secret = this.#secret;
    if (!secret) return null;
    const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const hash = crypto.createHmac("sha512", secret).update(body).digest("hex");
    const sig = headers["x-paystack-signature"] || headers["X-Paystack-Signature"];
    if (!sig || hash !== sig) {
      throw new Error("Invalid Paystack webhook signature");
    }
    const event = JSON.parse(body);
    if (event.event !== "charge.success") return null;
    const d = event.data || {};
    return {
      reference: d.reference,
      status: "success",
      amountMinor: d.amount,
      currency: d.currency,
      providerRef: d.id != null ? String(d.id) : undefined
    };
  }
}
