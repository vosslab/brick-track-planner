import {
  horizontalEdge,
  moveOutlineEdge,
  outlineBounds,
  outlineEdges,
  outlineOf,
  shiftOutlineSpan,
} from "./area_outline";
import { button, dialog, element, input, select } from "./editor_dom";
import { evaluate } from "./engine";
import type { Analysis } from "./engine";
import { validateProject } from "./project";
import type { Catalog, Project } from "./project";
import { createScene } from "./scene";
import { line, path, selectionInk, warningInk } from "./scene_drawing";

const inches = (studs: number): string => String(Number((studs / 3.2).toFixed(2)));

export function setupOutlineEditor(
  catalog: Catalog,
): (analysis: Analysis, commit: (project: Project) => void) => void {
  const editor = dialog("outline-dialog");
  const form = element("outline-form") as HTMLFormElement;
  const edge = select("outline-edge");
  const operation = select("outline-operation");
  const span = select("outline-span");
  const distance = input("outline-distance");
  const start = input("outline-start");
  const length = input("outline-length");
  const preview = element("outline-preview");
  const status = element("outline-status");
  const error = element("outline-error");
  const apply = button("apply-outline");
  let edit: { original: Analysis; commit: (project: Project) => void } | undefined;
  let proposed: Project | undefined;

  function refresh(report = false): void {
    if (!edit) return;
    const { original } = edit;
    const points = outlineOf(original.project.area);
    const index = Number(edge.value);
    const selected = outlineEdges(points)[index]!;
    const horizontal = horizontalEdge(selected.side);
    const partial = span.value === "partial";
    const niltcShift = partial && Boolean(original.project.area.niltc);
    element("outline-partial").hidden = !partial;
    start.disabled = length.disabled = !partial;
    if (original.project.area.niltc) {
      distance.step = distance.min = partial ? "5" : "10";
    }
    operation.options[0]!.text = niltcShift ? "Shift toward this edge" : "Extend outward";
    operation.options[1]!.text = niltcShift ? "Shift toward opposite edge" : "Trim inward";
    element("outline-start-label").textContent = `Start from ${horizontal ? "left" : "top"} (in)`;
    proposed = undefined;
    error.textContent = "";
    let checked = original;
    if (form.checkValidity()) {
      try {
        const delta =
          Math.round(distance.valueAsNumber * 3.2) * (operation.value === "trim" ? -1 : 1);
        const section = partial
          ? {
              offset: Math.round(start.valueAsNumber * 3.2),
              length: Math.round(length.valueAsNumber * 3.2),
            }
          : undefined;
        const area =
          niltcShift && section
            ? shiftOutlineSpan(original.project.area, index, delta, section)
            : moveOutlineEdge(original.project.area, index, delta, section);
        const draft = { ...original.project, area };
        validateProject(draft);
        checked = evaluate(draft);
        proposed = draft;
      } catch (reason) {
        if (report) error.textContent = reason instanceof Error ? reason.message : String(reason);
      }
    }
    const scene = createScene(checked.project, catalog, checked, { grid: false, sharing: true });
    scene.append(
      path(
        points,
        {
          fill: "none",
          stroke: selectionInk,
          "stroke-width": 0.8,
          "stroke-dasharray": "3 2",
        },
        true,
      ),
      line(selected.start, selected.end, {
        stroke: selectionInk,
        "stroke-width": 2,
        "stroke-dasharray": "3 2",
      }),
    );
    if (proposed) {
      for (const { rings } of checked.overhangs)
        for (const ring of rings)
          scene.append(
            path(
              ring,
              {
                fill: warningInk,
                "fill-opacity": 0.45,
                stroke: warningInk,
                "stroke-width": 1,
                "data-outline-overhang": "",
              },
              true,
            ),
          );
    }
    const [x, y, width, height] = scene.getAttribute("viewBox")!.split(" ").map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const bounds = outlineBounds(points);
    const left = Math.min(x, bounds.left - 8);
    const top = Math.min(y, bounds.top - 8);
    scene.setAttribute(
      "viewBox",
      `${left} ${top} ${Math.max(x + width, bounds.right + 8) - left} ${Math.max(y + height, bounds.bottom + 8) - top}`,
    );
    preview.replaceChildren(scene);
    const { area } = checked.project;
    const overhangs = proposed ? checked.overhangs.length : 0;
    const summary = proposed
      ? [
          `${inches(area.width)} \u00d7 ${inches(area.depth)} in overall`,
          ...(overhangs
            ? [`${overhangs} ${overhangs === 1 ? "piece" : "pieces"} past the edge`]
            : []),
        ].join(" \u00b7 ")
      : "";
    if (status.textContent !== summary) status.textContent = summary;
  }

  form.addEventListener("input", () => refresh());
  form.addEventListener("change", () => refresh(true));
  form.addEventListener("submit", (event) => {
    if (event.submitter?.getAttribute("formmethod") === "dialog") return;
    event.preventDefault();
    if (!edit) return;
    refresh(true);
    if (!proposed) {
      error.focus();
      return;
    }
    try {
      apply.disabled = true;
      edit.commit(proposed);
      editor.close();
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
      error.focus();
    } finally {
      apply.disabled = false;
    }
  });
  editor.addEventListener("close", () => {
    if (editor.open) return;
    edit = undefined;
    proposed = undefined;
    preview.replaceChildren();
  });

  return (original, commit): void => {
    edit = { original, commit };
    form.reset();
    const { area } = original.project;
    element("outline-increment").hidden = !area.niltc;
    if (area.niltc) distance.setAttribute("aria-describedby", "outline-increment");
    else distance.removeAttribute("aria-describedby");
    element("outline-partial-option").textContent = area.niltc ? "Shift a span" : "Part of edge";
    for (const field of [start, length]) field.step = area.niltc ? "5" : "any";
    distance.step = "any";
    distance.min = "0.3125";
    length.min = area.niltc ? "5" : "0.3125";
    const points = outlineOf(area);
    const { left, top } = outlineBounds(points);
    const edges = outlineEdges(points);
    edge.replaceChildren(
      ...edges.map(({ side, start, end }, index) => {
        const horizontal = horizontalEdge(side);
        const axis = horizontal ? "x" : "y";
        const origin = horizontal ? left : top;
        const low = Math.min(start[axis], end[axis]) - origin;
        const high = Math.max(start[axis], end[axis]) - origin;
        const coordinate = horizontal ? start.y - top : start.x - left;
        const label = side[0]!.toUpperCase() + side.slice(1);
        return new Option(
          `${label} \u00b7 ${inches(low)}\u2013${inches(high)} in at ${inches(coordinate)} in`,
          String(index),
        );
      }),
    );
    edge.selectedIndex = Math.max(
      0,
      edges.findIndex(({ side }) => side === "south"),
    );
    refresh();
    editor.returnValue = "";
    editor.showModal();
  };
}
