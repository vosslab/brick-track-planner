/**
 * Capture the documentation screenshots and placement demo from a local Pages build.
 * Requires Chromium from Playwright and cwebp and img2webp from libwebp.
 *
 * Usage:
 *   node tests/playwright/helper_readme_screenshots.mjs \
 *     http://127.0.0.1:4173/ /private/tmp/brick-track-planner-readme
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

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
const screenshotOptions = { animations: "disabled", caret: "hide" };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: desktopViewport,
    deviceScaleFactor: 1.5,
  });
  const start = async (target = page) => {
    await target.goto(baseUrl);
    await expect(
      target.getByRole("heading", { name: "Start with your assigned display area" }),
    ).toBeVisible();
    await target.evaluate(() => document.fonts.ready);
  };
  const capture = async (name, target = page, scale = "device") => {
    execFileSync("cwebp", ["-quiet", "-q", "90", "-o", join(output, `${name}.webp`), "--", "-"], {
      input: await target.screenshot({ ...screenshotOptions, scale }),
    });
  };
  const track = page.locator("#tabletop [data-kind=track]");
  const fit = (target = page) =>
    target.getByRole("button", { name: "Fit view", exact: true }).click();
  const create = (target = page) =>
    target.getByRole("button", { name: "Create track plan", exact: true }).click();
  const layoutName = page.getByLabel("Layout name");
  await start();
  await capture("member_design_start");
  await page.getByRole("radio", { name: /^Curve/ }).check();
  await capture("member_curve_options");
  await page.getByRole("radio", { name: /^Straight/ }).check();

  await page.setViewportSize({ width: 1920, height: 1720 });
  await page.locator("#start-browse-examples").click();
  const gallery = page.getByRole("dialog", { name: "Straight examples", exact: true });
  await expect(gallery.getByRole("button").locator("svg")).toHaveCount(straightExamples.length);
  const collections = gallery.locator("#template-gallery-sections");
  await expect
    .poll(() => collections.evaluate((groups) => groups.scrollHeight - groups.clientHeight))
    .toBe(0);
  await capture("straight_examples", gallery, "css");
  await gallery.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize(desktopViewport);

  await create();
  await expect(page.getByRole("heading", { name: "Add track" })).toBeVisible();
  await expect(track.first()).toBeVisible();
  await expect(page.locator("#design-size")).toContainText("60 × 40");
  await capture("member_mainline_start");

  await page.getByRole("button", { name: "Preview on track" }).click();
  await expect(page.getByRole("button", { name: "Add to layout" })).toBeEnabled();
  await capture("member_parking_siding_preview");
  await page.getByRole("button", { name: "Add to layout" }).click();
  await expect(page.locator("#arrangement-info")).toContainText("Added Back-out parking siding");
  await fit();
  await capture("member_parking_siding");

  await layoutName.fill("Parking siding");
  await layoutName.blur();
  await page.getByRole("button", { name: "Duplicate plan", exact: true }).click();
  await layoutName.fill("Parking option B");
  await layoutName.blur();
  const tabs = page.getByRole("tablist", { name: "Open layouts" });
  await expect(tabs.getByRole("tab", { name: "Parking siding", exact: true })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Parking option B", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await capture("layout_tabs");

  const selectedPieces = [track.nth(1), track.nth(2)];
  const boxes = await Promise.all(selectedPieces.map((piece) => piece.boundingBox()));
  const selection = {
    left: Math.min(...boxes.map(({ x }) => x)) - 8,
    top: Math.min(...boxes.map(({ y }) => y)) - 8,
    right: Math.max(...boxes.map(({ x, width }) => x + width)) + 8,
    bottom: Math.max(...boxes.map(({ y, height }) => y + height)) + 8,
  };
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  const tabletop = await page.locator("#tabletop").boundingBox();
  await page.mouse.click(tabletop.x + 8, tabletop.y + 8);
  await page.keyboard.down(modifier);
  await page.mouse.move(selection.left, selection.top);
  await page.mouse.down();
  await page.mouse.move(selection.right, selection.bottom, { steps: 3 });
  await expect(page.locator(".track-selection-box")).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up(modifier);
  await expect(page.locator('#tabletop [data-kind="track"][aria-pressed="true"]')).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Delete selected track", exact: true }),
  ).toBeEnabled();
  await capture("select_multiple_track");

  for (const { code, name } of straightExamples) {
    const examplePage = await browser.newPage({
      viewport: desktopViewport,
      deviceScaleFactor: 1.5,
    });
    try {
      await start(examplePage);
      await examplePage.locator("#start-browse-examples").click();
      const exampleGallery = examplePage.getByRole("dialog", {
        name: "Straight examples",
        exact: true,
      });
      await exampleGallery
        .getByRole("button", { name: `Open ${code} · ${name}`, exact: true })
        .click();
      await expect(examplePage.getByLabel("Layout name")).toHaveValue(name);
      await fit(examplePage);
      await capture(`example_${code.toLowerCase()}`, examplePage);
    } finally {
      await examplePage.close();
    }
  }

  const templateFiles = await page
    .getByLabel("Track templates")
    .locator('option[value$=".ldr"]')
    .evaluateAll((entries) => entries.map((entry) => entry.value));
  for (const file of templateFiles) {
    const templatePage = await browser.newPage({
      viewport: desktopViewport,
      deviceScaleFactor: 1.5,
    });
    try {
      await start(templatePage);
      await templatePage.getByLabel("Start from a template").selectOption(file);
      await expect(templatePage.locator("#tabletop [data-kind=track]").first()).toBeVisible();
      await fit(templatePage);
      const name =
        file === "member-yard.ldr" ? "member_r104_yard" : file.slice(0, -4).replaceAll("-", "_");
      await capture(name, templatePage);
    } finally {
      await templatePage.close();
    }
  }

  const startBlank = async (target = page) => {
    await start(target);
    await target.getByRole("radio", { name: /General/ }).check();
    await target.getByLabel("Design name").fill("My general layout");
    await create(target);
    await expect(target.getByRole("radio", { name: "Single piece" })).toBeChecked();
    await expect(target.getByRole("button", { name: "Place at center" })).toBeEnabled();
    await expect(target.locator("#tabletop [data-kind=track]")).toHaveCount(0);
  };
  await startBlank();
  await capture("general_blank_start");

  const demonstratePlacement = async (target, frame) => {
    await target.getByLabel("Place at", { exact: true }).selectOption("drawing");
    const place = target.getByRole("button", { name: "Place on drawing", exact: true });
    await place.focus();
    await frame?.(1000);
    await place.press("Enter");
    await expect(target.locator("#piece-info")).toContainText(
      "Click or tap the drawing to place the piece.",
    );
    await frame?.(950);
    await target.getByRole("group", { name: "Track plan", exact: true }).click();
    await expect(target.locator("#tabletop [data-kind=track]")).toHaveCount(1);
    await expect(target.getByRole("status")).toContainText("Placed RC/PF straight S16");
    await frame?.(1750);
  };
  const demoViewport = { width: 1200, height: 750 };
  await page.setViewportSize(demoViewport);
  await fit();
  const frames = await mkdtemp(join(output, "placement_"));
  try {
    const frameArgs = [];
    const frame = async (duration) => {
      const file = join(frames, `${frameArgs.length / 3}.png`);
      await page.screenshot({ ...screenshotOptions, scale: "css", path: file });
      frameArgs.push("-d", String(duration), file);
    };
    await page.mouse.move(0, 0);
    await frame(900);
    await demonstratePlacement(page, frame);
    execFileSync("img2webp", [
      "-loop",
      "1",
      "-lossy",
      "-q",
      "90",
      ...frameArgs,
      "-o",
      join(output, "place_single_track_demo.webp"),
    ]);
  } finally {
    await rm(frames, { recursive: true });
  }
  const reduced = await browser.newPage({ viewport: demoViewport, reducedMotion: "reduce" });
  await startBlank(reduced);
  await demonstratePlacement(reduced);
} finally {
  await browser.close();
}
