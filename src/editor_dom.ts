export function element(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing editor element ${id}`);
  return node;
}

export function input(id: string): HTMLInputElement {
  const node = element(id);
  if (!(node instanceof HTMLInputElement)) throw new Error(`Expected input ${id}`);
  return node;
}

export function select(id: string): HTMLSelectElement {
  const node = element(id);
  if (!(node instanceof HTMLSelectElement)) throw new Error(`Expected select ${id}`);
  return node;
}

export function button(id: string): HTMLButtonElement {
  const node = element(id);
  if (!(node instanceof HTMLButtonElement)) throw new Error(`Expected button ${id}`);
  return node;
}

export function dialog(id: string): HTMLDialogElement {
  const node = element(id);
  if (!(node instanceof HTMLDialogElement)) throw new Error(`Expected dialog ${id}`);
  return node;
}

export function control(label: string, node: HTMLElement): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.append(label, node);
  return wrapper;
}

export function textNode(tag: "p" | "h3" | "li" | "small", content: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = content;
  return node;
}

export function action(label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

export function field(id: string, value: string | number, step?: string): HTMLInputElement {
  const node = document.createElement("input");
  node.id = id;
  node.required = true;
  if (step) {
    node.type = "number";
    node.step = step;
  }
  node.value = String(value);
  return node;
}

export function choice(id: string, options: [string, string][], value?: string): HTMLSelectElement {
  const node = document.createElement("select");
  node.id = id;
  for (const [key, label] of options) node.add(new Option(label, key));
  if (value !== undefined) node.value = value;
  return node;
}

export function container(className: string, ...children: HTMLElement[]): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  node.append(...children);
  return node;
}

export function toCanvas(): void {
  const canvas = element("tabletop");
  canvas.focus({ preventScroll: true });
  if (window.matchMedia("(max-width: 750px)").matches) {
    canvas.scrollIntoView({ block: "center" });
  }
}
