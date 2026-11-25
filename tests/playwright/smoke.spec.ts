import { expect } from "@playwright/test";

import { boot, chooseFile, example, saveProject, test, watchErrors } from "./helper_planner";

// The Open and Layout name controls are in src/index.html:17 and :34.
test("opens and saves a native project at the Pages project path", async ({
  planner,
  browser,
  baseURL,
  viewport,
  hasTouch,
  isMobile,
}) => {
  const path = example("double-corner.btp.json");
  await chooseFile(planner, planner.getByRole("button", { name: "Open", exact: true }), path);
  await expect(planner.locator("[data-piece-id]").first()).toBeVisible();
  const native = await saveProject(planner);
  expect(native.project.items).toHaveLength(16);

  const fresh = await browser.newContext({ baseURL, viewport, hasTouch, isMobile });
  try {
    const reopened = await fresh.newPage();
    const errors = watchErrors(reopened);
    await boot(reopened);
    await chooseFile(
      reopened,
      reopened.getByRole("button", { name: "Open", exact: true }),
      native.path,
    );
    await expect(reopened.getByRole("textbox", { name: "Layout name" })).toHaveValue(
      native.project.name,
    );
    const guides = reopened.locator('[data-table-id="corner"] [data-lane-studs]');
    await expect(guides).toHaveCount(4);
    for (const front of ["north", "west"]) {
      for (const offset of [8, 24]) {
        await expect(
          guides.and(reopened.locator(`[data-front="${front}"][data-lane-studs="${offset}"]`)),
        ).toHaveCount(1);
      }
    }
    const exits = reopened.locator('[data-port-id][data-open="true"]');
    await expect(exits).toHaveCount(4);
    for (const [piece, port, x, y] of [
      ["r104-1", "a", 24, 128],
      ["r104-8", "b", 128, 24],
      ["r120-1", "a", 8, 128],
      ["r120-8", "b", 128, 8],
    ]) {
      const mark = exits.and(
        reopened.locator(`[data-piece-id="${piece}"][data-port-id="${port}"]`),
      );
      const circle = mark.locator("circle").first();
      expect(Number(await circle.getAttribute("cx"))).toBeCloseTo(Number(x), 6);
      expect(Number(await circle.getAttribute("cy"))).toBeCloseTo(Number(y), 6);
    }
    expect((await saveProject(reopened)).project).toEqual(native.project);
    expect(errors).toEqual([]);
  } finally {
    await fresh.close();
  }
});
