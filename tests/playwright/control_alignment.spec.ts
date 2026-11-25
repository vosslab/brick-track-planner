import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

import { expect } from "@playwright/test";
import type { Locator, TestInfo } from "@playwright/test";

import straightExamples from "../../data/straight_examples.json" with { type: "json" };
import { boot, chooseFile, createProject, example, test, watchErrors } from "./helper_planner";

// Group selectors identify the header and project bar (src/index.html:14),
// track controls (src/index.html:70), inspector (src/index.html:194), and dialogs (src/index.html:318).
const viewports = [
  { width: 360, height: 780 },
  { width: 600, height: 840 },
  { width: 751, height: 800 },
  { width: 1280, height: 800 },
];
const tolerance = 0.25;

type Rectangle = Pick<DOMRectReadOnly, "left" | "right" | "top" | "bottom" | "width" | "height">;
type Control = Rectangle & { name: string };
type ControlGroup = {
  bounds: Rectangle;
  columnGap: number;
  rowGap: number;
  controls: Control[];
};

function measure(scope: Locator, selector: string): Promise<ControlGroup> {
  return scope.evaluate((group, selector) => {
    const rect = (element: Element): Rectangle => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const style = getComputedStyle(group);
    return {
      bounds: rect(group),
      columnGap: Number.parseFloat(style.columnGap) || 0,
      rowGap: Number.parseFloat(style.rowGap) || 0,
      controls: Array.from(group.querySelectorAll(selector), (element) => ({
        name:
          element.id ||
          element.getAttribute("aria-label") ||
          element.textContent?.trim() ||
          element.tagName,
        ...rect(element),
      })).filter(({ width, height }) => width > 0 && height > 0),
    };
  }, selector);
}

function close(actual: number, expected: number, message: string): void {
  expect
    .soft(Math.abs(actual - expected), `${message}: ${actual} px vs ${expected} px`)
    .toBeLessThanOrEqual(tolerance);
}

async function capture(target: Locator, info: TestInfo, name: string): Promise<void> {
  const png = await target.screenshot({ animations: "disabled", caret: "hide", scale: "css" });
  execFileSync("cwebp", ["-quiet", "-q", "90", "-o", info.outputPath(`${name}.webp`), "--", "-"], {
    input: png,
  });
}

for (const viewport of viewports) {
  test(`control alignment at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    const evidence: Record<string, ControlGroup> = {};
    const inspect = async (
      name: string,
      scope: string,
      selector: string,
      count: number,
    ): Promise<Control[]> => {
      const result = await measure(page.locator(scope), selector);
      evidence[name] = result;
      expect.soft(result.controls, `${name} visible controls`).toHaveLength(count);
      for (const control of result.controls) {
        expect
          .soft(control.left, `${name} ${control.name} left edge is inside the group`)
          .toBeGreaterThanOrEqual(result.bounds.left - tolerance);
        expect
          .soft(control.right, `${name} ${control.name} right edge is inside the group`)
          .toBeLessThanOrEqual(result.bounds.right + tolerance);
      }
      return result.controls;
    };
    const rows = async (
      name: string,
      scope: string,
      count: number,
      selector = "button, select",
    ): Promise<void> => {
      const controls = await inspect(name, scope, selector, count);
      const { columnGap, rowGap } = evidence[name]!;
      let first: Control | undefined;
      let previous: Control | undefined;
      for (const control of controls) {
        if (!first || control.top >= first.bottom - tolerance) {
          if (first)
            close(control.top - first.bottom, rowGap, `${name} gap before ${control.name}`);
          first = control;
        } else if (previous) {
          close(control.top, first.top, `${name} ${control.name} top edge`);
          close(control.bottom, first.bottom, `${name} ${control.name} bottom edge`);
          close(control.left - previous.right, columnGap, `${name} gap before ${control.name}`);
        }
        previous = control;
      }
    };
    const column = async (
      name: string,
      scope: string,
      selector: string,
      count: number,
    ): Promise<void> => {
      const [first, ...others] = await inspect(name, scope, selector, count);
      if (!first) return;
      const { bounds } = evidence[name]!;
      close(first.left - bounds.left, bounds.right - first.right, `${name} left/right inset`);
      for (const control of others) {
        close(control.left, first.left, `${name} ${control.name} left edge`);
        close(control.right, first.right, `${name} ${control.name} right edge`);
      }
    };
    const shot = (name: string, selector: string): Promise<void> =>
      capture(page.locator(selector), info, name);

    const errors = watchErrors(page);
    await page.setViewportSize(viewport);
    try {
      await boot(page, { startProject: false });
      await expect(page.getByRole("button", { name: "Create track plan" })).toBeVisible();
      await shot("01_startup", ".start-card");
      await rows("Startup actions", ".start-alternatives > div", 3);
      await rows("Assigned dimensions", "#area-form .area-measurements", 2);

      await page.getByRole("button", { name: "Browse straight examples" }).click();
      await expect(page.locator(".template-card svg")).toHaveCount(straightExamples.length);
      await shot("02_example_gallery", "#template-gallery");
      await rows(
        "Example cards",
        "#template-gallery-cards",
        straightExamples.length,
        ".template-card",
      );
      await page.getByRole("button", { name: "Close", exact: true }).click();

      await createProject(page, { width: "128", depth: "192" });
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect.soft(horizontalOverflow, "The editor fits the viewport width").toBe(0);
      await rows("Add track modes", ".build-modes", 2, "label");
      const modes = await inspect("Add track panel", ".library", ".build-modes label", 2);
      if (modes.length === 2) {
        const { bounds } = evidence["Add track panel"]!;
        const left = Math.min(...modes.map((mode) => mode.left)) - bounds.left;
        const right = bounds.right - Math.max(...modes.map((mode) => mode.right));
        close(left, right, "Add track mode insets against the panel edges");
        close(modes[0]!.width, modes[1]!.width, "Add track mode widths");
        expect.soft(left, "Add track modes have room inside the panel border").toBeGreaterThan(10);
      }
      const modeLines = await page.locator(".build-modes label").evaluateAll((labels) =>
        labels.map((label) => {
          const text = Array.from(label.childNodes).find(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          );
          if (!text) return 0;
          const range = new Range();
          range.selectNodeContents(text);
          return new Set(Array.from(range.getClientRects(), ({ top }) => top)).size;
        }),
      );
      expect.soft(modeLines, "Each Add track mode label fits on one line").toEqual([1, 1]);
      await shot("03_raster_controls", ".app-header");
      await rows("File controls", ".file-controls", 6);

      await page.getByLabel("Export format").selectOption("pdf");
      await expect(page.getByLabel("PDF mode")).toBeVisible();
      await shot("04_pdf_controls", ".app-header");
      await rows("PDF controls", ".file-controls", 6);

      await shot("05_project_controls", ".project-bar");
      await rows("Project actions", ".project-actions", 4);
      await page.getByRole("button", { name: "Fit view", exact: true }).click();
      await shot("06_canvas_controls", ".workbench");
      const toolbar = await inspect("Canvas toolbar", ".workbench", ".canvas-toolbar button", 3);
      const remove = toolbar.find(({ name }) => name === "remove-piece");
      if (remove) {
        const { bounds } = evidence["Canvas toolbar"]!;
        close(remove.left - bounds.left, bounds.right - remove.right, "Delete button centering");
      }
      await rows("Undo and Redo", ".toolbar-group", 2);
      await rows("Zoom controls", ".zoom-controls", 3);
      const zoom = evidence["Zoom controls"]!.controls;
      if (zoom.length === 3) close(zoom[0]!.width, zoom[2]!.width, "Zoom in/out width");

      await page.getByRole("button", { name: "Design area", exact: true }).click();
      await shot("07_design_area_dialog", "#area-dialog");
      await rows("Area dialog actions", "#area-dialog .dialog-actions", 2);
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

      const preview = page.getByRole("button", { name: "Preview on track" });
      await page.locator("#placement-options summary").click();
      const storage = page.getByLabel("Extra storage track");
      await storage.selectOption("32");
      await page.getByLabel("Connect to").focus();
      await page.keyboard.press("Tab");
      await expect(storage).toBeFocused();
      await shot("08_arrangement_options", "#placement-options");
      await column(
        "Arrangement tools",
        "#arrangement-tools",
        "#arrangement, details, #preview-arrangement",
        3,
      );
      await column("Arrangement options", "#placement-options", "select", 2);

      await preview.click();
      await expect(page.getByRole("button", { name: "Add to layout" })).toBeEnabled();
      await expect(page.getByLabel("Fit location")).toBeVisible();
      await shot("09_arrangement_preview", "#arrangement-preview");
      await rows("Preview actions", ".arrangement-actions", 2);
      await page.getByRole("button", { name: "Cancel preview" }).click();
      await page.locator("#placement-options summary").click();
      await page.getByLabel("Siding, yard or junction").selectOption("trixbrix:r104-right-yard-4");
      await preview.click();
      await expect(page.locator("#arrangement-info")).not.toBeEmpty();
      await expect(page.getByRole("button", { name: "Add to layout" })).toBeHidden();
      await shot("10_arrangement_no_fit", ".library");

      await page.getByRole("radio", { name: "Single piece", exact: true }).check();
      await page.getByText("Connection options", { exact: true }).click();
      await shot("11_single_piece", "#piece-tools");
      await column(
        "Single piece tools",
        "#piece-tools",
        "#piece-choice, #piece-target, details, #extend-piece",
        4,
      );
      await shot("12_route_controls", ".inspector-controls");
      await column("Route controls", ".inspector-controls", "select, button", 2);

      await page.locator("#scene-item-inner-2").click();
      await page.getByText("Move track", { exact: true }).click();
      await shot("13_move_track", ".inspector-edit");
      await rows("Track position inputs", "#track-position .field-grid", 2, "input");
      await column("Track position form", "#track-position-form", ".field-grid, button", 2);

      await chooseFile(
        page,
        page.getByRole("button", { name: "Import BlueBrick" }),
        example("bluebrick-example.bbm"),
      );
      await expect(page.getByRole("dialog", { name: "Review BlueBrick import" })).toBeVisible();
      await shot("14_import_dialog", "#import-preview");
      await rows("Import dialog actions", "#import-preview .dialog-actions", 2);
      expect(errors).toEqual([]);
    } finally {
      await writeFile(info.outputPath("control-layout.json"), JSON.stringify(evidence, null, 2));
    }
  });
}
