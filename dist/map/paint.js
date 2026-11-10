/**
 * Painting the map on a canvas: the fills grouped so each colour is one path,
 * and one frame drawn: atmosphere and lit sphere, graticule, land, borders,
 * limb shade, the hover and selection outlines, then whatever the caller
 * draws over it (sites, routes, figures). Every layer but the land and its
 * borders is optional, so the same painter draws a lit globe of the world and
 * a plain map of communes where the data is the picture.
 */
import { geoGraticule10, geoPath } from "d3-geo";
import { centreOf, horizonOf, visible } from "./cull.js";
import { basisOf, pack, traceLine, traceRing } from "./trace.js";
const FULL = Math.PI * 2;
/**
 * Any CSS colour at an alpha, for gradients that fade without greying. The
 * canvas normalises the colour first: a build may minify `#000000` to `#000`,
 * and a token could as well be `rgb()`.
 */
export function fade(colour, a) {
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe)
        return colour;
    probe.fillStyle = "#000";
    probe.fillStyle = colour;
    const norm = String(probe.fillStyle);
    const hex = /^#([0-9a-f]{6})$/i.exec(norm);
    if (hex?.[1]) {
        const n = parseInt(hex[1], 16);
        return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
    }
    const rgba = /^rgba?\(([^,]+),([^,]+),([^,)]+)/.exec(norm.replace(/\s/g, ""));
    return rgba ? `rgba(${rgba[1]},${rgba[2]},${rgba[3]},${a})` : colour;
}
/**
 * A diagonal hatch as a fill, for land more than one authority claims: the
 * colour says where, the hatch says that it is not settled, so colour is never
 * the only carrier. `stripe` is the line colour, `gap` the pixels between
 * lines (default 6), `width` the line width (default 1.5). Null where there is
 * no canvas to make a pattern with (a server).
 */
export function hatch(stripe, { gap = 6, width = 1.5, background } = {}) {
    if (typeof document === "undefined")
        return null;
    const tile = document.createElement("canvas");
    tile.width = tile.height = gap;
    const ctx = tile.getContext("2d");
    if (!ctx)
        return null;
    if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, gap, gap);
    }
    ctx.strokeStyle = stripe;
    ctx.lineWidth = width;
    ctx.beginPath();
    // Three segments, so the stripe is unbroken across the tile's edges.
    ctx.moveTo(-1, gap + 1);
    ctx.lineTo(gap + 1, -1);
    ctx.moveTo(-1, 1);
    ctx.lineTo(1, -1);
    ctx.moveTo(gap - 1, gap + 1);
    ctx.lineTo(gap + 1, gap - 1);
    ctx.stroke();
    return ctx.createPattern(tile, "repeat");
}
/**
 * The fills as one entry per colour and layer: a path per colour, not per
 * feature. Layers are painted bottom first; within one, the features with no
 * fill come first, so a coloured feature's edge is never painted over, then
 * each colour in the order the caller's map first names it. As indexes, so
 * the full and the coarse shapes share it.
 */
export function groupFills(features, fills, land) {
    const layers = [...new Set(features.map((f) => f.layer ?? 0))].sort((a, b) => a - b);
    const out = [];
    for (const layer of layers) {
        const groups = new Map();
        groups.set(land, []);
        for (const fill of fills.values())
            if (!groups.has(fill))
                groups.set(fill, []);
        features.forEach((f, i) => {
            if ((f.layer ?? 0) === layer)
                groups.get(fills.get(f.id) ?? land).push(i);
        });
        for (const entry of groups)
            if (entry[1].length > 0)
                out.push(entry);
    }
    return out;
}
const GRATICULE = geoGraticule10().coordinates.map(pack);
function blit(ctx, layer) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
}
/**
 * Atmosphere and sphere (under the land) and the limb shade (over it) do not
 * turn with the Earth: render them once per disc and blit them, instead of
 * full-disc gradients every frame.
 */
function backdrop(paint, target, cx, cy, r, size) {
    const key = [target.width, target.height, cx, cy, r].map((n) => n.toFixed(1)).join();
    if (paint.backdrop?.key === key)
        return paint.backdrop;
    const { palette } = paint;
    const scale = target.width / size.w;
    const layer = (draw) => {
        const canvas = document.createElement("canvas");
        canvas.width = target.width;
        canvas.height = target.height;
        const c = canvas.getContext("2d");
        if (c) {
            c.setTransform(scale, 0, 0, scale, 0, 0);
            draw(c);
        }
        return canvas;
    };
    const disc = (c, radius, fill) => {
        c.fillStyle = fill;
        c.beginPath();
        c.arc(cx, cy, radius, 0, FULL);
        c.fill();
    };
    const under = layer((c) => {
        if (palette.glow && r < Math.hypot(size.w, size.h)) {
            const glow = c.createRadialGradient(cx, cy, r * 0.97, cx, cy, r * 1.12);
            glow.addColorStop(0, palette.glow[0]);
            glow.addColorStop(1, palette.glow[1]);
            disc(c, r * 1.12, glow);
        }
        if (palette.sphereLight) {
            // The sphere, lit from the upper left.
            const sea = c.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.05, cx, cy, r);
            sea.addColorStop(0, palette.sphereLight);
            sea.addColorStop(1, palette.sphere);
            disc(c, r, sea);
        }
        else
            disc(c, r, palette.sphere);
    });
    const over = layer((c) => {
        if (!palette.limb)
            return;
        const limb = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
        limb.addColorStop(0, palette.limb[0]);
        limb.addColorStop(1, palette.limb[1]);
        disc(c, r, limb);
    });
    paint.backdrop = { key, under, over };
    return paint.backdrop;
}
/** One frame, in CSS pixels (the caller has set the device-pixel transform). */
export function paintMap(ctx, size, proj, shapes, paint, marks = {}, over) {
    const { palette, groups } = paint;
    const [cx, cy] = proj.translate();
    const r = proj.scale();
    ctx.clearRect(0, 0, size.w, size.h);
    const { under, over: shade } = backdrop(paint, ctx.canvas, cx, cy, r, size);
    blit(ctx, under);
    const centre = centreOf(proj);
    const horizon = horizonOf(proj, size);
    const basis = basisOf(centre, cx, cy, r);
    if (palette.graticule) {
        ctx.beginPath();
        for (const line of GRATICULE)
            traceLine(ctx, line, basis);
        ctx.strokeStyle = palette.graticule;
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
    // Layer by layer, each layer's fills and then its borders: a layer over another covers the
    // lines under it, so a coarse neighbour's outline never runs across the fine places drawn over it.
    const layerOf = (members) => shapes.features[members[0]]?.layer ?? 0;
    const layers = [...new Set([...groups.map(([, members]) => layerOf(members)), ...shapes.lineLayers])].sort((a, b) => a - b);
    for (const layer of layers) {
        for (const [fill, members] of groups) {
            if (layerOf(members) !== layer)
                continue;
            ctx.beginPath();
            for (const i of members)
                if (visible(shapes.caps[i], centre, horizon))
                    for (const ring of shapes.rings[i])
                        traceRing(ctx, ring, basis);
            ctx.fillStyle = fill;
            ctx.fill("evenodd");
        }
        ctx.beginPath();
        shapes.lines.forEach((line, i) => {
            if (shapes.lineLayers[i] === layer && visible(shapes.lineCaps[i], centre, horizon))
                traceLine(ctx, line, basis);
        });
        ctx.strokeStyle = palette.border;
        ctx.lineWidth = palette.borderWidth ?? 0.6;
        ctx.lineJoin = "round";
        ctx.stroke();
    }
    blit(ctx, shade);
    const path = geoPath(proj, ctx);
    const outline = (f, width, colour, wash) => {
        if (!f)
            return;
        const feature = { type: "Feature", geometry: f.geometry, properties: null };
        ctx.beginPath();
        path(feature);
        if (wash) {
            ctx.fillStyle = wash;
            ctx.fill("evenodd");
        }
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.stroke();
        // Too small to see at this zoom: ring it.
        const [[x0, y0], [x1, y1]] = path.bounds(feature);
        if (Number.isFinite(x0) && Math.max(x1 - x0, y1 - y0) < 10) {
            ctx.beginPath();
            ctx.arc((x0 + x1) / 2, (y0 + y1) / 2, 11, 0, FULL);
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    };
    if (marks.hover !== marks.selected)
        outline(marks.hover, 1.25, palette.hover, palette.hoverFill);
    outline(marks.selected, 2, palette.selected, palette.selectedFill);
    over?.(ctx, basis, proj);
}
