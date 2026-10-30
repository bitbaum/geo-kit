/**
 * `@bitbaum/geo-kit/map`: the renderer for the geography the main entry
 * delivers. An orthographic globe on Canvas 2D (d3-geo), which zoomed in is a
 * flat map of the place in front of the reader, so the world and a commune are
 * one projection. Framework-free: `createMap` takes a canvas; the pure parts
 * (camera, motion, culling, picking, the fast projection) are exported for
 * tests and overlays. Needs the optional peers `d3-geo` and, for TopoJSON,
 * `topojson-client`.
 */
export {
  WORLD_LIMITS,
  cameraFor,
  cameraForBounds,
  clampTilt,
  clampZoom,
  disc,
  focusOf,
  mainland,
  projectionFor,
  rotationOf,
  wrapLon,
  zoomFor,
  type Camera,
  type Focus,
  type Limits,
  type View,
} from "./camera.ts";
export { createMap, type FrameInfo, type MapController, type MapOptions } from "./controller.ts";
export { capOf, centreOf, horizonOf, visible, type Cap } from "./cull.ts";
export { coast, dragged, flight, type Flight, type Spin } from "./motion.ts";
export { fade, groupFills, paintMap, type DrawOver, type Fill, type Marks, type Paint, type Palette } from "./paint.ts";
export { pickAt, pickIndex, type Pickable } from "./pick.ts";
export {
  coarsened,
  polygonsOf,
  rewound,
  shapesFromFeatures,
  shapesFromTopology,
  shapesOf,
  type MapFeature,
  type MapShapes,
  type Shapes,
  type TopologyOptions,
} from "./shapes.ts";
export { basisOf, pack, project, traceLine, traceRing, type Basis, type Packed } from "./trace.ts";
