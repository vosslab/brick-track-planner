import { expect } from "@playwright/test";

import {
  boot,
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

test("Escape cancels a held track before and after the drag threshold", async ({ page }) => {
  await boot(page, { startProject: false });
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  const ghost = canvas.locator('[data-edit-preview] [data-kind="track"]');
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const placement = page.getByRole("combobox", { name: "Placement", exact: true });

  for (const startedDragging of [false, true]) {
    await test.step(
      startedDragging ? "After the drag starts" : "Before the drag starts",
      async () => {
        const id = startedDragging ? "active-drag" : "before-drag";
        const original = await openEditingPlan(page, [straight(id, 76, 64)], id);
        await expect(canvas.locator(`[data-kind="track"][data-piece-id="${id}"]`)).toBeVisible();
        await pickDrawing(canvas, false, 76, 64);
        await placement.selectOption({ label: "1-stud grid" });
        const start = (await drawingPoint(canvas, 76, 64)).screen;
        const destination = (await drawingPoint(canvas, 92, 64)).screen;
        const afterEscape = (await drawingPoint(canvas, 100, 64)).screen;
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        if (startedDragging) {
          await page.mouse.move(destination.x, destination.y);
          await expect(ghost).toBeVisible();
        }
        await page.keyboard.press("Escape");
        await page.mouse.move(afterEscape.x, afterEscape.y);
        await page.mouse.up();

        await expect(ghost).toHaveCount(0);
        await expect(placement).toHaveValue("club");
        expect((await saveProject(page)).project).toEqual(original);
        await expect(undo).toBeDisabled();
      },
    );
  }
});

test("wheel panning refreshes a Move preview and the next click saves its pose", async ({
  page,
}) => {
  await boot(page, { startProject: false });
  const original = await openEditingPlan(page, [straight("track", 76, 64)]);
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  await expect(canvas.getByRole("button", { name: "RC/PF straight S16" })).toBeVisible();
  await pickDrawing(canvas, false, 76, 64);
  await page.getByRole("button", { name: "Move", exact: true }).click();

  const preview = canvas.locator('[data-edit-preview] [data-kind="track"]');
  const scene = canvas.locator("svg[data-track-scene]");
  const pointer = (await drawingPoint(canvas, 100, 64)).screen;
  const afterPan = (await drawingPoint(canvas, 116, 64)).screen;
  await page.mouse.move(pointer.x, pointer.y);
  await expect(preview).toHaveAttribute("transform", "translate(100 64) rotate(0)");
  const originalBox = (await scene.getAttribute("viewBox"))!;
  await page.mouse.wheel(Math.round(afterPan.x - pointer.x), 0);
  await expect(scene).not.toHaveAttribute("viewBox", originalBox);
  await expect(preview).toHaveAttribute("transform", "translate(116 64) rotate(0)");
  await page.mouse.click(pointer.x, pointer.y);

  expect((await saveProject(page)).project.items).toEqual([{ ...original.items[0], x: 116 }]);
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
