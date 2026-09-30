export function isWgs84Bounds(value) {
    if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite))
        return false;
    const [west, south, east, north] = value;
    return west >= -180 && west <= 180 && east >= -180 && east <= 180 &&
        south >= -90 && north <= 90 && south <= north;
}
/** Inclusive intersections: touching edges and either spelling of the date line overlap. */
export function intersectsGeographyBounds(a, b) {
    if (a[1] > b[3] || b[1] > a[3])
        return false;
    const longitudeIntervals = ([west, , east]) => {
        const intervals = west <= east ? [[west, east]] : [[west, 180], [-180, east]];
        if (west === -180)
            intervals.push([180, 180]);
        if (east === 180)
            intervals.push([-180, -180]);
        return intervals;
    };
    return longitudeIntervals(a).some(([west, east]) => longitudeIntervals(b).some(([otherWest, otherEast]) => west <= otherEast && otherWest <= east));
}
