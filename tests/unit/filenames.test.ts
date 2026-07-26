import { describe, expect, it } from "vitest";
import {
  backupFilename,
  flipbookFilename,
  sanitizeFilename,
} from "../../src/lib/filenames";

describe("sanitizeFilename", () => {
  it("removes forbidden characters", () => {
    expect(sanitizeFilename("a/b\\c:d*e?f\"g<h>i|j")).toBe("abcdefghij");
  });
  it("collapses whitespace and dashes", () => {
    expect(sanitizeFilename("  hello   world  --")).toBe("hello-world");
  });
  it("returns 'timeline' for empty input", () => {
    expect(sanitizeFilename("")).toBe("timeline");
    expect(sanitizeFilename("////")).toBe("timeline");
  });
  it("truncates to 60 chars", () => {
    expect(sanitizeFilename("a".repeat(100)).length).toBe(60);
  });
});

describe("flipbookFilename", () => {
  it("uses predictable pattern", () => {
    expect(flipbookFilename("Ada", "2026-03-14")).toBe("Ada-flipbook-2026-03-14.mp4");
  });
  it("sanitizes unsafe names", () => {
    expect(flipbookFilename("Ada/Bob", "2026-03-14")).toBe(
      "AdaBob-flipbook-2026-03-14.mp4",
    );
  });
});

describe("backupFilename", () => {
  it("uses .babyflip extension", () => {
    expect(backupFilename("Ada", "2026-03-14")).toBe(
      "Ada-timeline-backup-2026-03-14.babyflip",
    );
  });
});