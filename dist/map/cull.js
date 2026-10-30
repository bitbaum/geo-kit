/**
 * What is on the far side of the globe need not be drawn. Each country and
 * each border line carries a cap — the smallest circle on the sphere, around
 * its centre, that holds every vertex — and a frame streams only the ones
 * whose cap reaches over the horizon. Half the world is skipped at rest, far
 * more when zoomed in. Pure, so the horizon maths is tested.
 */
import { geoCentroid, geoDistance } from "d3-geo";
const DEG = 180 / Math.PI;
function eachPosition(coords, fn) {
    if (!Array.isArray(coords))
        return;
    if (typeof coords[0] === "number")
        return fn(coords);
    for (const c of coords)
        eachPosition(c, fn);
}
export function capOf(shape) {
    const [lon, lat] = geoCentroid(shape);
    const center = Number.isFinite(lon) ? [lon, lat] : [0, 0];
    let reach = 0;
    eachPosition(shape.coordinates, (p) => {
        reach = Math.max(reach, geoDistance(center, [p[0] ?? 0, p[1] ?? 0]));
    });
    // A shape whose centroid is meaningless (a ring around a pole) is never culled.
    return { center, reach: Number.isFinite(lon) ? reach * DEG : 180 };
}
/**
 * How far from the centre of view, in degrees, anything can still be seen on
 * this canvas: the hemisphere when the whole disc fits, less when the globe
 * is zoomed past the canvas edges.
 */
export function horizonOf(proj, size) {
    const [cx, cy] = proj.translate();
    const r = proj.scale();
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(size.w - cx, cy), Math.hypot(cx, size.h - cy), Math.hypot(size.w - cx, size.h - cy));
    return far >= r ? 90 : Math.asin(far / r) * DEG;
}
/** The point of the Earth at the centre of an orthographic projection. */
export function centreOf(proj) {
    const [l, p] = proj.rotate();
    return [-l, -p];
}
export function visible(cap, centre, horizon) {
    return geoDistance(centre, cap.center) * DEG - cap.reach < horizon + 1;
}
