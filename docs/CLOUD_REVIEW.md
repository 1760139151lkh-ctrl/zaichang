# Cloud review
Open [the live public map](https://1760139151lkh-ctrl.github.io/zaichang/) first. This is the same V3 map implementation as desktop, with a public-file bridge and no personal assistant data.

| Scene | URL / result |
| --- | --- |
| overview | [?scene=overview](https://1760139151lkh-ctrl.github.io/zaichang/?scene=overview) — campus and surrounding source coverage |
| top-down | [?scene=top-down](https://1760139151lkh-ctrl.github.io/zaichang/?scene=top-down) — north-up ground plan, readable building/road relationships |
| oblique | [?scene=oblique](https://1760139151lkh-ctrl.github.io/zaichang/?scene=oblique) — 42° spatial view with the current roofs/transparent volumes |
| route-demo | [?scene=route-demo](https://1760139151lkh-ctrl.github.io/zaichang/?scene=route-demo) — 东3 to 西1 on the real graph, solid road sections and separately indicated estimated access |
| building-focus | [?scene=building-focus](https://1760139151lkh-ctrl.github.io/zaichang/?scene=building-focus) — a public library-complex building, detailed sourced/proportioned geometry |

Select a scene from the header. Query URLs work on direct access and refresh under the repository base path. Add theme=dark for the existing dark map theme. Drag to pan, scroll to zoom, use compass/rotation controls or the spatial view switch and pitch slider. Search/select buildings, choose “从这里选路”, then the destination; route options preserve known doors and estimated access separately. Camera movement remains interruptible. Return opens the map introduction; no login is required.

Appearance should retain warm gray/gold ground surfaces, restrained highlights, transparent spatial massing, real courtyards/roofs/water, and readable labels. Observe the actual render and time sequence; test output does not certify aesthetics.

WebGL uses the available graphics implementation, including software rendering when the browser supplies it. When WebGL construction is unavailable the existing OpenLayers renderer uses the same public data and route results in a planar view. Space/oblique controls are absent there. An environment without any browser graphics/Canvas cannot offer a visual preview.

Desktop-only: chat/Harness/model transport, personal memory/data/roles, campus accounts, native location/notifications, attachments/PDF worker and windows. Review has none of these and never reads host files, requests private API keys or university account data. It contains only procedural/vector map facts, ODbL source and licensed local font/engine assets.

Reproduce with Node 24.18.0/npm 11.16.0: npm ci; npm run check; npm run build; npm run preview. Start development with npm run review. For desktop: install uv, npm run setup, npm run dev on Windows x64. Dev container: .devcontainer/devcontainer.json. Linux builds code/review; native desktop PDF staging and packaging are Windows-specific.

Limits: source age, doors/permissions, exact building heights, illustrative sport lines and missing ground connections are retained honestly. Some destinations have no qualified route and show nearby road reference alternatives; the map does not invent a straight-line walk. Regeneration reference material is intentionally local/optional, not a build dependency. Broader product limitations are in CURRENT_STATUS.md.

Verification results will be updated only after clean clone, Actions, deployment and actual browser checks; a source file or generated artifact alone is not an acceptance result.

## ChatGPT connection
Connect GitHub in ChatGPT Settings → Plugins/Apps, and authorize only this repository. Read README.md, this document and PROJECT_NAVIGATION.md first. Every review/change should identify 1760139151lkh-ctrl/zaichang, branch and exact commit SHA. Account/app authorization is distinct from this repository's existence. [Official OpenAI instructions](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt).

The deployment transfers losslessly gzipped public JSON, decoded by the browser and checked against the desktop manifest hashes. This reduces the public artifact without duplicating or altering the map.

