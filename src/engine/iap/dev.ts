// Dev IAP provider. Used in development and in production builds
// where real IAP is feature-flagged off (V2.0 default).
//
// The dev provider simulates a real store by immediately returning a
// valid receipt for the requested product. There is no charge. The
// receipt is persisted via `iap/state.ts` exactly as a real receipt
// would be, so the rest of the engine treats it identically.
//
// The dev provider is "available" in dev mode only. In production
// (import.meta.env.PROD), it returns `isAvailable() === false` and
// the paywall renders "coming soon" — which is the desired V2.0
// behaviour for users on the live site.

import type {
  IapProduct,
  PurchaseResult,
  Receipt,
  UnlockState,
} from "../state";
import type { IapProvider } from "./provider";
import { getDb } from "../../db/database";
import {
  loadEffectiveUnlock,
  recordPurchase,
  revokeUnlock,
} from "./state";

/** Resolve a product to its tier. "studio" is higher than "clean",
 *  so buying Studio effectively grants both. */
function tierForProduct(product: IapProduct): UnlockState {
  return product === "studio" ? "studio" : "clean";
}

/** Generate a stable, readable token for dev receipts. Real receipts
 *  use store-issued tokens; dev tokens are self-issued so they're
 *  distinguishable from anything that might come from a future real
 *  provider in a mixed environment. */
function devToken(product: IapProduct): string {
  return `dev_${product}_${crypto.randomUUID()}`;
}

export interface CreateDevIapProviderOptions {
  /** Set to false to force the dev provider to be unavailable even in
   *  dev mode. Useful for the Day 4 / Day 5 cutover where the paywall
   *  needs to show "coming soon" while the wiring lands. */
  available?: boolean;
}

/** Create the dev IAP provider. */
export function createDevIapProvider(
  options: CreateDevIapProviderOptions = {},
): IapProvider {
  const available = options.available ?? import.meta.env.DEV;
  return {
    isAvailable: () => available,

    async buy(product: IapProduct): Promise<PurchaseResult> {
      if (!available) {
        return { ok: false, reason: "unavailable" };
      }
      const now = new Date().toISOString();
      const receipt: Receipt = {
        platform: "stripe", // dev receipts are tagged as stripe for now;
                            // they never hit Stripe.
        token: devToken(product),
        product,
        purchasedAt: now,
        lastValidatedAt: now,
      };
      // Persist via the same state module a real provider would use.
      // recordPurchase adds the device fingerprint internally.
      await recordPurchase({
        platform: "stripe",
        product,
        token: receipt.token,
      });
      return { ok: true, unlock: tierForProduct(product), receipt };
    },

    async restore(): Promise<UnlockState> {
      // Re-load the effective state from IndexedDB. Dev receipts are
      // always valid — there's no remote service to call. This mirrors
      // the post-restore UX for real providers: revalidation succeeds.
      const effective = await loadEffectiveUnlock();
      return effective.state;
    },

    async getUnlock(): Promise<UnlockState> {
      const effective = await loadEffectiveUnlock();
      return effective.state;
    },
  };
}

/** Test-only helper. Wipes all stored unlocks. */
export async function __clearDevUnlocksForTesting(): Promise<void> {
  const db = getDb();
  // Delete each row by token so we don't depend on bulk-delete being
  // wired identically across Dexie versions.
  const all = await db.unlocks.toArray();
  for (const row of all) {
    await revokeUnlock(row.token);
  }
}
