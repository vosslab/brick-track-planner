import { composePose, newProject } from "./project";
import type { Catalog, Edge, Part, Pose, Project, SectionExit, Table } from "./project";

export const STARTER_CARDS = [
  { kind: "40x40", title: "40\u00d740", description: "Start with one table." },
  {
    kind: "60x40-straight",
    title: "60\u00d740 Straight",
    description: "Leave room for a yard.",
  },
  {
    kind: "60x40-curve",
    title: "60\u00d740 Curve",
    description: "Turn both mainlines around a corner.",
  },
  {
    kind: "advanced",
    title: "Advanced \u2014 I\u2019ll handle it",
    description: "Start with a blank canvas.",
  },
] as const;

export type StarterKind = (typeof STARTER_CARDS)[number]["kind"];

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

function connect(incoming: Pose, outgoing: Pose): Pose {
  const angle = (outgoing.angle + 180 - incoming.angle + 360) % 360;
  const offset = composePose(incoming, { x: 0, y: 0, angle });
  return { x: outgoing.x - offset.x, y: outgoing.y - offset.y, angle };
}

function addLane(project: Project, table: Table, name: string, start: Pose, parts: Part[]): void {
  let end = start;
  for (const [index, part] of parts.entries()) {
    const pose = connect(port(part, "a"), end);
    project.items.push({
      kind: "track",
      id: `${name}-${index + 1}`,
      partId: part.id,
      tableId: table.id,
      layerId: table.layerId,
      heightPlates: 2,
      ...pose,
    });
    end = composePose(port(part, "b"), pose);
  }
}

function starterExit(
  table: Table,
  edge: Edge,
  name: string,
  portId: string,
  piece: number,
): SectionExit {
  return {
    id: `exit-${edge}`,
    name,
    tableId: table.id,
    edge,
    outer: { pieceId: `outer-${piece}`, portId },
    inner: { pieceId: `inner-${piece}`, portId },
  };
}

export function createStarter(kind: StarterKind, catalog: Catalog): Project {
  const project = newProject();
  if (kind === "advanced") return project;

  const card = STARTER_CARDS.find((entry) => entry.kind === kind);
  if (!card) throw new Error(`Unknown starter: ${kind}.`);
  const curve = kind === "60x40-curve";
  const narrow = kind === "40x40";
  const nominal = narrow ? "NILTC 40 x 40 in" : "NILTC 60 x 40 in";
  const table: Table = {
    id: "starter-table",
    name: nominal,
    nominal,
    layerId: "layout",
    sectionId: "starter-section",
    x: 0,
    y: 0,
    angle: 0,
    width: narrow ? 128 : 192,
    depth: 128,
    fronts: curve ? ["north", "west"] : ["north"],
    niltc: curve ? "corner" : "straight",
  };
  project.name = card.title;
  project.tables.push(table);

  for (let y = 16; y < table.depth; y += 32) {
    for (let x = 16; x < table.width; x += 32) {
      project.items.push({
        kind: "baseplate",
        id: `baseplate-${x}-${y}`,
        tableId: table.id,
        layerId: table.layerId,
        x,
        y,
        angle: 0,
      });
    }
  }

  const straight = findPart(catalog, "lego:9v-s16");
  const straightCount = (table.width - (curve ? 128 : 0)) / 16;
  const straights = Array<Part>(straightCount).fill(straight);
  for (const [lane, offset, radius] of [
    ["outer", 8, 120],
    ["inner", 24, 104],
  ] as const) {
    const arcs = curve ? Array<Part>(8).fill(findPart(catalog, `bricktracks:r${radius}`)) : [];
    const start = curve ? { x: offset, y: table.depth, angle: 270 } : { x: 0, y: offset, angle: 0 };
    addLane(project, table, lane, start, [...arcs, ...straights]);
  }
  project.sections.push({
    id: "starter-section",
    name: card.title,
    exits: [
      starterExit(table, "east", "East exit", "b", straightCount + (curve ? 8 : 0)),
      curve
        ? starterExit(table, "south", "South exit", "a", 1)
        : starterExit(table, "west", "West exit", "a", 1),
    ],
  });
  return project;
}

/** Extend a fresh straight starter while preserving both named mainline exits. */
export function addStarterSiding(project: Project, catalog: Catalog): string {
  const first = project.items.find(({ id }) => id === "inner-3");
  if (first?.kind !== "track") throw new Error("The starter mainline is missing.");
  const straight = findPart(catalog, first.partId);
  const turnout = findPart(catalog, "lego:9v-r40-right");
  const curve = findPart(catalog, "lego:9v-r40");
  const siding = findPart(catalog, "trixbrix:s32");
  const start = composePose(port(straight, "a"), first);
  const turnoutPose = connect(port(turnout, "common"), { ...start, angle: start.angle + 180 });
  const curvePose = connect(port(curve, "b"), composePose(port(turnout, "branch"), turnoutPose));
  const sidingPose = connect(port(siding, "a"), composePose(port(curve, "a"), curvePose));

  // The turnout's through route spans two S16s. The reversed curve makes the siding parallel.
  project.items = project.items.filter(({ id }) => id !== first.id && id !== "inner-4");
  project.items.push(
    { ...first, partId: turnout.id, ...turnoutPose },
    { ...first, id: "starter-siding-curve", partId: curve.id, ...curvePose },
    { ...first, id: "starter-siding-straight", partId: siding.id, ...sidingPose },
  );
  return first.id;
}
