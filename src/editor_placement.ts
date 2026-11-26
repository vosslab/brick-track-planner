import { straightFillers } from "./arrangement_anchors";
import { commitItems, placeItems } from "./arrangements";
import { evaluate } from "./engine";
import type { Analysis } from "./engine";
import { angleGap, composePose, maxItems, projectId } from "./project";
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
  message: string;
} & ({ kind: "ready"; project: Project } | { kind: "blocked" });

type Translation = {
  stationary: Project;
  moving: RailEnd[];
  targets: RailEnd[];
  outside: Joint[];
};

export type Destination = {
  grid: Point;
  missedSnap?: boolean;
  snap?: { from: RailEnd; to: RailEnd };
};

const protectedMessage =
  "This piece carries a named mainline exit. Use a connected replacement to keep the handoff.";
const joinGap = 0.05;
const joinAngle = 0.25;

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

function handoffs(project: Project): Endpoint[] {
  return project.area.exits.flatMap(({ outer, inner }) => [outer, inner]);
}

export function protectedTrack(project: Project, ids: ReadonlySet<string>): boolean {
  return handoffs(project).some(({ pieceId }) => ids.has(pieceId));
}

export function openRailEnds({ project, ports }: Analysis): RailEnd[] {
  const reserved = new Set(handoffs(project).map(endpointKey));
  return ports.filter(
    (port) =>
      port.type === "regular" &&
      !port.joined &&
      !port.ambiguous &&
      !reserved.has(endpointKey(port)),
  );
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
  return from.heightPlates === to.heightPlates && angleGap(from.angle, to.angle + 180) <= joinAngle;
}

export function translationTargets(context: Translation): RailEnd[] {
  return context.targets.filter((target) =>
    context.moving.some((source) => facing(source, target)),
  );
}

export function chooseDestination(
  context: Translation,
  shift: Point,
  radius: number,
  fine: boolean,
  explicitEnd?: string,
): Destination {
  const step = fine ? 1 : 8;
  const grid = { x: Math.round(shift.x / step) * step, y: Math.round(shift.y / step) * step };
  let snap: Destination["snap"];
  let nearest = Infinity;
  if (!fine || explicitEnd) {
    for (const to of context.targets) {
      if (explicitEnd && endpointKey(to) !== explicitEnd) continue;
      for (const from of context.moving) {
        const x = to.x - from.x;
        const y = to.y - from.y;
        const distance = Math.hypot(x - shift.x, y - shift.y);
        if ((!explicitEnd && distance > radius) || distance >= nearest || !facing(from, to))
          continue;
        nearest = distance;
        snap = { from, to };
      }
    }
  }
  return { grid, snap, missedSnap: Boolean(explicitEnd && !snap) };
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
  const { grid, snap } = destination;
  function translated(shift: Point, marks: readonly Point[] = []): EditPreview {
    if (context.stationary !== analysis.project && Math.hypot(shift.x, shift.y) < 1e-8)
      return { kind: "ready", project: analysis.project, items: [], marks, message: "" };
    const placed = items.map((item) => ({ ...item, x: item.x + shift.x, y: item.y + shift.y }));
    return previewPlacement(analysis.project, context.stationary, placed, marks);
  }
  let message = destination.missedSnap ? missedSnapMessage : "";
  if (snap) {
    const { from, to } = snap;
    const preview = translated({ x: to.x - from.x, y: to.y - from.y }, [to]);
    if (preview.kind === "ready") {
      const next = preview.project === analysis.project ? analysis : evaluate(preview.project);
      if (hasRailJoint(next, from, to))
        return describeTranslation(analysis, next, context, preview, "Snapped to the rail end.");
    }
    message = missedSnapMessage;
  }
  const preview = translated(grid);
  if (preview.kind === "ready") {
    if (context.outside.length && preview.project !== analysis.project)
      return describeTranslation(analysis, evaluate(preview.project), context, preview, message);
    preview.message = message;
  }
  return preview;
}

export const missedSnapMessage = "Could not snap to the rail end. Placed on the grid.";

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
  if (from.heightPlates !== to.heightPlates)
    return blockedEdit("Choose two rail ends at the same height.", [], marks);
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
    heightPlates: from.heightPlates,
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
  const reserved = new Set(handoffs(analysis.project).map(endpointKey));
  for (const port of analysis.ports) {
    if (port.joined) reserved.delete(endpointKey(port));
  }
  if (next.ports.some((port) => port.joined && reserved.has(endpointKey(port))))
    return blockedEdit("This connection would occupy a named mainline handoff.", items, marks);
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

export { protectedMessage };
