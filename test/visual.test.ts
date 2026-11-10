/**
 * What the map shows, as pictures: the fixtures painted the way Solon paints
 * them (coarse Natural Earth countries under a country's fine places), with
 * the feature a tap picks highlighted. Baselines are in test/visual; a wrong
 * pick moves the highlight and a border that does not meet shows as a line
 * across a place, and either fails the comparison. Rendered in process with
 * Skia (@napi-rs/canvas), so no browser is needed.
 *
 * UPDATE_BASELINES=1 rewrites the baselines; look at them before committing.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { PNG } from "pngjs";

import {
  groupFills,
  paintMap,
  pickAt,
  pickIndex,
  projectionFor,
  shapesFromFeatures,
  type MapFeature,
  type Palette,
} from "../src/map/index.ts";
import { countries, holds, places, polesOf } from "./pick-fixtures.ts";

// paintMap makes its sphere backdrop on a document canvas.
(globalThis as { document?: unknown }).document = {
  createElement: () => createCanvas(1, 1),
};

const W = 640;
const H = 400;
const palette: Palette = {
  sphere: "#ffffff",
  land: "#e9e4d4",
  border: "#d00000",
  borderWidth: 1,
  hover: "#0044ff",
  selected: "#0044ff",
  selectedFill: "rgba(0, 68, 255, 0.28)",
};

interface Scene {
  features: MapFeature[];
  fills: Map<string, string>;
  at: [number, number];
  k: number;
}

function render({ features, fills, at, k }: Scene) {
  const shapes = shapesFromFeatures(features);
  const proj = projectionFor({ x0: 0, y0: 0, x1: W, y1: H }, { center: at, k });
  const [x, y] = proj(at)!;
  const picked = pickAt(pickIndex(shapes.features), proj, x, y);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const paint = { palette, groups: groupFills(shapes.features, fills, palette.land) };
  paintMap(ctx as never, { w: W, h: H }, proj, shapes, paint, picked ? { selected: picked } : {});
  const png = PNG.sync.read(canvas.toBuffer("image/png"));
  return { picked: picked?.id ?? null, png, proj };
}

/** Pixels that differ by more than a few levels; a little anti-aliasing noise is allowed. */
function differing(a: PNG, b: PNG): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!) > 48) n++;
  return n;
}

function matchesBaseline(name: string, png: PNG) {
  const baseline = `test/visual/${name}.png`;
  if (process.env.UPDATE_BASELINES || !existsSync(baseline)) {
    writeFileSync(baseline, PNG.sync.write(png));
    return;
  }
  const bad = differing(png, PNG.sync.read(readFileSync(baseline)));
  if (bad > W * H * 0.002) {
    mkdirSync("test/visual/actual", { recursive: true });
    writeFileSync(`test/visual/actual/${name}.png`, PNG.sync.write(png));
    assert.fail(`${name}: ${bad} pixels differ from ${baseline}; the picture it made is in test/visual/actual`);
  }
}

/** Fine places in a wash, as an app shades what it holds. */
const wash = (ids: string[], colours: string[]) => new Map(ids.map((id, i) => [id, colours[i % colours.length]!]));

const SCENES: Record<string, Scene> = {
  narva: {
    features: [...countries(["ee"]), ...places(["ee:narva-linn", "ee:narva-joesuu-linn"])],
    fills: wash(["ee:narva-linn", "ee:narva-joesuu-linn"], ["#bfd7b5", "#e6c9a8"]),
    at: [28.17, 59.395],
    k: 300,
  },
  valga: {
    features: [...countries(), ...places(["ee:valga-linn", "lv:valka"])],
    fills: wash(["ee:valga-linn", "lv:valka"], ["#bfd7b5", "#e6c9a8"]),
    at: [26.0475, 57.7777],
    k: 1500,
  },
  goerlitz: {
    features: [...countries(), ...places(["de:goerlitz", "pl:zgorzelec"])],
    fills: wash(["de:goerlitz", "pl:zgorzelec"], ["#bfd7b5", "#e6c9a8"]),
    at: [14.9886, 51.1527],
    k: 1500,
  },
  baarle: {
    features: [...countries(), ...places(["be:baarle-hertog", "nl:baarle-nassau"])],
    fills: wash(["be:baarle-hertog", "nl:baarle-nassau"], ["#e6c9a8", "#bfd7b5"]),
    at: polesOf("be:baarle-hertog")[0]!,
    k: 20000,
  },
  liechtenstein: {
    features: [...countries(["li"]), ...places(["li:vaduz", "li:schaan", "li:triesen", "li:balzers"])],
    fills: wash(["li:vaduz", "li:schaan", "li:triesen", "li:balzers"], ["#bfd7b5", "#e6c9a8", "#c9d3e8", "#e8d9a0"]),
    at: [9.5237, 47.1415],
    k: 1500,
  },
};

for (const [name, scene] of Object.entries(SCENES)) {
  test(`picture: ${name} matches its baseline and highlights the place under the tap`, () => {
    const { picked, png } = render(scene);
    assert.ok(picked && !/^\d+$/.test(picked), `${name}: the tap picked ${picked}, a place and not a coarse country`);
    matchesBaseline(name, png);
  });
}

const isBorder = (png: PNG, i: number) => png.data[i]! > 150 && png.data[i + 1]! < 70 && png.data[i + 2]! < 70;

for (const [name, scene] of Object.entries(SCENES)) {
  test(`no coarse border is stroked across the inside of a fine place: ${name}`, () => {
    const fine = scene.features.filter((f) => (f.layer ?? 0) > 0);
    const coarse = render({ ...scene, features: scene.features.filter((f) => (f.layer ?? 0) === 0), fills: new Map() });
    const full = render(scene);
    let inside = 0;
    const strokedOver: string[] = [];
    for (let y = 4; y < H - 4; y += 2)
      for (let x = 4; x < W - 4; x += 2) {
        if (!isBorder(coarse.png, (y * W + x) * 4)) continue;
        // A coarse border pixel that lies well inside one fine place (not within 3 px of its edge).
        const spots = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].map(([dx, dy]) => coarse.proj.invert!([x + dx!, y + dy!])!);
        const owner = fine.find((f) => spots.every((s) => holds(f.geometry, s as [number, number])));
        if (!owner) continue;
        inside++;
        if (isBorder(full.png, (y * W + x) * 4)) strokedOver.push(`${x},${y} in ${owner.id}`);
      }
    assert.deepEqual(strokedOver.slice(0, 5), [], `${strokedOver.length} of ${inside} coarse border pixels inside a place are stroked over it`);
  });
}
