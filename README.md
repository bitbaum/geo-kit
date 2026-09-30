# `@bitbaum/geo-kit`

Country-neutral contracts for sharing versioned geography data across
applications. The package owns no country packs, political claims, source
choices, personal data, HTTP server, or rendering framework.

## Install

The Git repository is the install source until npm publishing is bootstrapped.
Pin the reviewed v0.1.1 source commit for a reproducible install:

```sh
pnpm add github:bitbaum/geo-kit#a337aec928cf7804fecf459c308d366b90f4b2fa
```

The npm workflow uses npm Trusted Publishing and provenance. The first npm
publish and publisher trust setup require a maintainer-held passkey; publishing
stays disabled until that is complete.

## Ownership

- **Solon** is the authoritative owner of public places, source records,
  historical assertions, decisions, and published boundary resources.
- **OrangeCat** remains the owner of private residence and account data.
- **Substrata and other clients** consume public, versioned data and choose the
  layers they need. They do not copy Solon's geography database.
- Application policy supplies accepted licences and controls whether a
  proposal is approved. This package does not make that decision.

## Data loading

Publish a small manifest beside content-addressed GeoJSON or TopoJSON resources.
Each resource identifies its source, geography, open-ended layer and level keys,
validity period, optional map viewpoint, URL, SHA-256 digest, size and feature
count. Resources can reference multiple sources, with each source's licence and
attribution checked independently. Viewpoints have names, descriptions and
source references, so a client can explain which representation it displays.
A client asks for one or more
geography/resource IDs, a date, and (when needed) a viewpoint. The default view
includes only resources with no explicit viewpoint. `selectGeographyResources`
rejects broad accidental loads by default and enforces byte/resource limits
before any request is made.

`loadGeographyResources` fetches selected same-origin URLs only, without cookies
and without following redirects. It checks the decoded file size, SHA-256,
GeoJSON/TopoJSON structure and feature count before returning parsed data. It
accepts an injected cache, fetch implementation and abort signal so each app can
use its own HTTP cache, IndexedDB policy and retry interface. Requests are
bounded-concurrency and results use deterministic geography/kind/level/id order.

`loadGeographyManifest` uses the same transport protections for the manifest,
including a decoded byte limit enforced while streaming (64 KiB by default).
An abort cancels a stalled body and also stops loads served from a cache.

Resource selection can include a WGS84 `bbox` in west/south/east/north order.
Only intersecting resources with known bounds are selected. Resources without
bounds remain eligible, so missing metadata cannot silently hide coverage.
West greater than east represents an antimeridian crossing. Geographic, time,
viewpoint and download-budget selectors continue to apply together.

```ts
import { loadGeographyManifest, loadGeographyResources } from '@bitbaum/geo-kit';

const controller = new AbortController();
const options = {
  baseUrl: window.location.origin,
  licensePolicy: [{ spdx: 'CC0-1.0', requiresAttribution: false }],
  signal: controller.signal, // AbortController owned by the application
};
const manifest = await loadGeographyManifest('/geography/manifest.json', options);
const layers = await loadGeographyResources(manifest, {
  geographyIds: ['selected-geography'],
  asOf: '2026-09-30', // the date displayed by the application
  levelKeys: ['subdivision'],
  bbox: [7, 46, 9, 48],
  maxBytes: 512 * 1024,
}, options);
```

Layer keys and geographic IDs in this example come from the application's
data. Country packs, detailed subdivision datasets and a border drawing UI are
separate deliverables owned by the applications; this package does not invent
or publish them.

The library never reads the system clock. Pass the date displayed by the app to
support historical maps deterministically. An explicit viewpoint is opt-in;
the library does not treat any boundary representation as the default truth.

## Assertions and proposed boundaries

`AreaAssertion` follows Solon's sourced `claims`, `administers`, and `proposes`
records. `summarizeAreaAssertions` filters those records by an explicit date and
reports distinct claimants, administrators and proposers. Its `disputed` flag is
a mechanical summary of competing claims or a mismatch between claimant and
administrator; it is not a legal conclusion.

`validateBoundaryDraft` checks a proposal's polygon, WGS84 coordinates, closed
rings, input limits, source/license metadata and validity interval. Publication
stays blocked until the consuming app provides both a full geometry-topology
validator and an approval check for the draft's proposal. The draft contains a
shape and its provenance only; claims about who owns or administers it are
separate sourced assertions.

## Verify

```sh
pnpm install --frozen-lockfile
pnpm run verify
```

Runtime code has no dependencies and targets modern browsers plus Node.js 20 or
later. The package ships JavaScript and declarations built from the TypeScript
source, so consumers do not need a TypeScript-aware runtime loader.
