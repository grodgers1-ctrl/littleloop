// V2.5 Day 7 — transitions, filters, themes catalog + apply logic.
//
// The catalogs are data; the apply module (`composeVfChain`,
// `resolveSpeed`, `resolveTransition`, `resolveFilter`) is the
// composable FFmpeg chain builder. Tests here assert:
//
//   1. Every transition/filter/theme produces a non-empty chain
//      (except "none" which produces an empty fragment).
//   2. Theme precedence: when a theme is set, it overrides
//      the per-export transition + filter + speed.
//   3. composeVfChain always starts with the V1 letterbox scale.
//   4. Theme speed resolution pins the correct speed.
//   5. The catalogs have the right number of entries.
//   6. Each entry's human-readable label matches the kickoff.

import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  getTransitionVf,
} from "../../src/engine/transitions/catalog";
import {
  FILTERS,
  getFilterVf,
} from "../../src/engine/filters/catalog";
import {
  THEMES,
} from "../../src/engine/themes/catalog";
import {
  composeVfChain,
  resolveFilter,
  resolveSpeed,
  resolveTransition,
  V25_FRAME_W,
  V25_FRAME_H,
} from "../../src/engine/themes";
import type {
  TransitionId,
  FilterId,
} from "../../src/engine/state";

describe("transitions catalog", () => {
  it("has 6 entries including 'none'", () => {
    expect(TRANSITIONS).toHaveLength(6);
  });

  it("every transition has a label, blurb, and studioOnly flag", () => {
    for (const t of TRANSITIONS) {
      expect(t.label).toBeTruthy();
      expect(t.blurb).toBeTruthy();
      expect(typeof t.studioOnly).toBe("boolean");
    }
  });

  it("only 'none' has studioOnly=false", () => {
    const withoutNone = TRANSITIONS.filter((t) => t.id !== "none");
    expect(withoutNone.every((t) => t.studioOnly)).toBe(true);
  });

  it("getTransitionVf returns a non-empty string for every id except 'none'", () => {
    for (const t of TRANSITIONS) {
      const vf = getTransitionVf(t.id);
      if (t.id === "none") {
        expect(vf).toBe("");
      } else {
        expect(vf.length).toBeGreaterThan(0);
        // Every recipe should look like an ffmpeg filter.
        expect(vf).toMatch(/^[a-z]+[=,]/);
      }
    }
  });
});

describe("filters catalog", () => {
  it("has 8 entries including 'none'", () => {
    expect(FILTERS).toHaveLength(8);
  });

  it("only 'none' has studioOnly=false", () => {
    const withoutNone = FILTERS.filter((f) => f.id !== "none");
    expect(withoutNone.every((f) => f.studioOnly)).toBe(true);
  });

  it("getFilterVf returns a non-empty string for every id except 'none'", () => {
    for (const f of FILTERS) {
      const vf = getFilterVf(f.id);
      if (f.id === "none") {
        expect(vf).toBe("");
      } else {
        expect(vf.length).toBeGreaterThan(0);
        expect(vf).toMatch(/^[a-z]+/);
      }
    }
  });
});

describe("themes catalog", () => {
  it("has 5 entries including 'none'", () => {
    expect(THEMES).toHaveLength(5);
  });

  it("only 'none' has studioOnly=false", () => {
    expect(THEMES.filter((t) => t.id !== "none").every((t) => t.studioOnly)).toBe(
      true,
    );
  });

  it("each theme bundles a known transition + filter + speed", () => {
    const validTransitions: TransitionId[] = [
      "none",
      "crossfade",
      "slide-left",
      "slide-up",
      "flip-3d",
      "zoom-in",
    ];
    const validFilters: FilterId[] = [
      "none",
      "warm",
      "cool",
      "bw",
      "sepia",
      "vignette",
      "soft-focus",
      "slight-grain",
    ];
    const validSpeeds = ["fast", "standard", "slow"];
    for (const t of THEMES) {
      expect(validTransitions).toContain(t.transition);
      expect(validFilters).toContain(t.filter);
      expect(validSpeeds).toContain(t.speed);
    }
  });
});

describe("composeVfChain", () => {
  it("with no theme/transition/filter, returns just the letterbox scale", () => {
    const chain = composeVfChain({});
    expect(chain).toBe(`scale=${V25_FRAME_W}:${V25_FRAME_H}`);
  });

  it("with only a transition set, appends the transition vf after scale", () => {
    const chain = composeVfChain({ transition: "crossfade" });
    expect(chain).toContain("scale=");
    expect(chain).toContain("blend=");
    // Crossfade should come after the scale.
    const parts = chain.split(",");
    expect(parts[0]).toBe(`scale=${V25_FRAME_W}:${V25_FRAME_H}`);
    expect(parts.length).toBe(2);
  });

  it("with only a filter set, appends the filter vf after scale", () => {
    const chain = composeVfChain({ filter: "sepia" });
    expect(chain).toContain("scale=");
    expect(chain).toContain("colorchannelmixer");
    const parts = chain.split(",");
    expect(parts.length).toBe(2);
  });

  it("with both transition + filter, appends both after scale (tx then filter)", () => {
    const chain = composeVfChain({ transition: "crossfade", filter: "bw" });
    const parts = chain.split(",");
    expect(parts[0]).toBe(`scale=${V25_FRAME_W}:${V25_FRAME_H}`);
    expect(parts.length).toBe(3);
  });

  it("theme overrides transition + filter", () => {
    // The Vintage theme bundles sepia (colorchannelmixer) + crossfade
    // (blend). Even though we explicitly pass zoom-in + bw, the
    // theme should win.
    const chain = composeVfChain({
      theme: "vintage",
      transition: "zoom-in",
      filter: "bw",
    });
    // Sepia filter → colorchannelmixer recipe.
    expect(chain).toContain("colorchannelmixer");
    // Crossfade → blend filter.
    expect(chain).toContain("blend=");
    // The explicitly-passed zoom-in (zoompan) and bw (hue=s=0) should
    // NOT appear.
    expect(chain).not.toContain("zoompan");
    expect(chain).not.toContain("hue=s=0");
    // The chain always starts with the letterbox scale.
    expect(chain).toMatch(/^scale=720:1280,/);
  });
});

describe("resolveSpeed", () => {
  it("uses the theme's speed when a theme is set", () => {
    expect(resolveSpeed({ theme: "vintage", speed: "fast" })).toBe("standard");
    expect(resolveSpeed({ theme: "studio", speed: "slow" })).toBe("fast");
    expect(resolveSpeed({ theme: "memory" })).toBe("slow");
    expect(resolveSpeed({ theme: "pop" })).toBe("fast");
  });

  it("falls back to the caller's speed when no theme is set", () => {
    expect(resolveSpeed({ speed: "fast" })).toBe("fast");
    expect(resolveSpeed({ speed: "slow" })).toBe("slow");
  });

  it("defaults to 'standard' when nothing is set", () => {
    expect(resolveSpeed({})).toBe("standard");
  });
});

describe("resolveTransition", () => {
  it("uses the theme's transition when a theme is set", () => {
    expect(resolveTransition({ theme: "vintage" })).toBe("crossfade");
    expect(resolveTransition({ theme: "studio" })).toBe("none");
    expect(resolveTransition({ theme: "pop", transition: "zoom-in" })).toBe(
      "slide-left",
    );
  });

  it("falls back to 'none' when nothing is set", () => {
    expect(resolveTransition({})).toBe("none");
  });
});

describe("resolveFilter", () => {
  it("uses the theme's filter when a theme is set", () => {
    expect(resolveFilter({ theme: "vintage" })).toBe("sepia");
    expect(resolveFilter({ theme: "studio" })).toBe("bw");
  });

  it("falls back to 'none' when nothing is set", () => {
    expect(resolveFilter({})).toBe("none");
  });
});