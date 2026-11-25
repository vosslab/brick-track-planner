import ballastRecipes from "../data/ballast_recipes.json" with { type: "json" };
import buildReferences from "../data/build_references.json" with { type: "json" };
import type { Catalog, Project } from "./project";

export type RequiredRow = { key: string; label: string; required: number };
export type GroupInventory = { id: string; name: string; note?: string; rows: RequiredRow[] };
export type BuildReference = { id: string; title: string; source: string; description: string };
export type ShowInventory = {
  track: RequiredRow[];
  ballast: RequiredRow[];
  unknown: RequiredRow[];
  groups: GroupInventory[];
  buildReferences: BuildReference[];
};

type PartLabel = Omit<RequiredRow, "required">;
type InventoryLabel = PartLabel & { quantity: number };
type QuantityMap = Map<string, RequiredRow>;
type Tally = { track: QuantityMap; ballast: QuantityMap; unknown: QuantityMap };
type BallastRecipe = (typeof ballastRecipes)[number];
type Material = BallastRecipe["materials"][number];

export function recipeFor(partId: string): BallastRecipe | undefined {
  return ballastRecipes.find(({ trackPartIds }) => trackPartIds.includes(partId));
}

function materialLabel(material: Material): PartLabel {
  return {
    key: `ballast:${material.partId}:${material.color}`,
    label: `${material.name} (${material.color.replace(/-/g, " ")}, ${material.partId})`,
  };
}

function tally(): Tally {
  return { track: new Map(), ballast: new Map(), unknown: new Map() };
}

function increment(map: QuantityMap, part: PartLabel, quantity: number): void {
  const row = map.get(part.key);
  if (row) row.required += quantity;
  else map.set(part.key, { key: part.key, label: part.label, required: quantity });
}

function rows(...maps: QuantityMap[]): RequiredRow[] {
  return maps
    .flatMap((map) => [...map.values()])
    .sort(
      (left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key),
    );
}

function addItem(
  item: Project["items"][number],
  labels: Map<string, InventoryLabel[]>,
  counts: Tally,
): void {
  if (item.kind === "unresolved") {
    increment(
      counts.unknown,
      {
        key: `unresolved:${JSON.stringify([item.sourceId, item.name])}`,
        label: `Unresolved import ${item.name} (${item.sourceId})`,
      },
      1,
    );
    return;
  }
  if (item.kind !== "track") return;
  const track = labels.get(item.partId);
  if (!track) {
    increment(
      counts.unknown,
      { key: `unknown:${item.partId}`, label: `Unknown track (${item.partId})` },
      1,
    );
    return;
  }
  for (const component of track) increment(counts.track, component, component.quantity);
  if (!item.countBallast) return;
  const recipe = recipeFor(item.partId);
  if (!recipe) {
    increment(
      counts.unknown,
      {
        key: `recipe:${item.partId}`,
        label: `${track[0]?.label ?? item.partId} (published PennLUG ballast recipe unavailable)`,
      },
      1,
    );
    return;
  }
  for (const material of recipe.materials)
    increment(counts.ballast, materialLabel(material), material.quantity);
}

/** Lists physical pieces in this member's design area. A group is a placed arrangement kit. */
export function showInventory(project: Project, catalog: Catalog): ShowInventory {
  const visible = new Set(project.layers.filter((layer) => layer.visible).map(({ id }) => id));
  const labels = new Map(
    catalog.parts.map(({ id, brand, name, inventory }) => [
      id,
      (inventory ?? [{ id, name: `${brand} ${name}`, quantity: 1 }]).map((component) => ({
        key: component.id,
        label: component.name,
        quantity: component.quantity,
      })),
    ]),
  );
  const kits = new Map(catalog.kits.map((kit) => [kit.id, kit]));
  const totals = tally();
  const grouped = new Map<string, { counts: Tally; arrangementId?: string }>();
  const arrangementIds = new Set<string>();
  for (const item of project.items) {
    if (!visible.has(item.layerId)) continue;
    addItem(item, labels, totals);
    if (item.kind === "track" && item.arrangementId) arrangementIds.add(item.arrangementId);
    if (item.kind === "track" && item.groupId) {
      const group = grouped.get(item.groupId) ?? {
        counts: tally(),
        arrangementId: item.arrangementId,
      };
      grouped.set(item.groupId, group);
      addItem(item, labels, group.counts);
    }
  }
  return {
    track: rows(totals.track),
    ballast: rows(totals.ballast),
    unknown: rows(totals.unknown),
    groups: [...grouped]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, group]) => {
        const kit = group.arrangementId ? kits.get(group.arrangementId) : undefined;
        return {
          id,
          name: kit?.name ?? id,
          note: kit?.notes,
          rows: rows(group.counts.track, group.counts.ballast),
        };
      }),
    buildReferences: buildReferences
      .filter((reference) => reference.arrangementIds.some((id) => arrangementIds.has(id)))
      .map(({ id, title, source, description }) => ({ id, title, source, description })),
  };
}
