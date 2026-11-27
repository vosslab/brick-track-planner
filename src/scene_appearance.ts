import trackArtwork from "../data/ldraw/track_artwork.json" with { type: "json" };
import type { Catalog, TrackItem } from "./project";
import { detailStyle, offsetRail, pathData, sleepers, svg, trackRailOffset } from "./scene_drawing";
import { codedTrackDrawing } from "./scene_track_colors";

type Part = Catalog["parts"][number];
type Ballast = NonNullable<TrackItem["ballast"]>;

type PartGeometry = {
  route: string;
  rails: string;
  ties: string;
  footprint: string;
};

const geometries = new WeakMap<Part, PartGeometry>();
const modelDrawings = new Map<string, Readonly<Record<string, string>>>(
  Object.entries(trackArtwork),
);

export function partGeometry(part: Part): PartGeometry {
  let geometry = geometries.get(part);
  if (!geometry) {
    geometry = {
      route: part.paths.map((route) => pathData(route)).join(" "),
      rails: part.paths
        .flatMap((route) =>
          [-trackRailOffset, trackRailOffset].map((offset) =>
            pathData(offsetRail(route, offset, part.ports)),
          ),
        )
        .join(" "),
      ties: part.paths
        .flatMap((route) => sleepers(route))
        .map((sleeper) => pathData([sleeper.left, sleeper.right]))
        .join(" "),
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
  const artwork = modelDrawings.get(part.id);
  const schematic = svg("g", {
    style: artwork ? "display: var(--track-compact, inline)" : "",
    "pointer-events": "none",
  });
  schematic.append(
    svg("use", {
      href: `#${id}-route`,
      style: "display: var(--track-compact, inline); stroke: var(--track-bed, #93948f)",
      "stroke-width": 7.5,
    }),
    svg("path", {
      d: geometry.ties,
      "stroke-width": 1.4,
      style: "display: var(--track-sleepers, none); stroke: var(--track-rail, #2d302e)",
    }),
    svg("path", {
      d: geometry.ties,
      "stroke-width": 0.95,
      style: "display: var(--track-sleepers, none); stroke: var(--track-tie, #858882)",
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
  shape.append(svg("path", { d: geometry.footprint, fill: "transparent" }), schematic);
  if (artwork) {
    const model = svg("g", {
      "data-track-model": part.id,
      "fill-rule": "evenodd",
      "pointer-events": "none",
      style: "display: var(--track-sleepers, none)",
    });
    // The silhouette under the visible faces keeps adjoining colors from revealing the grid.
    const tones = [
      ["outline", 20],
      ["bevel", 26],
      ["body", 34],
      ["middle", 44],
      ["top", 58],
      ["gold-edge", "#ac7d21"],
      ["gold", "#f5ce40"],
    ] as const;
    for (const [tone, lightness] of tones) {
      const drawing = artwork[tone];
      if (!drawing) continue;
      const fill =
        typeof lightness === "string"
          ? lightness
          : `hsl(var(--track-plastic, 215 8%) ${lightness}%)`;
      model.append(
        svg("path", {
          d: drawing,
          style: `fill: ${fill}${tone === "outline" ? `; stroke: ${fill}; stroke-width: .13` : ""}`,
        }),
      );
    }
    shape.append(model);
  }
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
  trackColors: boolean,
): void {
  const ballast = item.ballast ?? "bare";
  group.setAttribute("data-ballast", ballast);

  if (selected) {
    group.setAttribute(
      "style",
      "--track-bed:#b5dfd9; --track-rail:#006064; --track-tie:#45847c; --track-plastic:174 66%",
    );
  }

  const hasRails = part.paths.length > 0;
  const routeHref = `#${hasRails ? `${id}-route` : id}`;
  if (!trackColors && hasRails && ballast !== "bare") {
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
  let codeLabel: SVGTextElement | undefined;
  if (trackColors && hasRails) {
    group.append(svg("path", { d: partGeometry(part).footprint, fill: "transparent" }));
    codeLabel = codedTrackDrawing(group, routeHref, item, part, selected);
  } else {
    group.append(svg("use", { href: `#${id}` }));
  }

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
  if (codeLabel) group.append(codeLabel);
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

export function setSceneDetail(scene: SVGSVGElement, pixelsPerStud: number): void {
  if (scene.getAttribute("data-track-view") === "coded") {
    scene.style.setProperty("--track-code-short-labels", pixelsPerStud >= 6 ? "inline" : "none");
  }
  const value = pixelsPerStud >= 3 ? "close" : pixelsPerStud >= 1 ? "overview" : "thumbnail";
  if (scene.getAttribute("data-scene-detail") === value) return;
  scene.setAttribute("data-scene-detail", value);
  scene.style.setProperty("--track-compact", value === "thumbnail" ? "inline" : "none");
  scene.style.setProperty("--track-sleepers", value === "thumbnail" ? "none" : "inline");
  scene.style.setProperty("--track-detail", value === "close" ? "inline" : "none");
}
