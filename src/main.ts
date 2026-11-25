import { EditorCamera } from "./editor_camera";
import { action, button, dialog, element, input, select, textNode, toCanvas } from "./editor_dom";
import { errorMessage, setupFiles } from "./editor_files";
import { renderInventory } from "./editor_inventory";
import {
  duplicateTrackSelection,
  renderNiltcIssues,
  renderStarterCards,
  snapNiltcBaseplatePose,
  snapNiltcTablePose,
} from "./editor_niltc";
import { renderPalette, setupPalette } from "./editor_palette";
import type { Placement } from "./editor_palette";
import { renderDiagnostics, renderLayers, renderSelection, renderTables } from "./editor_panels";
import { SeamEditor } from "./editor_seam";
import { SectionsEditor } from "./editor_sections";
import {
  addTable,
  deleteSelection,
  EditorState,
  layerId,
  moveSelection,
  newId,
  placeTrack,
  presets,
  swapTurnout,
} from "./editor_state";
import { renderVenue } from "./editor_venue";
import { evaluate, initEngine } from "./engine";
import type { Analysis } from "./engine";
import { localPose, newProject, worldPose } from "./project";
import type { Catalog, Edge, Endpoint, Item, Point, Pose, Project, Table } from "./project";
import { createScene } from "./scene";
import { showInventory } from "./show_inventory";

type Tool = Placement | { id: "baseplate"; name: string; kind: "baseplate"; angle: number };
type Swap = { analysis: Analysis; changes: string[] };
type GesturePhase = "preview" | "commit" | "cancel";
type PoseValues = Pose & {
  tableId?: string;
  name?: string;
  fronts?: Edge[];
  heightPlates?: number;
};

function notice(message: string, isError = false): void {
  const status = element("status");
  status.textContent = message;
  status.toggleAttribute("data-error", isError);
  const modal = document.querySelector("dialog[open] [data-dialog-error]");
  if (modal) modal.textContent = isError ? message : "";
}

function entity(target: Element): string | undefined {
  const hit = target.closest<SVGElement>("[data-piece-id],[data-table-id]");
  return hit?.dataset["pieceId"] ?? hit?.dataset["tableId"];
}

function connector(target: Element): Endpoint | undefined {
  const endpoint = target.closest<SVGElement>("[data-piece-id][data-port-id]");
  const pieceId = endpoint?.dataset["pieceId"];
  const portId = endpoint?.dataset["portId"];
  if (pieceId && portId) return { pieceId, portId };
  return undefined;
}

class Planner {
  readonly #catalog: Catalog;
  readonly #camera: EditorCamera;
  readonly #seam = new SeamEditor();
  readonly #sections = new SectionsEditor();
  #state = new EditorState(newProject());
  #placement: Tool | undefined;
  #swap: Swap | undefined;
  #box = false;
  #newTable = false;
  #dragFrame = 0;

  constructor(catalog: Catalog) {
    this.#catalog = catalog;
    this.#camera = new EditorCamera(element("tabletop"), {
      tap: (point, target, multi): void => this.#run(() => this.#tap(point, target, multi)),
      canDrag: (target): boolean =>
        !this.#placement && !this.#seam.draft && !this.#swap && Boolean(entity(target)),
      startDrag: (target, multi): void => {
        const id = entity(target);
        if (id && !this.#state.selection.has(id)) this.#select(id, multi);
      },
      drag: (from, to, phase): void => this.#run(() => this.#drag(from, to, phase)),
      boxActive: (): boolean => this.#box,
      box: (from, to, phase): void => this.#boxSelect(from, to, phase),
    });
    setupFiles(catalog, {
      analysis: () => this.#state.analysis,
      open: (project) => this.#openProject(project, `Opened ${project.name}.`),
      notice,
    });

    setupPalette(catalog, () => this.#renderPalette());
    this.#wireControls();
    renderStarterCards(catalog, (project) => this.#run(() => this.#openProject(project)));
    notice("");
  }

  #openProject(project: Project, message = ""): void {
    const next = new EditorState(project);
    this.#resetTools();
    this.#sections.reset();
    this.#state = next;
    const editor = element("editor");
    const entering = editor.hidden;
    editor.hidden = false;
    element("welcome").hidden = true;
    if (entering) element("starter-cards").replaceChildren();
    element("project-file-actions").hidden = false;
    this.#render(true);
    this.#renderPalette();
    if (entering) element("tabletop").focus({ preventScroll: true });
    notice(message);
  }

  #run(change: () => void): void {
    try {
      change();
    } catch (error) {
      notice(errorMessage(error), true);
    }
  }

  #wireControls(): void {
    const handle = (id: string, handler: () => void): void => {
      button(id).addEventListener("click", () => this.#run(handler));
    };
    handle("new-project", () => this.#startProject());
    handle("add-table", () => this.#openTableForm(false));
    handle("cancel-table", () => dialog("table-dialog").close());
    handle("add-baseplate", () =>
      this.#choose({ id: "baseplate", name: "32 x 32 baseplate", kind: "baseplate", angle: 0 }),
    );
    handle("undo", () => this.#history("undo"));
    handle("redo", () => this.#history("redo"));
    handle("box-select", () => {
      const next = !this.#box;
      this.#resetTools();
      this.#box = next;
      this.#render();
      toCanvas();
    });
    handle("seam-mode", () => {
      if (this.#seam.draft) {
        this.#seam.close();
        this.#render();
      } else this.#openSeam();
    });
    handle("fit-view", () => this.#renderScene(this.#swap?.analysis ?? this.#state.analysis, true));
    handle("zoom-out", () => this.#camera.zoom(1.25));
    handle("zoom-in", () => this.#camera.zoom(0.8));
    handle("rotate-placement", () => this.#rotatePlacement());
    handle("seam-controls", () => this.#showSeamPanel());
    handle("toggle-library", () => this.#collapse("library"));
    handle("toggle-inspector", () => this.#collapse("inspector"));
    input("grid-toggle").addEventListener("change", () => this.#renderScene(this.#swap?.analysis));
    input("project-name").addEventListener("change", () =>
      this.#run(() => {
        const draft = structuredClone(this.#state.project);
        draft.name = input("project-name").value.trim() || "Untitled layout";
        this.#commit(draft);
      }),
    );
    select("table-preset").addEventListener("change", () => this.#showDimensions());
    element("table-form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.#run(() => this.#submitTable());
    });
    document.addEventListener("keydown", (event) => this.#run(() => this.#keyboard(event)));
  }

  #collapse(panel: "library" | "inspector", expanded?: boolean): void {
    const toggle = button(`toggle-${panel}`);
    const body = element(`${panel}-body`);
    body.hidden = expanded === undefined ? !body.hidden : !expanded;
    toggle.setAttribute("aria-expanded", String(!body.hidden));
    toggle.textContent = `${body.hidden ? "Show" : "Hide"} ${panel}`;
    if (panel === "library") {
      element("parts-list").hidden = body.hidden;
      toggle.closest(".library")?.classList.toggle("collapsed", body.hidden);
    }
  }

  #keyboard(event: KeyboardEvent): void {
    if (document.querySelector("dialog[open]")) return;
    const target = event.target;
    const shortcut = event.ctrlKey || event.metaKey;
    if (
      event.key === "Escape" &&
      (this.#placement || this.#seam.draft || this.#swap || this.#box)
    ) {
      this.#resetTools();
      this.#render();
      this.#renderPalette();
      return;
    }
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;
    if (shortcut && event.key.toLowerCase() === "z") {
      event.preventDefault();
      this.#history(event.shiftKey ? "redo" : "undo");
    } else if (shortcut && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.#history("redo");
    } else if (event.key === "Delete" || event.key === "Backspace") {
      if (!this.#state.selection.size || this.#seam.draft) return;
      event.preventDefault();
      this.#removeSelection();
    } else if (
      target instanceof SVGElement &&
      target.getAttribute("role") === "button" &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      const endpoint = connector(target);
      if (endpoint) this.#pickSeamEndpoint(endpoint);
      else this.#select(entity(target), event.shiftKey);
    } else if (target === element("tabletop")) {
      if (event.key === "Enter" && this.#placement) {
        event.preventDefault();
        this.#place(this.#camera.center);
      } else if (event.key === "+" || event.key === "=") this.#camera.zoom(0.8);
      else if (event.key === "-") this.#camera.zoom(1.25);
      else if (event.key.toLowerCase() === "r") this.#rotatePlacement();
    }
  }

  #startProject(): void {
    const preset = select("preset").value;
    if (preset === "custom") {
      this.#openTableForm(true);
      return;
    }
    const project = newProject();
    const standard = presets[preset];
    const table =
      standard && addTable(project, preset, standard.name, standard.width, standard.depth);
    this.#resetTools();
    this.#sections.reset();
    this.#commit(project, { fit: true, selectIds: table ? [table.id] : [] });
  }

  #openTableForm(creatingProject: boolean): void {
    this.#newTable = creatingProject;
    const project = this.#state.project;
    const size = creatingProject
      ? "custom"
      : presets[select("preset").value]
        ? select("preset").value
        : "30x40";
    select("table-preset").value = size;
    select("table-unit").value = "stud";
    input("table-width").value = "96";
    input("table-depth").value = "128";
    input("table-name").value = creatingProject ? "Table 1" : `Table ${project.tables.length + 1}`;
    this.#showDimensions();
    element("table-error").textContent = "";
    dialog("table-dialog").showModal();
  }

  #showDimensions(): void {
    element("custom-dimensions").hidden = select("table-preset").value !== "custom";
  }

  #submitTable(): void {
    const project = this.#newTable ? newProject() : structuredClone(this.#state.project);
    const unit = select("table-unit").value;
    const studsPerUnit = unit === "in" ? 25.4 / 8 : unit === "cm" ? 10 / 8 : 1;
    const width = input("table-width").valueAsNumber * studsPerUnit;
    const depth = input("table-depth").valueAsNumber * studsPerUnit;
    const preset = select("table-preset").value;
    const name = input("table-name").value.trim();
    if (!name) throw new Error("Enter a table name.");
    if (
      !presets[preset] &&
      (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0)
    ) {
      throw new Error("Enter a positive table width and depth.");
    }
    const table = addTable(project, preset, name, width, depth);
    this.#resetTools();
    if (this.#newTable) this.#sections.reset();
    this.#commit(project, { fit: true, selectIds: [table.id] });
    dialog("table-dialog").close();
  }

  #resetTools(): void {
    this.#placement = undefined;
    this.#seam.close();
    this.#swap = undefined;
    this.#box = false;
    cancelAnimationFrame(this.#dragFrame);
  }

  #history(direction: "undo" | "redo"): void {
    this.#resetTools();
    this.#state.change(direction);
    this.#render();
    this.#renderPalette();
  }

  #choose(tool: Tool): void {
    const toggleOff = this.#placement?.id === tool.id;
    this.#resetTools();
    if (!toggleOff) this.#placement = tool;
    this.#render();
    this.#renderPalette();
    toCanvas();
  }

  #rotatePlacement(): void {
    if (!this.#placement) return;
    this.#placement.angle = (this.#placement.angle + 90) % 360;
    this.#renderMode();
  }

  #place(point: Point): void {
    const tool = this.#placement;
    if (!tool) return;
    const project = structuredClone(this.#state.project);
    const hit = this.#camera.hit(point).find((node) => Boolean(node.closest("[data-table-id]")));
    const tableId = hit?.closest<SVGElement>("[data-table-id]")?.dataset["tableId"];
    let ids: string[];
    let snapIds: string[] | undefined;
    if (tool.kind === "baseplate") {
      const id = newId("baseplate");
      const table = project.tables.find((entry) => entry.id === tableId);
      const world = { ...point, angle: tool.angle };
      const pose = table ? snapNiltcBaseplatePose(table, localPose(world, table)) : world;
      project.items.push({
        id,
        kind: "baseplate",
        tableId,
        layerId: table?.layerId ?? layerId(project),
        ...pose,
      });
      ids = [id];
    } else {
      ids = placeTrack(project, this.#catalog, tool, point, tableId);
      snapIds = ids;
    }
    const fit = !project.tables.length && this.#state.project.items.length === 0;
    this.#placement = undefined;
    this.#commit(project, { fit, selectIds: ids, snapIds });
    this.#renderPalette();
  }

  #tap(point: Point, target: Element, multi: boolean): void {
    if (this.#placement) {
      this.#place(point);
      return;
    }
    if (this.#seam.draft) {
      this.#tapSeam(point, target);
      return;
    }
    if (this.#swap) return;
    this.#select(entity(target), multi);
  }

  #tapSeam(point: Point, target: Element): void {
    const direct = connector(target);
    if (!direct) return;
    const related = this.#camera.hit(point).flatMap((node) => {
      const hit = connector(node);
      return hit ? [hit] : [];
    });
    const candidates = this.#state.analysis.ports.filter((port) =>
      related.some((hit) => hit.pieceId === port.pieceId && hit.portId === port.portId),
    );
    const distance = (port: Point): number => Math.hypot(port.x - point.x, port.y - point.y);
    const nearest = Math.min(...candidates.map(distance));
    const close = candidates.filter((port) => distance(port) <= nearest + 0.75);
    if (close.length < 2) {
      this.#pickSeamEndpoint(close[0] ?? direct);
      return;
    }
    // Coincident ports have distinct owners, even when an S8 crosses the table edge.
    const table = this.#seam.activeTable;
    const fromTable = close.filter(({ pieceId }) =>
      this.#state.project.items.some((item) => item.id === pieceId && item.tableId === table),
    );
    if (fromTable.length === 1 && fromTable[0]) {
      this.#pickSeamEndpoint(fromTable[0]);
      return;
    }
    this.#seam.choices = close;
    this.#render();
    notice("Choose an overlapping connector in Seam controls.");
  }

  #pickSeamEndpoint(endpoint: Endpoint): void {
    const id = this.#seam.activeTable;
    const project = this.#state.project;
    const table = project.tables.find((table) => table.id === id);
    const track = project.items.find(({ id }) => id === endpoint.pieceId);
    if (table && track?.tableId !== id) {
      notice(`Pick a connector attached to ${table.name}.`, true);
      return;
    }
    const problem = this.#seam.capture(endpoint.pieceId, endpoint.portId);
    if (problem) {
      notice(problem, true);
      return;
    }
    this.#render();
    notice("Seam connector picked.");
  }

  #describeConnector({ pieceId, portId }: Endpoint): string {
    const item = this.#state.project.items.find(({ id }) => id === pieceId);
    if (item?.kind !== "track") return `Missing ${pieceId} / ${portId}`;
    const table = this.#state.project.tables.find(({ id }) => id === item.tableId);
    const part = this.#catalog.parts.find(({ id }) => id === item.partId);
    const partName = part?.name ?? item.partId;
    if (!part?.ports.some(({ id }) => id === portId)) return `Missing ${partName} / ${portId}`;
    return `${table?.name ?? "World"} / ${partName} / ${portId}`;
  }

  #select(id?: string, multi = false): void {
    this.#swap = undefined;
    const ids = this.#state.selection;
    const extend = multi || input("multi-select").checked;
    if (!extend) ids.clear();
    if (id) {
      if (extend && ids.has(id)) ids.delete(id);
      else ids.add(id);
    }
    this.#render();
  }

  #drag(from: Point, to: Point, phase: GesturePhase): void {
    cancelAnimationFrame(this.#dragFrame);
    if (phase === "cancel") {
      this.#render();
      return;
    }
    const project = structuredClone(this.#state.project);
    const ids = this.#state.selection;
    const moved = moveSelection(project, ids, from, to);
    this.#snapSelectedNiltcPose(project);
    const tableMoved = project.tables.some(({ id }) => ids.has(id));
    const snapIds = tableMoved ? undefined : moved;
    if (phase === "preview") {
      this.#dragFrame = requestAnimationFrame(() =>
        this.#run(() => {
          this.#renderScene(evaluate(project, this.#snap(snapIds)));
        }),
      );
    } else {
      this.#commit(project, { snapIds });
    }
  }

  #boxSelect(from: Point, to: Point, phase: GesturePhase): void {
    const svg = element("tabletop").querySelector("svg");
    if (!svg) return;
    svg.querySelector("[data-box-selection]")?.remove();
    if (phase === "cancel") return;
    const left = Math.min(from.x, to.x);
    const top = Math.min(from.y, to.y);
    const width = Math.abs(from.x - to.x);
    const height = Math.abs(from.y - to.y);
    if (phase === "preview") {
      const rectangle = document.createElementNS(svg.namespaceURI, "rect");
      rectangle.setAttribute("x", String(left));
      rectangle.setAttribute("y", String(top));
      rectangle.setAttribute("width", String(width));
      rectangle.setAttribute("height", String(height));
      rectangle.setAttribute("data-box-selection", "");
      svg.append(rectangle);
      return;
    }
    const rootMatrix = svg.getScreenCTM();
    if (!rootMatrix) return;
    const inverse = rootMatrix.inverse();
    const ids = this.#state.selection;
    if (!input("multi-select").checked) ids.clear();
    // Use the same SVG footprints the user saw in the drag box.
    for (const group of svg.querySelectorAll<SVGGraphicsElement>(
      "g[data-piece-id]:not([data-port-id])",
    )) {
      const id = group.dataset["pieceId"];
      const matrix = group.getScreenCTM();
      if (!id || !matrix) continue;
      const bounds = group.getBBox();
      const center = new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        .matrixTransform(matrix)
        .matrixTransform(inverse);
      if (
        center.x >= left &&
        center.x <= left + width &&
        center.y >= top &&
        center.y <= top + height
      )
        ids.add(id);
    }
    this.#box = false;
    this.#render();
  }

  #applyPose(change: PoseValues, origin: Pose): void {
    const project = structuredClone(this.#state.project);
    const ids = this.#state.selection;
    if (![change.x, change.y, change.angle].every(Number.isFinite))
      throw new Error("Enter valid coordinates and rotation.");
    if (change.heightPlates !== undefined && !Number.isSafeInteger(change.heightPlates)) {
      throw new Error("Enter a whole number of plates.");
    }
    if (change.fronts && (change.fronts.length > 2 || !validFronts(change.fronts))) {
      throw new Error("Choose one front or two adjacent fronts.");
    }
    const angle = change.angle % 360;
    moveSelection(project, ids, origin, change, angle - (origin.angle % 360));
    if (ids.size === 1) {
      const table = project.tables.find(({ id }) => ids.has(id));
      if (table) {
        table.angle = angle;
        if (change.name?.trim()) table.name = change.name.trim();
        if (change.fronts) table.fronts = change.fronts;
      }
      const item = project.items.find(({ id }) => ids.has(id));
      if (item && change.tableId !== undefined) {
        const world = { ...worldPose(item, project.tables), angle };
        const attach = project.tables.find(({ id }) => id === change.tableId);
        Object.assign(item, attach ? localPose(world, attach) : world);
        if (attach) item.tableId = attach.id;
        else delete item.tableId;
      }
      if (item?.kind === "track" && change.heightPlates !== undefined)
        item.heightPlates = change.heightPlates;
    }
    if (
      change.x !== origin.x ||
      change.y !== origin.y ||
      change.angle !== origin.angle ||
      change.tableId !== undefined
    ) {
      this.#snapSelectedNiltcPose(project);
    }
    this.#commit(project);
  }

  #snapSelectedNiltcPose(project: Project): void {
    const { selection } = this.#state;
    if (selection.size !== 1) return;
    const [id] = selection;
    const table = project.tables.find((entry) => entry.id === id);
    if (table) {
      if (!project.venue) Object.assign(table, snapNiltcTablePose(project, table, table));
      return;
    }
    const item = project.items.find((entry) => entry.id === id);
    if (item?.kind !== "baseplate") return;
    const parent = project.tables.find((entry) => entry.id === item.tableId);
    if (parent) Object.assign(item, snapNiltcBaseplatePose(parent, item));
  }

  #tagNiltcTable(niltc: Table["niltc"]): void {
    const project = structuredClone(this.#state.project);
    const table = project.tables.find(({ id }) => this.#state.selection.has(id));
    if (!table) return;
    if (niltc) table.niltc = niltc;
    else delete table.niltc;
    this.#commit(project);
  }

  #duplicateSelection(): void {
    const project = structuredClone(this.#state.project);
    const selectIds = duplicateTrackSelection(project, this.#state.selection);
    if (selectIds.length) this.#commit(project, { selectIds });
  }

  #removeSelection(): void {
    const project = structuredClone(this.#state.project);
    deleteSelection(project, this.#state.selection);
    this.#swap = undefined;
    this.#commit(project, { selectIds: [] });
  }

  #updateSelectedItems(update: (item: Item) => void): void {
    const project = structuredClone(this.#state.project);
    for (const item of project.items) if (this.#state.selection.has(item.id)) update(item);
    this.#commit(project);
  }

  #previewSwap(id: string, partId: string): void {
    const project = structuredClone(this.#state.project);
    swapTurnout(project, this.#catalog, id, partId);
    const before = this.#state.analysis;
    const analysis = evaluate(project);
    const joined = (result: Analysis): Set<string> =>
      new Set(
        result.ports
          .filter((port) => port.joined)
          .map(({ pieceId, portId }) => `${pieceId} / ${portId}`),
      );
    const old = joined(before);
    const updated = joined(analysis);
    const changes = [
      ...[...old].filter((key) => !updated.has(key)).map((key) => `Opens ${key}`),
      ...[...updated].filter((key) => !old.has(key)).map((key) => `Joins ${key}`),
    ];
    this.#swap = { analysis, changes };
    this.#render();
  }

  #renderSwap(): void {
    const swap = this.#swap;
    if (!swap) return;
    const panel = document.createElement("div");
    panel.id = "turnout-preview";
    panel.append(textNode("h3", "Turnout swap preview"));
    if (!swap.changes.length) panel.append(textNode("p", "No connector joins change."));
    else for (const change of swap.changes) panel.append(textNode("p", change));
    const confirm = action("Apply swap", () =>
      this.#run(() => {
        this.#swap = undefined;
        this.#commit(swap.analysis.project);
      }),
    );
    confirm.id = "confirm-swap";
    confirm.className = "primary";
    const cancel = action("Cancel swap", () => {
      this.#swap = undefined;
      this.#render();
    });
    cancel.id = "cancel-swap";
    panel.append(confirm, cancel);
    element("selection-panel").append(panel);
  }

  #openSeam(id?: string): void {
    this.#resetTools();
    if (id && this.#sections.focusSeam(id)) {
      this.#collapse("inspector", true);
      const details = element("sections-details");
      if (details instanceof HTMLDetailsElement) details.open = true;
      this.#render();
      this.#renderPalette();
      select("fixed-section-exit").focus();
      return;
    }
    if (!this.#seam.open(this.#state.project, id)) {
      notice("Add two tables before creating a seam.", true);
      return;
    }
    this.#render();
    this.#renderPalette();
    this.#showSeamPanel();
  }

  #showSeamPanel(): void {
    this.#collapse("inspector", true);
    if (window.matchMedia("(max-width: 750px)").matches) {
      element("seam-panel").scrollIntoView({ block: "nearest" });
    }
  }

  #saveSeam(): void {
    const seam = this.#seam.save(this.#state.project);
    const project = structuredClone(this.#state.project);
    const index = project.seams.findIndex(({ id }) => id === seam.id);
    if (index >= 0) project.seams[index] = seam;
    else project.seams.push(seam);
    this.#seam.close();
    this.#commit(project);
    notice("Seam saved.");
  }

  #removeSeam(): void {
    const project = structuredClone(this.#state.project);
    const id = this.#seam.draft?.id;
    project.seams = project.seams.filter((seam) => seam.id !== id);
    this.#seam.close();
    this.#commit(project);
  }

  #snap(pieceIds?: string[]): { pieceIds: string[]; radius: number } | undefined {
    return pieceIds?.length ? { pieceIds, radius: this.#camera.snapRadius } : undefined;
  }

  #commit(
    project: Project,
    options: { fit?: boolean; selectIds?: string[]; snapIds?: string[] } = {},
  ): void {
    this.#state.commit(project, this.#snap(options.snapIds));
    this.#swap = undefined;
    notice("");
    if (options.selectIds) {
      this.#state.selection.clear();
      for (const id of options.selectIds) this.#state.selection.add(id);
    }
    this.#render(options.fit);
    this.#renderPalette();
  }

  #renderScene(analysis = this.#state.analysis, fit = false): void {
    const scene = createScene(analysis.project, this.#catalog, analysis, {
      selection: this.#state.selection,
      grid: input("grid-toggle").checked,
      interaction: this.#seam.draft ? "ports" : this.#placement ? "placement" : "pieces",
      reuse: element("tabletop").querySelector<SVGSVGElement>("svg[data-track-scene]") ?? undefined,
    });
    this.#camera.show(scene, fit);
  }

  #renderMode(): void {
    const host = element("tabletop");
    host.dataset["mode"] = this.#seam.draft
      ? "seam"
      : this.#placement
        ? "place"
        : this.#box
          ? "box"
          : "select";
    const mode = this.#placement
      ? `Place ${this.#placement.name} (${this.#placement.angle} degrees)`
      : this.#seam.draft
        ? this.#seam.choices.length
          ? "Overlapping connectors"
          : this.#seam.prompt
        : this.#box
          ? "Drag a box around track"
          : "Select or drag a piece";
    element("mode-label").textContent = mode;
    element("empty-canvas").hidden =
      Boolean(this.#placement) ||
      Boolean(this.#state.project.venue) ||
      this.#state.project.tables.length > 0 ||
      this.#state.project.items.length > 0;
    button("rotate-placement").hidden = !this.#placement;
    button("seam-controls").hidden = !this.#seam.draft;
    button("seam-mode").setAttribute("aria-pressed", String(Boolean(this.#seam.draft)));
    button("box-select").setAttribute("aria-pressed", String(this.#box));
    button("add-baseplate").setAttribute(
      "aria-pressed",
      String(this.#placement?.kind === "baseplate"),
    );
  }

  #renderPalette(): void {
    renderPalette(this.#catalog, this.#placement?.id, (part) => this.#choose(part));
  }

  #render(fit = false): void {
    const { project, selection, analysis } = this.#state;
    const focusedId = document.activeElement?.id;
    this.#renderScene(this.#swap?.analysis ?? analysis, fit);
    this.#renderMode();
    input("project-name").value = project.name;
    button("undo").disabled = !this.#state.canUndo;
    button("redo").disabled = !this.#state.canRedo;
    renderSelection(project, this.#catalog, selection, {
      apply: (values, origin) => this.#run(() => this.#applyPose(values, origin)),
      remove: () => this.#run(() => this.#removeSelection()),
      turnout: (id, next) => this.#run(() => this.#previewSwap(id, next)),
      duplicate: () => this.#run(() => this.#duplicateSelection()),
      niltc: (standard) => this.#run(() => this.#tagNiltcTable(standard)),
      rotateQuarter: (origin) =>
        this.#run(() => this.#applyPose({ ...origin, angle: origin.angle + 90 }, origin)),
      baseplateColor: (color) =>
        this.#run(() =>
          this.#updateSelectedItems((item) => {
            if (item.kind === "baseplate") item.color = color;
          }),
        ),
      ballastStyle: (style) =>
        this.#run(() =>
          this.#updateSelectedItems((item) => {
            if (item.kind === "track") item.ballast = style;
          }),
        ),
      countBallast: (counted) =>
        this.#run(() =>
          this.#updateSelectedItems((item) => {
            if (item.kind === "track") item.countBallast = counted;
          }),
        ),
    });
    this.#renderSwap();
    this.#seam.render(analysis, {
      refresh: () => this.#render(),
      save: () => this.#run(() => this.#saveSeam()),
      remove: () => this.#run(() => this.#removeSeam()),
      pick: (endpoint) => this.#pickSeamEndpoint(endpoint),
      describe: (endpoint) => this.#describeConnector(endpoint),
      close: () => {
        this.#seam.close();
        this.#render();
      },
    });
    renderTables(project, selection, (id) => this.#select(id));
    renderDiagnostics(
      analysis,
      (id) => this.#select(id),
      (id) => this.#openSeam(id),
    );
    renderNiltcIssues(analysis, (id) => this.#select(id));
    this.#sections.render(element("sections-panel"), {
      analysis,
      selectedIds: selection,
      commit: (draft, selectIds) => this.#commit(draft, { selectIds, fit: Boolean(selectIds) }),
      describe: (endpoint) => this.#describeConnector(endpoint),
      notice,
      select: (ids) => {
        this.#resetTools();
        selection.clear();
        for (const id of ids) selection.add(id);
        this.#render();
        this.#renderPalette();
      },
    });
    renderVenue(
      analysis,
      (draft) => this.#run(() => this.#commit(draft)),
      (id) => this.#select(id),
    );
    renderInventory(showInventory(project, this.#catalog), (memberId, changes) =>
      this.#run(() => {
        const draft = structuredClone(project);
        const member = draft.members.find(({ id }) => id === memberId);
        if (!member) return;
        const commitments = new Map(Object.entries(member.bring));
        for (const [part, quantity] of changes) {
          if (quantity === null) commitments.delete(part);
          else commitments.set(part, quantity);
        }
        member.bring = Object.fromEntries(commitments);
        this.#commit(draft);
      }),
    );
    renderLayers(
      project,
      (id, visible) =>
        this.#run(() => {
          const draft = structuredClone(project);
          const layer = draft.layers.find((entry) => entry.id === id);
          if (layer) layer.visible = visible;
          this.#commit(draft);
        }),
      (id) => this.#select(id),
    );
    if (focusedId && document.activeElement === document.body) {
      document.getElementById(focusedId)?.focus({ preventScroll: true });
    }
  }
}

function validFronts(fronts: Edge[]): boolean {
  if (fronts.length < 2) return true;
  const opposite = new Set(fronts);
  return (
    !(opposite.has("north") && opposite.has("south")) &&
    !(opposite.has("west") && opposite.has("east"))
  );
}

async function main(): Promise<void> {
  try {
    const catalog = await initEngine();
    new Planner(catalog);
  } catch (error) {
    notice(`Cannot start Brick Track Planner: ${errorMessage(error)}`, true);
  }
}

void main();
