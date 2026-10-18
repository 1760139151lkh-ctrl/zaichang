# 当前状态

核对日期：**2026-10-18**。本文件总结当前源码的功能、接入与验证范围；`package.json` 的产品版本为 0.3.0。本轮源码包含学生 Harness、对话场景和前端演进；源码同步不代表线上地图已更新，也不构成新的完整产品验收标签。

## 全系统能力与实际证据

“实现/接入”和“运行/验收”分别判断。下面的已验证行为有对应范围；它们不能证明所有开放语义、长期相处体验或外部连接都可靠。

| 组成 | 当前实现/接入 | 已有运行证据与限制 |
| --- | --- | --- |
| 对话与连续上下文 | 单一 Hermes 主循环，进展更新/历史/停止、原话检索、事项续接、草稿及附件恢复；主回复正文经完成核查后呈现 | 现有机制检查和实际 Luna 会话已覆盖代表流程；不是所有长会话与开放问题质量保证，也不宣称主回复逐token流出 |
| 来源、权限与隐私 | 模型传输、资料读取、用途、保留、推断和动作分开；主体/世界/受众及版本边界 | 当前原话限制、临时会话、撤权、纠正/遗忘及恢复有分层证据；整库未加密 |
| 记忆 | 原始证据与带条件断言分开，更正、停用、忘记及派生失效 | 确定性隔离与若干实际语义流程已查；不能用测试数字证明通用长期理解 |
| 记事本 | 独立原文、全文检索、长文分页、CAS编辑、版本/撤销/回收站，明确保存工具 | 已查重开、长文末尾、冲突、草稿、原生关闭和公开展示保护；不会自动排时段 |
| 文字人格 | 三个可编辑预设/自定义、纯角色常驻、例句预览、保存/历史恢复、模板导入导出 | 私密旧guidance边界和关闭记忆已查；三预设实际同事实对照差异有限，未证明所有任务稳定可辨 |
| 情境与规划 | 有界 `situation.read`、空闲覆盖、`planning.preview`；固定/可动/邀请/未接受分开 | 实际约饭与连续学习比较、方案接受和同对象回读已查；日历空白不等于精力或现实空闲 |
| 日历与提醒 | 事件/待办/截止/提醒/时间块、时区、重复/例外、单调版本、同对象变更与撤销 | 实际保存/接受/重开、重复例外、删除恢复与旧撤销冲突有证据；本机完成不改变学校官方计次 |
| 持续托付与机会 | 真实原话/来源/期限/停止条件；来源变化、陌生变化、时间节点、材料到期复核 | 无probe广义托付已真实收到课程地点变化并由 Luna 安静准备路线；暂停/停止/重启及混合可读范围分别核对 |
| 帮助材料与投递 | prepare/wait/ask/notify/none、版本/过期/当前权限复核、消息helpRefs和实际展示回执 | 已查实际内联材料与抑制重复建议；提交、送达、已看不互相冒称，通知状态受OS能力限制 |
| 缓存、并发与子代理 | 工具事实缓存、显式等价范围共享、独立等待者取消；真实delegate、快照/共享预算/父消费 | 实际公开天气共享读取、真实子代理与取消/迟到结果有回执；供应商未报告缓存指标时保持未知 |
| 对话动态场景 | OpenUI 1.0.1有限组件库、Map/Weather Scene、精确版本视图和语义选择 | 实际地图多停靠/返程、选“这里”、日级天气选日期后保存安排等已查；不是任意UI生成/客户端工具执行器 |
| 地图与空间 | 唯一公共地理/步行图，暖灰金空间地图、实际相机、同surface内嵌/聚焦、平面回退 | 总览/俯视/斜视/路线/建筑聚焦、平移缩放旋转/手动接管/真实无WebGL已查；现场通行、室内路线和全部事实精度未闭合 |
| 天气与公开研究 | 公开参考地点、当地日期/小时窗口及覆盖；公共搜索、域名限制、网页/PDF续读 | 实际公开天气与小时窗口有回执；WeatherScene仍是日级且当前标题保留“杭州”，不宣称任意地点标题已适配；预报不是现场观测，偏题搜索仍可为partial |
| 资料/PDF与图片 | 用户选定TXT/MD/PDF、原文/定位/检索、PDF文字层/表格候选/真实页面像素、图片输入与数学排版 | Windows原生PDF与实际资料流程有历史证据；无OCR和任意Office格式承诺，新的并排阅读工作区另见下节 |
| 校园适配 | 本地导入与用户另装账号连接器、按资源细分权限/覆盖/回执 | 适配和隔离机制已接；没有本轮真实大学账号/全部分页资源验收，不把连接配置存在当作读取成功 |
| 对外草稿与公开展示 | 受众投影、可编辑候选、选定内容与桌面公开展示/返回私聊 | 属于准备与显示，不等于邮件/钉钉发送；桌面展示也不是公开地图Site |
| 外观与陪伴形象 | 阅读主题/密度/字号；新增形象/窗景/自选图/少动态/静坐组件与导航接入 | 新前端仍在实现与收敛，本轮只核对代码与已有设计记录；不将图稿或旧验收升级为整体验收 |

入口和状态所有者见[项目导航](../PROJECT_NAVIGATION.md)，机制见[架构](ARCHITECTURE.md)，用户利益与设计方法见[产品约定](PRODUCT_CONTRACT.md)。

<a id="frontend-evolution"></a>
## 当前前端演进与动态界面

2026-10-18 图像优先续作保存点：本轮先逐张看22张旧图和29张归档图，补11张场景图及祥子／睦／凪3张人物，再推进资料并排阅读、自由人物图库、日期／托付入口、纸面笔记及阅读／人格设置。过程中 main 补入原始设计对话，本轮已先读第一行再读全文，并按 Git blob SHA 校对所有原图，保持新加入的资料与维护文件。详细映射见 [DESIGN_IMAGE_COVERAGE](DESIGN_IMAGE_COVERAGE.md)。

用户要求在工作未结束时先把图片和修改保存到仓库。这是继续工作的保存点：真实 Electron 已操作上述主要入口，最新源码类型检查通过；最后几处窄窗／输入高度／资料取消修正尚需复看，笔记并发解决后的跨重启持久化仍在核查。Linux 环境检查了有效PDF无法打开时的恢复及原件导出，未将其称为 Windows 原生PDF页面验收。整体检查尚未整理为完整结论；下文较早的记录保持其原有时间和范围。


已完成的对话内地图与动态界面沿用原 `App`、消息/输入、Hermes、工具和行动记录；`Message.scenes` 保存事实，`Message.views` 保存验证后的呈现。地图的旅程、每次停靠及有向路段各有身份，重复回到同一地点不会被合并丢失。地点、天气日期、路段的临时选择通过下一轮普通消息续接，不自动改日历或变为长期偏好。

内嵌与聚焦共用一个挂载的地图surface，消息或步骤更新不重建地图，离屏释放绘图资源并保留占位/窗口内观看状态。手势、新原话、停止与卸载取消旧镜头；预览不等于设备移动或真实到达。历史显示当时快照，不隐式刷新成最新天气或课表。完整调用与边界见[对话场景](CONVERSATION_SCENES.md)。

另一条前端工作正在落实“窗边的在场”：主导航“聊天／今天／留下”、头像菜单、可选陪伴形象/窗景、自选图片与减少动态；`CompanionProvider`、`companion.tsx`、`CompanionSettings.tsx` 等已落盘。它还覆盖首页/长对话、记事本、安排、学习原文与对话并排等体验。当前组件、接线和最终运行证据随该工作继续演进；本次文档同步没有运行该轮新前端，也没有将全套设计图记为功能全部完成。

陪伴外观保存在 renderer localStorage，和主机中版本化文字人格、记忆、权限分开；`RestSpace` 是本窗口里的安静停留界面。SQLite 导出不包含这些自选图片与外观键。当前设置页已在主机清理成功后接入 `resetCompanion`，但一个数据库清理回执本身不能证明窗口图片和所有阅读偏好已删除；这条新前端完整清理路径仍待对应运行验收。内置图片的生成记录、文件对应和发布权利边界见[资产来源](ASSET_PROVENANCE.md)。

## 运行条件与证据时间

普通启动仍以 DeepSeek 为生产默认；测试通过显式 `dev:luna:test` / `start:luna:test` 使用已有Codex账号的 GPT‑6 Luna Max。代测只替换传输，Hermes、工具、资料范围和执行仍由宿主控制；没有 DeepSeek key 时的合法代测就绪与后台调度已接通。生产常量/协议、代测标识与锁定引擎定位见项目导航，不能把Luna链路当作通用生产ChatGPT登录。

2026-10-18 学生Harness集成时，Node 24.18.0/npm 11.16.0 的类型检查、桌面与公共地图构建通过，现有122项检查和锁定Hermes的9项原生检查通过。实际模型仅使用Luna，未测试调用DeepSeek。该记录早于后续整套前端创新改动，**不代表当前进行中的前端已重新通过这些检查**；本次文档更新只做内容、来源、路径、命令与一致性核对。

同日实际学生对话完成本地课程换楼、约饭与学习块比较、接受原对象修改、路线/小时天气、当前纠正、后台安静准备和停止后正常重开不复活。学习块保持同ID的90分钟，18:00改20:00并持久；广义托付不需可选轮询也收到课程变化并准备东3到东1的公共路线。模型用到的来源/版本、早期失败与修复回执保留本地，详见[STUDENT_HARNESS](STUDENT_HARNESS.md)。

对话场景另有实际东3→西1、多停靠/返程、“这里”选择、用户自述到达、日级天气选日期后写入一小时本地安排的记录。静态机制、Hermes合成宿主、实际Luna合成生活事实、公开天气/地图、真实用户账号与设备的证据分开；128场景是需求覆盖，不是128项实际模型通过率。

公共地图Site的既有105项机制检查/9项Hermes、clean-clone/CI/浏览器场景记录保留在[CLOUD_REVIEW](CLOUD_REVIEW.md)的历史发布区。本机当前构建、源码提交和线上部署身份分别管理。

2026-10-18 源码同步前，当前 Windows checkout 的 `npm run check`、`npm test`（122/122）、`npm run test:hermes`（9/9）、`npm run build`、`node scripts/check-review.mjs`、`node scripts/desktop-smoke.mjs` 和 `node scripts/pdf-smoke.mjs` 均通过。Electron 隔离启动实际进入共享地图，版本为 `campus-v3-f86b9ec6a26fb2b2`，未报页面错误；Hermes 检查使用合成模型回调，没有调用 DeepSeek 或真实私人账号。Chrome 实际查看空间斜视、俯视、建筑聚焦与步行路线，操作了平移、缩放、旋转、路线全览及预览/退出；临时令本地页面的 WebGL 探针不可用后，实际进入 `canvas-2d-fallback` 并通过搜索重算同一965米路线，确认地图、标注和完整路线可见，随后恢复浏览器图形环境。这些是本轮源码与地图检查，不覆盖实际模型、真实校园账户、物理地物准确性或既有线上Site部署。

## 未完成的生产连接与共有限制

- 校园查询需要另装并私下认证的连接器。当前考试发布、逐次课表/临时例外、GPA规则、校园卡单位及每页覆盖须看具体资源契约；没有本轮真实账号读取证明。
- 校园预约/选课/付款、邮件或钉钉发送、手机GPS/健康/同步、语音输入、通用生产ChatGPT登录没有完成的服务闭环。未接入时提供已有本地记录、手动起点或可审阅草稿，不伪造外部成功。
- 桌面退出后机会轮询停止；没有托盘/远程持续宿主或手机常驻的当前保证。OS通知只能证明其实际回执等级，不能把提交写成送达或已读。
- 数据库整体未加密；凭据按系统机制另存，不能由此推出正文加密。备份/恢复必须保留隐私fence，不能用旧备份恢复已忘资料。
- 新前端外观localStorage和主机业务导出/清除覆盖不同；设置页新增的陪伴清理接线、新并排资料入口与整套视觉体验需另行验收。
- PDF无OCR，搜索相关性和未读网页不能当事实核验。缺工具、来源未读、读取失败、结果部分与现实不存在分别表达。
- 原生窗口拖动、部分系统缩放/输入法和不同设备上的长期使用仍需对应实机证据。已有机制检查不能替代真实相处反馈。

迁移、回退和手机/外部宿主可行性见[学生Harness](STUDENT_HARNESS.md)。公开预览不含助手、账号、个人overlay、设备定位、笔记或模型服务；其构建与发布边界见[部署说明](DEPLOYMENT.md)。

## 地图实现细节与事实边界

以下保留当前地图工程的细项说明，避免全系统总览丢失既有地理、来源和显示责任。这些行为不等于现场测绘、入口开放或整图事实验收；数据源和再分发以[资产来源](ASSET_PROVENANCE.md)、[地图SOURCE](../assets/map-v2/SOURCE.md)及公共审查记录为准。

The five reviewed metro stations (蒋村、三坝、虾龙圩、三墩、浙大紫金港) are treated as underground station references, so their source polygons no longer paint over streets as ground buildings. Their 26 exact source-boundary entrance nodes are available for walking endpoints and exit selection. Eight nodes already belong to the retained graph; missing exterior links remain explicit obstacle-checked estimates from the recorded entrance, including its own source-linked canopy. The 37 explicitly underground station ways remain retained and conditional, and are omitted from ordinary surface-road ink. Exit opening, station interiors and physical access are not certified; this is walking access, not transit routing.

Route endpoint names include the selected metro exit. At narrow widths, A and B occupy separate rows and the full-route action wraps below the distance, preserving readable place/exit names and distance units. The same layout applies to compact route preview and the existing entrance selector.

浙江省档案馆 now has an explicit display interpretation of a central tower, low connected wings, two court openings and an east-facing entrance. The published architect's description reports 15 levels and 67.2 metres for the main building; the 17.5-metre low wings, part positions, facade rhythm and entrance proportions are cartographic choices. The model remains `cartographic-proxy`, with unregistered building-part footprints and unknown actual entrance clearance. It replaces the site-sized display slab while retaining the original site record, place identity, reference point and estimated route access. Physical ground/entrance acceptance and reference derivative-use review remain open.
This repository contains the complete implemented desktop product and the integrated V3 map. It is not a promise that every historical aspiration is implemented.

The map is a 2026-09-10 public-source snapshot with project V3 display refinements. Door access, opening hours, construction changes, exact roof heights, some southern banks and complete indoor routes remain uncertain. Dashed access is an estimate; the sport markings are illustrative. WebGL fallback is planar and cannot provide a spatial camera. Review has no device location or personal bindings. Its existing theme is applied before data loading so loading, errors and the completed map share the same theme.

Shared place search matches nonempty category or unit words literally when name normalization would remove the entire query. Specific public names containing those words appear before descriptor-only names and alias-only matches; all matching names and aliases remain in the result pool. Queries such as “宿舍” therefore return matching names and aliases instead of the empty browse list. Chinese numbered names normalize single digits and tens, so “二十三幢” can match “23幢”; clearing the query restores ordinary browsing. Search does not certify an alias's physical identity or automatically confirm a category query as one place.

Shared snapshots distinguish retained name/spatial correspondence candidates, explicit links recorded in the existing source observations, and standalone official references. The original correspondence assertion remains in `reportedBasis`; recorded links retain their exact metadata locator. Neither an alias produced by a nearby-point match nor a recorded link establishes current physical identity. Lookup targets, names, aliases and coordinates remain available. Snapshot callers receive a copy of these facts and cannot alter later lookups by editing the returned correspondence table.

Published foot restrictions are applied to explicitly traced source segments without replacing their stored coordinates or removing graph records. The four retained western Xiyuan Road segments now carry the source's literal `foot=no`; the walker rejects prohibited foot access in both ordinary and unknown-passage modes. Source-ID deletion alone does not close a road: retained segments may have moved into another published source way. This access repair leaves the wider source correspondence and physical verification gates open.

Source publication correspondence distinguishes a lost connection from a changed vertex or source-way identifier. The 2026-10-13 focused review of eleven retained segments across seven ways found continuous current node chains, including the former way/414673399 members now in way/414673393. Added shape vertices and bus-stop positions add no published foot restriction; the existing gate remains a separate condition. The obsolete whole-map-version switch for these eleven segments has been removed. Retained coordinates and weights are unchanged, and this source-topology correspondence does not certify present-day ground access or positional accuracy.

Routes with graph-node endpoints retain their endpoint type when reopened, recalculated or rebound after a place-catalog refresh. The route service still validates those nodes against the current graph. Both renderers share one current endpoint resolver for marker/name display, including points absent from the place catalog; clearing or changing the selection replaces those records. Route coordinates and used entrances apply only to the matching selected endpoint, so a previous route cannot move a newly selected place's marker to another building's entrance. Recorded-entrance controls appear only when a current endpoint has entrance records. Derived graph nodes identify the local graph instead of claiming an OpenStreetMap node URL. Close endpoint names can use opposite sides of their markers in both renderers, retaining a clear placement during camera movement. Names, markers and source coordinates remain present.

The mesh path rejects exactly collapsed triangles in its actual Float32 draw coordinates, while retaining thin and open surfaces. Repeated roof faces no longer cancel their outside rim. Exact source structure maintenance unifies internal shared polygon boundaries while retaining occupied areas, source members and all entity IDs; it also supplies the island generator's 15 missing detail parent IDs. The shared loader retains compatibility with the older omitted fields. A source-history road can contain ordinary and conditional segments; its runtime display follows default graph segments instead of hiding the entire way, while the original source and all graph edges remain intact. Display unions compose existing source and wing polygons in the same calculation frame to avoid a boundary fold on export. The importer preserves recorded width and mode access tags as source metadata, independently of screen line widths and current access verification. The planar renderer draws route halos below all foreground segments so known-road segments remain visibly continuous, while estimated access retains its dashed style. These repairs do not certify source shapes, heights, image registration or full-map coverage.

A selected display-part retains a visible outline of its own stored plan in the spatial renderer, even when the aggregate model owns the visible volume. The original part ID, caption, entrance and route target remain separate. The outline is a selection state, not evidence of a physical parent relationship or a replacement building volume.

Simple building volumes use the same uncut local Float32 plans as ground fills, at their existing stored heights and bases. All building drawing, visible-surface picking and caption occlusion use those actual mesh triangles; the obsolete native extrusion layers and duplicate silhouette calculation have been removed. Selected, hover and cutaway states remain on this shared path. Source geometry, authored parts, height evidence and routing remain unchanged; retaining a stored height does not certify its physical accuracy.

Ground road strokes draw subdued surrounding roads before campus roads, so their round ends do not cover campus continuations at shared junctions. The planar fallback uses the same priority and draws bridge casings below bridge foreground strokes. This changes display order only; road coordinates, recorded widths and routing remain unchanged.

MapLibre ground fills use uncut local Float32 triangles instead of independently simplified integer tile rings. Existing shared junctions within a declared sports venue are inserted on both derived boundaries before triangulation; source files and physical dimensions are unchanged. The same triangles drive fill picking, including courtyard holes. The existing cartographic colors, opacities, layer order, camera and planar fallback remain in use. Source accuracy and the remaining all-map factual gates require their own checks; this renderer repair does not certify them.

Solid polygon boundaries, contact shadows and selected shores use the same uncut local Float32 plane. Their original screen widths, joins, opacity, theme and state expressions remain authoritative; a shared temporary GPU ink buffer prevents overlapping stroke segments from repeatedly accumulating opacity. Ordinary road centrelines and dashed outlines retain native rendering. The recorded narrow water gap and elevator outline remain at their source positions; preserving their draw coordinates does not approve their physical shape or source relationship.

The spatial renderer clips a soft bank shadow inside the existing water triangles, including island holes. The shadow fades at overview scales and remains below roads and bridge decks; it adds no physical bank height, water depth or source geometry. Compatibility views retain their planar water and shore treatment. A selected water body uses one selected caption instead of also drawing its ordinary water label.

Graphics restoration rebuilds custom ground and volume layers from the current public snapshot and recomputes derived label/cutaway state, retaining the current camera, selection and route. Development module refresh preserves the current camera and does not repeat an already-applied review scene. The earlier Canvas capture/composition timing observation remains unresolved; these lifecycle repairs do not establish its root cause.

Ordinary and browsing captions include current search results, controls, cards and footer occupancy in their placement. MapLibre uses transparent collision reservations and alternate text anchors; those reservations remain at the view centre with pixel offsets so perspective does not shrink the protected screen area. Retired reservation images are collected when the map becomes idle, after asynchronous source tiles stop requesting them. Canvas uses its actual text ink dimensions and tries nearby clear offsets before existing decluttering. Route endpoint names retain their required marker/fit behavior. “查看全路线” compacts expanded details before measuring the available viewport; details remain reopenable and later user gestures cancel the pending fit. These are display-only positions: source geometries, names, place IDs and route distances are unchanged. A label that has no clear ordinary placement remains searchable/selectable under the existing priority rules; this mechanism does not certify every name, source identity or full-map visual review.

The planar fallback selects visible point labels and current endpoint markers through their actual draw geometry. Named water bodies use the same identity masks and island holes as the spatial renderer; visible bridge strokes retain their screen hit region. Ordinary labels do not steal clicks inside another building. Generic reference-place cards retain the reference/access uncertainty without calling roads or bridges building footprints. The planar fallback centers A/B letters inside route endpoint markers and places the corresponding name above the same endpoint. A missing or mismatched route retains the selected place's own anchor and role prefix. This separates the two labels without changing source coordinates, routes or ordinary place labels.

Pedestrian road polygons use the shared paving color in the spatial renderer and both planar paths, with source holes retained. Their boundaries stay distinct from road centreline strokes. The compatibility renderer classifies its copied features with a separate pedestrian-area drawing kind; source facts remain roads. This reuses the WebGL 1 kind input rather than adding a geometry-type attribute that can exceed its stroke shader limit. The Canvas style cache separates geometry types so a same-tag road line cannot inherit a polygon fill. Light paving is lighter than building footprints. Source coordinates, measured-width claims and routing remain unchanged.

Ordinary footways and steps remain traceable at overview scales. The spatial renderer changes their opaque ink tone continuously with zoom, using the same tone for bridge decks and approaches; it no longer hides the whole ordinary-path layer below zoom 15.3. Compatibility views likewise retain path ink instead of dropping the class at a resolution threshold. Historical and covered paths retain their distinct styles and access semantics.

The planar renderer checks its first frame during initialization. A working context probe followed by a shader/style initialization failure now switches to the existing Canvas geography layer, using the same source and camera as context-loss recovery. Readiness begins false and is set by render completion; an initialization fallback retains its reason for diagnostics. A failure of the Canvas path still reaches the existing map error handling.

Compatibility captions now apply the same historical-reference policy as the spatial renderer: old source records remain accessible by their stable IDs, while their ordinary captions do not label a rebuilt site as current. A selected old record is identified as such in search and place details. Reference-point geometry alone no longer claims an official source, and old-directory references are distinguished in duplicate search results. A personal annotation keeps its existing precedence.

Spatial captions declare the existing Noto Sans SC font files with the package's Unicode ranges. Chinese characters therefore load their own packaged subset instead of being assigned to a Latin-only file and falling through to a system font. Light-theme ordinary, selected, endpoint and road captions use narrower halos so pale outlines do not wash out their dark letterforms; dark-theme halos retain their previous contrast treatment.

Sports surfaces share their existing role-based colors and opacity across the spatial map and Canvas fallback. The fallback no longer applies dark literals in the light theme, and its cache keeps tracks, court groups, runoffs and indoor venues distinct.

Route fitting reserves the current controls, card and endpoint text. MapLibre can refine the requested view from its placed caption boxes after rendering; a newer gesture, route or disposal cancels that correction. Camera navigation limits and minimum zoom accommodate the requested fitted viewport without changing the source AOI or map coverage. Canvas uses its actual font line height and wrapped names, and can zoom out enough for a long route behind a large card. Endpoint names sit above their markers as complete text blocks. Selected Canvas names participate in the existing label-placement priority while remaining visible; ordinary names remain searchable and selectable, and entrance markers are retained.

Route preview controls and map marks share one state. Preview uses a compact endpoint/progress card so the expanded route information does not cover the path; starting it focuses the slider and preserves the camera. Conditional routes retain a hypothesis label in this compact state. Ending preview restores the route information. Ending preview, showing the whole route, choosing another place or receiving a recalculated route clears the old preview line and point in both renderers.

An explicit inactive bridge tag in the source becomes a separate runtime route condition, alongside any gate-opening condition. Hypothetical route warnings distinguish historical bridges, old paths in redeveloped sites, indoor passages and gates, including conditions on the selected access points even when no graph edge is used. Unknown conditions retain a general uncertainty statement. The loader preserves all nodes, edges, distances and original bridge flags; a historical tag is not a present-day access or structure survey.

The named East-one gate retains reopening uncertainty from the [2026-09-30 university notice](http://www.zwc.zju.edu.cn/2026/0930/c22012a3210902/page.htm). Its existing access candidates require the explicit hypothesis option; the expected completion date and possible early completion do not establish that walking access has resumed. This updates the named endpoint qualification without moving its reference position, changing road geometry or declaring an entire nearby road closed. The exact construction interval and current access still require their own evidence.

Ground and architectural materials share one warm stone/gray/gold palette, with distinct graphite water and restrained vegetation. Architectural frames remain distinct from walls, and a restrained height gradient shades all materials of each building consistently. Both spatial and compatibility renderers paint waterway centreline ink beneath the merged water surface; explicit tunnel tags determine covered waterways, while a negative layer alone does not. Covered water remains traceable with fine dashed water ink at district scales. Canvas water highlighting keeps the water color and emphasizes the named display shore, retaining island holes and avoiding acquisition seams. Road shoulders precede joining path ink. Service roads have less display weight than main roads, and bridge ink follows its approaching road's color. Authored walls and glazing use a visible-surface depth pass before translucent color, retaining selection, cutaways and the original plans.

All explicitly open acquired waterways contribute continuous display ribbons. Existing interpreted widths and source width tags take precedence; other widths are bounded cartographic proxies informed by the source waterway class and recorded water surfaces. Exposed ribbons ease into the adjoining acquired bank cross-section, instead of producing square steps or triangular slivers at acquisition boundaries. One shared generator owns this composition, with source islands, buildings and retained island paving protected. These display banks neither certify physical widths nor alter the ground geometry or route graph. Temporary reference-point access uses the same explicit-tunnel distinction, so a negative layer alone no longer removes an open-water obstacle.

The gym's radial roof joints are antialiased material on the retained curved roof instead of competing strips of mesh. The swimming hall's roof and equipment panels are split at the same existing slope changes so their surfaces no longer cut through one another; its stored height and plan are unchanged. Floating glass controls clip their blurred backdrop to their rounded borders, including during entry animation, so the blur does not cover the map in rectangular patches.

Explicit historical bridge tags use a dashed trace instead of ordinary road ink, sharing their classification with the existing route-condition policy without claiming the bridge is open or absent today. Nearby repeated official-reference captions are consolidated for display: old/current copies and broad names beside numbered-building names remain separate records and search results. Selecting a reference preserves its own caption and position; mapped features and personal markers are excluded from this consolidation.

Seven agricultural-compound display parents use a common illustrative vertical module, continuous adjoining upper wings and fewer unsupported roof protrusions. Their prior display heights and observation basis remain recorded; the new `cartographic-proxy` designation explicitly does not certify physical heights, storey counts, footprint registration or source permissions. Ground plans, all feature/place IDs, entrances and route graph records remain intact. The all-map factual, coverage and release gates remain open.

The biosystems group unions its three retained source wings before drawing one continuous illustrative roof level, removing redundant full-height walls at their joins. Animal Science retains its two oblique arms with a single illustrative height step at their neck. These adjustments change the display massing only; the source plans and existing courtyard openings stay in place.

The west running track now has illustrative lane divisions generated inside its own retained display ring. Its physical `laneCount` remains unknown; `displayLaneCount` and the marking basis distinguish the drawing from an observation. The east track retains its separate geometry and recorded count. No source ring, facility identity, route, lap measurement or original sports detail is replaced.

Road display retains explicit tunnel and covered-passage sections for all road classes, including sections without a layer tag. Stair symbols stay distinct from ordinary paths. Plan view can trace a recorded building passage through the upper outline; that trace moves below the model during the spatial-camera transition. The east teaching gallery and two Yunfeng links retain upper decks while exposing their recorded ground crossings; Meng Minwei's lower west wings also leave openings along the recorded service passage. Decks, supports, widths and clearance remain schematic. Their upper-outline projections no longer add a duplicate solid ground fill in the spatial renderer. The importer retains the source's covered/service tags, while routing permissions, edge weights and coordinates remain independent. Compatibility renderers share these road classifications and no longer narrow a road solely because it crosses the campus display boundary.

Bridge decks have their own butt-ended casing above ground roads, while retaining their approach's road ink width. Compatibility renderers use the same foreground order and keep pedestrian color continuous across the campus display boundary. This changes cartography, not source layer tags, route connectivity or access qualification. Control-caption reservations retain their pixel vectors as style literals, so GeoJSON tile serialization cannot turn them into strings and place them all at the map centre. The unused visual-study style and caption alternatives have been removed from the production engine.

Simple extruded buildings use continuous roof surfaces, matching the authored models' material relationship. Their roofs no longer show the ground fill and shadow underneath as patches. Masonry and simple-volume walls move from overview translucency to solid color with close facade detail or a large projected wall height. Tall buildings therefore do not show underlying roads as wall markings while the map is still at a district zoom. Glass and deliberate route cutaways keep their separate transparency. This material treatment changes no plans or heights.

The small existing outline beside 蓝田3舍, way/543896552, has a simple 3.5-metre display proxy. Its current published source shares two boundary nodes with 蓝田3舍 but supplies no height; the proxy does not certify a separate apartment building, an entrance or physical parentage. Its original identity, source tag, ground plan and estimated access candidates remain intact. Explicit proxies live in the existing fidelity observations, and sourced heights or authored models take precedence during generation.

Twenty-eight existing residential outlines in 耀江文鼎苑 use simple display proxies grouped at 36, 60 and 72 metres. These are cartographic choices for the recorded long-block, point-block and diagonal groups, not measured heights or verified floor counts. The source outline labelled 14幢 retains its footprint while its negative-layer interpretation remains unresolved. All 29 recorded numbers gain explicit 文鼎苑/耀江文鼎苑 search aliases; names, IDs, coordinates and access candidates are retained. The surrounding source still has incomplete building correspondence and access coverage.

“从这里选路” explicitly starts a new pair from the currently browsed place, clearing the old destination and per-endpoint entrance choices. It no longer resumes a previous origin merely because an earlier route was ready. The ordinary two-point mode toggle retains its existing resume behavior. Place-card accessibility labels now follow the actual expand/collapse action.

Supplemental building references without recorded access use the same bounded obstacle-aware estimate as temporary and personal references. The adapter derives public access candidates and graph splits in memory, retaining source nodes, source-edge mapping, distances and restrictions without rewriting the acquired graph. Water, open channels, walls, gates, other buildings and explicit foot prohibitions remain barriers. The 80-metre limit and six-candidate limit are unchanged. These connections remain dashed reference-to-road estimates, not surveyed doors or indoor routes; no physical entrance is added to the catalog.

A route that actually uses an unresolved edge or access condition keeps the title “假设路线” after its details close, and “假设预览” during compact preview. Recorded ordinary sections stay solid; conditional sections and estimated access keep their respective dashed styles in spatial and compatibility views. Preview and reveal emphasis use matching dash widths and origins, so a moving highlight cannot fill the gaps and imply confirmed passage. Merely enabling the option does not label a route hypothetical if the selected route uses no such condition.

The shared mesh export and current-snapshot normalizer discard only exactly zero-area triangles, preserving all nonzero faces and material groups without changing plans, heights, identities or the road graph. The normalizer retains the supplementary building input in component hashes. These structural repairs do not establish physical building accuracy or full-map acceptance.

For the current clean-clone/CI/browser evidence and scope see docs/CLOUD_REVIEW.md; use the repository commit SHA in every subsequent review or change request.
