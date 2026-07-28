// Platform detection for IAP provider selection. Reads navigator.userAgent
// (no DOM access beyond that — safe in Node test envs as long as we
// pass a stubbed userAgent when testing).

export type Platform = "ios" | "android" | "desktop";

export interface PlatformInfo {
  platform: Platform;
  /** Raw userAgent string. Useful for logging and tests. */
  userAgent: string;
}

/** Resolve the current platform from a userAgent string. Pure
 *  function so it can be tested without a DOM. */
export function detectPlatform(userAgent: string): Platform {
  // iPad on iOS 13+ reports as Mac. Detect touch-capable Macs as iOS
  // for IAP purposes — they run the same StoreKit APIs in WKWebView.
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // Touch-capable Macs (Safari 13+, iPad mode in Safari) — the spec
  // targets the App Store, but the V3 Capacitor build needs the
  // device classification. On V2.0 web we treat them as desktop.
  if (
    /Macintosh/i.test(userAgent) &&
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1
  ) {
    // We're a touch-capable Mac, but for the V2.0 web build the
    // IAP target is Stripe. V3 will use the native StoreKit.
    return "ios";
  }
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/** Detect the current platform from the runtime navigator. Falls back
 *  to a "desktop" result when navigator is unavailable (test envs). */
export function currentPlatform(): PlatformInfo {
  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent : "";
  return { platform: detectPlatform(ua), userAgent: ua };
}
