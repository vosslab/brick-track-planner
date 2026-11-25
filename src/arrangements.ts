import {
  angleGap,
  composePose,
  ensureVisibleWorkingLayer,
  projectId,
  visibleTrackItems,
} from "./project";
import type { Catalog, Kit, Point, Pose, Project, TrackItem } from "./project";

export type ArrangementIssue = {
  kind: "unknown-kit" | "unknown-part" | "outside-area" | "overlap" | "misaligned";
  message: string;
  itemId?: string;
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
  heightPlates?: number;
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
  const radians = (angle * Math.PI) / 180;
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

function overlaps(first: Bounds, second: Bounds): boolean {
  return (
    first.left < second.right - 0.05 &&
    first.right > second.left + 0.05 &&
    first.top < second.bottom - 0.05 &&
    first.bottom > second.top + 0.05
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
      heightPlates: request.heightPlates ?? 0,
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
      heightPlates: request.heightPlates ?? 0,
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

/** A molded turnout may extend about a stud beyond its rail connector. That
 * small footprint overlap is valid only when two real regular rail ports mate. */
function joinsAtRailEnd(first: TrackItem, second: TrackItem, catalog: Catalog): boolean {
  if (first.heightPlates !== second.heightPlates) return false;
  return regularPorts(first, catalog).some((left) =>
    regularPorts(second, catalog).some(
      (right) =>
        Math.hypot(left.x - right.x, left.y - right.y) <= 0.05 &&
        angleGap(left.angle, right.angle + 180) <= 0.25,
    ),
  );
}

function endpoint(
  project: Project,
  catalog: Catalog,
  pieceId: string,
  portId: string,
): { x: number; y: number; angle: number; height: number } | undefined {
  const item = project.items.find(
    (entry): entry is TrackItem => entry.kind === "track" && entry.id === pieceId,
  );
  const port =
    item &&
    catalog.parts.find(({ id }) => id === item.partId)?.ports.find(({ id }) => id === portId);
  return item && port ? { ...composePose(port, item), height: item.heightPlates } : undefined;
}

function rebindEndpoint(
  old: { x: number; y: number; angle: number; height: number },
  tracks: readonly TrackItem[],
  catalog: Catalog,
): { pieceId: string; portId: string } | undefined {
  const candidates = tracks
    .flatMap((track) => {
      const piece = catalog.parts.find(({ id }) => id === track.partId);
      return (
        piece?.ports
          .filter(({ type }) => type === "regular")
          .map((port) => ({ track, port, pose: composePose(port, track) })) ?? []
      );
    })
    .filter(({ track }) => track.heightPlates === old.height)
    .map((candidate) => ({
      ...candidate,
      distance: Math.hypot(candidate.pose.x - old.x, candidate.pose.y - old.y),
      angle: angleGap(candidate.pose.angle, old.angle),
    }))
    .filter(({ distance, angle }) => distance <= 0.05 && angle <= 0.25)
    .sort((first, second) => first.distance - second.distance || first.angle - second.angle);
  const candidate = candidates[0];
  return candidate && { pieceId: candidate.track.id, portId: candidate.port.id };
}

function protectedExitIssues(
  project: Project,
  catalog: Catalog,
  replacement: ReadonlySet<string>,
  tracks: readonly TrackItem[],
): ArrangementIssue[] {
  const issues: ArrangementIssue[] = [];
  for (const exit of project.area.exits) {
    for (const endpointRef of [exit.outer, exit.inner]) {
      if (!replacement.has(endpointRef.pieceId)) continue;
      const old = endpoint(project, catalog, endpointRef.pieceId, endpointRef.portId);
      if (!old || !rebindEndpoint(old, tracks, catalog))
        issues.push({
          kind: "misaligned",
          itemId: endpointRef.pieceId,
          message: `This placement would disconnect protected handoff ${exit.id}.`,
        });
    }
  }
  return issues;
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
        const replacementAtOriginalPort = tracks.some(
          (track) =>
            track.heightPlates === old.heightPlates &&
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
    if (
      bounds.left < -0.05 ||
      bounds.top < -0.05 ||
      bounds.right > project.area.width + 0.05 ||
      bounds.bottom > project.area.depth + 0.05
    ) {
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
          message: `${label(part)} overlaps ${placedPart.name}. Select it as a replacement or move the arrangement.`,
        });
      }
    }
  }
  issues.push(...protectedExitIssues(project, catalog, replacement, tracks));
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
    project: issues.length ? undefined : replace(working.project, catalog, replacement, tracks),
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
  const visibleLayers = new Set(
    working.project.layers.filter((layer) => layer.visible).map((layer) => layer.id),
  );
  const tracks = request.items.map((item) =>
    visibleLayers.has(item.layerId) ? item : { ...item, layerId: working.layerId },
  );
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
    project: issues.length ? undefined : replace(working.project, catalog, replacement, tracks),
  };
}

function replace(
  project: Project,
  catalog: Catalog,
  replacement: ReadonlySet<string>,
  tracks: readonly TrackItem[],
): Project {
  const exits = project.area.exits.map((exit) => {
    const outerPose =
      replacement.has(exit.outer.pieceId) &&
      endpoint(project, catalog, exit.outer.pieceId, exit.outer.portId);
    const innerPose =
      replacement.has(exit.inner.pieceId) &&
      endpoint(project, catalog, exit.inner.pieceId, exit.inner.portId);
    const outer = outerPose
      ? (rebindEndpoint(outerPose, tracks, catalog) ?? exit.outer)
      : exit.outer;
    const inner = innerPose
      ? (rebindEndpoint(innerPose, tracks, catalog) ?? exit.inner)
      : exit.inner;
    return { ...exit, outer, inner };
  });
  return {
    ...project,
    area: { ...project.area, exits },
    items: [...project.items.filter((item) => !replacement.has(item.id)), ...tracks],
  };
}
