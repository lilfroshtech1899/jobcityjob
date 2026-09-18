import { ManualAdapter } from "./ManualAdapter.js";
import { PaystackAdapter } from "./PaystackAdapter.js";
import { MonnifyAdapter } from "./MonnifyAdapter.js";

export function createProviders() {
  return {
    manual: new ManualAdapter(),
    paystack: new PaystackAdapter(),
    monnify: new MonnifyAdapter()
  };
}
