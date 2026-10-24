# 项目导航

<a id="unified-entry-20261023"></a>

本页维护当前目录、职责与真实调用链，更新于2026-10-24。先读[README](README.md)、[AGENTS](AGENTS.md)、[当前状态](docs/CURRENT_STATUS.md)和[产品契约](docs/PRODUCT_CONTRACT.md)。当前允许全面创新、并行实施和同步现有仓库；历史暂停/单小块/只本地限制不再作为当前工作流。

## 本轮接续与视觉资产

[最新完整交接](docs/handoff/2026-10-24-stage02-restart/README.md)要求下一聊天先认识全貌、亲读第一阶段全部相关原件与源码，再以全新八路从第二阶段开头深做；[启动提示词](docs/handoff/2026-10-24-stage02-restart/新聊天启动提示词.md)可直接使用。路线图是下限，各阶段持续push、创新、亲验和修复后才交付。

前一轮按路线图从第一阶段重新精读和实施；[第一阶段记录](docs/evidence/2026-10-23-stage01.md)已收尾，包含真实桌面对话、旧路线回读失败与同触发修复、来源复核和当前检查结果。后续仍在每阶段团队全部收尾后再向前推进，下一阶段另开团队。

[第二阶段当前进展](docs/evidence/2026-10-23-stage02.md)记录教务/GPA、体艺校方通道、原生位置与地图运动；本阶段仍在实施，尚未进入第三阶段。 [体艺纯直连恢复](docs/evidence/2026-10-24-tiyi-direct-repair.md)记录官方业务协议、新认证与真实查询回执，不依赖 WebVPN。

| 入口 | 内容 |
| --- | --- |
| [深度评鉴总入口](前端视觉创新设计/2026-10-23-深度评鉴/README.md) | 本轮覆盖范围、清理、分类与分支/验证实际结果 |
| [全量逐图评鉴](前端视觉创新设计/2026-10-23-深度评鉴/全量图稿评鉴.md) / [catalog](前端视觉创新设计/2026-10-23-深度评鉴/catalog.json) | 图像身份、来源、A/B/C/D、优缺点、布局理由、功能和改造处方 |
| [视觉规范](FRONTEND_DESIGN.md) | 统一网格、四主题、青春原作角色、空背景重绘、Image管线与覆盖原则 |
| [逐页手术单](前端视觉创新设计/2026-10-23-深度评鉴/逐页手术单.md) | 当前运行界面与静态链路缺口、具体修复位置和验证边界 |
| [原始Prompt移交](前端视觉创新设计/2026-10-23-深度评鉴/原始Prompt移交.md) | 历史调用全文、新拟处方、错误传播风险、确实缺失的原记录 |
| [来源阅读](前端视觉创新设计/2026-10-23-深度评鉴/来源阅读与设计延拓.md) | 原始设计对话行号、设计主线与六项微创新契约 |
| [代码链路审计](前端视觉创新设计/2026-10-23-深度评鉴/代码链路审计.md) | 基于2155a0e的OpenUI/拖拽/业务回流静态审计及精确文案位置 |
| [下一阶段提示词](前端视觉创新设计/2026-10-23-深度评鉴/下一阶段深度优化与创新延拓提示词.md) | 可直接交给新对话的完整实施任务 |
| [深度演进与全端创新总主线](docs/REFACTOR_ROADMAP_2026-10-22.md) | 按段精读、消除人机话、全栈全端（含浙大体艺/GPS/手机版/平板版/模拟器/OpenUI万物原理）完整推进主线 |
| [后端与Harness总监技能](.agents/skills/zaichang-backend-director/SKILL.md) | 六层记忆、Hermes主循环、十角色活人演出、边做边说、主动陪伴、OpenUI与跨端扩展(`X01–X16`)永久规范 |
| [前端与视觉总监技能](.agents/skills/zaichang-frontend-director/SKILL.md) | 窗边在场美学、十角色多维矩阵、四步同景生图管线、光学对齐与交互动效永久规范 |

`前端视觉创新设计`是全部前端视觉来源和资产的统一入口。旧[统一图库](前端视觉创新设计/统一图库/README.md)与[来源记录](前端视觉创新设计/来源记录/)提供历史路径；本轮分类、剔除和新路径以catalog为准，不能用旧数量/approval字段恢复已删除错图。最初[图片来源对话](前端视觉创新设计/图片来源对话.md)保留原文。

本轮起点`2155a0e`已包含盘点的五个分支提交。最终远端头统一与保存状态以本轮实际Git回执为准；源码、旧EXE和公共review不是同一发布基线。

## 目录与文档职责

```text
src/
  main/          宿主、SQLite、权限、模型、工具、记忆和行动
  renderer/      React工作区、资料/学习/日程/角色和共享地图
  shared/        Bridge、领域对象、Scene/OpenUI与交互契约
runtime/hermes/  锁定Python主循环与宿主适配
prompts/         实际产品行为输入，不是研究材料归档
assets/map-v2/   公共地理/地点/道路/模型数据（内部格式campus-map/v3）
apps/review-web/ 仅公共地图预览，复用同一地图实现
apps/location-bridge/ 原生位置桥，原始观察归桌面同一运动 owner
runtime/tiyi/ 体艺可选签名组件所需公开依赖的固定来源清单
前端视觉创新设计/ 生成设计、艺术资产、来源与本轮逐图评鉴
scripts/ tests/ 既有构建、校验及机制检查
docs/          产品契约、架构、当前证据与历史资料
```

| 文档 | 负责什么 |
| --- | --- |
| [AGENTS](AGENTS.md) | 当前协作、单一实现、授权/来源与交付规则 |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 主循环、上下文、存储、权限、工具、行动和呈现机制 |
| [CURRENT_STATUS](docs/CURRENT_STATUS.md) | 当前能力、待重绘/待接入范围与本轮真实验证 |
| [PRODUCT_CONTRACT](docs/PRODUCT_CONTRACT.md) | 人的决定权、连续性、主动帮助与各类对象边界 |
| [CONVERSATION_SCENES](docs/CONVERSATION_SCENES.md) | Scene、OpenUI、局部状态、语义引用与回流契约 |
| [STUDENT_HARNESS](docs/STUDENT_HARNESS.md) / [HARNESS_EVOLUTION](docs/HARNESS_EVOLUTION.md) | 学生场景、需求归属及历史机制演进，不是逐项当前通过证明 |
| [CLOUD_REVIEW](docs/CLOUD_REVIEW.md) / [DEPLOYMENT](docs/DEPLOYMENT.md) | 公共地图审查、构建、EXE与真实发布的区别 |
| [ASSET_PROVENANCE](docs/ASSET_PROVENANCE.md) / [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md) | 资产及第三方软件/数据许可；上游license原文保留 |
| [历史状态档案](docs/CURRENT_STATUS_HISTORY_20261023.md) | 深度评鉴前的旧批次证据与精确anchor，所有当时阶段禁令失效 |
| [历史原材料](docs/source-materials/2026-10-18/README.md) / [阅读索引](docs/reading/2026-10-22/FILE_GUIDE.md) | 用户原话、研究包及阅读范围；不能作为运行时本人事实或新授权 |

`package.json`、锁文件、`.nvmrc`、`.env.example`、`.devcontainer`与现有workflow是工具链依据。`prompts/`是运行输入；不要把研究答案、128场景标准台词或用户私人讨论直接拼进生产提示。

<a id="strategy"></a>
## 系统主线与状态所有者

`React App → preload Bridge/IPC → Electron main → Harness → Hermes adapter →` 锁定`AIAgent`；模型请求与工具执行回宿主。普通产品默认DeepSeek，显式Luna代测只替换模型传输，实际响应型号独立核验。子代理仍归同一Hermes和当前来源/预算，不成为另一聊天或事实引擎。

<a id="user"></a>

| 对象 | 权威状态与边界 |
| --- | --- |
| 原话、会话与草稿 | Store、`storage/drafts.ts`，保留/读取/传输分别核验 |
| 资料与选段 | `materials/service.ts`及材料scope，真实资源ID/页码/内容版本/Unicode范围 |
| 笔记 | NotesService，原文、CAS修订、历史、回收站与精确来源；不是人物断言 |
| 文字角色 | `shared/persona.ts`、Store settings与PersonaEditor，明确保存生效，换图不暗改 |
| 个人理解 | `memory/service.ts`及原证据/断言/更正/遗忘链，条件与现实时间不能丢 |
| 商量、学习与持续事项 | `runtime/work.ts`、`collaboration.ts`、`planning-intents.ts`等原owner，尝试/建议/接受/结果分别保存 |
| 安排、动作与提醒 | Agenda、ActionRuntime、ReminderRuntime、修订与派发/结果回执 |
| 校园记录 | domain storage与真实连接器，账号来源、保存快照、时效和用途分别核验 |
| 本地运动 | `runtime/workout-session.ts` 唯一运动 owner；原生桥、加密恢复、同一地图私人图层与有限伴跑摘要 |
| 准备/托付 | `attention.ts`、`cooperation.ts`、原work与release存储；期限、渠道、展示/打开独立 |
| 共创插画临时引用 | `shared/scene-transfer.ts`、`DiscussionSceneView.tsx`、原 `App.selectScene`；`runtime/scenes.ts`/`discussion-scene.ts` 核原 frame/分支/版本与来源，`interaction-control-context.ts` 保作品身份，拖入不另存作品或假定位 |
| 地图 | MapService的公共数据；个人地点配置/位置proof另受当前范围约束 |
| 外观、分屏和局部程序 | 外观/分屏为renderer本机偏好；program输入经宿主独立CAS保存，不等于业务写入或跨设备同步 |

## 按任务找源码

表内路径相对`src/`；同一单元不建立第二实现。

| 任务 | 入口及调用关系 |
| --- | --- |
| 启动、窗口与IPC | `main/main.ts`、`main/preload.ts`、`renderer/main.tsx`、`renderer/App.tsx`；开发/构建脚本在`scripts/` |
| 工作区与导航 | `renderer/Navigation.tsx`、`Workspace.tsx`、`App.tsx`；chat/agenda/notes/materials/memory/settings/companion |
| 主循环与提示组装 | `main/harness.ts`、`runtime/hermes.ts`、`runtime/prompt-composition.ts`、`runtime/tool-surface.ts`；Python适配在`runtime/hermes/sidecar.py` |
| 模型与网络 | `main/model-selection.ts`、`provider.ts`、`luna-provider.ts`、`network.ts`；显式测试入口`scripts/run-luna-test.mjs` |
| 控制、权限、用途 | `runtime/turn-controls.ts`、`controls.ts`、`policy.ts`、`read-purpose.ts`、`privacy-control.ts`、`action-delegation.ts` |
| 工具发现 | `main/tools.ts → runtime/coordinator.ts → capabilities/broker.ts → builtin.ts/ports.ts/领域provider` |
| 方法与子调查 | `runtime/skills.ts`、`background-delegation.ts`、`delegation-evidence.ts`、`investigation-frontier.ts`；唯一记忆调查方法`prompts/memory-inquiry.md` |
| 记忆与回源 | `memory/model.ts`、`service.ts`、`retrieval.ts`、`browse.ts`、`source-related.ts`、`runtime/context.ts`、`continuity.ts`及`storage/repository.ts` |
| 可选语义索引 | `memory/semantic-recall.ts`、`semantic-store.ts`与固定embedding资源；默认ContextCompiler不附加BGE候选，索引不是事实层 |
| 人格编辑与绑定 | `shared/persona*.ts`、`persona-portrayals.ts`、Store、`renderer/PersonaEditor.tsx`、`CompanionSettings.tsx` |
| 原景人物/主题 | `renderer/companion.tsx`、`companion-scenes.tsx`、`appearance.ts`、`tokens.css`、`companion.css`；素材路径看当前注册与catalog |
| 资料、PDF和笔记锚 | `main/materials/service.ts`、`pdf.ts`、`worker.ts`、`renderer/MaterialsPanel.tsx`、`MaterialPdfPage.tsx`；Windows原生canvas依赖独立核验 |
| 阅读与学习双纸 | `renderer/ReadingDivider.tsx`、`presentation/StudySceneView.tsx`、`ConversationComposerDock.tsx`；共用原composer，不另建输入 |
| 笔记编辑与搜索 | `shared/notes.ts → main/notes/service.ts → Store/Bridge → renderer/NotesPanel.tsx`；统一查找`main/search.ts/LocalSearchPanel.tsx` |
| 日历与直接操纵 | `shared/calendar.ts`、`main/actions/calendar.ts/local-calendar.ts/runtime.ts`、`renderer/AgendaDayTimeline.tsx`、`Workspace.tsx/LifePanels.tsx` |
| 规划、意图与采用 | `actions/planning*.ts`、`runtime/planning-intents.ts`、`actions/planning-intent-ledger.ts`、`planning-intent-contract.ts`；原`planRef`/proof/attempt链 |
| 日历导出 | `shared/calendar-export.ts → preload/main calendar:export → actions/calendar-export.ts → expandAgenda`；`CalendarHandoff.tsx`为界面 |
| 托付、准备和提醒 | `runtime/attention.ts`、`cooperation.ts`、`opportunity-scheduler.ts`、`actions/reminders.ts`；`PreparationShelf`与消息helpRefs保真实展示；`EntrustedPanel.tsx`/`EntrustedRevision.tsx` 沿原托付 ID 修订来源与期限，原生 `attentionChange` 核修订与控制版本 |
| Scene和OpenUI编译 | `shared/scenes.ts/presentation.ts → main/runtime/scenes.ts/scene-projections.ts/presentation.ts/coordinator.ts` |
| 通用交互作品 | `shared/interactive-library.ts/interactive-program.ts`、`main/runtime/interactive-program*.ts`、`renderer/presentation/InteractiveProgramView.tsx/interactive-*.tsx/program-local-state.ts` |
| 消息内画面与局部焦点 | `renderer/presentation/AssistantPresentation.tsx`、`LocalTextFocus.tsx`、`FocusContextChip.tsx`与原App引用链 |
| 地图 | `main/mapService.ts/mapProfile.ts`、`shared/map*.ts`、`renderer/map/CampusMap.tsx（导出MapSurface）/ConversationMap.tsx/map-engine.ts/planar-map.ts`；`scripts/map-engine-loader.ts`供桌面与review共用按需载入入口；资产`assets/map-v2` |
| 私人运动地图与陪跑 | 桌面 `renderer/map/DesktopMapSheet.tsx → WorkoutControls.tsx/desktop-workout-layer.ts` 投到原相机；`main/runtime/workout-session.ts/workout-native.ts/workout-storage.ts` 持有原始记录，`capabilities/workout.ts` 只给有限语义摘要；公共入口仍直接导入共享 `CampusMap` |
| 天气、空气与校园 | `main/capabilities/weather.ts/air-quality.ts`与校园adapter、`storage/domains.ts`；`CampusDaySchedule.tsx`、`presentation/CampusAcademicView.tsx`显示宿主投影 |
| 教务与体艺连接 | `main/zjuAdapter.ts → integrations/zju/scripts/zju.py`；`main/tiyiAdapter.ts → integrations/tiyi_connector.py/tiyi_modules`，各自沿原认证、快照和分页；运行源码随应用分发，账号与原响应不分发 |
| 对外草稿/公开展示 | `runtime/release-store.ts/release-composer.ts/release-projection.ts/redaction.ts`、`LifePanels.tsx`；不自动外发 |

## 关键集成边界

OpenUI点击/拖点由checked patch更新当前program输入，`program-local-state.ts → Bridge → NativeProgramLocalState → SQLite CAS`保存；下一条原对话携带message/program/revision和最新输入。它确有回流实现，不能说仍全是假壳，也不能把局部输入保存说成日历写入。详见[场景契约](docs/CONVERSATION_SCENES.md)。

资料选段能拖入同一聊天；当前源码另有SourceBookmarkTray与NativeStudyService的同题预览/接收及Study drop基础，不能再说完全没有接收器，任意资料到推导行与最终恢复效果仍须实机。角色座位仍受合法锚点限制，不代表任意跨家具贴合；已存在逐资产标定/scene注册和数值spring/分屏接管，不能据此宣布全矩阵或全站手感通过。旧[代码审计](前端视觉创新设计/2026-10-23-深度评鉴/代码链路审计.md)保历史，当前差异见[前端交接审读](docs/handoff/2026-10-24-stage02-restart/audits/07-frontend-and-openui.md)。

地图磁盘目录`map-v2`的manifest格式为`campus-map/v3`。公共地理、display几何、places/network与体量来源分别保留；三维和既有平面兼容路径共享地点/道路身份。显示标签避让、场景镜头、建筑体量与路由准确性是不同问题，不能用漂亮截图库替代几何/通行核查。公共产物导出入口为`scripts/export-review.mjs`，当前地图导入用`npm run map:import`，不以旧`fetch-map-v2.mjs`替代刷新契约。

地图资料与绘图程序分别重试；重新展开保留同一surface的选择与相机，不重启工作区。只有程序载入失败后的明确重试才给同一构建入口追加新URL参数；构建插件要求其程序依赖已随地图界面载入，地图样式也归界面静态样式。

## 检查与历史

按`package.json`使用`check/test/test:hermes/build`及现有直接入口；`inspect-prompt.mjs`可在合成数据中查看实际提示组装而不调用模型。真实模型只走当前已授权Luna入口，DeepSeek与校园凭据不从文档推导授权。

新结果写[CURRENT_STATUS](docs/CURRENT_STATUS.md)，历史精确回执留[状态档案](docs/CURRENT_STATUS_HISTORY_20261023.md)及各`docs/evidence/`。旧282/282、9/9、截图或本机成功只证明所记版本/环境/范围，不自动覆盖清理后的代码。不要将旧“停止/暂停”说明重新升级为当前规则。
