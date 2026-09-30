import type { GeographyManifest, GeographyResource, GeometryResourceData, LoadedResource, LoadResourcesOptions, ResourceSelection } from "./types.ts";
export declare function selectGeographyResources(manifest: GeographyManifest, request: ResourceSelection): GeographyResource[];
/** Verify the declared digest, exact decoded size, JSON shape, and feature count. */
export declare function verifyGeographyResource(resource: GeographyResource, bytes: Uint8Array): Promise<GeometryResourceData>;
export declare function sha256Hex(bytes: Uint8Array): Promise<string>;
/** Fetches selected public data without cookies; data resources may not redirect off-origin. */
export declare function loadGeographyResources(manifest: GeographyManifest, request: ResourceSelection, options: LoadResourcesOptions): Promise<LoadedResource[]>;
/** Build an opaque, versioned geometry reference suitable for Solon's `areas.geometry_ref`. */
export declare function makeGeometryRef(input: {
    sourceId: string;
    datasetVersion: string;
    resourceId: string;
    featureId: string | number;
}): string;
