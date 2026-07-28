// Provider factories for the V2.0 engine boundary. Each factory
// returns the concrete implementation the engine consumes via
// the `IapProvider` / `Platform` / `AdProvider` interfaces.
//
// On Day 4 the dev IAP provider is wired (it simulates a real store
// end to end). The platform adapter and the ad provider remain
// Day 1 stubs; they land on Days 10–11 and Day 6 respectively.

import type { AdProvider, IapProvider, Platform } from "./engine";
import { createDevIapProvider } from "./iap/dev";
import { readIapFeatureFlags } from "./feature-flags";

/** Create the IAP provider for the current build.
 *
 *  Day 4: dev provider, available iff `import.meta.env.DEV` and
 *    none of the `VITE_IAP_*` flags are set.
 *
 *  Day 5 (and later): the Apple / Google / Stripe stubs become
 *    selectable via `VITE_IAP_APPLE_ENABLED`, `VITE_IAP_GOOGLE_ENABLED`,
 *    and `VITE_IAP_STRIPE_ENABLED`. When any of those flags is true,
 *    the corresponding provider is returned (in priority order
 *    Apple > Google > Stripe). When all flags are false, the dev
 *    provider is the only option in development; production has no
 *    providers and the paywall renders "coming soon".
 *
 *  The day-5 selection logic intentionally lives here in the same
 *  factory so adding the real providers is a one-file change. */
export function createIapProvider(): IapProvider {
  const flags = readIapFeatureFlags();
  const anyFlag = flags.apple || flags.google || flags.stripe;
  if (anyFlag) {
    // Day 5 will instantiate the Apple/Google/Stripe stubs here.
    // For Day 4 we still return the dev provider so the architecture
    // is exercised end-to-end, but with `available: false` so the
    // paywall shows "coming soon".
    return createDevIapProvider({ available: false });
  }
  return createDevIapProvider();
}

/** Stub platform adapter. Day 10 implements camera-roll, Day 11
 *  implements share, Day 12 implements file-system. */
export function createBrowserPlatform(): Platform {
  return {
    share: (_blob: Blob, _filename: string, _options): Promise<{ shared: false; reason: "cancelled" | "unavailable" }> =>
      Promise.resolve({ shared: false, reason: "unavailable" }),
    saveToCameraRoll: (_blob: Blob, _filename: string): Promise<boolean> =>
      Promise.resolve(false),
    saveToFiles: (_blob: Blob, _filename: string, _mimeType: string): Promise<boolean> =>
      Promise.resolve(false),
    pickFile: (_accept: string): Promise<File | null> => Promise.resolve(null),
  };
}

/** Stub ad provider. Day 6 fills in the placeholder banner and the
 *  frequency cap. */
export function createPlaceholderAdProvider(): AdProvider {
  return {
    shouldShow: () => false,
    impression: () => {
      /* no-op */
    },
    lastImpressionAt: () => null,
  };
}
