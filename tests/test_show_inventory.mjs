import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseProject } from "../src/project.ts";
import { recipeFor, showInventory } from "../src/show_inventory.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));

function show() {
  const source = readFileSync(new URL("../examples/two-section.btp.json", import.meta.url), "utf8");
  const project = { ...JSON.parse(source), version: 2 };
  project.members = [
    { id: "casey", name: "Casey", bring: { "bricktracks:s08": 0 } },
    { id: "robin", name: "Robin", bring: { "lego:9v-s16": 2 } },
  ];
  project.sections = [
    { id: "west", name: "West", memberId: "casey", exits: [] },
    { id: "east", name: "East", memberId: "robin", exits: [] },
  ];
  project.tables[0].sectionId = "west";
  project.tables[1].sectionId = "east";
  return project;
}

function quantity(rows, key) {
  return rows.find((row) => row.key === key);
}

test("member counts follow attached sections and keep zero distinct from unconfirmed", () => {
  const project = show();
  project.layers.push({ id: "hidden", name: "Hidden", visible: false });
  project.tables[0].layerId = "hidden";
  const s8 = project.items.find(({ id }) => id === "inner-span");
  project.items.push({ ...s8, id: "hidden-s8", layerId: "hidden" });
  project.items.push({ ...s8, id: "loose-s8", tableId: undefined });
  s8.heightPlates = -4;

  const { members, unassigned, track } = showInventory(project, catalog);
  assert.equal(quantity(members[0].rows, "bricktracks:s08").required, 2);
  assert.equal(quantity(members[1].rows, "bricktracks:s08"), undefined);
  assert.equal(quantity(unassigned[0].rows, "bricktracks:s08").required, 1);
  assert.equal(unassigned[0].label, "Loose pieces");
  assert.equal(quantity(track, "bricktracks:s08").required, 3);
  assert.equal(quantity(members[1].rows, "lego:9v-s16").delta, 0);

  project.sections[1].memberId = "casey";
  const combined = showInventory(parseProject(JSON.stringify(project)), catalog);
  assert.deepEqual(
    combined.members[0].rows.map(({ key, required, committed, delta }) => [
      key,
      required,
      committed,
      delta,
    ]),
    [
      ["bricktracks:r104-right-body", 1, null, null],
      ["bricktracks:r104-stand", 1, null, null],
      ["bricktracks:s08", 2, 0, -2],
      ["lego:9v-s16", 7, null, null],
    ],
  );
  assert.equal(quantity(combined.members[1].rows, "lego:9v-s16").delta, 2);

  delete project.sections[1].memberId;
  const missing = showInventory(project, catalog);
  const east = missing.unassigned.find(({ label }) => label === "East");
  assert.equal(quantity(east.rows, "lego:9v-s16").required, 2);
});

test("published materials require opt-in and different track pieces report recipe gaps", () => {
  const project = show();
  const track = project.items[0];
  const { x, y, angle, layerId, tableId } = track;
  const tile = "ballast:3070:black";
  project.members[0].bring[tile] = 42;
  project.items = [
    { ...track, id: "bare", partId: "bricktracks:r104", countBallast: true, ballast: "bare" },
    { ...track, id: "gray", partId: "trixbrix:r104", countBallast: true, ballast: "gray" },
    { ...track, id: "display-only", partId: "bricktracks:r104", ballast: "pennlug" },
    { ...track, id: "no-recipe", partId: "4dbrix:r104", countBallast: true },
    { ...track, id: "unknown-track", partId: "unknown:track" },
    {
      x,
      y,
      angle,
      layerId,
      tableId,
      id: "unresolved-import",
      kind: "unresolved",
      sourceId: "missing-track",
      name: "Missing track",
      width: 8,
      depth: 8,
      reason: "No exact catalog match",
    },
  ];
  const report = showInventory(parseProject(JSON.stringify(project)), catalog);
  const recipe = recipeFor("bricktracks:r104");
  assert.ok(recipe);
  assert.equal(recipeFor("trixbrix:r104"), recipe);
  assert.equal(recipeFor("4dbrix:r104"), undefined);
  assert.deepEqual(
    Object.fromEntries(report.ballast.map(({ key, required }) => [key, required])),
    Object.fromEntries(
      recipe.materials.map(({ partId, color, quantity }) => [
        `ballast:${partId}:${color}`,
        quantity * 2,
      ]),
    ),
  );
  assert.equal(quantity(report.ballast, tile).required, 40);
  assert.equal(quantity(report.members[0].rows, tile).delta, 2);
  assert.deepEqual(
    report.unknown.map(({ key, required }) => [key, required]),
    [
      ["recipe:4dbrix:r104", 1],
      ["unknown:unknown:track", 1],
      ['unresolved:["missing-track","Missing track"]', 1],
    ],
  );
  assert.deepEqual(report.members[0].unknown, report.unknown);
  for (const { key, required } of report.ballast) {
    assert.equal(quantity(report.members[0].rows, key).required, required);
  }
  project.items.reverse();
  assert.deepEqual(showInventory(project, catalog), report);
});
