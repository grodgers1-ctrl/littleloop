import { describe, expect, it, beforeEach } from "vitest";
import {
  hasCompletedFirstExport,
  markFirstExportDone,
} from "../../src/features/export/first-export-flag";

// The flag helpers use localStorage. In jsdom each test gets a clean
// storage, so we exercise the round-trip in isolation.

describe("first-export-flag", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("hasCompletedFirstExport returns false on a fresh storage", () => {
    expect(hasCompletedFirstExport()).toBe(false);
  });

  it("markFirstExportDone persists across reads", () => {
    expect(hasCompletedFirstExport()).toBe(false);
    markFirstExportDone();
    expect(hasCompletedFirstExport()).toBe(true);
  });

  it("markFirstExportDone is idempotent", () => {
    markFirstExportDone();
    markFirstExportDone();
    expect(hasCompletedFirstExport()).toBe(true);
  });
});