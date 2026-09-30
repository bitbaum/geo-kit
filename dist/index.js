/** Public entry point for the country-neutral geography contract and helpers. */
export * from "./types.js";
export { GeographyError } from "./errors.js";
export { isISODate, isWgs84Position, validateAreaAssertions, validateGeographyManifest, validateGeometry } from "./validation.js";
export { loadGeographyResources, makeGeometryRef, selectGeographyResources, sha256Hex, verifyGeographyResource } from "./resources.js";
export { summarizeAreaAssertions, validateBoundaryDraft } from "./boundaries.js";
export { loadGeographyManifest } from "./manifests.js";
export { isWgs84Bounds, intersectsGeographyBounds } from "./spatial.js";
