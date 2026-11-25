import type { Analysis } from "./engine";
import { button, dialog, element, input, select, textNode } from "./editor_dom";
import { exportLDraw } from "./ldraw";
import { parseProject } from "./project";
import type { Catalog, Project } from "./project";
import { downloadBlob, importBlueBrick, MAX_BLUEBRICK_FILE_BYTES } from "./project_files";
import { exportSharing } from "./share";

type ImportReview = ReturnType<typeof importBlueBrick>;
const examples: [string, string][] = [
  ["two-section.btp.json", "Two-section seam"],
  ["double-corner.btp.json", "Double corner"],
  ["bluebrick-example.bbm", "BlueBrick stock table"],
];

export function setupFiles(
  catalog: Catalog,
  hooks: {
    analysis: () => Analysis;
    open: (project: Project) => void;
    notice: (message: string, error?: boolean) => void;
  },
): void {
  let importReview: ImportReview | undefined;
  let revision = 0;
  const preview = dialog("import-preview");
  const previewImport = (result: ImportReview): void => {
    importReview = result;
    const { tables, items } = result.project;
    const track = items.filter(({ kind }) => kind === "track").length;
    const baseplates = items.filter(({ kind }) => kind === "baseplate").length;
    const unresolved = items.length - track - baseplates;
    element("preview-name").textContent =
      `${result.project.name}: ${tables.length} tables, ${baseplates} baseplates, ` +
      `${track} track pieces, and ${unresolved} unresolved items.`;
    const warnings = result.warnings.map((warning) => textNode("li", warning));
    if (!warnings.length) warnings.push(textNode("li", "No import warnings."));
    element("import-warnings").replaceChildren(...warnings);
    element("import-error").textContent = "";
    preview.showModal();
  };

  preview.addEventListener("close", () => {
    importReview = undefined;
  });
  button("cancel-import").addEventListener("click", () => {
    preview.close();
    hooks.notice("Import canceled.");
  });
  button("confirm-import").addEventListener("click", () => {
    if (!importReview) return;
    try {
      hooks.open(importReview.project);
      preview.close();
    } catch (error) {
      hooks.notice(errorMessage(error), true);
    }
  });

  const processFile = async (fileInput: HTMLInputElement, bluebrick: boolean): Promise<void> => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    const version = ++revision;
    try {
      if (bluebrick && file.size > MAX_BLUEBRICK_FILE_BYTES) {
        throw new Error("BlueBrick files must be 8 MiB or smaller.");
      }
      const content = await file.text();
      if (version !== revision) return;
      if (bluebrick) previewImport(importBlueBrick(content, catalog));
      else hooks.open(parseProject(content));
    } catch (error) {
      if (version === revision) hooks.notice(errorMessage(error), true);
    }
  };

  button("open-project").addEventListener("click", () => input("project-file").click());
  input("project-file").addEventListener("change", () => {
    void processFile(input("project-file"), false);
  });
  button("import-project").addEventListener("click", () => input("import-file").click());
  input("import-file").addEventListener("change", () => {
    void processFile(input("import-file"), true);
  });

  button("save-project").addEventListener("click", () => {
    const { project } = hooks.analysis();
    downloadBlob(
      new Blob([JSON.stringify(project, null, 2) + "\n"], { type: "application/json" }),
      `${filename(project)}.btp.json`,
    );
    hooks.notice("Project downloaded.");
  });

  const exampleSelect = select("examples");
  for (const [file, name] of examples) {
    exampleSelect.add(new Option(name, file));
  }
  exampleSelect.addEventListener("change", () => {
    const file = exampleSelect.value;
    exampleSelect.value = "";
    if (!file) return;
    const version = ++revision;
    async function openExample(): Promise<void> {
      try {
        const response = await fetch(new URL(`./examples/${file}`, import.meta.url));
        if (!response.ok) throw new Error("Could not open the packaged example.");
        const content = await response.text();
        if (version !== revision) return;
        if (file.endsWith(".bbm")) previewImport(importBlueBrick(content, catalog));
        else hooks.open(parseProject(content));
      } catch (error) {
        if (version === revision) hooks.notice(errorMessage(error), true);
      }
    }
    void openExample();
  });

  const exportButton = button("export-layout");
  exportButton.addEventListener("click", () => {
    async function downloadLayout(): Promise<void> {
      const format = select("export-format").value;
      const analysis = hooks.analysis();
      const { project } = analysis;
      exportButton.disabled = true;
      try {
        if (format === "ldraw") {
          const report = exportLDraw(project, catalog);
          downloadBlob(new Blob([report.text], { type: "text/plain" }), `${filename(project)}.ldr`);
          if (report.omitted.length || report.custom.length) showLDrawReport(report);
        } else if (format === "png" || format === "webp" || format === "pdf") {
          const blob = await exportSharing(format, project, catalog, analysis);
          downloadBlob(blob, `${filename(project)}.${format}`);
        }
        hooks.notice(`${format === "ldraw" ? "LDraw" : format.toUpperCase()} downloaded.`);
      } catch (error) {
        hooks.notice(errorMessage(error), true);
      } finally {
        exportButton.disabled = false;
      }
    }
    void downloadLayout();
  });
}

function showLDrawReport(report: ReturnType<typeof exportLDraw>): void {
  const nodes: HTMLElement[] = [];
  if (report.omitted.length) {
    const list = document.createElement("ul");
    list.append(...report.omitted.map(({ name, count }) => textNode("li", `${count} x ${name}`)));
    nodes.push(textNode("p", "Track omitted from the export"), list);
  }
  if (report.custom.length) {
    const list = document.createElement("ul");
    for (const { filename, url } of report.custom) {
      const link = document.createElement("a");
      link.href = url;
      link.textContent = filename;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const row = document.createElement("li");
      row.append(link);
      list.append(row);
    }
    nodes.push(textNode("p", "Custom parts required"), list);
  }
  element("export-notes").replaceChildren(...nodes);
  dialog("export-report").showModal();
}

function filename(project: Project): string {
  return (
    project.name
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "layout"
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
