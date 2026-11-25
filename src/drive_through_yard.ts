import { exposedKitPorts } from "./kit_geometry";
import type { Catalog, Kit } from "./project";

/** Opposite-handed throats keep both mainline entrances on the same rail. */
export function createDriveThroughYard(catalog: Catalog, storageStuds: number): Kit {
  const right = catalog.kits.find((k) => k.id === "trixbrix:r40-right-yard-4");
  const left = catalog.kits.find((k) => k.id === "trixbrix:r40-left-yard-4");
  if (!right || !left) throw new Error("Both R40 yard throats are required.");
  const tracks = exposedKitPorts(catalog, right).filter(
    (port) => Math.cos((port.angle * Math.PI) / 180) > 0.99,
  );
  if (tracks.length !== 4) throw new Error("The R40 ladder must have four parallel tracks.");
  const farthest = Math.max(...tracks.map((port) => port.x));
  const offset = 2 * farthest + storageStuds;
  const parts = [...right.parts, ...left.parts.map((p) => ({ ...p, x: p.x + offset }))];
  for (const start of tracks) {
    const span = offset - 2 * start.x;
    const count = Math.round(span / 16);
    if (count < 0 || Math.abs(count * 16 - span) > 0.05)
      throw new Error("The yard tracks must close on S16 joints.");
    for (let i = 0; i < count; i++)
      parts.push({ partId: "trixbrix:s16", x: start.x + 8 + i * 16, y: start.y, angle: 0 });
  }
  return {
    id: "parking:r40-four-track-drive-through",
    name: "Four-track drive-through yard",
    brand: "TrixBrix",
    notes:
      "Opposite-handed R40 yard ladders connect four parallel tracks to the mainline at both ends. The selected storage length applies to the shortest track.",
    parts,
  };
}
