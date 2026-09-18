/**
 * Manual bank transfer – admin confirms (matches current Jobcityjob admin button)
 */
export class ManualAdapter {
  get name() {
    return "manual";
  }

  async initialize({ reference, amountNGN }) {
    const bank = {
      bankName: process.env.MANUAL_BANK_NAME || "Set in admin bank details",
      accountName: process.env.MANUAL_ACCOUNT_NAME || "Jobcityjob",
      accountNumber: process.env.MANUAL_ACCOUNT_NUMBER || "0000000000",
      amountNGN,
      narration: reference,
      note: "Employee contacts are released only after admin confirms payment."
    };
    return {
      provider: "manual",
      publicKey: null,
      authorizationUrl: null,
      transfer: bank
    };
  }

  async verify() {
    return { status: "pending", amountMinor: 0, currency: "NGN" };
  }

  async parseWebhook() {
    return null;
  }
}
