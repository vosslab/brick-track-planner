/**
 * Capture the startup, gallery, siding walkthrough, and R104 yard from a local Pages build.
 *
 * Usage:
 *   node tests/playwright/helper_readme_screenshots.mjs \
 *     http://127.0.0.1:4173/ /private/tmp/brick-track-planner-readme
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { expect } from "@playwright/test";
import { chromium } from "playwright";

import straightExamples from "../../data/straight_examples.json" with { type: "json" };

const [baseUrl, outputDirectory] = process.argv.slice(2);
if (!baseUrl || !outputDirectory) {
  throw new Error("Usage: helper_readme_screenshots.mjs <base-url> <output-directory>");
}

const output = resolve(outputDirectory);
await mkdir(output, { recursive: true });

const desktopViewport = { width: 1280, height: 800 };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: desktopViewport,
    deviceScaleFactor: 1,
  });
  const capture = async (name, target = page) => {
    await page.mouse.move(0, 0);
    await target.screenshot({
      path: `${output}/${name}.png`,
      animations: "disabled",
      caret: "hide",
    });
  };
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Start with your assigned display area" }).waitFor();
  await page.locator("#area-width").selectOption("128");
  await page.locator("#area-depth").selectOption("192");
  await capture("member_design_start");

  await page.setViewportSize({ width: 1920, height: 1720 });
  await page.locator("#start-browse-examples").click();
  const gallery = page.getByRole("dialog", { name: "Straight examples", exact: true });
  await expect(gallery.getByRole("button").locator("svg")).toHaveCount(straightExamples.length);
  const cardGrid = gallery.locator("#template-gallery-cards");
  await expect
    .poll(() => cardGrid.evaluate((grid) => grid.scrollHeight - grid.clientHeight))
    .toBe(0);
  await capture("straight_examples", gallery);
  await gallery.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize(desktopViewport);

  await page.getByRole("button", { name: "Create track plan" }).click();
  await expect(page.getByRole("heading", { name: "Add track" })).toBeFocused();
  await expect(page.locator("#tabletop [data-track-scene]")).toBeVisible();
  await page.getByRole("button", { name: "Preview on track" }).click();
  await expect(page.getByRole("button", { name: "Add to layout" })).toBeEnabled();
  await capture("member_parking_siding_preview");
  await page.getByRole("button", { name: "Add to layout" }).click();
  await expect(page.locator("#arrangement-info")).toContainText("Added Back-out parking siding");
  await page.getByRole("button", { name: "Fit view" }).click();
  await capture("member_parking_siding");

  await page.locator("#templates").selectOption("member-yard.ldr");
  await expect(page.getByLabel("Layout name")).toHaveValue("Member R104 right yard");
  await page.getByRole("button", { name: "Fit view" }).click();
  await capture("member_r104_yard");
} finally {
  await browser.close();
}
