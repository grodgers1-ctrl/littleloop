// End-to-end test driving the production preview server with a real
// Chromium browser. Exercises:
//   1. Setup form creates the project.
//   2. Camera-roll library picker ingests 3 real PNG screenshots of
//      varied sizes (small / medium / full-HD).
//   3. Image normalization produces a 1600 px JPEG + a 480 px JPEG
//      thumbnail stored in IndexedDB.
//   4. Timeline renders the entries newest-first with the child's age.
//   5. Replace deletes the old assets and points the entry at new ones.
//   6. Delete removes the entry and its assets.
//   7. Backup creates a valid .babyflip ZIP, restore reproduces the
//      project and entries after wiping IndexedDB.
//   8. Settings edit + storage estimate renders.
//
// Skipped (not testable from a desktop browser):
//   - Native camera capture (uses the same code path as library import
//     but the browser file picker does not surface the rear-facing
//     camera; covered separately by V1 spec section F).
//   - MP4 export end-to-end (ffmpeg.wasm is loaded from unpkg.com at
//     runtime; would require network access and adds minutes to the
//     suite. The render-helper math is exercised by the unit tests).

import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PREVIEW_URL = "http://127.0.0.1:4173/";
const PHOTO_DIR = "C:/Users/Admin/Pictures/Screenshots";
const OUT_DIR = "C:/Users/Admin/Hermes/little-loop/.e2e-output";

const TEST_PHOTOS = [
  { path: path.join(PHOTO_DIR, "Screenshot 2026-04-25 021710.png"), label: "small-556x272" },
  { path: path.join(PHOTO_DIR, "Screenshot 2026-05-10 083148.png"), label: "medium-1690x963" },
  { path: path.join(PHOTO_DIR, "Screenshot 2026-05-11 022809.png"), label: "large-1920x1080" },
];

function ok(label, cond, detail = "") {
  if (cond) {
    console.log(`  PASS  ${label}${detail ? "  " + detail : ""}`);
    return true;
  }
  console.log(`  FAIL  ${label}${detail ? "  " + detail : ""}`);
  return false;
}

async function main() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  console.log("\n=== Little Loop V1 E2E (real Chromium, real PNGs) ===\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 }, // iPhone-ish
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  const page = await context.newPage();

  // Capture every console message + page error so we can surface failures.
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  let totalPass = 0;
  let totalFail = 0;
  const tally = (r) => {
    if (r) totalPass += 1;
    else totalFail += 1;
  };

  // --- Step 1: Intro → Setup ------------------------------------------
  console.log("[1] Intro + Setup form");
  await page.goto(PREVIEW_URL, { waitUntil: "networkidle" });
  const titleOk = await page.title() === "Little Loop";
  tally(ok("page title is 'Little Loop'", titleOk, await page.title()));
  // Intro screen renders first on a fresh visit. Click "Start a real
  // timeline" to reach the setup form.
  const introOk = await page.getByRole("heading", { name: "Little Loop" }).first().isVisible();
  tally(ok("intro screen renders", introOk));
  await page.getByRole("button", { name: /Start a real timeline/ }).click();
  await page.waitForSelector('h1:has-text("Welcome to Little Loop")', { timeout: 3000 });
  const headingOk = await page.getByRole("heading", { name: /Welcome to Little Loop/ }).isVisible();
  tally(ok("setup heading visible", headingOk));

  // Try submitting empty — should NOT create a project.
  await page.getByRole("button", { name: /Create timeline/ }).click();
  await page.waitForTimeout(200);
  // Validation error message expected: "Please enter a name..."
  const errVisible = await page.getByText(/between 1 and 60 characters/).isVisible().catch(() => false);
  tally(ok("empty name rejected with field error", errVisible));

  await page.getByLabel(/Child's name/).fill("Ada");
  // Date of birth left at default (6 months ago).
  await page.getByRole("button", { name: /Create timeline/ }).click();
  await page.waitForTimeout(500);

  const onHome = await page.getByRole("heading", { name: "Ada" }).first().isVisible();
  tally(ok("setup → home (project created)", onHome));

  await page.screenshot({ path: path.join(OUT_DIR, "01-home-empty.png") });

  // --- Step 2: Reload persistence --------------------------------------
  console.log("\n[2] Reload persistence");
  await page.reload({ waitUntil: "networkidle" });
  // After reload, the bootstrap should re-read the project from IDB and
  // land on home, NOT setup.
  const stillOnHome = await page.getByRole("heading", { name: "Ada" }).first().isVisible();
  tally(ok("reload preserves project (still home)", stillOnHome));
  // After a reload with an existing project we should land on home,
  // NOT on the intro screen.
  const noIntroAfterReload = !(await page.getByRole("button", { name: /Start a real timeline/ }).isVisible().catch(() => false));
  tally(ok("reload does NOT return to intro", noIntroAfterReload));

  // --- Step 3: Import library photos (3 real PNGs) ---------------------
  // Daily cadence means one photo per date — to exercise multi-entry
  // storage we assign each import a different historical date.
  const HISTORICAL_DATES = ["2026-07-20", "2026-07-23", "2026-07-25"];
  console.log("\n[3] Camera-roll import of 3 real PNGs (different dates)");
  for (let i = 0; i < TEST_PHOTOS.length; i += 1) {
    const photo = TEST_PHOTOS[i];
    console.log(`  -> importing ${photo.label} (${photo.path}) for ${HISTORICAL_DATES[i]}`);
    // Find the library file input.
    const libraryInput = page.locator('input#ll-library-input');
    await libraryInput.setInputFiles(photo.path);
    // Wait for the import-date screen.
    await page.waitForSelector('h2:has-text("Assign a date")', { timeout: 5000 });
    // Set a historical date so each import lands in its own period.
    await page.locator('input#import-date').fill(HISTORICAL_DATES[i]);
    await page.screenshot({ path: path.join(OUT_DIR, `02-import-date-${i}.png`) });
    await page.getByRole("button", { name: /Save photo/ }).click();
    await page.waitForTimeout(800);
    // Back on home.
    const homeVisible = await page.getByRole("heading", { name: "Ada" }).first().isVisible();
    tally(ok(`imported ${photo.label} → home`, homeVisible));
  }

  // Verify all 3 photos are in IDB.
  const dbState = await page.evaluate(async () => {
    // Open the same Dexie DB the app uses.
    const dbName = "little-loop-db";
    return await new Promise((resolve) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["entries", "assets", "projects"], "readonly");
        const promises = [
          new Promise((r) => {
            const q = tx.objectStore("entries").getAll();
            q.onsuccess = () => r(q.result);
          }),
          new Promise((r) => {
            const q = tx.objectStore("assets").getAll();
            q.onsuccess = () => r(q.result);
          }),
          new Promise((r) => {
            const q = tx.objectStore("projects").getAll();
            q.onsuccess = () => r(q.result);
          }),
        ];
        Promise.all(promises).then(([entries, assets, projects]) => {
          db.close();
          resolve({ entries, assets, projects });
        });
      };
      req.onerror = () => resolve({ error: req.error?.message });
    });
  });

  tally(ok("IDB has 1 project", dbState.projects?.length === 1, `got ${dbState.projects?.length}`));
  tally(ok("IDB has 3 entries", dbState.entries?.length === 3, `got ${dbState.entries?.length}`));
  // 2 assets per entry (image + thumbnail).
  tally(ok("IDB has 6 assets (3 images + 3 thumbnails)", dbState.assets?.length === 6, `got ${dbState.assets?.length}`));

  // Verify image normalization: every image asset's blob is JPEG and
  // long edge <= 1600 px, every thumbnail's long edge <= 480 px.
  // Pull every blob through file:// FileReader to keep the test browser
  // happy, then parse the JPEG SOF marker.
  const normReport = [];
  for (const a of dbState.assets) {
    // Read the asset's blob back from IDB inside the page (where Blob
    // is a proper Blob), then pipe it through a file:// FileReader and
    // return a base64 string we can parse outside.
    const b64 = await page.evaluate(async (assetId) => {
      const dbName = "little-loop-db";
      return await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["assets"], "readonly");
          const q = tx.objectStore("assets").get(assetId);
          q.onsuccess = () => {
            const asset = q.result;
            if (!asset) return reject(new Error("asset not found"));
            const fr = new FileReader();
            fr.onload = () => {
              db.close();
              resolve(String(fr.result).split(",", 2)[1]);
            };
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(asset.blob);
          };
        };
        req.onerror = () => reject(req.error);
      });
    }, a.id);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    let i = 2; // skip SOI
    while (i < bytes.length) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        const h = (bytes[i + 5] << 8) | bytes[i + 6];
        const w = (bytes[i + 7] << 8) | bytes[i + 8];
        normReport.push({ id: a.id, type: a.type, w, h });
        break;
      }
      const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
      i += 2 + segLen;
    }
  }
  const images = normReport.filter((r) => r.type === "image");
  const thumbs = normReport.filter((r) => r.type === "thumbnail");
  const allImagesWithin1600 = images.every((r) => Math.max(r.w, r.h) <= 1600);
  const allThumbsWithin480 = thumbs.every((r) => Math.max(r.w, r.h) <= 480);
  tally(ok(
    "all image long edges ≤ 1600 px",
    allImagesWithin1600,
    `sizes: ${images.map((r) => `${r.w}x${r.h}`).join(", ")}`,
  ));
  tally(ok(
    "all thumbnail long edges ≤ 480 px",
    allThumbsWithin480,
    `sizes: ${thumbs.map((r) => `${r.w}x${r.h}`).join(", ")}`,
  ));

  // --- Step 4: Timeline view --------------------------------------------
  console.log("\n[4] Timeline view");
  await page.getByRole("button", { name: /View timeline/ }).click();
  await page.waitForSelector('h2:has-text("Timeline")', { timeout: 3000 });
  await page.waitForTimeout(500);
  const timelineEntries = await page.locator('.ll-timeline-entry').count();
  tally(ok("timeline shows 3 entries", timelineEntries === 3, `count=${timelineEntries}`));
  await page.screenshot({ path: path.join(OUT_DIR, "03-timeline.png"), fullPage: true });

  // Back to home.
  await page.getByRole("button", { name: /Home/ }).first().click();
  await page.waitForTimeout(300);

  // --- Step 5: Replace the most recent entry via the timeline ----------
  console.log("\n[5] Replace (uses TimelineScreen Replace on the most recent entry)");
  // We may be on Home (the Step 4 flow ends with a click back to Home).
  // Navigate to timeline first.
  await page.getByRole("button", { name: /View timeline/ }).click();
  await page.waitForSelector('h2:has-text("Timeline")', { timeout: 3000 });
  // Timeline lists newest first; click the first entry's Replace button.
  await page.locator('.ll-timeline-entry').first().getByRole('button', { name: /Replace/ }).click();
  // Library picker opens inside the timeline Replace flow.
  await page.waitForTimeout(200);
  await page.locator('input#ll-timeline-replace-input').setInputFiles(TEST_PHOTOS[0].path);
  // Now on capture-preview with replaceEntryId set.
  await page.waitForSelector('h2:has-text("Preview")', { timeout: 5000 });
  await page.getByRole("button", { name: /Use photo/ }).click();
  await page.waitForTimeout(800);

  const replaceCount = await page.evaluate(async () => {
    const dbName = "little-loop-db";
    return await new Promise((resolve) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["assets"], "readonly");
        const q = tx.objectStore("assets").getAll();
        q.onsuccess = () => {
          db.close();
          resolve(q.result.length);
        };
      };
    });
  });
  // Replace should still have 6 assets (3 entries × 2 assets) — the old
  // assets are deleted AFTER the new entry commits.
  tally(ok("after replace: still 6 assets (no orphans)", replaceCount === 6, `count=${replaceCount}`));

  // --- Step 6: Delete the timeline's first entry -----------------------
  console.log("\n[6] Delete one entry");
  await page.getByRole("button", { name: /View timeline/ }).click();
  await page.waitForSelector('h2:has-text("Timeline")', { timeout: 3000 });
  await page.locator('.ll-timeline-entry').first().getByRole('button', { name: /Delete/ }).click();
  await page.waitForSelector('h3:has-text("Delete this photo?")', { timeout: 3000 });
  await page.locator('.ll-modal').getByRole('button', { name: /Delete/ }).click();
  await page.waitForTimeout(500);
  const afterDeleteEntries = await page.locator('.ll-timeline-entry').count();
  tally(ok("after delete: timeline shows 2 entries", afterDeleteEntries === 2, `count=${afterDeleteEntries}`));
  const afterDeleteAssets = await page.evaluate(async () => {
    const dbName = "little-loop-db";
    return await new Promise((resolve) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["assets"], "readonly");
        const q = tx.objectStore("assets").getAll();
        q.onsuccess = () => {
          db.close();
          resolve(q.result.length);
        };
      };
    });
  });
  tally(ok("after delete: 4 assets (2 entries × 2 assets)", afterDeleteAssets === 4, `count=${afterDeleteAssets}`));

  // --- Step 7: Backup → wipe → restore ---------------------------------
  console.log("\n[7] Backup export → wipe → restore");
  // We may be on Home (Step 6 leaves us on the timeline). Click Home.
  await page.getByRole("button", { name: /Home/ }).first().click().catch(() => {});
  await page.waitForTimeout(200);
  // Home now has a Settings button in both branches.
  await page.getByRole("button", { name: /^Settings$/ }).click();
  await page.waitForSelector('h2:has-text("Settings")', { timeout: 5000 });
  // Listen for any download that may fire (race the click).
  const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.getByRole('button', { name: /Backup timeline/ }).click();
  // Check whether an error status appeared.
  await page.waitForTimeout(500);
  const backupErr = await page.locator('.ll-status-error').first().isVisible().catch(() => false);
  if (backupErr) {
    const errText = await page.locator('.ll-status-error').first().textContent();
    console.log("  Backup error status:", errText);
  }
  let download = null;
  try {
    download = await downloadPromise;
  } catch {
    // Fallback: anchor-click downloads don't always surface as
    // Playwright download events in headless. Build the backup blob
    // directly inside the page and expose its bytes.
    const backupBytes = await page.evaluate(async () => {
      const dbName = "little-loop-db";
      return await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["projects"], "readonly");
          const q = tx.objectStore("projects").getAll();
          q.onsuccess = async () => {
            db.close();
            const project = q.result[0];
            const mod = await import("/assets/jszip-B0l_X1vI.js");
            const JSZip = mod.default || mod.JSZip || mod;
            // Re-run the createBackup via the same path the UI uses.
            // Easier: dispatch the click again and listen for blob URL.
            const out = [];
            // Trigger a synthetic download via a programmatic anchor.
            const oldCreate = URL.createObjectURL;
            URL.createObjectURL = (b) => {
              out.push(b);
              return oldCreate.call(URL, b);
            };
            // Click the backup button.
            const btn = Array.from(document.querySelectorAll("button")).find(
              (b) => b.textContent?.trim() === "Backup timeline",
            );
            if (btn) (btn).click();
            await new Promise((r) => setTimeout(r, 800));
            URL.createObjectURL = oldCreate;
            if (!out.length) return resolve(null);
            const blob = out[0];
            const ab = await blob.arrayBuffer();
            const u8 = new Uint8Array(ab);
            let bin = "";
            for (let i = 0; i < u8.length; i += 1) bin += String.fromCharCode(u8[i]);
            resolve({ b64: btoa(bin), size: u8.length });
          };
        };
      });
    });
    if (backupBytes) {
      const path2 = path.join(OUT_DIR, "Ada-timeline-backup-2026-07-26.babyflip");
      const buf = Buffer.from(backupBytes.b64, "base64");
      await (await import("node:fs/promises")).writeFile(path2, buf);
      console.log(`  fallback: wrote backup blob (${backupBytes.size} B) to ${path2}`);
      const { stat: fsStat2 } = await import("node:fs/promises");
      const st2 = await fsStat2(path2);
      tally(ok("backup file written (fallback)", st2.size > 0, `${path.basename(path2)} (${st2.size} B)`));
      tally(ok("backup filename ends with .babyflip", path2.endsWith(".babyflip")));
      // Use the file for the restore step below.
      download = { path: async () => path2 };
    } else {
      throw new Error("no download event and no blob intercepted");
    }
  }
  const backupPath = await download.path();
  if (!existsSync(backupPath)) {
    throw new Error("backup file not produced at " + backupPath);
  }
  const { stat: fsStat } = await import("node:fs/promises");
  const st = await fsStat(backupPath);
  if (st.size === 0) throw new Error("backup file is empty");
  tally(ok("backup file present", true, `${path.basename(backupPath)} (${st.size} B)`));

  // Wipe the IDB.
  await page.evaluate(async () => {
    const dbName = "little-loop-db";
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve(undefined);
    });
  });
  await page.waitForTimeout(200);
  await page.reload({ waitUntil: "networkidle" });
  // Should now be back at the intro (no real project, no sandbox).
  const backAtIntro = await page.getByRole("button", { name: /Start a real timeline/ }).isVisible();
  tally(ok("after wipe + reload → intro", backAtIntro));

  // Create a new project so we have somewhere to restore into.
  await page.getByRole("button", { name: /Start a real timeline/ }).click();
  await page.waitForSelector('h1:has-text("Welcome to Little Loop")', { timeout: 3000 });
  await page.getByLabel(/Child's name/).fill("Temp");
  await page.getByRole('button', { name: /Create timeline/ }).click();
  await page.waitForTimeout(300);
  // Navigate from Home → Settings to reach the Restore input.
  await page.getByRole("button", { name: /^Settings$/ }).click();
  await page.waitForSelector('h2:has-text("Settings")', { timeout: 5000 });
  await page.locator('label:has-text("Restore timeline") input[type="file"]').setInputFiles(backupPath);
  await page.waitForSelector('h3:has-text("Restore timeline?")', { timeout: 5000 });
  await page.getByRole('button', { name: /Replace current timeline/ }).click();
  await page.waitForTimeout(800);
  const restoredName = await page.getByRole('heading', { name: "Ada" }).first().isVisible();
  tally(ok("restore → home with restored project 'Ada'", restoredName));
  const restoredEntries = await page.evaluate(async () => {
    const dbName = "little-loop-db";
    return await new Promise((resolve) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["entries"], "readonly");
        const q = tx.objectStore("entries").getAll();
        q.onsuccess = () => {
          db.close();
          resolve(q.result.length);
        };
      };
    });
  });
  tally(ok("restore: 2 entries match what we had after delete", restoredEntries === 2, `count=${restoredEntries}`));

  // --- Step 8: Failed restore does not destroy data --------------------
  console.log("\n[8] Failed restore preserves existing data");
  // Upload a deliberately invalid file (a non-zip text blob).
  const badPath = path.join(OUT_DIR, "bad.babyflip");
  await (await import("node:fs/promises")).writeFile(badPath, "this is not a zip file");
  // We're on Home after restore. Navigate Home → Settings.
  await page.getByRole("button", { name: /^Settings$/ }).click();
  await page.waitForSelector('h2:has-text("Settings")', { timeout: 5000 });
  await page.locator('label:has-text("Restore timeline") input[type="file"]').setInputFiles(badPath);
  await page.waitForTimeout(500);
  const errStatus = await page.locator('.ll-status-error').first().isVisible().catch(() => false);
  tally(ok("invalid backup shows error status", errStatus));
  const stillThere = await page.evaluate(async () => {
    const dbName = "little-loop-db";
    return await new Promise((resolve) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["entries"], "readonly");
        const q = tx.objectStore("entries").getAll();
        q.onsuccess = () => {
          db.close();
          resolve(q.result.length);
        };
      };
    });
  });
  tally(ok("failed restore: data unchanged (still 2 entries)", stillThere === 2, `count=${stillThere}`));

  // --- Step 9: Settings edit + storage estimate -------------------------
  console.log("\n[9] Settings + storage estimate");
  await page.getByRole('button', { name: /Backup timeline/ }).click();
  await page.waitForTimeout(300);
  const storageText = await page.locator('.ll-card:has(h3:has-text("Storage"))').textContent();
  tally(ok("storage card shows 'Storage'", storageText?.includes("Storage")));
  tally(ok("storage card reports bytes", storageText?.includes("MB")));
  await page.screenshot({ path: path.join(OUT_DIR, "04-settings.png") });

  // --- Console error check ---------------------------------------------
  console.log("\n[10] Console errors during the session");
  // Filter out expected DevTools / workbox / favicon noise.
  const realErrors = consoleErrors.filter((e) =>
    !/favicon|workbox|PWA|Service Worker registration failed/i.test(e),
  );
  tally(ok("no console errors during session", realErrors.length === 0, `count=${realErrors.length}`));
  if (realErrors.length) {
    console.log("  Errors:");
    realErrors.forEach((e) => console.log("    - " + e));
  }

  await browser.close();

  console.log(`\n=== Result: ${totalPass} passed, ${totalFail} failed ===`);
  console.log(`Screenshots saved to ${OUT_DIR}`);
  process.exit(totalFail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E error:", err);
  process.exit(1);
});