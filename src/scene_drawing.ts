import type { Edge, Point, Pose, Table } from "./project";

export type Attributes = Record<string, string | number>;
export type Bounds = { left: number; top: number; right: number; bottom: number };
const svgNamespace = "http://www.w3.org/2000/svg";
export const paper = "#faf6ee";
export const ink = "#2a2721";
const edgeInk = "#685a48";
export const selectionInk = "#006f71";
export const warningInk = "#923722";
export const detailStyle = "display: var(--track-detail, none)";

export function svg<Tag extends keyof SVGElementTagNameMap>(
  name: Tag,
  attributes: Attributes = {},
  content?: string,
): SVGElementTagNameMap[Tag] {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (content !== undefined) element.textContent = content;
  return element;
}

export function pathData(points: readonly Point[], closed = false): string {
  if (points.length === 0) return "";
  const coordinates = points.map(({ x, y }) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(" L ");
  return `M ${coordinates}${closed ? " Z" : ""}`;
}

export function unit(start: Point, end: Point): Point {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return length ? { x: (end.x - start.x) / length, y: (end.y - start.y) / length } : { x: 0, y: 0 };
}

export function emptyBounds(): Bounds {
  return { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
}

export function includeBounds(bounds: Bounds, include: Bounds): void {
  bounds.left = Math.min(bounds.left, include.left);
  bounds.top = Math.min(bounds.top, include.top);
  bounds.right = Math.max(bounds.right, include.right);
  bounds.bottom = Math.max(bounds.bottom, include.bottom);
}

export function addBounds(bounds: Bounds, point: Point, margin = 0): void {
  bounds.left = Math.min(bounds.left, point.x - margin);
  bounds.top = Math.min(bounds.top, point.y - margin);
  bounds.right = Math.max(bounds.right, point.x + margin);
  bounds.bottom = Math.max(bounds.bottom, point.y + margin);
}

export function world(point: Point, pose: Pose): Point {
  const radians = ((pose.angle % 360) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: pose.x + point.x * cosine - point.y * sine,
    y: pose.y + point.x * sine + point.y * cosine,
  };
}

export function addShapeBounds(
  bounds: Bounds,
  points: readonly Point[],
  pose: Pose,
  margin = 0,
): void {
  const radians = ((pose.angle % 360) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  for (const { x, y } of points) {
    addBounds(
      bounds,
      {
        x: pose.x + x * cosine - y * sine,
        y: pose.y + x * sine + y * cosine,
      },
      margin,
    );
  }
}

export function poseTransform(pose: Pose): string {
  return `translate(${pose.x} ${pose.y}) rotate(${pose.angle % 360})`;
}

export function rectangle(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export function line(start: Point, end: Point, attributes: Attributes): SVGLineElement {
  return svg("line", { x1: start.x, y1: start.y, x2: end.x, y2: end.y, ...attributes });
}

export function path(
  points: readonly Point[],
  attributes: Attributes,
  closed = false,
): SVGPathElement {
  return svg("path", { d: pathData(points, closed), fill: "none", ...attributes });
}

export function label(
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

export function boundedLabel(
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

export function tableEdge(table: Table, side: Edge, inset = 0): [Point, Point] {
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

function audienceMarker(side: Edge, distance: number, table: Table): Point[] {
  const inset = 3;
  switch (side) {
    case "north":
      return [
        { x: distance - inset, y: inset },
        { x: distance, y: 0 },
        { x: distance + inset, y: inset },
      ];
    case "east":
      return [
        { x: table.width - inset, y: distance - inset },
        { x: table.width, y: distance },
        { x: table.width - inset, y: distance + inset },
      ];
    case "south":
      return [
        { x: distance - inset, y: table.depth - inset },
        { x: distance, y: table.depth },
        { x: distance + inset, y: table.depth - inset },
      ];
    case "west":
      return [
        { x: inset, y: distance - inset },
        { x: 0, y: distance },
        { x: inset, y: distance + inset },
      ];
  }
}

function audienceLabel(
  table: Table,
  side: Edge,
  bounds: Bounds,
  labels: SVGGElement,
  atOverview: boolean,
): void {
  const horizontal = side === "north" || side === "south";
  const local = horizontal
    ? { x: table.width / 2, y: side === "north" ? -5 : table.depth + 5 }
    : { x: side === "west" ? -5 : table.width + 5, y: table.depth / 2 };
  const at = world(local, table);
  const angle = (table.angle % 180) + (horizontal ? 0 : 90);
  const upright = ((((angle + 90) % 180) + 180) % 180) - 90;
  const size = atOverview ? 4 : 2.6;
  const width = "Audience front".length * size * 0.57;
  addShapeBounds(bounds, rectangle(-width / 2, -size, width, size * 1.3), {
    ...at,
    angle: upright,
  });
  labels.append(
    label(at, "Audience front", size, {
      "data-audience-front-label": side,
      "text-anchor": "middle",
      "font-weight": 650,
      transform: `rotate(${upright} ${at.x} ${at.y})`,
      ...(atOverview ? {} : { style: detailStyle }),
    }),
  );
}

export function tableDrawing(
  table: Table,
  selected: boolean,
  bounds: Bounds,
  guideId: string,
  guideLayer: SVGGElement,
  labels: SVGGElement,
  frontLabelsAtOverview: boolean,
): SVGGElement {
  const points = rectangle(0, 0, table.width, table.depth);
  addShapeBounds(bounds, points, table);
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
  if (!table.fronts.length) return group;
  const guides = svg("g", { id: guideId, stroke: "#76523b" });
  const definitions = svg("defs");
  definitions.append(guides);
  group.append(definitions);
  guideLayer.append(svg("use", { href: `#${guideId}`, transform: poseTransform(table) }));
  for (const side of table.fronts) {
    guides.append(
      line(...tableEdge(table, side), {
        "stroke-width": 1.35,
        "data-front": side,
      }),
    );
    const horizontal = side === "north" || side === "south";
    const length = horizontal ? table.width : table.depth;
    for (const factor of [0.25, 0.5, 0.75]) {
      guides.append(
        path(audienceMarker(side, length * factor, table), {
          "data-audience-front-marker": side,
          "stroke-width": 0.8,
        }),
      );
    }
    audienceLabel(table, side, bounds, labels, frontLabelsAtOverview);
    for (const offset of [8, 24]) {
      const extent = horizontal ? table.depth : table.width;
      if (offset >= extent) continue;
      const [start, end] = tableEdge(table, side, offset);
      guides.append(
        line(start, end, {
          "stroke-width": 0.38,
          "stroke-dasharray": offset === 8 ? "3 2" : "1 2",
          "data-front": side,
          "data-lane-studs": offset,
        }),
      );
      if (table.niltc && extent >= offset + 8 && length >= 32) {
        const [a, b] = tableEdge(table, side, offset + 7);
        const at = world({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, table);
        const angle = (table.angle % 180) + (horizontal ? 0 : 90);
        const upright = ((((angle + 90) % 180) + 180) % 180) - 90;
        labels.append(
          label(at, offset === 8 ? "Outer mainline" : "Inner mainline", 2.6, {
            "data-lane-label": offset,
            "text-anchor": "middle",
            "font-weight": 650,
            transform: `rotate(${upright} ${at.x} ${at.y})`,
            style: detailStyle,
          }),
        );
      }
    }
  }
  return group;
}
