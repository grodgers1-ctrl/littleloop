// V2.5 — filters catalog.
//
// Each entry maps to an FFmpeg `-vf` recipe fragment. Filters apply
// to every frame during encoding. The V2.5 export engine composes
// a chain that the V1 worker consumes.
//
// The kickoff lists 7 filters: warm, cool, BW, sepia, vignette,
// soft-focus, slight-grain. Recipes are simplified so the unit
// tests can assert the chain shape without depending on a real
// FFmpeg.wasm run.

import type { Filter, FilterId } from "../state";

export const FILTERS: Filter[] = [
  {
    id: "none",
    label: "None",
    studioOnly: false,
    blurb: "No filter. The original photo is rendered as-is.",
  },
  {
    id: "warm",
    label: "Warm",
    studioOnly: true,
    blurb: "Adds a soft warm tint, like late-afternoon light.",
  },
  {
    id: "cool",
    label: "Cool",
    studioOnly: true,
    blurb: "Cools the tones for a crisp, blue-hour look.",
  },
  {
    id: "bw",
    label: "Black & white",
    studioOnly: true,
    blurb: "Strips colour for a timeless monochrome look.",
  },
  {
    id: "sepia",
    label: "Sepia",
    studioOnly: true,
    blurb: "A warm brown tone that feels like an old photo.",
  },
  {
    id: "vignette",
    label: "Vignette",
    studioOnly: true,
    blurb: "Darkens the edges to draw the eye to the centre.",
  },
  {
    id: "soft-focus",
    label: "Soft focus",
    studioOnly: true,
    blurb: "A gentle blur that smooths skin and backgrounds.",
  },
  {
    id: "slight-grain",
    label: "Slight grain",
    studioOnly: true,
    blurb: "Adds a fine film grain for a tactile feel.",
  },
];

/** Get the catalog entry for a filter id. */
export function getFilter(id: FilterId): Filter {
  const f = FILTERS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown filter: ${id}`);
  return f;
}

/** Get the FFmpeg `-vf` recipe fragment for a filter.
 *  Returns the empty string for the "none" filter. */
export function getFilterVf(id: FilterId): string {
  switch (id) {
    case "none":
      return "";
    case "warm":
      return "colortemperature=6500";
    case "cool":
      return "colortemperature=4500";
    case "bw":
      return "hue=s=0";
    case "sepia":
      // colorchannelmixer with sepia weights.
      return "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131";
    case "vignette":
      return "vignette=PI/4";
    case "soft-focus":
      return "boxblur=4:1";
    case "slight-grain":
      return "noise=alls=8:allf=t";
  }
}
