/**
 * A map on one <canvas>, without a framework: hand it the canvas, the shapes
 * and a palette, and it draws, turns, zooms and picks. One finger (or the
 * mouse) turns it, two pinch, the wheel zooms, a tap selects the feature under
 * it, a flick keeps it turning. The keyboard treats the canvas as one control:
 * arrows turn it (Shift for larger steps), + and − zoom, Home resets, Enter
 * selects the feature facing the reader.
 *
 * It draws only when something changes, so idle it costs nothing; while it
 * moves it paints the coarse shapes, and full detail the frame after. Under
 * prefers-reduced-motion a flight is a cut, a flick does not coast and the
 * idle turn never starts. A page wraps it in whatever its framework is: it
 * keeps no framework state of its own.
 */
import type { GeoProjection } from "d3-geo";

import { WORLD_LIMITS, clampTilt, clampZoom, disc, projectionFor, wrapLon, cameraFor, type Camera, type Limits, type View } from "./camera.ts";
import { coast, dragged, flight, type Flight, type Spin } from "./motion.ts";
import { groupFills, paintMap, type Fill, type Palette, type Paint } from "./paint.ts";
import { pickAt, pickIndex, type Pickable } from "./pick.ts";
import type { MapFeature, MapShapes } from "./shapes.ts";
import type { Basis } from "./trace.ts";

/** What a frame tells the caller's overlay. */
export interface FrameInfo {
  now: number;
  /** How far the current flight has come (0–1), or null when none. */
  flight: number | null;
  /** True while the map moves and paints its coarse shapes. */
  moving: boolean;
  /** Milliseconds since the reader last touched the map. */
  sinceTouch: number;
}

export interface MapOptions<P = Record<string, unknown>> {
  shapes: MapShapes<P>;
  palette: Palette;
  /** A colour per feature id; a feature without one is painted as land. */
  fills?: ReadonlyMap<string, Fill>;
  limits?: Limits;
  /** Where the map rests and where Home returns to. */
  home?: Camera;
  /** How close a selected feature is framed: the share of the disc it fills, and the closest zoom (default 7). */
  focusZoom?: { fill?: number; most?: number };
  /** Turn slowly after a few seconds of rest, with nothing selected and zoomed out. */
  idleTurn?: boolean;
  /** A feature was tapped or chosen by keyboard; null for the sea. */
  onSelect?: (id: string | null) => void;
  /** The mouse is over a feature (null when over none, or when a gesture starts), at a canvas point. */
  onHover?: (id: string | null, x: number, y: number) => void;
  /**
   * Asked first on a tap and on hover, before the features: true when the
   * caller's own layer (a site, a marker) takes the point, so no feature is
   * selected or outlined there.
   */
  pickFirst?: (x: number, y: number, projection: GeoProjection, kind: "tap" | "hover") => boolean;
  /** The keyboard turned the map: the feature now facing the reader, or null. */
  onFacing?: (id: string | null) => void;
  /** Draw on top of the map each frame. */
  over?: (ctx: CanvasRenderingContext2D, basis: Basis, projection: GeoProjection, frame: FrameInfo) => void;
  /** True while the overlay animates and needs another frame. */
  animating?: (now: number) => boolean;
  /** True while the overlay wants the map held still (no idle turn). */
  holdStill?: () => boolean;
}

export interface MapController {
  /** Size the canvas, in CSS pixels, and the part of it nothing floats over. */
  resize(width: number, height: number, view?: View): void;
  setShapes<P>(shapes: MapShapes<P>): void;
  setFills(fills: ReadonlyMap<string, Fill>): void;
  setPalette(palette: Palette): void;
  /** Mark a feature selected; `fly` turns the map to face it. */
  setSelected(id: string | null, options?: { fly?: boolean }): void;
  flyTo(camera: Camera, duration?: number): void;
  /** Go to a view at once, with no flight. */
  jumpTo(camera: Camera): void;
  zoomBy(factor: number | "home"): void;
  camera(): Camera;
  projection(): GeoProjection | null;
  /** Ask for a frame (the caller's overlay changed). */
  invalidate(): void;
  destroy(): void;
}

const IDLE_BEFORE_TURNING = 4000;
const STOP_TURNING_AFTER = 120_000;
const TURN_PER_MS = 0.004; // degrees: a full turn in about 90 seconds
/** How long the disc takes to follow its view to a new place. */
const FOLLOW_MS = 280;
/** Past this a press is a drag, not a tap. */
const TAP_SLOP = 6;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function createMap<P>(canvas: HTMLCanvasElement, options: MapOptions<P>): MapController {
  const limits = options.limits ?? WORLD_LIMITS;
  const home = options.home ?? { center: [30, 18] as [number, number], k: 1 };
  let shapes = options.shapes as MapShapes<unknown>;
  let index: Pickable<unknown>[] = pickIndex(shapes.features);
  let fills = options.fills ?? new Map<string, Fill>();
  let paint: Paint = { palette: options.palette, groups: groupFills(shapes.features, fills, options.palette.land) };
  let camera: Camera = home;
  let size = { w: 0, h: 0 };
  let shown: { from: View; to: View; start: number } | null = null;
  let motion: { flight?: { f: Flight; start: number }; spin?: Spin } = {};
  let touched = 0;
  let hover: string | null = null;
  let selected: string | null = null;
  let grabbed = false;
  let raf = 0;
  let wake = 0;
  let last = 0;
  let destroyed = false;

  const viewAt = (now: number): View | null => {
    if (!shown) return null;
    const t = Math.min((now - shown.start) / FOLLOW_MS, 1);
    if (t >= 1) return shown.to;
    const e = 1 - (1 - t) ** 3;
    const s = shown;
    const at = (k: keyof View) => lerp(s.from[k], s.to[k], e);
    return { x0: at("x0"), y0: at("y0"), x1: at("x1"), y1: at("y1") };
  };
  const projection = (now = performance.now()) => {
    const view = viewAt(now);
    return view ? projectionFor(view, camera) : null;
  };
  const radius = () => {
    const view = viewAt(performance.now());
    return view ? disc(view).radius : 200;
  };
  const feature = (id: string | null): MapFeature<unknown> | undefined => {
    const i = id === null ? undefined : shapes.index.get(id);
    return i === undefined ? undefined : shapes.features[i];
  };

  /** Advance whatever is moving; true while another frame is needed. */
  const advance = (now: number, dt: number): boolean => {
    if (motion.flight) {
      const t = (now - motion.flight.start) / motion.flight.f.duration;
      camera = motion.flight.f.at(t);
      if (t < 1) return true;
      motion.flight = undefined;
      return false;
    }
    if (motion.spin) {
      const step = coast(camera, motion.spin, dt, radius(), limits);
      camera = step.camera;
      motion.spin = step.spin;
      return !!step.spin;
    }
    if (!options.idleTurn || selected || camera.k > 1.3 || options.holdStill?.() || reducedMotion()) return false;
    const idle = now - touched;
    if (idle > IDLE_BEFORE_TURNING && idle < STOP_TURNING_AFTER) {
      camera = { ...camera, center: [wrapLon(camera.center[0] + TURN_PER_MS * dt), camera.center[1]] };
      return true;
    }
    if (idle <= IDLE_BEFORE_TURNING) {
      // Nothing to draw until the turn may start: wake then, not every frame.
      window.clearTimeout(wake);
      wake = window.setTimeout(invalidate, IDLE_BEFORE_TURNING - idle + 20);
    }
    return false;
  };

  const tick = (now: number) => {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(now - (last || now), 64);
    last = now;
    const moving = advance(now, dt) || grabbed;
    let again = moving;
    if (shown && now - shown.start < FOLLOW_MS) again = true;
    if (options.animating?.(now)) again = true;
    const ctx = canvas.getContext("2d");
    const proj = projection(now);
    if (ctx && proj && size.w > 0) {
      const dpr = pixelRatio();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const flightAt = motion.flight ? (now - motion.flight.start) / motion.flight.f.duration : null;
      paintMap(
        ctx,
        size,
        proj,
        moving ? shapes.coarse : shapes,
        paint,
        { hover: feature(hover), selected: feature(selected) },
        options.over
          ? (c, basis, p) => options.over!(c, basis, p, { now, flight: flightAt, moving, sinceTouch: now - touched })
          : undefined,
      );
    }
    if (again) raf = requestAnimationFrame(tick);
    else last = 0;
  };

  function invalidate() {
    if (!raf && !destroyed) raf = requestAnimationFrame(tick);
  }

  const flyTo = (to: Camera, duration?: number) => {
    const target = { center: [wrapLon(to.center[0]), clampTilt(to.center[1], limits)] as [number, number], k: clampZoom(to.k, limits) };
    motion = {};
    touched = performance.now();
    if (reducedMotion()) camera = target;
    else {
      const f = flight(camera, target, limits);
      motion.flight = { f: duration ? { ...f, duration } : f, start: performance.now() };
    }
    invalidate();
  };
  const grab = () => {
    motion = {};
    touched = performance.now();
  };
  const scale = (factor: number) => {
    camera = { ...camera, k: clampZoom(camera.k * factor, limits) };
    invalidate();
  };
  const zoomBy = (factor: number | "home") => {
    if (factor === "home") flyTo(home);
    else flyTo({ ...camera, k: camera.k * factor }, 260);
  };
  const pick = (x: number, y: number) => {
    const proj = projection();
    return proj ? pickAt(index, proj, x, y) : null;
  };
  const choose = (id: string | null) => options.onSelect?.(id);
  const takenFirst = (x: number, y: number, kind: "tap" | "hover") => {
    const proj = projection();
    return !!proj && !!options.pickFirst?.(x, y, proj, kind);
  };
  const facing = () => {
    const view = viewAt(performance.now());
    if (!view) return null;
    const d = disc(view);
    return pick(d.cx, d.cy)?.id ?? null;
  };

  /* ------------------------------------------------------------ input */

  const pointers = new Map<number, { x: number; y: number }>();
  let gesture = { moved: false, vx: 0, vy: 0, t: 0, startX: 0, startY: 0 };
  const local = (e: { clientX: number; clientY: number }) => {
    const box = canvas.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const on = {
    keydown(e: KeyboardEvent) {
      const step = e.shiftKey ? 30 : 10;
      const perStep = step / Math.max(camera.k, 1);
      const turn = (dLon: number, dLat: number) => {
        motion = {};
        touched = performance.now();
        camera = {
          center: [wrapLon(camera.center[0] + dLon * perStep), clampTilt(camera.center[1] + dLat * perStep, limits)],
          k: camera.k,
        };
        invalidate();
        options.onFacing?.(facing());
      };
      const keys: Record<string, () => void> = {
        ArrowLeft: () => turn(-1, 0),
        ArrowRight: () => turn(1, 0),
        ArrowUp: () => turn(0, 1),
        ArrowDown: () => turn(0, -1),
        "+": () => zoomBy(1.5),
        "=": () => zoomBy(1.5),
        "-": () => zoomBy(1 / 1.5),
        "0": () => zoomBy("home"),
        Home: () => zoomBy("home"),
        Enter: () => choose(facing()),
      };
      const run = keys[e.key];
      if (!run) return;
      e.preventDefault();
      run();
    },
    pointerdown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // An untrusted or already-lifted pointer cannot be captured; the drag works without.
      }
      const at = local(e);
      pointers.set(e.pointerId, at);
      if (pointers.size === 1) gesture = { moved: false, vx: 0, vy: 0, t: e.timeStamp, startX: at.x, startY: at.y };
      else gesture.moved = true; // a second finger is never a tap
      grab();
      grabbed = true;
      if (hover !== null) {
        hover = null;
        options.onHover?.(null, at.x, at.y);
      }
    },
    pointermove(e: PointerEvent) {
      const at = local(e);
      const before = pointers.get(e.pointerId);
      if (!before) {
        if (e.pointerType === "mouse") {
          touched = performance.now();
          const taken = takenFirst(at.x, at.y, "hover");
          const id = taken ? null : (pick(at.x, at.y)?.id ?? null);
          canvas.style.cursor = taken || id ? "pointer" : "";
          if (id !== hover) {
            hover = id;
            invalidate();
          }
          // The caller's own layer answered this point; its hover is its own to show.
          if (!taken) options.onHover?.(id, at.x, at.y);
        }
        return;
      }
      const g = gesture;
      if (pointers.size === 1) {
        if (Math.hypot(at.x - g.startX, at.y - g.startY) > TAP_SLOP) g.moved = true;
        if (g.moved) {
          const dx = at.x - before.x;
          const dy = at.y - before.y;
          camera = dragged(camera, dx, dy, radius(), limits);
          invalidate();
          const dt = Math.max(e.timeStamp - g.t, 1);
          // Smoothed velocity in px/ms, for the coast after release.
          g.vx = g.vx * 0.6 + (dx / dt) * 0.4;
          g.vy = g.vy * 0.6 + (dy / dt) * 0.4;
          g.t = e.timeStamp;
        }
      } else if (pointers.size === 2) {
        const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
        if (other) {
          const d0 = Math.hypot(before.x - other.x, before.y - other.y);
          const d1 = Math.hypot(at.x - other.x, at.y - other.y);
          if (d0 > 0) scale(d1 / d0);
        }
      }
      pointers.set(e.pointerId, at);
    },
    pointerup(e: PointerEvent) {
      if (!pointers.delete(e.pointerId) || pointers.size > 0) return;
      grabbed = false;
      invalidate();
      const g = gesture;
      if (!g.moved) {
        const at = local(e);
        if (!takenFirst(at.x, at.y, "tap")) choose(pick(at.x, at.y)?.id ?? null);
        return;
      }
      const fresh = e.timeStamp - g.t < 80;
      if (fresh && !reducedMotion() && Math.hypot(g.vx, g.vy) > 0.05) {
        motion.spin = { vx: g.vx, vy: g.vy };
        invalidate();
      }
    },
    pointercancel(e: PointerEvent) {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        grabbed = false;
        invalidate();
      }
    },
    pointerleave(e: PointerEvent) {
      if (e.pointerType !== "mouse" || hover === null) return;
      hover = null;
      canvas.style.cursor = "";
      options.onHover?.(null, 0, 0);
      invalidate();
    },
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    grab();
    scale(Math.exp(-px * 0.0018));
  };
  const listeners: [string, EventListener][] = Object.entries(on).map(([type, fn]) => [type, fn as EventListener]);
  for (const [type, fn] of listeners) canvas.addEventListener(type, fn);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.style.touchAction = "none";
  if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = 0;

  return {
    resize(width, height, view) {
      const dpr = pixelRatio();
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      size = { w: width, h: height };
      const to = view ?? { x0: 0, y0: 0, x1: width, y1: height };
      const now = performance.now();
      const from = viewAt(now);
      shown = from && !reducedMotion() ? { from, to, start: now } : { from: to, to, start: 0 };
      invalidate();
    },
    setShapes(next) {
      shapes = next as MapShapes<unknown>;
      index = pickIndex(shapes.features);
      paint = { palette: paint.palette, groups: groupFills(shapes.features, fills, paint.palette.land) };
      invalidate();
    },
    setFills(next) {
      fills = next;
      paint = { ...paint, groups: groupFills(shapes.features, fills, paint.palette.land) };
      invalidate();
    },
    setPalette(palette) {
      paint = { palette, groups: groupFills(shapes.features, fills, palette.land) };
      invalidate();
    },
    setSelected(id, { fly = false } = {}) {
      selected = id;
      const f = feature(id);
      const to = f && fly ? cameraFor(f.geometry, limits, options.focusZoom) : null;
      if (to) flyTo(to);
      else invalidate();
    },
    flyTo,
    jumpTo(to) {
      motion = {};
      touched = performance.now();
      camera = { center: [wrapLon(to.center[0]), clampTilt(to.center[1], limits)], k: clampZoom(to.k, limits) };
      invalidate();
    },
    zoomBy,
    camera: () => camera,
    projection: () => projection(),
    invalidate,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(wake);
      for (const [type, fn] of listeners) canvas.removeEventListener(type, fn);
      canvas.removeEventListener("wheel", wheel);
    },
  };
}
