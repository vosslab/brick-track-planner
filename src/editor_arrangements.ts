import { button, element, select } from "./editor_dom";
import { previewArrangement } from "./arrangements";
import type { ArrangementResult } from "./arrangements";
import { withParkingKits } from "./parking";
import { findArrangementAnchors } from "./arrangement_anchors";
import type { Catalog, Point, Pose, Project } from "./project";

type PreviewHooks = {
  project: () => Project;
  preview: (result: ArrangementResult | undefined) => void;
  commit: (project: Project) => void;
  notice: (message: string, error?: boolean) => void;
  selection?: () => readonly string[];
  mainlineIds?: () => readonly string[];
  beginPreview?: () => void;
  endPreview?: () => void;
};

type Candidate = {
  label: string;
  pose: Pose;
  replaceIds: string[];
  fillers: { partId: string; pose: Pose }[];
  targetIds: string[];
};

const PRODUCTS = new Set([
  "trixbrix:r40-double-crossover-kit",
  "trixbrix:r40-triple",
  "trixbrix:r40-triple-parallel",
  "trixbrix:r40-right-yard-4",
  "trixbrix:r40-left-yard-4",
  "trixbrix:r56-double-pass-through-complete",
  "trixbrix:r104-double-crossover-kit",
  "trixbrix:r104-triple-kit",
  "trixbrix:r104-wye-with-adapters",
  "trixbrix:r104-right-yard-4",
  "lego:rc-r40-right-switch-return",
]);

function describe(result: ArrangementResult): string {
  if (result.ok) return "This fits. Choose Add to layout to keep it.";
  return result.issues.map(({ message }) => message).join(" ");
}

/** Controls catalog arrangements as one previewable, undoable edit. */
export class ArrangementTools {
  readonly #choice = select("arrangement");
  readonly #anchor = select("anchor");
  readonly #storage = select("storage-length");
  readonly #previewButton = button("preview-arrangement");
  readonly #applyButton = button("apply-arrangement");
  readonly #cancelButton = button("cancel-arrangement");
  readonly #location = select("arrangement-location");
  readonly #info = element("arrangement-info");
  #result: ArrangementResult | undefined;
  #candidates: Candidate[] = [];
  #candidateIndex = 0;
  #storageStuds = 0;
  #prepared = new Map<number, Catalog>();

  constructor(
    readonly catalog: Catalog,
    readonly hooks: PreviewHooks,
  ) {
    this.#fillChoices();
    this.#previewButton.addEventListener("click", () => this.preview());
    this.#applyButton.addEventListener("click", () => this.apply());
    this.#cancelButton.addEventListener("click", () => {
      this.reset();
      this.#previewButton.focus();
    });
    this.#choice.addEventListener("change", () => {
      this.#storage.disabled = !this.#usesStorage();
      this.reset();
    });
    this.#anchor.addEventListener("change", () => this.reset());
    this.#storage.addEventListener("change", () => this.reset());
    this.#location.addEventListener("change", () => {
      this.#candidateIndex = this.#location.selectedIndex;
      this.#showCandidate(this.#choice.value);
    });
    this.#storage.disabled = !this.#usesStorage();
  }

  useDefaults(): void {
    this.#choice.value = "parking:r40-back-out";
    this.#anchor.value = "center";
    this.#storage.value = "auto";
    this.#storage.disabled = false;
    element("placement-options").removeAttribute("open");
  }

  reset(): void {
    this.#result = undefined;
    this.#candidates = [];
    this.#candidateIndex = 0;
    this.#storageStuds = 0;
    this.#applyButton.disabled = true;
    this.#cancelButton.disabled = true;
    this.#location.replaceChildren(new Option("Find fit locations first", ""));
    this.#location.disabled = true;
    this.#setInfo("");
    this.#setPreviewVisible(false);
    this.hooks.endPreview?.();
    this.hooks.preview(undefined);
  }

  preview(): void {
    const choice = this.#choice.value;
    if (!choice) {
      const message = "Choose a complete arrangement first.";
      this.#setInfo(message);
      this.hooks.notice(message, true);
      return;
    }
    this.reset();
    this.#setPreviewVisible(true);
    const fitting = this.#fittingAnchors();
    this.#storageStuds = fitting.storageStuds;
    this.#candidates = fitting.candidates;
    if (!this.#candidates.length) {
      const message = this.#noFitMessage(choice);
      this.#setInfo(message);
      this.#cancelButton.disabled = false;
      this.hooks.notice(message, true);
      return;
    }
    this.#renderLocations();
    this.hooks.beginPreview?.();
    this.#showCandidate(choice);
  }

  /** The canvas calls this while a preview is open to choose a nearby anchor. */
  pick(point: Point): boolean {
    if (!this.#result || !this.#candidates.length) return false;
    const nearby = this.#candidates
      .map((candidate, index) => ({
        index,
        distance: Math.hypot(candidate.pose.x - point.x, candidate.pose.y - point.y),
      }))
      .filter(({ distance }) => distance <= 24)
      .sort((first, second) => first.distance - second.distance)[0];
    if (!nearby) return false;
    this.#selectCandidate(nearby.index);
    return true;
  }

  private apply(): void {
    if (!this.#result?.ok || !this.#result.project) return;
    const storage = this.#storageDescription();
    const name = this.#choice.selectedOptions[0]!.text;
    const message = `Added ${name}.${storage ? ` ${storage}` : ""} Choose Single piece to extend an open end.`;
    this.hooks.commit(this.#result.project);
    this.#setInfo(message);
    this.hooks.notice(message);
    this.#previewButton.focus();
  }

  #showCandidate(choice: string): void {
    const candidate = this.#candidates[this.#candidateIndex];
    if (!candidate) return;
    const project = this.hooks.project();
    const heightPlates = project.area.niltc ? 2 : 0;
    const catalog = this.#catalogFor(this.#storageStuds);
    const result = previewArrangement(project, catalog, {
      kitId: choice,
      pose: candidate.pose,
      heightPlates,
      replaceIds: candidate.replaceIds,
      fillers: candidate.fillers,
    });
    this.#result = result;
    this.hooks.preview(result);
    this.#applyButton.disabled = !result.ok;
    this.#cancelButton.disabled = false;
    this.#setInfo(`${candidate.label}. ${this.#storageDescription()} ${describe(result)}`);
  }

  #selectCandidate(index: number): void {
    this.#candidateIndex = index;
    this.#location.selectedIndex = index;
    this.#showCandidate(this.#choice.value);
  }

  #fittingAnchors(): { storageStuds: number; candidates: Candidate[] } {
    for (const storageStuds of this.#storageChoices()) {
      const candidates = this.#anchors(storageStuds);
      if (candidates.length) return { storageStuds, candidates };
    }
    return { storageStuds: 0, candidates: [] };
  }

  #anchors(storageStuds: number): Candidate[] {
    const project = this.hooks.project();
    const heightPlates = project.area.niltc ? 2 : 0;
    const catalog = this.#catalogFor(storageStuds);
    let candidates = findArrangementAnchors(project, catalog, this.#choice.value, heightPlates).map(
      (anchor) => ({
        label: anchor.message,
        pose: anchor.pose,
        replaceIds: anchor.replaceIds,
        fillers: anchor.fillers,
        targetIds: anchor.connections.map(({ itemId }) => itemId),
      }),
    );
    const requested = this.#anchor.value;
    const selection = new Set(this.hooks.selection?.() ?? []);
    if (requested === "selected")
      candidates = candidates.filter(({ replaceIds, targetIds }) =>
        [...replaceIds, ...targetIds].some((id) => selection.has(id)),
      );
    if (requested === "mainline") {
      const mainlineIds = new Set(this.hooks.mainlineIds?.() ?? []);
      candidates = candidates.filter(({ replaceIds, targetIds }) =>
        [...replaceIds, ...targetIds].some((id) => mainlineIds.has(id)),
      );
    }
    return candidates;
  }

  #catalogFor(storageStuds: number): Catalog {
    const cached = this.#prepared.get(storageStuds);
    if (cached) return cached;
    const catalog = withParkingKits(this.catalog, storageStuds);
    this.#prepared.set(storageStuds, catalog);
    return catalog;
  }

  #fillChoices(): void {
    this.#choice.replaceChildren();
    const parking = document.createElement("optgroup");
    parking.label = "Parking and turning trains";
    const products = document.createElement("optgroup");
    products.label = "Switches, crossovers and yard ladders";
    for (const kit of this.#catalogFor(64).kits) {
      const group = kit.id.startsWith("parking:")
        ? parking
        : PRODUCTS.has(kit.id)
          ? products
          : undefined;
      group?.append(new Option(kit.name, kit.id));
    }
    this.#choice.append(parking, products);
  }

  #setInfo(message: string): void {
    this.#info.textContent = message;
  }

  #usesStorage(): boolean {
    return this.#choice.value.startsWith("parking:");
  }

  #storageChoices(): number[] {
    if (!this.#usesStorage()) return [0];
    if (this.#storage.value === "auto") return [64, 32, 0];
    const storageStuds = Number(this.#storage.value);
    return Number.isSafeInteger(storageStuds) ? [storageStuds] : [0];
  }

  #storageDescription(): string {
    if (!this.#usesStorage()) return "";
    if (!this.#storageStuds)
      return this.#choice.value === "parking:r40-back-out"
        ? "Uses the turnout and return curve with no added straight storage."
        : "No extra storage straights.";
    return `Uses ${this.#storageStuds} studs of straight storage.`;
  }

  #setPreviewVisible(visible: boolean): void {
    element("arrangement-preview").hidden = !visible;
  }

  #noFitMessage(id: string): string {
    if (this.#anchor.value === "selected" && !this.hooks.selection?.().length)
      return "Select a track piece on the drawing, or choose Best connected fit in Placement options.";
    if (this.#usesStorage() && Number(this.#storage.value) > 0)
      return "No connected fit at this storage length. In Placement options, choose Fit to space or select fewer studs.";
    if (id.includes("r56-double-pass"))
      return "This R56 pass-through needs three clear parallel straight runs.";
    if (id.includes("r104") && (id.includes("yard") || id.includes("wye")))
      return "This R104 arrangement needs a larger clear rear area and compatible straight runs.";
    return "No connected fit was found at this anchor. Choose another arrangement or extend the design area.";
  }

  #renderLocations(): void {
    const { width, depth } = this.hooks.project().area;
    this.#location.replaceChildren(
      ...this.#candidates.map(({ pose }, index) => {
        const side =
          pose.y < depth / 3
            ? "north"
            : pose.y > (depth * 2) / 3
              ? "south"
              : pose.x < width / 2
                ? "west"
                : "east";
        return new Option(
          `${index + 1} of ${this.#candidates.length} - ${side} side`,
          String(index),
        );
      }),
    );
    this.#location.disabled = this.#candidates.length < 2;
    this.#location.selectedIndex = this.#candidateIndex;
    element("fit-location-controls").hidden = this.#candidates.length < 2;
  }
}
