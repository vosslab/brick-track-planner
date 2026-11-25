import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

import { expect } from "@playwright/test";

import type { Analysis } from "../../src/engine";
import type { Page } from "@playwright/test";

import type { Project } from "../../src/project";
import { example, test } from "./helper_planner";

test.skip(({ isMobile }) => isMobile, "the identical Wasm binary is checked once");

async function evaluateWasm(page: Page, projects: string[]): Promise<Analysis[]> {
  const bindings = await readFile("generated/wasm/track_geometry.js", "utf8");
  return page.evaluate(
    async ({ bindings, projects }) => {
      const url = URL.createObjectURL(new Blob([bindings], { type: "text/javascript" }));
      const engine: {
        default: (input: { module_or_path: URL }) => Promise<unknown>;
        evaluate_json: (project: string, draft: string) => string;
      } = await import(url);
      URL.revokeObjectURL(url);
      const wasm = new URL("./wasm/track_geometry_bg.wasm", location.href);
      await engine.default({ module_or_path: wasm });
      return projects.map((project) => JSON.parse(engine.evaluate_json(project, "")) as Analysis);
    },
    { bindings, projects },
  );
}

function compareAnalysis(actual: Analysis, expected: Analysis): void {
  expect(actual.project).toEqual(expected.project);
  expect(actual.counts).toEqual(expected.counts);
  expect(actual.unresolved).toEqual(expected.unresolved);
  expect(actual.noTable).toBe(expected.noTable);
  expect(JSON.stringify(actual.seams)).toEqual(JSON.stringify(expected.seams));

  expect(actual.ports).toHaveLength(expected.ports.length);
  for (const [index, { x, y, angle, ...port }] of expected.ports.entries()) {
    expect(actual.ports[index]).toMatchObject(port);
    expect(Math.abs(Number(actual.ports[index]?.x) - x)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(Number(actual.ports[index]?.y) - y)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(Number(actual.ports[index]?.angle) - angle)).toBeLessThanOrEqual(1e-6);
  }

  expect(actual.overhangs.map(({ pieceId }) => pieceId)).toEqual(
    expected.overhangs.map(({ pieceId }) => pieceId),
  );
  for (const [index, { rings }] of expected.overhangs.entries()) {
    const actualRings = actual.overhangs[index]?.rings ?? [];
    expect(actualRings.map(({ length }) => length)).toEqual(rings.map(({ length }) => length));
    for (const [ringIndex, ring] of rings.entries()) {
      for (const [pointIndex, { x, y }] of ring.entries()) {
        const point = actualRings[ringIndex]?.[pointIndex];
        expect(Math.abs(Number(point?.x) - x)).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(Number(point?.y) - y)).toBeLessThanOrEqual(1e-6);
      }
    }
  }
}

test("matches the native engine with the staged browser Wasm", async ({ planner }, info) => {
  const fixtures = [example("two-section.btp.json"), example("double-corner.btp.json")];
  const twoSection = JSON.parse(await readFile(fixtures[0] ?? "", "utf8")) as Project;
  const receiving = twoSection.tables.find(({ id }) => id === "table-b");
  if (!receiving) throw new Error("The seam example needs Table B");
  receiving.x += 2;
  const shifted = info.outputPath("shifted.btp.json");
  await writeFile(shifted, JSON.stringify(twoSection));
  fixtures.push(shifted);

  const projects = await Promise.all(fixtures.map((path) => readFile(path, "utf8")));
  const wasm = await evaluateWasm(planner, projects);
  for (const [index, fixture] of fixtures.entries()) {
    await test.step(fixture, () => {
      const json = execFileSync(
        "cargo",
        ["run", "--quiet", "--locked", "--example", "oracle", "--", fixture],
        { encoding: "utf8" },
      );
      const actual = wasm[index];
      if (!actual) throw new Error("The staged Wasm engine returned no analysis");
      compareAnalysis(actual, JSON.parse(json) as Analysis);
    });
  }
});
