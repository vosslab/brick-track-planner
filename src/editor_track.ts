import { commitItems } from "./arrangements";
import { button, element, input, select } from "./editor_dom";
import { renderBallast } from "./editor_panels";
import type { Analysis } from "./engine";
import {
  ensureVisibleWorkingLayer,
  poseConnectingPorts,
  projectId,
  visibleTrackItems,
} from "./project";
import type { Catalog, Endpoint, Point, Project, TrackItem } from "./project";
import { traceRoute } from "./route_trace";
import type { RouteLink } from "./route_trace";

type Hooks = {
  analysis: () => Analysis;
  commit: (project: Project) => void;
  render: () => void;
  cancelArrangement: () => void;
  notice: (message: string, error?: boolean) => void;
};

type Move = {
  item: TrackItem;
  start: Point;
  drawings: { node: SVGElement; transform: string | null }[];
};

function key(endpoint: Endpoint): string {
  return JSON.stringify([endpoint.pieceId, endpoint.portId]);
}

export class TrackTools {
  readonly #catalog: Catalog;
  readonly #hooks: Hooks;
  #mode: "extend" | "trace" | undefined;
  #selected: string | undefined;
  #moving: Move | undefined;
  #route: RouteLink[] = [];
  #openEnds = new Map<string, Analysis["ports"][number]>();

  constructor(catalog: Catalog, hooks: Hooks) {
    this.#catalog = catalog;
    this.#hooks = hooks;
    for (const radio of [input("build-arrangement"), input("build-piece")]) {
      radio.addEventListener("change", () => {
        this.#hooks.cancelArrangement();
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
    const positionForm = element("track-position-form");
    if (positionForm instanceof HTMLFormElement)
      positionForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.#setPosition();
      });
  }

  get selection(): Set<string> {
    return new Set(this.#selected ? [this.#selected] : []);
  }
  useDefaultTool(): void {
    input(this.#hooks.analysis().project.area.niltc ? "build-arrangement" : "build-piece").checked =
      true;
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
      this.#extend({ x: area.width / 2, y: area.depth / 2 }, port, target === "center");
    }
  }
  get route(): RouteLink[] {
    return this.#route;
  }
  get pickingPort(): boolean {
    return Boolean(this.#mode);
  }
  get extendablePorts(): Pick<ReadonlySet<string>, "has"> | undefined {
    return this.#mode === "extend" ? this.#openEnds : undefined;
  }

  stopPicking(): void {
    this.#mode = undefined;
    this.#route = [];
    element("route-info").textContent = "";
    element("piece-info").textContent = "";
  }

  selectPiece(id: string): void {
    this.#selected = id;
    this.#selectionInfo();
    this.#hooks.render();
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
    this.#hooks.cancelArrangement();
    this.#mode = mode;
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
    this.#hooks.render();
  }

  reset(): void {
    this.#mode = undefined;
    this.#route = [];
    this.#selected = undefined;
    this.#clearMove();
    element("route-info").textContent = "";
    this.#selectionInfo();
    const analysis = this.#hooks.analysis();
    const options = new Map<string, string>();
    for (const exit of analysis.project.area.exits) {
      for (const lane of ["outer", "inner"] as const) {
        options.set(key(exit[lane]), `${exit.name} · ${lane} mainline`);
      }
    }
    const tracks = new Map(visibleTrackItems(analysis.project).map((item) => [item.id, item]));
    const names = new Map(this.#catalog.parts.map((part) => [part.id, part.name]));
    this.#openEnds.clear();
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
        if (!port.ambiguous) {
          this.#openEnds.set(key(port), port);
          target.add(new Option(label, key(port)));
        }
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
  }

  pick(point: Point, target: Element, radius: number): void {
    const hit = target.closest<SVGElement>("[data-piece-id]");
    const id = hit?.dataset["pieceId"];
    const analysis = this.#hooks.analysis();
    const portId = hit?.dataset["portId"];
    const ports = analysis.ports
      .filter(
        (p) =>
          p.type === "regular" && (!id || p.pieceId === id) && (!portId || p.portId === portId),
      )
      .map((p) => ({ port: p, distance: Math.hypot(p.x - point.x, p.y - point.y) }))
      .sort((a, b) => a.distance - b.distance);
    if (this.#mode === "extend") {
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
    if (this.#mode === "trace") {
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
      this.#selected = id ?? ports[0]?.port.pieceId;
      const message = route
        ? `Connected route through ${route.filter((link) => link.kind === "internal").length} track sections.`
        : "No connected route from that entrance.";
      element("route-info").textContent = message;
      this.#hooks.notice(message, !route);
    } else {
      this.#selected = id;
      this.#route = [];
      element("route-info").textContent = "";
    }
    this.#selectionInfo();
    this.#hooks.render();
  }

  beginMove(point: Point, target: Element): boolean {
    if (this.#mode || !this.#selected) return false;
    const id = target.closest<SVGElement>("[data-piece-id]")?.dataset["pieceId"];
    if (id !== this.#selected) return false;
    const project = this.#hooks.analysis().project;
    const item = project.items.find((entry) => entry.id === id);
    if (!item || item.kind !== "track") return false;
    if (project.area.exits.some((exit) => exit.outer.pieceId === id || exit.inner.pieceId === id)) {
      this.#hooks.notice(
        "This piece carries a named mainline exit. Use a connected replacement to keep the handoff.",
        true,
      );
      return false;
    }
    // Clearing an arrangement preview redraws the scene, so collect the new SVG nodes.
    this.#hooks.cancelArrangement();
    const drawings = Array.from(element("tabletop").querySelectorAll<SVGElement>("[data-piece-id]"))
      .filter((node) => node.dataset["pieceId"] === id)
      .map((node) => ({ node, transform: node.getAttribute("transform") }));
    this.#moving = { item, start: point, drawings };
    return true;
  }

  move(point: Point): void {
    const moving = this.#moving;
    if (!moving) return;
    const dx = Math.round(point.x - moving.start.x);
    const dy = Math.round(point.y - moving.start.y);
    for (const { node, transform } of moving.drawings) {
      node.setAttribute("transform", `translate(${dx} ${dy}) ${transform ?? ""}`);
    }
  }

  endMove(point: Point, cancelled: boolean): void {
    const moving = this.#moving;
    if (!moving) return;
    this.#clearMove();
    if (!cancelled) {
      this.#commitMove({
        ...moving.item,
        x: moving.item.x + Math.round(point.x - moving.start.x),
        y: moving.item.y + Math.round(point.y - moving.start.y),
      });
    }
  }

  #clearMove(): void {
    if (!this.#moving) return;
    for (const { node, transform } of this.#moving.drawings) {
      if (transform === null) node.removeAttribute("transform");
      else node.setAttribute("transform", transform);
    }
    this.#moving = undefined;
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
    this.#hooks.commit(result.project);
    this.#mode = "extend";
    this.#selected = id;
    this.#selectionInfo();
    this.#hooks.render();
    const message = `Placed ${part.name}. Choose another open end to continue, or press Escape.`;
    element("piece-info").textContent = message;
    this.#hooks.notice(message);
  }

  #setPosition(): void {
    const item = this.#hooks.analysis().project.items.find((entry) => entry.id === this.#selected);
    if (!item || item.kind !== "track") return;
    const x = input("track-x").valueAsNumber;
    const y = input("track-y").valueAsNumber;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.#commitMove({ ...item, x, y });
  }

  #commitMove(item: TrackItem): void {
    const project = this.#hooks.analysis().project;
    const original = project.items.find(({ id }) => id === item.id);
    if (!original || (original.x === item.x && original.y === item.y)) return;
    if (
      project.area.exits.some(
        (exit) => exit.outer.pieceId === item.id || exit.inner.pieceId === item.id,
      )
    ) {
      const message =
        "This piece carries a named mainline exit. Use a connected replacement to keep the handoff.";
      this.#hooks.notice(message, true);
      return;
    }
    const withoutItem = {
      ...project,
      items: project.items.filter((entry) => entry.id !== item.id),
    };
    const result = commitItems(withoutItem, this.#catalog, { items: [item] });
    if (!result.project) {
      const message = result.issues[0]?.message ?? "This track does not fit there.";
      this.#hooks.notice(message, true);
      return;
    }
    this.#hooks.commit({
      ...project,
      items: project.items.map((entry) => (entry.id === item.id ? item : entry)),
    });
    this.#selected = item.id;
    this.#selectionInfo();
    this.#hooks.render();
    this.#hooks.notice("Moved track piece.");
  }

  #selectionInfo(): void {
    const project = this.#hooks.analysis().project;
    const item = project.items.find((item) => item.id === this.#selected);
    const name =
      item?.kind === "track"
        ? this.#catalog.parts.find((p) => p.id === item.partId)?.name
        : item?.name;
    element("selection-info").textContent = name ?? "Select a track piece in the drawing.";
    const protectedExit = project.area.exits.some(
      (exit) => exit.outer.pieceId === item?.id || exit.inner.pieceId === item?.id,
    );
    button("remove-piece").disabled = !item || protectedExit;
    const movable = item?.kind === "track" && !protectedExit;
    element("track-position").hidden = !movable;
    element("track-edit-hint").textContent = protectedExit
      ? "This track carries a named mainline exit and cannot be moved or deleted."
      : movable
        ? "Drag the selected track, or use Move track in the inspector."
        : "Select a piece to move or delete it.";
    if (movable && item.kind === "track") {
      input("track-x").value = String(item.x);
      input("track-y").value = String(item.y);
    }
    renderBallast(project, this.#catalog, this.#selected, (changes) => {
      if (!item || item.kind !== "track") return;
      this.#hooks.commit({
        ...project,
        items: project.items.map((p) => (p === item ? { ...item, ...changes } : p)),
      });
      this.selectPiece(item.id);
    });
  }

  remove(): void {
    if (!this.#selected) return;
    const project = this.#hooks.analysis().project;
    if (
      project.area.exits.some(
        (exit) => exit.outer.pieceId === this.#selected || exit.inner.pieceId === this.#selected,
      )
    ) {
      this.#hooks.notice(
        "This piece carries a named mainline exit. Use a connected replacement to keep the handoff.",
        true,
      );
      return;
    }
    this.#hooks.commit({
      ...project,
      items: project.items.filter((item) => item.id !== this.#selected),
    });
    this.#hooks.notice("Removed track piece.");
  }
}
