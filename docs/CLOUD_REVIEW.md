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

For supplemental access, search 望月公寓, select one of its displayed buildings, choose “从这里选路”, then search 东3教学楼. Its short dashed access remains an estimate. In route details, “作为假设查看待核通路” can produce a shorter conditional route; when it actually uses pending conditions, the title remains “假设路线” after details close, and the affected sections stay dashed even during preview. This is not a receipt that a gate has opened.

Appearance should retain warm gray/gold ground surfaces, restrained highlights, transparent spatial massing, real courtyards/roofs/water, and readable labels. Recorded building passages have a dashed trace across the upper outline in plan view; the trace moves below the structure as the camera tilts. Search 东4教学楼, 碧峰1-2舍连廊, 紫云1-2舍连廊 or 蒙民伟楼 to review the ground openings and their neighbouring paths. Their widths, clearance and supports remain illustrative. Observe the actual render and time sequence; test output does not certify aesthetics.

WebGL uses the available graphics implementation, including software rendering when the browser supplies it. When WebGL construction is unavailable the existing OpenLayers renderer uses the same public data and route results in a planar view. Its water fill and named-water emphasis follow the shared display surface; its close views use the same sports linework and illustrative lane records. Space/oblique controls and building volume are absent there. An environment without any browser graphics/Canvas cannot offer a visual preview.

At an overview scale, inspect the island paths and their three eastern/southern footbridges: ordinary approaches remain visible as subdued ink instead of disappearing before the bridge. In the compatibility GPU view, inspect the pedestrian paving around 体育馆 and 求是大讲堂, including their one- and six-hole plans. GPU initialization failures use the existing Canvas path; the same public data remains available. Old source captions follow the same historical-reference rule as the spatial view.

The shared display surface carries all explicitly open source channels, including sections lacking a recorded water polygon. Their widths can be illustrative; exposed channel banks blend into adjoining water polygons, and explicit covered waterways retain a fine dashed continuation. Historical bridge traces and nearby official-reference caption consolidation also apply in compatibility views. Search 西2门 or 紫金港校医院 to inspect river continuity, crossings and repeated-reference captions; choosing a reference still identifies that individual record. Search 体育馆 to inspect the continuous radial roof joints, and 室内游泳馆 for the equipment panels on its shallow roof. Their stored outlines and heights retain their existing source limitations.

In the spatial renderer, the shore shade is clipped inside the existing water surface and fades at overview scales. Inspect 西2门 and 启真湖 in both themes for bridge continuity, island holes and a single selected lake caption. This shading does not establish physical bank height or depth; compatibility views retain their planar treatment.

Search 生物系统工程与食品科学学院 and 动物科学学院 to inspect their connected roof and two-arm massing in the surrounding compound. Compare the real route between their recorded entrances. “沿路看看” switches to a compact endpoint/progress card and focuses its slider without moving the camera; “结束” restores route information and removes preview marks. Actual pending passages retain “假设预览” in the compact card. Check this flow at narrow and desktop widths in both graphics modes.

Inspect 蓝田3舍 and the neighbouring dormitories close up and at group scale. Walls become solid as facade detail appears; glass and selection/route cutaways retain transparency. The small independent outline beside 蓝田3舍 uses a low illustrative volume with unknown physical height and use. After viewing an existing route, return to browsing and choose “从这里选路”: the selected place becomes A and the destination is cleared before the next choice.

Search 文鼎苑5幢 and choose 文鼎苑23幢 as the destination to inspect the surrounding residential proxies, water and road loop. Compare the group in both themes and from plan and oblique views. Their three height bands are display estimates; 14幢 retains an unresolved negative-layer source record. At district zooms, a tall wall becomes solid as its projected height grows, while a route-obstructing building still uses the normal cutaway.

Search 三坝地铁站, 虾龙圩, 三墩, 蒋村 or 浙大紫金港 to inspect the underground station reference outline and separate surface entrance canopies. Streets remain visible through the station extent. A walk from 东3 to 三坝 ends at a recorded exit; change the exit in route details and check the endpoint caption and marker. 虾龙圩 D口 exercises an estimated connection from its own recorded entrance canopy. These behaviors use the same data in spatial, WebGL 1 and Canvas views. Conditional station passages can be considered only through the existing pending-passage option; exit opening and interior access remain unknown.

Search 浙江省档案馆 to inspect the illustrated tower and low wings within the retained site extent. Check both court openings from above, the east entrance and recessed facade rhythm obliquely, and the planar outline in compatibility modes. The model describes architectural relationships, not a surveyed building-part plan. Its existing route to 东3 still uses an estimated reference-to-road connection; the model must open the normal route cutaway without turning that estimate into a confirmed entrance.

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

All five live scene URLs were rendered and operated; pan/zoom/rotation and route preview were checked. The explicit no-WebGL browser window loaded canvas-2d-fallback from the same dataset. These observations describe that reviewed publication; subsequent source changes require their own current checks.

Old screenshot copies have been removed from the source tree. Use the scene URLs above and the current checked-out version for review. Deployment procedure: [DEPLOYMENT](DEPLOYMENT.md).

