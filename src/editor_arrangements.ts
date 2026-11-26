import { button, element, select } from "./editor_dom";
import { placeItems, previewArrangement } from "./arrangements";
import type { ArrangementResult } from "./arrangements";
import { withParkingKits } from "./parking";
import { arrangementRequirements, findArrangementAnchors } from "./arrangement_anchors";
import type { ArrangementAnchor } from "./arrangement_anchors";
import type { Catalog, Point, Pose, Project } from "./project";

type PreviewHooks = {
  project: () => Project;
  preview: (result: ArrangementResult | undefined) => void;
  commit: (project: Project) => void;
  notice: (message: string, error?: boolean) => void;
  noticePlacement?: (receipt: string, pieceIds: readonly string[]) => void;
  selection?: () => readonly string[];
  mainlineIds?: () => readonly string[];
  beginPreview?: () => void;
};

const PRODUCTS = new Set([
  "trixbrix:r40-double-crossover-kit",
  "trixbrix:r40-right-pass-through",
  "trixbrix:r40-t-junction",
  "trixbrix:r40-r56-t-junction",
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
  if (result.ok)
    return "This fits. Click or tap the drawing to place it, or choose Add to layout for this fit.";
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
  readonly #requirements = element("arrangement-requirements");
  #result: ArrangementResult | undefined;
  #candidates: ArrangementAnchor[] = [];
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
      this.#showCandidate();
    });
    this.#storage.disabled = !this.#usesStorage();
    this.#setRequirements();
  }

  useDefaults(): void {
    this.#choice.value = "parking:r40-back-out";
    this.#anchor.value = "center";
    this.#storage.value = "auto";
    this.#storage.disabled = false;
    element("placement-options").removeAttribute("open");
    this.#setRequirements();
  }

  reset(): void {
    this.#result = undefined;
    this.#candidates = [];
    this.#candidateIndex = 0;
    this.#storageStuds = 0;
    this.#applyButton.disabled = true;
    this.#applyButton.hidden = true;
    this.#cancelButton.disabled = true;
    this.#location.replaceChildren(new Option("Find fit locations first", ""));
    this.#location.disabled = true;
    element("fit-location-controls").hidden = true;
    this.#setInfo("");
    this.#setPreviewVisible(false);
    this.#setRequirements();
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
    const fitting = this.#fittingAnchors();
    this.#storageStuds = fitting.candidates.length
      ? fitting.storageStuds
      : (this.#storageChoices()[0] ?? 0);
    this.#candidates = fitting.candidates;
    this.#setPreviewVisible(true);
    this.hooks.beginPreview?.();
    if (!this.#candidates.length) {
      const { width, depth } = this.hooks.project().area;
      this.#showPreview({ x: width / 2, y: depth / 2, angle: 0 }, fitting.reason);
      return;
    }
    this.#renderLocations();
    this.#showCandidate();
  }

  /** Place a nearby fitted arrangement or put the held kit at the clicked point. */
  pick(point: Point): boolean {
    if (!this.#result) return false;
    const nearby = this.#candidates
      .map((candidate, index) => ({
        index,
        distance: Math.hypot(candidate.pose.x - point.x, candidate.pose.y - point.y),
      }))
      .filter(({ distance }) => distance <= 24)
      .sort((first, second) => first.distance - second.distance)[0];
    if (nearby) {
      this.#selectCandidate(nearby.index);
      if (this.#result?.ok && this.#result.project) {
        this.apply();
        return true;
      }
    }
    const project = this.hooks.project();
    const result = previewArrangement(project, this.#catalogFor(this.#storageStuds), {
      kitId: this.#choice.value,
      pose: {
        x: point.x,
        y: point.y,
        angle: this.#candidates[this.#candidateIndex]?.pose.angle ?? 0,
      },
      heightPlates: project.area.niltc ? 2 : 0,
    });
    if (!result.candidateItems?.length) return true;
    try {
      const placed = placeItems(project, result.candidateItems);
      this.#commit(placed, result.addedIds);
    } catch (error) {
      this.#fail(error);
    }
    return true;
  }

  private apply(): void {
    if (!this.#result?.ok || !this.#result.project) return;
    this.#commit(this.#result.project, this.#result.addedIds);
  }

  #commit(project: Project, addedIds: readonly string[]): void {
    const storage = this.#storageDescription();
    const name = this.#choice.selectedOptions[0]!.text;
    const message = `Added ${name}.${storage ? ` ${storage}` : ""} Choose Single piece to extend an open end.`;
    this.reset();
    try {
      this.hooks.commit(project);
    } catch (error) {
      this.#fail(error);
      return;
    }
    this.#setInfo(message);
    if (this.hooks.noticePlacement) this.hooks.noticePlacement(message, addedIds);
    else this.hooks.notice(message);
    this.#previewButton.focus();
  }

  #fail(error: unknown): void {
    this.reset();
    const message = error instanceof Error ? error.message : String(error);
    this.#setInfo(message);
    this.hooks.notice(message, true);
    this.#previewButton.focus();
  }

  #showCandidate(): void {
    const candidate = this.#candidates[this.#candidateIndex];
    if (!candidate) return;
    this.#showPreview(candidate.pose, candidate.message + ".", candidate);
  }

  #showPreview(pose: Pose, message: string, candidate?: ArrangementAnchor): void {
    const project = this.hooks.project();
    const heightPlates = project.area.niltc ? 2 : 0;
    const catalog = this.#catalogFor(this.#storageStuds);
    const result = previewArrangement(project, catalog, {
      kitId: this.#choice.value,
      pose,
      heightPlates,
      replaceIds: candidate?.replaceIds,
      fillers: candidate?.fillers,
    });
    this.#result = result;
    this.#setRequirements();
    this.hooks.preview(result);
    this.#applyButton.disabled = !candidate || !result.ok;
    this.#applyButton.hidden = !candidate || !result.ok;
    this.#cancelButton.disabled = false;
    this.#setInfo(
      [
        message,
        this.#storageDescription(),
        candidate
          ? describe(result)
          : "Click or tap the drawing to place it and check Diagnostics.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  #selectCandidate(index: number): void {
    this.#candidateIndex = index;
    this.#location.selectedIndex = index;
    this.#showCandidate();
  }

  #fittingAnchors(): { storageStuds: number; candidates: ArrangementAnchor[]; reason: string } {
    const requested = this.#anchor.value;
    const targetIds =
      requested === "selected"
        ? new Set(this.hooks.selection?.() ?? [])
        : requested === "mainline"
          ? new Set(this.hooks.mainlineIds?.() ?? [])
          : undefined;
    if (targetIds?.size === 0) {
      const reason =
        requested === "selected"
          ? "Select a track piece on the drawing, or choose Best connected fit."
          : "There is no continuous protected mainline to connect to. Try Best connected fit.";
      return { storageStuds: 0, candidates: [], reason };
    }
    const project = this.hooks.project();
    const heightPlates = project.area.niltc ? 2 : 0;
    let reason = "No connected fit was found.";
    for (const storageStuds of this.#storageChoices()) {
      const result = findArrangementAnchors(
        project,
        this.#catalogFor(storageStuds),
        this.#choice.value,
        heightPlates,
        targetIds,
      );
      if (result.anchors.length) return { storageStuds, candidates: result.anchors, reason: "" };
      reason = result.reason ?? reason;
    }
    if (this.#usesStorage() && Number(this.#storage.value) > 0)
      reason += " Choose Fit to space or select fewer studs in Placement options.";
    return { storageStuds: 0, candidates: [], reason };
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

  #setRequirements(): void {
    const storage =
      this.#storage.value === "auto" && this.#result
        ? this.#storageStuds
        : Number(this.#storage.value === "auto" ? 0 : this.#storage.value);
    const catalog = this.#catalogFor(Number.isSafeInteger(storage) ? storage : 0);
    this.#requirements.textContent = arrangementRequirements(catalog, this.#choice.value);
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
