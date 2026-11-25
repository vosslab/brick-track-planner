import { worldPose } from "./project";
import type { Catalog, Edge, Item, Point, Pose, Project, Table } from "./project";
import type { Analysis } from "./engine";

const svgNamespace = "http://www.w3.org/2000/svg";
const paper = "#faf6ee";
const ink = "#2a2721";
const edgeInk = "#685a48";
const selectionInk = "#006f71";
const warningInk = "#923722";

type SceneOptions = {
  selection?: ReadonlySet<string>;
  grid?: boolean;
  sharing?: boolean;
};
type Attributes = Record<string, string | number>;
type Bounds = { left: number; top: number; right: number; bottom: number };
type ScenePort = Analysis["ports"][number];

function svg<Tag extends keyof SVGElementTagNameMap>(
  name: Tag,
  attributes: Attributes = {},
  content?: string,
): SVGElementTagNameMap[Tag] {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (content !== undefined) element.textContent = content;
  return element;
}

function addBounds(bounds: Bounds, point: Point, margin = 0): void {
  bounds.left = Math.min(bounds.left, point.x - margin);
  bounds.top = Math.min(bounds.top, point.y - margin);
  bounds.right = Math.max(bounds.right, point.x + margin);
  bounds.bottom = Math.max(bounds.bottom, point.y + margin);
}

function world(point: Point, pose: Pose): Point {
  const radians = ((pose.angle % 360) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: pose.x + point.x * cosine - point.y * sine,
    y: pose.y + point.x * sine + point.y * cosine,
  };
}

function poseTransform(pose: Pose): string {
  return `translate(${pose.x} ${pose.y}) rotate(${pose.angle % 360})`;
}

function rectangle(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function pathData(points: readonly Point[], closed = false): string {
  if (points.length === 0) return "";
  const coordinates = points.map(({ x, y }) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(" L ");
  return `M ${coordinates}${closed ? " Z" : ""}`;
}

function line(start: Point, end: Point, attributes: Attributes): SVGLineElement {
  return svg("line", { x1: start.x, y1: start.y, x2: end.x, y2: end.y, ...attributes });
}

function path(points: readonly Point[], attributes: Attributes, closed = false): SVGPathElement {
  return svg("path", { d: pathData(points, closed), fill: "none", ...attributes });
}

function label(
  point: Point,
  content: string,
  size: number,
  attributes: Attributes = {},
): SVGTextElement {
  return svg(
    "text",
    {
      x: point.x,
      y: point.y,
      "font-size": size,
      fill: ink,
      stroke: paper,
      "stroke-width": 0.8,
      "stroke-linejoin": "round",
      "paint-order": "stroke",
      "pointer-events": "none",
      ...attributes,
    },
    content,
  );
}

function boundedLabel(
  bounds: Bounds,
  at: Point,
  content: string,
  size: number,
  attributes?: Attributes,
): SVGTextElement {
  const halfWidth = Array.from(content).length * size * 0.57;
  addBounds(bounds, { x: at.x - halfWidth, y: at.y - size });
  addBounds(bounds, { x: at.x + halfWidth, y: at.y + size * 0.3 });
  return label(at, content, size, { "text-anchor": "middle", ...attributes });
}

function tableEdge(table: Table, side: Edge, inset = 0): [Point, Point] {
  switch (side) {
    case "north":
      return [
        { x: 0, y: inset },
        { x: table.width, y: inset },
      ];
    case "east":
      return [
        { x: table.width - inset, y: 0 },
        { x: table.width - inset, y: table.depth },
      ];
    case "south":
      return [
        { x: 0, y: table.depth - inset },
        { x: table.width, y: table.depth - inset },
      ];
    case "west":
      return [
        { x: inset, y: 0 },
        { x: inset, y: table.depth },
      ];
  }
}

function tableDrawing(table: Table, selected: boolean, bounds: Bounds): SVGGElement {
  const points = rectangle(0, 0, table.width, table.depth);
  for (const point of points) addBounds(bounds, world(point, table));
  const group = svg("g", {
    "data-table-id": table.id,
    "aria-label": table.name,
    transform: poseTransform(table),
  });
  group.append(svg("title", {}, table.name));
  group.append(
    path(
      points,
      {
        fill: "#eee4d3",
        "fill-opacity": 0.62,
        stroke: selected ? selectionInk : edgeInk,
        "stroke-width": selected ? 1.1 : 0.65,
        "data-table-edge": "true",
      },
      true,
    ),
  );
  for (const side of table.fronts) {
    group.append(
      line(...tableEdge(table, side), {
        stroke: "#76523b",
        "stroke-width": 1.35,
        "data-front": side,
      }),
    );
    for (const offset of [8, 24]) {
      if (offset >= (side === "north" || side === "south" ? table.depth : table.width)) continue;
      const [start, end] = tableEdge(table, side, offset);
      group.append(
        line(start, end, {
          stroke: "#76523b",
          "stroke-width": 0.38,
          "stroke-dasharray": offset === 8 ? "3 2" : "1 2",
          "data-front": side,
          "data-lane-studs": offset,
        }),
      );
    }
  }
  return group;
}

function unit(start: Point, end: Point): Point {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return length ? { x: (end.x - start.x) / length, y: (end.y - start.y) / length } : { x: 0, y: 0 };
}

function offsetRail(
  route: readonly Point[],
  offset: number,
  ports: Catalog["parts"][number]["ports"],
): Point[] {
  return route.map((point, index) => {
    const before = route[index - 1];
    const after = route[index + 1];
    if (!before || !after) {
      const port = ports.find((port) => Math.hypot(port.x - point.x, port.y - point.y) < 0.0001);
      if (port) {
        const radians = ((port.angle + (before ? 0 : 180)) * Math.PI) / 180;
        return { x: point.x - Math.sin(radians) * offset, y: point.y + Math.cos(radians) * offset };
      }
    }
    const incoming = before ? unit(before, point) : undefined;
    const outgoing = after ? unit(point, after) : undefined;
    const a = incoming ?? outgoing ?? { x: 1, y: 0 };
    const b = outgoing ?? a;
    const scale = offset / Math.max(0.5, 1 + a.x * b.x + a.y * b.y);
    return { x: point.x - (a.y + b.y) * scale, y: point.y + (a.x + b.x) * scale };
  });
}

function sleepers(route: readonly Point[]): string {
  let result = "";
  let chainage = 0;
  let nextTie = 0.85;
  for (let index = 1; index < route.length; index++) {
    const start = route[index - 1];
    const end = route[index];
    if (!start || !end) continue;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const tangent = unit(start, end);
    while (nextTie < chainage + length - 0.15) {
      const along = nextTie - chainage;
      const x = start.x + along * tangent.x;
      const y = start.y + along * tangent.y;
      result += pathData([
        { x: x - tangent.y * 3.55, y: y + tangent.x * 3.55 },
        { x: x + tangent.y * 3.55, y: y - tangent.x * 3.55 },
      ]);
      nextTie += 2;
    }
    chainage += length;
  }
  return result;
}

function trackDrawing(
  group: SVGGElement,
  part: Catalog["parts"][number],
  height: number,
  selected: boolean,
): void {
  const rail = selected ? selectionInk : "#36312b";
  const base = selected ? "#b5dfd9" : "#cdbeaa";
  const hatch = height > 0 ? "url(#track-raised)" : "url(#track-lowered)";
  if (part.paths.length === 0) {
    group.append(
      path(
        part.footprint,
        {
          fill: base,
          stroke: rail,
          "stroke-width": 0.45,
          "data-track-accessory": "true",
        },
        true,
      ),
    );
    if (height !== 0) group.append(path(part.footprint, { fill: hatch }, true));
    return;
  }
  for (const route of part.paths) {
    group.append(
      path(route, {
        stroke: base,
        "stroke-width": 7.5,
        "stroke-linecap": "butt",
        "stroke-linejoin": "round",
      }),
    );
  }
  if (height !== 0) {
    for (const route of part.paths) {
      group.append(
        path(route, {
          stroke: hatch,
          "stroke-width": 7.5,
          "stroke-linejoin": "round",
          "pointer-events": "none",
        }),
      );
    }
  }
  for (const route of part.paths) {
    group.append(
      svg("path", {
        d: sleepers(route),
        fill: "none",
        stroke: rail,
        "stroke-width": 0.55,
        opacity: 0.6,
      }),
    );
    for (const side of [-2.5, 2.5]) {
      group.append(
        path(offsetRail(route, side, part.ports), {
          stroke: rail,
          "stroke-width": 0.85,
          "stroke-linejoin": "round",
          "data-rail": "true",
        }),
      );
    }
  }
}

function itemDrawing(
  item: Item,
  pose: Pose,
  part: Catalog["parts"][number] | undefined,
  selected: boolean,
  bounds: Bounds,
  labels: SVGGElement,
): SVGGElement {
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
  group.append(svg("title", {}, name));
  if (item.kind === "track" && part) {
    for (const point of part.footprint) addBounds(bounds, world(point, pose), 0.5);
    for (const route of part.paths) {
      for (const point of route) addBounds(bounds, world(point, pose), 4);
    }
    trackDrawing(group, part, item.heightPlates, selected);
    const captions = [];
    if (part.radius !== undefined) captions.push(`R${part.radius}`);
    if (item.heightPlates !== 0)
      captions.push(`${item.heightPlates > 0 ? "+" : ""}${item.heightPlates} pl`);
    const route = part.paths.find((route) => route.length > 2) ?? part.paths[0];
    const mid = route?.[Math.floor((route.length - 1) / 2)];
    if (captions.length) {
      const midpoint = mid ?? { x: 0, y: 0 };
      const next = route?.[Math.floor((route.length - 1) / 2) + 1];
      const half = next ? { x: (midpoint.x + next.x) / 2, y: (midpoint.y + next.y) / 2 } : midpoint;
      const tangent = next ? unit(midpoint, next) : { x: 1, y: 0 };
      const at = world({ x: half.x + tangent.y * 6.5, y: half.y - tangent.x * 6.5 }, pose);
      labels.append(
        boundedLabel(bounds, { x: at.x, y: at.y + 1 }, captions.join(" / "), 2.5, {
          "data-track-caption": item.id,
          "font-weight": 600,
        }),
      );
    }
  } else {
    const width = item.kind === "unresolved" ? item.width : 32;
    const depth = item.kind === "unresolved" ? item.depth : 32;
    const points = rectangle(-width / 2, -depth / 2, width, depth);
    for (const point of points) addBounds(bounds, world(point, boxPose));
    if (item.kind === "baseplate") {
      group.append(
        path(
          points,
          {
            fill: item.color ?? "#dce1c8",
            "fill-opacity": 0.72,
            stroke: selected ? selectionInk : "#74805e",
            "stroke-width": selected ? 0.95 : 0.5,
          },
          true,
        ),
      );
      if (item.name) labels.append(boundedLabel(bounds, pose, item.name, 2.5));
    } else {
      group.append(
        path(
          points,
          {
            fill: "url(#track-unknown)",
            stroke: selected ? selectionInk : warningInk,
            "stroke-width": 0.6,
            "stroke-dasharray": "2 1",
          },
          true,
        ),
      );
      labels.append(boundedLabel(bounds, pose, `? ${name}`, 2.7, { "font-weight": 650 }));
    }
  }
  return group;
}

function appendPatterns(scene: SVGSVGElement): void {
  const definitions = svg("defs");
  const grid = svg("pattern", {
    id: "track-grid",
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
    ["track-raised", "#286e67", false, 0.46],
    ["track-lowered", "#754b71", true, 0.46],
    ["track-overhang", warningInk, true, 0.45],
    ["track-unknown", "#9c6356", false, 0.3],
  ] as const) {
    const pattern = svg("pattern", { id, width: 2, height: 2, patternUnits: "userSpaceOnUse" });
    const strokes = downward
      ? "M -2 -2 L 4 4 M -2 0 L 2 4 M 0 -2 L 4 2"
      : "M -2 4 L 4 -2 M -2 2 L 2 -2 M 0 4 L 4 0";
    pattern.append(
      svg("path", { d: strokes, stroke: inkColor, fill: "none", "stroke-width": width }),
    );
    definitions.append(pattern);
  }
  scene.append(definitions);
}

function appendPort(
  overlay: SVGGElement,
  port: ScenePort,
  sharing: boolean,
  selected: boolean,
  bounds: Bounds,
): void {
  if (sharing && port.joined) return;
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
    "aria-label": title,
  });
  group.append(svg("title", {}, title));
  if (!sharing) {
    group.append(svg("circle", { cx: port.x, cy: port.y, r: 2.8, fill: "transparent" }));
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
  overlay.append(group);
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
): void {
  const ports = new Map(
    analysis.ports.map((port) => [JSON.stringify([port.pieceId, port.portId]), port]),
  );
  const statuses = new Map(analysis.seams.map((seam) => [seam.id, seam]));
  const tables = new Map(project.tables.map((table) => [table.id, table]));
  const items = new Map(project.items.map((item) => [item.id, item]));

  for (const seam of project.seams) {
    const status = statuses.get(seam.id);
    const table = tables.get(seam.tableA);
    if (!status || !table || (status.outer.status === "hidden" && status.inner.status === "hidden"))
      continue;
    const [start, end] = tableEdge(table, seam.edgeA);
    const at = world({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, table);
    const group = svg("g", { "data-seam-id": seam.id, "pointer-events": "none" });
    const supplierNames = new Set<string>();
    for (const [index, lane] of (["outer", "inner"] as const).entries()) {
      if (status[lane].status === "hidden") continue;
      const pair = seam[lane];
      const first = ports.get(JSON.stringify([pair.a.pieceId, pair.a.portId]));
      const second = ports.get(JSON.stringify([pair.b.pieceId, pair.b.portId]));
      seamLane(group, bounds, seam.id, lane, status[lane], first, second, {
        x: at.x,
        y: at.y + index * 4,
      });
      for (const item of [items.get(pair.a.pieceId), items.get(pair.b.pieceId)]) {
        if (item?.kind === "track" && item.partId === "bricktracks:s08" && item.tableId) {
          const supplier = tables.get(item.tableId);
          if (supplier) supplierNames.add(supplier.name);
        }
      }
    }
    if (supplierNames.size) {
      group.append(
        boundedLabel(
          bounds,
          { x: at.x, y: at.y + 8 },
          `S8 supplied by ${[...supplierNames].join(", ")}`,
          2.45,
          { "data-s8-supply": "true" },
        ),
      );
    }
    overlay.append(group);
  }
}

export function createScene(
  project: Project,
  catalog: Catalog,
  analysis: Analysis,
  options: SceneOptions = {},
): SVGSVGElement {
  const scene = svg("svg", {
    role: "img",
    "aria-label": `Top-down layout of ${project.name}`,
    "data-track-scene": "true",
    "font-family": "system-ui, sans-serif",
    style: `background: ${paper}`,
  });
  scene.append(svg("title", {}, `Top-down layout of ${project.name}`));
  appendPatterns(scene);
  const bounds: Bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const visible = new Set(project.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  const parts = new Map(catalog.parts.map((part) => [part.id, part]));
  const base = svg("g");
  const tracks = svg("g");
  const labels = svg("g", { "pointer-events": "none" });
  const overlay = svg("g");
  for (const table of project.tables) {
    if (!visible.has(table.layerId)) continue;
    const selected = options.selection?.has(table.id) ?? false;
    base.append(tableDrawing(table, selected, bounds));
    const at = world({ x: table.width / 2, y: 5 }, table);
    labels.append(
      boundedLabel(bounds, at, table.name, 3.4, {
        "font-weight": 700,
        "data-table-label": table.id,
      }),
    );
  }
  for (const item of project.items) {
    if (!visible.has(item.layerId)) continue;
    const destination = item.kind === "baseplate" ? base : tracks;
    const part = item.kind === "track" ? parts.get(item.partId) : undefined;
    const selected = options.selection?.has(item.id) ?? false;
    destination.append(
      itemDrawing(item, worldPose(item, project.tables), part, selected, bounds, labels),
    );
  }
  for (const overhang of analysis.overhangs) {
    for (const ring of overhang.rings) {
      for (const point of ring) addBounds(bounds, point);
    }
    const pattern = overhang.rings.map((ring) => pathData(ring, true)).join(" ");
    overlay.append(
      svg("path", {
        d: pattern,
        "data-overhang-for": overhang.pieceId,
        "pointer-events": "none",
        fill: "url(#track-overhang)",
        "fill-rule": "evenodd",
        stroke: warningInk,
        "stroke-width": 0.42,
        "stroke-dasharray": "1 0.5",
      }),
    );
  }
  seamDrawing(project, analysis, bounds, labels);
  for (const port of analysis.ports) {
    appendPort(
      overlay,
      port,
      options.sharing ?? false,
      options.selection?.has(port.pieceId) ?? false,
      bounds,
    );
  }
  if (!Number.isFinite(bounds.left)) {
    addBounds(bounds, { x: 0, y: 0 });
    addBounds(bounds, { x: 96, y: 64 });
  }
  const x = bounds.left - 8;
  const y = bounds.top - 8;
  const width = bounds.right - x + 8;
  const height = bounds.bottom - y + 8;
  const viewBox = `${x} ${y} ${width} ${height}`;
  scene.setAttribute("viewBox", viewBox);
  scene.setAttribute("data-layout-view-box", viewBox);
  scene.append(svg("rect", { x, y, width, height, fill: paper, "pointer-events": "none" }));
  if (options.grid !== false) {
    scene.append(
      svg("rect", { x, y, width, height, fill: "url(#track-grid)", "pointer-events": "none" }),
    );
  }
  scene.append(base, tracks, overlay, labels);
  return scene;
}
