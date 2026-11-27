import type { Point, Port, Pose } from "./project";

export type Attributes = Record<string, string | number>;
export type Bounds = { left: number; top: number; right: number; bottom: number };

const svgNamespace = "http://www.w3.org/2000/svg";
export const paper = "#faf6ee";
export const ink = "#2a2721";
export const selectionInk = "#006f71";
export const warningInk = "#923722";
export const detailStyle = "display: var(--track-detail, none)";
export const trackRailOffset = 2.5;
export const sleeperHalfWidth = 3.75;
export const sleeperSpacing = 4;

export type Sleeper = {
  left: Point;
  right: Point;
  tangent: Point;
};

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

/** Returns a continuous rail line offset from a measured track centerline. */
export function offsetRail(
  route: readonly Point[],
  offset: number,
  ports: readonly Port[],
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
    const first = incoming ?? outgoing ?? { x: 1, y: 0 };
    const second = outgoing ?? first;
    const scale = offset / Math.max(0.5, 1 + first.x * second.x + first.y * second.y);
    return { x: point.x - (first.y + second.y) * scale, y: point.y + (first.x + second.x) * scale };
  });
}

/** Returns sleeper spans at the four-stud rhythm used by LEGO RC/PF straight track. */
export function sleepers(route: readonly Point[]): Sleeper[] {
  const result: Sleeper[] = [];
  let chainage = 0;
  let next = 0;
  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    if (!start || !end) continue;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (!length) continue;
    const tangent = unit(start, end);
    while (next <= chainage + length + 0.000_001) {
      const along = next - chainage;
      const center = {
        x: start.x + tangent.x * along,
        y: start.y + tangent.y * along,
      };
      result.push({
        left: {
          x: center.x - tangent.y * sleeperHalfWidth,
          y: center.y + tangent.x * sleeperHalfWidth,
        },
        right: {
          x: center.x + tangent.y * sleeperHalfWidth,
          y: center.y - tangent.x * sleeperHalfWidth,
        },
        tangent,
      });
      next += sleeperSpacing;
    }
    chainage += length;
  }
  return result;
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
