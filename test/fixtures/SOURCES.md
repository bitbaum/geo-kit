# Border fixtures: sources and licences

`borders.json` holds the fine boundaries the picking tests (`test/pick.test.ts`)
run on, each from the source named in its `sources` entry. `scripts/fixtures/build-border-fixtures.mjs`
rebuilds it (coordinates rounded to five decimals, then simplified with Douglas-Peucker: 8e-5 degrees, about 6 m, and 1e-5, about 1 m, for Baarle). The file is about 170 KB; this directory is test data only and `package.json` `files` does not publish it (`pnpm run pack:check` fails if it is in the tarball).

| Place | Source | Licence / terms |
| --- | --- | --- |
| Narva linn, Narva-Jõesuu linn (EE) | Maa- ja Ruumiamet (Estonian Land Board), municipality boundaries, `omavalitsus_shp.zip`, export of 2024-12-01, reprojected from L-EST97 | Use not restricted; the source and the date must be named (the same file Solon draws) |
| Görlitz (DE), Zgorzelec (PL), Baarle-Hertog (BE), Baarle-Nassau (NL), Vaduz, Schaan, Triesen, Balzers (LI), Valga linn (EE), Valka (LV) | OpenStreetMap relations 409676, 3150678, 53137, 47798, 1155956, 1155952, 1155945, 1155953, 351435, 1898515, read through Nominatim `lookup` | © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). Share-alike applies to a derived database; these simplified extracts are test data under the same licence |

The coarse neighbours are not copied: the tests read Natural Earth 1:50m
countries from the `world-atlas` dev dependency (public domain, as published
by world-atlas, ISC), the same file Solon draws the world from.

Rings are as the sources wrote them (planar winding); `rewound` in the kit
puts them right, as it does for every feature a map loads.
