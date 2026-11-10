# Changelog

## 0.7.0

- **Fix: a tap picks the place drawn on top.** `pickAt` walked the features in array order and
  ignored `layer`, so a coarse country listed first took every tap inside a fine place drawn over
  it (Solon: a tap inside Narva selected Russia). The index is now topmost first: highest `layer`,
  then smallest area, then listed last. See `docs/design/picking.md`.
- **`pickAllAt(index, projection, x, y)`**: every feature under the pixel, topmost first (the
  commune, its province, its country; each claimant of contested land), empty over the sea.
- `Pickable` now carries `layer` and `area`.

## 0.6.0

- **`createFocus` / `choose` / `up`** (`/map`): which place a map is about, as one pure state
  machine (no canvas, no framework, no country). Choosing a place selects it, frames its **own
  outline** (never a child's, never the bounds of whatever happens to be drawn inside it: a
  country of which one province has boundaries is still framed as the whole country; only a place
  with no outline of its own is framed by what is inside it), draws its children as the tappable
  places with its own outline whole, and gives the places above it as faint context. Nothing
  jumps to a child that was not chosen; `up()` is the same choice made on the parent. The tree is
  three functions the app supplies (`cameraOf`, `childrenOf`, `parentOf`).
- **`hatch(stripe, options)`**: a diagonal hatch fill for land more than one authority claims, so
  colour is never the only carrier.

## 0.5.0

- Labels that read like an atlas, not a wall of names:
  - **A density budget** (`labelDensity`, default one name per 9,000 px²) caps how many names
    share the screen, most important first.
  - **Breathing room per style** (`padding`, default 4 px).
  - **Globe-aware**: nothing within 18° of the limb, where text smears, and nothing outside the
    globe's disc or within 6 px of the canvas edge.
  - **Steady**: a name shown last frame keeps its place against an equal newcomer, and while
    the reader drags, flies or coasts no newcomer jumps in. Names fade in and out (`labelFade`,
    default 260 ms; instant under reduced motion).
  - **Keep clear**: `labelKeepClear` returns boxes (buttons, a legend) names stay out of.
  - **Callouts**: a style with `box` draws the name on a filled box instead of a halo, and with
    `leader` sets it off from its dot, joined by a line, for a figure beside a country.
- **Layers**: a `MapFeature` can carry `layer`. Features on a higher layer (a province over its
  country) are painted after the ones below and never share a path with them, where
  overlapping shapes cancelled each other out under the even-odd rule and drew land as sea.

## 0.4.0

- `/map`: names on the map. `labels` (and `setLabels`) take every country,
  region and town once, each with a rank and a zoom band; each frame places
  those in front of the reader, most important first, so that none covers
  another, and zooming in reveals smaller places as room appears. A town is a
  dot with its name beside it, tried right, left, above and below.
  `labelStyles` styles each kind (font, colour, halo, dot, uppercase,
  tracking); `onSelectLabel` makes names and dots tappable. The layout is pure
  (`layoutLabels`, with the text measure injected) and tested without a canvas.
- Zoom goes where the reader points: the wheel zooms about the cursor, a
  pinch about the fingers, and a double click or double tap zooms in on the
  point (Shift + double click zooms out). `zoomAt` does the same from code.
- `hoverFill` and `selectedFill` in the palette wash the whole place under the
  pointer or selected, not only its edge.

## 0.3.0

- `/map`: what a globe with its own layer needs, from moving Substrata's
  globe onto it. `pickFirst` lets the caller's layer (a site, a marker) take a
  tap or a hover before the features; `onFacing` names the feature facing the
  reader after a keyboard turn; `jumpTo` goes to a view with no flight; each
  frame's `sinceTouch` tells an animated layer how long the map has been left
  alone. The hover label clears when a gesture starts.

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
