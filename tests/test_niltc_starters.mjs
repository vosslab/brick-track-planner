import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  areaToSignupDimensions,
  createNiltcStarter,
  signupToAreaDimensions,
} from "../src/niltc_starters.ts";
import { composePose, validateProject } from "../src/project.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const tolerance = 1e-6;

function worldPort(item, portId) {
  const part = catalog.parts.find(({ id }) => id === item.partId);
  return composePose(
    part.ports.find(({ id }) => id === portId),
    item,
  );
}

function assertJoinedMainlines(project) {
  const tracks = project.items.filter(({ kind }) => kind === "track");
  for (const lane of ["outer", "inner"]) {
    const laneTracks = tracks.filter(({ id }) => id.startsWith(`${lane}-`));
    for (let index = 1; index < laneTracks.length; index += 1) {
      const previous = worldPort(laneTracks[index - 1], "b");
      const current = worldPort(laneTracks[index], "a");
      assert.ok(Math.hypot(previous.x - current.x, previous.y - current.y) < tolerance);
      assert.equal((previous.angle - current.angle + 360) % 360, 180);
    }
  }
}

test("NILTC starters create a one-area project with RC/PF mainlines", () => {
  for (const [width, depth, mode, fronts] of [
    [128, 128, "straight", ["north"]],
    [192, 128, "straight", ["north"]],
    [192, 128, "corner", ["north", "west"]],
  ]) {
    const project = createNiltcStarter(catalog, { width, depth, mode, fronts });
    validateProject(project);
    assert.equal(project.version, 3);
    assert.deepEqual(
      [project.area.width, project.area.depth, project.area.niltc],
      [width, 128, mode],
    );
    assert.equal(project.area.exits.length, 2);
    assert.ok(
      project.items.every(
        ({ kind, partId, heightPlates }) =>
          kind !== "track" || (partId !== "lego:9v-s16" && heightPlates === 2),
      ),
    );
    assertJoinedMainlines(project);
  }
});

test("a curve fits 40 by 60 and names its rotated exits", () => {
  for (const [fronts, exits] of [
    [
      ["north", "west"],
      ["south", "east"],
    ],
    [
      ["north", "east"],
      ["west", "south"],
    ],
    [
      ["south", "east"],
      ["north", "west"],
    ],
    [
      ["south", "west"],
      ["east", "north"],
    ],
  ]) {
    const project = createNiltcStarter(catalog, { width: 128, depth: 192, mode: "corner", fronts });
    validateProject(project);
    assert.equal(project.items.filter(({ partId }) => partId === "bricktracks:r104").length, 8);
    assert.equal(project.items.filter(({ partId }) => partId === "bricktracks:r120").length, 8);
    assertJoinedMainlines(project);
    assert.deepEqual(
      project.area.exits.map(({ edge }) => edge),
      exits,
    );
    assert.ok(
      project.area.exits.every(
        ({ id, name, edge }) =>
          id === `exit-${edge}` && name === `${edge[0].toUpperCase()}${edge.slice(1)} exit`,
      ),
    );
  }
});

test("straight mainlines follow every public edge", () => {
  for (const front of ["north", "east", "south", "west"]) {
    const project = createNiltcStarter(catalog, {
      width: 192,
      depth: 128,
      mode: "straight",
      fronts: [front],
    });
    validateProject(project);
    assertJoinedMainlines(project);
    assert.equal(project.area.exits.length, 2);
  }
});

test("signup dimensions rotate with a straight public edge and stay fixed for corners", () => {
  const signup = { width: 192, depth: 128 };
  assert.deepEqual(signupToAreaDimensions(signup, ["north"]), signup);
  assert.deepEqual(signupToAreaDimensions(signup, ["east"]), { width: 128, depth: 192 });
  assert.deepEqual(areaToSignupDimensions({ width: 128, depth: 192 }, ["east"]), signup);
  for (const fronts of [
    ["north", "east"],
    ["east", "south"],
    ["south", "west"],
    ["west", "north"],
  ]) {
    assert.deepEqual(signupToAreaDimensions(signup, fronts), signup);
    assert.deepEqual(areaToSignupDimensions(signup, fronts), signup);
  }
  assert.deepEqual(signupToAreaDimensions(signup, []), signup);
  assert.deepEqual(areaToSignupDimensions(signup, []), signup);
});

test("custom-length track and invalid curve areas", () => {
  const custom = createNiltcStarter(catalog, {
    width: 197,
    depth: 32,
    mode: "straight",
    fronts: ["north"],
  });
  assertJoinedMainlines(custom);
  assert.ok(custom.items.some(({ partId }) => partId === "trixbrix:s01"));
  assert.throws(() =>
    createNiltcStarter(catalog, {
      width: 96,
      depth: 128,
      mode: "corner",
      fronts: ["north", "west"],
    }),
  );
  assert.throws(() =>
    createNiltcStarter(catalog, { width: 4097, depth: 32, mode: "straight", fronts: ["north"] }),
  );
});
