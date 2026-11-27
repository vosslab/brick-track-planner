import { button, element, input } from "./editor_dom";
import { renderBallast } from "./editor_panels";
import { protectedTrack } from "./editor_placement";
import type { EditPreview } from "./editor_placement";
import { visibleTrackItems } from "./project";
import type { Catalog, Project, TrackItem } from "./project";

type EditControlsState = Readonly<{
  kind: "select" | "extend" | "trace" | "drag" | "move" | "duplicate" | "connect";
  preview?: Readonly<Pick<EditPreview, "kind" | "message">>;
  hasFirstRailEnd: boolean;
  arrangement: boolean;
  multiple: boolean;
  selected: ReadonlySet<string>;
  getProject: () => Project;
}>;

export function renderEditControls({
  kind,
  preview,
  hasFirstRailEnd,
  arrangement,
  multiple,
  selected,
  getProject,
}: EditControlsState): void {
  const translation = kind === "move" || kind === "duplicate";
  const selecting = !arrangement && (kind === "select" || kind === "drag");
  if (kind !== "drag") {
    const [selectedId] = selected.values();
    button("select-arrangement").hidden =
      !selecting ||
      selected.size !== 1 ||
      !getProject().items.some(
        (item) => item.id === selectedId && item.kind === "track" && item.groupId,
      );
  }
  element("selection-actions").hidden = !selecting;
  element("placement-actions").hidden = selecting;
  element("placement-grid").hidden = !translation;
  button("place-edit").hidden = kind !== "connect";
  button("place-edit").disabled = !(kind === "connect" && preview?.kind === "ready");
  button("select-multiple").setAttribute("aria-pressed", String(multiple));
  element("tabletop").dataset["editTool"] = selecting ? "selection" : "placement";
  const hint = element("track-edit-hint");
  hint.toggleAttribute("data-error", preview?.kind === "blocked" && Boolean(preview.message));
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
  else if (protectedTrack(getProject(), selected)) {
    const handoff = getProject().area.exits.find(
      ({ outer, inner }) => selected.has(outer.pieceId) || selected.has(inner.pieceId),
    );
    hint.textContent =
      selected.size > 1
        ? `Selection includes track at the named mainline handoff ${handoff?.name ?? ""}. Deselect that protected piece before moving or deleting the other pieces.`
        : "This track carries a named mainline exit and cannot be moved or deleted.";
  } else if (multiple)
    hint.textContent = `${selected.size} selected. Pick pieces to add or remove them.`;
  else if (selected.size)
    hint.textContent = `${selected.size} selected. Drag track or choose Move.`;
  else hint.textContent = "Select a track piece to edit it.";
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
  const protectedExit = protectedTrack(project, selected);
  button("remove-piece").disabled = !selected.size || protectedExit;
  const movable = item?.kind === "track" && !protectedExit;
  const hasTrack = visibleTrackItems(project).some(({ id }) => selected.has(id));
  button("move-track").disabled = protectedExit || !hasTrack;
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
