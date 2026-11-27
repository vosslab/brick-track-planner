import assert from "node:assert/strict";
import test from "node:test";

import catalog from "../data/catalog.json" with { type: "json" };
import { openTrackPlan, saveTrackPlan } from "../src/ldraw.ts";
import { newProject } from "../src/project.ts";
import { diagnosticsFor } from "../src/editor_panels.ts";
import { recipeFor, showInventory } from "../src/show_inventory.ts";

function track(id, partId, groupId) {
  return {
    kind: "track",
    id,
    partId,
    layerId: "layout",
    x: 0,
    y: 0,
    angle: 0,
    heightPlates: 0,
    groupId,
  };
}

test("member inventory counts only visible physical track and keeps an arrangement together", () => {
  const project = newProject();
  const straight = catalog.parts.find((part) => part.ports.length === 2);
  assert.ok(straight);
  project.items.push(track("one", straight.id, "yard"), track("two", straight.id, "yard"));
  project.layers.push({ id: "hidden", name: "Hidden", visible: false });
  project.items.push({ ...track("hidden", straight.id), layerId: "hidden" });
  const report = showInventory(project, catalog);
  assert.deepEqual(report.track, [
    { key: straight.id, label: `${straight.brand} ${straight.name}`, required: 2 },
  ]);
  assert.equal(report.groups.length, 1);
  assert.equal(report.groups[0].rows[0].required, 2);
  assert.deepEqual(report.buildReferences, []);
});

test("unknown imports and missing ballast recipes remain visible in the member handoff", () => {
  const project = newProject();
  const straight = catalog.parts.find((part) => part.ports.length === 2);
  assert.ok(straight);
  project.items.push({ ...track("recipe", straight.id), countBallast: true });
  project.items.push({
    kind: "unresolved",
    id: "imported",
    layerId: "layout",
    x: 0,
    y: 0,
    angle: 0,
    sourceId: "vendor:unknown",
    name: "Unknown switch",
    width: 8,
    depth: 16,
    reason: "No catalog geometry",
  });
  const report = showInventory(project, catalog);
  assert.ok(report.unknown.some((row) => row.key.startsWith("unresolved:")));
  if (!recipeFor(straight.id))
    assert.ok(report.unknown.some((row) => row.key.startsWith("recipe:")));
});

test("inventory survives saving and reopening the track plan", () => {
  const project = newProject();
  const straight = catalog.parts.find((part) => part.ports.length === 2);
  assert.ok(straight);
  project.items.push(track("one", straight.id, "yard"));
  assert.deepEqual(
    showInventory(openTrackPlan(saveTrackPlan(project, catalog), catalog), catalog),
    showInventory(project, catalog),
  );
});

test("L-Gauge right switch references attach only to the genuine LEGO return arrangement", () => {
  const project = newProject();
  const straight = catalog.parts.find((part) => part.ports.length === 2);
  assert.ok(straight);
  project.items.push({
    ...track("switch-return", straight.id, "return"),
    arrangementId: "lego:rc-r40-right-switch-return",
  });
  const report = showInventory(project, catalog);
  assert.deepEqual(
    report.buildReferences.map(({ title }) => title),
    ["L-Gauge Ballasted Right Switch", "L-Gauge Ballasted Right Switch Return Curve"],
  );
  project.items[0].arrangementId = "trixbrix:r104-right-yard-4";
  assert.deepEqual(showInventory(project, catalog).buildReferences, []);
});

test("member diagnostics explain protected handoffs without raw issue codes", () => {
  const project = newProject();
  project.area.niltc = "corner";
  project.area.fronts = ["north", "west"];
  project.area.exits = [
    {
      id: "east",
      name: "East handoff",
      edge: "east",
      outer: { pieceId: "missing", portId: "a" },
      inner: { pieceId: "missing", portId: "b" },
    },
  ];
  const messages = diagnosticsFor({
    project,
    ports: [],
    routes: [],
    overhangs: [],
    unresolved: [],
    niltcIssues: [
      { kind: "missing-mainline", lane: "outer" },
      { kind: "exit-off-standard", lane: "inner", exitId: "east" },
      {
        kind: "mainline-event-spacing",
        lane: "outer",
        previousItemId: "first",
        itemId: "second",
        requiredStuds: 16,
        actualStuds: 16,
      },
    ],
  });
  assert.match(messages[0].message, /continuous route/);
  assert.match(messages[0].message, /R120 outside and R104 inside/);
  assert.match(messages[1].message, /East handoff/);
  assert.match(messages[2].message, /16 studs/);
  assert.match(messages[2].message, /private yard routes/);
  assert.doesNotMatch(
    messages.map(({ message }) => message).join("\n"),
    /missing-mainline|exit-off-standard/,
  );
  assert.equal(messages[1].targetId, "missing");
});
