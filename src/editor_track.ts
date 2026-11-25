import { commitItems } from "./arrangements";
import { button, element, select } from "./editor_dom";
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

function key(endpoint: Endpoint): string {
  return JSON.stringify([endpoint.pieceId, endpoint.portId]);
}

export class TrackTools {
  readonly #catalog: Catalog;
  readonly #hooks: Hooks;
  #mode: "extend" | "trace" | undefined;
  #selected: string | undefined;
  #route: RouteLink[] = [];

  constructor(catalog: Catalog, hooks: Hooks) {
    this.#catalog = catalog;
    this.#hooks = hooks;
    const choices = select("piece-choice");
    for (const part of catalog.parts.filter(({ ports }) =>
      ports.some(({ type }) => type === "regular"),
    )) {
      choices.add(new Option(`${part.brand} · ${part.name}`, part.id));
    }
    choices.value = "lego:rc-s16";
    choices.addEventListener("change", () => this.#piecePorts());
    this.#piecePorts();
    button("extend-piece").addEventListener("click", () => this.#arm("extend"));
    button("trace-route").addEventListener("click", () => this.#arm("trace"));
    select("trace-from").addEventListener("change", () => this.#arm("trace"));
    button("remove-piece").addEventListener("click", () => this.remove());
  }

  get selection(): Set<string> {
    return new Set(this.#selected ? [this.#selected] : []);
  }
  get route(): RouteLink[] {
    return this.#route;
  }
  get pickingPort(): boolean {
    return Boolean(this.#mode);
  }

  stopPicking(): void {
    this.#mode = undefined;
    this.#route = [];
    element("route-info").textContent = "";
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
    button("extend-piece").disabled = !select("piece-port").options.length;
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
    this.#hooks.render();
  }

  reset(): void {
    this.#mode = undefined;
    this.#route = [];
    this.#selected = undefined;
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
    for (const port of analysis.ports) {
      const item = tracks.get(port.pieceId);
      if (
        !port.joined &&
        port.type === "regular" &&
        !options.has(key(port)) &&
        item?.kind === "track"
      ) {
        options.set(
          key(port),
          `${names.get(item.partId)} · ${port.portId} (${Math.round(port.x)}, ${Math.round(port.y)})`,
        );
      }
    }
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
        ({ port, distance }) => !port.joined && (portId || distance <= radius || id),
      );
      if (!candidate && analysis.ports.length) {
        this.#hooks.notice("Choose an open rail connector.", true);
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

  #extend(point: Point, target?: Analysis["ports"][number]): void {
    const part = this.#catalog.parts.find(({ id }) => id === select("piece-choice").value);
    const incoming = part?.ports.find((p) => p.id === select("piece-port").value);
    if (!part || !incoming) return;
    const working = ensureVisibleWorkingLayer(this.#hooks.analysis().project);
    const project = working.project;
    const anchor = target ?? { x: Math.round(point.x), y: Math.round(point.y), angle: 0 };
    const placement = poseConnectingPorts(incoming, anchor);
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
      this.#hooks.notice(result.issues[0]?.message ?? "This piece does not fit.", true);
      return;
    }
    this.#hooks.commit(result.project);
    this.#mode = "extend";
    this.#selected = id;
    this.#selectionInfo();
    this.#hooks.render();
    this.#hooks.notice(
      `Placed ${part.name}. Choose another open end to continue, or press Escape.`,
    );
  }

  #selectionInfo(): void {
    const project = this.#hooks.analysis().project;
    const item = project.items.find((item) => item.id === this.#selected);
    const name =
      item?.kind === "track"
        ? this.#catalog.parts.find((p) => p.id === item.partId)?.name
        : item?.name;
    element("selection-info").textContent = name ?? "Select a track piece in the drawing.";
    button("remove-piece").disabled = !item;
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
