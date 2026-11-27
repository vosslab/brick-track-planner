import { button, element, input, select, toCanvas } from "./editor_dom";
import { areaCenter } from "./area_outline";
import { setupPartPicker } from "./editor_part_picker";
import {
  renderEditControls,
  renderSelectionInfo,
  renderTranslationFeedback,
} from "./editor_track_controls";
import {
  blockedEdit,
  captureRailGeometry,
  chooseDestination,
  endpointKey as key,
  hasRailJoint,
  missedSnapMessage,
  openRailEnds,
  preferredTranslationEnd,
  prepareTranslation,
  previewGap,
  previewPlacement,
  previewTranslation,
  protectedMessage,
  protectedTrack,
  remapRailGeometry,
  sameDestination,
  translationTargets,
} from "./editor_placement";
import type { Destination, EditPreview, RailGeometry } from "./editor_placement";
import { evaluate } from "./engine";
import type { Analysis } from "./engine";
import { poseConnectingPorts, projectId, visibleTrackItems } from "./project";
import type { Catalog, Point, Project, TrackItem } from "./project";
import { traceRoute } from "./route_trace";
import type { RouteLink } from "./route_trace";

type Hooks = {
  analysis: () => Analysis;
  studsPerPixel: () => number;
  commit: (project: Project) => void;
  render: () => void;
  renderPreview: () => void;
  cancelArrangement: () => void;
  notice: (message: string, error?: boolean) => void;
  noticePlacement: (receipt: string, pieceIds: readonly string[]) => void;
};

type RailEnd = Analysis["ports"][number];
const defaultPartId = "lego:rc-s16";
type TrackCopy = {
  items: readonly TrackItem[];
  geometry: RailGeometry;
};
type PointerPlacement = {
  last?: { point: Point; radius: number; end?: string };
  preview?: EditPreview;
};
type PieceEdit = PointerPlacement & { kind: "extend"; id: string };
type TranslationEdit = PointerPlacement & {
  kind: "drag" | "move" | "duplicate";
  items: readonly TrackItem[];
  origin: Point;
  geometry: ReturnType<typeof prepareTranslation>;
  preferredSourceEnd?: string;
  targets: Map<string, RailEnd>;
  destination?: Destination;
};
type Interaction =
  | { kind: "select" }
  | PieceEdit
  | { kind: "trace" }
  | TranslationEdit
  | { kind: "connect"; first?: RailEnd; preview?: EditPreview };

function portKey(hit?: SVGElement | null): string | undefined {
  const pieceId = hit?.dataset["pieceId"];
  const portId = hit?.dataset["portId"];
  return pieceId && portId ? key({ pieceId, portId }) : undefined;
}

export class TrackTools {
  readonly #catalog: Catalog;
  readonly #hooks: Hooks;
  readonly #resetParts: () => void;
  #selectedPartId = defaultPartId;
  #interaction: Interaction = { kind: "select" };
  #selected = new Set<string>();
  #stack: readonly string[] = [];
  #multiple = false;
  #arrangement = false;
  #copied: TrackCopy | undefined;
  #translationFrame: number | undefined;
  #route: RouteLink[] = [];
  #openEnds = new Map<string, Analysis["ports"][number]>();

  constructor(catalog: Catalog, hooks: Hooks) {
    this.#catalog = catalog;
    this.#hooks = hooks;
    for (const radio of [input("build-arrangement"), input("build-piece")]) {
      radio.addEventListener("change", () => {
        this.cancel();
        this.#showTool();
      });
    }
    this.#resetParts = setupPartPicker(catalog, {
      selectedId: () => this.#selectedPartId,
      selectPart: (id) => {
        this.#selectedPartId = id;
        this.#showPart();
        this.#cancelPartPreview();
      },
      browse: () => this.#cancelPartPreview(),
      showArrangements: () => {
        input("build-arrangement").click();
        select("arrangement").focus();
      },
    });
    this.#showPart();
    select("piece-port").addEventListener("change", () => this.#refreshPiecePreview());
    select("piece-target").addEventListener("change", () => {
      this.stopPicking();
      this.#showTool();
      this.#hooks.render();
    });
    button("extend-piece").addEventListener("click", () => this.#placePiece());
    button("trace-route").addEventListener("click", () => this.#armTrace());
    select("trace-from").addEventListener("change", () => this.#armTrace());
    button("remove-piece").addEventListener("click", () => this.remove());
    button("move-track").addEventListener("click", () => this.#startMove());
    button("next-track-here").addEventListener("click", () => {
      const [id] = this.#selected;
      if (!id || !this.selecting || this.#stack.length < 2) return;
      const next = this.#stack[(this.#stack.indexOf(id) + 1) % this.#stack.length];
      if (next) this.selectPiece(next);
    });
    button("rotate-track-left").addEventListener("click", () => this.#rotate(-90));
    button("rotate-track-right").addEventListener("click", () => this.#rotate(90));
    button("duplicate-track").addEventListener("click", () => {
      const [item] = this.#selectedTrack();
      if (item && this.#selected.size === 1) this.#startCopy(this.#captureCopy([item]));
    });
    button("copy-track").addEventListener("click", () => this.copy());
    button("paste-track").addEventListener("click", () => this.startPaste());
    button("select-multiple").addEventListener("click", () => {
      this.cancel();
      this.#stack = [];
      this.#multiple = !this.#multiple;
      this.#editControls();
    });
    button("select-arrangement").addEventListener("click", () => this.#selectArrangement());
    button("connect-ends").addEventListener("click", () => this.#startConnect());
    button("place-edit").addEventListener("click", () => this.#applyPreview());
    button("cancel-edit").addEventListener("click", () => this.cancel());
    select("placement-grid").addEventListener("change", () => {
      const edit = this.#interaction;
      if (edit.kind !== "move" && edit.kind !== "duplicate") return;
      this.#hooks.render();
      if (edit.last) {
        const { point, radius, end } = edit.last;
        edit.destination = undefined;
        this.#updateTranslation(edit, point, radius, end);
      }
      this.#editControls();
    });
    const positionForm = element("track-position-form");
    if (positionForm instanceof HTMLFormElement)
      positionForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.#setPosition();
      });
  }

  get selection(): ReadonlySet<string> {
    return this.#selected;
  }

  get selecting(): boolean {
    return !this.#arrangement && this.#interaction.kind === "select";
  }

  useDefaultTool(): void {
    input(this.#hooks.analysis().project.area.niltc ? "build-arrangement" : "build-piece").checked =
      true;
    this.#selectedPartId = defaultPartId;
    this.#resetParts();
    this.#showPart();
    this.#multiple = false;
  }

  #selectedTrack(): TrackItem[] {
    return visibleTrackItems(this.#hooks.analysis().project).filter(({ id }) =>
      this.#selected.has(id),
    );
  }

  #showTool(): void {
    const piece = input("build-piece").checked;
    element("arrangement-tools").hidden = piece;
    element("piece-tools").hidden = !piece;
    const { project } = this.#hooks.analysis();
    const empty = !visibleTrackItems(project).length;
    element("build-hint").textContent = piece
      ? empty
        ? "Choose a track part to start your layout."
        : this.#openEnds.size
          ? "Place a part on the drawing or connect it to an open rail end."
          : "Place a part anywhere on the drawing."
      : project.area.niltc
        ? "To park a train behind your display, preview a siding off the mainline."
        : "Preview a connected group of track pieces in your design area.";
    const target = select("piece-target").value;
    const action = button("extend-piece");
    action.textContent =
      target === "drawing"
        ? "Place on drawing"
        : target === "center"
          ? "Place at center"
          : "Connect part";
    action.disabled = !select("piece-port").value;
  }

  #placePiece(): void {
    const target = select("piece-target").value;
    const id = projectId("track");
    this.cancel();
    if (target === "drawing") {
      this.#interaction = { kind: "extend", id };
      const message = "Click or tap the drawing to place the part.";
      this.#hooks.notice(message);
      element("piece-info").textContent = message;
      this.#editControls();
      this.#hooks.render();
      toCanvas();
      return;
    }
    const { area } = this.#hooks.analysis().project;
    this.#applyPiece(
      this.#previewPiece(
        id,
        areaCenter(area),
        0,
        target === "center" ? undefined : target,
        target === "center",
      ),
    );
  }
  get route(): RouteLink[] {
    return this.#route;
  }
  get pickingPort(): boolean {
    const { kind } = this.#interaction;
    return (
      kind === "extend" ||
      kind === "trace" ||
      kind === "connect" ||
      ((kind === "move" || kind === "duplicate") && !this.#fine)
    );
  }
  get pickingDestination(): boolean {
    const { kind } = this.#interaction;
    return kind === "extend" || kind === "move" || kind === "duplicate";
  }
  get targetPorts(): Pick<ReadonlySet<string>, "has"> | undefined {
    const edit = this.#interaction;
    if (edit.kind === "extend" || edit.kind === "connect") return this.#openEnds;
    if ((edit.kind === "move" || edit.kind === "duplicate") && !this.#fine) return edit.targets;
    return undefined;
  }

  get editPreview(): EditPreview | undefined {
    const edit = this.#interaction;
    if ("preview" in edit && edit.preview) return edit.preview;
    if (edit.kind === "connect" && edit.first) return blockedEdit("", [], [edit.first]);
    if (edit.kind === "move") return blockedEdit("", [], [edit.origin]);
    return undefined;
  }

  get #fine(): boolean {
    return select("placement-grid").value === "fine";
  }

  setArrangementActive(active: boolean): void {
    this.#arrangement = active;
    this.#editControls();
  }

  stopPicking(): void {
    this.#cancelTranslationFrame();
    this.#interaction = { kind: "select" };
    this.#stack = [];
    select("placement-grid").value = "club";
    this.#route = [];
    element("route-info").textContent = "";
    element("piece-info").textContent = "";
    this.#editControls();
  }

  cancel(): boolean {
    const active = this.#arrangement || this.#interaction.kind !== "select";
    if (!active) {
      select("placement-grid").value = "club";
      return false;
    }
    const focused = document.activeElement;
    const focusedAction = element("placement-actions").contains(focused);
    const grid = select("placement-grid");
    this.#hooks.cancelArrangement();
    this.stopPicking();
    this.#hooks.render();
    if (focusedAction || (focused === grid && grid.hidden))
      element("tabletop").focus({ preventScroll: true });
    return true;
  }

  selectPiece(id: string): void {
    if (!this.selecting) this.cancel();
    if (!this.#stack.includes(id)) this.#stack = [];
    this.#selected = new Set([id]);
    this.#selectionInfo();
    this.#hooks.render();
  }

  addToSelection(ids: readonly string[]): void {
    if (!this.selecting || !ids.length) return;
    this.#stack = [];
    if (this.#selectedTrack().length !== this.#selected.size) this.#selected.clear();
    for (const id of ids) this.#selected.add(id);
    this.#selectionInfo();
    this.#hooks.render();
  }

  copy(): boolean {
    const items = this.#selectedTrack();
    if (!items.length) return false;
    this.#copied = this.#captureCopy(items);
    button("paste-track").disabled = false;
    this.#editControls();
    this.#hooks.notice("Track copied. Paste to place a duplicate.");
    return true;
  }

  startPaste(): boolean {
    if (!this.#copied) return false;
    this.#startCopy(this.#copied);
    return true;
  }

  get #part(): Catalog["parts"][number] | undefined {
    return this.#catalog.parts.find(({ id }) => id === this.#selectedPartId);
  }

  #showPart(): void {
    const part = this.#part;
    element("selected-part-title").textContent = part?.browse?.label ?? "";
    element("selected-part-model").textContent = part ? `${part.brand} · ${part.name}` : "";
    select("piece-port").replaceChildren(
      ...(part?.ports ?? [])
        .filter(({ type }) => type === "regular")
        .map((p) => new Option(p.id, p.id)),
    );
  }

  #cancelPartPreview(): void {
    if (this.#interaction.kind === "extend") this.cancel();
  }

  #armTrace(): void {
    this.cancel();
    this.#interaction = { kind: "trace" };
    const instruction = "Choose the track or connector to trace to.";
    this.#hooks.notice(instruction);
    element("route-info").textContent = instruction;
    this.#editControls();
    this.#hooks.render();
    toCanvas();
  }

  reset(clearSelection = false): void {
    this.#arrangement = false;
    this.stopPicking();
    const analysis = this.#hooks.analysis();
    const visible = new Set(
      analysis.project.layers.filter(({ visible }) => visible).map(({ id }) => id),
    );
    this.#selected = clearSelection
      ? new Set()
      : new Set(
          analysis.project.items
            .filter(({ id, layerId }) => this.#selected.has(id) && visible.has(layerId))
            .map(({ id }) => id),
        );
    if (clearSelection) this.#multiple = false;
    const options = new Map<string, string>();
    for (const exit of analysis.project.area.exits) {
      for (const lane of ["outer", "inner"] as const) {
        options.set(key(exit[lane]), `${exit.name} · ${lane} mainline`);
      }
    }
    const tracks = new Map(visibleTrackItems(analysis.project).map((item) => [item.id, item]));
    const names = new Map(this.#catalog.parts.map((part) => [part.id, part.name]));
    this.#openEnds = new Map(openRailEnds(analysis).map((port) => [key(port), port]));
    const target = select("piece-target");
    target.replaceChildren(
      new Option("Choose on the drawing", "drawing"),
      new Option("Center of design area", "center"),
    );
    if (!tracks.size) target.value = "center";
    for (const port of analysis.ports) {
      const item = tracks.get(port.pieceId);
      if (
        !port.joined &&
        port.type === "regular" &&
        !options.has(key(port)) &&
        item?.kind === "track"
      ) {
        const label = `${names.get(item.partId)} · ${port.portId} (${Math.round(port.x)}, ${Math.round(port.y)})`;
        if (this.#openEnds.has(key(port))) target.add(new Option(label, key(port)));
        options.set(key(port), label);
      }
    }
    const soleOpenEnd = this.#openEnds.keys().next().value;
    if (this.#openEnds.size === 1 && soleOpenEnd) target.value = soleOpenEnd;
    this.#showTool();
    const selectFrom = select("trace-from");
    const previous = selectFrom.value;
    selectFrom.replaceChildren(...[...options].map(([value, label]) => new Option(label, value)));
    if (options.has(previous)) selectFrom.value = previous;
    button("trace-route").disabled = !options.size;
    this.#selectionInfo();
  }

  pick(
    point: Point,
    target: Element,
    radius: number,
    multiple = false,
    trackStack?: readonly string[],
  ): void {
    const hit = target.closest<SVGElement>("[data-piece-id]");
    const id = hit?.dataset["pieceId"];
    const portId = hit?.dataset["portId"];
    const edit = this.#interaction;
    if (edit.kind === "move" || edit.kind === "duplicate") {
      this.#cancelTranslationFrame();
      this.#updateTranslation(edit, point, radius, portKey(hit));
      this.#applyPreview();
      return;
    }
    if (edit.kind === "extend") {
      this.#cancelTranslationFrame();
      this.#applyPiece(this.#previewPiece(edit.id, point, radius, portKey(hit)));
      return;
    }
    if (edit.kind === "connect") {
      this.#pickGapEnd(edit, point, radius, portKey(hit));
      return;
    }
    if (edit.kind === "select") {
      this.#stack = [];
      if (this.#multiple || multiple) {
        if (
          id &&
          this.#hooks
            .analysis()
            .project.items.some((item) => item.id === id && item.kind === "track")
        ) {
          if (this.#selected.has(id)) this.#selected.delete(id);
          else {
            if (this.#selectedTrack().length !== this.#selected.size) this.#selected.clear();
            this.#selected.add(id);
          }
        }
      } else {
        const top = trackStack?.[0] ?? id;
        if (trackStack && trackStack.length > 1) this.#stack = trackStack;
        this.#selected = new Set(top ? [top] : []);
      }
      this.#selectionInfo();
      this.#hooks.render();
      return;
    }
    if (edit.kind === "drag") return;
    const analysis = this.#hooks.analysis();
    const ports = analysis.ports
      .filter(
        (p) =>
          p.type === "regular" && (!id || p.pieceId === id) && (!portId || p.portId === portId),
      )
      .map((p) => ({ port: p, distance: Math.hypot(p.x - point.x, p.y - point.y) }))
      .sort((a, b) => a.distance - b.distance);
    if (edit.kind === "trace") {
      const value = select("trace-from").value;
      const start = analysis.ports.find((p) => key(p) === value);
      if (!start || (!id && (ports[0]?.distance ?? Infinity) > radius)) return;
      let route: RouteLink[] | undefined;
      const targetId = id ?? ports[0]?.port.pieceId;
      for (const { port } of ports.filter(({ port }) => port.pieceId === targetId)) {
        route = traceRoute(analysis.routes, start, port);
        if (route !== undefined) break;
      }
      this.#route = route ?? [];
      this.#selected = new Set(targetId ? [targetId] : []);
      const message = route
        ? `Connected route through ${route.filter((link) => link.kind === "internal").length} track sections.`
        : "No connected route from that entrance.";
      element("route-info").textContent = message;
      this.#hooks.notice(message, !route);
    }
    this.#selectionInfo();
    this.#hooks.render();
  }

  beginMove(point: Point, target: Element, stack: readonly string[]): "drag" | "pan" | "blocked" {
    if (this.#arrangement || this.#interaction.kind !== "select") return "pan";
    const id =
      stack.find((candidate) => this.#selected.has(candidate)) ??
      stack[0] ??
      target.closest<SVGElement>("[data-piece-id]")?.dataset["pieceId"];
    if (!id) return "pan";
    const project = this.#hooks.analysis().project;
    const item = project.items.find((entry) => entry.id === id);
    if (!item || item.kind !== "track") return "pan";
    if (!this.#selected.has(id)) this.#selected = new Set([id]);
    this.#stack = stack.length > 1 && this.#selected.size === 1 ? stack : [];
    const selected = this.#selectedTrack();
    if (protectedTrack(project, this.#selected)) {
      this.#selectionInfo();
      this.#hooks.render();
      return "blocked";
    }
    this.#startTranslation("drag", selected, point, undefined, id);
    return "drag";
  }

  move(point: Point, radius: number, target?: Element): void {
    const edit = this.#interaction;
    if (
      edit.kind !== "extend" &&
      edit.kind !== "drag" &&
      edit.kind !== "move" &&
      edit.kind !== "duplicate"
    )
      return;
    edit.last = { point, radius, end: portKey(target?.closest<SVGElement>("[data-piece-id]")) };
    if (this.#translationFrame !== undefined) return;
    this.#translationFrame = requestAnimationFrame(() => {
      this.#translationFrame = undefined;
      if (this.#interaction !== edit || !edit.last) return;
      if (edit.kind === "extend") this.#refreshPiecePreview();
      else this.#updateTranslation(edit, edit.last.point, edit.last.radius, edit.last.end);
    });
  }

  clearHover(): void {
    const edit = this.#interaction;
    if (edit.kind !== "extend" && edit.kind !== "move" && edit.kind !== "duplicate") return;
    this.#cancelTranslationFrame();
    edit.last = undefined;
    if (!edit.preview) return;
    if (edit.kind !== "extend") edit.destination = undefined;
    edit.preview = undefined;
    renderTranslationFeedback(undefined, this.#fine);
    this.#hooks.renderPreview();
  }

  #cancelTranslationFrame(): void {
    if (this.#translationFrame !== undefined) cancelAnimationFrame(this.#translationFrame);
    this.#translationFrame = undefined;
  }

  endMove(point: Point, radius: number, cancelled: boolean): void {
    const edit = this.#interaction;
    if (edit.kind !== "drag") return;
    if (cancelled) {
      this.stopPicking();
      this.#hooks.renderPreview();
    } else {
      this.#cancelTranslationFrame();
      this.#updateTranslation(edit, point, radius);
      this.#applyPreview();
    }
  }

  #startMove(): void {
    const selected = this.#selectedTrack();
    const [first] = selected;
    if (!first || protectedTrack(this.#hooks.analysis().project, this.#selected)) return;
    this.#startTranslation("move", selected, first);
  }

  nudge(shift: Point): boolean {
    if (!this.selecting || !this.#selected.size) return false;
    const items = this.#selectedTrack();
    if (!items.length) return false;
    const analysis = this.#hooks.analysis();
    if (protectedTrack(analysis.project, this.#selected)) {
      this.#hooks.notice(protectedMessage, true);
      return true;
    }
    const context = prepareTranslation(analysis, items);
    const destination = chooseDestination(context, shift, 0, true);
    const receipt =
      items.length === 1 ? "Moved track piece." : `Moved ${items.length} track pieces.`;
    this.#applyPlacement(previewTranslation(analysis, context, items, destination), receipt);
    return true;
  }

  #captureCopy(items: readonly TrackItem[]): TrackCopy {
    const analysis = this.#hooks.analysis();
    const ids = new Set(items.map(({ id }) => id));
    const groupSizes = new Map<string, number>();
    for (const { groupId } of items) {
      if (groupId) groupSizes.set(groupId, (groupSizes.get(groupId) ?? 0) + 1);
    }
    for (const item of analysis.project.items) {
      if (item.kind === "track" && item.groupId && !ids.has(item.id))
        groupSizes.delete(item.groupId);
    }
    return {
      items: items.map((item) =>
        item.groupId && (groupSizes.get(item.groupId) ?? 0) > 1
          ? { ...item }
          : { ...item, groupId: undefined, arrangementId: undefined },
      ),
      geometry: captureRailGeometry(analysis, items),
    };
  }

  #startCopy(source: TrackCopy): void {
    const ids = new Map<string, string>();
    const groupIds = new Map<string, string>();
    const items = source.items.map((item) => {
      const id = projectId("track");
      ids.set(item.id, id);
      const sourceGroupId = item.groupId;
      let groupId = sourceGroupId && groupIds.get(sourceGroupId);
      if (sourceGroupId && !groupId) {
        groupId = projectId("group");
        groupIds.set(sourceGroupId, groupId);
      }
      return { ...item, id, groupId };
    });
    const [first] = items;
    if (first)
      this.#startTranslation("duplicate", items, first, remapRailGeometry(source.geometry, ids));
  }

  #startTranslation(
    kind: TranslationEdit["kind"],
    items: readonly TrackItem[],
    origin: Point,
    copied?: RailGeometry,
    grabbedId?: string,
  ): void {
    if (!this.selecting) this.cancel();
    const geometry = prepareTranslation(this.#hooks.analysis(), items, copied);
    this.#interaction = {
      kind,
      items,
      origin,
      geometry,
      preferredSourceEnd: grabbedId
        ? preferredTranslationEnd(geometry, grabbedId, origin, 12 * this.#hooks.studsPerPixel())
        : undefined,
      targets: new Map(translationTargets(geometry).map((port) => [key(port), port])),
    };
    this.#selectionInfo();
    this.#hooks.render();
    if (kind !== "drag") element("tabletop").focus({ preventScroll: true });
  }

  #updateTranslation(edit: TranslationEdit, point: Point, radius: number, end?: string): void {
    edit.last = { point, radius, end };
    const shift = { x: point.x - edit.origin.x, y: point.y - edit.origin.y };
    const destination = chooseDestination(
      edit.geometry,
      shift,
      radius,
      this.#fine,
      this.#fine ? undefined : end,
      { preferredSourceEnd: edit.preferredSourceEnd, tieDistance: this.#hooks.studsPerPixel() },
    );
    if (sameDestination(edit.destination, destination)) return;
    edit.destination = destination;
    edit.preview = previewTranslation(
      this.#hooks.analysis(),
      edit.geometry,
      edit.items,
      destination,
    );
    renderTranslationFeedback(edit.preview, this.#fine);
    this.#hooks.renderPreview();
  }

  #selectArrangement(): void {
    const [item] = this.#selectedTrack();
    if (!item?.groupId || this.#selected.size !== 1) return;
    const group = visibleTrackItems(this.#hooks.analysis().project).filter(
      (candidate) => candidate.groupId === item.groupId,
    );
    this.#stack = [];
    this.#selected = new Set(group.map(({ id }) => id));
    this.#selectionInfo();
    this.#hooks.render();
    element("tabletop").focus({ preventScroll: true });
  }

  #startConnect(): void {
    this.cancel();
    this.#interaction = { kind: "connect" };
    this.#editControls();
    this.#hooks.render();
    toCanvas();
  }

  #pickGapEnd(
    edit: Extract<Interaction, { kind: "connect" }>,
    point: Point,
    radius: number,
    endpoint?: string,
  ): void {
    const end = this.#nearbyOpenEnd(point, radius, endpoint);
    if (!end)
      edit.preview = blockedEdit(
        "Choose one of the highlighted open rail ends.",
        [],
        edit.first ? [edit.first] : [],
      );
    else if (!edit.first || key(edit.first) === key(end)) {
      edit.first = end;
      edit.preview = undefined;
    } else edit.preview = previewGap(this.#hooks.analysis(), this.#catalog, edit.first, end);
    this.#editControls();
    this.#hooks.renderPreview();
  }

  #applyPreview(): void {
    const edit = this.#interaction;
    if (edit.kind === "connect") {
      if (edit.preview?.kind !== "ready") return;
      this.#hooks.commit(edit.preview.project);
      const count = edit.preview.items.length;
      this.#hooks.notice(
        `Connected both ends with ${count} ${count === 1 ? "piece" : "pieces"}. ${edit.preview.message}`,
      );
      element("tabletop").focus({ preventScroll: true });
    } else if (edit.kind === "drag" || edit.kind === "move" || edit.kind === "duplicate") {
      if (!edit.preview) return;
      const count = edit.items.length;
      const receipt =
        edit.kind === "duplicate"
          ? "Placed duplicate track."
          : `Moved ${count === 1 ? "track piece" : `${count} track pieces`}.`;
      this.#applyPlacement(edit.preview, receipt);
      if (edit.kind !== "drag") element("tabletop").focus({ preventScroll: true });
    }
  }

  #nearbyOpenEnd(point: Point, radius: number, endpoint?: string): RailEnd | undefined {
    if (endpoint) return this.#openEnds.get(endpoint);
    let nearest = radius;
    let end: RailEnd | undefined;
    for (const candidate of this.#openEnds.values()) {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance >= nearest) continue;
      nearest = distance;
      end = candidate;
    }
    return end;
  }

  #refreshPiecePreview(): void {
    const edit = this.#interaction;
    if (edit.kind !== "extend" || !edit.last) return;
    const { point, radius, end } = edit.last;
    edit.preview = this.#previewPiece(edit.id, point, radius, end);
    this.#hooks.renderPreview();
  }

  #previewPiece(
    id: string,
    point: Point,
    radius: number,
    end?: string,
    centered = false,
  ): EditPreview {
    const part = this.#part;
    const incoming = part?.ports.find(({ id }) => id === select("piece-port").value);
    if (!part || !incoming) return blockedEdit("Choose a track part and its connecting end.");
    const { project } = this.#hooks.analysis();
    const target = this.#nearbyOpenEnd(point, radius, end);
    const item: TrackItem = {
      kind: "track",
      partId: part.id,
      id,
      layerId: project.layers.find(({ visible }) => visible)?.id ?? "",
      x: centered ? point.x : Math.round(point.x),
      y: centered ? point.y : Math.round(point.y),
      angle: 0,
      heightPlates: project.area.niltc ? 2 : 0,
    };
    if (target) {
      const snapped = {
        ...item,
        ...poseConnectingPorts(incoming, target),
        heightPlates: target.heightPlates,
      };
      const preview = previewPlacement(project, project, [snapped], [target]);
      if (
        preview.kind === "ready" &&
        hasRailJoint(evaluate(preview.project), { pieceId: id, portId: incoming.id }, target)
      ) {
        preview.message = "Snapped to the rail end.";
        return preview;
      }
    }
    const preview = previewPlacement(project, project, [item]);
    if (preview.kind === "ready" && (end || target)) preview.message = missedSnapMessage;
    return preview;
  }

  #applyPiece(preview: EditPreview): void {
    const part = this.#catalog.parts.find(({ id }) => id === preview.items[0]?.partId);
    this.#applyPlacement(preview, part ? `Placed ${part.name}.` : "Placed track piece.");
    if (preview.kind === "blocked") element("piece-info").textContent = preview.message;
  }

  #applyPlacement(preview: EditPreview, receipt: string): void {
    if (preview.kind === "blocked" || !preview.items.length) {
      this.stopPicking();
      this.#hooks.render();
      if (preview.kind === "blocked") this.#hooks.notice(preview.message, true);
      else this.#hooks.notice("Position unchanged.");
      return;
    }
    const ids = preview.items.map(({ id }) => id);
    this.#multiple = false;
    this.#selected = new Set(ids);
    this.#hooks.commit(preview.project);
    this.#hooks.noticePlacement([receipt, preview.message].filter(Boolean).join(" "), ids);
  }

  #setPosition(): void {
    const [item] = this.#selectedTrack();
    if (!item || this.#selected.size !== 1) return;
    const x = input("track-x").valueAsNumber;
    const y = input("track-y").valueAsNumber;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.#commitTransform(item, { ...item, x, y }, "Moved track piece.");
  }

  #rotate(degrees: number): void {
    const [item] = this.#selectedTrack();
    if (!item || this.#selected.size !== 1) return;
    const angle = ((item.angle % 360) + degrees + 360) % 360;
    this.#commitTransform(item, { ...item, angle }, "Rotated track piece.");
  }

  #commitTransform(original: TrackItem, item: TrackItem, message: string): void {
    if (original.x === item.x && original.y === item.y && original.angle === item.angle) return;
    const analysis = this.#hooks.analysis();
    if (protectedTrack(analysis.project, this.#selected)) {
      this.#hooks.notice(protectedMessage, true);
      return;
    }
    this.cancel();
    const context = prepareTranslation(analysis, [original]);
    this.#applyPlacement(previewPlacement(analysis.project, context.stationary, [item]), message);
  }

  #editControls(): void {
    const edit = this.#interaction;
    // Canvas coordinates for a direct drag depend on the control geometry at pointer-down.
    if (edit.kind === "drag") return;
    if (edit.kind !== "move" && edit.kind !== "duplicate")
      renderTranslationFeedback(undefined, this.#fine);
    const [id] = this.#selected;
    const stackIndex = edit.kind === "select" && id ? this.#stack.indexOf(id) : -1;
    const item = stackIndex >= 0 ? this.#selectedTrack()[0] : undefined;
    const stack = item
      ? `Track ${stackIndex + 1} of ${this.#stack.length} · ${this.#catalog.parts.find(({ id }) => id === item.partId)?.name ?? item.partId}`
      : undefined;
    renderEditControls({
      kind: edit.kind,
      preview: edit.kind === "connect" || edit.kind === "extend" ? edit.preview : undefined,
      stack,
      hasFirstRailEnd: edit.kind === "connect" && Boolean(edit.first),
      arrangement: this.#arrangement,
      multiple: this.#multiple,
      selected: this.#selected,
      getProject: () => this.#hooks.analysis().project,
    });
  }

  #selectionInfo(): void {
    const { project } = this.#hooks.analysis();
    renderSelectionInfo(
      project,
      this.#catalog,
      this.#selected,
      this.#openEnds.size,
      (item, changes) => {
        this.#hooks.commit({
          ...project,
          items: project.items.map((p) => (p === item ? { ...item, ...changes } : p)),
        });
      },
    );
    this.#editControls();
  }

  remove(): void {
    if (!this.#selected.size || !this.selecting) return;
    const project = this.#hooks.analysis().project;
    if (protectedTrack(project, this.#selected)) {
      this.#hooks.notice(protectedMessage, true);
      return;
    }
    const count = this.#selected.size;
    this.#hooks.commit({
      ...project,
      items: project.items.filter(({ id }) => !this.#selected.has(id)),
    });
    this.#hooks.notice(`Removed ${count === 1 ? "track piece" : `${count} track pieces`}.`);
  }
}
