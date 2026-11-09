import assert from "node:assert/strict";
import test from "node:test";

import { inBand, labelAt, layoutLabels, projectionFor, type LabelStyles, type MapLabel } from "../src/map/index.ts";

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
