import { straightFillers } from "./arrangement_anchors";
import { commitItems, placeItems } from "./arrangements";
import { evaluate } from "./engine";
import type { Analysis } from "./engine";
import {
  angleGap,
  composePose,
  joinAngle,
  maxItems,
  projectId,
  railTolerance as joinGap,
} from "./project";
import type { Catalog, Endpoint, Point, Project, TrackItem } from "./project";

type RailEnd = Analysis["ports"][number];
type Joint = Pick<Analysis["routes"][number], "from" | "to">;
export type RailGeometry = {
  ports: readonly RailEnd[];
  joints: readonly Joint[];
};

export type EditPreview = {
  items: readonly TrackItem[];
  marks: readonly Point[];
  opened?: readonly Point[];
  placement?: "rail" | "grid";
  gridFallback?: "missed" | "tie";
  snap?: { from: RailEnd; to: RailEnd };
  message: string;
} & ({ kind: "ready"; project: Project } | { kind: "blocked" });

type Translation = {
  stationary: Project;
  moving: RailEnd[];
  targets: RailEnd[];
  outside: Joint[];
};

type SnapCandidate = NonNullable<EditPreview["snap"]> & {
  shift: Point;
  distance: number;
  preferred: boolean;
};

export type Destination = {
  grid: Point;
  missedSnap: boolean;
  candidates: readonly SnapCandidate[];
  tiedThrough: readonly number[];
};

const translationTolerance = 1e-8;

export function endpointKey(endpoint: Endpoint): string {
  return JSON.stringify([endpoint.pieceId, endpoint.portId]);
}

function jointKey({ from, to }: Joint): string {
  return JSON.stringify([endpointKey(from), endpointKey(to)].sort());
}

function railJoints({ routes }: Analysis): Set<string> {
  return new Set(routes.filter(({ kind }) => kind === "joint").map(jointKey));
}

export function hasRailJoint(analysis: Analysis, from: Endpoint, to: Endpoint): boolean {
  const key = jointKey({ from, to });
  return analysis.routes.some((route) => route.kind === "joint" && jointKey(route) === key);
}

export function openRailEnds({ ports }: Analysis): RailEnd[] {
  return ports.filter((port) => port.type === "regular" && !port.joined && !port.ambiguous);
}

export function captureRailGeometry(analysis: Analysis, items: readonly TrackItem[]): RailGeometry {
  const ids = new Set(items.map(({ id }) => id));
  return {
    ports: analysis.ports.filter(({ pieceId }) => ids.has(pieceId)).map((port) => ({ ...port })),
    joints: analysis.routes
      .filter(
        ({ kind, from, to }) => kind === "joint" && ids.has(from.pieceId) && ids.has(to.pieceId),
      )
      .map(({ from, to }) => ({ from: { ...from }, to: { ...to } })),
  };
}

export function remapRailGeometry(
  { ports, joints }: RailGeometry,
  ids: ReadonlyMap<string, string>,
): RailGeometry {
  function remap<T extends Endpoint>(endpoint: T): T {
    const pieceId = ids.get(endpoint.pieceId);
    if (!pieceId) throw new Error("Copied rail end is missing its track piece.");
    return { ...endpoint, pieceId };
  }
  return {
    ports: ports.map(remap),
    joints: joints.map(({ from, to }) => ({ from: remap(from), to: remap(to) })),
  };
}

export function prepareTranslation(
  analysis: Analysis,
  items: readonly TrackItem[],
  copied?: RailGeometry,
): Translation {
  const ids = new Set(items.map(({ id }) => id));
  const affected = (endpoint: Endpoint): boolean => ids.has(endpoint.pieceId);
  const joints = copied ? [] : analysis.routes.filter(({ kind }) => kind === "joint");
  const inside = copied?.joints ?? joints.filter(({ from, to }) => affected(from) && affected(to));
  const outside = joints.filter(({ from, to }) => affected(from) !== affected(to));
  const internalEnds = new Set(
    inside.flatMap(({ from, to }) => [endpointKey(from), endpointKey(to)]),
  );
  const stationary = copied
    ? analysis.project
    : { ...analysis.project, items: analysis.project.items.filter(({ id }) => !ids.has(id)) };
  // Source ambiguity can involve track that was left behind.
  const moving = (copied?.ports ?? analysis.ports).filter(
    (port) =>
      port.type === "regular" &&
      affected(port) &&
      (copied !== undefined || !port.ambiguous) &&
      !internalEnds.has(endpointKey(port)),
  );
  return {
    stationary,
    outside,
    moving,
    targets: openRailEnds(copied ? analysis : evaluate(stationary)),
  };
}

function facing(from: RailEnd, to: RailEnd): boolean {
  return angleGap(from.angle, to.angle + 180) <= joinAngle;
}

export function translationTargets(context: Translation): RailEnd[] {
  return context.targets.filter((target) =>
    context.moving.some((source) => facing(source, target)),
  );
}

export function preferredTranslationEnd(
  context: Translation,
  pieceId: string,
  point: Point,
  radius: number,
): string | undefined {
  let nearest: RailEnd | undefined;
  let closest = Infinity;
  for (const from of context.moving) {
    if (from.pieceId !== pieceId) continue;
    const distance = Math.hypot(from.x - point.x, from.y - point.y);
    if (distance > radius || distance >= closest) continue;
    nearest = from;
    closest = distance;
  }
  return nearest && endpointKey(nearest);
}

export function chooseDestination(
  context: Translation,
  shift: Point,
  radius: number,
  fine: boolean,
  explicitEnd?: string,
  options?: { preferredSourceEnd?: string; tieDistance?: number },
): Destination {
  const step = fine ? 1 : 8;
  const grid = { x: Math.round(shift.x / step) * step, y: Math.round(shift.y / step) * step };
  const candidates: SnapCandidate[] = [];
  if (!fine || explicitEnd) {
    const preferred = options?.preferredSourceEnd;
    const preferredPort =
      preferred && context.moving.find((port) => endpointKey(port) === preferred);
    for (const to of context.targets) {
      if (explicitEnd && endpointKey(to) !== explicitEnd) continue;
      for (const from of context.moving) {
        const x = to.x - from.x;
        const y = to.y - from.y;
        const distance = Math.hypot(x - shift.x, y - shift.y);
        if ((!explicitEnd && distance > radius) || !facing(from, to)) continue;
        candidates.push({ from, to, shift: { x, y }, distance, preferred: from === preferredPort });
      }
    }
  }
  candidates.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.distance - b.distance);
  const tiedThrough = [];
  const tieDistance = options?.tieDistance;
  if (tieDistance !== undefined) {
    // Record the end of each tie window so pointer motion can reuse the preview.
    let end = 0;
    for (const [index, candidate] of candidates.entries()) {
      end = Math.max(end, index + 1);
      for (let other = candidates[end]; other; other = candidates[end]) {
        if (
          other.preferred !== candidate.preferred ||
          other.distance - candidate.distance > tieDistance
        )
          break;
        end++;
      }
      tiedThrough.push(end - 1);
    }
  }
  return { grid, candidates, tiedThrough, missedSnap: Boolean(explicitEnd && !candidates.length) };
}

export function sameDestination(previous: Destination | undefined, next: Destination): boolean {
  return (
    previous !== undefined &&
    previous.grid.x === next.grid.x &&
    previous.grid.y === next.grid.y &&
    previous.missedSnap === next.missedSnap &&
    previous.candidates.length === next.candidates.length &&
    previous.candidates.every(
      ({ from, to }, index) =>
        from === next.candidates[index]?.from &&
        to === next.candidates[index]?.to &&
        (previous.tiedThrough[index] ?? index) === (next.tiedThrough[index] ?? index),
    )
  );
}

export function blockedEdit(
  message: string,
  items: readonly TrackItem[] = [],
  marks: readonly Point[] = [],
): EditPreview {
  return { kind: "blocked", items, marks, message };
}

export function previewPlacement(
  original: Project,
  stationary: Project,
  items: readonly TrackItem[],
  marks: readonly Point[] = [],
): EditPreview {
  if (items.length + stationary.items.length > maxItems)
    return blockedEdit("This plan has reached its track piece limit.", items, marks);
  try {
    let project = placeItems(stationary, items);
    if (stationary !== original) {
      // Moving existing track must preserve its draw order and any normalized layer.
      const byId = new Map(project.items.map((item) => [item.id, item]));
      project = { ...project, items: original.items.map((item) => byId.get(item.id) ?? item) };
    }
    return { kind: "ready", project, items, marks, message: "" };
  } catch (error) {
    return blockedEdit(
      error instanceof Error ? error.message : "This track could not be placed.",
      items,
      marks,
    );
  }
}

export function previewTranslation(
  analysis: Analysis,
  context: Translation,
  items: readonly TrackItem[],
  destination: Destination,
): EditPreview {
  function translated(shift: Point): EditPreview {
    if (
      context.stationary !== analysis.project &&
      Math.hypot(shift.x, shift.y) < translationTolerance
    )
      return { kind: "ready", project: analysis.project, items: [], marks: [], message: "" };
    const placed = items.map((item) => ({ ...item, x: item.x + shift.x, y: item.y + shift.y }));
    return previewPlacement(analysis.project, context.stationary, placed);
  }
  function analyzed(project: Project): Analysis {
    return project === analysis.project ? analysis : evaluate(project);
  }
  const { candidates, tiedThrough, grid, missedSnap } = destination;
  const shiftKey = ({ x, y }: Point): string => `${x},${y}`;
  const pairsByShift = new Map<string, SnapCandidate[] | SnapCandidate | undefined>();
  for (const candidate of candidates) {
    const key = shiftKey(candidate.shift);
    const pairs = pairsByShift.get(key);
    if (Array.isArray(pairs)) pairs.push(candidate);
    else pairsByShift.set(key, [candidate]);
  }
  let gridFallback: EditPreview["gridFallback"] =
    missedSnap || candidates.length ? "missed" : undefined;
  let winner:
    | {
        candidate: SnapCandidate;
        preview: Extract<EditPreview, { kind: "ready" }>;
        next: Analysis;
        through: number;
      }
    | undefined;
  for (const [index, candidate] of candidates.entries()) {
    if (winner && index > winner.through) break;
    const key = shiftKey(candidate.shift);
    const pairs = pairsByShift.get(key);
    let preview: EditPreview | undefined;
    let next: Analysis | undefined;
    if (Array.isArray(pairs)) {
      preview = translated(candidate.shift);
      const evaluated = preview.kind === "ready" ? analyzed(preview.project) : undefined;
      const firstValid =
        evaluated && pairs.find(({ from, to }) => hasRailJoint(evaluated, from, to));
      // Only the first valid pair for a displacement can affect the ranking.
      pairsByShift.set(key, firstValid);
      if (candidate !== firstValid) continue;
      next = evaluated;
    } else if (candidate !== pairs) continue;
    if (winner) {
      const { shift } = winner.candidate;
      if (
        Math.hypot(candidate.shift.x - shift.x, candidate.shift.y - shift.y) < translationTolerance
      )
        continue;
      gridFallback = "tie";
      winner = undefined;
      break;
    }
    preview ??= translated(candidate.shift);
    if (preview.kind !== "ready") continue;
    next ??= analyzed(preview.project);
    winner = { candidate, preview, next, through: tiedThrough[index] ?? index };
  }
  if (winner) {
    const { candidate, preview, next } = winner;
    const { from, to } = candidate;
    const landed = next.ports.find(
      (port) => port.pieceId === from.pieceId && port.portId === from.portId,
    );
    const snap = { from: landed ?? { ...from, x: to.x, y: to.y }, to };
    return describeTranslation(
      analysis,
      next,
      context,
      { ...preview, marks: [to], placement: "rail", snap },
      "Snapped to the rail end.",
    );
  }
  const preview = { ...translated(grid), placement: "grid" as const };
  if (preview.kind === "blocked") return preview;
  const message = gridFallback === "tie" ? tiedSnapMessage : gridFallback ? missedSnapMessage : "";
  const ready = { ...preview, gridFallback, message };
  if (context.outside.length && preview.project !== analysis.project)
    return describeTranslation(analysis, analyzed(preview.project), context, ready, message);
  return ready;
}

export const missedSnapMessage = "Could not snap to the rail end. Placed on the grid.";
const tiedSnapMessage = "Multiple rail snaps are equally close. Placed on the grid.";

function describeTranslation(
  analysis: Analysis,
  next: Analysis,
  context: Translation,
  preview: Extract<EditPreview, { kind: "ready" }>,
  message: string,
): EditPreview {
  const joints = railJoints(next);
  const moved = new Set(preview.items.map(({ id }) => id));
  const openedEnds = new Set(
    context.outside
      .filter((joint) => !joints.has(jointKey(joint)))
      .map(({ from, to }) => endpointKey(moved.has(from.pieceId) ? to : from)),
  );
  const opened = analysis.ports.filter((port) => openedEnds.has(endpointKey(port)));
  const openedMessage = opened.length
    ? `Opened ${opened.length} ${opened.length === 1 ? "joint" : "joints"} to track outside the selection.`
    : "";
  return { ...preview, opened, message: [message, openedMessage].filter(Boolean).join(" ") };
}

export function previewGap(
  analysis: Analysis,
  catalog: Catalog,
  from: RailEnd,
  to: RailEnd,
): EditPreview {
  const marks = [from, to];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const radians = (from.angle * Math.PI) / 180;
  const forward = dx * Math.cos(radians) + dy * Math.sin(radians);
  const lateral = dy * Math.cos(radians) - dx * Math.sin(radians);
  if (
    from.pieceId === to.pieceId ||
    forward <= joinGap ||
    Math.abs(lateral) > joinGap ||
    angleGap(from.angle, to.angle + 180) > joinAngle
  )
    return blockedEdit("Choose two facing rail ends on the same straight line.", [], marks);
  const fillers = straightFillers(catalog, from, from.angle, forward);
  if (!fillers?.length)
    return blockedEdit("The catalog straight pieces cannot fill this gap exactly.", [], marks);
  const layerId = analysis.project.items.find(({ id }) => id === from.pieceId)?.layerId;
  if (!layerId) return blockedEdit("Choose an open rail end in the drawing.", [], marks);
  const items = fillers.map(({ partId, pose }): TrackItem => ({
    ...pose,
    id: projectId("track"),
    kind: "track",
    layerId,
    partId,
  }));
  let previous: Endpoint = from;
  const joints: Joint[] = [];
  const counts = new Map<string, number>();
  for (const item of items) {
    const part = catalog.parts.find(({ id }) => id === item.partId);
    const ports = part?.ports.map((port) => ({
      ...composePose(port, item),
      portId: port.id,
      pieceId: item.id,
    }));
    const [first, second] = ports ?? [];
    if (!part || !first || !second)
      return blockedEdit("The catalog filler is missing a rail end.", [], marks);
    const entryFirst =
      angleGap(first.angle, from.angle + 180) < angleGap(second.angle, from.angle + 180);
    joints.push({ from: previous, to: entryFirst ? first : second });
    previous = entryFirst ? second : first;
    counts.set(part.name, (counts.get(part.name) ?? 0) + 1);
  }
  joints.push({ from: previous, to });
  if (items.length + analysis.project.items.length > maxItems)
    return blockedEdit("This plan has reached its track piece limit.", items, marks);
  const result = commitItems(analysis.project, catalog, { items });
  if (!result.project)
    return blockedEdit(result.issues[0]?.message ?? "Track does not fit here.", items, marks);
  const next = evaluate(result.project);
  const previousAmbiguous = new Set(
    analysis.ports.filter(({ ambiguous }) => ambiguous).map(endpointKey),
  );
  if (next.ports.some((port) => port.ambiguous && !previousAmbiguous.has(endpointKey(port))))
    return blockedEdit("More than one rail end would meet at this joint.", items, marks);
  const connected = railJoints(next);
  if (joints.some((joint) => !connected.has(jointKey(joint))))
    return blockedEdit("This connection would fail to make a required rail joint.", items, marks);
  return {
    kind: "ready",
    project: result.project,
    items,
    marks,
    message: `${Number(forward.toFixed(2))} studs · ${[...counts].map(([name, count]) => `${count} × ${name}`).join(", ")}`,
  };
}
