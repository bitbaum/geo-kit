/**
 * Names on the map: countries, regions and towns, placed so that none covers
 * another, and few enough that the map stays a map: a density budget caps how
 * many share the screen, each style keeps its own breathing room, nothing is
 * drawn near the globe's limb (where text smears) or outside its disc, and a
 * label placed last frame keeps its place against an equal newcomer, so
 * names do not flicker as the reader moves. The caller hands every candidate once with a rank (lower is more
 * important); each frame keeps those in front of the reader and inside their
 * zoom band, and places them most important first, so zooming in reveals
 * smaller places as room appears. A town is a dot with its name beside it,
 * tried on the right, then the left, above and below. Layout is pure (the
 * text measure is injected), so it is tested without a canvas.
 */
import { geoDistance } from "d3-geo";
export const DEFAULT_LABEL_STYLES = {
    default: { font: "500 12px system-ui, sans-serif", colour: "#1f2328", halo: "rgba(255,255,255,0.9)", haloWidth: 3 },
};
/** Past this angle from the centre a name is too foreshortened to read: the far side and the limb. */
const FRONT = (Math.PI / 2) * 0.82;
/** Keep names this far inside the canvas. */
const EDGE = 6;
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
/** Which labels are in their zoom band: the cheap filter before any projection. */
export function inBand(label, k) {
    return k >= (label.minZoom ?? 0) && k < (label.maxZoom ?? Infinity);
}
/**
 * The labels to draw this frame, placed without overlap, most important
 * first. `measure` returns a text's width and height in pixels for a font.
 * `taken` are boxes already used (a legend, a selected place's card) that no
 * label may cover.
 */
export function layoutLabels(labels, projection, k, size, styles, measure, options = {}) {
    const o = Array.isArray(options) ? { taken: options } : options;
    const rot = projection.rotate();
    const centre = [-rot[0], -rot[1]];
    const previous = o.previous ?? new Set();
    // A label shown last frame wins ties and near-ties (half a rank), so names hold still.
    const order = (l) => (l.rank ?? 100) - (previous.has(l.id) ? 0.5 : 0);
    const candidates = labels
        .filter((l) => inBand(l, k) && (!o.only || o.only.has(l.id)))
        .sort((a, b) => order(a) - order(b) || a.text.localeCompare(b.text));
    const budget = (o.density ?? 9000) > 0 ? Math.max(4, Math.floor((size.w * size.h) / (o.density ?? 9000))) : Infinity;
    const boxes = [...(o.taken ?? [])];
    const placed = [];
    const inDisc = (x, y) => !o.disc || Math.hypot(x - o.disc.cx, y - o.disc.cy) <= o.disc.r * 0.96;
    for (const label of candidates) {
        if (placed.length >= budget)
            break;
        if (geoDistance(centre, label.at) > FRONT)
            continue;
        const p = projection(label.at);
        if (!p)
            continue;
        const [px, py] = p;
        if (px < 0 || py < 0 || px > size.w || py > size.h)
            continue;
        const style = styles[label.kind ?? "default"] ?? styles.default ?? DEFAULT_LABEL_STYLES.default;
        const text = style.uppercase ? label.text.toLocaleUpperCase() : label.text;
        const { w, h } = measure(text, style);
        const r = label.dot ? (style.dotRadius ?? 2.5) + (style.leader ? 10 : 0) : 0;
        const tries = label.dot
            ? [
                [px + r + 4 + w / 2, py],
                [px - r - 4 - w / 2, py],
                [px, py - r - 3 - h / 2],
                [px, py + r + 3 + h / 2],
            ]
            : [[px, py]];
        const pad = style.padding ?? 4;
        for (const [x, y] of tries) {
            const box = [x - w / 2 - pad, y - h / 2 - pad, x + w / 2 + pad, y + h / 2 + pad];
            if (box[0] < EDGE || box[2] > size.w - EDGE || box[1] < EDGE || box[3] > size.h - EDGE)
                continue;
            if (!inDisc(x - w / 2, y - h / 2) || !inDisc(x + w / 2, y + h / 2) || !inDisc(x - w / 2, y + h / 2) || !inDisc(x + w / 2, y - h / 2))
                continue;
            const dotBox = label.dot ? [px - r - 1, py - r - 1, px + r + 1, py + r + 1] : null;
            if (boxes.some((b) => overlaps(b, box) || (dotBox !== null && overlaps(b, dotBox))))
                continue;
            boxes.push(box);
            if (dotBox)
                boxes.push(dotBox);
            placed.push({ label, text, x, y, dot: label.dot ? [px, py] : null, box, style });
            break;
        }
    }
    return placed;
}
/**
 * Draw placed labels: dots first, then each name over its halo or box.
 * `alpha` (per label id, 0–1) fades a name in or out; absent draws it whole.
 */
export function paintLabels(ctx, placed, alpha) {
    const a = (p) => alpha?.get(p.label.id) ?? 1;
    ctx.save();
    for (const p of placed) {
        if (!p.dot || a(p) <= 0)
            continue;
        ctx.globalAlpha = a(p);
        if (p.style.leader) {
            ctx.beginPath();
            ctx.moveTo(p.dot[0], p.dot[1]);
            ctx.lineTo(p.x < p.dot[0] ? p.box[2] : p.box[0], p.y);
            ctx.strokeStyle = p.style.leader;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(p.dot[0], p.dot[1], p.style.dotRadius ?? 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.style.dot ?? p.style.colour;
        ctx.fill();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = p.style.halo;
        ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const p of placed) {
        if (a(p) <= 0)
            continue;
        ctx.globalAlpha = a(p);
        ctx.font = p.style.font;
        if ("letterSpacing" in ctx)
            ctx.letterSpacing = `${p.style.tracking ?? 0}px`;
        if (p.style.box) {
            const pad = Math.min(p.style.padding ?? 4, 5);
            ctx.fillStyle = p.style.box;
            ctx.fillRect(p.box[0] + (p.style.padding ?? 4) - pad, p.box[1] + (p.style.padding ?? 4) - pad, p.box[2] - p.box[0] - 2 * ((p.style.padding ?? 4) - pad), p.box[3] - p.box[1] - 2 * ((p.style.padding ?? 4) - pad));
        }
        else {
            ctx.lineWidth = p.style.haloWidth ?? 3;
            ctx.strokeStyle = p.style.halo;
            ctx.strokeText(p.text, p.x, p.y);
        }
        ctx.fillStyle = p.style.colour;
        ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
}
/**
 * How far each label has faded in, moved toward 1 for those placed and 0 for
 * the rest by `dt / duration`. Returns true while any is still fading.
 */
export function stepFades(alpha, placed, dt, duration = 260) {
    const shown = new Set(placed.map((p) => p.label.id));
    const step = duration > 0 ? dt / duration : 1;
    let fading = false;
    for (const id of shown) {
        const was = alpha.get(id) ?? 0;
        const next = Math.min(1, was + step);
        alpha.set(id, next);
        if (next < 1)
            fading = true;
    }
    for (const [id, was] of alpha) {
        if (shown.has(id))
            continue;
        const next = was - step;
        if (next <= 0)
            alpha.delete(id);
        else {
            alpha.set(id, next);
            fading = true;
        }
    }
    return fading;
}
/** The label under a point, if any: its name or its dot. */
export function labelAt(placed, x, y) {
    for (let i = placed.length - 1; i >= 0; i--) {
        const p = placed[i];
        const [x0, y0, x1, y1] = p.box;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1)
            return p;
        if (p.dot && Math.hypot(x - p.dot[0], y - p.dot[1]) <= (p.style.dotRadius ?? 2.5) + 6)
            return p;
    }
    return null;
}
/** A measure on a canvas, cached per font and text. */
export function canvasMeasure(ctx) {
    const cache = new Map();
    return (text, style) => {
        const key = `${style.font}|${style.tracking ?? 0}|${text}`;
        let m = cache.get(key);
        if (!m) {
            ctx.save();
            ctx.font = style.font;
            if ("letterSpacing" in ctx)
                ctx.letterSpacing = `${style.tracking ?? 0}px`;
            const metrics = ctx.measureText(text);
            ctx.restore();
            const size = Number(/(\d+(?:\.\d+)?)px/.exec(style.font)?.[1] ?? 12);
            m = { w: metrics.width, h: size * 1.2 };
            if (cache.size > 5000)
                cache.clear();
            cache.set(key, m);
        }
        return m;
    };
}
