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
  };
  const capture = async (name, target = page, scale = "device") => {
    await page.mouse.move(0, 0);
    execFileSync("cwebp", ["-quiet", "-q", "90", "-o", join(output, `${name}.webp`), "--", "-"], {
      input: await target.screenshot({ ...screenshotOptions, scale }),
    });
  };
  const track = page.locator("#tabletop [data-kind=track]");
  const fit = () => page.getByRole("button", { name: "Fit view", exact: true }).click();
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
  await expect(page.getByRole("heading", { name: "Add track" })).toBeFocused();
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

  for (const { code, name } of straightExamples) {
    await page.getByRole("button", { name: "Browse straight examples", exact: true }).click();
    await gallery.getByRole("button", { name: `Open ${code} · ${name}`, exact: true }).click();
    await expect(layoutName).toHaveValue(name);
    await fit();
    await capture(`example_${code.toLowerCase()}`);
  }

  const templates = page.getByLabel("Track templates");
  const options = templates.locator('option[value$=".ldr"]');
  await expect(options.first()).toBeAttached();
  const templateFiles = await options.evaluateAll((entries) => entries.map((entry) => entry.value));
  for (const file of templateFiles) {
    const previousName = await layoutName.inputValue();
    await templates.selectOption(file);
    await expect(layoutName).not.toHaveValue(previousName);
    await expect(track.first()).toBeVisible();
    await fit();
    const name =
      file === "member-yard.ldr" ? "member_r104_yard" : file.slice(0, -4).replaceAll("-", "_");
    await capture(name);
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
