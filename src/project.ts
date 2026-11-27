import catalog from "../data/catalog.json" with { type: "json" };
import {
  edgeCoordinate,
  maxOutlineVertices,
  outlineBounds,
  outlineEdges,
  validOutline,
} from "./area_outline";

export type Point = { x: number; y: number };
export type Pose = Point & { angle: number };
const edges = ["north", "east", "south", "west"] as const;
const ballastStyles = ["bare", "gray", "pennlug"] as const;
const niltcModes = ["straight", "corner"] as const;
export const maxPlanarStuds = 100_000;
export const maxDesignAreaStuds = 4_096;
const maxLayers = 1_000;
export const maxItems = 10_000;
export const railTolerance = 0.05;
export const joinAngle = 0.25;
export type Edge = (typeof edges)[number];
export type NiltcMode = (typeof niltcModes)[number];
export type BallastStyle = (typeof ballastStyles)[number];
export type Layer = { id: string; name: string; visible: boolean };
export type Endpoint = { pieceId: string; portId: string };
export type DesignArea = {
  width: number;
  depth: number;
  outline?: Point[];
  frontLines?: Partial<Record<Edge, number>>;
  fronts: Edge[];
  niltc?: NiltcMode;
};
export type ItemBase = Pose & { id: string; layerId: string };
export type TrackItem = ItemBase & {
  kind: "track";
  partId: string;
  groupId?: string;
  arrangementId?: string;
  ballast?: BallastStyle;
  countBallast?: boolean;
};
export type UnresolvedItem = ItemBase & {
  kind: "unresolved";
  sourceId: string;
  name: string;
  width: number;
  depth: number;
  reason: string;
};
export type Item = TrackItem | UnresolvedItem;
export type Project = {
  name: string;
  area: DesignArea;
  layers: Layer[];
  items: Item[];
};

/** Create browser-safe stable ids without time-derived fallback values. */
export function projectId(prefix: string): string {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return `${prefix}-${Array.from(values, (value) => value.toString(36)).join("-")}`;
}

export function visibleTrackItems(project: Project): TrackItem[] {
  const visible = new Set(project.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  return project.items.filter(
    (item): item is TrackItem => item.kind === "track" && visible.has(item.layerId),
  );
}

/** Imported plans can hide every source layer; create a visible, non-destructive working layer. */
export function ensureVisibleWorkingLayer(project: Project): { project: Project; layerId: string } {
  const layer = project.layers.find((candidate) => candidate.visible);
  if (layer) return { project, layerId: layer.id };
  const working = { id: projectId("layer"), name: "Working layer", visible: true };
  return { project: { ...project, layers: [...project.layers, working] }, layerId: working.id };
}

export type Port = Pose & { id: string; type: string };
export type PartRoute = {
  from: string;
  to: string;
  path: number;
  radius?: number;
  event?: "switch" | "curve" | "crossing";
};
export type PartAlias = {
  key: string;
  offsetX?: number;
  offsetY?: number;
  angle?: number;
  sourceHull?: Point[];
};
export type InventoryComponent = { id: string; name: string; quantity: number };
export const partCategories = [
  "straights",
  "curves",
  "switches",
  "connectors",
  "crossings",
  "dead-ends",
] as const;
export type PartCategory = (typeof partCategories)[number];
export type PartBrowse = {
  category: PartCategory;
  label: string;
  order?: number;
  group?: string;
  preferred?: true;
  advanced?: true;
  approach?: string;
  description?: string;
};
export type Part = {
  id: string;
  brand: string;
  name: string;
  radius?: number;
  sweep?: number;
  ports: Port[];
  paths: Point[][];
  routes: PartRoute[];
  footprint: Point[];
  aliases?: PartAlias[];
  /** Physical elements represented by a source-supplied assembled track record. */
  inventory?: InventoryComponent[];
  /** Member-facing catalog placement metadata. */
  browse?: PartBrowse;
};
export type Kit = {
  id: string;
  brand: string;
  name: string;
  aliases?: string[];
  notes?: string;
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
function hasDimensions(
  data: Record<string, unknown>,
  path: string,
  maximum = maxPlanarStuds,
): void {
  for (const field of ["width", "depth"]) {
    const size = numeric(data[field], `${path}.${field}`);
    expect(
      size > 0 && size <= maximum,
      `${path}.${field}`,
      `positive and at most ${maximum} studs`,
    );
  }
}
function edge(value: unknown, path: string): number {
  const index = edges.indexOf(value as Edge);
  expect(index >= 0, path, "north, east, south, or west");
  return index;
}
function validateGroup(
  value: unknown,
  group: string,
  validate: (data: Record<string, unknown>, path: string, id: string) => void,
): Set<string> {
  const ids = new Set<string>();
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
function validateArea(value: unknown): void {
  const area = record(value, "project.area");
  hasDimensions(area, "project.area", maxDesignAreaStuds);
  const fronts = list(area.fronts, "project.area.fronts");
  expect(fronts.length <= 2, "project.area.fronts", "at most two edges");
  const [first, second] = fronts.map((front, index) =>
    edge(front, `project.area.fronts[${index}]`),
  );
  expect(new Set(fronts).size === fronts.length, "project.area.fronts", "unique edges");
  if (first !== undefined && second !== undefined) {
    expect(Math.abs(first - second) % 2 === 1, "project.area.fronts", "two adjacent edges");
  }
  if (area.niltc !== undefined) {
    expect(
      niltcModes.includes(area.niltc as NiltcMode),
      "project.area.niltc",
      "straight or corner",
    );
  }
  const expectedFronts = area.niltc === "straight" ? 1 : area.niltc === "corner" ? 2 : 0;
  expect(
    fronts.length === expectedFronts,
    "project.area.fronts",
    `${expectedFronts} public edge(s) for this assignment`,
  );
  if (area.outline === undefined && area.frontLines === undefined) return;
  const vertices = list(area.outline, "project.area.outline");
  expect(vertices.length <= maxOutlineVertices, "project.area.outline", "at most 256 vertices");
  const outline = vertices.map((value, index) => {
    const path = `project.area.outline[${index}]`;
    const point = record(value, path);
    hasPoint(point, path);
    return point as Point;
  });
  expect(validOutline(outline), "project.area.outline", "one clockwise right-angle outline");
  const { left, right, top, bottom } = outlineBounds(outline);
  expect(
    Math.abs(right - left - (area.width as number)) < 1e-8 &&
      Math.abs(bottom - top - (area.depth as number)) < 1e-8,
    "project.area.outline",
    "bounds matching the area dimensions",
  );
  const lines =
    area.frontLines === undefined ? {} : record(area.frontLines, "project.area.frontLines");
  expect(
    Object.keys(lines).length === fronts.length,
    "project.area.frontLines",
    "one line per public edge",
  );
  const segments = outlineEdges(outline);
  for (const [side, coordinate] of Object.entries(lines)) {
    expect(
      fronts.includes(side) &&
        segments.some(
          (segment) =>
            segment.side === side && edgeCoordinate(segment.start, segment.side) === coordinate,
        ),
      `project.area.frontLines.${side}`,
      "a matching public boundary segment",
    );
  }
}
function validateItem(item: Record<string, unknown>, path: string): void {
  switch (item.kind) {
    case "track":
      expect(
        physicalPartIds.has(string(item.partId, `${path}.partId`, true)),
        `${path}.partId`,
        "a catalog track part",
      );
      if (item.groupId !== undefined) string(item.groupId, `${path}.groupId`, true);
      if (item.arrangementId !== undefined)
        string(item.arrangementId, `${path}.arrangementId`, true);
      if (item.ballast !== undefined) {
        expect(
          ballastStyles.includes(item.ballast as BallastStyle),
          `${path}.ballast`,
          "bare, gray, or pennlug",
        );
      }
      if (item.countBallast !== undefined)
        expect(typeof item.countBallast === "boolean", `${path}.countBallast`, "a boolean");
      return;
    case "unresolved":
      string(item.sourceId, `${path}.sourceId`, true);
      string(item.name, `${path}.name`, true);
      string(item.reason, `${path}.reason`, true);
      hasDimensions(item, path);
      return;
    default:
      expect(false, `${path}.kind`, "track or unresolved");
  }
}
export function validateProject(value: unknown): asserts value is Project {
  const project = record(value, "project");
  string(project.name, "project.name");
  validateArea(project.area);
  const layerIds = validateGroup(project.layers, "project.layers", (layer, path) => {
    string(layer.name, `${path}.name`, true);
    expect(typeof layer.visible === "boolean", `${path}.visible`, "a boolean");
  });
  expect(
    layerIds.size > 0 && layerIds.size <= maxLayers,
    "project.layers",
    `between 1 and ${maxLayers} layers`,
  );
  expect(
    list(project.items, "project.items").length <= maxItems,
    "project.items",
    `at most ${maxItems} items`,
  );
  validateGroup(project.items, "project.items", (item, path) => {
    expect(
      layerIds.has(string(item.layerId, `${path}.layerId`, true)),
      `${path}.layerId`,
      "a layer ID",
    );
    hasPose(item, path);
    validateItem(item, path);
  });
}
export function newProject(): Project {
  return {
    name: "Untitled layout",
    area: { width: 192, depth: 128, fronts: [] },
    layers: [{ id: "layout", name: "Layout", visible: true }],
    items: [],
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
  return {
    x: parent.x + offset.x,
    y: parent.y + offset.y,
    angle: (parent.angle % 360) + (local.angle % 360),
  };
}
/** Places a part so its local rail port meets the target rail port face-to-face. */
export function poseConnectingPorts(incoming: Pose, target: Pose): Pose {
  const angle = (((target.angle + 180 - incoming.angle) % 360) + 360) % 360;
  const offset = composePose(incoming, { x: 0, y: 0, angle });
  return { x: target.x - offset.x, y: target.y - offset.y, angle };
}
/** Smallest angular distance, independent of turn count or direction. */
export function angleGap(first: number, second: number): number {
  return Math.abs(((((first - second) % 360) + 540) % 360) - 180);
}
