/**
 * @bitbaum/geo-kit
 *
 * Country-neutral wire contracts and client-side validation for public
 * geography services. It does not own geography records, source policy,
 * account data, or political conclusions. Solon owns public facts and their
 * provenance; consumers ask for only the layers, dates, and viewpoints they
 * need.
 */
export declare const GEOGRAPHY_MANIFEST_VERSION: 1;
export type Position = readonly [longitude: number, latitude: number, ...extra: number[]];
export type LinearRing = readonly Position[];
export type BoundaryGeometry = {
    type: "Polygon";
    coordinates: readonly LinearRing[];
} | {
    type: "MultiPolygon";
    coordinates: readonly (readonly LinearRing[])[];
};
export type GeoJSONGeometry = BoundaryGeometry | {
    type: "Point";
    coordinates: Position;
} | {
    type: "MultiPoint";
    coordinates: readonly Position[];
} | {
    type: "LineString";
    coordinates: readonly Position[];
} | {
    type: "MultiLineString";
    coordinates: readonly (readonly Position[])[];
} | {
    type: "GeometryCollection";
    geometries: readonly GeoJSONGeometry[];
};
export type ResourceFormat = "geojson" | "topojson";
export type ISODate = string;
export interface GeographySource {
    id: string;
    publisher: string;
    dataset: string;
    url: string;
    licenseSPDX: string;
    retrievedAt: string;
    attribution?: string;
}
/** A single immutable geometry file in a manifest. */
export interface GeographyResource {
    id: string;
    sourceId: string;
    /** An open key such as `administrative`, `economic`, `ecological`, or `custom`. */
    kindKey: string;
    /** Stable identifier for the geographic system or scope. */
    geographyId: string;
    /** Data-defined tier, such as `country`, `admin1`, or `municipality`. */
    levelKey: string;
    format: ResourceFormat;
    /** Same-origin, root-relative URL. Redirects are rejected by the loader. */
    href: string;
    sha256: string;
    byteSize: number;
    featureCount: number;
    validFrom: ISODate | null;
    /** Exclusive upper bound. Null means no known end. */
    validTo: ISODate | null;
    /** Null means viewpoint-neutral source geometry. */
    viewpointKey: string | null;
    bbox?: readonly [west: number, south: number, east: number, north: number];
    minZoom?: number;
    /** Exclusive upper bound; null means no known maximum. */
    maxZoom?: number;
}
export interface GeographyManifest {
    schemaVersion: typeof GEOGRAPHY_MANIFEST_VERSION;
    datasetVersion: string;
    generatedAt: string;
    sources: readonly GeographySource[];
    resources: readonly GeographyResource[];
}
export interface LicenseRule {
    /** License policy is owned by the application / governing organization. */
    spdx: string;
    requiresAttribution: boolean;
}
export interface ManifestValidationOptions {
    licensePolicy?: readonly LicenseRule[];
    maxResources?: number;
    maxByteSize?: number;
}
export interface ResourceSelection {
    /** At least one of these selectors is required to prevent accidental full loads. */
    geographyIds?: readonly string[];
    resourceIds?: readonly string[];
    kindKeys?: readonly string[];
    levelKeys?: readonly string[];
    /** Required: callers choose the time explicitly; the library never reads the clock. */
    asOf: ISODate;
    /** Default selects only neutral geometry; an explicit key adds that viewpoint. `all` is opt-in. */
    viewpointKey?: string | "all";
    zoom?: number;
    maxBytes?: number;
    maxResources?: number;
}
export type GeometryResourceData = GeoJSONFeatureCollection | Topology;
export interface GeoJSONFeature {
    type: "Feature";
    id?: string | number;
    geometry: GeoJSONGeometry | null;
    properties: Record<string, unknown> | null;
    [key: string]: unknown;
}
export interface GeoJSONFeatureCollection {
    type: "FeatureCollection";
    features: GeoJSONFeature[];
    [key: string]: unknown;
}
export interface Topology {
    type: "Topology";
    arcs: number[][][];
    objects: Record<string, unknown>;
    transform?: {
        scale: [number, number];
        translate: [number, number];
    };
    [key: string]: unknown;
}
export interface LoadedResource {
    resource: GeographyResource;
    data: GeometryResourceData;
    bytes: Uint8Array;
}
export interface ResourceCache {
    get(sha256: string): Promise<Uint8Array | null>;
    put(sha256: string, bytes: Uint8Array): Promise<void>;
}
export interface LoadResourcesOptions {
    baseUrl: string;
    signal?: AbortSignal;
    maxConcurrent?: number;
    cache?: ResourceCache;
    licensePolicy?: readonly LicenseRule[];
    fetcher?: typeof fetch;
}
export type AreaAssertionKind = "claims" | "administers" | "proposes";
/** Mirrors Solon's public `area_assertions` contract; it reports claims, not truth. */
export interface AreaAssertion {
    areaId: string;
    jurisdictionId: string;
    assertion: AreaAssertionKind;
    assertedById: string | null;
    sourceId: string;
    validFrom: ISODate | null;
    validTo: ISODate | null;
}
export interface AreaPoliticalSummary {
    claimants: readonly string[];
    administrators: readonly string[];
    proposers: readonly string[];
    disputed: boolean;
    unclaimed: boolean;
}
export interface BoundaryDraft {
    /** Client-generated draft id; this is not a published geography id. */
    id: string;
    proposalId: string;
    title: string;
    geographyId: string;
    kindKey: string;
    geometry: BoundaryGeometry;
    validFrom: ISODate | null;
    validTo: ISODate | null;
    source: {
        publisher: string;
        dataset: string;
        licenseSPDX: string;
        attribution?: string;
        url?: string;
    };
}
export interface BoundaryDraftValidationOptions {
    licensePolicy: readonly LicenseRule[];
    /** Full topology checks belong to a robust geometry engine supplied by the app. */
    validateTopology?: (geometry: BoundaryGeometry) => {
        valid: boolean;
        problems?: readonly string[];
    };
    /** Must resolve to an approved proposal under the app's own governance workflow. */
    proposalApproved?: (proposalId: string) => boolean;
    maxVertices?: number;
    maxBytes?: number;
}
export interface BoundaryDraftValidation {
    problems: string[];
    publishable: boolean;
    vertexCount: number;
    byteSize: number;
}
