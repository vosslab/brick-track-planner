import { action, button, dialog, element } from "./editor_dom";

type TabLabel = { id: string; name: string };
type TabHooks = { activate: (id: string) => void; duplicate: () => void; close: () => void };
type TabControls = {
  render: (tabs: readonly TabLabel[], activeId: string | undefined, focus: boolean) => void;
  confirmClose: (name: string) => Promise<boolean>;
};

async function enableFocusgroup(list: HTMLElement): Promise<void> {
  if ("focusGroup" in HTMLElement.prototype || "focusgroup" in HTMLElement.prototype) return;
  const { polyfill } = await import("@microsoft/focusgroup-polyfill/shadowless");
  polyfill(list);
}

export function setupTabs(hooks: TabHooks): TabControls {
  const list = element("layout-tablist");
  const rail = element("layout-tab-rail");
  const panel = element("layout-panel");
  const confirmation = dialog("close-layout-dialog");
  const message = element("close-layout-message");
  const tabButtons = new Map<string, HTMLButtonElement>();
  let lastActiveId: string | undefined;
  let closePending = false;

  function showOverflow(): void {
    rail.toggleAttribute("data-more-left", list.scrollLeft > 1);
    rail.toggleAttribute(
      "data-more-right",
      list.scrollWidth - list.clientWidth - list.scrollLeft > 1,
    );
  }

  function revealTab(tab: HTMLButtonElement): void {
    const tabBounds = tab.getBoundingClientRect();
    const listBounds = list.getBoundingClientRect();
    const inset = Number.parseFloat(getComputedStyle(list).paddingInlineStart);
    const left = tabBounds.left - listBounds.left - inset;
    const right = tabBounds.right - listBounds.right + inset;
    // Scroll just the strip so revealing a tab leaves the drawing in place.
    if (left < 0) list.scrollBy({ left });
    else if (right > 0) list.scrollBy({ left: right });
  }

  button("duplicate-plan").addEventListener("click", hooks.duplicate);
  button("close-layout").addEventListener("click", hooks.close);
  list.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLButtonElement) revealTab(event.target);
  });
  list.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // When focus is already at the requested end, the browser can scroll the page.
    if (
      (event.key === "Home" && event.target === list.firstElementChild) ||
      (event.key === "End" && event.target === list.lastElementChild)
    ) {
      event.preventDefault();
    }
  });
  list.addEventListener("scroll", showOverflow);
  new ResizeObserver(showOverflow).observe(list);
  void enableFocusgroup(list);

  function render(tabs: readonly TabLabel[], activeId: string | undefined, focus: boolean): void {
    const currentIds = new Set(tabs.map((tab) => tab.id));
    for (const [id, tabButton] of tabButtons) {
      if (currentIds.has(id)) continue;
      tabButton.remove();
      tabButtons.delete(id);
    }
    const counts = new Map<string, number>();
    for (const { name } of tabs) counts.set(name, (counts.get(name) ?? 0) + 1);
    const ordinals = new Map<string, number>();
    for (const { id, name } of tabs) {
      let tabButton = tabButtons.get(id);
      if (!tabButton) {
        tabButton = action("", () => hooks.activate(id));
        tabButton.id = `layout-tab-${id}`;
        tabButton.classList.add("command-button");
        tabButton.setAttribute("role", "tab");
        tabButtons.set(id, tabButton);
        list.append(tabButton);
      }
      const ordinal = (ordinals.get(name) ?? 0) + 1;
      ordinals.set(name, ordinal);
      const suffix = (counts.get(name) ?? 0) > 1 ? ` (${ordinal})` : "";
      const label = name + suffix;
      if (tabButton.title !== label) {
        const caption = document.createElement("span");
        caption.textContent = name;
        tabButton.replaceChildren(caption, suffix);
        tabButton.title = label;
      }
      const selected = id === activeId;
      tabButton.setAttribute("aria-selected", String(selected));
      tabButton.toggleAttribute("focusgroupstart", selected);
    }
    const active = activeId === undefined ? undefined : tabButtons.get(activeId);
    if (active) {
      panel.setAttribute("aria-labelledby", active.id);
      if (focus) active.focus({ preventScroll: true });
      if (focus || activeId !== lastActiveId) revealTab(active);
    } else {
      panel.removeAttribute("aria-labelledby");
    }
    lastActiveId = activeId;
    showOverflow();
  }

  async function confirmClose(name: string): Promise<boolean> {
    if (closePending) return false;
    closePending = true;
    confirmation.returnValue = "";
    message.textContent = `"${name}" has unsaved changes.`;
    try {
      confirmation.showModal();
      return await new Promise<boolean>((resolve) => {
        confirmation.addEventListener(
          "close",
          () => resolve(confirmation.returnValue === "discard"),
          { once: true },
        );
      });
    } finally {
      confirmation.returnValue = "";
      closePending = false;
    }
  }

  return { render, confirmClose };
}
