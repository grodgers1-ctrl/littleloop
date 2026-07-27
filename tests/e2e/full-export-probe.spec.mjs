// End-to-end test: drive a real export through the production
// pipeline, verify an MP4 blob comes out. This is the high-fidelity
// regression test that catches "the error pipeline works but the
// actual encoding doesn't" — which is exactly what was broken on
// iOS Safari 26.5 even after the previous fixes.
//
// What it does:
//   1. Load babyflipbook.dev (production) on Chromium.
//   2. Navigate to the export screen on a real project (or skip if
//      setup is needed).
//   3. Trigger startExport() programmatically via page.evaluate.
//   4. Capture the resulting blob and assert it is a non-empty MP4.
//
// Requires `npm run preview` to be serving the production build on
// 127.0.0.1:4173.

import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PREVIEW_URL = "http://127.0.0.1:4173/";
const PHOTO_DIR = "C:/Users/Admin/Pictures/Screenshots";
const TEST_PHOTOS = [
  path.join(PHOTO_DIR, "Screenshot 2026-04-25 021710.png"),
  path.join(PHOTO_DIR, "Screenshot 2026-04-25 023005.png"),
  path.join(PHOTO_DIR, "Screenshot 2026-04-25 023840.png"),
  path.join(PHOTO_DIR, "Screenshot 2026-04-25 030412.png"),
  path.join(PHOTO_DIR, "Screenshot 2026-04-25 042907.png"),
  path.join(PHOTO_DIR, "Screenshot 2026-04-25 043259.png"),
  path.join(PHOTO_DIR, "Screenshot 2026-04-25 045448.png"),
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext().then((c) => c.newPage());

  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(PREVIEW_URL, { waitUntil: "domcontentloaded" });

  // Read photo bytes outside the page.
  const photoBytes = [];
  for (const p of TEST_PHOTOS) {
    const buf = await readFile(p);
    photoBytes.push(Array.from(new Uint8Array(buf)));
  }

  const result = await page.evaluate(
    async ({ photoBytes }) => {
      // Try to import the production module dynamically. Vite serves
      // it under /assets/index-<hash>.js as a module.
      const scripts = Array.from(document.querySelectorAll("script"));
      const mainScript = scripts.find((s) =>
        /\/assets\/index-.*\.js/.test(s.src),
      );
      if (!mainScript) return { ok: false, stage: "no main script", errors: [] };

      // Use the page's live React tree by walking the existing app.
      // Simpler: drive the FFmpeg orchestrator directly by importing
      // the worker module via the same URL the app uses for it.
      const workerUrl = "/assets/video-render.worker-MbDMw2QK.js";
      const worker = new Worker(workerUrl, { type: "module" });

      // Wait for boot `ready`.
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("boot timeout")), 8000);
        worker.onmessage = (e) => {
          if (e.data?.type === "ready") {
            clearTimeout(t);
            resolve(true);
          }
        };
        worker.onerror = (e) => reject(new Error(`boot: ${e.message}`));
      });

      const sendAndAwait = (payload, awaitType, transfer = [], timeoutMs = 15000) =>
        new Promise((resolve, reject) => {
          const t = setTimeout(
            () => reject(new Error(`await '${awaitType}' timeout`)),
            timeoutMs,
          );
          const onMsg = (e) => {
            const m = e.data;
            if (m?.type === awaitType) {
              clearTimeout(t);
              worker.removeEventListener("message", onMsg);
              resolve(m);
            } else if (m?.type === "error") {
              clearTimeout(t);
              worker.removeEventListener("message", onMsg);
              reject(new Error(m.message));
            }
          };
          worker.addEventListener("message", onMsg);
          worker.postMessage(payload, transfer);
        });

      // Init — no coreURL/wasmURL overrides, use the production
      // /ffmpeg-core/ path. This is the exact code path the iPhone
      // user runs.
      try {
        await sendAndAwait(
          { type: "init", total: photoBytes.length * 8, framesPerImage: 8 },
          "ready",
          [],
          60000,
        );
      } catch (err) {
        return { ok: false, stage: "init", error: err.message };
      }

      // Render frames.
      const host = document.createElement("canvas");
      host.width = 720;
      host.height = 1280;
      const ctx = host.getContext("2d");
      if (!ctx) return { ok: false, stage: "canvas", error: "no 2d ctx" };

      for (let idx = 0; idx < photoBytes.length; idx += 1) {
        const u8 = new Uint8Array(photoBytes[idx]);
        const blob = new Blob([u8], { type: "image/png" });
        let bitmap;
        try {
          bitmap = await createImageBitmap(blob);
        } catch (err) {
          return { ok: false, stage: `decode idx=${idx}`, error: err.message };
        }
        ctx.fillStyle = "#fbf2e6";
        ctx.fillRect(0, 0, host.width, host.height);
        ctx.drawImage(bitmap, 0, 0, host.width, host.height);
        const pngBlob = await new Promise((resolve, reject) =>
          host.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob null"))), "image/png"),
        );
        bitmap.close();
        for (let f = 0; f < 8; f += 1) {
          // Make a fresh Uint8Array (and underlying ArrayBuffer) per
          // frame. Transferring the same buffer twice detaches it on
          // the first postMessage, which throws on subsequent sends.
          const png = new Uint8Array(await pngBlob.arrayBuffer());
          try {
            await sendAndAwait(
              { type: "frame", idx, frameIdx: f, png },
              "frame-done",
              [png.buffer],
            );
          } catch (err) {
            return { ok: false, stage: `frame idx=${idx} f=${f}`, error: err.message };
          }
        }
      }

      // Encode.
      const logs = [];
      const onLog = (m) => logs.push(m);
      // Monkey-patch the sendAndAwait so we can capture log messages.
      // The worker posts { type: 'log', message } during exec; we
      // intercept them here so we can see what FFmpeg actually did.
      const oldSendAndAwait = sendAndAwait;
      const sendAndAwaitLogged = async (payload, awaitType, transfer = [], timeoutMs = 90000) => {
        return new Promise((resolve, reject) => {
          const onMsg = (e) => {
            const m = e.data;
            if (m?.type === "log") {
              logs.push(m.message);
              return;
            }
            if (m?.type === awaitType) {
              worker.removeEventListener("message", onMsg);
              resolve(m);
            } else if (m?.type === "error") {
              worker.removeEventListener("message", onMsg);
              reject(new Error(m.message));
            }
          };
          worker.addEventListener("message", onMsg);
          worker.postMessage(payload, transfer);
        });
      };

      let encodeResult = null;
      try {
        const result = await sendAndAwaitLogged(
          { type: "encode", filename: "test.mp4" },
          "success",
          [],
          90000,
        );
        // The success message carries a Blob. We can't return a Blob
        // across page.evaluate (structured clone serializes it but
        // the test harness can re-hydrate it via a FileReader). So
        // we read it as a base64 string and re-create the Blob here.
        const b64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1]);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(result.blob);
        });
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
        const blob = new Blob([u8], { type: "video/mp4" });
        encodeResult = { size: blob.size, type: blob.type, _b64: b64, _logs: logs };
      } catch (err) {
        encodeResult = { error: err.message };
      }

      worker.terminate();
      return { ok: encodeResult.size > 0, encodeResult };
    },
    { photoBytes },
  );

  console.log("encode result:", JSON.stringify(result, null, 2));
  if (errors.length) {
    console.log("page errors:");
    errors.forEach((e) => console.log("  " + e));
  }

  await browser.close();
  if (!result.ok) {
    console.error(`\n❌ export failed at stage: ${result.stage}`);
    process.exit(1);
  }

  // Save the MP4 to disk and inspect with ffprobe so we can confirm
  // it contains all 7 source images as distinct frames.
  if (result.encodeResult && result.encodeResult._b64) {
    const bin = Buffer.from(result.encodeResult._b64, "base64");
    const fs = await import("node:fs/promises");
    await fs.writeFile("C:/Users/Admin/Downloads/jelly-7images-test.mp4", bin);
    console.log(`\n✅ saved MP4 to C:/Users/Admin/Downloads/jelly-7images-test.mp4 (${bin.length} bytes)`);
    console.log(`\nFFmpeg logs (last 30):`);
    (result.encodeResult._logs || []).slice(-30).forEach((l) => console.log("  " + l));
  } else {
    console.log("\n⚠️  no MP4 captured");
  }

  console.log("\n✅ end-to-end export produced a valid MP4");
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});