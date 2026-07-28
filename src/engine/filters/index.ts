// V2.5 filters engine module.
//
// Day 1 ships the directory + barrel. The catalog of `Filter`
// objects and the `apply.ts` that composes an FFmpeg `-vf` chain
// land on Day 7. Like transitions, filters are Studio-only and
// apply to every frame of the export.
//
// Initial catalog target (for context; details on Day 7):
//   - warm  (colortemperature=6500)
//   - cool  (4500)
//   - BW    (hue=s=0)
//   - sepia (colorchannelmixer)
//   - vignette
//   - soft-focus (boxblur)
//   - slight-grain (noise)

export {};
