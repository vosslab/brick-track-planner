import { composePose, newProject } from "./project";
import type { Catalog, Item, Kit, Layer, Part, Point, Pose, Project, TrackItem } from "./project";

export const MAX_BLUEBRICK_FILE_BYTES = 8 * 1024 * 1024;
const MAX_LAYERS = 1_000;
const MAX_BRICKS = 10_000;

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

/** BlueBrick part IDs for the retired electrically-powered 9V track family. */
function isNineVoltTrack(sourceId: string): boolean {
  return /^(?:2861|2865|2866|2867|2868|5306|5307|5308)(?:\.\d+)?$/i.test(sourceId);
}

function transformedHull(pose: Pose, hull: readonly Point[]): Point[] {
  return hull.map((point) => {
    const offset = rotate(point, pose.angle);
    return { x: pose.x + offset.x, y: pose.y + offset.y };
  });
}

function unresolvedHull(item: Extract<Item, { kind: "unresolved" }>): Point[] {
  const halfWidth = item.width / 2;
  const halfDepth = item.depth / 2;
  // BlueBrick's saved DisplayArea already encloses the rotated source part.
  return transformedHull({ ...item, angle: 0 }, [
    { x: -halfWidth, y: -halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth },
  ]);
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
      bricks.push(brick);
    }
  }

  if (project.layers.length === 0) {
    project.layers.push({ id: "layer-1", name: "Layout", visible: true });
  }
  const targets = aliases(catalog);
  for (const brick of bricks) {
    const key = asciiUpper(brick.sourceId);
    const nineVolt = isNineVoltTrack(key);
    const target = nineVolt ? undefined : targets.get(key);
    const baseplate = key === "3811" || key.startsWith("3811.");
    const displayArea = key.startsWith("TABLE");
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
        project.items.push(item);
      } else {
        const source = sourcePivot(center, target.kit.sourceHull);
        const offset = target.kit.sourceOffset;
        const pivot = offset ? composePose({ ...offset, angle: 0 }, source) : source;
        const groupId = `import-${id}`;
        for (const [index, child] of target.kit.parts.entries()) {
          const pose = composePose(child, pivot);
          const item: TrackItem = {
            id: `${id}-${index + 1}`,
            layerId,
            kind: "track",
            partId: child.partId,
            ...pose,
            heightPlates,
            groupId,
            arrangementId: target.kit.id,
          };
          project.items.push(item);
        }
      }
    } else if (baseplate || displayArea) {
      warnings.push(
        `${brick.sourceId} on "${project.layers.find((layer) => layer.id === layerId)?.name}": skipped non-track layout item.`,
      );
    } else {
      const reason = nineVolt
        ? "Unsupported 9V track"
        : target
          ? `Unsupported altitude ${brick.altitude} LDU`
          : "Unknown BlueBrick part";
      const item = unresolved(brick, reason);
      project.items.push(item);
      warnings.push(
        `${brick.sourceId} on "${project.layers.find((layer) => layer.id === layerId)?.name}": ${reason}.`,
      );
    }
    if (project.items.length > MAX_BRICKS) {
      throw new Error(`Expanded BlueBrick maps can contain up to ${MAX_BRICKS} items.`);
    }
  }
  fitImportArea(project, catalog);
  return { project, warnings };
}

function fitImportArea(project: Project, catalog: Catalog): void {
  if (!project.items.length) return;
  const parts = new Map(catalog.parts.map((part) => [part.id, part]));
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const item of project.items) {
    let hull: Point[];
    if (item.kind === "unresolved") {
      hull = unresolvedHull(item);
    } else {
      const part = parts.get(item.partId);
      if (!part?.footprint.length) {
        throw new Error(`Catalog track part ${item.partId} has no footprint.`);
      }
      hull = transformedHull(item, part.footprint);
    }
    for (const point of hull) {
      left = Math.min(left, point.x);
      right = Math.max(right, point.x);
      top = Math.min(top, point.y);
      bottom = Math.max(bottom, point.y);
    }
  }
  const padding = 16;
  const origin = { x: left - padding, y: top - padding };
  for (const item of project.items) {
    item.x -= origin.x;
    item.y -= origin.y;
  }
  project.area = {
    ...project.area,
    width: Math.max(32, right - left + 2 * padding),
    depth: Math.max(32, bottom - top + 2 * padding),
  };
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
