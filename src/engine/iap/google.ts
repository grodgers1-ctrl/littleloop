// Google Play IAP provider (web stub).
//
// V2.0: web-only deployment. Play Billing requires the Play Billing
// client which is only available in the V3 Capacitor shell. On the
// web build this provider reports `isAvailable() === false` so the
// paywall renders "coming soon" for users on Android Chrome.
//
// V2.5: wired against Play Billing v6 via Capacitor. The V3 build
// swaps the implementation; the interface is identical.

import type {
  IapProduct,
  PurchaseResult,
  UnlockState,
} from "../state";
import type { IapProvider } from "./provider";
import { currentPlatform } from "../platform/detect";

export function createGoogleIapProvider(): IapProvider {
  return {
    isAvailable: (): boolean => {
      return false;
    },

    async buy(_product: IapProduct): Promise<PurchaseResult> {
      if (currentPlatform().platform !== "android") {
        return { ok: false, reason: "unavailable" };
      }
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
