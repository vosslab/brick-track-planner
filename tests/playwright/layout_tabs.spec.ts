import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

import type { TrackItem } from "../../src/project";
import {
  boot,
  chooseEditorFile,
  openEditorMenu,
  openEditingPlan,
  pickDrawing,
  saveProject,
  straight,
  test,
} from "./helper_planner";

const warnedTrack = 'g[data-kind="track"][data-placement-warning]';
const placementWarning = "#diagnostics [data-placement-warning]";

function activate(control: Locator, hasTouch: boolean): Promise<void> {
  return hasTouch ? control.tap() : control.press("Enter");
}

test("members can copy a connected siding between two open yards", async ({ page, hasTouch }) => {
  await boot(page, { startProject: false });
  const groupId = "siding";
  const source = await openEditingPlan(
    page,
    [
      { ...straight("siding-west", 32, 48, 0, 2), groupId, ballast: "gray" },
      { ...straight("siding-east", 48, 48, 0, 2), groupId, ballast: "gray" },
    ],
    "Source yard",
  );
  const tabs = page.getByRole("tablist", { name: "Open layouts" });
  const sourceTab = tabs.getByRole("tab", { name: source.name, exact: true });
  const destination = await openEditingPlan(
    page,
    [straight("destination-lead", 96, 80, 0, 2)],
    "Destination yard",
  );
  const destinationTab = tabs.getByRole("tab", { name: destination.name, exact: true });

  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  const track = (id: string): Locator =>
    canvas.locator(`[data-piece-id="${id}"][data-kind="track"]`);
  const end = (id: string, port: string): Locator =>
    canvas.locator(`[data-piece-id="${id}"][data-port-id="${port}"]`);
  await activate(sourceTab, hasTouch);
  await activate(track("siding-west"), hasTouch);
  await openEditorMenu(page, "Tools");
  await activate(page.getByRole("button", { name: "Select arrangement", exact: true }), hasTouch);
  await activate(page.getByRole("button", { name: "Copy", exact: true }), hasTouch);
  await activate(destinationTab, hasTouch);
  const paste = page.getByRole("button", { name: "Paste", exact: true });
  await activate(paste, hasTouch);

  const placement = page.getByRole("combobox", { name: "Placement", exact: true });
  await placement.selectOption("fine");
  if (hasTouch) await track("destination-lead").tap();
  else await track("destination-lead").click();
  await expect(track("destination-lead")).toHaveAttribute("data-placement-warning");
  await pickDrawing(canvas, hasTouch, 80, 132);
  const flagged = await saveProject(page);
  expect(flagged.project.items).toHaveLength(3);
  expect(flagged.project.items.slice(1).map(({ x, y }) => [x, y])).toEqual([
    [96, 80],
    [112, 80],
  ]);

  await chooseEditorFile(page, flagged.path);
  await expect(
    tabs.getByRole("tab", { name: "Destination yard (2)", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(track("destination-lead")).toHaveAttribute("data-placement-warning");
  await page.locator(hasTouch ? "#show-inspector" : "#sidebar-inspector").click();
  await expect(
    page
      .locator(placementWarning)
      .filter({ hasText: /overlap/i })
      .first(),
  ).toBeVisible();
  await activate(tabs.getByRole("tab", { name: "Destination yard (1)", exact: true }), hasTouch);
  await activate(page.getByRole("button", { name: "Undo", exact: true }), hasTouch);
  await expect(canvas.locator(warnedTrack)).toHaveCount(0);
  await expect(page.locator(placementWarning)).toHaveCount(0);

  await activate(paste, hasTouch);
  const railEnd = end("destination-lead", "a");
  if (hasTouch) await railEnd.tap();
  else await railEnd.click();
  await expect(railEnd).toHaveAttribute("data-open", "false");
  await expect(canvas.locator(warnedTrack)).toHaveCount(0);

  const pasted = (await saveProject(page)).project;
  expect(pasted.items).toHaveLength(3);
  const [lead, west, east] = pasted.items as TrackItem[];
  expect(lead).toEqual(destination.items[0]);
  expect(new Set([lead!.id, west!.id, east!.id, ...source.items.map(({ id }) => id)]).size).toBe(5);
  expect(west!.groupId).toBeTruthy();
  expect(west!.groupId).not.toBe(groupId);
  expect(west).toEqual({ ...source.items[0], id: west!.id, groupId: west!.groupId, x: 64, y: 80 });
  expect(east).toEqual({ ...source.items[1], id: east!.id, groupId: west!.groupId, x: 80, y: 80 });
  await expect(end(west!.id, "b")).toHaveAttribute("data-open", "false");
  await expect(end(east!.id, "a")).toHaveAttribute("data-open", "false");
  await expect(end(east!.id, "b")).toHaveAttribute("data-open", "false");
  await activate(sourceTab, hasTouch);
  expect((await saveProject(page)).project).toEqual(source);
});

test("members can compare, save, and close an edited layout variant", async ({
  page,
  hasTouch,
}) => {
  await boot(page, { startProject: false });
  const original = await openEditingPlan(page, [straight("turnout-lead", 64, 96)], "Yard plan");
  const tabs = page.getByRole("tablist", { name: "Open layouts" });
  const originalTab = tabs.getByRole("tab", { name: original.name, exact: true });
  const variantTab = tabs.getByRole("tab", { name: "Longer lead", exact: true });
  const canvas = page.getByRole("group", { name: "Track plan", exact: true });
  const scene = canvas.locator("svg[data-track-scene]");
  const drawing = scene.locator("[data-scene-drawing]");
  const track = canvas.getByRole("button", { name: "RC/PF straight S16", exact: true });
  const rotateTrack = page.getByRole("button", { name: "Rotate right", exact: true });
  const rotateView = page.getByRole("button", { name: "Rotate view clockwise", exact: true });
  const layoutName = page.getByLabel("Layout name", { exact: true });

  await test.step("Branch the edited layout and compare both drawings", async () => {
    await expect(originalTab).toHaveAttribute("aria-selected", "true");
    await activate(track, hasTouch);
    await openEditorMenu(page, "Tools");
    await rotateTrack.click();
    await rotateView.click();
    const originalView = (await scene.getAttribute("viewBox"))!;
    const originalPose = (await track.getAttribute("transform"))!;
    await openEditorMenu(page, "Layout");
    await page.getByRole("button", { name: "Duplicate plan", exact: true }).click();
    await expect(tabs.getByRole("tab", { name: "Yard plan (copy)", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(scene).toHaveAttribute("viewBox", originalView);
    await expect(drawing).toHaveAttribute("transform", "rotate(90)");
    await expect(track).toHaveAttribute("transform", originalPose);

    await openEditorMenu(page, "Layout");
    await layoutName.fill("Longer lead");
    await layoutName.blur();
    await expect(variantTab).toHaveAttribute("aria-selected", "true");
    await activate(track, hasTouch);
    await openEditorMenu(page, "Tools");
    await rotateTrack.click();
    await rotateView.click();
    const variantView = (await scene.getAttribute("viewBox"))!;
    const variantPose = (await track.getAttribute("transform"))!;
    expect(variantView).not.toBe(originalView);
    expect(variantPose).not.toBe(originalPose);

    if (hasTouch) await originalTab.tap();
    else {
      await variantTab.press("ArrowLeft");
      await expect(originalTab).toBeFocused();
      await expect(variantTab).toHaveAttribute("aria-selected", "true");
      await originalTab.press("Enter");
    }
    await expect(layoutName).toHaveValue(original.name);
    await expect(scene).toHaveAttribute("viewBox", originalView);
    await expect(drawing).toHaveAttribute("transform", "rotate(90)");
    await expect(track).toHaveAttribute("transform", originalPose);

    if (hasTouch) await variantTab.tap();
    else {
      await originalTab.press("ArrowRight");
      await expect(variantTab).toBeFocused();
      await variantTab.press("Enter");
    }
    await expect(layoutName).toHaveValue("Longer lead");
    await expect(scene).toHaveAttribute("viewBox", variantView);
    await expect(drawing).toHaveAttribute("transform", "rotate(180)");
    await expect(track).toHaveAttribute("transform", variantPose);
  });

  await test.step("Cancel closing the unsaved variant, then save and close it", async () => {
    const close = page.getByRole("button", { name: "Close layout", exact: true });
    const keep = page.getByRole("button", { name: "Keep editing", exact: true });
    const dialog = page.getByRole("dialog").filter({ has: keep });
    await openEditorMenu(page, "Layout");
    await close.click();
    await expect(dialog).toContainText("Longer lead");
    await expect(keep).toBeFocused();
    await activate(keep, hasTouch);
    await expect(dialog).toBeHidden();
    await expect(variantTab).toHaveAttribute("aria-selected", "true");

    expect((await saveProject(page)).project).toEqual({
      ...original,
      name: "Longer lead",
      items: [{ ...original.items[0], angle: 180 }],
    });
    await openEditorMenu(page, "Layout");
    await close.click();
    await expect(variantTab).toHaveCount(0);
    await expect(originalTab).toHaveAttribute("aria-selected", "true");
    expect((await saveProject(page)).project).toEqual({
      ...original,
      items: [{ ...original.items[0], angle: 90 }],
    });
  });
});
