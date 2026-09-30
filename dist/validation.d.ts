import type { ISODate, Position, ManifestValidationOptions } from "./types.ts";
export declare function isStableKey(value: unknown): value is string;
export declare function isISODate(value: unknown): value is ISODate;
export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
export declare function validPeriod(from: unknown, to: unknown): boolean;
export declare function validUrl(value: unknown, protocols: readonly string[]): value is string;
export declare function safeResourceHref(value: unknown): value is string;
/** Validate a manifest without fetching anything. Licenses and their legal policy are supplied by the owner. */
export declare function validateGeographyManifest(value: unknown, options?: ManifestValidationOptions): string[];
export declare function periodContains(from: ISODate | null, to: ISODate | null, date: ISODate): boolean;
/** Resolve current/historical claims as recorded. No default viewpoint or legal status is inferred. */
/** Prevent malformed API records or unsourced claims from silently changing a map's dispute styling. */
export declare function validateAreaAssertions(value: unknown): string[];
/** Validate a GeoJSON geometry's coordinates and structural rules. */
export declare function validateGeometry(value: unknown, maxPositions?: number): string[];
/** True when a coordinate tuple is a finite WGS84 position (lon, lat, optional altitude). */
export declare function isWgs84Position(value: unknown): value is Position;
