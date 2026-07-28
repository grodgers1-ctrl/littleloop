// V2.5 — Compose an FFmpeg `-vf` chain from a theme / transition /
// filter selection, and resolve the render speed.
//
// Selection precedence (per the kickoff):
//   1. If a `theme` is set, it wins and overrides
//      `transition` + `filter` + `speed`.
//   2. Otherwise, `transition` + `filter` are applied
//      (both default to "none" when unset).
//   3. `speed` is left as the user's pick when no theme is
//      selected.
//
// The returned chain always starts with the V1 letterbox scale
// (720x1280) so the output frame size matches V2.0. Transition
// and filter fragments are appended in the order
//   scale, transition, filter
// which keeps the transition closer to the source pixels and
// the filter as the final visible pass.

import type { FilterId, RenderSpeed, ThemeId, TransitionId } from "../state";
import { getFilterVf } from "../filters/catalog";
import { getTheme } from "./catalog";
import { getTransitionVf } from "../transitions/catalog";

export const V25_FRAME_W = 720;
export const V25_FRAME_H = 1280;

/** Resolve the render speed from a request. */
export function resolveSpeed(opts: {
  theme?: ThemeId;
  speed?: RenderSpeed;
}): RenderSpeed {
  if (opts.theme && opts.theme !== "none") {
    return getTheme(opts.theme).speed;
  }
  return opts.speed ?? "standard";
}

/** Resolve the transition id from a request. */
export function resolveTransition(opts: {
  theme?: ThemeId;
  transition?: TransitionId;
}): TransitionId {
  if (opts.theme && opts.theme !== "none") {
    return getTheme(opts.theme).transition;
  }
  return opts.transition ?? "none";
}

/** Resolve the filter id from a request. */
export function resolveFilter(opts: {
  theme?: ThemeId;
  filter?: FilterId;
}): FilterId {
  if (opts.theme && opts.theme !== "none") {
    return getTheme(opts.theme).filter;
  }
  return opts.filter ?? "none";
}

/** Compose the FFmpeg `-vf` chain string. */
export function composeVfChain(opts: {
  theme?: ThemeId;
  transition?: TransitionId;
  filter?: FilterId;
}): string {
  const transition = resolveTransition(opts);
  const filter = resolveFilter(opts);
  const parts: string[] = [`scale=${V25_FRAME_W}:${V25_FRAME_H}`];
  const t = getTransitionVf(transition);
  if (t) parts.push(t);
  const f = getFilterVf(filter);
  if (f) parts.push(f);
  return parts.join(",");
}
