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
    .press("Space");
  await expect(planner.locator("#piece-info")).toBeEmpty();
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

// Baseplate controls are a named dialog with Pattern and two color fieldsets (src/index.html).
test("[touch] members can discard, save, reopen, and undo baseplate appearance", async ({
  planner,
  hasTouch,
}) => {
  const open = async (): Promise<void> => {
    const button = planner.getByRole("button", { name: "Baseplates", exact: true });
    if (hasTouch) await button.tap();
    else await button.click();
  };
  const editor = planner.getByRole("dialog", { name: "Baseplates", exact: true });
  const firstColor = editor.getByRole("group", { name: "First color", exact: true });
  const secondColor = editor.getByRole("group", { name: "Second color", exact: true });
  const chosen = {
    pattern: "checkerboard" as const,
    color: "classic-blue" as const,
    secondary: "light-bley" as const,
  };

  await open();
  await expect(firstColor.getByRole("radio", { name: "Classic Green", exact: true })).toBeChecked();
  await editor.getByRole("combobox", { name: "Pattern", exact: true }).selectOption(chosen.pattern);
  await firstColor.getByRole("radio", { name: "Classic Blue", exact: true }).check();
  await secondColor.getByRole("radio", { name: "Light Bley", exact: true }).check();
  if (hasTouch) await editor.getByRole("button", { name: "Cancel", exact: true }).tap();
  else await planner.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  expect((await saveProject(planner)).project.area.baseplates).toBeUndefined();

  await open();
  await editor.getByRole("combobox", { name: "Pattern", exact: true }).selectOption(chosen.pattern);
  await firstColor.getByRole("radio", { name: "Classic Blue", exact: true }).check();
  await secondColor.getByRole("radio", { name: "Light Bley", exact: true }).check();
  const apply = editor.getByRole("button", { name: "Apply baseplates", exact: true });
  if (hasTouch) await apply.tap();
  else await apply.click();
  await expect(editor).toBeHidden();
  const saved = await saveProject(planner);
  expect(saved.project.area.baseplates).toEqual(chosen);

  const undo = planner.getByRole("button", { name: "Undo", exact: true });
  if (hasTouch) await undo.tap();
  else await undo.click();
  expect((await saveProject(planner)).project.area.baseplates).toBeUndefined();
  const redo = planner.getByRole("button", { name: "Redo", exact: true });
  if (hasTouch) await redo.tap();
  else await redo.click();

  await chooseEditorFile(planner, saved.path);
  await open();
  await expect(editor.getByRole("combobox", { name: "Pattern", exact: true })).toHaveValue(
    chosen.pattern,
  );
  await expect(firstColor.getByRole("radio", { name: "Classic Blue", exact: true })).toBeChecked();
  await expect(secondColor.getByRole("radio", { name: "Light Bley", exact: true })).toBeChecked();
});

test("members can browse mainline loops and train yards in the gallery", async ({ page }) => {
  await boot(page, { startProject: false });
  await page.locator("#start-browse-examples").click();
  const gallery = page.getByRole("dialog", { name: "Track examples", exact: true });
  const loops = gallery.getByRole("region", { name: "Mainline loops", exact: true });
  const yards = gallery.getByRole("region", { name: "Train yards", exact: true });
  await expect(
    loops
      .getByRole("button", { name: "Open R104R · R104 3/4-circle return", exact: true })
      .locator("svg"),
  ).toBeVisible();
  await expect(
    yards.getByRole("button", { name: "Open Y104 · Member R104 right yard", exact: true }),
  ).toBeVisible();

  await yards.getByRole("button", { name: "Open Y104 · Member R104 right yard" }).click();
  await expect(gallery).toBeHidden();
  await expect(page.getByLabel("Layout name")).toHaveValue("Member R104 right yard");
});

test("an unavailable example reports the error in the gallery and can be retried", async ({
  page,
}) => {
  const template = (url: URL): boolean => url.pathname.endsWith("/06-long-back-out.ldr");
  await page.route(template, (route) => route.fulfill({ status: 503 }));
  await boot(page, { startProject: false });
  await page.getByRole("button", { name: "Browse examples", exact: true }).click();

  const gallery = page.getByRole("dialog", { name: "Track examples", exact: true });
  const backOut = gallery.getByRole("button", { name: "Open BOS · Back-out siding", exact: true });
  await backOut.click();
  const error = gallery.locator("#template-gallery-error");
  await expect(error).toBeInViewport();
  await expect(error).toContainText("Back-out siding");
  await expect(error).toContainText("retry");

  await page.unroute(template);
  await backOut.click();
  await expect(gallery).toBeHidden();
  await expect(page.getByLabel("Layout name")).toHaveValue("Back-out siding");
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

test("[touch] the selected track actions rotate a piece and support undo", async ({
  page,
  hasTouch,
}) => {
  await boot(page, { startProject: false });
  const piece = straight("piece", 64, 96);
  const original = await openEditingPlan(page, [piece]);
  const actions = page.getByRole("group", { name: "Selected track actions" });
  const left = actions.getByRole("button", { name: "Rotate selected track 90 degrees left" });
  const right = actions.getByRole("button", { name: "Rotate selected track 90 degrees right" });
  await expect(left).toBeHidden();
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  await pickDrawing(canvas, hasTouch, piece.x, piece.y);
  await expect(left).toBeVisible();

  if (hasTouch) await right.tap();
  else await right.click();
  expect((await saveProject(page)).project.items).toEqual([{ ...piece, angle: 90 }]);
  if (hasTouch) await left.tap();
  else await left.click();
  expect((await saveProject(page)).project).toEqual(original);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project.items).toEqual([{ ...piece, angle: 90 }]);
});

// Picker labels are member-facing catalog names from data/catalog.json.
test("[touch] a part card picks up the piece for placement on the drawing", async ({
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
  const pressCard = async (id: string): Promise<void> => {
    const drawing = page.locator(`label[for="${id}"] .part-preview`);
    if (hasTouch) await drawing.tap();
    else await drawing.click();
  };
  const prompt = page.locator("#piece-info");
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  const preview = canvas.locator("[data-edit-preview] [data-kind=track]");
  const placed = canvas.locator("[data-piece-id][data-kind=track]");

  await pressCard("part-choice-lego-rc-s16");
  await expect(prompt).toContainText("Click or tap the drawing");
  await page.getByRole("radio", { name: "Straights", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Curves", exact: true })).toBeChecked();
  await expect(prompt).toBeEmpty();

  await page.keyboard.press("ArrowLeft");
  await expect(legoStraight).toBeChecked();
  await page.locator('summary[aria-label="Other brands for Straight (16 studs)"]').click();
  const trixStraight = page.getByRole("radio", {
    name: /Straight \(16 studs\).*TrixBrix.*Straight S16/,
  });
  await pressCard("part-choice-trixbrix-s16");
  await expect(trixStraight).toBeChecked();
  await expect(prompt).toContainText("Click or tap the drawing");
  if (hasTouch) {
    await page
      .getByRole("group", { name: "Placement", exact: true })
      .getByRole("button", { name: "Cancel", exact: true })
      .tap();
  } else {
    await canvas.hover({ position: (await drawingPoint(canvas, 48, 56)).position });
    await expect(preview).toBeVisible();
    const firstPosition = await preview.getAttribute("transform");
    await canvas.hover({ position: (await drawingPoint(canvas, 80, 56)).position });
    await expect(preview).not.toHaveAttribute("transform", firstPosition!);
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
  }
  await expect(prompt).toBeEmpty();
  await expect(placed).toHaveCount(0);

  await pressCard("part-choice-trixbrix-s16");
  await expect(prompt).toContainText("Click or tap the drawing");
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
