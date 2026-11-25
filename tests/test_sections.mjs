import assert from "node:assert/strict";
import test from "node:test";

import { newProject, validateProject } from "../src/project.ts";

test("a member project owns one named design area and local track", () => {
  const project = newProject();
  project.name = "Member yard";
  project.area = {
    width: 192,
    depth: 128,
    fronts: ["north"],
    niltc: "straight",
    exits: [
      {
        id: "west-mainline",
        name: "West mainline",
        edge: "west",
        outer: { pieceId: "outer-1", portId: "a" },
        inner: { pieceId: "inner-1", portId: "a" },
      },
    ],
  };
  project.items.push(
    {
      id: "outer-1",
      kind: "track",
      partId: "lego:rc-s16",
      layerId: "layout",
      heightPlates: 2,
      x: 8,
      y: 8,
      angle: 0,
    },
    {
      id: "inner-1",
      kind: "track",
      partId: "lego:rc-s16",
      layerId: "layout",
      heightPlates: 2,
      x: 8,
      y: 24,
      angle: 0,
    },
  );

  validateProject(project);
  assert.equal("tables" in project, false);
  assert.equal(
    project.items.every((item) => !("tableId" in item)),
    true,
  );
});

test("the pre-production member format rejects table, seam, and baseplate records", () => {
  const project = newProject();
  const legacy = {
    version: 2,
    name: "Old show",
    layers: project.layers,
    tables: [],
    items: [],
    seams: [],
    sections: [],
    members: [],
  };
  assert.throws(() => validateProject(legacy), /project\.version/);

  project.items.push({
    id: "baseplate",
    kind: "baseplate",
    layerId: "layout",
    x: 16,
    y: 16,
    angle: 0,
  });
  assert.throws(() => validateProject(project), /track or unresolved/);
});
