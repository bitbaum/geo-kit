/**
 * How long a tap takes to answer with many features: the 10m world plus a
 * tiling of small "communes" on layer 3. Run:
 *   node --experimental-strip-types scripts/bench-pick.ts [communes]
 */
import { readFileSync } from "node:fs";
import type { Topology } from "topojson-specification";

import { pickAt, pickIndex, projectionFor, shapesFromTopology, type MapFeature } from "../src/map/index.ts";

const topo = JSON.parse(readFileSync("node_modules/world-atlas/countries-10m.json", "utf8")) as Topology;
const world = shapesFromTopology(topo, { object: "countries", idOf: (f) => String(f.id) });
const count = Number(process.argv[2] ?? 4000);
const communes: MapFeature[] = Array.from({ length: count }, (_, i) => {
  const x = 5 + (i % 200) * 0.05;
  const y = 40 + Math.floor(i / 200) * 0.05;
  return {
    id: `c${i}`,
    properties: {},
    layer: 3,
    geometry: { type: "Polygon", coordinates: [[[x, y], [x, y + 0.05], [x + 0.05, y + 0.05], [x + 0.05, y], [x, y]]] },
  };
});
let t = performance.now();
const index = pickIndex([...world.features, ...communes]);
console.log(`index of ${index.length} features: ${(performance.now() - t).toFixed(0)} ms`);
const projection = projectionFor({ x0: 0, y0: 0, x1: 800, y1: 600 }, { center: [7, 46.5], k: 12 });
t = performance.now();
let hits = 0;
for (let i = 0; i < 300; i++) if (pickAt(index, projection, 20 + ((i * 7) % 700), 20 + ((i * 11) % 560))) hits++;
console.log(`300 taps: ${((performance.now() - t) / 300).toFixed(2)} ms each (${hits} hit something)`);
