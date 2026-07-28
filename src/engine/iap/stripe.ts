// Stripe Checkout IAP provider (web stub).
//
// V2.0: real Stripe Checkout is wired in V2.5 once the product SKUs
// are configured in the Stripe dashboard. For Day 5 this provider
// reports `isAvailable() === false` so the paywall renders "coming
// soon" on desktop.
//
// V2.5: the implementation redirects to a Stripe Checkout session
// and stores the signed token in localStorage per the V2_DEV_SPEC §
// 12 ("the signed unlock token in IndexedDB" — implementation detail
// may differ in practice).

import type {
  IapProduct,
  PurchaseResult,
  UnlockState,
} from "../state";
import type { IapProvider } from "./provider";

export function createStripeIapProvider(): IapProvider {
  return {
    isAvailable: (): boolean => {
      return false;
    },

    async buy(_product: IapProduct): Promise<PurchaseResult> {
      return { ok: false, reason: "unavailable" };
    },

    async restore(): Promise<UnlockState> {
      return "free";
    },

    async getUnlock(): Promise<UnlockState> {
      return "free";
    },
  };
}
