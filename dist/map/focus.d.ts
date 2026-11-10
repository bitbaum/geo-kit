/**
 * Which place a map is about, and what that means for what it shows: the rule
 * every place map shares, kept in one pure state machine so an app cannot get
 * it wrong.
 *
 * Choosing a place (a tap on it, a search result, a link) does four things and
 * never anything else:
 *
 * 1. it becomes the **focus** and the **selection**: the card names it and
 *    offers "Open it";
 * 2. the camera frames **its own outline**: never a child's, never the bounds
 *    of whatever happens to be drawn inside it (a country of which one
 *    province has boundaries is still framed as the whole country). Only a
 *    place with no outline of its own is framed by what is inside it;
 * 3. its **children** are the places drawn and tappable, and its own outline
 *    is drawn with them, so the place stays visible as a whole;
 * 4. the places above it are the **context**, drawn faintly.
 *
 * Nothing jumps to a child that was not chosen. `up()` is the same choice made
 * on the parent. The machine knows no country, level or framework: the tree is
 * three functions the app supplies.
 */
import type { Camera } from "./camera.ts";
export interface FocusTree {
    /** The camera that faces a place's own outline, or null when it has none drawn. */
    cameraOf(id: string): Camera | null;
    /** The camera that faces the places inside it, used only when it has no outline of its own. */
    childrenCameraOf?(id: string): Camera | null;
    /** The places directly inside it that the map can draw, in any order. */
    childrenOf(id: string): readonly string[];
    /** The place it is part of; null at the top. */
    parentOf(id: string): string | null;
    /** Where the map rests when nothing is chosen. */
    home: Camera;
}
export interface FocusView {
    /** The place the map is about; null at the top (the world). */
    focus: string | null;
    /** The place the card is about: the focus. */
    selected: string | null;
    /** The camera to fly to; null when the view should stay where it is. */
    camera: Camera | null;
    /** The focus's own outline, always drawn whole. Null at the top. */
    outline: string | null;
    /** The places inside it that are drawn and tappable. */
    children: readonly string[];
    /** The places above it, nearest first, drawn faintly. */
    context: readonly string[];
}
/** Pure: the view after choosing `id` (null chooses the top: the world). */
export declare function choose(tree: FocusTree, id: string | null): FocusView;
/** Pure: the view after going up one place: the parent chosen, or the top. */
export declare const up: (tree: FocusTree, from: string | null) => FocusView;
export interface FocusController {
    readonly view: FocusView;
    /** Choose a place. Returns the new view, and tells the listener. */
    choose(id: string | null): FocusView;
    /** Choose the place above the focus, or the top. */
    up(): FocusView;
}
/** The state machine: holds the current view and tells `onChange` after each choice. */
export declare function createFocus(tree: FocusTree, onChange?: (view: FocusView) => void): FocusController;
