import { action, choice, container, control, element, field, textNode } from "./editor_dom";
import { newId } from "./editor_state";
import type { Analysis } from "./engine";
import { maxPlanarStuds } from "./project";
import type { Keepout, Project, Venue } from "./project";

const scales = { stud: 1, in: 25.4 / 8, cm: 10 / 8 };
type Commit = (project: Project) => void;

function scale(unit: string): number {
  return unit === "in" || unit === "cm" ? scales[unit] : scales.stud;
}

function measurement(
  units: HTMLSelectElement,
  id: string,
  label: string,
  initial: number | undefined,
  dimension = true,
): { label: HTMLLabelElement; read: () => number } {
  let conversion = scale(units.value);
  let studs = initial ?? NaN;
  const input = field(id, initial === undefined ? "" : initial / conversion, "any");
  if (dimension) input.inputMode = "decimal";
  // Keep untouched measurements exact in studs when changing display units.
  let shown = input.value;
  const value = (): number => (input.value === shown ? studs : input.valueAsNumber * conversion);
  input.addEventListener("input", () => input.setCustomValidity(""));
  units.addEventListener("change", () => {
    studs = value();
    conversion = scale(units.value);
    input.value = Number.isFinite(studs) ? String(studs / conversion) : "";
    shown = input.value;
    input.setCustomValidity("");
  });
  function read(): number {
    const number = value();
    const valid = dimension
      ? Number.isFinite(number) && number > 0 && number <= maxPlanarStuds
      : Number.isFinite(number) && Math.abs(number) <= maxPlanarStuds;
    const message = dimension
      ? `Enter a positive ${label.toLowerCase()} up to ${maxPlanarStuds} studs.`
      : `Enter a coordinate within ${maxPlanarStuds} studs of zero.`;
    input.setCustomValidity(valid ? "" : message);
    return number;
  }
  return { label: control(label, input), read };
}

function submit(id: string, name: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = id;
  button.type = "submit";
  button.className = "primary";
  button.textContent = name;
  return button;
}

function venueForm(project: Project, units: HTMLSelectElement, commit: Commit): HTMLFormElement {
  const { venue } = project;
  const width = measurement(units, "venue-width", "Venue width", venue?.width);
  const depth = measurement(units, "venue-depth", "Venue depth", venue?.depth);
  const form = document.createElement("form");
  const save = submit("save-venue", "Save venue");
  const actions = container("form-actions", save);
  if (venue) {
    actions.append(
      action(venue.keepouts.length ? "Remove venue and keepouts" : "Remove venue", () => {
        commit({ ...project, venue: undefined });
        if (!form.isConnected) document.getElementById("venue-width")?.focus();
      }),
    );
  }
  form.append(
    textNode("p", "Northwest corner at (0, 0). X increases right and Y increases down."),
    control("Measurement unit", units),
    container("field-grid", width.label, depth.label),
    actions,
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = { width: width.read(), depth: depth.read(), keepouts: venue?.keepouts ?? [] };
    if (form.reportValidity()) commit({ ...project, venue: next });
  });
  return form;
}

function keepoutForm(
  venue: Venue,
  units: HTMLSelectElement,
  saveVenue: (venue: Venue) => void,
  open: ReadonlySet<string>,
  index?: number,
): HTMLDetailsElement {
  const keepout = index === undefined ? undefined : venue.keepouts[index];
  const key = keepout?.id ?? "";
  const prefix = `venue-keepout-${index ?? "new"}`;
  const name = field(`${prefix}-name`, keepout?.name ?? "");
  const x = measurement(units, `${prefix}-x`, "Center X", keepout?.x ?? 0, false);
  const y = measurement(units, `${prefix}-y`, "Center Y", keepout?.y ?? 0, false);
  const width = measurement(units, `${prefix}-width`, "Keepout width", keepout?.width);
  const depth = measurement(units, `${prefix}-depth`, "Keepout depth", keepout?.depth);
  const form = document.createElement("form");
  const save = submit(`${prefix}-save`, keepout ? "Save keepout" : "Add keepout");
  const actions = container("form-actions", save);
  if (keepout) {
    actions.append(
      action("Delete keepout", () => {
        saveVenue({ ...venue, keepouts: venue.keepouts.filter(({ id }) => id !== key) });
        if (!form.isConnected) document.getElementById("venue-keepout-new-summary")?.focus();
      }),
    );
  }
  name.addEventListener("input", () => name.setCustomValidity(""));
  form.append(
    control("Keepout name", name),
    container("field-grid", x.label, y.label, width.label, depth.label),
    actions,
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = { x: x.read(), y: y.read(), width: width.read(), depth: depth.read() };
    const title = name.value.trim();
    name.setCustomValidity(title ? "" : "Enter a keepout name.");
    if (!form.reportValidity()) return;
    const next: Keepout = { id: keepout?.id ?? newId("keepout"), name: title, ...values };
    const keepouts = keepout
      ? venue.keepouts.map((entry) => (entry.id === key ? next : entry))
      : [...venue.keepouts, next];
    saveVenue({ ...venue, keepouts });
    if (!keepout && !form.isConnected) {
      document.getElementById(`venue-keepout-${venue.keepouts.length}-summary`)?.focus();
    }
  });

  const summary = document.createElement("summary");
  summary.id = `${prefix}-summary`;
  summary.textContent = keepout?.name ?? "Add a keepout";
  const details = document.createElement("details");
  details.dataset["venueKeepout"] = key;
  details.open = open.has(key);
  details.append(summary, form);
  return details;
}

function fitRows(analysis: Analysis, pick: (id: string) => void): HTMLElement[] {
  const { project, venueIssues, counts, unresolved } = analysis;
  if (!venueIssues.length && !unresolved.length) return [];
  const names = new Map(project.tables.map(({ id, name }) => [id, name] as const));
  const trackNames = new Map(counts.map(({ partId, name }) => [partId, name] as const));
  for (const item of project.items) {
    const name = item.kind === "track" ? (trackNames.get(item.partId) ?? item.partId) : item.name;
    names.set(item.id, name || "Baseplate");
  }
  const keepouts = new Map(project.venue?.keepouts.map(({ id, name }) => [id, name] as const));
  function row(label: string, id: string, index: number): HTMLButtonElement {
    const button = action(label, () => pick(id));
    button.className = "list-row";
    button.id = `venue-issue-${index}`;
    return button;
  }
  const rows = venueIssues.map(({ kind, entityId, otherId }, index) => {
    const name = names.get(entityId) ?? entityId;
    if (kind === "outside-venue") return row(`${name} is outside the venue`, entityId, index);
    const other = otherId ?? "";
    const overlap =
      kind === "keepout" ? `keepout ${keepouts.get(other) ?? other}` : (names.get(other) ?? other);
    return row(`${name} overlaps ${overlap}`, entityId, index);
  });
  for (const { id, name, sourceId } of unresolved) {
    rows.push(row(`Unresolved: ${name} (${sourceId})`, id, rows.length));
  }
  return rows;
}

export function renderVenue(analysis: Analysis, commit: Commit, pick: (id: string) => void): void {
  const panel = element("venue-panel");
  const { project } = analysis;
  const units = choice(
    "venue-unit",
    [
      ["stud", "Studs"],
      ["in", "Inches"],
      ["cm", "Centimeters"],
    ],
    panel.querySelector<HTMLSelectElement>("#venue-unit")?.value ?? "stud",
  );
  const open = new Set(
    Array.from(
      panel.querySelectorAll<HTMLDetailsElement>("details[open]"),
      (details) => details.getAttribute("data-venue-keepout") ?? "",
    ),
  );
  const children: HTMLElement[] = [venueForm(project, units, commit)];
  const { venue } = project;
  if (venue) {
    const saveVenue = (next: Venue): void => commit({ ...project, venue: next });
    children.push(
      textNode("h3", "Keepouts"),
      ...venue.keepouts.map((_, index) => keepoutForm(venue, units, saveVenue, open, index)),
      keepoutForm(venue, units, saveVenue, open),
    );
  }
  const issues = fitRows(analysis, pick);
  if (issues.length || venue) {
    children.push(textNode("h3", "Venue fit"));
    children.push(...(issues.length ? issues : [textNode("p", "No venue fit issues.")]));
  }
  panel.replaceChildren(...children);
}
