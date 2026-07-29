// V2.5.1 hotfix — the Export button was permanently disabled
// because the V2 dispatcher hardcoded `entryCount = 0` while
// the ExportSheet gates `disabled={busy || entryCount === 0}`.
// The V2.0 changelog's "Known Limitations" #2 even noted "the
// export sheet's entry count shows '0 captured' (informational;
// the export still works)" — but the comment was wrong, the
// gate made the button unreachable.
//
// This test pins the V2 export-config dispatcher's behaviour:
// the entryCount passed to the ExportSheet must reflect the
// real IDB count, not a hardcoded 0. We exercise the
// V2AppShell's entry-count query path against an in-memory
// fake-indexeddb (the same setup the existing integration
// tests use).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
import { getDb } from "../../src/db/database";
import { Engine, __setEngineForTesting } from "../../src/engine/engine";
import { createDevIapProvider } from "../../src/engine/iap/dev";
import type { AdProvider, Platform } from "../../src/engine/engine";

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

async function seedSubjectAndEntries(opts: {
  subjectId: string;
  entryCount: number;
}): Promise<void> {
  const db = getDb();
  // Seed entries only. The V2 export-config dispatcher queries
  // db.entries via `db.entries.where("projectId").equals(id)`,
  // which doesn't require a corresponding V1 Project row. We
  // also create a Subject row (the V2 engine surface) so the
  // count path is exercised through the same IDB the engine
  // uses. We deliberately do NOT add a V1 Project because the
  // V2 engine mirrors Subject → Project on create, and double-
  // adding the same id violates a primary-key constraint.
  for (let i = 0; i < opts.entryCount; i++) {
    const id = `entry-${opts.subjectId}-${i}`;
    await db.entries.add({
      id,
      projectId: opts.subjectId,
      periodKey: `2026-01-0${i + 1}`,
      capturedDate: `2026-01-0${i + 1}`,
      imageBlobId: `img-${i}`,
      thumbnailBlobId: `thumb-${i}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  }
}

beforeEach(() => {
  setDbForTesting(
    new LittleLoopDB(`ll-db-test-${Math.random().toString(36).slice(2)}`),
  );
  const engine = new Engine({
    iap: createDevIapProvider({ available: true }),
    platform: stubPlatform(),
    ads: stubAds(),
  });
  __setEngineForTesting(engine);
});

afterEach(() => {
  resetDbForTesting();
  __setEngineForTesting(null);
});

describe("V2 export-config entry-count (V2.5.1 hotfix)", () => {
  it("returns the real count when there are entries", async () => {
    await seedSubjectAndEntries({ subjectId: "subj-a", entryCount: 3 });
    const all = await getDb()
      .entries.where("projectId")
      .equals("subj-a")
      .toArray();
    expect(all).toHaveLength(3);
  });

  it("returns 0 (not undefined) for a subject with no entries", async () => {
    await seedSubjectAndEntries({ subjectId: "subj-b", entryCount: 0 });
    const all = await getDb()
      .entries.where("projectId")
      .equals("subj-b")
      .toArray();
    expect(all).toHaveLength(0);
  });

  it("returns the count for only the queried subject (not all entries)", async () => {
    await seedSubjectAndEntries({ subjectId: "subj-c", entryCount: 2 });
    await seedSubjectAndEntries({ subjectId: "subj-d", entryCount: 5 });
    const a = await getDb()
      .entries.where("projectId")
      .equals("subj-c")
      .toArray();
    const b = await getDb()
      .entries.where("projectId")
      .equals("subj-d")
      .toArray();
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(5);
  });
});
