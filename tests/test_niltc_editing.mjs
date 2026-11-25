import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { commitItems } from "../src/arrangements.ts";
import { newProject } from "../src/project.ts";
import { traceRoute } from "../src/route_trace.ts";

const catalog = {
  parts: [
    {
      id: "test:straight",
      brand: "Test",
      name: "Straight",
      ports: [],
      paths: [],
      routes: [],
      footprint: [
        { x: -8, y: -4 },
        { x: 8, y: -4 },
        { x: 8, y: 4 },
        { x: -8, y: 4 },
      ],
    },
  ],
  kits: [],
};

test("area fit rejects a track that would leave the member design area", () => {
  const project = newProject();
  project.area.width = 32;
  project.area.depth = 32;
  const result = commitItems(project, catalog, {
    items: [
      {
        id: "outside",
        kind: "track",
        partId: "test:straight",
        layerId: "layout",
        heightPlates: 0,
        x: 29,
        y: 16,
        angle: 0,
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.project, undefined);
  assert.deepEqual(
    result.issues.map(({ kind }) => kind),
    ["outside-area"],
  );
  assert.deepEqual(project.items, []);
});

test("a fitted arrangement changes the project only after it passes its area check", () => {
  const project = newProject();
  project.area.width = 32;
  project.area.depth = 32;
  const result = commitItems(project, catalog, {
    items: [
      {
        id: "inside",
        kind: "track",
        partId: "test:straight",
        layerId: "layout",
        heightPlates: 0,
        x: 16,
        y: 16,
        angle: 0,
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.project?.items.map(({ id }) => id),
    ["inside"],
  );
  assert.deepEqual(project.items, []);
});

test("the R56 double pass-through keeps its center and two diagonal routes isolated", () => {
  const catalog = JSON.parse(
    readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"),
  );
  const part = catalog.parts.find(({ id }) => id === "trixbrix:r56-double-pass-through");
  assert.ok(part, "the planning catalog includes the R56 double pass-through");
  const links = part.routes.map(({ from, to, ...route }) => ({
    from: { pieceId: "r56", portId: from },
    to: { pieceId: "r56", portId: to },
    kind: "internal",
    ...route,
  }));
  const endpoint = (portId) => ({ pieceId: "r56", portId });

  assert.deepEqual(traceRoute(links, endpoint("center-west"), endpoint("center-east")), [links[0]]);
  assert.deepEqual(traceRoute(links, endpoint("west-north"), endpoint("east-south")), [links[1]]);
  assert.deepEqual(traceRoute(links, endpoint("west-south"), endpoint("east-north")), [links[2]]);
  assert.equal(traceRoute(links, endpoint("center-west"), endpoint("west-north")), undefined);
  assert.equal(traceRoute(links, endpoint("west-north"), endpoint("west-south")), undefined);
});
