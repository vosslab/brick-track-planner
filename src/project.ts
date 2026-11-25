import catalog from "../data/catalog.json" with { type: "json" };

export type Point = { x: number; y: number };
export type Pose = Point & { angle: number };

const edges = ["north", "east", "south", "west"] as const;
export const maxPlanarStuds = 100_000;
export type Edge = (typeof edges)[number];
export type Layer = { id: string; name: string; visible: boolean };
export type NiltcMode = "straight" | "corner";
export type Table = Pose & {
  id: string;
  name: string;
  layerId: string;
  width: number;
  depth: number;
  fronts: Edge[];
  nominal?: string;
  sectionId?: string;
  niltc?: NiltcMode;
};

export type Endpoint = { pieceId: string; portId: string };
export type SectionExit = {
  id: string;
  name: string;
  tableId: string;
  edge: Edge;
  outer: Endpoint;
  inner: Endpoint;
};
export type Section = { id: string; name: string; memberId?: string; exits: SectionExit[] };
export type Member = { id: string; name: string; bring: Record<string, number> };
export type Keepout = Point & { id: string; name: string; width: number; depth: number };
export type Venue = { width: number; depth: number; keepouts: Keepout[] };

export type PortPair = { a: Endpoint; b: Endpoint };
export type Seam = {
  id: string;
  tableA: string;
  edgeA: Edge;
  tableB: string;
  edgeB: Edge;
  outer: PortPair;
  inner: PortPair;
  exitAId?: string;
  exitBId?: string;
};

export type ItemBase = Pose & { id: string; layerId: string; tableId?: string };
const ballastStyles = ["bare", "gray", "pennlug"] as const;
export type BallastStyle = (typeof ballastStyles)[number];
export type TrackItem = ItemBase & {
  kind: "track";
  partId: string;
  heightPlates: number;
  ballast?: BallastStyle;
  countBallast?: boolean;
};
export type BaseplateItem = ItemBase & { kind: "baseplate"; name?: string; color?: string };
export type UnresolvedItem = ItemBase & {
  kind: "unresolved";
  sourceId: string;
  name: string;
  width: number;
  depth: number;
  altitude?: number;
  reason: string;
};
export type Item = TrackItem | BaseplateItem | UnresolvedItem;

export type ProjectV1 = {
  version: 1;
  name: string;
  layers: Layer[];
  tables: Table[];
  items: Item[];
  seams: Seam[];
};
export type Project = Omit<ProjectV1, "version"> & {
  version: 2;
  sections: Section[];
  members: Member[];
  venue?: Venue;
};

export type Port = Pose & { id: string; type: string };
export type PartAlias = {
  key: string;
  offsetX?: number;
  offsetY?: number;
  angle?: number;
  preferredY?: number;
  sourceHull?: Point[];
};
export type Part = {
  id: string;
  brand: string;
  name: string;
  radius?: number;
  sweep?: number;
  ports: Port[];
  paths: Point[][];
  footprint: Point[];
  aliases?: PartAlias[];
};
export type Kit = {
  id: string;
  brand: string;
  name: string;
  aliases?: string[];
  sourceHull?: Point[];
  sourceOffset?: Point;
  parts: (Pose & { partId: string })[];
};
export type Catalog = { parts: Part[]; kits: Kit[] };

const physicalPartIds = new Set(catalog.parts.map(({ id }) => id));

function expect(condition: unknown, path: string, requirement: string): asserts condition {
  if (!condition) throw new Error(`${path} must be ${requirement}.`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  expect(value !== null && typeof value === "object" && !Array.isArray(value), path, "an object");
  return value as Record<string, unknown>;
}

function list(value: unknown, path: string): unknown[] {
  expect(Array.isArray(value), path, "an array");
  return value;
}

function string(value: unknown, path: string, nonempty = false): string {
  expect(typeof value === "string", path, "a string");
  if (nonempty) expect(value.trim().length > 0, path, "a nonempty string");
  return value;
}

function numeric(value: unknown, path: string): number {
  expect(typeof value === "number" && Number.isFinite(value), path, "a finite number");
  return value;
}

function hasPoint(data: Record<string, unknown>, path: string): void {
  for (const axis of ["x", "y"]) {
    const coordinate = `${path}.${axis}`;
    expect(
      Math.abs(numeric(data[axis], coordinate)) <= maxPlanarStuds,
      coordinate,
      `between -${maxPlanarStuds} and ${maxPlanarStuds} studs`,
    );
  }
}

function hasPose(data: Record<string, unknown>, path: string): void {
  hasPoint(data, path);
  numeric(data.angle, `${path}.angle`);
}

function hasDimensions(data: Record<string, unknown>, path: string): void {
  for (const field of ["width", "depth"]) {
    const dimension = `${path}.${field}`;
    const size = numeric(data[field], dimension);
    expect(
      size > 0 && size <= maxPlanarStuds,
      dimension,
      `positive and at most ${maxPlanarStuds} studs`,
    );
  }
}

function edge(value: unknown, path: string): number {
  const index = edges.findIndex((edge) => edge === value);
  expect(index >= 0, path, "north, east, south, or west");
  return index;
}

function hasEndpoint(value: unknown, path: string): void {
  const endpoint = record(value, path);
  string(endpoint.pieceId, `${path}.pieceId`, true);
  string(endpoint.portId, `${path}.portId`, true);
}

function hasPair(value: unknown, path: string): void {
  const pair = record(value, path);
  hasEndpoint(pair.a, `${path}.a`);
  hasEndpoint(pair.b, `${path}.b`);
}

function validateGroup(
  value: unknown,
  group: string,
  validate: (data: Record<string, unknown>, path: string, id: string) => void,
  ids = new Set<string>(),
): Set<string> {
  list(value, group).forEach((value, index) => {
    const path = `${group}[${index}]`;
    const data = record(value, path);
    const id = string(data.id, `${path}.id`, true);
    expect(!ids.has(id), `${path}.id`, "unique within its group");
    ids.add(id);
    validate(data, path, id);
  });
  return ids;
}

function validateVenue(value: unknown): void {
  const venue = record(value, "project.venue");
  hasDimensions(venue, "project.venue");
  validateGroup(venue.keepouts, "project.venue.keepouts", (keepout, path) => {
    string(keepout.name, `${path}.name`, true);
    hasPoint(keepout, path);
    hasDimensions(keepout, path);
  });
}

function validateMember(member: Record<string, unknown>, path: string): void {
  string(member.name, `${path}.name`, true);
  const bring = record(member.bring, `${path}.bring`);
  for (const [key, quantity] of Object.entries(bring)) {
    const entry = `${path}.bring[${JSON.stringify(key)}]`;
    expect(
      physicalPartIds.has(key) || (key.startsWith("ballast:") && key.slice(8).trim().length > 0),
      entry,
      "a commitment for a track part or ballast material",
    );
    expect(
      typeof quantity === "number" && Number.isSafeInteger(quantity) && quantity >= 0,
      entry,
      "a nonnegative safe integer",
    );
  }
}

function validateSectionExit(exit: Record<string, unknown>, path: string): void {
  string(exit.name, `${path}.name`, true);
  string(exit.tableId, `${path}.tableId`, true);
  edge(exit.edge, `${path}.edge`);
  hasEndpoint(exit.outer, `${path}.outer`);
  hasEndpoint(exit.inner, `${path}.inner`);
}

export function validateProject(value: unknown): asserts value is Project {
  const project = record(value, "project");
  expect(project.version === 2, "project.version", "2");
  string(project.name, "project.name");

  const memberIds = validateGroup(project.members, "project.members", validateMember);
  const exitIds = new Set<string>();
  const sectionIds = validateGroup(project.sections, "project.sections", (section, path) => {
    string(section.name, `${path}.name`, true);
    if (section.memberId !== undefined) {
      expect(
        memberIds.has(string(section.memberId, `${path}.memberId`)),
        `${path}.memberId`,
        "a member ID",
      );
    }
    validateGroup(section.exits, `${path}.exits`, validateSectionExit, exitIds);
  });
  if (project.venue !== undefined) validateVenue(project.venue);

  const layerIds = validateGroup(project.layers, "project.layers", (layer, path) => {
    string(layer.name, `${path}.name`);
    expect(typeof layer.visible === "boolean", `${path}.visible`, "a boolean");
  });
  const tableIds = validateGroup(project.tables, "project.tables", (table, path) => {
    string(table.name, `${path}.name`);
    expect(layerIds.has(string(table.layerId, `${path}.layerId`)), `${path}.layerId`, "a layer ID");
    hasPose(table, path);
    hasDimensions(table, path);
    if (table.nominal !== undefined) string(table.nominal, `${path}.nominal`);
    if (table.niltc !== undefined) {
      expect(
        table.niltc === "straight" || table.niltc === "corner",
        `${path}.niltc`,
        "straight or corner",
      );
    }
    if (table.sectionId !== undefined) {
      expect(
        sectionIds.has(string(table.sectionId, `${path}.sectionId`)),
        `${path}.sectionId`,
        "a section ID",
      );
    }
    const fronts = list(table.fronts, `${path}.fronts`);
    expect(fronts.length <= 2, `${path}.fronts`, "at most two edges");
    const [first, second] = fronts.map((front, index) => edge(front, `${path}.fronts[${index}]`));
    if (first !== undefined && second !== undefined) {
      expect(Math.abs(first - second) % 2 === 1, `${path}.fronts`, "two adjacent edges");
    }
  });
  validateGroup(project.items, "project.items", (item, path, id) => {
    expect(!tableIds.has(id), `${path}.id`, "unique across tables and items");
    expect(layerIds.has(string(item.layerId, `${path}.layerId`)), `${path}.layerId`, "a layer ID");
    if (item.tableId !== undefined) {
      expect(
        tableIds.has(string(item.tableId, `${path}.tableId`)),
        `${path}.tableId`,
        "a table ID",
      );
    }
    hasPose(item, path);
    validateItem(item, path);
  });
  validateGroup(project.seams, "project.seams", (seam, path) => {
    string(seam.tableA, `${path}.tableA`, true);
    string(seam.tableB, `${path}.tableB`, true);
    edge(seam.edgeA, `${path}.edgeA`);
    edge(seam.edgeB, `${path}.edgeB`);
    hasPair(seam.outer, `${path}.outer`);
    hasPair(seam.inner, `${path}.inner`);
    if (seam.exitAId !== undefined) string(seam.exitAId, `${path}.exitAId`, true);
    if (seam.exitBId !== undefined) string(seam.exitBId, `${path}.exitBId`, true);
  });
}

function validateItem(item: Record<string, unknown>, path: string): void {
  switch (item.kind) {
    case "track":
      string(item.partId, `${path}.partId`, true);
      expect(
        Number.isSafeInteger(item.heightPlates),
        `${path}.heightPlates`,
        "a whole plate count",
      );
      if (item.ballast !== undefined) {
        expect(
          ballastStyles.some((style) => style === item.ballast),
          `${path}.ballast`,
          "bare, gray, or pennlug",
        );
      }
      if (item.countBallast !== undefined) {
        expect(typeof item.countBallast === "boolean", `${path}.countBallast`, "a boolean");
      }
      return;
    case "baseplate":
      if (item.name !== undefined) string(item.name, `${path}.name`);
      if (item.color !== undefined) {
        const color = string(item.color, `${path}.color`);
        expect(/^#[0-9a-f]{6}$/i.test(color), `${path}.color`, "a six-digit hex color");
      }
      return;
    case "unresolved":
      string(item.sourceId, `${path}.sourceId`);
      string(item.name, `${path}.name`);
      string(item.reason, `${path}.reason`);
      hasDimensions(item, path);
      if (item.altitude !== undefined) numeric(item.altitude, `${path}.altitude`);
      return;
    default:
      expect(false, `${path}.kind`, "track, baseplate, or unresolved");
  }
}

export function parseProject(text: string): Project {
  const raw: unknown = JSON.parse(text);
  const project = record(raw, "project");
  expect(project.version === 1 || project.version === 2, "project.version", "1 or 2");
  const value = project.version === 1 ? migrateProject(project) : project;
  validateProject(value);
  return value;
}

function migrateProject(project: Record<string, unknown>): Record<string, unknown> {
  const tables = list(project.tables, "project.tables");
  const section = { id: "local", name: "Local", exits: [] };
  return {
    ...project,
    version: 2,
    sections: tables.length ? [section] : [],
    members: [],
    tables: tables.map((value, index) => {
      const table = record(value, `project.tables[${index}]`);
      return { ...table, sectionId: section.id };
    }),
  };
}

export function newProject(): Project {
  return {
    version: 2,
    name: "Untitled layout",
    layers: [{ id: "layout", name: "Layout", visible: true }],
    tables: [],
    items: [],
    seams: [],
    sections: [],
    members: [],
  };
}

function rotate(point: Point, angle: number): Point {
  const radians = (angle % 360) * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

export function composePose(local: Pose, parent: Pose): Pose {
  const offset = rotate(local, parent.angle);
  const angle = (parent.angle % 360) + (local.angle % 360);
  return { x: parent.x + offset.x, y: parent.y + offset.y, angle };
}

export function worldPose(item: ItemBase, tables: readonly Table[]): Pose {
  const table = tables.find(({ id }) => id === item.tableId);
  if (table) return composePose(item, table);
  return { x: item.x, y: item.y, angle: item.angle };
}

export function localPose(world: Pose, parent: Pose): Pose {
  const offset = { x: world.x - parent.x, y: world.y - parent.y };
  const angle = (world.angle % 360) - (parent.angle % 360);
  return { ...rotate(offset, -parent.angle), angle };
}
