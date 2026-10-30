/**
 * Which feature is under a pixel of the map: invert the projection, then test
 * the few features whose lon/lat box holds the point.
 */
import { geoBounds, geoContains, type GeoProjection } from "d3-geo";

import type { MapFeature } from "./shapes.ts";

export interface Pickable<P = Record<string, unknown>> {
  feature: MapFeature<P>;
  /** lon/lat box; west > east when it crosses the antimeridian. */
  box: [[number, number], [number, number]];
}

export function pickIndex<P>(features: readonly MapFeature<P>[]): Pickable<P>[] {
  return features.map((feature) => ({
    feature,
    box: geoBounds({ type: "Feature", geometry: feature.geometry, properties: null }) as [
      [number, number],
      [number, number],
    ],
  }));
}

function inBox([[w, s], [e, n]]: Pickable<unknown>["box"], [lon, lat]: [number, number]): boolean {
  if (lat < s || lat > n) return false;
  return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
}

/**
 * The feature under a canvas pixel, or null for sea and the space around the
 * globe. `invert` is the projection's; off the disc it has no answer.
 */
export function pickAt<P>(
  index: readonly Pickable<P>[],
  projection: GeoProjection,
  x: number,
  y: number,
): MapFeature<P> | null {
  const [cx, cy] = projection.translate();
  const r = projection.scale();
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;
  const at = projection.invert?.([x, y]);
  if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null;
  const point: [number, number] = [at[0], at[1]];
  for (const p of index)
    if (inBox(p.box, point) && geoContains({ type: "Feature", geometry: p.feature.geometry, properties: null }, point))
      return p.feature;
  return null;
}
