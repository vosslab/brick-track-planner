import type { DesignArea, Edge, Point } from "./project";

export const maxOutlineVertices = 256;
export const areaEdgeTolerance = 0.05;
const outward: Record<Edge, Point> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

export function outlineOf(area: DesignArea): readonly Point[] {
  return (
    area.outline ?? [
      { x: 0, y: 0 },
      { x: area.width, y: 0 },
      { x: area.width, y: area.depth },
      { x: 0, y: area.depth },
    ]
  );
}

export function outlineBounds(points: readonly Point[]): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: Math.min(...points.map(({ x }) => x)),
    right: Math.max(...points.map(({ x }) => x)),
    top: Math.min(...points.map(({ y }) => y)),
    bottom: Math.max(...points.map(({ y }) => y)),
  };
}

export function horizontalEdge(edge: Edge): boolean {
  return edge === "north" || edge === "south";
}

export function edgeCoordinate(point: Point, edge: Edge): number {
  return horizontalEdge(edge) ? point.y : point.x;
}

export function moveEdgePoint({ x, y }: Point, edge: Edge, distance: number): Point {
  const direction = outward[edge];
  return { x: x + distance * direction.x, y: y + distance * direction.y };
}

export function frontCoordinate(area: DesignArea, edge: Edge): number {
  const stored = area.frontLines?.[edge];
  if (stored !== undefined) return stored;
  const { left, right, top, bottom } = outlineBounds(outlineOf(area));
  return { north: top, east: right, south: bottom, west: left }[edge];
}

export type OutlineEdge = { side: Edge; start: Point; end: Point };
type EdgeSpan = { offset: number; length: number };

export function outlineEdges(points: readonly Point[]): OutlineEdge[] {
  return points.map((start, index) => {
    const end = points[(index + 1) % points.length]!;
    const side =
      start.y === end.y ? (start.x < end.x ? "north" : "south") : start.y < end.y ? "east" : "west";
    return { side, start, end };
  });
}

function onOutlineEdge(point: Point, { start, end }: OutlineEdge, tolerance: number): boolean {
  return (
    point.x >= Math.min(start.x, end.x) - tolerance &&
    point.x <= Math.max(start.x, end.x) + tolerance &&
    point.y >= Math.min(start.y, end.y) - tolerance &&
    point.y <= Math.max(start.y, end.y) + tolerance
  );
}

export function validOutline(points: readonly Point[]): boolean {
  if (points.length < 4 || points.length > maxOutlineVertices) return false;
  const edges = outlineEdges(points);
  let area = 0;
  for (const [index, { start, end }] of edges.entries()) {
    const horizontal = start.y === end.y;
    const next = edges[(index + 1) % edges.length]!.end;
    if (horizontal === (start.x === end.x) || horizontal === (end.y === next.y)) return false;
    area += (start.x - end.x) * (start.y + end.y);
    for (let other = index + 2; other < edges.length - (index === 0 ? 1 : 0); other++) {
      const edge = edges[other]!;
      if (
        Math.max(Math.min(start.x, end.x), Math.min(edge.start.x, edge.end.x)) <=
          Math.min(Math.max(start.x, end.x), Math.max(edge.start.x, edge.end.x)) &&
        Math.max(Math.min(start.y, end.y), Math.min(edge.start.y, edge.end.y)) <=
          Math.min(Math.max(start.y, end.y), Math.max(edge.start.y, edge.end.y))
      )
        return false;
    }
  }
  return area > 0;
}

function simplifyOutline(points: Point[]): Point[] {
  for (let index = 0; points.length > 2 && index < points.length;) {
    const before = points[(index + points.length - 1) % points.length]!;
    const point = points[index]!;
    const after = points[(index + 1) % points.length]!;
    if (
      (before.x === point.x && point.x === after.x) ||
      (before.y === point.y && point.y === after.y) ||
      (before.x === point.x && before.y === point.y)
    ) {
      points.splice(index, 1);
      index = index === points.length ? 0 : Math.max(0, index - 1);
    } else index++;
  }
  return points;
}

function edgeRange({ side, start, end }: OutlineEdge): [number, number] {
  const axis = horizontalEdge(side) ? "x" : "y";
  return [Math.min(start[axis], end[axis]), Math.max(start[axis], end[axis])];
}

function spanRange(edge: OutlineEdge, span?: EdgeSpan): [number, number] {
  const [low, high] = edgeRange(edge);
  const from = span ? low + span.offset : low;
  const to = span ? from + span.length : high;
  if (!(from >= low && to <= high && from < to))
    throw new Error("Enter a span that fits on the selected edge.");
  return [from, to];
}

export function moveOutlineEdge(
  area: DesignArea,
  edgeIndex: number,
  distance: number,
  span?: EdgeSpan,
): DesignArea {
  const points = outlineOf(area);
  const edge = outlineEdges(points)[edgeIndex]!;
  const { side, start, end } = edge;
  const axis = horizontalEdge(side) ? "x" : "y";
  const [from, to] = spanRange(edge, span);
  if (!Number.isSafeInteger(distance) || distance === 0)
    throw new Error("Enter a distance of at least one stud.");
  const first = { ...start, [axis]: start[axis] < end[axis] ? from : to };
  const last = { ...end, [axis]: start[axis] < end[axis] ? to : from };
  const shifted = (point: Point): Point => moveEdgePoint(point, side, distance);
  const outline = simplifyOutline([
    ...points.slice(0, edgeIndex + 1),
    first,
    shifted(first),
    shifted(last),
    last,
    ...points.slice(edgeIndex + 1),
  ]);
  if (!validOutline(outline))
    throw new Error("This change crosses another edge or leaves no continuous table.");
  const updatedEdges = outlineEdges(outline);
  const frontLines: DesignArea["frontLines"] = {};
  for (const front of area.fronts) {
    const line = frontCoordinate(area, front);
    const oldLineRemains = updatedEdges.some(
      (edge) => edge.side === front && edgeCoordinate(edge.start, front) === line,
    );
    if (oldLineRemains) {
      frontLines[front] = line;
      continue;
    }
    const movedLine =
      side === front && edgeCoordinate(start, side) === line
        ? edgeCoordinate(shifted(start), side)
        : line;
    const nearest = updatedEdges
      .filter(({ side }) => side === front)
      .map(({ start }) => edgeCoordinate(start, front))
      .sort((a, b) => Math.abs(a - movedLine) - Math.abs(b - movedLine))[0]!;
    frontLines[front] = nearest;
  }
  const { left, top, right, bottom } = outlineBounds(outline);
  return {
    ...area,
    width: right - left,
    depth: bottom - top,
    outline,
    ...(area.fronts.length ? { frontLines } : {}),
  };
}

// Shift both boundaries of the same strip so the table keeps its original depth.
export function shiftOutlineSpan(
  area: DesignArea,
  index: number,
  distance: number,
  span: EdgeSpan,
): DesignArea {
  const edges = outlineEdges(outlineOf(area));
  const edge = edges[index]!;
  const { side, start } = edge;
  const [from, to] = spanRange(edge, span);
  const coordinate = edgeCoordinate(start, side);
  const direction = edgeCoordinate(outward[side], side);
  const opposite = edges
    .filter((candidate) => horizontalEdge(candidate.side) === horizontalEdge(side))
    .map((candidate) => ({
      candidate,
      depth: (coordinate - edgeCoordinate(candidate.start, side)) * direction,
    }))
    .filter(({ candidate, depth }) => {
      const [low, high] = edgeRange(candidate);
      return depth > 0 && low < to && high > from;
    })
    .sort((a, b) => a.depth - b.depth)[0]?.candidate;
  const coversSpan = (candidate: OutlineEdge): boolean => {
    const [low, high] = edgeRange(candidate);
    return low <= from && to <= high;
  };
  if (!opposite || opposite.side === side || !coversSpan(opposite))
    throw new Error("Choose a shorter span with one continuous edge directly opposite it.");
  const oppositeCoordinate = edgeCoordinate(opposite.start, opposite.side);
  const oppositeIndex = edges.indexOf(opposite);
  const extendFirst = distance > 0;
  const first = extendFirst ? { edge, index } : { edge: opposite, index: oppositeIndex };
  const second = extendFirst ? opposite : edge;
  const secondCoordinate = extendFirst ? oppositeCoordinate : coordinate;
  const extended = moveOutlineEdge(area, first.index, Math.abs(distance), {
    offset: from - edgeRange(first.edge)[0],
    length: span.length,
  });
  const extendedEdges = outlineEdges(outlineOf(extended));
  const remaining = extendedEdges.findIndex(
    (candidate) =>
      candidate.side === second.side &&
      edgeCoordinate(candidate.start, second.side) === secondCoordinate &&
      coversSpan(candidate),
  );
  if (remaining < 0) throw new Error("Choose a span clear of other table edges.");
  return moveOutlineEdge(extended, remaining, -Math.abs(distance), {
    offset: from - edgeRange(extendedEdges[remaining]!)[0],
    length: span.length,
  });
}

function supported(point: Point, edges: readonly OutlineEdge[]): boolean {
  let inside = false;
  for (const edge of edges) {
    if (onOutlineEdge(point, edge, areaEdgeTolerance)) return true;
    const { start, end } = edge;
    if (start.y > point.y !== end.y > point.y && start.x > point.x) inside = !inside;
  }
  return inside;
}

export function areaCenter(area: DesignArea): Point {
  const points = outlineOf(area);
  const { left, right, top, bottom } = outlineBounds(points);
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  if (!area.outline) return center;
  const edges = outlineEdges(points);
  if (supported(center, edges)) return center;
  const levels = [...new Set(points.map(({ y }) => y))].sort((a, b) => a - b);
  let largest = 0;
  let result = center;
  for (const [index, low] of levels.slice(0, -1).entries()) {
    const high = levels[index + 1]!;
    const y = (low + high) / 2;
    const crossings = edges
      .filter(({ start, end }) => start.y > y !== end.y > y)
      .map(({ start }) => start.x)
      .sort((a, b) => a - b);
    for (let index = 0; index < crossings.length; index += 2) {
      const left = crossings[index]!;
      const right = crossings[index + 1]!;
      const size = (right - left) * (high - low);
      if (size <= largest) continue;
      largest = size;
      result = { x: (left + right) / 2, y };
    }
  }
  return result;
}

/** Check entire part edges, including segments that bridge a notch between supported vertices. */
export function outlineSupports(area: DesignArea, footprint: readonly Point[]): boolean {
  const outline = outlineOf(area);
  const bounds = outlineBounds(outline);
  const part = outlineBounds(footprint);
  const tolerance = areaEdgeTolerance;
  if (
    part.left < bounds.left - tolerance ||
    part.top < bounds.top - tolerance ||
    part.right > bounds.right + tolerance ||
    part.bottom > bounds.bottom + tolerance
  )
    return false;
  if (!area.outline) return true;
  const edges = outlineEdges(outline);
  const xBreaks = new Set(outline.flatMap(({ x }) => [x - tolerance, x, x + tolerance]));
  const yBreaks = new Set(outline.flatMap(({ y }) => [y - tolerance, y, y + tolerance]));
  return footprint.every((start, index) => {
    if (!supported(start, edges)) return false;
    const end = footprint[(index + 1) % footprint.length]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const stops = [
      ...(dx ? [...xBreaks].map((x) => (x - start.x) / dx) : []),
      ...(dy ? [...yBreaks].map((y) => (y - start.y) / dy) : []),
    ]
      .filter((t) => t > 0 && t < 1)
      .sort((a, b) => a - b);
    return [0, ...stops].every((t, index) => {
      const middle = (t + (stops[index] ?? 1)) / 2;
      return supported({ x: start.x + middle * dx, y: start.y + middle * dy }, edges);
    });
  });
}
