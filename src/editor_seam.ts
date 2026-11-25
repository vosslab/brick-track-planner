import type { Analysis } from "./engine";
import { action, choice, container, control, element, textNode, toCanvas } from "./editor_dom";
import { edges, newId } from "./editor_state";
import type { Edge, Project, Seam } from "./project";

type End = "outer-a" | "outer-b" | "inner-a" | "inner-b";
type Endpoint = Seam["outer"]["a"];
type Draft = Pick<Seam, "id" | "tableA" | "edgeA" | "tableB" | "edgeB"> & {
  endpoints: Partial<Record<End, Endpoint>>;
};

const endpoints: [End, string][] = [
  ["outer-a", "Outer A"],
  ["outer-b", "Outer B"],
  ["inner-a", "Inner A"],
  ["inner-b", "Inner B"],
];

export class SeamEditor {
  draft: Draft | undefined;
  armed: End | undefined;
  choices: Endpoint[] = [];

  open(project: Project, id?: string): boolean {
    const saved = project.seams.find((seam) => seam.id === id);
    if (saved) {
      this.draft = {
        id: saved.id,
        tableA: saved.tableA,
        edgeA: saved.edgeA,
        tableB: saved.tableB,
        edgeB: saved.edgeB,
        endpoints: {
          "outer-a": { ...saved.outer.a },
          "outer-b": { ...saved.outer.b },
          "inner-a": { ...saved.inner.a },
          "inner-b": { ...saved.inner.b },
        },
      };
    } else {
      const [a, b] = project.tables;
      if (!a || !b) return false;
      this.draft = {
        id: newId("seam"),
        tableA: a.id,
        edgeA: "east",
        tableB: b.id,
        edgeB: "west",
        endpoints: {},
      };
    }
    this.armed = undefined;
    this.choices = [];
    return true;
  }

  close(): void {
    this.draft = undefined;
    this.armed = undefined;
    this.choices = [];
  }

  get activeEnd(): End | undefined {
    const draft = this.draft;
    return this.armed ?? (draft && endpoints.find(([key]) => !draft.endpoints[key])?.[0]);
  }

  get activeTable(): string | undefined {
    const end = this.activeEnd;
    if (!end) return;
    return end.endsWith("-a") ? this.draft?.tableA : this.draft?.tableB;
  }

  capture(pieceId: string, portId: string): string | undefined {
    const draft = this.draft;
    if (!draft) return;
    const end = this.activeEnd;
    if (!end) return "Choose the endpoint you want to replace.";
    for (const [key, other] of Object.entries(draft.endpoints)) {
      if (key !== end && pieceId === other.pieceId && portId === other.portId) {
        return "This connector already belongs to an endpoint in this seam.";
      }
    }
    draft.endpoints[end] = { pieceId, portId };
    this.armed = undefined;
    this.choices = [];
    return undefined;
  }

  save(project: Project): Seam {
    const draft = this.draft;
    if (!draft) throw new Error("Open a seam before saving it.");
    const { endpoints: ends, ...identity } = draft;
    const outerA = ends["outer-a"];
    const outerB = ends["outer-b"];
    const innerA = ends["inner-a"];
    const innerB = ends["inner-b"];
    if (draft.tableA === draft.tableB) throw new Error("Choose two different tables.");
    const tableA = project.tables.find(({ id }) => draft.tableA === id);
    const tableB = project.tables.find(({ id }) => draft.tableB === id);
    if (!tableA || !tableB) throw new Error("Choose two existing tables.");
    if (!outerA || !outerB || !innerA || !innerB)
      throw new Error("Choose all four seam endpoints.");
    for (const [table, pairs] of [
      [tableA, [outerA, innerA]],
      [tableB, [outerB, innerB]],
    ] as const) {
      for (const endpoint of pairs) {
        const item = project.items.find(({ id }) => id === endpoint.pieceId);
        if (item && item.tableId !== table.id) {
          throw new Error(`Replace the connector outside ${table.name} before saving.`);
        }
      }
    }
    return { ...identity, outer: { a: outerA, b: outerB }, inner: { a: innerA, b: innerB } };
  }

  render(
    analysis: Analysis,
    callbacks: {
      refresh: () => void;
      save: () => void;
      close: () => void;
      remove: () => void;
      pick: (endpoint: Endpoint) => void;
      describe: (endpoint: Endpoint) => string;
    },
  ): void {
    const panel = element("seam-panel");
    const draft = this.draft;
    panel.hidden = !draft;
    element("selection-panel").hidden = Boolean(draft);
    if (!draft) return;
    const project = analysis.project;
    const saved = project.seams.find(({ id }) => id === draft.id);
    const detaching = Boolean(saved?.exitAId || saved?.exitBId);
    const tableOptions = project.tables.map(({ id, name }): [string, string] => [id, name]);
    for (const tableId of [draft.tableA, draft.tableB]) {
      if (!tableOptions.some(([id]) => id === tableId)) {
        tableOptions.push([tableId, `Missing table (${tableId})`]);
      }
    }
    const edgeOptions = edges.map((edge): [Edge, string] => [edge, edge]);
    const tableA = choice("table-a", tableOptions, draft.tableA);
    const edgeA = choice("edge-a", edgeOptions, draft.edgeA);
    const tableB = choice("table-b", tableOptions, draft.tableB);
    const edgeB = choice("edge-b", edgeOptions, draft.edgeB);
    tableA.addEventListener("change", () => {
      draft.tableA = tableA.value;
    });
    edgeA.addEventListener("change", () => {
      draft.edgeA = edges.find((edge) => edge === edgeA.value) ?? draft.edgeA;
    });
    tableB.addEventListener("change", () => {
      draft.tableB = tableB.value;
    });
    edgeB.addEventListener("change", () => {
      draft.edgeB = edges.find((edge) => edge === edgeB.value) ?? draft.edgeB;
    });
    const form = document.createElement("form");
    form.id = "seam-form";
    form.append(
      container(
        "field-grid",
        control("Table A", tableA),
        control("Edge A", edgeA),
        control("Table B", tableB),
        control("Edge B", edgeB),
      ),
    );
    form.append(
      textNode(
        "p",
        "Pick the two ends of each lane on the canvas. S8 can extend beyond a table edge.",
      ),
    );
    if (detaching) {
      form.append(textNode("p", "Save this seam as a direct connection between its tables."));
    }
    for (const [end, label] of endpoints) {
      const endpoint = draft.endpoints[end];
      const picked = endpoint ? callbacks.describe(endpoint) : "Pick connector";
      const row = action(`${label}: ${picked}`, () => {
        this.armed = end;
        this.choices = [];
        callbacks.refresh();
        toCanvas();
      });
      row.dataset["seamEnd"] = end;
      if (endpoint) {
        row.dataset["boundPiece"] = endpoint.pieceId;
        row.dataset["boundPort"] = endpoint.portId;
      }
      row.setAttribute("aria-pressed", String(this.armed === end));
      form.append(row);
    }
    if (this.choices.length) {
      form.append(textNode("p", "These connectors overlap. Choose the one you want to bind."));
      for (const candidate of this.choices) {
        form.append(action(callbacks.describe(candidate), () => callbacks.pick(candidate)));
      }
    }
    const save = document.createElement("button");
    save.id = "save-seam";
    save.type = "submit";
    save.className = "primary";
    save.textContent = detaching ? "Detach exits and save seam" : "Save seam";
    const actions = container("form-actions", save, action("Cancel", callbacks.close));
    if (saved) actions.append(action("Delete seam", callbacks.remove));
    form.append(actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      callbacks.save();
    });
    panel.replaceChildren(textNode("h3", saved ? "Edit seam" : "Connect tables"), form);
  }

  get prompt(): string {
    if (!this.armed) return "Pick seam connectors";
    const name = endpoints.find(([end]) => end === this.armed)?.[1];
    return `Choose ${name ?? "a seam"} connector`;
  }
}
