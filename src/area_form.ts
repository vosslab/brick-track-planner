export type AreaSetup = {
  name: string;
  width: number;
  depth: number;
  assignment: "straight" | "corner" | "general";
  fronts: ("north" | "east" | "south" | "west")[];
};

type Hooks = {
  create: (setup: AreaSetup) => void;
  update?: (setup: AreaSetup) => void;
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
export function setupAreaForm(hooks: Hooks): {
  start: () => void;
  open: (existing?: AreaSetup) => void;
  read: () => AreaSetup;
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
  const rightCurve = form.querySelector<HTMLInputElement>(
    'input[name="curve-side"][value="east"]',
  )!;
  const error = required("area-error", HTMLElement);
  const title = required("area-form-title", HTMLElement);
  const intro = required("area-form-intro", HTMLElement);
  const submit = required("create-area", HTMLButtonElement);
  let editing: AreaSetup | undefined;

  const updateDimensions = (): void => {
    other.hidden = width.value !== "other" && depth.value !== "other";
    otherWidthField.hidden = width.value !== "other";
    otherDepthField.hidden = depth.value !== "other";
    otherWidth.disabled = width.value !== "other";
    otherDepth.disabled = depth.value !== "other";
  };
  const updateAssignment = (): void => {
    const assignment = selected("assignment").value as AreaSetup["assignment"];
    curveOptions.hidden = assignment !== "corner" || Boolean(editing);
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
        editing?.fronts ??
        (assignment === "corner"
          ? ["north", selected("curve-side").value === "west" ? "west" : "east"]
          : assignment === "straight"
            ? ["north"]
            : []),
    };
  };
  const start = (): void => {
    error.textContent = "";
    editing = undefined;
    form.dataset["startup"] = "true";
    startup.append(form);
    required("cancel-area", HTMLButtonElement).hidden = true;
    submit.textContent = "Create track plan";
    updateDimensions();
    updateAssignment();
  };
  const open = (existing?: AreaSetup): void => {
    error.textContent = "";
    editing = existing;
    for (const choice of document.querySelectorAll<HTMLInputElement>('input[name="assignment"]')) {
      choice.disabled = Boolean(existing);
    }
    if (existing) {
      name.value = existing.name;
      width.value = String(existing.width);
      depth.value = String(existing.depth);
      if (![...width.options].some((option) => option.value === width.value)) {
        width.value = "other";
        otherWidth.value = String(existing.width / 3.2);
      }
      if (![...depth.options].some((option) => option.value === depth.value)) {
        depth.value = "other";
        otherDepth.value = String(existing.depth / 3.2);
      }
      const assignment = existing.assignment;
      const choice = document.querySelector<HTMLInputElement>(
        `input[name="assignment"][value="${assignment}"]`,
      );
      if (choice) choice.checked = true;
    } else {
      name.value = "My NILTC layout";
      width.value = "192";
      depth.value = "128";
      otherWidth.value = "60";
      otherDepth.value = "40";
      const straight = document.querySelector<HTMLInputElement>(
        'input[name="assignment"][value="straight"]',
      );
      if (straight) straight.checked = true;
      rightCurve.checked = true;
    }
    updateDimensions();
    updateAssignment();
    form.dataset["startup"] = "false";
    required("cancel-area", HTMLButtonElement).hidden = false;
    title.textContent = existing ? "Edit your design area" : "Start a new design";
    intro.textContent = existing
      ? "The current track stays in place while you adjust the available space."
      : "Choose a new assigned space and mainline.";
    submit.textContent = existing ? "Update design area" : "Create track plan";
    dialog.append(form);
    dialog.showModal();
  };

  width.addEventListener("change", updateDimensions);
  depth.addEventListener("change", updateDimensions);
  for (const choice of document.querySelectorAll<HTMLInputElement>('input[name="assignment"]')) {
    choice.addEventListener("change", updateAssignment);
  }
  required("cancel-area", HTMLButtonElement).addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => startup.append(form));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const setup = read();
      if (editing && hooks.update) hooks.update(setup);
      else hooks.create(setup);
      if (form.dataset["startup"] !== "true") dialog.close();
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
    }
  });
  return { start, open, read };
}
