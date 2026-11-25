import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  composePose,
  localPose,
  newProject,
  parseProject,
  validateProject,
  worldPose,
} from "../src/project.ts";

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

test("legacy layouts migrate into one local section without changing their geometry", () => {
  const examples = new URL("../examples/", import.meta.url);
  for (const name of readdirSync(examples).filter((name) => name.endsWith(".btp.json"))) {
    const text = readFileSync(new URL(name, examples), "utf8");
    const legacy = JSON.parse(text);
    if (legacy.version !== 1) continue;
    const project = parseProject(text);
    assert.deepEqual(project, {
      ...legacy,
      version: 2,
      members: [],
      sections: legacy.tables.length > 0 ? [{ id: "local", name: "Local", exits: [] }] : [],
      tables: legacy.tables.map((table) => ({ ...table, sectionId: "local" })),
    });
    assert.deepEqual(parseProject(JSON.stringify(project)), project);
  }

  const { members, sections, ...empty } = newProject();
  assert.deepEqual(parseProject(JSON.stringify({ ...empty, version: 1 })), {
    ...empty,
    members,
    sections,
  });

  const layer = { id: "hidden", name: "Hidden layer", visible: false };
  const pose = { layerId: layer.id, x: 13.5, y: 20, angle: 45 };
  const items = [
    { ...pose, id: "colored", kind: "baseplate", color: "#0055BF" },
    {
      ...pose,
      id: "unresolved",
      kind: "unresolved",
      sourceId: "unknown.8",
      name: "Unknown decoration",
      reason: "Unknown BlueBrick part",
      width: 2.5,
      depth: 3,
      altitude: 8,
    },
  ];
  const legacy = { ...empty, version: 1, layers: [layer], items };
  const migrated = { ...legacy, version: 2, members, sections };
  assert.deepEqual(parseProject(JSON.stringify(legacy)), migrated);
});

test("legacy nominal table metadata does not enable NILTC mode", () => {
  const legacy = JSON.parse(
    readFileSync(new URL("../examples/two-section.btp.json", import.meta.url), "utf8"),
  );
  const project = parseProject(JSON.stringify(legacy));
  assert.equal(project.tables[0].nominal, "30 x 40 in");
  assert.equal(project.tables[0].niltc, undefined);

  const prepared = example("whole_show");
  assert.ok(prepared.tables.some(({ niltc }) => niltc === "straight" || niltc === "corner"));
});

test("version 2 round-trips venue, ownership, independent ballast and repairable exits", () => {
  const project = example("two-section");
  const { id: tableId } = project.tables[0];
  const [section] = project.sections;
  const [seam] = project.seams;
  const member = {
    id: "owner",
    name: "\u674E",
    bring: { "lego:9v-s16": 0, "ballast:3023:gray": 2 },
  };
  project.members.push(member);
  section.memberId = member.id;
  const gone = { pieceId: "removed-track", portId: "a" };
  const exit = {
    id: "exit-1",
    name: "East",
    tableId,
    edge: "east",
    outer: gone,
    inner: seam.inner.a,
  };
  section.exits.push(exit);
  Object.assign(seam, { exitAId: exit.id, exitBId: "removed-exit" });
  Object.assign(project.items[0], { ballast: "bare", countBallast: true });
  Object.assign(project.items[1], { ballast: "pennlug", countBallast: false });
  const keepout = { id: "door", name: "Door", x: -4, y: 16, width: 8, depth: 12 };
  project.venue = { width: 320, depth: 480, keepouts: [keepout] };
  validateProject(project);
  assert.deepEqual(parseProject(JSON.stringify(project)), project);

  const invalidEdits = [
    [project, "sections", undefined, /project\.sections/],
    [project, "members", undefined, /project\.members/],
    [section, "memberId", "absent", /memberId/],
    [project.tables[0], "sectionId", "absent", /sectionId/],
    [project.tables[0], "niltc", "curve", /niltc/],
    [member.bring, "lego:9v-s16", -1, /safe integer/],
    [member.bring, "ballast:3023:gray", 2 ** 53, /safe integer/],
    [member.bring, "trixbrix:r104-left", 1, /track part or ballast/],
    [
      project,
      "sections",
      [...project.sections, { id: "other", name: "Other", exits: [exit] }],
      /unique/,
    ],
    [exit, "inner", { pieceId: "track", portId: "" }, /portId/],
    [seam, "exitAId", 1, /exitAId/],
    [keepout, "width", 0, /keepouts\[0\]\.width/],
    [keepout, "x", -100_001, /keepouts\[0\]\.x/],
    [project.items[0], "ballast", "blue", /ballast/],
    [project.items[0], "countBallast", "yes", /countBallast/],
  ];
  for (const [object, key, invalid, error] of invalidEdits) {
    const original = object[key];
    object[key] = invalid;
    assert.throws(() => validateProject(project), error);
    if (original === undefined) delete object[key];
    else object[key] = original;
  }
});

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
