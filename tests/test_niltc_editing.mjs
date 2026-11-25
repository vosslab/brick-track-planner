import assert from "node:assert/strict";
import test from "node:test";

import {
  duplicateTrackSelection,
  snapNiltcBaseplatePose,
  snapNiltcTablePose,
} from "../src/editor_niltc.ts";
import { newProject, worldPose } from "../src/project.ts";

const table = {
  id: "test-table",
  name: "Test table",
  layerId: "layout",
  width: 128,
  depth: 128,
  x: 0,
  y: 0,
  angle: 0,
  niltc: "straight",
  fronts: ["north"],
};

test("NILTC editing uses the tabletop grid and favors contact with a nearby nominal edge", () => {
  const project = newProject();
  project.tables = [table, { ...table, id: "neighbor", x: 128 }];
  const candidate = { x: 16, y: 1, angle: -4 };
  assert.deepEqual(snapNiltcTablePose(project, table, candidate), { x: 0, y: 0, angle: 0 });

  const plate = { x: 50, y: 82, angle: 93 };
  assert.deepEqual(snapNiltcBaseplatePose(table, plate), { x: 48, y: 80, angle: 90 });
  const custom = { ...table, niltc: undefined };
  assert.deepEqual(snapNiltcTablePose(project, custom, candidate), candidate);
  assert.deepEqual(snapNiltcBaseplatePose(custom, plate), plate);
});

test("duplicate offsets a mixed piece group together and retains attached-local data", () => {
  const project = newProject();
  project.tables = [{ ...table, x: 128, angle: 90 }];
  const track = {
    id: "track",
    kind: "track",
    partId: "lego:9v-s16",
    layerId: table.layerId,
    tableId: table.id,
    heightPlates: 2,
    ballast: "gray",
    x: 16,
    y: 48,
    angle: 90,
  };
  const plate = {
    id: "plate",
    kind: "baseplate",
    name: "River",
    layerId: table.layerId,
    tableId: table.id,
    x: 16,
    y: 48,
    angle: 90,
  };
  project.items = [track, plate];
  const ids = duplicateTrackSelection(project, [table.id, track.id, plate.id]);
  assert.equal(new Set(ids).size, 2);
  const [copyTrack, copyPlate] = project.items.slice(2);
  assert.deepEqual(copyTrack, { ...track, id: ids[0], y: 16 });
  assert.deepEqual(copyPlate, { ...plate, id: ids[1], y: 16 });
  assert.notEqual(ids[0], track.id);
  assert.notEqual(ids[1], plate.id);
  const originalWorld = worldPose(track, project.tables);
  const copyWorld = worldPose(copyTrack, project.tables);
  assert.equal(copyWorld.x - originalWorld.x, 32);
  assert.ok(Math.abs(copyWorld.y - originalWorld.y) < 1e-6);
  assert.deepEqual(project.items.slice(0, 2), [track, plate]);

  const [trackOnly] = duplicateTrackSelection(project, [track.id]);
  assert.equal(project.items.find(({ id }) => id === trackOnly)?.y, 32);
});
