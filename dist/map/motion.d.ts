import { type Camera, type Limits } from "./camera.ts";
/**
 * Turning the globe by a drag of (dx, dy) pixels: the land under the finger
 * follows it at the centre of the disc, whatever the zoom. North stays up.
 */
export declare function dragged(camera: Camera, dx: number, dy: number, radius: number, limits?: Limits): Camera;
export interface Flight {
    at: (t: number) => Camera;
    /** Milliseconds: longer the farther it turns, never a slog. */
    duration: number;
}
/**
 * From one view to another along the great circle (the short way round, so
 * Fiji to Samoa crosses the date line instead of circling the globe), pulling
 * back mid-way on a long turn so the reader sees where they are going. The
 * zoom moves on a log scale, so a flight from the world to a commune does not
 * spend its first half barely zooming.
 */
export declare function flight(from: Camera, to: Camera, limits?: Limits): Flight;
/** A flick: px/ms along each axis, carried on after the finger lifts. */
export interface Spin {
    vx: number;
    vy: number;
}
/** One frame of coasting: turn by the velocity, then let it decay. */
export declare function coast(camera: Camera, spin: Spin, dt: number, radius: number, limits?: Limits): {
    camera: Camera;
    spin?: Spin;
};
