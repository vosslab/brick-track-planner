import type { Point } from "./project";
import { setSceneDetail } from "./scene_appearance";

type Bounds = Point & { width: number; height: number };
type Gesture = {
  first: Point;
  anchor: Point;
  target: Element;
  multi: boolean;
  pan: boolean;
  drag: boolean;
  box?: boolean;
  moved: boolean;
};
type Pinch = { distance: number; anchor: Point; bounds: Bounds };

export class EditorCamera {
  readonly #host: HTMLElement;
  readonly #pointers = new Map<number, Point>();
  #gesture: Gesture | undefined;
  #pinch: Pinch | undefined;
  #bounds: Bounds | undefined;
  #scene: SVGSVGElement | undefined;
  #viewport: { width: number; height: number };

  constructor(
    host: HTMLElement,
    hooks: {
      tap: (point: Point, target: Element, multi: boolean) => void;
      canDrag: (target: Element) => boolean;
      startDrag: (target: Element, multi: boolean) => void;
      drag: (from: Point, to: Point, phase: "preview" | "commit" | "cancel") => void;
      boxActive: () => boolean;
      box: (from: Point, to: Point, phase: "preview" | "commit" | "cancel") => void;
    },
  ) {
    this.#host = host;
    this.#viewport = { width: host.clientWidth, height: host.clientHeight };
    new ResizeObserver(([entry]) => {
      if (!entry) return;
      this.#viewport = entry.contentRect;
      this.#updateDetail();
    }).observe(host);
    host.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.zoom(event.deltaY < 0 ? 0.85 : 1.17, this.world(event.clientX, event.clientY));
      },
      { passive: false },
    );
    host.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Element) || event.button === 2) return;
      const point = { x: event.clientX, y: event.clientY };
      this.#pointers.set(event.pointerId, point);
      host.setPointerCapture(event.pointerId);
      if (this.#pointers.size === 1) {
        this.#gesture = {
          first: point,
          target,
          anchor: this.world(point.x, point.y),
          multi: event.shiftKey || event.ctrlKey || event.metaKey,
          pan: event.button === 1,
          drag: false,
          moved: false,
        };
      } else if (this.#pointers.size === 2) {
        const initial = this.#pair();
        if (!initial || !this.#bounds) return;
        const gesture = this.#gesture;
        if (gesture?.drag) {
          const move = gesture.box ? hooks.box : hooks.drag;
          move(gesture.anchor, gesture.anchor, "cancel");
        }
        this.#gesture = undefined;
        this.#pinch = {
          distance: initial.distance,
          anchor: this.world(initial.mid.x, initial.mid.y),
          bounds: this.#bounds,
        };
      }
    });
    host.addEventListener("pointermove", (event) => {
      const before = this.#pointers.get(event.pointerId);
      if (!before) return;
      const point = { x: event.clientX, y: event.clientY };
      this.#pointers.set(event.pointerId, point);
      if (this.#pinch) {
        this.#movePinch();
        return;
      }
      const gesture = this.#gesture;
      if (!gesture) return;
      if (!gesture.moved) {
        if (Math.hypot(point.x - gesture.first.x, point.y - gesture.first.y) < 5) return;
        gesture.moved = true;
        gesture.box = !gesture.pan && hooks.boxActive();
        gesture.drag = !gesture.pan && (gesture.box || hooks.canDrag(gesture.target));
        if (gesture.drag && !gesture.box) hooks.startDrag(gesture.target, gesture.multi);
        host.dataset["dragging"] = "";
      }
      const world = this.world(point.x, point.y);
      if (gesture.drag) {
        const move = gesture.box ? hooks.box : hooks.drag;
        move(gesture.anchor, world, "preview");
      } else {
        const old = this.world(before.x, before.y);
        this.#pan(old.x - world.x, old.y - world.y);
      }
    });
    const finish = (event: PointerEvent): void => {
      if (!this.#pointers.delete(event.pointerId)) return;
      this.#pinch = undefined;
      delete host.dataset["dragging"];
      const gesture = this.#gesture;
      this.#gesture = undefined;
      if (!gesture) return;
      const point = this.world(event.clientX, event.clientY);
      if (gesture.drag) {
        const move = gesture.box ? hooks.box : hooks.drag;
        move(gesture.anchor, point, event.type === "pointercancel" ? "cancel" : "commit");
      } else if (!gesture.moved && !gesture.pan && event.type === "pointerup") {
        hooks.tap(point, gesture.target, gesture.multi);
      }
    };
    host.addEventListener("pointerup", finish);
    host.addEventListener("pointercancel", finish);
    // Keyboard-generated clicks have no pointer sequence.
    host.addEventListener("click", (event) => {
      if (event.detail !== 0 || !(event.target instanceof SVGElement)) return;
      hooks.tap(this.center, event.target, event.shiftKey);
    });
  }

  get center(): Point {
    if (!this.#bounds) return { x: 0, y: 0 };
    const { x, y, width, height } = this.#bounds;
    return { x: x + width / 2, y: y + height / 2 };
  }

  show(scene: SVGSVGElement, fit = false): void {
    this.#scene = scene;
    if (!this.#bounds || fit) {
      const layout = scene.getAttribute("data-layout-view-box");
      if (layout) scene.setAttribute("viewBox", layout);
      const bounds = scene.viewBox.baseVal;
      this.#bounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }
    if (this.#host.firstElementChild !== scene) this.#host.replaceChildren(scene);
    this.#update();
  }

  world(x: number, y: number): Point {
    const matrix = this.#scene?.getScreenCTM();
    if (!matrix) return this.center;
    const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  get snapRadius(): number {
    const matrix = this.#scene?.getScreenCTM();
    const radius = matrix ? 12 / Math.hypot(matrix.a, matrix.b) : 3;
    return Math.max(1, Math.min(6, radius));
  }

  hit(point: Point): Element[] {
    const matrix = this.#scene?.getScreenCTM();
    if (!matrix) return [];
    const pixel = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return document.elementsFromPoint(pixel.x, pixel.y);
  }

  zoom(factor: number, anchor = this.center): void {
    const bounds = this.#bounds;
    if (!bounds) return;
    const scale = this.#limitScale(factor, bounds);
    this.#bounds = {
      x: anchor.x - (anchor.x - bounds.x) * scale,
      y: anchor.y - (anchor.y - bounds.y) * scale,
      width: bounds.width * scale,
      height: bounds.height * scale,
    };
    this.#update();
  }

  #limitScale(scale: number, bounds: Bounds): number {
    const extent = Math.max(bounds.width, bounds.height);
    return Math.min(20_000 / extent, Math.max(12 / extent, scale));
  }

  #pan(x: number, y: number): void {
    if (!this.#bounds) return;
    this.#bounds = { ...this.#bounds, x: this.#bounds.x + x, y: this.#bounds.y + y };
    this.#update();
  }

  #pair(): { distance: number; mid: Point } | undefined {
    const [a, b] = [...this.#pointers.values()];
    if (!a || !b) return undefined;
    return {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  #movePinch(): void {
    const next = this.#pair();
    const pinch = this.#pinch;
    if (!next || !pinch) return;
    const scale = this.#limitScale(pinch.distance / next.distance, pinch.bounds);
    this.#bounds = {
      ...pinch.bounds,
      width: pinch.bounds.width * scale,
      height: pinch.bounds.height * scale,
    };
    this.#update();
    const center = this.world(next.mid.x, next.mid.y);
    this.#pan(pinch.anchor.x - center.x, pinch.anchor.y - center.y);
  }

  #update(): void {
    if (!this.#scene || !this.#bounds) return;
    const { x, y, width, height } = this.#bounds;
    const viewBox = `${x} ${y} ${width} ${height}`;
    if (this.#scene.getAttribute("viewBox") !== viewBox)
      this.#scene.setAttribute("viewBox", viewBox);
    this.#updateDetail();
  }

  #updateDetail(): void {
    if (!this.#scene || !this.#bounds) return;
    const { width, height } = this.#bounds;
    setSceneDetail(
      this.#scene,
      Math.min(this.#viewport.width / width, this.#viewport.height / height),
    );
  }
}
