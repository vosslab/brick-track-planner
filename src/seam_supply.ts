import type { Analysis } from "./engine";
import { localPose } from "./project";
import type { Project, Seam } from "./project";

export function seamS8Suppliers(project: Project, analysis: Analysis, seam: Seam): string[] {
  const result = analysis.seams.find(({ id }) => id === seam.id);
  if (!result) return [];
  const suppliers = new Set<string>();
  for (const lane of ["outer", "inner"] as const) {
    if (result[lane].status === "hidden") continue;
    for (const { pieceId, portId } of [seam[lane].a, seam[lane].b]) {
      const piece = project.items.find(({ id }) => id === pieceId);
      if (piece?.kind !== "track" || !piece.tableId || !/:s0?8$/i.test(piece.partId)) continue;
      const edge =
        piece.tableId === seam.tableA
          ? seam.edgeA
          : piece.tableId === seam.tableB
            ? seam.edgeB
            : undefined;
      const table = project.tables.find(({ id }) => id === piece.tableId);
      const port = analysis.ports.find(
        (port) => port.pieceId === pieceId && port.portId === portId,
      );
      if (!edge || !table || !port) continue;
      const { x, y } = localPose(port, table);
      const outside = { north: -y, east: x - table.width, south: y - table.depth, west: -x };
      if (outside[edge] > 0.05) suppliers.add(table.name);
    }
  }
  return [...suppliers];
}
