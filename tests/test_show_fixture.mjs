import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { composePose, parseProject, worldPose } from "../src/project.ts";
import { parseSectionBundle } from "../src/section_files.ts";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const { parts } = JSON.parse(read("../data/catalog.json"));
const show = parseProject(read("../examples/whole_show.btp.json"));

function portLayout(project) {
  const pieces = project.items.filter(({ kind }) => kind === "track");
  const portsByPiece = new Map(
    pieces.map((piece) => {
      const part = parts.find(({ id }) => id === piece.partId);
      assert.ok(part, piece.partId);
      const pose = worldPose(piece, project.tables);
      const ports = part.ports.map((port) => ({
        ...composePose(port, pose),
        portId: port.id,
        pieceId: piece.id,
        type: port.type,
        heightPlates: piece.heightPlates,
      }));
      return [piece.id, ports];
    }),
  );
  const ports = [...portsByPiece.values()].flat();

  function get({ pieceId, portId }) {
    const port = portsByPiece.get(pieceId)?.find((port) => port.portId === portId);
    assert.ok(port, `${pieceId}/${portId}`);
    return port;
  }

  function matches(source) {
    return ports.filter(
      (candidate) =>
        candidate.pieceId !== source.pieceId &&
        candidate.type === source.type &&
        candidate.heightPlates === source.heightPlates &&
        Math.hypot(candidate.x - source.x, candidate.y - source.y) < 1e-6 &&
        Math.abs(Math.abs(candidate.angle - source.angle) - 180) < 1e-6,
    );
  }

  function followMainline(start) {
    const visited = new Set();
    let current = start;
    do {
      assert.ok(!visited.has(current.pieceId), `Loop revisits ${current.pieceId} too early`);
      visited.add(current.pieceId);
      const onward = portsByPiece
        .get(current.pieceId)
        .filter((port) => port !== current && port.portId !== "branch");
      assert.equal(onward.length, 1, current.pieceId);
      const next = matches(onward[0]);
      assert.equal(next.length, 1, `${onward[0].pieceId}/${onward[0].portId}`);
      [current] = next;
    } while (current !== start);
    return visited;
  }

  return { ports, get, matches, followMainline };
}

test("every shipped bundle opens at its anchor with two named external exits", () => {
  for (const [file, name, tableCount] of [
    ["corner", "Corner", 1],
    ["yard", "Yard", 1],
    ["connector", "Connector", 1],
    ["siding", "Siding", 2],
  ]) {
    const { section, anchorTableId, project } = parseSectionBundle(
      read(`../examples/${file}.btps.json`),
    );
    const [definition] = project.sections;
    const anchor = project.tables.find(({ id }) => id === anchorTableId);
    assert.deepEqual([anchor.x, anchor.y, anchor.angle], [0, 0, 0]);
    assert.equal(section.name, name);
    assert.equal(project.tables.length, tableCount);
    assert.equal(project.seams.length, tableCount - 1);
    assert.equal(definition.exits.length, 2);
    const { get } = portLayout(project);
    for (const exit of definition.exits) {
      assert.ok(exit.name);
      for (const lane of ["outer", "inner"]) assert.equal(get(exit[lane]).type, "regular");
    }
  }
});

test("the show has two disjoint closed mainlines and one open siding end", () => {
  assert.equal(show.sections.length, 7);
  assert.equal(show.tables.length, 8);
  assert.deepEqual([show.venue.width, show.venue.depth], [576, 320]);
  for (const table of show.tables) assert.deepEqual([table.width, table.depth], [128, 128]);

  const { ports, get, matches, followMainline } = portLayout(show);
  const start = show.sections
    .find(({ id }) => id === "northwest")
    .exits.find(({ edge }) => edge === "south");
  const outer = followMainline(get(start.outer));
  const inner = followMainline(get(start.inner));
  assert.equal(outer.size, 48);
  assert.equal(inner.size, 64);
  assert.ok([...outer].every((id) => !inner.has(id)));
  for (const route of [outer, inner]) {
    const tables = new Set(
      show.items.filter(({ id }) => route.has(id)).map(({ tableId }) => tableId),
    );
    assert.equal(tables.size, 8);
  }

  assert.deepEqual(
    ports
      .filter((port) => matches(port).length !== 1)
      .map(({ pieceId, portId }) => [pieceId, portId]),
    [["siding-east-branch-end", "b"]],
  );
  assert.equal(show.seams.length, 8);
  for (const { outer, inner } of show.seams) {
    for (const { a, b } of [outer, inner]) assert.deepEqual(matches(get(a)), [get(b)]);
  }

  const seam = show.seams.find(({ id }) => id === "yard-connector");
  assert.deepEqual([get(seam.outer.a).x, get(seam.outer.a).y], [288, 40]);
  assert.deepEqual([get(seam.inner.a).x, get(seam.inner.a).y], [296, 56]);
  const supply = show.items.find(({ id }) => id === seam.inner.a.pieceId);
  assert.deepEqual([supply.partId, supply.tableId], ["bricktracks:s08", "yard"]);
});

test("Yard and Siding share a member with combined piece requirements", () => {
  const owner = show.members.find(({ id }) => id === "elodie");
  const sections = show.sections.filter(({ memberId }) => memberId === owner.id);
  assert.deepEqual(
    sections.map(({ id }) => id),
    ["yard", "siding"],
  );
  const tableIds = show.tables
    .filter(({ sectionId }) => sections.some(({ id }) => id === sectionId))
    .map(({ id }) => id);
  const items = show.items.filter(({ tableId }) => tableIds.includes(tableId));
  const trackTotal = (partId) => items.filter((item) => item.partId === partId).length;
  assert.equal(trackTotal("lego:9v-s16"), 22);
  assert.equal(trackTotal("bricktracks:s08"), 2);
  assert.equal(owner.bring["lego:9v-s16"], 21);
  assert.equal(owner.bring["bricktracks:s08"], 1);
});
