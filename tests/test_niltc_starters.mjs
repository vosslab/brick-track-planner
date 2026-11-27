import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  areaToSignupDimensions,
  createNiltcStarter,
  signupToAreaDimensions,
} from "../src/niltc_starters.ts";
import { validateProject } from "../src/project.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));

test("a starter is a valid editable project with physical track", () => {
  const project = createNiltcStarter(catalog, {
    width: 192,
    depth: 128,
    mode: "straight",
    fronts: ["north"],
  });
  validateProject(project);
  assert.equal(project.area.width, 192);
  assert.equal(project.area.depth, 128);
  assert.ok(project.items.some(({ kind }) => kind === "track"));
});

test("signup dimensions describe the selected public edge", () => {
  const signup = { width: 192, depth: 128 };
  assert.deepEqual(signupToAreaDimensions(signup, ["north"]), signup);
  assert.deepEqual(signupToAreaDimensions(signup, ["east"]), { width: 128, depth: 192 });
  assert.deepEqual(areaToSignupDimensions({ width: 128, depth: 192 }, ["east"]), signup);
});
