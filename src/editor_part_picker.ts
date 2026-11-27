import { element } from "./editor_dom";
import { partDrawing } from "./scene_appearance";
import { addShapeBounds, emptyBounds, poseTransform, svg } from "./scene_drawing";
import type { Catalog, Part, PartCategory } from "./project";

type Hooks = {
  selectedId: () => string;
  selectPart: (id: string) => void;
  browse: () => void;
  showArrangements: () => void;
};

const categoryLabels: Record<PartCategory, string> = {
  straights: "Straights",
  curves: "Curves",
  switches: "Switches",
  connectors: "Connectors",
  crossings: "Crossings & crossovers",
};

function choiceId(id: string): string {
  return `part-choice-${id.replace(/[^a-z0-9]+/gi, "-")}`;
}

function preview(part: Part): SVGSVGElement {
  const approach = part.ports.find(({ id }) => id === part.browse?.approach);
  const pose = { x: 0, y: 0, angle: 180 - (approach?.angle ?? 180) };
  const bounds = emptyBounds();
  addShapeBounds(bounds, part.footprint, pose);
  const { left, right, top, bottom } = bounds;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const padding = Math.max(2, Math.max(width, height) * 0.12);
  const ratio = 16 / 9;
  let viewWidth = width + padding * 2;
  let viewHeight = height + padding * 2;
  if (viewWidth / viewHeight < ratio) viewWidth = viewHeight * ratio;
  else viewHeight = viewWidth / ratio;
  const viewBox = `${(left + right - viewWidth) / 2} ${(top + bottom - viewHeight) / 2} ${viewWidth} ${viewHeight}`;
  const drawingId = `part-preview-${choiceId(part.id)}`;
  const image = svg("svg", {
    viewBox,
    "aria-hidden": "true",
    focusable: "false",
    preserveAspectRatio: "xMidYMid meet",
  });
  image.classList.add("part-preview");
  const defs = svg("defs");
  partDrawing(defs, drawingId, part);
  image.append(defs, svg("use", { href: `#${drawingId}`, transform: poseTransform(pose) }));
  return image;
}

function card(part: Part, selectedId: string, onSelect: (id: string) => void): HTMLLabelElement {
  const browse = part.browse;
  if (!browse) throw new Error(`Missing browse data for ${part.id}`);
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "track-part";
  input.id = choiceId(part.id);
  input.value = part.id;
  input.checked = part.id === selectedId;
  input.addEventListener("change", () => {
    if (input.checked) onSelect(part.id);
  });
  const label = document.createElement("label");
  label.className = "part-card";
  label.htmlFor = input.id;
  const title = document.createElement("strong");
  title.id = `${input.id}-title`;
  title.textContent = browse.label;
  const model = document.createElement("small");
  model.id = `${input.id}-model`;
  model.textContent = `${part.brand} · ${part.name}`;
  input.setAttribute("aria-labelledby", `${title.id} ${model.id}`);
  label.append(input, preview(part), title, model);
  if (browse.description) {
    const description = document.createElement("span");
    description.id = `${input.id}-description`;
    description.className = "part-description";
    description.textContent = browse.description;
    input.setAttribute("aria-describedby", description.id);
    label.append(description);
  }
  return label;
}

function matchingParts(catalog: Catalog, category: PartCategory, advanced: boolean): Part[] {
  return catalog.parts
    .filter(
      (part) => part.browse?.category === category && Boolean(part.browse.advanced) === advanced,
    )
    .sort(
      (a, b) =>
        (a.browse?.order ?? 0) - (b.browse?.order ?? 0) ||
        a.brand.localeCompare(b.brand) ||
        a.name.localeCompare(b.name),
    );
}

function choiceGroups(parts: readonly Part[]): Part[][] {
  const grouped = new Map<string, Part[]>();
  for (const part of parts) {
    const key = part.browse?.group ?? part.id;
    const group = grouped.get(key) ?? [];
    group.push(part);
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group) =>
    group.sort(
      (a, b) => Number(Boolean(b.browse?.preferred)) - Number(Boolean(a.browse?.preferred)),
    ),
  );
}

function choices(
  parts: readonly Part[],
  selectedId: string,
  onSelect: (id: string) => void,
): DocumentFragment {
  const result = document.createDocumentFragment();
  for (const group of choiceGroups(parts)) {
    const [preferred, ...alternates] = group;
    if (!preferred) continue;
    const groupNode = document.createElement("div");
    groupNode.className = "part-choice-group";
    groupNode.append(card(preferred, selectedId, onSelect));
    if (alternates.length) {
      const variants = document.createElement("details");
      variants.className = "part-variants";
      const summary = document.createElement("summary");
      summary.textContent = "Other brands";
      summary.setAttribute("aria-label", `Other brands for ${preferred.browse?.label}`);
      variants.append(summary);
      const cards = document.createElement("div");
      cards.className = "part-variant-cards";
      cards.append(...alternates.map((part) => card(part, selectedId, onSelect)));
      variants.append(cards);
      groupNode.append(variants);
    }
    result.append(groupNode);
  }
  return result;
}

export function setupPartPicker(catalog: Catalog, hooks: Hooks): () => void {
  const categories = element("part-categories");
  const results = element("part-results");
  const advanced = element("part-advanced") as HTMLDetailsElement;
  const advancedResults = element("part-advanced-results");
  const arrangementButton = element("part-show-arrangements") as HTMLButtonElement;
  const knownCategories = new Set(
    catalog.parts.flatMap((part) => (part.browse ? [part.browse.category] : [])),
  );
  const initialCategory = knownCategories.has("straights") ? "straights" : [...knownCategories][0];
  if (!initialCategory) return () => {};
  let category: PartCategory = initialCategory;

  const render = (): void => {
    const selectedId = hooks.selectedId();
    results.replaceChildren(
      choices(matchingParts(catalog, category, false), selectedId, selectPart),
    );
    advancedResults.replaceChildren(
      choices(matchingParts(catalog, category, true), selectedId, selectPart),
    );
    for (const selected of document.querySelectorAll<HTMLInputElement>(
      "#part-results input[name=track-part]:checked, #part-advanced input[name=track-part]:checked",
    )) {
      selected.closest("details")?.setAttribute("open", "");
      if (selected.closest("#part-advanced")) advanced.open = true;
    }
    advanced.hidden = !advancedResults.childElementCount;
  };
  const selectPart = hooks.selectPart;
  const fieldset = document.createDocumentFragment();
  for (const [id, label] of Object.entries(categoryLabels) as [PartCategory, string][]) {
    if (!knownCategories.has(id)) continue;
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "track-part-category";
    radio.id = `part-category-${id}`;
    radio.checked = id === category;
    radio.value = id;
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      category = id;
      hooks.browse();
      render();
    });
    const choice = document.createElement("label");
    choice.className = "part-category";
    choice.htmlFor = radio.id;
    const text = document.createElement("span");
    text.textContent = label;
    choice.append(radio, text);
    fieldset.append(choice);
  }
  categories.append(fieldset);
  arrangementButton.addEventListener("click", hooks.showArrangements);
  const reset = (): void => {
    category = initialCategory;
    for (const radio of categories.querySelectorAll<HTMLInputElement>(
      "input[name=track-part-category]",
    )) {
      radio.checked = radio.value === category;
    }
    advanced.open = false;
    for (const disclosure of document.querySelectorAll<HTMLDetailsElement>(
      "#part-results details",
    )) {
      disclosure.open = false;
    }
    render();
  };
  reset();
  return reset;
}
