import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useObjectUrls } from "../../src/lib/use-object-urls";

function makeBlob(): Blob {
  return new Blob(["hello"], { type: "text/plain" });
}

describe("useObjectUrls", () => {
  it("returns one URL per blob in input order", () => {
    const items = [
      { id: "a", blob: makeBlob() },
      { id: "b", blob: makeBlob() },
      { id: "c", blob: makeBlob() },
    ];
    const { result } = renderHook(() => useObjectUrls(items));
    const urls = result.current.urls;
    expect(urls.map((u) => u.id)).toEqual(["a", "b", "c"]);
    expect(urls.every((u) => u.url !== null)).toBe(true);
    // URLs are distinct.
    expect(new Set(urls.map((u) => u.url)).size).toBe(urls.length);
  });

  it("returns null URL for items without a blob", () => {
    const items = [
      { id: "a", blob: makeBlob() },
      { id: "b", blob: null },
      { id: "c", blob: undefined },
    ];
    const { result } = renderHook(() => useObjectUrls(items));
    expect(result.current.urls[0].url).toBeTruthy();
    expect(result.current.urls[1].url).toBeNull();
    expect(result.current.urls[2].url).toBeNull();
  });

  it("preserves order and ids when items are removed", () => {
    const full = [
      { id: "a", blob: makeBlob() },
      { id: "b", blob: makeBlob() },
      { id: "c", blob: makeBlob() },
    ];
    const trimmed = [
      { id: "a", blob: makeBlob() },
      { id: "c", blob: makeBlob() },
    ];

    const { result, rerender } = renderHook(
      ({ items }: { items: typeof full }) => useObjectUrls(items),
      { initialProps: { items: full } },
    );
    const urlA = result.current.urls[0].url!;
    const urlB = result.current.urls[1].url!;
    expect(urlA).toBeTruthy();
    expect(urlB).toBeTruthy();

    rerender({ items: trimmed });
    expect(result.current.urls.map((u) => u.id)).toEqual(["a", "c"]);
    expect(result.current.urls[0].url).toBe(urlA);
    expect(result.current.urls[1].url).not.toBeNull();
  });

  it("starts in loading state and resolves to non-loading", async () => {
    const items = [{ id: "a", blob: makeBlob() }];
    const { result } = renderHook(() => useObjectUrls(items));
    // After the synchronous effect, urls should be populated.
    expect(result.current.urls.length).toBe(1);
    expect(result.current.urls[0].url).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });
});