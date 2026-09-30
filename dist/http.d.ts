import type { LoadResourcesOptions } from "./types.ts";
type FetchOptions = Pick<LoadResourcesOptions, "baseUrl" | "signal" | "fetcher">;
export declare function publicDataUrl(href: string, baseUrl: string): URL;
/** Shared bounded transport for manifests and geometry, including decoded compressed bodies. */
export declare function fetchGeographyBytes(href: string, maxBytes: number, options: FetchOptions, label: string): Promise<Uint8Array>;
export {};
