import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { arrangementRequirements, findArrangementAnchors } from "../src/arrangement_anchors.ts";
import { createNiltcStarter } from "../src/niltc_starters.ts";

const measuredCatalog = JSON.parse(
  readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"),
);

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
const area = { width: 128, depth: 96, fronts: ["north"], exits: [] };

test("anchors replace complete straight sections and preserve the outer join", () => {
  const project = {
    version: 3,
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
        heightPlates: 0,
      },
      {
        id: "middle",
        kind: "track",
        layerId: "layout",
        partId: "straight",
        x: 24,
        y: 48,
        angle: 0,
        heightPlates: 0,
      },
      {
        id: "right",
        kind: "track",
        layerId: "layout",
        partId: "straight",
        x: 40,
        y: 48,
        angle: 0,
        heightPlates: 0,
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

test("only a blank general area gets detached candidates", () => {
  const project = { version: 3, name: "test", area, layers: [], items: [] };
  assert.equal(findArrangementAnchors(project, catalog, "pair").anchors.length, 4);
  assert.equal(
    findArrangementAnchors({ ...project, area: { ...area, niltc: "straight" } }, catalog, "pair")
      .anchors.length,
    0,
  );
});

test("arrangement requirements report measured space and a missing fit reason", () => {
  assert.match(arrangementRequirements(catalog, "pair"), /32 by 8 studs/);
  assert.match(
    arrangementRequirements(measuredCatalog, "trixbrix:r56-double-pass-through-complete"),
    /3 parallel straight runs 16 studs apart/,
  );
  const project = {
    version: 3,
    name: "small",
    area: { ...area, width: 16, depth: 16 },
    layers: [],
    items: [],
  };
  const result = findArrangementAnchors(project, catalog, "pair");
  assert.equal(result.anchors.length, 0);
  assert.match(result.reason, /clear area of 32 by 8 studs/);
});

test("anchor search identifies track at the wrong height", () => {
  const project = {
    version: 3,
    name: "low track",
    area,
    layers: [{ id: "layout", name: "Layout", visible: true }],
    items: [
      {
        id: "low",
        kind: "track",
        layerId: "layout",
        partId: "straight",
        x: 24,
        y: 48,
        angle: 0,
        heightPlates: 0,
      },
    ],
  };
  assert.match(findArrangementAnchors(project, catalog, "pair", 2).reason, /2-plate/);
});

test("hidden imported track does not generate or suppress arrangement anchors", () => {
  const project = {
    version: 3,
    name: "import",
    area,
    layers: [{ id: "import", name: "Imported", visible: false }],
    items: [
      {
        id: "hidden",
        kind: "track",
        layerId: "import",
        partId: "straight",
        x: 32,
        y: 48,
        angle: 0,
        heightPlates: 0,
      },
    ],
  };
  const anchors = findArrangementAnchors(project, catalog, "pair").anchors;
  assert.equal(anchors.length, 4);
  assert.ok(
    anchors.every(({ replaceIds, connections }) => !replaceIds.length && !connections.length),
  );
});

test("R40 parallel triple belongs behind a mainline, where it has clearance to fan out", () => {
  const starter = createNiltcStarter(measuredCatalog, {
    width: 320,
    depth: 192,
    mode: "straight",
    fronts: ["north"],
  });
  assert.equal(
    findArrangementAnchors(starter, measuredCatalog, "trixbrix:r40-triple-parallel", 2).anchors
      .length,
    0,
    "the parallel triple would occupy the adjacent required mainline",
  );
  const yard = {
    ...starter,
    items: [
      ...starter.items,
      ...Array.from({ length: 15 }, (_, index) => ({
        id: `yard-${index}`,
        kind: "track",
        layerId: "layout",
        partId: "lego:rc-s16",
        x: 8 + index * 16,
        y: 112,
        angle: 0,
        heightPlates: 2,
      })),
    ],
  };
  const anchors = findArrangementAnchors(
    yard,
    measuredCatalog,
    "trixbrix:r40-triple-parallel",
    2,
  ).anchors;
  assert.ok(anchors.some(({ replaceIds }) => replaceIds.includes("yard-3")));
});

test("R40 double crossover replaces matched straight runs on both mainlines", () => {
  const starter = createNiltcStarter(measuredCatalog, {
    width: 320,
    depth: 192,
    mode: "straight",
    fronts: ["north"],
  });
  const anchors = findArrangementAnchors(
    starter,
    measuredCatalog,
    "trixbrix:r40-double-crossover-kit",
    2,
  ).anchors;
  assert.ok(
    anchors.some(
      ({ replaceIds }) =>
        replaceIds.filter((id) => id.startsWith("outer-")).length === 3 &&
        replaceIds.filter((id) => id.startsWith("inner-")).length === 3,
    ),
  );
});
