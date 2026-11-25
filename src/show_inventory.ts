import ballastRecipes from "../data/ballast_recipes.json" with { type: "json" };
import type { Catalog, Project } from "./project";

export type RequiredRow = { key: string; label: string; required: number };
export type CommitmentRow = RequiredRow & { committed: number | null; delta: number | null };
export type MemberInventory = {
  id: string;
  name: string;
  rows: CommitmentRow[];
  unknown: RequiredRow[];
};
type UnassignedInventory = { label: string; rows: RequiredRow[]; unknown: RequiredRow[] };
export type ShowInventory = {
  track: RequiredRow[];
  ballast: RequiredRow[];
  unknown: RequiredRow[];
  members: MemberInventory[];
  unassigned: UnassignedInventory[];
};

type PartLabel = Omit<RequiredRow, "required">;
type QuantityMap = Map<string, RequiredRow>;
type Tally = { track: QuantityMap; ballast: QuantityMap; unknown: QuantityMap };

type BallastRecipe = (typeof ballastRecipes)[number];
type Material = BallastRecipe["materials"][number];

export function recipeFor(partId: string): BallastRecipe | undefined {
  return ballastRecipes.find(({ trackPartIds }) => trackPartIds.includes(partId));
}

function materialLabel(material: Material): PartLabel {
  const color = material.color.replace(/-/g, " ");
  return {
    key: `ballast:${material.partId}:${material.color}`,
    label: `${material.name} (${color}, ${material.partId})`,
  };
}

const materialLabels = new Map(
  ballastRecipes.flatMap(({ materials }) =>
    materials.map((material) => {
      const part = materialLabel(material);
      return [part.key, part] as const;
    }),
  ),
);

function tally(): Tally {
  return { track: new Map(), ballast: new Map(), unknown: new Map() };
}

function increment(map: QuantityMap, part: PartLabel, quantity: number): void {
  const row = map.get(part.key);
  if (row) row.required += quantity;
  else map.set(part.key, { ...part, required: quantity });
}

function compareKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function rows(...maps: QuantityMap[]): RequiredRow[] {
  return maps.flatMap((map) => [...map.values()].sort((a, b) => compareKeys(a.key, b.key)));
}

export function showInventory(project: Project, catalog: Catalog): ShowInventory {
  const visible = new Set(project.layers.filter((layer) => layer.visible).map(({ id }) => id));
  const tables = new Map(project.tables.map((table) => [table.id, table]));
  const sections = new Map(project.sections.map((section) => [section.id, section]));
  const trackLabels = new Map(
    catalog.parts.map(({ id, brand, name }) => [id, { key: id, label: `${brand} ${name}` }]),
  );
  const totals = tally();
  const members = new Map(
    project.members.map((member) => [member.id, { member, counts: tally() }]),
  );
  const unassigned = new Map<string, { label: string; counts: Tally }>();

  for (const item of project.items) {
    if (item.kind === "baseplate" || !visible.has(item.layerId)) continue;
    const table = item.tableId === undefined ? undefined : tables.get(item.tableId);
    const section = table?.sectionId === undefined ? undefined : sections.get(table.sectionId);
    let owner = section?.memberId === undefined ? undefined : members.get(section.memberId)?.counts;
    if (!owner) {
      const key = section ? `section:${section.id}` : table ? `table:${table.id}` : "loose";
      const label = section?.name ?? table?.name ?? "Loose pieces";
      const group = unassigned.get(key) ?? { label, counts: tally() };
      unassigned.set(key, group);
      owner = group.counts;
    }
    if (item.kind === "unresolved") {
      const part = {
        key: `unresolved:${JSON.stringify([item.sourceId, item.name])}`,
        label: `Unresolved import ${item.name} (${item.sourceId})`,
      };
      increment(totals.unknown, part, 1);
      increment(owner.unknown, part, 1);
      continue;
    }
    const track = trackLabels.get(item.partId);
    if (!track) {
      const part = { key: `unknown:${item.partId}`, label: `Unknown track (${item.partId})` };
      increment(totals.unknown, part, 1);
      increment(owner.unknown, part, 1);
      continue;
    }
    increment(totals.track, track, 1);
    increment(owner.track, track, 1);
    if (!item.countBallast) continue;
    const recipe = recipeFor(item.partId);
    if (!recipe) {
      const part = {
        key: `recipe:${item.partId}`,
        label: `${track.label} (published PennLUG ballast recipe unavailable)`,
      };
      increment(totals.unknown, part, 1);
      increment(owner.unknown, part, 1);
      continue;
    }
    for (const material of recipe.materials) {
      const part = materialLabel(material);
      increment(totals.ballast, part, material.quantity);
      increment(owner.ballast, part, material.quantity);
    }
  }

  return {
    track: rows(totals.track),
    ballast: rows(totals.ballast),
    unknown: rows(totals.unknown),
    members: [...members.values()].map(({ member: { id, name, bring }, counts }) => {
      for (const [key, quantity] of Object.entries(bring)) {
        if (!Number.isSafeInteger(quantity) || counts.track.has(key) || counts.ballast.has(key)) {
          continue;
        }
        const part = trackLabels.get(key) ?? materialLabels.get(key) ?? { key, label: key };
        increment(materialLabels.has(key) ? counts.ballast : counts.track, part, 0);
      }
      const committed = new Map(Object.entries(bring));
      return {
        id,
        name,
        rows: rows(counts.track, counts.ballast).map((part) => {
          const quantity = committed.get(part.key) ?? null;
          return {
            ...part,
            committed: quantity,
            delta: quantity === null ? null : quantity - part.required,
          };
        }),
        unknown: rows(counts.unknown),
      };
    }),
    unassigned: [...unassigned.entries()]
      .sort(([a], [b]) => compareKeys(a, b))
      .map(([, { label, counts }]) => ({
        label,
        rows: rows(counts.track, counts.ballast),
        unknown: rows(counts.unknown),
      })),
  };
}
