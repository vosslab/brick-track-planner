import { expect } from "@playwright/test";

import {
  boot,
  chooseFile,
  createProject,
  drawingPoint,
  openEditingPlan,
  pickDrawing,
  saveProject,
  straight,
  test,
} from "./helper_planner";

test("members can open every packaged NILTC template", async ({ planner }) => {
  const templates = [
    ["Member straight", "Member 60 x 40 straight"],
    ["Member corner", "NILTC 60 \u00d7 40 in"],
    ["Member yard", "Member R104 right yard"],
    ["R104 semicircle return", "R104 semicircle return"],
    ["R120 corner return", "R120 corner return"],
    ["Joel's 10-to-0 mainline", "Joel's 10-to-0 mainline"],
  ] as const;
  for (const [option, name] of templates) {
    await planner.getByLabel("Track templates").selectOption({ label: option });
    await expect(planner.getByLabel("Layout name")).toHaveValue(name);
  }
});

test("members can save, reopen, and undo a five-inch design-area bump", async ({ planner }) => {
  const original = (await saveProject(planner)).project;
  const edit = planner.getByRole("button", { name: "Design area", exact: true });
  const dialog = planner.getByRole("dialog", { name: "Edit your design area" });
  const size = planner.locator("#design-size");

  await edit.click();
  await dialog
    .getByLabel("Table edge")
    .selectOption({ label: "North \u00b7 0\u201360 in at 0 in" });
  await dialog.getByLabel("Edge length to change").selectOption("partial");
  await dialog.getByLabel("Start from left (in)").fill("10");
  await dialog.getByLabel("Distance (in)").fill("5");
  await expect(dialog.getByRole("status")).toContainText("60 \u00d7 45 in overall");
  await dialog.getByRole("button", { name: "Apply outline" }).click();
  await expect(size).toContainText("60 \u00d7 45 in overall");

  await planner.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(size).toContainText("60 \u00d7 40 in");
  await planner.getByRole("button", { name: "Redo", exact: true }).click();
  const saved = await saveProject(planner);
  expect(saved.project.items).toEqual(original.items);
  expect(saved.project.area.outline).toContainEqual({ x: 32, y: -16 });
  expect(saved.project.area.outline).toContainEqual({ x: 32, y: 112 });
  await chooseFile(
    planner,
    planner.getByRole("button", { name: "Open track plan", exact: true }),
    saved.path,
  );
  await expect(size).toContainText("60 \u00d7 45 in overall");
});

test("members can open a 40-inch example from the gallery", async ({ page }) => {
  await boot(page, { startProject: false });
  await page.getByRole("button", { name: "Browse straight examples", exact: true }).click();
  const gallery = page.getByRole("dialog", { name: "Straight examples", exact: true });
  await gallery.getByRole("button", { name: "Open PFS40 \u00b7 Compact freight spur" }).click();
  await expect(gallery).toBeHidden();
  await expect(page.getByLabel("Layout name")).toHaveValue("Compact freight spur");
  await expect(page.locator("#design-size")).toContainText("40 \u00d7 40");
});

test("members can move track in a rotated view and undo it", async ({ page, hasTouch }) => {
  await boot(page, { startProject: false });
  await createProject(page, { assignment: "general", width: "128", depth: "192" });
  await page.getByRole("button", { name: "Place at center", exact: true }).click();
  const original = (await saveProject(page)).project;
  const item = original.items[0]!;
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Rotate view clockwise" }).click();
  const canvas = page.locator("#tabletop");
  const movedY = item.y + 16;
  const destination = await drawingPoint(canvas, 0, movedY);
  if (hasTouch) {
    await canvas.getByRole("button", { name: "RC/PF straight S16", exact: true }).tap();
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await canvas.tap({ position: destination.position });
  } else {
    const { screen } = await drawingPoint(canvas, item.x, item.y);
    await page.mouse.move(screen.x, screen.y);
    await page.mouse.down();
    await page.mouse.move(destination.screen.x, destination.screen.y, { steps: 3 });
    await expect(canvas.locator("[data-edit-preview] > *").first()).toBeVisible();
    await page.mouse.up();
  }
  expect((await saveProject(page)).project.items).toEqual([{ ...item, x: 0, y: movedY }]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project).toEqual(original);
});

test("deleting selected pieces leaves nearby track and undoes in one step", async ({
  page,
  hasTouch,
}) => {
  await boot(page, { startProject: false });
  const original = await openEditingPlan(page, [
    straight("west", 32, 48),
    straight("middle", 48, 48),
    straight("east", 96, 84),
  ]);
  const west = page.locator("#scene-item-west");
  const middle = page.locator("#scene-item-middle");
  if (hasTouch) {
    await page.getByRole("button", { name: "Select multiple" }).tap();
    await west.tap();
    await middle.tap();
    await page.getByRole("button", { name: "Delete selected track" }).tap();
  } else {
    await west.click();
    await middle.click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
    await page.keyboard.press("Delete");
  }
  expect((await saveProject(page)).project.items).toEqual([original.items[2]]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project.items).toEqual(original.items);
});

test("Connect two ends fills an aligned gap in one undoable edit", async ({ page }) => {
  await boot(page, { startProject: false });
  const original = await openEditingPlan(page, [
    straight("west", 48, 48),
    straight("east", 96, 48),
  ]);
  const from = page.locator('#tabletop [data-piece-id="west"][data-port-id="b"]');
  const to = page.locator('#tabletop [data-piece-id="east"][data-port-id="a"]');
  await page.getByRole("button", { name: "Connect two ends" }).click();
  await from.press("Enter");
  await to.press("Enter");
  await page.getByRole("button", { name: "Place", exact: true }).click();
  await expect(from).toHaveAttribute("data-open", "false");
  await expect(to).toHaveAttribute("data-open", "false");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project.items).toEqual(original.items);
});

test("free placement flags a siding that does not fit the display", async ({ page, hasTouch }) => {
  await boot(page, { startProject: false });
  await createProject(page, { assignment: "corner", width: "128", depth: "192" });
  const original = (await saveProject(page)).project;
  await page.locator("#placement-options summary").click();
  await page.getByLabel("Extra storage track").selectOption("96");
  await page.getByRole("button", { name: "Preview on track", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add to layout", exact: true })).toBeHidden();
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  await pickDrawing(canvas, hasTouch, 56, 96);
  await expect(canvas.locator("[data-placement-warning]").first()).toBeVisible();
  expect((await saveProject(page)).project.items.length).toBeGreaterThan(original.items.length);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project).toEqual(original);
});
