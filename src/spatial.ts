import type { GeographyBounds } from "./types.ts";

export function isWgs84Bounds(value: unknown): value is GeographyBounds {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return false;
  const [west, south, east, north] = value as number[];
  return west! >= -180 && west! <= 180 && east! >= -180 && east! <= 180 &&
    south! >= -90 && north! <= 90 && south! <= north!;
}

/** Inclusive intersections: touching edges and either spelling of the date line overlap. */
export function intersectsGeographyBounds(a: GeographyBounds, b: GeographyBounds): boolean {
  if (a[1] > b[3] || b[1] > a[3]) return false;
  const longitudeIntervals = ([west, , east]: GeographyBounds): [number, number][] => {
    const intervals: [number, number][] = west <= east ? [[west, east]] : [[west, 180], [-180, east]];
    if (west === -180) intervals.push([180, 180]);
    if (east === 180) intervals.push([-180, -180]);
    return intervals;
  };
  return longitudeIntervals(a).some(([west, east]) =>
    longitudeIntervals(b).some(([otherWest, otherEast]) => west <= otherEast && otherWest <= east),
  );
}
