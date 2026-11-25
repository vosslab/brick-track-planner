import { execFileSync } from "node:child_process";

import { expect } from "@playwright/test";

import catalog from "../../data/catalog.json" with { type: "json" };
import { saveTrackPlan } from "../../src/ldraw";
import { newProject } from "../../src/project";
import type { Catalog } from "../../src/project";
import { boot, test } from "./helper_planner";

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

test("shows source-model detail in the track canvas", async ({ page }, info) => {
  const pieces = [
    ["lego:rc-s16", 14, 10],
    ["lego:rc-s16", 30, 10],
    ["lego:rc-r40", 55, 10],
    ["trixbrix:r40-right-switch", 85, 20],
    ["bricktracks:r104", 23, 32],
    ["bricktracks:r120", 55, 32],
    ["lego:rc-r40-right-switch", 23, 53],
    ["lego:rc-r40-left-switch", 66, 54],
  ] as const;
  const project = newProject();
  project.name = "Track artwork";
  project.area.width = 106;
  project.area.depth = 66;
  project.items = pieces.map(([partId, x, y], index) => ({
    kind: "track",
    id: String(index),
    layerId: "layout",
    heightPlates: 2,
    partId,
    x,
    y,
    angle: 0,
  }));

  await boot(page, { startProject: false });
  await page.locator("#project-file").setInputFiles({
    name: "track_artwork.ldr",
    mimeType: "text/plain",
    buffer: Buffer.from(saveTrackPlan(project, catalog as Catalog)),
  });
  const scene = page.locator("#tabletop [data-track-scene]");
  await expect(scene).toHaveAttribute("data-scene-detail", "close");
  const visibleModels = (): Promise<(string | null)[]> =>
    scene
      .locator("[data-track-model]")
      .evaluateAll((models) =>
        models
          .filter((model) => getComputedStyle(model).display !== "none")
          .map((model) => model.getAttribute("data-track-model")),
      );
  expect(await visibleModels()).toEqual([
    "lego:rc-s16",
    "lego:rc-r40",
    "bricktracks:r104",
    "bricktracks:r120",
    "lego:rc-r40-right-switch",
    "lego:rc-r40-left-switch",
  ]);
  const png = await scene.screenshot({ scale: "device" });
  execFileSync(
    "cwebp",
    ["-quiet", "-q", "90", "-o", info.outputPath("track_artwork.webp"), "--", "-"],
    {
      input: png,
    },
  );
  const zoomOut = page.getByRole("button", { name: "Zoom out", exact: true });
  for (let step = 0; step < 10; step += 1) await zoomOut.click();
  await expect(scene).toHaveAttribute("data-scene-detail", "thumbnail");
  expect(await visibleModels()).toEqual([]);
});
