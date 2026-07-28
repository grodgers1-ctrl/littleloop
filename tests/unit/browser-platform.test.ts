// Day 10 browser platform tests. saveToCameraRoll uses the download
// fallback in jsdom (no navigator.canShare). We verify the download
// is triggered by checking that a Blob URL is created and the anchor
// element is appended to the DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserPlatform } from "../../src/engine/platform/browser";

function makeMp4Blob(): Blob {
  return new Blob([new Uint8Array([0, 0, 0, 0])], { type: "video/mp4" });
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Ensure canShare is absent by default (jsdom doesn't have it).
  try {
    Object.defineProperty(navigator, "canShare", { value: undefined, writable: true, configurable: true });
  } catch { /* navigator may be frozen in some test envs */ }
  try {
    Object.defineProperty(navigator, "share", { value: undefined, writable: true, configurable: true });
  } catch { /* noop */ }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBrowserPlatform - saveToCameraRoll", () => {
  it("returns true via the download fallback when navigator.canShare is absent", async () => {
    // jsdom does not have navigator.canShare, so the fallback path runs.
    const platform = createBrowserPlatform();
    const blob = makeMp4Blob();
    const result = await platform.saveToCameraRoll(blob, "test.mp4");
    expect(result).toBe(true);
  });

  it("creates an anchor element and triggers the download", async () => {
    const platform = createBrowserPlatform();
    const blob = makeMp4Blob();
    const appendChild = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(Element.prototype, "remove");

    const result = await platform.saveToCameraRoll(blob, "test.mp4");
    expect(result).toBe(true);
    // An anchor was appended.
    expect(appendChild).toHaveBeenCalled();
    // And removed.
    expect(removeSpy).toHaveBeenCalled();
  });

  it("tries navigator.share when available and falls through on cancellation", async () => {
    // Simulate a browser that has canShare / share but the user cancels.
    const mockShare = vi.fn().mockRejectedValue(new DOMException("AbortError", "AbortError"));
    Object.defineProperty(navigator, "canShare", {
      value: () => true,
      writable: true,
    });
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
    });
    const platform = createBrowserPlatform();
    const blob = makeMp4Blob();
    const result = await platform.saveToCameraRoll(blob, "test.mp4");
    // Falls through to the download fallback, which returns true.
    expect(result).toBe(true);
    expect(mockShare).toHaveBeenCalled();
  });
});

describe("createBrowserPlatform - share", () => {
  it("returns unavailable when navigator.canShare is absent", async () => {
    const platform = createBrowserPlatform();
    const result = await platform.share(makeMp4Blob(), "test.mp4", {});
    expect(result).toEqual({ shared: false, reason: "unavailable" });
  });

  it("returns cancelled when the user cancels the share sheet", async () => {
    const mockShare = vi.fn().mockRejectedValue(new DOMException("AbortError", "AbortError"));
    Object.defineProperty(navigator, "canShare", {
      value: () => true,
      writable: true,
    });
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
    });
    const platform = createBrowserPlatform();
    const result = await platform.share(makeMp4Blob(), "test.mp4", {});
    expect(result).toEqual({ shared: false, reason: "cancelled" });
    expect(mockShare).toHaveBeenCalled();
  });
});

describe("createBrowserPlatform - saveToFiles", () => {
  it("triggers a download and returns true", async () => {
    const platform = createBrowserPlatform();
    const blob = makeMp4Blob();
    const appendChild = vi.spyOn(document.body, "appendChild");
    const result = await platform.saveToFiles(blob, "test.mp4", "video/mp4");
    expect(result).toBe(true);
    expect(appendChild).toHaveBeenCalled();
  });
});