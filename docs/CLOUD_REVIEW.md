# Cloud review
Open [the live public map](https://zaichang-campus-review-20261006.sugary-loom-6961.chatgpt.site/) first. This is the same V3 map implementation as desktop, with a public-file bridge and no personal assistant data.

These hosted URLs refer to the existing publication. Subsequent local audit commits are not reflected there until deployment. Current local audit work still has unresolved source alignment, derivative-use permissions, physical heights/access and full-map review gates; the historical verification below does not certify those later changes or factual gates.

| Scene | URL / result |
| --- | --- |
| overview | [?scene=overview](https://zaichang-campus-review-20261006.sugary-loom-6961.chatgpt.site/?scene=overview) — campus and surrounding source coverage |
| top-down | [?scene=top-down](https://zaichang-campus-review-20261006.sugary-loom-6961.chatgpt.site/?scene=top-down) — north-up ground plan, readable building/road relationships |
| oblique | [?scene=oblique](https://zaichang-campus-review-20261006.sugary-loom-6961.chatgpt.site/?scene=oblique) — 42° spatial view with the current roofs/transparent volumes |
| route-demo | [?scene=route-demo](https://zaichang-campus-review-20261006.sugary-loom-6961.chatgpt.site/?scene=route-demo) — 东3 to 西1 on the real graph, solid road sections and separately indicated estimated access |
| building-focus | [?scene=building-focus](https://zaichang-campus-review-20261006.sugary-loom-6961.chatgpt.site/?scene=building-focus) — a public library-complex building, detailed sourced/proportioned geometry |

Select a scene from the header. Query URLs work on direct access and refresh under the repository base path. Add theme=dark for the existing dark map theme. Drag to pan, scroll to zoom, use compass/rotation controls or the spatial view switch and pitch slider. Search/select buildings, choose “从这里选路”, then the destination; route options preserve known doors and estimated access separately. Camera movement remains interruptible. Return opens the map introduction; no login is required.

Appearance should retain warm gray/gold ground surfaces, restrained highlights, transparent spatial massing, real courtyards/roofs/water, and readable labels. Observe the actual render and time sequence; test output does not certify aesthetics.

WebGL uses the available graphics implementation, including software rendering when the browser supplies it. When WebGL construction is unavailable the existing OpenLayers renderer uses the same public data and route results in a planar view. Space/oblique controls are absent there. An environment without any browser graphics/Canvas cannot offer a visual preview.

Desktop-only: chat/Harness/model transport, personal memory/data/roles, campus accounts, native location/notifications, attachments/PDF worker and windows. Review has none of these and never reads host files, requests private API keys or university account data. Its selected public artifact contains OSM-derived vectors, project display interpretations and local font/engine assets. Bundled software licenses do not establish extraction or derivative-map rights for every cartographic source; those source-use gates remain under audit.

Reproduce with Node 24.18.0/npm 11.16.0: npm ci; npm run check; npm run build; npm run preview. Start development with npm run review. For desktop: install uv, npm run setup, npm run dev on Windows x64. Dev container: .devcontainer/devcontainer.json. Linux builds code/review; native desktop PDF staging and packaging are Windows-specific.

Limits: source age, doors/permissions, exact building heights, illustrative sport lines and missing ground connections are retained honestly. Some destinations have no qualified route and show nearby road reference alternatives; the map does not invent a straight-line walk. Regeneration reference material is intentionally local/optional, not a build dependency. Broader product limitations are in CURRENT_STATUS.md.

Verification results will be updated only after clean clone, Actions, deployment and actual browser checks; a source file or generated artifact alone is not an acceptance result.

## ChatGPT connection
Connect GitHub in ChatGPT Settings → Plugins/Apps, and authorize only this repository. Read README.md, this document and PROJECT_NAVIGATION.md first. Every review/change should identify 1760139151lkh-ctrl/zaichang, branch and exact commit SHA. Account/app authorization is distinct from this repository's existence. [Official OpenAI instructions](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt).

The deployment transfers losslessly gzipped public JSON, decoded by the browser and checked against the desktop manifest hashes. This reduces the public artifact without duplicating or altering the map.


Hosting: the canonical GitHub repository remains private. GitHub Pages activation returned HTTP422 because the account plan does not support Pages for this private repository. The reviewed map-only static artifact is hosted publicly by Sites. No product source, account/session, memory database or private API is deployed. Pages remains opt-in through ENABLE_GITHUB_PAGES for a future eligible configuration.


## Verification at the reviewed implementation
Windows and Ubuntu CI: installation, source type/build, 105 host/memory/route checks, and 9 native Hermes/synthetic-host checks passed. Windows additionally passed actual Electron/map/memory startup and native PDF text/JPEG rendering. Fresh remote clone used independent npm/Electron/uv caches, built successfully and passed the same Windows checks. No live university data was collected; live model semantics remain uncertified.

All five live scene URLs were rendered and operated; pan/zoom/rotation and route preview were checked. The explicit no-WebGL browser window loaded canvas-2d-fallback from the same dataset. Six final screenshots in review/ were actually opened and viewed. No video, iterative reports or source maps are shipped.

Screenshots: [overview](review/overview.jpg), [top-down](review/top-down.jpg), [oblique](review/oblique.jpg), [route-demo](review/route-demo.jpg), [building-focus](review/building-focus.jpg), [no-WebGL](review/compatibility.jpg). Deployment procedure: [DEPLOYMENT](DEPLOYMENT.md).

