import { expect } from "@playwright/test";

import { newProject } from "../../src/project";
import { test } from "./helper_planner";

test("reveals shared LEGO details on zoom and retains unaffected SVG nodes on edit", async ({
  planner,
}) => {
  const project = newProject();
  project.name = "Track detail";
  project.tables.push({
    id: "table",
    name: "Table",
    layerId: "layout",
    x: 0,
    y: 0,
    angle: 0,
    width: 320,
    depth: 192,
    fronts: ["north"],
  });
  const attached = { layerId: "layout", tableId: "table", angle: 0 };
  project.items.push(
    { ...attached, id: "plate-a", kind: "baseplate", x: 144, y: 80, color: "#648754" },
    { ...attached, id: "plate-b", kind: "baseplate", x: 176, y: 80, color: "#648754" },
    {
      ...attached,
      id: "move",
      kind: "track",
      partId: "lego:9v-s16",
      x: 144,
      y: 80,
      heightPlates: 0,
      ballast: "pennlug",
    },
    {
      ...attached,
      id: "stay",
      kind: "track",
      partId: "lego:9v-s16",
      x: 176,
      y: 80,
      heightPlates: 0,
    },
  );
  const [chooser] = await Promise.all([
    planner.waitForEvent("filechooser"),
    planner.getByRole("button", { name: "Open", exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: "track-detail.btp.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });

  const scene = planner.locator("#tabletop svg[data-track-scene]");
  const studs = scene.locator("[data-baseplate-studs]");
  const move = scene.locator("#scene-item-move");
  const stay = scene.locator("#scene-item-stay");
  await expect(studs).toHaveCount(2);
  await expect(scene.locator('pattern[data-stud-color="#648754"]')).toHaveCount(1);
  await expect(scene.locator('[data-ballast-shoulder="pennlug"]')).toHaveCount(1);
  const sharedPartId = await stay.locator(":scope > use").getAttribute("href");
  expect(sharedPartId).toMatch(/^#track-scene-/);
  await expect(move.locator(":scope > use")).toHaveAttribute("href", sharedPartId ?? "");
  await expect(scene).toHaveAttribute("data-scene-detail", "overview");
  await expect(studs.first()).toHaveCSS("display", "none");

  const zoom = planner.getByRole("button", { name: "Zoom in", exact: true });
  for (
    let step = 0;
    step < 15 && (await scene.getAttribute("data-scene-detail")) !== "close";
    step++
  ) {
    await zoom.click();
  }
  await expect(studs.first()).toHaveCSS("display", "inline");

  await move.press("Enter");
  const fixedPiece = await stay.elementHandle();
  const fixedPort = await scene.locator('[data-piece-id="stay"][data-port-id="a"]').elementHandle();
  await planner.getByRole("spinbutton", { name: "Y (studs)" }).fill("82");
  await planner.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(move).toHaveAttribute("transform", "translate(144 82) rotate(0)");
  expect(await fixedPiece.evaluate((piece) => piece.isConnected)).toBe(true);
  expect(await fixedPort.evaluate((port) => port.isConnected)).toBe(true);
  await expect(scene).toHaveAttribute("data-scene-detail", "close");
});
