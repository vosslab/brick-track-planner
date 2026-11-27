import assert from "node:assert/strict";
import test from "node:test";

import { arrangementRequirements, findArrangementAnchors } from "../src/arrangement_anchors.ts";

const straight = {
  id: "straight",
  brand: "Test",
  name: "Straight",
  ports: [
    { id: "a", x: -8, y: 0, angle: 180, type: "regular" },
    { id: "b", x: 8, y: 0, angle: 0, type: "regular" },
  ],
  paths: [
    [
      { x: -8, y: 0 },
      { x: 8, y: 0 },
    ],
  ],
  routes: [{ from: "a", to: "b", path: 0 }],
  footprint: [
    { x: -8, y: -4 },
    { x: 8, y: -4 },
    { x: 8, y: 4 },
    { x: -8, y: 4 },
  ],
};
const branch = {
  id: "branch",
  brand: "Test",
  name: "Branch",
  ports: [
    { id: "a", x: -8, y: 0, angle: 180, type: "regular" },
    { id: "b", x: 8, y: 0, angle: 0, type: "regular" },
  ],
  paths: [
    [
      { x: -8, y: 0 },
      { x: 8, y: 0 },
    ],
  ],
  routes: [{ from: "a", to: "b", path: 0, event: "switch" }],
  footprint: [
    { x: -8, y: -4 },
    { x: 8, y: -4 },
    { x: 8, y: 4 },
    { x: -8, y: 4 },
  ],
};
const catalog = {
  parts: [straight, branch],
  kits: [
    {
      id: "pair",
      brand: "Test",
      name: "Pair",
      parts: [
        { partId: "branch", x: -8, y: 0, angle: 0 },
        { partId: "branch", x: 8, y: 0, angle: 180 },
      ],
    },
  ],
};
const area = { width: 128, depth: 96, fronts: ["north"] };

test("anchors replace complete straight sections and preserve the outer join", () => {
  const project = {
    name: "test",
    area,
    layers: [{ id: "layout", name: "Layout", visible: true }],
    items: [
      {
        id: "left",
        kind: "track",
        layerId: "layout",
        partId: "straight",
        x: 8,
        y: 48,
        angle: 0,
      },
      {
        id: "middle",
        kind: "track",
        layerId: "layout",
        partId: "straight",
        x: 24,
        y: 48,
        angle: 0,
      },
      {
        id: "right",
        kind: "track",
        layerId: "layout",
        partId: "straight",
        x: 40,
        y: 48,
        angle: 0,
      },
    ],
  };
  const anchors = findArrangementAnchors(project, catalog, "pair").anchors;
  assert.ok(anchors.length);
  assert.ok(anchors.some((anchor) => anchor.replaceIds.includes("middle")));
  assert.ok(
    anchors.every(
      (anchor) =>
        !anchor.replaceIds.includes("left") ||
        !anchor.connections.some((link) => link.itemId === "left"),
    ),
  );
});

test("a blank area gets detached candidates regardless of its setup mode", () => {
  const project = { name: "test", area, layers: [], items: [] };
  assert.ok(findArrangementAnchors(project, catalog, "pair").anchors.length);
  assert.ok(
    findArrangementAnchors({ ...project, area: { ...area, niltc: "straight" } }, catalog, "pair")
      .anchors.length,
  );
});

test("arrangement requirements report measured space and a missing fit reason", () => {
  assert.match(arrangementRequirements(catalog, "pair"), /32 by 8 studs/);
  const project = {
    name: "small",
    area: { ...area, width: 16, depth: 16 },
    layers: [],
    items: [],
  };
  const result = findArrangementAnchors(project, catalog, "pair");
  assert.equal(result.anchors.length, 0);
  assert.match(result.reason, /clear area of 32 by 8 studs/);
});
