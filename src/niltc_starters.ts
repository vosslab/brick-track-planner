import { composePose, newProject, poseConnectingPorts } from "./project";
import type { Catalog, Edge, Part, Pose, Project, SectionExit } from "./project";

export type SignupDimensions = { width: number; depth: number };
export type NiltcStarterOptions = {
  width: number;
  depth: number;
  mode: "straight" | "corner";
  fronts: Edge[];
  name?: string;
};

/** A straight signup follows its public edge. Corner dimensions follow the drawing axes. */
export function signupToAreaDimensions(
  signup: SignupDimensions,
  fronts: readonly Edge[],
): SignupDimensions {
  const front = fronts[0];
  if (fronts.length !== 1) return { ...signup };
  return front === "east" || front === "west"
    ? { width: signup.depth, depth: signup.width }
    : { ...signup };
}

/** Converts drawing dimensions back to the dimensions shown on the setup form. */
export function areaToSignupDimensions(
  area: SignupDimensions,
  fronts: readonly Edge[],
): SignupDimensions {
  return signupToAreaDimensions(area, fronts);
}

function findPart(catalog: Catalog, id: string): Part {
  const part = catalog.parts.find((entry) => entry.id === id);
  if (!part) throw new Error(`The starter requires the catalog part ${id}.`);
  return part;
}

function port(part: Part, id: string): Part["ports"][number] {
  const connector = part.ports.find((entry) => entry.id === id);
  if (!connector) throw new Error(`${part.name} is missing connector ${id}.`);
  return connector;
}

function addLane(
  project: Project,
  name: string,
  start: Pose,
  parts: Part[],
): { first: string; last: string } {
  let end = start;
  for (const [index, part] of parts.entries()) {
    const pose = poseConnectingPorts(port(part, "a"), end);
    project.items.push({
      kind: "track",
      id: `${name}-${index + 1}`,
      partId: part.id,
      layerId: "layout",
      heightPlates: 2,
      ...pose,
    });
    end = composePose(port(part, "b"), pose);
  }
  return { first: `${name}-1`, last: `${name}-${parts.length}` };
}

function exit(id: string, name: string, edge: Edge, first: string): SectionExit {
  return {
    id,
    name,
    edge,
    outer: { pieceId: `outer-${first}`, portId: first },
    inner: { pieceId: `inner-${first}`, portId: first },
  };
}

function assertNiltcArea({ width, depth, mode, fronts }: NiltcStarterOptions): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(depth) || width <= 0 || depth <= 0)
    throw new Error("NILTC design area dimensions must be positive whole studs.");
  if (width > 4096 || depth > 4096)
    throw new Error("NILTC design areas are limited to 4096 studs in each direction.");
  if (mode === "straight" && fronts.length !== 1)
    throw new Error("A straight assignment has one public edge.");
  if (mode === "straight" && (width < 32 || depth < 32))
    throw new Error("A NILTC straight assignment needs 32 studs from the plexiglass.");
  if (mode === "corner" && (width < 128 || depth < 128 || fronts.length !== 2))
    throw new Error("A corner assignment needs two public edges and a 40 by 40 inch area.");
}

function straightRunParts(catalog: Catalog, length: number): Part[] {
  const choices = [
    [16, "lego:rc-s16"],
    [8, "trixbrix:s08"],
    [4, "bricktracks:s04"],
    [2, "trixbrix:s02"],
    [1, "trixbrix:s01"],
  ] as const;
  let remaining = length;
  const parts: Part[] = [];
  for (const [studs, id] of choices) {
    const part = findPart(catalog, id);
    while (remaining >= studs) {
      parts.push(part);
      remaining -= studs;
    }
  }
  if (remaining) throw new Error(`No catalog straight track can complete ${length} studs.`);
  return parts;
}

function rotatedPoint(point: Pose, width: number, depth: number, rotation: number): Pose {
  if (rotation === 0) return point;
  if (rotation === 90) return { x: width - point.y, y: point.x, angle: point.angle + 90 };
  if (rotation === 180) return { x: width - point.x, y: depth - point.y, angle: point.angle + 180 };
  if (rotation === 270) return { x: point.y, y: depth - point.x, angle: point.angle + 270 };
  throw new Error(`Unsupported corner rotation ${rotation}.`);
}

function cornerRotation(fronts: Edge[]): number {
  const key = [...fronts].sort().join(",");
  return (
    (
      { "north,west": 0, "east,north": 90, "east,south": 180, "south,west": 270 } as Record<
        string,
        number
      >
    )[key] ?? -1
  );
}

function rotateCornerProject(
  project: Project,
  width: number,
  depth: number,
  rotation: number,
): void {
  for (const item of project.items) Object.assign(item, rotatedPoint(item, width, depth, rotation));
  const all: Edge[] = ["north", "east", "south", "west"];
  for (const value of project.area.exits) {
    const edge = all[(all.indexOf(value.edge) + rotation / 90) % all.length]!;
    value.edge = edge;
    value.id = `exit-${edge}`;
    value.name = `${edge[0]!.toUpperCase()}${edge.slice(1)} exit`;
  }
}

/** Build both required mainlines for the member's assigned design area. */
export function createNiltcStarter(catalog: Catalog, options: NiltcStarterOptions): Project {
  assertNiltcArea(options);
  const project = newProject();
  const signup = areaToSignupDimensions(options, options.fronts);
  project.name = options.name ?? `NILTC ${signup.width / 3.2} × ${signup.depth / 3.2} in`;
  project.area = {
    width: options.width,
    depth: options.depth,
    fronts: options.fronts,
    niltc: options.mode,
    exits: [],
  };

  if (options.mode === "straight") {
    const front = options.fronts[0]!;
    const vertical = front === "east" || front === "west";
    const length = vertical ? options.depth : options.width;
    const reverse = front === "south" || front === "east";
    const start = reverse
      ? vertical
        ? { x: options.width - 8, y: options.depth, angle: 270 }
        : { x: options.width, y: options.depth - 8, angle: 180 }
      : vertical
        ? { x: 8, y: 0, angle: 90 }
        : { x: 0, y: 8, angle: 0 };
    const laneStart = (offset: number): Pose =>
      vertical
        ? { ...start, x: front === "east" ? options.width - offset : offset }
        : { ...start, y: front === "south" ? options.depth - offset : offset };
    const run = straightRunParts(catalog, length);
    const outer = addLane(project, "outer", laneStart(8), run);
    const inner = addLane(project, "inner", laneStart(24), run);
    const edges: [Edge, Edge] = vertical
      ? reverse
        ? ["south", "north"]
        : ["north", "south"]
      : reverse
        ? ["east", "west"]
        : ["west", "east"];
    const [startEdge, endEdge] = edges;
    const startExit = exit(`exit-${startEdge}`, `${startEdge} exit`, startEdge, "a");
    const endExit = exit(`exit-${endEdge}`, `${endEdge} exit`, endEdge, "b");
    startExit.outer.pieceId = outer.first;
    startExit.inner.pieceId = inner.first;
    endExit.outer.pieceId = outer.last;
    endExit.inner.pieceId = inner.last;
    project.area.exits = [startExit, endExit];
    return project;
  }

  const rotation = cornerRotation(options.fronts);
  if (rotation < 0) throw new Error("A corner assignment needs two adjacent public edges.");
  const canonicalWidth = rotation % 180 ? options.depth : options.width;
  const canonicalDepth = rotation % 180 ? options.width : options.depth;
  const leading = straightRunParts(catalog, canonicalDepth - 128);
  const trailing = straightRunParts(catalog, canonicalWidth - 128);
  for (const [lane, offset, radius] of [
    ["outer", 8, 120],
    ["inner", 24, 104],
  ] as const) {
    const parts = [
      ...leading,
      ...Array<Part>(8).fill(findPart(catalog, `bricktracks:r${radius}`)),
      ...trailing,
    ];
    addLane(project, lane, { x: offset, y: canonicalDepth, angle: 270 }, parts);
  }
  const total = leading.length + 8 + trailing.length;
  const southExit = exit("exit-south", "South exit", "south", "a");
  const eastExit = exit("exit-east", "East exit", "east", "b");
  southExit.outer.pieceId = "outer-1";
  southExit.inner.pieceId = "inner-1";
  eastExit.outer.pieceId = `outer-${total}`;
  eastExit.inner.pieceId = `inner-${total}`;
  project.area.exits = [southExit, eastExit];
  rotateCornerProject(project, options.width, options.depth, rotation);
  return project;
}
