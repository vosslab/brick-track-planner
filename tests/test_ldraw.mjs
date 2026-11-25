import assert from "node:assert/strict";
import test from "node:test";

import catalog from "../data/catalog.json" with { type: "json" };
import { openTrackPlan, saveTrackPlan } from "../src/ldraw.ts";
import { newProject } from "../src/project.ts";

function track(partId, extra = {}) {
  return {
    id: "track",
    kind: "track",
    layerId: "layout",
    partId,
    x: 10,
    y: 20,
    angle: 45,
    heightPlates: 2,
    ...extra,
  };
}

test("planner LDraw files preserve project data and use physical type-1 placements", () => {
  const project = newProject();
  project.name = "Yard & mainline";
  project.items = [track("lego:rc-s16", { groupId: "yard", countBallast: false })];
  const text = saveTrackPlan(project, catalog);
  assert.match(text, /0 !BRICKTRACK TRACK @track @layout @lego%3Arc-s16 @yard - - 0\r\n1 72 /);
  assert.match(text, /^1 72 200 -24 -400 .* 53401\.dat$/m);
  assert.deepEqual(openTrackPlan(text, catalog), project);
});

test("embedded schematic parts keep unmapped catalog track visible in LDraw", () => {
  const project = newProject();
  project.items = [track("trixbrix:r104")];
  const text = saveTrackPlan(project, catalog);
  assert.match(text, /1 72 200 -24 -400 .* bricktrack-trixbrix-r104\.dat/);
  assert.match(text, /0 FILE bricktrack-trixbrix-r104\.dat/);
  assert.deepEqual(openTrackPlan(text, catalog), project);
});

test("type-1 translation owns the track position, including at the edge of the coordinate range", () => {
  const project = newProject();
  project.items = [track("bricktracks:r104", { x: 100000, y: -100000, angle: 121.32 })];
  const file = saveTrackPlan(project, catalog);
  assert.match(file, /^0 FILE BrickTracksR104\.dat\r?\n0 Train Track/m);
  assert.deepEqual(openTrackPlan(file, catalog).items, project.items);
  const moved = file.replace(
    /^1 (\d+) ([^ ]+) /m,
    (_, color, x) => `1 ${color} ${Number(x) - 20} `,
  );
  assert.equal(openTrackPlan(moved, catalog).items[0].x, 99999);
});

test("reopening preserves calibrated poses, hidden layers, and unresolved imports", () => {
  const project = newProject();
  project.layers.push({ id: "hidden", name: "Planning notes", visible: false });
  project.items = [
    track("lego:rc-r40", { angle: 11.25, x: 14.25, y: -3.5, heightPlates: 2 }),
    track("lego:rc-s16", { id: "hidden-track", layerId: "hidden" }),
    {
      id: "unknown",
      kind: "unresolved",
      layerId: "layout",
      sourceId: "external-part",
      name: "Imported marker",
      x: 4,
      y: 5,
      angle: 0,
      width: 8,
      depth: 8,
      reason: "Unknown BlueBrick part",
    },
  ];
  const first = saveTrackPlan(project, catalog);
  assert.match(first, /^1 72 .* 53400\.dat$/m);
  const reopened = openTrackPlan(first, catalog);
  const curve = reopened.items.find((item) => item.id === "track");
  assert.equal(curve?.kind, "track");
  assert.ok(Math.abs(curve.x - 14.25) < 1e-9);
  assert.ok(Math.abs(curve.y + 3.5) < 1e-9);
  assert.ok(Math.abs(curve.angle - 11.25) < 1e-9);
  assert.equal(reopened.layers.find((layer) => layer.id === "hidden")?.visible, false);
  assert.equal(reopened.items.find((item) => item.id === "unknown")?.kind, "unresolved");
  assert.equal(saveTrackPlan(reopened, catalog), first);
});

test("opening rejects arbitrary or incomplete LDraw instead of losing track", () => {
  assert.throws(
    () => openTrackPlan("0 plain LDraw\r\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\r\n", catalog),
    /Planner LDraw/,
  );
  const project = newProject();
  project.items = [track("lego:rc-s16")];
  const saved = saveTrackPlan(project, catalog);
  assert.throws(
    () => openTrackPlan(saved.replace(/\r\n1 72[^\r]+/, ""), catalog),
    /type-1 placement/,
  );
});
