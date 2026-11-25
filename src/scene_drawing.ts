import type { Edge, Point, Pose, Table } from "./project";

export type Attributes = Record<string, string | number>;
export type Bounds = { left: number; top: number; right: number; bottom: number };
const svgNamespace = "http://www.w3.org/2000/svg";
export const paper = "#faf6ee";
export const ink = "#2a2721";
export const edgeInk = "#685a48";
export const selectionInk = "#006f71";
export const warningInk = "#923722";

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

export function addShapeBounds(bounds: Bounds, points: readonly Point[], pose: Pose, margin = 0): void {
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

export function path(points: readonly Point[], attributes: Attributes, closed = false): SVGPathElement {
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

export function tableDrawing(table: Table, selected: boolean, bounds: Bounds): SVGGElement {
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

