// Provider factories for the V2.0 engine boundary. Each factory
// returns the concrete implementation the engine consumes via
// the `IapProvider` / `Platform` / `AdProvider` interfaces.
//
// On Day 4 the dev IAP provider is wired (it simulates a real store
// end to end). The platform adapter and the ad provider remain
// Day 1 stubs; they land on Days 10–11 and Day 6 respectively.

import type { AdProvider, IapProvider, Platform } from "./engine";
import { createDevIapProvider } from "./iap/dev";
import { createAppleIapProvider } from "./iap/apple";
import { createGoogleIapProvider } from "./iap/google";
import { createStripeIapProvider } from "./iap/stripe";
import { readIapFeatureFlags } from "./feature-flags";
import { currentPlatform } from "./platform/detect";
import { createPlaceholderAdProvider } from "./ads/placeholder";
import { createBrowserPlatform } from "./platform/browser";

/** Create the IAP provider for the current build + platform.
 *
 *  Selection order:
 *    1. If any `VITE_IAP_*` flag is set, pick the corresponding
 *       provider (Apple / Google / Stripe). When multiple flags are
 *       set, the one matching the current platform wins; the others
 *       are ignored.
 *    2. If no flag is set, use the dev provider. In production builds
 *       the dev provider reports `isAvailable() === false`, so the
 *       paywall renders "coming soon".
 *
 *  Each real provider is currently a web stub on Day 5 that returns
 *  `unavailable`. The architecture is in place so V2.5 can flip the
 *  flag without code changes here. */
export function createIapProvider(): IapProvider {
  const flags = readIapFeatureFlags();
  const platform = currentPlatform().platform;

  if (flags.apple) {
    return createAppleIapProvider();
  }
  if (flags.google) {
    return createGoogleIapProvider();
  }
  if (flags.stripe) {
    return createStripeIapProvider();
  }

  // Fall back to the dev provider. Log the platform so dev sessions
  // make the selection visible.
  if (import.meta.env.DEV) {
    console.info(`[engine] IAP provider: dev (platform=${platform})`);
  }
  return createDevIapProvider();
}

/** Browser platform adapter. Day 10 implements camera-roll, Day 11
 *  implements share, Day 12 implements file-system. */
export function createPlatform(): Platform {
  return createBrowserPlatform();
}

/** Ad provider. Day 6 implements the placeholder banner with a
 *  30-minute frequency cap. */
export function createAdProvider(): AdProvider {
  return createPlaceholderAdProvider();
}
