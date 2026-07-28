// V2.5 themes engine module.
//
// Day 1 ships the directory + barrel. The catalog of `Theme`
// objects — each bundles a transition + a filter + a render speed —
// lands on Day 7. Themes are Studio-only; when a theme is selected
// for export, it overrides the per-export `transition` and `filter`
// fields (see `ExportRequestV2` in `state.ts`).
//
// Initial catalog target (for context; details on Day 7):
//   - Vintage  (sepia + grain + crossfade + 0.5s)
//   - Studio   (BW + clean-cut + 0.4s)
//   - Memory   (soft-focus + zoom-in + 0.6s)
//   - Pop      (cool + slide-left + 0.4s)

export {};
