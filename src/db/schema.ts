// Domain types for Little Loop. Single source of truth for the
// schema that is mirrored in IndexedDB via Dexie.
//
// V1: `Project` was the single tracked entity. V2: `Subject` replaces
// it; the user-visible label stays "Timeline". V1's `Project` type
// stays in this file (marked @deprecated) and is removed in V2.5.
//
// The V1→V2 migration on Day 2 copies `Project` rows into `Subject`
// rows in the same IDB transaction; the `Project` table itself stays
// so V1 callers (`getActiveProject`, the v1 export path) keep working
// unchanged. The V2 engine reads `Subject` for new code paths and
// `Project` for V1 code paths; the underlying IDs match.

import type { SubjectType } from "../engine/state";

// Re-export engine types so callers that already import from `db/schema`
// keep working. Engine code imports from `engine/state` directly; the
// db schema re-export is a convenience for V1-style callers that
// happen to need these types.
export type { SubjectType } from "../engine/state";

export type Cadence = "daily" | "weekly";

// ---------------------------------------------------------------------------
// V1 types — kept as @deprecated until V2.5 removes them.
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `Subject` from V2 onward. The V1 `Project` type is
 * retained so existing V1 callers (`getActiveProject`, the V1 export
 * path, the V1 backup service) compile unchanged through V2.0. It is
 * removed in V2.5.
 */
export interface Project {
  id: string;
  childName: string;
  dateOfBirth: string; // YYYY-MM-DD
  cadence: Cadence;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/**
 * V1 Entry. The `projectId` field is renamed conceptually to
 * `subjectId` in V2 but the column name is kept in V2.0 to avoid a
 * Dexie index rebuild in this sprint; new code reads `subjectId` via
 * a type alias below.
 */
export interface Entry {
  id: string;
  /** In V2 this is the subject id (the IDs match — see migration). */
  projectId: string;
  periodKey: string; // "YYYY-MM-DD" for daily OR Monday-of-week for weekly
  capturedDate: string; // YYYY-MM-DD (date the photo represents)
  imageBlobId: string;
  thumbnailBlobId: string;
  /**
   * Optional free-form text, ≤280 chars. Added in V2.0.
   * V1 rows persisted before the V2 migration do NOT have this field;
   * readers should treat `undefined` as `""` (empty string).
   */
  note?: string;
  /** ISO datetime. */
  createdAt: string;
  /** ISO datetime. */
  updatedAt: string;
}

export type AssetType = "image" | "thumbnail";

export interface Asset {
  id: string;
  projectId: string;
  type: AssetType;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  byteSize: number;
  blob: Blob;
  createdAt: string;
}

export interface EntryWithThumb extends Entry {
  thumbnailUrl: string;
}

export interface EntryWithImage extends EntryWithThumb {
  imageUrl: string;
}

export interface StorageStats {
  photoCount: number;
  bytesUsed: number;
}

// ---------------------------------------------------------------------------
// V2 types — new in V2.0.
// ---------------------------------------------------------------------------

/**
 * V2 Subject. The migration on Day 2 copies the V1 Project into a
 * Subject with the same id, `name = project.childName`,
 * `type = "baby"`, and `cadence = project.cadence`. The id is
 * preserved so existing entries stay linked via their `projectId`.
 */
export interface Subject {
  id: string;
  /** 1–60 chars, free text. Migrated from `Project.childName`. */
  name: string;
  type: SubjectType;
  cadence: Cadence;
  /** Optional reference image blob id (unused in V2.0; lands in V2.5). */
  referenceImageBlobId?: string;
  /** ISO datetime. */
  createdAt: string;
  /** ISO datetime. */
  updatedAt: string;
  /** User-controlled ordering on the home screen. Lower = earlier. */
  sortIndex: number;
}

/** Indexed unlock state. The token (per-receipt) is the primary key. */
export interface StoredUnlock {
  /** Receipt token — also the primary key. Unique per purchase. */
  token: string;
  platform: "apple" | "google" | "stripe";
  product: "clean" | "studio";
  /** ISO datetime. */
  purchasedAt: string;
  /** ISO datetime. */
  lastValidatedAt: string;
  /** SHA-256 fingerprint of the device that made the purchase. */
  deviceFingerprint: string;
}

/**
 * V2.5 — App-level key/value setting. Used for non-per-subject
 * preferences that don't warrant their own IndexedDB table.
 * V2.5 ships the notification schedule here; future settings
 * (default cadence, theme preference, etc.) can reuse the same
 * table without a schema migration.
 */
export interface AppSetting {
  /** The setting key (e.g. "v25.notifications.v1"). */
  key: string;
  /** The setting value. Typed as `unknown`; the consumer
   *  narrows to the expected shape. */
  value: unknown;
  /** ISO datetime of the last write. */
  updatedAt: string;
}
