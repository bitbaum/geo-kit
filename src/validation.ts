import type {
  AreaAssertion,
  AreaAssertionKind,
  GeographyManifest,
  GeographyResource,
  ISODate,
  LicenseRule,
  ManifestValidationOptions,
  ResourceFormat,
  Topology,
  GeoJSONFeatureCollection,
} from "./types.ts";
import { GEOGRAPHY_MANIFEST_VERSION } from "./types.ts";
import { GeographyError } from "./errors.ts";

const keyPattern = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const shaPattern = /^[a-f0-9]{64}$/i;
const validFormats = new Set<ResourceFormat>(["geojson", "topojson"]);
const validAssertionKinds = new Set<AreaAssertionKind>(["claims", "administers", "proposes"]);
export function isStableKey(value: unknown): value is string {
  return typeof value === "string" && keyPattern.test(value);
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year!, month! - 1, day!);
  return date.toISOString().slice(0, 10) === value;
}

function isDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    isISODate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validPeriod(from: unknown, to: unknown): boolean {
  return (
    (from === null || isISODate(from)) &&
    (to === null || isISODate(to)) &&
    !(typeof from === "string" && typeof to === "string" && to <= from)
  );
}

export function validUrl(value: unknown, protocols: readonly string[]): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function safeResourceHref(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return false;
  }
  try {
    const decoded = decodeURIComponent(value);
    return !decoded.split("/").some((segment) => segment === "." || segment === "..");
  } catch {
    return false;
  }
}

function validBounds(value: unknown): value is GeographyResource["bbox"] {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return false;
  const [west, south, east, north] = value as number[];
  return west! >= -180 && east! <= 180 && west! <= east! && south! >= -90 && north! <= 90 && south! <= north!;
}
/** Validate a manifest without fetching anything. Licenses and their legal policy are supplied by the owner. */
export function validateGeographyManifest(
  value: unknown,
  options: ManifestValidationOptions = {},
): string[] {
  const problems: string[] = [];
  if (!isPlainObject(value)) return ["manifest must be an object"];
  if (value.schemaVersion !== GEOGRAPHY_MANIFEST_VERSION) {
    problems.push(`schemaVersion must be ${GEOGRAPHY_MANIFEST_VERSION}`);
  }
  if (typeof value.datasetVersion !== "string" || !value.datasetVersion.trim()) {
    problems.push("datasetVersion must be a non-empty string");
  }
  if (!isDateTime(value.generatedAt)) problems.push("generatedAt must be an ISO date-time");
  if (!Array.isArray(value.sources)) problems.push("sources must be an array");
  if (!Array.isArray(value.resources)) problems.push("resources must be an array");
  if (!Array.isArray(value.sources) || !Array.isArray(value.resources)) return problems;

  const maxResources = options.maxResources ?? 100_000;
  const maxByteSize = options.maxByteSize ?? Number.MAX_SAFE_INTEGER;
  if (value.resources.length > maxResources) problems.push(`resources exceeds limit ${maxResources}`);
  const sourceIds = new Set<string>();
  const resourceIds = new Set<string>();
  const sources = new Map<string, Record<string, unknown>>();

  for (const [i, raw] of value.sources.entries()) {
    const where = `sources[${i}]`;
    if (!isPlainObject(raw)) {
      problems.push(`${where} must be an object`);
      continue;
    }
    if (typeof raw.id !== "string" || !isStableKey(raw.id)) problems.push(`${where}.id is invalid`);
    else if (sourceIds.has(raw.id)) problems.push(`${where}.id duplicates ${raw.id}`);
    else {
      sourceIds.add(raw.id);
      sources.set(raw.id, raw);
    }
    for (const field of ["publisher", "dataset"] as const) {
      if (typeof raw[field] !== "string" || !raw[field].trim()) problems.push(`${where}.${field} is required`);
    }
    if (!validUrl(raw.url, ["https:", "http:"])) problems.push(`${where}.url must be an HTTP(S) URL`);
    if (typeof raw.licenseSPDX !== "string" || !raw.licenseSPDX.trim()) {
      problems.push(`${where}.licenseSPDX is required`);
    }
    if (!isDateTime(raw.retrievedAt)) problems.push(`${where}.retrievedAt must be an ISO date-time`);
  }

  const policy = new Map((options.licensePolicy ?? []).map((rule) => [rule.spdx, rule]));
  for (const [i, raw] of value.resources.entries()) {
    const where = `resources[${i}]`;
    if (!isPlainObject(raw)) {
      problems.push(`${where} must be an object`);
      continue;
    }
    for (const field of ["id", "kindKey", "geographyId", "levelKey"] as const) {
      if (typeof raw[field] !== "string" || !isStableKey(raw[field])) {
        problems.push(`${where}.${field} is invalid`);
      }
    }
    if (typeof raw.id === "string") {
      if (resourceIds.has(raw.id)) problems.push(`${where}.id duplicates ${raw.id}`);
      resourceIds.add(raw.id);
    }
    if (typeof raw.sourceId !== "string" || !sourceIds.has(raw.sourceId)) {
      problems.push(`${where}.sourceId does not reference a declared source`);
    } else {
      const source = sources.get(raw.sourceId)!;
      const licenseRule = policy.get(String(source.licenseSPDX));
      if (options.licensePolicy && !licenseRule) {
        problems.push(`${where} uses license ${String(source.licenseSPDX)} outside the supplied policy`);
      }
      if (licenseRule?.requiresAttribution && (typeof source.attribution !== "string" || !source.attribution.trim())) {
        problems.push(`${where} requires source attribution for ${String(source.licenseSPDX)}`);
      }
    }
    if (!validFormats.has(raw.format as ResourceFormat)) problems.push(`${where}.format is unsupported`);
    if (!safeResourceHref(raw.href)) problems.push(`${where}.href must be a safe root-relative path`);
    if (typeof raw.sha256 !== "string" || !shaPattern.test(raw.sha256)) problems.push(`${where}.sha256 must be a SHA-256 hex digest`);
    if (!Number.isSafeInteger(raw.byteSize) || Number(raw.byteSize) < 1 || Number(raw.byteSize) > maxByteSize) {
      problems.push(`${where}.byteSize is outside the allowed range`);
    }
    if (!Number.isSafeInteger(raw.featureCount) || Number(raw.featureCount) < 1) {
      problems.push(`${where}.featureCount must be a positive integer`);
    }
    if (!validPeriod(raw.validFrom, raw.validTo)) problems.push(`${where} has an invalid validity period`);
    if (!(raw.viewpointKey === null || (typeof raw.viewpointKey === "string" && isStableKey(raw.viewpointKey)))) {
      problems.push(`${where}.viewpointKey must be null or a stable key`);
    }
    if (raw.bbox !== undefined && !validBounds(raw.bbox)) problems.push(`${where}.bbox is invalid`);
    for (const field of ["minZoom", "maxZoom"] as const) {
      if (raw[field] !== undefined && (!Number.isFinite(raw[field]) || Number(raw[field]) < 0 || Number(raw[field]) > 30)) {
        problems.push(`${where}.${field} must be between 0 and 30`);
      }
    }
    if (
      typeof raw.minZoom === "number" &&
      typeof raw.maxZoom === "number" &&
      raw.maxZoom <= raw.minZoom
    ) {
      problems.push(`${where}.maxZoom must be greater than minZoom`);
    }
  }
  return problems;
}
export function periodContains(from: ISODate | null, to: ISODate | null, date: ISODate): boolean {
  return (from === null || from <= date) && (to === null || date < to);
}

/** Resolve current/historical claims as recorded. No default viewpoint or legal status is inferred. */
/** Prevent malformed API records or unsourced claims from silently changing a map's dispute styling. */
export function validateAreaAssertions(value: unknown): string[] {
  if (!Array.isArray(value)) return ["area assertions must be an array"];
  const problems: string[] = [];
  for (const [i, raw] of value.entries()) {
    const where = `areaAssertions[${i}]`;
    if (!isPlainObject(raw)) {
      problems.push(`${where} must be an object`);
      continue;
    }
    for (const field of ["areaId", "jurisdictionId", "sourceId"] as const) {
      if (typeof raw[field] !== "string" || !raw[field].trim()) problems.push(`${where}.${field} is required`);
    }
    if (typeof raw.assertion !== "string" || !validAssertionKinds.has(raw.assertion as AreaAssertionKind)) {
      problems.push(`${where}.assertion is unsupported`);
    }
    if (!(raw.assertedById === null || (typeof raw.assertedById === "string" && raw.assertedById.trim()))) {
      problems.push(`${where}.assertedById must be a non-empty id or null`);
    }
    if (!validPeriod(raw.validFrom, raw.validTo)) problems.push(`${where} has an invalid validity period`);
    if (problems.length >= 40) break;
  }
  return problems;
}
/** Validate a GeoJSON geometry's coordinates and structural rules. */
export function validateGeometry(value: unknown, maxPositions = 1_000_000): string[] {
  const problems: string[] = [];
  let count = 0;
  const checkPosition = (position: unknown, path: string): void => {
    count += 1;
    if (count > maxPositions) {
      if (count === maxPositions + 1) problems.push(`geometry exceeds ${maxPositions} positions`);
      return;
    }
    if (!Array.isArray(position) || position.length < 2 || !position.every(Number.isFinite)) {
      problems.push(`${path} must contain finite longitude and latitude coordinates`);
      return;
    }
    if (position.length > 4) problems.push(`${path} has more than four coordinate dimensions`);
    const [longitude, latitude] = position as number[];
    if (longitude! < -180 || longitude! > 180) problems.push(`${path} longitude is outside WGS84 bounds`);
    if (latitude! < -90 || latitude! > 90) problems.push(`${path} latitude is outside WGS84 bounds`);
  };
  const checkLine = (positions: unknown, path: string, minimum: number): void => {
    if (!Array.isArray(positions) || positions.length < minimum) {
      problems.push(`${path} needs at least ${minimum} positions`);
      return;
    }
    positions.forEach((position, i) => checkPosition(position, `${path}[${i}]`));
  };
  const checkRing = (ring: unknown, path: string): void => {
    if (!Array.isArray(ring) || ring.length < 4) {
      problems.push(`${path} needs at least four positions`);
      return;
    }
    const validPositions = ring.filter((p) => Array.isArray(p) && p.length >= 2);
    if (validPositions.length > 0 && JSON.stringify(validPositions[0]) !== JSON.stringify(validPositions[validPositions.length - 1])) {
      problems.push(`${path} must be closed`);
    }
    ring.forEach((position, i) => checkPosition(position, `${path}[${i}]`));
  };
  const visit = (geometry: unknown, path: string, depth: number): void => {
    if (!isPlainObject(geometry) || depth > 16) {
      problems.push(`${path} must be a supported geometry`);
      return;
    }
    switch (geometry.type) {
      case "Point":
        checkPosition(geometry.coordinates, `${path}.coordinates`);
        break;
      case "MultiPoint":
        checkLine(geometry.coordinates, `${path}.coordinates`, 1);
        break;
      case "LineString":
        checkLine(geometry.coordinates, `${path}.coordinates`, 2);
        break;
      case "MultiLineString":
        if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
          problems.push(`${path}.coordinates must contain at least one line`);
        } else {
          geometry.coordinates.forEach((line, i) => checkLine(line, `${path}.coordinates[${i}]`, 2));
        }
        break;
      case "Polygon":
        if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
          problems.push(`${path}.coordinates must contain an exterior ring`);
        } else {
          geometry.coordinates.forEach((ring, i) => checkRing(ring, `${path}.coordinates[${i}]`));
        }
        break;
      case "MultiPolygon":
        if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
          problems.push(`${path}.coordinates must contain at least one polygon`);
        } else {
          geometry.coordinates.forEach((polygon, i) => {
            if (!Array.isArray(polygon) || polygon.length === 0) {
              problems.push(`${path}.coordinates[${i}] must contain an exterior ring`);
            } else {
              polygon.forEach((ring, j) => checkRing(ring, `${path}.coordinates[${i}][${j}]`));
            }
          });
        }
        break;
      case "GeometryCollection":
        if (!Array.isArray(geometry.geometries)) {
          problems.push(`${path}.geometries must be an array`);
        } else {
          geometry.geometries.forEach((child, i) => visit(child, `${path}.geometries[${i}]`, depth + 1));
        }
        break;
      default:
        problems.push(`${path}.type is unsupported`);
    }
  };
  visit(value, "geometry", 0);
  return problems;
}
function validateFeatureCollection(value: unknown): string[] {
  if (!isPlainObject(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    return ["expected a GeoJSON FeatureCollection"];
  }
  const problems: string[] = [];
  for (const [i, feature] of value.features.entries()) {
    if (!isPlainObject(feature) || feature.type !== "Feature" || !("geometry" in feature)) {
      problems.push(`features[${i}] is not a GeoJSON Feature`);
    } else if (feature.geometry === null) {
      problems.push(`features[${i}] has no geometry`);
    } else {
      problems.push(...validateGeometry(feature.geometry, 2_000_000).map((problem) => `features[${i}].${problem}`));
    }
    if (isPlainObject(feature) && feature.properties !== null && !isPlainObject(feature.properties)) {
      problems.push(`features[${i}].properties must be an object or null`);
    }
    if (problems.length >= 40) break;
  }
  return problems;
}

function validateTopology(value: unknown): string[] {
  if (!isPlainObject(value) || value.type !== "Topology" || !Array.isArray(value.arcs) || !isPlainObject(value.objects)) {
    return ["expected a TopoJSON Topology with arcs and objects"];
  }
  const topology = value as unknown as Topology;
  const problems: string[] = [];
  const transform = topology.transform;
  const hasValidTransform = transform === undefined || (
    !isPlainObject(transform) || !Array.isArray(transform.scale) || !Array.isArray(transform.translate) ||
    transform.scale.length !== 2 || transform.translate.length !== 2 ||
    ![...transform.scale, ...transform.translate].every(Number.isFinite)
  ) === false;
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
        x += rawPosition[0]!;
        y += rawPosition[1]!;
        const lon = x * (transform.scale as number[])[0]! + (transform.translate as number[])[0]!;
        const lat = y * (transform.scale as number[])[1]! + (transform.translate as number[])[1]!;
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          problems.push(`arcs[${i}][${j}] decodes outside WGS84 bounds`);
          break;
        }
      } else if (rawPosition[0]! < -180 || rawPosition[0]! > 180 || rawPosition[1]! < -90 || rawPosition[1]! > 90) {
        problems.push(`arcs[${i}][${j}] is outside WGS84 bounds`);
        break;
      }
    }
    if (problems.length >= 40) break;
  }
  const checkReferences = (geometry: unknown, path: string): void => {
    if (!isPlainObject(geometry)) {
      problems.push(`${path} must be a geometry object`);
      return;
    }
    if (geometry.type === "GeometryCollection") {
      if (!Array.isArray(geometry.geometries)) problems.push(`${path}.geometries must be an array`);
      else geometry.geometries.forEach((child, i) => checkReferences(child, `${path}.geometries[${i}]`));
      return;
    }
    if (["LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(String(geometry.type))) {
      const references: number[] = [];
      const flatten = (part: unknown): void => {
        if (typeof part === "number") references.push(part);
        else if (Array.isArray(part)) part.forEach(flatten);
      };
      flatten(geometry.arcs);
      if (references.length === 0) problems.push(`${path}.arcs must contain arc references`);
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
  for (const [key, geometry] of Object.entries(topology.objects)) checkReferences(geometry, `objects.${key}`);
  return problems.slice(0, 40);
}

function countTopoFeatures(topology: Topology): number {
  const count = (geometry: unknown): number => {
    if (!isPlainObject(geometry)) return 0;
    if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
      return geometry.geometries.reduce((sum, child) => sum + count(child), 0);
    }
    return 1;
  };
  return Object.values(topology.objects).reduce<number>((sum, object) => sum + count(object), 0);
}
