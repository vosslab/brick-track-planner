/**
 * Capture the stable README starting and yard views from a locally staged Pages build.
 *
 * Usage:
 *   node tests/playwright/helper_readme_screenshots.mjs \
 *     http://127.0.0.1:4173/brick-track-planner/ /private/tmp/brick-track-planner-readme
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

const [baseUrl, outputDirectory] = process.argv.slice(2);
if (!baseUrl || !outputDirectory) {
  throw new Error("Usage: helper_readme_screenshots.mjs <base-url> <output-directory>");
}

const output = resolve(outputDirectory);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "New design" }).waitFor();
  await page.getByRole("group", { name: "Track plan", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/member_design_start.png` });

  await page.getByLabel("Example layouts").selectOption({ label: "Member yard" });
  await page.locator("[data-piece-id]").first().waitFor();
  await page.getByRole("button", { name: "Fit view" }).click();
  await page.screenshot({ path: `${output}/member_yard.png` });
} finally {
  await browser.close();
}
