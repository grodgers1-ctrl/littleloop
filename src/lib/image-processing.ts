// Image normalization pipeline used by both camera capture and camera-roll
// import. Produces a normalized JPEG (long edge <= 1600 px) plus a
// smaller thumbnail (long edge <= 480 px).

export const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_LONG_EDGE = 1600;
export const MAX_THUMB_LONG_EDGE = 480;
export const JPEG_QUALITY = 0.88;
export const THUMB_JPEG_QUALITY = 0.82;

export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type AcceptedMime = (typeof ACCEPTED_MIME_TYPES)[number];

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export function isAcceptedMime(mime: string): mime is AcceptedMime {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(mime);
}

export interface ProcessedImage {
  image: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  imageBytes: number;
  thumbBytes: number;
}

export function computeFit(
  srcW: number,
  srcH: number,
  maxLong: number,
): { w: number; h: number } {
  const long = Math.max(srcW, srcH);
  if (long <= maxLong) return { w: srcW, h: srcH };
  const scale = maxLong / long;
  return {
    w: Math.round(srcW * scale),
    h: Math.round(srcH * scale),
  };
}

export async function decodeImage(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to HTMLImageElement path.
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageValidationError("Could not decode image"));
    };
    img.src = url;
  });
}

function drawScaled(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageValidationError("Canvas 2D context unavailable");
  // White background for JPEG safety (avoids black-fill on PNG transparency).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new ImageValidationError("Canvas export failed"));
      },
      "image/jpeg",
      quality,
    );
  });
}

export async function processImageFile(file: File | Blob): Promise<ProcessedImage> {
  // 1. Validate MIME / size.
  const mime = file.type || "application/octet-stream";
  if (!isAcceptedMime(mime)) {
    throw new ImageValidationError(
      "This image format is not supported by your browser. Try choosing a JPEG or PNG.",
    );
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageValidationError(
      "That photo is larger than 25 MB. Try choosing a smaller image.",
    );
  }

  // 2. Decode.
  const decoded = await decodeImage(file);
  const width = "width" in decoded ? decoded.width : 0;
  const height = "height" in decoded ? decoded.height : 0;
  if (!width || !height) {
    throw new ImageValidationError("Could not determine image dimensions");
  }

  // 3. Resize.
  const fit = computeFit(width, height, MAX_LONG_EDGE);
  const thumbFit = computeFit(width, height, MAX_THUMB_LONG_EDGE);
  const mainCanvas = drawScaled(decoded, width, height, fit.w, fit.h);
  const thumbCanvas = drawScaled(decoded, width, height, thumbFit.w, thumbFit.h);

  // 4. Export blobs.
  const [image, thumbnail] = await Promise.all([
    canvasToBlob(mainCanvas, JPEG_QUALITY),
    canvasToBlob(thumbCanvas, THUMB_JPEG_QUALITY),
  ]);

  // If we used HTMLImageElement, allow it to be GC'd by nulling src.
  if (decoded instanceof HTMLImageElement) {
    decoded.src = "";
  }

  return {
    image,
    thumbnail,
    width: fit.w,
    height: fit.h,
    thumbWidth: thumbFit.w,
    thumbHeight: thumbFit.h,
    imageBytes: image.size,
    thumbBytes: thumbnail.size,
  };
}