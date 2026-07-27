import { useEffect, useRef, useState } from "react";

// useObjectUrls: take a list of blobs (each tagged with a stable id)
// and get back a list of object URLs in the same order. The hook
// revokes any URL it previously handed out before issuing new ones,
// and revokes everything on unmount.
//
// Use this for thumbnail grids, preview strips, etc., so that the
// component author doesn't have to thread createObjectURL /
// revokeObjectURL calls through every useEffect.
//
// Inputs:
//   items: T[] of { id, blob } — `id` must be unique within the
//   list and stable across renders for a given blob. Items whose
//   blob is null/undefined are skipped (their URL will be null).
//
// Returns:
//   { urls, loading, error } — `urls` is parallel to `items`.

export interface ObjectUrlItem {
  id: string;
  blob: Blob | null | undefined;
}

export interface UseObjectUrlsResult<T extends ObjectUrlItem> {
  urls: Array<T & { url: string | null }>;
  loading: boolean;
  error: Error | null;
}

export function useObjectUrls<T extends ObjectUrlItem>(
  items: T[],
): UseObjectUrlsResult<T> {
  const [urls, setUrls] = useState<Array<T & { url: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Track URLs we have currently issued so we can revoke them on
  // the next render. Stored in a ref so revocations happen even
  // when React batches state updates.
  const live = useRef<Map<string, string>>(new Map());

  // A stable fingerprint based on (id, blob presence) so callers
  // can pass freshly-built item arrays without re-issuing URLs on
  // every render. The fingerprint string is the only dep.
  const fingerprint = items.map((i) => `${i.id}:${i.blob ? "1" : "0"}`).join("|");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Revoke URLs for ids that are no longer in the new list.
    const nextIds = new Set(items.map((i) => i.id));
    for (const [id, url] of live.current) {
      if (!nextIds.has(id)) {
        URL.revokeObjectURL(url);
        live.current.delete(id);
      }
    }

    const next: Array<T & { url: string | null }> = items.map((item) => {
      const existing = live.current.get(item.id);
      const itemBlob = item.blob;
      if (!itemBlob) {
        return { ...item, url: null };
      }
      // Re-use the existing URL only when the fingerprint hasn't
      // changed. The hook compares ids + blob presence only; if
      // the same id maps to a different blob reference the caller
      // should bump the id.
      if (existing) {
        return { ...item, url: existing };
      }
      const url = URL.createObjectURL(itemBlob);
      live.current.set(item.id, url);
      return { ...item, url };
    });

    if (cancelled) {
      // The component unmounted or inputs changed again — revoke
      // everything we just minted.
      next.forEach((n) => {
        if (n.url && live.current.get(n.id) === n.url) {
          URL.revokeObjectURL(n.url);
          live.current.delete(n.id);
        }
      });
      return;
    }

    setUrls(next);
    setLoading(false);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  // Final teardown on unmount.
  useEffect(() => {
    const issued = live.current;
    return () => {
      for (const url of issued.values()) {
        URL.revokeObjectURL(url);
      }
      issued.clear();
    };
  }, []);

  return { urls, loading, error };
}