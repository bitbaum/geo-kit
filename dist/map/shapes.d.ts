import type { Feature, GeoJsonProperties, Geometry, MultiLineString, Position } from "geojson";
import type { Topology } from "topojson-specification";
import { type Cap } from "./cull.ts";
import { type Packed } from "./trace.ts";
/** A feature as the map holds it: its id, its geometry and the caller's properties. */
export interface MapFeature<P = Record<string, unknown>> {
    id: string;
    geometry: Geometry;
    properties: P;
}
export interface Shapes<P = Record<string, unknown>> {
    features: MapFeature<P>[];
    /** Where each id sits in `features`, `caps` and `rings`. */
    index: Map<string, number>;
    /** Every border and coast once. */
    borders: MultiLineString;
    caps: Cap[];
    lineCaps: Cap[];
    rings: Packed[][];
    lines: Packed[];
}
/** The full detail and the coarse copy painted in motion. */
export interface MapShapes<P = Record<string, unknown>> extends Shapes<P> {
    coarse: Shapes<P>;
}
type Ring = Position[];
export declare function polygonsOf(g: Geometry): Ring[][];
/**
 * d3-geo is spherical: a ring wound the "wrong" way encloses the rest of the
 * globe, so one bad polygon floods the ocean with that feature's colour.
 * Simplification leaves a few such rings, and planar data (most national
 * boundary files) is wound the other way throughout; a polygon covering more
 * than a hemisphere is one of them, and reversing its rings puts it right.
 */
export declare function rewound(g: Geometry): Geometry;
/** Prepare features and their shared borders for painting. */
export declare function shapesOf<P>(features: readonly MapFeature<P>[], borders: MultiLineString): Shapes<P>;
/**
 * Every `every`-th vertex of each arc, ends kept. Thinning the topology's arcs
 * rather than each feature's rings keeps a shared border shared: neighbours
 * still meet exactly, with no slivers between them.
 */
export declare function coarsened<T extends Topology>(topo: T, every: number): T;
export interface TopologyOptions<P extends GeoJsonProperties> {
    /** The object in `topo.objects` to draw. */
    object: string;
    /** The id each feature is known by; null leaves the feature out. */
    idOf: (feature: Feature<Geometry, P>) => string | null;
    /** Keep every n-th vertex for the copy painted in motion (default 3; 1 keeps all). */
    coarseEvery?: number;
}
/** Shapes from one object of a TopoJSON topology, with its coarse copy. */
export declare function shapesFromTopology<P extends GeoJsonProperties>(topo: Topology, options: TopologyOptions<P>): MapShapes<P>;
/**
 * Shapes from GeoJSON features, whose borders are their rings (a feature
 * collection carries no shared arcs). Painted in motion as they are.
 */
export declare function shapesFromFeatures<P>(features: readonly MapFeature<P>[]): MapShapes<P>;
export {};
