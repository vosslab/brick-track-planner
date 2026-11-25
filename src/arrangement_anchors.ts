import { exposedKitPorts } from "./kit_geometry";
import { previewArrangement } from "./arrangements";
import { angleGap, composePose, poseConnectingPorts, visibleTrackItems } from "./project";
import type { Catalog, Kit, Part, Point, Port, Pose, Project } from "./project";

const tolerance = 0.05;
const angleTolerance = 0.25;

export type ArrangementConnection = {
  kitPartIndex: number;
  kitPortId: string;
  itemId: string;
  itemPortId: string;
};

export type ArrangementAnchor = {
  pose: Pose;
  replaceIds: string[];
  /** Physical spacer track needed to close a measured straight replacement. */
  fillers: { partId: string; pose: Pose }[];
  connections: ArrangementConnection[];
  score: number;
  message: string;
};

export type ArrangementAnchorSearch = {
  anchors: ArrangementAnchor[];
  reason?: string;
};

type WorldPort = Port & { itemId: string; partId: string; heightPlates: number };
type Bounds = { left: number; right: number; top: number; bottom: number };

function normalize(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function joined(first: Pose, second: Pose): boolean {
  return (
    Math.hypot(first.x - second.x, first.y - second.y) <= tolerance &&
    angleGap(first.angle, second.angle + 180) <= angleTolerance
  );
}

function rotate(point: Point, angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function bounds(points: readonly Point[], pose: Pose): Bounds {
  const result = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const point of points) {
    const world = rotate(point, pose.angle);
    result.left = Math.min(result.left, pose.x + world.x);
    result.right = Math.max(result.right, pose.x + world.x);
    result.top = Math.min(result.top, pose.y + world.y);
    result.bottom = Math.max(result.bottom, pose.y + world.y);
  }
  return result;
}

function partById(catalog: Catalog, id: string): Part | undefined {
  return catalog.parts.find((part) => part.id === id);
}

function isReplaceableStraight(part: Part): boolean {
  return (
    part.ports.length === 2 &&
    part.routes.length === 1 &&
    !part.routes[0]?.event &&
    !part.radius &&
    !part.sweep
  );
}

function projectPorts(project: Project, catalog: Catalog): WorldPort[] {
  const ports: WorldPort[] = [];
  for (const item of visibleTrackItems(project)) {
    const part = partById(catalog, item.partId);
    if (!part) continue;
    for (const port of part.ports) {
      if (port.type === "regular")
        ports.push({
          ...composePose(port, item),
          id: port.id,
          type: port.type,
          itemId: item.id,
          partId: item.partId,
          heightPlates: item.heightPlates,
        });
    }
  }
  return ports;
}

function fillersFrom(
  catalog: Catalog,
  start: Pose,
  heading: number,
  length: number,
): { partId: string; pose: Pose }[] | undefined {
  const choices = ["lego:rc-s16", "trixbrix:s08", "bricktracks:s04", "trixbrix:s02", "trixbrix:s01"]
    .map((id) => ({ id, part: partById(catalog, id) }))
    .filter((entry): entry is { id: string; part: Part } => Boolean(entry.part))
    .map((entry) => {
      const [first, second] = entry.part.ports;
      return {
        ...entry,
        length: first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0,
      };
    })
    .sort((first, second) => second.length - first.length);
  const result: { partId: string; pose: Pose }[] = [];
  let current = start;
  let remaining = length;
  while (remaining > tolerance) {
    const choice = choices.find((entry) => entry.length <= remaining + tolerance);
    if (!choice || choice.length <= tolerance) return;
    const candidate = choice.part.ports
      .map((port) => ({ port, pose: poseConnectingPorts(port, current) }))
      .find(({ port, pose }) => {
        const other = choice.part.ports.find((entry) => entry.id !== port.id);
        if (!other) return false;
        const end = composePose(other, pose);
        const radians = (heading * Math.PI) / 180;
        return (
          (end.x - current.x) * Math.cos(radians) + (end.y - current.y) * Math.sin(radians) >
          tolerance
        );
      });
    if (!candidate) return;
    const other = choice.part.ports.find((port) => port.id !== candidate.port.id);
    if (!other) return;
    const end = composePose(other, candidate.pose);
    result.push({ partId: choice.id, pose: candidate.pose });
    remaining -= choice.length;
    current = { ...end };
  }
  return Math.abs(remaining) <= tolerance ? result : undefined;
}

function kitBounds(catalog: Catalog, kit: Kit, pose: Pose): Bounds {
  const result = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const placement of kit.parts) {
    const part = partById(catalog, placement.partId);
    if (!part) continue;
    const partBounds = bounds(part.footprint, composePose(placement, pose));
    result.left = Math.min(result.left, partBounds.left);
    result.right = Math.max(result.right, partBounds.right);
    result.top = Math.min(result.top, partBounds.top);
    result.bottom = Math.max(result.bottom, partBounds.bottom);
  }
  return result;
}

function straightRun(
  catalog: Catalog,
  ports: readonly WorldPort[],
  start: WorldPort,
  heading: number,
  minimum: number,
): { ids: string[]; end: WorldPort; length: number } | undefined {
  const ids: string[] = [];
  let current = start;
  let length = 0;
  // One physical piece at a time prevents a neighbouring parallel rail from
  // being swept into a replacement merely because its rectangle is nearby.
  for (let step = 0; step < ports.length; step += 1) {
    const currentPiece = partById(catalog, current.partId);
    if (!currentPiece || !isReplaceableStraight(currentPiece)) return;
    const own = ports.filter(
      (port) => port.itemId === current.itemId && port.itemId !== "" && port !== current,
    );
    const next = own.find((port) => {
      const radians = (heading * Math.PI) / 180;
      const forward =
        (port.x - current.x) * Math.cos(radians) + (port.y - current.y) * Math.sin(radians);
      const side =
        -(port.x - current.x) * Math.sin(radians) + (port.y - current.y) * Math.cos(radians);
      return forward > tolerance && Math.abs(side) <= tolerance;
    });
    if (!next) return;
    ids.push(current.itemId);
    length += Math.hypot(next.x - current.x, next.y - current.y);
    if (length + tolerance >= minimum) return { ids, end: next, length };
    const mate = ports.find(
      (port) =>
        port.itemId !== next.itemId &&
        port.heightPlates === next.heightPlates &&
        joined(next, port),
    );
    if (!mate || ids.includes(mate.itemId)) return;
    current = mate;
  }
  return;
}

function rearScore(project: Project, center: Point): number {
  const distances = project.area.fronts.map((front) => {
    if (front === "north") return center.y;
    if (front === "south") return project.area.depth - center.y;
    if (front === "west") return center.x;
    return project.area.width - center.x;
  });
  return distances.length ? Math.min(...distances) : 0;
}

function samePlace(a: Pose, b: Pose): boolean {
  return (
    Math.hypot(a.x - b.x, a.y - b.y) <= tolerance && angleGap(a.angle, b.angle) <= angleTolerance
  );
}

// A straight replacement has an inlet and an outlet on the same rail axis.
// Other parallel pairs describe additional required runs on a crossover.
function pairedThrough(a: Pose, b: Pose): boolean {
  if (angleGap(a.angle + 180, b.angle) > angleTolerance) return false;
  const radians = (b.angle * Math.PI) / 180;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return (
    dx * Math.cos(radians) + dy * Math.sin(radians) > tolerance &&
    Math.abs(dy * Math.cos(radians) - dx * Math.sin(radians)) <= tolerance
  );
}

function throughPairs(ports: readonly Pose[]): readonly (readonly [Pose, Pose])[] {
  return ports.flatMap((a, index) =>
    ports
      .slice(index + 1)
      .filter((b) => pairedThrough(a, b))
      .map((b) => [a, b] as const),
  );
}

function footprint(catalog: Catalog, kit: Kit): { width: number; depth: number } {
  const box = kitBounds(catalog, kit, { x: 0, y: 0, angle: 0 });
  return { width: box.right - box.left, depth: box.bottom - box.top };
}

function measurement({ width, depth }: { width: number; depth: number }): string {
  const studs = [width, depth].map((value) => Number(value.toFixed(2))).join(" by ");
  const inches = [width, depth].map((value) => Number((value / 3.2).toFixed(1))).join(" by ");
  return `${studs} studs (${inches} in)`;
}

function compactNumbers(values: readonly number[]): string {
  return [...new Set(values.map(Math.round))].sort((a, b) => a - b).join(" and ");
}

/** Summarize the measured geometry before a member asks the planner to fit it. */
export function arrangementRequirements(catalog: Catalog, kitId: string): string {
  const kit = catalog.kits.find((entry) => entry.id === kitId);
  if (!kit || !kit.parts.length) return "This arrangement is not available.";
  const size = footprint(catalog, kit);
  const ports = exposedKitPorts(catalog, kit);
  const through = throughPairs(ports);
  const fit = `Footprint ${measurement(size)}.`;
  if (!through.length) return `${fit} Connect it at an open track end.`;
  const lengths = compactNumbers(through.map(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y)));
  if (through.length === 1)
    return `${fit} Connect at a compatible open end or replace a ${lengths}-stud straight run.`;
  const heading = (through[0]![0].angle * Math.PI) / 180;
  const centers = through
    .map(([a]) => a.y * Math.cos(heading) - a.x * Math.sin(heading))
    .sort((a, b) => a - b);
  const spacings = compactNumbers(
    centers.slice(1).map((center, index) => center - centers[index]!),
  );
  return `${fit} Needs ${through.length} parallel straight runs ${spacings} studs apart, each ${lengths} studs long.`;
}

export function findArrangementAnchors(
  project: Project,
  catalog: Catalog,
  kitId: string,
  heightPlates = 0,
  targetIds?: ReadonlySet<string>,
): ArrangementAnchorSearch {
  const kit = catalog.kits.find((entry) => entry.id === kitId);
  if (!kit || !kit.parts.length)
    return { anchors: [], reason: "This arrangement is not available." };
  const size = footprint(catalog, kit);
  const spaceMessage = `It needs a clear area of ${measurement(size)}.`;
  const local = exposedKitPorts(catalog, kit);
  const ports = projectPorts(project, catalog).filter((p) => p.heightPlates === heightPlates);
  const through = throughPairs(local);
  const inArea = (box: Bounds): boolean =>
    box.left >= -tolerance &&
    box.top >= -tolerance &&
    box.right <= project.area.width + tolerance &&
    box.bottom <= project.area.depth + tolerance;
  const track = visibleTrackItems(project);
  if (track.length && !ports.some(({ itemId }) => !targetIds || targetIds.has(itemId)))
    return {
      anchors: [],
      reason: `The connection needs a regular rail end at the required ${heightPlates}-plate rail height.`,
    };
  if (!track.length) {
    if (project.area.niltc)
      return {
        anchors: [],
        reason: "The NILTC mainline must stay in place before adding an arrangement.",
      };
    const anchors = [0, 90, 180, 270].flatMap((angle) => {
      const box = kitBounds(catalog, kit, { x: 0, y: 0, angle });
      const pose = {
        angle,
        x: (project.area.width - box.left - box.right) / 2,
        y: (project.area.depth - box.top - box.bottom) / 2,
      };
      return inArea(kitBounds(catalog, kit, pose))
        ? [
            {
              pose,
              replaceIds: [],
              fillers: [],
              connections: [],
              score: 0,
              message: "Centered in the empty design area",
            },
          ]
        : [];
    });
    return { anchors, reason: anchors.length ? undefined : spaceMessage };
  }
  const seen = new Set<string>();
  const result: ArrangementAnchor[] = [];
  const occupied = new Set(
    ports.filter((a) => ports.some((b) => a.itemId !== b.itemId && joined(a, b))),
  );
  let outsideArea = false;
  let blocked: string | undefined;
  function consider(pose: Pose): void {
    const key = [pose.x, pose.y, normalize(pose.angle)].map((v) => Math.round(v * 1000)).join(",");
    if (seen.has(key)) return;
    seen.add(key);
    const replace = new Set<string>();
    const fillers: ArrangementAnchor["fillers"] = [];
    const ends = local.map((p) => ({ ...composePose(p, pose), local: p }));
    let runs = 0;
    for (const pair of through) {
      let matched = false;
      for (const [entry, exit] of [pair, [pair[1], pair[0]]] as const) {
        const start = composePose(entry, pose),
          finish = composePose(exit, pose);
        const length = Math.hypot(finish.x - start.x, finish.y - start.y);
        const target = ports.find((p) => samePlace(p, start));
        if (!target) continue;
        const run = straightRun(catalog, ports, target, finish.angle, length);
        if (!run) continue;
        const extra = fillersFrom(catalog, finish, finish.angle, run.length - length);
        if (!extra) continue;
        for (const id of run.ids) replace.add(id);
        fillers.push(...extra);
        matched = true;
        break;
      }
      if (matched) runs++;
    }
    const connections: ArrangementConnection[] = [];
    for (const end of ends) {
      const mate = ports.find((p) => !replace.has(p.itemId) && joined(p, end));
      if (mate)
        connections.push({
          kitPartIndex: end.local.kitPartIndex,
          kitPortId: end.local.id,
          itemId: mate.itemId,
          itemPortId: mate.id,
        });
    }
    const hasConnection = connections.some((c) =>
      ports.some((p) => p.itemId === c.itemId && p.id === c.itemPortId && !occupied.has(p)),
    );
    if (!runs && !hasConnection) return;
    if (
      through.length > 1 &&
      !through.every(([a, b]) =>
        [a, b].some((end) => {
          const world = composePose(end, pose);
          return ports.some(
            (p) =>
              (replace.has(p.itemId) && samePlace(p, world)) ||
              (!occupied.has(p) && joined(p, world)),
          );
        }),
      )
    )
      return;
    const replaceIds = [...replace];
    if (
      targetIds &&
      !replaceIds.some((id) => targetIds.has(id)) &&
      !connections.some(({ itemId }) => targetIds.has(itemId))
    )
      return;
    const box = kitBounds(catalog, kit!, pose);
    if (!inArea(box)) {
      outsideArea = true;
      return;
    }
    const preview = previewArrangement(project, catalog, {
      kitId,
      pose,
      replaceIds,
      fillers,
      heightPlates,
    });
    if (!preview.ok) {
      blocked ??= preview.issues[0]?.message;
      return;
    }
    const center = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    result.push({
      pose,
      replaceIds,
      fillers,
      connections,
      score: rearScore(project, center),
      message: replace.size
        ? `Replaces ${replace.size} straight track pieces`
        : "Connects at an open track end",
    });
  }
  for (const end of local)
    for (const p of ports) {
      consider(poseConnectingPorts(end, p));
      consider(poseConnectingPorts(end, { ...p, angle: p.angle + 180 }));
    }
  const anchors = result.sort((a, b) => b.score - a.score);
  if (anchors.length) return { anchors };
  if (blocked) return { anchors, reason: blocked };
  if (outsideArea)
    return { anchors, reason: `The arrangement extends outside the design area. ${spaceMessage}` };
  if (through.length > 1)
    return {
      anchors,
      reason: `No set of ${through.length} aligned parallel tracks matches this arrangement.`,
    };
  return {
    anchors,
    reason: through.length
      ? "No compatible open track end or straight run was found."
      : "No compatible open track end was found.",
  };
}
