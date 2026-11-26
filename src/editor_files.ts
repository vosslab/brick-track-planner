import type { Analysis } from "./engine";
import straightExamples from "../data/straight_examples.json" with { type: "json" };
import { button, dialog, element, input, select, textNode } from "./editor_dom";
import { evaluate } from "./engine";
import { MAX_TRACK_PLAN_FILE_BYTES, openTrackPlan, saveTrackPlan } from "./ldraw";
import type { Catalog, Project } from "./project";
import { downloadBlob, importBlueBrick, MAX_BLUEBRICK_FILE_BYTES } from "./project_files";
import { createScene, setSceneDetail } from "./scene";
import { exportSharing } from "./share";
import { showInventory } from "./show_inventory";

type ImportReview = ReturnType<typeof importBlueBrick>;
type Template = {
  file: string;
  name: string;
  purpose: string;
};

const templates: readonly Template[] = [
  {
    file: "member-straight.ldr",
    name: "Member straight",
    purpose: "NILTC straight mainline.",
  },
  {
    file: "member-corner.ldr",
    name: "Member corner",
    purpose: "NILTC R120 and R104 corner.",
  },
  {
    file: "member-yard.ldr",
    name: "Member yard",
    purpose: "R104 yard with three 128-stud storage tracks.",
  },
  {
    file: "r104-semicircle-return.ldr",
    name: "R104 semicircle return",
    purpose: "A 130 by 80 inch turnaround with an R104 semicircle and a long diagonal.",
  },
  {
    file: "r120-corner-return.ldr",
    name: "R120 corner return",
    purpose:
      "A 120 by 100 inch turnaround with an R120 quarter-turn and a short straight between bends.",
  },
];

export function setupFiles(
  catalog: Catalog,
  hooks: {
    analysis: () => Analysis;
    beginOpen: () => number;
    open: (project: Project, saved: boolean, intent: number) => void;
    saved: (project: Project) => void;
    notice: (message: string, error?: boolean) => void;
  },
): void {
  let importReview: ImportReview | undefined;
  let importing = false;
  const importButton = button("import-project");
  const preview = dialog("import-preview");
  const previewImport = async (result: ImportReview): Promise<void> => {
    while (true) {
      const modal = document.querySelector("dialog:modal");
      if (!modal) break;
      await new Promise<void>((resolve) => {
        modal.addEventListener("close", () => resolve(), { once: true });
      });
    }
    importReview = result;
    const { area, items } = result.project;
    const track = items.filter(({ kind }) => kind === "track").length;
    const unresolved = items.length - track;
    element("preview-name").textContent =
      `${result.project.name}: ${area.width} × ${area.depth} studs, ` +
      `${track} track pieces, and ${unresolved} unresolved imported items.`;
    const warnings = result.warnings.map((warning) => textNode("li", warning));
    if (!warnings.length) warnings.push(textNode("li", "No import warnings."));
    element("import-warnings").replaceChildren(...warnings);
    element("import-error").textContent = "";
    preview.showModal();
  };

  preview.addEventListener("close", () => {
    importReview = undefined;
    importing = false;
    importButton.disabled = false;
  });
  button("cancel-import").addEventListener("click", () => {
    preview.close();
    hooks.notice("Import canceled.");
  });
  button("confirm-import").addEventListener("click", () => {
    if (!importReview) return;
    try {
      hooks.open(importReview.project, false, hooks.beginOpen());
      preview.close();
    } catch (error) {
      element("import-error").textContent = errorMessage(error);
    }
  });

  const processFile = async (fileInput: HTMLInputElement, bluebrick: boolean): Promise<void> => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    if (bluebrick && importing) {
      hooks.notice("Finish reviewing the current BlueBrick import first.", true);
      return;
    }
    const intent = hooks.beginOpen();
    if (bluebrick) {
      importing = true;
      importButton.disabled = true;
    }
    try {
      if (bluebrick && file.size > MAX_BLUEBRICK_FILE_BYTES) {
        throw new Error("BlueBrick files must be 8 MiB or smaller.");
      }
      if (!bluebrick && file.size > MAX_TRACK_PLAN_FILE_BYTES) {
        throw new Error("Track plan files must be 8 MiB or smaller.");
      }
      const content = await file.text();
      if (bluebrick) await previewImport(importBlueBrick(content, catalog));
      else hooks.open(openTrackPlan(content, catalog), true, intent);
    } catch (error) {
      if (bluebrick) {
        importing = false;
        importButton.disabled = false;
      }
      hooks.notice(`${file.name}: ${errorMessage(error)}`, true);
    }
  };

  const chooseTrackPlan = (): void => input("project-file").click();
  button("open-project").addEventListener("click", chooseTrackPlan);
  button("start-open-project").addEventListener("click", chooseTrackPlan);
  input("project-file").addEventListener("change", () => {
    void processFile(input("project-file"), false);
  });
  importButton.addEventListener("click", () => input("import-file").click());
  input("import-file").addEventListener("change", () => {
    void processFile(input("import-file"), true);
  });

  button("save-project").addEventListener("click", () => {
    try {
      const { project } = hooks.analysis();
      downloadBlob(
        new Blob([saveTrackPlan(project, catalog)], { type: "text/plain" }),
        `${filename(project)}.ldr`,
      );
      hooks.saved(project);
      hooks.notice(`${project.name}: track plan downloaded.`);
    } catch (error) {
      hooks.notice(errorMessage(error), true);
    }
  });

  const loadedTemplates = new Map<string, Project>();
  const loadTemplate = async (template: Template): Promise<Project> => {
    const loaded = loadedTemplates.get(template.file);
    if (loaded) return loaded;
    const response = await fetch(new URL("./templates/" + template.file, import.meta.url));
    if (!response.ok) throw new Error("Could not open the packaged template.");
    const project = openTrackPlan(await response.text(), catalog);
    loadedTemplates.set(template.file, project);
    return project;
  };
  const openTemplate = async (template: Template): Promise<void> => {
    const intent = hooks.beginOpen();
    try {
      const project = await loadTemplate(template);
      hooks.open(project, true, intent);
    } catch (error) {
      hooks.notice(`${template.name}: ${errorMessage(error)}`, true);
    }
  };

  const templateSelects = [select("templates"), select("start-templates")];
  for (const templateSelect of templateSelects) {
    for (const template of templates) {
      const option = new Option(template.name, template.file);
      option.title = template.purpose;
      templateSelect.add(option);
    }
    templateSelect.addEventListener("change", () => {
      const file = templateSelect.value;
      templateSelect.value = "";
      if (!file) return;
      const template = templates.find((candidate) => candidate.file === file);
      if (template) void openTemplate(template);
    });
  }

  const gallery = dialog("template-gallery");
  const galleryCards = new Map<string, { opener: HTMLButtonElement; description: HTMLElement }>();
  const showGallery = (): void => {
    gallery.showModal();
    for (const template of straightExamples) {
      let card = galleryCards.get(template.file);
      if (!card) {
        const container = document.createElement("article");
        container.className = "template-card";
        const opener = document.createElement("button");
        opener.type = "button";
        const title = `${template.code} · ${template.name}`;
        opener.setAttribute("aria-label", `Open ${title}`);
        const name = document.createElement("strong");
        name.textContent = title;
        const description = textNode("small", template.purpose);
        description.id = `example-description-${template.file}`;
        opener.setAttribute("aria-describedby", description.id);
        container.append(opener, name, description);
        opener.addEventListener("click", () => {
          gallery.close();
          void openTemplate(template);
        });
        card = { opener, description };
        galleryCards.set(template.file, card);
        element(`template-gallery-cards-${template.frontage}`).append(container);
      }
      const { opener, description } = card;
      if (opener.dataset.preview === "ready" || opener.dataset.preview === "loading") continue;
      opener.dataset.preview = "loading";
      opener.disabled = true;
      void (async (): Promise<void> => {
        try {
          const project = await loadTemplate(template);
          const preview = createScene(project, catalog, evaluate(project), {
            cropToTrack: true,
            grid: true,
            sharing: true,
          });
          const total = showInventory(project, catalog).track.reduce(
            (sum, row) => sum + row.required,
            0,
          );
          description.textContent = `${total} track pieces. ${template.purpose}`;
          preview.setAttribute("aria-hidden", "true");
          opener.replaceChildren(preview);
          const view = preview.viewBox.baseVal;
          const size = preview.getBoundingClientRect();
          setSceneDetail(preview, Math.min(size.width / view.width, size.height / view.height));
          opener.dataset.preview = "ready";
        } catch {
          opener.dataset.preview = "failed";
          description.textContent = "Preview unavailable. Open again to retry.";
        }
        opener.disabled = false;
      })();
    }
  };
  button("browse-examples").addEventListener("click", showGallery);
  button("start-browse-examples").addEventListener("click", showGallery);
  button("close-template-gallery").addEventListener("click", () => gallery.close());

  const exportFormat = select("export-format");
  const rasterResolution = select("raster-resolution");
  const pdfMode = select("pdf-mode");
  const updateExportOptions = (): void => {
    const format = exportFormat.value;
    rasterResolution.hidden = format !== "png" && format !== "webp";
    pdfMode.hidden = format !== "pdf";
  };
  exportFormat.addEventListener("change", updateExportOptions);
  updateExportOptions();

  const exportButton = button("export-layout");
  exportButton.addEventListener("click", () => {
    async function downloadLayout(): Promise<void> {
      const format = exportFormat.value;
      const analysis = hooks.analysis();
      const { project } = analysis;
      const name = filename(project);
      exportButton.disabled = true;
      try {
        if (format === "png" || format === "webp" || format === "pdf") {
          const blob = await exportSharing(format, project, catalog, analysis, {
            rasterResolution: rasterResolution.value === "high" ? "high" : "standard",
            pdfMode: pdfMode.value === "color" ? "color" : "grayscale",
          });
          downloadBlob(blob, `${name}.${format}`);
        }
        hooks.notice(`${project.name}: ${format.toUpperCase()} downloaded.`);
      } catch (error) {
        hooks.notice(`${project.name}: ${errorMessage(error)}`, true);
      } finally {
        exportButton.disabled = false;
      }
    }
    void downloadLayout();
  });
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
