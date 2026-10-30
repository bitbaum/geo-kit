/**
 * How the map moves, pure so it can be tested: a drag turns it, a flight
 * carries it from one view to another the short way round, and a flick keeps
 * it turning for a moment after release.
 */
import { geoDistance, geoInterpolate } from "d3-geo";
import { WORLD_LIMITS, clampTilt, wrapLon } from "./camera.js";
/**
 * Turning the globe by a drag of (dx, dy) pixels: the land under the finger
 * follows it at the centre of the disc, whatever the zoom. North stays up.
 */
export function dragged(camera, dx, dy, radius, limits = WORLD_LIMITS) {
    const perPixel = 180 / (Math.PI * radius * camera.k);
    // Near the poles a pixel is more longitude; ease it so a drag there does not whip.
    const lonScale = 1 / Math.max(Math.cos((camera.center[1] * Math.PI) / 180), 0.35);
    return {
        center: [
            wrapLon(camera.center[0] - dx * perPixel * Math.min(lonScale, 2)),
            clampTilt(camera.center[1] + dy * perPixel, limits),
        ],
        k: camera.k,
    };
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/**
 * From one view to another along the great circle (the short way round, so
 * Fiji to Samoa crosses the date line instead of circling the globe), pulling
 * back mid-way on a long turn so the reader sees where they are going. The
 * zoom moves on a log scale, so a flight from the world to a commune does not
 * spend its first half barely zooming.
 */
export function flight(from, to, limits = WORLD_LIMITS) {
    const arc = (geoDistance(from.center, to.center) * 180) / Math.PI;
    const along = geoInterpolate(from.center, to.center);
    const pull = Math.min(Math.max((arc - 30) / 150, 0), 0.45);
    const lk0 = Math.log(from.k);
    const lk1 = Math.log(to.k);
    return {
        duration: Math.round(450 + Math.min(arc, 180) * 4 + Math.min(Math.abs(lk1 - lk0), 6) * 60),
        at(t) {
            const e = ease(Math.min(Math.max(t, 0), 1));
            const [lon = 0, lat = 0] = along(e);
            const k = Math.exp(lk0 + (lk1 - lk0) * e);
            const dip = 1 - pull * Math.sin(Math.PI * e);
            return {
                center: [wrapLon(lon), clampTilt(lat, limits)],
                k: Math.max(k * dip, limits.minZoom),
            };
        },
    };
}
/** One frame of coasting: turn by the velocity, then let it decay. */
export function coast(camera, spin, dt, radius, limits = WORLD_LIMITS) {
    const next = dragged(camera, spin.vx * dt, spin.vy * dt, radius, limits);
    const decay = Math.exp(-dt / 325);
    const left = { vx: spin.vx * decay, vy: spin.vy * decay };
    return { camera: next, spin: Math.hypot(left.vx, left.vy) < 0.01 ? undefined : left };
}
