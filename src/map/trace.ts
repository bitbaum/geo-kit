/**
 * The map's fast path. d3's projection stream spends several sin/cos per
 * vertex per frame (rotate, clip, project); on a phone that is the frame
 * budget. Here every vertex is turned into a unit vector once, at load, and a
 * frame is three dot products per vertex against the view's basis — the same
 * orthographic projection d3 draws (tested against it), without the trig.
 *
 * Behind the globe a polygon's vertices are pulled onto the limb, so a
 * country crossing the horizon fills up to the edge; a line breaks there.
 * Picking and one-off outlines still use d3 (pick.ts, paint.ts).
 */
import type { Position } from "geojson";

/** x, y, z triples of unit vectors. */
export type Packed = Float64Array;

const RAD = Math.PI / 180;

export function pack(coords: Position[]): Packed {
  const out = new Float64Array(coords.length * 3);
  coords.forEach(([lon = 0, lat = 0], i) => {
    const l = lon * RAD;
    const p = lat * RAD;
    out[i * 3] = Math.cos(p) * Math.cos(l);
    out[i * 3 + 1] = Math.cos(p) * Math.sin(l);
    out[i * 3 + 2] = Math.sin(p);
  });
  return out;
}

/** The view's basis: east and north on screen, forward toward the reader. */
export interface Basis {
  e: [number, number, number];
  n: [number, number, number];
  f: [number, number, number];
  cx: number;
  cy: number;
  r: number;
}

export function basisOf(center: [number, number], cx: number, cy: number, r: number): Basis {
  const l = center[0] * RAD;
  const p = center[1] * RAD;
  return {
    e: [-Math.sin(l), Math.cos(l), 0],
    n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)],
    f: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)],
    cx,
    cy,
    r,
  };
}

/** [x, y, depth]: depth < 0 is behind the globe. For tests and markers. */
export function project(b: Basis, lon: number, lat: number): [number, number, number] {
  const [x = 0, y = 0, z = 0] = pack([[lon, lat]]);
  const u = b.e[0] * x + b.e[1] * y + b.e[2] * z;
  const v = b.n[0] * x + b.n[1] * y + b.n[2] * z;
  return [b.cx + b.r * u, b.cy - b.r * v, b.f[0] * x + b.f[1] * y + b.f[2] * z];
}

interface Pen {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/** A closed ring; vertices behind the globe are pulled onto the limb. */
export function traceRing(pen: Pen, ring: Packed, b: Basis) {
  const { e, n, f, cx, cy, r } = b;
  for (let i = 0; i < ring.length; i += 3) {
    const x = ring[i]!;
    const y = ring[i + 1]!;
    const z = ring[i + 2]!;
    let u = e[0] * x + e[1] * y + e[2] * z;
    let v = n[0] * x + n[1] * y + n[2] * z;
    if (f[0] * x + f[1] * y + f[2] * z < 0) {
      const m = Math.hypot(u, v) || 1;
      u /= m;
      v /= m;
    }
    if (i === 0) pen.moveTo(cx + r * u, cy - r * v);
    else pen.lineTo(cx + r * u, cy - r * v);
  }
  pen.closePath();
}

/** An open line; it breaks where it passes behind the globe. */
export function traceLine(pen: Pen, line: Packed, b: Basis) {
  const { e, n, f, cx, cy, r } = b;
  let down = false;
  for (let i = 0; i < line.length; i += 3) {
    const x = line[i]!;
    const y = line[i + 1]!;
    const z = line[i + 2]!;
    if (f[0] * x + f[1] * y + f[2] * z < 0) {
      down = false;
      continue;
    }
    const px = cx + r * (e[0] * x + e[1] * y + e[2] * z);
    const py = cy - r * (n[0] * x + n[1] * y + n[2] * z);
    if (down) pen.lineTo(px, py);
    else pen.moveTo(px, py);
    down = true;
  }
}
