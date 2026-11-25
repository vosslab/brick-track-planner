import { setupAreaForm } from "./area_form";
import type { AreaSetup } from "./area_form";
import type { ArrangementResult } from "./arrangements";
import { ArrangementTools } from "./editor_arrangements";
import { EditorCamera } from "./editor_camera";
import { button, element, input } from "./editor_dom";
import { errorMessage, setupFiles } from "./editor_files";
import { renderInventory } from "./editor_inventory";
import { renderDiagnostics } from "./editor_panels";
import { EditorState } from "./editor_state";
import { TrackTools } from "./editor_track";
import { evaluate, initEngine } from "./engine";
import type { Analysis } from "./engine";
import {
  areaToSignupDimensions,
  createNiltcStarter,
  resizeDesignArea,
  signupToAreaDimensions,
} from "./niltc_starters";
import { withParkingKits } from "./parking";
import { newProject } from "./project";
import type { Catalog, Project } from "./project";
import { createScene } from "./scene";
import { traceRoute } from "./route_trace";
import { showInventory } from "./show_inventory";

function notice(message: string, error = false): void {
  const status = element("status");
  status.textContent = message;
  status.toggleAttribute("data-error", error);
}

function start(setup: AreaSetup, catalog: Catalog): Project {
  if (setup.assignment !== "general") {
    return createNiltcStarter(catalog, {
      ...setup,
      ...signupToAreaDimensions(setup, setup.fronts),
      mode: setup.assignment,
    });
  }
  const project = newProject();
  project.name = setup.name;
  project.area = { width: setup.width, depth: setup.depth, fronts: [], exits: [] };
  return project;
}

class Planner {
  readonly #catalog: Catalog;
  readonly #camera: EditorCamera;
  #state: EditorState | undefined;
  readonly #tracks: TrackTools;
  readonly #arrangements: ArrangementTools;
  #preview: ArrangementResult | undefined;
  #scene: SVGSVGElement | undefined;

  constructor(catalog: Catalog) {
    this.#catalog = catalog;
    this.#camera = new EditorCamera(element("tabletop"), {
      tap: (point, target): void => {
        if (!this.#arrangements.pick(point))
          this.#tracks.pick(point, target, this.#camera.snapRadius);
      },
      beginDrag: (point, target): boolean => this.#tracks.beginMove(point, target),
      drag: (point): void => this.#tracks.move(point),
      endDrag: (point, cancelled): void => this.#tracks.endMove(point, cancelled),
    });
    this.#tracks = new TrackTools(catalog, {
      analysis: (): Analysis => this.#requireState().analysis,
      commit: (project): void => this.#commit(project),
      render: (): void => this.#draw(),
      cancelArrangement: (): void => this.#arrangements.reset(),
      notice,
    });
    this.#arrangements = new ArrangementTools(catalog, {
      project: (): Project => this.#requireState().project,
      selection: (): string[] => [...this.#tracks.selection],
      mainlineIds: (): string[] => {
        const { project, routes } = this.#requireState().analysis;
        const [a, b] = project.area.exits;
        if (!a || !b) return [];
        return [
          ...new Set(
            (["outer", "inner"] as const).flatMap((lane) =>
              (traceRoute(routes, a[lane], b[lane]) ?? []).flatMap((link) => [
                link.from.pieceId,
                link.to.pieceId,
              ]),
            ),
          ),
        ];
      },
      beginPreview: (): void => this.#tracks.stopPicking(),
      endPreview: (): void => this.#tracks.stopPicking(),
      preview: (result): void => {
        this.#preview = result;
        this.#draw();
      },
      commit: (project): void => this.#commit(project),
      notice,
    });
    setupFiles(catalog, {
      analysis: (): Analysis => this.#requireState().analysis,
      open: (project): void => this.#replace(project),
      notice,
    });
    const form = setupAreaForm({
      create: (setup): void => this.#replace(start(setup, catalog)),
      update: (setup): void =>
        this.#commit(
          resizeDesignArea(this.#requireState().project, catalog, {
            ...setup,
            ...signupToAreaDimensions(setup, setup.fronts),
          }),
          true,
        ),
    });
    button("new-project").onclick = (): void => form.open();
    button("edit-design-area").onclick = (): void => {
      const { name, area } = this.#requireState().project;
      form.open({
        name,
        ...areaToSignupDimensions(area, area.fronts),
        assignment: area.niltc ?? "general",
        fronts: area.fronts,
      });
    };
    button("undo").onclick = (): void => this.#history("undo");
    button("redo").onclick = (): void => this.#history("redo");
    button("fit-view").onclick = (): void => this.#draw(true);
    button("zoom-in").onclick = (): void => this.#camera.zoom(0.8);
    button("zoom-out").onclick = (): void => this.#camera.zoom(1.25);
    input("project-name").onchange = (): void => {
      const name = input("project-name").value.trim() || "My track plan";
      this.#commit({ ...this.#requireState().project, name });
    };
    document.addEventListener("keydown", (event) => {
      if (
        document.querySelector("dialog[open]") ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (!this.#state) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        this.#history(event.shiftKey ? "redo" : "undo");
      } else if (event.key === "Escape") {
        this.#reset();
      } else if (["Backspace", "Delete"].includes(event.key) && this.#tracks.selection.size) {
        event.preventDefault();
        this.#tracks.remove();
      } else if (event.key === "Enter" && event.target instanceof SVGElement) {
        const port = event.target.closest<SVGElement>("[data-piece-id]");
        if (port) {
          const rect = port.getBoundingClientRect();
          const point = this.#camera.world(rect.x + rect.width / 2, rect.y + rect.height / 2);
          this.#tracks.pick(point, port, this.#camera.snapRadius);
        }
      }
    });
    form.start();
    notice("");
  }

  #commit(project: Project, fit = false): void {
    this.#requireState().commit(project);
    this.#reset(fit);
  }

  #replace(project: Project): void {
    this.#state = new EditorState(project);
    element("editor").hidden = false;
    element("start-screen").hidden = true;
    button("open-project").hidden = false;
    element("project-file-actions").hidden = false;
    document.body.dataset["projectOpen"] = "";
    this.#arrangements.useDefaults();
    this.#tracks.useDefaultTool();
    this.#reset(true);
    element("library-title").focus();
  }

  #requireState(): EditorState {
    if (!this.#state) throw new Error("Start a design or open a track plan first.");
    return this.#state;
  }

  #history(direction: "undo" | "redo"): void {
    this.#requireState().change(direction);
    this.#reset(true);
    notice(direction === "undo" ? "Edit undone." : "Edit restored.");
  }

  #reset(fit = false): void {
    this.#preview = undefined;
    notice("");
    this.#tracks.reset();
    this.#arrangements.reset();
    const state = this.#requireState();
    const { project, analysis } = state;
    input("project-name").value = project.name;
    const inches = (studs: number): string => String(Number(((studs * 10) / 32).toFixed(2)));
    const { width, depth } = areaToSignupDimensions(project.area, project.area.fronts);
    element("design-size").textContent =
      `${inches(width)} × ${inches(depth)} in · ${Number((width / 32).toFixed(2))} × ${Number((depth / 32).toFixed(2))} baseplates`;
    element("area-summary").textContent = project.area.niltc
      ? `NILTC ${project.area.niltc === "corner" ? "90° corner" : "straight"} · Plexiglass on the ${project.area.fronts.join(" and ")}`
      : "General track layout";
    button("undo").disabled = !state.canUndo;
    button("redo").disabled = !state.canRedo;
    renderInventory(showInventory(project, this.#catalog));
    renderDiagnostics(analysis, (id) => this.#tracks.selectPiece(id));
    this.#draw(fit);
  }

  #draw(fit = false): void {
    const { analysis, project } = this.#requireState();
    const preview = this.#preview;
    const candidate = preview?.candidateItems ?? [];
    const working =
      preview && candidate.length
        ? { ...project, items: [...project.items, ...candidate] }
        : project;
    const checked =
      preview && candidate.length
        ? evaluate(
            preview.project ?? {
              ...project,
              items: [
                ...project.items.filter((item) => !preview.removedIds.includes(item.id)),
                ...candidate,
              ],
            },
          )
        : analysis;
    this.#scene = createScene(working, this.#catalog, checked, {
      selection: this.#tracks.selection,
      trace: this.#tracks.route,
      interaction: this.#tracks.pickingPort ? "ports" : "pieces",
      extendable: this.#tracks.extendablePorts,
      replacement: new Set(preview?.removedIds),
      addition: new Set(preview?.addedIds),
      reuse: this.#scene,
    });
    this.#camera.show(this.#scene, fit);
  }
}

async function main(): Promise<void> {
  try {
    new Planner(withParkingKits(await initEngine()));
  } catch (error) {
    notice(`Cannot start Brick Track Planner: ${errorMessage(error)}`, true);
  }
}
void main();
