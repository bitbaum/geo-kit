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
export declare function pack(coords: Position[]): Packed;
/** The view's basis: east and north on screen, forward toward the reader. */
export interface Basis {
    e: [number, number, number];
    n: [number, number, number];
    f: [number, number, number];
    cx: number;
    cy: number;
    r: number;
}
export declare function basisOf(center: [number, number], cx: number, cy: number, r: number): Basis;
/** [x, y, depth]: depth < 0 is behind the globe. For tests and markers. */
export declare function project(b: Basis, lon: number, lat: number): [number, number, number];
interface Pen {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    closePath(): void;
}
/** A closed ring; vertices behind the globe are pulled onto the limb. */
export declare function traceRing(pen: Pen, ring: Packed, b: Basis): void;
/** An open line; it breaks where it passes behind the globe. */
export declare function traceLine(pen: Pen, line: Packed, b: Basis): void;
export {};
