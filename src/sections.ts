import type { Analysis, EndpointStatus } from "./engine";
import { composePose, localPose } from "./project";
import type { Endpoint, Pose, Project, Seam, Section, SectionExit } from "./project";

export function sectionTables(project: Project, sectionId: string): Project["tables"] {
  return project.tables.filter((table) => table.sectionId === sectionId);
}

export function moveSection(project: Project, sectionId: string, from: Pose, to: Pose): Project {
  if (![to.x, to.y, to.angle].every(Number.isFinite)) {
    throw new Error("Enter a valid section position and rotation.");
  }
  if (from.x === to.x && from.y === to.y && ((from.angle % 360) - (to.angle % 360)) % 360 === 0) {
    return { ...project };
  }
  return {
    ...project,
    tables: project.tables.map((table) =>
      table.sectionId === sectionId
        ? { ...table, ...composePose(localPose(table, from), to) }
        : table,
    ),
  };
}

export function deleteSection(project: Project, sectionId: string): Project {
  const tables = new Set(sectionTables(project, sectionId).map(({ id }) => id));
  const exits = new Set(
    project.sections.find(({ id }) => id === sectionId)?.exits.map(({ id }) => id),
  );
  const withinSection = (tableId: string, exitId?: string): boolean =>
    tables.has(tableId) || (exitId !== undefined && exits.has(exitId));
  return {
    ...project,
    sections: project.sections.filter(({ id }) => id !== sectionId),
    tables: project.tables.filter(({ id }) => !tables.has(id)),
    items: project.items.filter(({ tableId }) => !tableId || !tables.has(tableId)),
    // Keep cross-section seams so the remaining side can be repaired.
    seams: project.seams.filter(
      ({ tableA, tableB, exitAId, exitBId }) =>
        !withinSection(tableA, exitAId) || !withinSection(tableB, exitBId),
    ),
  };
}

export function removeSectionExit(project: Project, exitId: string): void {
  for (const section of project.sections) {
    section.exits = section.exits.filter(({ id }) => id !== exitId);
  }
  for (const seam of project.seams) {
    if (seam.exitAId === exitId) delete seam.exitAId;
    if (seam.exitBId === exitId) delete seam.exitBId;
  }
}

export function assignSection(
  project: Project,
  tableIds: ReadonlySet<string>,
  sectionId?: string,
): void {
  const destination = project.sections.find(({ id }) => id === sectionId);
  for (const table of project.tables) {
    if (!tableIds.has(table.id) || table.sectionId === destination?.id) continue;
    const source = project.sections.find(({ id }) => id === table.sectionId);
    const exits = source?.exits.filter(({ tableId }) => tableId === table.id) ?? [];
    if (destination) {
      table.sectionId = destination.id;
      destination.exits.push(...exits);
      if (source) source.exits = source.exits.filter(({ tableId }) => tableId !== table.id);
    } else {
      delete table.sectionId;
      for (const { id } of exits) removeSectionExit(project, id);
    }
  }
}

function sameEndpoint(first: Endpoint, second: Endpoint): boolean {
  return first.pieceId === second.pieceId && first.portId === second.portId;
}

export function saveSectionExit(project: Project, sectionId: string, exit: SectionExit): void {
  const section = project.sections.find(({ id }) => id === sectionId);
  if (!section || !sectionTables(project, sectionId).some(({ id }) => id === exit.tableId)) {
    throw new Error("Choose a table in this section.");
  }
  if (sameEndpoint(exit.outer, exit.inner)) {
    throw new Error("Choose different connectors for the outer and inner lanes.");
  }

  const index = section.exits.findIndex(({ id }) => id === exit.id);
  if (index < 0) section.exits.push(exit);
  else section.exits[index] = exit;
  for (const seam of project.seams) {
    if (seam.exitAId === exit.id) {
      Object.assign(seam, { tableA: exit.tableId, edgeA: exit.edge });
      seam.outer.a = exit.outer;
      seam.inner.a = exit.inner;
    }
    if (seam.exitBId === exit.id) {
      Object.assign(seam, { tableB: exit.tableId, edgeB: exit.edge });
      seam.outer.b = exit.outer;
      seam.inner.b = exit.inner;
    }
  }
}

export function findSectionExit(
  project: Project,
  exitId: string,
): { section: Section; exit: SectionExit } {
  for (const section of project.sections) {
    const exit = section.exits.find(({ id }) => id === exitId);
    if (exit) return { section, exit };
  }
  throw new Error("Choose an existing named exit.");
}

export function exitSeam(project: Project, exitId: string): Seam | undefined {
  return project.seams.find(({ exitAId, exitBId }) => exitAId === exitId || exitBId === exitId);
}

export function sectionExitPort(
  analysis: Analysis,
  exit: SectionExit,
  lane: "outer" | "inner",
): Analysis["ports"][number] | undefined {
  const endpoint = exit[lane];
  if (
    !analysis.project.items.some(
      ({ id, tableId }) => id === endpoint.pieceId && tableId === exit.tableId,
    )
  ) {
    return undefined;
  }
  return analysis.ports.find((port) => sameEndpoint(port, endpoint));
}

export function sectionExitOffStandard(
  analysis: Analysis,
  exit: SectionExit,
): ("outer" | "inner")[] {
  return (analysis.niltcIssues ?? []).flatMap((issue) =>
    issue.kind === "exit-off-standard" && issue.exitId === exit.id && issue.lane
      ? [issue.lane]
      : [],
  );
}

type Alignment = {
  analysis: Analysis;
  seamId: string;
  outer: EndpointStatus;
  inner: EndpointStatus;
  issues: string[];
  valid: boolean;
};

export function previewSectionAlignment(
  before: Analysis,
  fixedId: string,
  movingId: string,
  evaluate: (project: Project) => Analysis,
  makeSeamId: () => string,
): Alignment {
  const { project } = before;
  const a = findSectionExit(project, fixedId);
  const b = findSectionExit(project, movingId);
  if (a.section.id === b.section.id) throw new Error("Choose exits in different sections.");
  if (
    [a, b].some(
      ({ section, exit }) =>
        !sectionTables(project, section.id).some(({ id }) => id === exit.tableId),
    )
  ) {
    throw new Error("Replace the missing or moved exit table before aligning these exits.");
  }

  const existing = project.seams.filter(({ exitAId, exitBId }) =>
    [exitAId, exitBId].some((id) => id === fixedId || id === movingId),
  );
  const [paired] = existing;
  if (
    existing.length &&
    (existing.length !== 1 ||
      ![paired?.exitAId, paired?.exitBId].includes(fixedId) ||
      ![paired?.exitAId, paired?.exitBId].includes(movingId))
  ) {
    throw new Error("One of these exits is already connected to a different exit.");
  }

  const outerA = sectionExitPort(before, a.exit, "outer");
  const innerA = sectionExitPort(before, a.exit, "inner");
  const outerB = sectionExitPort(before, b.exit, "outer");
  const innerB = sectionExitPort(before, b.exit, "inner");
  if (!outerA || !innerA || !outerB || !innerB) {
    throw new Error("Replace missing connectors or show their layers before aligning these exits.");
  }
  const issues: string[] = [];
  for (const [lane, fixed, moving] of [
    ["Outer", outerA, outerB],
    ["Inner", innerA, innerB],
  ] as const) {
    if (fixed.type !== moving.type) issues.push(`${lane} connector types differ.`);
    if (fixed.heightPlates !== moving.heightPlates)
      issues.push(`${lane} connector heights differ.`);
  }

  const seam: Seam = {
    id: paired?.id ?? makeSeamId(),
    tableA: a.exit.tableId,
    edgeA: a.exit.edge,
    tableB: b.exit.tableId,
    edgeB: b.exit.edge,
    exitAId: a.exit.id,
    exitBId: b.exit.id,
    outer: { a: a.exit.outer, b: b.exit.outer },
    inner: { a: a.exit.inner, b: b.exit.inner },
  };
  const next = moveSection(project, b.section.id, outerB, {
    x: outerA.x,
    y: outerA.y,
    angle: (outerA.angle % 360) + 180,
  });
  next.seams = paired
    ? project.seams.map((other) => (other.id === seam.id ? seam : other))
    : [...project.seams, seam];
  const analysis = evaluate(next);
  const result = analysis.seams.find(({ id }) => id === seam.id);
  if (!result) throw new Error("The geometry engine could not evaluate the proposed connection.");
  const { outer, inner } = result;
  for (const { section, exit } of [a, b]) {
    const offStandard = new Set([
      ...sectionExitOffStandard(before, exit),
      ...sectionExitOffStandard(analysis, exit),
    ]);
    for (const lane of offStandard) {
      issues.push(`${section.name} / ${exit.name} is off NILTC standard on the ${lane} lane.`);
    }
  }
  return {
    analysis,
    seamId: seam.id,
    outer,
    inner,
    issues,
    valid: issues.length === 0 && outer.status === "joined" && inner.status === "joined",
  };
}
