import { readFile } from "node:fs/promises";

import { expect } from "@playwright/test";

import straightExamples from "../../data/straight_examples.json" with { type: "json" };
import {
  boot,
  chooseFile,
  createProject,
  example,
  saveProject,
  test,
  watchErrors,
} from "./helper_planner";

test("members can open each packaged track template", async ({ planner }) => {
  const templates = [
    ["Member straight", "Member 60 x 40 straight"],
    ["Member corner", "NILTC 60 \u00d7 40 in"],
    ["Member yard", "Member R104 right yard"],
    ["U-shaped staging layout", "U-shaped staging layout"],
  ] as const;
  for (const [option, name] of templates) {
    await planner.getByLabel("Track templates").selectOption({ label: option });
    await expect(planner.getByLabel("Layout name")).toHaveValue(name);
  }
});

test("the 40 by 60 gallery previews and opens editable straight examples", async ({ page }) => {
  await boot(page, { startProject: false });
  const gallery = page.locator("#template-gallery");
  await page.getByRole("button", { name: "Browse 40 × 60 examples", exact: true }).click();
  await expect(gallery).toBeVisible();
  await expect(gallery.locator(".template-card")).toHaveCount(straightExamples.length);
  const drawings = gallery.locator(".template-card svg[data-track-scene]");
  await expect(drawings).toHaveCount(straightExamples.length);
  const mainlineFrame = (await drawings.first().getAttribute("viewBox"))?.split(" ").map(Number);
  expect(mainlineFrame?.[3]).toBeLessThan(192);
  const clipped = await gallery.locator(".template-card small").evaluateAll((descriptions) =>
    descriptions
      .filter((description) => {
        const card = description.closest("button")!;
        return description.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom + 1;
      })
      .map((description) => description.textContent),
  );
  expect(clipped).toEqual([]);
  await expect(gallery.locator(".template-card strong")).toHaveText(
    straightExamples.map(({ id, name }) => `#${id} ${name}`),
  );
  await expect(
    gallery.getByRole("button", { name: /^#2 Double crossover 15 track pieces/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(gallery).toBeHidden();
  await expect(page.locator("#start-screen")).toBeVisible();
  await expect(page.locator("#editor")).toBeHidden();

  await page.getByRole("button", { name: "Browse 40 × 60 examples", exact: true }).click();
  await gallery.getByRole("button", { name: /Mainline only/ }).click();
  await expect(gallery).toBeHidden();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.getByLabel("Layout name")).toHaveValue("40 x 60 straight: mainline only");
  await expect(page.locator("#design-size")).toContainText("40 × 60");

  await page.getByRole("button", { name: "Browse 40 × 60 examples", exact: true }).click();
  await gallery.getByRole("button", { name: /^#6 Short perpendicular freight spur/ }).click();
  await expect(page.getByLabel("Layout name")).toHaveValue("Short perpendicular freight spur");
  expect(
    (await saveProject(page)).project.items.filter(({ id }) => id.startsWith("freight-straight-")),
  ).toHaveLength(2);
});

test("closing the example gallery keeps the current editor plan", async ({ planner }) => {
  await planner.getByRole("button", { name: "Browse 40 × 60 examples", exact: true }).click();
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
  await expect(page.locator("#track-edit-hint")).toContainText(/named mainline/i);
  await expect(page.getByText("Move track", { exact: true })).toBeHidden();
  expect(errors).toEqual([]);
});

test("member creates a 40 by 60 corner with both standard curve radii", async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page, { startProject: false });
  await createProject(page, {
    assignment: "corner",
    width: "128",
    depth: "192",
    name: "corner member plan",
  });

  const saved = await saveProject(page);
  expect(saved.project.area).toMatchObject({
    width: 128,
    depth: 192,
    niltc: "corner",
    fronts: ["north", "east"],
  });
  const radii = saved.project.items.flatMap((item) => (item.kind === "track" ? [item.partId] : []));
  expect(radii.filter((partId) => partId === "bricktracks:r104")).toHaveLength(8);
  expect(radii.filter((partId) => partId === "bricktracks:r120")).toHaveLength(8);
  await expect(page.locator('#tabletop [data-port-id][data-open="true"]')).toHaveCount(4);
  expect(errors).toEqual([]);
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

test("a general plan starts with a single piece and names its first action", async ({ page }) => {
  await boot(page, { startProject: false });
  await createProject(page, { assignment: "general", width: "128", depth: "192" });
  await expect(page.getByRole("radio", { name: "Single piece" })).toBeChecked();
  await expect(page.locator("#build-hint")).toContainText("Choose a piece to start");
  await expect(page.getByRole("button", { name: "Place at center", exact: true })).toBeEnabled();
});

test("members can move, delete and undo edits to a selected piece", async ({ page, hasTouch }) => {
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
  if (hasTouch) await piece.tap();
  else await piece.click();
  await expect(remove).toBeEnabled();

  const [from, to] = await piece.evaluate((element) => {
    const matrix = (element as SVGGraphicsElement).getScreenCTM()!;
    return [new DOMPoint(0, 0), new DOMPoint(16, 16)].map((point) => {
      const { x, y } = point.matrixTransform(matrix);
      return { x, y };
    });
  });
  if (hasTouch) {
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from!] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [to!] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
  } else {
    await page.mouse.move(from!.x, from!.y);
    await page.mouse.down();
    await page.mouse.move(to!.x, to!.y, { steps: 3 });
    await page.mouse.up();
  }
  const moved = (await saveProject(page)).project;
  expect(moved.items).toEqual([{ ...item, x: item.x + 16, y: item.y + 16 }]);

  await page.getByText("Move track", { exact: true }).click();
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
  expect((await saveProject(page)).project.items).toEqual([]);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.click();
  expect((await saveProject(page)).project).toEqual(positioned);
  await undo.click();
  expect((await saveProject(page)).project).toEqual(moved);
  await undo.click();
  expect((await saveProject(page)).project).toEqual(original);
});

test("New design returns to the design-area dialog", async ({ planner }) => {
  await planner.locator("#new-project").click();
  const dialog = planner.locator("#area-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Start a new design" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
});

test("track controls stay inside their panels on a phone and laptop", async ({ page }) => {
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

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1200, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await boot(page, { startProject: false });
    const create = page.getByRole("button", { name: "Create track plan", exact: true });
    if (viewport.width < 750) await create.scrollIntoViewIfNeeded();
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
  }
});

test("member applies parking and a yard, traces a route, saves, opens, imports, and exports PDF", async ({
  page,
  browser,
  baseURL,
  viewport,
  hasTouch,
  isMobile,
}) => {
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

  await page.locator("#export-format").selectOption("pdf");
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  expect((await readFile(await pdf.path())).subarray(0, 4).toString()).toBe("%PDF");

  const native = afterYard;
  const fresh = await browser.newContext({ baseURL, viewport, hasTouch, isMobile });
  try {
    const reopened = await fresh.newPage();
    await boot(reopened, { startProject: false });
    await chooseFile(
      reopened,
      reopened.getByRole("button", { name: "Open track plan", exact: true }),
      native.path,
    );
    await expect(reopened.getByLabel("Layout name")).toHaveValue(native.project.name);
    expect((await saveProject(reopened)).project).toEqual(native.project);
  } finally {
    await fresh.close();
  }

  await chooseFile(
    page,
    page.getByRole("button", { name: "Import BlueBrick", exact: true }),
    example("bluebrick-example.bbm"),
  );
  await expect(page.locator("#import-preview")).toBeVisible();
  await page.getByRole("button", { name: "Open imported layout", exact: true }).click();
  await expect(page.locator("#tabletop [data-track-scene]")).toBeVisible();
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
  await form.locator('input[name="front"][value="north"]').check();
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
