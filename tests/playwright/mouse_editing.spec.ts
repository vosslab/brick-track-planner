import { expect } from "@playwright/test";

import {
  boot,
  createProject,
  drawingPoint,
  openEditingPlan,
  pickDrawing,
  saveProject,
  straight,
  test,
} from "./helper_planner";

// Undo, Move, Placement, Track plan, and Inspector: src/index.html:110, :209, :226, :251, :277.
// Track identity, camera view, and preview groups: src/scene.ts:126, :495, :516.

test("dragging a track selected in Diagnostics moves only that track at an overlap", async ({
  page,
}) => {
  await boot(page, { startProject: false });
  const original = await openEditingPlan(page, [
    straight("lower", 76, 64),
    straight("upper", 76, 64),
  ]);
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page
    .getByRole("button", { name: /RC\/PF straight S16 overlaps RC\/PF straight S16/ })
    .click();

  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  await expect(canvas.locator('[data-kind="track"][data-piece-id="lower"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const start = (await drawingPoint(canvas, 76, 64)).screen;
  const destination = (await drawingPoint(canvas, 92, 64)).screen;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y);
  await page.mouse.up();

  expect((await saveProject(page)).project.items).toEqual([
    { ...original.items[0], x: 92 },
    original.items[1],
  ]);
});

test("Escape cancels an active track drag", async ({ page }) => {
  await boot(page, { startProject: false });
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  const ghost = canvas.locator('[data-edit-preview] [data-kind="track"]');
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const placement = page.getByRole("combobox", { name: "Placement", exact: true });

  const original = await openEditingPlan(page, [straight("active-drag", 76, 64)]);
  await pickDrawing(canvas, false, 76, 64);
  await placement.selectOption({ label: "1-stud grid" });
  const start = (await drawingPoint(canvas, 76, 64)).screen;
  const destination = (await drawingPoint(canvas, 92, 64)).screen;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y);
  await expect(ghost).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(ghost).toHaveCount(0);
  await expect(placement).toHaveValue("club");
  expect((await saveProject(page)).project).toEqual(original);
  await expect(undo).toBeDisabled();
});

test("arrow keys nudge selected track and preserve text editing and panning", async ({ page }) => {
  await boot(page, { startProject: false });
  const original = await openEditingPlan(page, [straight("track", 76.5, 64)]);
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  const track = canvas.locator('[data-kind="track"][data-piece-id="track"]');
  const scene = canvas.locator("svg[data-track-scene]");

  await canvas.focus();
  const box = (await scene.getAttribute("viewBox"))!;
  await page.keyboard.press("ArrowRight");
  await expect(scene).not.toHaveAttribute("viewBox", box);
  await track.click();
  const pannedBox = (await scene.getAttribute("viewBox"))!;
  await page.keyboard.press("ArrowRight");
  await expect(scene).toHaveAttribute("viewBox", pannedBox);
  expect((await saveProject(page)).project.items).toEqual([{ ...original.items[0], x: 77.5 }]);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project).toEqual(original);

  await page.locator("#layout-menu summary").click();
  const name = page.getByLabel("Layout name");
  await name.focus();
  await expect(name).toBeFocused();
  await name.evaluate((field) => {
    const input = field as HTMLInputElement;
    input.setSelectionRange(input.value.length, input.value.length);
  });
  await name.press("ArrowLeft");
  expect(await name.evaluate((field) => (field as HTMLInputElement).selectionStart)).toBe(
    original.name.length - 1,
  );
  expect((await saveProject(page)).project).toEqual(original);
});

test("arrow keys move a keyboard selection together in a rotated view", async ({ page }) => {
  await boot(page, { startProject: false });
  const original = await openEditingPlan(page, [straight("a", 76, 64), straight("b", 92, 64)]);
  await page.getByRole("button", { name: "Rotate view clockwise", exact: true }).click();
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  await canvas.locator('[data-kind="track"][data-piece-id="a"]').press("Enter");
  const second = canvas.locator('[data-kind="track"][data-piece-id="b"]');
  await second.press("Shift+Enter");
  await page.keyboard.press("ArrowRight");
  await expect(second).toBeFocused();
  await page.keyboard.press("ArrowUp");

  expect((await saveProject(page)).project.items).toEqual(
    original.items.map((item) => ({ ...item, x: item.x - 1, y: item.y - 1 })),
  );
});

test("select all track leaves text fields with their native Select All shortcut", async ({
  page,
}) => {
  await boot(page, { startProject: false });
  await openEditingPlan(page, [
    straight("first", 52, 64),
    straight("second", 76, 64),
    straight("third", 100, 64),
  ]);
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });

  await canvas.focus();
  await page.keyboard.press(`${modifier}+A`);
  await expect(canvas.locator('[data-kind="track"][aria-pressed="true"]')).toHaveCount(3);
  expect(await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true);

  await page.locator("#layout-menu summary").click();
  const name = page.getByLabel("Layout name");
  await name.focus();
  await page.keyboard.press(`${modifier}+A`);
  await expect(name).toBeFocused();
  expect(
    await name.evaluate((field) => {
      const input = field as HTMLInputElement;
      return [input.selectionStart, input.selectionEnd];
    }),
  ).toEqual([0, (await name.inputValue()).length]);
});

test("modified clicks toggle track and a selection box can finish outside the drawing", async ({
  page,
}) => {
  await boot(page, { startProject: false });
  await openEditingPlan(page, [straight("first", 60, 64), straight("second", 92, 64)]);
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  const first = canvas.locator('[data-kind="track"][data-piece-id="first"]');
  const second = canvas.locator('[data-kind="track"][data-piece-id="second"]');

  await first.click();
  await page.keyboard.down(modifier);
  await second.click();
  await expect(canvas.locator('[data-kind="track"][aria-pressed="true"]')).toHaveCount(2);
  await second.click();
  await expect(canvas.locator('[data-kind="track"][aria-pressed="true"]')).toHaveCount(1);

  const firstBox = (await first.boundingBox())!;
  const secondBox = (await second.boundingBox())!;
  const canvasBox = (await canvas.boundingBox())!;
  const start = { x: Math.min(firstBox.x, secondBox.x) - 8, y: firstBox.y - 8 };
  const end = {
    x: canvasBox.x + canvasBox.width + 8,
    y: Math.max(firstBox.y + firstBox.height, secondBox.y + secondBox.height) + 8,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await expect(page.locator(".track-selection-box")).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up(modifier);

  await expect(canvas.locator(".track-selection-box")).toHaveCount(0);
  await expect(canvas.locator('[data-kind="track"][aria-pressed="true"]')).toHaveCount(2);
});

test("Fit view keeps the drawing visible while Add track scrolls in a short window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1120, height: 540 });
  await boot(page, { startProject: false });
  await createProject(page, { assignment: "general", width: "128", depth: "192" });
  await page.getByRole("radio", { name: "Curves", exact: true }).check();
  await page.getByText("More track parts", { exact: true }).click();

  const library = page.locator("#library-body");
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  const area = canvas.locator("[data-design-area]");

  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  await expect(canvas).toBeInViewport({ ratio: 1 });
  await expect(area).toBeInViewport({ ratio: 1 });

  await library.hover();
  const previousScroll = await library.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 10_000);
  await expect
    .poll(() => library.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(previousScroll);
  await expect(area).toBeInViewport({ ratio: 1 });
});
