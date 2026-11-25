import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { worldPose } from "../../src/project";
import type { Project } from "../../src/project";
import { chooseFile, example, saveProject, test } from "./helper_planner";

// The inspector controls are built in src/editor_panels.ts:42-75 and :151-166.
// Seam and connector state comes from src/scene.ts:280-332 and :402-415.
function activate(target: Locator, touch: boolean): Promise<void> {
  return touch ? target.tap() : target.click();
}

function end(page: Page, pieceId: string, portId: string): Locator {
  return page.locator(`[data-piece-id="${pieceId}"][data-port-id="${portId}"]`);
}

async function openSeamExample(page: Page): Promise<void> {
  await chooseFile(
    page,
    page.getByRole("button", { name: "Open", exact: true }),
    example("two-section.btp.json"),
  );
  await expect(page.getByRole("textbox", { name: "Layout name" })).toHaveValue("Two-section seam");
}

function lane(page: Page, name: "inner" | "outer"): Locator {
  return page.locator(`[data-seam-lane="${name}"]`);
}

async function applyPose(
  page: Page,
  touch: boolean,
  changes: Record<string, string>,
): Promise<void> {
  for (const [label, value] of Object.entries(changes)) {
    await page.getByRole("spinbutton", { name: label }).fill(value);
  }
  await activate(page.getByRole("button", { name: "Apply", exact: true }), touch);
}

test("updates both seam gaps, S8 support and inventory after shifting and undoing", async ({
  planner,
  hasTouch,
}) => {
  await openSeamExample(planner);
  const outer = lane(planner, "outer");
  const inner = lane(planner, "inner");
  const span = planner.locator('[data-overhang-for="inner-span"]');
  await expect(outer).toHaveAttribute("data-status", "joined");
  await expect(inner).toHaveAttribute("data-status", "joined");
  await expect(span).toHaveCount(0);
  await expect(planner.locator("#parts-count")).toHaveText("11");

  await activate(planner.getByRole("button", { name: /^Table B/ }), hasTouch);
  await applyPose(planner, hasTouch, { "X (studs)": "130" });
  for (const marker of [outer, inner]) {
    await expect(marker).toHaveAttribute("data-status", "misaligned");
    await expect(marker).toContainText("2.00 studs");
  }
  await expect(span).toBeVisible();
  const overhang = planner.locator('button[data-overhang-id="inner-span"]');
  await activate(overhang, hasTouch);
  await activate(planner.getByRole("button", { name: "Undo", exact: true }), hasTouch);
  for (const marker of [outer, inner])
    await expect(marker).toHaveAttribute("data-status", "joined");
  await expect(span).toHaveCount(0);
  await expect(planner.locator("#parts-count")).toHaveText("11");

  await expect(planner.getByRole("heading", { name: "Straight S8" })).toBeVisible();
  await applyPose(planner, hasTouch, { "Height (plates)": "1" });
  await expect(inner).toHaveAttribute("data-status", "height");
  await expect(outer).toHaveAttribute("data-status", "joined");
  await expect(planner.getByText("Inner: rail heights differ (1 plate)")).toBeVisible();
  await expect(planner.locator('[data-track-caption="inner-span"]')).toHaveText("+1 pl");
});

test("creates and repairs a seam with the actual S8 connector past the table", async ({
  planner,
  hasTouch,
}) => {
  await openSeamExample(planner);
  const receiving = planner.getByRole("button", { name: /^Table B/ });
  await activate(receiving, hasTouch);
  await applyPose(planner, hasTouch, { "X (studs)": "140", "Rotation (degrees)": "5" });
  await expect(lane(planner, "inner")).toHaveAttribute("data-status", "misaligned");
  await applyPose(planner, hasTouch, { "Rotation (degrees)": "0" });
  const seam = planner.getByRole("button", { name: /^Table A \/ Table B/ });
  await activate(seam, hasTouch);
  await activate(planner.getByRole("button", { name: "Delete seam" }), hasTouch);
  await expect(seam).toHaveCount(0);

  await activate(planner.getByRole("button", { name: "Seam", exact: true }), hasTouch);
  const spanEnd = end(planner, "inner-span", "b");
  await expect(spanEnd.locator("circle").first()).toHaveAttribute("cx", "136");
  for (const [label, connector] of [
    ["Outer A", end(planner, "outer-a", "b")],
    ["Outer B", end(planner, "outer-b", "a")],
    ["Inner A", spanEnd],
    ["Inner B", end(planner, "inner-b", "a")],
  ] as const) {
    await activate(planner.getByRole("button", { name: new RegExp(`^${label}:`) }), hasTouch);
    await activate(connector, hasTouch);
  }
  const save = planner.getByRole("button", { name: "Save seam" });
  await activate(save, hasTouch);
  await expect(lane(planner, "inner")).toHaveAttribute("data-status", "misaligned");

  const common = end(planner, "inner-turnout", "common");
  const innerA = planner.getByRole("button", { name: /^Inner A:/ });
  await activate(seam, hasTouch);
  await expect(innerA).toHaveAttribute("data-bound-piece", "inner-span");
  await activate(innerA, hasTouch);
  await activate(common, hasTouch);
  await expect(innerA).toHaveAttribute("data-bound-piece", "inner-turnout");
  await activate(save, hasTouch);
  await activate(common, hasTouch);
  await expect(planner.getByRole("heading", { name: "R104 right turnout body" })).toBeVisible();
  await activate(planner.getByRole("button", { name: "Delete", exact: true }), hasTouch);
  await expect(lane(planner, "inner")).toHaveAttribute("data-status", "missing");

  await activate(seam, hasTouch);
  await activate(innerA, hasTouch);
  await activate(spanEnd, hasTouch);
  await expect(innerA).toHaveAttribute("data-bound-piece", "inner-span");
  await expect(innerA).toHaveAttribute("data-bound-port", "b");
  await activate(save, hasTouch);
  await activate(receiving, hasTouch);
  await applyPose(planner, hasTouch, { "X (studs)": "128" });
  await expect(lane(planner, "inner")).toHaveAttribute("data-status", "joined");
  await expect(lane(planner, "outer")).toHaveAttribute("data-status", "joined");
  const project = (await saveProject(planner)).project;
  expect(project.seams[0]?.inner.a).toEqual({ pieceId: "inner-span", portId: "b" });
  expect(project.items.find(({ id }) => id === "inner-span")).toMatchObject({ tableId: "table-a" });
});

test("adds a mixed-brand siding without changing either mainline pair", async ({
  planner,
  hasTouch,
}) => {
  await openSeamExample(planner);
  const branch = end(planner, "inner-turnout", "branch");
  await expect(branch).toHaveAttribute("data-open", "true");
  await activate(planner.locator('button[data-part-id="trixbrix:r104"]'), hasTouch);
  const scene = planner.locator("[data-track-scene]");
  const at = await scene.evaluate((svg) => {
    const matrix = svg instanceof SVGSVGElement ? svg.getScreenCTM() : null;
    if (!matrix) throw new Error("The layout camera is unavailable");
    // Position the unrotated curve's first connector on the turnout branch.
    const point = new DOMPoint(66.5, 32.875).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
  if (hasTouch) await planner.touchscreen.tap(at.x, at.y);
  else await planner.mouse.click(at.x, at.y);
  await expect(branch).toHaveAttribute("data-open", "false");
  await expect(planner.locator("#parts-count")).toHaveText("12");
  await expect(lane(planner, "outer")).toHaveAttribute("data-status", "joined");
  await expect(lane(planner, "inner")).toHaveAttribute("data-status", "joined");
  const saved = (await saveProject(planner)).project;
  expect(saved.items).toContainEqual(
    expect.objectContaining({
      partId: "trixbrix:r104",
      tableId: "table-a",
      angle: 22.5,
    }),
  );
});

function worldX(project: Project, id: string): number {
  const piece = project.items.find((item) => item.id === id);
  if (!piece) throw new Error(`Missing fixture track ${id}`);
  return worldPose(piece, project.tables).x;
}

test("moves track as a rigid selection and previews a turnout swap around its common connector", async ({
  planner,
  hasTouch,
}) => {
  test.skip(hasTouch, "desktop editing regression");
  await openSeamExample(planner);
  const initial = (await saveProject(planner)).project;
  const multi = planner.getByRole("checkbox", { name: "Multi-select" });
  await multi.check();
  for (const id of ["outer-a", "outer-b"]) {
    await planner.locator(`[data-piece-id="${id}"][data-kind="track"]`).click();
  }
  await expect(planner.getByRole("heading", { name: "2 selected" })).toBeVisible();
  await applyPose(planner, false, { "X (studs)": "122" });
  const moved = (await saveProject(planner)).project;
  expect(worldX(moved, "outer-a") - worldX(initial, "outer-a")).toBe(2);
  expect(worldX(moved, "outer-b") - worldX(initial, "outer-b")).toBe(2);
  expect(moved.seams).toEqual(initial.seams);
  await expect(lane(planner, "outer")).toHaveAttribute("data-status", "joined");
  await planner.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saveProject(planner)).project).toEqual(initial);
  await multi.uncheck();

  const common = end(planner, "inner-turnout", "common");
  await common.click();
  const variant = planner.getByLabel("Swap turnout (keep common port)");
  const heading = planner.getByRole("heading", { name: "Turnout swap preview" });
  const marker = common.locator("circle").first();
  const x = Number(await marker.getAttribute("cx"));
  const y = Number(await marker.getAttribute("cy"));
  await variant.selectOption("bricktracks:r104-left-body");
  await expect(heading).toBeVisible();

  const name = planner.getByRole("textbox", { name: "Layout name" });
  await name.fill("Updated layout");
  await name.press("Tab");
  await expect(heading).toHaveCount(0);
  expect((await saveProject(planner)).project).toEqual({ ...initial, name: "Updated layout" });

  await variant.selectOption("bricktracks:r104-left-body");
  await planner.getByRole("button", { name: "Apply swap" }).click();
  const swapped = (await saveProject(planner)).project;
  expect(swapped.items.find(({ id }) => id === "inner-turnout")).toMatchObject({
    partId: "bricktracks:r104-left-body",
    heightPlates: 0,
  });
  expect(Number(await marker.getAttribute("cx"))).toBeCloseTo(x, 6);
  expect(Number(await marker.getAttribute("cy"))).toBeCloseTo(y, 6);
  expect(swapped.seams).toEqual(initial.seams);
});
