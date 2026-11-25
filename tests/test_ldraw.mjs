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
  return text
    .split("\r\n")
    .filter((line) => line.startsWith("1 "))
    .map((line) => {
      const [, , ...fields] = line.split(" ");
      return { filename: fields.pop(), transform: fields.map(Number) };
    });
}

function point(part, x, y, z) {
  const [tx, ty, tz, a, b, c, d, e, f, g, h, i] = part.transform;
  return [tx + a * x + b * y + c * z, ty + d * x + e * y + f * z, tz + g * x + h * y + i * z];
}

function assertNear(actual, expected) {
  for (const [axis, value] of expected.entries()) {
    assert.ok(Math.abs(actual[axis] - value) < 0.002, `${actual} differs from ${expected}`);
  }
}

const emptyCatalog = { parts: [], kits: [] };

test("9V turnout connections agree with official part geometry and retain their handedness", () => {
  const project = newProject();
  project.items = [
    track("lego:9v-r40-right"),
    track("lego:9v-r40-left"),
    track("lego:9v-s16", -24.9375, -6.375),
    track("lego:9v-s16", 23.0625, 6.375),
  ];
  const [right, left, start, end] = partLines(exportLDraw(project, emptyCatalog).text);
  assert.deepEqual(
    [right.filename, left.filename, start.filename, end.filename],
    ["75541c01-f1.dat", "75542c01-f1.dat", "74746.dat", "74746.dat"],
  );
  // Official 2859.dat/2861.dat straight coupling centers are x=+/-320 LDU.
  // The diverging end is at (333.853255, -/+259.103626) in model X/Z.
  assert.deepEqual(point(right, -320, 8, 0), point(start, 160, 8, 0));
  assert.deepEqual(point(left, 320, 8, 0), point(end, -160, 8, 0));
  assertNear(point(right, 333.853255, 8, -259.103626), [315.104, 0, -131.6036]);
  assertNear(point(left, 333.853255, 8, 259.103626), [315.104, 0, 131.6036]);
});

test("table-relative track rotates upright and each extra plate raises it by 8 LDU", () => {
  const project = newProject();
  project.layers.push({ id: "tables", name: "Tables", visible: false });
  project.tables = [
    {
      id: "table",
      layerId: "tables",
      name: "Table",
      x: 10,
      y: 20,
      angle: 90,
      width: 96,
      depth: 96,
      fronts: [],
    },
  ];
  project.items = [
    track("lego:9v-r40-right", 3, 4, { tableId: "table" }),
    track("lego:9v-r40-right", 3, 4, { id: "raised", tableId: "table", heightPlates: 1 }),
  ];
  const [base, raised] = partLines(exportLDraw(project, emptyCatalog).text);
  assert.deepEqual(base.transform, [247.5, -8, -441.25, 0, 0, 1, 0, 1, 0, -1, 0, 0]);
  assert.equal(raised.transform[1] - base.transform[1], -8);
  assert.deepEqual(point(raised, -320, 8, 0), [247.5, -8, -121.25]);
});

test("curve model coupling centers match planner ports and custom requirements are deduplicated", () => {
  const project = newProject();
  project.items = [
    track("lego:9v-r40"),
    track("bricktracks:r104"),
    track("bricktracks:r120"),
    track("bricktracks:r104", 10),
  ];
  const result = exportLDraw(project, emptyCatalog);
  const [lego, r104, r120] = partLines(result.text);
  assert.equal(lego.filename, "74747.dat");
  // 2867a.dat and the BrickTracks archive locate these end sleeper couplings.
  assertNear(point(lego, -156.072258, 8, -15.371776), [-163.75, 0, 27.5]);
  assertNear(point(lego, 156.072258, 8, -15.371776), [142.396, 0, -33.396]);
  assertNear(point(r104, 0.0334, 0, 405.7879), [-210, 0, 18.75]);
  assertNear(point(r104, 40, 0, 0), [195.78787, 0, -21.216617]);
  assertNear(point(r120, -1.1153, 0, 468.2168), [-245, 0, 22.5]);
  assertNear(point(r120, 45, 0, 0), [223.216773, 0, -23.615327]);
  const url = "https://l-gauge.org/downloads/BricktracksCurvesRev1.0.zip";
  assert.deepEqual(result.custom, [
    { filename: "BrickTracksR104.dat", url },
    { filename: "BrickTracksR120.dat", url },
  ]);
});

test("visible unsupported track and unresolved pieces are reported and scenery stays out", () => {
  const project = newProject();
  project.layers.push({ id: "hidden", name: "Hidden", visible: false });
  project.items = [
    track("lego:9v-s16", 0, 0, { layerId: "hidden" }),
    track("bricktracks:r120", 0, 0, { layerId: "hidden" }),
    track("trixbrix:r56"),
    track("trixbrix:r56", 16),
    track("other:unknown"),
    { id: "ground", kind: "baseplate", layerId: "layout", x: 0, y: 0, angle: 0 },
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
      reason: "Unknown part",
    },
  ];
  const catalog = {
    ...emptyCatalog,
    parts: [{ id: "trixbrix:r56", brand: "TrixBrix", name: "R56" }],
  };
  const result = exportLDraw(project, catalog);
  assert.deepEqual(partLines(result.text), []);
  assert.deepEqual(result.omitted, [
    { name: "TrixBrix R56", count: 2 },
    { name: "other:unknown", count: 1 },
    { name: "Imported item", count: 1 },
  ]);
  assert.deepEqual(result.custom, []);
});

test("unsupported catalog parts with the same name stay distinct by brand", () => {
  const project = newProject();
  project.items = [track("trixbrix:r104"), track("4dbrix:r104"), track("trixbrix:r104", 16)];
  const catalog = {
    ...emptyCatalog,
    parts: [
      { id: "trixbrix:r104", brand: "TrixBrix", name: "Curve R104" },
      { id: "4dbrix:r104", brand: "4DBrix", name: "Curve R104" },
    ],
  };

  assert.deepEqual(exportLDraw(project, catalog).omitted, [
    { name: "TrixBrix Curve R104", count: 2 },
    { name: "4DBrix Curve R104", count: 1 },
  ]);
});
