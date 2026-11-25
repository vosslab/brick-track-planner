import { readFile } from "node:fs/promises";

import type { Page } from "@playwright/test";

import type { Analysis } from "../../src/engine";
import type { Project } from "../../src/project";

type Sample = { result?: Analysis; ms: number };

export async function evaluateWasm(
  page: Page,
  projects: string[],
  keepResults = true,
): Promise<Sample[]> {
  const bindings = await readFile("generated/wasm/track_geometry.js", "utf8");
  return page.evaluate(
    async ({ bindings, projects, keepResults }) => {
      const url = URL.createObjectURL(new Blob([bindings], { type: "text/javascript" }));
      const engine: {
        default: (input: { module_or_path: URL }) => Promise<unknown>;
        evaluate_json: (project: string, draft: string) => string;
      } = await import(url);
      URL.revokeObjectURL(url);
      const wasm = new URL("./wasm/track_geometry_bg.wasm", location.href);
      await engine.default({ module_or_path: wasm });
      return projects.map((json) => {
        const project = JSON.parse(json) as Project;
        const start = performance.now();
        const result = JSON.parse(engine.evaluate_json(JSON.stringify(project), "")) as Analysis;
        return { result: keepResults ? result : undefined, ms: performance.now() - start };
      });
    },
    { bindings, projects, keepResults },
  );
}
