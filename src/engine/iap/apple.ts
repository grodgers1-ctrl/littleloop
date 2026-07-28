// Apple App Store IAP provider (web stub).
//
// V2.0: web-only deployment. App Store IAP requires StoreKit which is
// only available in the V3 Capacitor shell. On the web build this
// provider reports `isAvailable() === false` so the paywall renders
// "coming soon" for users on iOS Safari.
//
// V2.5: wired against StoreKit 2 via Capacitor. The V3 build swaps
// the implementation; the interface is identical.

import type {
  IapProduct,
  PurchaseResult,
  UnlockState,
} from "../state";
import type { IapProvider } from "./provider";
import { currentPlatform } from "../platform/detect";

export function createAppleIapProvider(): IapProvider {
  return {
    isAvailable: (): boolean => {
      // V2.0: web build, StoreKit unavailable. V2.5 will flip this
      // based on the Capacitor runtime.
      return false;
    },

    async buy(_product: IapProduct): Promise<PurchaseResult> {
      // V2.0 path: never reached because isAvailable() is false.
      // Defensive default in case a caller bypasses the gate.
      if (currentPlatform().platform !== "ios") {
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
