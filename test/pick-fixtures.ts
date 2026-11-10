/**
 * What the picking tests share: the world as Solon layers it (Natural Earth
 * countries first, a country's own fine places over them), the fine border
 * fixtures (test/fixtures/README.md), and a point that is surely inside a ring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geoContains } from "d3-geo";
import type { Geometry, Position } from "geojson";
import type { Topology } from "topojson-specification";

import {
  pickAt,
  pickIndex,
  polygonsOf,
  projectionFor,
  rewound,
  shapesFromTopology,
  type MapFeature,
  type View,
} from "../src/map/index.ts";

const topo = JSON.parse(readFileSync("node_modules/world-atlas/countries-50m.json", "utf8")) as Topology;
const world = shapesFromTopology<{ name: string }>(topo, {
  object: "countries",
  idOf: (f) => (f.id === undefined ? null : String(f.id)),
});

/** ISO 3166-1 numeric ids, which world-atlas keys its countries by. */
export const ISO = {
  ru: "643",
  ee: "233",
  lv: "428",
  de: "276",
  pl: "616",
  be: "056",
  nl: "528",
  ch: "756",
  at: "040",
  li: "438",
} as const;
export type Country = keyof typeof ISO;

/** The coarse world, layer 0, as Solon passes it (a country may be left out once its places are drawn). */
export function countries(without: readonly Country[] = []): MapFeature[] {
  const out = new Set<string>(without.map((c) => ISO[c]));
  return world.features.filter((f) => !out.has(f.id)).map((f) => ({ id: f.id, geometry: f.geometry, properties: {} }));
}

const borders = JSON.parse(readFileSync("test/fixtures/borders.json", "utf8")) as {
  sources: Record<string, string>;
  features: Record<string, Geometry>;
};
export const SOURCES = borders.sources;

/** Fine places, by fixture id, on their own layer (Solon's layer 3). */
export function places(ids: readonly string[], layer = 3): MapFeature[] {
  return ids.map((id) => {
    const geometry = borders.features[id];
    assert.ok(geometry, `fixture ${id}`);
    return { id, geometry, properties: {}, layer };
  });
}
export const placeIds = Object.keys(borders.features);

const VIEW: View = { x0: 0, y0: 0, x1: 800, y1: 600 };

/**
 * Where a tap on `point` lands, and what the map answers there: the lon/lat
 * is projected to a pixel with the map's own projection, and the pixel is
 * handed to pickAt, so paint and pick are tested as one.
 */
export function tap(features: readonly MapFeature[], point: [number, number], k = 600) {
  const shapes = features.map((f) => ({ ...f, geometry: rewound(f.geometry) }));
  const proj = projectionFor(VIEW, { center: point, k });
  const px = proj(point);
  assert.ok(px, "the point is on the globe");
  const back = proj.invert?.(px);
  assert.ok(back && Math.abs(back[0] - point[0]) < 1e-9 && Math.abs(back[1] - point[1]) < 1e-9, "invert undoes the projection");
  return pickAt(pickIndex(shapes), proj, px[0], px[1])?.id ?? null;
}

/** Does this geometry hold the point, wound the way the map winds it? */
export function holds(geometry: Geometry, point: [number, number]): boolean {
  return geoContains({ type: "Feature", geometry: rewound(geometry), properties: null }, point);
}

/**
 * A point well inside one polygon of a geometry (a grid search for the spot
 * farthest from any edge, as polylabel does), so a test does not rest on a
 * point a metre from a border.
 */
export function poleOf(rings: Position[][]): [number, number] {
  const lon0 = rings[0]![0]![0]!;
  const lat0 = rings[0]![0]![1]!;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const edgeDistance = ([x, y]: [number, number]) => {
    let best = Infinity;
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = [(ring[i - 1]![0]! - x) * kx, ring[i - 1]![1]! - y];
        const [bx, by] = [(ring[i]![0]! - x) * kx, ring[i]![1]! - y];
        const dx = bx - ax;
        const dy = by - ay;
        const len = dx * dx + dy * dy;
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
      }
    }
    return best;
  };
  const poly: Geometry = { type: "Polygon", coordinates: rings };
  const xs = rings[0]!.map((c) => c[0]!);
  const ys = rings[0]!.map((c) => c[1]!);
  let [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best: [number, number] = [lon0, lat0];
  let bestD = -1;
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i <= 12; i++) {
      for (let j = 0; j <= 12; j++) {
        const p: [number, number] = [w + ((e - w) * i) / 12, s + ((n - s) * j) / 12];
        if (!holds(poly, p)) continue;
        const d = edgeDistance(p);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    const [dw, dh] = [(e - w) / 6, (n - s) / 6];
    [w, e, s, n] = [best[0] - dw, best[0] + dw, best[1] - dh, best[1] + dh];
  }
  return best;
}

/** One deepest point per polygon of a fixture. */
export const polesOf = (id: string): [number, number][] => polygonsOf(borders.features[id]!).map(poleOf);
