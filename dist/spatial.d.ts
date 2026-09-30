import type { GeographyBounds } from "./types.ts";
export declare function isWgs84Bounds(value: unknown): value is GeographyBounds;
/** Inclusive intersections: touching edges and either spelling of the date line overlap. */
export declare function intersectsGeographyBounds(a: GeographyBounds, b: GeographyBounds): boolean;
