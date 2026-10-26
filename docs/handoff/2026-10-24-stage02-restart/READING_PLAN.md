# 分段精读与主代理上下文保护计划（Context-Safe Staged Reading Plan）

> **当前适用范围**：本表用于实际执行十二阶段研发时的阶段分工，每阶段强制八人的要求保留。主代理必须先亲自读懂当前完整输入、项目全貌与阶段目标，再组织分工。解释、审读、评审、文档修订或一般新聊天不自动触发团队；分段阅读也不能代替完整理解或限制必要原文的读取。阶段顺序以当前路线图为准。

> **核心纪律**：
> 前序会话最大的教训，就是主代理在开场时试图把几百份文档和几十张前端图片一次性读进自己的上下文，导致上下文瞬间塞满、后续思考能力断崖式下跌。
> 本计划严格推行**「主代理轻量掌舵 + 8 路子代理分片深读」**机制：
>
> 1. **先理解整体，再分段深化。** 不一次性灌入无关大图或长文；当前任务必要的原文、样片、标杆和实际画面仍由主代理亲读亲看，不按阶段禁止看图。
> 2. 每阶段固定八位子代理深入负责模块，但主代理保有整体理解与关键原文阅读责任。3–5个入口只帮助起步，不是阅读上限；长文沿 [SOURCE_SEGMENTS](../../reading/2026-10-22/SOURCE_SEGMENTS.md) 续读，分工不能替代主代理判断。

---

## 一、开场启动时：主代理建立全貌的基础入口

新会话启动时，主代理先完整理解当前输入、相关成果和项目全貌，以下四份只是定位基础，不能替代必要原文或成为阅读上限；旧145+项状态须回当前Git核对：

1. [`docs/REFACTOR_ROADMAP_2026-10-22.md`](../../REFACTOR_ROADMAP_2026-10-22.md)（终极最高行动纲领，含十二阶段防坑预警、8 路子代理分工与结项铁门禁）
2. [`docs/handoff/2026-10-24-stage02-restart/README.md`](README.md)（当前工作区 145+ 项未提交改动的精确地图与核心缺口）
3. [`.agents/skills/zaichang-backend-director/SKILL.md`](../../../.agents/skills/zaichang-backend-director/SKILL.md)（后端灵魂、六层记忆、边做边说与反伪证总监技能主文件；其 `references/*.md` 按阶段按需读取）
4. [`work/successor-20261022/companion-correction-20261022.md`](../../../work/successor-20261022/companion-correction-20261022.md)（用户关于「把她当作活生生的人、彻底根除内外人机话」的核心纠偏）

---

## 二、各阶段「主代理统筹阅读 vs 8 路子代理分片深读」精确配额表

### Stage 01：原话直达、十角色灵魂呼吸与全链路「人机话」清零

- **主代理亲读（仅限顶层协调）**：
  - `src/main/harness.ts`、`src/main/runtime/prompt-composition.ts`、`prompts/system.md`。
- **8 路子代理分片深读与实做**：
  - `Subagent 01`：精读 `prompts/working-details.md`、`prompts/persona-expression.md`、`prompts/continuity-and-return.md`、`prompts/recover-action.md` 及《给 Opus 的深度重构长信》L15–84，彻底洗净说明书腔；
  - `Subagent 02`：精读 `src/main/runtime/tool-surface.ts`、`src/main/capabilities/broker.ts`、`environment.ts`、`materials.ts`、`public-web.ts`，净化所有工具 `description` 与 `meaning`；
  - `Subagent 03`：精读 `src/shared/persona-portrayals.ts`（Ave Mujica 五人）及 `sources/unpacked/gemini/00..04`；
  - `Subagent 04`：精读 `src/shared/persona-performance.ts` 与 `src/shared/persona-portrayals.ts`（MyGO!!!!! 五人与内置角色）；
  - `Subagent 05`：精读 `src/main/runtime/conversation-rhythm.ts` 与长信 L238–271；
  - `Subagent 06`：精读 `src/main/runtime/personal-methods.ts` 与 `docs/ideas/COMPANION_EXPERIENCES_2026-10-18.md` L17–26；
  - `Subagent 07`：精读 `src/main/runtime/turn-controls.ts`、`policy.ts`、`read-purpose.ts` 与《在场的记忆讨论.txt》L2261–2324；
  - `Subagent 08`：运行真实 `Store / Harness` 多角色多工具长对话实测挑刺。

### Stage 02：浙大教务全口径、浙大体艺 19 项真实数据全打通与实时 GPS 轨迹上地图

- **主代理亲读（仅限顶层协调）**：
  - [`docs/REFACTOR_ROADMAP_2026-10-22.md`](../../REFACTOR_ROADMAP_2026-10-22.md) 的「三点六、浙大体艺组件总览」与「3.2.1 自制地图 + 手机 GPS 的打卡总装」、[`docs/handoff/2026-10-24-stage02-restart/audits/05-tiyi-complete-scope.md`](audits/05-tiyi-complete-scope.md)、[`06-workout-devices-and-map.md`](audits/06-workout-devices-and-map.md)、`src/main/tiyiAdapter.ts`、`src/main/capabilities/workout.ts`。
- **8 路子代理分片深读与实做**：
  - `Subagent 01`：精读 `src/main/integrations/tiyi_connector.py`、`C:/Users/17601/Documents/Codex/2026-09-09/wo-d/work/zju-sports-desktop/src-tauri/src/mobile_api.rs` L1–760，接通 `study_records`、`counselling`（13 学期）、`counts`（13 学期）、`fitness_attendance` 的页面内嵌数据与 AJAX 个人记录接口；
  - `Subagent 02`：接通 `fitness`（`/pft/app/*` 体测成绩/预约/反馈）、`graduation_courses`、`graduation_report`、`classes` 的真实数据接口；
  - `Subagent 03`：接通 `teams`（`/cts/app/*`）、`competitions`、`venue_entries`、`venue_live`、`feedback`、`westward`、`codoon`，并更新 `src/main/capabilities/tiyi.ts` 与 `src/shared/tiyi.ts`；
  - `Subagent 04`：精读 [`audits/04-academic-and-campus.md`](audits/04-academic-and-campus.md)、`src/main/zjuAdapter.ts`、`src/main/integrations/zju/scripts/zju.py`、`src/main/capabilities/campus-query.ts`，深化课程/无时刻考试/多口径 GPA 与学业推演洞察；
  - `Subagent 05`：精读 `src/renderer/map/CampusMap.tsx`、`src/renderer/map/map-engine.ts`、`src/renderer/map/WorkoutControls.tsx`，将 `WorkoutState.session.points` 实时轨迹、当前位置光点与精度圈绘制上共享地图表面；
  - `Subagent 06`：精读 `src/main/capabilities/workout.ts`、`src/main/map-workout.ts`、`src/shared/map-workout.ts`，将 `CampusWorkoutMatcher` 校内场馆/道路名安全接入 `workout.current` 并彻底重写冷水黑话 `meaning`；
  - `Subagent 07`：精读 `src/main/runtime/workout-session.ts`、`workout-native.ts`、`device-location.ts`、`ios-location.ts`、`apps/location-bridge/`，稳固多端定位流与计步传感；
  - `Subagent 08`：在桌面 Electron、MuMu 模拟器与 iOS 模拟器上对体艺 19 项、GPA 与地图实时轨迹进行端到端联调证伪。

### Stage 03 – Stage 12：下列为历史专题阅读索引，阶段编号和先后以当前路线图为准

- **Stage 03（记忆 `B06–B08`）**：将《在场的记忆讨论.txt》（2904 行）按 `L1–829`、`L830–1331`、`L1332–1990` 分片交给 8 路子代理精读，主代理只抓 `memory/service.ts` 与 `memory-inquiry.ts` 集成。
- **Stage 04（共同经历 `B09–B10`）**：将《协作记忆与渐进能力》与 `COMPANION_EXPERIENCES` 分片交给 8 路子代理，打穿六重境界与故事校园取景。
- **Stage 05（主动与日程 `B11–B16`）**：将《生活融合》L357–416 与《理解与行动》L397–476 分片交给 8 路子代理，打穿静默准备与「一条今天两种过法」。
- **Stage 06（OpenUI 后端 `B17–B18`）**：将 `CONVERSATION_SCENES.md` 与 `COMPANION_EXPERIENCES` L281–415 分片交给 8 路子代理，打穿通用机械/声学/条件文本原语与状态回流。
- **Stage 07（跨端同步与「先 iOS Swift 手机+iPad，后 Android 木木」`M01–M03`）**：先集中火力打磨 iOS Swift 手机与 iPad 双纸手写，定型后再 1:1 移植 Android 木木模拟器。
- **前端视觉、地图、双纸与钢琴 `F00–F07`**：按当前路线图阶段和具体页面查看对应标杆，八位子代理承担实质职责；主代理亲看关键资产与集成过程，不批量塞入无关图片，也不把早期阶段变成不能做必要前端工作的禁令。
- **Stage 12（先攻击评分器与全端终极验收 `Z01`）**：8 路子代理并行执行红队攻击、连续生活长故事实测、全端真机核验与 GitHub 安全同步。
