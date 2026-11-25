import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { commitArrangement, commitItems, previewArrangement } from "../src/arrangements.ts";
import { createNiltcStarter } from "../src/niltc_starters.ts";

const measuredCatalog = JSON.parse(
  readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"),
);

const straight = {
  id: "test:s16",
  brand: "Test",
  name: "Straight 16",
  ports: [
    { id: "a", type: "regular", x: -8, y: 0, angle: 180 },
    { id: "b", type: "regular", x: 8, y: 0, angle: 0 },
  ],
  routes: [{ from: "a", to: "b", path: 0 }],
  paths: [
    [
      { x: -8, y: 0 },
      { x: 8, y: 0 },
    ],
  ],
  footprint: [
    { x: -8, y: -4 },
    { x: 8, y: -4 },
    { x: 8, y: 4 },
    { x: -8, y: 4 },
  ],
};
const catalog = {
  parts: [straight],
  kits: [
    {
      id: "test:double",
      brand: "Test",
      name: "Double straight",
      parts: [
        { partId: "test:s16", x: -8, y: 0, angle: 0 },
        { partId: "test:s16", x: 8, y: 0, angle: 0 },
      ],
    },
  ],
};
const project = {
  version: 3,
  name: "Test layout",
  area: { width: 96, depth: 64, fronts: ["north"], exits: [] },
  layers: [{ id: "layout", name: "Layout", visible: true }],
  items: [],
};

test("arrangement preview is atomic and tags physical pieces", () => {
  const result = previewArrangement(project, catalog, {
    kitId: "test:double",
    pose: { x: 32, y: 32, angle: 0 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.project?.items.length, 2);
  assert.deepEqual(
    result.project?.items.map(({ arrangementId }) => arrangementId),
    ["test:double", "test:double"],
  );
  assert.equal(result.candidateItems?.length, 2);
  const next = previewArrangement(project, catalog, {
    kitId: "test:double",
    pose: { x: 48, y: 32, angle: 0 },
  });
  assert.notEqual(result.candidateItems?.[0]?.groupId, next.candidateItems?.[0]?.groupId);
});

test("arrangement keeps invalid candidates out of the project", () => {
  const result = previewArrangement(project, catalog, {
    kitId: "test:double",
    pose: { x: 4, y: 32, angle: 0 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.project, undefined);
  assert.equal(result.candidateItems?.length, 2);
  assert.equal(result.issues[0]?.kind, "outside-area");
});

test("parking items reject real overlap but accept an end-to-end join", () => {
  const first = {
    id: "first",
    kind: "track",
    layerId: "layout",
    partId: "test:s16",
    heightPlates: 0,
    x: 24,
    y: 24,
    angle: 0,
  };
  const overlap = { ...first, id: "overlap", x: 25 };
  const joined = { ...first, id: "joined", x: 40 };
  const source = { ...project, items: [first] };
  assert.equal(commitItems(source, catalog, { items: [overlap] }).ok, false);
  assert.equal(commitItems(source, catalog, { items: [joined] }).ok, true);
});

test("hidden imported track neither blocks placement nor gets replaced", () => {
  const hidden = {
    id: "hidden",
    kind: "track",
    layerId: "import",
    partId: "test:s16",
    heightPlates: 0,
    x: 24,
    y: 24,
    angle: 0,
  };
  const placed = { ...hidden, id: "placed" };
  const imported = {
    ...project,
    layers: [{ id: "import", name: "BlueBrick import", visible: false }],
    items: [hidden],
  };
  const result = commitItems(imported, catalog, { items: [placed], replaceIds: ["hidden"] });
  assert.equal(result.ok, true);
  assert.equal(result.removedIds.length, 0);
  assert.ok(result.project?.items.some(({ id }) => id === "hidden"));
  assert.equal(
    result.project?.items.find(({ id }) => id === "placed")?.layerId,
    result.project?.layers.find(({ visible }) => visible)?.id,
  );
  assert.equal(result.project?.layers.filter(({ visible }) => visible).length, 1);
});

test("replacement keeps the specific surviving-piece joint, not another port on it", () => {
  const junction = {
    id: "test:junction",
    brand: "Test",
    name: "Three-way junction",
    ports: [
      { id: "west", type: "regular", x: -8, y: 0, angle: 180 },
      { id: "east", type: "regular", x: 8, y: 0, angle: 0 },
      { id: "north", type: "regular", x: 0, y: -8, angle: 270 },
    ],
    routes: [],
    paths: [],
    footprint: [
      { x: -8, y: -8 },
      { x: 8, y: -8 },
      { x: 8, y: 8 },
      { x: -8, y: 8 },
    ],
  };
  const old = {
    id: "old",
    kind: "track",
    layerId: "layout",
    partId: "test:s16",
    heightPlates: 0,
    x: 24,
    y: 32,
    angle: 0,
  };
  const survivingJunction = {
    id: "junction",
    kind: "track",
    layerId: "layout",
    partId: "test:junction",
    heightPlates: 0,
    x: 40,
    y: 32,
    angle: 0,
  };
  const wrongJoint = { ...old, id: "replacement", x: 56 };
  const result = commitItems(
    { ...project, items: [old, survivingJunction] },
    { ...catalog, parts: [...catalog.parts, junction] },
    { items: [wrongJoint], replaceIds: ["old"] },
  );
  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some(({ kind }) => kind === "misaligned"),
    true,
  );
});

test("commit arrangement returns a checked replacement project", () => {
  const result = commitArrangement(project, catalog, {
    kitId: "test:double",
    pose: { x: 32, y: 32, angle: 0 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.project?.items.length, 2);
});

test("measured R104 triple places its five physical pieces on a blank area", () => {
  const result = previewArrangement(project, measuredCatalog, {
    kitId: "trixbrix:r104-triple-kit",
    pose: { x: 32, y: 32, angle: 0 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.project?.items.length, 5);
  assert.ok(
    result.project?.items.every(
      ({ arrangementId }) => arrangementId === "trixbrix:r104-triple-kit",
    ),
  );
});

test("replacement preserves each protected endpoint by its own port pose", () => {
  const old = {
    id: "old",
    kind: "track",
    layerId: "layout",
    partId: "test:s16",
    heightPlates: 2,
    x: 32,
    y: 32,
    angle: 0,
  };
  const replacement = { ...old, id: "new" };
  const protectedProject = {
    ...project,
    items: [old],
    area: {
      ...project.area,
      exits: [
        {
          id: "handoff",
          outer: { pieceId: "old", portId: "a" },
          inner: { pieceId: "old", portId: "b" },
        },
      ],
    },
  };
  const result = commitItems(protectedProject, catalog, {
    items: [replacement],
    replaceIds: ["old"],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.project?.area.exits[0], {
    id: "handoff",
    outer: { pieceId: "new", portId: "a" },
    inner: { pieceId: "new", portId: "b" },
  });
});

test("the measured R40 right yard replaces an inner mainline without a false hull collision", () => {
  const starter = createNiltcStarter(measuredCatalog, {
    width: 320,
    depth: 192,
    mode: "straight",
    fronts: ["north"],
  });
  const result = previewArrangement(starter, measuredCatalog, {
    kitId: "trixbrix:r40-right-yard-4",
    pose: { x: 48, y: 27.125, angle: 0 },
    heightPlates: 2,
    replaceIds: ["inner-3", "inner-4"],
  });
  assert.equal(result.ok, true, result.issues.map(({ message }) => message).join("\n"));
});
