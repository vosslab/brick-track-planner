import { container, control, element, textNode } from "./editor_dom";
import type { MemberInventory, RequiredRow, ShowInventory } from "./show_inventory";

type ApplyCommitments = (memberId: string, changes: ReadonlyMap<string, number | null>) => void;

function itemRows(rows: RequiredRow[]): HTMLElement[] {
  return rows.map(({ label, required }) =>
    container("list-row", textNode("small", label), textNode("small", String(required))),
  );
}

function memberForm(
  member: MemberInventory,
  memberIndex: number,
  apply: ApplyCommitments,
): HTMLFormElement {
  const form = document.createElement("form");
  const fields = member.rows.map((row, rowIndex) => {
    const field = document.createElement("input");
    field.id = `inventory-commitment-${memberIndex}-${rowIndex}`;
    field.type = "number";
    field.min = "0";
    field.max = String(Number.MAX_SAFE_INTEGER);
    field.step = "1";
    field.value = row.committed === null ? "" : String(row.committed);
    field.setAttribute("aria-label", `Committed ${row.label} for ${member.name}`);
    const delta =
      row.delta === null
        ? "Unconfirmed"
        : row.delta < 0
          ? `${-row.delta} short`
          : row.delta > 0
            ? `${row.delta} extra`
            : "Covered";
    form.append(
      container(
        "list-row",
        container(
          "",
          textNode("small", row.label),
          textNode("small", `Required ${row.required} \u00b7 ${delta}`),
        ),
        control("Committed", field),
      ),
    );
    return { row, field };
  });
  const save = document.createElement("button");
  save.id = `inventory-apply-${memberIndex}`;
  save.type = "submit";
  save.textContent = "Apply commitments";
  form.append(
    textNode("small", "A blank quantity means unconfirmed."),
    container("form-actions", save),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const changes = new Map<string, number | null>();
    for (const { row, field } of fields) {
      const quantity = field.value === "" ? null : field.valueAsNumber;
      if (quantity !== row.committed) changes.set(row.key, quantity);
    }
    if (changes.size > 0) apply(member.id, changes);
  });
  return form;
}

export function renderInventory(report: ShowInventory, apply: ApplyCommitments): void {
  const panel = element("show-inventory");
  const openMembers = new Set(
    [...panel.querySelectorAll<HTMLDetailsElement>("details[open]")].map(
      (member) => member.dataset["inventoryMember"],
    ),
  );
  const content: HTMLElement[] = [];
  if (report.track.length)
    content.push(textNode("h3", "Physical track"), ...itemRows(report.track));
  if (report.ballast.length) {
    content.push(textNode("h3", "Published PennLUG materials"), ...itemRows(report.ballast));
  }
  if (report.unknown.length) {
    content.push(textNode("h3", "Unknown requirements"), ...itemRows(report.unknown));
  }
  if (report.members.length) {
    content.push(textNode("h3", "Member commitments"));
    for (const [memberIndex, member] of report.members.entries()) {
      const details = document.createElement("details");
      details.dataset["inventoryMember"] = member.id;
      details.open = openMembers.has(member.id);
      const summary = document.createElement("summary");
      summary.textContent = member.name;
      details.append(
        summary,
        member.rows.length
          ? memberForm(member, memberIndex, apply)
          : textNode("p", "No assigned requirements or commitments."),
        ...itemRows(member.unknown),
      );
      content.push(details);
    }
  }
  if (report.unassigned.length) {
    content.push(textNode("h3", "Unassigned requirements"));
    for (const group of report.unassigned) {
      content.push(textNode("p", group.label), ...itemRows(group.rows), ...itemRows(group.unknown));
    }
  }
  panel.replaceChildren(...(content.length ? content : [textNode("p", "No visible track.")]));
}
