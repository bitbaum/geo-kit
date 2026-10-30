/**
 * Which feature is under a pixel of the map: invert the projection, then test
 * the few features whose lon/lat box holds the point.
 */
import { type GeoProjection } from "d3-geo";
import type { MapFeature } from "./shapes.ts";
export interface Pickable<P = Record<string, unknown>> {
    feature: MapFeature<P>;
    /** lon/lat box; west > east when it crosses the antimeridian. */
    box: [[number, number], [number, number]];
}
export declare function pickIndex<P>(features: readonly MapFeature<P>[]): Pickable<P>[];
/**
 * The feature under a canvas pixel, or null for sea and the space around the
 * globe. `invert` is the projection's; off the disc it has no answer.
 */
export declare function pickAt<P>(index: readonly Pickable<P>[], projection: GeoProjection, x: number, y: number): MapFeature<P> | null;
