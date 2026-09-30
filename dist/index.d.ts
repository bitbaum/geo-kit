/** Public entry point for the country-neutral geography contract and helpers. */
export * from "./types.ts";
export { GeographyError } from "./errors.ts";
export { isISODate, isWgs84Position, validateAreaAssertions, validateGeographyManifest, validateGeometry } from "./validation.ts";
export { loadGeographyResources, makeGeometryRef, selectGeographyResources, sha256Hex, verifyGeographyResource } from "./resources.ts";
export { summarizeAreaAssertions, validateBoundaryDraft } from "./boundaries.ts";
export { loadGeographyManifest } from "./manifests.ts";
export { isWgs84Bounds, intersectsGeographyBounds } from "./spatial.ts";
