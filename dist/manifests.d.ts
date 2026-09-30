import type { GeographyManifest, LoadManifestOptions } from "./types.ts";
/** Fetch a public manifest within a byte budget, then validate its provenance and policy. */
export declare function loadGeographyManifest(href: string, options: LoadManifestOptions): Promise<GeographyManifest>;
