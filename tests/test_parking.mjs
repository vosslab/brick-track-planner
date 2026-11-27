import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createParkingKits, withParkingKits } from "../src/parking.ts";
import { findArrangementAnchors } from "../src/arrangement_anchors.ts";
import { createNiltcStarter } from "../src/niltc_starters.ts";
import { composePose } from "../src/project.ts";
import { traceRoute } from "../src/route_trace.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));

function railGraph(kit) {
  const links = [];
  const ports = kit.parts.flatMap((placement, i) => {
    const part = catalog.parts.find((entry) => entry.id === placement.partId);
    const endpoint = (portId) => ({ pieceId: String(i), portId });
    for (const route of part.routes)
      links.push({ from: endpoint(route.from), to: endpoint(route.to), kind: "internal" });
    return part.ports.map((port) => ({ ...endpoint(port.id), ...composePose(port, placement) }));
  });
  const ends = [];
  for (const port of ports) {
    const mates = ports.filter(
      (other) =>
        port.pieceId !== other.pieceId &&
        Math.hypot(port.x - other.x, port.y - other.y) < 0.05 &&
        Math.abs(((port.angle - other.angle + 1080) % 360) - 180) < 0.25,
    );
    assert.ok(mates.length <= 1);
    if (!mates.length) ends.push(port);
    else if (mates[0].pieceId < port.pieceId)
      links.push({ from: port, to: mates[0], kind: "joint" });
  }
  return { ends, links, ports };
}

for (const length of [0, 32, 64, 96]) {
  test(`parking with ${length} studs of storage reconnects at real rail ports`, () => {
    const [back, through] = createParkingKits(catalog, length);
    const terminal = railGraph(back);
    assert.deepEqual(
      terminal.ends.map((p) => [Math.round(p.x), Math.round(p.y) || 0]),
      [
        [0, 0],
        [32, 0],
        [48 + length, 16],
      ],
    );
    assert.ok(traceRoute(terminal.links, terminal.ends[0], terminal.ends[2])?.length);
    const loop = railGraph(through);
    assert.deepEqual(
      loop.ends.map((p) => [Math.round(p.x), Math.round(p.y) || 0]),
      [
        [0, 0],
        [96 + length, 0],
      ],
    );
    const storage = loop.ports.find((p) => Math.abs(p.x - 48) < 0.05 && Math.abs(p.y - 16) < 0.05);
    for (const entrance of loop.ends) assert.ok(traceRoute(loop.links, entrance, storage)?.length);
    const mainline = traceRoute(loop.links, ...loop.ends);
    assert.ok(mainline?.length);
    // Either path remains available after removing the other from the route graph.
    for (const portId of ["branch", "through"]) {
      const alternatives = loop.links.filter(
        (link) =>
          !(link.kind === "internal" && link.from.pieceId === "0" && link.to.portId === portId),
      );
      assert.ok(traceRoute(alternatives, ...loop.ends)?.length);
    }
  });
}

test("both mainline entrances reach all four tracks in the double-ended yard", () => {
  for (const length of [32, 64]) {
    const kit = createParkingKits(catalog, length).find(
      (kit) => kit.id === "parking:r40-four-track-drive-through",
    );
    assert.ok(kit.parts.some(({ partId }) => partId === "lego:rc-s16"));
    assert.equal(
      kit.parts.some(({ partId }) => partId === "trixbrix:s16"),
      false,
    );
    const { ends, links, ports } = railGraph(kit);
    assert.equal(ends.length, 2);
    assert.ok(Math.abs(ends[0].y - ends[1].y) < 0.05);
    assert.ok(Math.abs(Math.abs(ends[0].x - ends[1].x) - (192 + length)) < 0.05);
    for (const offset of [0, 16, 32, 48]) {
      const track = ports.find(
        (p) => Math.abs(p.x - 80) < 0.05 && Math.abs(p.y - ends[0].y - offset) < 0.05,
      );
      assert.ok(track);
      for (const entrance of ends) assert.ok(traceRoute(links, entrance, track)?.length);
    }
  }
});

test("rear parking returns behind a 60 by 40 display but not a 60 by 30 display", () => {
  const rear = createParkingKits(catalog, 64).find((kit) => kit.id === "parking:r40-rear-siding");
  assert.ok(rear);
  const graph = railGraph(rear);
  assert.deepEqual(
    graph.ends.map((port) => [Number(port.x.toFixed(2)), Number(port.y.toFixed(2))]),
    [
      [0, 0],
      [32, 0],
      [-46.61, 89.91],
    ],
  );
  assert.ok(traceRoute(graph.links, graph.ends[0], graph.ends[1]), "the mainline remains direct");
  assert.ok(traceRoute(graph.links, graph.ends[0], graph.ends[2]), "the rear storage is reachable");

  const parkingCatalog = withParkingKits(catalog, 64);
  const area = (depth) =>
    createNiltcStarter(parkingCatalog, {
      width: 192,
      depth,
      mode: "straight",
      fronts: ["north"],
    });
  const anchors = findArrangementAnchors(area(128), parkingCatalog, rear.id, 2).anchors;
  assert.ok(anchors.some(({ pose }) => pose.x === 48 && pose.y === 24 && pose.angle === 0));
  assert.equal(findArrangementAnchors(area(96), parkingCatalog, rear.id, 2).anchors.length, 0);
});
