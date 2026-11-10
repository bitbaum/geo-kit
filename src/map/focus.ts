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

const MAX_DEPTH = 32;

/** Pure: the view after choosing `id` (null chooses the top: the world). */
export function choose(tree: FocusTree, id: string | null): FocusView {
  if (id === null) {
    return { focus: null, selected: null, camera: tree.home, outline: null, children: [], context: [] };
  }
  const context: string[] = [];
  for (let up = tree.parentOf(id); up !== null && context.length < MAX_DEPTH; up = tree.parentOf(up)) {
    context.push(up);
  }
  const children = tree.childrenOf(id);
  return {
    focus: id,
    selected: id,
    camera: tree.cameraOf(id) ?? (children.length > 0 ? (tree.childrenCameraOf?.(id) ?? null) : null),
    outline: id,
    children,
    context,
  };
}

/** Pure: the view after going up one place: the parent chosen, or the top. */
export const up = (tree: FocusTree, from: string | null): FocusView =>
  choose(tree, from === null ? null : tree.parentOf(from));

export interface FocusController {
  readonly view: FocusView;
  /** Choose a place. Returns the new view, and tells the listener. */
  choose(id: string | null): FocusView;
  /** Choose the place above the focus, or the top. */
  up(): FocusView;
}

/** The state machine: holds the current view and tells `onChange` after each choice. */
export function createFocus(tree: FocusTree, onChange?: (view: FocusView) => void): FocusController {
  let view = choose(tree, null);
  const set = (next: FocusView) => {
    view = next;
    onChange?.(view);
    return view;
  };
  return {
    get view() {
      return view;
    },
    choose: (id) => set(choose(tree, id)),
    up: () => set(up(tree, view.focus)),
  };
}
