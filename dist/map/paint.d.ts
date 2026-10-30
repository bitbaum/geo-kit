/**
 * Painting the map on a canvas: the fills grouped so each colour is one path,
 * and one frame drawn: atmosphere and lit sphere, graticule, land, borders,
 * limb shade, the hover and selection outlines, then whatever the caller
 * draws over it (sites, routes, figures). Every layer but the land and its
 * borders is optional, so the same painter draws a lit globe of the world and
 * a plain map of communes where the data is the picture.
 */
import { type GeoProjection } from "d3-geo";
import type { MapFeature, Shapes } from "./shapes.ts";
import { type Basis } from "./trace.ts";
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
export declare function fade(colour: string, a: number): string;
/**
 * The fills as one entry per colour, in the order the caller's map first
 * names each colour, then the features with no fill: a path per colour, not
 * per feature. As indexes, so the full and the coarse shapes share it.
 */
export declare function groupFills(features: readonly MapFeature<unknown>[], fills: ReadonlyMap<string, Fill>, land: Fill): [Fill, number[]][];
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
export interface Marks<P = Record<string, unknown>> {
    hover?: MapFeature<P>;
    selected?: MapFeature<P>;
}
/** What the caller draws over the map, in CSS pixels, with the frame's basis. */
export type DrawOver = (ctx: CanvasRenderingContext2D, basis: Basis, projection: GeoProjection) => void;
/** One frame, in CSS pixels (the caller has set the device-pixel transform). */
export declare function paintMap<P>(ctx: CanvasRenderingContext2D, size: {
    w: number;
    h: number;
}, proj: GeoProjection, shapes: Shapes<P>, paint: Paint, marks?: Marks<P>, over?: DrawOver): void;
export {};
