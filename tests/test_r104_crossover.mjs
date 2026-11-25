import assert from "node:assert/strict";
import test from "node:test";
import catalog from "../data/catalog.json" with { type: "json" };

const parts = new Map(catalog.parts.map((part) => [part.id, part]));
const rotate = (point, angle) => {
  const radians = (angle * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
};
const transform = (port, pose) => {
  const offset = rotate(port, pose.angle);
  return {
    ...port,
    x: pose.x + offset.x,
    y: pose.y + offset.y,
    angle: (((port.angle + pose.angle) % 360) + 360) % 360,
  };
};
const key = ({ piece, portId }) => `${piece}\u0000${portId}`;

function physicalLinks(kit) {
  const ports = kit.parts.flatMap((pose, piece) =>
    parts
      .get(pose.partId)
      .ports.map((port) => ({ ...transform(port, pose), piece, portId: port.id })),
  );
  const links = kit.parts.flatMap((pose, piece) =>
    parts.get(pose.partId).routes.map((route) => ({
      kind: "internal",
      from: { piece, portId: route.from },
      to: { piece, portId: route.to },
    })),
  );
  for (const [index, port] of ports.entries())
    for (const other of ports.slice(index + 1)) {
      const turn = Math.abs(((((port.angle - other.angle + 180) % 360) + 360) % 360) - 180);
      if (
        port.type === other.type &&
        Math.hypot(port.x - other.x, port.y - other.y) <= 1e-6 &&
        Math.abs(turn - 180) <= 1e-6
      ) {
        links.push({ kind: "joint", from: port, to: other });
      }
    }
  return { ports, links };
}

function traces(links, start, target) {
  const neighbors = new Map();
  for (const link of links)
    for (const [from, to] of [
      [link.from, link.to],
      [link.to, link.from],
    ]) {
      neighbors.set(key(from), [...(neighbors.get(key(from)) ?? []), { ...link, next: to }]);
    }
  const pending = [{ endpoint: start, prior: undefined }];
  const seen = new Set();
  while (pending.length) {
    const current = pending.shift();
    if (key(current.endpoint) === key(target)) return true;
    for (const link of neighbors.get(key(current.endpoint)) ?? []) {
      if (link.kind === current.prior) continue;
      const state = `${key(link.next)}\u0000${link.kind}`;
      if (!seen.has(state)) {
        seen.add(state);
        pending.push({ endpoint: link.next, prior: link.kind });
      }
    }
  }
  return false;
}

test("the R104 double crossover stays a measured fourteen-piece assembly", () => {
  const kit = catalog.kits.find((entry) => entry.id === "trixbrix:r104-double-crossover-kit");
  assert.ok(kit, "catalog includes its physical assembly");
  assert.equal(kit.parts.length, 14, "manufacturer assembly has 14 installed pieces");
  assert.equal(
    catalog.parts.some(({ id }) => id === "trixbrix:r104-double-crossover"),
    false,
  );
  assert.deepEqual(
    kit.parts
      .filter(({ partId }) => partId.endsWith("detach-1-crossover"))
      .map(({ partId }) => partId),
    [
      "trixbrix:r104-left-detach-1-crossover",
      "trixbrix:r104-left-detach-1-crossover",
      "trixbrix:r104-right-detach-1-crossover",
      "trixbrix:r104-right-detach-1-crossover",
    ],
  );
});

test("the fourteen physical crossover pieces expose four ends and route every choice", () => {
  const kit = catalog.kits.find(({ id }) => id === "trixbrix:r104-double-crossover-kit");
  const { ports, links } = physicalLinks(kit);
  const regular = ports.filter(({ type }) => type === "regular");
  const exposed = regular.filter(
    (port) =>
      !regular.some(
        (other) =>
          other !== port &&
          Math.hypot(port.x - other.x, port.y - other.y) <= 1e-6 &&
          Math.abs(
            Math.abs(((((port.angle - other.angle + 180) % 360) + 360) % 360) - 180) - 180,
          ) <= 1e-6,
      ),
  );
  assert.equal(exposed.length, 4);
  const end = (x, y) =>
    exposed.find((port) => Math.abs(port.x - x) <= 1e-6 && Math.abs(port.y - y) <= 1e-6);
  const upperRight = end(1.875, 22),
    upperLeft = end(-14.125, 22);
  const lowerLeft = end(-14.125, -58),
    lowerRight = end(1.875, -58);
  for (const [from, to] of [
    [upperRight, lowerRight],
    [upperLeft, lowerLeft],
    [upperRight, lowerLeft],
    [upperLeft, lowerRight],
  ]) {
    assert.ok(from && to);
    assert.ok(traces(links, from, to));
  }
});

test("the R104 triple inventory is five physical pieces with three routes", () => {
  const kit = catalog.kits.find(({ id }) => id === "trixbrix:r104-triple-kit");
  assert.equal(kit.parts.length, 5);
  assert.deepEqual(kit.aliases, ["tb switch r104 triple.8"]);
  const { ports, links } = physicalLinks(kit);
  const regular = ports.filter(({ type }) => type === "regular");
  const exposed = regular.filter(
    (port) =>
      !regular.some(
        (other) =>
          other !== port &&
          Math.hypot(port.x - other.x, port.y - other.y) <= 1e-6 &&
          Math.abs(
            Math.abs(((((port.angle - other.angle + 180) % 360) + 360) % 360) - 180) - 180,
          ) <= 1e-6,
      ),
  );
  assert.equal(exposed.length, 4);
  const end = (x, y) =>
    exposed.find((port) => Math.abs(port.x - x) <= 1e-6 && Math.abs(port.y - y) <= 1e-6);
  const common = end(-20.5, 0);
  for (const branch of [end(27.5, -8), end(27.5, 0), end(27.5, 8)]) {
    assert.ok(common && branch);
    assert.ok(traces(links, common, branch));
  }
});
