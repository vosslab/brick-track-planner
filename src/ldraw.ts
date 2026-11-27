import brickTracksModels from "../data/ldraw/bricktracks_models.json" with { type: "json" };
import { maxOutlineVertices } from "./area_outline";
import { composePose, validateProject } from "./project";
import { fallbackTrackModel, fallbackTrackModelName } from "./ldraw_parts";
import type { Catalog, Edge, Item, Layer, Part, Pose, Project, TrackItem } from "./project";

type Mapping = {
  filename: string;
  origin: Pose;
  baseY: number;
  color: number;
  submodel?: () => string;
};

// Origins are measured in the planner's local studs, including the DAT's rotation.
// Plastic LEGO anchors: 53401 and 53400 end sleepers. Their underside is at Y=8 LDU.
// BrickTracks anchors: s/2865s04.dat connector references in Gale's L-Gauge DATs.
const mappings = new Map<string, Mapping>([
  [
    "lego:rc-s16",
    { filename: "53401.dat", origin: { x: 0, y: 0, angle: 0 }, baseY: -8, color: 72 },
  ],
  [
    "lego:rc-r40",
    {
      filename: "53400.dat",
      origin: { x: -0.383887097, y: -0.606411228, angle: 11.25 },
      baseY: -8,
      color: 72,
    },
  ],
  [
    "bricktracks:r104",
    {
      filename: "BrickTracksR104.dat",
      origin: { x: 9.399214163, y: 3.022402515, angle: -78.75 },
      baseY: 0,
      color: 72,
      submodel: (): string => brickTracksModels["BrickTracksR104.dat"].join("\n"),
    },
  ],
  [
    "bricktracks:r120",
    {
      filename: "BrickTracksR120.dat",
      origin: { x: 10.721886486, y: 3.387534823, angle: -78.75 },
      baseY: 0,
      color: 72,
      submodel: (): string => brickTracksModels["BrickTracksR120.dat"].join("\n"),
    },
  ],
]);

function modelFor(part: Part): Mapping {
  return (
    mappings.get(part.id) ?? {
      filename: fallbackTrackModelName(part),
      origin: { x: 0, y: 0, angle: 0 },
      baseY: -8,
      color: 72,
      submodel: (): string => fallbackTrackModel(part).join("\n"),
    }
  );
}

function catalogPart(parts: Map<string, Part>, id: string): Part {
  const part = parts.get(id);
  if (!part) throw new Error(`Track part ${id} is unavailable in this catalog.`);
  return part;
}

function partReference(pose: Pose, mapping: Mapping): string {
  const origin = composePose(mapping.origin, pose);
  const radians = (origin.angle % 360) * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // LDraw top view has +X right and +Z up. The planner's downward Y maps to -Z.
  const transform = [
    origin.x * 20,
    mapping.baseY,
    -origin.y * 20,
    cos,
    0,
    sin,
    0,
    1,
    0,
    -sin,
    0,
    cos,
  ];
  const coordinates = transform.map(ldrawNumber).join(" ");
  return `1 ${mapping.color} ${coordinates} ${mapping.filename}`;
}

const mainFile = "0 FILE brick-track-plan.ldr";
const format = "0 !BRICKTRACK";
const absent = "-";
export const MAX_TRACK_PLAN_FILE_BYTES = 8 * 1024 * 1024;

function text(value: string | undefined): string {
  return value === undefined ? absent : `@${encodeURIComponent(value)}`;
}

function readText(value: string, field: string): string | undefined {
  if (value === absent) return undefined;
  if (!value.startsWith("@")) throw new Error(`Invalid Brick Track ${field}.`);
  try {
    return decodeURIComponent(value.slice(1));
  } catch {
    throw new Error(`Invalid Brick Track ${field}.`);
  }
}

function requiredText(value: string, field: string): string {
  const decoded = readText(value, field);
  if (!decoded) throw new Error(`Invalid Brick Track ${field}.`);
  return decoded;
}

function numeric(value: string, field: string): number {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
    throw new Error(`Invalid Brick Track ${field}.`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid Brick Track ${field}.`);
  return result;
}

function boolean(value: string, field: string): boolean {
  if (value === "1") return true;
  if (value === "0") return false;
  throw new Error(`Invalid Brick Track ${field}.`);
}

function ldrawNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Track placement exceeds LDraw numeric range.");
  const result = value.toFixed(12).replace(/\.?0+$/, "");
  return result === "-0" ? "0" : result;
}

type TrackPose = Pick<TrackItem, "x" | "y" | "angle">;

function readReference(line: string, mapping: Mapping): TrackPose {
  const fields = line.trim().split(/\s+/);
  if (fields.length !== 15 || fields[0] !== "1")
    throw new Error("Each Brick Track record needs one LDraw type-1 placement.");
  const x = numeric(fields[2]!, "LDraw x");
  const y = numeric(fields[3]!, "LDraw y");
  const z = numeric(fields[4]!, "LDraw z");
  const a = numeric(fields[5]!, "LDraw matrix");
  const b = numeric(fields[6]!, "LDraw matrix");
  const c = numeric(fields[7]!, "LDraw matrix");
  const d = numeric(fields[8]!, "LDraw matrix");
  const e = numeric(fields[9]!, "LDraw matrix");
  const f = numeric(fields[10]!, "LDraw matrix");
  const g = numeric(fields[11]!, "LDraw matrix");
  const h = numeric(fields[12]!, "LDraw matrix");
  const i = numeric(fields[13]!, "LDraw matrix");
  const tolerance = 0.000_01;
  if (
    Math.abs(b) > tolerance ||
    Math.abs(d) > tolerance ||
    Math.abs(f) > tolerance ||
    Math.abs(h) > tolerance ||
    Math.abs(e - 1) > tolerance ||
    Math.abs(a - i) > tolerance ||
    Math.abs(c + g) > tolerance ||
    Math.abs(a * a + c * c - 1) > tolerance
  )
    throw new Error("Brick Track placements must use a level rigid transform.");
  if (fields[14] !== mapping.filename || fields[1] !== String(mapping.color))
    throw new Error("Brick Track placement does not match its track part.");
  const origin = { x: x / 20, y: -z / 20, angle: (Math.atan2(c, a) * 180) / Math.PI };
  const angle = origin.angle - mapping.origin.angle;
  const radians = (angle * Math.PI) / 180;
  const offset = mapping.origin;
  if (Math.abs(mapping.baseY - y) > tolerance)
    throw new Error("Brick Track placements must be flat.");
  // Inverting the calibrated part origin can move a coordinate a few ULPs past a legal boundary.
  const px = origin.x - (offset.x * Math.cos(radians) - offset.y * Math.sin(radians));
  const py = origin.y - (offset.x * Math.sin(radians) + offset.y * Math.cos(radians));
  return {
    x: Number(px.toFixed(9)),
    y: Number(py.toFixed(9)),
    angle: Number(angle.toFixed(9)),
  };
}
function record(fields: string[], expected: number, kind: string): void {
  if (fields.length !== expected) throw new Error(`Invalid Brick Track ${kind} record.`);
}

/**
 * Writes the planner's editable LDraw file. Standard type-1 records make
 * mapped parts visible in other LDraw applications. The comment records retain
 * planner-only area, layer, connection, and catalog details for reopening.
 */
export function saveTrackPlan(project: Project, catalog: Catalog): string {
  validateProject(project);
  const parts = new Map(catalog.parts.map((part) => [part.id, part]));
  const submodels = new Map<string, () => string>();
  const lines = [
    mainFile,
    "0 Brick Track Planner track plan",
    "0 Name: brick-track-plan.ldr",
    "0 Author: Brick Track Planner",
    `${format} PROJECT ${text(project.name)}`,
    `${format} AREA ${project.area.width} ${project.area.depth} ${text(project.area.niltc)}`,
  ];
  if (project.area.outline) {
    lines.push(
      `${format} OUTLINE ${project.area.outline.map(({ x, y }) => `${x} ${y}`).join(" ")}`,
    );
  }
  for (const front of project.area.fronts) lines.push(`${format} FRONT ${text(front)}`);
  for (const [edge, coordinate] of Object.entries(project.area.frontLines ?? {}))
    lines.push(`${format} FRONT_LINE ${text(edge)} ${coordinate}`);
  for (const layer of project.layers) {
    lines.push(`${format} LAYER ${text(layer.id)} ${text(layer.name)} ${layer.visible ? 1 : 0}`);
  }
  for (const item of project.items) {
    if (item.kind === "track") {
      lines.push(
        `${format} TRACK ${text(item.id)} ${text(item.layerId)} ${text(item.partId)} ${text(item.groupId)} ${text(item.arrangementId)} ${text(item.ballast)} ${item.countBallast === undefined ? absent : item.countBallast ? 1 : 0}`,
      );
      const part = catalogPart(parts, item.partId);
      const model = modelFor(part);
      if (model.submodel) submodels.set(model.filename, model.submodel);
      lines.push(partReference(item, model));
    } else {
      lines.push(
        `${format} UNRESOLVED ${text(item.id)} ${text(item.layerId)} ${text(item.sourceId)} ${text(item.name)} ${item.x} ${item.y} ${item.angle} ${item.width} ${item.depth} ${text(item.reason)}`,
      );
    }
  }
  for (const contents of submodels.values()) lines.push(contents().replace(/\n/g, "\r\n"));
  lines.push("0 NOFILE");
  const result = `${lines.join("\r\n")}\r\n`;
  if (new TextEncoder().encode(result).byteLength > MAX_TRACK_PLAN_FILE_BYTES)
    throw new Error("Brick Track LDraw files must be 8 MiB or smaller.");
  return result;
}

/** Opens a planner-written LDraw file. General-purpose LDraw import is deliberately unsupported. */
export function openTrackPlan(source: string, catalog: Catalog): Project {
  if (new TextEncoder().encode(source).byteLength > MAX_TRACK_PLAN_FILE_BYTES) {
    throw new Error("Brick Track LDraw files must be 8 MiB or smaller.");
  }
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== mainFile)
    throw new Error("Open supports Brick Track Planner LDraw files only.");
  const parts = new Map(catalog.parts.map((part) => [part.id, part]));
  const expectedSubfiles = new Set<string>();
  let inRoot = true;
  let ended = false;
  let name: string | undefined;
  let area: Project["area"] | undefined;
  const layers: Layer[] = [];
  const items: Item[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    if (ended) throw new Error("Unexpected content after the LDraw model.");
    if (line === "0 NOFILE") {
      ended = true;
      continue;
    }
    if (line.startsWith("0 FILE ")) {
      const filename = line.slice(7);
      if (!expectedSubfiles.delete(filename))
        throw new Error(`Unexpected LDraw submodel: ${filename}`);
      inRoot = false;
      continue;
    }
    if (!inRoot) {
      if (line.startsWith(format) || !/^[0-5](?:\s|$)/.test(line))
        throw new Error("Unexpected content in an embedded track model.");
      continue;
    }
    if (!line.startsWith(format + " ")) {
      if (!/^0(?:\s|$)/.test(line))
        throw new Error("Each LDraw placement needs a track record in the main model.");
      continue;
    }
    const fields = line.split(/\s+/);
    const kind = fields[2]!;
    switch (kind) {
      case "PROJECT":
        record(fields, 4, kind);
        if (name !== undefined)
          throw new Error("Brick Track LDraw file has duplicate project metadata.");
        name = readText(fields[3]!, "project name");
        if (name === undefined) throw new Error("Invalid Brick Track project name.");
        break;
      case "AREA": {
        record(fields, 6, kind);
        if (area) throw new Error("Brick Track LDraw file has duplicate area metadata.");
        area = {
          width: numeric(fields[3]!, "area width"),
          depth: numeric(fields[4]!, "area depth"),
          fronts: [],
        };
        const niltc = readText(fields[5]!, "area assignment");
        if (niltc !== undefined) area.niltc = niltc as Project["area"]["niltc"];
        break;
      }
      case "FRONT":
        record(fields, 4, kind);
        if (!area) throw new Error("Brick Track fronts must follow the area.");
        area.fronts.push(requiredText(fields[3]!, "front") as Edge);
        break;
      case "OUTLINE": {
        const count = (fields.length - 3) / 2;
        if (
          !area ||
          area.outline ||
          !Number.isInteger(count) ||
          count < 4 ||
          count > maxOutlineVertices
        )
          throw new Error("Invalid Brick Track area outline.");
        area.outline = Array.from({ length: count }, (_, vertex) => ({
          x: numeric(fields[3 + vertex * 2]!, "outline x"),
          y: numeric(fields[4 + vertex * 2]!, "outline y"),
        }));
        break;
      }
      case "FRONT_LINE": {
        record(fields, 5, kind);
        if (!area?.outline) throw new Error("Brick Track front lines must follow the outline.");
        const front = requiredText(fields[3]!, "front line") as Edge;
        if (
          !area.fronts.includes(front) ||
          Object.prototype.hasOwnProperty.call(area.frontLines ?? {}, front)
        )
          throw new Error("Invalid or duplicate Brick Track front line.");
        (area.frontLines ??= {})[front] = numeric(fields[4]!, "front line coordinate");
        break;
      }
      case "LAYER":
        record(fields, 6, kind);
        layers.push({
          id: requiredText(fields[3]!, "layer id"),
          name: requiredText(fields[4]!, "layer name"),
          visible: boolean(fields[5]!, "layer visibility"),
        });
        break;
      case "TRACK": {
        record(fields, 10, kind);
        const partId = requiredText(fields[5]!, "track part");
        const part = catalogPart(parts, partId);
        const model = modelFor(part);
        const pose = readReference(lines[index + 1] ?? "", model);
        if (model.submodel) expectedSubfiles.add(model.filename);
        index += 1;
        const groupId = readText(fields[6]!, "track group");
        const arrangementId = readText(fields[7]!, "track arrangement");
        const ballast = readText(fields[8]!, "track ballast") as TrackItem["ballast"];
        items.push({
          id: requiredText(fields[3]!, "track id"),
          layerId: requiredText(fields[4]!, "track layer"),
          kind: "track",
          partId,
          ...pose,
          ...(groupId === undefined ? {} : { groupId }),
          ...(arrangementId === undefined ? {} : { arrangementId }),
          ...(ballast === undefined ? {} : { ballast }),
          ...(fields[9]! === absent
            ? {}
            : { countBallast: boolean(fields[9]!, "track ballast count") }),
        });
        break;
      }
      case "UNRESOLVED":
        record(fields, 13, kind);
        items.push({
          id: requiredText(fields[3]!, "unresolved id"),
          layerId: requiredText(fields[4]!, "unresolved layer"),
          kind: "unresolved",
          sourceId: requiredText(fields[5]!, "unresolved source"),
          name: requiredText(fields[6]!, "unresolved name"),
          x: numeric(fields[7]!, "unresolved x"),
          y: numeric(fields[8]!, "unresolved y"),
          angle: numeric(fields[9]!, "unresolved angle"),
          width: numeric(fields[10]!, "unresolved width"),
          depth: numeric(fields[11]!, "unresolved depth"),
          reason: requiredText(fields[12]!, "unresolved reason"),
        });
        break;
      default:
        throw new Error("Unsupported Brick Track metadata.");
    }
  }
  if (name === undefined || !area)
    throw new Error("Brick Track LDraw file is missing project metadata.");
  if (!ended || expectedSubfiles.size) throw new Error("Brick Track LDraw file is incomplete.");
  const project: Project = { name, area, layers, items };
  validateProject(project);
  return project;
}
