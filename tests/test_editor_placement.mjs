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
  sameDestination,
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
    heightPlates: 0,
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

test("valid snaps within the tie distance place on the grid", () => {
  const { context, preview } = setup(
    [straight("moving", 40, 40)],
    [straight("lower", 72, 43), straight("higher", 72, 53)],
  );
  const destination = (y) =>
    chooseDestination(context, { x: 16, y }, 6, false, undefined, { tieDistance: 0.25 });
  const tiedAtLimit = destination(7.875);
  const untied = destination(7.75);
  assert.ok(sameDestination(tiedAtLimit, destination(7.9375)));
  assert.ok(!sameDestination(tiedAtLimit, untied));
  assert.equal(preview(untied).snap?.to.pieceId, "lower");

  const tied = preview(tiedAtLimit);
  assert.equal(tied.placement, "grid");
  assert.equal(tied.gridFallback, "tie");
  assert.equal(tied.items[0].y, 48);
  assert.match(tied.message, /equally close/);
});

test("one translation can produce multiple joints without a tie", () => {
  const { context, preview } = setup(
    [straight("moving1", 40, 40), straight("moving2", 40, 56), straight("moving3", 40, 72)],
    [
      straight("ambiguous", 72, 40),
      straight("competing", 72.02, 40),
      straight("joint2", 72, 56),
      straight("joint3", 72, 72),
    ],
  );
  const destination = chooseDestination(context, { x: 16, y: 0 }, 2, false, undefined, {
    tieDistance: 0.25,
  });
  const result = preview(destination);
  assert.equal(result.placement, "rail");
  assert.equal(result.items[0].x, 56);
  assert.ok(["joint2", "joint3"].includes(result.snap?.to.pieceId));

  const decimal = setup(
    [straight("moving1", 40.1, 40), straight("moving2", 10.1, 56)],
    [straight("joint1", 72.1, 40), straight("joint2", 42.1, 56)],
  );
  const decimalResult = decimal.preview(
    chooseDestination(decimal.context, { x: 16, y: 0 }, 2, false, undefined, { tieDistance: 0.25 }),
  );
  assert.equal(decimalResult.placement, "rail");
  assert.equal(decimalResult.items[0].x, 56.1);
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
