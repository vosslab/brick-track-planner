import type { Part, Point, TrackItem } from "./project";
import { detailStyle, svg } from "./scene_drawing";

// L-Gauge Schematic Color for BlueBrick, with a teal entry for R24.
const curveColors: Partial<Record<number, string>> = {
  24: "#086761",
  40: "#b71c1c",
  56: "#800002",
  72: "#804003",
  72.5: "#804003",
  88: "#118040",
  104: "#074080",
  120: "#800040",
  136: "#400080",
  152: "#dc0972",
} as const;

type RouteMeasure = { path: readonly Point[]; length: number };

const otherTrack = { code: "TRK", color: "#53616d" };

function measuredRoutes(part: Part): RouteMeasure[] {
  return part.paths
    .filter((path) => path.length >= 2)
    .map((path) => ({
      path,
      length: path.slice(1).reduce((total, point, index) => {
        const previous = path[index];
        return previous ? total + Math.hypot(point.x - previous.x, point.y - previous.y) : total;
      }, 0),
    }))
    .filter(({ length }) => length > 0);
}

function trackCode(part: Part, length: number): { code: string; color: string } {
  const category = part.browse?.category;
  if (category === "switches" || part.routes.some((route) => route.event === "switch"))
    return { code: "SW", color: "#4f5d6b" };
  if (category === "crossings" || part.routes.some((route) => route.event === "crossing"))
    return { code: "X", color: "#62506f" };
  if (category === "connectors") return { code: "CN", color: "#69543e" };
  if (category === "straights") return { code: `S${Math.round(length)}`, color: "#606060" };
  const radius = part.radius ?? part.routes.find((route) => route.radius !== undefined)?.radius;
  return radius === undefined
    ? otherTrack
    : { code: `R${radius}`, color: curveColors[radius] ?? otherTrack.color };
}

function midpoint({ path, length }: RouteMeasure): { point: Point; tangent: number } | undefined {
  const target = length / 2;
  let travelled = 0;
  for (let index = 1; index < path.length; index += 1) {
    const before = path[index - 1];
    const after = path[index];
    if (!before || !after) continue;
    const segment = Math.hypot(after.x - before.x, after.y - before.y);
    if (!segment) continue;
    if (travelled + segment >= target) {
      const fraction = (target - travelled) / segment;
      return {
        point: {
          x: before.x + (after.x - before.x) * fraction,
          y: before.y + (after.y - before.y) * fraction,
        },
        tangent: (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI,
      };
    }
    travelled += segment;
  }
  return undefined;
}

function uprightTangent(tangent: number, itemAngle: number): number {
  const screenAngle = (((tangent + itemAngle) % 360) + 360) % 360;
  return screenAngle > 90 && screenAngle < 270 ? tangent + 180 : tangent;
}

/**
 * Appends compact schematic bands. The caller keeps the normal transparent
 * footprint and appends the returned label after its height hatch.
 */
export function codedTrackDrawing(
  group: SVGGElement,
  routeHref: string,
  item: TrackItem,
  part: Part,
  selected: boolean,
): SVGTextElement | undefined {
  const routes = measuredRoutes(part);
  if (!routes.length) return undefined;
  const principal = routes.reduce((longest, route) =>
    route.length > longest.length ? route : longest,
  );
  const { code, color } = trackCode(part, principal.length);
  group.setAttribute("data-track-code", code);

  const visual = svg("g", {
    "data-coded-track": "true",
    "pointer-events": "none",
    "aria-hidden": "true",
  });
  visual.append(
    svg("use", {
      href: routeHref,
      fill: "none",
      stroke: selected ? "#f5ce40" : "var(--track-code-outline, #f8fafc)",
      "stroke-width": selected ? 10.3 : 8.8,
      "stroke-linecap": "butt",
      "stroke-linejoin": "round",
      "data-coded-track": "outline",
    }),
    svg("use", {
      href: routeHref,
      fill: "none",
      stroke: color,
      "stroke-width": 7.35,
      "stroke-linecap": "butt",
      "stroke-linejoin": "round",
      "data-coded-track": "band",
    }),
  );
  for (const port of part.ports) {
    const radians = (port.angle * Math.PI) / 180;
    const halfWidth = 3.68;
    visual.append(
      svg("line", {
        x1: port.x - Math.sin(radians) * halfWidth,
        y1: port.y + Math.cos(radians) * halfWidth,
        x2: port.x + Math.sin(radians) * halfWidth,
        y2: port.y - Math.cos(radians) * halfWidth,
        fill: "none",
        stroke: "#f8fafc",
        "stroke-width": 0.5,
      }),
    );
  }
  group.append(visual);

  const placement = midpoint(principal);
  if (!placement || principal.length < 1.5) return undefined;
  const short = principal.length < 7;
  const tangent = placement.tangent + (short ? 90 : 0);
  return svg(
    "text",
    {
      x: placement.point.x,
      y: placement.point.y,
      "data-track-code": code,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
      "font-size": short ? Math.min(3.1, principal.length * 0.74) : 3.1,
      "font-weight": 800,
      fill: "#ffffff",
      stroke: "#1f2937",
      "stroke-width": 0.42,
      "stroke-linejoin": "round",
      "paint-order": "stroke",
      transform: `rotate(${uprightTangent(tangent, item.angle)} ${placement.point.x} ${placement.point.y})`,
      "pointer-events": "none",
      "aria-hidden": "true",
      style: short ? "display: var(--track-code-short-labels, none)" : detailStyle,
    },
    code,
  );
}
