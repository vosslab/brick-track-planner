import type { Analysis } from "./engine";
import { action, choice, container, control, element, field, textNode } from "./editor_dom";
import { edges, turnoutCommon } from "./editor_state";
import { worldPose } from "./project";
import type { Catalog, Edge, Item, Pose, Project, Table } from "./project";

function round(value: number): number {
  return Number(value.toFixed(8));
}

function dimensions(table: Table): string {
  const measured = `${table.width} x ${table.depth} studs`;
  return table.nominal
    ? `Nominal module: ${table.nominal} (${measured})`
    : `Measured dimensions: ${measured}`;
}

type PoseForm = Pose & { heightPlates?: number; tableId?: string; name?: string; fronts?: Edge[] };

export function renderSelection(
  project: Project,
  catalog: Catalog,
  ids: ReadonlySet<string>,
  callbacks: {
    apply: (values: PoseForm, origin: Pose) => void;
    remove: () => void;
    turnout: (id: string, partId: string) => void;
  },
): void {
  const panel = element("selection-panel");
  const table = project.tables.find(({ id }) => ids.has(id));
  const item = project.items.find(({ id }) => ids.has(id));
  if (!table && !item) {
    panel.replaceChildren(textNode("p", "Select a table or a piece to edit its position."));
    return;
  }
  const part =
    item?.kind === "track" ? catalog.parts.find(({ id }) => id === item.partId) : undefined;
  const group = ids.size > 1;
  const singleTable = group ? undefined : table;
  const singleItem = group || table ? undefined : item;
  const title = group ? `${ids.size} selected` : (table?.name ?? part?.name ?? itemName(item));
  const pose = table ?? (item && worldPose(item, project.tables));
  if (!pose) return;

  const form = document.createElement("form");
  form.id = "pose-form";
  const x = field("pose-x", round(pose.x), "any");
  const y = field("pose-y", round(pose.y), "any");
  const angle = field("pose-angle", round(pose.angle), "any");
  form.append(
    container(
      "field-grid",
      control("X (studs)", x),
      control("Y (studs)", y),
      control("Rotation (degrees)", angle),
    ),
  );
  const height = appendHeight(form, singleItem);
  const attachment = appendAttachment(form, project.tables, singleItem);
  const tableFields = appendTable(form, singleTable);
  const apply = document.createElement("button");
  apply.id = "apply-pose";
  apply.type = "submit";
  apply.textContent = "Apply";
  apply.className = "primary";
  const remove = action("Delete", callbacks.remove);
  remove.id = "delete-selection";
  form.append(container("form-actions", apply, remove));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    callbacks.apply(
      {
        x: x.valueAsNumber,
        y: y.valueAsNumber,
        angle: angle.valueAsNumber,
        heightPlates: height?.valueAsNumber,
        tableId: attachment?.value,
        name: tableFields?.name.value,
        fronts: tableFields?.fronts.filter((entry) => entry.input.checked).map(({ edge }) => edge),
      },
      pose,
    );
  });
  panel.replaceChildren(textNode("h3", title), form);
  if (singleItem?.kind === "track" && part && turnoutCommon(part)) {
    const variants = catalog.parts
      .filter((option) => turnoutCommon(option) && option.brand === part.brand)
      .map(({ id, name }): [string, string] => [id, name]);
    if (variants.length > 1) {
      const swap = choice("turnout-variant", variants, part.id);
      panel.append(control("Swap turnout (keep common port)", swap));
      swap.addEventListener("change", () => callbacks.turnout(singleItem.id, swap.value));
    }
  }
}

function itemName(item?: Item): string {
  if (item?.kind === "unresolved") return item.name;
  if (item?.kind === "baseplate") return item.name ?? "Baseplate";
  return "Track";
}

function appendHeight(form: HTMLFormElement, item?: Item): HTMLInputElement | undefined {
  if (item?.kind !== "track") return undefined;
  const height = field("height-plates", item.heightPlates, "1");
  form.append(control("Height (plates)", height));
  return height;
}

function appendAttachment(
  form: HTMLFormElement,
  tables: Table[],
  item?: Item,
): HTMLSelectElement | undefined {
  if (!item) return undefined;
  const options = tables.map(({ id, name }): [string, string] => [id, name]);
  const attachment = choice("attached-table", [["", "World"], ...options], item.tableId ?? "");
  form.append(control("Attached to", attachment));
  return attachment;
}

function appendTable(
  form: HTMLFormElement,
  table?: Table,
): { name: HTMLInputElement; fronts: { input: HTMLInputElement; edge: Edge }[] } | undefined {
  if (!table) return undefined;
  const name = field("edit-table-name", table.name);
  name.maxLength = 120;
  const rows: HTMLElement[] = [];
  const fronts = edges.map((edge) => {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = table.fronts.includes(edge);
    input.value = edge;
    const label = control(edge[0]?.toUpperCase() + edge.slice(1), input);
    label.className = "check";
    rows.push(label);
    return { input, edge };
  });
  const heading = textNode("p", dimensions(table));
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Front lane guides";
  fieldset.append(legend, container("field-grid", ...rows));
  form.append(control("Table name", name), heading, fieldset);
  return { name, fronts };
}

export function renderTables(
  project: Project,
  ids: ReadonlySet<string>,
  pick: (id: string) => void,
): void {
  element("table-count").textContent = String(project.tables.length);
  const panel = element("table-list");
  const rows = project.tables.map((table) => {
    const row = action(table.name, () => pick(table.id));
    row.className = "list-row";
    row.dataset["selectTable"] = table.id;
    row.setAttribute("aria-pressed", String(ids.has(table.id)));
    row.append(textNode("small", dimensions(table)));
    return row;
  });
  panel.replaceChildren(...(rows.length ? rows : [textNode("p", "No tables added.")]));
}

export function renderLayers(
  project: Project,
  toggle: (id: string, visible: boolean) => void,
  pick: (id: string) => void,
): void {
  const rows = project.layers.map(({ id, name, visible }) => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = visible;
    checkbox.addEventListener("change", () => toggle(id, checkbox.checked));
    const label = control(name, checkbox);
    label.className = "check";
    if (visible) return label;
    const tables = project.tables.filter(({ layerId }) => layerId === id);
    const items = project.items.filter(({ layerId }) => layerId === id);
    const hidden = [...tables, ...items].map((entry) => {
      const name =
        "kind" in entry ? (entry.kind === "track" ? entry.partId : itemName(entry)) : entry.name;
      const row = action(name, () => pick(entry.id));
      row.className = "list-row";
      return row;
    });
    return container("hidden-layer", label, ...hidden);
  });
  element("layer-list").replaceChildren(...rows);
}

export function renderDiagnostics(
  analysis: Analysis,
  pick: (id: string) => void,
  editSeam: (id: string) => void,
): void {
  const { counts, overhangs, noTable, unresolved, seams } = analysis;
  const total = counts.reduce((sum, { count }) => sum + count, 0);
  element("parts-count").textContent = String(total);
  const tally = counts.map(({ brand, name, count }) => {
    const row = container("list-row", textNode("small", `${brand} ${name}`));
    row.append(String(count));
    return row;
  });
  element("parts-summary").replaceChildren(
    ...(tally.length ? tally : [textNode("p", "No visible track.")]),
  );

  const status = element("fit-status");
  status.textContent = noTable
    ? "No visible tabletop"
    : overhangs.length
      ? `${overhangs.length} overhanging`
      : "Fits tabletop";
  status.classList.toggle("bad-status", !noTable && overhangs.length > 0);

  const diagnostics: HTMLElement[] = [];
  for (const { pieceId } of overhangs) {
    const item = analysis.project.items.find(({ id }) => id === pieceId);
    const part =
      item?.kind === "track" ? counts.find(({ partId }) => partId === item.partId) : undefined;
    const row = action(`Overhang: ${part?.name ?? pieceId}`, () => pick(pieceId));
    row.dataset["overhangId"] = pieceId;
    diagnostics.push(row);
  }
  for (const port of analysis.ports.filter(({ ambiguous }) => ambiguous)) {
    diagnostics.push(
      action(`Ambiguous connector: ${port.pieceId} / ${port.portId}`, () => pick(port.pieceId)),
    );
  }
  for (const { id, sourceId, name } of unresolved) {
    diagnostics.push(action(`Unresolved: ${name} (${sourceId})`, () => pick(id)));
  }
  for (const { id, outer, inner } of seams) {
    const tableSeam = analysis.project.seams.find((seam) => seam.id === id);
    const a = analysis.project.tables.find((table) => table.id === tableSeam?.tableA);
    const b = analysis.project.tables.find((table) => table.id === tableSeam?.tableB);
    const label = a && b ? `${a.name} / ${b.name}` : id;
    const row = action(label, () => editSeam(id));
    row.dataset["seamId"] = id;
    row.append(
      textNode("small", `Outer: ${seamStatus(outer)}`),
      textNode("small", `Inner: ${seamStatus(inner)}`),
    );
    diagnostics.push(row);
  }
  for (const row of diagnostics) row.classList.add("list-row");
  element("diagnostics").replaceChildren(
    ...(diagnostics.length ? diagnostics : [textNode("p", "No issues or seams.")]),
  );
}

function seamStatus(endpoint: Analysis["seams"][number]["outer"]): string {
  const details: string[] = [];
  if (endpoint.ambiguous) details.push("ambiguous connector");
  if (endpoint.gap !== undefined && endpoint.gap > 0.0001)
    details.push(`${Number(endpoint.gap.toFixed(2))} studs`);
  if (endpoint.angle !== undefined && Math.abs(endpoint.angle) > 0.0001)
    details.push(`${Number(endpoint.angle.toFixed(1))} degrees`);
  if (endpoint.height) details.push(`${endpoint.height} plates`);
  return details.length ? `${endpoint.status} (${details.join(", ")})` : endpoint.status;
}
