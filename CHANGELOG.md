# Changelog

## 0.1.1

- Add bounded, same-origin manifest downloads with source and licence validation.
- Share streamed transport between manifests and geometry; cancel stalled bodies
  and stop cached resource loads when the consumer aborts.
- Filter resources by viewport bounds before applying the download budget,
  including antimeridian crossings. Bounds remain optional for existing data.
- Retain the explicit geography, date and viewpoint contract from 0.1.0.

## 0.1.0

- Introduce sourced geography manifests, bounded resource selection and loading,
  SHA-256 verification, WGS84 geometry validation, dated area assertions and
  proposal-gated boundary draft validation.
