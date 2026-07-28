// V2.0 engine state — the canonical type interfaces for Subject, Entry,
// UnlockState, IAP, Platform, Ads, Export. These types are referenced by
// every other engine module. New code in V2.0 should import from here
// rather than redefining types locally.
//
// The V1 `Project` type still lives in `src/db/schema.ts` (marked
// @deprecated in V2.0, removed in V2.5). It is NOT re-exported here —
// engine code uses `Subject` only.

import type { Cadence } from "../db/schema";

// ---------------------------------------------------------------------------
// Subject (replaces V1 `Project`). One per tracked entity. Unlimited count.
// ---------------------------------------------------------------------------

export const SUBJECT_TYPES = [
  "baby",
  "plant",
  "fitness",
  "recovery",
  "home",
  "creative",
  "pet",
  "other",
] as const;

export type SubjectType = (typeof SUBJECT_TYPES)[number];

export interface Subject {
  id: string;
  /** 1–60 chars, free text. */
  name: string;
  type: SubjectType;
  cadence: Cadence;
  /** Optional reference image blob id used for onion-skin on the first photo. */
  referenceImageBlobId?: string;
  /** ISO datetime. */
  createdAt: string;
  /** ISO datetime. */
  updatedAt: string;
  /** User-controlled ordering on the home screen. Lower = earlier. */
  sortIndex: number;
}

export interface CreateSubjectInput {
  name: string;
  type: SubjectType;
  cadence: Cadence;
  referenceImageBlobId?: string;
}

// ---------------------------------------------------------------------------
// Entry — V1 schema unchanged in shape, but `projectId` is renamed to
// `subjectId`. The migration on Day 2 does the rename in IndexedDB.
// ---------------------------------------------------------------------------

export interface Entry {
  id: string;
  /** Was `projectId` in V1. */
  subjectId: string;
  /** "YYYY-MM-DD" for daily OR Monday-of-week for weekly. */
  periodKey: string;
  /** YYYY-MM-DD — the date the photo represents. */
  capturedDate: string;
  imageBlobId: string;
  thumbnailBlobId: string;
  /** Optional free-form text, ≤280 chars. New in V2.0. */
  note: string;
  /** ISO datetime. */
  createdAt: string;
  /** ISO datetime. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// UnlockState — the user's paid tier. Free / Clean / Studio.
// ---------------------------------------------------------------------------

export type UnlockState = "free" | "clean" | "studio";

export interface Receipt {
  platform: "apple" | "google" | "stripe";
  token: string;
  product: "clean" | "studio";
  /** ISO datetime. */
  purchasedAt: string;
  /** ISO datetime. */
  lastValidatedAt: string;
}

export interface StoredUnlock extends Receipt {
  /** SHA-256 fingerprint of the device that made the purchase. Used to
   *  invalidate the unlock if the user reinstalls on a different device. */
  deviceFingerprint: string;
}

// ---------------------------------------------------------------------------
// IAP — purchase results and provider interface.
// ---------------------------------------------------------------------------

export type IapProduct = "clean" | "studio";

export type PurchaseResult =
  | { ok: true; unlock: UnlockState; receipt: Receipt }
  | { ok: false; reason: "cancelled" | "failed" | "unavailable" };

// ---------------------------------------------------------------------------
// Platform — share, camera-roll, file-system.
// ---------------------------------------------------------------------------

export interface ShareOptions {
  title?: string;
  text?: string;
}

export type ShareResult =
  | { shared: true }
  | { shared: false; reason: "cancelled" | "unavailable" };

// ---------------------------------------------------------------------------
// Ads — small banner on home screen for free users.
// ---------------------------------------------------------------------------

export type AdImpression = {
  /** ISO datetime. */
  shownAt: string;
};

// ---------------------------------------------------------------------------
// Export — request / result / progress types.
// ---------------------------------------------------------------------------

export type RenderSpeed = "fast" | "standard" | "slow";
/** Seconds per frame. The export orchestrator translates a speed label
 *  into a concrete framerate/duration pair. */
export const RENDER_SPEED_SECONDS: Record<RenderSpeed, number> = {
  fast: 0.25,
  standard: 0.5,
  slow: 0.8,
};

export type DateRangeKind = "all" | "this-month" | "custom";

export interface DateRange {
  kind: DateRangeKind;
  /** ISO date (YYYY-MM-DD). Set when kind === "custom". */
  from?: string;
  /** ISO date (YYYY-MM-DD). Set when kind === "custom". */
  to?: string;
}

export interface ExportRequest {
  subjectId: string;
  dateRange: DateRange;
  speed: RenderSpeed;
  /** Show the captured date on each frame. Default true. */
  showDate: boolean;
  /** Subject name override for filename. Defaults to subject.name. */
  filenameOverride?: string;
  /** Whether the engine should draw the watermark. Engine decides based
   *  on unlock state, but callers can force it off for the one-off bypass. */
  forceNoWatermark?: boolean;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  /** Total frames encoded. */
  frameCount: number;
  /** Wall-clock duration of the export, ms. */
  durationMs: number;
}

export type ExportPhase =
  | "idle"
  | "preparing"
  | "drawing"
  | "encoding"
  | "done"
  | "error";

export interface ExportProgress {
  phase: ExportPhase;
  /** 0..1 */
  ratio: number;
  /** Optional human-readable message for the progress UI. */
  message?: string;
}

// ---------------------------------------------------------------------------
// Engine events — subscribe via `engine.on(event, handler)`.
// ---------------------------------------------------------------------------

export type EngineEvent =
  | { type: "subjects-changed" }
  | { type: "unlock-changed"; unlock: UnlockState }
  | { type: "export-progress"; progress: ExportProgress }
  | { type: "ready" };

export type EngineEventName = EngineEvent["type"];
export type EngineEventHandler<E extends EngineEventName> = (
  payload: Extract<EngineEvent, { type: E }>,
) => void;

// ---------------------------------------------------------------------------
// Feature flags — read from import.meta.env at engine init.
// ---------------------------------------------------------------------------

export interface EngineFeatureFlags {
  /** Real Apple App Store IAP. Default false in V2.0. */
  iapAppleEnabled: boolean;
  /** Real Google Play IAP. Default false in V2.0. */
  iapGoogleEnabled: boolean;
  /** Real Stripe Checkout. Default false in V2.0. */
  iapStripeEnabled: boolean;
}
