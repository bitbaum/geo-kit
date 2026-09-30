import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  isISODate,
  loadGeographyResources,
  makeGeometryRef,
  selectGeographyResources,
  sha256Hex,
  summarizeAreaAssertions,
  validateBoundaryDraft,
  validateAreaAssertions,
  validateGeographyManifest,
  validateGeometry,
  verifyGeographyResource,
  type AreaAssertion,
  type BoundaryDraft,
  type GeographyManifest,
  type GeographyResource,
} from "../src/index.ts";

const SQUARE = {
  type: "Polygon",
  coordinates: [[[7, 46], [8, 46], [8, 47], [7, 47], [7, 46]]],
} as const;
const triangle = {
  type: "Polygon",
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
} as const;

async function resourceFor(data: unknown, overrides: Partial<GeographyResource> = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const resource: GeographyResource = {
    id: "ch-admin1-2026",
    sourceId: "source-ch",
    kindKey: "administrative",
    geographyId: "ch",
    levelKey: "admin1",
    format: "geojson",
    href: "/geography/v1/ch/admin1.json",
    sha256: await sha256Hex(bytes),
    byteSize: bytes.byteLength,
    featureCount: (data as { features: unknown[] }).features.length,
    validFrom: "2020-01-01",
    validTo: null,
    viewpointKey: null,
    ...overrides,
  };
  return { bytes, resource };
}

function collection(geometry = SQUARE) {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", id: "canton-1", geometry, properties: { id: "canton-1" } }],
  };
}

function makeManifest(resources: GeographyResource[]): GeographyManifest {
  return {
    schemaVersion: 1,
    datasetVersion: "2026.09.30",
    generatedAt: "2026-09-30T12:00:00.000Z",
    sources: [{
      id: "source-ch",
      publisher: "Test publisher",
      dataset: "Test boundary data",
      url: "https://example.test/geography",
      licenseSPDX: "CC-BY-4.0",
      retrievedAt: "2026-09-30T11:00:00.000Z",
      attribution: "Test publisher, 2026",
    }],
    resources,
  };
}

test("ISO dates are calendar dates, not merely date-shaped strings", () => {
  assert.equal(isISODate("2026-09-30"), true);
  assert.equal(isISODate("2026-02-30"), false);
  assert.equal(isISODate("2026-2-03"), false);
});

test("manifest validates data provenance, attribution policy, unique ids, and safe paths", () => {
  return resourceFor(collection()).then(({ resource }) => {
    const manifest = makeManifest([resource]);
    const policy = [{ spdx: "CC-BY-4.0", requiresAttribution: true }];
    assert.deepEqual(validateGeographyManifest(manifest, { licensePolicy: policy }), []);
    assert.ok(validateGeographyManifest(manifest, { licensePolicy: [] }).some((p) => p.includes("outside the supplied policy")));
    assert.ok(validateGeographyManifest({ ...manifest, sources: [{ ...manifest.sources[0], attribution: "" }] }, { licensePolicy: policy }).some((p) => p.includes("requires source attribution")));
    assert.ok(validateGeographyManifest({ ...manifest, resources: [resource, { ...resource, id: "other", href: "/geography/%2e%2e/secrets" }] }).some((p) => p.includes("safe root-relative")));
    assert.ok(validateGeographyManifest({ ...manifest, resources: [resource, resource] }).some((p) => p.includes("duplicates")));
  });
});

test("selection loads only the requested geography, date, level, zoom, and explicit viewpoint", async () => {
  const neutral = { ...((await resourceFor(collection())).resource), id: "neutral", levelKey: "admin1" };
  const historical = { ...neutral, id: "old", validFrom: "2000-01-01", validTo: "2020-01-01" };
  const alternate = { ...neutral, id: "alternate", viewpointKey: "state-a" };
  const zoomedOut = { ...neutral, id: "coarse", minZoom: 0, maxZoom: 3 };
  const manifest = makeManifest([neutral, historical, alternate, zoomedOut, { ...neutral, id: "other", geographyId: "br" }]);

  assert.deepEqual(selectGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2026-09-30", levelKeys: ["admin1"], zoom: 4 }).map((r) => r.id), ["neutral"]);
  assert.deepEqual(selectGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2026-09-30", viewpointKey: "state-a" }).map((r) => r.id).sort(), ["alternate", "coarse", "neutral"]);
  assert.deepEqual(selectGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2010-01-01" }).map((r) => r.id), ["old"]);
  assert.deepEqual(selectGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2026-09-30", viewpointKey: "all" }).map((r) => r.id).sort(), ["alternate", "coarse", "neutral", "old"].filter((id) => id !== "old").sort());
  assert.throws(() => selectGeographyResources(manifest, { asOf: "2026-09-30" }), { code: "selection_required" });
  assert.throws(() => selectGeographyResources(manifest, { geographyIds: ["ch", "br"], asOf: "2026-09-30", maxBytes: 1 }), { code: "selection_limit" });
});

test("claims and administration are summarized as records, with historical withdrawals respected", () => {
  const assertions: AreaAssertion[] = [
    { areaId: "region-x", jurisdictionId: "authority-a", assertion: "claims", assertedById: null, sourceId: "s1", validFrom: "2000-01-01", validTo: null },
    { areaId: "region-x", jurisdictionId: "authority-b", assertion: "claims", assertedById: "authority-b", sourceId: "s2", validFrom: "2000-01-01", validTo: "2024-01-01" },
    { areaId: "region-x", jurisdictionId: "authority-c", assertion: "administers", assertedById: "authority-b", sourceId: "s3", validFrom: "2020-01-01", validTo: null },
    { areaId: "region-x", jurisdictionId: "authority-d", assertion: "proposes", assertedById: null, sourceId: "s4", validFrom: "2025-01-01", validTo: null },
  ];
  const old = summarizeAreaAssertions("region-x", assertions, "2023-12-31");
  assert.deepEqual(old.claimants, ["authority-a", "authority-b"]);
  assert.equal(old.disputed, true);
  const current = summarizeAreaAssertions("region-x", assertions, "2026-09-30");
  assert.deepEqual(current.claimants, ["authority-a"]);
  assert.deepEqual(current.administrators, ["authority-c"]);
  assert.deepEqual(current.proposers, ["authority-d"]);
  assert.equal(current.disputed, true);
  assert.equal(current.unclaimed, false);
  assert.equal(summarizeAreaAssertions("other", assertions, "2026-09-30").unclaimed, true);
  assert.ok(validateAreaAssertions([{ ...assertions[0], sourceId: "" }]).some((p) => p.includes("sourceId is required")));
  assert.throws(() => summarizeAreaAssertions("region-x", [{ ...assertions[0], assertion: "recognizes" } as unknown as AreaAssertion], "2026-09-30"), { code: "invalid_resource" });
});

test("geometry checks WGS84 bounds, Polygon ring closure, nesting, and position limits", () => {
  assert.deepEqual(validateGeometry(SQUARE), []);
  assert.deepEqual(validateGeometry({ type: "MultiPolygon", coordinates: [[SQUARE.coordinates[0]]] }), []);
  assert.ok(validateGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }).some((p) => p.includes("closed")));
  assert.ok(validateGeometry({ type: "Point", coordinates: [181, 0] }).some((p) => p.includes("WGS84")));
  assert.ok(validateGeometry({ type: "LineString", coordinates: [[0, 0]] }).some((p) => p.includes("at least 2")));
  assert.ok(validateGeometry(SQUARE, 3).some((p) => p.includes("exceeds 3")));
});

function draft(overrides: Partial<BoundaryDraft> = {}): BoundaryDraft {
  return {
    id: "draft-1",
    proposalId: "proposal-1",
    title: "Proposed district boundary",
    geographyId: "ch",
    kindKey: "administrative",
    geometry: SQUARE,
    validFrom: null,
    validTo: null,
    source: { publisher: "Contributor", dataset: "Drawn boundary", licenseSPDX: "CC0-1.0" },
    ...overrides,
  };
}

test("boundary drafts cannot publish without topology validation and approved proposal", () => {
  const policy = [{ spdx: "CC0-1.0", requiresAttribution: false }];
  const blocked = validateBoundaryDraft(draft(), { licensePolicy: policy });
  assert.equal(blocked.publishable, false);
  assert.ok(blocked.problems.some((p) => p.includes("topology validator is required")));
  assert.ok(blocked.problems.some((p) => p.includes("proposal is approved")));

  const accepted = validateBoundaryDraft(draft(), {
    licensePolicy: policy,
    validateTopology: () => ({ valid: true }),
    proposalApproved: (proposalId) => proposalId === "proposal-1",
  });
  assert.equal(accepted.publishable, true);
  assert.equal(accepted.vertexCount, 5);
  assert.ok(validateBoundaryDraft(draft({ source: { publisher: "Contributor", dataset: "Sketch", licenseSPDX: "CC-BY-4.0" } }), {
    licensePolicy: [{ spdx: "CC-BY-4.0", requiresAttribution: true }],
    validateTopology: () => ({ valid: true }),
    proposalApproved: () => true,
  }).problems.some((p) => p.includes("requires attribution")));
  assert.ok(validateBoundaryDraft(draft({ geometry: triangle }), {
    licensePolicy: policy,
    validateTopology: () => ({ valid: false, problems: ["self-intersection"] }),
    proposalApproved: () => true,
  }).problems.includes("self-intersection"));
});

test("GeoJSON resources are verified by exact bytes, SHA-256 and feature count", async () => {
  const { bytes, resource } = await resourceFor(collection());
  const parsed = await verifyGeographyResource(resource, bytes);
  assert.equal((parsed as { features: unknown[] }).features.length, 1);
  await assert.rejects(verifyGeographyResource({ ...resource, sha256: "0".repeat(64) }, bytes), { code: "invalid_resource" });
  await assert.rejects(verifyGeographyResource({ ...resource, featureCount: 2 }, bytes), { code: "invalid_resource" });
  await assert.rejects(verifyGeographyResource(resource, new TextEncoder().encode("not json")), { code: "invalid_resource" });
});

test("TopoJSON resource validation checks transform, coordinates, object arcs, and counts", async () => {
  const topology = {
    type: "Topology",
    transform: { scale: [0.01, 0.01], translate: [7, 46] },
    arcs: [[[0, 0], [100, 0], [0, 100], [-100, 0], [0, -100]]],
    objects: { admin: { type: "Polygon", arcs: [[0]], properties: { id: "one" } } },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(topology));
  const resource: GeographyResource = {
    id: "topo",
    sourceId: "source-ch",
    kindKey: "administrative",
    geographyId: "ch",
    levelKey: "admin1",
    format: "topojson",
    href: "/topo.json",
    sha256: await sha256Hex(bytes),
    byteSize: bytes.byteLength,
    featureCount: 1,
    validFrom: null,
    validTo: null,
    viewpointKey: null,
  };
  assert.equal((await verifyGeographyResource(resource, bytes) as { type: string }).type, "Topology");
  const bad = { ...topology, objects: { admin: { type: "Polygon", arcs: [[7]] } } };
  const badBytes = new TextEncoder().encode(JSON.stringify(bad));
  await assert.rejects(verifyGeographyResource({ ...resource, sha256: await sha256Hex(badBytes), byteSize: badBytes.byteLength }, badBytes), { code: "invalid_resource" });
  const invalidTransform = { ...topology, transform: { scale: "broken", translate: [0, 0] } };
  const transformBytes = new TextEncoder().encode(JSON.stringify(invalidTransform));
  await assert.rejects(verifyGeographyResource({ ...resource, sha256: await sha256Hex(transformBytes), byteSize: transformBytes.byteLength }, transformBytes), { code: "invalid_resource" });
});

test("loader requests only selected resources, omits cookies, rejects redirects, and uses verified cache", async () => {
  const { bytes, resource } = await resourceFor(collection());
  const manifest = makeManifest([resource, { ...resource, id: "other", geographyId: "br", href: "/br.json" }]);
  const requests: { url: string; credentials?: RequestCredentials; redirect?: RequestRedirect }[] = [];
  const result = await loadGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2026-09-30" }, {
    baseUrl: "https://solon.example",
    licensePolicy: [{ spdx: "CC-BY-4.0", requiresAttribution: true }],
    fetcher: async (input, init) => {
      requests.push({ url: String(input), credentials: init?.credentials, redirect: init?.redirect });
      return new Response(bytes, { status: 200 });
    },
  });
  assert.equal(result.length, 1);
  assert.deepEqual(requests, [{ url: "https://solon.example/geography/v1/ch/admin1.json", credentials: "omit", redirect: "error" }]);
  await assert.rejects(loadGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2026-09-30" }, {
    baseUrl: "https://solon.example",
    fetcher: async () => new Response(null, { status: 302 }),
  }), { code: "resource_fetch_failed" });
  let calls = 0;
  const cached = await loadGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2026-09-30" }, {
    baseUrl: "https://solon.example",
    cache: { get: async (hash) => hash === resource.sha256 ? bytes : null, put: async () => {} },
    fetcher: async () => { calls += 1; return new Response(null, { status: 500 }); },
  });
  assert.equal(cached.length, 1);
  assert.equal(calls, 0);
  let cacheWrites = 0;
  await loadGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2026-09-30" }, {
    baseUrl: "https://solon.example",
    cache: { get: async () => null, put: async () => { cacheWrites += 1; } },
    fetcher: async () => new Response(bytes, { status: 200 }),
  });
  assert.equal(cacheWrites, 1, "only verified bytes are cached");
  await assert.rejects(loadGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2026-09-30" }, {
    baseUrl: "https://solon.example",
    licensePolicy: [],
    fetcher: async () => { throw new Error("must reject before fetch"); },
  }), { code: "invalid_manifest" });
  await assert.rejects(loadGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2026-09-30" }, {
    baseUrl: "https://user:password@solon.example",
    fetcher: async () => { throw new Error("credentials in URL must be rejected before fetch"); },
  }), { code: "invalid_manifest" });
});

test("loader streams within the declared byte limit before JSON parsing", async () => {
  const { resource } = await resourceFor(collection());
  const manifest = makeManifest([resource]);
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(resource.byteSize + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(loadGeographyResources(manifest, { geographyIds: ["ch"], asOf: "2026-09-30" }, {
    baseUrl: "https://solon.example",
    fetcher: async () => new Response(oversized),
  }), { code: "resource_too_large" });
  assert.equal(cancelled, true);
});

test("geometry references are versioned and safely encoded", () => {
  assert.equal(makeGeometryRef({ sourceId: "natural-earth", datasetVersion: "5.1.1", resourceId: "admin0", featureId: "A:B/C" }), "geo:v1:natural-earth:5.1.1:admin0:A%3AB%2FC");
});

test("SHA-256 digest helper is stable", async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode("hello")), createHash("sha256").update("hello").digest("hex"));
});
