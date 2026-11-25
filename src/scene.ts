import { composePose } from "./project";
import type { Catalog, Item, Point, Pose, Project, Table } from "./project";
import type { Analysis } from "./engine";
import { defaultBaseplateColor } from "./appearance";
import {
  ballastPattern,
  baseplateDrawing,
  partDrawing,
  partInstance,
  setSceneDetail,
  studPattern,
  trackHalfWidth,
} from "./scene_appearance";
import {
  addBounds,
  addShapeBounds,
  boundedLabel,
  emptyBounds,
  includeBounds,
  ink,
  line,
  paper,
  path,
  pathData,
  poseTransform,
  rectangle,
  selectionInk,
  svg,
  tableDrawing,
  tableEdge,
  unit,
  warningInk,
  world,
} from "./scene_drawing";
import type { Bounds } from "./scene_drawing";
import { seamS8Suppliers } from "./seam_supply";

export { setSceneDetail } from "./scene_appearance";

type SceneOptions = {
  selection?: ReadonlySet<string>;
  grid?: boolean;
  sharing?: boolean;
  interaction?: "pieces" | "ports" | "placement";
  sidingSpace?: boolean;
  sectionId?: string;
  reuse?: SVGSVGElement;
};
type ScenePort = Analysis["ports"][number];
type Part = Catalog["parts"][number];
type Drawings = {
  definitions: SVGDefsElement;
  prefix: string;
  parts: Map<Part, string>;
  studPatterns: Set<string>;
};
type Drawn = {
  key: string;
  node: SVGGElement;
  bounds: Bounds;
  label?: SVGTextElement;
};
type SceneLayers = {
  catalog: Catalog;
  drawings: Drawings;
  title: SVGTitleElement;
  paper: SVGRectElement;
  grid: SVGRectElement;
  venue: SVGGElement;
  tables: SVGGElement;
  plates: SVGGElement;
  guides: SVGGElement;
  tracks: SVGGElement;
  issues: SVGGElement;
  ports: SVGGElement;
  labels: SVGGElement;
  itemLabels: SVGGElement;
  itemsById: Map<string, Drawn>;
  portsById: Map<string, Drawn>;
};
const sceneLayers = new WeakMap<SVGSVGElement, SceneLayers>();
const niltcHeightPlates = 2;
let sceneNumber = 0;

function syncLayer(layer: SVGGElement, nodes: readonly SVGElement[]): void {
  let cursor = layer.firstElementChild;
  for (const node of nodes) {
    if (cursor && node === cursor.nextElementSibling) {
      cursor.remove();
      cursor = node;
    }
    if (node === cursor) cursor = cursor.nextElementSibling;
    else layer.insertBefore(node, cursor);
  }
  while (cursor) {
    const stale = cursor;
    cursor = cursor.nextElementSibling;
    stale.remove();
  }
}

function itemDrawing(
  item: Item,
  pose: Pose,
  part: Catalog["parts"][number] | undefined,
  selected: boolean,
  bounds: Bounds,
  drawings: Drawings,
  interaction: SceneOptions["interaction"],
  referenceHeight: number,
  showCurve: boolean,
): Pick<Drawn, "node" | "label"> {
  const name =
    item.kind === "track"
      ? (part?.name ?? item.partId)
      : item.kind === "baseplate"
        ? item.name || "Baseplate"
        : item.name;
  // BlueBrick's unresolved placeholder dimensions describe its world-space bounds.
  const boxPose = item.kind === "unresolved" ? { ...pose, angle: 0 } : pose;
  const group = svg("g", {
    "data-piece-id": item.id,
    "data-kind": item.kind,
    "aria-label": name,
    transform: poseTransform(boxPose),
  });
  let caption: SVGTextElement | undefined;
  if (interaction === "pieces") {
    group.id = `scene-item-${encodeURIComponent(item.id)}`;
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-pressed", String(selected));
  }
  group.append(svg("title", {}, name));
  if (item.kind === "track" && part) {
    let partId = drawings.parts.get(part);
    if (!partId) {
      partId = `${drawings.prefix}-part-${drawings.parts.size}`;
      partDrawing(drawings.definitions, partId, part);
      drawings.parts.set(part, partId);
    }
    const halfWidth = trackHalfWidth(item.ballast ?? "bare");
    addShapeBounds(bounds, part.footprint, pose, 0.5);
    for (const route of part.paths) {
      addShapeBounds(bounds, route, pose, halfWidth + 0.25);
    }
    const heightOffset = item.heightPlates - referenceHeight;
    partInstance(group, partId, drawings.prefix, item, part, selected, heightOffset);
    const captions = [];
    if (showCurve && part.radius !== undefined) captions.push(`R${part.radius}`);
    if (showCurve && part.sweep !== undefined) captions.push(`${part.sweep}\u00b0`);
    if (heightOffset !== 0)
      captions.push(`${item.heightPlates > 0 ? "+" : ""}${item.heightPlates} pl`);
    if (captions.length) {
      const route = part.paths.find((route) => route.length > 2) ?? part.paths[0];
      const mid = route?.[Math.floor((route.length - 1) / 2)];
      const midpoint = mid ?? { x: 0, y: 0 };
      const next = route?.[Math.floor((route.length - 1) / 2) + 1];
      const half = next ? { x: (midpoint.x + next.x) / 2, y: (midpoint.y + next.y) / 2 } : midpoint;
      const tangent = next ? unit(midpoint, next) : { x: 1, y: 0 };
      const offset = Math.max(6.5, halfWidth + 2);
      const at = world({ x: half.x + tangent.y * offset, y: half.y - tangent.x * offset }, pose);
      caption = boundedLabel(bounds, { x: at.x, y: at.y + 1 }, captions.join(" / "), 2.5, {
        "data-track-caption": item.id,
        "font-weight": 600,
      });
    }
  } else {
    const width = item.kind === "unresolved" ? item.width : 32;
    const depth = item.kind === "unresolved" ? item.depth : 32;
    const points = rectangle(-width / 2, -depth / 2, width, depth);
    addShapeBounds(bounds, points, boxPose);
    if (item.kind === "baseplate") {
      const color = (item.color ?? defaultBaseplateColor).toLowerCase();
      const id = `${drawings.prefix}-studs-${color.slice(1)}`;
      if (!drawings.studPatterns.has(id)) {
        drawings.studPatterns.add(id);
        drawings.definitions.append(studPattern(id, color));
      }
      baseplateDrawing(group, color, id, selected);
      if (item.name) caption = boundedLabel(bounds, pose, item.name, 2.5);
    } else {
      group.append(
        path(
          points,
          {
            fill: `url(#${drawings.prefix}-unknown)`,
            stroke: selected ? selectionInk : warningInk,
            "stroke-width": 0.6,
            "stroke-dasharray": "2 1",
          },
          true,
        ),
      );
      caption = boundedLabel(bounds, pose, `? ${name}`, 2.7, { "font-weight": 650 });
    }
  }
  return { node: group, label: caption };
}

function itemKey(
  item: Item,
  pose: Pose,
  selected: boolean,
  interaction: SceneOptions["interaction"],
  referenceHeight: number,
  showCurve: boolean,
): string {
  const appearance =
    item.kind === "track"
      ? [item.partId, item.heightPlates, item.ballast, referenceHeight, showCurve]
      : item.kind === "baseplate"
        ? [item.name, item.color]
        : [item.name, item.width, item.depth];
  return JSON.stringify([
    item.kind,
    pose.x,
    pose.y,
    pose.angle,
    selected,
    interaction,
    ...appearance,
  ]);
}

function appendPatterns(definitions: SVGDefsElement, prefix: string): void {
  const grid = svg("pattern", {
    id: `${prefix}-grid`,
    width: 32,
    height: 32,
    patternUnits: "userSpaceOnUse",
  });
  grid.append(
    svg("path", {
      d: "M 0 0 H 32 M 0 0 V 32",
      fill: "none",
      stroke: "#ab9980",
      "stroke-width": 0.24,
    }),
  );
  definitions.append(grid);
  for (const [id, inkColor, downward, width] of [
    ["raised", "#286e67", false, 0.46],
    ["lowered", "#754b71", true, 0.46],
    ["overhang", warningInk, true, 0.45],
    ["unknown", "#9c6356", false, 0.3],
    ["keepout", "#725633", false, 0.24],
  ] as const) {
    const pattern = svg("pattern", {
      id: `${prefix}-${id}`,
      width: 2,
      height: 2,
      patternUnits: "userSpaceOnUse",
    });
    const strokes = downward
      ? "M -2 -2 L 4 4 M -2 0 L 2 4 M 0 -2 L 4 2"
      : "M -2 4 L 4 -2 M -2 2 L 2 -2 M 0 4 L 4 0";
    pattern.append(
      svg("path", { d: strokes, stroke: inkColor, fill: "none", "stroke-width": width }),
    );
    definitions.append(pattern);
  }
  definitions.append(ballastPattern(prefix));
}

function portDrawing(
  port: ScenePort,
  options: SceneOptions,
  selected: boolean,
  bounds: Bounds,
): SVGGElement {
  const color = selected ? selectionInk : warningInk;
  const radius = port.ambiguous ? 1.5 : port.joined ? 0.65 : 1.05;
  const status = port.ambiguous ? "Ambiguous join at" : port.joined ? "Joined" : "Open";
  const title = `${status} end ${port.portId}`;
  addBounds(bounds, port, radius + 0.4);
  const group = svg("g", {
    "data-piece-id": port.pieceId,
    "data-port-id": port.portId,
    "data-open": String(!port.joined),
    "data-ambiguous": String(port.ambiguous ?? false),
    "aria-label": options.interaction === "ports" ? `${port.pieceId} / ${port.portId}` : title,
  });
  if (options.interaction === "ports") {
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
  }
  group.append(svg("title", {}, title));
  if (!options.sharing) {
    group.append(
      svg("circle", {
        cx: port.x,
        cy: port.y,
        r: options.interaction === "ports" ? 4 : 2.8,
        fill: "transparent",
      }),
    );
  }
  if (port.ambiguous) {
    group.append(
      path(
        [
          { x: port.x, y: port.y - radius },
          { x: port.x + radius, y: port.y },
          { x: port.x, y: port.y + radius },
          { x: port.x - radius, y: port.y },
        ],
        { fill: paper, stroke: color, "stroke-width": 0.6 },
        true,
      ),
    );
  } else {
    group.append(
      svg("circle", {
        cx: port.x,
        cy: port.y,
        r: radius,
        fill: port.joined ? "#36312b" : paper,
        stroke: port.joined ? paper : color,
        "stroke-width": 0.42,
      }),
    );
  }
  return group;
}

function seamLane(
  group: SVGGElement,
  bounds: Bounds,
  seamId: string,
  lane: "outer" | "inner",
  result: Analysis["seams"][number]["outer"],
  first: ScenePort | undefined,
  second: ScenePort | undefined,
  at: Point,
): void {
  if (result.status === "hidden") return;
  const mark = svg("g", {
    "data-seam-id": seamId,
    "data-seam-lane": lane,
    "data-status": result.status,
    "data-ambiguous": String(result.ambiguous ?? false),
  });
  const color = result.status === "joined" ? selectionInk : warningInk;
  const symbol = result.ambiguous
    ? "ambiguous join"
    : result.status === "joined"
      ? "joined"
      : result.status === "height"
        ? "height mismatch"
        : result.status === "missing"
          ? "missing end"
          : "misaligned";
  const residual = [];
  if (result.gap !== undefined && result.gap > 0.05)
    residual.push(`${result.gap.toFixed(2)} studs`);
  if (result.angle !== undefined && result.angle > 0.25)
    residual.push(`${result.angle.toFixed(1)} deg`);
  if (result.height !== undefined && result.height > 0) residual.push(`${result.height} pl`);
  if (first && second)
    mark.append(
      line(first, second, {
        stroke: color,
        "stroke-width": 0.7,
        "stroke-dasharray": result.status === "joined" ? "none" : "1 0.7",
      }),
    );
  if (first || second) {
    for (const port of [first, second]) {
      if (port && result.status === "joined") {
        const radius = 1.75;
        mark.append(
          path(
            [
              { x: port.x, y: port.y - radius },
              { x: port.x + radius, y: port.y },
              { x: port.x, y: port.y + radius },
              { x: port.x - radius, y: port.y },
            ],
            { fill: color, stroke: color, "stroke-width": 0.42 },
            true,
          ),
        );
      } else if (port)
        mark.append(
          svg("circle", {
            cx: port.x,
            cy: port.y,
            r: 1.75,
            fill: "none",
            stroke: color,
            "stroke-width": 0.42,
            "stroke-dasharray": result.status === "joined" ? "none" : "1 0.7",
          }),
        );
    }
  }
  const description = `${lane === "outer" ? "Outer" : "Inner"} ${symbol}${residual.length ? ` / ${residual.join(", ")}` : ""}`;
  mark.append(boundedLabel(bounds, at, description, 2.45, { fill: color, "font-weight": 650 }));
  group.append(mark);
}

function seamDrawing(
  project: Project,
  analysis: Analysis,
  bounds: Bounds,
  overlay: SVGGElement,
  sectionTables: ReadonlySet<string> | undefined,
): void {
  if (!project.seams.length) return;
  const ports = new Map(
    analysis.ports.map((port) => [JSON.stringify([port.pieceId, port.portId]), port]),
  );
  const statuses = new Map(analysis.seams.map((seam) => [seam.id, seam]));
  const tables = new Map(project.tables.map((table) => [table.id, table]));

  for (const seam of project.seams) {
    const firstTableShown = sectionTables?.has(seam.tableA) ?? true;
    const secondTableShown = sectionTables?.has(seam.tableB) ?? true;
    if (!firstTableShown && !secondTableShown) continue;
    const status = statuses.get(seam.id);
    const table = tables.get(firstTableShown ? seam.tableA : seam.tableB);
    if (!status || !table || (status.outer.status === "hidden" && status.inner.status === "hidden"))
      continue;
    const [start, end] = tableEdge(table, firstTableShown ? seam.edgeA : seam.edgeB);
    const at = world({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, table);
    const group = svg("g", { "data-seam-id": seam.id, "pointer-events": "none" });
    for (const [index, lane] of (["outer", "inner"] as const).entries()) {
      if (status[lane].status === "hidden") continue;
      const pair = seam[lane];
      const first = firstTableShown
        ? ports.get(JSON.stringify([pair.a.pieceId, pair.a.portId]))
        : undefined;
      const second = secondTableShown
        ? ports.get(JSON.stringify([pair.b.pieceId, pair.b.portId]))
        : undefined;
      seamLane(group, bounds, seam.id, lane, status[lane], first, second, {
        x: at.x,
        y: at.y + index * 4,
      });
    }
    const supplierNames = seamS8Suppliers(project, analysis, seam);
    if (supplierNames.length) {
      group.append(
        boundedLabel(
          bounds,
          { x: at.x, y: at.y + 8 },
          `S8 supplied by ${supplierNames.join(", ")}`,
          2.45,
          { "data-s8-supply": "true" },
        ),
      );
    }
    overlay.append(group);
  }
}

function sectionDrawing(
  project: Project,
  analysis: Analysis,
  visibleTables: ReadonlyMap<string, Table>,
  labels: SVGGElement,
  bounds: Bounds,
  sectionId: string | undefined,
): void {
  if (!project.sections?.length) return;
  const firstTables = new Map<string, Table>();
  for (const table of visibleTables.values()) {
    if (table.sectionId && !firstTables.has(table.sectionId))
      firstTables.set(table.sectionId, table);
  }
  const connectedExits = new Set(project.seams.flatMap((seam) => [seam.exitAId, seam.exitBId]));
  const activePorts = new Map(
    analysis.ports.map((port) => [JSON.stringify([port.pieceId, port.portId]), port]),
  );
  for (const section of project.sections) {
    if (sectionId && sectionId !== section.id) continue;
    const table = firstTables.get(section.id);
    if (table) {
      labels.append(
        boundedLabel(bounds, world({ x: table.width / 2, y: 9 }, table), section.name, 2.75, {
          "data-section-label": section.id,
          "font-weight": 650,
        }),
      );
    }
    for (const exit of section.exits) {
      const owner = visibleTables.get(exit.tableId);
      if (!owner) continue;
      const [start, end] = tableEdge(owner, exit.edge, 10);
      const anchor = world(start, owner);
      const across = world(end, owner);
      const tangent = unit(anchor, across);
      const ports = [exit.outer, exit.inner]
        .map(({ pieceId, portId }) => activePorts.get(JSON.stringify([pieceId, portId])))
        .filter((port) => port !== undefined);
      const average = ports.length
        ? ports.reduce(
            (sum, port) => sum + (port.x - anchor.x) * tangent.x + (port.y - anchor.y) * tangent.y,
            0,
          ) / ports.length
        : Math.hypot(end.x - start.x, end.y - start.y) / 2;
      const distance = Math.max(0, Math.min(average, Math.hypot(end.x - start.x, end.y - start.y)));
      const at = { x: anchor.x + tangent.x * distance, y: anchor.y + tangent.y * distance };
      const connected = connectedExits.has(exit.id);
      labels.append(
        boundedLabel(bounds, at, exit.name, 2.5, {
          "data-exit-label": exit.id,
          fill: connected ? selectionInk : ink,
          "font-weight": 650,
        }),
      );
    }
  }
}

function venueDrawing(
  project: Project,
  analysis: Analysis,
  tables: ReadonlyMap<string, Table>,
  background: SVGGElement,
  overlay: SVGGElement,
  labels: SVGGElement,
  bounds: Bounds,
  prefix: string,
  sectionView: boolean,
): void {
  const venue = project.venue;
  if (venue && !sectionView) {
    addBounds(bounds, { x: 0, y: 0 });
    addBounds(bounds, { x: venue.width, y: venue.depth });
    background.append(
      svg("rect", {
        width: venue.width,
        height: venue.depth,
        fill: "#eeeae0",
        "fill-opacity": 0.28,
        stroke: "#6d6350",
        "stroke-width": 0.65,
        "stroke-dasharray": "3 2.2",
        "pointer-events": "none",
        "data-venue-boundary": "true",
      }),
    );
    const keepoutHits = new Set(
      analysis.venueIssues?.filter(({ kind }) => kind === "keepout").map(({ otherId }) => otherId),
    );
    for (const keepout of venue.keepouts) {
      const { id, x, y, width, depth, name } = keepout;
      const left = x - width / 2;
      const top = y - depth / 2;
      addBounds(bounds, { x: left, y: top });
      addBounds(bounds, { x: left + width, y: top + depth });
      overlay.append(
        svg("rect", {
          x: left,
          y: top,
          width,
          height: depth,
          fill: `url(#${prefix}-${keepoutHits.has(id) ? "overhang" : "keepout"})`,
          stroke: keepoutHits.has(id) ? warningInk : "#725633",
          "stroke-width": 0.6,
          "stroke-dasharray": "2 1.5",
          "pointer-events": "none",
          "data-keepout-id": id,
        }),
      );
      labels.append(
        boundedLabel(bounds, { x, y: top + Math.min(4, depth / 2 + 1) }, name, 2.6, {
          "data-keepout-label": id,
          "font-weight": 650,
        }),
      );
    }
  }
  const marked = new Set<string>();
  for (const issue of analysis.venueIssues ?? []) {
    const ids = issue.kind === "table-overlap" ? [issue.entityId, issue.otherId] : [issue.entityId];
    for (const id of ids) {
      if (id === undefined || marked.has(id)) continue;
      const table = tables.get(id);
      if (!table) continue;
      marked.add(id);
      overlay.append(
        svg("rect", {
          width: table.width,
          height: table.depth,
          transform: poseTransform(table),
          fill: "none",
          stroke: warningInk,
          "stroke-width": 1.1,
          "stroke-dasharray": "1.6 1",
          "pointer-events": "none",
          "data-venue-issue": issue.kind,
          "data-venue-issue-for": id,
        }),
      );
    }
  }
}

function newScene(catalog: Catalog, options: SceneOptions): [SVGSVGElement, SceneLayers] {
  const scene = svg("svg", {
    role: options.interaction ? "group" : "img",
    "data-track-scene": "true",
    "font-family": "system-ui, sans-serif",
    style: `background: ${paper}`,
  });
  const definitions = svg("defs");
  const prefix = `track-scene-${++sceneNumber}`;
  appendPatterns(definitions, prefix);
  const layers: SceneLayers = {
    catalog,
    drawings: { definitions, prefix, parts: new Map(), studPatterns: new Set() },
    title: svg("title"),
    paper: svg("rect", { fill: paper, "pointer-events": "none" }),
    grid: svg("rect", { fill: `url(#${prefix}-grid)`, "pointer-events": "none" }),
    venue: svg("g"),
    tables: svg("g"),
    plates: svg("g"),
    guides: svg("g", { "pointer-events": "none" }),
    tracks: svg("g"),
    issues: svg("g"),
    ports: svg("g"),
    labels: svg("g", { "pointer-events": "none" }),
    itemLabels: svg("g", { "pointer-events": "none" }),
    itemsById: new Map(),
    portsById: new Map(),
  };
  scene.append(
    layers.title,
    definitions,
    layers.paper,
    layers.grid,
    layers.venue,
    layers.tables,
    layers.plates,
    layers.guides,
    layers.tracks,
    layers.issues,
    layers.ports,
    layers.itemLabels,
    layers.labels,
  );
  setSceneDetail(scene, 0);
  sceneLayers.set(scene, layers);
  return [scene, layers];
}

export function createScene(
  project: Project,
  catalog: Catalog,
  analysis: Analysis,
  options: SceneOptions = {},
): SVGSVGElement {
  const reuse = options.reuse;
  const previous = reuse ? sceneLayers.get(reuse) : undefined;
  const [scene, layers] =
    reuse && previous?.catalog === catalog ? [reuse, previous] : newScene(catalog, options);
  const { drawings } = layers;
  const title = `Top-down layout of ${project.name}`;
  if (layers.title.textContent !== title) {
    layers.title.textContent = title;
    scene.setAttribute("aria-label", title);
  }
  const role = options.interaction ? "group" : "img";
  if (scene.getAttribute("role") !== role) scene.setAttribute("role", role);
  const last = scene.lastElementChild;
  if (last?.hasAttribute("data-box-selection")) last.remove();
  const bounds = emptyBounds();
  const visible = new Set(project.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  const parts = new Map(catalog.parts.map((part) => [part.id, part]));
  const tables = new Map(project.tables.map((table) => [table.id, table]));
  const visibleTables = new Map<string, Table>();
  const sectionTables = options.sectionId
    ? new Set(
        project.tables
          .filter((table) => table.sectionId === options.sectionId)
          .map((table) => table.id),
      )
    : undefined;
  const sectionItems = sectionTables ? new Set<string>() : undefined;
  const visibleItems = project.items.filter(
    (item) =>
      visible.has(item.layerId) &&
      (!sectionTables || (item.tableId && sectionTables.has(item.tableId))),
  );
  const curveGroups = new Map<string, string[]>();
  for (const item of visibleItems) {
    if (item.kind !== "track" || !item.tableId || !tables.get(item.tableId)?.niltc) continue;
    const part = parts.get(item.partId);
    if (!part || (part.radius === undefined && part.sweep === undefined)) continue;
    const key = JSON.stringify([item.tableId, part.radius, part.sweep]);
    const group = curveGroups.get(key);
    if (group) group.push(item.id);
    else curveGroups.set(key, [item.id]);
  }
  const representativeCurves = new Set(
    [...curveGroups.values()].map((group) => group[Math.floor(group.length / 2)]),
  );
  const tableNodes: SVGGElement[] = [];
  layers.venue.replaceChildren();
  layers.labels.replaceChildren();
  layers.issues.replaceChildren();
  layers.guides.replaceChildren();
  for (const table of project.tables) {
    if (!visible.has(table.layerId) || (sectionTables && !sectionTables.has(table.id))) continue;
    visibleTables.set(table.id, table);
    const selected = options.selection?.has(table.id) ?? false;
    tableNodes.push(
      tableDrawing(
        table,
        selected,
        bounds,
        `${drawings.prefix}-guides-${tableNodes.length}`,
        layers.guides,
        layers.labels,
        (sectionTables?.size ?? project.tables.length) === 1,
      ),
    );
    if (options.sidingSpace && table.id === "starter-table") {
      layers.guides.append(
        svg("rect", {
          "data-siding-space": "",
          x: 4,
          y: 34,
          width: table.width - 8,
          height: table.depth - 38,
          rx: 2,
          fill: "#fff8d3",
          "fill-opacity": 0.18,
          stroke: "#f9efd2",
          "stroke-width": 0.9,
          "stroke-dasharray": "3 2",
          transform: poseTransform(table),
        }),
      );
    }
    const at = world({ x: table.width / 2, y: 5 }, table);
    const name = table.niltc ? `${table.name} \u00b7 +${niltcHeightPlates} pl` : table.name;
    layers.labels.append(
      boundedLabel(bounds, at, name, 3.4, {
        "font-weight": 700,
        "data-table-label": table.id,
      }),
    );
  }
  layers.tables.replaceChildren(...tableNodes);

  const itemsById = new Map<string, Drawn>();
  const plates: SVGElement[] = [];
  const tracks: SVGElement[] = [];
  const captions: SVGElement[] = [];
  for (const item of visibleItems) {
    sectionItems?.add(item.id);
    const selected = options.selection?.has(item.id) ?? false;
    const table = item.tableId ? tables.get(item.tableId) : undefined;
    const pose = table ? composePose(item, table) : item;
    const referenceHeight = table?.niltc ? niltcHeightPlates : 0;
    const showCurve = !table?.niltc || selected || representativeCurves.has(item.id);
    const key = itemKey(item, pose, selected, options.interaction, referenceHeight, showCurve);
    let drawing = layers.itemsById.get(item.id);
    if (!drawing || drawing.key !== key) {
      const part = item.kind === "track" ? parts.get(item.partId) : undefined;
      const itemBounds = emptyBounds();
      drawing = {
        key,
        bounds: itemBounds,
        ...itemDrawing(
          item,
          pose,
          part,
          selected,
          itemBounds,
          drawings,
          options.interaction,
          referenceHeight,
          showCurve,
        ),
      };
    }
    itemsById.set(item.id, drawing);
    includeBounds(bounds, drawing.bounds);
    (item.kind === "baseplate" ? plates : tracks).push(drawing.node);
    if (drawing.label) captions.push(drawing.label);
  }
  syncLayer(layers.plates, plates);
  syncLayer(layers.tracks, tracks);
  syncLayer(layers.itemLabels, captions);
  layers.itemsById = itemsById;

  sectionDrawing(project, analysis, visibleTables, layers.labels, bounds, options.sectionId);
  venueDrawing(
    project,
    analysis,
    visibleTables,
    layers.venue,
    layers.issues,
    layers.labels,
    bounds,
    drawings.prefix,
    Boolean(sectionTables),
  );
  for (const overhang of analysis.overhangs) {
    if (sectionItems && !sectionItems.has(overhang.pieceId)) continue;
    for (const ring of overhang.rings) {
      for (const point of ring) addBounds(bounds, point);
    }
    const pattern = overhang.rings.map((ring) => pathData(ring, true)).join(" ");
    layers.issues.append(
      svg("path", {
        d: pattern,
        "data-overhang-for": overhang.pieceId,
        "pointer-events": "none",
        fill: `url(#${drawings.prefix}-overhang)`,
        "fill-rule": "evenodd",
        stroke: warningInk,
        "stroke-width": 0.42,
        "stroke-dasharray": "1 0.5",
      }),
    );
  }
  seamDrawing(project, analysis, bounds, layers.labels, sectionTables);

  const portsById = new Map<string, Drawn>();
  const ports: SVGElement[] = [];
  for (const port of analysis.ports) {
    if ((sectionItems && !sectionItems.has(port.pieceId)) || (options.sharing && port.joined))
      continue;
    const selected = options.selection?.has(port.pieceId) ?? false;
    const id = JSON.stringify([port.pieceId, port.portId]);
    const key = JSON.stringify([
      port.x,
      port.y,
      port.joined,
      port.ambiguous,
      selected,
      options.interaction,
      options.sharing,
    ]);
    let drawing = layers.portsById.get(id);
    if (!drawing || drawing.key !== key) {
      const portBounds = emptyBounds();
      drawing = { key, bounds: portBounds, node: portDrawing(port, options, selected, portBounds) };
    }
    portsById.set(id, drawing);
    includeBounds(bounds, drawing.bounds);
    ports.push(drawing.node);
  }
  syncLayer(layers.ports, ports);
  layers.portsById = portsById;

  if (!Number.isFinite(bounds.left)) {
    addBounds(bounds, { x: 0, y: 0 });
    addBounds(bounds, { x: 96, y: 64 });
  }
  const x = bounds.left - 8;
  const y = bounds.top - 8;
  const width = bounds.right - x + 8;
  const height = bounds.bottom - y + 8;
  const viewBox = `${x} ${y} ${width} ${height}`;
  if (scene.getAttribute("data-layout-view-box") !== viewBox) {
    scene.setAttribute("data-layout-view-box", viewBox);
    if (scene !== reuse) scene.setAttribute("viewBox", viewBox);
    for (const backdrop of [layers.paper, layers.grid]) {
      backdrop.setAttribute("x", String(x));
      backdrop.setAttribute("y", String(y));
      backdrop.setAttribute("width", String(width));
      backdrop.setAttribute("height", String(height));
    }
  }
  const grid = options.grid === false ? "none" : "inline";
  if (layers.grid.getAttribute("display") !== grid) layers.grid.setAttribute("display", grid);
  return scene;
}
