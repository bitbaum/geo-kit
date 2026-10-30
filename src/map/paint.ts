/**
 * Painting the map on a canvas: the fills grouped so each colour is one path,
 * and one frame drawn: atmosphere and lit sphere, graticule, land, borders,
 * limb shade, the hover and selection outlines, then whatever the caller
 * draws over it (sites, routes, figures). Every layer but the land and its
 * borders is optional, so the same painter draws a lit globe of the world and
 * a plain map of communes where the data is the picture.
 */
import { geoGraticule10, geoPath, type GeoProjection } from "d3-geo";
import type { MultiLineString } from "geojson";

import { centreOf, horizonOf, visible } from "./cull.ts";
import type { MapFeature, Shapes } from "./shapes.ts";
import { basisOf, pack, traceLine, traceRing, type Basis } from "./trace.ts";

const FULL = Math.PI * 2;

export type Fill = string | CanvasPattern;

export interface Palette {
  /** The sea, or the page under a map with no base. */
  sphere: string;
  /** The sphere's lit side; absent paints it flat. */
  sphereLight?: string;
  /** Absent draws no graticule. */
  graticule?: string;
  /** A feature with no fill of its own. */
  land: string;
  border: string;
  hover: string;
  selected: string;
  /** A glow past the limb, [inner, outer]; absent draws none. */
  glow?: [string, string];
  /** Shade toward the limb, [inner, outer]; absent draws none. */
  limb?: [string, string];
  /** Border width in CSS pixels (default 0.6). */
  borderWidth?: number;
}

/**
 * Any CSS colour at an alpha, for gradients that fade without greying. The
 * canvas normalises the colour first: a build may minify `#000000` to `#000`,
 * and a token could as well be `rgb()`.
 */
export function fade(colour: string, a: number): string {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return colour;
  probe.fillStyle = "#000";
  probe.fillStyle = colour;
  const norm = String(probe.fillStyle);
  const hex = /^#([0-9a-f]{6})$/i.exec(norm);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const rgba = /^rgba?\(([^,]+),([^,]+),([^,)]+)/.exec(norm.replace(/\s/g, ""));
  return rgba ? `rgba(${rgba[1]},${rgba[2]},${rgba[3]},${a})` : colour;
}

/**
 * The fills as one entry per colour, in the order the caller's map first
 * names each colour, then the features with no fill: a path per colour, not
 * per feature. As indexes, so the full and the coarse shapes share it.
 */
export function groupFills(features: readonly MapFeature<unknown>[], fills: ReadonlyMap<string, Fill>, land: Fill) {
  const groups = new Map<Fill, number[]>();
  for (const fill of fills.values()) if (!groups.has(fill)) groups.set(fill, []);
  groups.set(land, groups.get(land) ?? []);
  features.forEach((f, i) => groups.get(fills.get(f.id) ?? land)!.push(i));
  // The plain land first, so a coloured feature's edge is never painted over.
  const plain = groups.get(land)!;
  groups.delete(land);
  return [[land, plain] as [Fill, number[]], ...groups.entries()].filter(([, members]) => members.length > 0);
}

const GRATICULE = (geoGraticule10() as MultiLineString).coordinates.map(pack);

interface Backdrop {
  key: string;
  under: HTMLCanvasElement;
  over: HTMLCanvasElement;
}

/** What a frame needs that outlives it: the palette, the fill groups, the cached backdrop. */
export interface Paint {
  palette: Palette;
  groups: [Fill, number[]][];
  backdrop?: Backdrop;
}

function blit(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/**
 * Atmosphere and sphere (under the land) and the limb shade (over it) do not
 * turn with the Earth: render them once per disc and blit them, instead of
 * full-disc gradients every frame.
 */
function backdrop(paint: Paint, target: HTMLCanvasElement, cx: number, cy: number, r: number, size: { w: number; h: number }) {
  const key = [target.width, target.height, cx, cy, r].map((n) => n.toFixed(1)).join();
  if (paint.backdrop?.key === key) return paint.backdrop;
  const { palette } = paint;
  const scale = target.width / size.w;
  const layer = (draw: (c: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const c = canvas.getContext("2d");
    if (c) {
      c.setTransform(scale, 0, 0, scale, 0, 0);
      draw(c);
    }
    return canvas;
  };
  const disc = (c: CanvasRenderingContext2D, radius: number, fill: CanvasGradient | string) => {
    c.fillStyle = fill;
    c.beginPath();
    c.arc(cx, cy, radius, 0, FULL);
    c.fill();
  };
  const under = layer((c) => {
    if (palette.glow && r < Math.hypot(size.w, size.h)) {
      const glow = c.createRadialGradient(cx, cy, r * 0.97, cx, cy, r * 1.12);
      glow.addColorStop(0, palette.glow[0]);
      glow.addColorStop(1, palette.glow[1]);
      disc(c, r * 1.12, glow);
    }
    if (palette.sphereLight) {
      // The sphere, lit from the upper left.
      const sea = c.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.05, cx, cy, r);
      sea.addColorStop(0, palette.sphereLight);
      sea.addColorStop(1, palette.sphere);
      disc(c, r, sea);
    } else disc(c, r, palette.sphere);
  });
  const over = layer((c) => {
    if (!palette.limb) return;
    const limb = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    limb.addColorStop(0, palette.limb[0]);
    limb.addColorStop(1, palette.limb[1]);
    disc(c, r, limb);
  });
  paint.backdrop = { key, under, over };
  return paint.backdrop;
}

export interface Marks<P = Record<string, unknown>> {
  hover?: MapFeature<P>;
  selected?: MapFeature<P>;
}

/** What the caller draws over the map, in CSS pixels, with the frame's basis. */
export type DrawOver = (ctx: CanvasRenderingContext2D, basis: Basis, projection: GeoProjection) => void;

/** One frame, in CSS pixels (the caller has set the device-pixel transform). */
export function paintMap<P>(
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number },
  proj: GeoProjection,
  shapes: Shapes<P>,
  paint: Paint,
  marks: Marks<P> = {},
  over?: DrawOver,
) {
  const { palette, groups } = paint;
  const [cx, cy] = proj.translate();
  const r = proj.scale();
  ctx.clearRect(0, 0, size.w, size.h);
  const { under, over: shade } = backdrop(paint, ctx.canvas, cx, cy, r, size);
  blit(ctx, under);

  const centre = centreOf(proj);
  const horizon = horizonOf(proj, size);
  const basis = basisOf(centre, cx, cy, r);

  if (palette.graticule) {
    ctx.beginPath();
    for (const line of GRATICULE) traceLine(ctx, line, basis);
    ctx.strokeStyle = palette.graticule;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  for (const [fill, members] of groups) {
    ctx.beginPath();
    for (const i of members)
      if (visible(shapes.caps[i]!, centre, horizon)) for (const ring of shapes.rings[i]!) traceRing(ctx, ring, basis);
    ctx.fillStyle = fill;
    ctx.fill("evenodd");
  }
  ctx.beginPath();
  shapes.lines.forEach((line, i) => {
    if (visible(shapes.lineCaps[i]!, centre, horizon)) traceLine(ctx, line, basis);
  });
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = palette.borderWidth ?? 0.6;
  ctx.lineJoin = "round";
  ctx.stroke();

  blit(ctx, shade);

  const path = geoPath(proj, ctx);
  const outline = (f: MapFeature<P> | undefined, width: number, colour: string) => {
    if (!f) return;
    const feature = { type: "Feature" as const, geometry: f.geometry, properties: null };
    ctx.beginPath();
    path(feature);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
    // Too small to see at this zoom: ring it.
    const [[x0, y0], [x1, y1]] = path.bounds(feature);
    if (Number.isFinite(x0) && Math.max(x1 - x0, y1 - y0) < 10) {
      ctx.beginPath();
      ctx.arc((x0 + x1) / 2, (y0 + y1) / 2, 11, 0, FULL);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };
  if (marks.hover !== marks.selected) outline(marks.hover, 1.25, palette.hover);
  outline(marks.selected, 2, palette.selected);

  over?.(ctx, basis, proj);
}
