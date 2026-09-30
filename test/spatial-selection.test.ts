import assert from "node:assert/strict";
import test from "node:test";
import { isWgs84Bounds, intersectsGeographyBounds, selectGeographyResources,
  validateGeographyManifest, type GeographyBounds, type GeographyManifest, type GeographyResource } from "../src/index.ts";

test("WGS84 bounds allow antimeridian crossing and reject invalid coordinates", () => {
  assert.equal(isWgs84Bounds([170, -20, -170, 20]), true);
  assert.equal(isWgs84Bounds([-180, -90, 180, 90]), true);
  for (const bounds of [[-181, 0, 1, 1], [0, 0, 181, 1], [0, -91, 1, 1], [0, 2, 1, 1], [NaN, 0, 1, 1], [0, 0, 1]]) {
    assert.equal(isWgs84Bounds(bounds), false);
  }
});

test("viewport intersections handle the date line, touching borders, and polar latitudes", () => {
  const cases: [GeographyBounds, GeographyBounds, boolean][] = [
    [[7, 46, 9, 48], [8, 47, 10, 49], true],
    [[7, 46, 9, 48], [9, 47, 10, 49], true],
    [[7, 46, 9, 48], [10, 47, 11, 49], false],
    [[170, -20, -170, 20], [175, -10, 179, 10], true],
    [[170, -20, -170, 20], [-179, -10, -175, 10], true],
    [[170, -20, -170, 20], [-5, -10, 5, 10], false],
    [[170, -20, -170, 20], [175, 21, 179, 25], false],
    [[170, -20, 180, 20], [-180, -10, -179, 10], true],
    [[-180, 80, 180, 90], [170, 85, -170, 90], true],
    [[-180, 80, 180, 90], [170, -90, -170, -80], false],
  ];
  for (const [a, b, expected] of cases) {
    assert.equal(intersectsGeographyBounds(a, b), expected, JSON.stringify([a, b]));
    assert.equal(intersectsGeographyBounds(b, a), expected, "intersections are symmetric");
  }
});

test("viewport filtering selects local resources before applying the download budget", () => {
  const base: GeographyResource = { id: "local", sourceIds: ["source"], geographyId: "world", kindKey: "administrative",
    levelKey: "subdivision", format: "geojson", href: "/geo/local.json", sha256: "a".repeat(64), byteSize: 100,
    featureCount: 1, validFrom: null, validTo: null, viewpointKey: null, bbox: [7, 46, 9, 48] };
  const manifest: GeographyManifest = { schemaVersion: 1, datasetVersion: "test-1", generatedAt: "2026-09-30T00:00:00Z",
    sources: [{ id: "source", publisher: "Test", dataset: "Test", url: "https://example.test", licenseSPDX: "CC0-1.0", retrievedAt: "2026-09-30T00:00:00Z" }], viewpoints: [],
    resources: [base, { ...base, id: "far", bbox: [120, 20, 130, 30] }, { ...base, id: "unknown", bbox: undefined },
      { ...base, id: "dateline", bbox: [170, -10, -170, 10] }],
  };
  assert.deepEqual(validateGeographyManifest(manifest), []);
  const request = { geographyIds: ["world"], asOf: "2026-09-30", bbox: [7, 46, 9, 48] as const, maxBytes: 200 };
  assert.deepEqual(selectGeographyResources(manifest, request).map((item) => item.id), ["local", "unknown"]);
  assert.deepEqual(selectGeographyResources(manifest, { ...request, bbox: [175, -5, -175, 5] }).map((item) => item.id), ["dateline", "unknown"]);
  assert.throws(() => selectGeographyResources(manifest, { ...request, bbox: [181, 0, 182, 1] }), { code: "invalid_manifest" });
  assert.throws(() => selectGeographyResources(manifest, { ...request, geographyIds: [] }), { code: "selection_required" });
});
