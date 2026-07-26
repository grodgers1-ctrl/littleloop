import { describe, expect, it } from "vitest";
import {
  assignConsecutiveDates,
  isValidImportBatchSize,
  MAX_IMPORT_BATCH,
  MIN_PREVIEW_PHOTOS,
  shouldShowPreviewCta,
} from "../../src/lib/auto-dates";

describe("auto-dates", () => {
  describe("assignConsecutiveDates", () => {
    it("returns an empty array for count <= 0", () => {
      expect(assignConsecutiveDates(0)).toEqual([]);
      expect(assignConsecutiveDates(-3)).toEqual([]);
    });

    it("returns one date when count = 1", () => {
      const out = assignConsecutiveDates(1, new Date(2026, 6, 26));
      expect(out).toEqual(["2026-07-26"]);
    });

    it("assigns consecutive dates ending today, newest first", () => {
      const out = assignConsecutiveDates(
        5,
        new Date(2026, 6, 26), // 26 July 2026
      );
      expect(out).toEqual([
        "2026-07-26",
        "2026-07-25",
        "2026-07-24",
        "2026-07-23",
        "2026-07-22",
      ]);
    });

    it("handles month boundaries", () => {
      const out = assignConsecutiveDates(
        3,
        new Date(2026, 6, 1), // 1 July 2026
      );
      expect(out).toEqual([
        "2026-07-01",
        "2026-06-30",
        "2026-06-29",
      ]);
    });

    it("handles year boundaries", () => {
      const out = assignConsecutiveDates(
        3,
        new Date(2026, 0, 1), // 1 January 2026
      );
      expect(out).toEqual([
        "2026-01-01",
        "2025-12-31",
        "2025-12-30",
      ]);
    });

    it("handles leap year rollover", () => {
      const out = assignConsecutiveDates(
        3,
        new Date(2024, 2, 1), // 1 March 2024 — Feb 2024 had 29 days
      );
      expect(out).toEqual([
        "2024-03-01",
        "2024-02-29",
        "2024-02-28",
      ]);
    });

    it("caps at MAX_IMPORT_BATCH", () => {
      const out = assignConsecutiveDates(500, new Date(2026, 6, 26));
      expect(out).toHaveLength(MAX_IMPORT_BATCH);
      expect(out[0]).toBe("2026-07-26");
    });

    it("never produces duplicates within a single batch", () => {
      const out = assignConsecutiveDates(10, new Date(2026, 6, 26));
      expect(new Set(out).size).toBe(out.length);
    });
  });

  describe("isValidImportBatchSize", () => {
    it("accepts positive counts within the cap", () => {
      expect(isValidImportBatchSize(1)).toBe(true);
      expect(isValidImportBatchSize(20)).toBe(true);
      expect(isValidImportBatchSize(MAX_IMPORT_BATCH)).toBe(true);
    });
    it("rejects zero or negative", () => {
      expect(isValidImportBatchSize(0)).toBe(false);
      expect(isValidImportBatchSize(-5)).toBe(false);
    });
    it("rejects counts above the cap", () => {
      expect(isValidImportBatchSize(MAX_IMPORT_BATCH + 1)).toBe(false);
    });
  });

  describe("shouldShowPreviewCta", () => {
    it("hides the CTA below the minimum", () => {
      expect(shouldShowPreviewCta(0)).toBe(false);
      expect(shouldShowPreviewCta(3)).toBe(false);
      expect(shouldShowPreviewCta(MIN_PREVIEW_PHOTOS - 1)).toBe(false);
    });
    it("shows the CTA at and above the minimum", () => {
      expect(shouldShowPreviewCta(MIN_PREVIEW_PHOTOS)).toBe(true);
      expect(shouldShowPreviewCta(MIN_PREVIEW_PHOTOS + 5)).toBe(true);
      expect(shouldShowPreviewCta(100)).toBe(true);
    });
    it("MIN_PREVIEW_PHOTOS is the meaningful threshold we locked", () => {
      expect(MIN_PREVIEW_PHOTOS).toBe(20);
    });
  });
});