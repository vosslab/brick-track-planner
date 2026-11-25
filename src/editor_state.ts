import { evaluate } from "./engine";
import type { Analysis } from "./engine";
import { composePose, localPose, worldPose } from "./project";
import type { Catalog, Edge, Item, Part, Point, Pose, Project, Table, TrackItem } from "./project";

export const edges: readonly Edge[] = ["north", "east", "south", "west"];

export const presets: Record<string, { width: number; depth: number; name: string }> = {
  "30x40": { width: 96, depth: 128, name: "NILTC 30 x 40 in" },
  "40x40": { width: 128, depth: 128, name: "NILTC 40 x 40 in" },
  "40x60": { width: 128, depth: 192, name: "NILTC 40 x 60 in" },
};

export function newId(prefix: string): string {
  const random =
    crypto.randomUUID?.() ??
    Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
      value.toString(16).padStart(8, "0"),
    ).join("");
  return `${prefix}-${random}`;
}

export function layerId(project: Project): string {
  const layer = project.layers.find(({ visible }) => visible) ?? project.layers[0];
  if (!layer) {
    project.layers.push({ id: "layout", name: "Layout", visible: true });
    return "layout";
  }
  layer.visible = true;
  return layer.id;
}

export function addTable(
  project: Project,
  preset: string,
  name: string,
  width: number,
  depth: number,
): Table {
  const standard = presets[preset];
  let x = 0;
  for (const table of project.tables) {
    for (const left of [0, table.width]) {
      for (const top of [0, table.depth]) {
        x = Math.max(x, composePose({ x: left, y: top, angle: 0 }, table).x);
      }
    }
  }
  const table: Table = {
    id: newId("table"),
    layerId: layerId(project),
    name,
    x,
    y: 0,
    angle: 0,
    width: standard?.width ?? width,
    depth: standard?.depth ?? depth,
    fronts: ["south"],
    nominal: standard?.name,
  };
  project.tables.push(table);
  return table;
}

function positionItem(project: Project, item: Item, pose: Pose): void {
  const table = project.tables.find(({ id }) => id === item.tableId);
  Object.assign(item, table ? localPose(pose, table) : pose);
}

export function moveSelection(
  project: Project,
  ids: ReadonlySet<string>,
  from: Point,
  to: Point,
  rotation = 0,
): string[] {
  const transform = { x: to.x, y: to.y, angle: rotation };
  const anchored = project.items.filter((item) => item.tableId && ids.has(item.tableId));
  const affected = project.items.filter((item) => ids.has(item.id) && !anchored.includes(item));
  const movedIds = [...affected, ...anchored].map(({ id }) => id);
  const shift = (pose: Pose): Pose =>
    composePose(
      { x: pose.x - from.x, y: pose.y - from.y, angle: rotation ? pose.angle % 360 : pose.angle },
      transform,
    );
  for (const table of project.tables) {
    if (ids.has(table.id)) Object.assign(table, shift(table));
  }
  for (const item of affected) positionItem(project, item, shift(worldPose(item, project.tables)));
  return movedIds;
}

export function placeTrack(
  project: Project,
  catalog: Catalog,
  placement: { id: string; kind: "part" | "kit"; angle: number },
  position: Point,
  tableId?: string,
): string[] {
  const pose = { ...position, angle: placement.angle };
  const localParts =
    placement.kind === "part"
      ? [{ partId: placement.id, x: 0, y: 0, angle: 0 }]
      : (catalog.kits.find(({ id }) => id === placement.id)?.parts ?? []);
  const layer = project.tables.find(({ id }) => id === tableId)?.layerId ?? layerId(project);
  const ids: string[] = [];
  for (const local of localParts) {
    const world = composePose(local, pose);
    const track: TrackItem = {
      kind: "track",
      id: newId("track"),
      partId: local.partId,
      layerId: layer,
      tableId,
      heightPlates: 0,
      ...world,
    };
    positionItem(project, track, world);
    project.items.push(track);
    ids.push(track.id);
  }
  return ids;
}

export function deleteSelection(project: Project, ids: ReadonlySet<string>): void {
  const removedTables = new Set(project.tables.filter(({ id }) => ids.has(id)).map(({ id }) => id));
  project.items = project.items.filter(({ id }) => !ids.has(id));
  for (const item of project.items) {
    if (item.tableId && removedTables.has(item.tableId)) {
      Object.assign(item, worldPose(item, project.tables));
      delete item.tableId;
    }
  }
  project.tables = project.tables.filter(({ id }) => !removedTables.has(id));
  project.seams = project.seams.filter(
    ({ tableA, tableB }) => !removedTables.has(tableA) && !removedTables.has(tableB),
  );
}

export function turnoutCommon(part?: Part): Part["ports"][number] | undefined {
  if (!part || part.ports.length < 3 || part.ports.some(({ type }) => type !== "regular")) return;
  return part.ports.find(({ id }) => id === "common");
}

export function swapTurnout(project: Project, catalog: Catalog, id: string, next: string): void {
  const item = project.items.find(({ id: itemId }) => itemId === id);
  if (item?.kind !== "track") return;
  const previous = catalog.parts.find(({ id }) => id === item.partId);
  const replacement = catalog.parts.find(({ id }) => id === next);
  const previousPort = turnoutCommon(previous);
  const nextPort = turnoutCommon(replacement);
  if (!previousPort || !nextPort || previous?.brand !== replacement?.brand) {
    throw new Error("Choose a compatible single-body turnout.");
  }
  const current = worldPose(item, project.tables);
  const common = composePose(previousPort, current);
  const angle = common.angle - nextPort.angle;
  const offset = composePose(nextPort, { x: 0, y: 0, angle });
  positionItem(project, item, { x: common.x - offset.x, y: common.y - offset.y, angle });
  item.partId = next;
}

export class EditorState {
  readonly selection = new Set<string>();
  readonly #undo: Project[] = [];
  readonly #redo: Project[] = [];
  #analysis: Analysis;

  constructor(project: Project) {
    this.#analysis = evaluate(project);
  }

  get analysis(): Analysis {
    return this.#analysis;
  }

  get project(): Project {
    return this.#analysis.project;
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  commit(project: Project, snap?: { pieceIds: string[]; radius: number }): void {
    const after = evaluate(project, snap?.pieceIds.length ? snap : undefined);
    if (JSON.stringify(after.project) === JSON.stringify(this.project)) return;
    this.#undo.push(this.project);
    this.#redo.length = 0;
    this.#analysis = after;
  }

  change(direction: "undo" | "redo"): void {
    const source = direction === "undo" ? this.#undo : this.#redo;
    const destination = direction === "undo" ? this.#redo : this.#undo;
    const previous = source[source.length - 1];
    if (!previous) return;
    const analysis = evaluate(previous);
    destination.push(this.project);
    source.pop();
    this.#analysis = analysis;
    const ids = [...this.project.tables, ...this.project.items].map(({ id }) => id);
    for (const id of this.selection) {
      if (!ids.includes(id)) this.selection.delete(id);
    }
  }
}
