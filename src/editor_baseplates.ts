import { baseplateColors, baseplatePatterns, defaultBaseplateAppearance } from "./appearance";
import type { BaseplateAppearance, BaseplateColor, BaseplatePattern } from "./appearance";
import { dialog, element, select } from "./editor_dom";
import { baseplatePattern } from "./scene_appearance";
import { svg } from "./scene_drawing";

function sameAppearance(
  left: BaseplateAppearance | undefined,
  right: BaseplateAppearance | undefined,
): boolean {
  const first = left ?? defaultBaseplateAppearance;
  const second = right ?? defaultBaseplateAppearance;
  return (
    first.pattern === second.pattern &&
    first.color === second.color &&
    (first.pattern === "solid" || first.secondary === second.secondary)
  );
}

function makeAppearance(
  pattern: BaseplatePattern,
  color: BaseplateColor,
  secondary: BaseplateColor,
): BaseplateAppearance {
  return pattern === "solid" ? { pattern, color } : { pattern, color, secondary };
}

/** Set up the design-area appearance dialog and return its opener. */
export function setupBaseplates(): (
  original: BaseplateAppearance | undefined,
  apply: (appearance: BaseplateAppearance) => void,
) => void {
  const editor = dialog("baseplates-dialog");
  const form = element("baseplates-form") as HTMLFormElement;
  const pattern = select("baseplate-pattern") as HTMLSelectElement & { value: BaseplatePattern };
  const primary = element("baseplate-primary-colors");
  const secondary = element("baseplate-secondary-colors");
  const secondaryField = element("baseplate-secondary-field") as HTMLFieldSetElement;
  const previewNode = document.getElementById("baseplate-preview");
  if (!(previewNode instanceof SVGSVGElement)) throw new Error("Expected baseplate preview SVG");
  const preview = previewNode;
  const caption = element("baseplate-preview-caption");
  let original: BaseplateAppearance | undefined;
  let apply: ((appearance: BaseplateAppearance) => void) | undefined;
  let color: BaseplateColor = defaultBaseplateAppearance.color;
  let secondaryColor: BaseplateColor = defaultBaseplateAppearance.color;

  pattern.replaceChildren(
    ...Object.entries(baseplatePatterns).map(([value, label]) => new Option(label, value)),
  );

  function current(): BaseplateAppearance {
    return makeAppearance(pattern.value, color, secondaryColor);
  }

  function updateChoices(container: HTMLElement, selected: BaseplateColor): void {
    for (const choice of container.querySelectorAll<HTMLInputElement>("input")) {
      choice.checked = choice.value === selected;
    }
  }

  function refresh(): void {
    const draft = current();
    const patterned = draft.pattern !== "solid";
    secondaryField.hidden = !patterned;
    for (const control of secondary.querySelectorAll<HTMLInputElement>("input")) {
      control.disabled = !patterned;
    }
    updateChoices(primary, color);
    updateChoices(secondary, secondaryColor);
    const defs = svg("defs");
    defs.append(baseplatePattern("baseplate-preview-pattern", draft));
    preview.replaceChildren(
      defs,
      svg("rect", {
        x: 0,
        y: 0,
        width: 128,
        height: 64,
        fill: "url(#baseplate-preview-pattern)",
      }),
    );
    const first = baseplateColors[draft.color].label;
    caption.textContent = patterned
      ? `${baseplatePatterns[draft.pattern]}: ${first} and ${baseplateColors[draft.secondary].label}`
      : `${baseplatePatterns.solid}: ${first}`;
  }

  function colorChoices(
    container: HTMLElement,
    name: "first" | "second",
    selectColor: (value: BaseplateColor) => void,
  ): void {
    container.replaceChildren(
      ...Object.entries(baseplateColors).map(([value, definition]) => {
        const choice = document.createElement("label");
        choice.className = "baseplate-color-choice";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `baseplate-${name}-color`;
        radio.value = value;
        const swatch = document.createElement("span");
        swatch.className = "baseplate-color-swatch";
        swatch.style.setProperty("--baseplate-color", definition.color);
        swatch.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = definition.label;
        choice.append(radio, swatch, label);
        radio.addEventListener("change", () => selectColor(value as BaseplateColor));
        return choice;
      }),
    );
  }

  colorChoices(primary, "first", (value) => {
    color = value;
    refresh();
  });
  colorChoices(secondary, "second", (value) => {
    secondaryColor = value;
    refresh();
  });
  pattern.addEventListener("change", refresh);
  form.addEventListener("submit", (event) => {
    if (event.submitter?.getAttribute("formmethod") === "dialog") return;
    event.preventDefault();
    const draft = current();
    if (!sameAppearance(original, draft)) apply?.(draft);
    editor.close();
  });
  editor.addEventListener("close", () => {
    if (editor.open) return;
    original = undefined;
    apply = undefined;
    editor.returnValue = "";
  });

  return (opening, commit): void => {
    original = opening;
    apply = commit;
    const draft = opening ?? defaultBaseplateAppearance;
    pattern.value = draft.pattern;
    color = draft.color;
    secondaryColor =
      draft.pattern === "solid"
        ? draft.color === "classic-white"
          ? "classic-green"
          : "classic-white"
        : draft.secondary;
    refresh();
    editor.returnValue = "";
    editor.showModal();
  };
}
