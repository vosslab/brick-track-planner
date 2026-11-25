import { composePose, poseConnectingPorts } from "./project";
import type { Catalog, Kit, Part, Pose } from "./project";

const origin = { x: 152, y: 64 };

function part(catalog: Catalog, id: string): Part {
  const found = catalog.parts.find((entry) => entry.id === id);
  if (!found) throw new Error(`The catalog is missing ${id}.`);
  return found;
}

function port(catalog: Catalog, partId: string, portId: string): Part["ports"][number] {
  const found = part(catalog, partId).ports.find(({ id }) => id === portId);
  if (!found) throw new Error(`${partId} is missing port ${portId}.`);
  return found;
}

function join(catalog: Catalog, partId: string, portId: string, target: Pose): Pose {
  return poseConnectingPorts(port(catalog, partId, portId), target);
}

function end(catalog: Catalog, placed: Kit["parts"][number], portId: string): Pose {
  return composePose(port(catalog, placed.partId, portId), placed);
}

function add(
  catalog: Catalog,
  parts: Kit["parts"],
  partId: string,
  portId: string,
  target: Pose,
): Pose {
  const placed = { partId, ...join(catalog, partId, portId, target) };
  parts.push(placed);
  const other = portId === "a" ? "b" : "a";
  return end(catalog, placed, other);
}

function expand(catalog: Catalog, parts: Kit["parts"], kitId: string, pose: Pose): void {
  const kit = catalog.kits.find(({ id }) => id === kitId);
  if (!kit) throw new Error(`The catalog is missing ${kitId}.`);
  parts.push(...kit.parts.map((entry) => ({ partId: entry.partId, ...composePose(entry, pose) })));
}

function localize(parts: Kit["parts"]): Kit["parts"] {
  return parts.map((entry) => ({ ...entry, x: entry.x - origin.x, y: entry.y - origin.y }));
}

/** A physical R104 turnback wye with a usable tail and both mainline directions. */
export function createTurnbackWye(catalog: Catalog, storageStuds: number): Kit {
  const needed = [
    "trixbrix:r104-wye",
    "trixbrix:r104y-adapter",
    "trixbrix:r104",
    "trixbrix:s01",
    "trixbrix:s02",
    "trixbrix:s16",
  ];
  for (const id of needed) part(catalog, id);
  const parts: Kit["parts"] = [];
  // The catalog's R104 wye origin is its body centre. This puts its curved
  // arms on the two measured turnout branches while retaining the tail lead.
  const wye = { partId: "trixbrix:r104-wye", x: 152, y: 128, angle: 270 };
  parts.push(wye);

  let left = end(catalog, wye, "left");
  left = add(catalog, parts, "trixbrix:r104y-adapter", "a", left);
  for (let index = 0; index < 4; index += 1) {
    left = add(catalog, parts, "trixbrix:r104", "b", left);
    if (index === 1) left = add(catalog, parts, "trixbrix:s01", "b", left);
  }

  let right = end(catalog, wye, "right");
  right = add(catalog, parts, "trixbrix:r104y-adapter", "b", right);
  for (let index = 0; index < 4; index += 1) {
    right = add(catalog, parts, "trixbrix:r104", "a", right);
    if (index === 1) right = add(catalog, parts, "trixbrix:s01", "a", right);
  }

  // These full switch assemblies carry each mainline through path and branch into the wye arms.
  expand(catalog, parts, "trixbrix:r104-right", { x: 67.5309, y: 41.36787, angle: 180 });
  expand(catalog, parts, "trixbrix:r104-left", { x: 236.49413, y: 41.37655, angle: 180 });
  let mainline: Pose = { x: 87.0309, y: 37.49287, angle: 0 };
  for (let index = 0; index < 8; index += 1)
    mainline = add(catalog, parts, "trixbrix:s16", "a", mainline);
  add(catalog, parts, "trixbrix:s02", "a", mainline);
  let tail = end(catalog, wye, "common");
  for (let studs = 0; studs < storageStuds; studs += 16) {
    tail = add(catalog, parts, "trixbrix:s16", "a", tail);
  }

  return {
    id: "parking:r104-turnback-wye",
    brand: "TrixBrix",
    name: "Two-way R104 turnback wye",
    notes:
      "Measured R104 wye with mirrored turnouts, R104Y adapters, and a two-direction mainline closure.",
    parts: localize(parts),
  };
}
