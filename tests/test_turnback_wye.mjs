import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTurnbackWye } from "../src/turnback_wye.ts";
import { findArrangementAnchors } from "../src/arrangement_anchors.ts";
import { createNiltcStarter } from "../src/niltc_starters.ts";
import { withParkingKits } from "../src/parking.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const parts = new Map(catalog.parts.map((part) => [part.id, part]));
const tolerance = 0.05;

function world(port, pose) {
  const radians = (pose.angle * Math.PI) / 180;
  return {
    x: pose.x + port.x * Math.cos(radians) - port.y * Math.sin(radians),
    y: pose.y + port.x * Math.sin(radians) + port.y * Math.cos(radians),
    angle: (((port.angle + pose.angle) % 360) + 360) % 360,
  };
}

function opposite(first, second) {
  const turn = Math.abs(((((first.angle - second.angle + 180) % 360) + 360) % 360) - 180);
  return (
    Math.hypot(first.x - second.x, first.y - second.y) <= tolerance && Math.abs(turn - 180) <= 0.25
  );
}

function routeBetween(kit, from, to) {
  const ports = kit.parts.flatMap((placement, piece) =>
    parts.get(placement.partId).ports.map((port) => ({
      ...world(port, placement),
      piece,
      partId: placement.partId,
      portId: port.id,
    })),
  );
  const links = [];
  for (const [piece, placement] of kit.parts.entries()) {
    for (const route of parts.get(placement.partId).routes) {
      links.push({ kind: "internal", from: `${piece}/${route.from}`, to: `${piece}/${route.to}` });
    }
  }
  for (const [index, port] of ports.entries()) {
    for (const [otherIndex, other] of ports.entries()) {
      if (index < otherIndex && opposite(port, other)) {
        links.push({
          kind: "joint",
          from: `${port.piece}/${port.portId}`,
          to: `${other.piece}/${other.portId}`,
        });
      }
    }
  }
  const neighbors = new Map();
  for (const link of links) {
    for (const [first, second] of [
      [link.from, link.to],
      [link.to, link.from],
    ]) {
      const list = neighbors.get(first) ?? [];
      list.push({ endpoint: second, kind: link.kind });
      neighbors.set(first, list);
    }
  }
  const pending = [{ endpoint: from, prior: "" }];
  const seen = new Set([`${from}/start`]);
  while (pending.length) {
    const current = pending.shift();
    for (const next of neighbors.get(current.endpoint) ?? []) {
      if (next.kind === current.prior) continue;
      if (next.endpoint === to) return true;
      const state = `${next.endpoint}/${next.kind}`;
      if (!seen.has(state)) {
        seen.add(state);
        pending.push({ endpoint: next.endpoint, prior: next.kind });
      }
    }
  }
  return false;
}

test("the R104 turnback wye is a closed physical two-direction assembly", () => {
  const kit = createTurnbackWye(catalog, 16);
  assert.equal(kit.parts.filter(({ partId }) => partId === "trixbrix:r104").length, 8);
  assert.equal(kit.parts.filter(({ partId }) => partId === "trixbrix:r104y-adapter").length, 2);
  assert.equal(kit.parts.filter(({ partId }) => partId === "trixbrix:s16").length, 9);
  const ports = kit.parts.flatMap((placement, piece) =>
    parts
      .get(placement.partId)
      .ports.filter(({ type }) => type === "regular")
      .map((port) => ({
        ...world(port, placement),
        piece,
        partId: placement.partId,
        portId: port.id,
      })),
  );
  const joined = (id, portId) =>
    ports.some(
      (port, index) =>
        port.partId === id &&
        port.portId === portId &&
        ports.some((other, otherIndex) => otherIndex !== index && opposite(port, other)),
    );
  assert.ok(joined("trixbrix:r104-right-detach-2", "branch"), "left turnout joins the wye arm");
  assert.ok(joined("trixbrix:r104-left-detach-2", "branch"), "right turnout joins the wye arm");
  assert.ok(
    ports.some(
      (port) =>
        port.partId === "trixbrix:s16" &&
        port.portId === "b" &&
        Math.abs(port.x) <= tolerance &&
        Math.abs(port.y - 94.5) <= tolerance,
    ),
    "wye tail is present",
  );
  const exterior = ports.filter(
    (port, index) =>
      !ports.some((other, otherIndex) => otherIndex !== index && opposite(port, other)),
  );
  assert.equal(exterior.length, 3, "only two mainline approaches and the wye tail remain exposed");
  const leftMainline = kit.parts.findIndex(({ partId }) => partId === "trixbrix:r104-right-base");
  const rightMainline = kit.parts.findIndex(({ partId }) => partId === "trixbrix:r104-left-base");
  assert.ok(leftMainline >= 0 && rightMainline >= 0);
  assert.equal(
    routeBetween(kit, `${leftMainline}/common`, `${rightMainline}/common`),
    true,
    "both mainline directions reach through the reversible wye route",
  );
  const direct = {
    ...kit,
    parts: kit.parts.filter(
      ({ partId, angle }) =>
        !["trixbrix:r104", "trixbrix:r104-wye", "trixbrix:r104y-adapter", "trixbrix:s01"].includes(
          partId,
        ) && !(partId === "trixbrix:s16" && Math.abs(angle - 90) <= 0.25),
    ),
  };
  const directLeft = direct.parts.findIndex(({ partId }) => partId === "trixbrix:r104-right-base");
  const directRight = direct.parts.findIndex(({ partId }) => partId === "trixbrix:r104-left-base");
  assert.equal(
    routeBetween(direct, `${directLeft}/common`, `${directRight}/common`),
    true,
    "mainline remains direct without the wye arms",
  );
});

test("the wye finds connected space on a 100 by 60 inch mainline area", () => {
  const project = createNiltcStarter(catalog, {
    width: 320,
    depth: 192,
    mode: "straight",
    fronts: ["north"],
  });
  const withParking = withParkingKits(catalog, 32);
  const anchors = findArrangementAnchors(
    project,
    withParking,
    "parking:r104-turnback-wye",
    2,
  ).anchors;
  assert.ok(anchors.length, "a 32-stud turnback tail fits behind this mainline");
  assert.equal(
    findArrangementAnchors(project, withParkingKits(catalog, 64), "parking:r104-turnback-wye", 2)
      .anchors.length,
    0,
    "the longer tail would cross the back edge",
  );
  assert.ok(
    anchors.some((anchor) => anchor.fillers.length > 0),
    "the straight mainline closes with physical spacers",
  );
});
