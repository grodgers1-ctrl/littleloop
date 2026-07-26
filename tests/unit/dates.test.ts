import { describe, expect, it } from "vitest";
import {
  ageAt,
  dailyPeriodKey,
  diffParts,
  formatAge,
  formatDateLong,
  formatWeekLabel,
  isFutureDate,
  isValidChildName,
  isValidDateOnly,
  parseDateOnly,
  startOfWeekMonday,
  toDateOnly,
  todayDateOnly,
  weeklyPeriodKey,
} from "../../src/lib/dates";

describe("date utilities", () => {
  describe("toDateOnly / parseDateOnly", () => {
    it("round-trips a local date", () => {
      const d = new Date(2025, 2, 14); // March 14, 2025
      expect(toDateOnly(d)).toBe("2025-03-14");
      const back = parseDateOnly("2025-03-14");
      expect(back.getFullYear()).toBe(2025);
      expect(back.getMonth()).toBe(2);
      expect(back.getDate()).toBe(14);
    });

    it("parses as local date (not UTC)", () => {
      // A date that would be the previous day in UTC but the same day locally.
      // Construct Jan 1 2025 00:00 LOCAL.
      const d = new Date(2025, 0, 1);
      expect(toDateOnly(d)).toBe("2025-01-01");
    });
  });

  describe("isValidDateOnly", () => {
    it("accepts well-formed dates", () => {
      expect(isValidDateOnly("2025-03-14")).toBe(true);
    });
    it("rejects garbage", () => {
      expect(isValidDateOnly("not a date")).toBe(false);
      expect(isValidDateOnly("2025-13-01")).toBe(false);
      expect(isValidDateOnly("2025-02-30")).toBe(false);
    });
  });

  describe("isFutureDate", () => {
    it("flags tomorrow as future", () => {
      const today = todayDateOnly();
      const tomorrow = toDateOnly(
        new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1),
      );
      expect(isFutureDate(tomorrow, new Date(today + "T00:00:00"))).toBe(true);
    });
    it("does not flag today", () => {
      const today = todayDateOnly();
      expect(isFutureDate(today)).toBe(false);
    });
  });

  describe("isValidChildName", () => {
    it("accepts reasonable names", () => {
      expect(isValidChildName("Ada")).toBe(true);
      expect(isValidChildName("  Ada  ")).toBe(true);
    });
    it("rejects empty or too long", () => {
      expect(isValidChildName("")).toBe(false);
      expect(isValidChildName("   ")).toBe(false);
      expect(isValidChildName("a".repeat(61))).toBe(false);
    });
  });

  describe("dailyPeriodKey", () => {
    it("returns the date string", () => {
      expect(dailyPeriodKey("2025-03-14")).toBe("2025-03-14");
    });
    it("throws on bad date", () => {
      expect(() => dailyPeriodKey("nope")).toThrow();
    });
  });

  describe("weeklyPeriodKey (Monday-anchored)", () => {
    it("returns same day for any Monday", () => {
      // 2025-03-10 is a Monday
      expect(weeklyPeriodKey("2025-03-10")).toBe("2025-03-10");
      // Sunday before next Monday should roll back
      expect(weeklyPeriodKey("2025-03-16")).toBe("2025-03-10");
      // Saturday in same week
      expect(weeklyPeriodKey("2025-03-15")).toBe("2025-03-10");
    });
    it("handles Sunday -> previous Monday", () => {
      // 2025-03-09 is a Sunday, belongs to week of 2025-03-03
      expect(weeklyPeriodKey("2025-03-09")).toBe("2025-03-03");
    });
    it("handles month boundary", () => {
      // 2025-04-01 is a Tuesday; week begins 2025-03-31 (Monday)
      expect(weeklyPeriodKey("2025-04-01")).toBe("2025-03-31");
    });
    it("handles year boundary", () => {
      // 2026-01-01 is a Thursday; week begins 2025-12-29 (Monday)
      expect(weeklyPeriodKey("2026-01-01")).toBe("2025-12-29");
    });
  });

  describe("startOfWeekMonday", () => {
    it("returns the Monday for a Wednesday", () => {
      // 2025-03-12 is Wednesday; Monday is 2025-03-10
      const wed = new Date(2025, 2, 12);
      const mon = startOfWeekMonday(wed);
      expect(mon.getDay()).toBe(1);
      expect(toDateOnly(mon)).toBe("2025-03-10");
    });
    it("returns the same day for a Monday", () => {
      const mon = new Date(2025, 2, 10);
      const result = startOfWeekMonday(mon);
      expect(toDateOnly(result)).toBe("2025-03-10");
    });
    it("rolls back a Sunday to the previous Monday", () => {
      const sun = new Date(2025, 2, 9); // Sunday
      const result = startOfWeekMonday(sun);
      expect(toDateOnly(result)).toBe("2025-03-03");
    });
  });

  describe("ageAt + formatAge", () => {
    it("computes age at capture for a newborn", () => {
      const parts = ageAt("2025-03-14", "2025-03-14");
      expect(parts.days).toBe(0);
      expect(parts.weeks).toBe(0);
      expect(formatAge(parts)).toBe("0 days old");
    });
    it("computes age for 1 day old", () => {
      const parts = ageAt("2025-03-15", "2025-03-14");
      expect(formatAge(parts)).toBe("1 day old");
    });
    it("computes age in weeks for a 3-week-old", () => {
      const parts = ageAt("2025-04-04", "2025-03-14");
      expect(parts.weeks).toBe(3);
      expect(formatAge(parts)).toMatch(/3 weeks old/);
    });
    it("computes age in months at month boundary", () => {
      const parts = ageAt("2025-09-14", "2025-03-14");
      expect(parts.months).toBe(6);
      expect(formatAge(parts)).toMatch(/6 months old/);
    });
    it("computes age in years and months past first birthday", () => {
      const parts = ageAt("2027-05-14", "2025-03-14");
      // 2 years, 2 months
      expect(parts.years).toBe(2);
      expect(parts.months).toBe(2);
      expect(formatAge(parts)).toMatch(/2 years, 2 months old/);
    });
  });

  describe("diffParts edge cases", () => {
    it("treats equal dates as zero", () => {
      const d = new Date(2025, 0, 1);
      expect(diffParts(d, d)).toEqual({ years: 0, months: 0, weeks: 0, days: 0 });
    });
    it("treats reversed dates as zero (defensive)", () => {
        // from > to → defensive zero (no negative ages)
        const a = new Date(2025, 0, 1); // later
        const b = new Date(2024, 11, 31); // earlier
        expect(diffParts(a, b)).toEqual({ years: 0, months: 0, weeks: 0, days: 0 });
      });
      it("computes forward 1-day diff correctly", () => {
        const a = new Date(2024, 11, 31); // from
        const b = new Date(2025, 0, 1); // to
        expect(diffParts(a, b).days).toBe(1);
      });
  });

  describe("formatDateLong / formatWeekLabel", () => {
    it("formats 14 March 2025", () => {
      expect(formatDateLong("2025-03-14")).toBe("14 March 2025");
    });
    it("prefixes Week of", () => {
      expect(formatWeekLabel("2025-03-10")).toBe("Week of 10 March 2025");
    });
  });
});