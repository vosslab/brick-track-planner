import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseProject } from "../src/project.ts";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

test("packaged member examples use one design area", () => {
  for (const name of ["member-straight", "member-corner", "member-yard"]) {
    const project = parseProject(read(`../examples/${name}.btp.json`));
    assert.equal(project.version, 3);
    assert.ok(project.area.width > 0);
    assert.ok(project.area.depth > 0);
    assert.ok(project.items.length > 0);
    assert.equal("tables" in project, false);
  }
});

test("the straight example has two named NILTC handoffs", () => {
  const project = parseProject(read("../examples/member-straight.btp.json"));
  assert.equal(project.area.niltc, "straight");
  assert.equal(project.area.exits.length, 2);
  assert.deepEqual(
    project.area.exits.map(({ edge }) => edge),
    ["west", "east"],
  );
});

test("the yard example has a full-height R104 yard on the inner mainline", () => {
  const project = parseProject(read("../examples/member-yard.btp.json"));
  const yard = project.items.filter(
    ({ kind, groupId }) => kind === "track" && groupId === "r104-right-yard",
  );
  assert.equal(project.area.niltc, "straight");
  assert.equal(project.area.exits.length, 2);
  assert.equal(yard.length, 35);
  assert.ok(yard.some(({ partId }) => partId === "trixbrix:r104-right-base"));
  assert.ok(yard.some(({ partId }) => partId === "trixbrix:rc1"));
  assert.ok(yard.every(({ heightPlates }) => heightPlates === 2));
  assert.ok(yard.every(({ arrangementId }) => arrangementId === "trixbrix:r104-right-yard-4"));
});

test("the Rust route graph reaches all four yard outputs", () => {
  const fixture = new URL("../examples/member-yard.btp.json", import.meta.url).pathname;
  const result = JSON.parse(
    execFileSync("cargo", ["run", "--quiet", "--example", "oracle", fixture], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    }),
  );
  assert.deepEqual(result.niltcIssues, []);
  const yardIds = new Set(
    result.project.items.filter(({ groupId }) => groupId === "r104-right-yard").map(({ id }) => id),
  );
  const outputs = result.ports.filter(
    ({ pieceId, type, joined }) => yardIds.has(pieceId) && type === "regular" && !joined,
  );
  const start = result.project.area.exits[0].inner;
  const targets = [result.project.area.exits[1].inner, ...outputs];
  assert.equal(targets.length, 4, "three storage outputs plus the inner through mainline");
  for (const target of targets) assert.ok(reaches(result.routes, start, target));
});

test("the U-shaped staging example is a fitting connected general-area plan", () => {
  const fixture = new URL("../examples/u-shaped-staging.btp.json", import.meta.url).pathname;
  const project = parseProject(read("../examples/u-shaped-staging.btp.json"));
  assert.equal(project.name, "U-shaped staging layout");
  assert.equal(project.area.niltc, undefined);
  assert.equal(project.area.exits.length, 0);
  assert.ok(project.items.some(({ groupId }) => groupId === "staging-siding"));

  const result = JSON.parse(
    execFileSync("cargo", ["run", "--quiet", "--example", "oracle", fixture], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    }),
  );
  assert.deepEqual(result.overhangs, []);
  const open = result.ports.filter(({ type, joined }) => type === "regular" && !joined);
  assert.equal(open.length, 3, "two U-run ends plus the staging-siding end");
  assert.ok(reaches(result.routes, open[0], open[1]));
  assert.ok(reaches(result.routes, open[0], open[2]));
});

test("the U-shaped staging layout is a selectable packaged example", () => {
  const picker = read("../src/editor_files.ts");
  assert.match(picker, /u-shaped-staging\.btp\.json/);
  assert.match(picker, /U-shaped staging layout/);
});

function reaches(routes, start, target) {
  const key = ({ pieceId, portId }) => `${pieceId}\u0000${portId}`;
  const neighbours = new Map();
  for (const route of routes) {
    for (const [from, to] of [
      [route.from, route.to],
      [route.to, route.from],
    ]) {
      const links = neighbours.get(key(from)) ?? [];
      links.push({ endpoint: key(to), kind: route.kind });
      neighbours.set(key(from), links);
    }
  }
  const pending = [{ endpoint: key(start), prior: undefined }];
  const seen = new Set([`${key(start)}\u0000`]);
  while (pending.length) {
    const current = pending.shift();
    if (current.endpoint === key(target)) return true;
    for (const link of neighbours.get(current.endpoint) ?? []) {
      if (link.kind === current.prior) continue;
      const state = `${link.endpoint}\u0000${link.kind}`;
      if (!seen.has(state)) {
        seen.add(state);
        pending.push({ endpoint: link.endpoint, prior: link.kind });
      }
    }
  }
  return false;
}
