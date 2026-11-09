/**
 * Names on the map: countries, regions and towns, placed so that none covers
 * another, and few enough that the map stays a map: a density budget caps how
 * many share the screen, each style keeps its own breathing room, nothing is
 * drawn near the globe's limb (where text smears) or outside its disc, and a
 * label placed last frame keeps its place against an equal newcomer, so
 * names do not flicker as the reader moves. The caller hands every candidate once with a rank (lower is more
 * important); each frame keeps those in front of the reader and inside their
 * zoom band, and places them most important first, so zooming in reveals
 * smaller places as room appears. A town is a dot with its name beside it,
 * tried on the right, then the left, above and below. Layout is pure (the
 * text measure is injected), so it is tested without a canvas.
 */
import { type GeoProjection } from "d3-geo";
export interface MapLabel {
    id: string;
    text: string;
    /** [lon, lat] the label names. */
    at: [number, number];
    /** Lower is more important and is placed first (default 100). */
    rank?: number;
    /** Which style draws it (default "default"). */
    kind?: string;
    /** Shown from this zoom (inclusive, default 0) … */
    minZoom?: number;
    /** … up to this one (exclusive, default no limit). */
    maxZoom?: number;
    /** A dot at the point, the name beside it (a town). Without, the name is centred on the point (a country). */
    dot?: boolean;
}
export interface LabelStyle {
    /** A canvas font, e.g. "600 13px Inter, sans-serif". */
    font: string;
    colour: string;
    /** A ring around each letter so the name reads over any fill. */
    halo: string;
    haloWidth?: number;
    /** The dot's colour, for labels with `dot`. */
    dot?: string;
    dotRadius?: number;
    uppercase?: boolean;
    /** Extra space between letters, in pixels (canvas `letterSpacing`). */
    tracking?: number;
    /** Free space kept around the name, in pixels (default 4); larger for quieter maps. */
    padding?: number;
    /** A filled box behind the name instead of a halo (a callout with a figure). */
    box?: string;
    /** A callout: the name set off from its dot, joined by a line of this colour. */
    leader?: string;
}
export type LabelStyles = Record<string, LabelStyle>;
export interface PlacedLabel {
    label: MapLabel;
    text: string;
    /** Where the text's centre is drawn. */
    x: number;
    y: number;
    /** The dot, for labels with one. */
    dot: [number, number] | null;
    box: [number, number, number, number];
    style: LabelStyle;
}
export declare const DEFAULT_LABEL_STYLES: LabelStyles;
export interface LayoutOptions {
    /** Boxes already used (a legend, a card) that no label may cover. */
    taken?: PlacedLabel["box"][];
    /** Labels placed in the previous frame: they keep their place against an equal newcomer. */
    previous?: ReadonlySet<string>;
    /** Place only these (while the map moves: no newcomers until it rests). */
    only?: ReadonlySet<string>;
    /**
     * Screen area per label, in square pixels: the budget for how many names
     * share the screen (default 9000, about 100 on a laptop's map and 20 on a
     * phone's). 0 lifts the cap.
     */
    density?: number;
    /** The globe's disc; names stay inside it when it is smaller than the canvas. */
    disc?: {
        cx: number;
        cy: number;
        r: number;
    };
}
/** Which labels are in their zoom band: the cheap filter before any projection. */
export declare function inBand(label: MapLabel, k: number): boolean;
/**
 * The labels to draw this frame, placed without overlap, most important
 * first. `measure` returns a text's width and height in pixels for a font.
 * `taken` are boxes already used (a legend, a selected place's card) that no
 * label may cover.
 */
export declare function layoutLabels(labels: readonly MapLabel[], projection: GeoProjection, k: number, size: {
    w: number;
    h: number;
}, styles: LabelStyles, measure: (text: string, style: LabelStyle) => {
    w: number;
    h: number;
}, options?: LayoutOptions | PlacedLabel["box"][]): PlacedLabel[];
/**
 * Draw placed labels: dots first, then each name over its halo or box.
 * `alpha` (per label id, 0–1) fades a name in or out; absent draws it whole.
 */
export declare function paintLabels(ctx: CanvasRenderingContext2D, placed: readonly PlacedLabel[], alpha?: ReadonlyMap<string, number>): void;
/**
 * How far each label has faded in, moved toward 1 for those placed and 0 for
 * the rest by `dt / duration`. Returns true while any is still fading.
 */
export declare function stepFades(alpha: Map<string, number>, placed: readonly PlacedLabel[], dt: number, duration?: number): boolean;
/** The label under a point, if any: its name or its dot. */
export declare function labelAt(placed: readonly PlacedLabel[], x: number, y: number): PlacedLabel | null;
/** A measure on a canvas, cached per font and text. */
export declare function canvasMeasure(ctx: CanvasRenderingContext2D): (text: string, style: LabelStyle) => {
    w: number;
    h: number;
};
