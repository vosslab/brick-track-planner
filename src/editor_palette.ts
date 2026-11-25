import { action, element, input, select, textNode } from "./editor_dom";
import type { Catalog, Part } from "./project";

const svgNS = "http://www.w3.org/2000/svg";

function swatch(part?: Part): SVGSVGElement {
  const icon = document.createElementNS(svgNS, "svg");
  icon.setAttribute("aria-hidden", "true");
  if (!part) {
    icon.setAttribute("viewBox", "0 0 34 26");
    for (const [x, y] of [
      [4, 8],
      [12, 3],
      [20, 8],
    ]) {
      const block = document.createElementNS(svgNS, "rect");
      block.setAttribute("x", String(x));
      block.setAttribute("y", String(y));
      block.setAttribute("width", "10");
      block.setAttribute("height", "12");
      block.setAttribute("rx", "2");
      block.setAttribute("fill", "#e7f0e8");
      block.setAttribute("stroke", "currentColor");
      icon.append(block);
    }
    return icon;
  }
  const paths = part.paths.length
    ? part.paths
    : [[...part.footprint, ...part.footprint.slice(0, 1)]];
  const points = paths.flat();
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  const margin = Math.max(1, width * 0.13, height * 0.13);
  icon.setAttribute(
    "viewBox",
    `${x - margin} ${y - margin} ${width + 2 * margin} ${height + 2 * margin}`,
  );
  for (const path of paths) {
    const line = document.createElementNS(svgNS, "polyline");
    line.setAttribute("points", path.map(({ x, y }) => `${x},${y}`).join(" "));
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    line.setAttribute("stroke-width", "2.5");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("fill", "none");
    icon.append(line);
  }
  return icon;
}

export type Placement = { id: string; name: string; kind: "part" | "kit"; angle: number };

export function renderPalette(
  catalog: Catalog,
  placedId: string | undefined,
  pick: (part: Placement) => void,
): void {
  const search = input("part-search").value.trim().toLowerCase();
  const brandFilter = select("brand-filter").value;
  const options = [
    ...catalog.parts.map((part) => ({ part, ...part, kind: "part" as const })),
    ...catalog.kits.map((kit) => ({ part: undefined, ...kit, kind: "kit" as const })),
  ];
  const rows = options
    .filter(({ id, name, brand }) => {
      return (
        (!brandFilter || brandFilter === brand) &&
        `${brand} ${name} ${id}`.toLowerCase().includes(search)
      );
    })
    .map(({ id, name, brand, kind, part }) => {
      const row = action("", () => pick({ id, name, kind, angle: 0 }));
      row.className = "part-choice";
      row.dataset[kind === "part" ? "partId" : "kitId"] = id;
      row.setAttribute("aria-pressed", String(placedId === id));
      const label = document.createElement("span");
      label.append(name, textNode("small", kind === "kit" ? `${brand} kit` : brand));
      row.append(swatch(part), label);
      return row;
    });
  element("parts-list").replaceChildren(
    ...(rows.length ? rows : [textNode("p", "No matching track.")]),
  );
}

export function setupPalette(catalog: Catalog, render: () => void): void {
  const filter = select("brand-filter");
  const brands = new Set(catalog.parts.map(({ brand }) => brand));
  for (const brand of brands) filter.add(new Option(brand, brand));
  filter.addEventListener("change", render);
  input("part-search").addEventListener("input", render);
}
