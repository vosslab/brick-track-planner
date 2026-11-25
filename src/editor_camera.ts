import type { Point } from "./project";
import { setSceneDetail } from "./scene_appearance";

type Bounds = Point & { width: number; height: number };
type Gesture = {
  first: Point;
  target: Element;
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
      tap: (point: Point, target: Element) => void;
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
        if (!this.#bounds) return;
        event.preventDefault();
        if (this.#pointers.size) return;
        const mode = event.deltaMode;
        const page = mode === WheelEvent.DOM_DELTA_PAGE;
        const unit = mode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
        const y = event.deltaY * (page ? this.#viewport.height : unit);
        if (event.ctrlKey) {
          // Desktop trackpad pinches arrive as Ctrl+wheel, including in macOS WebKit.
          if (y) this.zoom(Math.exp(y * 0.01), this.world(event.clientX, event.clientY));
          return;
        }
        const scale = this.#pixelsPerStud;
        const x = event.deltaX * (page ? this.#viewport.width : unit);
        if (scale > 0 && (x || y)) this.#pan(x / scale, y / scale);
      },
      { passive: false },
    );
    window.addEventListener("keydown", (event) => {
      if (event.code !== "Space" || event.defaultPrevented || event.ctrlKey || event.metaKey)
        return;
      const target = event.target;
      if (target !== host && (target !== document.body || !host.matches(":hover"))) return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      host.toggleAttribute("data-space-pan", true);
    });
    window.addEventListener("keyup", (event) => {
      if (event.code === "Space") host.removeAttribute("data-space-pan");
    });
    window.addEventListener("blur", () => host.removeAttribute("data-space-pan"));
    window.addEventListener("keydown", (event) => {
      if (
        !this.#bounds ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        !["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
      )
        return;
      const target = event.target;
      if (target !== host && (target !== document.body || !host.matches(":hover"))) return;
      event.preventDefault();
      const distance = 48 / Math.max(this.#pixelsPerStud, 0.01);
      const move = {
        ArrowDown: { x: 0, y: distance },
        ArrowLeft: { x: -distance, y: 0 },
        ArrowRight: { x: distance, y: 0 },
        ArrowUp: { x: 0, y: -distance },
      }[event.key];
      if (!move) return;
      this.#pan(move.x, move.y);
    });
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
          moved: false,
        };
      } else if (this.#pointers.size === 2) {
        const initial = this.#pair();
        if (!initial || !this.#bounds) return;
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
      }
      const world = this.world(point.x, point.y);
      const old = this.world(before.x, before.y);
      this.#pan(old.x - world.x, old.y - world.y);
    });
    const finish = (event: PointerEvent): void => {
      if (!this.#pointers.delete(event.pointerId)) return;
      this.#pinch = undefined;
      const gesture = this.#gesture;
      this.#gesture = undefined;
      if (!gesture) return;
      const point = this.world(event.clientX, event.clientY);
      if (!gesture.moved && event.type === "pointerup") hooks.tap(point, gesture.target);
    };
    host.addEventListener("pointerup", finish);
    host.addEventListener("pointercancel", finish);
    // Keyboard-generated clicks have no pointer sequence.
    host.addEventListener("click", (event) => {
      if (event.detail !== 0 || !(event.target instanceof SVGElement)) return;
      hooks.tap(this.center, event.target);
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
    if (this.#scene) setSceneDetail(this.#scene, this.#pixelsPerStud);
  }

  get #pixelsPerStud(): number {
    if (!this.#bounds) return 0;
    const { width, height } = this.#bounds;
    return Math.min(this.#viewport.width / width, this.#viewport.height / height);
  }
}
