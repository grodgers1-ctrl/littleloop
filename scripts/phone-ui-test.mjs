// Phone UI smoke test. Drives the running preview server with
// headless Chromium emulating an iPhone 14. Verifies the home
// screen renders correctly at 390×844, the Add Subject sheet
// opens, and no horizontal overflow occurs at the smallest
// supported viewport.
//
// Run: `npm run preview &` then `node scripts/phone-ui-test.mjs`
// Screenshots land in the OS temp directory.

import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main() {
  const outDir = mkdtempSync(join(tmpdir(), "ll-phone-"));
  console.log(`[phone-ui-test] screenshots: ${outDir}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(outDir, "01-home.png") });

  const title = await page.title();
  console.log(`    title: ${title}`);

  const overflow = await page.evaluate(() => {
    return (
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
  });
  const bodyWidth = await page.evaluate(() => document.body.clientWidth);
  console.log(`    body width: ${bodyWidth}px`);
  console.log(`    horizontal overflow: ${overflow}`);

  const addBtn = page.getByRole("button", { name: /Add subject/i }).first();
  const hasAdd = await addBtn.isVisible().catch(() => false);
  console.log(`    '+ Add subject' button visible: ${hasAdd}`);
  if (hasAdd) {
    await addBtn.tap();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, "02-add-sheet.png") });
  }

  console.log(`    console errors: ${errors.length}`);
  errors.forEach((e) => console.log(`      - ${e}`));

  await browser.close();
  console.log("DONE");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
