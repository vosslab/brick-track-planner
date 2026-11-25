import type { Catalog, Point, TrackItem } from "./project";
import { detailStyle, pathData, svg, unit } from "./scene_drawing";

type Part = Catalog["parts"][number];
type Ballast = NonNullable<TrackItem["ballast"]>;

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

type PartGeometry = {
  route: string;
  rails: string;
  ties: string;
  footprint: string;
};

const geometries = new WeakMap<Part, PartGeometry>();

export function partGeometry(part: Part): PartGeometry {
  let geometry = geometries.get(part);
  if (!geometry) {
    geometry = {
      route: part.paths.map((route) => pathData(route)).join(" "),
      rails: part.paths
        .flatMap((route) =>
          [-2.5, 2.5].map((offset) => pathData(offsetRail(route, offset, part.ports))),
        )
        .join(" "),
      ties: part.paths.map(sleepers).join(" "),
      footprint: pathData(part.footprint, true),
    };
    geometries.set(part, geometry);
  }
  return geometry;
}

export function partDrawing(defs: SVGDefsElement, id: string, part: Part): void {
  const geometry = partGeometry(part);
  if (!geometry.route) {
    defs.append(
      svg("path", {
        id,
        d: geometry.footprint,
        style: "fill: var(--track-bed, #898b88); stroke: var(--track-rail, #343734)",
        "stroke-width": 0.45,
        "data-track-accessory": "true",
      }),
    );
    return;
  }

  const route = svg("path", { id: `${id}-route`, d: geometry.route, fill: "none" });
  const shape = svg("g", { id, fill: "none", "stroke-linejoin": "round" });
  shape.append(
    svg("use", {
      href: `#${id}-route`,
      style: "stroke: var(--track-bed, #93948f)",
      "stroke-width": 7.5,
    }),
    svg("path", {
      d: geometry.ties,
      "stroke-width": 0.9,
      style: `${detailStyle}; stroke: var(--track-tie, #565a55)`,
      "pointer-events": "none",
    }),
    svg("path", {
      d: geometry.rails,
      style: "stroke: var(--track-rail, #2d302e)",
      "stroke-width": 1,
      "data-rail": "true",
    }),
    svg("path", {
      d: geometry.rails,
      stroke: "#e8e9e3",
      "stroke-width": 0.28,
      "pointer-events": "none",
      style: detailStyle,
    }),
  );
  defs.append(route, shape);
}

const ballastWidths = { bare: 7.5, gray: 10.5, pennlug: 13 };

export function trackHalfWidth(ballast: Ballast): number {
  return ballastWidths[ballast] / 2;
}

export function partInstance(
  group: SVGGElement,
  id: string,
  prefix: string,
  item: TrackItem,
  part: Part,
  selected: boolean,
  heightOffset: number,
): void {
  const ballast = item.ballast ?? "bare";
  group.setAttribute("data-ballast", ballast);

  if (selected) {
    group.setAttribute("style", "--track-bed:#b5dfd9; --track-rail:#006064; --track-tie:#45847c");
  }

  const hasRails = part.paths.length > 0;
  const routeHref = `#${hasRails ? `${id}-route` : id}`;
  if (hasRails && ballast !== "bare") {
    const shoulder = svg("g", {
      "data-ballast-shoulder": ballast,
      "stroke-linejoin": "round",
      "pointer-events": "none",
    });
    shoulder.append(
      svg("use", {
        href: routeHref,
        stroke: ballast === "gray" ? "#747872" : "#696d66",
        "stroke-width": ballastWidths[ballast],
      }),
      svg("use", {
        href: routeHref,
        stroke: ballast === "gray" ? "#a4a7a1" : "#b2a495",
        "stroke-width": ballast === "gray" ? 9.65 : 10.65,
      }),
      svg("use", {
        href: routeHref,
        stroke: `url(#${prefix}-ballast-grain)`,
        "stroke-width": ballastWidths[ballast] - 0.6,
        style: detailStyle,
      }),
    );
    group.append(shoulder);
  }
  group.append(svg("use", { href: `#${id}` }));

  // Height stays legible above bare or ballasted track at every scale.
  if (heightOffset !== 0) {
    const hatch = `url(#${prefix}-${heightOffset > 0 ? "raised" : "lowered"})`;
    group.append(
      hasRails
        ? svg("use", {
            href: routeHref,
            stroke: hatch,
            "stroke-width": 3.4,
            "stroke-linejoin": "round",
            "pointer-events": "none",
          })
        : svg("path", {
            d: partGeometry(part).footprint,
            fill: hatch,
            "pointer-events": "none",
          }),
    );
  }
}

export function ballastPattern(prefix: string): SVGPatternElement {
  const grain = svg("pattern", {
    id: `${prefix}-ballast-grain`,
    width: 2,
    height: 2,
    patternUnits: "userSpaceOnUse",
  });
  grain.append(
    svg("path", {
      d: "M0.2 0.4h0.2 M1.1 0.2h0.1 M1.5 1h0.2 M0.4 1.5h0.2 M1.35 1.85h0.25",
      stroke: "#221f1b",
      "stroke-width": 0.14,
      "stroke-linecap": "round",
      opacity: 0.5,
    }),
    svg("path", {
      d: "M0.7 0.9h0.2 M1.75 0.45h0.1 M0.1 1.2h0.2 M0.8 1.75h0.15",
      stroke: "#fffdf5",
      "stroke-width": 0.14,
      "stroke-linecap": "round",
      opacity: 0.6,
    }),
  );
  return grain;
}

export function studPattern(id: string, color: string): SVGPatternElement {
  const pattern = svg("pattern", {
    id,
    width: 1,
    height: 1,
    patternUnits: "userSpaceOnUse",
    "data-stud-color": color,
  });
  pattern.append(
    svg("circle", { cx: 0.52, cy: 0.56, r: 0.31, fill: "#1b2318", opacity: 0.42 }),
    svg("circle", { cx: 0.485, cy: 0.47, r: 0.29, fill: "#fff", opacity: 0.49 }),
    svg("circle", { cx: 0.505, cy: 0.5, r: 0.235, fill: color }),
  );
  return pattern;
}

export function baseplateDrawing(
  group: SVGGElement,
  color: string,
  patternId: string,
  selected: boolean,
): void {
  const plate = { x: -16, y: -16, width: 32, height: 32, rx: 0.18 };
  group.append(
    svg("rect", {
      ...plate,
      fill: color,
      stroke: selected ? "#006f71" : "#313b32",
      "stroke-width": selected ? 0.9 : 0.42,
      "data-baseplate-face": "true",
    }),
    svg("path", {
      d: "M -15.72 15.73 H 15.73 V -15.73",
      fill: "none",
      stroke: "#1a231a",
      "stroke-width": 0.38,
      opacity: 0.38,
      "pointer-events": "none",
    }),
    svg("path", {
      d: "M -15.72 15.73 V -15.73 H 15.73",
      fill: "none",
      stroke: "#fff",
      "stroke-width": 0.35,
      opacity: 0.4,
      "pointer-events": "none",
    }),
    svg("rect", {
      ...plate,
      fill: `url(#${patternId})`,
      "pointer-events": "none",
      "data-baseplate-studs": "true",
      style: detailStyle,
    }),
  );
}

export function setSceneDetail(scene: SVGSVGElement, pixelsPerStud: number): void {
  const value = pixelsPerStud >= 3 ? "close" : "overview";
  if (scene.getAttribute("data-scene-detail") === value) return;
  scene.setAttribute("data-scene-detail", value);
  scene.style.setProperty("--track-detail", value === "close" ? "inline" : "none");
}
