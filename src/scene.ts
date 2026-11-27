import type { Analysis } from "./engine";
import type { EditPreview } from "./editor_placement";
import { defaultBaseplateAppearance } from "./appearance";
import type { BaseplateAppearance } from "./appearance";
import {
  edgeCoordinate,
  frontCoordinate,
  moveEdgePoint,
  outlineBounds,
  outlineEdges,
  outlineOf,
} from "./area_outline";
import type { Catalog, Item, Project } from "./project";
import {
  ballastPattern,
  baseplatePattern,
  partDrawing,
  partInstance,
  setSceneDetail,
  trackHalfWidth,
} from "./scene_appearance";
import {
  addBounds,
  addShapeBounds,
  boundedLabel,
  detailStyle,
  emptyBounds,
  includeBounds,
  line,
  paper,
  path,
  pathData,
  poseTransform,
  rectangle,
  selectionInk,
  svg,
  warningInk,
} from "./scene_drawing";
import type { Bounds } from "./scene_drawing";

export { setSceneDetail } from "./scene_appearance";

export const drawingFont = "Atkinson Hyperlegible Next";

export type SceneRoute = { pieceIds: readonly string[]; color?: string; label?: string };
export type SceneTrace = {
  from: { pieceId: string; portId?: string };
  kind: "internal" | "joint";
  path?: number;
  to?: { pieceId: string; portId: string };
};
export type SceneOptions = {
  selection?: ReadonlySet<string>;
  preview?: ReadonlySet<string>;
  replacement?: ReadonlySet<string>;
  addition?: ReadonlySet<string>;
  placementWarnings?: ReadonlySet<string>;
  trackColors?: boolean;
  routes?: readonly SceneRoute[];
  trace?: readonly SceneTrace[];
  grid?: boolean;
  cropToTrack?: boolean;
  sharing?: boolean;
  interaction?: "pieces" | "ports" | "placement";
  /** Rail ends available to the active canvas tool. */
  extendable?: Pick<ReadonlySet<string>, "has">;
  sidingSpace?: boolean;
  reuse?: SVGSVGElement;
};

type ScenePort = Analysis["ports"][number];
type Part = Catalog["parts"][number];
type Drawn = { key: string; node: SVGGElement; bounds: Bounds; label?: SVGTextElement };
type SceneLayers = {
  catalog: Catalog;
  definitions: SVGDefsElement;
  prefix: string;
  title: SVGTitleElement;
  paper: SVGRectElement;
  grid: SVGRectElement;
  area: SVGGElement;
  guides: SVGGElement;
  tracks: SVGGElement;
  overlays: SVGGElement;
  editPreview: SVGGElement;
  ports: SVGGElement;
  itemLabels: SVGGElement;
  labels: SVGGElement;
  trackColors: boolean;
  parts: Map<Part, string>;
  drawn: Map<string, Drawn>;
};

const sceneLayers = new WeakMap<SVGSVGElement, SceneLayers>();
let sceneNumber = 0;

function sync(layer: SVGGElement, nodes: readonly SVGElement[]): void {
  layer.replaceChildren(...nodes);
}

function patternDefinitions(defs: SVGDefsElement, prefix: string): void {
  const grid = svg("pattern", {
    id: `${prefix}-grid`,
    width: 32,
    height: 32,
    patternUnits: "userSpaceOnUse",
  });
  grid.append(
    svg("path", { d: "M0 0H32 M0 0V32", fill: "none", stroke: "#ab9980", "stroke-width": 0.24 }),
  );
  defs.append(grid, ballastPattern(prefix));
}

function setBaseplatePattern(layers: SceneLayers, appearance: BaseplateAppearance): void {
  const next = baseplatePattern(`${layers.prefix}-baseplates`, appearance);
  const prior = layers.definitions.querySelector("pattern[data-baseplate-pattern-definition]");
  if (prior) prior.replaceWith(next);
  else layers.definitions.append(next);
}

function trackDrawing(
  item: Extract<Item, { kind: "track" }>,
  part: Part | undefined,
  selected: boolean,
  preview: boolean,
  bounds: Bounds,
  layers: SceneLayers,
  interaction: SceneOptions["interaction"],
): Drawn {
  const group = svg("g", {
    "data-piece-id": item.id,
    "data-kind": "track",
    "aria-label": part?.name ?? item.partId,
    transform: poseTransform(item),
  });
  if (interaction === "pieces") {
    group.id = `scene-item-${encodeURIComponent(item.id)}`;
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-pressed", String(selected));
  }
  group.append(svg("title", {}, part?.name ?? item.partId));
  if (!part) {
    const points = rectangle(-4, -4, 8, 8);
    addShapeBounds(bounds, points, item);
    group.append(path(points, { fill: "#f5d5cd", stroke: warningInk, "stroke-width": 0.6 }, true));
    return { key: JSON.stringify([item, selected, preview, interaction]), node: group, bounds };
  }
  let id = layers.parts.get(part);
  if (!id) {
    id = `${layers.prefix}-part-${layers.parts.size}`;
    partDrawing(layers.definitions, id, part);
    layers.parts.set(part, id);
  }
  addShapeBounds(bounds, part.footprint, item, 0.5);
  for (const route of part.paths)
    addShapeBounds(bounds, route, item, trackHalfWidth(item.ballast ?? "bare") + 0.3);
  partInstance(
    group,
    id,
    layers.prefix,
    item,
    part,
    selected || preview,
    layers.trackColors,
    interaction !== undefined,
  );
  if (preview) group.setAttribute("opacity", "0.62");
  return { key: JSON.stringify([item, selected, preview, interaction]), node: group, bounds };
}

function unresolvedDrawing(
  item: Extract<Item, { kind: "unresolved" }>,
  selected: boolean,
  bounds: Bounds,
  interaction: SceneOptions["interaction"],
): Drawn {
  const group = svg("g", {
    "data-piece-id": item.id,
    "data-kind": item.kind,
    "aria-label": item.name,
    transform: poseTransform({ ...item, angle: 0 }),
  });
  if (interaction === "pieces") {
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
  }
  const points = rectangle(-item.width / 2, -item.depth / 2, item.width, item.depth);
  addShapeBounds(bounds, points, { ...item, angle: 0 });
  group.append(
    svg("title", {}, item.name),
    path(
      points,
      {
        fill: "#f5d5cd",
        stroke: selected ? selectionInk : warningInk,
        "stroke-width": 0.6,
        "stroke-dasharray": "2 1",
      },
      true,
    ),
  );
  return {
    key: JSON.stringify([item, selected, interaction]),
    node: group,
    bounds,
    label: boundedLabel(bounds, item, `? ${item.name}`, 2.7, { "font-weight": 650 }),
  };
}

function portDrawing(
  port: ScenePort,
  options: SceneOptions,
  selected: boolean,
  bounds: Bounds,
): SVGGElement {
  const portKey = JSON.stringify([port.pieceId, port.portId]);
  const extendable = options.extendable?.has(portKey) ?? false;
  const radius = extendable ? 1.8 : port.ambiguous ? 1.5 : port.joined ? 0.65 : 1.05;
  const group = svg("g", {
    "data-piece-id": port.pieceId,
    "data-port-id": port.portId,
    "data-open": String(!port.joined),
    "data-ambiguous": String(port.ambiguous ?? false),
    "data-extendable": String(extendable),
    "aria-label": extendable
      ? `Open rail end at ${Number(port.x.toFixed(1))}, ${Number(port.y.toFixed(1))} studs, ${port.pieceId} / ${port.portId}`
      : `${port.pieceId} / ${port.portId}`,
  });
  if (options.interaction === "ports" && (!options.extendable || extendable)) {
    group.id = `scene-port-${encodeURIComponent(portKey)}`;
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
  }
  addBounds(bounds, port, radius + 0.4);
  if (!options.sharing)
    group.append(
      svg("circle", {
        cx: port.x,
        cy: port.y,
        r: extendable ? 5 : options.interaction === "ports" ? 4 : 2.8,
        fill: "transparent",
        ...(extendable
          ? { stroke: "transparent", "stroke-width": 14, "vector-effect": "non-scaling-stroke" }
          : {}),
      }),
    );
  if (extendable)
    group.append(
      svg("circle", {
        cx: port.x,
        cy: port.y,
        r: radius + 0.9,
        fill: "#d8f2e3",
        stroke: selectionInk,
        "stroke-width": 0.6,
      }),
    );
  const marker = svg("circle", {
    cx: port.x,
    cy: port.y,
    r: radius,
    fill: port.joined ? "#36312b" : paper,
    stroke: extendable ? selectionInk : port.joined ? paper : selected ? selectionInk : warningInk,
    "stroke-width": extendable ? 0.6 : 0.42,
  });
  if (port.joined && !selected && !port.ambiguous && options.interaction !== "ports")
    marker.setAttribute("style", detailStyle);
  group.append(marker);
  if (extendable)
    group.append(
      svg("path", {
        d: `M ${port.x - 0.85} ${port.y} H ${port.x + 0.85} M ${port.x} ${port.y - 0.85} V ${port.y + 0.85}`,
        fill: "none",
        stroke: selectionInk,
        "stroke-width": 0.45,
        "stroke-linecap": "round",
      }),
    );
  return group;
}

function drawArea(
  project: Project,
  bounds: Bounds,
  layers: SceneLayers,
  options: SceneOptions,
): void {
  const { area } = project;
  const baseplates = area.baseplates ?? defaultBaseplateAppearance;
  setBaseplatePattern(layers, baseplates);
  const outline = outlineOf(area);
  const edges = outlineEdges(outline);
  const { left, right, top, bottom } = outlineBounds(outline);
  if (!options.cropToTrack) includeBounds(bounds, { left, right, top, bottom });
  const group = svg("g", { "data-design-area": "true", "aria-label": "Design area" });
  const d = pathData(outline, true);
  const clip = svg("clipPath", { id: `${layers.prefix}-area-clip` });
  clip.append(svg("path", { d }));
  const surface = svg("g", { "clip-path": `url(#${layers.prefix}-area-clip)` });
  group.append(
    clip,
    svg("path", {
      d,
      fill: options.trackColors ? "#e8eee2" : `url(#${layers.prefix}-baseplates)`,
      "data-baseplate-field": "true",
    }),
    surface,
    svg("path", { d, fill: "none", stroke: "#313b32", "stroke-width": 0.72 }),
  );
  const darkBaseplate =
    !options.trackColors &&
    (baseplates.color === "classic-blue" ||
      baseplates.color === "dark-blue" ||
      (baseplates.pattern !== "solid" &&
        (baseplates.secondary === "classic-blue" || baseplates.secondary === "dark-blue")));
  const seam = {
    // Pale seams preserve individual 32-stud plates on the two dark blues.
    stroke: darkBaseplate ? "#f4f4ed" : "#203821",
    "stroke-width": 0.24,
    opacity: 0.52,
    "data-baseplate-seam": "true",
  };
  for (let x = Math.floor(left / 32) * 32 + 32; x < right; x += 32)
    surface.append(line({ x, y: top }, { x, y: bottom }, seam));
  for (let y = Math.floor(top / 32) * 32 + 32; y < bottom; y += 32)
    surface.append(line({ x: left, y }, { x: right, y }, seam));
  for (const side of area.fronts) {
    const coordinate = frontCoordinate(area, side);
    const frontage = edges.filter(
      ({ side: edge, start }) => edge === side && edgeCoordinate(start, side) === coordinate,
    );
    let longest = 0;
    let label;
    for (const { start, end } of frontage) {
      group.append(
        line(start, end, {
          stroke: "#76523b",
          "stroke-width": 1.35,
          "data-public-edge": side,
        }),
      );
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length > longest) {
        longest = length;
        label = moveEdgePoint({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, side, 5);
      }
    }
    if (label)
      layers.labels.append(
        boundedLabel(bounds, label, "Plexiglass", 2.8, {
          "font-weight": 650,
          "data-public-edge-label": side,
        }),
      );
  }
  if (options.sidingSpace)
    surface.append(
      svg("rect", {
        x: left + 4,
        y: top + 34,
        width: Math.max(0, area.width - 8),
        height: Math.max(0, area.depth - 38),
        rx: 2,
        fill: "#fff8d3",
        "fill-opacity": 0.18,
        stroke: "#f9efd2",
        "stroke-width": 0.9,
        "stroke-dasharray": "3 2",
        "data-siding-space": "true",
      }),
    );
  layers.area.replaceChildren(group);
}

function drawRouteOverlays(
  options: SceneOptions,
  drawn: ReadonlyMap<string, Drawn>,
  overlays: SVGGElement,
): void {
  overlays.replaceChildren();
  for (const route of options.routes ?? []) {
    const nodes = route.pieceIds
      .map((id) => drawn.get(id)?.node)
      .filter((node): node is SVGGElement => Boolean(node));
    for (const node of nodes) node.setAttribute("data-route-highlight", "true");
    if (route.label && nodes[0]) nodes[0].append(svg("title", {}, route.label));
  }
}

function drawTrace(
  options: SceneOptions,
  project: Project,
  parts: ReadonlyMap<string, Part>,
  overlays: SVGGElement,
): void {
  const items = new Map(project.items.map((item) => [item.id, item]));
  for (const trace of options.trace ?? []) {
    const item = items.get(trace.from.pieceId);
    if (!item || item.kind !== "track") continue;
    const part = parts.get(item.partId);
    if (!part) continue;
    if (trace.kind === "internal") {
      const route = trace.path === undefined ? undefined : part.paths[trace.path];
      if (!route) continue;
      overlays.append(
        path(route, {
          transform: poseTransform(item),
          fill: "none",
          stroke: "#007f73",
          "stroke-width": 1.5,
          "stroke-linecap": "round",
          "data-route-path": String(trace.path),
        }),
      );
      continue;
    }
    const from = part.ports.find((port) => port.id === trace.from.portId);
    const destination = trace.to && items.get(trace.to.pieceId);
    const destinationPart =
      destination?.kind === "track" ? parts.get(destination.partId) : undefined;
    const to = destinationPart?.ports.find((port) => port.id === trace.to?.portId);
    if (!from || !to || !destination) continue;
    const radians = (item.angle * Math.PI) / 180;
    const start = {
      x: item.x + from.x * Math.cos(radians) - from.y * Math.sin(radians),
      y: item.y + from.x * Math.sin(radians) + from.y * Math.cos(radians),
    };
    const destinationRadians = (destination.angle * Math.PI) / 180;
    const end = {
      x: destination.x + to.x * Math.cos(destinationRadians) - to.y * Math.sin(destinationRadians),
      y: destination.y + to.x * Math.sin(destinationRadians) + to.y * Math.cos(destinationRadians),
    };
    overlays.append(
      line(start, end, { stroke: "#007f73", "stroke-width": 1.5, "data-route-joint": "true" }),
    );
  }
}

function newScene(catalog: Catalog, options: SceneOptions): [SVGSVGElement, SceneLayers] {
  const scene = svg("svg", {
    role: options.interaction ? "group" : "img",
    "data-track-scene": "true",
    "font-family": `"${drawingFont}", sans-serif`,
    style: `background: ${paper}`,
  });
  const prefix = `track-scene-${++sceneNumber}`;
  const definitions = svg("defs");
  patternDefinitions(definitions, prefix);
  const layers: SceneLayers = {
    catalog,
    definitions,
    prefix,
    title: svg("title"),
    paper: svg("rect", { fill: paper, "pointer-events": "none" }),
    grid: svg("rect", { fill: `url(#${prefix}-grid)`, "pointer-events": "none" }),
    area: svg("g"),
    guides: svg("g", { "pointer-events": "none" }),
    tracks: svg("g"),
    overlays: svg("g", { "pointer-events": "none" }),
    editPreview: svg("g", {
      "pointer-events": "none",
      "aria-hidden": "true",
      "data-edit-preview": "",
    }),
    ports: svg("g"),
    itemLabels: svg("g", { "pointer-events": "none" }),
    labels: svg("g", { "pointer-events": "none" }),
    trackColors: false,
    parts: new Map(),
    drawn: new Map(),
  };
  scene.append(layers.title, definitions, layers.paper);
  const drawing = svg("g", { "data-scene-drawing": "true" });
  drawing.append(
    layers.grid,
    layers.area,
    layers.guides,
    layers.tracks,
    layers.overlays,
    layers.ports,
    layers.editPreview,
    layers.itemLabels,
    layers.labels,
  );
  scene.append(drawing);
  setSceneDetail(scene, 0);
  sceneLayers.set(scene, layers);
  return [scene, layers];
}

export function drawEditPreview(scene: SVGSVGElement, preview?: EditPreview): void {
  const layers = sceneLayers.get(scene);
  if (!layers) return;
  const { editPreview } = layers;
  editPreview.replaceChildren();
  if (!preview) return;
  const ink = preview.kind === "blocked" && preview.message ? warningInk : selectionInk;
  for (const item of preview.items) {
    const part = layers.catalog.parts.find(({ id }) => id === item.partId);
    if (!part) continue;
    const drawing = trackDrawing(item, part, true, true, emptyBounds(), layers, undefined).node;
    drawing.removeAttribute("data-piece-id");
    editPreview.append(
      drawing,
      path(
        part.footprint,
        {
          transform: poseTransform(item),
          fill: "none",
          stroke: ink,
          "stroke-width": 1.5,
          "stroke-dasharray": "4 3",
          "vector-effect": "non-scaling-stroke",
        },
        true,
      ),
    );
  }
  for (const point of preview.marks) {
    editPreview.append(
      svg("circle", {
        cx: point.x,
        cy: point.y,
        r: 2.8,
        fill: "none",
        stroke: ink,
        "stroke-width": 2.5,
        "vector-effect": "non-scaling-stroke",
      }),
    );
  }
  for (const point of preview.opened ?? []) {
    const size = 2;
    editPreview.append(
      svg("path", {
        d: `M ${point.x - size} ${point.y - size} l 4 4 m -4 0 l 4 -4`,
        fill: "none",
        stroke: warningInk,
        "stroke-width": 2.5,
        "vector-effect": "non-scaling-stroke",
      }),
    );
  }
}

export function createScene(
  project: Project,
  catalog: Catalog,
  analysis: Analysis,
  options: SceneOptions = {},
): SVGSVGElement {
  const prior = options.reuse ? sceneLayers.get(options.reuse) : undefined;
  const [scene, layers] =
    options.reuse && prior?.catalog === catalog
      ? [options.reuse, prior]
      : newScene(catalog, options);
  const title = `Top-down layout of ${project.name}`;
  const interaction = options.sharing ? undefined : options.interaction;
  const pointerEvents = interaction ? "auto" : "none";
  layers.tracks.setAttribute("pointer-events", pointerEvents);
  layers.ports.setAttribute("pointer-events", pointerEvents);
  layers.trackColors = options.trackColors ?? false;
  if (layers.trackColors) scene.setAttribute("data-track-view", "coded");
  else scene.removeAttribute("data-track-view");
  layers.title.textContent = title;
  scene.setAttribute("aria-label", title);
  scene.setAttribute("role", interaction ? "group" : "img");
  const bounds = emptyBounds();
  layers.labels.replaceChildren();
  drawArea(project, bounds, layers, options);
  const visible = new Set(project.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  const partById = new Map(catalog.parts.map((part) => [part.id, part]));
  const tracks: SVGElement[] = [];
  const labels: SVGElement[] = [];
  const warningOutlines: SVGPathElement[] = [];
  const drawn = new Map<string, Drawn>();
  for (const item of project.items.filter((item) => visible.has(item.layerId))) {
    const itemBounds = emptyBounds();
    const selected = options.selection?.has(item.id) ?? false;
    const preview = options.preview?.has(item.id) ?? false;
    const part = item.kind === "track" ? partById.get(item.partId) : undefined;
    const drawing =
      item.kind === "track"
        ? trackDrawing(item, part, selected, preview, itemBounds, layers, interaction)
        : unresolvedDrawing(item, selected, itemBounds, interaction);
    drawn.set(item.id, drawing);
    if (part && item.kind === "track" && options.placementWarnings?.has(item.id)) {
      drawing.node.setAttribute("data-placement-warning", "true");
      const descriptionId = `${layers.prefix}-warning-${encodeURIComponent(item.id)}`;
      drawing.node.setAttribute("aria-describedby", descriptionId);
      drawing.node.append(
        svg("desc", { id: descriptionId }, "Placement warning. See Diagnostics."),
      );
      const edge = {
        d: pathData(part.footprint, true),
        transform: poseTransform(item),
        fill: "none",
        "stroke-linejoin": "round",
        "vector-effect": "non-scaling-stroke",
        "aria-hidden": "true",
      };
      warningOutlines.push(
        svg("path", { ...edge, stroke: paper, "stroke-width": 4.5 }),
        svg("path", {
          ...edge,
          stroke: "#b91c1c",
          "stroke-width": 2.5,
          "stroke-dasharray": "5 3",
          "data-placement-warning-for": item.id,
        }),
      );
    }
    if (options.replacement?.has(item.id)) {
      drawing.node.setAttribute("opacity", "0.32");
      drawing.node.style.setProperty("--track-bed", "#d97070");
      drawing.node.style.setProperty("--track-rail", "#923722");
      drawing.node.style.setProperty("--track-tie", "#c96658");
      drawing.node.style.setProperty("--track-plastic", "9 52%");
      drawing.node.style.setProperty("--track-code-outline", "#923722");
      drawing.node.setAttribute("data-replacement", "true");
    }
    if (options.addition?.has(item.id) || options.preview?.has(item.id)) {
      drawing.node.style.setProperty("--track-bed", "#6ca980");
      drawing.node.style.setProperty("--track-rail", "#176f4f");
      drawing.node.style.setProperty("--track-tie", "#6ca980");
      drawing.node.style.setProperty("--track-plastic", "146 49%");
      drawing.node.style.setProperty("--track-code-outline", "#176f4f");
      drawing.node.setAttribute("data-addition", "true");
    }
    includeBounds(bounds, drawing.bounds);
    tracks.push(drawing.node);
    if (drawing.label) labels.push(drawing.label);
  }
  layers.drawn = drawn;
  sync(layers.tracks, tracks);
  sync(layers.itemLabels, labels);
  drawRouteOverlays(options, drawn, layers.overlays);
  drawTrace(options, project, partById, layers.overlays);
  layers.overlays.append(...warningOutlines);
  const ports: SVGElement[] = [];
  for (const port of analysis.ports) {
    if (options.sharing && port.joined) continue;
    ports.push(portDrawing(port, options, options.selection?.has(port.pieceId) ?? false, bounds));
  }
  sync(layers.ports, ports);
  if (!Number.isFinite(bounds.left)) {
    includeBounds(bounds, outlineBounds(outlineOf(project.area)));
  }
  const x = bounds.left - 8;
  const y = bounds.top - 8;
  const width = bounds.right - bounds.left + 16;
  const height = bounds.bottom - bounds.top + 16;
  const viewBox = `${x} ${y} ${width} ${height}`;
  scene.setAttribute("data-layout-view-box", viewBox);
  if (scene !== options.reuse) scene.setAttribute("viewBox", viewBox);
  for (const backdrop of [layers.paper, layers.grid]) {
    backdrop.setAttribute("x", String(x));
    backdrop.setAttribute("y", String(y));
    backdrop.setAttribute("width", String(width));
    backdrop.setAttribute("height", String(height));
  }
  layers.grid.setAttribute("display", options.grid === false ? "none" : "inline");
  return scene;
}
