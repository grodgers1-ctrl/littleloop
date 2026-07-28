// V2.5 — transitions catalog.
//
// Each entry maps to an FFmpeg `-vf` recipe (or recipe fragment).
// Transitions are applied between frames during encoding; the V2.5
// export engine composes a chain that the V1 worker consumes.
//
// Recipes are written to compose with the canonical V1 letterbox
// scale (`scale=720:1280`) — the engine replaces the V1 default
// `-vf scale=...` with a chain that ends in the same scale.
//
// The kickoff lists 5 transitions: crossfade, slide-left, slide-up,
// flip-3D, zoom-in. The recipes are simplified versions of the
// canonical FFmpeg filters; for V2.5 the visible effect is
// deterministic and reproducible without depending on a real
// FFmpeg.wasm run during CI.

import type { Transition, TransitionId } from "../state";

export const TRANSITIONS: Transition[] = [
  {
    id: "none",
    label: "None",
    studioOnly: false,
    blurb: "Plain cuts between frames. Free for everyone.",
  },
  {
    id: "crossfade",
    label: "Crossfade",
    studioOnly: true,
    blurb: "A smooth dissolve from one frame to the next.",
  },
  {
    id: "slide-left",
    label: "Slide left",
    studioOnly: true,
    blurb: "Each frame slides in from the right edge.",
  },
  {
    id: "slide-up",
    label: "Slide up",
    studioOnly: true,
    blurb: "Each frame slides in from the bottom.",
  },
  {
    id: "flip-3d",
    label: "Flip 3D",
    studioOnly: true,
    blurb: "A 3D flip transition between frames.",
  },
  {
    id: "zoom-in",
    label: "Zoom in",
    studioOnly: true,
    blurb: "Each frame zooms in toward the centre.",
  },
];

/** Get the catalog entry for a transition id. */
export function getTransition(id: TransitionId): Transition {
  const t = TRANSITIONS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown transition: ${id}`);
  return t;
}

/** Get the FFmpeg `-vf` recipe fragment for a transition.
 *  Returns the empty string for the "none" transition. */
export function getTransitionVf(id: TransitionId): string {
  switch (id) {
    case "none":
      return "";
    case "crossfade":
      // xfade requires explicit durations; for V2.5 we use a
      // 0.5s dissolve via blend. The full xfade is a multi-input
      // filter that requires N xfade clauses; we keep V2.5 simple
      // and ship a per-frame blend that approximates the look.
      return "blend=all_mode=dissolve:all_opacity=0.5";
    case "slide-left":
      // Pad-right + translate the new frame in from the right.
      return "pad=iw+80:ih:0:0:color=#fbf2e6,overlay=x='-80+t*40':y=0";
    case "slide-up":
      return "pad=iw:ih+80:0:0:color=#fbf2e6,overlay=x=0:y='-80+t*40'";
    case "flip-3d":
      // Rotate around the y-axis for a 3D-flip look.
      return "rotate=2*PI*t/30:c=#fbf2e6";
    case "zoom-in":
      // zoompan zooms toward the centre.
      return "zoompan=z='min(zoom+0.0015,1.2)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
  }
}
