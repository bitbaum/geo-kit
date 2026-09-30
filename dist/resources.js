import { GeographyError } from "./errors.js";
import { isISODate, isPlainObject, periodContains, validateGeographyManifest, validateGeometry } from "./validation.js";
export function selectGeographyResources(manifest, request) {
    const manifestProblems = validateGeographyManifest(manifest);
    if (manifestProblems.length) {
        throw new GeographyError("invalid_manifest", manifestProblems.slice(0, 8).join("; "));
    }
    if (!isISODate(request.asOf))
        throw new GeographyError("invalid_manifest", "asOf must be a real ISO date");
    const geographyIds = new Set(request.geographyIds ?? []);
    const resourceIds = new Set(request.resourceIds ?? []);
    if (geographyIds.size === 0 && resourceIds.size === 0) {
        throw new GeographyError("selection_required", "request at least one geographyId or resourceId");
    }
    const kindKeys = request.kindKeys ? new Set(request.kindKeys) : null;
    const levelKeys = request.levelKeys ? new Set(request.levelKeys) : null;
    if (request.zoom !== undefined && (!Number.isFinite(request.zoom) || request.zoom < 0 || request.zoom > 30)) {
        throw new GeographyError("invalid_manifest", "zoom must be between 0 and 30");
    }
    const selected = manifest.resources.filter((resource) => {
        if (resourceIds.size > 0 && !resourceIds.has(resource.id))
            return false;
        if (geographyIds.size > 0 && !geographyIds.has(resource.geographyId))
            return false;
        if (kindKeys && !kindKeys.has(resource.kindKey))
            return false;
        if (levelKeys && !levelKeys.has(resource.levelKey))
            return false;
        if (!periodContains(resource.validFrom, resource.validTo, request.asOf))
            return false;
        if (request.viewpointKey === undefined && resource.viewpointKey !== null)
            return false;
        if (request.viewpointKey !== undefined && request.viewpointKey !== "all" &&
            resource.viewpointKey !== null && resource.viewpointKey !== request.viewpointKey)
            return false;
        if (request.zoom !== undefined &&
            ((resource.minZoom !== undefined && request.zoom < resource.minZoom) ||
                (resource.maxZoom !== undefined && request.zoom >= resource.maxZoom)))
            return false;
        return true;
    });
    const maxResources = request.maxResources ?? 128;
    const maxBytes = request.maxBytes ?? 32 * 1024 * 1024;
    if (!Number.isSafeInteger(maxResources) || maxResources < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
        throw new GeographyError("invalid_manifest", "selection limits must be positive safe integers");
    }
    if (selected.length > maxResources) {
        throw new GeographyError("selection_limit", `selection has ${selected.length} resources; limit is ${maxResources}`);
    }
    const total = selected.reduce((sum, resource) => sum + resource.byteSize, 0);
    if (!Number.isSafeInteger(total) || total > maxBytes) {
        throw new GeographyError("selection_limit", `selection is ${total} bytes; limit is ${maxBytes}`);
    }
    return selected.sort((a, b) => lexical(a.geographyId, b.geographyId) ||
        lexical(a.kindKey, b.kindKey) ||
        lexical(a.levelKey, b.levelKey) ||
        lexical(a.id, b.id));
}
function lexical(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** Verify the declared digest, exact decoded size, JSON shape, and feature count. */
export async function verifyGeographyResource(resource, bytes) {
    if (bytes.byteLength !== resource.byteSize) {
        throw new GeographyError("invalid_resource", `resource ${resource.id} has ${bytes.byteLength} bytes; expected ${resource.byteSize}`);
    }
    const digest = await sha256Hex(bytes);
    if (digest !== resource.sha256.toLowerCase()) {
        throw new GeographyError("invalid_resource", `resource ${resource.id} failed its SHA-256 check`);
    }
    let decoded;
    try {
        decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    }
    catch {
        throw new GeographyError("invalid_resource", `resource ${resource.id} is not valid UTF-8 JSON`);
    }
    const problems = resource.format === "geojson"
        ? validateFeatureCollection(decoded)
        : validateTopology(decoded);
    if (problems.length) {
        throw new GeographyError("invalid_resource", `resource ${resource.id}: ${problems.slice(0, 8).join("; ")}`);
    }
    const actualCount = resource.format === "geojson"
        ? decoded.features.length
        : countTopoFeatures(decoded);
    if (actualCount !== resource.featureCount) {
        throw new GeographyError("invalid_resource", `resource ${resource.id} has ${actualCount} features; expected ${resource.featureCount}`);
    }
    return decoded;
}
function validateFeatureCollection(value) {
    if (!isPlainObject(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
        return ["expected a GeoJSON FeatureCollection"];
    }
    const problems = [];
    for (const [i, feature] of value.features.entries()) {
        if (!isPlainObject(feature) || feature.type !== "Feature" || !("geometry" in feature)) {
            problems.push(`features[${i}] is not a GeoJSON Feature`);
        }
        else if (feature.geometry === null) {
            problems.push(`features[${i}] has no geometry`);
        }
        else {
            problems.push(...validateGeometry(feature.geometry, 2_000_000).map((problem) => `features[${i}].${problem}`));
        }
        if (isPlainObject(feature) && feature.properties !== null && !isPlainObject(feature.properties)) {
            problems.push(`features[${i}].properties must be an object or null`);
        }
        if (problems.length >= 40)
            break;
    }
    return problems;
}
function validateTopology(value) {
    if (!isPlainObject(value) || value.type !== "Topology" || !Array.isArray(value.arcs) || !isPlainObject(value.objects)) {
        return ["expected a TopoJSON Topology with arcs and objects"];
    }
    const topology = value;
    const problems = [];
    const transform = topology.transform;
    const hasValidTransform = transform === undefined || (!isPlainObject(transform) || !Array.isArray(transform.scale) || !Array.isArray(transform.translate) ||
        transform.scale.length !== 2 || transform.translate.length !== 2 ||
        ![...transform.scale, ...transform.translate].every(Number.isFinite)) === false;
    if (!hasValidTransform) {
        problems.push("transform must contain finite two-dimensional scale and translate values");
    }
    for (const [i, rawArc] of topology.arcs.entries()) {
        if (!Array.isArray(rawArc) || rawArc.length < 2) {
            problems.push(`arcs[${i}] needs at least two positions`);
            continue;
        }
        let x = 0;
        let y = 0;
        for (const [j, rawPosition] of rawArc.entries()) {
            if (!Array.isArray(rawPosition) || rawPosition.length < 2 || !rawPosition.every(Number.isFinite)) {
                problems.push(`arcs[${i}][${j}] must contain finite coordinates`);
                break;
            }
            if (transform && hasValidTransform) {
                x += rawPosition[0];
                y += rawPosition[1];
                const lon = x * transform.scale[0] + transform.translate[0];
                const lat = y * transform.scale[1] + transform.translate[1];
                if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                    problems.push(`arcs[${i}][${j}] decodes outside WGS84 bounds`);
                    break;
                }
            }
            else if (rawPosition[0] < -180 || rawPosition[0] > 180 || rawPosition[1] < -90 || rawPosition[1] > 90) {
                problems.push(`arcs[${i}][${j}] is outside WGS84 bounds`);
                break;
            }
        }
        if (problems.length >= 40)
            break;
    }
    const checkReferences = (geometry, path) => {
        if (!isPlainObject(geometry)) {
            problems.push(`${path} must be a geometry object`);
            return;
        }
        if (geometry.type === "GeometryCollection") {
            if (!Array.isArray(geometry.geometries))
                problems.push(`${path}.geometries must be an array`);
            else
                geometry.geometries.forEach((child, i) => checkReferences(child, `${path}.geometries[${i}]`));
            return;
        }
        if (["LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(String(geometry.type))) {
            const references = [];
            const flatten = (part) => {
                if (typeof part === "number")
                    references.push(part);
                else if (Array.isArray(part))
                    part.forEach(flatten);
            };
            flatten(geometry.arcs);
            if (references.length === 0)
                problems.push(`${path}.arcs must contain arc references`);
            for (const ref of references) {
                const index = ref >= 0 ? ref : ~ref;
                if (!Number.isSafeInteger(ref) || index < 0 || index >= topology.arcs.length) {
                    problems.push(`${path} references a missing arc`);
                    break;
                }
            }
            return;
        }
        if (["Point", "MultiPoint"].includes(String(geometry.type))) {
            problems.push(...validateGeometry({ type: geometry.type, coordinates: geometry.coordinates }, 2_000_000).map((problem) => `${path}.${problem}`));
            return;
        }
        problems.push(`${path}.type is unsupported`);
    };
    for (const [key, geometry] of Object.entries(topology.objects))
        checkReferences(geometry, `objects.${key}`);
    return problems.slice(0, 40);
}
function countTopoFeatures(topology) {
    const count = (geometry) => {
        if (!isPlainObject(geometry))
            return 0;
        if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
            return geometry.geometries.reduce((sum, child) => sum + count(child), 0);
        }
        return 1;
    };
    return Object.values(topology.objects).reduce((sum, object) => sum + count(object), 0);
}
export async function sha256Hex(bytes) {
    if (!globalThis.crypto?.subtle)
        throw new GeographyError("invalid_resource", "Web Crypto SHA-256 is unavailable");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
/** Fetches selected public data without cookies; data resources may not redirect off-origin. */
export async function loadGeographyResources(manifest, request, options) {
    const problems = validateGeographyManifest(manifest, { licensePolicy: options.licensePolicy });
    if (problems.length)
        throw new GeographyError("invalid_manifest", problems.slice(0, 8).join("; "));
    const selected = selectGeographyResources(manifest, request);
    const maxConcurrent = options.maxConcurrent ?? 4;
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 16) {
        throw new GeographyError("invalid_manifest", "maxConcurrent must be between 1 and 16");
    }
    let base;
    try {
        base = new URL(options.baseUrl);
        if ((base.protocol !== "https:" && base.protocol !== "http:") || base.username || base.password) {
            throw new Error("invalid base URL");
        }
    }
    catch {
        throw new GeographyError("invalid_manifest", "baseUrl must be an HTTP(S) URL");
    }
    const fetcher = options.fetcher ?? fetch;
    const results = new Array(selected.length);
    let cursor = 0;
    const worker = async () => {
        while (true) {
            const index = cursor++;
            if (index >= selected.length)
                return;
            const resource = selected[index];
            let bytes = await options.cache?.get(resource.sha256) ?? null;
            const fromCache = bytes !== null;
            if (bytes)
                bytes = bytes.slice();
            if (!bytes) {
                const url = new URL(resource.href, base);
                if (url.origin !== base.origin)
                    throw new GeographyError("invalid_manifest", `resource ${resource.id} is not same-origin`);
                let response;
                try {
                    response = await fetcher(url, {
                        method: "GET",
                        credentials: "omit",
                        redirect: "error",
                        signal: options.signal,
                        headers: { accept: "application/geo+json, application/json" },
                    });
                }
                catch (error) {
                    if (options.signal?.aborted)
                        throw error;
                    throw new GeographyError("resource_fetch_failed", `resource ${resource.id} could not be fetched`);
                }
                if (!response.ok)
                    throw new GeographyError("resource_fetch_failed", `resource ${resource.id} returned HTTP ${response.status}`);
                const contentLength = response.headers.get("content-length");
                const contentEncoding = response.headers.get("content-encoding");
                if ((!contentEncoding || contentEncoding === "identity") && contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > resource.byteSize) {
                    throw new GeographyError("resource_too_large", `resource ${resource.id} exceeded its declared size`);
                }
                bytes = await readBoundedBody(response, resource.byteSize, resource.id, options.signal);
            }
            const data = await verifyGeographyResource(resource, bytes);
            if (!fromCache)
                await options.cache?.put(resource.sha256, bytes.slice());
            results[index] = { resource, data, bytes };
        }
    };
    await Promise.all(Array.from({ length: Math.min(maxConcurrent, selected.length) }, () => worker()));
    return results;
}
async function readBoundedBody(response, maxBytes, resourceId, signal) {
    const reader = response.body?.getReader();
    if (!reader)
        throw new GeographyError("resource_fetch_failed", `resource ${resourceId} has no response body`);
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (!value)
                continue;
            size += value.byteLength;
            if (size > maxBytes) {
                await reader.cancel("declared resource size exceeded").catch(() => undefined);
                throw new GeographyError("resource_too_large", `resource ${resourceId} exceeded its declared size`);
            }
            chunks.push(value);
        }
    }
    catch (error) {
        if (signal?.aborted)
            throw signal.reason ?? error;
        if (error instanceof GeographyError)
            throw error;
        throw new GeographyError("resource_fetch_failed", `resource ${resourceId} body could not be read`);
    }
    finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
/** Build an opaque, versioned geometry reference suitable for Solon's `areas.geometry_ref`. */
export function makeGeometryRef(input) {
    const parts = [input.sourceId, input.datasetVersion, input.resourceId, String(input.featureId)];
    if (parts.some((part) => !part || part.length > 256)) {
        throw new GeographyError("invalid_resource", "geometry reference components must be non-empty and at most 256 characters");
    }
    return `geo:v1:${parts.map(encodeURIComponent).join(":")}`;
}
