import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { chooseFile, saveProject, test } from "./helper_planner";

// Appearance: src/editor_panels.ts:145. Canvas item IDs: src/scene.ts:286.
// Inventory rows: src/editor_inventory.ts:6. Published S16 recipe: data/ballast_recipes.json:3.
const baseplate = { id: "plate", kind: "baseplate", x: 32, y: 56, color: "#aa3366" };
const straight = { id: "straight", kind: "track", partId: "lego:9v-s16", x: 24, y: 18 };
const next = { ...straight, id: "next-straight", x: 40 };
const pose = { layerId: "layout", tableId: "table", angle: 0 };
const layout = {
  version: 1,
  name: "Appearance sample",
  tables: [
    {
      id: "table",
      name: "Table",
      layerId: "layout",
      x: 0,
      y: 0,
      angle: 0,
      width: 64,
      depth: 80,
      fronts: [],
    },
  ],
  layers: [{ id: "layout", name: "Layout", visible: true }],
  items: [
    { ...baseplate, ...pose },
    { ...straight, ...pose, heightPlates: 2 },
    { ...next, ...pose, heightPlates: 3 },
  ],
  seams: [],
};

function canvasItem(page: Page, id: string): Locator {
  return page.locator(`#scene-item-${id}`);
}

function activate(target: Locator, touch: boolean): Promise<void> {
  return touch ? target.tap() : target.click();
}

async function openSample(page: Page): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Open", exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: "appearance.btp.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(layout)),
  });
  await expect(page.getByRole("textbox", { name: "Layout name" })).toHaveValue(layout.name);
}

test("edits appearance on a small screen and saves it independently of geometry", async ({
  planner,
  hasTouch,
}) => {
  if (hasTouch) await planner.setViewportSize({ width: 390, height: 844 });
  await openSample(planner);
  await activate(canvasItem(planner, baseplate.id), hasTouch);
  await expect(planner.getByText("Custom (#aa3366)", { exact: true })).toBeVisible();
  const tan = planner.getByRole("button", { name: "Tan", exact: true });
  await activate(tan, hasTouch);
  await expect(tan).toHaveAttribute("aria-pressed", "true");

  await activate(canvasItem(planner, straight.id), hasTouch);
  const ballast = planner.getByRole("combobox", { name: "Ballast style" });
  const count = planner.getByRole("checkbox", { name: "Count PennLUG ballast" });
  await expect(planner.getByText(/allow \+2 plates/)).toBeVisible();
  await ballast.selectOption({ label: "PennLUG-style" });
  await expect(count).not.toBeChecked();
  await activate(count, hasTouch);
  await expect(count).toBeChecked();
  await activate(planner.getByText("Show inventory", { exact: true }), hasTouch);
  const inventory = planner.getByRole("region", { name: "Show inventory" });
  const materials = inventory.getByRole("heading", { name: "Published PennLUG materials" });
  await expect(materials).toBeVisible();
  await expect(
    inventory.locator(".list-row").filter({ hasText: "Tile 1 x 1 (black, 3070)" }).first(),
  ).toHaveText(/3070\)\s*16$/);
  await activate(planner.getByRole("button", { name: "Undo", exact: true }), hasTouch);
  await expect(count).not.toBeChecked();
  await expect(ballast).toHaveValue("pennlug");
  await expect(materials).toHaveCount(0);
  await activate(count, hasTouch);

  const { path, project } = await saveProject(planner);
  expect(project.items).toEqual([
    { ...layout.items[0], color: "#c9aa7c" },
    { ...layout.items[1], ballast: "pennlug", countBallast: true },
    layout.items[2],
  ]);
  await chooseFile(planner, planner.getByRole("button", { name: "Open", exact: true }), path);
  await activate(canvasItem(planner, straight.id), hasTouch);
  await expect(ballast).toHaveValue("pennlug");
  await expect(count).toBeChecked();
  await expect(planner.getByRole("spinbutton", { name: "Height (plates)" })).toHaveValue("2");
});

test("edits mixed track styles and counts as separate group changes", async ({ planner }) => {
  await openSample(planner);
  const ballast = planner.getByRole("combobox", { name: "Ballast style" });
  const count = planner.getByRole("checkbox", { name: "Count PennLUG ballast" });
  await canvasItem(planner, straight.id).press("Enter");
  await ballast.selectOption("gray");
  await count.check();
  await canvasItem(planner, next.id).press("Shift+Enter");
  await expect(planner.getByRole("heading", { name: "2 selected" })).toBeVisible();
  await expect(ballast).toHaveValue("");
  await expect(count).toBeChecked({ indeterminate: true });

  await ballast.selectOption("pennlug");
  await expect(count).toBeChecked({ indeterminate: true });
  await count.click();
  await expect(count).toBeChecked();
  await expect(ballast).toHaveValue("pennlug");
  await planner.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(count).toBeChecked({ indeterminate: true });
  const { project } = await saveProject(planner);
  expect(project.items).toEqual([
    layout.items[0],
    { ...layout.items[1], ballast: "pennlug", countBallast: true },
    { ...layout.items[2], ballast: "pennlug" },
  ]);
});
