// Auto-date assignment for the sandbox's multi-select import.
// Returns consecutive dates ending today, newest photo first.
//
// If today = 2026-07-26 and we get [photoA, photoB, photoC, photoD, photoE],
// the result is:
//   photoA -> 2026-07-26 (today)
//   photoB -> 2026-07-25
//   photoC -> 2026-07-24
//   photoD -> 2026-07-23
//   photoE -> 2026-07-22
//
// Dates are generated as YYYY-MM-DD strings and never repeat.

import { todayDateOnly, toDateOnly, parseDateOnly } from "./dates";

export const MAX_IMPORT_BATCH = 50;
export const MIN_PREVIEW_PHOTOS = 20;

export function assignConsecutiveDates(
  count: number,
  now: Date = new Date(),
): string[] {
  if (count <= 0) return [];
  const cap = Math.min(count, MAX_IMPORT_BATCH);
  const out: string[] = [];
  for (let i = 0; i < cap; i += 1) {
    const d = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - i,
    );
    out.push(toDateOnly(d));
  }
  return out;
}

export function isValidImportBatchSize(count: number): boolean {
  return count > 0 && count <= MAX_IMPORT_BATCH;
}

export function shouldShowPreviewCta(photoCount: number): boolean {
  return photoCount >= MIN_PREVIEW_PHOTOS;
}

// Re-export for callers that already import this module.
export { todayDateOnly, parseDateOnly };