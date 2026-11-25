import { container, element, textNode } from "./editor_dom";
import type { RequiredRow, ShowInventory } from "./show_inventory";

function itemRows(rows: RequiredRow[]): HTMLElement[] {
  return rows.map(({ label, required }) =>
    container("list-row", textNode("small", label), textNode("small", String(required))),
  );
}

/** Render one member's complete parts list. */
export function renderInventory(report: ShowInventory): void {
  const physicalParts = report.track.reduce((total, row) => total + row.required, 0);
  element("parts-count").textContent = String(physicalParts);
  element("parts-summary").replaceChildren(
    ...(report.track.length ? itemRows(report.track) : [textNode("p", "No visible track.")]),
  );
  const content: HTMLElement[] = [];
  if (report.track.length)
    content.push(textNode("h3", "Track to bring"), ...itemRows(report.track));
  if (report.ballast.length)
    content.push(textNode("h3", "Published PennLUG materials"), ...itemRows(report.ballast));
  if (report.groups.length) {
    content.push(textNode("h3", "Placed arrangements"));
    for (const group of report.groups) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = group.name;
      details.append(
        summary,
        ...(group.note ? [textNode("p", group.note)] : []),
        ...itemRows(group.rows),
      );
      content.push(details);
    }
  }
  if (report.buildReferences.length) {
    content.push(textNode("h3", "Build references"));
    for (const reference of report.buildReferences) {
      const link = document.createElement("a");
      link.href = reference.source;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = reference.title;
      content.push(
        container("list-row", container("", link, textNode("small", reference.description))),
      );
    }
  }
  if (report.unknown.length)
    content.push(textNode("h3", "Needs attention"), ...itemRows(report.unknown));
  element("show-inventory").replaceChildren(
    ...(content.length ? content : [textNode("p", "No visible track.")]),
  );
}
