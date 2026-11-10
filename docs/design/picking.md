# Picking: which place is under the pointer

## The defect this answers

On Solon's Narva page a tap inside Narva selected Russia. `pickAt` returned the
first feature in array order that held the point, and ignored `MapFeature.layer`.
Solon lists countries first (Natural Earth 1:50m, layer 0) and a country's own
places last (fine national boundaries, layer 3), so wherever the coarse country
overlaps a fine place, the country won. Measured on the fixtures in
`test/fixtures`: two independent sources for Narva (the Estonian Land Board file
and OpenStreetMap) agree to 0.3 % on area (68.3 and 68.5 km²), and about 68 % of
that area lies inside Natural Earth's Russia; the "far-west edge" that did
register as Narva is the rest. Natural Earth also puts Görlitz's old town in
Poland.

Ruled out, each by a test in `test/pick.test.ts` or by reading the code:

| Suspect | Fact |
| --- | --- |
| Projection mismatch between paint and pick | Both use `projectionFor`; the fast path lands every Narva vertex within 1e-6 px of d3's; `invert` undoes the projection to 1e-9° |
| lon/lat order | The round trip above is lon-first both ways |
| Coarse geometry used for picking | The controller builds the index from `shapes.features` (full detail); only painting in motion uses `shapes.coarse` |
| Bounding box only | Corners of a place's box that are outside the place do not pick it; `geoContains` decides |
| Antimeridian boxes | A feature that crosses it picks on both sides |
| Wrongly wound rings | After `rewound` every fixture is a few thousandths of a steradian; nothing floods the map |
| Wrong source boundaries | Maa-amet and OSM Narva agree (above) |
| CSS / devicePixelRatio | `local()` gives CSS pixels from `getBoundingClientRect`; painting runs under `setTransform(dpr)` in the same CSS pixels. Checked live, see the QA report |

## What others do, and what we take

- **MapLibre GL JS** `queryRenderedFeatures`: the topmost rendered feature comes
  first, and only rendered features are considered. Taken: *topmost first*, as
  an ordered stack. Not taken: it answers from tiles and styles, which this
  renderer does not have.
- **OpenLayers** `forEachFeatureAtPixel`: a callback per feature at the pixel,
  stoppable by returning a truthy value, with `hitTolerance` in CSS pixels and a
  `layerFilter`. Taken: a stack walked from the top that stops at the first
  answer (`pickAt`), and the whole stack when asked (`pickAllAt`). Hit tolerance
  is left to the caller.
- **deck.gl** picks by drawing every object in a unique colour to an offscreen
  buffer and reading the pixel back (8-bit RGBA, limited per layer and object
  count; it does not work for objects that are off screen). Exact for what is
  painted, but a second render per query and a per-frame buffer; not needed
  while `geoContains` is fast. Revisit only if measurements say so.
- **d3-geo**: polygons are spherical, so ring winding matters (`rewound`), and
  one projection serves paint and pick. Already the design.
- **TopoJSON**: neighbours that share an arc cannot disagree about their shared
  border. This is why one source per view is the real cure for borders that do
  not meet; the kit cannot repair two sources, only stop painting the coarse one's
  border over the fine one (see the end).
- **Flatbush** (a static packed Hilbert R-tree), **PMTiles** and vector tiles,
  **geoBoundaries** (CC BY 4.0 boundaries by country) and OSM boundaries are
  sources and indexes the app may use; none changes the kit's picking rule.

## The rule

1. **One projection** for paint and pick (`projectionFor`).
2. **Top down.** The index is sorted topmost first: highest `layer`, then the
   smallest area (an enclave beats what encloses it), then the feature listed
   later. The first feature that holds the point wins. The order within a layer
   is not the paint order (fills are grouped by colour), so area, not array
   position, is the tie-break.
3. **Nested levels** (country > state > county > town) are layers; the deepest
   drawn level wins, and `pickAllAt` returns the chain, deepest first.
4. **Contested and disputed land stays pickable.** Two claimants on one layer
   both hold the point; `pickAt` returns the smaller, `pickAllAt` returns both,
   so an app can say "claimed by A and B" rather than choose silently.
5. **Scale, measured.** `geoContains` runs only for features whose lon/lat box holds
   the point. `scripts/bench-pick.ts` (the 10m world plus a tiling of small
   communes on layer 3, on one development machine): a tap takes 1.4 ms with
   4,255 features and 1.6 ms with 40,255, index build 0.2 to 0.4 s. A grid over the
   boxes was tried and halves that at 40,000 features and changes nothing at 4,000:
   the time is `geoContains` on the big detailed countries, not the box scan. No
   country has anything like 40,000 communes, so there is no index. Revisit when a
   tap is slower than a frame at the sizes an app really loads.
6. **Colour-id picking** only if measurements justify it. They do not today: a tap is
   about a millisecond.

## Paint follows the same layers

Borders used to be stroked in one pass over every fill, so a coarse neighbour's
50m outline ran across the fine places drawn over it. They are now stroked layer
by layer, each after its own fills (`Shapes.lineLayers`), so a layer over another
covers the lines under it. This hides the symptom only where the upper layer's
fill is opaque and covers the area; it does not make two sources agree. One
source per view (shared TopoJSON arcs) is the cure; where an app mixes sources,
it should leave the coarse feature out once the fine places are drawn, as Solon
does for the open country's own outline.

`test/visual.test.ts` paints the fixtures with Skia and compares them with
baselines in `test/visual`: a wrong pick moves the highlight, and a coarse
border stroked across a place fails the border check.
