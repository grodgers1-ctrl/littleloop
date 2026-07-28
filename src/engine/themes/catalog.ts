// V2.5 — themes catalog.
//
// Each theme bundles a transition + a filter + a render speed.
// When a theme is selected, it overrides the per-export
// transition and filter (and pins the speed). The V2.5 export
// engine composes the chain from the theme.
//
// The kickoff lists 4 themes:
//   - Vintage  (sepia + grain + crossfade + 0.5s)
//   - Studio   (BW + clean-cut + 0.4s)
//   - Memory   (soft-focus + zoom-in + 0.6s)
//   - Pop      (cool + slide-left + 0.4s)

import type { RenderSpeed } from "../state";
import type { Theme, ThemeId } from "../state";

export const THEMES: Theme[] = [
  {
    id: "none",
    label: "None",
    studioOnly: false,
    transition: "none",
    filter: "none",
    speed: "standard",
    blurb: "No theme. Use a transition + filter directly.",
  },
  {
    id: "vintage",
    label: "Vintage",
    studioOnly: true,
    transition: "crossfade",
    filter: "sepia",
    speed: "standard",
    blurb: "Sepia tones with a soft crossfade. The family-album look.",
  },
  {
    id: "studio",
    label: "Studio",
    studioOnly: true,
    transition: "none",
    filter: "bw",
    speed: "fast",
    blurb: "Black & white, clean cuts, quick pacing. The portfolio look.",
  },
  {
    id: "memory",
    label: "Memory",
    studioOnly: true,
    transition: "zoom-in",
    filter: "soft-focus",
    speed: "slow",
    blurb: "Soft focus with a gentle zoom-in. Slower, dreamier.",
  },
  {
    id: "pop",
    label: "Pop",
    studioOnly: true,
    transition: "slide-left",
    filter: "cool",
    speed: "fast",
    blurb: "Cool tones with quick slide-ins. Energetic, social-friendly.",
  },
];

/** Get the catalog entry for a theme id. */
export function getTheme(id: ThemeId): Theme {
  const t = THEMES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown theme: ${id}`);
  return t;
}

/** Look up the speed a theme pins. Convenience over `getTheme().speed`. */
export function getThemeSpeed(id: ThemeId): RenderSpeed {
  return getTheme(id).speed;
}
