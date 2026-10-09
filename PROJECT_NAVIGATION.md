# Project navigation
This is the current file/call-chain map for the complete product. The map remains named map-v2 on disk for wire compatibility; manifest.implementation is campus-map/v3.

| Task | Canonical entry and chain |
| --- | --- |
| Desktop startup | package.json → scripts/dev.mjs → scripts/build-electron.mjs → src/main/main.ts; BrowserWindow loads src/renderer/main.tsx / App.tsx through main/preload.ts |
| Review startup | apps/review-web/index.html applies the query theme and loads review.css / the shared design stylesheet before main.tsx → public storage adapter → the same src/main/mapService.ts and src/renderer/map/CampusMap.tsx |
| Chat/model orchestration | App.tsx → preload.ts IPC → main.ts → harness.ts → runtime/hermes.ts → runtime/hermes/sidecar.py → pinned upstream AIAgent; provider.ts performs host model transport |
| Tools/capabilities | main/tools.ts → runtime/coordinator.ts → capabilities/broker.ts → builtin.ts / campus-query.ts / research.ts / spatial.ts; main/zjuAdapter.ts invokes an explicitly installed external connector |
| Memory | main/memory/model.ts and service.ts → runtime/context.ts / policy.ts → storage/repository.ts; store.ts owns the database, controls.ts the explicit user control path |
| Actions/arrangements | main/actions/runtime.ts / local-calendar.ts / reminders.ts; runtime/attention.ts for proactive preparation; LifePanels.tsx / HarnessViews.tsx render results |
| Materials and PDF | main/materials/service.ts → pdf.ts → worker.ts; scripts/material-runtime.mjs stages the licensed Windows native runtime |
| Map rendering | App.tsx → renderer/map/CampusMap.tsx → map-engine.ts → MapLibre; ground-fills.ts draws and picks uncut local Float32 polygon fills using cartography.ts styles, retaining shared venue nodes and holes; roof-surfaces.ts / volume-edges.ts use mesh-geometry.ts for exact collapsed draw faces and roof boundary incidence; planar-map.ts is the existing no-WebGL compatibility renderer |
| Map loading | main/main.ts mapData IPC → main/mapService.ts → assets/map-v2 manifest and component hashes; shared/map-v3.ts restores original island detail parents and derives visible segments of source-history roads from the default base graph, retaining raw source geometry and conditional segments; review aliases only mapStorage.ts to immutable public assets |
| Ground/display data | geography.geojson / network.json preserve ground and route facts; display-geography.geojson / sports-details.geojson express separately documented visual interpretation; places.json owns stable identities |
| Camera/input/animation | map-engine.ts / planar-map.ts; CameraOwnership and selectionReducer in map-state.ts; user gestures interrupt camera movement; route preview follows the same route coordinates |
| Routing | main/mapService.ts route() → shared/map-routing.ts WalkingGraph.shortest; main/mapProfile.ts handles explicit local overlays and access candidates |
| Public vs private map | mapService publicView(); desktop receives explicit profile directory only from main.ts; review never provides it. mapLocation.ts is desktop-native and absent from web review |
| Fonts/icons/themes | package-locked Noto Sans SC / lucide-react; renderer/design-system.css, map-theme.ts and map CSS; assets/brand contains the project-created desktop mark |
| Build/deployment | package.json, tsconfig.json, vite.config.ts, vite.review.config.ts; .github/workflows/ci.yml and pages.yml; build outputs stay ignored |

Map source and observation provenance is in docs/ASSET_PROVENANCE.md. Runtime uses the checked-in, hash-validated dataset and needs no external reference files. Optional data regeneration uses scripts/import-map.mjs, import-map-v2.mjs, build-map-v3.py and map_v3_*.py; it requires separately authorized official reference input through ZAICHANG_MAP_REFERENCE_DIR and Python geometry dependencies.

Exact source structure maintenance: scripts/map_topology.py normalizes only nonoverlapping valid polygon members sharing an internal boundary, retaining the source relation/member mapping. scripts/normalize-map-topology.py reviews/applies that operation to the existing public snapshot, restores original detail parent IDs, and updates coherent component versions without rerunning image-derived modelling. Positive-area overlap, bad component rings and image alignment remain separate source-review obligations.

There are no obsolete implementations inside this repository. Local research bundles, copies, archived packaging, past evaluation matrices and original Git history were excluded. They are historical/local evidence, not an alternative product entry.

See docs/ARCHITECTURE.md for behavior, docs/CURRENT_STATUS.md for current limitations and docs/CLOUD_REVIEW.md for deterministic scene URLs.

Public artifact export/deployment: scripts/export-review.mjs, apps/review-web/hosting.json and docs/DEPLOYMENT.md. The generated static checkout is ignored work output; src/ remains the sole implementation.

