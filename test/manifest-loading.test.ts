import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import {
  loadGeographyManifest, loadGeographyResources, sha256Hex,
  type GeographyManifest, type GeographyResource,
} from "../src/index.ts";

const geometry = new TextEncoder().encode(JSON.stringify({
  type: "FeatureCollection",
  features: [{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }],
}));
const resource: GeographyResource = {
  id: "test-points", geographyId: "testland", kindKey: "facilities", levelKey: "site",
  sourceIds: ["test"], format: "geojson", href: "/geo/points.json",
  sha256: await sha256Hex(geometry), byteSize: geometry.length, featureCount: 1,
  validFrom: null, validTo: null, viewpointKey: null,
};
const manifest: GeographyManifest = {
  schemaVersion: 1, datasetVersion: "test-1", generatedAt: "2026-09-30T00:00:00Z",
  sources: [{ id: "test", publisher: "Test publisher", dataset: "Test dataset",
    url: "https://example.test/data", licenseSPDX: "CC0-1.0", retrievedAt: "2026-09-30T00:00:00Z" }],
  viewpoints: [], resources: [resource],
};
const options = { baseUrl: "https://example.test", licensePolicy: [{ spdx: "CC0-1.0", requiresAttribution: false }] };

test("manifest transport omits credentials and validates the application's licence policy", async () => {
  let calls = 0;
  const loaded = await loadGeographyManifest("/geo/manifest.json", {
    ...options,
    fetcher: async (url, init) => {
      calls += 1;
      assert.equal(String(url), "https://example.test/geo/manifest.json");
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.redirect, "error");
      return new Response(JSON.stringify(manifest));
    },
  });
  assert.deepEqual(loaded, manifest);
  assert.equal(calls, 1);
  await assert.rejects(loadGeographyManifest("/geo/manifest.json", {
    ...options, licensePolicy: [], fetcher: async () => new Response(JSON.stringify(manifest)),
  }), { code: "invalid_manifest" });
});

test("manifest URLs and byte limits are checked before any network request", async () => {
  const fetcher = async (): Promise<Response> => { assert.fail("unsafe request reached the network"); };
  for (const href of ["https://other.test/map", "//other.test/map", "/geo/../private", "/geo/%2e%2e/private", "/%5cother.test/map", "/geo/\tmanifest.json"]) {
    await assert.rejects(loadGeographyManifest(href, { ...options, fetcher }), { code: "invalid_manifest" });
  }
  for (const maxBytes of [0, -1, Infinity, 1.5]) {
    await assert.rejects(loadGeographyManifest("/geo/manifest.json", { ...options, maxBytes, fetcher }), { code: "invalid_manifest" });
  }
});

test("manifest limits cancel oversized decoded streams even without a trustworthy length header", async () => {
  for (const headers of [new Headers(), new Headers({ "content-encoding": "gzip", "content-length": "1" })]) {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(65)); },
      cancel() { cancelled = true; },
    });
    await assert.rejects(loadGeographyManifest("/geo/manifest.json", {
      ...options, maxBytes: 64, fetcher: async () => new Response(body, { headers }),
    }), { code: "resource_too_large" });
    assert.equal(cancelled, true);
  }
});

test("malformed manifest bytes fail before resource selection", async () => {
  for (const data of [new Uint8Array([0xff]), "{", "null", JSON.stringify({ ...manifest, schemaVersion: 2 })]) {
    await assert.rejects(loadGeographyManifest("/geo/manifest.json", {
      ...options, fetcher: async () => new Response(data),
    }), { code: "invalid_manifest" });
  }
});

test("abort cancels a stalled body even when the injected fetch implementation ignores its signal", async () => {
  const controller = new AbortController();
  const reason = new Error("map was closed");
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() { cancelled = true; },
  });
  const loading = loadGeographyManifest("/geo/manifest.json", {
    ...options, signal: controller.signal, fetcher: async () => new Response(body),
  });
  await setImmediate();
  controller.abort(reason);
  await assert.rejects(loading, (error) => error === reason);
  assert.equal(cancelled, true);
});

test("an abort during cache lookup cannot return a stale selection", async () => {
  const controller = new AbortController();
  const reason = new Error("selection changed");
  await assert.rejects(loadGeographyResources(manifest, { geographyIds: ["testland"], asOf: "2026-09-30" }, {
    ...options, signal: controller.signal,
    cache: { get: async () => { controller.abort(reason); return geometry; }, put: async () => assert.fail("aborted data was cached") },
    fetcher: async () => assert.fail("cached selection was fetched"),
  }), (error) => error === reason);
});
