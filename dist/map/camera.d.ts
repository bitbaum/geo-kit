/**
 * Where the map looks, kept pure so it can be tested without a browser: where
 * the disc sits in the visible part of the canvas, the projection for a view,
 * and where to look to face a feature and how close.
 *
 * Angles are degrees. A view is the point of the Earth facing the reader
 * (`center`, [lon, lat]) and a zoom factor `k` on top of the resting radius,
 * so a sheet rising or a panel opening only moves and resizes the disc; it
 * never changes what the reader is looking at. Zoomed far in, the
 * orthographic globe is a flat map of the place in front of the reader, so
 * one projection serves the world and a commune.
 */
import { type GeoProjection } from "d3-geo";
import type { Geometry, Position } from "geojson";
/** The part of the canvas nothing floats over, in CSS pixels. */
export interface View {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}
export interface Camera {
    /** The point of the Earth at the centre of the disc, [lon, lat]. */
    center: [number, number];
    /** Zoom on top of the resting radius; 1 is the whole globe in view. */
    k: number;
}
/** How far the reader may zoom and tilt. */
export interface Limits {
    minZoom: number;
    maxZoom: number;
    /** How far north or south the reader can tilt: past this the poles spin. */
    maxTilt: number;
}
/** A world: the whole globe at rest, a country at most. */
export declare const WORLD_LIMITS: Limits;
/** Centre and resting radius of the globe in the visible part of the canvas. */
export declare function disc(view: View): {
    cx: number;
    cy: number;
    radius: number;
    short: number;
};
export declare const clampZoom: (k: number, limits?: Limits) => number;
export declare const clampTilt: (lat: number, limits?: Limits) => number;
/** Longitude folded into (-180, 180]. */
export declare function wrapLon(lon: number): number;
/** The d3 rotation that turns `center` to face the reader. */
export declare function rotationOf(center: [number, number]): [number, number, number];
export declare function projectionFor(view: View, camera: Camera): GeoProjection;
/**
 * The part of a feature to frame: its largest pieces, up to three quarters of
 * its area. The whole outline is wrong for the features that matter most: the
 * United States would be framed with Alaska and Hawaii (a view of the Pacific),
 * France with Guiana, Norway with Svalbard.
 */
export declare function mainland(geometry: Geometry): Position[][][];
export interface Focus {
    /** [lon, lat] to turn to the reader. */
    center: [number, number];
    /** Degrees from the centre to the farthest point of the part framed. */
    reach: number;
}
/**
 * Where to look to face a feature, and how much of the sphere it spans.
 * Spherical throughout (geoCentroid, geoDistance), so Russia, Fiji and the
 * United States, which cross the antimeridian, need no special case.
 */
export declare function focusOf(geometry: Geometry): Focus | null;
/**
 * The zoom that fits a feature of angular `reach` in the disc. A point `r°`
 * from the centre of an orthographic view lies `R·sin r` from its middle, so
 * the feature fills `sin(reach)` of the radius at k = 1. Small features stop
 * at `most` rather than filling the screen with one island.
 */
export declare function zoomFor(reach: number, { fill, most }?: {
    fill?: number | undefined;
    most?: number | undefined;
}): number;
/** The camera that faces a feature, or null when it has no area. */
export declare function cameraFor(geometry: Geometry, limits?: Limits, zoom?: {
    fill?: number;
    most?: number;
}): Camera | null;
/** The camera that faces a lon/lat box [west, south, east, north]. */
export declare function cameraForBounds([w, s, e, n]: [number, number, number, number], limits?: Limits, fill?: number): Camera;
