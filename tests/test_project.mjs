import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { composePose, localPose, newProject, parseProject, worldPose } from "../src/project.ts";

const { parts } = JSON.parse(
  readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"),
);

function example(name) {
  return parseProject(
    readFileSync(new URL(`../examples/${name}.btp.json`, import.meta.url), "utf8"),
  );
}

function portPose(item, tables, portId) {
  const part = parts.find(({ id }) => id === item.partId);
  return composePose(
    part.ports.find(({ id }) => id === portId),
    worldPose(item, tables),
  );
}

function assertSamePoint(a, b) {
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6, JSON.stringify({ a, b }));
}

test("project validation keeps repairable seam references and signed heights", () => {
  assert.deepEqual(parseProject(JSON.stringify(newProject())), newProject());

  const project = example("two-section");
  project.tables = [project.tables[0]];
  project.items = project.items.filter((item) => item.tableId === "table-a");
  project.items[0].heightPlates = -3;
  assert.deepEqual(parseProject(JSON.stringify(project)), project);

  project.items[0].heightPlates = 0.5;
  assert.throws(() => parseProject(JSON.stringify(project)), /heightPlates/);
  project.items[0].heightPlates = 0;
  project.tables[0].fronts = ["north", "south"];
  assert.throws(() => parseProject(JSON.stringify(project)), /adjacent edges/);
});

test("tables and items share a selection ID namespace", () => {
  const project = example("two-section");
  const tableId = project.tables[0].id;
  project.seams[0].id = tableId;
  assert.deepEqual(parseProject(JSON.stringify(project)), project);

  project.items[0].id = tableId;
  assert.throws(() => parseProject(JSON.stringify(project)), /unique across tables and items/);
});

test("project geometry fits the supported planar range", () => {
  const project = example("two-section");
  const table = project.tables[0];
  const item = project.items[0];
  table.x = -100_000;
  table.width = 100_000;
  item.y = 100_000;
  table.angle = 1e308;
  item.angle = 1e308;
  assert.deepEqual(parseProject(JSON.stringify(project)), project);
  assert.deepEqual(
    worldPose(item, project.tables),
    composePose({ ...item, angle: item.angle % 360 }, { ...table, angle: table.angle % 360 }),
  );
  assert.ok(Number.isFinite(localPose({ ...item, angle: -1e308 }, table).angle));

  const invalidCases = /** @type {const} */ ([
    [table, "x", 1e10],
    [table, "width", 100_001],
    [item, "y", -100_001],
  ]);
  for (const [entry, field, invalid] of invalidCases) {
    const original = entry[field];
    entry[field] = invalid;
    assert.throws(() => parseProject(JSON.stringify(project)), new RegExp(`\\.${field}`));
    entry[field] = original;
  }
});

test("section geometry uses table-local coordinates and clockwise angles", () => {
  const section = example("two-section");
  const track = section.items.find(({ id }) => id === "inner-b");
  const table = section.tables.find(({ id }) => id === "table-b");
  assert.deepEqual(worldPose(track, section.tables), { x: 144, y: 24, angle: 0 });

  const turnout = section.items.find(({ id }) => id === "inner-turnout");
  assertSamePoint(portPose(turnout, section.tables, "branch"), { x: 56, y: 32 });
  const stand = section.items.find(({ id }) => id === "inner-stand");
  assert.deepEqual(worldPose(stand, section.tables), { x: 20.5, y: 30.5, angle: 180 });

  table.angle = 90;
  const turned = worldPose(track, section.tables);
  assert.deepEqual(turned, { x: 104, y: 16, angle: 90 });
  const local = localPose(turned, table);
  assert.ok(Math.hypot(local.x - track.x, local.y - track.y) < 1e-12);
  assert.equal(local.angle, track.angle);
});

test("both corner routes join at all seven breaks and meet the lane guides", () => {
  const corner = parseProject(JSON.stringify(example("double-corner")));
  assert.deepEqual(corner.tables[0].fronts, ["north", "west"]);
  for (const radius of [104, 120]) {
    const lane = corner.items.filter(({ id }) => id.startsWith(`r${radius}-`));
    assert.equal(lane.length, 8);
    assert.equal(lane.filter(({ partId }) => partId === `bricktracks:r${radius}`).length, 4);
    assert.equal(lane.filter(({ partId }) => partId === `trixbrix:r${radius}`).length, 4);

    const offset = 128 - radius;
    const southExit = portPose(lane[0], corner.tables, "a");
    const eastExit = portPose(lane[7], corner.tables, "b");
    assertSamePoint(southExit, { x: offset, y: 128 });
    assertSamePoint(eastExit, { x: 128, y: offset });
    assert.equal(southExit.angle, 90);
    assert.equal(eastExit.angle, 0);
    for (let i = 1; i < lane.length; i++) {
      const outgoing = portPose(lane[i - 1], corner.tables, "b");
      const incoming = portPose(lane[i], corner.tables, "a");
      assertSamePoint(outgoing, incoming);
      assert.equal(incoming.angle - outgoing.angle, 180);
    }
  }
});
