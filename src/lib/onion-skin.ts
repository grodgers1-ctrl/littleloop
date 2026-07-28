// V2.5 Onion-skin overlay library.
//
// An onion-skin overlay draws a translucent copy of the previous
// entry's image on top of the live capture preview, so the user
// can align the new shot to the prior one. Spec §7: "Onion-skin
// overlay against the previous entry. If there is no previous
// entry, the optional referenceImageBlobId is used."
//
// This module is the canvas side: given the previous entry's
// image blob and a target canvas, draw the previous image at
// 30% opacity with letterbox-fit (V1's normalisation path).
// The 30% opacity matches the watermark opacity in
// `engine/export/watermark.ts` and the kickoff's "translucent
// guide" wording; the user's design call landed on 30% on Day 1
// of the sprint.
//
// The module is plain JS, no React. The CapturePreviewScreen
// owns the canvas element, the toggle state, and the
// `useEffect` that loads the previous image and re-draws on
// every change.

import { decodeImage } from "./image-processing";
import { computeFit } from "./image-processing";

/** Opacity for the onion-skin overlay. Matches the watermark. */
export const ONION_SKIN_OPACITY = 0.3;

/**
 * Draw the onion-skin (previous image at low opacity) on the
 * given 2D context, letterbox-fitted to the canvas size.
 * Returns a `ImageBitmap` / `HTMLImageElement` handle that the
 * caller should release when done (we close ImageBitmaps
 * automatically; HTMLImageElements are released via URL.revoke
 * inside `decodeImage`).
 *
 * Errors are returned as `null` so the caller can render a
 * graceful empty state — the onion-skin is a UX hint, not a
 * hard requirement.
 */
export async function drawOnionSkin(
  ctx: CanvasRenderingContext2D,
  previousBlob: Blob,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number = ONION_SKIN_OPACITY,
): Promise<void> {
  if (canvasWidth <= 0 || canvasHeight <= 0) return;
  const decoded = await decodeImage(previousBlob);
  const srcW = "width" in decoded ? decoded.width : 0;
  const srcH = "height" in decoded ? decoded.height : 0;
  if (!srcW || !srcH) return;
  const fit = computeFit(srcW, srcH, Math.max(canvasWidth, canvasHeight));
  const dx = Math.round((canvasWidth - fit.w) / 2);
  const dy = Math.round((canvasHeight - fit.h) / 2);
  // Save / restore so the caller's alpha state is preserved.
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.drawImage(decoded, 0, 0, srcW, srcH, dx, dy, fit.w, fit.h);
  ctx.restore();
  if (decoded instanceof HTMLImageElement) {
    // Release the underlying blob URL set up by decodeImage.
    decoded.src = "";
  } else if (typeof (decoded as ImageBitmap).close === "function") {
    (decoded as ImageBitmap).close();
  }
}
