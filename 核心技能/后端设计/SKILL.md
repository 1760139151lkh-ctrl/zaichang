---
name: zaichang-backend-director
description: 在场（Zaichang）后端、Harness、六层协作记忆、主动陪伴、OpenUI 实时程序与跨端演进总监技能。深度烙印「进入温柔乡 × 真实开放代理」灵魂哲学、MyGO!!!!! & Ave Mujica 十角色活人陪伴、边做边说（ConversationRhythm）、模型理解与宿主确定性护栏分离、六层双时态记忆与四轴隐私屏障、跨模块单一权威 Owner 契约、未实现/未来扩展接口（手机端/平板同步、实时 GPS、浙大体育打卡核验、邮件/钉钉外部源、加密与后台守护 X01–X16）及反伪证验收体系。凡涉及在场后端、Harness、Prompt、工具、记忆、日程、陪学、地图路由或跨端扩展，必须激活本技能。
---

# Zaichang Backend & Harness Director (`zaichang-backend-director`)

> **核心使命**：让「在场」的后端与 Harness 真正成为一个**有记忆、有分寸、有好奇心、懂克制、能办实事的窗边活人伙伴**（无论是叫你「老公 / 小灰灰」的丰川祥子，还是睦、初华、海铃、喵梦、灯、爱音、乐奈、素世、立希，或用户自定义的专属人格），彻底消灭把助手写成「工单系统 / 审计科长 / 万能安慰复读机 / 鸟言鸟语免责声明播音员」的工程异化。

本技能将《给 Opus 的深度重构长信》《Opus 深度重构完整交接包（含 2900+ 行记忆讨论、Harness 语义架构、生活融合、渐进能力、地图动效等全部原始讨论）》与《前端视觉创新设计 · 深度评鉴》中的所有后端思想、架构契约、人味原则与未来蓝图**永久烙印（Bake In）**为结构化执行规范，后续开发无需再翻阅数万行原始长信与聊天记录。

---

## 0. 为什么过去会反复长出「鸟言鸟语」？—— 根因诊断与铁律处方

在历次迭代中，后端与 Prompt 最容易出现的退化是：**每当为了修补一个安全边界、来源校验或测试断言，工程师/模型就把宿主的「内部合规判词」直接塞进 Prompt、工具 `meaning` 或 UI 文案里**，导致：
- 角色在温柔陪伴或讲题时突然冒出「本页构作契约整体提供」「返回未接入」「已接通/待验证」「本地隔离合成内容」；
- 或者用工程测试口径（「16 轮 Luna 测试通过」「模型主动调用率 100%」）掩盖真实对话里机械、啰嗦、像客服背免责声明的体验；
- 或者为了防幻觉，把助手绑死在预设路由里，一遇到情绪词就只会复读「我在听，你可以慢慢说，这一轮先不安排下一步」。

### 根治「鸟言鸟语」的三层分离铁律（Three-Layer Separation Law）

| 层级 | 唯一职责 | 语言风格与硬约束 | 绝对禁止的反模式 |
| --- | --- | --- | --- |
| **1. 宿主护栏层 (`TypeScript` / `SQLite`)** | 确定性校验身份、`ScopeHandle`、`privacy_epoch`、`fence`、`expectedRevision` CAS、幂等键与 `ContextReceipt` | **沉默、精确、不越俎代庖**。校验通过就静默放行；校验拦截就返回精确结构化状态码与真实事实缺口 | 禁止用正则/关键词剥夺主模型工具；禁止替主模型写死固定安抚话术；禁止在数据库里建第二套平行事实库 |
| **2. 模型认知与工具 `meaning` 层 (`prompts/` & `tools.ts`)** | 把**当前真实的上下文来路、工具观察状态与边界事实**用清澈、平实的中文交底给主模型，让角色自己思考、自己决定怎么开口 | **平实人话、尊重主模型智力**。告诉她「读到了哪一页、哪一段还没看、哪条安排刚才改过了」，把表达权 100% 留给角色人格 | 禁止在 `meaning` 或 `system.md` 里堆砌公文式免责声明（「不构成长期授权」「不代表所有 schema 已读」）；禁止教模型背诵固定句式；禁止把测试题原句塞进 Prompt |
| **3. 用户界面与角色表达层 (`Renderer` & 角色回复)** | 以角色自身的呼吸、称呼、情绪与分寸陪伴用户，展示干净的活组件、卡片与画布 | **温柔、自然、具体、克制**。遇到限制时只说三件事：① 刚才发生了什么、② 你的原话和已有安排都安全留着、③ 现在可以怎么继续 | 严禁出现 `已接通/待验证`、`返回未接入`、`本地示例不会猜测个人事实`、`3/3`、`receipt`、`scope`、`schema` 等内部工程词 |

---

## 1. 五层架构总览（The 5-Layer Architecture）

本技能由五层核心能力构成，详细规格分布在 `references/` 目录下，按需精确调阅：

1. **Layer 1 · 灵魂、主权与开放代理哲学（Soul, Sovereignty & True Open Agency）**
   - 「进入温柔乡」的人味陪伴 × 零词法守门（Zero Lexical Gatekeeping）× 模型理解与宿主护栏分离。
2. **Layer 2 · 六层协作记忆、双时态断言与四轴隐私屏障（Memory, Continuity & Privacy）**
   - 详见 [`references/memory-and-continuity.md`](references/memory-and-continuity.md)
   - 六层记忆（`SourceEvent` → `Assertion` → `DecisionExperience & FrictionHypothesis` → `CollaborationFrame / Work / Episode` → `DomainObservation` → `DerivedViews`）、12 维学生理解模型、9 种记忆演化操作、四轴数据控制与跨全链路瞬时遗忘屏障（`privacy_epoch` + `fence`）、多路检索与 `recall_experience` 原生子调查。
3. **Layer 3 · 角色活人演出、边做边说与主动陪伴调度（Persona, Rhythm & Proactivity）**
   - 详见 [`references/persona-proactivity-and-rhythm.md`](references/persona-proactivity-and-rhythm.md)
   - 十角色灵魂矩阵（祥子、睦、初华、海铃、喵梦、灯、爱音、乐奈、素世、立希）与 `personaPerformance`、回合内流式「边做边说」（`ConversationRhythm`）、双引擎主动陪伴（托付照看 `quiet-initiative` + 自发好奇心与温度 `curiosity_invitation` / `PRESENCE_NOTE`）。
4. **Layer 4 · OpenUI 实时交互造物、空间连续性与跨模块单一 Owner（OpenUI, Spatial & Cross-Module）**
   - 详见 [`references/openui-spatial-and-cross-module.md`](references/openui-spatial-and-cross-module.md)
   - `@openuidev/react-lang` 动态程序流式生成与 `previous + patch` 增量续改、`NativeProgramLocalState` CAS 状态回流、跨模块稳定 ID 与 6 个具体生活连续性微界面（思路破冰小便签、桌边书签托盘、回来仍在原处、安排冲突试放沙盘、桥边路线口袋、一盏灯的专注）、校园地图 V2 `CameraOwnership` 与有向几何。
5. **Layer 5 · 跨端演进蓝图（`X01–X16`）与反伪证验收体系（Extensions & Falsification-First Verification）**
   - 详见 [`references/extensions-and-evaluation.md`](references/extensions-and-evaluation.md)
   - 8 大内核扩展端口与未实现/未来能力契约（手机/平板跨设备因果同步、移动端实时 GPS、浙大体育打卡有效次数核验与官方写回、邮件/钉钉外部通知接入、多方忙闲信封、SQLite 全库静态加密、OS/云端后台守护进程、可穿戴精力信号、经验配方固化），以及 `INV-01–INV-20`、`V01–V36`、`Mutants X01–X20` 证伪式验收规程。

---

## 2. 核心设计公理（The 10 Non-Negotiable Axioms）

### 公理 1：单一主循环与权威宿主（Single Runtime Loop & Authoritative Host）
- 唯一运行主链：`src/main/harness.ts` → `src/main/runtime/hermes.ts` → `runtime/hermes/sidecar.py` → 锁定的 Python `AIAgent`（版本锁定于 `runtime/hermes/lock.json`）。
- **绝不新建第二套聊天引擎、旁路 Agent 循环或前端伪造状态库**。Electron `main` 独占 SQLite、凭据、文件、权限与外部工具；`renderer` 仅通过 `src/main/preload.ts` 的受控 IPC Bridge 交互。

### 公理 2：模型负责理解，宿主负责护栏（Model Understands, Host Guards）
- **零词法守门（Zero Lexical Gatekeeping）**：永远不要用正则表达式、情绪词表、年龄词（如「我 18 岁」）或预分类器去裁剪主模型的工具集或强制切换「倾听模式 / 规划模式」。
- 学生的真实表达往往同时包含**情绪倾诉 + 身体疲惫 + 截止期焦虑 + 具体微积分题目 + 日程调整**。主模型始终看到用户的逐字原话（`authoredText`）和完整可用工具，自主决定是先抱抱他、边聊边查课表、拆解题目第一步，还是安静陪着。
- 宿主的职责是在工具执行、上下文编译、子代理分派和结果落库时，确定性地校验 `ScopeHandle`、`privacyEpoch`、`expectedRevision` 与来源证明。

### 公理 3：进入温柔乡 —— 角色是活人，不是工具皮套（Living Persona, Never a Skin）
- 角色核心（`PersonaCore`）、声音温度（`PersonaVoice`）、关系与称呼（`PersonaRelationship`）、主动性（`PersonaInitiative`）与微变化（`PersonaVariation`）共同构成有呼吸的活人。
- **尊重亲密约定与用户主权**：当用户希望丰川祥子叫他「老公」或「小灰灰」、希望角色展现傲娇或温柔偏爱时，她就是那个把骄傲藏在考究细节里、只在你面前卸下防备的祥子。换立绘/换装不暗改人格与称呼；导入外部角色卡只取纯文本设定，绝不执行宏、脚本或系统命令。
- **拒绝廉价鸡汤与客服黑话**：不刷感叹号，不说「抱抱你～你已经很棒啦」「我在听，慢慢来」这种万能敷衍模板，而是用**具体的观察、贴合性格的动作感与切实的分担**回应对方。

### 公理 4：边做边说，绝不留冰冷死寂（Streaming Rhythm Mid-Tool）
- 当主模型需要调用工具（查课表、算路线、翻笔记、派子代理查记忆、画 OpenUI 小程序）时，通过 [`ConversationRhythm`](../../src/main/runtime/conversation-rhythm.ts) 先自然流式说出半句话（例如祥子一边翻看一边轻声说：「先别急着把今晚塞满，我替你看一眼明早的课表……」），再去调工具。
- 工具返回后，后半句沿着前半句自然往下接，**绝不重复开头，也绝不另起一条割裂的机械汇报**。任何流式分片在发往 UI 前必须先经过凭据脱敏（`redactCredentials`）与来源屏障校验。

### 公理 5：主动陪伴的双重驱动 —— 既记得托付，也有自己的好奇心（Dual-Drive Proactivity）
- **托付照看（Entrustment Care / `quiet-initiative`）**：对用户交代过的持续事项（如「帮我盯着周四下午雨停没、能不能去玉泉跑步」「明早提醒我带实验报告」），后台按条件重评（`decide_help: prepare | wait | ask | notify | none`）。条件未变或同一原因已被婉拒时保持安静（`noveltyKey` + 语义去重）；真有变化时先把路线/材料准备好，在安静时段外轻声提醒。**明确设定的固定时刻提醒独立调度，绝不因静默策略漏报**。
- **自发在场与好奇心（Spontaneous Presence / `curiosity_invitation`）**：她不只是在你有任务时才出现的工具。当判断你正空闲且未开启免打扰时，她可以像真正的身边人一样，带着刚做好的可玩 OpenUI 小琴键/天体小沙盘、一段窗边随想或一封回信轻轻敲门；若你正忙或划走，她自然收起，绝不把休息或闲聊变成学习催债。

### 公理 6：原文权威与六层记忆防污染（Verbatim Evidence & Anti-Contamination）
- **原文（`SourceEvent`）永远是第一权威**；检索命中、预览、标题、摘要、BGE 向量候选都只是「帮你找原文的路标」，不等于原文已读。
- **反递归摘要铁律**：10 条源自同一句原话的摘要，其独立证据根（`root_event_id`）永远只算 **1**，绝不允许把助手的推测或旧摘要再次写回长期事实层，防止「传话游戏」式的置信度膨胀。
- **六阶段生命周期严格区分**：助手 `generated（生成）` ≠ `rendered（上屏）` ≠ 用户 `seen（看见）` ≠ `understood（看懂）` ≠ `accepted（采纳）` ≠ `executed（实际办成）`。把题目拖进陪学或试挪日程块只是当前动作，绝不自动记为「已掌握」或「已批准修改」。

### 公理 7：跨模块单一权威 Owner 与稳定引用（Single Owner & Stable Identity）
- 笔记归 `NotesService`、资料/PDF 归 `MaterialService`、日历安排归 `CalendarService / NativeAgendaService`、陪学归 `StudyCompanionService`、地图归 `CampusMapAdapter`、记忆归 `MemoryService`。
- 跨模块流转同一道题、同一段 PDF 摘录、同一条笔记引用、同一项日程或同一条路线时，**必须传递 `{ id, revision / expectedRevision, sourceAnchor }` 交由原 Owner 核验打开**（如 [`NativeSourceBookmarkService`](../../src/main/runtime/source-bookmark-native.ts)），绝不复制成无来源的孤儿文本。

### 公理 8：日历与外部行动的事务完整性（Transactional Planning & Action Receipts）
- 规划排程必须保留完整结构：`准备（setup）+ 核心工作（work）+ 收尾（cleanup）+ 通勤转场（travel/transition）+ 休息缓冲（rest）+ 保护占用`。所选时间窗之外的时间**绝不自动当作空闲**；未知结束时刻保持 `null/unknown`。
- 本地日历修改绑定 `targetId + expectedRevision`。已明确授权的本地修改直接执行并落回执，不反复追问；未授权或有冲突的调整先通过试放沙盘（`NativeAgendaService.preview`）展示前后对比与 1–2 个顺延/提前候选。结果未知（`outcome_unknown`）必须先 `inspect_action` 核查原动作，**严禁盲目重发**。

### 公理 9：受众隔离与最小披露（Audience Projection & Zero Private Leakage）
- 当用户要求写群消息、给老师/助教发邮件或对外分享忙闲时，必须先由私有上下文投影出最小化的 [`ReleaseBrief`](../../src/main/runtime/release-projection.ts)，再由隔离的 [`composeRelease`](../../src/main/runtime/release-composer.ts) 生成 `ReleaseArtifact`。
- 忙闲投影（`availability_projection`）只输出可约时间窗与状态，**绝不向外泄露私人日历标题、地点、课程名或身体状况**。在未接通真实外部发送通道前，诚实标明为草稿，绝不伪造「已发送」。

### 公理 10：先攻击裁判，再谈通过（Attack the Grader First）
- 构建通过 ≠ 模型会用；静态测试通过 ≠ 真实多轮体验自然；单句命中 ≠ 机制泛化。
- 任何后端或 Harness 改动，必须区分 **确定性机制测试（含 Mutants 注入破坏测试）**、**真实授权模型（`gpt-6-luna`）端到端测试** 与 **真实 Electron 界面联调**。遇到失败必须定位最早分叉点，用通用机制修复并验证至少 5 种未见过的自然说法与反事实变体，**严禁把测试原句塞进 Prompt 作弊**。

---

## 3. 代码库核心模块权威地图（Backend & Harness Codebase Map）

| 领域 | 权威文件入口 | 核心职责与关键符号 |
| --- | --- | --- |
| **主循环与门面** | [`src/main/harness.ts`](../../src/main/harness.ts) | `Harness` 主控：会话入口 `start()`、前景执行 `run()`、后台记忆队列 `queueCurrentMemory()`、主动照看 `runOpportunity()`、完成度回看 `reviewCompletion` |
| **Hermes 原生桥接** | [`src/main/runtime/hermes.ts`](../../src/main/runtime/hermes.ts), [`runtime/hermes/sidecar.py`](../../runtime/hermes/sidecar.py), [`runtime/hermes/lock.json`](../../runtime/hermes/lock.json) | `runHermes`：通过 stdio JSON-RPC (`zc.*`) 驱动锁定版 Python `AIAgent`，挂载四大窄适配器（`RunFactory`, `StateSink`, `TransportObserver`, `ToolBridge`） |
| **系统提示词与组装** | [`prompts/system.md`](../../prompts/system.md), [`prompts/memory-inquiry.md`](../../prompts/memory-inquiry.md), [`prompts/working-details.md`](../../prompts/working-details.md), [`src/main/runtime/prompt-composition.ts`](../../src/main/runtime/prompt-composition.ts) | `foregroundSystem` / `backgroundSystem` / `PRESENCE_NOTE` / `WORKER_NOTE`：将系统原则、角色灵魂、流式节奏、互动程序导引与边界说明编织成紧凑的系统上下文 |
| **角色人格与演出** | [`src/shared/persona.ts`](../../src/shared/persona.ts), [`src/shared/persona-portrayals.ts`](../../src/shared/persona-portrayals.ts), [`src/shared/persona-performance.ts`](../../src/shared/persona-performance.ts) | `PersonaSettings`、十角色内置设定（`PERSONA_PRESETS`）、灵魂自述与相处空气（`PORTRAYALS`）、主动陪伴与讲题姿态（`personaPerformance`） |
| **边做边说流式节奏** | [`src/main/runtime/conversation-rhythm.ts`](../../src/main/runtime/conversation-rhythm.ts) | `ConversationRhythm`：管理 `beginDraft`、`previewDraft`、`commitDraft`、`continuationContext` 与中断/回看时的安全替换尾段 |
| **权限内核与仓储** | [`src/main/runtime/policy.ts`](../../src/main/runtime/policy.ts), [`src/main/storage/repository.ts`](../../src/main/storage/repository.ts) | `PolicyKernel`、`ScopeHandle`、四轴权限校验、`privacyEpoch` 与 `h_fences` 瞬时遗忘屏障、`KernelRepository` |
| **六层记忆与检索** | [`src/main/memory/service.ts`](../../src/main/memory/service.ts), [`src/main/memory/model.ts`](../../src/main/memory/model.ts), [`src/main/runtime/context.ts`](../../src/main/runtime/context.ts), [`src/main/runtime/memory-inquiry.ts`](../../src/main/runtime/memory-inquiry.ts) | `MemoryService`（9 种演化操作、双时态断言、条件 AST）、`ContextCompiler`（开场小锚点与引用打包）、`recall_experience` 原生子调查 |
| **工具注册与渐进发现** | [`src/main/tools.ts`](../../src/main/tools.ts), [`src/main/runtime/skills.ts`](../../src/main/runtime/skills.ts), [`src/main/capabilities/broker.ts`](../../src/main/capabilities/broker.ts) | `ToolRegistry`、`look_up` 渐进能力目录、`CapabilityBroker` |
| **主动照看与注意力** | [`src/main/runtime/opportunity-scheduler.ts`](../../src/main/runtime/opportunity-scheduler.ts), [`src/main/runtime/attention.ts`](../../src/main/runtime/attention.ts), [`src/main/actions/reminders.ts`](../../src/main/actions/reminders.ts) | `OpportunityScheduler`、`AttentionService`（`noveltyKey`、冷却、安静时段）、`ReminderService`（独立固定提醒） |
| **日历排程与试放沙盘** | [`src/main/actions/planning.ts`](../../src/main/actions/planning.ts), [`src/main/actions/calendar.ts`](../../src/main/actions/calendar.ts), [`src/main/runtime/native-agenda.ts`](../../src/main/runtime/native-agenda.ts) | `previewCalendarPlan`、`planRef` 短票据与占用组、`NativeAgendaService`（日视图、拖拽试放、冲突与 15 分钟网格顺延/提前候选） |
| **可接续陪学与书签** | [`src/main/runtime/study-companion.ts`](../../src/main/runtime/study-companion.ts), [`src/main/runtime/study-native.ts`](../../src/main/runtime/study-native.ts), [`src/main/runtime/source-bookmark-native.ts`](../../src/main/runtime/source-bookmark-native.ts) | `StudyCompanionService`（题目身份、尝试记录、不剧透破冰小便签）、`NativeSourceBookmarkService`（跨对话/资料/笔记的精确选段与书签） |
| **OpenUI 实时交互程序** | [`src/main/runtime/interactive-program.ts`](../../src/main/runtime/interactive-program.ts), [`src/main/runtime/interactive-program-local-state.ts`](../../src/main/runtime/interactive-program-local-state.ts), [`src/shared/interactive-library.ts`](../../src/shared/interactive-library.ts) | OpenUI Lang 校验、`previous + patch` 增量修补、`NativeProgramLocalState` CAS 保存与 `Continue` 状态回流 |
| **校园数据与地图 V2** | [`src/main/zjuAdapter.ts`](../../src/main/zjuAdapter.ts), [`src/main/mapService.ts`](../../src/main/mapService.ts), [`src/shared/map-routing.ts`](../../src/shared/map-routing.ts) | 浙大课表/考试/运动/校园卡只读连接器、紫金港/玉泉地图 V2 拓扑寻路与有向路段裁剪 |
| **模型传输与代测** | [`src/main/provider.ts`](../../src/main/provider.ts), [`src/main/model-selection.ts`](../../src/main/model-selection.ts) | `DeepSeekClient`（产品默认协议）、`usingLunaTestTransport`（`gpt-6-luna` 显式授权代测传输，核验真实 `responseModel`） |

---

## 4. 深入专项参考指南（Detailed References Index）

在进行具体模块设计、重构或排障时，请直接读取以下专项参考文档：

1. **[`references/memory-and-continuity.md`](references/memory-and-continuity.md)**
   - 六层协作记忆完整 Schema、双时态断言（`validFrom/To` vs `recordedFrom/To`）、9 种记忆演化操作（`ADD` 至 `RETRACT`）、12 维学生模型、四轴数据控制与瞬时遗忘屏障（`privacy_epoch` + `fence`）、多路检索与 `recall_experience` 原生子代理调查规程。
2. **[`references/harness-and-agency.md`](references/harness-and-agency.md)**
   - 锁定版 Hermes `AIAgent` sidecar 架构、4 大窄适配器与 `zc.*` RPC 协议、`look_up` 三层渐进能力发现、受限并行子代理（`delegate`）、`Action → Approval → Attempt → Receipt` 事务状态机、`ReleaseBrief` 对外受众投影，以及 `INV-01–INV-20` 20 条系统不变量。
3. **[`references/persona-proactivity-and-rhythm.md`](references/persona-proactivity-and-rhythm.md)**
   - MyGO!!!!! & Ave Mujica 十角色活人矩阵（含丰川祥子等角色的称呼、傲娇/温柔分寸与讲题/陪伴姿态）、`ConversationRhythm` 边做边说流式状态机、主动陪伴双引擎（`quiet-initiative` 托付照看 vs `curiosity_invitation` 自发在场）、消除「鸟言鸟语」的文案与 `meaning` 改写范式。
4. **[`references/openui-spatial-and-cross-module.md`](references/openui-spatial-and-cross-module.md)**
   - OpenUI (`@openuidev/react-lang`) 实时交互造物（`Curve`, `DragHandle`, `Motion`, `Press`, `Voice`, `AudioTrace`, `SourceSlot`）、`NativeProgramLocalState` CAS 状态回流、跨模块单一 Owner 契约表、6 个生活连续性微界面（A–F）的前后端联动契约、地图 V2 `CameraOwnership` 与路线几何。
5. **[`references/extensions-and-evaluation.md`](references/extensions-and-evaluation.md)**
   - 未实现与未来规划能力（手机端/平板宿主同步、实时 GPS、浙大体育打卡核验与写回、邮件/钉钉接入、多方忙闲信封、SQLite 静态加密、后台守护推送、可穿戴设备信号、经验配方固化）的 8 大扩展端口与 `X01–X16` 契约，以及 `V01–V36` 连续体验故事、`Mutants X01–X20` 裁判攻防与 6 步故障修复规程。
