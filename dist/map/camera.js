/**
 * Where the map looks, kept pure so it can be tested without a browser: where
 * the disc sits in the visible part of the canvas, the projection for a view,
 * and where to look to face a feature and how close.
 *
 * Angles are degrees. A view is the point of the Earth facing the reader
 * (`center`, [lon, lat]) and a zoom factor `k` on top of the resting radius,
 * so a sheet rising or a panel opening only moves and resizes the disc; it
 * never changes what the reader is looking at. Zoomed far in, the
 * orthographic globe is a flat map of the place in front of the reader, so
 * one projection serves the world and a commune.
 */
import { geoArea, geoCentroid, geoDistance, geoOrthographic } from "d3-geo";
import { polygonsOf } from "./shapes.js";
/** A world: the whole globe at rest, a country at most. */
export const WORLD_LIMITS = { minZoom: 0.7, maxZoom: 14, maxTilt: 75 };
/** Centre and resting radius of the globe in the visible part of the canvas. */
export function disc(view) {
    const w = Math.max(view.x1 - view.x0, 1);
    const h = Math.max(view.y1 - view.y0, 1);
    // Room around the limb for the atmosphere; a phone's strip above a sheet is
    // short and wide, so the height decides there.
    const radius = Math.max(Math.min(w, h) / 2 - Math.min(28, Math.min(w, h) * 0.08), 8);
    return { cx: view.x0 + w / 2, cy: view.y0 + h / 2, radius, short: Math.min(w, h) };
}
export const clampZoom = (k, limits = WORLD_LIMITS) => Math.min(limits.maxZoom, Math.max(limits.minZoom, k));
export const clampTilt = (lat, limits = WORLD_LIMITS) => Math.min(limits.maxTilt, Math.max(-limits.maxTilt, lat));
/** Longitude folded into (-180, 180]. */
export function wrapLon(lon) {
    const x = (((lon + 180) % 360) + 360) % 360;
    return x === 0 ? 180 : x - 180;
}
/** The d3 rotation that turns `center` to face the reader. */
export function rotationOf(center) {
    return [-center[0], -center[1], 0];
}
export function projectionFor(view, camera) {
    const d = disc(view);
    return (geoOrthographic()
        .clipAngle(90)
        // No adaptive resampling: boundary vertices are already closer than it would add.
        .precision(0)
        .translate([d.cx, d.cy])
        .scale(d.radius * camera.k)
        .rotate(rotationOf(camera.center)));
}
/**
 * The part of a feature to frame: its largest pieces, up to three quarters of
 * its area. The whole outline is wrong for the features that matter most: the
 * United States would be framed with Alaska and Hawaii (a view of the Pacific),
 * France with Guiana, Norway with Svalbard.
 */
export function mainland(geometry) {
    const parts = polygonsOf(geometry)
        .map((coordinates) => ({ coordinates, area: geoArea({ type: "Polygon", coordinates }) }))
        .sort((a, b) => b.area - a.area);
    const total = parts.reduce((s, p) => s + p.area, 0);
    const kept = [];
    let sum = 0;
    for (const p of parts) {
        kept.push(p.coordinates);
        sum += p.area;
        if (sum >= total * 0.75)
            break;
    }
    return kept;
}
/**
 * Where to look to face a feature, and how much of the sphere it spans.
 * Spherical throughout (geoCentroid, geoDistance), so Russia, Fiji and the
 * United States, which cross the antimeridian, need no special case.
 */
export function focusOf(geometry) {
    const parts = mainland(geometry);
    if (parts.length === 0)
        return null;
    const [lon, lat] = geoCentroid({ type: "MultiPolygon", coordinates: parts });
    const center = [lon, lat];
    let reach = 0;
    for (const polygon of parts)
        for (const point of polygon[0] ?? [])
            reach = Math.max(reach, geoDistance(center, [point[0] ?? 0, point[1] ?? 0]));
    return { center, reach: (reach * 180) / Math.PI };
}
/**
 * The zoom that fits a feature of angular `reach` in the disc. A point `r°`
 * from the centre of an orthographic view lies `R·sin r` from its middle, so
 * the feature fills `sin(reach)` of the radius at k = 1. Small features stop
 * at `most` rather than filling the screen with one island.
 */
export function zoomFor(reach, { fill = 0.6, most = 7 } = {}) {
    const r = Math.min(Math.max(reach, 0.0001), 90);
    const k = fill / Math.sin((r * Math.PI) / 180);
    return Math.min(Math.max(k, 1), most);
}
/** The camera that faces a feature, or null when it has no area. */
export function cameraFor(geometry, limits = WORLD_LIMITS, zoom = {}) {
    const focus = focusOf(geometry);
    if (!focus)
        return null;
    const k = zoomFor(focus.reach, { most: Math.min(7, limits.maxZoom), ...zoom });
    return { center: [focus.center[0], clampTilt(focus.center[1], limits)], k: clampZoom(k, limits) };
}
/** The camera that faces a lon/lat box [west, south, east, north]. */
export function cameraForBounds([w, s, e, n], limits = WORLD_LIMITS, fill = 0.8) {
    const east = e < w ? e + 360 : e;
    const center = [wrapLon((w + east) / 2), (s + n) / 2];
    const reach = Math.max(...[
        [w, s],
        [w, n],
        [east, s],
        [east, n],
    ].map((p) => (geoDistance(center, [p[0] ?? 0, p[1] ?? 0]) * 180) / Math.PI));
    return {
        center: [center[0], clampTilt(center[1], limits)],
        k: clampZoom(zoomFor(reach, { fill, most: limits.maxZoom }), limits),
    };
}
