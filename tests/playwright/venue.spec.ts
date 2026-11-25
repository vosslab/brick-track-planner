import { expect } from "@playwright/test";

import { saveProject, test } from "./helper_planner";

test("edits and diagnoses a measured venue with undoable keepouts", async ({ planner }) => {
  const project = {
    version: 1,
    name: "Venue fit check",
    layers: [{ id: "layout", name: "Layout", visible: true }],
    tables: [
      { id: "a", name: "Table A", x: 0, y: 0, angle: 0 },
      { id: "b", name: "Table B", x: 48, y: 48, angle: 270 },
    ].map((table) => ({ ...table, layerId: "layout", width: 32, depth: 32, fronts: [] })),
    items: [
      {
        id: "unknown",
        kind: "unresolved",
        layerId: "layout",
        sourceId: "demo.8",
        name: "Unmapped decoration",
        reason: "Unmapped part",
        x: 25,
        y: 40,
        width: 2,
        depth: 2,
        angle: 0,
      },
    ],
    seams: [],
  };
  const [chooser] = await Promise.all([
    planner.waitForEvent("filechooser"),
    planner.getByRole("button", { name: "Open", exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: "Venue fit check.btp.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(planner.getByLabel("Layout name")).toHaveValue(project.name);

  const venue = planner.getByRole("region", { name: "Venue", exact: true });
  const summary = planner.locator("summary").filter({ hasText: /^Venue$/ });
  await summary.press("Enter");
  await summary.press("Tab");
  const unit = venue.getByLabel("Measurement unit");
  const width = venue.getByLabel("Venue width");
  await expect(unit).toBeFocused();
  await expect(
    venue.getByRole("button", { name: /Unresolved.*Unmapped decoration/ }),
  ).toBeVisible();

  await unit.selectOption({ label: "Inches" });
  await width.fill("0");
  await venue.getByLabel("Venue depth").fill("20");
  await venue.getByRole("button", { name: "Save venue" }).click();
  await expect(width).toHaveJSProperty(
    "validationMessage",
    "Enter a positive venue width up to 100000 studs.",
  );
  await width.fill("20");
  await width.press("Enter");
  await expect(venue.getByRole("button", { name: "Table B is outside the venue" })).toBeVisible();

  await unit.selectOption({ label: "Centimeters" });
  await expect(width).toHaveValue("50.8");
  await venue.getByText("Add a keepout", { exact: true }).click();
  const add = venue.locator("details").filter({ hasText: "Add a keepout" });
  await add.getByLabel("Keepout name").fill("Door swing");
  await add.getByLabel("Center X").fill("-0.8");
  await add.getByLabel("Center Y").fill("8");
  await add.getByLabel("Keepout width").fill("16");
  await add.getByLabel("Keepout depth").fill("8");
  await add.getByRole("button", { name: "Add keepout" }).click();

  const door = venue.locator("summary").filter({ hasText: /^Door swing$/ });
  await expect(door).toBeFocused();
  await expect(
    venue.getByRole("button", { name: "Table A overlaps keepout Door swing" }),
  ).toBeVisible();
  expect((await saveProject(planner)).project.venue).toEqual({
    width: 63.5,
    depth: 63.5,
    keepouts: [{ id: expect.any(String), name: "Door swing", x: -1, y: 10, width: 20, depth: 10 }],
  });

  await door.click();
  const existing = venue.locator("details").filter({ hasText: "Door swing" });
  await existing.getByLabel("Keepout name").fill("Exit aisle");
  await existing.getByRole("button", { name: "Save keepout" }).click();
  await expect(
    venue.getByRole("button", { name: "Table A overlaps keepout Exit aisle" }),
  ).toBeVisible();
  await venue.getByRole("button", { name: "Delete keepout" }).click();
  await expect(venue.getByText("Exit aisle", { exact: true })).toHaveCount(0);
  await planner.getByRole("button", { name: "Undo" }).click();
  await expect(venue.getByText("Exit aisle", { exact: true })).toBeVisible();
});
