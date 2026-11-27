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

function exitFor(
  analysis: Analysis,
  id: string | undefined,
): Project["area"]["exits"][number] | undefined {
  return analysis.project.area.exits.find((exit) => exit.id === id);
}

function laneName(lane: "outer" | "inner"): string {
  return lane === "outer" ? "outside" : "inside";
}

function mainlineRule(analysis: Analysis): string {
  const curve =
    analysis.project.area.niltc === "corner"
      ? " For a curve section, use R120 outside and R104 inside."
      : "";
  return ` Its endpoint must face out at the design-area boundary, 8 studs from the public edge outside or 24 studs inside, at 2 plates high.${curve}`;
}

/** Member-readable checks. Protected NILTC handoffs are errors; private routes are not inferred here. */
export function diagnosticsFor(analysis: Analysis): Diagnostic[] {
  const checks: Diagnostic[] = [];
  for (const issue of analysis.niltcIssues) {
    const lane = laneName(issue.lane);
    if (issue.kind === "missing-mainline") {
      const names = analysis.project.area.exits.map(({ name }) => name).join(" and ");
      checks.push({
        message: `The ${lane} protected NILTC lane has no continuous route between ${names || "its two named handoffs"}. Check joints, switches, and both handoff endpoints.${mainlineRule(analysis)}`,
      });
      continue;
    }
    if (issue.kind === "mainline-height") {
      const item = analysis.project.items.find(({ id }) => id === issue.itemId);
      const height = item?.kind === "track" ? item.heightPlates : undefined;
      checks.push({
        message: `Raise this ${lane} protected NILTC track from ${height ?? "its current"} plates to 2 plates high.${mainlineRule(analysis)}`,
        targetId: issue.itemId,
      });
      continue;
    }
    if (issue.kind === "mainline-radius") {
      const requirement = issue.minimumRadius
        ? `at least R${issue.expectedRadius}`
        : `R${issue.expectedRadius}`;
      checks.push({
        message: `This ${lane} protected NILTC curve is R${issue.actualRadius}; use ${requirement} here.${mainlineRule(analysis)}`,
        targetId: issue.itemId,
      });
      continue;
    }
    if (issue.kind === "mainline-curve-sweep") {
      checks.push({
        message: `The ${lane} protected NILTC curve turns ${issue.actualDegrees}°. It must make a 90° corner before the named handoff.${mainlineRule(analysis)}`,
      });
      continue;
    }
    if (issue.kind === "mainline-event-spacing") {
      checks.push({
        message: `Leave ${issue.requiredStuds} studs between track events on the ${lane} protected NILTC lane; this layout has ${issue.actualStuds} studs. This rule does not constrain private yard routes.`,
        targetId: issue.itemId,
      });
      continue;
    }
    const exit = exitFor(analysis, issue.exitId);
    const endpoint = exit?.[issue.lane];
    if (issue.kind === "exit-away-from-boundary") {
      checks.push({
        message: `The ${lane} rail end for "${exit?.name ?? issue.exitId}" is away from the ${exit?.edge ?? "table"} edge.`,
        targetId: endpoint?.pieceId,
      });
      continue;
    }
    checks.push({
      message: `The ${lane} endpoint for named handoff "${exit?.name ?? issue.exitId ?? "unknown"}" is not on the NILTC standard.${mainlineRule(analysis)}`,
      targetId: endpoint?.pieceId,
    });
  }
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
    : "No placement warnings";
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
