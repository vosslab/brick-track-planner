import { straightFillers } from "./arrangement_anchors";
import { commitItems } from "./arrangements";
import { evaluate } from "./engine";
import type { Analysis } from "./engine";
import { angleGap, composePose, maxItems, projectId } from "./project";
import type { Catalog, Endpoint, Point, Project, TrackItem } from "./project";

type RailEnd = Analysis["ports"][number];
type Joint = Pick<Analysis["routes"][number], "from" | "to">;

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
  inside: Joint[];
  outside: Joint[];
};

export type Destination = {
  shift: Point;
  snap?: { from: RailEnd; to: RailEnd };
  blocked?: string;
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

export function prepareTranslation(
  analysis: Analysis,
  catalog: Catalog,
  items: readonly TrackItem[],
  movingExisting: boolean,
): Translation {
  const ids = new Set(items.map(({ id }) => id));
  const affected = (endpoint: Endpoint): boolean => ids.has(endpoint.pieceId);
  const joints = analysis.routes.filter(({ kind }) => kind === "joint");
  const inside = joints.filter(({ from, to }) => affected(from) && affected(to));
  const outside = joints.filter(({ from, to }) => affected(from) !== affected(to));
  const internalEnds = new Set(
    inside.flatMap(({ from, to }) => [endpointKey(from), endpointKey(to)]),
  );
  const stationary = movingExisting
    ? { ...analysis.project, items: analysis.project.items.filter(({ id }) => !ids.has(id)) }
    : analysis.project;
  const moving = movingExisting
    ? analysis.ports.filter(
        (port) => affected(port) && !port.ambiguous && !internalEnds.has(endpointKey(port)),
      )
    : items.flatMap((item) =>
        (catalog.parts.find(({ id }) => id === item.partId)?.ports ?? []).map((port) => ({
          ...composePose(port, item),
          pieceId: item.id,
          portId: port.id,
          type: port.type,
          heightPlates: item.heightPlates,
          joined: false,
        })),
      );
  return {
    stationary,
    inside,
    outside,
    moving: moving.filter(({ type }) => type === "regular"),
    targets: openRailEnds(movingExisting ? evaluate(stationary) : analysis),
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
  let match: Destination | undefined;
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
        match = { shift: { x, y }, snap: { from, to } };
      }
    }
  }
  if (match) return match;
  if (explicitEnd)
    return {
      shift: grid,
      blocked: "Choose a highlighted rail end that faces the selection at the same height.",
    };
  return { shift: grid };
}

export function blockedEdit(
  message: string,
  items: readonly TrackItem[] = [],
  marks: readonly Point[] = [],
): EditPreview {
  return { kind: "blocked", items, marks, message };
}

export function checkEdit(
  analysis: Analysis,
  catalog: Catalog,
  stationary: Project,
  items: readonly TrackItem[],
  required: readonly Joint[],
  previousOutside: readonly Joint[] = [],
  marks: readonly Point[] = [],
): EditPreview {
  if (items.length + stationary.items.length > maxItems)
    return blockedEdit("This plan has reached its track piece limit.", items, marks);
  const result = commitItems(stationary, catalog, { items });
  if (!result.project)
    return blockedEdit(result.issues[0]?.message ?? "Track does not fit here.", items, marks);

  // Keep existing item order and use the placement layer chosen by commitItems for any additions.
  const byId = new Map(result.project.items.map((item) => [item.id, item]));
  const ordered = analysis.project.items.flatMap(({ id }) => {
    const existing = byId.get(id);
    byId.delete(id);
    return existing ? [existing] : [];
  });
  const project = { ...result.project, items: [...ordered, ...byId.values()] };
  const next = evaluate(project);
  const previousAmbiguous = new Set(
    analysis.ports.filter(({ ambiguous }) => ambiguous).map(endpointKey),
  );
  if (next.ports.some((port) => port.ambiguous && !previousAmbiguous.has(endpointKey(port))))
    return blockedEdit("More than one rail end would meet at this joint.", items, marks);
  const joints = new Set(next.routes.filter(({ kind }) => kind === "joint").map(jointKey));
  if (required.some((joint) => !joints.has(jointKey(joint))))
    return blockedEdit(
      "This placement would fail to make or keep a required rail joint.",
      items,
      marks,
    );
  const moved = new Set(items.map(({ id }) => id));
  const openedEnds = new Set(
    previousOutside
      .filter((joint) => !joints.has(jointKey(joint)))
      .map(({ from, to }) => endpointKey(moved.has(from.pieceId) ? to : from)),
  );
  const opened = analysis.ports.filter((port) => openedEnds.has(endpointKey(port)));
  return {
    kind: "ready",
    project,
    items,
    marks,
    opened,
    message: opened.length
      ? `Opens ${opened.length} ${opened.length === 1 ? "joint" : "joints"} to track outside the selection.`
      : "",
  };
}

export function previewTranslation(
  analysis: Analysis,
  catalog: Catalog,
  context: Translation,
  items: readonly TrackItem[],
  destination: Destination,
): EditPreview {
  const { shift, snap, blocked } = destination;
  if (blocked) return blockedEdit(blocked);
  if (context.stationary !== analysis.project && Math.hypot(shift.x, shift.y) < 1e-8)
    return blockedEdit("Choose a different position.");
  const placed = items.map((item) => ({ ...item, x: item.x + shift.x, y: item.y + shift.y }));
  const preview = checkEdit(
    analysis,
    catalog,
    context.stationary,
    placed,
    snap ? [...context.inside, snap] : context.inside,
    context.outside,
    snap ? [snap.to] : [],
  );
  if (preview.kind === "ready" && snap)
    preview.message = ["Snaps to the highlighted rail end.", preview.message]
      .filter(Boolean)
      .join(" ");
  return preview;
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
  const preview = checkEdit(analysis, catalog, analysis.project, items, joints, [], marks);
  if (preview.kind === "ready")
    preview.message = `${Number(forward.toFixed(2))} studs · ${[...counts].map(([name, count]) => `${count} × ${name}`).join(", ")}`;
  return preview;
}

export { protectedMessage };
