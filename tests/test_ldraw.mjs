import assert from "node:assert/strict";
import test from "node:test";

import { exportLDraw } from "../src/ldraw.ts";
import { newProject } from "../src/project.ts";

function track(partId, x = 0, y = 0, extra = {}) {
  return {
    id: `${partId}/${x}/${y}`,
    kind: "track",
    layerId: "layout",
    partId,
    x,
    y,
    angle: 0,
    heightPlates: 0,
    ...extra,
  };
}

function partLines(text) {
  return text.split("\r\n").filter((line) => line.startsWith("1 "));
}

const emptyCatalog = { parts: [], kits: [] };

test("plastic LEGO straight exports in its design-area coordinates", () => {
  const project = newProject();
  project.items = [
    track("lego:rc-s16", 10, 20),
    track("lego:rc-s16", 10, 20, { id: "raised", heightPlates: 2 }),
  ];
  const lines = partLines(exportLDraw(project, emptyCatalog).text);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^1 8 200 -8 -400 1 0 0 0 1 0 0 0 1 74746\.dat$/);
  assert.match(lines[1], /^1 8 200 -24 -400 1 0 0 0 1 0 0 0 1 74746\.dat$/);
});

test("curves retain their custom LDraw requirement", () => {
  const project = newProject();
  project.items = [track("bricktracks:r104"), track("bricktracks:r120")];
  const result = exportLDraw(project, emptyCatalog);
  assert.equal(partLines(result.text).length, 2);
  assert.deepEqual(result.custom, [
    {
      filename: "BrickTracksR104.dat",
      url: "https://l-gauge.org/downloads/BricktracksCurvesRev1.0.zip",
    },
    {
      filename: "BrickTracksR120.dat",
      url: "https://l-gauge.org/downloads/BricktracksCurvesRev1.0.zip",
    },
  ]);
});

test("unsupported track and imported non-track content are reported", () => {
  const project = newProject();
  project.items = [
    track("trixbrix:r56"),
    track("trixbrix:r56", 16),
    {
      id: "unknown",
      kind: "unresolved",
      layerId: "layout",
      x: 0,
      y: 0,
      angle: 0,
      name: "Imported item",
      sourceId: "custom",
      width: 8,
      depth: 8,
      reason: "Unknown BlueBrick part",
    },
  ];
  const catalog = {
    ...emptyCatalog,
    parts: [{ id: "trixbrix:r56", brand: "TrixBrix", name: "R56" }],
  };
  assert.deepEqual(exportLDraw(project, catalog).omitted, [
    { name: "TrixBrix R56", count: 2 },
    { name: "Imported item", count: 1 },
  ]);
});
