// Day 6 visual sanity: V2HomeScreen renders correctly with the
// subject list and ad banner at a 360px viewport. We can't measure
// pixel widths in jsdom reliably, but we can assert that the
// component mounts without errors and emits the expected DOM
// markers (subject tile, ad banner).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  Engine,
  __setEngineForTesting,
} from "../../src/engine/engine";
import type {
  AdProvider,
  IapProvider,
  Platform,
} from "../../src/engine/engine";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
import {
  __resetMigrationFlagsForTesting,
} from "../../src/db/migrations/v1-to-v2";
import {
  __clearUnlockCacheForTesting,
} from "../../src/engine/iap/state";
import {
  __clearAdCapForTesting,
  createPlaceholderAdProvider,
} from "../../src/engine/ads/placeholder";
import { createDevIapProvider } from "../../src/engine/iap/dev";
import { setEngine as setEngineSingleton } from "../../src/engine";
import { V2HomeScreen } from "../../src/features/home/V2HomeScreen";
import { V2Splash } from "../../src/engine/V2Splash";

function freshDb(): LittleLoopDB {
  return new LittleLoopDB(
    `little-loop-db-test-${Math.random().toString(36).slice(2)}`,
  );
}

function stubPlatform(): Platform {
  return {
    share: () => Promise.resolve({ shared: false, reason: "unavailable" }),
    saveToCameraRoll: () => Promise.resolve(false),
    saveToFiles: () => Promise.resolve(false),
    pickFile: () => Promise.resolve(null),
  };
}

function stubAds(): AdProvider {
  return createPlaceholderAdProvider();
}

function stubIap(): IapProvider {
  return createDevIapProvider({ available: true });
}

function freshEngine(): Engine {
  return new Engine({
    iap: stubIap(),
    platform: stubPlatform(),
    ads: stubAds(),
  });
}

beforeEach(() => {
  __resetMigrationFlagsForTesting();
  __clearUnlockCacheForTesting();
  __clearAdCapForTesting();
});

afterEach(() => {
  cleanup();
  __setEngineForTesting(null);
  resetDbForTesting();
  __resetMigrationFlagsForTesting();
  __clearUnlockCacheForTesting();
  __clearAdCapForTesting();
});

describe("V2HomeScreen — Day 6 polish", () => {
  it("renders an empty-state prompt when no subjects exist", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    setEngineSingleton(engine);
    await engine.init();
    render(
      <V2Splash>
        <V2HomeScreen onOpenSubject={() => {}} onOpenSubjectSettings={() => {}} />
      </V2Splash>,
    );
    // The empty-state body button is the unambiguous target.
    const button = await screen.findByRole("button", {
      name: /Add your first subject/i,
    });
    expect(button).toBeInTheDocument();
  });

  it("renders subject tiles + ad banner when at least one subject exists (free user)", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    setEngineSingleton(engine);
    await engine.init();
    await engine.createSubject({
      name: "Mia",
      type: "baby",
      cadence: "daily",
    });

    render(
      <V2Splash>
        <V2HomeScreen onOpenSubject={() => {}} onOpenSubjectSettings={() => {}} />
      </V2Splash>,
    );

    // The Rename button is the unambiguous "Mia" target after
    // refactoring (the inline rename button used to be a button
    // with the subject name as its label).
    const renameButton = await screen.findByRole("button", {
      name: /Rename Mia/i,
    });
    expect(renameButton).toBeInTheDocument();

    // Sponsored label is rendered (ad is visible for free users).
    expect(await screen.findByText(/Sponsored/i)).toBeInTheDocument();
  });

  it("hides the ad banner when the user has Clean or Studio", async () => {
    const db = freshDb();
    setDbForTesting(db);
    const engine = freshEngine();
    setEngineSingleton(engine);
    await engine.init();
    await engine.createSubject({
      name: "Mia",
      type: "baby",
      cadence: "daily",
    });
    await engine.iapBuy("clean");

    render(
      <V2Splash>
        <V2HomeScreen onOpenSubject={() => {}} onOpenSubjectSettings={() => {}} />
      </V2Splash>,
    );

    await screen.findByRole("button", { name: /Rename Mia/i });
    // No "Sponsored" text should appear for paid users.
    expect(screen.queryByText(/Sponsored/i)).toBeNull();
  });
});
