import type { Analysis } from "./engine";
import straightExamples from "../data/straight_examples.json" with { type: "json" };
import { button, dialog, element, input, select, textNode } from "./editor_dom";
import { evaluate } from "./engine";
import { MAX_TRACK_PLAN_FILE_BYTES, openTrackPlan, saveTrackPlan } from "./ldraw";
import type { Catalog, Project } from "./project";
import { downloadBlob, importBlueBrick, MAX_BLUEBRICK_FILE_BYTES } from "./project_files";
import { createScene, setSceneDetail } from "./scene";
import { exportSharing } from "./share";

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
    file: "u-shaped-staging.ldr",
    name: "U-shaped staging layout",
    purpose: "General staging layout.",
  },
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
      if (!bluebrick && file.size > MAX_TRACK_PLAN_FILE_BYTES) {
        throw new Error("Track plan files must be 8 MiB or smaller.");
      }
      const content = await file.text();
      if (version !== revision) return;
      if (bluebrick) previewImport(importBlueBrick(content, catalog));
      else hooks.open(openTrackPlan(content, catalog));
    } catch (error) {
      if (version === revision) hooks.notice(errorMessage(error), true);
    }
  };

  const chooseTrackPlan = (): void => input("project-file").click();
  button("open-project").addEventListener("click", chooseTrackPlan);
  button("start-open-project").addEventListener("click", chooseTrackPlan);
  input("project-file").addEventListener("change", () => {
    void processFile(input("project-file"), false);
  });
  button("import-project").addEventListener("click", () => input("import-file").click());
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
      hooks.notice("Track plan downloaded.");
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
    const version = ++revision;
    try {
      const project = await loadTemplate(template);
      if (version !== revision) return;
      hooks.open(project);
    } catch (error) {
      if (version === revision) hooks.notice(errorMessage(error), true);
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
  const cards = element("template-gallery-cards");
  const galleryCards = new Map<string, HTMLButtonElement>();
  const showGallery = (): void => {
    gallery.showModal();
    for (const template of straightExamples) {
      let card = galleryCards.get(template.file);
      if (!card) {
        card = document.createElement("button");
        card.type = "button";
        card.className = "template-card";
        card.setAttribute("aria-label", template.name + ". " + template.purpose);
        const name = document.createElement("strong");
        name.textContent = template.name;
        card.append(name, textNode("small", template.purpose));
        card.addEventListener("click", () => {
          gallery.close();
          void openTemplate(template);
        });
        galleryCards.set(template.file, card);
        cards.append(card);
      }
      if (card.dataset.preview === "ready" || card.dataset.preview === "loading") continue;
      card.dataset.preview = "loading";
      card.disabled = true;
      card.querySelector("[data-preview-error]")?.remove();
      void (async (): Promise<void> => {
        try {
          const project = await loadTemplate(template);
          const preview = createScene(project, catalog, evaluate(project), {
            frame: "track",
            grid: true,
            sharing: true,
          });
          preview.setAttribute("aria-hidden", "true");
          card.prepend(preview);
          const view = preview.viewBox.baseVal;
          const size = preview.getBoundingClientRect();
          setSceneDetail(preview, Math.min(size.width / view.width, size.height / view.height));
          card.dataset.preview = "ready";
          card.disabled = false;
        } catch {
          card.dataset.preview = "failed";
          card.disabled = false;
          const error = textNode("small", "Preview unavailable. Open again to retry.");
          error.dataset.previewError = "";
          card.append(error);
        }
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
      exportButton.disabled = true;
      try {
        if (format === "png" || format === "webp" || format === "pdf") {
          const blob = await exportSharing(format, project, catalog, analysis, {
            rasterResolution: rasterResolution.value === "high" ? "high" : "standard",
            pdfMode: pdfMode.value === "color" ? "color" : "grayscale",
          });
          downloadBlob(blob, `${filename(project)}.${format}`);
        }
        hooks.notice(`${format.toUpperCase()} downloaded.`);
      } catch (error) {
        hooks.notice(errorMessage(error), true);
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
