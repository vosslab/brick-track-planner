import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const parts = new Map(catalog.parts.map((part) => [part.id, part]));
const kits = new Map(catalog.kits.map((kit) => [kit.id, kit]));

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-5, `Expected ${expected}, got ${actual}`);
}

function rotate(point, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

test("catalog references physical parts and has terminal centerlines", () => {
  const ids = [...parts.keys(), ...kits.keys()];
  assert.equal(new Set(ids).size, catalog.parts.length + catalog.kits.length);
  for (const part of parts.values()) {
    assert.ok(part.footprint.length >= 3, part.id);
    for (const path of part.paths) {
      for (const end of [path.at(0), path.at(-1)]) {
        assert.ok(
          part.ports.some((port) => end.x === port.x && end.y === port.y),
          part.id,
        );
      }
    }
  }
  for (const kit of kits.values()) {
    for (const { partId } of kit.parts) {
      assert.ok(parts.has(partId), partId);
    }
  }
});

test("eight mixed-brand segments trace each quarter circle", () => {
  for (const radius of [104, 120]) {
    const total = { x: 0, y: 0 };
    let angle = 0;
    for (let index = 0; index < 8; index += 1) {
      const brand = index % 2 ? "trixbrix" : "bricktracks";
      const part = parts.get(`${brand}:r${radius}`);
      const [a, b] = part.ports;
      assert.equal(a.angle, 180);
      assert.equal(b.angle, 11.25);
      for (const sample of part.paths[0]) {
        near(Math.hypot(sample.x - a.x, sample.y - a.y - radius), radius);
      }
      const segment = rotate({ x: b.x - a.x, y: b.y - a.y }, angle);
      total.x += segment.x;
      total.y += segment.y;
      angle += b.angle;
    }
    near(total.x, radius);
    near(total.y, radius);
    assert.equal(angle, 90);
  }
});

test("the four BrickTracks recipes place one reversible stand and one turnout body", () => {
  const stand = parts.get("bricktracks:r104-stand");
  assert.deepEqual(stand.ports, []);
  for (const [hand, standX, sourceX] of [
    ["left", -16.0625, 0],
    ["right", 16, -0.0625],
  ]) {
    for (const [side, standY, angle, sourceY] of [
      ["inside", -2.625, 0, -0.0625],
      ["outside", 10.375, 180, -2.96875],
    ]) {
      const kit = kits.get(`bricktracks:r104-${hand}-${side}`);
      const body = `bricktracks:r104-${hand}-body`;
      assert.deepEqual(kit.parts, [
        { partId: body, x: 0, y: 0, angle: 0 },
        { partId: stand.id, x: standX, y: standY, angle },
      ]);
      assert.deepEqual(kit.aliases, [
        `BT SWITCH R104 ${hand.toUpperCase()} STAND ${side.toUpperCase()}.8`,
      ]);
      assert.deepEqual(kit.sourceOffset, { x: sourceX, y: sourceY });
      assert.deepEqual(
        parts.get(body).ports.map(({ id }) => id),
        ["common", "through", "branch"],
      );
    }
  }
});

test("TrixBrix recipes join four physical parts and preserve assembled ports", () => {
  for (const [hand, sign] of [
    ["left", 1],
    ["right", -1],
  ]) {
    const kit = kits.get(`trixbrix:r104-${hand}`);
    assert.deepEqual(
      kit.parts.map(({ partId }) => partId),
      [
        `trixbrix:r104-${hand}-base`,
        `trixbrix:r104-${hand}-detach-1`,
        `trixbrix:r104-${hand}-detach-2`,
        "trixbrix:s08",
      ],
    );
    const ports = kit.parts.flatMap((pose) =>
      parts.get(pose.partId).ports.map((port) => {
        const offset = rotate(port, pose.angle);
        return {
          ...port,
          x: pose.x + offset.x,
          y: pose.y + offset.y,
          angle: (((pose.angle + port.angle) % 360) + 360) % 360,
        };
      }),
    );
    const exposed = ports.filter(
      (port) =>
        !ports.some(
          (other) =>
            port.type === other.type &&
            Math.hypot(port.x - other.x, port.y - other.y) < 1e-5 &&
            Math.abs(port.angle - other.angle) === 180,
        ),
    );
    const expected = [
      [-20.5 * sign, 3.875, sign === 1 ? 180 : 0],
      [19.5 * sign, -4.125, sign === 1 ? 337.5 : 202.5],
      [19.5 * sign, 3.875, sign === 1 ? 0 : 180],
    ];
    assert.equal(exposed.length, expected.length);
    exposed.forEach((port, index) => {
      near(port.x, expected[index][0]);
      near(port.y, expected[index][1]);
      assert.equal(port.angle, expected[index][2]);
      assert.equal(port.type, "regular");
    });
  }
});
