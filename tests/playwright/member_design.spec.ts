import { readFile } from "node:fs/promises";

import { expect } from "@playwright/test";

import { boot, chooseFile, example, saveProject, test, watchErrors } from "./helper_planner";

async function start(
  page: Parameters<typeof boot>[0],
  assignment: "straight" | "corner",
  width: string,
  depth: string,
): Promise<void> {
  await page.getByRole("button", { name: "New design", exact: true }).click();
  const dialog = page.locator("#area-dialog");
  await dialog.getByLabel("Design name").fill(`${assignment} member plan`);
  await dialog.locator(`input[name="assignment"][value="${assignment}"]`).check();
  await dialog.locator("#area-width").selectOption(width);
  await dialog.locator("#area-depth").selectOption(depth);
  await dialog.getByRole("button", { name: "Create track plan", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#tabletop [data-track-scene]")).toBeVisible();
}

async function previewAndApply(page: Parameters<typeof boot>[0], value: string): Promise<void> {
  await page.locator("#arrangement").selectOption(value);
  await page.locator("#anchor").selectOption("mainline");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#arrangement-info")).toContainText("fit");
  const apply = page.getByRole("button", { name: "Apply", exact: true });
  await expect(apply).toBeEnabled();
  await apply.click();
}

async function traceFromInnerMainlineTo(
  page: Parameters<typeof boot>[0],
  itemId: string,
): Promise<void> {
  const inner = page.locator("#trace-from option").filter({ hasText: "inner mainline" }).first();
  await expect(inner).toBeAttached();
  const value = await inner.getAttribute("value");
  expect(value).not.toBeNull();
  await page.locator("#trace-from").selectOption(value!);
  await page.getByRole("button", { name: "Trace route", exact: true }).click();
  await page.locator(`[data-piece-id="${itemId}"][data-port-id]`).first().click({ force: true });
  await expect(page.locator("#route-info")).toContainText(/Connected route through [1-9]/);
  await expect(
    page.locator("#tabletop [data-route-path], #tabletop [data-route-joint]").first(),
  ).toBeAttached();
}

test("member creates a straight 60 by 40 NILTC design with automatic coverage", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await boot(page, { startAdvanced: false });
  await start(page, "straight", "192", "128");

  await expect(page.getByLabel("Layout name")).toHaveValue("straight member plan");
  await expect(page.locator("#design-size")).toContainText("60");
  await expect(page.locator("#tabletop [data-baseplate-field]")).toBeVisible();
  await expect(page.locator("#scene-item-inner-1")).toBeVisible();
  await expect(page.locator("#niltc-issues")).toBeEmpty();
  await page.locator("#scene-item-inner-1").click();
  await expect(page.locator("#selection-info")).not.toContainText("Select a track piece");
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  await expect(page.locator("#tabletop [data-track-scene]")).toBeVisible();

  const saved = await saveProject(page);
  expect(saved.project).toMatchObject({
    version: 3,
    name: "straight member plan",
    area: { width: 192, depth: 128, fronts: ["north"], niltc: "straight" },
  });
  expect(saved.project.items).toHaveLength(24);
  expect(saved.project.items.every((item) => !("tableId" in item))).toBe(true);
  expect(saved.project.items.every((item) => item.kind === "track")).toBe(true);
  expect(errors).toEqual([]);
});

test("member creates a 40 by 60 corner with both standard curve radii", async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page, { startAdvanced: false });
  await start(page, "corner", "128", "192");

  const saved = await saveProject(page);
  expect(saved.project.area).toMatchObject({
    width: 128,
    depth: 192,
    niltc: "corner",
    fronts: ["north", "east"],
  });
  const radii = saved.project.items.flatMap((item) => (item.kind === "track" ? [item.partId] : []));
  expect(radii.filter((partId) => partId === "bricktracks:r104")).toHaveLength(8);
  expect(radii.filter((partId) => partId === "bricktracks:r120")).toHaveLength(8);
  await expect(page.locator('#tabletop [data-port-id][data-open="true"]')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("member applies parking and a yard, traces a route, saves, opens, imports, and exports PDF", async ({
  page,
  browser,
  baseURL,
  viewport,
  hasTouch,
  isMobile,
}) => {
  const errors = watchErrors(page);
  await boot(page, { startAdvanced: false });
  await start(page, "straight", "320", "192");
  const starterTrackCount = (await saveProject(page)).project.items.length;

  await previewAndApply(page, "parking:r40-back-out");
  const afterParking = await saveProject(page);
  expect(afterParking.project.items.length).toBeGreaterThan(starterTrackCount);
  const parkingEnd = afterParking.project.items
    .filter((item) => item.kind === "track" && item.arrangementId === "parking:r40-back-out")
    .sort((first, second) => second.x - first.x)[0];
  expect(parkingEnd).toBeDefined();
  await traceFromInnerMainlineTo(page, parkingEnd!.id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project.items).toHaveLength(starterTrackCount);

  await previewAndApply(page, "trixbrix:r104-right-yard-4");
  const afterYard = await saveProject(page);
  expect(afterYard.project.items.length).toBeGreaterThan(starterTrackCount);
  const yardTrack = afterYard.project.items
    .filter((item) => item.kind === "track" && item.arrangementId === "trixbrix:r104-right-yard-4")
    .sort((first, second) => second.x - first.x)[0];
  expect(yardTrack).toBeDefined();
  await traceFromInnerMainlineTo(page, yardTrack!.id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project.items).toHaveLength(starterTrackCount);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await saveProject(page)).project.items).toHaveLength(afterYard.project.items.length);

  await page.locator("#export-format").selectOption("pdf");
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  expect((await readFile(await pdf.path())).subarray(0, 4).toString()).toBe("%PDF");

  const native = afterYard;
  const fresh = await browser.newContext({ baseURL, viewport, hasTouch, isMobile });
  try {
    const reopened = await fresh.newPage();
    await boot(reopened, { startAdvanced: false });
    await chooseFile(
      reopened,
      reopened.getByRole("button", { name: "Open", exact: true }),
      native.path,
    );
    await expect(reopened.getByLabel("Layout name")).toHaveValue(native.project.name);
    expect((await saveProject(reopened)).project).toEqual(native.project);
  } finally {
    await fresh.close();
  }

  await chooseFile(
    page,
    page.getByRole("button", { name: "Import BlueBrick", exact: true }),
    example("bluebrick-example.bbm"),
  );
  await expect(page.locator("#import-preview")).toBeVisible();
  await page.getByRole("button", { name: "Open imported layout", exact: true }).click();
  await expect(page.locator("#tabletop [data-track-scene]")).toBeVisible();
  expect(errors).toEqual([]);
});

test("undersized design areas reject large arrangements and keep controls accessible", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await boot(page, { startAdvanced: false });
  await expect(page.getByRole("button", { name: "New design", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New design", exact: true }).click();
  const dialog = page.locator("#area-dialog");
  await dialog.locator('input[name="assignment"][value="straight"]').check();
  await dialog.locator("#area-width").selectOption("other");
  await dialog.locator("#area-depth").selectOption("other");
  await dialog.locator("#area-other-width").fill("10");
  await dialog.locator("#area-other-depth").fill("10");
  await dialog.locator('input[name="front"][value="north"]').check();
  await dialog.getByRole("button", { name: "Create track plan", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#tabletop [data-track-scene]")).toBeVisible();
  const before = await saveProject(page);
  await page.locator("#arrangement").selectOption("trixbrix:r104-triple-kit");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#arrangement-info")).toContainText("No connected fit was found");
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
  expect((await saveProject(page)).project).toEqual(before.project);
  await expect(page.getByRole("group", { name: "Track plan" })).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("status")).toBeVisible();
  expect(errors).toEqual([]);
});
