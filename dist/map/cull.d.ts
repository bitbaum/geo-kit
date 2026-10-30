/**
 * What is on the far side of the globe need not be drawn. Each country and
 * each border line carries a cap — the smallest circle on the sphere, around
 * its centre, that holds every vertex — and a frame streams only the ones
 * whose cap reaches over the horizon. Half the world is skipped at rest, far
 * more when zoomed in. Pure, so the horizon maths is tested.
 */
import { type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
export interface Cap {
    center: [number, number];
    /** Degrees from the centre to the farthest vertex. */
    reach: number;
}
export declare function capOf(shape: GeoPermissibleObjects & {
    coordinates: unknown;
}): Cap;
/**
 * How far from the centre of view, in degrees, anything can still be seen on
 * this canvas: the hemisphere when the whole disc fits, less when the globe
 * is zoomed past the canvas edges.
 */
export declare function horizonOf(proj: GeoProjection, size: {
    w: number;
    h: number;
}): number;
/** The point of the Earth at the centre of an orthographic projection. */
export declare function centreOf(proj: GeoProjection): [number, number];
export declare function visible(cap: Cap, centre: [number, number], horizon: number): boolean;
