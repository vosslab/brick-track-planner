import { element } from "./editor_dom";
import { partCategories } from "./project";
import type { Catalog, Part, PartCategory } from "./project";
import { partDrawing } from "./scene_appearance";
import { addShapeBounds, emptyBounds, poseTransform, svg } from "./scene_drawing";

type Hooks = {
  selectedId: () => string;
  selectPart: (id: string, place: boolean) => void;
  browse: () => void;
  showArrangements: () => void;
};

const categoryChoices: Record<PartCategory, { label: string; shortLabel?: string; icon: string }> =
  {
    straights: { label: "Straights", icon: "M3 7v10M12 7v10M21 7v10M3 9h18M3 15h18" },
    curves: { label: "Curves", icon: "M4 19V9a5 5 0 0 1 5-5h10M8 19v-9a2 2 0 0 1 2-2h9" },
    switches: { label: "Switches", icon: "M3 7v10M3 9h8l10-6M3 15h18M11 13l10-6M21 13v4" },
    connectors: {
      label: "Connectors",
      icon: "M3 7v10M9 7v10M15 7v10M21 7v10M3 9h6M15 9h6M3 15h6M15 15h6M9 12h6",
    },
    crossings: {
      label: "Crossings & crossovers",
      shortLabel: "Crossings",
      icon: "M3 5l16 16M5 3l16 16M3 19L19 3M5 21L21 5",
    },
    "dead-ends": { label: "Dead ends", icon: "M3 7v10M3 9h14M3 15h14M17 5v14M20 7v10" },
  };

function categoryIcon(path: string): SVGSVGElement {
  const image = svg("svg", {
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    focusable: "false",
  });
  image.classList.add("part-category-icon");
  image.append(svg("path", { d: path }));
  return image;
}

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

function card(
  part: Part,
  selectedId: string,
  onSelect: (id: string, place: boolean) => void,
): HTMLLabelElement {
  const browse = part.browse;
  if (!browse) throw new Error(`Missing browse data for ${part.id}`);
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "track-part";
  input.id = choiceId(part.id);
  input.value = part.id;
  input.checked = part.id === selectedId;
  input.addEventListener("change", () => {
    if (input.checked) onSelect(part.id, false);
  });
  input.addEventListener("click", (event) => {
    if (event.detail > 0) onSelect(part.id, true);
  });
  const label = document.createElement("label");
  label.className = "part-card";
  label.htmlFor = input.id;
  const modelName = `${part.brand} · ${part.name}`;
  label.title = modelName;
  const title = document.createElement("strong");
  title.id = `${input.id}-title`;
  title.textContent = browse.label;
  const brand = document.createElement("small");
  brand.textContent = part.brand;
  const model = document.createElement("span");
  model.id = `${input.id}-model`;
  model.textContent = modelName;
  model.hidden = true;
  input.setAttribute("aria-labelledby", `${title.id} ${model.id}`);
  label.append(input, preview(part), title, brand, model);
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
  onSelect: (id: string, place: boolean) => void,
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
  for (const id of partCategories) {
    if (!knownCategories.has(id)) continue;
    const { label, shortLabel = label, icon } = categoryChoices[id];
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "track-part-category";
    radio.id = `part-category-${id}`;
    radio.checked = id === category;
    radio.value = id;
    radio.setAttribute("aria-label", label);
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      category = id;
      hooks.browse();
      render();
    });
    const choice = document.createElement("label");
    choice.className = "part-category";
    choice.htmlFor = radio.id;
    choice.title = label;
    const text = document.createElement("span");
    text.textContent = shortLabel;
    choice.append(radio, categoryIcon(icon), text);
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
