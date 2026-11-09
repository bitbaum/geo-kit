import assert from "node:assert/strict";
import test from "node:test";

import { inBand, labelAt, layoutLabels, projectionFor, stepFades, type LabelStyles, type MapLabel } from "../src/map/index.ts";

const size = { w: 800, h: 600 };
const view = { x0: 0, y0: 0, x1: 800, y1: 600 };
const styles: LabelStyles = {
  default: { font: "12px x", colour: "#000", halo: "#fff" },
  town: { font: "11px x", colour: "#000", halo: "#fff", dotRadius: 3 },
};
// Every letter 7 pixels wide, 14 high: a deterministic stand-in for a canvas.
const measure = (text: string) => ({ w: text.length * 7, h: 14 });
const at = (center: [number, number], k: number) => projectionFor(view, { center, k });

test("a label is shown only within its zoom band", () => {
  const l: MapLabel = { id: "a", text: "A", at: [0, 0], minZoom: 2, maxZoom: 8 };
  assert.equal(inBand(l, 1.9), false);
  assert.equal(inBand(l, 2), true);
  assert.equal(inBand(l, 8), false);
  assert.equal(inBand({ id: "b", text: "B", at: [0, 0] }, 0.5), true);
});

test("labels on the far side of the globe are not drawn", () => {
  const placed = layoutLabels(
    [
      { id: "near", text: "Bern", at: [7.4, 46.9] },
      { id: "far", text: "Wellington", at: [174.8, -41.3] },
    ],
    at([8, 46], 1),
    1,
    size,
    styles,
    measure,
  );
  assert.deepEqual(
    placed.map((p) => p.label.id),
    ["near"],
  );
});

test("the more important of two overlapping labels wins, whatever order they come in", () => {
  const labels: MapLabel[] = [
    { id: "small", text: "Köniz", at: [7.41, 46.92], rank: 50 },
    { id: "capital", text: "Bern", at: [7.44, 46.95], rank: 1 },
  ];
  const placed = layoutLabels(labels, at([7.4, 46.9], 1), 1, size, styles, measure);
  assert.deepEqual(
    placed.map((p) => p.label.id),
    ["capital"],
  );
});

test("zooming in makes room: both appear once they are far enough apart on screen", () => {
  const labels: MapLabel[] = [
    { id: "a", text: "Bern", at: [7.44, 46.95], rank: 1, dot: true, kind: "town" },
    { id: "b", text: "Köniz", at: [7.41, 46.92], rank: 2, dot: true, kind: "town" },
  ];
  assert.equal(layoutLabels(labels, at([7.4, 46.9], 1), 1, size, styles, measure).length, 1);
  assert.equal(layoutLabels(labels, at([7.4, 46.9], 400), 400, size, styles, measure).length, 2);
});

test("a town's name moves to the left when the right is taken, and never leaves the canvas", () => {
  const p = at([0, 0], 1);
  const [x] = p([0, 0])!;
  const placed = layoutLabels(
    [{ id: "t", text: "Edge", at: [0, 0], dot: true, kind: "town" }],
    p,
    1,
    size,
    styles,
    measure,
    [[x + 6, 0, 800, 600]],
  );
  assert.equal(placed.length, 1);
  assert.ok(placed[0]!.x < x, "placed on the left");
  for (const q of placed) assert.ok(q.box[0] >= 0 && q.box[2] <= size.w);
});

test("a tap on a town's dot or its name finds it", () => {
  const placed = layoutLabels(
    [{ id: "t", text: "Vaduz", at: [9.52, 47.14], dot: true, kind: "town" }],
    at([9.5, 47.1], 50),
    50,
    size,
    styles,
    measure,
  );
  const [only] = placed;
  assert.ok(only?.dot);
  assert.equal(labelAt(placed, only.dot[0], only.dot[1])?.label.id, "t");
  assert.equal(labelAt(placed, only.x, only.y)?.label.id, "t");
  assert.equal(labelAt(placed, 1, 1), null);
});

test("a density budget caps how many names share the screen, keeping the most important", () => {
  const many: MapLabel[] = Array.from({ length: 60 }, (_, i) => ({
    id: `t${i}`,
    text: "X",
    at: [-20 + (i % 10) * 4, -10 + Math.floor(i / 10) * 4] as [number, number],
    rank: i,
  }));
  const placed = layoutLabels(many, at([0, 0], 2), 2, size, styles, measure, { density: 40000 });
  assert.equal(placed.length, Math.floor((800 * 600) / 40000));
  assert.deepEqual(
    placed.map((p) => p.label.id),
    placed.map((p) => p.label.id).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
  );
});

test("a name shown last frame keeps its place against an equal newcomer", () => {
  const twins: MapLabel[] = [
    { id: "a", text: "Alpha", at: [7.44, 46.95], rank: 5 },
    { id: "b", text: "Bravo", at: [7.45, 46.95], rank: 5 },
  ];
  const p = at([7.4, 46.9], 1);
  assert.equal(layoutLabels(twins, p, 1, size, styles, measure)[0]!.label.id, "a");
  assert.equal(layoutLabels(twins, p, 1, size, styles, measure, { previous: new Set(["b"]) })[0]!.label.id, "b");
});

test("while the reader steers, only names already on screen are placed", () => {
  const labels: MapLabel[] = [
    { id: "kept", text: "Bern", at: [7.44, 46.95] },
    { id: "new", text: "Zürich", at: [8.54, 47.37] },
  ];
  const placed = layoutLabels(labels, at([8, 47], 30), 30, size, styles, measure, { only: new Set(["kept"]) });
  assert.deepEqual(placed.map((q) => q.label.id), ["kept"]);
});

test("names stay inside the globe's disc and away from its limb", () => {
  const p = at([0, 0], 0.5);
  const [cx, cy] = p.translate();
  const placed = layoutLabels(
    [
      { id: "middle", text: "Middle", at: [0, 0] },
      { id: "limb", text: "Limb", at: [80, 0] },
    ],
    p,
    0.5,
    size,
    styles,
    measure,
    { disc: { cx, cy, r: p.scale() } },
  );
  assert.deepEqual(placed.map((q) => q.label.id), ["middle"]);
});

test("names fade in and out over the duration, and stop asking for frames when done", () => {
  const alpha = new Map<string, number>();
  const one = layoutLabels([{ id: "a", text: "A", at: [0, 0] }], at([0, 0], 1), 1, size, styles, measure);
  assert.equal(stepFades(alpha, one, 130, 260), true);
  assert.equal(alpha.get("a"), 0.5);
  assert.equal(stepFades(alpha, one, 200, 260), false);
  assert.equal(alpha.get("a"), 1);
  assert.equal(stepFades(alpha, [], 130, 260), true);
  assert.equal(stepFades(alpha, [], 200, 260), false);
  assert.equal(alpha.has("a"), false);
});

test("a feature on a higher layer never shares a path with the one under it", async () => {
  const { groupFills } = await import("../src/map/index.ts");
  const square = (x: number) => ({
    type: "Polygon" as const,
    coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]],
  });
  const groups = groupFills(
    [
      { id: "country", geometry: square(0), properties: {} },
      { id: "province", geometry: square(0), properties: {}, layer: 1 },
      { id: "shaded", geometry: square(2), properties: {} },
    ],
    new Map([["shaded", "#f00"]]),
    "#eee",
  );
  assert.deepEqual(groups, [
    ["#eee", [0]],
    ["#f00", [2]],
    ["#eee", [1]],
  ]);
});
