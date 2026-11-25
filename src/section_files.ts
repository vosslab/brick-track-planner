import { composePose, localPose, parseProject } from "./project";
import type { Endpoint, Pose, Project } from "./project";
import { sectionTables } from "./sections";

type SectionBundle = {
  version: 1;
  section: { name: string; ownerName?: string };
  anchorTableId: string;
  project: Project;
};

export function exportSection(
  project: Project,
  sectionId: string,
  anchorTableId: string,
): { bundle: SectionBundle; warnings: string[] } {
  const section = project.sections.find(({ id }) => id === sectionId);
  const tables = sectionTables(project, sectionId);
  const anchor = tables.find(({ id }) => id === anchorTableId);
  if (!section || !anchor) throw new Error("Choose a table in this section as the export anchor.");

  const tableIds = new Set(tables.map(({ id }) => id));
  const items = project.items.filter(({ tableId }) => tableId && tableIds.has(tableId));
  const seams = project.seams.filter(
    ({ tableA, tableB }) => tableIds.has(tableA) && tableIds.has(tableB),
  );
  const layers = new Set([...tables, ...items].map(({ layerId }) => layerId));
  const ownerName = project.members.find(({ id }) => id === section.memberId)?.name;
  const fragment: Project = {
    version: 2,
    name: section.name,
    sections: [{ id: section.id, name: section.name, exits: section.exits }],
    members: [],
    layers: project.layers.filter(({ id }) => layers.has(id)),
    tables: tables.map((table) => ({ ...table, ...localPose(table, anchor) })),
    items,
    seams,
  };
  const loose = project.items.filter(({ tableId }) => !tableId).length;
  const warnings = loose
    ? [`${loose} loose layout item${loose === 1 ? " stays" : "s stay"} in this layout.`]
    : [];
  return {
    bundle: parseSectionBundle(
      JSON.stringify({
        version: 1,
        section: { name: section.name, ownerName },
        anchorTableId,
        project: fragment,
      }),
    ),
    warnings,
  };
}

export function parseSectionBundle(text: string): SectionBundle {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) {
    throw new Error("Use a version 1 section bundle.");
  }
  if (!("section" in value) || !("anchorTableId" in value) || !("project" in value)) {
    throw new Error("The section bundle needs section details, an anchor, and a project fragment.");
  }
  const { section, anchorTableId } = value;
  if (
    !section ||
    typeof section !== "object" ||
    !("name" in section) ||
    typeof section.name !== "string" ||
    !section.name.trim() ||
    ("ownerName" in section &&
      (typeof section.ownerName !== "string" || !section.ownerName.trim())) ||
    typeof anchorTableId !== "string" ||
    !value.project ||
    typeof value.project !== "object" ||
    !("version" in value.project) ||
    value.project.version !== 2
  ) {
    throw new Error("The section name, owner, anchor, or project fragment is invalid.");
  }
  const project = parseProject(JSON.stringify(value.project));
  const [fragmentSection] = project.sections;
  if (
    project.sections.length !== 1 ||
    fragmentSection?.name !== section.name ||
    fragmentSection.memberId ||
    project.venue ||
    project.members.length
  ) {
    throw new Error(
      "A section bundle must contain one section without member quantities or venue data.",
    );
  }

  const tables = sectionTables(project, fragmentSection.id);
  const tableIds = new Set(tables.map(({ id }) => id));
  const layers = new Set([...tables, ...project.items].map(({ layerId }) => layerId));
  if (
    tables.length !== project.tables.length ||
    project.items.some(({ tableId }) => !tableId || !tableIds.has(tableId)) ||
    project.seams.some(({ tableA, tableB }) => !tableIds.has(tableA) || !tableIds.has(tableB)) ||
    project.layers.some(({ id }) => !layers.has(id))
  ) {
    throw new Error(
      "A section bundle may only contain its own tables, attached items, layers, and seams.",
    );
  }
  const anchor = tables.find(({ id }) => id === anchorTableId);
  if (!anchor || anchor.x !== 0 || anchor.y !== 0 || anchor.angle !== 0) {
    throw new Error("The anchor table must start at 0, 0 with no rotation.");
  }
  const ownerName =
    "ownerName" in section && typeof section.ownerName === "string" ? section.ownerName : undefined;
  return {
    version: 1,
    section: { name: section.name, ...(ownerName === undefined ? {} : { ownerName }) },
    anchorTableId,
    project,
  };
}

function projectIds(project: Project): Set<string> {
  const ids = new Set(
    [
      ...project.sections,
      ...project.members,
      ...project.tables,
      ...project.items,
      ...project.seams,
      ...project.layers,
    ].map(({ id }) => id),
  );
  for (const { exits } of project.sections) {
    for (const { id, tableId, outer, inner } of exits) {
      ids.add(id);
      ids.add(tableId);
      ids.add(outer.pieceId);
      ids.add(inner.pieceId);
    }
  }
  for (const { tableA, tableB, exitAId, exitBId, outer, inner } of project.seams) {
    ids.add(tableA);
    ids.add(tableB);
    if (exitAId) ids.add(exitAId);
    if (exitBId) ids.add(exitBId);
    for (const { pieceId } of [outer.a, outer.b, inner.a, inner.b]) ids.add(pieceId);
  }
  return ids;
}

export function importSection(
  target: Project,
  bundle: SectionBundle,
  anchorPose: Pose,
  makeId: (prefix: string) => string,
): { project: Project; sectionId: string; tableIds: string[] } {
  const fragment = bundle.project;
  const [section] = fragment.sections;
  if (!section) throw new Error("The section bundle is empty.");
  if (![anchorPose.x, anchorPose.y, anchorPose.angle].every(Number.isFinite)) {
    throw new Error("Enter a valid anchor position and rotation.");
  }
  const occupied = projectIds(target);
  const freshId = (prefix: string): string => {
    const base = makeId(prefix);
    let id = base;
    for (let index = 2; occupied.has(id); index += 1) id = `${base}-${index}`;
    occupied.add(id);
    return id;
  };
  const remap = (prefix: string, entries: { id: string }[]) => {
    const ids = new Map(entries.map(({ id }) => [id, freshId(prefix)]));
    return (previous: string): string => {
      const existing = ids.get(previous);
      if (existing !== undefined) return existing;
      const id = freshId(prefix);
      ids.set(previous, id);
      return id;
    };
  };
  const layerId = remap("layer", fragment.layers);
  const tableId = remap("table", fragment.tables);
  const itemId = remap("item", fragment.items);
  const exitId = remap("exit", section.exits);
  const sectionId = freshId("section");
  const endpoint = (ref: Endpoint): Endpoint => ({ ...ref, pieceId: itemId(ref.pieceId) });
  const members = [...target.members];
  let owner = members.find(({ name }) => name === bundle.section.ownerName);
  if (!owner && bundle.section.ownerName) {
    owner = { id: freshId("member"), name: bundle.section.ownerName, bring: {} };
    members.push(owner);
  }
  const tables = fragment.tables.map((table) => ({
    ...table,
    id: tableId(table.id),
    layerId: layerId(table.layerId),
    sectionId,
    ...composePose(table, anchorPose),
  }));
  const project = parseProject(
    JSON.stringify({
      ...target,
      members,
      layers: [
        ...target.layers,
        ...fragment.layers.map((layer) => ({ ...layer, id: layerId(layer.id) })),
      ],
      tables: [...target.tables, ...tables],
      items: [
        ...target.items,
        ...fragment.items.map((item) => {
          if (!item.tableId) throw new Error("Attach all bundled items to section tables.");
          return {
            ...item,
            id: itemId(item.id),
            layerId: layerId(item.layerId),
            tableId: tableId(item.tableId),
          };
        }),
      ],
      seams: [
        ...target.seams,
        ...fragment.seams.map((seam) => ({
          ...seam,
          id: freshId("seam"),
          tableA: tableId(seam.tableA),
          tableB: tableId(seam.tableB),
          exitAId: seam.exitAId && exitId(seam.exitAId),
          exitBId: seam.exitBId && exitId(seam.exitBId),
          outer: { a: endpoint(seam.outer.a), b: endpoint(seam.outer.b) },
          inner: { a: endpoint(seam.inner.a), b: endpoint(seam.inner.b) },
        })),
      ],
      sections: [
        ...target.sections,
        {
          id: sectionId,
          name: section.name,
          memberId: owner?.id,
          exits: section.exits.map((exit) => ({
            ...exit,
            id: exitId(exit.id),
            tableId: tableId(exit.tableId),
            outer: endpoint(exit.outer),
            inner: endpoint(exit.inner),
          })),
        },
      ],
    }),
  );
  return { project, sectionId, tableIds: tables.map(({ id }) => id) };
}
