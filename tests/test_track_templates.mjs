import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import catalog from "../data/catalog.json" with { type: "json" };
import straightExamples from "../data/straight_examples.json" with { type: "json" };
import { findArrangementAnchors } from "../src/arrangement_anchors.ts";
import { moveOutlineEdge, outlineSupports } from "../src/area_outline.ts";
import { placementWarnings, previewArrangement } from "../src/arrangements.ts";
import { openTrackPlan } from "../src/ldraw.ts";
import { newProject } from "../src/project.ts";
import { traceRoute } from "../src/route_trace.ts";
import { showInventory } from "../src/show_inventory.ts";

const template = (name) =>
  openTrackPlan(
    readFileSync(new URL(`../templates/${name}.ldr`, import.meta.url), "utf8"),
    catalog,
  );

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

test("the 100 by 40 R104 yard reaches three 144-stud storage tracks at the east edge", () => {
  const result = evaluate(template("member-yard"));
  const { area, items } = result.project;
  assert.deepEqual([area.width, area.depth, area.niltc], [320, 128, "straight"]);
  assertFits(result, result.project.name);
  const storageIds = new Set(
    items.filter(({ groupId }) => groupId === "r104-yard-storage").map(({ id }) => id),
  );
  const outputs = result.ports.filter(
    ({ pieceId, type, joined }) => storageIds.has(pieceId) && type === "regular" && !joined,
  );
  const [west, east] = area.exits;
  assert.ok(reaches(result.routes, west.inner, east.inner));
  assert.equal(outputs.length, 3);
  for (const end of outputs) {
    const route = traceRoute(result.routes, west.inner, end);
    assert.ok(route);
    const length = route
      .filter(({ kind, from }) => kind === "internal" && storageIds.has(from.pieceId))
      .reduce((sum, link) => sum + link.length, 0);
    assert.ok(length >= 144, "each storage track has at least 144 straight studs");
    assert.ok(Math.abs(end.x - area.width) < 0.05);
  }
});

test("both show turnarounds connect the 8- and 24-stud lanes at one boundary", () => {
  for (const [file, width, depth, edge] of [
    ["r104-semicircle-return", 416, 224, "east"],
    ["r120-corner-return", 384, 288, "west"],
  ]) {
    const project = template(file);
    assert.deepEqual([project.area.width, project.area.depth], [width, depth]);
    assert.equal(project.area.exits.length, 1);
    const [handoff] = project.area.exits;
    assert.equal(handoff.edge, edge);
    const result = evaluate(project);
    assertFits(result, file);
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
  }
});

test("Joel's 60 by 40 template connects both lanes across a 10-inch offset", () => {
  const project = template("joel-mainline-offset");
  const [west, east] = project.area.exits;
  assert.deepEqual([project.area.width, project.area.depth], [192, 128]);
  assert.equal(project.area.outline, undefined);
  const result = evaluate(project);
  assertFits(result, project.name);

  const open = result.ports.filter(({ joined, type }) => !joined && type === "regular");
  assert.equal(open.length, 4);
  for (const [lane, offset] of [
    ["outer", 8],
    ["inner", 24],
  ]) {
    const start = open.find((port) => endpointKey(port) === endpointKey(west[lane]));
    const end = open.find((port) => endpointKey(port) === endpointKey(east[lane]));
    assert.ok(Math.hypot(start.x, start.y - (offset + 32)) < 0.05);
    assert.ok(Math.hypot(end.x - 192, end.y - offset) < 0.05);
    assert.deepEqual(
      [start.angle, end.angle, start.heightPlates, end.heightPlates],
      [180, 0, 2, 2],
    );
    const route = traceRoute(result.routes, west[lane], east[lane]);
    assert.ok(route);
    const curvePorts = route
      .filter(({ event }) => event === "curve")
      .flatMap(({ from, to }) => [from, to])
      .map((endpoint) => result.ports.find((port) => endpointKey(port) === endpointKey(endpoint)));
    assert.ok(curvePorts.length);
    assert.ok(curvePorts.every(Boolean));
    const first = Math.min(...curvePorts.map(({ x }) => x));
    const last = Math.max(...curvePorts.map(({ x }) => x));
    assert.ok(Math.abs((first + last) / 2 - project.area.width / 2) < 0.05);
  }
});

test("shifting the entire public edge reports the misaligned handoffs", () => {
  const project = template("member-straight");
  const full = moveOutlineEdge(project.area, 0, 32);
  assert.equal(full.frontLines.north, -32);
  assert.equal(
    evaluate({ ...project, area: full }).niltcIssues.filter(
      ({ kind }) => kind === "exit-off-standard",
    ).length,
    4,
  );
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
    assertFits(result, name);

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
    const handoffs = [west.outer, west.inner, east.outer, east.inner];
    const storageEnds = result.ports.filter(
      (port) =>
        port.type === "regular" &&
        !port.joined &&
        !handoffs.some((handoff) => endpointKey(handoff) === endpointKey(port)),
    );
    if (code === "PT40") {
      const eastSpur = storageEnds.find(({ x }) => x > 191.95);
      assert.ok(eastSpur && reaches(result.routes, west.outer, eastSpur));
      assert.ok(!reaches(result.routes, west.inner, eastSpur));
      continue;
    }
    for (const end of storageEnds) {
      assert.ok(
        handoffs.some((handoff) => reaches(result.routes, handoff, end)),
        `${name} connects ${end.pieceId} to a mainline`,
      );
    }
    const servedEnds = { PFS: 2, "4TRY": 3, PFS40: 1 };
    if (code in servedEnds) {
      assert.equal(storageEnds.length, servedEnds[code], name);
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

function assertFits(analysis, name) {
  assert.deepEqual(analysis.niltcIssues, [], `${name} preserves the required mainline geometry`);
  assert.deepEqual(analysis.overhangs, [], `${name} fits inside the design area`);
  assert.deepEqual(analysis.unresolved, [], `${name} contains supported track`);
  assert.deepEqual(placementWarnings(analysis, catalog), [], `${name} has no placement warnings`);
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

function reaches(routes, start, target) {
  return traceRoute(routes, start, target) !== undefined;
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
