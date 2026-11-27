import { button, element, input } from "./editor_dom";
import { renderBallast } from "./editor_panels";
import type { EditPreview } from "./editor_placement";
import { visibleTrackItems } from "./project";
import type { Catalog, Project, TrackItem } from "./project";

type EditControlsState = Readonly<{
  kind: "select" | "extend" | "trace" | "drag" | "move" | "duplicate" | "connect";
  preview?: Readonly<Pick<EditPreview, "kind" | "message">>;
  stack?: string;
  hasFirstRailEnd: boolean;
  arrangement: boolean;
  multiple: boolean;
  selected: ReadonlySet<string>;
  getProject: () => Project;
}>;

export function renderEditControls({
  kind,
  preview,
  stack,
  hasFirstRailEnd,
  arrangement,
  multiple,
  selected,
  getProject,
}: EditControlsState): void {
  const translation = kind === "move" || kind === "duplicate";
  const selecting = !arrangement && (kind === "select" || kind === "drag");
  const selectingTrack = selecting && selected.size > 0;
  const pasteAvailable = !button("paste-track").disabled;
  const transformActions = element("track-transform-actions");
  if (kind !== "drag") {
    const [selectedId] = selected.values();
    button("select-arrangement").hidden =
      !selecting ||
      selected.size !== 1 ||
      !getProject().items.some(
        (item) => item.id === selectedId && item.kind === "track" && item.groupId,
      );
  }
  button("move-track").hidden = !selectingTrack;
  button("next-track-here").hidden = !selectingTrack || !stack;
  button("copy-track").hidden = !selectingTrack;
  button("remove-piece").hidden = !selectingTrack;
  button("paste-track").hidden = !selecting || !pasteAvailable;
  element("selection-actions").hidden = !selecting || (!selectingTrack && !pasteAvailable);
  transformActions.toggleAttribute("hidden", !selectingTrack);
  element("placement-actions").hidden = selecting;
  element("placement-grid").hidden =
    !translation && (!selectingTrack || button("move-track").disabled);
  button("place-edit").hidden = kind !== "connect";
  button("place-edit").disabled = !(kind === "connect" && preview?.kind === "ready");
  button("select-multiple").setAttribute("aria-pressed", String(multiple));
  element("tabletop").dataset["editTool"] = selecting ? "selection" : "placement";
  const hint = element("track-edit-hint");
  hint.toggleAttribute("data-error", preview?.kind === "blocked" && Boolean(preview.message));
  hint.toggleAttribute(
    "data-contextual",
    Boolean(preview?.message) || arrangement || kind !== "select" || multiple || selected.size > 0,
  );
  if (preview?.message && (!translation || preview.kind === "blocked")) {
    hint.textContent = preview.message;
    return;
  }
  if (arrangement)
    hint.textContent = "Choose a location for the arrangement, or cancel to edit track.";
  else if (kind === "extend") hint.textContent = "Choose where to add the track piece.";
  else if (kind === "trace") hint.textContent = "Choose track to trace the route to.";
  else if (kind === "connect")
    hint.textContent = preview
      ? "Choose Place to keep this position."
      : hasFirstRailEnd
        ? "Choose the second open rail end."
        : "Choose the first open rail end.";
  else if (translation)
    hint.textContent =
      kind === "duplicate"
        ? "Click or tap to place the copy."
        : "Click or tap to move the selection.";
  else if (kind === "drag") hint.textContent = "Release to place.";
  else if (stack) hint.textContent = stack;
  else if (multiple)
    hint.textContent = `${selected.size} selected. Pick pieces to add or remove them.`;
  else if (selected.size)
    hint.textContent = `${selected.size} selected. Drag or use arrow keys to move.`;
  else hint.textContent = "Select a track piece to edit it.";
}

export function renderTranslationFeedback(preview: EditPreview | undefined, fine: boolean): void {
  const feedback = element("translation-feedback");
  let message = "";
  if (preview) {
    if (preview.kind === "blocked") message = preview.message;
    else if (preview.placement === "rail" && preview.snap)
      message = `Rail joint · ${preview.snap.from.portId} to ${preview.snap.to.portId}.`;
    else if (preview.placement === "grid") {
      const grid = fine ? "1-stud grid" : "8-stud grid";
      if (preview.gridFallback === "tie")
        message = `Multiple rail snaps are equally close. Using the ${grid}.`;
      else if (preview.gridFallback === "missed")
        message = `Could not snap to the rail end. Using the ${grid}.`;
      else message = `Using the ${grid}.`;
    }
    const opened = preview.opened?.length;
    if (opened)
      message += ` Opens ${opened} ${opened === 1 ? "joint" : "joints"} to track outside the selection.`;
  }
  if (feedback.textContent !== message) feedback.textContent = message;
  feedback.toggleAttribute("data-error", preview?.kind === "blocked");
}

export function renderSelectionInfo(
  project: Project,
  catalog: Catalog,
  selected: ReadonlySet<string>,
  openEndCount: number,
  applyBallast: (item: TrackItem, changes: Pick<TrackItem, "ballast" | "countBallast">) => void,
): void {
  const id = selected.size === 1 ? selected.values().next().value : undefined;
  const item = project.items.find((item) => item.id === id);
  const name =
    item?.kind === "track"
      ? catalog.parts.find((part) => part.id === item.partId)?.name
      : item?.name;
  element("selection-info").textContent =
    selected.size > 1
      ? `${selected.size} track pieces selected.`
      : (name ?? "Select a track piece in the drawing.");
  button("remove-piece").disabled = !selected.size;
  const movable = item?.kind === "track";
  const hasTrack = visibleTrackItems(project).some(({ id }) => selected.has(id));
  button("move-track").disabled = !hasTrack;
  button("copy-track").disabled = !hasTrack;
  button("rotate-track-left").disabled = !movable;
  button("rotate-track-right").disabled = !movable;
  button("duplicate-track").disabled = item?.kind !== "track";
  button("connect-ends").disabled = openEndCount < 2;
  element("track-position").hidden = !movable;
  if (movable && item.kind === "track") {
    input("track-x").value = String(item.x);
    input("track-y").value = String(item.y);
  }
  renderBallast(project, catalog, id, (changes) => {
    if (item?.kind === "track") applyBallast(item, changes);
  });
}
