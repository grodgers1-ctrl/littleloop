// V2.5.1 redesign — V2 home surface.
//
// The user approved the Phase 3 redesign on Day 9 of the V2.5
// hotfix follow-up. The redesign is small and targeted:
//   - The home header reads "Your moments" (was "Your subjects").
//   - Subject count reads "N timelines" (was "N subjects").
//   - The empty-state CTA reads "Start your first timeline"
//     (was "Add your first subject").
//   - The MemoryLane card always renders, with a graceful
//     "On this day" empty state when no past-year entries
//     match today (was: hidden when no matches).
//   - The reminders banner is a thin top-of-home element with
//     a single tap → settings and a dismiss X (was: settings-
//     only).
//   - The per-tile primary action is "+ Add photo" with the
//     secondary "Make a video" (was: secondary "Export").
//   - The footer adds a "+ Add a moment" CTA (was: only
//     accessible from the home header).
//
// These tests pin the new copy + surface so a future "tidy-up"
// pass doesn't silently regress the redesign.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { V2Splash } from "../../src/engine/V2Splash";
import { V2HomeScreen } from "../../src/features/home/V2HomeScreen";
import { Engine, __setEngineForTesting } from "../../src/engine/engine";
import { createDevIapProvider } from "../../src/engine/iap/dev";
import {
  LittleLoopDB,
  resetDbForTesting,
  setDbForTesting,
} from "../../src/db/database";
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

function freshEngine(): Engine {
  return new Engine({
    iap: createDevIapProvider({ available: true }),
    platform: stubPlatform(),
    ads: stubAds(),
  });
}

beforeEach(() => {
  setDbForTesting(
    new LittleLoopDB(`ll-db-test-${Math.random().toString(36).slice(2)}`),
  );
  __setEngineForTesting(freshEngine());
});

afterEach(() => {
  resetDbForTesting();
  __setEngineForTesting(null);
});

describe("V2 home redesign — copy + surface", () => {
  it("renders the 'Your moments' header when at least one subject exists", async () => {
    const engine = new Engine({
      iap: createDevIapProvider({ available: true }),
      platform: stubPlatform(),
      ads: stubAds(),
    });
    __setEngineForTesting(engine);
    await engine.init();
    await engine.createSubject({ name: "Mia", type: "baby", cadence: "daily" });
    render(
      <V2Splash>
        <V2HomeScreen
          onOpenSubject={() => {}}
          onOpenSubjectSettings={() => {}}
        />
      </V2Splash>,
    );
    // V2.5.1 redesign — the header reads "Your moments" when
    // at least one subject exists. The "Little Loop" app
    // title only shows in the truly empty state.
    expect(await screen.findByText(/Your moments/i)).toBeInTheDocument();
  });

  it("renders the '1 timeline' subject count (was '1 subject')", async () => {
    const engine = new Engine({
      iap: createDevIapProvider({ available: true }),
      platform: stubPlatform(),
      ads: stubAds(),
    });
    __setEngineForTesting(engine);
    await engine.init();
    await engine.createSubject({ name: "Mia", type: "baby", cadence: "daily" });
    render(
      <V2Splash>
        <V2HomeScreen
          onOpenSubject={() => {}}
          onOpenSubjectSettings={() => {}}
        />
      </V2Splash>,
    );
    expect(await screen.findByText(/1 timeline/i)).toBeInTheDocument();
  });

  it("renders the 'Start your first timeline' empty-state CTA", async () => {
    const engine = new Engine({
      iap: createDevIapProvider({ available: true }),
      platform: stubPlatform(),
      ads: stubAds(),
    });
    __setEngineForTesting(engine);
    await engine.init();
    render(
      <V2Splash>
        <V2HomeScreen
          onOpenSubject={() => {}}
          onOpenSubjectSettings={() => {}}
        />
      </V2Splash>,
    );
    expect(
      await screen.findByRole("button", { name: /Start your first timeline/i }),
    ).toBeInTheDocument();
  });

  it("renders the memory lane empty state (graceful 'On this day' card) when no past-year entries exist", async () => {
    const engine = new Engine({
      iap: createDevIapProvider({ available: true }),
      platform: stubPlatform(),
      ads: stubAds(),
    });
    __setEngineForTesting(engine);
    await engine.init();
    await engine.createSubject({ name: "Mia", type: "baby", cadence: "daily" });
    render(
      <V2Splash>
        <V2HomeScreen
          onOpenSubject={() => {}}
          onOpenSubjectSettings={() => {}}
        />
      </V2Splash>,
    );
    // The empty state carries the data-testid and the soft
    // "On this day" header.
    expect(await screen.findByTestId("memory-lane-empty")).toBeInTheDocument();
    // The CTA inside the empty state is "Add a moment".
    expect(
      await screen.findByTestId("memory-lane-empty-cta"),
    ).toBeInTheDocument();
  });

  it("renders the per-tile primary '+ Add photo' button", async () => {
    const engine = new Engine({
      iap: createDevIapProvider({ available: true }),
      platform: stubPlatform(),
      ads: stubAds(),
    });
    __setEngineForTesting(engine);
    await engine.init();
    await engine.createSubject({ name: "Mia", type: "baby", cadence: "daily" });
    render(
      <V2Splash>
        <V2HomeScreen
          onOpenSubject={() => {}}
          onOpenSubjectSettings={() => {}}
          onAddPhoto={() => {}}
          onExport={() => {}}
        />
      </V2Splash>,
    );
    expect(
      await screen.findByRole("button", { name: /Add a photo to Mia/i }),
    ).toBeInTheDocument();
  });

  it("renders the per-tile secondary 'Make a video' button (was 'Export')", async () => {
    const engine = new Engine({
      iap: createDevIapProvider({ available: true }),
      platform: stubPlatform(),
      ads: stubAds(),
    });
    __setEngineForTesting(engine);
    await engine.init();
    await engine.createSubject({ name: "Mia", type: "baby", cadence: "daily" });
    render(
      <V2Splash>
        <V2HomeScreen
          onOpenSubject={() => {}}
          onOpenSubjectSettings={() => {}}
          onAddPhoto={() => {}}
          onExport={() => {}}
        />
      </V2Splash>,
    );
    expect(
      await screen.findByRole("button", { name: /Export Mia as a video/i }),
    ).toBeInTheDocument();
  });

  it("renders the footer '+ Add a moment' CTA when at least one subject exists", async () => {
    const engine = new Engine({
      iap: createDevIapProvider({ available: true }),
      platform: stubPlatform(),
      ads: stubAds(),
    });
    __setEngineForTesting(engine);
    await engine.init();
    await engine.createSubject({ name: "Mia", type: "baby", cadence: "daily" });
    render(
      <V2Splash>
        <V2HomeScreen
          onOpenSubject={() => {}}
          onOpenSubjectSettings={() => {}}
        />
      </V2Splash>,
    );
    // The footer CTA is a Button with text "Add a moment"
    // (without the leading "+"). The memory-lane empty-state
    // CTA also includes "Add a moment" but is rendered as a
    // raw <button> with data-testid, so we look up via
    // testid to disambiguate. Both should exist.
    const footerCta = await screen.findByRole("button", {
      name: /^Add a moment$/i,
    });
    expect(footerCta).toBeInTheDocument();
  });
});
