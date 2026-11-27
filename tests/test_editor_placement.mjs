import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync } from "../generated/wasm/track_geometry.js";
import {
  chooseDestination,
  endpointKey,
  preferredTranslationEnd,
  prepareTranslation,
  previewTranslation,
} from "../src/editor_placement.ts";
import { evaluate } from "../src/engine.ts";
import { newProject } from "../src/project.ts";

initSync({
  module: readFileSync(new URL("../generated/wasm/track_geometry_bg.wasm", import.meta.url)),
});

function straight(id, x, y) {
  return {
    id,
    x,
    y,
    angle: 0,
    kind: "track",
    partId: "lego:rc-s16",
    layerId: "layout",
  };
}

function setup(moving, stationary) {
  const analysis = evaluate({ ...newProject(), items: [...moving, ...stationary] });
  const context = prepareTranslation(analysis, moving);
  return {
    context,
    preview: (destination) => previewTranslation(analysis, context, moving, destination),
  };
}

test("a blocked nearest join falls back unless the user chose that exact target", () => {
  const { context, preview } = setup(
    [straight("moving", 40, 40)],
    [straight("near", 72, 40), straight("competing", 72.02, 40), straight("alternate", 72, 48)],
  );
  const intended = { x: 16, y: 0 };
  const alternate = preview(chooseDestination(context, intended, 10, false));
  assert.equal(alternate.snap?.to.pieceId, "alternate");
  assert.equal(alternate.items[0].y, 48);

  const nearEnd = endpointKey({ pieceId: "near", portId: "a" });
  const explicitNear = preview(chooseDestination(context, intended, 10, false, nearEnd));
  assert.equal(explicitNear.placement, "grid");
  assert.equal(explicitNear.gridFallback, "missed");
  assert.match(explicitNear.message, /Could not snap/);

  const alternateEnd = endpointKey({ pieceId: "alternate", portId: "a" });
  const explicitAlternate = preview(chooseDestination(context, intended, 1, false, alternateEnd));
  assert.equal(explicitAlternate.snap?.to.pieceId, "alternate");
});

test("the grabbed rail end takes priority if it can join", () => {
  const moving = [straight("moving", 40, 40)];
  const west = straight("west", 40, 46);
  const east = straight("east", 72, 40);
  const intended = { x: 16, y: 0 };
  const grabbed = { x: 31, y: 40 };
  const clean = setup(moving, [east, west]);
  const preferredSourceEnd = preferredTranslationEnd(clean.context, "moving", grabbed, 2);
  assert.equal(preferredSourceEnd, endpointKey({ pieceId: "moving", portId: "a" }));
  const options = { preferredSourceEnd, tieDistance: 0.25 };
  const preferred = clean.preview(
    chooseDestination(clean.context, intended, 8, false, undefined, options),
  );
  assert.equal(preferred.snap?.to.pieceId, "west");

  const blocked = setup(moving, [east, west, straight("competing", 40.02, 46)]);
  const fallback = blocked.preview(
    chooseDestination(blocked.context, intended, 8, false, undefined, options),
  );
  assert.equal(fallback.snap?.to.pieceId, "east");
});
