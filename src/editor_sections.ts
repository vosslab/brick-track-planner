import { action, choice, container, control, field, textNode } from "./editor_dom";
import { errorMessage } from "./editor_files";
import { edges, newId } from "./editor_state";
import { evaluate } from "./engine";
import type { Analysis, EndpointStatus } from "./engine";
import { composePose, localPose } from "./project";
import type { Edge, Endpoint, Pose, Project, Section, SectionExit, Table } from "./project";
import { downloadBlob } from "./project_files";
import { exportSection, importSection, parseSectionBundle } from "./section_files";
import {
  assignSection,
  deleteSection,
  exitSeam,
  moveSection,
  previewSectionAlignment,
  removeSectionExit,
  saveSectionExit,
  sectionExitOffStandard,
  sectionTables,
} from "./sections";

type Hooks = {
  analysis: Analysis;
  selectedIds: ReadonlySet<string>;
  commit: (project: Project, selectIds?: string[]) => void;
  select?: (ids: string[]) => void;
  describe: (endpoint: Endpoint) => string;
  notice: (message: string, error?: boolean) => void;
};

type ExitDraft = {
  id?: string;
  name: string;
  tableId: string;
  edge: Edge;
  outer: string;
  inner: string;
};

type Preview =
  | { kind: "export"; report: ReturnType<typeof exportSection> }
  | { kind: "import"; bundle: ReturnType<typeof parseSectionBundle> }
  | { kind: "align"; result: ReturnType<typeof previewSectionAlignment> }
  | { kind: "delete"; section: Section };

function endpointKey({ pieceId, portId }: Endpoint): string {
  return JSON.stringify([pieceId, portId]);
}

function exitDraft(exit?: SectionExit): ExitDraft {
  return exit
    ? { ...exit, outer: endpointKey(exit.outer), inner: endpointKey(exit.inner) }
    : { name: "", tableId: "", edge: "east", outer: "", inner: "" };
}

function namedAction(id: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = action(label, onClick);
  button.id = id;
  return button;
}

function submitForm(
  id: string,
  label: string,
  submit: () => void,
  fields: HTMLElement[],
  disabled = false,
): HTMLFormElement {
  const form = document.createElement("form");
  const button = document.createElement("button");
  button.id = id;
  button.type = "submit";
  button.textContent = label;
  button.disabled = disabled;
  form.append(...fields, container("form-actions", button));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  return form;
}

function poseFields(prefix: string, pose: Pose): { controls: HTMLElement; read: () => Pose } {
  const x = field(`${prefix}-x`, pose.x, "any");
  const y = field(`${prefix}-y`, pose.y, "any");
  const angle = field(`${prefix}-angle`, pose.angle, "any");
  return {
    controls: container(
      "field-grid",
      control("X (studs)", x),
      control("Y (studs)", y),
      control("Rotation (degrees)", angle),
    ),
    read: () => ({ x: x.valueAsNumber, y: y.valueAsNumber, angle: angle.valueAsNumber }),
  };
}

function alignmentChanges(
  before: Analysis,
  after: Analysis,
  seamId: string,
  hooks: Hooks,
): string[] {
  const changes: string[] = [];
  const previousSeams = new Map(before.seams.map((seam) => [seam.id, seam]));
  const seamDefinitions = new Map(after.project.seams.map((seam) => [seam.id, seam]));
  const exitNames = new Map(
    after.project.sections.flatMap((section) =>
      section.exits.map(({ id, name }): [string, string] => [id, `${section.name} / ${name}`]),
    ),
  );
  for (const seam of after.seams) {
    if (seam.id === seamId) continue;
    const previous = previousSeams.get(seam.id);
    if (!previous) continue;
    const definition = seamDefinitions.get(seam.id);
    if (!definition) continue;
    for (const lane of ["outer", "inner"] as const) {
      if (previous[lane].status === seam[lane].status) continue;
      const nameA =
        (definition.exitAId && exitNames.get(definition.exitAId)) ??
        hooks.describe(definition[lane].a);
      const nameB =
        (definition.exitBId && exitNames.get(definition.exitBId)) ??
        hooks.describe(definition[lane].b);
      changes.push(
        `${nameA} to ${nameB} (${lane} lane): ${previous[lane].status} to ${seam[lane].status}.`,
      );
    }
  }

  const priorPorts = new Map(before.ports.map((port) => [endpointKey(port), port.joined]));
  const candidate = after.project.seams.find(({ id }) => id === seamId);
  const aligned = new Set(
    candidate
      ? [candidate.outer.a, candidate.outer.b, candidate.inner.a, candidate.inner.b].map(
          endpointKey,
        )
      : [],
  );
  for (const port of after.ports) {
    const key = endpointKey(port);
    if (!aligned.has(key) && priorPorts.get(key) !== port.joined) {
      changes.push(`${port.joined ? "Joins" : "Opens"} ${hooks.describe(port)}.`);
    }
  }

  const beforeTables = new Map(before.project.tables.map((table) => [table.id, table]));
  const movedTables = new Set(
    after.project.tables
      .filter((table) => {
        const previous = beforeTables.get(table.id);
        return (
          previous &&
          (previous.x !== table.x || previous.y !== table.y || previous.angle !== table.angle)
        );
      })
      .map(({ id }) => id),
  );
  const moved = new Set([
    ...movedTables,
    ...after.project.items
      .filter(({ tableId }) => tableId && movedTables.has(tableId))
      .map(({ id }) => id),
  ]);
  const labels = new Map([
    ...after.project.tables.map(({ id, name }): [string, string] => [id, name]),
    ...after.project.items.map((item): [string, string] => [
      item.id,
      item.kind === "track" ? item.partId : (item.name ?? "Baseplate"),
    ]),
    ...(after.project.venue?.keepouts.map(({ id, name }): [string, string] => [id, name]) ?? []),
  ]);
  for (const issue of after.venueIssues ?? []) {
    if (!moved.has(issue.entityId) && !(issue.otherId && moved.has(issue.otherId))) continue;
    const name = labels.get(issue.entityId) ?? issue.entityId;
    const other = issue.otherId && (labels.get(issue.otherId) ?? issue.otherId);
    if (issue.kind === "table-overlap")
      changes.push(`${name} overlaps ${other ?? "another table"}.`);
    if (issue.kind === "outside-venue") changes.push(`${name} extends outside the venue.`);
    if (issue.kind === "keepout") changes.push(`${name} overlaps keepout ${other ?? "area"}.`);
  }
  return changes;
}

function laneStatus(label: string, status: EndpointStatus): string {
  const gap =
    status.gap === undefined || status.status === "joined"
      ? ""
      : ` (${status.gap.toFixed(3)} studs apart)`;
  return `${label} lane: ${status.status}${gap}.`;
}

function exitStandard(analysis: Analysis, label: string, exit: SectionExit): HTMLElement[] {
  if (!analysis.project.tables.some(({ id, niltc }) => id === exit.tableId && niltc)) return [];
  const offStandard = sectionExitOffStandard(analysis, exit);
  const outer = offStandard.includes("outer") ? "off standard" : "on standard";
  const inner = offStandard.includes("inner") ? "off standard" : "on standard";
  return [textNode("small", `${label} NILTC: outer ${outer}, inner ${inner}.`)];
}

export class SectionsEditor {
  #host: HTMLElement | undefined;
  #hooks: Hooks | undefined;
  #sectionId: string | undefined;
  #fixedId: string | undefined;
  #movingId: string | undefined;
  #exit = exitDraft();
  #preview: Preview | undefined;
  #fileRevision = 0;

  reset(): void {
    this.#sectionId = this.#fixedId = this.#movingId = undefined;
    this.#exit = exitDraft();
    this.#preview = undefined;
    this.#fileRevision += 1;
  }

  render(host: HTMLElement, hooks: Hooks): void {
    if (this.#hooks?.analysis !== hooks.analysis && this.#preview?.kind !== "import") {
      this.#preview = undefined;
      if (this.#exit.id) {
        const section = hooks.analysis.project.sections.find(({ id }) => id === this.#sectionId);
        this.#exit = exitDraft(section?.exits.find(({ id }) => id === this.#exit.id));
      }
    }
    const disclosure = host.closest("details");
    if (host !== this.#host) {
      disclosure?.addEventListener("toggle", () => {
        if (disclosure.open) this.#draw();
      });
    }
    this.#host = host;
    this.#hooks = hooks;
    if (!disclosure || disclosure.open) this.#draw();
  }

  focusSeam(seamId: string): boolean {
    const project = this.#hooks?.analysis.project;
    const seam = project?.seams.find(({ id }) => id === seamId);
    if (!project || !seam?.exitAId || !seam.exitBId) return false;
    const a = project.sections.find(({ exits }) => exits.some(({ id }) => id === seam.exitAId));
    const b = project.sections.find(({ exits }) => exits.some(({ id }) => id === seam.exitBId));
    if (!a || !b || a.id === b.id) return false;
    this.#sectionId = a.id;
    this.#fixedId = seam.exitAId;
    this.#movingId = seam.exitBId;
    this.#exit = exitDraft(a.exits.find(({ id }) => id === seam.exitAId));
    this.#preview = undefined;
    this.#draw();
    const control = this.#host?.querySelector<HTMLSelectElement>("#fixed-section-exit");
    control?.closest("details")?.setAttribute("open", "");
    control?.focus();
    control?.scrollIntoView({ block: "nearest" });
    return true;
  }

  #run(change: () => void): void {
    try {
      change();
    } catch (error) {
      this.#hooks?.notice(errorMessage(error), true);
    }
  }

  #draw(): void {
    const host = this.#host;
    const hooks = this.#hooks;
    if (!host || !hooks) return;
    const focused = document.activeElement?.id;
    const { project } = hooks.analysis;
    const selection = project.tables.filter(({ id }) => hooks.selectedIds.has(id));
    const section =
      project.sections.find(({ id }) => id === this.#sectionId) ??
      project.sections.find(({ id }) => selection.some(({ sectionId }) => id === sectionId)) ??
      project.sections[0];
    if (this.#sectionId !== section?.id) this.#exit = exitDraft();
    this.#sectionId = section?.id;

    const name = field("new-section-name", "");
    const create = submitForm(
      "create-section",
      "Create section from selection",
      () =>
        this.#run(() => {
          const label = name.value.trim();
          if (!label) throw new Error("Enter a section name.");
          const draft = structuredClone(project);
          this.#sectionId = newId("section");
          draft.sections.unshift({ id: this.#sectionId, name: label, exits: [] });
          assignSection(draft, new Set(selection.map(({ id }) => id)), this.#sectionId);
          this.#exit = exitDraft();
          hooks.commit(draft);
          hooks.notice(`Created ${label}.`);
        }),
      [control("New section name", name)],
      !selection.length,
    );

    const file = document.createElement("input");
    file.id = "import-section-file";
    file.type = "file";
    file.accept = ".btps.json,.json";
    file.hidden = true;
    file.addEventListener("change", () => void this.#readFile(file));
    const upload = namedAction("open-section-bundle", "Import section", () => file.click());
    const children: HTMLElement[] = [create, upload, file];
    const counts = new Map<string, number>();
    const options: [string, string][] = project.sections.map(({ id, name }) => {
      const count = (counts.get(name) ?? 0) + 1;
      counts.set(name, count);
      return [id, count === 1 ? name : `${name} (${count})`];
    });
    if (section) {
      const picker = choice("active-section", options, section.id);
      picker.addEventListener("change", () => {
        this.#sectionId = picker.value;
        this.#fixedId = this.#movingId = undefined;
        this.#exit = exitDraft();
        this.#preview = undefined;
        this.#draw();
      });
      children.push(control("Section", picker), this.#sectionControls(hooks, section, selection));
      const link = this.#linkControls(hooks, section, new Map(options));
      if (link) children.push(link);
    }
    const preview = this.#previewControls(hooks);
    if (preview) children.push(preview);
    host.replaceChildren(...children);
    if (focused && document.activeElement === document.body) {
      const replacement = document.getElementById(focused);
      if (replacement && host.contains(replacement)) replacement.focus({ preventScroll: true });
    }
  }

  async #readFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const revision = ++this.#fileRevision;
    try {
      const text = await file.text();
      if (revision !== this.#fileRevision) return;
      this.#preview = { kind: "import", bundle: parseSectionBundle(text) };
      this.#showPreview();
    } catch (error) {
      if (revision === this.#fileRevision) this.#hooks?.notice(errorMessage(error), true);
    }
  }

  #sectionControls(hooks: Hooks, section: Section, selection: Table[]): HTMLElement {
    const { project } = hooks.analysis;
    const tables = sectionTables(project, section.id);
    const [anchor] = tables;
    const name = field("section-name", section.name);
    const owners: [string, string][] = project.members.map(({ id, name }) => [id, name]);
    const owner = choice("section-owner", [["", "Unassigned"], ...owners], section.memberId ?? "");
    const details = submitForm(
      "save-section",
      "Save section details",
      () =>
        this.#run(() => {
          const label = name.value.trim();
          if (!label) throw new Error("Enter a section name.");
          const draft = structuredClone(project);
          const edited = draft.sections.find(({ id }) => id === section.id);
          if (!edited) return;
          edited.name = label;
          if (owner.value) edited.memberId = owner.value;
          else delete edited.memberId;
          hooks.commit(draft);
        }),
      [control("Section name", name), control("Owner", owner)],
    );

    const available = selection
      .filter(({ sectionId }) => sectionId !== section.id)
      .map(({ id }) => id);
    const included = selection
      .filter(({ sectionId }) => sectionId === section.id)
      .map(({ id }) => id);
    const add = namedAction("add-tables-to-section", "Add selected tables", () =>
      this.#run(() => {
        const draft = structuredClone(project);
        assignSection(draft, new Set(available), section.id);
        hooks.commit(draft);
      }),
    );
    add.disabled = !available.length;
    const remove = namedAction("remove-tables-from-section", "Remove selected tables", () =>
      this.#run(() => {
        const draft = structuredClone(project);
        assignSection(draft, new Set(included));
        hooks.commit(draft);
      }),
    );
    remove.disabled = !included.length;
    const removeSection = namedAction("preview-delete-section", "Delete section", () => {
      this.#preview = { kind: "delete", section };
      this.#showPreview();
    });
    const membership = container("form-actions", add, remove);
    if (hooks.select && tables.length) {
      membership.append(
        namedAction("select-section-tables", "Select section tables", () => {
          hooks.select?.(tables.map(({ id }) => id));
        }),
      );
    }
    const panel = container(
      "section-controls",
      details,
      membership,
      textNode("p", `${tables.length} table${tables.length === 1 ? "" : "s"}`),
    );
    if (anchor) {
      const pose = poseFields("section", anchor);
      const movement = submitForm(
        "move-section",
        "Move section",
        () =>
          this.#run(() => {
            hooks.commit(moveSection(project, section.id, anchor, pose.read()));
          }),
        [textNode("small", `Position of ${anchor.name}'s northwest corner`), pose.controls],
      );
      const tableChoices: [string, string][] = tables.map(({ id, name }) => [id, name]);
      const anchorPicker = choice("section-export-anchor", tableChoices, anchor.id);
      const portable = submitForm(
        "preview-section-export",
        "Export section",
        () =>
          this.#run(() => {
            this.#preview = {
              kind: "export",
              report: exportSection(project, section.id, anchorPicker.value),
            };
            this.#showPreview();
          }),
        [control("Export anchor table", anchorPicker)],
      );
      panel.append(movement, portable);
    }

    if (anchor || section.exits.length) panel.append(this.#exitControls(hooks, section, tables));
    panel.append(removeSection);
    return panel;
  }

  #exitControls(hooks: Hooks, section: Section, tables: Table[]): HTMLElement {
    const { analysis } = hooks;
    const draft = this.#exit;
    draft.tableId ||= tables[0]?.id ?? "";
    const exitOptions: [string, string][] = section.exits.map(({ id, name }) => [id, name]);
    const picker = choice("section-exit", [["", "New exit"], ...exitOptions], draft.id ?? "");
    picker.addEventListener("change", () => {
      this.#exit = exitDraft(section.exits.find(({ id }) => id === picker.value));
      this.#draw();
    });

    const tableOptions: [string, string][] = tables.map(({ id, name }) => [id, name]);
    const currentTable = tables.find(({ id }) => id === draft.tableId);
    if (!currentTable && draft.tableId)
      tableOptions.push([draft.tableId, `Missing table (${draft.tableId})`]);
    const tablePicker = choice("exit-table", tableOptions, draft.tableId);
    tablePicker.addEventListener("change", () => {
      draft.tableId = tablePicker.value;
      draft.outer = draft.inner = "";
      this.#draw();
    });
    const name = field("exit-name", draft.name);
    name.addEventListener("input", () => {
      draft.name = name.value;
    });
    const edge = choice(
      "exit-edge",
      edges.map((edge) => [edge, edge]),
      draft.edge,
    );
    edge.addEventListener("change", () => {
      draft.edge = edges.find((candidate) => candidate === edge.value) ?? draft.edge;
      this.#draw();
    });
    const pieces = new Set(
      analysis.project.items.filter(({ tableId }) => tableId === draft.tableId).map(({ id }) => id),
    );
    const ports = analysis.ports.filter(({ pieceId }) => pieces.has(pieceId));
    const byKey = new Map<string, Endpoint>();
    const portOptions = ports.map((port): [string, string] => {
      const key = endpointKey(port);
      const point = currentTable ? localPose(port, currentTable) : port;
      const outside =
        currentTable &&
        {
          north: -point.y,
          east: point.x - currentTable.width,
          south: point.y - currentTable.depth,
          west: -point.x,
        }[draft.edge];
      const offset =
        outside && outside > 0.001 ? `, ${outside.toFixed(2)} studs beyond ${draft.edge} edge` : "";
      byKey.set(key, port);
      return [
        key,
        `${hooks.describe(port)} (${point.x.toFixed(2)}, ${point.y.toFixed(2)} studs${offset})`,
      ];
    });
    const saved = section.exits.find(({ id }) => id === draft.id);
    const lanePicker = (lane: "outer" | "inner"): HTMLSelectElement => {
      const options: [string, string][] = [["", "Choose connector"], ...portOptions];
      const endpoint = saved?.[lane];
      if (endpoint && !byKey.has(endpointKey(endpoint)) && draft[lane] === endpointKey(endpoint)) {
        byKey.set(draft[lane], endpoint);
        options.push([draft[lane], `Unavailable: ${hooks.describe(endpoint)}`]);
      }
      const pick = choice(`exit-${lane}`, options, draft[lane]);
      pick.required = true;
      pick.addEventListener("change", () => {
        draft[lane] = pick.value;
      });
      return pick;
    };
    const outer = lanePicker("outer");
    const inner = lanePicker("inner");

    const editor = submitForm(
      "save-section-exit",
      "Save exit",
      () =>
        this.#run(() => {
          const a = byKey.get(outer.value);
          const b = byKey.get(inner.value);
          if (!a || !b) throw new Error("Choose both lane connectors.");
          const label = name.value.trim();
          if (!label) throw new Error("Enter an exit name.");
          const project = structuredClone(analysis.project);
          const endpoint = ({ pieceId, portId }: Endpoint): Endpoint => ({ pieceId, portId });
          const exit = {
            id: draft.id ?? newId("exit"),
            name: label,
            tableId: draft.tableId,
            edge: draft.edge,
            outer: endpoint(a),
            inner: endpoint(b),
          };
          saveSectionExit(project, section.id, exit);
          this.#exit = exitDraft(exit);
          hooks.commit(project);
          hooks.notice(`Saved exit ${label}.`);
        }),
      [
        control("Exit name", name),
        container("field-grid", control("Exit table", tablePicker), control("Table edge", edge)),
        control("Outer connector", outer),
        control("Inner connector", inner),
      ],
      !currentTable,
    );
    const group = container(
      "section-exits",
      textNode("h3", "Named exits"),
      control("Exit", picker),
      editor,
    );
    if (saved) {
      group.append(
        ...exitStandard(analysis, saved.name, saved),
        namedAction("delete-section-exit", "Remove exit", () =>
          this.#run(() => {
            const project = structuredClone(analysis.project);
            removeSectionExit(project, saved.id);
            this.#exit = exitDraft();
            hooks.commit(project);
            hooks.notice(`Removed exit ${saved.name}.`);
          }),
        ),
      );
    }
    return group;
  }

  #linkControls(
    hooks: Hooks,
    section: Section,
    names: Map<string, string>,
  ): HTMLElement | undefined {
    const { analysis } = hooks;
    const { project } = analysis;
    const entries = project.sections.flatMap((owner) =>
      owner.exits.map((exit) => ({
        owner,
        exit,
        label: `${names.get(owner.id) ?? owner.name} / ${exit.name}`,
      })),
    );
    if (!entries.some(({ owner }) => owner.id !== entries[0]?.owner.id)) return undefined;
    const fixed =
      entries.find(({ exit }) => exit.id === this.#fixedId) ??
      entries.find(({ owner }) => owner.id === section.id) ??
      entries[0];
    if (!fixed) return undefined;
    const others = entries.filter(({ owner }) => owner.id !== fixed.owner.id);
    const moving = others.find(({ exit }) => exit.id === this.#movingId) ?? others[0];
    if (!moving) return undefined;
    const pickA = choice(
      "fixed-section-exit",
      entries.map(({ exit, label }) => [exit.id, label]),
      fixed.exit.id,
    );
    const pickB = choice(
      "moving-section-exit",
      others.map(({ exit, label }) => [exit.id, label]),
      moving.exit.id,
    );
    pickA.addEventListener("change", () => {
      this.#fixedId = pickA.value;
      this.#movingId = pickB.value;
      this.#preview = undefined;
      this.#draw();
    });
    pickB.addEventListener("change", () => {
      this.#fixedId = pickA.value;
      this.#movingId = pickB.value;
      this.#preview = undefined;
      this.#draw();
    });
    const fields = [
      control("Fixed exit (A)", pickA),
      ...exitStandard(analysis, "Fixed exit", fixed.exit),
      control("Moving exit (B)", pickB),
      ...exitStandard(analysis, "Moving exit", moving.exit),
    ];
    const connection = submitForm(
      "preview-section-link",
      "Preview alignment",
      () =>
        this.#run(() => {
          const result = previewSectionAlignment(analysis, pickA.value, pickB.value, evaluate, () =>
            newId("seam"),
          );
          this.#preview = { kind: "align", result };
          this.#showPreview();
        }),
      fields,
    );
    const controls = container("section-link", textNode("h3", "Connect section exits"), connection);
    const paired = exitSeam(project, fixed.exit.id);
    if (paired && (paired.exitAId === moving.exit.id || paired.exitBId === moving.exit.id)) {
      controls.append(
        namedAction("disconnect-section-exits", "Disconnect exits", () =>
          this.#run(() => {
            hooks.commit({ ...project, seams: project.seams.filter(({ id }) => id !== paired.id) });
            hooks.notice("Disconnected the named exits.");
          }),
        ),
      );
    }
    return controls;
  }

  #showPreview(): void {
    this.#draw();
    const preview = this.#host?.querySelector<HTMLElement>("#section-preview");
    preview?.focus({ preventScroll: true });
    preview?.scrollIntoView({ block: "nearest" });
  }

  #previewControls(hooks: Hooks): HTMLElement | undefined {
    const preview = this.#preview;
    if (!preview) return;
    const { analysis } = hooks;
    const { project } = analysis;
    const panel = document.createElement("fieldset");
    panel.id = "section-preview";
    panel.tabIndex = -1;
    const title = document.createElement("legend");
    panel.append(title);
    const cancel = namedAction("cancel-section-preview", "Cancel", () => {
      this.#preview = undefined;
      this.#draw();
    });
    switch (preview.kind) {
      case "export": {
        const { bundle, warnings } = preview.report;
        title.textContent = "Export section preview";
        panel.append(
          textNode(
            "p",
            `${bundle.section.name}: ${bundle.project.tables.length} tables, ${bundle.project.items.length} attached items.`,
          ),
        );
        for (const warning of warnings) panel.append(textNode("p", warning));
        panel.append(
          container(
            "form-actions",
            namedAction("confirm-section-export", "Download section", () =>
              this.#run(() => {
                const filename =
                  bundle.section.name
                    .trim()
                    .replace(/[^a-z0-9]+/gi, "-")
                    .replace(/^-+|-+$/g, "")
                    .toLowerCase() || "section";
                downloadBlob(
                  new Blob([JSON.stringify(bundle, null, 2) + "\n"], { type: "application/json" }),
                  `${filename}.btps.json`,
                );
                cancel.click();
                hooks.notice("Section downloaded.");
              }),
            ),
            cancel,
          ),
        );
        break;
      }
      case "import": {
        const { bundle } = preview;
        title.textContent = "Import section preview";
        const right = Math.max(
          0,
          ...project.tables.map((table) =>
            Math.max(
              ...[0, table.width].flatMap((x) =>
                [0, table.depth].map((y) => composePose({ x, y, angle: 0 }, table).x),
              ),
            ),
          ),
        );
        const pose = poseFields("section-import", {
          x: project.tables.length ? Math.min(Math.ceil(right + 8), 100_000) : 0,
          y: 0,
          angle: 0,
        });
        panel.append(
          textNode(
            "p",
            `${bundle.section.name}: ${bundle.project.tables.length} tables, ${bundle.project.items.length} attached items.`,
          ),
          textNode(
            "small",
            `Anchor table: ${bundle.project.tables.find(({ id }) => id === bundle.anchorTableId)?.name ?? bundle.anchorTableId}`,
          ),
        );
        if (bundle.section.ownerName)
          panel.append(textNode("p", `Owner: ${bundle.section.ownerName}`));
        panel.append(
          submitForm(
            "confirm-section-import",
            "Import section copy",
            () =>
              this.#run(() => {
                const imported = importSection(project, bundle, pose.read(), newId);
                this.#preview = undefined;
                this.#sectionId = imported.sectionId;
                this.#exit = exitDraft();
                hooks.commit(imported.project, imported.tableIds);
                hooks.notice(`Imported ${bundle.section.name}.`);
              }),
            [pose.controls],
          ),
          cancel,
        );
        break;
      }
      case "align": {
        const { result } = preview;
        title.textContent = "Alignment preview";
        const changes = alignmentChanges(analysis, result.analysis, result.seamId, hooks);
        panel.append(
          textNode("p", laneStatus("Outer", result.outer)),
          textNode("p", laneStatus("Inner", result.inner)),
          ...result.issues.map((issue) => textNode("p", issue)),
        );
        if (changes.length) {
          const list = document.createElement("ul");
          list.append(...changes.map((change) => textNode("li", change)));
          panel.append(list);
        } else panel.append(textNode("p", "No other connector joins or venue issues affected."));
        const apply = namedAction("confirm-section-link", "Apply alignment", () =>
          this.#run(() => {
            if (!result.valid) return;
            this.#preview = undefined;
            hooks.commit(result.analysis.project);
            hooks.notice("Section exits aligned.");
          }),
        );
        apply.disabled = !result.valid;
        panel.append(container("form-actions", apply, cancel));
        break;
      }
      case "delete":
        title.textContent = "Delete section?";
        panel.append(
          textNode("p", `${preview.section.name}'s tables and attached items will be deleted.`),
          container(
            "form-actions",
            namedAction("confirm-delete-section", "Delete section and tables", () =>
              this.#run(() => {
                this.#preview = undefined;
                this.#sectionId = undefined;
                this.#exit = exitDraft();
                hooks.commit(deleteSection(project, preview.section.id), []);
              }),
            ),
            cancel,
          ),
        );
        break;
    }
    return panel;
  }
}
