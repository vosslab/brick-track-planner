import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

import { test } from "./helper_planner";

test.skip(({ isMobile }) => isMobile, "trackpad navigation is a desktop interaction");

// Tabletop wheel input is owned by src/editor_camera.ts. The viewBox is the stable camera state.
function viewBox(value: string | null): number[] {
  if (!value) throw new Error("The tabletop camera has no viewBox.");
  return value.split(/\s+/u).map(Number);
}

async function worldAtScreenPoint(
  scene: Locator,
  clientX: number,
  clientY: number,
): Promise<[number, number]> {
  return scene.evaluate(
    (svg, point) => {
      if (!(svg instanceof SVGSVGElement)) throw new Error("The tabletop camera is not an SVG.");
      const ctm = svg.getScreenCTM();
      if (!ctm) throw new Error("The tabletop camera is not rendered.");
      const world = new DOMPoint(point.clientX, point.clientY).matrixTransform(ctm.inverse());
      return [world.x, world.y];
    },
    { clientX, clientY },
  );
}

async function wheel(
  tabletop: Locator,
  options: {
    clientX: number;
    clientY: number;
    deltaX?: number;
    deltaY?: number;
    ctrlKey?: boolean;
  },
): Promise<void> {
  await tabletop.dispatchEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...options,
  });
}

test("uses trackpad scrolling, pinching, and Space-dragging to navigate the tabletop", async ({
  planner,
}) => {
  await planner.getByLabel("Example layouts").selectOption({ label: "Two-section seam" });
  const scene = planner.locator("[data-track-scene]");
  const tabletop = planner.getByRole("group", { name: "Tabletop canvas" });
  const tabletopBox = await tabletop.boundingBox();
  expect(tabletopBox).not.toBeNull();
  // WheelEvent client coordinates are integer CSS pixels in Chromium and WebKit.
  const clientX = Math.round(tabletopBox!.x + tabletopBox!.width * 0.61);
  const clientY = Math.round(tabletopBox!.y + tabletopBox!.height * 0.43);

  const initial = viewBox(await scene.getAttribute("viewBox"));
  await wheel(tabletop, { clientX, clientY, deltaX: 48, deltaY: 32 });
  const panned = viewBox(await scene.getAttribute("viewBox"));
  expect(panned.slice(2)).toEqual(initial.slice(2));
  expect(panned.slice(0, 2)).not.toEqual(initial.slice(0, 2));

  const anchorBeforePinch = await worldAtScreenPoint(scene, clientX, clientY);
  await wheel(tabletop, { clientX, clientY, deltaY: -80, ctrlKey: true });
  const zoomed = viewBox(await scene.getAttribute("viewBox"));
  expect(zoomed[2]).toBeLessThan(panned[2] ?? Infinity);
  expect(zoomed[3]).toBeLessThan(panned[3] ?? Infinity);
  const anchorAfterPinch = await worldAtScreenPoint(scene, clientX, clientY);
  expect(anchorAfterPinch[0]).toBeCloseTo(anchorBeforePinch[0], 4);
  expect(anchorAfterPinch[1]).toBeCloseTo(anchorBeforePinch[1], 4);

  await wheel(tabletop, { clientX, clientY, deltaY: 80, ctrlKey: true });
  const unzoomed = viewBox(await scene.getAttribute("viewBox"));
  expect(unzoomed[2]).toBeGreaterThan(zoomed[2] ?? 0);
  expect(unzoomed[3]).toBeGreaterThan(zoomed[3] ?? 0);

  const track = scene.locator('[data-piece-id="inner-span"][data-kind="track"]');
  const trackBox = await track.boundingBox();
  expect(trackBox).not.toBeNull();
  const transformBeforeDrag = await track.getAttribute("transform");
  expect(transformBeforeDrag).not.toBeNull();
  const beforeSpaceDrag = viewBox(await scene.getAttribute("viewBox"));
  await tabletop.focus();
  await planner.keyboard.down("Space");
  await planner.mouse.move(trackBox!.x + trackBox!.width / 2, trackBox!.y + trackBox!.height / 2);
  await planner.mouse.down();
  await planner.mouse.move(
    trackBox!.x + trackBox!.width / 2 + 50,
    trackBox!.y + trackBox!.height / 2 + 30,
  );
  await planner.mouse.up();
  await planner.keyboard.up("Space");
  const afterSpaceDrag = viewBox(await scene.getAttribute("viewBox"));
  expect(afterSpaceDrag.slice(2)).toEqual(beforeSpaceDrag.slice(2));
  expect(afterSpaceDrag.slice(0, 2)).not.toEqual(beforeSpaceDrag.slice(0, 2));
  await expect(track).toHaveAttribute("transform", transformBeforeDrag!);
});
