// V2.5 Day 5 — "On this day" memory lane.
//
// The pure selector `findOnThisDayEntries` is the testable core:
// given a list of entries, today, and a pinned "now" date,
// return up to `max` matching entries sorted by recency.
//
// The hook (useOnThisDay) is exercised in the integration test
// below via the same selector against a seeded IDB.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findOnThisDayEntries,
  useOnThisDay,
} from "../../src/features/memory-lane/useOnThisDay";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
import { getDb } from "../../src/db/database";
import { renderHook, waitFor } from "@testing-library/react";
import { Engine, __setEngineForTesting } from "../../src/engine/engine";
import { createDevIapProvider } from "../../src/engine/iap/dev";
import type { AdProvider, Platform } from "../../src/engine/engine";
import type { Entry } from "../../src/db/schema";

function stubPlatform(): Platform {
  return {
    share: () => Promise.resolve({ shared: false, reason: "unavailable" }),
    saveToCameraRoll: () => Promise.resolve(false),
    saveToFiles: () => Promise.resolve(false),
    pickFile: () => Promise.resolve(null),
  };
}
function stubAds(): AdProvider {
  return {
    shouldShow: () => false,
    impression: () => {},
    lastImpressionAt: () => null,
  };
}

function entry(id: string, capturedDate: string): Entry {
  return {
    id,
    projectId: "subj_a",
    periodKey: capturedDate,
    capturedDate,
    imageBlobId: `img_${id}`,
    thumbnailBlobId: `thumb_${id}`,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  setDbForTesting(new LittleLoopDB(`ll-db-test-${Math.random().toString(36).slice(2)}`));
});

afterEach(() => {
  resetDbForTesting();
  __setEngineForTesting(null);
});

describe("findOnThisDayEntries (pure selector)", () => {
  it("returns no matches when the input list is empty", () => {
    expect(findOnThisDayEntries([], "2026-06-15", new Date("2026-06-15"))).toEqual(
      [],
    );
  });

  it("returns no matches when no entry shares the day-month", () => {
    const list = [entry("e1", "2025-01-01"), entry("e2", "2025-12-25")];
    expect(
      findOnThisDayEntries(list, "2026-06-15", new Date("2026-06-15")),
    ).toEqual([]);
  });

  it("matches an entry from exactly 1 year ago", () => {
    const list = [entry("e1", "2025-06-15")];
    const r = findOnThisDayEntries(list, "2026-06-15", new Date("2026-06-15"));
    expect(r).toHaveLength(1);
    expect(r[0].entry.id).toBe("e1");
    expect(r[0].yearsAgo).toBe(1);
  });

  it("matches an entry from 3 years ago and reports yearsAgo=3", () => {
    const list = [entry("e1", "2023-06-15")];
    const r = findOnThisDayEntries(list, "2026-06-15", new Date("2026-06-15"));
    expect(r).toHaveLength(1);
    expect(r[0].yearsAgo).toBe(3);
  });

  it("does NOT match an entry from the same year", () => {
    const list = [entry("e1", "2026-06-15")];
    expect(
      findOnThisDayEntries(list, "2026-06-15", new Date("2026-06-15")),
    ).toEqual([]);
  });

  it("sorts matches by yearsAgo ascending (most recent first)", () => {
    const list = [
      entry("e3", "2023-06-15"),
      entry("e1", "2025-06-15"),
      entry("e2", "2024-06-15"),
    ];
    const r = findOnThisDayEntries(list, "2026-06-15", new Date("2026-06-15"));
    expect(r.map((m) => m.entry.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("caps the result at `max` (default 3)", () => {
    const list = [
      entry("e1", "2025-06-15"),
      entry("e2", "2024-06-15"),
      entry("e3", "2023-06-15"),
      entry("e4", "2022-06-15"),
    ];
    const r = findOnThisDayEntries(list, "2026-06-15", new Date("2026-06-15"), 2);
    expect(r).toHaveLength(2);
    expect(r.map((m) => m.entry.id)).toEqual(["e1", "e2"]);
  });

  it("handles leap-day matches on a leap year", () => {
    const list = [entry("e1", "2024-02-29")];
    const r = findOnThisDayEntries(list, "2028-02-29", new Date("2028-02-29"));
    // 2028 is a leap year. The selector matches on day-month
    // (Feb 29), so the 2024 entry should match.
    expect(r).toHaveLength(1);
    expect(r[0].yearsAgo).toBe(4);
  });
});

describe("useOnThisDay (integration with IDB)", () => {
  it("queries IDB across subjects and returns matching entries", async () => {
    const db = getDb();
    const now = "2026-06-15";
    await db.entries.bulkAdd([
      { ...entry("e1", "2025-06-15"), projectId: "subj_a" },
      { ...entry("e2", "2024-06-15"), projectId: "subj_a" },
      { ...entry("e3", "2025-06-16"), projectId: "subj_b" },
    ]);
    // The engine only needs to exist for the hook; we don't
    // exercise the unlock / IAP paths here.
    const engine = new Engine({
      iap: createDevIapProvider({ available: true }),
      platform: stubPlatform(),
      ads: stubAds(),
    });
    __setEngineForTesting(engine);
    const { result } = renderHook(() => useOnThisDay(now));
    await waitFor(() => expect(result.current.length).toBe(2));
    expect(result.current[0].entry.id).toBe("e1");
    expect(result.current[1].entry.id).toBe("e2");
  });
});
