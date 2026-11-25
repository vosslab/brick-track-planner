import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const parts = new Map(catalog.parts.map((part) => [part.id, part]));
const kits = new Map(catalog.kits.map((kit) => [kit.id, kit]));
const jointGap = 0.05;
const jointAngle = 0.25;

function rotate(point, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function transform(port, pose) {
  const offset = rotate(port, pose.angle);
  return {
    ...port,
    x: pose.x + offset.x,
    y: pose.y + offset.y,
    angle: (((port.angle + pose.angle) % 360) + 360) % 360,
  };
}

function opposing(first, second) {
  const angle = Math.abs(((((first.angle - second.angle + 180) % 360) + 360) % 360) - 180);
  return (
    first.type === second.type &&
    Math.hypot(first.x - second.x, first.y - second.y) <= jointGap &&
    Math.abs(angle - 180) <= jointAngle
  );
}

function installedPorts(kit) {
  return kit.parts.flatMap((placement, piece) => {
    const part = parts.get(placement.partId);
    assert.ok(part, `${kit.id} references missing ${placement.partId}`);
    return part.ports.map((port) => ({ ...transform(port, placement), piece, portId: port.id }));
  });
}

function exteriorRails(ports) {
  return ports.filter(
    (port, index) =>
      port.type === "regular" &&
      !ports.some((other, otherIndex) => index !== otherIndex && opposing(port, other)),
  );
}

function endpointKey(endpoint) {
  return `${endpoint.piece}\u0000${endpoint.portId}`;
}

function installedLinks(kit, ports) {
  const links = [];
  for (const [piece, placement] of kit.parts.entries()) {
    const part = parts.get(placement.partId);
    for (const route of part.routes)
      links.push({
        kind: "internal",
        from: { piece, portId: route.from },
        to: { piece, portId: route.to },
      });
  }
  for (const [index, port] of ports.entries()) {
    for (const other of ports.slice(index + 1)) {
      if (opposing(port, other))
        links.push({
          kind: "joint",
          from: { piece: port.piece, portId: port.portId },
          to: { piece: other.piece, portId: other.portId },
        });
    }
  }
  return links;
}

function reaches(links, start, destination) {
  const neighbors = new Map();
  for (const link of links) {
    for (const [from, to] of [
      [link.from, link.to],
      [link.to, link.from],
    ]) {
      const choices = neighbors.get(endpointKey(from)) ?? [];
      choices.push({ endpoint: to, kind: link.kind });
      neighbors.set(endpointKey(from), choices);
    }
  }
  const pending = [{ endpoint: start, prior: undefined }];
  const seen = new Set([`${endpointKey(start)}\u0000start`]);
  while (pending.length) {
    const current = pending.shift();
    for (const next of neighbors.get(endpointKey(current.endpoint)) ?? []) {
      if (next.kind === current.prior) continue;
      if (endpointKey(next.endpoint) === endpointKey(destination)) return true;
      const state = `${endpointKey(next.endpoint)}\u0000${next.kind}`;
      if (seen.has(state)) continue;
      seen.add(state);
      pending.push({ endpoint: next.endpoint, prior: next.kind });
    }
  }
  return false;
}

function verifyKit(id, partCount, exteriorCount, pairs) {
  const kit = kits.get(id);
  assert.ok(kit, `${id} exists`);
  assert.equal(kit.parts.length, partCount, `${id} physical part count`);
  const ports = installedPorts(kit);
  assert.equal(exteriorRails(ports).length, exteriorCount, `${id} exposed regular rail ends`);
  const links = installedLinks(kit, ports);
  for (const [from, to] of pairs)
    assert.ok(
      reaches(links, from, to),
      `${id} routes ${from.piece}/${from.portId} to ${to.piece}/${to.portId}`,
    );
}

test("R40 right rail yard joins seven physical parts into four parking routes", () => {
  verifyKit("trixbrix:r40-right-yard-4", 7, 5, [
    [
      { piece: 0, portId: "common" },
      { piece: 0, portId: "through" },
    ],
    [
      { piece: 0, portId: "common" },
      { piece: 2, portId: "branch" },
    ],
    [
      { piece: 0, portId: "common" },
      { piece: 5, portId: "a" },
    ],
    [
      { piece: 0, portId: "common" },
      { piece: 6, portId: "a" },
    ],
  ]);
});

test("R104 double crossover joins fourteen physical parts into four selectable routes", () => {
  verifyKit("trixbrix:r104-double-crossover-kit", 14, 4, [
    [
      { piece: 1, portId: "common" },
      { piece: 4, portId: "common" },
    ],
    [
      { piece: 1, portId: "common" },
      { piece: 10, portId: "common" },
    ],
    [
      { piece: 7, portId: "common" },
      { piece: 4, portId: "common" },
    ],
    [
      { piece: 7, portId: "common" },
      { piece: 10, portId: "common" },
    ],
  ]);
});

test("the R104 triple connects its common end to all three branches", () => {
  verifyKit(
    "trixbrix:r104-triple-kit",
    5,
    4,
    [
      { piece: 2, portId: "through" },
      { piece: 3, portId: "branch" },
      { piece: 4, portId: "branch" },
    ].map((exit) => [{ piece: 0, portId: "a" }, exit]),
  );
});

test("R56 pass-through has three independent crossing paths and six installed exits", () => {
  const body = parts.get("trixbrix:r56-double-pass-through");
  assert.deepEqual(
    body.routes.map(({ from, to }) => [from, to]),
    [
      ["center-west", "center-east"],
      ["west-north", "east-south"],
      ["west-south", "east-north"],
    ],
  );
  verifyKit("trixbrix:r56-double-pass-through-complete", 11, 6, [
    [
      { piece: 4, portId: "a" },
      { piece: 5, portId: "b" },
    ],
    [
      { piece: 0, portId: "common" },
      { piece: 3, portId: "common" },
    ],
    [
      { piece: 1, portId: "common" },
      { piece: 2, portId: "common" },
    ],
  ]);
  const kit = kits.get("trixbrix:r56-double-pass-through-complete");
  const links = installedLinks(kit, installedPorts(kit));
  assert.equal(
    reaches(links, { piece: 4, portId: "a" }, { piece: 0, portId: "common" }),
    false,
    "the center route does not enter a crossover route",
  );
});

test("R40 triple switch exposes its installed three-way routes", () => {
  verifyKit("trixbrix:r40-triple", 5, 4, [
    [
      { piece: 0, portId: "common" },
      { piece: 2, portId: "b" },
    ],
    [
      { piece: 0, portId: "common" },
      { piece: 0, portId: "through" },
    ],
    [
      { piece: 0, portId: "common" },
      { piece: 4, portId: "a" },
    ],
  ]);
});

test("R40 double crossover keeps its measured route body and five-element bill", () => {
  verifyKit("trixbrix:r40-double-crossover-kit", 1, 4, [
    [
      { piece: 0, portId: "south-left" },
      { piece: 0, portId: "north-left" },
    ],
    [
      { piece: 0, portId: "south-right" },
      { piece: 0, portId: "north-right" },
    ],
    [
      { piece: 0, portId: "south-left" },
      { piece: 0, portId: "north-right" },
    ],
    [
      { piece: 0, portId: "south-right" },
      { piece: 0, portId: "north-left" },
    ],
  ]);
  assert.deepEqual(parts.get("trixbrix:r40-double-crossover").inventory, [
    {
      id: "trixbrix:r40-double-crossover-switch-section",
      name: "TrixBrix R40 double-crossover switch section",
      quantity: 4,
    },
    {
      id: "trixbrix:r40-double-crossover-center",
      name: "TrixBrix R40 double-crossover center",
      quantity: 1,
    },
  ]);
});

test("R104 four-track yard remains a measured 35-piece installed assembly", () => {
  const kit = kits.get("trixbrix:r104-right-yard-4");
  assert.ok(kit, "R104 yard exists");
  assert.equal(kit.parts.length, 35);
  assert.equal(exteriorRails(installedPorts(kit)).length, 5, "entrance plus four storage exits");
  const links = installedLinks(kit, installedPorts(kit));
  for (const [piece, portId] of [
    [17, "b"],
    [27, "a"],
    [32, "b"],
    [34, "a"],
  ])
    assert.ok(
      reaches(links, { piece: 0, portId: "common" }, { piece, portId }),
      `routes entrance to ${piece}/${portId}`,
    );
});
