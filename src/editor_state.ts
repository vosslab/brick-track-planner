import { evaluate } from "./engine";
import type { Analysis } from "./engine";
import type { Project } from "./project";

export class EditorState {
  #analysis: Analysis;
  readonly #undo: Project[] = [];
  readonly #redo: Project[] = [];

  constructor(project: Project) {
    this.#analysis = evaluate(project);
  }

  get project(): Project {
    return this.#analysis.project;
  }
  get analysis(): Analysis {
    return this.#analysis;
  }
  get canUndo(): boolean {
    return this.#undo.length > 0;
  }
  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  commit(project: Project): void {
    if (project === this.project) return;
    const next = evaluate(project);
    this.#undo.push(this.project);
    this.#redo.length = 0;
    this.#analysis = next;
  }

  change(direction: "undo" | "redo"): void {
    const [from, to] = direction === "undo" ? [this.#undo, this.#redo] : [this.#redo, this.#undo];
    const project = from[from.length - 1];
    if (!project) return;
    const next = evaluate(project);
    to.push(this.project);
    from.pop();
    this.#analysis = next;
  }
}
