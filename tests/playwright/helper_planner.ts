import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test as base } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import catalog from "../../data/catalog.json" with { type: "json" };
import { openTrackPlan, saveTrackPlan } from "../../src/ldraw";
import type { Catalog, Project, TrackItem } from "../../src/project";

// The propagated JS path anchor has no TypeScript declaration.
// @ts-expect-error JavaScript path anchor
import { REPO_ROOT } from "./repo_root.mjs";

export function example(name: string): string {
  return resolve(REPO_ROOT as string, "examples", name);
}

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/brick-track-planner/")) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

export async function boot(page: Page, { startProject = true } = {}): Promise<void> {
  const [wasm, document] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/wasm/track_geometry_bg.wasm")),
    page.goto("./"),
  ]);
  expect(document?.ok()).toBe(true);
  expect(new URL(page.url()).pathname).toBe("/brick-track-planner/");
  expect(wasm.ok()).toBe(true);
  expect(wasm.headers()["content-type"]).toBe("application/wasm");
  await expect(
    page.getByRole("heading", { name: "Start with your assigned display area" }),
  ).toBeVisible();
  await expect(page.locator("#editor")).toBeHidden();
  if (startProject) await createProject(page);
}

export async function createProject(
  page: Page,
  {
    assignment = "straight",
    width = "192",
    depth = "128",
    name = "My NILTC layout",
  }: {
    assignment?: "straight" | "corner" | "general";
    width?: string;
    depth?: string;
    name?: string;
  } = {},
): Promise<void> {
  const form = page.locator("#area-form");
  await form.getByLabel("Design name").fill(name);
  await form.locator(`input[name="assignment"][value="${assignment}"]`).check();
  await form.locator("#area-width").selectOption(width);
  await form.locator("#area-depth").selectOption(depth);
  await form.getByRole("button", { name: "Create track plan", exact: true }).click();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.locator("#tabletop [data-track-scene]")).toBeVisible();
}

export const test = base.extend<{ planner: Page }>({
  async planner({ page }, use) {
    const errors = watchErrors(page);
    await boot(page);
    await use(page);
    expect(errors).toEqual([]);
  },
});

export async function chooseFile(page: Page, button: Locator, path: string): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button.click()]);
  await chooser.setFiles(path);
}

export async function saveProject(page: Page): Promise<{ path: string; project: Project }> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save track plan" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.ldr$/);
  const path = await download.path();
  const project = openTrackPlan(await readFile(path, "utf8"), catalog as Catalog);
  return { path, project };
}

type Pixel = { x: number; y: number };

export function drawingPoint(
  canvas: Locator,
  x: number,
  y: number,
): Promise<{ screen: Pixel; position: Pixel }> {
  return canvas.evaluate(
    (element, { x, y }) => {
      const matrix = element.querySelector<SVGGElement>("[data-scene-drawing]")!.getScreenCTM()!;
      const screen = new DOMPoint(x, y).matrixTransform(matrix);
      const { left, top } = element.getBoundingClientRect();
      return {
        screen: { x: screen.x, y: screen.y },
        position: { x: screen.x - left, y: screen.y - top },
      };
    },
    { x, y },
  );
}

export function straight(id: string, x: number, y: number, angle = 0, heightPlates = 0): TrackItem {
  return { id, x, y, angle, kind: "track", partId: "lego:rc-s16", layerId: "layout", heightPlates };
}

export async function pickDrawing(
  canvas: Locator,
  hasTouch: boolean,
  x: number,
  y: number,
): Promise<void> {
  await canvas.scrollIntoViewIfNeeded();
  const { screen } = await drawingPoint(canvas, x, y);
  if (hasTouch) await canvas.page().touchscreen.tap(Math.round(screen.x), Math.round(screen.y));
  else await canvas.page().mouse.click(screen.x, screen.y);
}

export async function openEditingPlan(
  page: Page,
  items: TrackItem[],
  name = "Editing test yard",
): Promise<Project> {
  const project: Project = {
    version: 3,
    name,
    area: { width: 128, depth: 192, fronts: [], exits: [] },
    layers: [{ id: "layout", name: "Layout", visible: true }],
    items,
  };
  await page.locator("#project-file").setInputFiles({
    name: "yard.ldr",
    mimeType: "text/plain",
    buffer: Buffer.from(saveTrackPlan(project, catalog as Catalog)),
  });
  return project;
}
