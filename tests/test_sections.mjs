import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { composePose, localPose, newProject, parseProject, worldPose } from "../src/project.ts";
import { exportSection, importSection, parseSectionBundle } from "../src/section_files.ts";
import {
  deleteSection,
  findSectionExit,
  moveSection,
  previewSectionAlignment,
  removeSectionExit,
  saveSectionExit,
  sectionExitPort,
  sectionTables,
} from "../src/sections.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const catalog = JSON.parse(read("../data/catalog.json"));
const fixture = () => parseProject(read("../examples/whole_show.btp.json"));

function worldPorts(project) {
  return project.items.flatMap((item) => {
    const part = catalog.parts.find(({ id }) => id === item.partId);
    return (part?.ports ?? []).map((port) => ({
      ...composePose(port, worldPose(item, project.tables)),
      pieceId: item.id,
      portId: port.id,
      type: port.type,
      heightPlates: item.heightPlates,
    }));
  });
}

function expectPose(actual, expected) {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-9);
  assert.ok(Math.abs((actual.angle - expected.angle) % 360) < 1e-9);
}

test("a rigid section move preserves table spacing, local pieces, and all seam definitions", () => {
  const project = fixture();
  const [anchor, next] = sectionTables(project, "siding");
  const moved = moveSection(project, "siding", anchor, { x: 20, y: 30, angle: anchor.angle + 90 });
  const [movedAnchor, movedNext] = sectionTables(moved, "siding");
  expectPose(movedAnchor, { x: 20, y: 30, angle: anchor.angle + 90 });
  expectPose(localPose(movedNext, movedAnchor), localPose(next, anchor));
  assert.equal(moved.items, project.items);
  assert.equal(moved.seams, project.seams);
  assert.equal(
    moved.tables.find(({ id }) => id === "yard"),
    project.tables.find(({ id }) => id === "yard"),
  );

  const removed = deleteSection(moved, "siding");
  assert.equal(removed.tables.length, project.tables.length - 2);
  assert.ok(!removed.items.some(({ tableId }) => tableId === next.id || tableId === anchor.id));
  assert.ok(!removed.seams.some(({ id }) => id === "siding-middle"));
  assert.ok(removed.seams.some(({ id }) => id === "siding-southwest"));
  assert.deepEqual(parseProject(JSON.stringify(removed)), removed);
});

test("portable bundles re-anchor tables and isolate repeated copies and missing seam references", () => {
  const source = fixture();
  const [anchor, second] = sectionTables(source, "siding");
  const attached = source.items.find(({ tableId }) => tableId === anchor.id);
  source.layers.push(
    { id: "hidden-section-layer", name: "Hidden section track", visible: false },
    { id: "unused", name: "Unused", visible: true },
  );
  attached.layerId = "hidden-section-layer";
  source.items.push({
    kind: "baseplate",
    id: "loose-baseplate",
    layerId: "unused",
    x: 0,
    y: 0,
    angle: 0,
  });
  const internal = source.seams.find(({ id }) => id === "siding-middle");
  internal.outer.a.pieceId = "missing-piece";
  internal.exitAId = "missing-exit";

  const { bundle, warnings } = exportSection(source, "siding", second.id);
  assert.match(warnings.join(""), /1 loose/);
  assert.deepEqual(bundle.project.members, []);
  assert.equal(bundle.project.venue, undefined);
  assert.equal(bundle.project.sections[0].memberId, undefined);
  assert.equal(bundle.project.seams.length, 1);
  assert.deepEqual(
    bundle.project.layers.map(({ id }) => id),
    ["layout", "hidden-section-layer"],
  );
  assert.deepEqual(bundle, parseSectionBundle(JSON.stringify(bundle)));
  expectPose(
    bundle.project.tables.find(({ id }) => id === second.id),
    { x: 0, y: 0, angle: 0 },
  );
  expectPose(
    bundle.project.tables.find(({ id }) => id === anchor.id),
    localPose(anchor, second),
  );
  assert.deepEqual(
    bundle.project.items.find(({ id }) => id === attached.id),
    attached,
  );

  const target = newProject();
  target.members.push({ id: "existing", name: bundle.section.ownerName.toLowerCase(), bring: {} });
  let id = 0;
  const makeId = (prefix) => `${prefix}-${++id}`;
  const firstCopy = importSection(target, bundle, { x: 300, y: 150, angle: 45 }, makeId);
  const firstOwner = firstCopy.project.members.find(
    ({ name }) => name === bundle.section.ownerName,
  );
  assert.deepEqual(firstOwner.bring, {});
  assert.equal(firstCopy.project.members.length, 2);
  firstOwner.bring["lego:9v-s16"] = 5;
  const secondCopy = importSection(
    firstCopy.project,
    bundle,
    { x: 500, y: 350, angle: 180 },
    makeId,
  );
  const added = secondCopy.project.sections;
  assert.notEqual(added[0].id, added[1].id);
  assert.notEqual(added[0].exits[0].id, added[1].exits[0].id);
  assert.equal(added[0].memberId, added[1].memberId);
  assert.equal(
    secondCopy.project.members.find(({ id }) => id === firstOwner.id).bring["lego:9v-s16"],
    5,
  );
  const [firstSeam, secondSeam] = secondCopy.project.seams;
  assert.notEqual(firstSeam.id, secondSeam.id);
  assert.notEqual(firstSeam.exitAId, secondSeam.exitAId);
  assert.notEqual(firstSeam.outer.a.pieceId, secondSeam.outer.a.pieceId);
  assert.notEqual(firstSeam.outer.a.pieceId, "missing-piece");
  assert.ok(!secondCopy.project.items.some(({ id }) => id === firstSeam.outer.a.pieceId));
  assert.ok(firstCopy.tableIds.includes(firstSeam.tableB));
  assert.ok(secondCopy.tableIds.includes(secondSeam.tableB));
  const firstAnchor = secondCopy.project.tables.find(({ id }) => id === firstCopy.tableIds[1]);
  const secondAnchor = secondCopy.project.tables.find(({ id }) => id === secondCopy.tableIds[1]);
  expectPose(firstAnchor, { x: 300, y: 150, angle: 45 });
  expectPose(secondAnchor, { x: 500, y: 350, angle: 180 });
  assert.notEqual(firstAnchor.layerId, secondAnchor.layerId);
  assert.equal(target.tables.length, 0);

  const malformed = structuredClone(bundle);
  malformed.project.tables.find(({ id }) => id === bundle.anchorTableId).x = 2;
  assert.throws(() => parseSectionBundle(JSON.stringify(malformed)), /anchor table/);
});

test("named alignment uses both physical lanes and does not rewrite other seams", () => {
  const original = fixture();
  const [receiving] = sectionTables(original, "connector");
  const shifted = moveSection(original, "connector", receiving, {
    ...receiving,
    x: receiving.x + 2,
  });
  const ports = worldPorts(shifted);
  const a = findSectionExit(shifted, "yard-east");
  const b = findSectionExit(shifted, "connector-west");
  const before = { project: shifted, ports, niltcIssues: [] };
  const joined = { status: "joined" };
  const run = (next, inner = joined) => {
    const seam = next.seams.find(({ id }) => id === "yard-connector");
    const placed = worldPorts(next);
    const readPort = ({ pieceId, portId }) =>
      placed.find((port) => port.pieceId === pieceId && port.portId === portId);
    for (const lane of ["outer", "inner"]) {
      const first = readPort(seam[lane].a);
      const second = readPort(seam[lane].b);
      expectPose(first, { ...second, angle: second.angle + 180 });
    }
    assert.equal(readPort(seam.inner.a).x - readPort(seam.outer.a).x, 8);
    return { project: next, seams: [{ id: seam.id, outer: joined, inner }], niltcIssues: [] };
  };
  const propose = (start, getAnalysis) =>
    previewSectionAlignment(start, a.exit.id, b.exit.id, getAnalysis, () =>
      assert.fail("Existing seam ID must be kept."),
    );

  const result = propose(before, run);
  assert.equal(result.valid, true);
  assert.equal(result.analysis.project.tables.find(({ id }) => id === receiving.id).x, receiving.x);
  assert.equal(result.analysis.project.items, shifted.items);
  assert.deepEqual(result.analysis.project.seams, shifted.seams);
  assert.equal(propose(before, (next) => run(next, { status: "misaligned" })).valid, false);
  assert.throws(
    () => previewSectionAlignment(before, "yard-west", "yard-east", run, () => "new"),
    /different sections/,
  );
  assert.throws(
    () => previewSectionAlignment(before, "yard-west", "connector-west", run, () => "new"),
    /already connected/,
  );

  const raised = ports.map((port) =>
    port.pieceId === b.exit.inner.pieceId ? { ...port, heightPlates: port.heightPlates + 1 } : port,
  );
  const mismatch = propose({ ...before, ports: raised }, (next) => run(next, { status: "height" }));
  assert.equal(mismatch.valid, false);
  assert.match(mismatch.issues.join(""), /Inner connector heights/);

  const offStandard = {
    kind: "exit-off-standard",
    tableId: a.exit.tableId,
    exitId: a.exit.id,
    lane: "inner",
  };
  const outside = propose({ ...before, niltcIssues: [offStandard] }, run);
  assert.equal(outside.valid, false);
  assert.match(outside.issues.join(""), /Yard.*inner lane/);
});

test("a named exit can repair a missing spanning S8 and preserve the flat seam", () => {
  const project = fixture();
  const { section, exit } = findSectionExit(project, "yard-east");
  const index = project.items.findIndex(({ id }) => id === exit.inner.pieceId);
  const [missing] = project.items.splice(index, 1);
  const analysis = { project, ports: worldPorts(project) };
  assert.equal(sectionExitPort(analysis, exit, "inner"), undefined);
  const replacement = { ...missing, id: "new-span" };
  project.items.push(replacement);
  const inner = { ...exit.inner, pieceId: replacement.id };
  saveSectionExit(project, section.id, { ...exit, inner });
  const seam = project.seams.find(({ id }) => id === "yard-connector");
  assert.deepEqual(seam.inner.a, inner);
  assert.equal(seam.exitAId, exit.id);
  const repaired = sectionExitPort(
    { project, ports: worldPorts(project) },
    { ...exit, inner },
    "inner",
  );
  assert.equal(repaired.x, 296);

  removeSectionExit(project, exit.id);
  assert.equal(seam.exitAId, undefined);
  assert.equal(seam.exitBId, "connector-west");
  assert.deepEqual(seam.inner.a, inner);
});
