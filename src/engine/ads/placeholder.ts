// Ads module. V2.0 ships a placeholder banner. The architecture is
// real so V2.5 can drop in AdMob / Carbon / house ads without
// changing the engine boundary.
//
// The AdProvider interface is intentionally minimal:
//
//   - shouldShow(): returns whether the ad should be visible right now
//   - impression(): record that an ad was just shown (updates the
//     frequency cap)
//
// The banner DOM is rendered by `AdBanner.tsx` (a React component
// that subscribes to engine unlock state and the AdProvider). This
// file is pure: no DOM, no React.

import type { AdProvider } from "../engine";

const FREQUENCY_CAP_MS = 30 * 60 * 1000; // 30 minutes per spec

/** localStorage key for the last impression timestamp. */
const LAST_IMPRESSION_KEY = "ll.v2.ad.lastImpression";

function readLastImpression(): Date | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_IMPRESSION_KEY);
    if (!raw) return null;
    const ms = Number.parseInt(raw, 10);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms);
  } catch {
    return null;
  }
}

function writeLastImpression(now: Date): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_IMPRESSION_KEY, String(now.getTime()));
  } catch {
    /* storage may be unavailable; the cap is best-effort */
  }
}

export interface PlaceholderAdProviderOptions {
  /** Override the frequency cap for tests. Default 30 min. */
  frequencyCapMs?: number;
  /** Override the current time for tests. Default `new Date()`. */
  now?: () => Date;
}

/** Create the placeholder ad provider. */
export function createPlaceholderAdProvider(
  options: PlaceholderAdProviderOptions = {},
): AdProvider {
  const cap = options.frequencyCapMs ?? FREQUENCY_CAP_MS;
  const now = options.now ?? (() => new Date());

  return {
    shouldShow(): boolean {
      const last = readLastImpression();
      if (!last) return true;
      // Strict `>` so the ad is suppressed for the full window
      // length — at exactly `cap` ms it shows again.
      return now().getTime() - last.getTime() > cap;
    },

    impression(): void {
      writeLastImpression(now());
    },

    lastImpressionAt(): Date | null {
      return readLastImpression();
    },
  };
}

/** Test-only helper: clear the localStorage cap. */
export function __clearAdCapForTesting(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LAST_IMPRESSION_KEY);
  } catch {
    /* noop */
  }
}
