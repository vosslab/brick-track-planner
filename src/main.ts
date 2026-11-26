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
import { createScene, drawEditPreview } from "./scene";
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
    const tabletop = element("tabletop");
    this.#camera = new EditorCamera(tabletop, {
      tap: (point, target, multiple): void => {
        if (this.#preview) this.#arrangements.pick(point);
        else this.#tracks.pick(point, target, this.#camera.snapRadius, multiple);
      },
      hover: (event): void => {
        if (!this.#tracks.pickingDestination || !(event.target instanceof Element)) return;
        const point = this.#camera.world(event.clientX, event.clientY);
        this.#tracks.move(point, this.#camera.snapRadius, event.target);
      },
      clearHover: (): void => this.#tracks.clearHover(),
      beginDrag: (point, target): "drag" | "pan" | "blocked" =>
        this.#tracks.beginMove(point, target),
      drag: (point): void => this.#tracks.move(point, this.#camera.snapRadius),
      endDrag: (point, cancelled): void =>
        this.#tracks.endMove(point, this.#camera.snapRadius, cancelled),
    });
    this.#tracks = new TrackTools(catalog, {
      analysis: (): Analysis => this.#requireState().analysis,
      commit: (project): void => this.#commit(project),
      render: (): void => this.#draw(),
      renderPreview: (): void => this.#drawEditPreview(),
      cancelArrangement: (): void => {
        if (this.#preview) this.#arrangements.reset();
      },
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
      preview: (result): void => {
        this.#preview = result;
        this.#tracks.setArrangementActive(Boolean(result));
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
    button("rotate-view").onclick = (): void => this.#camera.rotateView();
    input("project-name").onchange = (): void => {
      const name = input("project-name").value.trim() || "My track plan";
      this.#commit({ ...this.#requireState().project, name });
    };
    document.addEventListener("keydown", (event) => {
      if (!this.#state || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (event.key === "Escape" && this.#tracks.pickingDestination) {
        event.preventDefault();
        this.#tracks.cancel();
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      )
        return;
      const shortcut = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (shortcut && key === "z") {
        event.preventDefault();
        this.#history(event.shiftKey ? "redo" : "undo");
      } else if (shortcut && !event.altKey && !event.shiftKey && key === "c") {
        if (window.getSelection()?.isCollapsed !== false && this.#tracks.copy())
          event.preventDefault();
      } else if (shortcut && !event.altKey && !event.shiftKey && key === "v") {
        if (this.#tracks.startPaste()) event.preventDefault();
      } else if (event.key === "Escape") {
        if (!this.#tracks.cancel()) this.#reset(false, true);
      } else if (["Backspace", "Delete"].includes(event.key) && this.#tracks.selection.size) {
        event.preventDefault();
        this.#tracks.remove();
      } else if (event.key === "Enter" || event.key === " ") {
        const target = event.target;
        const placement =
          target === tabletop && event.key === "Enter" && this.#tracks.pickingDestination
            ? tabletop
            : target instanceof SVGElement
              ? target.closest<SVGElement>('[data-piece-id][role="button"]')
              : null;
        if (placement) {
          event.preventDefault();
          const rect = placement.getBoundingClientRect();
          const point = this.#camera.world(rect.x + rect.width / 2, rect.y + rect.height / 2);
          if (this.#preview) this.#arrangements.pick(point);
          else this.#tracks.pick(point, placement, this.#camera.snapRadius, event.shiftKey);
          if (this.#tracks.editPreview?.kind === "ready")
            button("place-edit").focus({ preventScroll: true });
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
    this.#camera.reset();
    this.#reset(true, true);
    element("library-title").focus();
  }

  #requireState(): EditorState {
    if (!this.#state) throw new Error("Start a design or open a track plan first.");
    return this.#state;
  }

  #history(direction: "undo" | "redo"): void {
    const state = this.#requireState();
    if (direction === "undo" ? !state.canUndo : !state.canRedo) return;
    state.change(direction);
    this.#reset();
    notice(direction === "undo" ? "Edit undone." : "Edit restored.");
  }

  #reset(fit = false, clearSelection = false): void {
    this.#preview = undefined;
    notice("");
    this.#tracks.reset(clearSelection);
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
    const focused = document.activeElement;
    const focusedId =
      focused instanceof SVGElement && this.#scene?.contains(focused) ? focused.id : "";
    this.#scene = createScene(working, this.#catalog, checked, {
      selection: this.#tracks.selection,
      trace: this.#tracks.route,
      interaction: this.#tracks.pickingPort ? "ports" : "pieces",
      extendable: this.#tracks.targetPorts,
      replacement: new Set(preview?.removedIds),
      addition: new Set(preview?.addedIds),
      reuse: this.#scene,
    });
    this.#camera.show(this.#scene, fit);
    this.#drawEditPreview();
    if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  }

  #drawEditPreview(): void {
    if (this.#scene) drawEditPreview(this.#scene, this.#tracks.editPreview);
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
