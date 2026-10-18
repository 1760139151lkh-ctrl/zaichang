# 项目导航

本文件是当前项目的入口、职责与文件索引，核对日期为 **2026-10-18**。以实际 checkout 和所述调用链为准；本轮源码包含学生 Harness、对话场景与前端演进，源码提交、线上部署和历史验收分别记录。[当前状态](docs/CURRENT_STATUS.md)维护功能与证据，[架构](docs/ARCHITECTURE.md)解释运行机制。

<a id="strategy"></a>
## 当前策略

- 面向大学生日常生活，以自然语言和持续事项为主入口；查询、学习、规划、陪伴和兴趣并存，不把学生等同于成绩或待办。
- 模型解释原话、发现所需工具、调查并改判；宿主验证范围、权限、预算、版本和动作。沿用一个固定 Hermes 主循环，不按生活主题写生产分支表。
- 有授权的托付可以持续发现变化并安静准备；邀请、建议、接受、本机登记和外部执行分开。未知或未接入的来源保留缺口。
- 首个校园是浙江大学紫金港；校园适配器、公共地图、公共天气和用户本机记录分别接入，不把独立模块存在当作当前账号可用。
- 普通产品默认 DeepSeek；实际模型代测仅用显式 Luna Max 通道。DeepSeek 常量/协议位于 `src/shared/types.ts` / `src/main/provider.ts`；`src/shared/model-contract.json` 当前只记录 Luna 标识。Hermes 版本以 `runtime/hermes/lock.json` 为准。
- 桌面承载完整助手，review-web 仅发布公共地图。手机、生产 ChatGPT 登录、校园写入及外发服务仍是独立接入里程碑。
- 前端正向“窗边的在场”演进：视觉形象与文字人格分开，内容与操作优先。设计稿、组件落盘、接线和体验验收分层记录，见[前端进展](docs/CURRENT_STATUS.md#frontend-evolution)。

## 从哪读起

| 文档 | 维护责任 |
| --- | --- |
| [README](README.md) | 面向新读者的项目介绍、功能总览、安装与开发入口 |
| [AGENTS](AGENTS.md) | 仓库协作、状态所有者、授权／隐私、验证与发布约束 |
| 本文件 | 代码路径、职责、跨层调用链和文档入口 |
| [PRODUCT_CONTRACT](docs/PRODUCT_CONTRACT.md) | 设计理念、用户决定权、低负担体验及各类对象的产品边界 |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 单主循环、上下文／工具／存储／行动与显示层机制 |
| [CURRENT_STATUS](docs/CURRENT_STATUS.md) | 当前功能、接入程度、证据时间、进行中工作与真实缺口 |
| [STUDENT_HARNESS](docs/STUDENT_HARNESS.md) | 学生生活联动、迁移回退、已完成验证及128条需求归属／T8边界 |
| [CONVERSATION_SCENES](docs/CONVERSATION_SCENES.md) | Scene/View/语义选择、内嵌地图、天气及动态呈现契约 |
| [CLOUD_REVIEW](docs/CLOUD_REVIEW.md) | 公共地图的本地/历史线上场景、操作和证据范围 |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | 构建、打包、公共产物导出与实际发布的区别 |
| [ASSET_PROVENANCE](docs/ASSET_PROVENANCE.md) | 地图、模型、字体、引擎、UI图片和用户图片的来源／再分发边界 |
| [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md) | 第三方软件和数据许可索引；不修改 `licenses/` 上游原文 |
| [地图 SOURCE](assets/map-v2/SOURCE.md) | 当前地图数据说明与有日期的历史研究观察；随源码提交，原始研究输入仍留本地 |
| `assets/design/generated/01a14ed0-bc5b-7403-9599-b0c0f3c19589/` | 用户指定的29张生成图片原文件归档，文件名与字节保留；`manifest.json` 记录尺寸与哈希，不是运行时依赖 |
| `.agents/skills/project-navigation/SKILL.md` | 本机定位与索引方法；引用本导航，不承担运行时路由或授权 |
| `.agents/skills/project-foundations/SKILL.md` | 本机使命与用户利益指引；当前策略与实现状态回到本导航 |
| `.agents/skills/product-design/SKILL.md` | 本机体验设计方法；原则和实际采用／验证证据分开 |
| [.env.example](.env.example) | 可选连接器和独立本机数据目录示例；不包含密钥或已登录账户 |

`package.json`、`.nvmrc`、`.env.example`、`.devcontainer/`、`.github/workflows/` 和构建脚本是命令与工具链的实际依据；文档引用它们，不维护另一套配置。运行时 `prompts/` 属于产品行为输入；文档同步不会把研究包、场景答案或私人对话写入其中。

<a id="user"></a>
## 用户相关对象与状态所有者

| 对象 | 权威状态与边界 |
| --- | --- |
| 当前原话、聊天、草稿与附件 | `Store` / `storage/drafts.ts` / `materials/service.ts`；读取、留存、传输分别控制，临时会话结束按自己的生命周期清理 |
| 用户可编辑笔记 | `NotesService`，原文/CAS/历史/回收站；内容不是自动人物断言或行动指令 |
| 文字角色与交互偏好 | `shared/persona.ts`、`shared/interaction.ts` 和 Store settings；版本化明确设定，混合私人旧 guidance 留在私有迁移记录 |
| 个人理解 | evidence/assertion、`memory/service.ts`；来源、条件、有效性、更正与遗忘，自动推断不改用户角色或权限 |
| 目标、承诺、商量中的事和准备资料 | `runtime/work.ts`、`cooperation.ts`、`attention.ts` 和 release 存储；区分假设、邀请、接受、停用与实际展示 |
| 本机安排与提醒 | `agenda`、`h_calendar_versions`、ActionRuntime 和 ReminderRuntime；同对象连续修订、明确提醒独立调度 |
| 学校记录 | `storage/domains.ts` 与真实连接器；本地导入和账号来源分开，细分权限、覆盖与业务版本不得被摘要改写 |
| 公共/私有空间 | 公共快照由 MapService 管理；个人地点绑定、设备位置和共享给模型的空间上下文另受范围控制 |
| 陪伴外观与阅读偏好 | renderer `companion.tsx` / `appearance.ts` 的 localStorage；与主机人格、数据库导出/清除分开，当前覆盖限制见状态文档 |
| 身份、凭据和授权 | main/PolicyKernel 的横切边界；不作为模型 Profile。scope 的 owner/workspace/subject/world/audience 约束不代表产品已提供多用户登录或跨设备同步 |

涉及本人、第三人、虚构角色或推演世界时，沿真实 scope 区分主体与世界；不要把未发生事件或示例用户并入本人记忆。公开展示使用经过投影和选择的产物，桌面公开展示不等于公共地图 Site。

## 按任务定位

完整路径相对仓库根；表内省略前缀的同组文件按所述 `src/main`、`src/renderer` 或 `src/shared` 层定位。`map-v2` 是现有磁盘/协议名称，manifest 的实现为 `campus-map/v3`。

| 任务／功能 | 入口与调用链 |
| --- | --- |
| 桌面启动与窗口生命周期 | `package.json` → `scripts/dev.mjs` / `scripts/build-electron.mjs` → `src/main/main.ts` → `preload.ts` → `src/renderer/main.tsx` / `App.tsx`；关闭握手保护未存草稿/笔记，退出结束计时器 |
| 工作区、历史与直接操作 | `Navigation.tsx`、`Workspace.tsx`、`App.tsx`；导航只切换已有视图，业务状态通过 Bridge 回到宿主 |
| 陪伴外观与安静空间 | `main.tsx` → `CompanionProvider` → `companion.tsx` / `CompanionSettings.tsx` / `companion.css`；形象/窗景、自选图、少动态与 `RestSpace`，接线进展独立记录 |
| 对话与主模型 | `App.tsx` → `preload.ts` IPC → `main.ts` → `harness.ts` → `runtime/hermes.ts` → `runtime/hermes/sidecar.py` → 锁定 `AIAgent`；模型请求和工具返回宿主 |
| 模型选择与网络 | `model-selection.ts`、`provider.ts`、`luna-provider.ts`、`network.ts`；`scripts/run-luna-test.mjs` 提供显式代测入口，不能由renderer或保存设置切换 |
| 原话控制、权限与用途 | `runtime/turn-controls.ts`、`controls.ts`、`policy.ts`、`read-purpose.ts`、`privacy-control.ts`、`action-delegation.ts`、`attention-boundary.ts`；发送前边界及每次实际操作均重新核查 |
| 上下文、来源与用量 | `runtime/context.ts`、`basis.ts`、`observation-review.ts`、`completion-review.ts`、`model-usage.ts`；按任务检索原始证据，记录实际来源/对象版本/工具与模型回执 |
| 工具发现与提供者 | `main/tools.ts` → `runtime/coordinator.ts` → `capabilities/broker.ts` → `builtin.ts` / `ports.ts` / 领域provider；共享预算和当前范围不交给插件自行扩大 |
| 缓存与真实委派 | `capabilities/broker.ts`、`runtime/cooperation.ts`、`collaboration.ts`、`hermes.ts` 和 sidecar；独立等待者取消、版本快照、父代理消费与旧结果失效 |
| 记忆与连续事项 | `memory/model.ts` / `service.ts` → `runtime/context.ts` / `work.ts` / `discourse.ts` → `storage/repository.ts`；`HarnessViews.tsx` 提供原话、更正、停用和忘记入口 |
| 记事本 | `shared/notes.ts` → `main/notes/service.ts` → `Store.notes` → notes IPC / scoped `manage_note` → `renderer/NotesPanel.tsx` / `notes.css`；`note_attention` 仅携带版本元数据 |
| 文字人格 | `shared/persona.ts` / `interaction.ts` → Store版本更新与旧guidance迁移 → `PersonaEditor.tsx` / `SettingsPanel.tsx`；`harness.ts` 在合法上下文注入纯角色，不依赖普通记忆开关 |
| 本地安排与版本／撤销 | `shared/calendar.ts` → `actions/calendar.ts` / `local-calendar.ts` / `runtime.ts` → `Store.writeAgendaProjection` / `deleteAction`；`LifePanels.tsx` / `Workspace.tsx` / App动作卡回读真实状态 |
| 情境、空闲与可行规划 | `capabilities/builtin.ts` → `actions/planning.ts` / `availability.ts`；`situation.read` 有界读取，`planning.preview` 计算冲突/未知并给版本绑定方案；接受后改原对象 |
| 持久变化发现与托付 | Store日历/NotesService事务 outbox → `runtime/coordinator.ts` → `storage/domains.ts` journal/cursor/ack → `attention.ts` / `work.ts`；处理更新、tombstone、时间节点、暂停恢复和范围内新机会 |
| 准备、投递与提醒恢复 | `runtime/attention.ts` / `cooperation.ts` → `actions/reminders.ts` / `runtime.ts` → h_jobs/h_deliveries；`PreparationShelf` / 消息helpRefs记录实际可见版本，明确提醒保留独立调度 |
| 对外草稿与桌面公开展示 | `runtime/release-store.ts` / `release-composer.ts` / `release-projection.ts` / `redaction.ts` / `presentation.ts` → `LifePanels.tsx`；选定产物、内容复核和返回私聊，不自动发送消息 |
| 资料、PDF与图像 | `shared/materials.ts` → `materials/service.ts` / `pdf.ts` / `worker.ts`；选择文件、绑定scope、分页原文/表格候选/实际页面像素；`scripts/material-runtime.mjs` 管原生依赖，新的并排阅读UI进展见状态 |
| 校园记录与外部连接 | `zjuAdapter.ts`、`capabilities/campus-query.ts` / `campus-reference.ts` / `builtin.ts`、`storage/domains.ts`；独立受限子进程连接器、细分资源权限、导入/账号来源与覆盖 |
| 公共研究 | `capabilities/research.ts` / `public-network.ts` → 公共搜索/网页/PDF读取；公开地址、域名限制和scope/URL/版本绑定的续读句柄 |
| 天气 | `capabilities/weather.ts` → `builtin.ts` 的 `weather.lookup`；公开参考地点/时区/日期/小时窗口与缺字段覆盖，日级Scene不推导小时结果 |
| 对话动态场景 | `shared/scenes.ts` → `runtime/scenes.ts` / coordinator → `Message.scenes/views` → `presentation/AssistantPresentation.tsx` → `map/ConversationMap.tsx` / `MapSurface` 或日级天气；`ChatInput.selection` 回传精确引用 |
| 地图给模型的投影 | `runtime/map-model-view.ts` 保留语义、条件和来源并精简绘图几何；`context.ts` 分别计原始读取字节和实际model-view token；完整Scene/Bridge路线不变 |
| 地图服务与路由 | `main/mapService.ts` / `mapStorage.ts` → `shared/map-v3.ts` / `map-v2.ts` → `shared/map-routing.ts`；验证组件hash、稳定ID、门点、估计接入、方向与通行条件 |
| 定位、个人地点与共享 | `mapLocation.ts`、`mapProfile.ts`、`runtime/spatial.ts`、`capabilities/spatial.ts`；Windows设备观察、私人profile和向本轮模型共享分开；review没有这些输入 |
| 共享地图与观看状态 | `CampusMap.tsx` / `ConversationMap.tsx` → `map-engine.ts` 或 `planar-map.ts`；`map-state.ts`、`map-types.ts`、`fit-layout.ts`、`native-caption-bounds.ts` 管选点、真实控件占用和可打断相机 |
| 几何、遮挡、材质与标注 | `ground-fills.ts`、`ground-strokes.ts`、`roof-surfaces.ts`、`mesh-geometry.ts`、`volume-edges.ts`、`surface-picking.ts`、`geometry-layer.ts`、`named-water.ts`、`road-semantics.ts`、`map-theme.ts` / `cartography.ts` / `gpu-style.ts`、`label-anchors.ts` 和 `shared/map-names.ts` |
| 公共review入口与隔离 | `apps/review-web/index.html` / `main.tsx` / `storage.ts` / `review.css` → 同一MapService/MapSurface/相机/路由；`vite.review.config.ts` 只选公共地图与许可 |
| 界面基础与阅读 | `renderer/design-system.css`、`tokens.css`、`style.css`、`refinements.css`、`ui.tsx`、`appearance.ts`、`RichText.tsx`、`time.ts`；Noto、Lucide与数学排版共用锁定依赖 |
| 数据库、恢复与隔离验证 | `main/store.ts`、`storage/repository.ts` / `domains.ts` / `drafts.ts`、`testBoundary.ts`；事务、隐私fence、原文索引、持久队列和独立合成数据边界 |
| 共用类型与结果契约 | `src/shared/types.ts`、`harness.ts`、`schemas.ts`、`limits.ts` 及领域shared文件；`main/runtime/structured-result.ts` / `semantics.ts` 处理结构化结果、规范化及语义指纹基础，不替代主模型理解 |
| 本地地图适配桥 | `src/main/mapBridge.ts` → `scripts/build-map-bridge.mjs` → 同源生成的stdio桥；只复用现有公共地图服务，生成产物不成为另一份源码真相 |
| 构建、依赖与发布 | `package.json`、`vite*.config.ts`、`scripts/setup-*.mjs` / `build-*.mjs` / `stage-hermes-runtime.mjs`、`.github/workflows/`；`export-review.mjs` 导出已构建公共产物，不自动发布 |
| 检查与样例 | `tests/`、`scripts/smoke.mjs` / `desktop-smoke.mjs` / `pdf-smoke.mjs` / `check-review.mjs`、`examples/campus.example.json`、`main/demo.ts`；明确样例与真实运行，文档同步不新增测试运行器 |

## 地图数据与生成维护

`package.json` records `release/life-fusion-map-v3-20261005-refinement-r3` as the Windows output directory. The previously recorded desktop shortcut targeted its `win-unpacked/在场.exe`; that record does not prove the current working tree has been repackaged or the shortcut now runs the latest source.

Map source and observation provenance is in docs/ASSET_PROVENANCE.md. Runtime uses the checked-in, hash-validated dataset and needs no external reference files. Optional data regeneration uses scripts/import-map.mjs, import-map-v2.mjs, build-map-v3.py and map_v3_*.py; it requires separately authorized official reference input through ZAICHANG_MAP_REFERENCE_DIR and Python geometry dependencies.

`fidelity-observations.json` can declare individual `displayVolumeProxies` for existing building IDs. `build-map-v3.py` applies them only to display and place descriptions when no height or authored model already exists; it leaves source geometry, source height fields and routing intact. These simple volumes are illustrative, with unknown physical height and use.

`map_v3_landmarks.py:archives_model` supplies the bounded 浙江省档案馆 display interpretation through that same production generator. It uses the retained site frame for a central tower, connected low wings and court openings; the large source outline is not extruded as one building. The authored projection and height descriptions stay separate from acquired ground geometry and access. Normal builds consume the saved model and need neither the reference photographs nor the optional research shapefiles.

The same file's `placeSearchContexts` explicitly lists source-area prefixes and member IDs with their retained source names. The generator adds these search aliases without renaming or merging places; spatial containment used during review is not a physical-identity assertion.

`fidelity-observations.json` also binds five individually reviewed underground stations to source versions, exact boundary entrance nodes and explicit underground passage ways. `shared/map-v3.ts` qualifies these records at adapter load: source polygons stay retained, display copies omit ground fills and show a selected dashed reference outline, and indoor passages carry a conditional routing restriction. `main/mapProfile.ts` derives estimated connections from the recorded entrances, exempting only their explicitly associated entrance canopy. `MapAccessCandidate.entranceId` keeps exit selection, route costs and captions consistent across both renderers; candidate costs are deduplicated per graph node after the selected entrance filter.

In the planar renderer, `planar-map.ts` derives a pedestrian-area drawing kind on its OpenLayers feature copies. `gpu-style.ts` uses that existing kind input for paving fills without adding a WebGL 1 shader attribute; source JSON and routing keep the original road kind. Initial GPU style failure and later context loss share the existing Canvas geography fallback.

`map-engine.ts` binds the packaged Noto Sans SC font files to their published Unicode ranges for MapLibre captions. The UI and map use the same installed font package; no external glyph service is required. `cartography.ts` owns theme-specific caption halos.

Exact source structure maintenance: scripts/map_topology.py normalizes only nonoverlapping valid polygon members sharing an internal boundary, retaining the source relation/member mapping; it also owns the shared removal of exactly zero-area surface triangles. scripts/normalize-map-topology.py reviews/applies these operations to the existing public snapshot, restores original detail parent IDs, and updates coherent component versions without rerunning image-derived modelling. Positive-area overlap, bad component rings and image alignment remain separate source-review obligations.

The canonical product entry is src/. Research bundles, archived copies, prior evaluation matrices, private assets and recovery notes may remain in ignored local directories; they are historical/local inputs, not another product implementation or publishing source.

See docs/ARCHITECTURE.md for behavior, docs/CURRENT_STATUS.md for current limitations and docs/CLOUD_REVIEW.md for deterministic scene URLs.

Public artifact export/deployment: scripts/export-review.mjs, apps/review-web/hosting.json and docs/DEPLOYMENT.md. The generated static checkout is ignored work output; src/ remains the sole implementation.

