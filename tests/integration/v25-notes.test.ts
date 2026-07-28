// V2.5 Day 2 — per-entry notes engine + repository wiring.
//
// The engine's `setEntryNote` method is the V2.5 surface; the
// repository's `setEntryNote` is the IDB write. This file covers:
//   - Repository: writes the trimmed note, updates updatedAt,
//     rejects entries longer than 280 chars, throws on missing entry.
//   - Engine: maps the V1 Entry returned by the repository to the
//     V2 Entry shape (subjectId) and forwards the cap check.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Engine, __setEngineForTesting } from "../../src/engine/engine";
import {
  ENTRY_NOTE_MAX_LENGTH,
  setEntryNote as repoSetEntryNote,
} from "../../src/db/repositories";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
import { createDevIapProvider } from "../../src/engine/iap/dev";
import type { AdProvider, Platform } from "../../src/engine/engine";
import { getDb } from "../../src/db/database";

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

function freshEngine(): Engine {
  const engine = new Engine({
    iap: createDevIapProvider({ available: true }),
    platform: stubPlatform(),
    ads: stubAds(),
  });
  __setEngineForTesting(engine);
  return engine;
}

async function seedEntry(note?: string): Promise<string> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = "entry_seed_1";
  await db.entries.put({
    id,
    projectId: "subj_seed",
    periodKey: "2026-01-01",
    capturedDate: "2026-01-01",
    imageBlobId: "asset_x",
    thumbnailBlobId: "asset_t",
    note,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

beforeEach(() => {
  setDbForTesting(new LittleLoopDB(`ll-db-test-${Math.random().toString(36).slice(2)}`));
});

afterEach(() => {
  resetDbForTesting();
  __setEngineForTesting(null);
});

describe("repo setEntryNote", () => {
  it("writes the trimmed note and updates updatedAt", async () => {
    const id = await seedEntry();
    const updated = await repoSetEntryNote(id, "  hello world  ");
    expect(updated.note).toBe("hello world");
    expect(updated.updatedAt).not.toBe(updated.createdAt);
  });

  it("clears the note when given an empty string", async () => {
    const id = await seedEntry("something");
    const updated = await repoSetEntryNote(id, "   ");
    expect(updated.note).toBe("");
  });

  it("rejects notes longer than the 280-char cap", async () => {
    const id = await seedEntry();
    const tooLong = "x".repeat(ENTRY_NOTE_MAX_LENGTH + 1);
    await expect(repoSetEntryNote(id, tooLong)).rejects.toThrow(
      /280 characters or fewer/,
    );
  });

  it("accepts a note at exactly the cap", async () => {
    const id = await seedEntry();
    const exact = "x".repeat(ENTRY_NOTE_MAX_LENGTH);
    const updated = await repoSetEntryNote(id, exact);
    expect(updated.note).toBe(exact);
  });

  it("throws on a missing entry", async () => {
    await expect(repoSetEntryNote("missing", "x")).rejects.toThrow(
      /Entry not found/,
    );
  });
});

describe("engine setEntryNote (V2.5 surface)", () => {
  it("returns the V2 Entry shape with subjectId mapped from projectId", async () => {
    const id = await seedEntry();
    const engine = freshEngine();
    const updated = await engine.setEntryNote(id, "first note");
    expect(updated.subjectId).toBe("subj_seed");
    expect(updated.note).toBe("first note");
    expect(updated.id).toBe(id);
  });

  it("trims the note before writing", async () => {
    const id = await seedEntry();
    const engine = freshEngine();
    const updated = await engine.setEntryNote(id, "   trimmed   ");
    expect(updated.note).toBe("trimmed");
  });

  it("rejects notes longer than the 280-char cap before any IDB write", async () => {
    const id = await seedEntry("untouched");
    const engine = freshEngine();
    const tooLong = "x".repeat(281);
    await expect(engine.setEntryNote(id, tooLong)).rejects.toThrow(
      /280 characters or fewer/,
    );
    // Confirm the IDB row was NOT modified.
    const db = getDb();
    const after = await db.entries.get(id);
    expect(after?.note).toBe("untouched");
  });

  it("an empty string clears the note (round-trip)", async () => {
    const id = await seedEntry("previous");
    const engine = freshEngine();
    const updated = await engine.setEntryNote(id, "");
    expect(updated.note).toBe("");
  });
});
