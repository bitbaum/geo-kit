/**
 * Builds test/fixtures/borders.json, the fine boundaries the picking tests
 * run on. Not part of the package and not run in CI: the output is committed.
 *
 *   node scripts/fixtures/build-border-fixtures.mjs <omavalitsus-dir> <osm-dir> test/fixtures/borders.json
 *
 * It needs `shapefile` and `proj4` (install them in a scratch directory, not
 * here). <omavalitsus-dir> holds the unzipped Land Board file
 * https://geoportaal.maaamet.ee/docs/haldus_asustus/omavalitsus_shp.zip;
 * <osm-dir> holds one `r<relation id>.json` per OpenStreetMap relation, fetched with
 * https://nominatim.openstreetmap.org/lookup?osm_ids=R<id>&format=geojson&polygon_geojson=1&polygon_threshold=0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(process.cwd() + "/");
const shapefile = require("shapefile");
const proj4 = require("proj4");

const [eeDir, osmDir, out] = process.argv.slice(2);

const round = (n) => Math.round(n * 1e5) / 1e5;
const tidy = (ring) => {
  const kept = [];
  for (const [x, y] of ring) {
    const p = [round(x), round(y)];
    const last = kept[kept.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) kept.push(p);
  }
  return kept;
};
// Douglas-Peucker, in degrees. Rings keep their first and last vertex.
function simplify(ring, tolerance) {
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1;
    let farD = tolerance;
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = ring[i];
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d > farD) {
        far = i;
        farD = d;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}
// A tolerance per fixture: Baarle's pieces are tens of metres wide, so it keeps a metre.
const TOLERANCE = { "be:baarle-hertog": 1e-5, "nl:baarle-nassau": 1e-5 };
const tidyGeometry = (g, id) => {
  const ring = (r) => {
    const out = simplify(tidy(r), TOLERANCE[id] ?? 8e-5);
    return out.length >= 4 ? out : null;
  };
  const rings = (rs) => {
    const kept = rs.map(ring);
    return kept[0] ? kept.filter(Boolean) : null;
  };
  return {
    type: g.type,
    coordinates:
      g.type === "Polygon" ? rings(g.coordinates) : g.coordinates.map(rings).filter(Boolean),
  };
};

// EPSG:3301 (L-EST97), as the file's .prj says.
const lest97 =
  "+proj=lcc +lat_1=59.33333333333334 +lat_2=58 +lat_0=57.51755393055556 +lon_0=24 +x_0=500000 +y_0=6375000 +ellps=GRS80 +units=m +no_defs";
const toLonLat = proj4(lest97, "EPSG:4326");
const unproject = (g) => ({
  type: g.type,
  coordinates:
    g.type === "Polygon"
      ? g.coordinates.map((r) => r.map((c) => toLonLat.forward(c)))
      : g.coordinates.map((p) => p.map((r) => r.map((c) => toLonLat.forward(c)))),
});

const features = {};
const sources = {};

const source = await shapefile.open(join(eeDir, "omavalitsus.shp"), join(eeDir, "omavalitsus.dbf"), {
  encoding: "latin1",
});
const wanted = { "0511": "ee:narva-linn", "0515": "ee:narva-joesuu-linn" };
for (;;) {
  const r = await source.read();
  if (r.done) break;
  const id = wanted[r.value.properties.OKOOD];
  if (id) {
    features[id] = tidyGeometry(unproject(r.value.geometry), id);
    sources[id] =
      "Maa- ja Ruumiamet (Estonian Land Board), municipality boundaries (omavalitsus), export of 2024-12-01; use unrestricted, source and date named";
  }
}

const osm = {
  "de:goerlitz": 409676,
  "pl:zgorzelec": 3150678,
  "be:baarle-hertog": 53137,
  "nl:baarle-nassau": 47798,
  "li:vaduz": 1155956,
  "li:schaan": 1155952,
  "li:triesen": 1155945,
  "li:balzers": 1155953,
  "ee:valga-linn": 351435,
  "lv:valka": 1898515,
};
for (const [id, rel] of Object.entries(osm)) {
  const json = JSON.parse(readFileSync(join(osmDir, `r${rel}.json`), "utf8"));
  features[id] = tidyGeometry(json.features[0].geometry, id);
  sources[id] = `OpenStreetMap relation ${rel}, © OpenStreetMap contributors, ODbL 1.0`;
}

writeFileSync(out, JSON.stringify({ sources, features }));
console.log(Object.keys(features).length, "features written to", out);
