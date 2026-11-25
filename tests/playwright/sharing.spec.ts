import { readFile, writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

import { expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

import { worldPose } from "../../src/project";
import { boot, chooseFile, example, saveProject, test, watchErrors } from "./helper_planner";

// File and export controls are in src/index.html:16-28. The import preview is :112-120.
test("reopens a partial BlueBrick import in a fresh context", async ({
  planner,
  browser,
  baseURL,
  viewport,
  hasTouch,
  isMobile,
}, info) => {
  const name = planner.getByRole("textbox", { name: "Layout name" });
  const examples = planner.getByLabel("Example layouts");
  await examples.selectOption({ label: "Double corner" });
  await expect(name).toHaveValue("Double corner");

  const importButton = planner.getByRole("button", { name: "Import BlueBrick" });
  const invalidPath = info.outputPath("invalid.bbm");
  await writeFile(invalidPath, "<wrong><Version>9</Version></wrong>");
  await chooseFile(planner, importButton, invalidPath);
  await expect(planner.getByRole("status")).toContainText("Expected a plain BlueBrick Map");
  await expect(name).toHaveValue("Double corner");

  const preview = planner.getByRole("dialog", { name: "Review BlueBrick import" });
  const bluebrick = example("bluebrick-example.bbm");
  await chooseFile(planner, importButton, bluebrick);
  await preview.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(name).toHaveValue("Double corner");
  await expect(planner.locator("#parts-count")).toHaveText("16");

  await chooseFile(planner, importButton, bluebrick);
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("UNSUPPORTED-DEMO");
  await preview.getByRole("button", { name: "Open imported layout" }).click();
  await expect(planner.getByRole("textbox", { name: "Layout name" })).toHaveValue(
    "BlueBrick Import Example",
  );

  const { path, project: saved } = await saveProject(planner);
  expect(saved.tables).toHaveLength(1);
  expect(saved.tables[0]).toMatchObject({ width: 96, depth: 64, angle: 90 });
  expect(saved.layers.map(({ name, visible }) => [name, visible])).toEqual([
    ["Tables", true],
    ["Track and baseplates", true],
    ["Hidden track", false],
  ]);
  expect(saved.items).toHaveLength(7);
  expect(saved.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "unresolved",
        sourceId: "UNSUPPORTED-DEMO.8",
        x: 68,
        y: 23,
        angle: 30,
      }),
      expect.objectContaining({ kind: "unresolved", sourceId: "2865.8", altitude: -12 }),
      expect.objectContaining({ kind: "track", partId: "lego:9v-s16", heightPlates: 0 }),
      expect.objectContaining({ kind: "track", partId: "lego:9v-s16", heightPlates: 1 }),
    ]),
  );
  const turnout = saved.items.find(
    (item) => item.kind === "track" && item.partId === "bricktracks:r104-right-body",
  );
  if (!turnout) throw new Error("The rotated turnout did not import");
  const pose = worldPose(turnout, saved.tables);
  expect(pose.angle).toBe(90);
  expect(pose.x).toBeCloseTo(46, 6);
  expect(pose.y).toBeCloseTo(33, 6);
  const hiddenLayer = saved.layers.find((layer) => layer.name === "Hidden track");
  expect(hiddenLayer).toMatchObject({ visible: false });
  expect(saved.items).toContainEqual(expect.objectContaining({ layerId: hiddenLayer?.id }));

  const fresh = await browser.newContext({ baseURL, viewport, hasTouch, isMobile });
  try {
    const reopened = await fresh.newPage();
    const errors = watchErrors(reopened);
    await boot(reopened);
    const open = reopened.getByRole("button", { name: "Open", exact: true });
    await chooseFile(reopened, open, path);
    await expect(reopened.getByRole("textbox", { name: "Layout name" })).toHaveValue(saved.name);
    await expect(reopened.locator('[data-kind="unresolved"]')).toHaveCount(2);
    expect((await saveProject(reopened)).project).toEqual(saved);
    expect(errors).toEqual([]);
  } finally {
    await fresh.close();
  }
});

async function exportLayout(planner: Page, format: string, info: TestInfo): Promise<Buffer> {
  await planner.getByLabel("Export format").selectOption(format);
  const [download] = await Promise.all([
    planner.waitForEvent("download"),
    planner.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const filename = download.suggestedFilename();
  expect(filename).toMatch(new RegExp(`\\.${format === "ldraw" ? "ldr" : format}$`));
  const path = info.outputPath(filename);
  await download.saveAs(path);
  return readFile(path);
}

async function imageDimensions(page: Page, mime: string, data: Buffer): Promise<number[]> {
  return page.evaluate(
    async ({ mime, base64 }) => {
      const image = new Image();
      image.src = `data:${mime};base64,${base64}`;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    },
    { mime, base64: data.toString("base64") },
  );
}

async function tabletopPixels(page: Page, png: Buffer, box: number[]): Promise<number[]> {
  return page.evaluate(
    async ({ base64, box }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot read export pixels");
      context.drawImage(image, 0, 0);
      const [left, top, width, height] = box;
      const blue = (x: number, y: number): number => context.getImageData(x, y, 1, 1).data[2] ?? 0;
      const at = (x: number, y: number): number =>
        blue(
          Math.round(((x - Number(left)) / Number(width)) * canvas.width),
          Math.round(((y - Number(top)) / Number(height)) * canvas.height),
        );
      return [blue(2, 2), at(31, 43), at(210, 99)];
    },
    { base64: png.toString("base64"), box },
  );
}

function printText(pdf: string): string {
  const content = /\/Filter\s*\/FlateDecode[^\n]*\n>>\nstream\n([\s\S]*?)\nendstream/g;
  return Array.from(pdf.matchAll(content), ([, stream]) => {
    if (!stream || stream.length > 100_000) return "";
    return inflateSync(Buffer.from(stream, "latin1")).toString("latin1");
  }).join("\n");
}

test("downloads the full layout while the editor is zoomed in", async ({
  planner,
  browserName,
}, info) => {
  const examples = planner.getByLabel("Example layouts");
  await examples.selectOption({ label: "Two-section seam" });
  await expect(planner.getByRole("textbox", { name: "Layout name" })).toHaveValue(
    "Two-section seam",
  );
  const scene = planner.locator("[data-track-scene]");
  const bounds = await scene.getAttribute("data-layout-view-box");
  const box = (bounds ?? "").trim().split(/\s+/).map(Number);
  const [, , width, height] = box;
  expect(width).toBeGreaterThanOrEqual(256);
  expect(height).toBeGreaterThanOrEqual(128);
  const aspect = Number(width) / Number(height);
  for (let index = 0; index < 4; index++) {
    await planner.getByRole("button", { name: "Zoom in" }).click();
  }
  await expect(scene).not.toHaveAttribute("viewBox", bounds ?? "");

  const png = await exportLayout(planner, "png", info);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const pngSize = await imageDimensions(planner, "image/png", png);
  expect(pngSize[0]).toBeGreaterThanOrEqual(1000);
  const [paper, tableA, tableB] = await tabletopPixels(planner, png, box);
  expect(Number(paper) - Number(tableA)).toBeGreaterThan(8);
  expect(Number(paper) - Number(tableB)).toBeGreaterThan(8);
  if (browserName === "webkit") {
    // Canvas specifies PNG when the browser cannot encode the requested format.
    await planner.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toBlob");
      const encode = descriptor?.value as HTMLCanvasElement["toBlob"];
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality): void {
        encode.call(this, callback, type === "image/webp" ? "image/png" : type, quality);
      };
    });
  }
  const webp = await exportLayout(planner, "webp", info);
  expect(webp.toString("ascii", 0, 4)).toBe("RIFF");
  expect(webp.toString("ascii", 8, 12)).toBe("WEBP");
  const webpSize = await imageDimensions(planner, "image/webp", webp);
  expect(webpSize).toEqual(pngSize);
  expect(Number(pngSize[0]) / Number(pngSize[1])).toBeCloseTo(aspect, 2);

  const pdf = (await exportLayout(planner, "pdf", info)).toString("latin1");
  expect(pdf).toMatch(/^%PDF-1\./);
  expect(pdf).toMatch(/\/MediaBox\s*\[0 0 792(?:\.\d*)? 612(?:\.\d*)?\]/);
  const raster = /\/Subtype\s*\/Image\s+\/Width\s+(\d+)\s+\/Height\s+(\d+)/.exec(pdf);
  expect(raster, "the print diagram must embed an image of the full layout").toBeTruthy();
  expect(Number(raster?.[1]) / Number(raster?.[2])).toBeCloseTo(aspect, 2);
  const print = printText(pdf);
  expect(print).toContain("Two-section seam");
  expect(print).toContain("Visible track inventory");
  expect(print).toContain("7 x LEGO 9V straight S16");
  expect(print).toContain("Table A");
  expect(print).toContain("Table B");

  const ldraw = (await exportLayout(planner, "ldraw", info)).toString("utf8");
  const placements = ldraw.split(/\r?\n/).filter((line) => line.startsWith("1 "));
  expect(placements).toHaveLength(7);
  expect(placements.every((line) => line.endsWith("74746.dat"))).toBe(true);
  await expect(planner.getByRole("dialog", { name: "LDraw export details" })).toContainText("S8");
});
