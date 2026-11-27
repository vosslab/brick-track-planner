import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import catalog from "../data/catalog.json" with { type: "json" };
import straightExamples from "../data/straight_examples.json" with { type: "json" };
import { findArrangementAnchors } from "../src/arrangement_anchors.ts";
import { moveOutlineEdge, outlineSupports, shiftOutlineSpan } from "../src/area_outline.ts";
import { commitItems, placementWarnings, previewArrangement } from "../src/arrangements.ts";
import { openTrackPlan, saveTrackPlan } from "../src/ldraw.ts";
import { newProject } from "../src/project.ts";
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

test("a clean joint at a named handoff can lead past the design border", () => {
  const project = template("member-straight");
  const east = project.area.exits.find(({ edge }) => edge === "east");
  const end = project.items.find(({ id }) => id === east.outer.pieceId);
  const continuation = { ...end, id: "neighbor-straight", x: project.area.width + 8 };
  const analysis = evaluate({ ...project, items: [...project.items, continuation] });

  assert.ok(
    analysis.routes.some(
      ({ kind, from, to }) =>
        kind === "joint" && [from.pieceId, to.pieceId].includes(continuation.id),
    ),
  );
  assert.deepEqual(placementWarnings(analysis, catalog), []);
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

test("both show turnarounds connect the 8- and 24-stud lanes at one boundary", () => {
  for (const [file, width, depth, edge] of [
    ["r104-semicircle-return", 416, 224, "east"],
    ["r120-corner-return", 384, 288, "west"],
  ]) {
    const project = template(file);
    assert.deepEqual([project.area.width, project.area.depth], [width, depth]);
    assert.equal(project.area.niltc, undefined);
    if (edge === "west") {
      assert.deepEqual(project.area.outline?.slice(3), [
        { x: 96, y: 288 },
        { x: 96, y: 192 },
        { x: 0, y: 192 },
      ]);
    }
    assert.equal(project.area.exits.length, 1);
    const [handoff] = project.area.exits;
    assert.equal(handoff.edge, edge);
    const result = evaluate(project);
    assert.deepEqual(result.overhangs, []);
    assert.deepEqual(result.niltcIssues, []);
    assert.deepEqual(result.unresolved, []);
    const open = result.ports.filter(({ type, joined }) => type === "regular" && !joined);
    assert.equal(open.length, 2);
    for (const [lane, offset] of [
      ["outer", 8],
      ["inner", 24],
    ]) {
      const port = open.find((candidate) => endpointKey(candidate) === endpointKey(handoff[lane]));
      const x = edge === "east" ? width : 0;
      assert.ok(port && Math.hypot(port.x - x, port.y - offset) < 0.05);
      assert.equal(port.angle, edge === "east" ? 0 : 180);
      assert.equal(port.heightPlates, 2);
    }
    assert.ok(reaches(result.routes, handoff.outer, handoff.inner));
    assertCollisionFree(project, file);
  }
});

test("an outline edit holds the track fixed and keeps the public reference on untouched frontage", () => {
  const project = template("member-straight");
  for (const [edge, dimension] of [
    [0, "depth"],
    [1, "width"],
    [2, "depth"],
    [3, "width"],
  ]) {
    for (const delta of [-32, 32]) {
      const area = moveOutlineEdge(project.area, edge, delta);
      assert.equal(area[dimension], project.area[dimension] + delta);
      const reopened = openTrackPlan(saveTrackPlan({ ...project, area }, catalog), catalog);
      assert.deepEqual(reopened.area, area);
      assert.deepEqual(reopened.items, project.items);
    }
  }
  const partial = shiftOutlineSpan(project.area, 0, 16, { offset: 32, length: 64 });
  assert.ok(partial.outline.some(({ x, y }) => x === 32 && y === -16));
  assert.ok(partial.outline.some(({ x, y }) => x === 32 && y === project.area.depth - 16));
  assert.equal(partial.frontLines.north, 0);
  assert.deepEqual(evaluate({ ...project, area: partial }).niltcIssues, []);
  const full = moveOutlineEdge(project.area, 0, 32);
  assert.equal(full.frontLines.north, -32);
  assert.equal(
    evaluate({ ...project, area: full }).niltcIssues.filter(
      ({ kind }) => kind === "exit-off-standard",
    ).length,
    4,
  );
  assert.throws(() => moveOutlineEdge(project.area, 2, -project.area.depth), /continuous table/);
});

test("a notch exposes a straight that bridges it, even with supported corners", () => {
  const project = newProject();
  project.area = moveOutlineEdge(project.area, 2, -32, { offset: 72, length: 16 });
  project.items = [
    {
      kind: "track",
      id: "bridge",
      layerId: "layout",
      partId: "trixbrix:s32",
      x: 80,
      y: 112,
      angle: 0,
      heightPlates: 0,
    },
  ];
  assert.equal(
    outlineSupports(project.area, [
      { x: 64, y: 108 },
      { x: 96, y: 108 },
      { x: 96, y: 116 },
      { x: 64, y: 116 },
    ]),
    false,
  );
  assert.deepEqual(
    evaluate(project).overhangs.map(({ pieceId }) => pieceId),
    ["bridge"],
  );
});

test("every straight example fits and connects the intended routes", () => {
  assert.equal(
    new Set(straightExamples.map(({ file }) => file)).size,
    straightExamples.length,
    "each gallery example has its own track plan",
  );
  const codes = straightExamples.map(({ code }) => code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((code) => /^[A-Z0-9]{2,5}$/.test(code)));
  assert.deepEqual(
    straightExamples.slice(0, 2).map(({ name }) => name),
    ["Mainline only", "Back-out siding"],
  );
  const fingerprints = new Set();
  const parts = { 60: [], 40: [] };
  for (const { code, file, frontage, name } of straightExamples) {
    const id = file.replace(/\.ldr$/, "");
    const result = evaluate(template(id));
    parts[frontage].push(
      showInventory(result.project, catalog).track.reduce((sum, row) => sum + row.required, 0),
    );
    const privateJunction = code === "TJ56";
    const privateYard = code === "8TRY";
    const general = privateJunction || privateYard;
    assert.deepEqual(
      [result.project.area.width, result.project.area.depth, result.project.area.niltc],
      [frontage * 3.2, 128, general ? undefined : "straight"],
      `${name} uses its intended frontage and depth`,
    );
    assert.deepEqual(
      result.project.area.fronts,
      general ? [] : ["north"],
      `${name} uses the intended public edge`,
    );
    assert.deepEqual(result.niltcIssues, [], `${name} preserves the required mainline geometry`);
    assert.deepEqual(result.overhangs, [], `${name} fits the assigned display area`);
    assert.deepEqual(result.unresolved, [], `${name} contains only supported track`);
    assert.ok(
      result.ports.every(({ ambiguous }) => !ambiguous),
      `${name} has no ambiguous track joints`,
    );
    assertCollisionFree(template(id), name);

    const fingerprint = result.project.items
      .map(({ partId, x, y, angle }) => `${partId}@${x},${y},${angle}`)
      .sort()
      .join("|");
    fingerprints.add(fingerprint);

    if (privateYard) {
      const open = result.ports
        .filter(({ type, joined }) => type === "regular" && !joined)
        .sort((a, b) => a.y - b.y);
      const west = open.filter(({ x }) => Math.abs(x) < 0.05);
      const east = open.filter(({ x }) => Math.abs(x - 192) < 0.05);
      assert.deepEqual([open.length, west.length, east.length], [16, 8, 8]);
      for (let row = 0; row < 8; row++) {
        const y = 8 + 16 * row;
        assert.ok(Math.abs(west[row].y - y) < 0.05 && Math.abs(east[row].y - y) < 0.05);
        assert.ok(reaches(result.routes, east[row], west[row]), `row ${row + 1} runs through`);
      }
      assert.ok(reaches(result.routes, east[7], west[0]), "row 8 transfers to row 1");
      for (let row = 0; row < 7; row++) {
        assert.deepEqual(
          [
            reaches(result.routes, west[row], east[row + 1]),
            reaches(result.routes, east[row], west[row + 1]),
          ],
          [row % 2 === 0, row % 2 === 1],
          `rows ${row + 1} and ${row + 2} use alternating single crossovers`,
        );
      }
      continue;
    }

    if (privateJunction) {
      const open = result.ports.filter(({ type, joined }) => type === "regular" && !joined);
      const west = open.filter(({ x }) => x < 0.05);
      const east = open.filter(({ x }) => x > 191.95);
      const spurs = open.filter(({ y }) => y > 127.95);
      assert.deepEqual([west.length, east.length, spurs.length], [2, 2, 2]);
      for (const entrance of west) {
        assert.ok(east.some((end) => reaches(result.routes, entrance, end)));
        assert.ok(spurs.some((end) => reaches(result.routes, entrance, end)));
      }
      continue;
    }

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
    const served = new Set([
      ...reachableEndpoints(result.routes, west.inner),
      ...reachableEndpoints(result.routes, west.outer),
      ...reachableEndpoints(result.routes, east.inner),
      ...reachableEndpoints(result.routes, east.outer),
    ]);
    for (const rail of privateRails) {
      assert.ok(
        result.ports
          .filter(({ pieceId }) => pieceId === rail.id)
          .some((port) => served.has(endpointKey(port))),
        `${name} connects private rail ${rail.id} to a mainline`,
      );
    }

    const storageEnds = result.ports.filter(
      (port) => port.type === "regular" && !port.joined && !/^(inner|outer)-/.test(port.pieceId),
    );
    if (code === "PFS") {
      assert.equal(storageEnds.length, 2, "two perpendicular freight spurs");
      assert.ok(storageEnds.every(({ x, angle }) => x > 128 && Math.abs(angle - 90) < 0.001));
      const rightEdgeClearance =
        result.project.area.width - Math.max(...storageEnds.map(({ x }) => x)) - 4;
      assert.ok(rightEdgeClearance >= 0 && rightEdgeClearance < 3, `${name} uses the right edge`);
    }
    if (code === "4TRY") {
      assert.equal(storageEnds.length, 3);
      assert.ok(storageEnds.every(({ x }) => Math.abs(x - result.project.area.width) < 0.001));
    }
    if (code === "PFS40") {
      assert.equal(storageEnds.length, 1);
      assert.ok(storageEnds.every(({ x, angle }) => x > 112 && Math.abs(angle - 90) < 0.001));
    }
    if (code === "DTS60") {
      const storage = result.project.items.filter(
        ({ partId, y }) => partId === "lego:rc-s16" && y > 32,
      );
      assert.equal(storage.length * 16, 80, "the center siding has 80 straight studs");
    }
    if (code === "PT40") {
      const eastSpur = storageEnds.find(({ x }) => x > 191.95);
      assert.ok(eastSpur && reaches(result.routes, west.outer, eastSpur));
      assert.ok(!reaches(result.routes, west.inner, eastSpur));
    }
    if (code === "TJ40") {
      assert.equal(storageEnds.length, 1);
      assert.equal(storageEnds[0].y, 128);
      assert.ok(reaches(result.routes, west.inner, storageEnds[0]));
      assert.ok(reaches(result.routes, east.inner, storageEnds[0]));
    }
    if (code === "PFS" || code === "4TRY" || code === "PFS40") {
      for (const end of storageEnds) {
        for (const lane of ["outer", "inner"]) {
          assert.ok(
            reaches(result.routes, west[lane], end),
            `${name} reaches ${end.pieceId} from the west ${lane} mainline without reversal`,
          );
        }
      }
    }
  }
  assert.equal(fingerprints.size, straightExamples.length);
  for (const [frontage, counts] of Object.entries(parts)) {
    assert.ok(counts.length > 2, `${frontage}-inch frontage has a collection of examples`);
    const ranked = counts.slice(2);
    assert.deepEqual(
      ranked,
      [...ranked].sort((a, b) => a - b),
      `${frontage}-inch examples after the two starters are ordered by physical track count`,
    );
  }
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
    if (key === "eight-track-diagonal" || key.startsWith("single-crossover-")) {
      // The documented TrixBrix assemblies have overlapping hulls inside each group.
      placed = batch.project;
      continue;
    }

    const kit = items[0]?.arrangementId;
    if (
      [
        "trixbrix:r40-right-pass-through",
        "trixbrix:r40-t-junction",
        "trixbrix:r40-r56-t-junction",
      ].includes(kit)
    ) {
      // The adjoining manufacturer parts have overlapping bounding hulls inside the assembly.
      assertKitPlacement(items, kit);
      placed = batch.project;
      continue;
    }
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

test("the TrixBrix T-junctions and pass-through fit their mainlines and preserve separate routes", () => {
  const mainline = template("member-straight");
  const thirdLane = mainline.items
    .filter(({ id }) => id.startsWith("inner-"))
    .map((item) => ({ ...item, id: `third-${item.id}`, y: item.y + 16 }));
  const triple = { ...mainline, items: [...mainline.items, ...thirdLane] };
  /** @type {[string, [number, number][], string[]][]} */
  const products = [
    [
      "r40-right-pass-through",
      [
        [-32, -16],
        [0, -16],
        [-16, 0],
        [16, 0],
        [0, 16],
        [32, 16],
      ],
      ["0-1", "0-5", "2-3", "4-5"],
    ],
    [
      "r40-t-junction",
      [
        [0, 0],
        [80, 0],
        [40, 40],
      ],
      ["0-1", "0-2", "1-2"],
    ],
    [
      "r40-r56-t-junction",
      [
        [0, 0],
        [96, 0],
        [0, 16],
        [96, 16],
        [40, 56],
        [56, 56],
      ],
      ["0-1", "0-5", "1-4", "2-3", "2-4", "3-5"],
    ],
  ];
  for (const [id, ends, expected] of products) {
    const kitId = `trixbrix:${id}`;
    const pose = { x: 48, y: 48, angle: 0 };
    const placement = previewArrangement(newProject(), catalog, { kitId, pose });
    assert.ok(placement.ok, JSON.stringify(placement.issues));
    const { ports, routes } = evaluate(placement.project);
    const open = ports.filter(({ type, joined }) => type === "regular" && !joined);
    assert.equal(open.length, ends.length, id);
    const endpoints = ends.map(([x, y]) => {
      const port = open.find((port) => Math.hypot(port.x - pose.x - x, port.y - pose.y - y) < 0.05);
      assert.ok(port, `${id} has an exit at ${x}, ${y}`);
      return port;
    });
    const actual = endpoints.flatMap((start, a) =>
      endpoints.flatMap((end, b) => (a < b && reaches(routes, start, end) ? [`${a}-${b}`] : [])),
    );
    assert.deepEqual(actual, expected, id);
    const passThrough = id === "r40-right-pass-through";
    if (passThrough) {
      assert.match(
        findArrangementAnchors(mainline, catalog, kitId, 2).reason,
        /3 aligned parallel tracks/,
      );
    }
    const fit = findArrangementAnchors(passThrough ? triple : mainline, catalog, kitId, 2);
    assert.ok(
      fit.anchors.some(({ replaceIds }) => replaceIds.length >= (passThrough ? 6 : 5)),
      id,
    );
  }
});
