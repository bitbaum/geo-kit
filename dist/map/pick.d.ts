/**
 * Which feature is under a pixel of the map: invert the projection, then test
 * the few features whose lon/lat box holds the point, topmost first.
 *
 * "Topmost" is the order the map paints in, reversed: the highest `layer`
 * (a commune lies over its country), and on one layer the smallest area (an
 * enclave lies over what encloses it; the order within a layer is the
 * caller's colour grouping, not a stacking). Where two features of one layer
 * still tie, the one listed later wins. The country that happens to be listed
 * first never takes a tap that lies inside a place drawn over it.
 */
import { type GeoProjection } from "d3-geo";
import type { MapFeature } from "./shapes.ts";
export interface Pickable<P = Record<string, unknown>> {
    feature: MapFeature<P>;
    /** lon/lat box; west > east when it crosses the antimeridian. */
    box: [[number, number], [number, number]];
    /** The feature's layer (0 by default). */
    layer: number;
    /** Its area in steradians: the tie-break between features on one layer. */
    area: number;
}
/** The features ready to be picked, in picking order: topmost first. */
export declare function pickIndex<P>(features: readonly MapFeature<P>[]): Pickable<P>[];
/**
 * The feature under a canvas pixel, or null for sea and the space around the
 * globe. `invert` is the projection's; off the disc it has no answer.
 */
export declare function pickAt<P>(index: readonly Pickable<P>[], projection: GeoProjection, x: number, y: number): MapFeature<P> | null;
/**
 * Every feature that holds the pixel, topmost first: the commune, then its
 * province, then its country, and for land more than one authority claims,
 * each claimant. Empty for sea and the space around the globe.
 */
export declare function pickAllAt<P>(index: readonly Pickable<P>[], projection: GeoProjection, x: number, y: number): MapFeature<P>[];
