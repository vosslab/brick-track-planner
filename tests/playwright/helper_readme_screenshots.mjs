/**
 * Capture the documentation screenshots and placement demo from a local Pages build.
 * Requires Chromium from Playwright and cwebp and img2webp from libwebp.
 *
 * Usage:
 *   node tests/playwright/helper_readme_screenshots.mjs \
 *     http://127.0.0.1:4173/ /private/tmp/brick-track-planner-readme
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect } from "@playwright/test";
import { chromium } from "playwright";

import trackExamples from "../../data/track_examples.json" with { type: "json" };

const [baseUrl, outputDirectory] = process.argv.slice(2);
if (!baseUrl || !outputDirectory) {
  throw new Error("Usage: helper_readme_screenshots.mjs <base-url> <output-directory>");
}

const output = resolve(outputDirectory);
await mkdir(output, { recursive: true });

// Documentation frames use the repository's 16:10 target at CSS-pixel resolution.
const desktopViewport = { width: 1600, height: 1000 };
const phoneViewport = { width: 390, height: 844 };
const screenshotOptions = { animations: "disabled", caret: "hide" };
async function verifyTemplate(page, file) {
  const template = new URL(`../../templates/${file}`, import.meta.url);
  const [response, source] = await Promise.all([
    page.waitForResponse(new URL(`templates/${file}`, page.url()).href),
    readFile(template),
  ]);
  assert.ok(
    response.ok() && (await response.body()).equals(source),
    `Served template ${file} differs from the checkout. Rebuild the local Pages site.`,
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: desktopViewport });
  const start = async (target = page) => {
    await target.goto(baseUrl);
    await expect(
      target.getByRole("heading", { name: "Start with your assigned display area" }),
    ).toBeVisible();
    await target.evaluate(() => document.fonts.ready);
  };
  const capture = async (name, target = page, scale = "css") => {
    execFileSync("cwebp", ["-quiet", "-q", "90", "-o", join(output, `${name}.webp`), "--", "-"], {
      input: await target.screenshot({ ...screenshotOptions, scale }),
    });
  };
  const track = page.locator("#tabletop [data-kind=track]");
  const fit = async (target = page) => {
    await target.getByRole("button", { name: "Fit view", exact: true }).click();
    await target.mouse.move(0, 0);
  };
  const openMenu = async (target, name) => {
    const menu = target.locator("details").filter({ has: target.getByText(name, { exact: true }) });
    await menu.locator("summary").click();
    await expect(menu).toHaveAttribute("open", "");
    return menu;
  };
  const closeMenu = async (menu) => {
    if (await menu.evaluate((element) => element.hasAttribute("open"))) {
      await menu.locator("summary").click();
    }
  };
  const create = (target = page) =>
    target.getByRole("button", { name: "Create track plan", exact: true }).click();
  await start();
  await capture("member_design_start");
  await page.getByRole("radio", { name: /^Curve/ }).check();
  await capture("member_curve_options");
  await page.getByRole("radio", { name: /^Straight/ }).check();

  const phonePage = await browser.newPage({
    viewport: phoneViewport,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await start(phonePage);
    await capture("mobile_setup", phonePage);
    await phonePage.getByRole("button", { name: "Browse examples", exact: true }).click();
    const phoneGallery = phonePage.getByRole("dialog", { name: "Track examples", exact: true });
    await phoneGallery
      .getByRole("button", { name: "Open BOS · Back-out siding", exact: true })
      .click();
    await expect(phonePage.getByRole("group", { name: "Track plan", exact: true })).toBeVisible();
    await capture("mobile_editor", phonePage);
  } finally {
    await phonePage.close();
  }

  await page.setViewportSize({ width: 1920, height: 2000 });
  await Promise.all([
    ...trackExamples.map(({ file }) => verifyTemplate(page, file)),
    page.locator("#start-browse-examples").click(),
  ]);
  const gallery = page.getByRole("dialog", { name: "Track examples", exact: true });
  await expect(gallery.getByRole("button").locator("svg")).toHaveCount(trackExamples.length);
  const collections = gallery.locator("#template-gallery-sections");
  await expect
    .poll(() => collections.evaluate((groups) => groups.scrollHeight - groups.clientHeight))
    .toBe(0);
  await capture("straight_examples", gallery, "css");
  await gallery.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize(desktopViewport);

  await create();
  await expect(page.getByRole("button", { name: "Preview on track", exact: true })).toBeVisible();
  await expect(track.first()).toBeVisible();
  await expect(page.locator("#design-size")).toContainText("60 × 40");
  await capture("member_mainline_start");

  let layoutMenu = await openMenu(page, "Layout");
  await layoutMenu.getByRole("button", { name: "Design area", exact: true }).click();
  const outline = page.getByRole("dialog", { name: "Edit your design area" });
  await outline
    .getByLabel("Table edge")
    .selectOption({ label: "North \u00b7 0\u201360 in at 0 in" });
  await outline.getByLabel("Edge length to change").selectOption("partial");
  await outline.getByLabel("Start from left (in)").fill("10");
  await outline.getByLabel("Length along edge (in)").fill("20");
  await outline.getByLabel("Distance (in)").fill("5");
  await expect(outline.getByRole("status")).toHaveText("60 \u00d7 45 in overall");
  await capture("member_table_shift", outline);
  await outline.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(outline).toBeHidden();

  await page.getByRole("button", { name: "Preview on track" }).click();
  await expect(page.getByRole("button", { name: "Add to layout" })).toBeEnabled();
  await capture("member_parking_siding_preview");
  await page.getByRole("button", { name: "Add to layout" }).click();
  await expect(page.locator("#arrangement-info")).toContainText("Added Back-out parking siding");
  await fit();
  await capture("member_parking_siding");

  layoutMenu = await openMenu(page, "Layout");
  const layoutName = layoutMenu.getByLabel("Layout name");
  await layoutName.fill("Parking siding");
  await layoutName.blur();
  await layoutMenu.getByRole("button", { name: "Duplicate plan", exact: true }).click();
  layoutMenu = await openMenu(page, "Layout");
  const copiedLayoutName = layoutMenu.getByLabel("Layout name");
  await copiedLayoutName.fill("Parking option B");
  await copiedLayoutName.blur();
  await closeMenu(layoutMenu);
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

  for (const { code, name } of trackExamples) {
    const examplePage = await browser.newPage({ viewport: desktopViewport });
    try {
      await start(examplePage);
      await examplePage.locator("#start-browse-examples").click();
      const exampleGallery = examplePage.getByRole("dialog", {
        name: "Track examples",
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

  const fileMenu = await openMenu(page, "File");
  const templateFiles = await fileMenu
    .getByLabel("Track templates")
    .locator('option[value$=".ldr"]')
    .evaluateAll((entries) => entries.map((entry) => entry.value));
  await closeMenu(fileMenu);
  for (const file of templateFiles) {
    const templatePage = await browser.newPage({ viewport: desktopViewport });
    try {
      await start(templatePage);
      await Promise.all([
        verifyTemplate(templatePage, file),
        templatePage.getByLabel("Start from a template").selectOption(file),
      ]);
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
    await expect(target.getByRole("radio", { name: "Track parts" })).toBeChecked();
    await expect(target.getByRole("button", { name: "Place at center" })).toBeEnabled();
    await expect(target.locator("#tabletop [data-kind=track]")).toHaveCount(0);
  };
  const choosePartCategory = async (target, name, partModel) => {
    await target.getByRole("radio", { name, exact: true }).check();
    const cards = target.locator("#part-results .part-card");
    const firstCard = partModel ? cards.filter({ hasText: partModel }) : cards.first();
    const part = firstCard.getByRole("radio");
    await expect(part).toBeVisible();
    await part.check();
    await expect(part).toBeChecked();
  };
  await startBlank();
  await capture("general_blank_start");
  await choosePartCategory(page, "Switches");
  await capture("track_parts_switches");

  const phoneParts = await browser.newPage({
    viewport: phoneViewport,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await startBlank(phoneParts);
    await choosePartCategory(phoneParts, "Switches");
    await phoneParts.locator("#library-panel").evaluate((panel) => {
      panel.scrollIntoView({ block: "start" });
    });
    await capture("mobile_track_parts", phoneParts);
  } finally {
    await phoneParts.close();
  }
  await choosePartCategory(page, "Straights", "RC/PF straight S16");

  const demonstratePlacement = async (target, frame) => {
    await target.getByLabel("Place at", { exact: true }).selectOption("drawing");
    const place = target.getByRole("button", { name: "Place on drawing", exact: true });
    await place.focus();
    await frame?.(1000);
    await place.press("Enter");
    await expect(target.locator("#piece-info")).toContainText(
      "Click or tap the drawing to place the part.",
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
