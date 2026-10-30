# Changelog

## 0.2.0

- Add `@bitbaum/geo-kit/map`: one Canvas 2D renderer for the geography this
  package delivers, an orthographic globe that zoomed in is a flat map, so the
  world and a commune are one projection. Framework-free `createMap` (turn,
  pinch, wheel, keyboard, tap to select, flights, coasting, reduced motion),
  shapes from TopoJSON or GeoJSON keyed by any id, fills by id, and the pure
  camera, motion, culling, picking and fast-projection helpers. Extracted from
  Substrata's globe, so Solon's map and Substrata's globe are one renderer.
- `d3-geo` and `topojson-client` are optional peer dependencies, needed only
  by `/map`.

## 0.1.1

- Add bounded, same-origin manifest downloads with source and licence validation.
- Share streamed transport between manifests and geometry; cancel stalled bodies
  and stop cached resource loads when the consumer aborts.
- Filter resources by viewport bounds before applying the download budget,
  including antimeridian crossings. Bounds remain optional for existing data.
- Retain the explicit geography, date and viewpoint contract from 0.1.0.

## 0.1.0

- Introduce sourced geography manifests, bounded resource selection and loading,
  SHA-256 verification, WGS84 geometry validation, dated area assertions and
  proposal-gated boundary draft validation.
