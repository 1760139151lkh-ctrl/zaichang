# Asset provenance
| Asset | Source / transformation / redistribution treatment |
| --- | --- |
| Ground footprints, roads, nodes and walk graph | Bounded OpenStreetMap snapshot, source timestamp 2026-09-10. Editor personal fields removed. ODbL 1.0 applies to the source and derivative database; complete license in licenses/ODbL-1.0.txt, visible OSM attribution retained; raw machine-readable source at assets/map-v2/source.osm.json.gz and public map/source.osm.json.gz |
| Display buildings, roofs, courtyards, shore and sports lines | Project-authored procedural geometry and bounded factual observations, derived from the ground snapshot and publicly observable spatial relationships. Not copied official image pixels, tiles, photographs or a surveyed building mesh. Source-height, levels estimate and image-proportioned shapes retain their distinctions |
| Names, references, source links | Public place names and factual positions in the current project dataset; uncertainty/crosswalk metadata retained. Raw official WFS/locator exports are excluded because no general redistribution grant was established. They may only be used as separately authorized local generation input |
| Official guide, Amap/Baidu/school photographs | Referenced for spatial cross-checks; original images, tiles, screenshots, website scripts/tokens and fonts are excluded from source and deployment. Public accessibility is not treated as a redistribution license |
| Sports observations | Generated linework is illustrative, not measured court dimensions or a certified running course; no activity records or personal exercise locations |
| Fonts | Package-locked Noto Sans SC, SIL OFL 1.1; KaTeX fonts under its MIT distribution. Local files with required notices; no third-party map font server |
| Icons, logo | lucide-react, ISC license, and project-created assets/brand mark/icon. No borrowed product logos or unlicensed picture assets |
| Map engines | MapLibre BSD-3-Clause and OpenLayers BSD-2-Clause; licenses retained |
| Hermes/Python/PDF/canvas | Hermes fetched at an immutable commit with frozen uv.lock and explicit host patches; Python runtime installed separately; PDFJS Apache-2.0, canvas MIT. Native binaries fetched through package-lock, not checked into Git |
| Personal overlay | Excluded. Roles, renamed personal places, home/dormitory bindings, GPS fixes, private databases and memories are neither source nor preview data |

The reviewed map contains vector/procedural geometry, bounded factual source metadata, licensed font/engine assets and the ODbL source. No official raster or unlicensed reference file is redistributed. The 35 MB display JSON remains ordinary Git text, stored once; Git compression and HTTP transfer compression avoid a duplicate binary model or LFS pointer dependency.

The generation scripts preserve route ground facts separately from appearance. Normal installation/build never downloads official reference material. Regeneration requires separately authorized references and may produce a new data version; do not treat a regenerated snapshot as already visually accepted.
