import type { PlacementWarning } from "./arrangements";
import { action, choice, container, control, element, textNode } from "./editor_dom";
import type { Analysis } from "./engine";
import type { BallastStyle, Catalog, Project, TrackItem } from "./project";
import { recipeFor } from "./show_inventory";

const ballastStyles = [
  ["bare", "Bare"],
  ["gray", "Gray"],
  ["pennlug", "PennLUG-style"],
] satisfies [BallastStyle, string][];

export type Diagnostic = { message: string; targetId?: string; placementWarning?: true };

/** Readable checks for imported geometry that needs repair. */
export function diagnosticsFor(analysis: Analysis): Diagnostic[] {
  const checks: Diagnostic[] = [];
  for (const issue of analysis.unresolved) {
    checks.push({
      message: `"${issue.name}" was imported without usable track geometry (${issue.sourceId}). Replace it with a catalog track part before relying on its connections.`,
      targetId: issue.id,
    });
  }
  return checks;
}

export function renderDiagnostics(
  analysis: Analysis,
  placementWarnings: readonly PlacementWarning[],
  pick: (id: string) => void,
): void {
  const visibleLayers = new Set(
    analysis.project.layers.filter(({ visible }) => visible).map(({ id }) => id),
  );
  const visibleItems = new Set(
    analysis.project.items.filter(({ layerId }) => visibleLayers.has(layerId)).map(({ id }) => id),
  );
  const warnings: Diagnostic[] = placementWarnings.map(({ message, pieceIds }) => ({
    message,
    targetId: pieceIds.find((id) => visibleItems.has(id)),
    placementWarning: true,
  }));
  const rows = [...warnings, ...diagnosticsFor(analysis)].map(
    ({ message, targetId, placementWarning }) => {
      const row =
        targetId && visibleItems.has(targetId)
          ? action(message, () => pick(targetId))
          : container("list-row", textNode("small", message));
      row.className = "list-row";
      row.toggleAttribute("data-placement-warning", Boolean(placementWarning));
      return row;
    },
  );
  element("diagnostics").replaceChildren(
    ...(rows.length ? rows : [textNode("p", "No fit or route issues.")]),
  );
  const fit = element("fit-status");
  const count = warnings.length;
  fit.textContent = count
    ? `${count} placement ${count === 1 ? "warning" : "warnings"}. See Diagnostics.`
    : "";
  fit.classList.toggle("bad-status", count > 0);
}

/** Shows the build finish controls for the selected track. */
export function renderBallast(
  project: Project,
  catalog: Catalog,
  selectedId: string | undefined,
  apply: (changes: Pick<TrackItem, "ballast" | "countBallast">) => void,
): void {
  const panel = document.getElementById("ballast-panel");
  if (!panel) return;
  const item = project.items.find(({ id }) => id === selectedId);
  if (!item || item.kind !== "track") {
    panel.replaceChildren(textNode("p", "Select track to set ballast."));
    return;
  }
  const part = catalog.parts.find(({ id }) => id === item.partId);
  const style = choice("ballast-style", ballastStyles, item.ballast ?? "bare");
  style.addEventListener("change", () =>
    apply({ ballast: style.value as BallastStyle, countBallast: item.countBallast }),
  );
  const count = document.createElement("input");
  count.id = "count-ballast";
  count.type = "checkbox";
  count.checked = item.countBallast === true;
  count.addEventListener("change", () =>
    apply({ ballast: item.ballast, countBallast: count.checked }),
  );
  panel.replaceChildren(
    control("Ballast style", style),
    control("Count published PennLUG materials", count),
    !recipeFor(item.partId)
      ? textNode("p", `No published ballast recipe for ${part?.name ?? item.partId}.`)
      : textNode("p", "Published recipe included in the member parts list."),
  );
}
