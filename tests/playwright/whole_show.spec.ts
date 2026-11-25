import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

import { expect } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";

import { boot, chooseFile, example, saveProject, test, watchErrors } from "./helper_planner";

// Files and panels use labels from src/index.html:19-49 and :143-155. Section entries and previews
// are in src/editor_sections.ts:277-290 and :621-727; the parts rows are in src/editor_inventory.ts.
// The scene and pose controls use src/scene.ts:358-363 and src/editor_panels.ts:68-86.
const templates = ["corner", "yard", "connector", "siding"] as const;
type Template = (typeof templates)[number];
type Exit = [section: string, name: string];

function action(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

function scene(page: Page): Locator {
  return page.getByRole("group", { name: "Tabletop canvas" }).locator("[data-track-scene]");
}

function lanes(page: Page, status: string): Locator {
  return scene(page).locator(`[data-seam-lane][data-status="${status}"]`);
}

async function importSection(
  page: Page,
  path: string,
  pose?: [x: number, y: number, angle: number],
): Promise<void> {
  await chooseFile(page, action(page, "Import section"), path);
  const preview = page.locator("#section-preview");
  await expect(preview).toBeVisible();
  if (pose) {
    for (const [index, field] of ["x", "y", "angle"].entries()) {
      await preview.locator(`#section-import-${field}`).fill(String(pose[index]));
    }
  }
  await action(page, "Import section copy").click();
  await expect(preview).toBeHidden();
}

async function downloadSection(page: Page, template: Template, info: TestInfo): Promise<string> {
  await page.getByText("Sections & exits", { exact: true }).click();
  await importSection(page, example(`${template}.btps.json`));
  await action(page, "Export section").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    action(page, "Download section").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.btps\.json$/);
  const path = info.outputPath(`${template}.btps.json`);
  await download.saveAs(path);
  return path;
}

async function selectOption(control: Locator, name: RegExp): Promise<void> {
  const option = control.getByRole("option", { name });
  await expect(option).toHaveCount(1);
  await control.selectOption((await option.getAttribute("value")) ?? "");
}

async function renameSection(page: Page, name: string): Promise<void> {
  await page.locator("#section-name").fill(name);
  await action(page, "Save section details").click();
  await expect(
    page.locator("#active-section").getByRole("option", { name, exact: true }),
  ).toHaveCount(1);
}

async function moveSection(
  page: Page,
  name: string,
  axis: "x" | "y" | "angle",
  value: number,
): Promise<void> {
  await page.locator("#active-section").selectOption({ label: name });
  await page.locator(`#section-${axis}`).fill(String(value));
  await action(page, "Move section").click();
}

async function previewAlignment(page: Page, fixed: Exit, moving: Exit): Promise<void> {
  await page.getByLabel("Fixed exit (A)").selectOption({ label: fixed.join(" / ") });
  await page.getByLabel("Moving exit (B)").selectOption({ label: moving.join(" / ") });
  await action(page, "Preview alignment").click();
}

async function applyAlignment(page: Page): Promise<void> {
  await action(page, "Apply alignment").click();
}

async function expectClosedLoop(page: Page): Promise<void> {
  await expect(scene(page).locator("[data-table-id]")).toHaveCount(8);
  await expect(lanes(page, "joined")).toHaveCount(16);
  await expect(lanes(page, "misaligned")).toHaveCount(0);
  await expect(scene(page).locator('[data-port-id][data-open="true"]')).toHaveCount(1);
  await expect(scene(page).locator("[data-overhang-for]")).toHaveCount(0);
}

async function exportFile(
  page: Page,
  extension: string,
  name: string,
  info: TestInfo,
): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    action(page, "Export").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
  const path = info.outputPath(`${name}.${extension}`);
  await download.saveAs(path);
  return readFile(path);
}

function pdfText(pdf: Buffer): string {
  const streams = /\/Filter\s*\/FlateDecode[^\n]*\n>>\nstream\n([\s\S]*?)\nendstream/g;
  const text = [...pdf.toString("latin1").matchAll(streams)].flatMap(([, stream]) =>
    stream && stream.length < 100_000
      ? [inflateSync(Buffer.from(stream, "latin1")).toString("latin1")]
      : [],
  );
  return text.join("\n");
}

test("assembles, repairs, inventories, and shares the Whole Show", async ({
  page: planner,
  browser,
  baseURL,
  hasTouch,
}, info) => {
  test.skip(hasTouch, "the phone test exercises authoring with touch controls");
  test.setTimeout(120_000);
  const errors = watchErrors(planner);
  await boot(planner);

  const downloads = new Map<Template, string>();
  await test.step("Save four independent section bundles", async () => {
    const member = await browser.newContext({ baseURL });
    try {
      for (const template of templates) {
        const page = await member.newPage();
        const errors = watchErrors(page);
        await boot(page);
        downloads.set(template, await downloadSection(page, template, info));
        expect(errors).toEqual([]);
        await page.close();
      }
    } finally {
      await member.close();
    }
  });

  await test.step("Arrange eight tables inside the venue", async () => {
    const title = planner.getByRole("textbox", { name: "Layout name" });
    await title.fill("Whole Show");
    await title.press("Tab");

    await planner.getByText("Venue", { exact: true }).click();
    await planner.getByLabel("Venue width").fill("576");
    await planner.getByLabel("Venue depth").fill("320");
    await action(planner, "Save venue").click();
    await planner.getByText("Sections & exits", { exact: true }).click();

    for (const [name, template, x, y, angle] of [
      ["Northwest", "corner", 32, 32, 0],
      ["Yard", "yard", 160, 32, 0],
      ["Connector", "connector", 288, 32, 0],
      ["Northeast", "corner", 544, 32, 0],
      ["Southeast", "corner", 544, 288, 180],
      ["Siding", "siding", 416, 288, 180],
      ["Southwest", "corner", 32, 288, 270],
    ] as const) {
      const path = downloads.get(template);
      if (!path) throw new Error(`Missing the exported ${template} section`);
      await importSection(planner, path, [x, y, angle]);
      if (template === "corner") await renameSection(planner, name);
    }
    await moveSection(planner, "Northeast", "angle", 90);
    await expect(lanes(planner, "joined")).toHaveCount(2);
  });

  await test.step("Bind the seven external pairs around the internal Siding seam", async () => {
    const pairs: [Exit, Exit][] = [
      [
        ["Northwest", "East exit"],
        ["Yard", "West exit"],
      ],
      [
        ["Yard", "East exit"],
        ["Connector", "West exit"],
      ],
      [
        ["Connector", "East exit"],
        ["Northeast", "South exit"],
      ],
      [
        ["Northeast", "East exit"],
        ["Southeast", "South exit"],
      ],
      [
        ["Southeast", "East exit"],
        ["Siding", "East-side exit"],
      ],
      [
        ["Siding", "West-side exit"],
        ["Southwest", "South exit"],
      ],
      [
        ["Southwest", "East exit"],
        ["Northwest", "South exit"],
      ],
    ];
    for (const [index, [fixed, moving]] of pairs.entries()) {
      await test.step(`${fixed.join(" / ")} to ${moving.join(" / ")}`, async () => {
        await previewAlignment(planner, fixed, moving);
        await applyAlignment(planner);
        await expect(lanes(planner, "joined")).toHaveCount(4 + index * 2);
      });
    }
    await expectClosedLoop(planner);
  });

  await test.step("Expose four two-stud gaps and the unsupported S8, then repair", async () => {
    await moveSection(planner, "Connector", "x", 290);
    const gaps = lanes(planner, "misaligned");
    await expect(gaps).toHaveCount(4);
    await expect(gaps).toContainText(Array<string>(4).fill("2.00 studs"));
    await expect(scene(planner).locator("[data-overhang-for]")).toHaveCount(1);
    await expect(action(planner, "Overhang: Straight S8")).toBeVisible();
    await previewAlignment(planner, ["Yard", "East exit"], ["Connector", "West exit"]);
    await applyAlignment(planner);
    await expectClosedLoop(planner);
  });

  await test.step("Preview a last-corner repair that would break the Siding join", async () => {
    await moveSection(planner, "Northwest", "y", 30);
    await previewAlignment(planner, ["Northwest", "South exit"], ["Southwest", "East exit"]);
    const preview = planner.getByRole("group", { name: "Alignment preview" });
    await expect(preview).toContainText("Outer lane: joined");
    await expect(preview).toContainText("Inner lane: joined");
    await expect(
      preview
        .getByRole("listitem")
        .filter({ hasText: /Siding.*Southwest/ })
        .first(),
    ).toContainText(/joined to misaligned/);
    await applyAlignment(planner);
    await expect(lanes(planner, "misaligned")).toHaveCount(4);
    await action(planner, "Undo").click();
    await action(planner, "Undo").click();
    await expectClosedLoop(planner);
  });

  await test.step("Check repeated sections and record a combined member commitment", async () => {
    await planner.getByText("Show inventory", { exact: true }).click();
    const inventory = planner.getByRole("region", { name: "Show inventory" });
    await inventory.getByText("Morgan Lee", { exact: true }).click();
    // Four BrickTracks R120s in each of four Corner instances.
    const repeated = planner.getByRole("spinbutton", {
      name: "Committed BrickTracks Curve R120 for Morgan Lee",
    });
    await expect(inventory.locator(".list-row").filter({ has: repeated })).toContainText(
      /Required 16.*Unconfirmed/,
    );

    const owner = "\u00c9lodie Chen";
    await inventory.getByText(owner, { exact: true }).click();
    const commitment = planner.getByRole("spinbutton", {
      name: `Committed LEGO 9V straight S16 for ${owner}`,
    });
    const row = inventory.locator(".list-row").filter({ has: commitment });
    // Eight LEGO S16s in Yard and fourteen between the two Siding tables.
    await expect(row).toContainText(/Required 22.*Unconfirmed/);
    await commitment.fill("21");
    await inventory
      .locator("details")
      .filter({ has: commitment })
      .getByRole("button", { name: "Apply commitments" })
      .click();
    await expect(row).toContainText(/Required 22.*1 short/);
  });

  await test.step("Reopen the editable show and download its setup sheet", async () => {
    const { path, project } = await saveProject(planner);
    expect(project.sections).toHaveLength(7);
    expect(project.seams).toHaveLength(8);
    expect(project.venue).toMatchObject({ width: 576, depth: 320 });
    expect(project.members.find(({ name }) => name === "\u00c9lodie Chen")?.bring).toMatchObject({
      "lego:9v-s16": 21,
    });

    const context = await browser.newContext({ baseURL });
    try {
      const reopened = await context.newPage();
      const errors = watchErrors(reopened);
      await boot(reopened, { startAdvanced: false });
      await chooseFile(reopened, action(reopened, "Open existing project"), path);
      await expect(reopened.getByRole("textbox", { name: "Layout name" })).toHaveValue(
        "Whole Show",
      );
      await expectClosedLoop(reopened);
      expect((await saveProject(reopened)).project).toEqual(project);

      await reopened.getByLabel("Export format").selectOption("pdf");
      const print = pdfText(await exportFile(reopened, "pdf", "whole-show", info));
      expect(print).toContain("S8 supplied by Yard");
      expect(print).toContain("Committed 21 | Shortfall 1");
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
  expect(errors).toEqual([]);
});

test("authors and edits a named spanning exit using touch controls", async ({
  planner,
  hasTouch,
}) => {
  test.skip(!hasTouch, "touch authoring regression");
  await planner.getByLabel("Example layouts").selectOption({ label: "Two-section seam" });
  await expect(planner.getByRole("textbox", { name: "Layout name" })).toHaveValue(
    "Two-section seam",
  );
  await planner.getByRole("button", { name: /^Table A Nominal module/ }).tap();
  await planner.getByText("Sections & exits", { exact: true }).tap();
  await planner.getByLabel("New section name").fill("Phone yard");
  await action(planner, "Create section from selection").tap();
  await expect(planner.getByLabel("Section name", { exact: true })).toHaveValue("Phone yard");

  const exit = planner.locator("#section-exit");
  await planner.getByLabel("Exit name").fill("East gate");
  await planner.getByLabel("Table edge").selectOption("east");
  await planner.getByLabel("Outer connector").selectOption(JSON.stringify(["outer-a", "b"]));
  await selectOption(planner.getByLabel("Inner connector"), /Straight S8.*8\.00 studs beyond east/);
  await action(planner, "Save exit").tap();
  await expect(exit.getByRole("option", { name: /East gate/ })).toHaveCount(1);

  await selectOption(exit, /East gate/);
  await planner.getByLabel("Exit name").fill("Departure gate");
  await action(planner, "Save exit").tap();
  await expect(exit.getByRole("option", { name: /Departure gate/ })).toHaveCount(1);
  await action(planner, "Undo").tap();
  await expect(exit.getByRole("option", { name: /East gate/ })).toHaveCount(1);
  await expect(exit.getByRole("option", { name: /Departure gate/ })).toHaveCount(0);

  await moveSectionOnPhone(planner);
  const { project } = await saveProject(planner);
  expect(project.sections.find(({ name }) => name === "Phone yard")?.exits).toMatchObject([
    { name: "East gate", edge: "east", inner: { pieceId: "inner-span", portId: "b" } },
  ]);
});

async function moveSectionOnPhone(page: Page): Promise<void> {
  const x = page.locator("#section-x");
  await expect(x).toHaveValue("0");
  await x.fill("32");
  await action(page, "Move section").tap();
  await expect(x).toHaveValue("32");
  await action(page, "Undo").tap();
  await expect(x).toHaveValue("0");
}

test("exports a mapped rotated straight one plate higher in LDraw", async ({
  planner,
  hasTouch,
}, info) => {
  test.skip(hasTouch, "desktop CAD regression");
  await planner.getByLabel("Example layouts").selectOption({ label: "Two-section seam" });
  await expect(planner.getByRole("textbox", { name: "Layout name" })).toHaveValue(
    "Two-section seam",
  );
  await scene(planner).locator('[data-piece-id="outer-a"][data-kind="track"]').click();
  await planner.getByRole("spinbutton", { name: "Rotation (degrees)" }).fill("90");
  await action(planner, "Apply").click();
  await planner.getByLabel("Export format").selectOption("ldraw");
  const level = await exportFile(planner, "ldr", "rotated-level", info);
  const report = planner.getByRole("dialog", { name: "LDraw export details" });
  await expect(report).toContainText("Straight S8");
  await report.getByRole("button", { name: "Done" }).click();

  await planner.getByLabel("Height (plates)").fill("1");
  await action(planner, "Apply").click();
  const raised = await exportFile(planner, "ldr", "rotated-raised", info);
  const reference = "1 8 2400 -8 -160 0 0 1 0 1 0 -1 0 0 74746.dat";
  expect(level.toString("utf8")).toContain(reference);
  expect(raised.toString("utf8")).toBe(
    level.toString("utf8").replace(reference, reference.replace("-8", "-16")),
  );
});
