import { stat, writeFile } from "node:fs/promises";

import { expect } from "@playwright/test";

import { newProject } from "../../src/project";
import type { Project } from "../../src/project";
import { chooseFile, test } from "./helper_planner";
import { evaluateWasm } from "./helper_wasm";

// Run with PW_BENCHMARK=1 ./run_playwright_tests.sh benchmark.spec.ts --workers=1.
// Selector contract: src/index.html:100,133 exposes the tabletop and parts tally.
// src/editor_panels.ts:73,87 exposes the pose controls; src/scene.ts:279,766 identifies the track and scene.
test.skip(process.env["PW_BENCHMARK"] !== "1", "opt-in diagnostic");

function layout(count: number): Project {
  const project = newProject();
  project.name = `Timing layout with ${count} straights`;
  project.tables.push({
    id: "bench-table",
    layerId: "layout",
    name: "Bench",
    x: 0,
    y: 0,
    angle: 0,
    width: 400,
    depth: Math.ceil(count / 25) * 12 + 16,
    fronts: ["north"],
  });
  project.items = Array.from({ length: count }, (_, index) => ({
    id: `bench-${index}`,
    kind: "track",
    partId: "lego:9v-s16",
    layerId: "layout",
    tableId: "bench-table",
    x: 8 + (index % 25) * 16,
    y: 8 + Math.floor(index / 25) * 12,
    angle: 0,
    heightPlates: 0,
  }));
  return project;
}

function p95(samples: number[]): number {
  const ordered = samples.slice().sort((a, b) => a - b);
  const percentile = ordered[Math.ceil(ordered.length * 0.95) - 1];
  if (percentile === undefined) throw new Error("No timing samples");
  return percentile;
}

test("reports staged geometry and update-to-draw timing", async ({ planner, isMobile }, info) => {
  test.setTimeout(60_000);
  const count = isMobile ? 300 : 1000;
  const json = JSON.stringify(layout(count));
  const path = info.outputPath("timing.btp.json");
  await writeFile(path, json);
  await chooseFile(planner, planner.getByRole("button", { name: "Open", exact: true }), path);
  await expect(planner.locator("#parts-count")).toHaveText(String(count));

  const geometry = await evaluateWasm(planner, Array<string>(25).fill(json), false);
  const anchorSelector = '[data-piece-id="bench-12"][data-kind="track"]';
  const anchor = planner.locator(anchorSelector);
  if (isMobile) await anchor.tap();
  else await anchor.click();
  await expect(planner.getByRole("spinbutton", { name: "Y (studs)" })).toHaveValue("8");
  await expect(planner.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
  const update = await planner.evaluate(async (selector) => {
    const host = document.querySelector<HTMLElement>("#tabletop");
    if (!host) throw new Error("The tabletop is missing");
    let previous = host.querySelector(selector)?.getAttribute("transform");

    const elapsed: number[] = [];
    for (let index = 0; index < 25; index++) {
      await new Promise(requestAnimationFrame);
      const field = document.querySelector<HTMLInputElement>("#pose-y");
      const button = document.querySelector<HTMLButtonElement>("#apply-pose");
      if (!field || !button) throw new Error("The pose inspector closed");
      field.value = index % 2 === 0 ? "11" : "8";
      const start = performance.now();
      button.click();
      const scene = host.querySelector("[data-track-scene]");
      scene?.getBoundingClientRect();
      elapsed.push(performance.now() - start);
      const current = scene?.querySelector(selector)?.getAttribute("transform");
      if (!current || current === previous) throw new Error("The selected track did not move");
      previous = current;
    }
    return elapsed;
  }, anchorSelector);

  const geometryP95 = p95(geometry.slice(5).map(({ ms }) => ms)).toFixed(2);
  const updateP95 = p95(update.slice(5)).toFixed(2);
  const assets = ["main.js", "style.css", "wasm/track_geometry_bg.wasm"];
  const bytes = await Promise.all(assets.map(async (asset) => (await stat(`dist/${asset}`)).size));
  console.log(`${count} pieces, 20 samples after 5 warmups`);
  console.log(`Geometry p95 ${geometryP95} ms (target 8 ms)`);
  console.log(`Update through SVG layout p95 ${updateP95} ms (target 16.7 ms)`);
  console.log(assets.map((asset, index) => `${asset}: ${bytes[index]} bytes`).join(", "));
});
