import { setupAreaForm } from "./area_form";
import type { AreaSetup } from "./area_form";
import { placementWarnings } from "./arrangements";
import type { ArrangementResult, PlacementWarning } from "./arrangements";
import { ArrangementTools } from "./editor_arrangements";
import { EditorCamera } from "./editor_camera";
import type { CameraView } from "./editor_camera";
import { setupEditorControls } from "./editor_controls";
import { button, element, input } from "./editor_dom";
import { errorMessage, setupFiles } from "./editor_files";
import { renderInventory } from "./editor_inventory";
import { renderDiagnostics } from "./editor_panels";
import { setupOutlineEditor } from "./editor_outline";
import { EditorState } from "./editor_state";
import { setupTabs } from "./editor_tabs";
import { TrackTools } from "./editor_track";
import { evaluate, initEngine } from "./engine";
import type { Analysis } from "./engine";
import {
  areaToSignupDimensions,
  createNiltcStarter,
  signupToAreaDimensions,
} from "./niltc_starters";
import { withParkingKits } from "./parking";
import { ensureVisibleWorkingLayer, newProject, projectId } from "./project";
import type { Catalog, Project } from "./project";
import { createScene, drawEditPreview } from "./scene";
import { traceRoute } from "./route_trace";
import { showInventory } from "./show_inventory";

type LayoutTab = {
  id: string;
  state: EditorState;
  view: CameraView | undefined;
  savedProject: Project | undefined;
};

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
  readonly #closeMenus: () => void;
  readonly #layouts: LayoutTab[] = [];
  readonly #tabs: ReturnType<typeof setupTabs>;
  readonly #areaForm: ReturnType<typeof setupAreaForm>;
  readonly #outlineEditor: ReturnType<typeof setupOutlineEditor>;
  #active: LayoutTab | undefined;
  #navigation = 0;
  readonly #tracks: TrackTools;
  readonly #arrangements: ArrangementTools;
  #preview: ArrangementResult | undefined;
  #scene: SVGSVGElement | undefined;
  #warnings: PlacementWarning[] = [];
  #warnedPieces = new Set<string>();

  constructor(catalog: Catalog) {
    this.#catalog = catalog;
    this.#closeMenus = setupEditorControls();
    const tabletop = element("tabletop");
    this.#camera = new EditorCamera(tabletop, {
      tap: (point, target, multiple): void => {
        if (this.#preview) this.#arrangements.pick(point);
        else this.#tracks.pick(point, target, this.#camera.snapRadius, multiple);
      },
      hover: (event, target): void => {
        if (!this.#tracks.pickingDestination) return;
        const point = this.#camera.world(event.clientX, event.clientY);
        this.#tracks.move(point, this.#camera.snapRadius, target);
      },
      clearHover: (): void => this.#tracks.clearHover(),
      holding: (): boolean => Boolean(this.#preview || this.#tracks.pickingDestination),
      selecting: (): boolean => this.#tracks.selecting,
      selectBox: (box): void => {
        const ids: string[] = [];
        for (const track of tabletop.querySelectorAll<SVGGElement>(
          '[data-kind="track"][role="button"]',
        )) {
          const { top, right, bottom, left } = track.getBoundingClientRect();
          const id = track.dataset["pieceId"];
          if (
            id &&
            top >= box.top &&
            right <= box.right &&
            bottom <= box.bottom &&
            left >= box.left
          )
            ids.push(id);
        }
        this.#tracks.addToSelection(ids);
      },
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
      noticePlacement: (receipt, ids): void => this.#noticePlacement(receipt, ids),
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
        if (this.#preview === result) return;
        this.#preview = result;
        this.#tracks.setArrangementActive(Boolean(result));
        this.#draw();
      },
      commit: (project): void => this.#commit(project),
      notice,
      noticePlacement: (receipt, ids): void => this.#noticePlacement(receipt, ids),
    });
    this.#tabs = setupTabs({
      activate: (id): void => {
        const layout = this.#layouts.find((tab) => tab.id === id);
        if (!layout || layout === this.#active) return;
        this.#navigation++;
        this.#activate(layout);
      },
      duplicate: (): void => this.#duplicate(),
      close: (): void => {
        void this.#close();
      },
    });
    setupFiles(catalog, {
      analysis: (): Analysis => {
        this.#commitName();
        return this.#requireState().analysis;
      },
      beginOpen: (): number => ++this.#navigation,
      open: (project, saved, intent): void => this.#open(project, saved, intent),
      saved: (project): void => {
        const owner = this.#layouts.find((tab) => tab.state.project === project);
        if (owner) owner.savedProject = project;
      },
      notice,
    });
    this.#areaForm = setupAreaForm({
      create: (setup): void => {
        const intent = ++this.#navigation;
        this.#open(start(setup, catalog), false, intent);
      },
    });
    this.#outlineEditor = setupOutlineEditor(catalog);
    button("new-project").onclick = (): void => {
      this.#navigation++;
      this.#areaForm.open();
    };
    button("edit-design-area").onclick = (): void => this.#editArea();
    button("undo").onclick = (): void => this.#history("undo");
    button("redo").onclick = (): void => this.#history("redo");
    button("fit-view").onclick = (): void => this.#draw(true);
    button("zoom-in").onclick = (): void => this.#camera.zoom(0.8);
    button("zoom-out").onclick = (): void => this.#camera.zoom(1.25);
    button("rotate-view").onclick = (): void => this.#camera.rotateView();
    input("project-name").onchange = (): void => this.#commitName();
    document.addEventListener("keydown", (event) => {
      if (!this.#active || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (event.key === "Escape" && this.#camera.cancelBoxSelection()) {
        event.preventDefault();
        return;
      }
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
          target === tabletop &&
          event.key === "Enter" &&
          (this.#preview || this.#tracks.pickingDestination)
            ? tabletop
            : target instanceof SVGElement
              ? target.closest<SVGElement>('[data-piece-id][role="button"]')
              : null;
        if (placement) {
          event.preventDefault();
          const rect = placement.getBoundingClientRect();
          const point = this.#camera.world(rect.x + rect.width / 2, rect.y + rect.height / 2);
          if (this.#preview) this.#arrangements.pick(point);
          else
            this.#tracks.pick(
              point,
              placement,
              this.#camera.snapRadius,
              event.shiftKey || shortcut,
            );
          if (this.#tracks.editPreview?.kind === "ready")
            button("place-edit").focus({ preventScroll: true });
        }
      }
    });
    this.#areaForm.start();
    notice("");
  }

  #commit(project: Project, fit = false): void {
    const state = this.#requireState();
    const oldName = state.project.name;
    state.commit(project);
    this.#reset(fit);
    if (state.project.name !== oldName) this.#renderTabs();
  }

  #commitName(): void {
    const state = this.#active?.state;
    if (!state) return;
    const field = input("project-name");
    if (field.value === state.project.name) return;
    const name = field.value.trim() || "My track plan";
    field.value = name;
    if (name !== state.project.name) this.#commit({ ...state.project, name });
  }

  #editArea(): void {
    const layout = this.#active;
    if (!layout) return;
    this.#navigation++;
    this.#commitName();
    this.#outlineEditor(layout.state.analysis, (project) => {
      this.#commit(project, true);
    });
  }

  #open(project: Project, saved: boolean, intent: number, view?: CameraView): void {
    const state = new EditorState(project);
    const tab = {
      id: projectId("layout"),
      state,
      view,
      savedProject: saved ? state.project : undefined,
    };
    this.#layouts.push(tab);
    if (intent === this.#navigation || !this.#active) this.#activate(tab, !saved);
    else this.#renderTabs();
  }

  #renderTabs(focus = false, focusAfterDialog = false): void {
    const dialog = focus ? document.querySelector<HTMLDialogElement>("dialog:modal") : null;
    const active = this.#active;
    this.#tabs.render(
      this.#layouts.map(({ id, state }) => ({ id, name: state.project.name })),
      active?.id,
      focus && !dialog,
    );
    dialog?.addEventListener(
      "close",
      () => {
        if (active !== this.#active || document.querySelector("dialog:modal")) return;
        const focused = document.activeElement;
        if (focusAfterDialog || focused === document.body || !focused?.getClientRects().length)
          this.#renderTabs(true);
      },
      { once: true },
    );
  }

  #activate(tab: LayoutTab | undefined, focusAfterDialog = false): void {
    const outgoing = this.#active;
    if (outgoing === tab) return;
    if (outgoing) {
      this.#commitName();
      outgoing.view = this.#camera.snapshot();
    }
    this.#camera.restore(tab?.view);
    if (outgoing) {
      if (tab) this.#tracks.stopPicking();
      else {
        this.#tracks.reset(true);
        this.#preview = undefined;
        this.#arrangements.reset();
      }
    }
    this.#active = tab;
    this.#closeMenus();
    element("editor").hidden = !tab;
    element("editor-controls").hidden = !tab;
    element("start-screen").hidden = Boolean(tab);
    element("file-menu").hidden = !tab;
    button("save-project").hidden = !tab;
    button("start-import-project").hidden = Boolean(tab);
    document.body.toggleAttribute("data-project-open", Boolean(tab));
    if (!tab) {
      this.#renderTabs();
      this.#areaForm.start();
      input("area-name").focus({ preventScroll: true });
      notice("");
      return;
    }
    this.#renderTabs(true, focusAfterDialog);
    this.#arrangements.useDefaults();
    this.#tracks.useDefaultTool();
    this.#reset(false, true);
    if (!outgoing) window.scrollTo(0, 0);
  }

  #duplicate(): void {
    if (!this.#active) return;
    this.#commitName();
    const project = this.#active.state.project;
    const names = new Set(this.#layouts.map(({ state }) => state.project.name));
    let name = `${project.name} (copy)`;
    for (let number = 2; names.has(name); number++) name = `${project.name} (copy ${number})`;
    this.#open({ ...project, name }, false, ++this.#navigation, this.#camera.snapshot());
  }

  async #close(): Promise<void> {
    const tab = this.#active;
    if (!tab) return;
    this.#navigation++;
    this.#commitName();
    const { project } = tab.state;
    const saved = tab.savedProject;
    const clean = project === saved || (saved && JSON.stringify(project) === JSON.stringify(saved));
    if (!clean && !(await this.#tabs.confirmClose(project.name))) return;
    const index = this.#layouts.indexOf(tab);
    if (index < 0) return;
    this.#layouts.splice(index, 1);
    if (this.#active === tab) this.#activate(this.#layouts[index] ?? this.#layouts[index - 1]);
    else this.#renderTabs();
  }

  #requireState(): EditorState {
    if (!this.#active) throw new Error("Start a design or open a track plan first.");
    return this.#active.state;
  }

  #noticePlacement(receipt: string, ids: readonly string[]): void {
    const issue = this.#warnings.find(({ pieceIds }) => pieceIds.some((id) => ids.includes(id)));
    notice(issue ? `${receipt} ${issue.message} See Diagnostics.` : receipt, Boolean(issue));
  }

  #history(direction: "undo" | "redo"): void {
    const state = this.#requireState();
    if (direction === "undo" ? !state.canUndo : !state.canRedo) return;
    const oldName = state.project.name;
    state.change(direction);
    this.#reset();
    if (state.project.name !== oldName) this.#renderTabs();
    notice(direction === "undo" ? "Edit undone." : "Edit restored.");
  }

  #reset(fit = false, clearSelection = false): void {
    this.#preview = undefined;
    const state = this.#requireState();
    const { project, analysis } = state;
    this.#warnings = placementWarnings(analysis, this.#catalog);
    this.#warnedPieces = new Set(this.#warnings.flatMap(({ pieceIds }) => pieceIds));
    notice("");
    this.#tracks.reset(clearSelection);
    this.#arrangements.reset();
    input("project-name").value = project.name;
    const inches = (studs: number): string => String(Number(((studs * 10) / 32).toFixed(2)));
    const { width, depth } = areaToSignupDimensions(project.area, project.area.fronts);
    const size = `${inches(width)} × ${inches(depth)} in`;
    element("design-size").textContent = project.area.outline
      ? `${size} overall`
      : `${size} · ${Number((width / 32).toFixed(2))} × ${Number((depth / 32).toFixed(2))} baseplates`;
    element("area-summary").textContent = project.area.niltc
      ? `NILTC ${project.area.niltc === "corner" ? "90° corner" : "straight"} · Plexiglass on the ${project.area.fronts.join(" and ")}`
      : "General track layout";
    button("undo").disabled = !state.canUndo;
    button("redo").disabled = !state.canRedo;
    renderInventory(showInventory(project, this.#catalog));
    renderDiagnostics(analysis, this.#warnings, (id) => this.#tracks.selectPiece(id));
    this.#draw(fit);
  }

  #draw(fit = false): void {
    const { analysis, project } = this.#requireState();
    const preview = this.#preview;
    const candidate = preview?.candidateItems ?? [];
    let working = project;
    let checked = analysis;
    if (preview && candidate.length) {
      const { layers } = preview.project ?? ensureVisibleWorkingLayer(project).project;
      const layer = layers.find(({ visible }) => visible);
      const tracks =
        layer && layers.length > project.layers.length
          ? candidate.map((item) => ({ ...item, layerId: layer.id }))
          : candidate;
      working = { ...project, layers, items: [...project.items, ...tracks] };
      try {
        checked = evaluate(
          preview.project ?? {
            ...working,
            items: [
              ...project.items.filter(({ id }) => !preview.removedIds.includes(id)),
              ...tracks,
            ],
          },
        );
      } catch {
        // Keep the committed rail ends available if the preview exceeds structural limits.
      }
    }
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
      placementWarnings: this.#warnedPieces,
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
