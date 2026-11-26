import type { Point } from "./project";
import { setSceneDetail } from "./scene_appearance";

type Bounds = Point & { width: number; height: number };
type Gesture = {
  first: Point;
  target: Element;
  primary: boolean;
  selectMultiple: boolean;
  canDragTrack: boolean;
  action?: "drag" | "pan" | "blocked";
};
type Pinch = { distance: number; anchor: Point; bounds: Bounds };

export class EditorCamera {
  readonly #host: HTMLElement;
  readonly #pointers = new Map<number, Point>();
  #gesture: Gesture | undefined;
  #pinch: Pinch | undefined;
  // Bounds follow the rotated view. Track edits stay in unrotated design coordinates.
  #bounds: Bounds | undefined;
  #scene: SVGSVGElement | undefined;
  #drawing: SVGGElement | undefined;
  #angle = 0;
  #viewport: { width: number; height: number };

  constructor(
    host: HTMLElement,
    hooks: {
      tap: (point: Point, target: Element, selectMultiple: boolean) => void;
      beginDrag: (point: Point, target: Element) => "drag" | "pan" | "blocked";
      drag: (point: Point) => void;
      endDrag: (point: Point, cancelled: boolean) => void;
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
    window.addEventListener("blur", () => {
      host.removeAttribute("data-space-pan");
      const gesture = this.#gesture;
      this.#gesture = undefined;
      this.#pinch = undefined;
      if (gesture?.action === "drag") hooks.endDrag(gesture.first, true);
      for (const id of this.#pointers.keys()) {
        if (host.hasPointerCapture(id)) host.releasePointerCapture(id);
      }
      this.#pointers.clear();
    });
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
      if (!(target instanceof Element) || ![0, 1].includes(event.button)) return;
      const point = { x: event.clientX, y: event.clientY };
      this.#pointers.set(event.pointerId, point);
      host.setPointerCapture(event.pointerId);
      if (this.#pointers.size === 1) {
        const primary = event.button === 0 && !host.hasAttribute("data-space-pan");
        this.#gesture = {
          first: point,
          target,
          primary,
          selectMultiple: event.shiftKey,
          canDragTrack: primary && event.pointerType === "mouse" && !event.shiftKey,
        };
      } else if (this.#pointers.size === 2) {
        const initial = this.#pair();
        if (!initial || !this.#bounds) return;
        if (this.#gesture?.action === "drag")
          hooks.endDrag(this.world(initial.mid.x, initial.mid.y), true);
        this.#gesture = undefined;
        this.#pinch = {
          distance: initial.distance,
          anchor: this.#view(initial.mid.x, initial.mid.y),
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
      if (!gesture.action) {
        if (Math.hypot(point.x - gesture.first.x, point.y - gesture.first.y) < 5) return;
        gesture.action = gesture.canDragTrack
          ? hooks.beginDrag(this.world(gesture.first.x, gesture.first.y), gesture.target)
          : "pan";
      }
      if (gesture.action === "drag") {
        hooks.drag(this.world(point.x, point.y));
        return;
      }
      if (gesture.action === "blocked") return;
      const old = this.#view(before.x, before.y);
      const next = this.#view(point.x, point.y);
      this.#pan(old.x - next.x, old.y - next.y);
    });
    const finish = (event: PointerEvent): void => {
      if (!this.#pointers.delete(event.pointerId)) return;
      this.#pinch = undefined;
      const gesture = this.#gesture;
      this.#gesture = undefined;
      if (!gesture) return;
      const { clientX, clientY } = event;
      const point = this.world(clientX, clientY);
      const rect = host.getBoundingClientRect();
      const inside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      const released = event.type === "pointerup" && inside;
      if (gesture.action === "drag") hooks.endDrag(point, !released);
      if (
        !gesture.action &&
        released &&
        gesture.primary &&
        Math.hypot(clientX - gesture.first.x, clientY - gesture.first.y) < 5
      )
        hooks.tap(point, gesture.target, gesture.selectMultiple);
    };
    host.addEventListener("pointerup", finish);
    host.addEventListener("pointercancel", finish);
    host.addEventListener("lostpointercapture", finish);
    // Keyboard-generated clicks have no pointer sequence.
    host.addEventListener("click", (event) => {
      if (event.detail !== 0 || !(event.target instanceof SVGElement)) return;
      const rect = event.target.getBoundingClientRect();
      hooks.tap(
        this.world(rect.x + rect.width / 2, rect.y + rect.height / 2),
        event.target,
        event.shiftKey,
      );
    });
  }

  get #center(): Point {
    if (!this.#bounds) return { x: 0, y: 0 };
    const { x, y, width, height } = this.#bounds;
    return { x: x + width / 2, y: y + height / 2 };
  }

  show(scene: SVGSVGElement, fit = false): void {
    this.#scene = scene;
    const drawing = scene.querySelector<SVGGElement>("[data-scene-drawing]");
    if (!drawing) throw new Error("Missing canvas drawing.");
    this.#drawing = drawing;
    if (!this.#bounds || fit) {
      const layout = scene.getAttribute("data-layout-view-box");
      if (layout) scene.setAttribute("viewBox", layout);
      const bounds = scene.viewBox.baseVal;
      const start = this.#turn(bounds, this.#angle);
      const end = this.#turn(
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        this.#angle,
      );
      this.#bounds = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
    }
    if (this.#host.firstElementChild !== scene) this.#host.replaceChildren(scene);
    this.#update();
  }

  world(x: number, y: number): Point {
    return this.#turn(this.#view(x, y), -this.#angle);
  }

  #view(x: number, y: number): Point {
    const matrix = this.#scene?.getScreenCTM();
    if (!matrix) return this.#center;
    const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  get snapRadius(): number {
    const matrix = this.#scene?.getScreenCTM();
    const radius = matrix ? 12 / Math.hypot(matrix.a, matrix.b) : 3;
    return Math.max(1, Math.min(6, radius));
  }

  zoom(factor: number, worldAnchor?: Point): void {
    const bounds = this.#bounds;
    if (!bounds) return;
    const anchor = worldAnchor ? this.#turn(worldAnchor, this.#angle) : this.#center;
    const scale = this.#limitScale(factor, bounds);
    this.#bounds = {
      x: anchor.x - (anchor.x - bounds.x) * scale,
      y: anchor.y - (anchor.y - bounds.y) * scale,
      width: bounds.width * scale,
      height: bounds.height * scale,
    };
    this.#update();
  }

  rotateView(): void {
    const bounds = this.#bounds;
    if (!bounds || this.#pointers.size) return;
    const center = this.#turn(this.#center, 90);
    this.#angle = (this.#angle + 90) % 360;
    this.#bounds = {
      x: center.x - bounds.height / 2,
      y: center.y - bounds.width / 2,
      width: bounds.height,
      height: bounds.width,
    };
    this.#update();
  }

  reset(): void {
    this.#angle = 0;
    this.#bounds = undefined;
  }

  #turn(point: Point, angle: number): Point {
    return new DOMMatrix().rotate(angle).transformPoint(point);
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
    const center = this.#view(next.mid.x, next.mid.y);
    this.#pan(pinch.anchor.x - center.x, pinch.anchor.y - center.y);
  }

  #update(): void {
    if (!this.#scene || !this.#bounds) return;
    const { x, y, width, height } = this.#bounds;
    const viewBox = `${x} ${y} ${width} ${height}`;
    if (this.#scene.getAttribute("viewBox") !== viewBox)
      this.#scene.setAttribute("viewBox", viewBox);
    const rotation = `rotate(${this.#angle})`;
    if (this.#drawing?.getAttribute("transform") !== rotation)
      this.#drawing?.setAttribute("transform", rotation);
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
