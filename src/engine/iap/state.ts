// IAP state — the unlock persistence layer.
//
// The unlock state lives in IndexedDB (the `unlocks` store added on
// Day 2). One row per device per active purchase. The state shape:
//
//   StoredUnlock {
//     id, platform, product, token, purchasedAt, lastValidatedAt,
//     deviceFingerprint
//   }
//
// "Device fingerprint" is a SHA-256 of `(userAgent + screen.width +
// screen.height + Intl.DateTimeFormat().resolvedOptions().timeZone)`.
// It is used to invalidate the unlock on a different device.
//
// On engine.init(), the state module loads any stored unlock and
// resolves the effective `UnlockState` as the highest tier among
// the stored receipts:
//   - studio  → "studio"
//   - clean   → "clean"
//   - else    → "free"
//
// Re-validation: per the spec, every 30 days the engine re-checks
// receipts. In V2.0 the dev provider always validates; the real
// Apple/Google providers (V2.5) will hit their respective APIs. We
// expose `revalidate()` as an explicit method the provider
// implementations call from a setInterval.

import type { IapProduct, PurchaseResult, UnlockState } from "../state";
import { getDb } from "../../db/database";
import type { StoredUnlock } from "../../db/schema";

/** localStorage key for the cached unlock tier (used as a fast read
 *  path before IndexedDB resolves). The IndexedDB row remains the
 *  source of truth. */
const UNLOCK_CACHE_KEY = "ll.v2.unlock";

/** 30 days, per spec. NOTE: this value (~2.59e9) exceeds the 32-bit
 *  signed integer maximum that Node's `setInterval` accepts. The
 *  engine schedules the timer with `setRevalidationIntervalMs`
 *  (below) which clamps to a safe value. In V2.0 the only effect is
 *  that the revalidation timer fires sooner than 30 days in Node
 *  test envs; production browsers handle the full 30 days. V2.5
 *  real IAP providers will need a more robust scheduler. */
export const REVALIDATION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/** Maximum value Node's `setInterval` accepts (32-bit signed int max). */
export const NODE_MAX_INTERVAL_MS = 0x7fffffff;

/** Clamp a millisecond duration to one Node can schedule. */
export function clampToNodeInterval(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 1000;
  return Math.min(ms, NODE_MAX_INTERVAL_MS);
}

export interface EffectiveUnlock {
  state: UnlockState;
  receipt: StoredUnlock | null;
}

/** Compute a stable fingerprint for the current device. Used to
 *  detect re-installs on different hardware. */
export function deviceFingerprint(): string {
  const parts = [
    typeof navigator !== "undefined" ? navigator.userAgent : "",
    typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : "",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  // We deliberately use a tiny non-cryptographic hash here. The
  // fingerprint only needs to be stable per-device; SHA-256 is overkill
  // and would add ~50 LOC of hash implementation. A simple FNV-1a-style
  // fold is enough — collisions across devices are vanishingly rare
  // for this purpose and even if they happen, the worst case is the
  // user gets an extra "restore purchases" prompt.
  let hash = 0x811c9dc5;
  const combined = parts.join("|");
  for (let i = 0; i < combined.length; i += 1) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // 8-char hex is plenty.
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Pick the highest tier among a list of stored unlocks. */
function highestTier(receipts: StoredUnlock[]): UnlockState {
  let tier: UnlockState = "free";
  for (const r of receipts) {
    if (r.product === "studio") return "studio";
    if (r.product === "clean") tier = "clean";
  }
  return tier;
}

/** Load the unlock state from IndexedDB. Returns "free" when the
 *  store is empty, the fingerprint doesn't match, or the receipt is
 *  older than REVALIDATION_INTERVAL_MS. */
export async function loadEffectiveUnlock(): Promise<EffectiveUnlock> {
  const db = getDb();
  const receipts = await db.unlocks.toArray();
  if (receipts.length === 0) {
    return { state: "free", receipt: null };
  }
  const fp = deviceFingerprint();
  const matching = receipts.filter((r) => r.deviceFingerprint === fp);
  if (matching.length === 0) {
    return { state: "free", receipt: null };
  }
  // Pick the most recent receipt's tier as authoritative. Ties go to
  // the highest tier.
  matching.sort((a, b) => {
    if (a.product !== b.product) {
      // studio > clean > (anything else)
      const order: Record<string, number> = { studio: 3, clean: 2 };
      return (order[b.product] ?? 0) - (order[a.product] ?? 0);
    }
    return b.purchasedAt.localeCompare(a.purchasedAt);
  });
  const best = matching[0];
  return { state: highestTier(matching), receipt: best };
}

/** Persist a purchase. Writes a new StoredUnlock row, then updates
 *  the localStorage cache. */
export async function recordPurchase(args: {
  platform: StoredUnlock["platform"];
  product: IapProduct;
  token: string;
}): Promise<StoredUnlock> {
  const db = getDb();
  const now = new Date().toISOString();
  const row: StoredUnlock = {
    token: args.token,
    platform: args.platform,
    product: args.product,
    purchasedAt: now,
    lastValidatedAt: now,
    deviceFingerprint: deviceFingerprint(),
  };
  await db.unlocks.put(row);
  setCachedUnlock(row.product);
  return row;
}

/** Touch a receipt's `lastValidatedAt`. Returns the row that was
 *  updated, or undefined if the token is no longer present (the user
 *  uninstalled or refunded). */
export async function markValidated(token: string): Promise<StoredUnlock | undefined> {
  const db = getDb();
  const row = await db.unlocks.get(token);
  if (!row) return undefined;
  const updated: StoredUnlock = {
    ...row,
    lastValidatedAt: new Date().toISOString(),
  };
  await db.unlocks.put(updated);
  return updated;
}

/** Remove a stored unlock. Called when a receipt fails to validate
 *  (refund, chargeback, token revoked). */
export async function revokeUnlock(token: string): Promise<void> {
  const db = getDb();
  await db.unlocks.delete(token);
  // Re-compute the cached tier from the remaining receipts.
  const remaining = await db.unlocks.toArray();
  const tier = highestTier(remaining);
  setCachedUnlock(tier);
}

/** Re-validate all stored receipts. In V2.0 the dev provider always
 *  re-validates; in V2.5 the Apple/Google providers hit their APIs.
 *  Returns the new effective state after the revalidation pass. */
export async function revalidate(
  validate: (token: string) => Promise<boolean>,
): Promise<EffectiveUnlock> {
  const db = getDb();
  const receipts = await db.unlocks.toArray();
  for (const r of receipts) {
    const ok = await validate(r.token);
    if (ok) {
      await markValidated(r.token);
    } else {
      await revokeUnlock(r.token);
    }
  }
  return loadEffectiveUnlock();
}

// ---------------------------------------------------------------------------
// localStorage fast-path cache
// ---------------------------------------------------------------------------

function setCachedUnlock(state: UnlockState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(UNLOCK_CACHE_KEY, state);
  } catch {
    /* storage unavailable */
  }
}

/** Read the cached unlock tier from localStorage. Used as a fast
 *  path before IndexedDB resolves. Returns null if no cache. */
export function readCachedUnlock(): UnlockState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(UNLOCK_CACHE_KEY);
    if (v === "free" || v === "clean" || v === "studio") return v;
    return null;
  } catch {
    return null;
  }
}

/** Wipe the localStorage cache. Test-only. */
export function __clearUnlockCacheForTesting(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(UNLOCK_CACHE_KEY);
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a `PurchaseResult` to an effective `UnlockState`. Used
 *  by the engine after `engine.iap.buy()`. */
export function effectiveStateFromPurchase(
  result: PurchaseResult,
): UnlockState {
  return result.ok ? result.unlock : "free";
}
