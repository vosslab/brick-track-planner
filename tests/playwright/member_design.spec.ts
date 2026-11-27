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

test("members can open every packaged NILTC template", async ({ planner }) => {
  const templates = [
    ["Member straight", "Member 60 x 40 straight"],
    ["Member corner", "NILTC 60 \u00d7 40 in"],
    ["Member R104 right yard", "Member R104 right yard"],
    ["Member R40 left yard", "Member R40 left yard"],
    ["Member R24 staging yard", "Member R24 staging yard"],
    ["R104 semicircle return", "R104 semicircle return"],
    ["R120 corner return", "R120 corner return"],
    ["Joel's 10-to-0 mainline", "Joel's 10-to-0 mainline"],
  ] as const;
  for (const [option, name] of templates) {
    await openEditorMenu(planner, "File");
    await planner.getByLabel("Track templates").selectOption({ label: option });
    await expect(planner.getByLabel("Layout name")).toHaveValue(name);
  }
});

test("members can use a color-coded track view without changing their layout", async ({
  planner,
  hasTouch,
}) => {
  await openEditorMenu(planner, "File");
  await planner.getByLabel("Track templates").selectOption({ label: "Joel's 10-to-0 mainline" });

  const tabs = planner.getByRole("tablist", { name: "Open layouts" });
  const joel = tabs.getByRole("tab", { name: "Joel's 10-to-0 mainline", exact: true });
  const original = tabs.getByRole("tab", { name: "My NILTC layout", exact: true });
  const colorTrack = planner.locator("#track-colors");
  const scene = planner.locator("#tabletop > svg");
  const saved = (await saveProject(planner)).project;
  const viewBox = await scene.getAttribute("viewBox");
  const toggleColorTrack = async (): Promise<void> => {
    await openEditorMenu(planner, "Layout");
    if (hasTouch) await colorTrack.tap();
    else await colorTrack.click();
  };

  await openEditorMenu(planner, "Layout");
  await expect(colorTrack).toHaveAccessibleName("Color-coded track");
  await expect(colorTrack).toHaveAttribute("aria-pressed", "false");
  await expect(scene).not.toHaveAttribute("data-track-view");

  await toggleColorTrack();
  await expect(colorTrack).toHaveAttribute("aria-pressed", "true");
  await expect(scene).toHaveAttribute("data-track-view", "coded");
  await expect(scene).toHaveAttribute("viewBox", viewBox!);
  for (const code of ["R104", "R120", "S32"]) {
    const label = scene.locator(`text[data-track-code="${code}"]`).first();
    await expect(label).toBeAttached();
    if (!hasTouch) await expect(label).toBeVisible();
  }
  expect((await saveProject(planner)).project).toEqual(saved);

  await toggleColorTrack();
  await expect(colorTrack).toHaveAttribute("aria-pressed", "false");
  await expect(scene).not.toHaveAttribute("data-track-view");

  await toggleColorTrack();
  if (hasTouch) await original.tap();
  else await original.click();
  await expect(colorTrack).toHaveAttribute("aria-pressed", "false");
  await expect(scene).not.toHaveAttribute("data-track-view");

  if (hasTouch) await joel.tap();
  else await joel.click();
  await expect(colorTrack).toHaveAttribute("aria-pressed", "true");
  await expect(scene).toHaveAttribute("data-track-view", "coded");
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
  for (const name of [
    "Open R104R · R104 3/4-circle return",
    "Open R104S · R104 semicircle return",
    "Open R120R · R120 corner return",
  ])
    await expect(loops.getByRole("button", { name, exact: true })).toBeVisible();
  for (const name of [
    "Open 4TRY · Four-track right yard",
    "Open 8TRY · Eight-track switch yard",
    "Open Y104 · Member R104 right yard",
    "Open Y40 · Member R40 left yard",
    "Open Y24 · Member R24 staging yard",
  ])
    await expect(yards.getByRole("button", { name, exact: true })).toBeVisible();

  await gallery.getByRole("button", { name: "Open PFS40 \u00b7 Compact freight spur" }).click();
  await expect(gallery).toBeHidden();
  await expect(page.getByLabel("Layout name")).toHaveValue("Compact freight spur");
  await expect(page.locator("#design-size")).toContainText("40 \u00d7 40");

  await openEditorMenu(page, "File");
  await page.getByRole("button", { name: "Browse examples", exact: true }).click();
  const mirrored = gallery.getByRole("button", {
    name: "Open MSBC \u00b7 Mirrored S-bend crossings",
  });
  await expect(mirrored).toHaveAccessibleDescription(
    /60 × 40 in design area.*about 20 inches deep/,
  );
  await mirrored.click();
  await expect(page.getByLabel("Layout name")).toHaveValue("Mirrored S-bend crossings");
  await expect(page.locator("#design-size")).toContainText("60 \u00d7 40");

  await openEditorMenu(page, "File");
  await page.getByRole("button", { name: "Browse examples", exact: true }).click();
  await gallery.getByRole("button", { name: "Open R104R \u00b7 R104 3/4-circle return" }).click();
  await expect(page.getByLabel("Layout name")).toHaveValue("R104 3/4-circle return");
  await expect(page.locator("#design-size")).toContainText("100 \u00d7 70");

  await openEditorMenu(page, "File");
  await page.getByRole("button", { name: "Browse examples", exact: true }).click();
  await yards.getByRole("button", { name: "Open Y104 · Member R104 right yard" }).click();
  await expect(page.getByLabel("Layout name")).toHaveValue("Member R104 right yard");
  await expect(page.locator("#design-size")).toContainText("100 \u00d7 40");
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
    await openEditorMenu(page, "Tools");
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

test("phone editor opens with a reachable drawing and panels", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await boot(page, { startProject: false });
    const dimensions = await page.locator("#area-width, #area-depth").evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return { top: bounds.top, width: bounds.width };
      }),
    );
    expect(dimensions[0]!.width).toBeGreaterThan(300);
    expect(dimensions[1]!.width).toBeGreaterThan(300);
    expect(dimensions[1]!.top).toBeGreaterThan(dimensions[0]!.top);

    await createProject(page);
    const canvas = page.locator("#tabletop");
    await expect(canvas).toBeInViewport({ ratio: 0.8 });
    await page.getByRole("button", { name: "Add track", exact: true }).click();
    await expect
      .poll(() =>
        page.getByRole("heading", { name: "Add track", exact: true }).evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
        }),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Inspector", exact: true }).click();
    await expect
      .poll(() =>
        page.getByRole("heading", { name: "Inspector", exact: true }).evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
        }),
      )
      .toBe(true);
  } finally {
    await context.close();
  }
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
