import { readFile, writeFile } from "node:fs/promises";

import { expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

import { boot, chooseFile, openEditorMenu, saveProject, test, watchErrors } from "./helper_planner";

function blueBrickFixture(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
    <Map><Version>9</Version><Event>Measured import</Event><Layers>
      <Layer type="brick" id="1"><Name>Track</Name><Visible>true</Visible><Bricks>
        <Brick id="1"><DisplayArea><X>0</X><Y>8</Y><Width>17</Width><Height>8</Height></DisplayArea><PartNumber>tb 2865.8</PartNumber><Orientation>0</Orientation><Altitude>-16</Altitude></Brick>
        <Brick id="2"><DisplayArea><X>16</X><Y>8</Y><Width>17</Width><Height>8</Height></DisplayArea><PartNumber>tb 2865.8</PartNumber><Orientation>0</Orientation></Brick>
        <Brick id="3"><DisplayArea><X>64</X><Y>0</Y><Width>12</Width><Height>20</Height></DisplayArea><PartNumber>UNSUPPORTED-TRACK.8</PartNumber><Orientation>30</Orientation></Brick>
      </Bricks><Groups /></Layer>
    </Layers></Map>`;
}

async function importFixture(page: Page, text: string): Promise<void> {
  await openEditorMenu(page, "File");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import BlueBrick" }).click(),
  ]);
  await chooser.setFiles({
    name: "measured.bbm",
    mimeType: "application/xml",
    buffer: Buffer.from(text),
  });
  const preview = page.getByRole("dialog", { name: "Review BlueBrick import" });
  await expect(preview).toContainText("UNSUPPORTED-TRACK.8");
  await expect(preview).toContainText(/altitude was ignored/i);
  await preview.getByRole("button", { name: "Open imported layout" }).click();
}

async function exportLayout(planner: Page, format: string, info: TestInfo): Promise<Buffer> {
  await openEditorMenu(planner, "File");
  await planner.getByLabel("Export format").selectOption(format);
  const [download] = await Promise.all([
    planner.waitForEvent("download"),
    planner.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const filename = download.suggestedFilename();
  expect(filename).toMatch(new RegExp(`\\.${format}$`));
  const path = info.outputPath(filename);
  await download.saveAs(path);
  return readFile(path);
}

test("imports measured external track, flattens altitude, and reopens it", async ({
  planner,
  browser,
  baseURL,
}, info) => {
  const invalidPath = info.outputPath("invalid.bbm");
  await writeFile(invalidPath, "<wrong><Version>9</Version></wrong>");
  await openEditorMenu(planner, "File");
  await chooseFile(planner, planner.getByRole("button", { name: "Import BlueBrick" }), invalidPath);
  await expect(planner.getByRole("status")).toContainText("Expected a plain BlueBrick Map");

  await importFixture(planner, blueBrickFixture());
  const saved = await saveProject(planner);
  expect(saved.project).toMatchObject({ name: "Measured import" });
  expect(saved.project.area.width).toBeGreaterThan(80);
  expect(saved.project.area.depth).toBeGreaterThan(40);
  expect(saved.project.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "unresolved",
        sourceId: "UNSUPPORTED-TRACK.8",
        reason: "Unknown BlueBrick part",
        angle: 30,
      }),
    ]),
  );

  const fresh = await browser.newContext({ baseURL });
  try {
    const reopened = await fresh.newPage();
    const errors = watchErrors(reopened);
    await boot(reopened, { startProject: false });
    await chooseFile(
      reopened,
      reopened.getByRole("button", { name: "Open track plan", exact: true }),
      saved.path,
    );
    await expect(reopened.locator('[data-kind="unresolved"]')).toHaveCount(1);
    expect((await saveProject(reopened)).project).toEqual(saved.project);
    expect(errors).toEqual([]);
  } finally {
    await fresh.close();
  }
});

test("rejects an ordinary LDraw file without replacing the track plan", async ({ planner }) => {
  const before = await saveProject(planner);
  await openEditorMenu(planner, "File");
  const [chooser] = await Promise.all([
    planner.waitForEvent("filechooser"),
    planner.getByRole("button", { name: "Open track plan", exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: "external.ldr",
    mimeType: "text/plain",
    buffer: Buffer.from("0 External LDraw model\r\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\r\n"),
  });
  await expect(planner.getByRole("status")).toContainText("Brick Track");
  await expect(planner.getByRole("status")).toBeInViewport();
  expect((await saveProject(planner)).project).toEqual(before.project);
});

test("exports a real PNG layout file", async ({ planner }, info) => {
  const png = await exportLayout(planner, "png", info);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});

test("exports a PDF layout file", async ({ planner }, info) => {
  const pdf = await exportLayout(planner, "pdf", info);
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
});
