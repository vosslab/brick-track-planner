export type AreaSetup = {
  name: string;
  width: number;
  depth: number;
  assignment: "straight" | "corner" | "general";
  fronts: ("north" | "east" | "south" | "west")[];
};

function required<T extends Element>(id: string, type: { new (): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing ${id}.`);
  return element;
}

function selected(name: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  if (!element) throw new Error(`Choose ${name}.`);
  return element;
}

/** Wires the small area dialog. Project construction stays in the editor. */
export function setupAreaForm(hooks: { create: (setup: AreaSetup) => void }): {
  start: () => void;
  open: () => void;
} {
  const dialog = required("area-dialog", HTMLDialogElement);
  const startup = required("startup-form", HTMLElement);
  const template = required("area-form-template", HTMLTemplateElement);
  const form = template.content.firstElementChild?.cloneNode(true);
  if (!(form instanceof HTMLFormElement)) throw new Error("Missing area form.");
  startup.append(form);
  const width = required("area-width", HTMLSelectElement);
  const depth = required("area-depth", HTMLSelectElement);
  const widthLabel = required("area-width-label", HTMLElement);
  const depthLabel = required("area-depth-label", HTMLElement);
  const other = required("area-other-dimensions", HTMLElement);
  const otherWidthField = required("area-other-width-field", HTMLElement);
  const otherDepthField = required("area-other-depth-field", HTMLElement);
  const otherWidth = required("area-other-width", HTMLInputElement);
  const otherDepth = required("area-other-depth", HTMLInputElement);
  const name = required("area-name", HTMLInputElement);
  const curveOptions = required("area-curve", HTMLFieldSetElement);
  const assignments = form.querySelectorAll<HTMLInputElement>('input[name="assignment"]');
  const error = required("area-error", HTMLElement);
  const title = required("area-form-title", HTMLElement);
  const intro = required("area-form-intro", HTMLElement);
  const cancel = required("cancel-area", HTMLButtonElement);

  const updateDimensions = (): void => {
    other.hidden = width.value !== "other" && depth.value !== "other";
    otherWidthField.hidden = width.value !== "other";
    otherDepthField.hidden = depth.value !== "other";
    otherWidth.disabled = width.value !== "other";
    otherDepth.disabled = depth.value !== "other";
  };
  const updateAssignment = (): void => {
    const assignment = selected("assignment").value as AreaSetup["assignment"];
    curveOptions.hidden = assignment !== "corner";
    widthLabel.textContent =
      assignment === "corner" ? "Width on the drawing" : "Width along the track";
    depthLabel.textContent =
      assignment === "corner" ? "Depth on the drawing" : "Depth from plexiglass";
  };
  const read = (): AreaSetup => {
    const assignment = selected("assignment").value as AreaSetup["assignment"];
    const inches = (value: string, fallback: HTMLInputElement): number =>
      value === "other" ? fallback.valueAsNumber : Number(value) / 3.2;
    const measuredWidth = inches(width.value, otherWidth);
    const measuredDepth = inches(depth.value, otherDepth);
    if (
      !Number.isFinite(measuredWidth) ||
      !Number.isFinite(measuredDepth) ||
      measuredWidth < 10 ||
      measuredDepth < 10
    ) {
      throw new Error("Enter a width and depth of at least 10 inches.");
    }
    if (assignment === "corner" && (measuredWidth < 40 || measuredDepth < 40)) {
      throw new Error("A NILTC curve needs at least a 40 by 40 inch design area.");
    }
    return {
      name: name.value.trim() || "My track plan",
      width: measuredWidth * 3.2,
      depth: measuredDepth * 3.2,
      assignment,
      fronts:
        assignment === "corner"
          ? ["north", selected("curve-side").value === "west" ? "west" : "east"]
          : assignment === "straight"
            ? ["north"]
            : [],
    };
  };
  const prepare = (): void => {
    form.reset();
    error.textContent = "";
    updateDimensions();
    updateAssignment();
  };
  const start = (): void => {
    prepare();
    startup.append(form);
    cancel.hidden = true;
  };
  const open = (): void => {
    prepare();
    cancel.hidden = false;
    title.textContent = "Start a new design";
    intro.textContent = "Choose a new assigned space and mainline.";
    dialog.append(form);
    dialog.showModal();
  };

  width.addEventListener("change", updateDimensions);
  depth.addEventListener("change", updateDimensions);
  for (const choice of assignments) {
    choice.addEventListener("change", updateAssignment);
  }
  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (!dialog.open) start();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      hooks.create(read());
      if (dialog.open) dialog.close();
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
    }
  });
  return { start, open };
}
