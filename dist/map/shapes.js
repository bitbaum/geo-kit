/**
 * What a map draws, prepared once: each feature keyed by its id, wound the
 * way d3's spherical geometry needs, its far-side cap (cull.ts) and its rings
 * as unit vectors (trace.ts); every shared border once, so the outline is one
 * stroke, not one per feature. A coarse copy, the same features in the same
 * order, is painted while the map moves so a drag stays inside a phone's
 * frame budget; the frame after it stops is full detail again.
 *
 * Country-neutral: the features are whatever the caller loaded (countries,
 * cantons, communes), keyed by whatever id the caller's data uses.
 */
import { geoArea } from "d3-geo";
import { feature as topoFeature, mesh } from "topojson-client";
import { capOf } from "./cull.js";
import { pack } from "./trace.js";
export function polygonsOf(g) {
    if (g.type === "Polygon")
        return [g.coordinates];
    if (g.type === "MultiPolygon")
        return g.coordinates;
    return [];
}
/**
 * d3-geo is spherical: a ring wound the "wrong" way encloses the rest of the
 * globe, so one bad polygon floods the ocean with that feature's colour.
 * Simplification leaves a few such rings, and planar data (most national
 * boundary files) is wound the other way throughout; a polygon covering more
 * than a hemisphere is one of them, and reversing its rings puts it right.
 */
export function rewound(g) {
    const fix = (rings) => {
        const area = geoArea({ type: "Polygon", coordinates: rings });
        return area > 2 * Math.PI ? rings.map((ring) => [...ring].reverse()) : rings;
    };
    if (g.type === "Polygon")
        return { ...g, coordinates: fix(g.coordinates) };
    if (g.type === "MultiPolygon")
        return { ...g, coordinates: g.coordinates.map(fix) };
    return g;
}
/** Prepare features and their shared borders for painting. */
export function shapesOf(features, borders) {
    const kept = features.map((f) => ({ ...f, geometry: rewound(f.geometry) }));
    return {
        features: kept,
        index: new Map(kept.map((f, i) => [f.id, i])),
        borders,
        caps: kept.map((f) => capOf(f.geometry)),
        lineCaps: borders.coordinates.map((line) => capOf({ type: "LineString", coordinates: line })),
        rings: kept.map((f) => polygonsOf(f.geometry).flat().map(pack)),
        lines: borders.coordinates.map(pack),
    };
}
/**
 * Every `every`-th vertex of each arc, ends kept. Thinning the topology's arcs
 * rather than each feature's rings keeps a shared border shared: neighbours
 * still meet exactly, with no slivers between them.
 */
export function coarsened(topo, every) {
    const t = topo.transform;
    const arcs = topo.arcs.map((arc) => {
        let x = 0;
        let y = 0;
        const absolute = t
            ? arc.map(([dx = 0, dy = 0]) => {
                x += dx;
                y += dy;
                return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]];
            })
            : arc;
        return absolute.filter((_, i) => i % every === 0 || i === absolute.length - 1);
    });
    return { ...topo, transform: undefined, arcs };
}
function fromTopology(topo, options) {
    const object = topo.objects[options.object];
    if (!object)
        throw new Error(`topology has no object "${options.object}"`);
    const collection = topoFeature(topo, object);
    const features = collection.features.flatMap((f) => {
        const id = options.idOf(f);
        return id === null || !f.geometry ? [] : [{ id, geometry: f.geometry, properties: f.properties }];
    });
    return shapesOf(features, mesh(topo, object));
}
/** Shapes from one object of a TopoJSON topology, with its coarse copy. */
export function shapesFromTopology(topo, options) {
    const every = options.coarseEvery ?? 3;
    return {
        ...fromTopology(topo, options),
        coarse: fromTopology(every > 1 ? coarsened(topo, every) : topo, options),
    };
}
/**
 * Shapes from GeoJSON features, whose borders are their rings (a feature
 * collection carries no shared arcs). Painted in motion as they are.
 */
export function shapesFromFeatures(features) {
    const borders = {
        type: "MultiLineString",
        coordinates: features.flatMap((f) => polygonsOf(f.geometry).flat()),
    };
    const shapes = shapesOf(features, borders);
    return { ...shapes, coarse: shapes };
}
