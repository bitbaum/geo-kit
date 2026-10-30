import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { geoDistance } from "d3-geo";
import type { Topology } from "topojson-specification";

import {
  WORLD_LIMITS,
  basisOf,
  cameraFor,
  cameraForBounds,
  centreOf,
  coast,
  disc,
  dragged,
  flight,
  focusOf,
  groupFills,
  horizonOf,
  pack,
  pickAt,
  pickIndex,
  project,
  projectionFor,
  shapesFromFeatures,
  shapesFromTopology,
  traceLine,
  traceRing,
  visible,
  wrapLon,
  zoomFor,
  type Camera,
  type View,
} from "../src/map/index.ts";

// Natural Earth 1:50m, as world-atlas publishes it: ISO 3166-1 numeric ids.
const topo = JSON.parse(readFileSync("node_modules/world-atlas/countries-50m.json", "utf8")) as Topology;
const world = shapesFromTopology<{ name: string }>(topo, {
  object: "countries",
  idOf: (f) => (f.id === undefined ? null : String(f.id)),
});
const ISO = { ru: "643", us: "840", fr: "250", no: "578", fj: "242", in: "356", ch: "756", au: "036" };
const country = (code: keyof typeof ISO) => {
  const i = world.index.get(ISO[code]);
  assert.ok(i !== undefined, `${code} is on the map`);
  return world.features[i]!;
};
const HOME: Camera = { center: [30, 18], k: 1 };

// A 390px phone: the strip between the bar and the half sheet.
const phone: View = { x0: 0, y0: 66, x1: 390, y1: 318 };

test("the globe sits centred in the visible part, with room for its glow", () => {
  const d = disc(phone);
  assert.equal(d.cx, 195);
  assert.equal(d.cy, 192);
  assert.ok(d.radius < (318 - 66) / 2, "inside the strip");
  assert.ok(d.radius > (318 - 66) / 2 - 30, "but not shrunk for nothing");
});

test("a feature is faced by its mainland: Russia, the lower 48, France in Europe, Norway without Svalbard", () => {
  const ru = focusOf(country("ru").geometry)!;
  assert.ok(ru.center[0] > 60 && ru.center[0] < 120 && ru.center[1] > 50 && ru.center[1] < 70);
  assert.ok(ru.reach < 45, `Russia reach ${ru.reach}`);
  const us = focusOf(country("us").geometry)!;
  assert.ok(us.center[0] > -110 && us.center[0] < -85 && us.reach < 30, JSON.stringify(us));
  assert.ok(focusOf(country("fr").geometry)!.reach < 10);
  const no = focusOf(country("no").geometry)!;
  assert.ok(no.center[1] < 68 && no.reach < 15, JSON.stringify(no));
});

test("Fiji, astride the date line, is faced at the date line and zoomed in close", () => {
  const { center, reach } = focusOf(country("fj").geometry)!;
  assert.ok(Math.abs(center[0]) > 175, `lon ${center[0]}`);
  assert.ok(center[1] < -15 && center[1] > -20, `lat ${center[1]}`);
  assert.ok(reach < 3, `reach ${reach}`);
  assert.ok(cameraFor(country("fj").geometry)!.k > 5);
});

test("zoom fits the feature, and stops at the limit the map was given", () => {
  assert.equal(zoomFor(90), 1);
  assert.ok(zoomFor(30) > 1.1 && zoomFor(30) < 1.3);
  assert.equal(zoomFor(0.01), 7);
  assert.ok(cameraFor(country("ru").geometry)!.k < cameraFor(country("in").geometry)!.k);
  // A commune of a few kilometres, on a map that may zoom that far.
  const commune = { type: "Polygon" as const, coordinates: [[[8.5, 47.35], [8.5, 47.4], [8.6, 47.4], [8.6, 47.35], [8.5, 47.35]]] };
  const limits = { ...WORLD_LIMITS, maxZoom: 2000 };
  const close = cameraFor(commune, limits, { most: 2000 })!;
  assert.ok(close.k > 300, `k ${close.k}`);
  assert.ok(cameraFor(commune)!.k <= 7, "a world map stops at its own limit");
  const swiss = cameraForBounds([5.96, 45.82, 10.49, 47.81], limits);
  assert.ok(Math.abs(swiss.center[0] - 8.2) < 0.1 && swiss.k > 10, JSON.stringify(swiss));
});

test("a flight takes the short way across the date line, and zooms on a log scale", () => {
  const f = flight({ center: [170, -15], k: 3 }, { center: [-170, -14], k: 3 });
  assert.ok(Math.abs(f.at(0.5).center[0]) > 175, "not round the world");
  assert.deepEqual(f.at(1).center.map((v) => Math.round(v)), [-170, -14]);
  const deep = flight({ center: [8, 47], k: 1 }, { center: [8, 47], k: 1000 }, { ...WORLD_LIMITS, maxZoom: 2000 });
  const mid = deep.at(0.5).k;
  assert.ok(mid > 20 && mid < 60, `half way from 1 to 1000 is about 32, not 500: ${mid}`);
});

test("a long flight pulls back mid-way; a short one does not", () => {
  const long = flight({ center: [0, 0], k: 3 }, { center: [150, 20], k: 3 });
  assert.ok(long.at(0.5).k < 2.5);
  const short = flight({ center: [0, 0], k: 3 }, { center: [10, 0], k: 3 });
  assert.ok(Math.abs(short.at(0.5).k - 3) < 0.01);
  assert.ok(long.duration > short.duration);
});

test("a drag turns the land under the finger with it, and north stays within the tilt", () => {
  const r = disc(phone).radius;
  assert.ok(dragged(HOME, 50, 0, r).center[0] < HOME.center[0], "dragging right brings the west into view");
  assert.equal(dragged(HOME, 0, 5000, r).center[1], WORLD_LIMITS.maxTilt);
  assert.equal(wrapLon(190), -170);
  assert.equal(wrapLon(-180), 180);
});

test("a flick coasts in its direction and comes to rest", () => {
  let step = coast(HOME, { vx: 1, vy: 0 }, 16, 200);
  assert.ok(step.camera.center[0] < HOME.center[0]);
  let frames = 1;
  while (step.spin && frames < 1000) {
    step = coast(step.camera, step.spin, 16, 200);
    frames++;
  }
  assert.equal(step.spin, undefined);
  assert.ok(frames > 20 && frames < 200, `rests after ${frames} frames`);
});

test("a tap picks the feature under it, and nothing off the disc or on the far side", () => {
  const index = pickIndex(world.features);
  const land: Partial<Record<keyof typeof ISO, [number, number]>> = {
    ru: [100, 62],
    us: [-100, 40],
    fj: [178, -17.8],
    in: [78, 22],
    ch: [8.2, 46.8],
  };
  for (const [code, point] of Object.entries(land) as [keyof typeof ISO, [number, number]][]) {
    const proj = projectionFor(phone, cameraFor(country(code).geometry)!);
    const [x, y] = proj(point)!;
    assert.equal(pickAt(index, proj, x, y)?.id, ISO[code], `tap on ${code}`);
  }
  const proj = projectionFor(phone, { center: [0, 0], k: 1 });
  assert.equal(pickAt(index, proj, 2, 70), null, "the corner of the canvas is space");
  const behind = proj([135, -25]);
  assert.ok(!behind || pickAt(index, proj, behind[0], behind[1])?.id !== ISO.au);
});

test("the coarse shapes painted in motion are the same features, lighter, still meeting at borders", () => {
  const count = (g: unknown): number =>
    Array.isArray(g) ? (typeof g[0] === "number" ? 1 : g.reduce((n: number, x) => n + count(x), 0)) : 0;
  const vertices = (s: { features: typeof world.features }) => s.features.reduce((n, f) => n + count((f.geometry as { coordinates: unknown }).coordinates), 0);
  assert.deepEqual(world.coarse.features.map((f) => f.id), world.features.map((f) => f.id));
  assert.ok(vertices(world.coarse) < vertices(world) * 0.45);
  const ru = world.coarse.features[world.coarse.index.get(ISO.ru)!]!;
  assert.ok(focusOf(ru.geometry)!.reach < 45, "Russia's coarse outline still covers its mainland, not the ocean");
});

test("the far side is culled, and nothing with a vertex in view ever is", () => {
  const canvas = { w: 390, h: 724 };
  for (const cam of [
    { center: [0, 0] as [number, number], k: 1 },
    { center: [178, -17] as [number, number], k: 1 },
    { center: [-100, 40] as [number, number], k: 4 },
    { center: [8, 47] as [number, number], k: 7 },
  ]) {
    const proj = projectionFor(phone, cam);
    const horizon = horizonOf(proj, canvas);
    const centre = centreOf(proj);
    let culled = 0;
    world.features.forEach((f, i) => {
      const shown = visible(world.caps[i]!, centre, horizon);
      if (!shown) culled++;
      const inView = (JSON.stringify(f.geometry).match(/-?[\d.e-]+,-?[\d.e-]+/g) ?? []).some((p) => {
        const point = p.split(",").map(Number) as [number, number];
        if (geoDistance(centre, point) >= Math.PI / 2) return false;
        const [x, y] = proj(point)!;
        return x >= 0 && x <= canvas.w && y >= 0 && y <= canvas.h;
      });
      if (inView) assert.ok(shown, `${f.properties.name} is in view from ${cam.center} but culled`);
    });
    assert.ok(culled > world.features.length * 0.15, `only ${culled} culled from ${cam.center}`);
  }
  assert.equal(horizonOf(projectionFor(phone, HOME), canvas), 90);
});

test("the fast projection draws exactly what d3 draws, on the front of the globe", () => {
  for (const cam of [HOME, { center: [178, -17] as [number, number], k: 3 }, { center: [8.5, 47.4] as [number, number], k: 900 }]) {
    const proj = projectionFor(phone, cam);
    const [cx, cy] = proj.translate();
    const b = basisOf(cam.center, cx, cy, proj.scale());
    for (const [lon, lat] of [[0, 0], [30, 18], [179.9, -16.5], [-100, 40], [8.51, 47.37], [8.6, 47.41]] as [number, number][]) {
      const [x, y, depth] = project(b, lon, lat);
      if (depth <= 0) continue;
      const [dx, dy] = proj([lon, lat])!;
      assert.ok(Math.abs(x - dx) < 1e-6 && Math.abs(y - dy) < 1e-6, `${lon},${lat} from ${cam.center}`);
    }
  }
});

test("behind the globe a ring is pulled onto the limb and a line breaks", () => {
  const b = basisOf([0, 0], 100, 100, 50);
  const calls: string[] = [];
  const at: [number, number][] = [];
  const pen = {
    moveTo: (x: number, y: number) => (calls.push("M"), at.push([x, y])),
    lineTo: (x: number, y: number) => (calls.push("L"), at.push([x, y])),
    closePath: () => calls.push("Z"),
  };
  traceRing(pen, pack([[60, 0], [150, 0], [150, 10], [60, 10]]), b);
  assert.deepEqual(calls, ["M", "L", "L", "L", "Z"]);
  for (const [x, y] of at.slice(1, 3)) assert.ok(Math.abs(Math.hypot(x - 100, y - 100) - 50) < 1e-9);
  calls.length = 0;
  traceLine(pen, pack([[60, 0], [80, 0], [150, 0], [170, 0], [-80, 0], [-60, 0]]), b);
  assert.deepEqual(calls, ["M", "L", "M", "L"]);
});

test("planar GeoJSON wound the other way round is put right, and its borders are its rings", () => {
  // Counter-clockwise, as RFC 7946 and most national files wind it: to d3 that
  // is everything but the square, unless it is rewound.
  const ccw = [[[8, 47], [9, 47], [9, 48], [8, 48], [8, 47]]];
  const shapes = shapesFromFeatures([{ id: "a", geometry: { type: "Polygon", coordinates: ccw }, properties: {} }]);
  const focus = focusOf(shapes.features[0]!.geometry)!;
  assert.ok(focus.reach < 1, `the square, not the world: reach ${focus.reach}`);
  assert.equal(shapes.borders.coordinates.length, 1);
  assert.equal(shapes.coarse.features, shapes.features, "painted in motion as they are");
});

test("fills are one path per colour, the plain land first", () => {
  const groups = groupFills(
    [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }].map((f) => ({ ...f, geometry: { type: "Point" as const, coordinates: [0, 0] }, properties: {} })),
    new Map([["b", "#f00"], ["c", "#00f"], ["d", "#f00"]]),
    "#ccc",
  );
  assert.deepEqual(groups, [["#ccc", [0]], ["#f00", [1, 3]], ["#00f", [2]]]);
});
