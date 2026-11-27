import assert from "node:assert/strict";
import test from "node:test";
import { commitItems, previewArrangement } from "../src/arrangements.ts";

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
  name: "Test layout",
  area: { width: 96, depth: 64, fronts: ["north"] },
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

test("direct placement rejects overlap and overhang but accepts an end-to-end join", () => {
  const first = {
    id: "first",
    kind: "track",
    layerId: "layout",
    partId: "test:s16",
    x: 24,
    y: 24,
    angle: 0,
  };
  const overlap = { ...first, id: "overlap", x: 25 };
  const joined = { ...first, id: "joined", x: 40 };
  const source = { ...project, items: [first] };
  assert.equal(commitItems(source, catalog, { items: [overlap] }).ok, false);
  assert.equal(commitItems(source, catalog, { items: [joined] }).ok, true);
  const outside = commitItems(source, catalog, { items: [{ ...first, id: "outside", x: 93 }] });
  assert.equal(outside.project, undefined);
  assert.equal(outside.issues[0]?.kind, "outside-area");
});

test("hidden imported track neither blocks placement nor gets replaced", () => {
  const hidden = {
    id: "hidden",
    kind: "track",
    layerId: "import",
    partId: "test:s16",
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
