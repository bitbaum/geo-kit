/**
 * Which feature is under a pixel of the map: invert the projection, then test
 * the few features whose lon/lat box holds the point.
 */
import { geoBounds, geoContains } from "d3-geo";
export function pickIndex(features) {
    return features.map((feature) => ({
        feature,
        box: geoBounds({ type: "Feature", geometry: feature.geometry, properties: null }),
    }));
}
function inBox([[w, s], [e, n]], [lon, lat]) {
    if (lat < s || lat > n)
        return false;
    return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
}
/**
 * The feature under a canvas pixel, or null for sea and the space around the
 * globe. `invert` is the projection's; off the disc it has no answer.
 */
export function pickAt(index, projection, x, y) {
    const [cx, cy] = projection.translate();
    const r = projection.scale();
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r)
        return null;
    const at = projection.invert?.([x, y]);
    if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1]))
        return null;
    const point = [at[0], at[1]];
    for (const p of index)
        if (inBox(p.box, point) && geoContains({ type: "Feature", geometry: p.feature.geometry, properties: null }, point))
            return p.feature;
    return null;
}
