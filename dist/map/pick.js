/**
 * Which feature is under a pixel of the map: invert the projection, then test
 * the few features whose lon/lat box holds the point, topmost first.
 *
 * "Topmost" is the order the map paints in, reversed: the highest `layer`
 * (a commune lies over its country), and on one layer the smallest area (an
 * enclave lies over what encloses it; the order within a layer is the
 * caller's colour grouping, not a stacking). Where two features of one layer
 * still tie, the one listed later wins. The country that happens to be listed
 * first never takes a tap that lies inside a place drawn over it.
 */
import { geoArea, geoBounds, geoContains } from "d3-geo";
/** The features ready to be picked, in picking order: topmost first. */
export function pickIndex(features) {
    return features
        .map((feature, order) => {
        const shape = { type: "Feature", geometry: feature.geometry, properties: null };
        return {
            order,
            feature,
            layer: feature.layer ?? 0,
            area: geoArea(shape),
            box: geoBounds(shape),
        };
    })
        .sort((a, b) => b.layer - a.layer || a.area - b.area || b.order - a.order)
        .map(({ order: _, ...pickable }) => pickable);
}
function inBox([[w, s], [e, n]], [lon, lat]) {
    if (lat < s || lat > n)
        return false;
    return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
}
/** The lon/lat under a canvas pixel, or null off the disc (where the projection has no answer). */
function lonLatAt(projection, x, y) {
    const [cx, cy] = projection.translate();
    const r = projection.scale();
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r)
        return null;
    const at = projection.invert?.([x, y]);
    if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1]))
        return null;
    return [at[0], at[1]];
}
const holds = (p, point) => inBox(p.box, point) && geoContains({ type: "Feature", geometry: p.feature.geometry, properties: null }, point);
/**
 * The feature under a canvas pixel, or null for sea and the space around the
 * globe. `invert` is the projection's; off the disc it has no answer.
 */
export function pickAt(index, projection, x, y) {
    const point = lonLatAt(projection, x, y);
    if (!point)
        return null;
    for (const p of index)
        if (holds(p, point))
            return p.feature;
    return null;
}
/**
 * Every feature that holds the pixel, topmost first: the commune, then its
 * province, then its country, and for land more than one authority claims,
 * each claimant. Empty for sea and the space around the globe.
 */
export function pickAllAt(index, projection, x, y) {
    const point = lonLatAt(projection, x, y);
    return point ? index.filter((p) => holds(p, point)).map((p) => p.feature) : [];
}
