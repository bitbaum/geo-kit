/**
 * A map on one <canvas>, without a framework: hand it the canvas, the shapes
 * and a palette, and it draws, turns, zooms and picks. One finger (or the
 * mouse) turns it, two pinch, the wheel zooms, a tap selects the feature under
 * it, a flick keeps it turning. The keyboard treats the canvas as one control:
 * arrows turn it (Shift for larger steps), + and − zoom, Home resets, Enter
 * selects the feature facing the reader.
 *
 * It draws only when something changes, so idle it costs nothing; while it
 * moves it paints the coarse shapes, and full detail the frame after. Under
 * prefers-reduced-motion a flight is a cut, a flick does not coast and the
 * idle turn never starts. A page wraps it in whatever its framework is: it
 * keeps no framework state of its own.
 */
import type { GeoProjection } from "d3-geo";
import { type Camera, type Limits, type View } from "./camera.ts";
import { type Fill, type Palette } from "./paint.ts";
import type { MapShapes } from "./shapes.ts";
import type { Basis } from "./trace.ts";
/** What a frame tells the caller's overlay. */
export interface FrameInfo {
    now: number;
    /** How far the current flight has come (0–1), or null when none. */
    flight: number | null;
    /** True while the map moves and paints its coarse shapes. */
    moving: boolean;
    /** Milliseconds since the reader last touched the map. */
    sinceTouch: number;
}
export interface MapOptions<P = Record<string, unknown>> {
    shapes: MapShapes<P>;
    palette: Palette;
    /** A colour per feature id; a feature without one is painted as land. */
    fills?: ReadonlyMap<string, Fill>;
    limits?: Limits;
    /** Where the map rests and where Home returns to. */
    home?: Camera;
    /** How close a selected feature is framed: the share of the disc it fills, and the closest zoom (default 7). */
    focusZoom?: {
        fill?: number;
        most?: number;
    };
    /** Turn slowly after a few seconds of rest, with nothing selected and zoomed out. */
    idleTurn?: boolean;
    /** A feature was tapped or chosen by keyboard; null for the sea. */
    onSelect?: (id: string | null) => void;
    /** The mouse is over a feature (null when over none, or when a gesture starts), at a canvas point. */
    onHover?: (id: string | null, x: number, y: number) => void;
    /**
     * Asked first on a tap and on hover, before the features: true when the
     * caller's own layer (a site, a marker) takes the point, so no feature is
     * selected or outlined there.
     */
    pickFirst?: (x: number, y: number, projection: GeoProjection, kind: "tap" | "hover") => boolean;
    /** The keyboard turned the map: the feature now facing the reader, or null. */
    onFacing?: (id: string | null) => void;
    /** Draw on top of the map each frame. */
    over?: (ctx: CanvasRenderingContext2D, basis: Basis, projection: GeoProjection, frame: FrameInfo) => void;
    /** True while the overlay animates and needs another frame. */
    animating?: (now: number) => boolean;
    /** True while the overlay wants the map held still (no idle turn). */
    holdStill?: () => boolean;
}
export interface MapController {
    /** Size the canvas, in CSS pixels, and the part of it nothing floats over. */
    resize(width: number, height: number, view?: View): void;
    setShapes<P>(shapes: MapShapes<P>): void;
    setFills(fills: ReadonlyMap<string, Fill>): void;
    setPalette(palette: Palette): void;
    /** Mark a feature selected; `fly` turns the map to face it. */
    setSelected(id: string | null, options?: {
        fly?: boolean;
    }): void;
    flyTo(camera: Camera, duration?: number): void;
    /** Go to a view at once, with no flight. */
    jumpTo(camera: Camera): void;
    zoomBy(factor: number | "home"): void;
    camera(): Camera;
    projection(): GeoProjection | null;
    /** Ask for a frame (the caller's overlay changed). */
    invalidate(): void;
    destroy(): void;
}
export declare function createMap<P>(canvas: HTMLCanvasElement, options: MapOptions<P>): MapController;
