/**
 * `@bitbaum/geo-kit/map`: the renderer for the geography the main entry
 * delivers. An orthographic globe on Canvas 2D (d3-geo), which zoomed in is a
 * flat map of the place in front of the reader, so the world and a commune are
 * one projection. Framework-free: `createMap` takes a canvas; the pure parts
 * (camera, motion, culling, picking, the fast projection) are exported for
 * tests and overlays. Needs the optional peers `d3-geo` and, for TopoJSON,
 * `topojson-client`.
 */
export { WORLD_LIMITS, cameraFor, cameraForBounds, clampTilt, clampZoom, disc, focusOf, mainland, projectionFor, rotationOf, wrapLon, zoomFor, } from "./camera.js";
export { createMap } from "./controller.js";
export { capOf, centreOf, horizonOf, visible } from "./cull.js";
export { coast, dragged, flight } from "./motion.js";
export { fade, groupFills, paintMap } from "./paint.js";
export { pickAt, pickIndex } from "./pick.js";
export { coarsened, polygonsOf, rewound, shapesFromFeatures, shapesFromTopology, shapesOf, } from "./shapes.js";
export { basisOf, pack, project, traceLine, traceRing } from "./trace.js";
