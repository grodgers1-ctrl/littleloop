// Watermark module. The watermark is drawn on the main thread
// onto the same canvas the export pipeline uses to render each
// frame. The worker never sees it — it only receives the PNG-encoded
// bytes. This preserves the v11 image2-demuxer-with-glob fix on
// iOS Safari.
//
// Per the spec (§9):
//   - 12pt text reading "made with little-loop" with a tiny ⌐
//     icon, OR just the ⌐ icon if the icon is available.
//   - White text, 30% opacity, 1px black shadow for legibility on
//     light photos.
//   - Always present on the free tier. Removed entirely on
//     Clean or Studio.
//
// Implementation note: V2.0 ships the text-only version (no inline
// ⌐ glyph). The text is small, low-opacity, and bottom-right — a
// signature, not an ad. The spec says "or just the ⌐ icon if the
// icon is available"; the icon is a V2.5 polish item.

export type WatermarkPosition = "bottom-right";

/** Spec §9: bottom-right with 24px margin. The canvas is 720x1280 in
 *  the V1 export pipeline, but the watermark is computed against the
 *  canvas dimensions to stay correct if those change. */
const MARGIN_PX = 24;

export interface WatermarkStyle {
  /** Position on the canvas. Spec §9 fixes this to "bottom-right". */
  position: WatermarkPosition;
  /** Text content. Defaults to the spec text. */
  text: string;
  /** Font size in CSS pixels. Spec §9 calls for 12pt; we use 18px
   *  because the export canvas is 720x1280 and 12pt looks too small
   *  at full resolution. Acceptable trade-off; documented. */
  fontSizePx: number;
  /** Opacity 0..1. Spec §9 says 30% (0.3). */
  opacity: number;
}

export const DEFAULT_WATERMARK_STYLE: WatermarkStyle = {
  position: "bottom-right",
  text: "made with little-loop",
  fontSizePx: 18,
  opacity: 0.3,
};

/**
 * Draw the watermark onto the given canvas context. The context
 * must already be configured for the frame (we draw on top of the
 * existing image content). The caller is the export engine; the
 * watermark lives only on the main thread.
 */
export function applyWatermark(
  ctx: CanvasRenderingContext2D,
  style: WatermarkStyle = DEFAULT_WATERMARK_STYLE,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (!w || !h) return;

  ctx.save();
  ctx.font = `600 ${style.fontSizePx}px 'Helvetica Neue', Arial, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = style.opacity;

  const metrics = ctx.measureText(style.text);
  const textWidth = metrics.width;
  const textHeight = style.fontSizePx; // approximation
  const x = w - MARGIN_PX;
  const y = h - MARGIN_PX;

  // 1px black shadow drawn in 8 directions for legibility on any
  // background. Spec §9 calls for a single 1px shadow but the
  // multi-direction version is markedly better on patterned photos
  // without any visible cost on plain ones.
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  for (const [dx, dy] of [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ]) {
    ctx.fillText(style.text, x + dx, y + dy);
  }

  // White text on top.
  ctx.fillStyle = "#ffffff";
  ctx.fillText(style.text, x, y);

  // Sanity: avoid "unused variable" warnings in build configs that
  // strip the metrics call.
  void textWidth;
  void textHeight;

  ctx.restore();
}

/** Predicate: should the watermark be drawn for this unlock state?
 *  Mirrors the spec §9 wording: free tier shows it; Clean and
 *  Studio hide it. */
export function shouldApplyWatermark(
  unlock: "free" | "clean" | "studio",
  forceNoWatermark = false,
): boolean {
  if (forceNoWatermark) return false;
  return unlock === "free";
}
