import type { Point } from "./project";
import { setSceneDetail } from "./scene_appearance";

type Bounds = Point & { width: number; height: number };
export type CameraView = Bounds & { angle: number };
type Gesture = {
  first: Point;
  target: Element;
  primary: boolean;
  selectMultiple: boolean;
  canDragTrack: boolean;
  canBoxSelect: boolean;
  action?: "drag" | "pan" | "blocked" | "place" | "box";
};
type Pinch = { distance: number; anchor: Point; bounds: Bounds };

const arrowShifts = new Map<string, Point>([
  ["ArrowDown", { x: 0, y: 1 }],
  ["ArrowLeft", { x: -1, y: 0 }],
  ["ArrowRight", { x: 1, y: 0 }],
  ["ArrowUp", { x: 0, y: -1 }],
]);

function rectangleBetween(first: Point, last: Point): DOMRect {
  return new DOMRect(
    Math.min(first.x, last.x),
    Math.min(first.y, last.y),
    Math.abs(first.x - last.x),
    Math.abs(first.y - last.y),
  );
}

export class EditorCamera {
  readonly #host: HTMLElement;
  readonly #hover: (clientPoint: Point, target: Element) => void;
  readonly #clearHover: () => void;
  readonly #endDrag: (point: Point, cancelled: boolean) => void;
  readonly #holding: () => boolean;
  readonly #pointers = new Map<number, Point>();
  readonly #selectionBox = document.createElement("div");
  #gesture: Gesture | undefined;
  #pinch: Pinch | undefined;
  #mouse: Point | undefined;
  // Bounds follow the rotated view. Track edits stay in unrotated design coordinates.
  #bounds: Bounds | undefined;
  #scene: SVGSVGElement | undefined;
  #drawing: SVGGElement | undefined;
  #angle = 0;
  #viewport: { width: number; height: number };

  constructor(
    host: HTMLElement,
    hooks: {
      tap: (point: Point, target: Element, selectMultiple: boolean, clientPoint?: Point) => void;
      hover: (clientPoint: Point, target: Element) => void;
      clearHover: () => void;
      holding: () => boolean;
      nudge: (shift: Point, target: EventTarget | null) => boolean;
      selecting: () => boolean;
      selectBox: (box: DOMRectReadOnly) => void;
      beginDrag: (point: Point, target: Element, clientPoint: Point) => "drag" | "pan" | "blocked";
      drag: (point: Point) => void;
      endDrag: (point: Point, cancelled: boolean) => void;
    },
  ) {
    this.#host = host;
    this.#hover = hooks.hover;
    this.#clearHover = hooks.clearHover;
    this.#endDrag = hooks.endDrag;
    this.#holding = hooks.holding;
    this.#selectionBox.className = "track-selection-box";
    this.#selectionBox.setAttribute("aria-hidden", "true");
    this.#viewport = { width: host.clientWidth, height: host.clientHeight };
    new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === this.#viewport.width && height === this.#viewport.height) return;
      if (this.#gesture?.canDragTrack && this.#gesture.action !== "pan") this.cancelGesture();
      this.#viewport = entry.contentRect;
      this.#updateDetail();
      this.#refreshHover(this.#mouse);
    }).observe(host);
    host.addEventListener(
      "wheel",
      (event) => {
        if (!this.#bounds) return;
        event.preventDefault();
        if (this.#pointers.size) return;
        this.#mouse = { x: event.clientX, y: event.clientY };
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
    window.addEventListener("blur", () => this.cancelGesture());
    window.addEventListener("keydown", (event) => {
      const shift = arrowShifts.get(event.key);
      if (
        !this.#bounds ||
        !shift ||
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector("dialog[open]")
      )
        return;
      const target = event.target;
      if (
        !this.#pointers.size &&
        !event.shiftKey &&
        !host.hasAttribute("data-space-pan") &&
        hooks.nudge(this.#turn(shift, -this.#angle), target)
      ) {
        event.preventDefault();
        return;
      }
      if (target !== host && (target !== document.body || !host.matches(":hover"))) return;
      event.preventDefault();
      if (this.#pointers.size) return;
      const distance = 48 / Math.max(this.#pixelsPerStud, 0.01);
      this.#pan(shift.x * distance, shift.y * distance);
    });
    host.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Element) || ![0, 1].includes(event.button)) return;
      const point = { x: event.clientX, y: event.clientY };
      this.#mouse = event.pointerType === "mouse" ? point : undefined;
      this.#pointers.set(event.pointerId, point);
      host.setPointerCapture(event.pointerId);
      if (this.#pointers.size === 1) {
        const primary = event.button === 0 && !host.hasAttribute("data-space-pan");
        const modifier = event.metaKey || event.ctrlKey;
        this.#gesture = {
          first: point,
          target,
          primary,
          selectMultiple: event.shiftKey || modifier,
          canDragTrack: primary && event.pointerType === "mouse" && !event.shiftKey && !modifier,
          canBoxSelect: primary && event.pointerType === "mouse" && modifier && hooks.selecting(),
          action: primary && hooks.holding() ? "place" : undefined,
        };
      } else if (this.#pointers.size === 2) {
        const initial = this.#pair();
        if (!initial || !this.#bounds) return;
        if (this.#gesture?.action === "drag")
          hooks.endDrag(this.world(initial.mid.x, initial.mid.y), true);
        if (this.#gesture?.action === "place") hooks.clearHover();
        this.#selectionBox.remove();
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
      const point = { x: event.clientX, y: event.clientY };
      if (!before) {
        if (
          !this.#pointers.size &&
          event.pointerType === "mouse" &&
          event.buttons === 0 &&
          event.target instanceof Element
        ) {
          this.#mouse = point;
          if (!host.hasAttribute("data-space-pan")) this.#hover(point, event.target);
        }
        return;
      }
      if (event.pointerType === "mouse") this.#mouse = point;
      this.#pointers.set(event.pointerId, point);
      if (this.#pinch) {
        this.#movePinch();
        return;
      }
      const gesture = this.#gesture;
      if (!gesture) return;
      if (gesture.action === "place") {
        this.#refreshHover(point);
        return;
      }
      if (!gesture.action) {
        if (Math.hypot(point.x - gesture.first.x, point.y - gesture.first.y) < 5) return;
        if (gesture.canBoxSelect) gesture.action = "box";
        else {
          gesture.action = gesture.canDragTrack
            ? hooks.beginDrag(
                this.world(gesture.first.x, gesture.first.y),
                gesture.target,
                gesture.first,
              )
            : "pan";
        }
      }
      if (gesture.action === "box") {
        const box = rectangleBetween(gesture.first, point);
        const canvas = host.getBoundingClientRect();
        const { style } = this.#selectionBox;
        style.left = `${box.left - canvas.left}px`;
        style.top = `${box.top - canvas.top}px`;
        style.width = `${box.width}px`;
        style.height = `${box.height}px`;
        if (!this.#selectionBox.isConnected) host.append(this.#selectionBox);
        return;
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
      const clientPoint = { x: event.clientX, y: event.clientY };
      const point = this.world(clientPoint.x, clientPoint.y);
      // Captured events target the host even when the pointer is over a control.
      const target = event.type === "pointerup" ? this.#targetAt(clientPoint) : undefined;
      this.#mouse = event.pointerType === "mouse" && target ? clientPoint : undefined;
      if (gesture.action === "place") {
        if (target && hooks.holding()) hooks.tap(point, target, gesture.selectMultiple);
        else hooks.clearHover();
        return;
      }
      if (gesture.action === "box") {
        this.#selectionBox.remove();
        if (target) hooks.selectBox(rectangleBetween(gesture.first, clientPoint));
        return;
      }
      if (gesture.action === "drag") hooks.endDrag(point, !target);
      if (
        !gesture.action &&
        target &&
        gesture.primary &&
        Math.hypot(clientPoint.x - gesture.first.x, clientPoint.y - gesture.first.y) < 5
      )
        hooks.tap(
          point,
          gesture.target,
          gesture.selectMultiple,
          event.pointerType === "mouse" ? gesture.first : undefined,
        );
    };
    host.addEventListener("pointerup", finish);
    host.addEventListener("pointercancel", finish);
    host.addEventListener("lostpointercapture", finish);
    host.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      this.#mouse = undefined;
      this.#clearHover();
    });
    // Keyboard-generated clicks have no pointer sequence.
    host.addEventListener("click", (event) => {
      if (event.detail !== 0 || !(event.target instanceof SVGElement)) return;
      const rect = event.target.getBoundingClientRect();
      hooks.tap(
        this.world(rect.x + rect.width / 2, rect.y + rect.height / 2),
        event.target,
        event.shiftKey || event.metaKey || event.ctrlKey,
      );
    });
  }

  get #center(): Point {
    if (!this.#bounds) return { x: 0, y: 0 };
    const { x, y, width, height } = this.#bounds;
    return { x: x + width / 2, y: y + height / 2 };
  }

  show(scene: SVGSVGElement, fit = false): void {
    if (fit && this.#pointers.size) this.cancelGesture();
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
    this.#update(fit);
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

  get studsPerPixel(): number {
    const matrix = this.#scene?.getScreenCTM();
    return matrix ? 1 / Math.hypot(matrix.a, matrix.b) : 0.25;
  }

  get snapRadius(): number {
    return Math.max(1, Math.min(6, 12 * this.studsPerPixel));
  }

  zoom(factor: number, worldAnchor?: Point): void {
    const bounds = this.#bounds;
    if (!bounds || this.#pointers.size) return;
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

  snapshot(): CameraView | undefined {
    return this.#bounds ? { ...this.#bounds, angle: this.#angle } : undefined;
  }

  restore(view: CameraView | undefined): void {
    this.cancelGesture();
    this.#angle = view?.angle ?? 0;
    this.#bounds = view
      ? { x: view.x, y: view.y, width: view.width, height: view.height }
      : undefined;
  }

  cancelGesture(): boolean {
    const gesture = this.#gesture;
    this.#gesture = undefined;
    this.#pinch = undefined;
    this.#mouse = undefined;
    this.#selectionBox.remove();
    this.#host.removeAttribute("data-space-pan");
    const pointers = [...this.#pointers.keys()];
    this.#pointers.clear();
    for (const id of pointers) {
      if (this.#host.hasPointerCapture(id)) this.#host.releasePointerCapture(id);
    }
    if (gesture?.action === "drag")
      this.#endDrag(this.world(gesture.first.x, gesture.first.y), true);
    this.#clearHover();
    return Boolean(pointers.length);
  }

  #targetAt(point: Point): Element | undefined {
    const target = document.elementFromPoint(point.x, point.y);
    return target && this.#host.contains(target) ? target : undefined;
  }

  #refreshHover(point: Point | undefined): void {
    if (!this.#holding()) return;
    const target = point && this.#targetAt(point);
    if (point && target) this.#hover(point, target);
    else this.#clearHover();
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

  #update(fit = false): void {
    if (!this.#scene || !this.#bounds) return;
    const { x, y, width, height } = this.#bounds;
    const viewBox = `${x} ${y} ${width} ${height}`;
    const rotation = `rotate(${this.#angle})`;
    const viewChanged = this.#scene.getAttribute("viewBox") !== viewBox;
    const rotated = this.#drawing?.getAttribute("transform") !== rotation;
    if (viewChanged) this.#scene.setAttribute("viewBox", viewBox);
    if (rotated) this.#drawing?.setAttribute("transform", rotation);
    this.#updateDetail();
    if (fit || viewChanged || rotated) this.#refreshHover(this.#mouse);
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
