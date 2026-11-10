import assert from "node:assert/strict";
import test from "node:test";

import { choose, createFocus, up, type Camera, type FocusTree, type FocusView } from "../src/map/index.ts";

const cam = (lon: number, k: number): Camera => ({ center: [lon, 0], k });
const HOME = cam(8, 1);

// A world of made-up places: a country with three provinces, one of which has
// two districts; only one province has an outline of its own drawn.
const parents: Record<string, string | null> = {
  land: null,
  north: "land",
  south: "land",
  coast: "land",
  hill: "north",
  dale: "north",
};
const outlines: Record<string, Camera | null> = {
  land: cam(10, 2),
  north: cam(20, 4),
  south: null,
  coast: null,
  hill: cam(21, 8),
  dale: null,
};
const tree: FocusTree = {
  cameraOf: (id) => outlines[id] ?? null,
  childrenCameraOf: (id) => (id === "south" ? cam(30, 6) : null),
  childrenOf: (id) => Object.keys(parents).filter((c) => parents[c] === id),
  parentOf: (id) => parents[id] ?? null,
  home: HOME,
};

test("choosing a place frames its own outline and selects it", () => {
  const v = choose(tree, "land");
  assert.deepEqual(v.camera, cam(10, 2));
  assert.equal(v.focus, "land");
  assert.equal(v.selected, "land");
  assert.equal(v.outline, "land");
});

test("a country of which only one province is drawn is still framed as the whole country", () => {
  // `north` has an outline and `south` has none: the camera is the land's, not north's.
  const v = choose(tree, "land");
  assert.deepEqual(v.camera, outlines.land);
  assert.notDeepEqual(v.camera, outlines.north);
  assert.deepEqual([...v.children].sort(), ["coast", "north", "south"]);
});

test("its children are the places drawn, and its own outline is drawn with them", () => {
  const v = choose(tree, "north");
  assert.deepEqual([...v.children].sort(), ["dale", "hill"]);
  assert.equal(v.outline, "north");
  assert.ok(!v.children.includes("north"));
});

test("the places above it are the context, nearest first", () => {
  assert.deepEqual(choose(tree, "hill").context, ["north", "land"]);
  assert.deepEqual(choose(tree, "land").context, []);
});

test("a place with no outline of its own is framed by what is inside it, and only then", () => {
  assert.deepEqual(choose(tree, "south").camera, null, "south has no children and no outline: stay put");
  const withKids: FocusTree = { ...tree, childrenOf: (id) => (id === "south" ? ["x"] : tree.childrenOf(id)) };
  assert.deepEqual(choose(withKids, "south").camera, cam(30, 6));
  assert.deepEqual(choose(withKids, "north").camera, cam(20, 4), "an outline always wins over its children");
});

test("a place with no outline and nothing inside leaves the camera where it is", () => {
  assert.equal(choose(tree, "coast").camera, null);
});

test("choosing the top is the world, resting at home, with nothing drawn", () => {
  const v = choose(tree, null);
  assert.deepEqual(v, { focus: null, selected: null, camera: HOME, outline: null, children: [], context: [] });
});

test("up is the same choice made on the parent, and the world above a top-level place", () => {
  assert.deepEqual(up(tree, "hill"), choose(tree, "north"));
  assert.deepEqual(up(tree, "land"), choose(tree, null));
  assert.deepEqual(up(tree, null), choose(tree, null));
});

test("nothing jumps to a child that was not chosen", () => {
  const seen: FocusView[] = [];
  const focus = createFocus(tree, (v) => seen.push(v));
  focus.choose("land");
  focus.choose("land");
  assert.ok(seen.every((v) => v.focus === "land" && v.selected === "land"));
  assert.ok(seen.every((v) => JSON.stringify(v.camera) === JSON.stringify(cam(10, 2))));
});

test("the controller holds the view, tells the listener, and goes up", () => {
  const seen: (string | null)[] = [];
  const focus = createFocus(tree, (v) => seen.push(v.focus));
  assert.equal(focus.view.focus, null);
  focus.choose("hill");
  assert.equal(focus.view.focus, "hill");
  focus.up();
  assert.equal(focus.view.focus, "north");
  focus.up();
  focus.up();
  assert.equal(focus.view.focus, null);
  assert.deepEqual(seen, ["hill", "north", "land", null]);
});

test("a parent loop in the data cannot hang the context", () => {
  const looped: FocusTree = { ...tree, parentOf: (id) => (id === "a" ? "b" : "a") };
  assert.ok(choose(looped, "a").context.length <= 32);
});

test("hatch makes no pattern where there is no canvas", async () => {
  const { hatch } = await import("../src/map/index.ts");
  assert.equal(hatch("#000"), null);
});
