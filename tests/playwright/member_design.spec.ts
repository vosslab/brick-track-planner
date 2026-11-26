import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import straightExamples from "../../data/straight_examples.json" with { type: "json" };
import catalog from "../../data/catalog.json" with { type: "json" };
import { saveTrackPlan } from "../../src/ldraw";
import type { Catalog, Project, TrackItem } from "../../src/project";
import { boot, createProject, saveProject, test, watchErrors } from "./helper_planner";

function drawingPoint(drawing: Locator, x: number, y: number): Promise<{ x: number; y: number }> {
  return drawing.evaluate(
    (element, { x, y }) => {
      const matrix = (element as SVGGraphicsElement).getScreenCTM()!;
      const screen = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    },
    { x, y },
  );
}

function straight(id: string, x: number, y: number, angle = 0, heightPlates = 0): TrackItem {
  return { id, x, y, angle, kind: "track", partId: "lego:rc-s16", layerId: "layout", heightPlates };
}

async function openEditingPlan(page: Page, items: TrackItem[]): Promise<Project> {
  const project: Project = {
    version: 3,
    name: "Editing test yard",
    area: { width: 128, depth: 192, fronts: [], exits: [] },
    layers: [{ id: "layout", name: "Layout", visible: true }],
    items,
  };
  await page.locator("#project-file").setInputFiles({
    name: "yard.ldr",
    mimeType: "text/plain",
    buffer: Buffer.from(saveTrackPlan(project, catalog as Catalog)),
  });
  return project;
}

test("members can open each packaged track template", async ({ planner }) => {
  const templates = [
    ["Member straight", "Member 60 x 40 straight"],
    ["Member corner", "NILTC 60 \u00d7 40 in"],
    ["Member yard", "Member R104 right yard"],
    ["R104 semicircle return", "R104 semicircle return"],
    ["R120 corner return", "R120 corner return"],
  ] as const;
  for (const [option, name] of templates) {
    await planner.getByLabel("Track templates").selectOption({ label: option });
    await expect(planner.getByLabel("Layout name")).toHaveValue(name);
  }
});

test("the gallery previews and opens editable straight examples with type codes", async ({
  page,
}) => {
  await boot(page, { startProject: false });
  const gallery = page.locator("#template-gallery");
  const browse = page.getByRole("button", { name: "Browse straight examples", exact: true });
  await browse.click();
  await expect(gallery).toBeVisible();
  await expect(gallery.locator(".template-card")).toHaveCount(straightExamples.length);
  const drawings = gallery.locator(".template-card svg[data-track-scene]");
  await expect(drawings).toHaveCount(straightExamples.length);
  const mainlineFrame = (await drawings.first().getAttribute("viewBox"))?.split(" ").map(Number);
  expect(mainlineFrame?.[3]).toBeLessThan(128);
  const clipped = await gallery.locator(".template-card small").evaluateAll((descriptions) =>
    descriptions
      .filter((description) => {
        const card = description.closest(".template-card")!;
        return description.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom + 1;
      })
      .map((description) => description.textContent),
  );
  expect(clipped).toEqual([]);
  for (const frontage of [60, 40]) {
    const collection = gallery.getByRole("region", { name: `${frontage} × 40 inches` });
    await expect(collection.locator(".template-card strong")).toHaveText(
      straightExamples
        .filter((example) => example.frontage === frontage)
        .map(({ code, name }) => `${code} · ${name}`),
    );
  }
  await gallery.getByText("ML · Mainline only", { exact: true }).click();
  await expect(gallery).toBeVisible();
  await expect(
    gallery.getByRole("button", { name: "Open DCX · Double crossover" }),
  ).toHaveAccessibleDescription(/^23 track pieces/);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(gallery).toBeHidden();
  await expect(page.locator("#start-screen")).toBeVisible();
  await expect(page.locator("#editor")).toBeHidden();

  await browse.click();
  await gallery.getByRole("button", { name: "Open ML · Mainline only" }).click();
  await expect(gallery).toBeHidden();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.getByLabel("Layout name")).toHaveValue("Mainline only");
  await expect(page.locator("#design-size")).toContainText("60 × 40");

  await browse.click();
  await gallery
    .getByRole("button", { name: "Open PFS · Dual perpendicular freight spurs" })
    .click();
  await expect(page.getByLabel("Layout name")).toHaveValue("Dual perpendicular freight spurs");
  expect(
    (await saveProject(page)).project.items.filter(({ id }) => id.startsWith("freight-straight-")),
  ).toHaveLength(4);

  await browse.click();
  await gallery.getByRole("button", { name: "Open PFS40 · Compact freight spur" }).click();
  await expect(page.getByLabel("Layout name")).toHaveValue("Compact freight spur");
  await expect(page.locator("#design-size")).toContainText("40 × 40");
});

test("closing the example gallery keeps the current editor plan", async ({ planner }) => {
  await planner.getByRole("button", { name: "Browse straight examples", exact: true }).click();
  await expect(planner.locator("#template-gallery .template-card")).toHaveCount(
    straightExamples.length,
  );
  await planner.getByRole("button", { name: "Close", exact: true }).click();
  await expect(planner.getByLabel("Layout name")).toHaveValue("My NILTC layout");
});

async function previewAndApply(page: Parameters<typeof boot>[0], value: string): Promise<void> {
  await page.locator("#arrangement").selectOption(value);
  const placementOptions = page.locator("#placement-options");
  if (!(await placementOptions.evaluate((details) => (details as HTMLDetailsElement).open))) {
    await placementOptions.locator("summary").click();
  }
  await page.locator("#anchor").selectOption("mainline");
  await page.getByRole("button", { name: "Preview on track", exact: true }).click();
  await expect(page.locator("#arrangement-info")).toContainText("fit");
  const apply = page.getByRole("button", { name: "Add to layout", exact: true });
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
  await boot(page, { startProject: false });
  await createProject(page, {
    assignment: "straight",
    width: "192",
    depth: "128",
    name: "straight member plan",
  });

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
  const handoff = saved.project.area.exits[0]!.outer.pieceId;
  await page.locator(`#scene-item-${encodeURIComponent(handoff)}`).click();
  await expect(page.getByRole("button", { name: "Delete selected track" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move", exact: true })).toBeDisabled();
  await expect(page.locator("#track-edit-hint")).toContainText(/named mainline/i);
  await expect(page.getByText("Exact position", { exact: true })).toBeHidden();
  expect(errors).toEqual([]);
});

test("80 by 40 curves have two mirrored orientations and a separate rotated view", async ({
  page,
  hasTouch,
}) => {
  await boot(page, { startProject: false });
  const form = page.locator("#area-form");
  const corners = form.getByRole("group", { name: "Public corner" });
  await expect(corners).toBeHidden();

  for (const [label, side, opposite] of [
    ["Top-right corner", "east", "west"],
    ["Top-left corner", "west", "east"],
  ] as const) {
    await form.locator('input[name="assignment"][value="corner"]').check();
    await expect(corners.getByRole("radio")).toHaveCount(2);
    await corners.getByRole("radio", { name: label }).check();
    await form.getByLabel("Width on the drawing").selectOption("256");
    await form.getByLabel("Depth on the drawing").selectOption("128");
    await form.getByRole("button", { name: "Create track plan" }).click();
    const { project } = await saveProject(page);
    expect(project.area).toMatchObject({
      width: 256,
      depth: 128,
      niltc: "corner",
      fronts: ["north", side],
    });
    expect(project.area.exits.map(({ edge }) => edge).sort()).toEqual([opposite, "south"].sort());
    const scene = page.locator("#tabletop [data-track-scene]");
    await expect(scene.locator("[data-scene-drawing]")).toHaveAttribute("transform", "rotate(0)");
    await page.getByRole("button", { name: "Rotate view clockwise" }).click();
    await page.getByRole("button", { name: "Fit view", exact: true }).click();
    await expect(scene.locator("[data-scene-drawing]")).toHaveAttribute("transform", "rotate(90)");
    const frame = (await scene.getAttribute("viewBox"))!.split(" ").map(Number);
    expect(frame[3]).toBeGreaterThan(frame[2]!);
    const straight = scene.getByRole("button", { name: "RC/PF straight S16" }).first();
    if (hasTouch) await straight.tap();
    else await straight.click();
    await expect(straight).toHaveAttribute("aria-pressed", "true");
    expect((await saveProject(page)).project).toEqual(project);
    if (side === "east")
      await page.getByRole("button", { name: "New design", exact: true }).click();
  }
});

test("a 40 by 60 member adds a fitted siding and extends its open end", async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page, { startProject: false });
  await createProject(page, {
    assignment: "straight",
    width: "128",
    depth: "192",
    name: "40 by 60 member plan",
  });

  await expect(page.getByRole("radio", { name: "Arrangement" })).toBeChecked();
  await expect(page.locator("#build-hint")).toContainText("park a train");
  const requirements = page.locator("#arrangement-requirements");
  await expect(requirements).toContainText("studs");
  const baseFootprint = await requirements.textContent();
  await page.getByRole("button", { name: "Preview on track", exact: true }).click();
  await expect(requirements).not.toHaveText(baseFootprint!);
  await expect(page.locator("#arrangement-info")).toContainText(
    "Uses 64 studs of straight storage.",
  );
  await expect(page.getByRole("button", { name: "Add to layout", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Add to layout", exact: true }).click();
  await expect(page.locator("#arrangement-info")).toContainText(
    "Added Back-out parking siding. Uses 64 studs of straight storage.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const placementOptions = page.locator("#placement-options");
  if (!(await placementOptions.evaluate((details) => (details as HTMLDetailsElement).open))) {
    await placementOptions.locator("summary").click();
  }
  await page.getByLabel("Extra storage track").selectOption("0");
  await page.getByRole("button", { name: "Preview on track", exact: true }).click();
  await page.getByRole("button", { name: "Add to layout", exact: true }).click();
  await expect(page.locator("#arrangement-info")).toContainText(
    "Added Back-out parking siding. Uses the turnout and return curve with no added straight storage.",
  );

  const afterSiding = await saveProject(page);
  await page.getByRole("radio", { name: "Single piece" }).check();
  await expect(page.locator("#piece-tools")).toBeVisible();
  await expect(page.locator("#piece-target option")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Connect piece", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Connect piece", exact: true }).click();
  const extended = await saveProject(page);
  expect(extended.project.items).toHaveLength(afterSiding.project.items.length + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(page)).project).toEqual(afterSiding.project);
  expect(errors).toEqual([]);
});

test("a 40 by 60 corner uses the compact siding and refuses an oversized choice", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await boot(page, { startProject: false });
  await createProject(page, { assignment: "corner", width: "128", depth: "192" });

  const before = await saveProject(page);
  await page.getByRole("button", { name: "Preview on track", exact: true }).click();
  await expect(page.locator("#arrangement-info")).toContainText(
    "Uses the turnout and return curve with no added straight storage.",
  );
  await page.getByRole("button", { name: "Cancel preview", exact: true }).click();
  await page.locator("#placement-options summary").click();
  await page.getByLabel("Extra storage track").selectOption("96");
  await page.getByRole("button", { name: "Preview on track", exact: true }).click();
  await expect(page.locator("#arrangement-info")).toContainText("Fit to space");
  await expect(page.getByRole("button", { name: "Add to layout", exact: true })).toBeHidden();
  expect((await saveProject(page)).project).toEqual(before.project);

  await page.getByLabel("Extra storage track").selectOption("auto");
  await page.getByLabel("Connect to").selectOption("selected");
  await page.getByRole("button", { name: "Preview on track", exact: true }).click();
  await expect(page.locator("#arrangement-info")).toContainText(/select a track piece/i);
  await expect(page.getByLabel("Fit location")).toBeHidden();
  expect(errors).toEqual([]);
});

test("the arrangement picker fits both T-junctions and explains the third lane", async ({
  planner,
}) => {
  const choice = planner.locator("#arrangement");
  const preview = planner.getByRole("button", { name: "Preview on track", exact: true });
  const add = planner.getByRole("button", { name: "Add to layout", exact: true });
  await choice.selectOption("trixbrix:r40-right-pass-through");
  await preview.click();
  await expect(planner.locator("#arrangement-info")).toContainText("3 aligned parallel tracks");
  await expect(add).toBeHidden();
  await choice.selectOption("trixbrix:r40-t-junction");
  await preview.click();
  await expect(add).toBeEnabled();
  await choice.selectOption("trixbrix:r40-r56-t-junction");
  await preview.click();
  await expect(add).toBeEnabled();
  await add.click();
  const { project } = await saveProject(planner);
  expect(project.items).toContainEqual(
    expect.objectContaining({
      kind: "track",
      partId: "trixbrix:r40-r56-t-junction-core",
      arrangementId: "trixbrix:r40-r56-t-junction",
    }),
  );
});

test("a general plan starts with a single piece and names its first action", async ({ page }) => {
  await boot(page, { startProject: false });
  await createProject(page, { assignment: "general", width: "128", depth: "192" });
  await expect(page.getByRole("radio", { name: "Single piece" })).toBeChecked();
  await expect(page.locator("#build-hint")).toContainText("Choose a piece to start");
  await expect(page.getByRole("button", { name: "Place at center", exact: true })).toBeEnabled();
});

test("members can move by dragging or tapping, edit exact position, and undo", async ({
  page,
  hasTouch,
}) => {
  await boot(page, { startProject: false });
  await createProject(page, { assignment: "general", width: "128", depth: "192" });
  const remove = page.getByRole("button", { name: "Delete selected track", exact: true });
  await expect(remove).toBeDisabled();
  await page.getByRole("button", { name: "Place at center", exact: true }).click();
  const original = (await saveProject(page)).project;
  const item = original.items[0]!;
  await page.keyboard.press("Escape");
  const piece = page.getByRole("group", { name: "Track plan" }).getByRole("button", {
    name: "RC/PF straight S16",
    exact: true,
  });
  await page.getByRole("button", { name: "Rotate view clockwise" }).click();

  const canvas = page.locator("#tabletop");
  if (hasTouch) {
    await piece.tap();
    await page.getByRole("button", { name: "Move", exact: true }).click();
  }
  await canvas.scrollIntoViewIfNeeded();
  const draw = canvas.locator("[data-scene-drawing]");
  const from = await drawingPoint(draw, item.x, item.y);
  const to = await drawingPoint(draw, item.x + 16, item.y + 16);
  if (hasTouch) {
    await page.touchscreen.tap(to.x, to.y);
    await expect(canvas.locator("[data-edit-preview] > *").first()).toBeVisible();
    expect((await saveProject(page)).project).toEqual(original);
    await page.getByRole("button", { name: "Place", exact: true }).click();
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await expect(canvas.locator("[data-edit-preview] > *").first()).toBeVisible();
    await page.mouse.up();
  }
  const moved = (await saveProject(page)).project;
  expect(moved.items).toEqual([{ ...item, x: item.x + 16, y: item.y + 16 }]);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const frame = await canvas.locator("svg[data-track-scene]").getAttribute("viewBox");
  await page.getByRole("button", { name: "Rotate right", exact: true }).click();
  expect((await saveProject(page)).project.items).toEqual([{ ...moved.items[0], angle: 90 }]);
  await undo.click();
  await expect(canvas.locator("svg[data-track-scene]")).toHaveAttribute("viewBox", frame!);

  if (hasTouch) {
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    const next = await drawingPoint(draw, item.x + 32, item.y + 16);
    await page.touchscreen.tap(next.x, next.y);
    await expect(page.getByRole("button", { name: "Place", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  } else {
    const start = await drawingPoint(draw, item.x + 16, item.y + 16);
    const next = await drawingPoint(draw, item.x + 32, item.y + 16);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(next.x, next.y, { steps: 3 });
    await expect(canvas.locator("[data-edit-preview] > *").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.up();
  }
  expect((await saveProject(page)).project).toEqual(moved);

  await page.getByText("Exact position", { exact: true }).click();
  const x = page.getByRole("spinbutton", { name: "X in studs" });
  const y = page.getByRole("spinbutton", { name: "Y in studs" });
  await x.fill("40");
  await y.fill("48");
  await y.press("Enter");
  const positioned = (await saveProject(page)).project;
  expect(positioned.items).toEqual([{ ...item, x: 40, y: 48 }]);

  await x.fill("-20");
  await y.press("Enter");
  await expect(page.getByRole("status")).toContainText(/outside the design area/i);
  expect((await saveProject(page)).project).toEqual(positioned);

  await remove.click();
  await expect(piece).toHaveCount(0);
  await undo.click();
  expect((await saveProject(page)).project).toEqual(positioned);
  await undo.click();
  expect((await saveProject(page)).project).toEqual(moved);
  await undo.click();
  expect((await saveProject(page)).project).toEqual(original);
});

test("members can copy and paste a piece at a valid position, then undo", async ({
  page,
  hasTouch,
}) => {
  await boot(page, { startProject: false });
  await createProject(page, { assignment: "general", width: "128", depth: "192" });
  await page.getByRole("button", { name: "Place at center", exact: true }).click();
  const original = (await saveProject(page)).project;
  await page.keyboard.press("Escape");
  const canvas = page.locator("#tabletop");
  const piece = canvas.getByRole("button", { name: "RC/PF straight S16", exact: true });
  const modifier = hasTouch ? "Control" : "Meta";
  await piece.press("Enter");
  await page.keyboard.press(`${modifier}+c`);
  const status = page.getByRole("status");
  await expect(status).toContainText("Track copied");
  await page.keyboard.press(`${modifier}+v`);
  await expect(canvas).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#track-edit-hint")).toContainText("overlap");
  await page.getByRole("combobox", { name: "Placement", exact: true }).selectOption("fine");
  await canvas.scrollIntoViewIfNeeded();

  const destination = await canvas.locator("[data-scene-drawing]").evaluate((drawing) => {
    const matrix = (drawing as SVGGraphicsElement).getScreenCTM()!;
    const { x, y } = new DOMPoint(41, 49).matrixTransform(matrix);
    return { x, y };
  });
  await page.mouse.click(destination.x, destination.y);
  await page.getByRole("button", { name: "Place", exact: true }).click();
  await expect(status).toContainText("Placed duplicate track");
  const duplicated = (await saveProject(page)).project;
  expect(duplicated.items).toHaveLength(2);
  expect(duplicated.items[0]).toEqual(original.items[0]);
  const copy = duplicated.items[1]!;
  expect(copy.id).not.toBe(original.items[0]!.id);
  expect(copy).toEqual({ ...original.items[0], id: copy.id, x: 41, y: 49 });
  await page.keyboard.press(`${modifier}+z`);
  expect((await saveProject(page)).project).toEqual(original);
  await piece.press("Enter");
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Placement", exact: true })).toHaveValue("club");
});

test("a yard selection snaps as a unit and Connect fills a straight gap", async ({
  page,
  hasTouch,
}) => {
  await boot(page, { startProject: false });
  const groupId = "installed-run";
  const project = await openEditingPlan(page, [
    { ...straight("west", 32, 48), groupId },
    { ...straight("middle", 48, 48), groupId },
    straight("east", 96, 48),
    straight("parallel", 96, 84),
  ]);
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  const hint = page.locator("#track-edit-hint");
  const place = page.getByRole("button", { name: "Place", exact: true });
  const move = page.getByRole("button", { name: "Move", exact: true });
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const piece = (id: string): Locator => canvas.locator(`#scene-item-${id}`);
  const end = (id: string, port: string): Locator =>
    canvas.locator(`[data-piece-id="${id}"][data-port-id="${port}"]`);

  if (hasTouch) {
    await page.getByRole("button", { name: "Select multiple" }).click();
    await piece("west").tap();
    await piece("middle").tap();
  } else {
    await piece("west").click();
    await piece("middle").click({ modifiers: ["Shift"] });
  }
  await expect(hint).toContainText("2 selected");
  await expect(page.getByRole("button", { name: "Rotate right" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await piece("west").click();
  await page.getByRole("button", { name: "Select arrangement" }).click();
  await expect(hint).toContainText("2 selected");
  await move.click();
  await end("east", "a").press("Enter");
  await expect(hint).toContainText("Snaps to");
  await expect(place).toBeFocused();
  await page.keyboard.press("Enter");
  const moved = (await saveProject(page)).project;
  expect(moved.items).toEqual([
    { ...project.items[0], x: 64 },
    { ...project.items[1], x: 80 },
    ...project.items.slice(2),
  ]);
  await expect(end("west", "b")).toHaveAttribute("data-open", "false");
  await expect(end("east", "a")).toHaveAttribute("data-open", "false");
  await undo.click();
  expect((await saveProject(page)).project).toEqual(project);

  await page.getByRole("button", { name: "Connect two ends" }).click();
  await end("middle", "b").click();
  await end("parallel", "a").click();
  await expect(hint).toContainText("same straight line");
  await expect(place).toBeDisabled();
  await end("east", "a").click();
  await expect(hint).toContainText("32 studs");
  await expect(hint).toContainText("2 × RC/PF straight S16");
  await place.click();
  const connected = (await saveProject(page)).project;
  expect(connected.items.slice(0, 4)).toEqual(project.items);
  expect(connected.items.slice(4).map(({ x, y }) => [x, y])).toEqual([
    [64, 48],
    [80, 48],
  ]);
  await expect(end("middle", "b")).toHaveAttribute("data-open", "false");
  await expect(end("east", "a")).toHaveAttribute("data-open", "false");
  await undo.click();
  expect((await saveProject(page)).project).toEqual(project);
});

test("straight gap preview rejects an obstructed run, a fractional gap, and mismatched heights", async ({
  page,
}) => {
  await boot(page, { startProject: false });
  const project = await openEditingPlan(page, [
    straight("obstructed-from", 32, 32),
    straight("obstructed-to", 96, 32),
    straight("blocker", 64, 32, 90),
    straight("fractional-from", 32, 72),
    straight("fractional-to", 96.5, 72),
    straight("raised-from", 32, 112),
    straight("raised-to", 96, 112, 0, 2),
  ]);
  const connect = page.getByRole("button", { name: "Connect two ends" });
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  const place = page.getByRole("button", { name: "Place", exact: true });
  for (const [id, reason] of [
    ["obstructed", /overlaps/],
    ["fractional", /cannot fill this gap exactly/],
    ["raised", /same height/],
  ] as const) {
    await connect.click();
    await page.locator(`#tabletop [data-piece-id="${id}-from"][data-port-id="b"]`).press("Enter");
    await page.locator(`#tabletop [data-piece-id="${id}-to"][data-port-id="a"]`).press("Enter");
    await expect(page.locator("#track-edit-hint")).toContainText(reason);
    await expect(place).toBeDisabled();
    await cancel.click();
  }
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  expect((await saveProject(page)).project).toEqual(project);
});

test("track controls stay inside their panels on a short laptop viewport", async ({ page }) => {
  const expectFullyVisible = async (
    control: ReturnType<typeof page.locator>,
    clippingAncestor?: ReturnType<typeof page.locator>,
  ): Promise<void> => {
    await expect(control).toBeVisible();
    const geometry = await control.evaluate(
      (element, ancestor) => {
        const target = element.getBoundingClientRect();
        const clip = ancestor?.getBoundingClientRect();
        return {
          left: target.left,
          right: target.right,
          top: target.top,
          bottom: target.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          clipLeft: clip?.left,
          clipRight: clip?.right,
          clipTop: clip?.top,
          clipBottom: clip?.bottom,
        };
      },
      clippingAncestor ? await clippingAncestor.elementHandle() : undefined,
    );
    const pixel = 1;
    expect(geometry.left).toBeGreaterThanOrEqual(-pixel);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + pixel);
    expect(geometry.top).toBeGreaterThanOrEqual(-pixel);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + pixel);
    if (clippingAncestor) {
      expect(geometry.left).toBeGreaterThanOrEqual(geometry.clipLeft! - pixel);
      expect(geometry.right).toBeLessThanOrEqual(geometry.clipRight! + pixel);
      expect(geometry.top).toBeGreaterThanOrEqual(geometry.clipTop! - pixel);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.clipBottom! + pixel);
    }
  };

  await page.setViewportSize({ width: 1200, height: 720 });
  await boot(page, { startProject: false });
  const create = page.getByRole("button", { name: "Create track plan", exact: true });
  await expectFullyVisible(create);
  await create.click();

  const library = page.locator("#library-body");
  const preview = page.getByRole("button", { name: "Preview on track", exact: true });
  await preview.scrollIntoViewIfNeeded();
  await expectFullyVisible(preview, library);
  await preview.click();
  const apply = page.getByRole("button", { name: "Add to layout", exact: true });
  await apply.scrollIntoViewIfNeeded();
  await expectFullyVisible(apply, library);
  const placement = page.locator("#placement-options");
  await placement.getByText("Placement options", { exact: true }).click();
  for (const name of ["Connect to", "Extra storage track"]) {
    const control = page.getByLabel(name, { exact: true });
    await control.scrollIntoViewIfNeeded();
    await expectFullyVisible(control, placement);
  }
  await page.getByRole("radio", { name: "Single piece", exact: true }).check();
  const connection = page.locator("#piece-tools details");
  await connection.getByText("Connection options", { exact: true }).click();
  const port = page.getByLabel("Connecting end of this piece", { exact: true });
  await port.scrollIntoViewIfNeeded();
  await expectFullyVisible(port, connection);
});

test("member traces parking and yard routes and undoes the placement", async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page, { startProject: false });
  await createProject(page, { assignment: "straight", width: "320", depth: "192" });
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

  expect(errors).toEqual([]);
});

test("undersized design areas reject large arrangements and keep controls accessible", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await boot(page, { startProject: false });
  const form = page.locator("#area-form");
  await form.locator('input[name="assignment"][value="straight"]').check();
  await form.locator("#area-width").selectOption("other");
  await form.locator("#area-depth").selectOption("other");
  await form.locator("#area-other-width").fill("10");
  await form.locator("#area-other-depth").fill("10");
  await form.getByRole("button", { name: "Create track plan", exact: true }).click();
  await expect(page.locator("#tabletop [data-track-scene]")).toBeVisible();
  const before = await saveProject(page);
  await page.locator("#arrangement").selectOption("trixbrix:r104-triple-kit");
  await page.getByRole("button", { name: "Preview on track", exact: true }).click();
  await expect(page.locator("#arrangement-requirements")).toContainText("48");
  await expect(page.locator("#arrangement-info")).toContainText(/straight|space|area/i);
  await expect(page.getByRole("button", { name: "Add to layout", exact: true })).toBeHidden();
  expect((await saveProject(page)).project).toEqual(before.project);
  await expect(page.getByRole("group", { name: "Track plan" })).toHaveAttribute("tabindex", "0");
  expect(errors).toEqual([]);
});
