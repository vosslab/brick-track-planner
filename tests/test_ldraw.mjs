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
    ...extra,
  };
}

test("planner LDraw files preserve project data and use physical type-1 placements", () => {
  const project = newProject();
  project.name = "Yard & mainline";
  project.area.baseplates = {
    pattern: "checkerboard",
    color: "classic-green",
    secondary: "light-bley",
  };
  project.items = [track("lego:rc-s16", { groupId: "yard", ballast: "gray", countBallast: false })];
  const text = saveTrackPlan(project, catalog);
  assert.match(text, /0 !BRICKTRACK TRACK @track @layout @lego%3Arc-s16 @yard - @gray 0\r\n1 72 /);
  assert.match(text, /^1 72 200 -8 -400 .* 53401\.dat$/m);
  assert.deepEqual(openTrackPlan(text, catalog), project);
});

test("opening rejects malformed baseplate metadata", () => {
  const saved = saveTrackPlan(newProject(), catalog);
  assert.throws(
    () =>
      openTrackPlan(
        saved.replace(
          /0 !BRICKTRACK AREA ([^\r]+)\r\n/,
          "0 !BRICKTRACK AREA $1\r\n0 !BRICKTRACK BASEPLATE @solid @classic-green @classic-blue\r\n",
        ),
        catalog,
      ),
    /baseplates\.secondary/,
  );
});

test("embedded schematic parts keep unmapped catalog track visible in LDraw", () => {
  const project = newProject();
  project.items = [track("trixbrix:r104")];
  const text = saveTrackPlan(project, catalog);
  assert.match(text, /1 72 200 -8 -400 .* bricktrack-trixbrix-r104\.dat/);
  assert.match(text, /0 FILE bricktrack-trixbrix-r104\.dat/);
  assert.deepEqual(openTrackPlan(text, catalog), project);
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
