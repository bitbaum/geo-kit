const MAX_DEPTH = 32;
/** Pure: the view after choosing `id` (null chooses the top: the world). */
export function choose(tree, id) {
    if (id === null) {
        return { focus: null, selected: null, camera: tree.home, outline: null, children: [], context: [] };
    }
    const context = [];
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
export const up = (tree, from) => choose(tree, from === null ? null : tree.parentOf(from));
/** The state machine: holds the current view and tells `onChange` after each choice. */
export function createFocus(tree, onChange) {
    let view = choose(tree, null);
    const set = (next) => {
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
