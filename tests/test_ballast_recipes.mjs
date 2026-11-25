import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const recipes = JSON.parse(
  readFileSync(new URL("../data/ballast_recipes.json", import.meta.url), "utf8"),
);
const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
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
      { id: "pennlug-s16", revision: "001A", trackPartIds: ["lego:9v-s16"], quantity: 44 },
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

test("the two colors of the straight's 2 x 8 plate remain separate materials", () => {
  const { materials } = recipes.find(({ id }) => id === "pennlug-s16");
  assert.deepEqual(
    materials
      .filter(({ partId }) => partId === "3034")
      .map(({ color, quantity }) => [color, quantity]),
    [
      ["red", 4],
      ["dark-bluish-gray", 4],
    ],
  );
});
