import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test as base } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { Project } from "../../src/project";

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

export async function boot(page: Page, { startAdvanced = true } = {}): Promise<void> {
  const [wasm, document] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/wasm/track_geometry_bg.wasm")),
    page.goto("./"),
  ]);
  expect(document?.ok()).toBe(true);
  expect(new URL(page.url()).pathname).toBe("/brick-track-planner/");
  expect(wasm.ok()).toBe(true);
  expect(wasm.headers()["content-type"]).toBe("application/wasm");
  const start = page.getByRole("button", { name: "New design", exact: true });
  await expect(start).toBeVisible();
  if (startAdvanced) {
    await start.click();
    await page.getByRole("button", { name: "Create track plan", exact: true }).click();
    await expect(page.locator("#tabletop [data-track-scene]")).toBeVisible();
  }
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
    page.getByRole("button", { name: "Save project" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.btp\.json$/);
  const path = await download.path();
  const project = JSON.parse(await readFile(path, "utf8")) as Project;
  return { path, project };
}
