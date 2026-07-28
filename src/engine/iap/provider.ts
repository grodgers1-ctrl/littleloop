// IAP provider interface. The contract every provider implementation
// satisfies. Implemented in:
//   - iap/dev.ts    — development + V2.0 default
//   - iap/apple.ts  — V2.5, real App Store IAP (stub on Day 5)
//   - iap/google.ts — V2.5, real Google Play IAP (stub on Day 5)
//   - iap/stripe.ts — V2.5, real Stripe Checkout (stub on Day 5)

import type { IapProduct, PurchaseResult, UnlockState } from "../state";

export interface IapProvider {
  /** Returns whether the current platform supports this provider. The
   *  paywall hides options whose provider is unavailable. */
  isAvailable(): boolean;

  /** Begin purchase. Resolves when the user completes or cancels.
   *  Persists the receipt before resolving, so a subsequent `restore`
   *  returns the same unlock. */
  buy(product: IapProduct): Promise<PurchaseResult>;

  /** Re-fetch all known purchases from the store and resolve to the
   *  highest unlock tier found. Always succeeds; returns "free" when
   *  no purchases are found. */
  restore(): Promise<UnlockState>;

  /** Cached local read of the current unlock state. Fast path used
   *  on engine init. */
  getUnlock(): Promise<UnlockState>;
}

// Re-export the canonical PurchaseResult type so consumers can import
// from a single place.
export type { IapProduct, PurchaseResult, UnlockState };
