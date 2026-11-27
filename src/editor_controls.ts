import { button, element, toCanvas } from "./editor_dom";

function closeMenu(menu: HTMLDetailsElement, restoreFocus = false): void {
  if (!menu.open) return;
  if (restoreFocus) menu.querySelector("summary")?.focus({ preventScroll: true });
  menu.open = false;
}

export function setupEditorControls(): () => void {
  const menus = document.querySelectorAll<HTMLDetailsElement>("details.editor-disclosure");
  let openTooltip: HTMLElement | undefined;
  function showTooltip(control?: HTMLElement): void {
    if (openTooltip === control) return;
    openTooltip?.removeAttribute("data-tooltip-open");
    openTooltip = control;
    openTooltip?.setAttribute("data-tooltip-open", "");
  }
  for (const control of document.querySelectorAll<HTMLElement>(".icon-control")) {
    control.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") showTooltip(control);
    });
    control.addEventListener("pointerleave", () => {
      if (openTooltip === control && !control.querySelector(":focus-visible")) showTooltip();
    });
    control.addEventListener("focusin", (event) => {
      if (event.target instanceof Element && event.target.matches(":focus-visible"))
        showTooltip(control);
    });
    control.addEventListener("focusout", () => {
      if (openTooltip === control && !control.matches(":hover")) showTooltip();
    });
  }
  document.addEventListener("pointerdown", () => showTooltip());
  const closeMenusOutside = (event: Event): void => {
    if (!(event.target instanceof Node)) return;
    for (const menu of menus) {
      if (!menu.contains(event.target)) closeMenu(menu);
    }
  };
  document.addEventListener("pointerdown", closeMenusOutside);
  document.addEventListener("focusin", closeMenusOutside);
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector("dialog:modal")
      )
        return;
      if (openTooltip) {
        event.preventDefault();
        showTooltip();
        return;
      }
      for (const menu of menus) {
        if (!menu.open) continue;
        event.preventDefault();
        closeMenu(menu, true);
        return;
      }
    },
    { capture: true },
  );
  for (const menu of menus) {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      for (const other of menus) {
        if (other !== menu) closeMenu(other);
      }
    });
    menu.addEventListener(
      "click",
      (event) => {
        if (event.target instanceof Element && event.target.closest("button:not(:disabled)"))
          closeMenu(menu, true);
      },
      { capture: true },
    );
  }
  element("templates").addEventListener(
    "change",
    (event) => {
      if (!(event.target instanceof HTMLSelectElement) || !event.target.value) return;
      const menu = event.target.closest("details");
      if (menu) closeMenu(menu, true);
    },
    { capture: true },
  );

  const addTrack = button("sidebar-add-track");
  const inspector = button("sidebar-inspector");
  const sidebar = addTrack.closest<HTMLElement>(".editor-sidebar");
  if (!sidebar) throw new Error("Missing editor sidebar.");
  const showPanel = (panel: "library" | "inspector"): void => {
    sidebar.dataset["panel"] = panel;
    addTrack.setAttribute("aria-pressed", String(panel === "library"));
    inspector.setAttribute("aria-pressed", String(panel === "inspector"));
  };
  addTrack.addEventListener("click", () => showPanel("library"));
  inspector.addEventListener("click", () => showPanel("inspector"));

  function jumpToPanel(id: string): void {
    const title = element(id);
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: "start" });
  }
  button("show-add-track").addEventListener("click", () => jumpToPanel("library-title"));
  button("show-inspector").addEventListener("click", () => jumpToPanel("inspector-title"));
  for (const control of document.querySelectorAll("[data-return-to-drawing]")) {
    control.addEventListener("click", toCanvas);
  }

  return () => {
    showTooltip();
    for (const menu of menus) closeMenu(menu);
  };
}
