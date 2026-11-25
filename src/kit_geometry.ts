import { angleGap, composePose } from "./project";
import type { Catalog, Kit, Port } from "./project";
export type LocalPort = Port & { kitPartIndex: number };
export function exposedKitPorts(catalog: Catalog, kit: Kit): LocalPort[] {
  const ports: LocalPort[] = [];
  for (const [kitPartIndex, placement] of kit.parts.entries()) {
    const part = catalog.parts.find((p) => p.id === placement.partId);
    if (!part) continue;
    for (const port of part.ports) {
      if (port.type === "regular")
        ports.push({ ...composePose(port, placement), id: port.id, type: port.type, kitPartIndex });
    }
  }
  return ports.filter(
    (port, index) =>
      !ports.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          Math.hypot(port.x - other.x, port.y - other.y) <= 0.05 &&
          angleGap(port.angle, other.angle + 180) <= 0.25,
      ),
  );
}
