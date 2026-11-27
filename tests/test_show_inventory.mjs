import assert from "node:assert/strict";
import test from "node:test";

import catalog from "../data/catalog.json" with { type: "json" };
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

test("unknown imports and missing ballast recipes remain visible in the member inventory", () => {
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

test("diagnostics report imported track without usable geometry", () => {
  const project = newProject();
  const messages = diagnosticsFor({
    project,
    ports: [],
    routes: [],
    overhangs: [],
    unresolved: [{ id: "imported", name: "Unknown switch", sourceId: "vendor:unknown" }],
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /Unknown switch/);
  assert.match(messages[0].message, /vendor:unknown/);
  assert.equal(messages[0].targetId, "imported");
});
