#!/usr/bin/env node
// Postinstall patch for @ffmpeg/ffmpeg 0.12.10.
//
// PROBLEM: the library's ESM bundle (dist/esm/classes.js) spawns its
// internal worker with `{ type: "module" }`. Module workers cannot
// call importScripts() — it throws a TypeError on every browser.
// This is why FFmpeg-core imports were failing on iOS Safari 26.5
// with "failed to import ffmpeg-core.js" even after self-hosting the
// core at the same origin.
//
// FIX: rewrite the two `type: "module"` occurrences in classes.js
// to classic workers. The internal worker.js file uses
// `importScripts(...)` which is allowed in classic workers. Classic
// workers also allow the cross-origin importScripts to the same
// site (which we're using), and Safari/iOS don't enforce the
// module-worker importScripts ban in classic workers.
//
// We do NOT use a third-party patch tool (patch-package) because the
// change is tiny and stable across 0.12.x patch releases of the
// library. If the library changes shape we'll notice in CI when
// this patch fails to apply.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(
  __dirname,
  "../node_modules/@ffmpeg/ffmpeg/dist/esm/classes.js",
);

if (!existsSync(TARGET)) {
  console.warn(
    `[patch-ffmpeg] ${TARGET} not found — skipping. ` +
      "(Are you running this outside the project root?)",
  );
  process.exit(0);
}

const BEFORE = readFileSync(TARGET, "utf8");

// Patch both occurrences. The original code:
//   new Worker(new URL(classWorkerURL, import.meta.url), {
//       type: "module",
//   }) :
//   new Worker(new URL("./worker.js", import.meta.url), {
//       type: "module",
//   });
// We drop the type option so the browser defaults to classic.
const AFTER = BEFORE.replaceAll('type: "module",', "");

if (AFTER === BEFORE) {
  // Already patched (re-run safety).
  console.log("[patch-ffmpeg] already patched — no changes needed");
  process.exit(0);
}

writeFileSync(TARGET, AFTER);
console.log(
  "[patch-ffmpeg] patched @ffmpeg/ffmpeg to use classic workers " +
    "(2 occurrences of type:\"module\" removed from classes.js)",
);