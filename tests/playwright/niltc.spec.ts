import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { Point } from "../../src/project";
import { boot, chooseFile, example, saveProject, test, watchErrors } from "./helper_planner";

// Welcome and table actions: src/index.html:43-48, :87-95, :169-193.
// Inspector controls: src/editor_panels.ts:63-108, :279-293.
// Canvas transforms, open ports, and seam status: src/scene.ts:215-225, :430-435, :491-496.
const advanced = "Advanced \u2014 I\u2019ll handle it";
const starters = [
  { name: "40\u00d740", width: 128, curve: false },
  { name: "60\u00d740 Straight", width: 192, curve: false },
  { name: "60\u00d740 Curve", width: 192, curve: true },
] as const;

function button(page: Page, name: string | RegExp): Locator {
  return page.getByRole("button", { name, exact: typeof name === "string" });
}

function canvas(page: Page): Locator {
  return page.getByRole("group", { name: "Tabletop canvas" });
}

async function screenPoint(drawing: Locator, local: Point): Promise<Point> {
  await drawing.scrollIntoViewIfNeeded();
  return drawing.evaluate((element, { x, y }) => {
    const matrix = element instanceof SVGGraphicsElement ? element.getScreenCTM() : null;
    if (!matrix) throw new Error("The tabletop drawing has no screen transform");
    const point = new DOMPoint(x, y).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }, local);
}

async function place(page: Page, target: Locator, local: Point, touch: boolean): Promise<void> {
  const { x, y } = await screenPoint(target, local);
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function dragTable(page: Page, table: Locator, touch: boolean): Promise<void> {
  const from = await screenPoint(table, { x: 82, y: 68 });
  const to = await screenPoint(table, { x: 110, y: 96 });
  if (!touch) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    return;
  }
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [to] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
}

for (const starter of starters) {
  test(`starts ${starter.name} from Welcome with fitted baseplates and two mainlines`, async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await boot(page, { startAdvanced: false });
    await expect(page.getByRole("heading", { name: "What are you designing?" })).toBeVisible();
    for (const name of [...starters.map(({ name }) => name), advanced]) {
      const card = button(page, name);
      await expect(card).toBeVisible();
      await expect(card.locator("svg")).toBeVisible();
    }
    await expect(button(page, "Open existing project")).toBeVisible();
    await expect(button(page, "Import BlueBrick")).toBeVisible();
    const starterCard = button(page, starter.name);
    await starterCard.click();
    await expect(canvas(page)).toBeVisible();

    const { project } = await saveProject(page);
    expect(project.tables).toHaveLength(1);
    const [table] = project.tables;
    if (!table) throw new Error("The starter is missing its table");
    expect(table).toMatchObject({
      width: starter.width,
      depth: 128,
      niltc: starter.curve ? "corner" : "straight",
      fronts: starter.curve ? ["north", "west"] : ["north"],
    });
    const baseplates = project.items.filter(({ kind }) => kind === "baseplate");
    const centers = [16, 48, 80, 112].flatMap((y) =>
      Array.from({ length: starter.width / 32 }, (_, index) => ({
        x: 16 + 32 * index,
        y,
        angle: 0,
        tableId: table.id,
      })),
    );
    expect(baseplates).toHaveLength(centers.length);
    expect(baseplates).toEqual(
      expect.arrayContaining(centers.map((center) => expect.objectContaining(center))),
    );
    const rails = project.items.filter((item) => item.kind === "track");
    expect(rails).toHaveLength(starter.width / 8);
    expect(
      rails.every(({ heightPlates, tableId }) => heightPlates === 2 && tableId === table.id),
    ).toBe(true);
    expect(project.sections).toHaveLength(1);
    expect(project.sections[0]?.exits.map(({ edge }) => edge).sort()).toEqual([
      "east",
      starter.curve ? "south" : "west",
    ]);
    await expect(canvas(page).locator('[data-port-id][data-open="true"]')).toHaveCount(4);
    await expect(canvas(page).locator("[data-table-label]")).toHaveText(/\+2 pl$/);
    for (const front of table.fronts) {
      await expect(canvas(page).locator(`[data-audience-front-label="${front}"]`)).toBeVisible();
    }
    await expect(canvas(page).locator('use[stroke$="-raised)"]')).toHaveCount(0);
    const captions = canvas(page).locator("[data-track-caption]");

    if (starter.curve) {
      await expect(captions).toHaveText(["R120", "R104"]);
      for (const radius of [120, 104]) {
        expect(rails.filter(({ partId }) => partId === `bricktracks:r${radius}`)).toHaveLength(8);
      }
      const approaches = rails.filter(({ partId }) => partId === "lego:9v-s16");
      expect(approaches.map(({ x, y }) => [Math.round(x), Math.round(y)])).toEqual(
        [8, 24].flatMap((y) => [136, 152, 168, 184].map((x) => [x, y])),
      );
    } else {
      await expect(captions).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test("phone user adds and saves the suggested 40x40 siding without disturbing mainlines", async ({
  page,
  hasTouch,
}) => {
  test.skip(!hasTouch, "touch starter workflow");
  const errors = watchErrors(page);
  await boot(page, { startAdvanced: false });
  await button(page, "40\u00d740").tap();

  const scene = canvas(page).locator("[data-track-scene]");
  const addSiding = button(page, "Add a siding");
  await expect(addSiding).toBeVisible();
  await expect(scene.locator("[data-siding-space]")).toHaveCount(1);
  const before = (await saveProject(page)).project;
  await addSiding.tap();
  await expect(addSiding).toBeHidden();
  await expect(scene.locator("[data-siding-space]")).toHaveCount(0);
  await expect(scene.locator('[data-port-id][data-open="true"]')).toHaveCount(5);
  await expect(scene.locator("[data-overhang-for]")).toHaveCount(0);

  const { path, project } = await saveProject(page);
  expect(project.items.filter(({ kind }) => kind === "track")).toHaveLength(17);
  expect(project.items.find(({ id }) => id === "inner-3")).toMatchObject({
    partId: "lego:9v-r40-right",
    heightPlates: 2,
  });
  expect(project.items.find(({ id }) => id === "starter-siding-curve")).toMatchObject({
    partId: "lego:9v-r40",
    heightPlates: 2,
  });
  expect(project.items.find(({ id }) => id === "starter-siding-straight")).toMatchObject({
    partId: "trixbrix:s32",
    heightPlates: 2,
  });
  expect(project.sections[0]?.exits).toEqual(before.sections[0]?.exits);

  await button(page, "Undo").tap();
  expect((await saveProject(page)).project).toEqual(before);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    button(page, "Open").tap(),
  ]);
  await chooser.setFiles(path);
  await expect(scene.locator('[data-port-id][data-open="true"]')).toHaveCount(5);
  const studs = scene.locator("[data-baseplate-studs]").first();
  await expect(studs).toBeHidden();
  for (let step = 0; step < 4; step++) await button(page, "Zoom in").tap();
  await expect(studs).toBeVisible();
  expect(errors).toEqual([]);
});

test("places actual lanes and a baseplate on a rotated NILTC table", async ({ page, hasTouch }) => {
  const errors = watchErrors(page);
  await boot(page, { startAdvanced: false });
  await button(page, advanced).click();
  const table = canvas(page).locator("[data-table-id]");
  await expect(table).toHaveCount(0);
  await button(page, "+ Table").click();
  const dialog = page.getByRole("dialog", { name: "Add a table" });
  await dialog.getByLabel("Size preset").selectOption("40x40");
  await dialog.getByLabel("Table name").fill("Build table");
  await dialog.getByRole("button", { name: "Add table" }).click();
  await expect(table).toHaveCount(1);

  const north = page.getByRole("checkbox", { name: "North", exact: true });
  const south = page.getByRole("checkbox", { name: "South", exact: true });
  await north.check();
  await south.uncheck();
  await button(page, "Apply").click();
  const mode = page.getByRole("combobox", { name: /NILTC checks/ });
  await expect(mode).toHaveValue("straight");
  const checks = page.getByRole("region", { name: "NILTC checks" });
  const outer = checks.getByRole("button", { name: /^Outer mainline missing on Build table/ });
  const inner = checks.getByRole("button", { name: /^Inner mainline missing on Build table/ });
  await expect(outer).toBeVisible();
  await expect(inner).toBeVisible();
  await expect(checks.getByRole("button")).toHaveCount(2);
  const openEnds = canvas(page).locator('[data-port-id][data-open="true"]');
  await expect(openEnds).toHaveCount(0);

  const rotateTable = button(page, "Rotate table 90\u00b0");
  await rotateTable.click();
  await button(page, "Fit view").click();
  const showLibrary = button(page, "Show library");
  if (await showLibrary.isVisible()) await showLibrary.click();

  for (const y of [9.5, 22.5]) {
    await button(page, /^9V straight S16\s*LEGO/).click();
    await place(page, table, { x: 72, y }, hasTouch);
  }
  await button(page, "+ Baseplate").click();
  await place(page, table, { x: 18, y: 14 }, hasTouch);
  const initial = (await saveProject(page)).project;
  const [originalTable] = initial.tables;
  if (!originalTable) throw new Error("The added table was missing in the download");
  expect(originalTable).toMatchObject({ angle: 90, niltc: "straight", fronts: ["north"] });
  const rails = initial.items.filter((item) => item.kind === "track");
  expect(
    rails.map(({ y, angle, heightPlates, tableId }) => ({
      y,
      axis: angle % 180,
      heightPlates,
      tableId,
    })),
  ).toEqual([8, 24].map((y) => ({ y, axis: 0, heightPlates: 2, tableId: originalTable.id })));
  const baseplate = initial.items.find(({ kind }) => kind === "baseplate");
  expect(baseplate).toMatchObject({
    x: 16,
    y: 16,
    tableId: originalTable.id,
  });
  expect(baseplate && baseplate.angle % 90).toBe(0);
  await expect(openEnds).toHaveCount(4);

  await dragTable(page, table, hasTouch);
  const moved = (await saveProject(page)).project;
  expect(moved.tables[0]).toMatchObject({ x: originalTable.x - 32, y: originalTable.y + 32 });
  await button(page, /^Build table\s/).click();
  await rotateTable.click();
  const rotated = (await saveProject(page)).project;
  expect(rotated.tables[0]).toMatchObject({ angle: 180 });
  expect(rotated.items).toEqual(initial.items);

  const imported = structuredClone(rotated);
  const [importedTable] = imported.tables;
  const importedBaseplate = imported.items.find((item) => item.kind === "baseplate");
  if (!importedTable || !importedBaseplate) throw new Error("The download is missing the build");
  imported.name = "Imported off-grid project";
  delete importedTable.niltc;
  importedBaseplate.x += 2;
  importedBaseplate.name = "Imported baseplate";
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    button(page, "Open").click(),
  ]);
  await chooser.setFiles({
    name: "Imported off-grid.btp.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.getByRole("textbox", { name: "Layout name" })).toHaveValue(imported.name);
  await button(page, /^Build table\s/).click();
  await expect(mode).toHaveValue("off");
  const gridWarning = button(page, /Imported baseplate is off the 32-stud baseplate grid/);
  await expect(gridWarning).toHaveCount(0);
  const captions = canvas(page).locator("[data-track-caption]");
  await expect(captions).toHaveText(["+2 pl", "+2 pl"]);
  await mode.selectOption({ label: "Straight" });
  await expect(gridWarning).toBeVisible();
  await expect(captions).toHaveCount(0);
  await expect(openEnds).toHaveCount(4);

  const track = canvas(page).getByRole("button", { name: "9V straight S16" }).first();
  await track.press("Enter");
  await page.getByRole("spinbutton", { name: "Height (plates)" }).fill("0");
  await button(page, "Apply").click();
  await expect(captions).toHaveText("0 pl");
  await expect(track.locator('use[stroke$="-lowered)"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("snaps and duplicates siding track without moving either joined mainline", async ({
  page,
  hasTouch,
}) => {
  const errors = watchErrors(page);
  await boot(page, { startAdvanced: false });
  await chooseFile(page, button(page, "Open existing project"), example("two-section.btp.json"));
  await expect(page.getByRole("textbox", { name: "Layout name" })).toHaveValue("Two-section seam");
  const before = (await saveProject(page)).project;
  const scene = canvas(page).locator("[data-track-scene]");
  const joins = scene.locator('[data-seam-lane][data-status="joined"]');
  const branch = scene.locator('[data-piece-id="inner-turnout"][data-port-id="branch"]');
  await expect(joins).toHaveCount(2);
  await expect(branch).toHaveAttribute("data-open", "true");
  const showLibrary = button(page, "Show library");
  if (await showLibrary.isVisible()) await showLibrary.click();
  await button(page, /^Curve R104\s*TrixBrix/).click();
  await place(page, scene, { x: 66.5, y: 32.875 }, hasTouch);
  await expect(branch).toHaveAttribute("data-open", "false");
  await expect(joins).toHaveCount(2);

  const after = (await saveProject(page)).project;
  expect(after.seams).toEqual(before.seams);
  expect(after.items).toEqual(expect.arrayContaining(before.items));
  const siding = after.items.find(
    (item) => item.kind === "track" && item.partId === "trixbrix:r104",
  );
  expect(siding).toMatchObject({ angle: 22.5, tableId: "table-a" });
  if (!siding) throw new Error("The snapped siding is missing from the download");

  await button(page, "Duplicate selected").click();
  const duplicated = (await saveProject(page)).project;
  expect(duplicated.items).toHaveLength(after.items.length + 1);
  expect(duplicated.items).toEqual(expect.arrayContaining(after.items));
  const copy = duplicated.items.find((item) => !after.items.some(({ id }) => id === item.id));
  expect(copy).toEqual({ ...siding, id: expect.any(String), x: siding.x + 16 });
  expect(duplicated.seams).toEqual(before.seams);
  await expect(branch).toHaveAttribute("data-open", "false");
  await expect(joins).toHaveCount(2);
  expect(errors).toEqual([]);
});
