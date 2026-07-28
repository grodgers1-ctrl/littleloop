// Feature flag reading for IAP provider selection. Reads the
// `VITE_IAP_*` environment variables baked into the bundle at build
// time. Default false everywhere; the dev provider is the only active
// path on Day 4. Day 5 reads these flags when wiring the Apple /
// Google / Stripe stubs behind them.
//
// Exposed as a single helper so call sites can write:
//
//   const flags = readIapFeatureFlags();
//   if (flags.stripe) enableStripeProvider();
//
// rather than scattering `import.meta.env.VITE_*` reads across the
// engine layer.

export interface IapFeatureFlags {
  apple: boolean;
  google: boolean;
  stripe: boolean;
}

/** Read the IAP feature flags. Defaults to all-false, so the
 *  default behaviour on Day 4 is: dev provider in development,
 *  no providers in production (paywall shows "coming soon"). */
export function readIapFeatureFlags(env: ImportMetaEnv = import.meta.env): IapFeatureFlags {
  const toBool = (v: unknown): boolean => {
    if (v === true || v === "true" || v === "1") return true;
    if (v === false || v === "false" || v === "0" || v == null) return false;
    return Boolean(v);
  };
  return {
    apple: toBool(env.VITE_IAP_APPLE_ENABLED),
    google: toBool(env.VITE_IAP_GOOGLE_ENABLED),
    stripe: toBool(env.VITE_IAP_STRIPE_ENABLED),
  };
}
