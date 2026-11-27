import type { Analysis } from "./engine";
import { areaEdgeTolerance, outlineSupports } from "./area_outline";
import {
  angleGap,
  composePose,
  ensureVisibleWorkingLayer,
  joinAngle,
  projectId,
  railTolerance,
  validateProject,
  visibleTrackItems,
} from "./project";
import type { Catalog, Kit, Part, Point, Pose, Project, TrackItem } from "./project";

export type ArrangementIssue = {
  kind: "unknown-kit" | "unknown-part" | "outside-area" | "overlap" | "misaligned";
  message: string;
  itemId?: string;
};

export type PlacementWarning = {
  kind: "overlap" | "ambiguous";
  message: string;
  pieceIds: string[];
};

export type ArrangementResult = {
  ok: boolean;
  issues: ArrangementIssue[];
  removedIds: string[];
  addedIds: string[];
  candidateItems?: TrackItem[];
  project?: Project;
};

export type ArrangementRequest = {
  kitId: string;
  pose: Pose;
  /** Existing straight pieces deliberately selected for replacement. */
  replaceIds?: readonly string[];
  groupId?: string;
  /** Measured spacer pieces supplied by a fit anchor, in design-area coordinates. */
  fillers?: readonly { partId: string; pose: Pose }[];
};

type Bounds = { left: number; top: number; right: number; bottom: number };

function newId(prefix: string, index: number): string {
  return `${projectId(prefix)}-${index}`;
}

function rotate(point: Point, angle: number): Point {
  const radians = ((angle % 360) * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function footprintBounds(points: readonly Point[], pose: Pose): Bounds {
  const bounds: Bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const point of points) {
    const offset = rotate(point, pose.angle);
    bounds.left = Math.min(bounds.left, pose.x + offset.x);
    bounds.right = Math.max(bounds.right, pose.x + offset.x);
    bounds.top = Math.min(bounds.top, pose.y + offset.y);
    bounds.bottom = Math.max(bounds.bottom, pose.y + offset.y);
  }
  return bounds;
}

function overlaps(first: Bounds, second: Bounds, tolerance = 0.05): boolean {
  return (
    first.left < second.right - tolerance &&
    first.right > second.left + tolerance &&
    first.top < second.bottom - tolerance &&
    first.bottom > second.top + tolerance
  );
}

function polygon(points: readonly Point[], pose: Pose): Point[] {
  return points.map((point) => {
    const offset = rotate(point, pose.angle);
    return { x: pose.x + offset.x, y: pose.y + offset.y };
  });
}

function cross(origin: Point, first: Point, second: Point): number {
  return (
    (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x)
  );
}

function onSegment(first: Point, point: Point, second: Point): boolean {
  return (
    Math.min(first.x, second.x) < point.x - 0.05 &&
    point.x < Math.max(first.x, second.x) + 0.05 &&
    Math.min(first.y, second.y) < point.y - 0.05 &&
    point.y < Math.max(first.y, second.y) + 0.05
  );
}

function segmentsCross(first: Point, second: Point, third: Point, fourth: Point): boolean {
  const firstThird = cross(first, second, third);
  const firstFourth = cross(first, second, fourth);
  const thirdFirst = cross(third, fourth, first);
  const thirdSecond = cross(third, fourth, second);
  if (Math.abs(firstThird) < 0.05 && onSegment(first, third, second)) return true;
  if (Math.abs(firstFourth) < 0.05 && onSegment(first, fourth, second)) return true;
  if (Math.abs(thirdFirst) < 0.05 && onSegment(third, first, fourth)) return true;
  if (Math.abs(thirdSecond) < 0.05 && onSegment(third, second, fourth)) return true;
  return firstThird > 0 !== firstFourth > 0 && thirdFirst > 0 !== thirdSecond > 0;
}

function contains(points: readonly Point[], point: Point): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const first = points[index];
    const second = points[previous];
    if (!first || !second) continue;
    if (
      first.y > point.y !== second.y > point.y &&
      point.x < ((second.x - first.x) * (point.y - first.y)) / (second.y - first.y) + first.x
    )
      inside = !inside;
  }
  return inside;
}

function polygonsOverlap(first: readonly Point[], second: readonly Point[]): boolean {
  if (
    first.some((point) => contains(second, point)) ||
    second.some((point) => contains(first, point))
  )
    return true;
  return first.some((point, index) => {
    const next = first[(index + 1) % first.length];
    return Boolean(
      next &&
      second.some((other, otherIndex) => {
        const otherNext = second[(otherIndex + 1) % second.length];
        return Boolean(otherNext && segmentsCross(point, next, other, otherNext));
      }),
    );
  });
}

type RailSegment = { start: Point; end: Point; first: boolean; last: boolean; length: number };
type RailShape = {
  track: TrackItem;
  part: Part;
  bounds: Bounds;
  segments: RailSegment[];
  straightBounds?: Bounds;
};

function railSegments(part: Part, track: TrackItem): RailSegment[] {
  return part.paths.flatMap((path) => {
    const points = polygon(path, track);
    return points.flatMap((start, index) => {
      const end = points[index + 1];
      if (!end) return [];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      return length
        ? [{ start, end, length, first: index === 0, last: index === points.length - 2 }]
        : [];
    });
  });
}

function railSegmentsOverlap(
  first: RailSegment,
  second: RailSegment,
  includeEnds: boolean,
): boolean {
  const a = cross(first.start, first.end, second.start) / first.length;
  const b = cross(first.start, first.end, second.end) / first.length;
  const c = cross(second.start, second.end, first.start) / second.length;
  const d = cross(second.start, second.end, first.end) / second.length;
  if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) <= railTolerance) {
    const dx = first.end.x - first.start.x;
    const dy = first.end.y - first.start.y;
    const project = ({ x, y }: Point): number =>
      ((x - first.start.x) * dx + (y - first.start.y) * dy) / first.length;
    const start = project(second.start);
    const end = project(second.end);
    return (
      Math.min(first.length, Math.max(start, end)) - Math.max(0, Math.min(start, end)) >
      railTolerance
    );
  }
  // Molded paths can meet at their ends even where their schematic footprints touch.
  const crosses = (segment: RailSegment, start: number, end: number): boolean => {
    const crossing = (start * segment.length) / (start - end);
    return (
      crossing >= (!includeEnds && segment.first ? railTolerance : -1e-8) &&
      crossing <= segment.length + (!includeEnds && segment.last ? -railTolerance : 1e-8)
    );
  };
  return crosses(first, c, d) && crosses(second, a, b);
}

function straightBounds(part: Part): Bounds | undefined {
  const [path] = part.paths;
  if (part.paths.length !== 1 || path?.length !== 2 || path.some(({ y }) => y !== 0))
    return undefined;
  const bounds = footprintBounds(part.footprint, { x: 0, y: 0, angle: 0 });
  if (
    part.footprint.length === 4 &&
    part.footprint.every(
      ({ x, y }) =>
        (x === bounds.left || x === bounds.right) && (y === bounds.top || y === bounds.bottom),
    )
  )
    return bounds;
  return undefined;
}

function isOrdinaryCurve(part: Part): boolean {
  return (
    part.radius !== undefined &&
    part.paths.length === 1 &&
    part.ports.length === 2 &&
    part.ports.every(({ type }) => type === "regular")
  );
}

function alignedFootprint(shape: RailShape, frame: TrackItem, angle: number): Bounds {
  const offset = rotate({ x: shape.track.x - frame.x, y: shape.track.y - frame.y }, -frame.angle);
  return footprintBounds(shape.part.footprint, { ...offset, angle });
}

function railShapesOverlap(first: RailShape, second: RailShape, catalog: Catalog): boolean {
  const { straightBounds } = first;
  const { straightBounds: secondStraightBounds } = second;
  const bothStraight = straightBounds !== undefined && secondStraightBounds !== undefined;
  if (bothStraight) {
    if (joinsAtRailEnd(first.track, second.track, catalog)) return false;
    const angle = (second.track.angle % 360) - (first.track.angle % 360);
    const gap = angleGap(0, angle);
    const secondInFirst = alignedFootprint(second, first.track, angle);
    if (Math.min(gap, 180 - gap) <= 1e-6) return overlaps(straightBounds, secondInFirst);

    // shortcut: Allow half a stud of angled bed intrusion until footprints model molded corners.
    const angledBedTolerance = 0.5;
    if (
      overlaps(straightBounds, secondInFirst, angledBedTolerance) &&
      overlaps(
        secondStraightBounds,
        alignedFootprint(first, second.track, -angle),
        angledBedTolerance,
      )
    )
      return true;
  }
  if (
    first.segments.some((left) =>
      second.segments.some((right) => railSegmentsOverlap(left, right, bothStraight)),
    )
  )
    return true;
  return (
    !bothStraight &&
    (straightBounds !== undefined || isOrdinaryCurve(first.part)) &&
    (second.straightBounds !== undefined || isOrdinaryCurve(second.part)) &&
    !joinsAtRailEnd(first.track, second.track, catalog) &&
    polygonsOverlap(
      polygon(first.part.footprint, first.track),
      polygon(second.part.footprint, second.track),
    )
  );
}

function railOverlapWarnings(project: Project, catalog: Catalog): PlacementWarning[] {
  const items = visibleTrackItems(project);
  if (items.length < 2) return [];
  const parts = new Map(catalog.parts.map((part) => [part.id, part]));
  const shapes = items.flatMap((track): RailShape[] => {
    const part = parts.get(track.partId);
    return part?.paths.length
      ? [
          {
            track,
            part,
            bounds: footprintBounds(part.footprint, track),
            segments: railSegments(part, track),
            straightBounds: straightBounds(part),
          },
        ]
      : [];
  });
  const left = (shape: RailShape): number => shape.bounds.left;
  const top = (shape: RailShape): number => shape.bounds.top;
  const extent = (coordinate: (shape: RailShape) => number): number => {
    let min = Infinity;
    let max = -Infinity;
    for (const shape of shapes) {
      min = Math.min(min, coordinate(shape));
      max = Math.max(max, coordinate(shape));
    }
    return max - min;
  };
  const vertical = extent(top) > extent(left);
  const start = vertical ? top : left;
  shapes.sort((a, b) => start(a) - start(b));
  const warned = new Set<string>();
  const warnings: PlacementWarning[] = [];
  // shortcut: Use routed paths for molded parts and adapters until footprints model valid kit contacts.
  for (const [index, first] of shapes.entries()) {
    const firstId = first.track.id;
    const end = vertical ? first.bounds.bottom : first.bounds.right;
    for (let next = index + 1; next < shapes.length; next++) {
      const second = shapes[next];
      if (!second || start(second) > end) break;
      const secondId = second.track.id;
      if (warned.has(firstId) && warned.has(secondId)) continue;
      if (overlaps(first.bounds, second.bounds) && railShapesOverlap(first, second, catalog)) {
        warned.add(firstId);
        warned.add(secondId);
        warnings.push({
          kind: "overlap",
          message: `${first.part.name} overlaps ${second.part.name}. Move or remove one piece.`,
          pieceIds: [firstId, secondId],
        });
        if (warned.size === shapes.length) return warnings;
      }
    }
  }
  return warnings;
}

function railPortsAlign(first: Pose, second: Pose): boolean {
  return (
    Math.hypot(first.x - second.x, first.y - second.y) <= railTolerance &&
    angleGap(first.angle, second.angle + 180) <= joinAngle
  );
}

/** Evaluate the current track placement, including files and undo snapshots. */
export function placementWarnings(analysis: Analysis, catalog: Catalog): PlacementWarning[] {
  const warnings = railOverlapWarnings(analysis.project, catalog);

  const ambiguousPieces = new Set<string>();
  for (const port of analysis.ports) {
    if (!port.ambiguous) continue;
    ambiguousPieces.add(port.pieceId);
  }
  for (const pieceId of ambiguousPieces)
    warnings.push({
      kind: "ambiguous",
      message: "More than one rail end competes for this joint. Move or remove one piece.",
      pieceIds: [pieceId],
    });
  return warnings;
}

function tracksForKit(
  catalog: Catalog,
  kit: Kit,
  request: ArrangementRequest,
  layerId: string,
): { tracks: TrackItem[]; issues: ArrangementIssue[] } {
  const issues: ArrangementIssue[] = [];
  const tracks: TrackItem[] = [];
  // A kit id describes a recipe; this id describes one installed instance.
  const installationId = request.groupId ?? newId("arrangement", -1);
  for (const [index, local] of kit.parts.entries()) {
    if (!catalog.parts.some(({ id }) => id === local.partId)) {
      issues.push({
        kind: "unknown-part",
        message: `${kit.name} requires unknown part ${local.partId}.`,
      });
      continue;
    }
    const pose = composePose(local, request.pose);
    tracks.push({
      id: newId("arrangement", index),
      kind: "track",
      layerId,
      partId: local.partId,
      groupId: installationId,
      arrangementId: kit.id,
      ...pose,
    });
  }
  for (const [index, filler] of (request.fillers ?? []).entries()) {
    if (!catalog.parts.some(({ id }) => id === filler.partId)) {
      issues.push({
        kind: "unknown-part",
        message: `${kit.name} requires unknown filler ${filler.partId}.`,
      });
      continue;
    }
    tracks.push({
      id: newId("arrangement-filler", index),
      kind: "track",
      layerId,
      partId: filler.partId,
      groupId: installationId,
      arrangementId: kit.id,
      ...filler.pose,
    });
  }
  return { tracks, issues };
}

function regularPorts(
  track: TrackItem,
  catalog: Catalog,
): { id: string; x: number; y: number; angle: number }[] {
  const part = catalog.parts.find(({ id }) => id === track.partId);
  return (
    part?.ports
      .filter(({ type }) => type === "regular")
      .map((port) => ({ ...composePose(port, track), id: port.id })) ?? []
  );
}

function railEndsAlign(first: TrackItem, second: TrackItem, catalog: Catalog): boolean {
  const rightPorts = regularPorts(second, catalog);
  return regularPorts(first, catalog).some((left) =>
    rightPorts.some((right) => railPortsAlign(left, right)),
  );
}

/** A molded turnout may extend about a stud beyond its rail connector. That
 * small footprint overlap is valid only when two real regular rail ports mate. */
function joinsAtRailEnd(first: TrackItem, second: TrackItem, catalog: Catalog): boolean {
  return railEndsAlign(first, second, catalog);
}

function replacementBoundaryIssues(
  project: Project,
  catalog: Catalog,
  replacement: ReadonlySet<string>,
  tracks: readonly TrackItem[],
): ArrangementIssue[] {
  const removed = visibleTrackItems(project).filter((item) => replacement.has(item.id));
  const surviving = visibleTrackItems(project).filter((item) => !replacement.has(item.id));
  const issues: ArrangementIssue[] = [];
  for (const old of removed) {
    const oldPorts = regularPorts(old, catalog);
    for (const survivor of surviving) {
      const survivorPorts = regularPorts(survivor, catalog);
      for (const oldPort of oldPorts) {
        const wasJoined = survivorPorts.some(
          (survivorPort) =>
            Math.hypot(oldPort.x - survivorPort.x, oldPort.y - survivorPort.y) <= 0.05 &&
            angleGap(oldPort.angle, survivorPort.angle + 180) <= 0.25,
        );
        if (!wasJoined) continue;
        const replacementAtOriginalPort = tracks.some((track) =>
          regularPorts(track, catalog).some(
            (candidatePort) =>
              Math.hypot(candidatePort.x - oldPort.x, candidatePort.y - oldPort.y) <= 0.05 &&
              angleGap(candidatePort.angle, oldPort.angle) <= 0.25,
          ),
        );
        if (!replacementAtOriginalPort) {
          issues.push({
            kind: "misaligned",
            itemId: old.id,
            message: `Replacing ${old.id} would break its existing rail joint.`,
          });
        }
      }
    }
  }
  return issues;
}

function physicalTrackIssues(
  project: Project,
  catalog: Catalog,
  replacement: ReadonlySet<string>,
  tracks: readonly TrackItem[],
  label: (part: { name: string }) => string,
): ArrangementIssue[] {
  const issues: ArrangementIssue[] = [];
  const existing = visibleTrackItems(project).filter((item) => !replacement.has(item.id));
  for (const track of tracks) {
    const part = catalog.parts.find(({ id }) => id === track.partId);
    if (!part) {
      issues.push({
        kind: "unknown-part",
        itemId: track.id,
        message: `Unknown part ${track.partId}.`,
      });
      continue;
    }
    const bounds = footprintBounds(part.footprint, track);
    const fits = project.area.outline
      ? outlineSupports(
          project.area,
          part.footprint.map((point) => composePose({ ...point, angle: 0 }, track)),
        )
      : bounds.left >= -areaEdgeTolerance &&
        bounds.top >= -areaEdgeTolerance &&
        bounds.right <= project.area.width + areaEdgeTolerance &&
        bounds.bottom <= project.area.depth + areaEdgeTolerance;
    if (!fits) {
      issues.push({
        kind: "outside-area",
        itemId: track.id,
        message: `${part.name} extends outside the design area.`,
      });
    }
    for (const placed of existing) {
      const placedPart = catalog.parts.find(({ id }) => id === placed.partId);
      if (!placedPart) continue;
      const placedBounds = footprintBounds(placedPart.footprint, placed);
      if (
        overlaps(bounds, placedBounds) &&
        polygonsOverlap(polygon(part.footprint, track), polygon(placedPart.footprint, placed)) &&
        !joinsAtRailEnd(track, placed, catalog)
      ) {
        issues.push({
          kind: "overlap",
          itemId: placed.id,
          message: `${label(part)} overlaps ${placedPart.name}.`,
        });
      }
    }
  }
  issues.push(...replacementBoundaryIssues(project, catalog, replacement, tracks));
  return issues;
}

/**
 * Validate a complete, measured kit before modifying the project.  Arrangement
 * parts are expanded into their physical track pieces so inventory stays honest.
 */
export function previewArrangement(
  project: Project,
  catalog: Catalog,
  request: ArrangementRequest,
): ArrangementResult {
  const kit = catalog.kits.find(({ id }) => id === request.kitId);
  if (!kit) {
    return {
      ok: false,
      issues: [{ kind: "unknown-kit", message: `Unknown arrangement ${request.kitId}.` }],
      removedIds: [],
      addedIds: [],
      candidateItems: [],
    };
  }
  const working = ensureVisibleWorkingLayer(project);
  const { tracks, issues } = tracksForKit(catalog, kit, request, working.layerId);
  const visibleIds = new Set(visibleTrackItems(working.project).map((item) => item.id));
  const replacement = new Set((request.replaceIds ?? []).filter((id) => visibleIds.has(id)));
  issues.push(
    ...physicalTrackIssues(working.project, catalog, replacement, tracks, () => kit.name),
  );
  return {
    ok: issues.length === 0,
    issues,
    removedIds: [...replacement],
    addedIds: tracks.map(({ id }) => id),
    candidateItems: tracks,
    project: issues.length ? undefined : replace(working.project, replacement, tracks),
  };
}

/** Commit only a preview that still fits, which keeps failed template drops atomic. */
export function commitArrangement(
  project: Project,
  catalog: Catalog,
  request: ArrangementRequest,
): ArrangementResult {
  return previewArrangement(project, catalog, request);
}

/**
 * Parking builders can use this without inventing a kit.  Their supplied items
 * receive the same area and collision checks as a catalog arrangement.
 */
export function commitItems(
  project: Project,
  catalog: Catalog,
  request: { items: readonly TrackItem[]; replaceIds?: readonly string[] },
): ArrangementResult {
  const working = ensureVisibleWorkingLayer(project);
  const visibleIds = new Set(visibleTrackItems(working.project).map((item) => item.id));
  const replacement = new Set((request.replaceIds ?? []).filter((id) => visibleIds.has(id)));
  const tracks = itemsOnVisibleLayers(working.project, working.layerId, request.items);
  const issues = physicalTrackIssues(
    working.project,
    catalog,
    replacement,
    tracks,
    (part) => part.name,
  );
  return {
    ok: issues.length === 0,
    issues,
    removedIds: [...replacement],
    addedIds: tracks.map(({ id }) => id),
    candidateItems: tracks,
    project: issues.length ? undefined : replace(working.project, replacement, tracks),
  };
}

function itemsOnVisibleLayers(
  project: Project,
  layerId: string,
  items: readonly TrackItem[],
): TrackItem[] {
  const visible = new Set(project.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  return items.map((item) => (visible.has(item.layerId) ? item : { ...item, layerId }));
}

/** Append freely placed track while preserving the project format and layer limits. */
export function placeItems(project: Project, items: readonly TrackItem[]): Project {
  const working = ensureVisibleWorkingLayer(project);
  const placed = {
    ...working.project,
    items: [
      ...working.project.items,
      ...itemsOnVisibleLayers(working.project, working.layerId, items),
    ],
  };
  validateProject(placed);
  return placed;
}

function replace(
  project: Project,
  replacement: ReadonlySet<string>,
  tracks: readonly TrackItem[],
): Project {
  return {
    ...project,
    items: [...project.items.filter((item) => !replacement.has(item.id)), ...tracks],
  };
}
