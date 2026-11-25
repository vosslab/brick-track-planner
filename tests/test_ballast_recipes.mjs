import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const recipes = JSON.parse(
  readFileSync(new URL("../data/ballast_recipes.json", import.meta.url), "utf8"),
);
const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const buildReferences = JSON.parse(
  readFileSync(new URL("../data/build_references.json", import.meta.url), "utf8"),
);
const physicalPartIds = new Set(catalog.parts.map(({ id }) => id));

test("ballast recipes match the reference sheets and exact supported catalog parts", () => {
  assert.deepEqual(
    recipes.map(({ id, revision, trackPartIds, materials }) => ({
      id,
      revision,
      trackPartIds,
      quantity: materials.reduce((total, { quantity }) => total + quantity, 0),
    })),
    [
      {
        id: "pennlug-r104",
        revision: "022A",
        trackPartIds: ["bricktracks:r104", "trixbrix:r104"],
        quantity: 71,
      },
      { id: "pennlug-r120", revision: "023B", trackPartIds: ["bricktracks:r120"], quantity: 98 },
    ],
  );
  for (const { id, trackPartIds, materials } of recipes) {
    assert.ok(
      trackPartIds.every((partId) => physicalPartIds.has(partId)),
      id,
    );
    const materialKeys = materials.map(({ partId, color }) => `${partId}:${color}`);
    assert.equal(new Set(materialKeys).size, materials.length, id);
    for (const { partId, name, color, quantity } of materials) {
      assert.match(partId, /^\d+$/);
      assert.ok(name);
      assert.match(color, /^[a-z]+(?:-[a-z]+)*$/);
      assert.ok(Number.isInteger(quantity) && quantity > 0);
    }
  }
});
test("the NILTC reference snapshot includes both local standard diagrams", () => {
  const directory = new URL("../docs/references/niltc-track-specifications/", import.meta.url);
  const page = readFileSync(new URL("index.html", directory), "utf8");
  assert.match(page, /double-straight-standard\.jpg/);
  assert.match(page, /r120-r104-curve-standard\.png/);
  assert.ok(existsSync(new URL("double-straight-standard.jpg", directory)));
  assert.ok(existsSync(new URL("r120-r104-curve-standard.png", directory)));
  assert.ok(existsSync(new URL("source.html", directory)));
});

test("switch and return-curve instructions bind only to the LEGO RC arrangement", () => {
  assert.deepEqual(
    buildReferences.map(({ arrangementIds }) => arrangementIds),
    [["lego:rc-r40-right-switch-return"], ["lego:rc-r40-right-switch-return"]],
  );
  for (const reference of buildReferences) {
    assert.match(reference.source, /^https:\/\/l-gauge\.org\/downloads\/Ref01[67]/);
    assert.ok(reference.title && reference.description);
  }
  const kit = catalog.kits.find(({ id }) => id === "lego:rc-r40-right-switch-return");
  assert.deepEqual(
    kit?.parts.map(({ partId }) => partId),
    ["lego:rc-r40-right-switch", "lego:rc-r40", "lego:rc-s16", "lego:rc-s16"],
  );
  assert.match(kit?.notes ?? "", /016A.*017A/);
  assert.ok(kit?.parts.every(({ partId }) => partId.startsWith("lego:")));
});
