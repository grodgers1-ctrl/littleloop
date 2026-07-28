// V2.5 transitions engine module.
//
// Day 1 ships the directory + barrel. The catalog of `Transition`
// objects and the `apply.ts` that composes an FFmpeg `-vf` chain
// land on Day 7. The catalog is purely data; the apply step is a
// pure function from `(transitionId, frameCount, ffmpegChain) ->
// nextFfmpegChain`.
//
// Initial catalog target (for context; details on Day 7):
//   - crossfade (xfade)
//   - slide-left
//   - slide-up
//   - flip-3D (hlslice)
//   - zoom-in (zoompan)

export {};
