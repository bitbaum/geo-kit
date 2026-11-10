/**
 * Picking on real borders: a tap inside a place picks that place, not the
 * coarse country drawn under it. Each case is a border where Solon's atlas
 * draws a country's fine places (layer 3) over Natural Earth 1:50m countries
 * (layer 0) whose outlines are hundreds of metres to kilometres off.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { geoArea, geoBounds } from "d3-geo";
import {
  basisOf,
  pickAt,
  pickAllAt,
  pickIndex,
  polygonsOf,
  project,
  projectionFor,
  rewound,
  type MapFeature,
} from "../src/map/index.ts";
import { countries, holds, ISO, places, placeIds, polesOf, SOURCES, tap } from "./pick-fixtures.ts";

const EE_PLACES = ["ee:narva-linn", "ee:narva-joesuu-linn"];

test("every fixture names its source", () => {
  for (const id of placeIds) assert.ok(SOURCES[id], `${id} has a source`);
});

test("the coarse 50m world really does cover fine places (why layers matter)", () => {
  const ru = countries().find((f) => f.id === ISO.ru)!;
  // Narva's town hall is inside Estonia's Narva, and Natural Earth also puts it in Russia.
  assert.ok(holds(places(["ee:narva-linn"])[0]!.geometry, [28.1972, 59.3773]));
  assert.ok(holds(ru.geometry, [28.1972, 59.3773]), "Natural Earth 50m Russia covers Narva's centre");
  // Görlitz's old town is in Germany, and Natural Earth puts it in Poland.
  assert.ok(holds(countries().find((f) => f.id === ISO.pl)!.geometry, [14.9886, 51.1527]));
});

test("Narva: a tap inside the city picks Narva, not Russia", () => {
  for (const without of [[], ["ee"]] as const) {
    const world = [...countries(without), ...places(EE_PLACES)];
    const label = without.length ? "Estonia's outline left out" : "Estonia's outline kept";
    assert.equal(tap(world, [28.1972, 59.3773]), "ee:narva-linn", `the town hall, ${label}`);
    assert.equal(tap(world, [28.202, 59.3794]), "ee:narva-linn", `Hermann castle, ${label}`);
    assert.equal(tap(world, [28.15, 59.4]), "ee:narva-linn", `north of the centre, ${label}`);
    assert.equal(tap(world, [28.0, 59.4]), "ee:narva-joesuu-linn", `Narva-Jõesuu, ${label}`);
  }
});

test("Narva: across the river is still Russia", () => {
  const world = [...countries(["ee"]), ...places(EE_PLACES)];
  assert.equal(tap(world, [28.2167, 59.377]), ISO.ru, "Ivangorod fortress");
  assert.equal(tap(world, [28.3, 59.37]), ISO.ru, "east of the river");
});

test("Valga and Valka: each side of the town picks its own", () => {
  const world = [...countries(), ...places(["ee:valga-linn", "lv:valka"])];
  assert.equal(tap(world, [26.0475, 57.7777]), "ee:valga-linn");
  assert.equal(tap(world, [26.0245, 57.7752]), "lv:valka");
  assert.equal(tap(world, [26.2, 57.9]), ISO.ee, "open country north of Valga is Estonia");
});

test("Görlitz and Zgorzelec: the old town is Germany's although the coarse border puts it in Poland", () => {
  const world = [...countries(), ...places(["de:goerlitz", "pl:zgorzelec"])];
  assert.equal(tap(world, [14.9886, 51.1527]), "de:goerlitz");
  assert.equal(tap(world, [15.0075, 51.1522]), "pl:zgorzelec");
});

test("Baarle: every enclave and the enclaves inside them pick their own country", () => {
  const ids = ["be:baarle-hertog", "nl:baarle-nassau"];
  const world = [...countries(), ...places(ids)];
  const beGeometry = places(["be:baarle-hertog"])[0]!.geometry;
  const be = polesOf("be:baarle-hertog");
  const nl = polesOf("nl:baarle-nassau");
  assert.ok(be.length >= 20, `${be.length} Belgian pieces`);
  for (const p of be) assert.equal(tap(world, p, 3000), "be:baarle-hertog", `Belgian piece at ${p}`);
  for (const p of nl) assert.equal(tap(world, p, 3000), "nl:baarle-nassau", `Dutch piece at ${p}`);
  // A Dutch piece inside a Belgian piece's outer ring: an enclave in an enclave.
  const inEnclave = nl.filter((p) => polygonsOf(beGeometry).some((rings) => holds({ type: "Polygon", coordinates: [rings[0]!] }, p)));
  assert.ok(inEnclave.length >= 1, "a Dutch piece lies inside a Belgian one");
});

test("Liechtenstein: each commune, against coarse Switzerland and Austria", () => {
  const ids = ["li:vaduz", "li:schaan", "li:triesen", "li:balzers"];
  for (const without of [[], ["li"]] as const) {
    const world = [...countries(without), ...places(ids)];
    assert.equal(tap(world, [9.5237, 47.1415]), "li:vaduz");
    assert.equal(tap(world, [9.5088, 47.165]), "li:schaan");
    assert.equal(tap(world, [9.5272, 47.1075]), "li:triesen");
    assert.equal(tap(world, [9.5036, 47.0653]), "li:balzers");
    for (const id of ids) for (const p of polesOf(id)) assert.equal(tap(world, p, 2000), id, `${id} at ${p}`);
    assert.equal(tap(world, [9.5979, 47.2385]), ISO.at, "Feldkirch");
    assert.equal(tap(world, [9.4785, 47.1666]), ISO.ch, "Buchs, across the Rhine");
  }
});

/* ------------------------------------------------ the rule, on plain shapes */

const square = (id: string, [w, s]: [number, number], size: number, layer?: number): MapFeature => ({
  id,
  properties: {},
  ...(layer === undefined ? {} : { layer }),
  geometry: {
    type: "Polygon",
    coordinates: [[[w, s], [w, s + size], [w + size, s + size], [w + size, s], [w, s]]],
  },
});
const at = (features: MapFeature[], point: [number, number]) => {
  const proj = projectionFor({ x0: 0, y0: 0, x1: 400, y1: 300 }, { center: point, k: 40 });
  const [x, y] = proj(point)!;
  const index = pickIndex(features.map((f) => ({ ...f, geometry: rewound(f.geometry) })));
  return { one: pickAt(index, proj, x, y)?.id ?? null, all: pickAllAt(index, proj, x, y).map((f) => f.id) };
};

test("the higher layer takes the tap, whichever way round they are listed", () => {
  const country = square("country", [0, 0], 10);
  const commune = square("commune", [4, 4], 2, 3);
  assert.equal(at([country, commune], [5, 5]).one, "commune");
  assert.equal(at([commune, country], [5, 5]).one, "commune");
  assert.equal(at([country, commune], [1, 1]).one, "country", "outside the commune it is the country's");
});

test("on one layer the smaller area wins, so an enclave is not hidden by what encloses it", () => {
  const big = square("big", [0, 0], 10);
  const small = square("small", [4, 4], 2);
  assert.equal(at([big, small], [5, 5]).one, "small");
  assert.equal(at([small, big], [5, 5]).one, "small");
});

test("pickAllAt is the whole stack, topmost first, and empty over the sea", () => {
  const world = [square("country", [0, 0], 10), square("province", [3, 3], 5, 1), square("commune", [4, 4], 2, 3)];
  assert.deepEqual(at(world, [5, 5]).all, ["commune", "province", "country"]);
  assert.deepEqual(at(world, [7, 7]).all, ["province", "country"]);
  assert.deepEqual(at(world, [-40, -40]).all, []);
  // Land two claimants hold: both are reported, the smaller first, neither hidden.
  const claimed = [square("a", [0, 0], 6), square("b", [4, 0], 8)];
  assert.deepEqual(at(claimed, [5, 3]).all, ["a", "b"]);
});

test("a feature that crosses the antimeridian is picked on both sides of it", () => {
  const strait = square("strait", [178, -20], 4);
  const wrapped: MapFeature = { ...strait, geometry: { type: "Polygon", coordinates: [[[178, -20], [178, -16], [-178, -16], [-178, -20], [178, -20]]] } };
  assert.equal(at([wrapped], [179, -18]).one, "strait");
  assert.equal(at([wrapped], [-179, -18]).one, "strait");
  assert.equal(at([wrapped], [-170, -18]).one, null);
});

/* -------------------------------------- what was ruled out as the cause */

test("paint and pick share one projection: the fast path lands every Narva vertex where d3 does", () => {
  const narva = places(["ee:narva-linn"])[0]!;
  const camera = { center: [28.19, 59.38] as [number, number], k: 400 };
  const view = { x0: 0, y0: 0, x1: 800, y1: 600 };
  const proj = projectionFor(view, camera);
  const [cx, cy] = proj.translate();
  const basis = basisOf(camera.center, cx, cy, proj.scale());
  let worst = 0;
  for (const polygon of polygonsOf(rewound(narva.geometry)))
    for (const [lon, lat] of polygon[0]!) {
      const [x, y] = project(basis, lon!, lat!);
      const [px, py] = proj([lon!, lat!])!;
      worst = Math.max(worst, Math.hypot(x - px, y - py));
    }
  assert.ok(worst < 1e-6, `largest gap ${worst} px`);
});

test("a corner of a place's box that is outside the place is not the place (it is not a box test)", () => {
  const ids = ["ee:narva-linn", "de:goerlitz", "li:schaan", "li:balzers"];
  const world = places(ids);
  for (const f of world) {
    const [[w, s], [e, n]] = geoBounds({ type: "Feature", geometry: rewound(f.geometry), properties: null });
    for (const corner of [[w, s], [w, n], [e, s], [e, n]] as [number, number][])
      if (!holds(f.geometry, corner)) assert.notEqual(tap(world, corner), f.id, `${f.id} corner ${corner}`);
  }
});

test("wound the other way, no fixture floods the map: far from every place, none is picked", () => {
  const world = places(placeIds);
  for (const f of world) {
    assert.ok(geoArea({ type: "Feature", geometry: rewound(f.geometry), properties: null }) < 1e-5, `${f.id} is small once rewound`);
  }
  for (const far of [[2.35, 48.85], [-74, 40.7], [139.7, 35.7]] as [number, number][])
    assert.equal(tap(world, far), null, `Paris, New York, Tokyo with no countries drawn: ${far}`);
});
