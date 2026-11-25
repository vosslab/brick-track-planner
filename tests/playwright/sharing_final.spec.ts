import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

import { expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

import { test } from "./helper_planner";

// Export controls are in src/index.html:21-36. The example picker is #examples.
// The scene's data-layout-view-box is the full layout, independently of its live viewBox.
async function example(planner: Page, name: string): Promise<void> {
  await planner.getByLabel("Example layouts").selectOption({ label: name });
  await expect(planner.getByRole("textbox", { name: "Layout name" })).toHaveValue(name);
}

async function download(
  planner: Page,
  info: TestInfo,
  format: string,
  mode: string,
): Promise<Buffer> {
  await planner.getByLabel("Export format").selectOption(format);
  await planner.getByLabel(format === "pdf" ? "PDF mode" : "Raster resolution").selectOption(mode);
  const [file] = await Promise.all([
    planner.waitForEvent("download"),
    planner.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
  const path = info.outputPath(`${mode}-${file.suggestedFilename()}`);
  await file.saveAs(path);
  return readFile(path);
}

async function inspectImage(
  planner: Page,
  format: string,
  image: Buffer,
  box: number[],
): Promise<{ size: number[]; tablePixels: number[] }> {
  return planner.evaluate(
    async ({ format, base64, box }) => {
      const source = new Image();
      source.src = `data:image/${format};base64,${base64}`;
      await source.decode();
      const size = [source.naturalWidth, source.naturalHeight];
      const [left, top, width, height] = box;
      if (left === undefined || top === undefined || !width || !height) {
        return { size, tablePixels: [] };
      }
      const sample = document.createElement("canvas").getContext("2d");
      if (!sample) throw new Error("Could not read exported pixels");
      const positions = [
        [2, 2],
        [31, 43],
        [210, 99],
      ];
      const tablePixels = positions.map(([x = 0, y = 0]) => {
        const edge = x === 2;
        const sampleX = edge ? 2 : Math.floor(((x - left) / width) * source.naturalWidth);
        const sampleY = edge ? 2 : Math.floor(((y - top) / height) * source.naturalHeight);
        sample.drawImage(source, sampleX, sampleY, 1, 1, 0, 0, 1, 1);
        return sample.getImageData(0, 0, 1, 1).data[2] ?? 0;
      });
      return { size, tablePixels };
    },
    { format, base64: image.toString("base64"), box },
  );
}

test("downloads both raster sizes from the full layout and caps area", async ({
  planner,
  browserName,
}, info) => {
  test.setTimeout(60_000);
  await example(planner, "Two-section seam");
  const scene = planner.locator("[data-track-scene]");
  const fullBounds = (await scene.getAttribute("data-layout-view-box")) ?? "";
  const box = fullBounds.split(/\s+/u).map(Number);
  const [, , width = 1, height = 1] = box;
  for (let index = 0; index < 4; index++) {
    await planner.getByRole("button", { name: "Zoom in" }).click();
  }
  await expect(scene).not.toHaveAttribute("viewBox", fullBounds);

  for (const resolution of ["standard", "high"]) {
    for (const format of ["png", "webp"]) {
      if (browserName === "webkit" && resolution === "high" && format === "webp") {
        await planner.evaluate(() => {
          const native = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toBlob")
            ?.value as HTMLCanvasElement["toBlob"];
          HTMLCanvasElement.prototype.toBlob = function (callback, type, quality): void {
            native.call(this, callback, type === "image/webp" ? "image/png" : type, quality);
          };
        });
      }
      const bytes = await download(planner, info, format, resolution);
      if (format === "webp") expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
      const { size, tablePixels } = await inspectImage(planner, format, bytes, box);
      const [imageWidth = 0, imageHeight = 0] = size;
      expect(Math.max(imageWidth, imageHeight)).toBe(resolution === "high" ? 4096 : 2400);
      expect(imageWidth / imageHeight).toBeCloseTo(width / height, 2);
      const [paper = 0, tableA = 255, tableB = 255] = tablePixels;
      expect(paper - tableA, "table A in the exported view").toBeGreaterThan(8);
      expect(paper - tableB, "table B in the exported view").toBeGreaterThan(8);
    }
  }

  await example(planner, "Double corner");
  const bytes = await download(planner, info, "png", "high");
  const { size } = await inspectImage(planner, "png", bytes, []);
  const [cappedWidth = 0, cappedHeight = 0] = size;
  expect(Math.max(cappedWidth, cappedHeight)).toBeLessThan(4096);
  expect(cappedWidth * cappedHeight).toBeGreaterThan(11_950_000);
  expect(cappedWidth * cappedHeight).toBeLessThanOrEqual(12_000_000);
});

type PdfStream = { header: string; bytes: Buffer };

function pdfStreams(pdf: string): PdfStream[] {
  return pdf.split(/\n(?=\d+ 0 obj\n)/u).flatMap((object) => {
    const offset = object.indexOf("\nstream\n");
    if (offset < 0) return [];
    const header = object.slice(0, offset);
    const length = /\/Length (\d+)/u.exec(header)?.[1];
    if (!length) return [];
    const start = offset + "\nstream\n".length;
    return [{ header, bytes: Buffer.from(object.slice(start, start + Number(length)), "latin1") }];
  });
}

function printPages(streams: PdfStream[]): string[] {
  return streams
    .filter(({ header }) => header.includes("/FlateDecode") && !header.includes("/Subtype /Image"))
    .map(({ bytes }) => inflateSync(bytes).toString("latin1"));
}

function overviewColor(streams: PdfStream[]): number[] {
  const overview = streams.find(
    ({ header }) => header.includes("/Subtype /Image") && header.includes("/Width 2400"),
  );
  if (!overview) throw new Error("Missing full-width overview diagram");
  const pixels = inflateSync(overview.bytes);
  // The first RGB sample in a PNG-filtered row has no left neighbor.
  return Array.from(pixels.subarray(1, 4));
}

test("downloads color and grayscale setup packets with searchable placements and bring lists", async ({
  planner,
}, info) => {
  test.setTimeout(60_000);
  await example(planner, "Whole Show");
  const grayscale = (await download(planner, info, "pdf", "grayscale")).toString("latin1");
  expect(grayscale).toMatch(/^%PDF-1\./u);
  expect(grayscale).toMatch(/\/MediaBox\s*\[0 0 792(?:\.\d*)? 612(?:\.\d*)?\]/u);
  const grayStreams = pdfStreams(grayscale);
  const print = printPages(grayStreams);
  expect(print[0]).toContain("Show overview");
  expect(print[0]).toContain("Venue: 576 x 320 studs");
  expect(print.filter((page) => page.includes("Section detail"))).toHaveLength(7);
  const northeast = print.find((page) => page.includes("(Northeast Corner)"));
  expect(northeast).toContain("128 x 128 studs");
  expect(northeast).toContain("544, 32");
  expect(northeast).toContain("Angle: 90 deg");
  expect(northeast).toContain("north, west");
  expect(northeast).toContain("R104, R120");
  expect(northeast).not.toContain("Southwest");
  expect(northeast).not.toContain("S8 supplied by Connector");
  const yard = print.find((page) => page.includes("(Yard)") && page.includes("Section detail"));
  expect(yard).toContain("S8 supplied by Yard");
  expect(yard).toContain("Outer: joined");
  expect(yard).toContain("Inner: joined");
  const bring = print.filter((page) => page.includes("Member bring list"));
  expect(bring).toHaveLength(3);
  const elodie = bring.find((page) => page.includes("\u00c9lodie Chen"));
  expect(elodie).toContain("22 x LEGO 9V straight S16");
  expect(elodie).toContain("Committed 21 | Shortfall 1");
  expect(elodie).toContain("published PennLUG ballast recipe unavailable");
  const morgan = bring.find((page) => page.includes("Morgan Lee"));
  expect(morgan).toContain("Verified ballast materials");
  expect(morgan).toMatch(/Verified ballast materials\) Tj[\s\S]*?\(\d+ x .+\| Unconfirmed\) Tj/u);
  const tokyo = bring.find((page) => page.includes("Tokyo"));
  expect(tokyo).toMatch(/\/ActualText <FEFF(?:[\da-f]{4})*67714eac> >> BDC/u);
  expect(tokyo).toMatch(/\/I\d+ Do/u);
  expect(new Set(overviewColor(grayStreams)).size).toBe(1);

  const color = (await download(planner, info, "pdf", "color")).toString("latin1");
  expect(new Set(overviewColor(pdfStreams(color))).size).toBeGreaterThan(1);
});
