import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

import type { TrackItem } from "../../src/project";
import {
  boot,
  openEditorMenu,
  openEditingPlan,
  saveProject,
  straight,
  test,
} from "./helper_planner";

function activate(control: Locator, hasTouch: boolean): Promise<void> {
  return hasTouch ? control.tap() : control.press("Enter");
}

test("[touch] members can copy a connected siding between two open yards", async ({
  page,
  hasTouch,
}) => {
  await boot(page, { startProject: false });
  const groupId = "siding";
  const source = await openEditingPlan(
    page,
    [
      { ...straight("siding-west", 32, 48), groupId, ballast: "gray" },
      { ...straight("siding-east", 48, 48), groupId, ballast: "gray" },
    ],
    "Source yard",
  );
  const tabs = page.getByRole("tablist", { name: "Open layouts" });
  const sourceTab = tabs.getByRole("tab", { name: source.name, exact: true });
  const destination = await openEditingPlan(
    page,
    [straight("destination-lead", 96, 80)],
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
  await openEditorMenu(page, "Tools");
  const paste = page.getByRole("button", { name: "Paste", exact: true });
  await activate(paste, hasTouch);

  const railEnd = end("destination-lead", "a");
  if (hasTouch) await railEnd.tap();
  else await railEnd.click();
  await expect(railEnd).toHaveAttribute("data-open", "false");

  const pasted = (await saveProject(page)).project;
  expect(pasted.items).toHaveLength(3);
  const [lead, west, east] = pasted.items as TrackItem[];
  expect(lead).toEqual(destination.items[0]);
  const copiedGroupId = west!.groupId;
  expect(copiedGroupId).toBeTruthy();
  expect(copiedGroupId).not.toBe(groupId);
  expect(west).toMatchObject({ x: 64, y: 80, ballast: "gray", groupId: copiedGroupId });
  expect(east).toMatchObject({ x: 80, y: 80, ballast: "gray", groupId: copiedGroupId });
  await expect(end(west!.id, "b")).toHaveAttribute("data-open", "false");
  await expect(end(east!.id, "a")).toHaveAttribute("data-open", "false");
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
  const layoutName = page.getByLabel("Layout name", { exact: true });

  await expect(originalTab).toHaveAttribute("aria-selected", "true");
  await openEditorMenu(page, "Layout");
  await page.getByRole("button", { name: "Duplicate plan", exact: true }).click();
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await openEditorMenu(page, "Layout");
  await layoutName.fill("Longer lead");
  await layoutName.blur();
  await expect(variantTab).toHaveAttribute("aria-selected", "true");

  if (hasTouch) await originalTab.tap();
  else {
    await variantTab.press("ArrowLeft");
    await expect(originalTab).toBeFocused();
    await originalTab.press("Enter");
  }
  await expect(layoutName).toHaveValue(original.name);
  await activate(variantTab, hasTouch);
  await expect(layoutName).toHaveValue("Longer lead");

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

    expect((await saveProject(page)).project).toEqual({ ...original, name: "Longer lead" });
    await openEditorMenu(page, "Layout");
    await close.click();
    await expect(variantTab).toHaveCount(0);
    await expect(originalTab).toHaveAttribute("aria-selected", "true");
    expect((await saveProject(page)).project).toEqual(original);
  });
});
