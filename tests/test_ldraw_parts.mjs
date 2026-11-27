import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fallbackTrackModel, fallbackTrackModelName } from "../src/ldraw_parts.ts";
import { offsetRail } from "../src/scene_drawing.ts";

const part = {
  id: "vendor:straight/16",
  brand: "Vendor",
  name: "Straight",
  ports: [
    { id: "a", type: "regular", x: -8, y: 0, angle: 180 },
    { id: "b", type: "regular", x: 8, y: 0, angle: 0 },
  ],
  paths: [
    [
      { x: -8, y: 0 },
      { x: 8, y: 0 },
    ],
  ],
};

test("fallback LDraw models embed dimensional rails and sleepers in a stable MPD subfile", () => {
  assert.equal(fallbackTrackModelName(part), "bricktrack-vendor-straight-16.dat");
  const model = fallbackTrackModel(part);
  assert.deepEqual(model.slice(0, 3), [
    "0 FILE bricktrack-vendor-straight-16.dat",
    "0 Name: bricktrack-vendor-straight-16.dat",
    "0 Brick Track Planner schematic Vendor Straight",
  ]);
  assert.equal(model.filter((line) => line.startsWith("4 16 ")).length, 11);
  assert.ok(model.includes("4 16 -160 -16 53.6 -160 -8 53.6 160 -8 53.6 160 -16 53.6"));
  assert.ok(model.includes("4 16 -160 -16 -53.6 160 -16 -53.6 160 -8 -53.6 -160 -8 -53.6"));
});

test("fallback rails use the same five-stud gauge and endpoint tangents as the drawing", () => {
  const rail = offsetRail(part.paths[0], 2.5, part.ports);
  assert.ok(rail.every((point) => Math.abs(point.y - 2.5) < 1e-9));
  assert.ok(Math.abs(rail[0].x + 8) < 1e-9);
  assert.ok(Math.abs(rail[1].x - 8) < 1e-9);
});

test("fallback models preserve catalog footprints for non-rail accessories", () => {
  const catalog = JSON.parse(
    readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"),
  );
  const accessories = catalog.parts.filter((candidate) => candidate.paths.length === 0);
  assert.ok(accessories.length > 0);
  for (const accessory of accessories) {
    const model = fallbackTrackModel(accessory);
    assert.ok(model.length > 3, accessory.id);
  }
  const stand = accessories.find(({ id }) => id === "bricktracks:r104-stand");
  assert.ok(stand);
  assert.ok(
    fallbackTrackModel(stand).includes(
      "4 16 -30 -16 68.75 30 -16 68.75 30 -16 -68.75 -30 -16 -68.75",
    ),
  );
});
