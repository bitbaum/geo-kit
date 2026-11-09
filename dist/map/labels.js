/**
 * Names on the map: countries, regions and towns, placed so that none covers
 * another. The caller hands every candidate once with a rank (lower is more
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
const PAD = 3;
/** A label this far round the globe from the centre is on the far side or at the edge, where it cannot be read. */
const FRONT = (Math.PI / 2) * 0.94;
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
export function layoutLabels(labels, projection, k, size, styles, measure, taken = []) {
    const rot = projection.rotate();
    const centre = [-rot[0], -rot[1]];
    const candidates = labels
        .filter((l) => inBand(l, k))
        .sort((a, b) => (a.rank ?? 100) - (b.rank ?? 100) || a.text.localeCompare(b.text));
    const boxes = [...taken];
    const placed = [];
    for (const label of candidates) {
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
        const r = label.dot ? (style.dotRadius ?? 2.5) : 0;
        const tries = label.dot
            ? [
                [px + r + 4 + w / 2, py],
                [px - r - 4 - w / 2, py],
                [px, py - r - 3 - h / 2],
                [px, py + r + 3 + h / 2],
            ]
            : [[px, py]];
        for (const [x, y] of tries) {
            const box = [x - w / 2 - PAD, y - h / 2 - PAD, x + w / 2 + PAD, y + h / 2 + PAD];
            if (box[0] < 0 || box[2] > size.w || box[1] < 0 || box[3] > size.h)
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
/** Draw placed labels: dots first, then each name over a halo. */
export function paintLabels(ctx, placed) {
    ctx.save();
    for (const p of placed) {
        if (!p.dot)
            continue;
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
        ctx.font = p.style.font;
        if ("letterSpacing" in ctx)
            ctx.letterSpacing = `${p.style.tracking ?? 0}px`;
        ctx.lineWidth = p.style.haloWidth ?? 3;
        ctx.strokeStyle = p.style.halo;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.style.colour;
        ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
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
