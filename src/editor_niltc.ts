import { action, element, textNode } from "./editor_dom";
import { newId } from "./editor_state";
import { evaluate } from "./engine";
import type { Analysis } from "./engine";
import { createStarter, STARTER_CARDS } from "./niltc_starters";
import type { StarterKind } from "./niltc_starters";
import { composePose, localPose } from "./project";
import type { Catalog, Pose, Project, Table } from "./project";
import { createScene } from "./scene";

const grid = 32;
const halfGrid = grid / 2;

function gridCoordinate(value: number): number {
  const coordinate = Math.round(value / grid) * grid;
  return coordinate === 0 ? 0 : coordinate;
}

function quarterTurn(angle: number): number {
  return (((Math.round((angle % 360) / 90) * 90) % 360) + 360) % 360;
}

function tabletopBounds(table: Table, pose: Pose): [number, number, number, number] {
  const opposite = composePose({ x: table.width, y: table.depth, angle: 0 }, pose);
  return [
    Math.min(pose.x, opposite.x),
    Math.max(pose.x, opposite.x),
    Math.min(pose.y, opposite.y),
    Math.max(pose.y, opposite.y),
  ];
}

export function snapNiltcTablePose(project: Project, table: Table, candidate: Pose): Pose {
  if (!table.niltc) return candidate;
  const angle = quarterTurn(candidate.angle);
  const snapped = { x: gridCoordinate(candidate.x), y: gridCoordinate(candidate.y), angle };
  const [left, right, top, bottom] = tabletopBounds(table, snapped);
  let distance = halfGrid + 1e-6;
  let adjacent = snapped;
  function consider(axis: "x" | "y", offset: number): void {
    const align = snapped[axis] + offset;
    const legal = gridCoordinate(align);
    if (Math.abs(legal - align) > 1e-6) return;
    const gap = Math.abs(candidate[axis] - legal);
    if (gap >= distance) return;
    distance = gap;
    adjacent = { ...snapped, [axis]: legal };
  }
  const visible = new Set(project.layers.filter(({ visible }) => visible).map(({ id }) => id));
  for (const neighbor of project.tables) {
    if (
      neighbor.id === table.id ||
      !(neighbor.niltc || neighbor.nominal) ||
      neighbor.angle % 90 !== 0 ||
      !visible.has(neighbor.layerId)
    ) {
      continue;
    }
    const [nearLeft, nearRight, nearTop, nearBottom] = tabletopBounds(neighbor, neighbor);
    if (Math.min(bottom, nearBottom) - Math.max(top, nearTop) > 1e-6) {
      consider("x", nearLeft - right);
      consider("x", nearRight - left);
    }
    if (Math.min(right, nearRight) - Math.max(left, nearLeft) > 1e-6) {
      consider("y", nearTop - bottom);
      consider("y", nearBottom - top);
    }
  }
  return adjacent;
}

export function snapNiltcBaseplatePose(table: Table, candidateLocal: Pose): Pose {
  if (!table.niltc) return candidateLocal;
  return {
    x: halfGrid + gridCoordinate(candidateLocal.x - halfGrid),
    y: halfGrid + gridCoordinate(candidateLocal.y - halfGrid),
    angle: quarterTurn(candidateLocal.angle),
  };
}

export function duplicateTrackSelection(project: Project, selectedIds: Iterable<string>): string[] {
  const selected = new Set(selectedIds);
  const originals = project.items.filter(
    ({ id, kind }) => selected.has(id) && kind !== "unresolved",
  );
  const step = originals.some(({ kind }) => kind === "baseplate") ? grid : halfGrid;
  const tables = new Map(project.tables.map((table) => [table.id, table]));
  const copies = originals.map((item) => {
    const table = item.tableId === undefined ? undefined : tables.get(item.tableId);
    const offset = table
      ? localPose({ x: step, y: 0, angle: 0 }, { x: 0, y: 0, angle: table.angle })
      : { x: step, y: 0 };
    if (table && table.angle % 90 === 0) {
      offset.x = Math.round(offset.x);
      offset.y = Math.round(offset.y);
    }
    return { ...item, id: newId(item.kind), x: item.x + offset.x, y: item.y + offset.y };
  });
  project.items.push(...copies);
  return copies.map(({ id }) => id);
}

function describeIssue(analysis: Analysis, issue: Analysis["niltcIssues"][number]): string {
  const { project } = analysis;
  const table = project.tables.find(({ id }) => id === issue.tableId)?.name || "Table";
  const exit = project.sections
    .flatMap(({ exits }) => exits)
    .find(({ id }) => id === issue.exitId)?.name;
  const item = project.items.find(({ id }) => id === issue.itemId);
  const part =
    item?.kind === "track" && analysis.counts.find(({ partId }) => partId === item.partId);
  const piece = part ? `${part.brand} ${part.name}` : item?.kind === "baseplate" && item.name;
  const where = [table, exit, piece].filter(Boolean).join(" / ");
  const mainline = issue.lane === "outer" ? "Outer mainline" : "Inner mainline";
  switch (issue.kind) {
    case "table-grid":
      return `${table} is off the 32-stud tabletop grid or quarter-turn rotation.`;
    case "baseplate-grid":
      return `${piece || "Baseplate"} is off the 32-stud baseplate grid on ${table}.`;
    case "missing-mainline":
      return `${mainline} missing on ${where}.`;
    case "mainline-height":
      return `${mainline} height must be 2 plates on ${where}.`;
    case "exit-off-standard":
      return `${mainline} exit is off the NILTC standard on ${where}.`;
  }
}

export function renderNiltcIssues(analysis: Analysis, pick: (id: string) => void): void {
  const panel = element("niltc-issues");
  const { project, niltcIssues } = analysis;
  panel.hidden = !project.tables.some(({ niltc }) => niltc);
  if (panel.hidden) {
    panel.replaceChildren();
    return;
  }
  const rows = niltcIssues.map((issue) => {
    const row = action(describeIssue(analysis, issue), () => pick(issue.itemId ?? issue.tableId));
    row.className = "list-row";
    return row;
  });
  panel.replaceChildren(
    textNode("h3", "NILTC standards"),
    ...(rows.length ? rows : [textNode("p", "No NILTC standards issues.")]),
  );
}

export function renderStarterCards(
  catalog: Catalog,
  onChoose: (project: Project, kind: StarterKind) => void,
): void {
  const cards = STARTER_CARDS.map(({ kind, title, description }) => {
    const project = createStarter(kind, catalog);
    const button = action(title, () => onChoose(structuredClone(project), kind));
    button.className = "starter-card";
    button.dataset["starter"] = kind;
    button.setAttribute("aria-label", title);
    const preview = document.createElement("span");
    preview.className = "starter-preview";
    preview.setAttribute("aria-hidden", "true");
    const scene = createScene(project, catalog, evaluate(project), { sharing: true });
    preview.append(scene);
    const heading = document.createElement("span");
    heading.className = "starter-title";
    heading.textContent = title;
    const detail = document.createElement("span");
    detail.className = "starter-description";
    detail.id = `starter-${kind}-description`;
    detail.textContent = description;
    button.setAttribute("aria-describedby", detail.id);
    button.replaceChildren(preview, heading, detail);
    return button;
  });
  element("starter-cards").replaceChildren(...cards);
}
