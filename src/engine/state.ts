// V2.0 + V2.5 engine state — the canonical type interfaces for Subject,
// Entry, UnlockState, IAP, Platform, Ads, Export, plus the V2.5
// notifications / transitions / filters / themes / EXIF shapes. These
// types are referenced by every other engine module. New code should
// import from here rather than redefining types locally.
//
// The V1 `Project` type still lives in `src/db/schema.ts` (marked
// @deprecated in V2.0, removed in V2.5). It is NOT re-exported here —
// engine code uses `Subject` only.
//
// V2.5 extensions are kept at the bottom of this file under a clearly
// labelled section so the V2.0 surface is easy to audit.

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
  /** Device fingerprint used to invalidate the unlock on a different
   *  device. Matches `deviceFingerprint()` in `iap/state.ts`. */
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

// ---------------------------------------------------------------------------
// V2.5 — Notifications, transitions, filters, themes, EXIF.
// These types are added in V2.5 and are gated on the Studio unlock where
// they affect exports. Notifications and EXIF are universal (no unlock).
// Pure types live here; the catalog / apply logic lives in the engine
// module directories (`src/engine/notifications/`, etc.) and is wired in
// on later days. Keeping the types here means the engine surface stays
// stable while the implementations land.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Notifications — daily / weekly local reminders. Universally available.
// ---------------------------------------------------------------------------

export type NotificationCadence = "off" | "daily" | "weekly";

export interface NotificationSchedule {
  /** Off / daily / weekly cadence. Default off. */
  cadence: NotificationCadence;
  /** Time-of-day in 24h `HH:MM`. Ignored when cadence is "off". */
  hour: number;
  /** Time-of-day minute `0..59`. Ignored when cadence is "off". */
  minute: number;
}

export type NotificationPermissionState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export interface NotificationState {
  /** Whether the current browser supports the Notification API. */
  permission: NotificationPermissionState;
  /** Persisted schedule. Defaults to off. */
  schedule: NotificationSchedule;
  /** ISO datetime of the next scheduled fire, or null if none. */
  nextDueAt: string | null;
  /** ISO datetime of the last tick the engine has fired (in-app banner
   *  layer reads this to surface "your recent reminder fired"). */
  lastFiredAt: string | null;
}

// ---------------------------------------------------------------------------
// Transitions — Studio unlock. The catalog is built on Day 7; the id
// union is locked here so the engine surface is stable.
// ---------------------------------------------------------------------------

export type TransitionId =
  | "none"
  | "crossfade"
  | "slide-left"
  | "slide-up"
  | "flip-3d"
  | "zoom-in";

export interface Transition {
  id: TransitionId;
  /** Human-readable label shown in the export sheet. */
  label: string;
  /** Whether this transition is a paid (Studio) feature. */
  studioOnly: boolean;
  /** Short description for the locked-with-upgrade card. */
  blurb: string;
}

// ---------------------------------------------------------------------------
// Filters — Studio unlock. Catalog builds on Day 7.
// ---------------------------------------------------------------------------

export type FilterId =
  | "none"
  | "warm"
  | "cool"
  | "bw"
  | "sepia"
  | "vignette"
  | "soft-focus"
  | "slight-grain";

export interface Filter {
  id: FilterId;
  label: string;
  studioOnly: boolean;
  blurb: string;
}

// ---------------------------------------------------------------------------
// Themes — Studio unlock. Each theme bundles a transition + a filter + a
// render speed. When a theme is selected, it overrides the per-export
// transition and filter.
// ---------------------------------------------------------------------------

export type ThemeId = "none" | "vintage" | "studio" | "memory" | "pop";

export interface Theme {
  id: ThemeId;
  label: string;
  studioOnly: boolean;
  /** Bundle members — resolved against the catalogs at apply time. */
  transition: TransitionId;
  filter: FilterId;
  /** A theme can also pin a render speed. */
  speed: RenderSpeed;
  blurb: string;
}

// ---------------------------------------------------------------------------
// ExportRequestV2 — V2.5 extension of `ExportRequest`. The V2.0 shape
// stays unchanged so existing V2 callers continue to compile and run.
// V2.5 export paths consume `ExportRequestV2`; the engine's `export()`
// method accepts the wider shape and the V2.0 export pipeline only
// reads the V2.0 fields it knows about.
// ---------------------------------------------------------------------------

export interface ExportRequestV2 extends ExportRequest {
  /** Studio-only. Applied between frames during encoding. */
  transition?: TransitionId;
  /** Studio-only. Applied to every frame. */
  filter?: FilterId;
  /** Studio-only. If set, overrides `transition` + `filter` + `speed`. */
  theme?: ThemeId;
}

// ---------------------------------------------------------------------------
// ScheduleOpts — input shape for `engine.scheduleNotifications()`.
// ---------------------------------------------------------------------------

export interface ScheduleOpts {
  cadence: NotificationCadence;
  /** ISO datetime of the user's last capture. Used to schedule the
   *  first reminder at or after the next cadence boundary. */
  lastCaptureAt: string | null;
  /** Time-of-day to fire. */
  hour: number;
  /** Time-of-day minute. */
  minute: number;
}
