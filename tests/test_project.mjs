import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  angleGap,
  composePose,
  newProject,
  poseConnectingPorts,
  validateProject,
} from "../src/project.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const physicalPartId = catalog.parts.find(({ id }) => !id.startsWith("lego:9v-")).id;

test("rail port placements join regular and flipped track at any turn count", () => {
  for (const [incoming, target] of [
    [
      { x: 0, y: 0, angle: 0 },
      { x: 32, y: 16, angle: -90 },
    ],
    [
      { x: 16, y: 0, angle: 180 },
      { x: -8, y: 24, angle: 765 },
    ],
  ]) {
    const placed = poseConnectingPorts(incoming, target);
    const joined = composePose(incoming, placed);
    assert.ok(Math.abs(joined.x - target.x) < 1e-9);
    assert.ok(Math.abs(joined.y - target.y) < 1e-9);
    assert.equal(angleGap(joined.angle, target.angle + 180), 0);
    assert.ok(placed.angle >= 0 && placed.angle < 360);
  }
  assert.equal(angleGap(-720, 1080), 0);
  assert.equal(angleGap(-450, 90), 180);
});

test("design area validates NILTC assignments", () => {
  const project = newProject();
  project.area.niltc = "corner";
  project.area.fronts = ["north", "west"];
  project.items.push({
    kind: "track",
    id: "outer",
    layerId: "layout",
    partId: physicalPartId,
    arrangementId: "mainline",
    groupId: "outer",
    x: 8,
    y: 24,
    angle: 0,
  });
  validateProject(project);
});

test("schema rejects malformed design areas", () => {
  const project = newProject();
  const invalid = [
    [{ ...project, area: { ...project.area, fronts: ["north", "south"] } }, /adjacent edges/],
    [{ ...project, area: { ...project.area, niltc: "curve" } }, /niltc/],
    [{ ...project, area: { ...project.area, fronts: ["north"] } }, /0 public edge/],
  ];
  for (const [value, error] of invalid) {
    assert.throws(() => validateProject(value), error);
  }
});

test("schema validates placed physical track and arrangement identity", () => {
  const project = newProject();
  project.items.push({
    kind: "track",
    id: "yard",
    layerId: "layout",
    partId: physicalPartId,
    arrangementId: "trixbrix:yard-r104-right",
    groupId: "right-yard",
    x: 0,
    y: 0,
    angle: 0,
  });
  validateProject(project);
  project.items[0].partId = "not-a-part";
  assert.throws(() => validateProject(project), /catalog track part/);
  project.items[0].partId = physicalPartId;
  project.items[0].groupId = "";
  assert.throws(() => validateProject(project), /groupId/);
});
