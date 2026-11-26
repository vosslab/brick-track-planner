import { commitItems } from "./arrangements";
import { button, element, input, select } from "./editor_dom";
import { renderBallast } from "./editor_panels";
import {
  blockedEdit,
  checkEdit,
  chooseDestination,
  endpointKey as key,
  openRailEnds,
  prepareTranslation,
  previewGap,
  previewTranslation,
  protectedMessage,
  protectedTrack,
  translationTargets,
} from "./editor_placement";
import type { Destination, EditPreview } from "./editor_placement";
import type { Analysis } from "./engine";
import {
  ensureVisibleWorkingLayer,
  poseConnectingPorts,
  projectId,
  visibleTrackItems,
} from "./project";
import type { Catalog, Point, Project, TrackItem } from "./project";
import { traceRoute } from "./route_trace";
import type { RouteLink } from "./route_trace";

type Hooks = {
  analysis: () => Analysis;
  commit: (project: Project) => void;
  render: () => void;
  renderPreview: () => void;
  cancelArrangement: () => void;
  notice: (message: string, error?: boolean) => void;
};

type RailEnd = Analysis["ports"][number];
type TranslationEdit = {
  kind: "drag" | "move" | "duplicate";
  items: readonly TrackItem[];
  origin: Point;
  geometry: ReturnType<typeof prepareTranslation>;
  targets: Map<string, RailEnd>;
  last?: { point: Point; radius: number; end?: string };
  destination?: Destination;
  preview?: EditPreview;
};
type Interaction =
  | { kind: "select" }
  | { kind: "extend" }
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
  #interaction: Interaction = { kind: "select" };
  #selected = new Set<string>();
  #multiple = false;
  #arrangement = false;
  #copied: TrackItem | undefined;
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
    const choices = select("piece-choice");
    for (const part of catalog.parts.filter(({ ports }) =>
      ports.some(({ type }) => type === "regular"),
    )) {
      choices.add(new Option(`${part.brand} · ${part.name}`, part.id));
    }
    choices.value = "lego:rc-s16";
    choices.addEventListener("change", () => this.#piecePorts());
    this.#piecePorts();
    select("piece-target").addEventListener("change", () => {
      this.stopPicking();
      this.#showTool();
      this.#hooks.render();
    });
    button("extend-piece").addEventListener("click", () => this.#placePiece());
    button("trace-route").addEventListener("click", () => this.#arm("trace"));
    select("trace-from").addEventListener("change", () => this.#arm("trace"));
    button("remove-piece").addEventListener("click", () => this.remove());
    button("move-track").addEventListener("click", () => this.#startMove());
    button("rotate-track-left").addEventListener("click", () => this.#rotate(-90));
    button("rotate-track-right").addEventListener("click", () => this.#rotate(90));
    button("duplicate-track").addEventListener("click", () => {
      const [item] = this.#selectedTrack();
      if (item && this.#selected.size === 1) this.#startCopy(item);
    });
    button("select-multiple").addEventListener("click", () => {
      this.cancel();
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

  useDefaultTool(): void {
    input(this.#hooks.analysis().project.area.niltc ? "build-arrangement" : "build-piece").checked =
      true;
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
        ? "Choose a piece to start the track in your design area."
        : this.#openEnds.size
          ? "Extend an open track end with the piece you choose."
          : project.area.exits.length
            ? "The mainline ends connect to the next display. Choose Arrangement to branch off with a siding or switch."
            : "There are no open track ends. Choose Arrangement to insert a switch."
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
          : "Connect piece";
    action.disabled = !select("piece-port").value || (!empty && !this.#openEnds.size);
  }

  #placePiece(): void {
    const target = select("piece-target").value;
    if (target === "drawing") {
      this.#arm("extend");
      return;
    }
    const { area } = this.#hooks.analysis().project;
    const port = this.#openEnds.get(target);
    if (target === "center" || port) {
      this.cancel();
      this.#extend({ x: area.width / 2, y: area.depth / 2 }, port, target === "center");
    }
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
    return this.#interaction.kind === "move" || this.#interaction.kind === "duplicate";
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
    select("placement-grid").value = "club";
    this.#route = [];
    element("route-info").textContent = "";
    element("piece-info").textContent = "";
    this.#editControls();
  }

  cancel(): boolean {
    const active = this.#arrangement || this.#interaction.kind !== "select";
    if (!active) return false;
    const focused = element("placement-actions").contains(document.activeElement);
    this.#hooks.cancelArrangement();
    this.stopPicking();
    this.#hooks.render();
    if (focused) element("tabletop").focus({ preventScroll: true });
    return true;
  }

  selectPiece(id: string): void {
    this.cancel();
    this.#selected = new Set([id]);
    this.#selectionInfo();
    this.#hooks.render();
  }

  copy(): boolean {
    const [item] = this.#selectedTrack();
    if (!item || this.#selected.size !== 1) return false;
    this.#copied = { ...item };
    this.#hooks.notice("Track copied. Paste to place a duplicate.");
    return true;
  }

  startPaste(): boolean {
    if (!this.#copied) return false;
    this.#startCopy(this.#copied);
    return true;
  }

  #piecePorts(): void {
    const part = this.#catalog.parts.find(({ id }) => id === select("piece-choice").value);
    select("piece-port").replaceChildren(
      ...(part?.ports ?? [])
        .filter(({ type }) => type === "regular")
        .map((p) => new Option(p.id, p.id)),
    );
  }

  #arm(mode: "extend" | "trace"): void {
    this.cancel();
    this.#interaction = { kind: mode };
    this.#route = [];
    const instruction =
      mode === "trace"
        ? "Choose the track or connector to trace to."
        : visibleTrackItems(this.#hooks.analysis().project).length
          ? "Choose an open track end to extend."
          : "Click inside the design area to start the track.";
    this.#hooks.notice(instruction);
    if (mode === "trace") element("route-info").textContent = instruction;
    else element("piece-info").textContent = instruction;
    this.#editControls();
    this.#hooks.render();
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
    target.replaceChildren(new Option("Choose on the drawing", "drawing"));
    if (!tracks.size) target.add(new Option("Center of design area", "center", true, true));
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
    if (this.#openEnds.size === 1) target.selectedIndex = 1;
    this.#showTool();
    const selectFrom = select("trace-from");
    const previous = selectFrom.value;
    selectFrom.replaceChildren(...[...options].map(([value, label]) => new Option(label, value)));
    if (options.has(previous)) selectFrom.value = previous;
    button("trace-route").disabled = !options.size;
    this.#selectionInfo();
  }

  pick(point: Point, target: Element, radius: number, multiple = false): void {
    const hit = target.closest<SVGElement>("[data-piece-id]");
    const id = hit?.dataset["pieceId"];
    const portId = hit?.dataset["portId"];
    const edit = this.#interaction;
    if (edit.kind === "move" || edit.kind === "duplicate") {
      this.#cancelTranslationFrame();
      this.#updateTranslation(edit, point, radius, portKey(hit));
      if (edit.preview?.kind === "ready") this.#applyPreview();
      else this.#editControls();
      return;
    }
    if (edit.kind === "connect") {
      this.#pickGapEnd(edit, point, radius, portKey(hit));
      return;
    }
    if (edit.kind === "select") {
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
      } else this.#selected = new Set(id ? [id] : []);
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
    if (edit.kind === "extend") {
      const candidate = ports.find(
        ({ port, distance }) =>
          this.#openEnds.has(key(port)) && (portId || distance <= radius || id),
      );
      if (!candidate && analysis.ports.length) {
        const message =
          "Choose an open end inside your layout. The mainline handoffs belong to the next display.";
        element("piece-info").textContent = message;
        this.#hooks.notice(message, true);
        return;
      }
      this.#extend(point, candidate?.port);
      return;
    }
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

  beginMove(point: Point, target: Element): "drag" | "pan" | "blocked" {
    if (this.#arrangement || this.#interaction.kind !== "select") return "pan";
    const id = target.closest<SVGElement>("[data-piece-id]")?.dataset["pieceId"];
    if (!id) return "pan";
    const project = this.#hooks.analysis().project;
    const item = project.items.find((entry) => entry.id === id);
    if (!item || item.kind !== "track") return "pan";
    if (!this.#selected.has(id)) this.#selected = new Set([id]);
    const selected = this.#selectedTrack();
    if (protectedTrack(project, this.#selected)) {
      this.#selectionInfo();
      this.#hooks.render();
      return "blocked";
    }
    this.#startTranslation("drag", selected, point);
    return "drag";
  }

  move(point: Point, radius: number, target?: Element): void {
    const edit = this.#interaction;
    if (edit.kind !== "drag" && edit.kind !== "move" && edit.kind !== "duplicate") return;
    edit.last = { point, radius, end: portKey(target?.closest<SVGElement>("[data-piece-id]")) };
    if (this.#translationFrame !== undefined) return;
    this.#translationFrame = requestAnimationFrame(() => {
      this.#translationFrame = undefined;
      if (this.#interaction === edit && edit.last)
        this.#updateTranslation(edit, edit.last.point, edit.last.radius, edit.last.end);
    });
  }

  clearHover(): void {
    const edit = this.#interaction;
    if (edit.kind !== "move" && edit.kind !== "duplicate") return;
    this.#cancelTranslationFrame();
    edit.last = undefined;
    if (!edit.preview) return;
    edit.destination = undefined;
    edit.preview = undefined;
    this.#hooks.renderPreview();
  }

  #cancelTranslationFrame(): void {
    if (this.#translationFrame !== undefined) cancelAnimationFrame(this.#translationFrame);
    this.#translationFrame = undefined;
  }

  endMove(point: Point, radius: number, cancelled: boolean): void {
    const edit = this.#interaction;
    if (edit.kind !== "drag") return;
    if (!cancelled) {
      this.#updateTranslation(edit, point, radius);
      if (edit.preview?.kind === "ready") {
        this.#applyPreview();
        return;
      }
    }
    this.stopPicking();
    this.#hooks.renderPreview();
    if (!cancelled && edit.preview?.kind === "blocked" && edit.preview.items.length)
      this.#hooks.notice(edit.preview.message, true);
  }

  #startMove(): void {
    const selected = this.#selectedTrack();
    const [first] = selected;
    if (!first || protectedTrack(this.#hooks.analysis().project, this.#selected)) return;
    this.#startTranslation("move", selected, first);
  }

  #startCopy(source: TrackItem): void {
    const item: TrackItem = {
      ...source,
      id: projectId("track"),
      groupId: undefined,
      arrangementId: undefined,
    };
    this.#startTranslation("duplicate", [item], item);
  }

  #startTranslation(
    kind: TranslationEdit["kind"],
    items: readonly TrackItem[],
    origin: Point,
  ): void {
    this.cancel();
    const geometry = prepareTranslation(
      this.#hooks.analysis(),
      this.#catalog,
      items,
      kind !== "duplicate",
    );
    this.#interaction = {
      kind,
      items,
      origin,
      geometry,
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
    );
    const previous = edit.destination;
    if (
      previous?.shift.x === destination.shift.x &&
      previous.shift.y === destination.shift.y &&
      previous.snap?.from === destination.snap?.from &&
      previous.snap?.to === destination.snap?.to &&
      previous.blocked === destination.blocked
    )
      return;
    edit.destination = destination;
    edit.preview = previewTranslation(
      this.#hooks.analysis(),
      this.#catalog,
      edit.geometry,
      edit.items,
      destination,
    );
    if (
      edit.kind === "drag" ||
      (edit.preview.kind === "ready" && element("track-edit-hint").hasAttribute("data-error"))
    )
      this.#editControls();
    this.#hooks.renderPreview();
  }

  #selectArrangement(): void {
    const [item] = this.#selectedTrack();
    if (!item?.groupId || this.#selected.size !== 1) return;
    const group = visibleTrackItems(this.#hooks.analysis().project).filter(
      (candidate) => candidate.groupId === item.groupId,
    );
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
    element("tabletop").focus({ preventScroll: true });
  }

  #pickGapEnd(
    edit: Extract<Interaction, { kind: "connect" }>,
    point: Point,
    radius: number,
    endpoint?: string,
  ): void {
    let end = endpoint && this.#openEnds.get(endpoint);
    if (!endpoint) {
      let nearest = radius;
      for (const candidate of this.#openEnds.values()) {
        const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
        if (distance >= nearest) continue;
        nearest = distance;
        end = candidate;
      }
    }
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
    if (!("preview" in edit) || edit.preview?.kind !== "ready") return;
    const focused =
      this.pickingDestination || element("placement-actions").contains(document.activeElement);
    if (this.pickingDestination) this.#multiple = false;
    if (edit.kind === "duplicate") this.#selected = new Set(edit.items.map(({ id }) => id));
    this.#hooks.commit(edit.preview.project);
    const count = edit.preview.items.length;
    const receipt =
      edit.kind === "connect"
        ? `Connected both ends with ${count} ${count === 1 ? "piece" : "pieces"}.`
        : edit.kind === "duplicate"
          ? "Placed duplicate track."
          : `Moved ${count === 1 ? "track piece" : `${count} track pieces`}.`;
    this.#hooks.notice([receipt, edit.preview.message].filter(Boolean).join(" "));
    if (focused) element("tabletop").focus({ preventScroll: true });
  }

  #extend(point: Point, target?: Analysis["ports"][number], centered = false): void {
    const part = this.#catalog.parts.find(({ id }) => id === select("piece-choice").value);
    const incoming = part?.ports.find((p) => p.id === select("piece-port").value);
    if (!part || !incoming) return;
    const working = ensureVisibleWorkingLayer(this.#hooks.analysis().project);
    const project = working.project;
    const anchor = target ?? { x: Math.round(point.x), y: Math.round(point.y), angle: 0 };
    const placement = centered ? { ...point, angle: 0 } : poseConnectingPorts(incoming, anchor);
    const id = projectId("track");
    const item: TrackItem = {
      kind: "track",
      partId: part.id,
      id,
      layerId: working.layerId,
      ...placement,
      heightPlates: target?.heightPlates ?? (project.area.niltc ? 2 : 0),
    };
    const result = commitItems(project, this.#catalog, { items: [item] });
    if (!result.project) {
      const message = result.issues[0]?.message ?? "This piece does not fit.";
      element("piece-info").textContent = message;
      this.#hooks.notice(message, true);
      return;
    }
    this.#selected = new Set([id]);
    this.#hooks.commit(result.project);
    const message = `Placed ${part.name}.`;
    element("piece-info").textContent = message;
    this.#hooks.notice(message);
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
    const context = prepareTranslation(analysis, this.#catalog, [original], true);
    const preview = checkEdit(
      analysis,
      this.#catalog,
      context.stationary,
      [item],
      [],
      context.outside,
    );
    if (preview.kind === "blocked") this.#hooks.notice(preview.message, true);
    else {
      this.#hooks.commit(preview.project);
      this.#hooks.notice([message, preview.message].filter(Boolean).join(" "));
    }
  }

  #editControls(): void {
    const edit = this.#interaction;
    const translation = edit.kind === "move" || edit.kind === "duplicate";
    const selecting = !this.#arrangement && (edit.kind === "select" || edit.kind === "drag");
    if (edit.kind !== "drag") {
      const [selected] = this.#selected.values();
      button("select-arrangement").hidden =
        !selecting ||
        this.#selected.size !== 1 ||
        !this.#hooks
          .analysis()
          .project.items.some(
            (item) => item.id === selected && item.kind === "track" && item.groupId,
          );
    }
    element("selection-actions").hidden = !selecting;
    element("placement-actions").hidden = selecting;
    element("placement-grid").hidden = !translation;
    button("place-edit").hidden = edit.kind !== "connect";
    button("place-edit").disabled = !(edit.kind === "connect" && edit.preview?.kind === "ready");
    button("select-multiple").setAttribute("aria-pressed", String(this.#multiple));
    element("tabletop").dataset["editTool"] = selecting ? "selection" : "placement";
    const hint = element("track-edit-hint");
    const preview = "preview" in edit ? edit.preview : undefined;
    hint.toggleAttribute("data-error", preview?.kind === "blocked");
    if (preview?.message && (!translation || preview.kind === "blocked")) {
      hint.textContent = preview.message;
      return;
    }
    if (this.#arrangement)
      hint.textContent = "Choose a location for the arrangement, or cancel to edit track.";
    else if (edit.kind === "extend") hint.textContent = "Choose where to add the track piece.";
    else if (edit.kind === "trace") hint.textContent = "Choose track to trace the route to.";
    else if (edit.kind === "connect")
      hint.textContent = preview
        ? "Choose Place to keep this position."
        : edit.first
          ? "Choose the second open rail end."
          : "Choose the first open rail end.";
    else if (translation)
      hint.textContent =
        edit.kind === "duplicate"
          ? "Click or tap to place the copy."
          : "Click or tap to move the selection.";
    else if (edit.kind === "drag") hint.textContent = "Release to place.";
    else if (protectedTrack(this.#hooks.analysis().project, this.#selected)) {
      const { project } = this.#hooks.analysis();
      const handoff = project.area.exits.find(
        ({ outer, inner }) =>
          this.#selected.has(outer.pieceId) || this.#selected.has(inner.pieceId),
      );
      hint.textContent =
        this.#selected.size > 1
          ? `Selection includes track at the named mainline handoff ${handoff?.name ?? ""}. Remove it from the selection to move the other pieces.`
          : "This track carries a named mainline exit and cannot be moved or deleted.";
    } else if (this.#multiple)
      hint.textContent = `${this.#selected.size} selected. Pick pieces to add or remove them.`;
    else if (this.#selected.size)
      hint.textContent = `${this.#selected.size} selected. Drag track or choose Move.`;
    else hint.textContent = "Select a track piece to edit it.";
  }

  #selectionInfo(): void {
    const project = this.#hooks.analysis().project;
    const id = this.#selected.size === 1 ? this.#selected.values().next().value : undefined;
    const item = project.items.find((item) => item.id === id);
    const name =
      item?.kind === "track"
        ? this.#catalog.parts.find((p) => p.id === item.partId)?.name
        : item?.name;
    element("selection-info").textContent =
      this.#selected.size > 1
        ? `${this.#selected.size} track pieces selected.`
        : (name ?? "Select a track piece in the drawing.");
    const protectedExit = protectedTrack(project, this.#selected);
    button("remove-piece").disabled = !item || protectedExit;
    const movable = item?.kind === "track" && !protectedExit;
    button("move-track").disabled = protectedExit || !this.#selectedTrack().length;
    button("rotate-track-left").disabled = !movable;
    button("rotate-track-right").disabled = !movable;
    button("duplicate-track").disabled = item?.kind !== "track";
    button("connect-ends").disabled = this.#openEnds.size < 2;
    element("track-position").hidden = !movable;
    if (movable && item.kind === "track") {
      input("track-x").value = String(item.x);
      input("track-y").value = String(item.y);
    }
    renderBallast(project, this.#catalog, id, (changes) => {
      if (!item || item.kind !== "track") return;
      this.#hooks.commit({
        ...project,
        items: project.items.map((p) => (p === item ? { ...item, ...changes } : p)),
      });
    });
    this.#editControls();
  }

  remove(): void {
    if (this.#selected.size !== 1 || this.#arrangement || this.#interaction.kind !== "select")
      return;
    const project = this.#hooks.analysis().project;
    if (protectedTrack(project, this.#selected)) {
      this.#hooks.notice(protectedMessage, true);
      return;
    }
    this.#hooks.commit({
      ...project,
      items: project.items.filter(({ id }) => !this.#selected.has(id)),
    });
    this.#hooks.notice("Removed track piece.");
  }
}
