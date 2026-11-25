import { composePose, localPose, newProject } from "./project";
import type {
  Catalog,
  Item,
  Kit,
  Layer,
  Part,
  Point,
  Pose,
  Project,
  Table,
  TrackItem,
} from "./project";

export const MAX_BLUEBRICK_FILE_BYTES = 8 * 1024 * 1024;
const MAX_LAYERS = 1_000;
const MAX_BRICKS = 10_000;
const MAX_TABLES = 1_000;

// Width and depth from the stock BlueBrick 1.9.2 images at eight pixels per stud.
const STOCK_TABLES = new Map<string, readonly [number, number]>([
  ["TABLE125X75", [125, 75]],
  ["TABLE150X75", [150, 75]],
  ["TABLE187X93", [187.5, 93.75]],
  ["TABLE204X102", [200, 100]],
  ["TABLE204X128", [200, 125]],
  ["TABLE230X102", [225, 100]],
  ["TABLE230X128", [225, 125]],
  ["TABLE256X128", [250, 125]],
  ["TABLE64X64", [64, 64]],
  ["TABLE96X152", [152.375, 95.25]],
  ["TABLE96X190", [190.5, 95.25]],
  ["TABLE96X192", [192, 96]],
  ["TABLE96X228", [228.625, 95.25]],
  ["TABLE96X304", [304.75, 95.25]],
  ["TABLE96X32", [96, 32]],
  ["TABLE96X64", [96, 64]],
  ["TABLE96X96", [96, 96]],
]);

const BASEPLATE_COLORS = new Map([
  ["3811.1", "#0055BF"],
  ["3811.2", "#237841"],
  ["3811.4", "#C91A09"],
  ["3811.6", "#583927"],
  ["3811.7", "#9BA19D"],
  ["3811.10", "#4B9F4A"],
  ["3811.15", "#FFFFFF"],
  ["3811.19", "#E4CD9E"],
  ["3811.70", "#582A12"],
]);

type SourceBrick = {
  id: string;
  layerId: string;
  sourceId: string;
  center: Pose;
  width: number;
  depth: number;
  altitude?: number;
};

type PartAlias = NonNullable<Part["aliases"]>[number];
type AliasTarget = { part: Part; alias: PartAlias } | { kit: Kit };

function xmlField(element: Element, name: string): string | undefined {
  return element.querySelector(`:scope > ${name}`)?.textContent?.trim();
}

function parseNumber(raw: string | undefined, field: string): number {
  const value = Number(raw);
  if (!raw || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) || !Number.isFinite(value)) {
    throw new Error(`Invalid BlueBrick ${field}.`);
  }
  return value;
}

function asciiUpper(text: string): string {
  return text.replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

function rotate(point: Point, angle: number): Point {
  const radians = ((angle % 360) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function rotatedBoundsCenter(points: readonly Point[], angle: number): Point {
  if (!points.length) return { x: 0, y: 0 };
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    const rotated = rotate(point, angle);
    left = Math.min(left, rotated.x);
    right = Math.max(right, rotated.x);
    top = Math.min(top, rotated.y);
    bottom = Math.max(bottom, rotated.y);
  }
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

function sourcePivot(center: Pose, hull: readonly Point[] = []): Pose {
  // BlueBrick saves the rotated hull bounds, while its connection points use the sprite pivot.
  const shift = rotatedBoundsCenter(hull, center.angle);
  return { x: center.x - shift.x, y: center.y - shift.y, angle: center.angle };
}

function readBrick(element: Element, id: string, layerId: string): SourceBrick {
  const sourceId = xmlField(element, "PartNumber");
  if (!sourceId) throw new Error(`A brick in ${layerId} has no BlueBrick part number.`);
  const display = element.querySelector(":scope > DisplayArea");
  if (!display) throw new Error(`BlueBrick part ${sourceId} has no DisplayArea.`);
  const x = parseNumber(xmlField(display, "X"), "DisplayArea X");
  const y = parseNumber(xmlField(display, "Y"), "DisplayArea Y");
  const width = parseNumber(xmlField(display, "Width"), "DisplayArea width");
  const depth = parseNumber(xmlField(display, "Height"), "DisplayArea height");
  const angle = parseNumber(xmlField(element, "Orientation"), "orientation");
  const rawAltitude = xmlField(element, "Altitude");
  const altitude = rawAltitude === undefined ? undefined : parseNumber(rawAltitude, "altitude");
  const center = { x: x + width / 2, y: y + depth / 2, angle: angle % 360 };
  if (width <= 0 || depth <= 0 || !Number.isFinite(center.x) || !Number.isFinite(center.y)) {
    throw new Error(`Invalid BlueBrick DisplayArea for ${sourceId}.`);
  }
  return { id, layerId, sourceId, center, width, depth, altitude };
}

function makeTable(brick: SourceBrick, width: number, depth: number): Table {
  const { id, layerId, sourceId, center } = brick;
  return {
    id,
    layerId,
    name: sourceId,
    ...composePose({ x: -width / 2, y: -depth / 2, angle: 0 }, center),
    width,
    depth,
    fronts: [],
  };
}

function assignTable(item: Item, center: Pose, tables: readonly Table[]): Item {
  const tolerance = 1e-8;
  let owner: Table | undefined;
  for (const table of tables) {
    const local = localPose(center, table);
    if (
      local.x > tolerance &&
      local.x < table.width - tolerance &&
      local.y > tolerance &&
      local.y < table.depth - tolerance
    ) {
      if (owner) return item;
      owner = table;
    }
  }
  if (!owner) return item;
  return { ...item, ...localPose(item, owner), tableId: owner.id };
}

function aliases(catalog: Catalog): Map<string, AliasTarget> {
  const targets = new Map<string, AliasTarget>();
  for (const part of catalog.parts) {
    for (const alias of part.aliases ?? []) {
      targets.set(asciiUpper(alias.key), { part, alias });
    }
  }
  for (const kit of catalog.kits) {
    for (const key of kit.aliases ?? []) {
      targets.set(asciiUpper(key), { kit });
    }
  }
  return targets;
}

function heightInPlates(altitude: number | undefined, preferredY = 0): number {
  // LDraw Y increases downwards. BlueBrick reserves zero for the part's natural height.
  return altitude ? (preferredY - altitude) / 8 : 0;
}

function unresolved(brick: SourceBrick, reason: string): Item {
  const { id, layerId, sourceId, center, width, depth, altitude } = brick;
  return {
    id,
    layerId,
    kind: "unresolved",
    name: sourceId,
    sourceId,
    ...center,
    width,
    depth,
    altitude,
    reason,
  };
}

function readMap(xml: string): Element {
  if (
    xml.length > MAX_BLUEBRICK_FILE_BYTES ||
    new TextEncoder().encode(xml).byteLength > MAX_BLUEBRICK_FILE_BYTES
  ) {
    throw new Error("BlueBrick files must be 8 MiB or smaller.");
  }
  const declarations = /<!--[^]*?-->|<!\[CDATA\[[^]*?\]\]>|<\?[^]*?\?>|<!DOCTYPE\b/gi;
  for (const [tag] of xml.matchAll(declarations)) {
    if (tag.toUpperCase() === "<!DOCTYPE") {
      throw new Error("BlueBrick files with a document type declaration are unsupported.");
    }
  }
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (
    doc.doctype ||
    root.tagName !== "Map" ||
    root.namespaceURI ||
    doc.querySelector("parsererror")
  ) {
    throw new Error("Expected a plain BlueBrick Map XML document.");
  }
  if (xmlField(root, "Version") !== "9") {
    throw new Error("Expected BlueBrick Map version 9.");
  }
  return root;
}

export function importBlueBrick(
  xml: string,
  catalog: Catalog,
): {
  project: Project;
  warnings: string[];
} {
  const root = readMap(xml);
  const sourceLayers = root.querySelector(":scope > Layers");
  if (!sourceLayers) throw new Error("BlueBrick map has no Layers element.");
  const layerElements = sourceLayers.querySelectorAll(":scope > Layer");
  if (layerElements.length > MAX_LAYERS) {
    throw new Error(`BlueBrick maps can contain up to ${MAX_LAYERS} layers.`);
  }
  const warnings: string[] = [];
  const project: Project = {
    ...newProject(),
    name: xmlField(root, "Event") || "BlueBrick layout",
    layers: [],
  };
  const bricks: SourceBrick[] = [];
  let brickCount = 0;
  for (const element of layerElements) {
    const type = element.getAttribute("type");
    const name = xmlField(element, "Name") || "Unnamed layer";
    if (type !== "brick") {
      warnings.push(`Skipped ${type || "unknown"} layer "${name}".`);
      continue;
    }
    const visibility = xmlField(element, "Visible");
    if (visibility !== "true" && visibility !== "false") {
      throw new Error(`Invalid BlueBrick visibility on "${name}".`);
    }
    const layer: Layer = {
      id: `layer-${project.layers.length + 1}`,
      name,
      visible: visibility === "true",
    };
    project.layers.push(layer);
    const sourceBricks = element.querySelector(":scope > Bricks");
    if (!sourceBricks) throw new Error(`BlueBrick brick layer "${name}" has no Bricks element.`);
    for (const source of sourceBricks.querySelectorAll(":scope > Brick")) {
      brickCount += 1;
      if (brickCount > MAX_BRICKS)
        throw new Error(`BlueBrick maps can contain up to ${MAX_BRICKS} bricks.`);
      const brick = readBrick(source, `brick-${brickCount}`, layer.id);
      const dimensions = STOCK_TABLES.get(asciiUpper(brick.sourceId));
      if (dimensions && !brick.altitude) {
        if (project.tables.length === MAX_TABLES) {
          throw new Error(`BlueBrick maps can contain up to ${MAX_TABLES} tables.`);
        }
        project.tables.push(makeTable(brick, ...dimensions));
      } else {
        bricks.push(brick);
      }
    }
  }

  if (project.layers.length === 0) {
    project.layers.push({ id: "layer-1", name: "Layout", visible: true });
  }
  const targets = aliases(catalog);
  const parts = new Map(catalog.parts.map((part) => [part.id, part]));
  for (const brick of bricks) {
    const key = asciiUpper(brick.sourceId);
    const color = BASEPLATE_COLORS.get(key);
    const target = targets.get(key);
    const baseplate = color !== undefined || key === "3811";
    const preferredY = target && "part" in target ? target.alias.preferredY : undefined;
    const heightPlates = heightInPlates(brick.altitude, preferredY);
    const { id, layerId, center } = brick;
    if (target && Number.isSafeInteger(heightPlates)) {
      if ("part" in target) {
        const { alias, part } = target;
        const pose = composePose(
          { x: alias.offsetX ?? 0, y: alias.offsetY ?? 0, angle: alias.angle ?? 0 },
          sourcePivot(center, alias.sourceHull),
        );
        const item: TrackItem = {
          id,
          layerId,
          kind: "track",
          partId: part.id,
          ...pose,
          heightPlates,
        };
        project.items.push(assignTable(item, center, project.tables));
      } else {
        const source = sourcePivot(center, target.kit.sourceHull);
        const offset = target.kit.sourceOffset;
        const pivot = offset ? composePose({ ...offset, angle: 0 }, source) : source;
        for (const [index, child] of target.kit.parts.entries()) {
          const pose = composePose(child, pivot);
          const item: TrackItem = {
            id: `${id}-${index + 1}`,
            layerId,
            kind: "track",
            partId: child.partId,
            ...pose,
            heightPlates,
          };
          const offset = rotatedBoundsCenter(parts.get(child.partId)?.footprint ?? [], pose.angle);
          const childCenter = { x: pose.x + offset.x, y: pose.y + offset.y, angle: pose.angle };
          project.items.push(assignTable(item, childCenter, project.tables));
        }
      }
    } else if (baseplate && !brick.altitude) {
      const item: Item = {
        id,
        layerId,
        kind: "baseplate",
        name: "32 x 32 baseplate",
        ...center,
        color,
      };
      project.items.push(assignTable(item, center, project.tables));
    } else {
      const reason =
        target || baseplate || STOCK_TABLES.has(key)
          ? `Unsupported altitude ${brick.altitude} LDU`
          : "Unknown BlueBrick part";
      const item = unresolved(brick, reason);
      project.items.push(assignTable(item, center, project.tables));
      warnings.push(
        `${brick.sourceId} on "${project.layers.find((layer) => layer.id === layerId)?.name}": ${reason}.`,
      );
    }
    if (project.items.length > MAX_BRICKS) {
      throw new Error(`Expanded BlueBrick maps can contain up to ${MAX_BRICKS} items.`);
    }
  }
  return { project, warnings };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
