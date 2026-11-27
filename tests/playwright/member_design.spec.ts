import { expect } from "@playwright/test";

import {
  boot,
  createProject,
  drawingPoint,
  chooseEditorFile,
  openEditorMenu,
  openEditingPlan,
  pickDrawing,
  saveProject,
  straight,
  test,
} from "./helper_planner";

test("members can connect a switch to an ordinary boundary rail end", async ({ planner }) => {
  await openEditorMenu(planner, "File");
  await planner.getByLabel("Track templates").selectOption({ label: "Member straight" });
  await planner.getByRole("radio", { name: "Track parts", exact: true }).check();
  await planner.getByRole("radio", { name: "Switches", exact: true }).check();
  await planner
    .getByRole("radio", {
      name: /Right switch \(R40\).*RC\/PF right switch R40/,
    })
    .check();
  await planner.getByLabel("Place at", { exact: true }).selectOption('["outer-12","b"]');
  const connect = planner.getByRole("button", { name: "Connect part", exact: true });
  await expect(connect).toBeEnabled();
  await connect.click();
  await expect(planner.locator("#status")).toContainText("Snapped to the rail end.");

  const saved = await saveProject(planner);
  const switchTrack = saved.project.items.find(
    (item) => item.kind === "track" && item.partId === "lego:rc-r40-right-switch",
  );
  expect(switchTrack).toBeDefined();
  await chooseEditorFile(planner, saved.path);
  await expect(planner.locator(`#scene-item-${switchTrack!.id}`)).toBeAttached();
});

test("members can save, reopen, and undo a five-inch design-area bump", async ({ planner }) => {
  const original = (await saveProject(planner)).project;
  await openEditorMenu(planner, "Layout");
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
  await chooseEditorFile(planner, saved.path);
  await expect(size).toContainText("60 \u00d7 45 in overall");
});

test("members can browse mainline loops and train yards in the gallery", async ({ page }) => {
  await boot(page, { startProject: false });
  await page.locator("#start-browse-examples").click();
  const gallery = page.getByRole("dialog", { name: "Track examples", exact: true });
  const loops = gallery.getByRole("region", { name: "Mainline loops", exact: true });
  const yards = gallery.getByRole("region", { name: "Train yards", exact: true });
  await expect(
    loops.getByRole("button", { name: "Open R104R · R104 3/4-circle return", exact: true }),
  ).toBeVisible();
  await expect(
    yards.getByRole("button", { name: "Open Y104 · Member R104 right yard", exact: true }),
  ).toBeVisible();

  await gallery.getByRole("button", { name: "Open PFS40 \u00b7 Compact freight spur" }).click();
  await expect(gallery).toBeHidden();
  await expect(page.getByLabel("Layout name")).toHaveValue("Compact freight spur");
  await expect(page.locator("#design-size")).toContainText("40 \u00d7 40");

  await openEditorMenu(page, "File");
  await page.getByRole("button", { name: "Browse examples", exact: true }).click();
  await yards.getByRole("button", { name: "Open Y104 · Member R104 right yard" }).click();
  await expect(page.getByLabel("Layout name")).toHaveValue("Member R104 right yard");
  await expect(page.locator("#design-size")).toContainText("100 \u00d7 40");
});

test("[touch] members can move track in a rotated view and undo it", async ({ page, hasTouch }) => {
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
  const track = canvas.getByRole("button", { name: "RC/PF straight S16", exact: true });
  if (hasTouch) await track.tap();
  else await track.click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  if (hasTouch) await canvas.tap({ position: destination.position });
  else await canvas.click({ position: destination.position });
  expect((await saveProject(page)).project.items).toEqual([{ ...item, x: 0, y: movedY }]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project).toEqual(original);
});

// Picker labels are member-facing catalog names from data/catalog.json.
test("track part browsing keeps a chosen variant and saves the part it places", async ({
  page,
  hasTouch,
}) => {
  await boot(page, { startProject: false });
  await createProject(page, { assignment: "general", width: "128", depth: "192" });

  const legoStraight = page.getByRole("radio", {
    name: /Straight \(16 studs\).*LEGO.*RC\/PF straight S16/,
  });
  await expect(page.getByRole("radio", { name: "Track parts" })).toBeChecked();
  await expect(legoStraight).toBeChecked();

  await page.getByLabel("Place at", { exact: true }).selectOption("drawing");
  await page.getByRole("button", { name: "Place on drawing", exact: true }).click();
  await expect(page.locator("#piece-info")).toContainText("Click or tap the drawing");
  await page.getByRole("radio", { name: "Straights", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Curves", exact: true })).toBeChecked();
  await expect(page.locator("#piece-info")).toBeEmpty();

  await page.keyboard.press("ArrowLeft");
  await expect(legoStraight).toBeChecked();
  await page.locator('summary[aria-label="Other brands for Straight (16 studs)"]').click();
  const trixStraight = page.getByRole("radio", {
    name: /Straight \(16 studs\).*TrixBrix.*Straight S16/,
  });
  if (hasTouch) await trixStraight.tap();
  else await trixStraight.check();
  await expect(page.locator("#selected-part-model")).toHaveText("TrixBrix · Straight S16");

  const place = page.getByRole("button", { name: "Place on drawing", exact: true });
  if (hasTouch) await place.tap();
  else await place.click();
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  if (hasTouch) await canvas.tap();
  else await canvas.click();
  expect(
    (await saveProject(page)).project.items
      .filter((item) => item.kind === "track")
      .map((item) => item.partId),
  ).toEqual(["trixbrix:s16"]);
});

test("Connect two ends fills an aligned gap in one undoable edit", async ({ page }) => {
  await boot(page, { startProject: false });
  const original = await openEditingPlan(page, [
    straight("west", 48, 48),
    straight("east", 96, 48),
  ]);
  const from = page.locator('#tabletop [data-piece-id="west"][data-port-id="b"]');
  const to = page.locator('#tabletop [data-piece-id="east"][data-port-id="a"]');
  await openEditorMenu(page, "Tools");
  await page.getByRole("button", { name: "Connect two ends" }).click();
  await from.press("Enter");
  await to.press("Enter");
  await page.getByRole("button", { name: "Place", exact: true }).click();
  await expect(from).toHaveAttribute("data-open", "false");
  await expect(to).toHaveAttribute("data-open", "false");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project.items).toEqual(original.items);
});

test("[touch] free placement flags a siding that does not fit the display", async ({
  page,
  hasTouch,
}) => {
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
