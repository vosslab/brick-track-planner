import type { Part, Point } from "./project";
import { offsetRail, sleepers, trackRailOffset } from "./scene_drawing";

const LDU_PER_STUD = 20;
const RAIL_HALF_WIDTH_STUDS = 0.18;
const SLEEPER_HALF_LENGTH_STUDS = 0.24;
const SLEEPER_TOP_Y = -8;
const RAIL_BOTTOM_Y = SLEEPER_TOP_Y;
// Match the rail crown of the plastic LEGO parts in the same sleeper coordinate system.
const RAIL_TOP_Y = -16;

function point({ x, y }: Point, ldrawY: number): string {
  return `${number(x * LDU_PER_STUD)} ${ldrawY} ${number(-y * LDU_PER_STUD)}`;
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Track geometry exceeds LDraw numeric range.");
  return String(Number(value.toFixed(6)));
}

/**
 * Names the embedded MPD part used where no independently calibrated DAT exists.
 */
export function fallbackTrackModelName(part: Part): string {
  return `bricktrack-${part.id.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "")}.dat`;
}

/**
 * Draws catalog rail centerlines as simple paired rail strips, or a footprint
 * for an accessory without rails. This keeps uncalibrated parts visible without
 * pretending they have an official DAT.
 */
export function fallbackTrackModel(part: Part): string[] {
  const lines = [
    `0 FILE ${fallbackTrackModelName(part)}`,
    `0 Name: ${fallbackTrackModelName(part)}`,
    `0 Brick Track Planner schematic ${part.brand} ${part.name}`,
  ];
  for (const path of part.paths) {
    lines.push(...sleeperSlabs(path));
    for (const offset of [-trackRailOffset, trackRailOffset]) {
      const nearEdge = offsetRail(path, offset - RAIL_HALF_WIDTH_STUDS, part.ports);
      const farEdge = offsetRail(path, offset + RAIL_HALF_WIDTH_STUDS, part.ports);
      for (let index = 1; index < nearEdge.length; index += 1) {
        const firstNear = nearEdge[index - 1];
        const secondNear = nearEdge[index];
        const firstFar = farEdge[index - 1];
        const secondFar = farEdge[index];
        if (!firstNear || !secondNear || !firstFar || !secondFar) continue;
        lines.push(...rail(firstNear, secondNear, secondFar, firstFar));
      }
    }
  }
  if (!part.paths.length) {
    const [first, second, third, fourth] = part.footprint;
    if (first && second && third && fourth && part.footprint.length === 4) {
      lines.push(
        `4 16 ${point(first, RAIL_TOP_Y)} ${point(second, RAIL_TOP_Y)} ${point(third, RAIL_TOP_Y)} ${point(fourth, RAIL_TOP_Y)}`,
      );
    } else {
      for (let index = 2; index < part.footprint.length; index += 1) {
        const previous = part.footprint[index - 1];
        const current = part.footprint[index];
        if (first && previous && current)
          lines.push(
            `3 16 ${point(first, RAIL_TOP_Y)} ${point(previous, RAIL_TOP_Y)} ${point(current, RAIL_TOP_Y)}`,
          );
      }
    }
  }
  if (lines.length === 3) throw new Error(`Track part ${part.id} has no LDraw path geometry.`);
  return lines;
}

function rail(firstNear: Point, secondNear: Point, secondFar: Point, firstFar: Point): string[] {
  return [
    `4 16 ${point(firstNear, RAIL_TOP_Y)} ${point(secondNear, RAIL_TOP_Y)} ${point(secondFar, RAIL_TOP_Y)} ${point(firstFar, RAIL_TOP_Y)}`,
    `4 16 ${point(firstNear, RAIL_TOP_Y)} ${point(firstNear, RAIL_BOTTOM_Y)} ${point(secondNear, RAIL_BOTTOM_Y)} ${point(secondNear, RAIL_TOP_Y)}`,
    `4 16 ${point(firstFar, RAIL_TOP_Y)} ${point(secondFar, RAIL_TOP_Y)} ${point(secondFar, RAIL_BOTTOM_Y)} ${point(firstFar, RAIL_BOTTOM_Y)}`,
  ];
}

function sleeperSlabs(path: readonly Point[]): string[] {
  const lines: string[] = [];
  for (const sleeper of sleepers(path)) {
    const corners = [
      {
        x: sleeper.left.x - sleeper.tangent.x * SLEEPER_HALF_LENGTH_STUDS,
        y: sleeper.left.y - sleeper.tangent.y * SLEEPER_HALF_LENGTH_STUDS,
      },
      {
        x: sleeper.left.x + sleeper.tangent.x * SLEEPER_HALF_LENGTH_STUDS,
        y: sleeper.left.y + sleeper.tangent.y * SLEEPER_HALF_LENGTH_STUDS,
      },
      {
        x: sleeper.right.x + sleeper.tangent.x * SLEEPER_HALF_LENGTH_STUDS,
        y: sleeper.right.y + sleeper.tangent.y * SLEEPER_HALF_LENGTH_STUDS,
      },
      {
        x: sleeper.right.x - sleeper.tangent.x * SLEEPER_HALF_LENGTH_STUDS,
        y: sleeper.right.y - sleeper.tangent.y * SLEEPER_HALF_LENGTH_STUDS,
      },
    ];
    lines.push(`4 16 ${corners.map((corner) => point(corner, SLEEPER_TOP_Y)).join(" ")}`);
  }
  return lines;
}
