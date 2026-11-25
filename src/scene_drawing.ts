import type { Edge, Point, Pose } from "./project";

export type Attributes = Record<string, string | number>;
export type Bounds = { left: number; top: number; right: number; bottom: number };
export type AreaBounds = { width: number; depth: number };

const svgNamespace = "http://www.w3.org/2000/svg";
export const paper = "#faf6ee";
export const ink = "#2a2721";
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
  if (!points.length) return "";
  return `M ${points.map(({ x, y }) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(" L ")}${closed ? " Z" : ""}`;
}

export function unit(start: Point, end: Point): Point {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return length ? { x: (end.x - start.x) / length, y: (end.y - start.y) / length } : { x: 0, y: 0 };
}

export function emptyBounds(): Bounds {
  return { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
}

export function addBounds(bounds: Bounds, point: Point, margin = 0): void {
  bounds.left = Math.min(bounds.left, point.x - margin);
  bounds.top = Math.min(bounds.top, point.y - margin);
  bounds.right = Math.max(bounds.right, point.x + margin);
  bounds.bottom = Math.max(bounds.bottom, point.y + margin);
}

export function includeBounds(bounds: Bounds, other: Bounds): void {
  addBounds(bounds, { x: other.left, y: other.top });
  addBounds(bounds, { x: other.right, y: other.bottom });
}

export function world(point: Point, pose: Pose): Point {
  const radians = (pose.angle * Math.PI) / 180;
  return {
    x: pose.x + point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: pose.y + point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

export function addShapeBounds(
  bounds: Bounds,
  points: readonly Point[],
  pose: Pose,
  margin = 0,
): void {
  for (const point of points) addBounds(bounds, world(point, pose), margin);
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
  attributes: Attributes = {},
): SVGTextElement {
  const half = Array.from(content).length * size * 0.57;
  addBounds(bounds, { x: at.x - half, y: at.y - size });
  addBounds(bounds, { x: at.x + half, y: at.y + size * 0.3 });
  return label(at, content, size, { "text-anchor": "middle", ...attributes });
}

export function areaEdge(area: AreaBounds, edge: Edge, inset = 0): [Point, Point] {
  switch (edge) {
    case "north":
      return [
        { x: 0, y: inset },
        { x: area.width, y: inset },
      ];
    case "east":
      return [
        { x: area.width - inset, y: 0 },
        { x: area.width - inset, y: area.depth },
      ];
    case "south":
      return [
        { x: 0, y: area.depth - inset },
        { x: area.width, y: area.depth - inset },
      ];
    case "west":
      return [
        { x: inset, y: 0 },
        { x: inset, y: area.depth },
      ];
  }
}
