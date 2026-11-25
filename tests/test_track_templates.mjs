import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import catalog from "../data/catalog.json" with { type: "json" };
import straightExamples from "../data/straight_examples.json" with { type: "json" };
import { commitItems } from "../src/arrangements.ts";
import { openTrackPlan } from "../src/ldraw.ts";
import { showInventory } from "../src/show_inventory.ts";

const template = (name) =>
  openTrackPlan(
    readFileSync(new URL(`../templates/${name}.ldr`, import.meta.url), "utf8"),
    catalog,
  );

test("the straight template has two named NILTC handoffs", () => {
  const project = template("member-straight");
  assert.equal(project.area.niltc, "straight");
  assert.equal(project.area.exits.length, 2);
  assert.deepEqual(
    project.area.exits.map(({ edge }) => edge),
    ["west", "east"],
  );
});

test("the yard template has three 128-stud R104 storage tracks on the inner mainline", () => {
  const project = template("member-yard");
  const yard = project.items.filter(
    ({ kind, groupId }) => kind === "track" && groupId === "r104-right-yard",
  );
  const storage = project.items.filter(
    ({ kind, groupId }) => kind === "track" && groupId === "r104-yard-storage",
  );
  assert.equal(project.area.niltc, "straight");
  assert.equal(project.area.exits.length, 2);
  assert.equal(yard.length, 35);
  assert.equal(storage.length, 24);
  assert.ok(yard.some(({ partId }) => partId === "trixbrix:r104-right-base"));
  assert.ok(yard.some(({ partId }) => partId === "trixbrix:rc1"));
  assert.ok(yard.every(({ heightPlates }) => heightPlates === 2));
  assert.ok(yard.every(({ arrangementId }) => arrangementId === "trixbrix:r104-right-yard-4"));
  assert.ok(
    storage.every(({ partId, heightPlates }) => partId === "trixbrix:s16" && heightPlates === 2),
  );
  assertKitPlacement(yard, "trixbrix:r104-right-yard-4");
  assertStorageTracksClear(project, storage);
});

test("the Rust route graph reaches the inner mainline and each full-length yard track", () => {
  const result = evaluate(template("member-yard"));
  assert.deepEqual(result.niltcIssues, []);
  assert.deepEqual(result.overhangs, []);
  const storageIds = new Set(
    result.project.items
      .filter(({ groupId }) => groupId === "r104-yard-storage")
      .map(({ id }) => id),
  );
  const outputs = result.ports.filter(
    ({ pieceId, type, joined }) => storageIds.has(pieceId) && type === "regular" && !joined,
  );
  const start = result.project.area.exits[0].inner;
  const targets = [result.project.area.exits[1].inner, ...outputs];
  assert.equal(targets.length, 4, "three storage outputs plus the inner through mainline");
  assert.deepEqual(
    outputs.map(({ x }) => x),
    [304.012423772, 304.016648759, 304.016648757],
    "each storage track keeps a 16-stud clearance to the display edge",
  );
  for (const target of targets) assert.ok(reaches(result.routes, start, target));
});

test("the U-shaped staging template is a fitting connected general-area plan", () => {
  const project = template("u-shaped-staging");
  assert.equal(project.name, "U-shaped staging layout");
  assert.equal(project.area.niltc, undefined);
  assert.equal(project.area.exits.length, 0);
  assert.ok(project.items.some(({ groupId }) => groupId === "staging-siding"));

  const result = evaluate(project);
  assert.deepEqual(result.overhangs, []);
  const open = result.ports.filter(({ type, joined }) => type === "regular" && !joined);
  assert.equal(open.length, 3, "two U-run ends plus the staging-siding end");
  assert.ok(reaches(result.routes, open[0], open[1]));
  assert.ok(reaches(result.routes, open[0], open[2]));
});

test("every 40 by 60 straight example is a clean connected NILTC assignment", () => {
  assert.equal(
    new Set(straightExamples.map(({ file }) => file)).size,
    straightExamples.length,
    "each gallery example has its own track plan",
  );
  assert.equal(new Set(straightExamples.map(({ id }) => id)).size, straightExamples.length);
  const fingerprints = new Set();
  const parts = [];
  for (const { file, name } of straightExamples) {
    const id = file.replace(/\.ldr$/, "");
    const result = evaluate(template(id));
    parts.push(
      showInventory(result.project, catalog).track.reduce((sum, row) => sum + row.required, 0),
    );
    assert.deepEqual(
      [result.project.area.width, result.project.area.depth, result.project.area.niltc],
      [128, 192, "straight"],
      `${name} is a 40 by 60 straight assignment`,
    );
    assert.deepEqual(
      result.project.area.fronts,
      ["north"],
      `${name} keeps the public edge toward the plexiglass`,
    );
    assert.deepEqual(result.niltcIssues, [], `${name} preserves the required mainline geometry`);
    assert.deepEqual(result.overhangs, [], `${name} fits the assigned display area`);
    assert.deepEqual(result.unresolved, [], `${name} contains only supported track`);
    assert.ok(
      result.ports.every(({ ambiguous }) => !ambiguous),
      `${name} has no ambiguous track joints`,
    );
    assertCollisionFree(template(id), name);

    const [west, east] = result.project.area.exits;
    assert.deepEqual([west.edge, east.edge], ["west", "east"], `${name} keeps both named handoffs`);
    for (const lane of ["outer", "inner"]) {
      assert.ok(
        reaches(result.routes, west[lane], east[lane]),
        `${name} routes the ${lane} mainline through both handoffs`,
      );
    }
    const privateRails = result.project.items
      .filter(
        ({ kind, id }) => kind === "track" && !id.startsWith("outer-") && !id.startsWith("inner-"),
      )
      .filter(({ id }) => result.ports.some((port) => port.pieceId === id));
    const innerReach = reachableEndpoints(result.routes, west.inner);
    for (const rail of privateRails) {
      assert.ok(
        result.ports
          .filter(({ pieceId }) => pieceId === rail.id)
          .some((port) => innerReach.has(endpointKey(port))),
        `${name} connects private rail ${rail.id} to the inner mainline`,
      );
    }

    const storageEnds = result.ports.filter(
      (port) => port.type === "regular" && !port.joined && !/^(inner|outer)-/.test(port.pieceId),
    );
    if (/^(10|11|12)-/.test(file)) {
      const rightEdgeClearance =
        result.project.area.width - Math.max(...storageEnds.map(({ x }) => x)) - 4;
      assert.ok(rightEdgeClearance >= 0 && rightEdgeClearance < 3, `${name} uses the right edge`);
    }
    if (id === "04-r40-right-yard") {
      assert.equal(storageEnds.length, 3);
      assert.ok(storageEnds.every(({ x }) => Math.abs(x - result.project.area.width) < 0.001));
    }

    const fingerprint = result.project.items
      .map(({ partId, x, y, angle }) => `${partId}@${x},${y},${angle}`)
      .sort()
      .join("|");
    fingerprints.add(fingerprint);
  }
  assert.equal(fingerprints.size, straightExamples.length);
  const [, ...ranked] = parts;
  assert.deepEqual(
    ranked,
    [...ranked].sort((a, b) => a - b),
    "examples after the baseline are ordered by physical track count",
  );
});

test("the short freight spur keeps the same approach and trims only perpendicular straights", () => {
  const full = template("12-perpendicular-freight-spur");
  const short = template("12-perpendicular-freight-spur-short");
  assert.deepEqual(short.area, full.area);
  const retained = new Set(short.items.map(({ id }) => id));
  const removed = full.items.filter(({ id }) => !retained.has(id));
  assert.equal(removed.length, 5);
  assert.ok(removed.every(({ partId, angle }) => partId === "lego:rc-s16" && angle === 90));
  assert.deepEqual(
    short.items,
    full.items.filter(({ id }) => retained.has(id)),
  );
});

test("the double crossover example transfers trains between the mainlines", () => {
  const result = evaluate(template("07-double-crossover"));
  const [west, east] = result.project.area.exits;
  assert.ok(
    reaches(result.routes, west.outer, east.inner),
    "double crossover transfers the outer west mainline to the inner east mainline",
  );
  assert.ok(
    reaches(result.routes, west.inner, east.outer),
    "double crossover transfers the inner west mainline to the outer east mainline",
  );
});

function assertCollisionFree(project, name) {
  let placed = { ...project, items: [] };
  const batches = new Map();
  for (const item of project.items) {
    const key = item.kind === "track" ? (item.groupId ?? item.id) : item.id;
    const batch = batches.get(key) ?? [];
    batch.push(item);
    batches.set(key, batch);
  }
  for (const [key, items] of batches) {
    const batch = commitItems(placed, catalog, { items });
    assert.equal(batch.ok, true, `${name} places ${key} without a collision`);

    let pathPlaced = placed;
    for (const item of items) {
      const part =
        item.kind === "track" ? catalog.parts.find(({ id }) => id === item.partId) : undefined;
      if (!part?.paths.length) continue;
      const next = commitItems(pathPlaced, catalog, { items: [item] });
      assert.equal(next.ok, true, `${name} places rail ${item.id} without a collision`);
      pathPlaced = next.project;
    }
    placed = batch.project;
  }
}

function assertKitPlacement(items, kitId) {
  const kit = catalog.kits.find(({ id }) => id === kitId);
  assert.ok(kit, `${kitId} is present in the catalog`);
  assert.equal(items.length, kit.parts.length, `${kitId} retains every calibrated part`);
  const firstItem = items.find(({ partId }) => partId === kit.parts[0].partId);
  assert.ok(firstItem, `${kitId} retains its placement anchor`);
  const [firstPart] = kit.parts;
  const rotation = firstItem.angle - firstPart.angle;
  const radians = (rotation * Math.PI) / 180;
  const signature = ({ partId, x, y, angle }) =>
    [
      partId,
      x.toFixed(5),
      y.toFixed(5),
      (((((angle + 180) % 360) + 360) % 360) - 180).toFixed(5),
    ].join("|");
  const expected = kit.parts.map((source) => {
    const deltaX = source.x - firstPart.x;
    const deltaY = source.y - firstPart.y;
    return signature({
      partId: source.partId,
      x: firstItem.x + deltaX * Math.cos(radians) - deltaY * Math.sin(radians),
      y: firstItem.y + deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
      angle: source.angle + rotation,
    });
  });
  assert.deepEqual(items.map(signature).sort(), expected.sort(), `${kitId} relative poses`);
}

function assertStorageTracksClear(project, storage) {
  const storageIds = new Set(storage.map(({ id }) => id));
  let placed = { ...project, items: project.items.filter(({ id }) => !storageIds.has(id)) };
  for (const item of storage) {
    const next = commitItems(placed, catalog, { items: [item] });
    assert.equal(next.ok, true, `yard storage ${item.id} clears the calibrated yard and all rails`);
    placed = next.project;
  }
}

function evaluate(project) {
  return JSON.parse(
    execFileSync("cargo", ["run", "--quiet", "--example", "oracle"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      input: `${JSON.stringify(project)}\n`,
    }),
  );
}

function endpointKey({ pieceId, portId }) {
  return `${pieceId}\u0000${portId}`;
}

function reachableEndpoints(routes, start) {
  const neighbours = new Map();
  for (const route of routes) {
    for (const [from, to] of [
      [route.from, route.to],
      [route.to, route.from],
    ]) {
      const links = neighbours.get(endpointKey(from)) ?? [];
      links.push({ endpoint: endpointKey(to), kind: route.kind });
      neighbours.set(endpointKey(from), links);
    }
  }
  const reachable = new Set([endpointKey(start)]);
  const pending = [{ endpoint: endpointKey(start), prior: undefined }];
  while (pending.length) {
    const current = pending.shift();
    for (const link of neighbours.get(current.endpoint) ?? []) {
      if (link.kind === current.prior) continue;
      const state = `${link.endpoint}\u0000${link.kind}`;
      if (reachable.has(state)) continue;
      reachable.add(link.endpoint);
      reachable.add(state);
      pending.push({ endpoint: link.endpoint, prior: link.kind });
    }
  }
  return reachable;
}

function reaches(routes, start, target) {
  return reachableEndpoints(routes, start).has(endpointKey(target));
}
