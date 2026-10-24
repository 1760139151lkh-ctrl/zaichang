# 架构、产品全貌与第一阶段重新理解交接审查

审查日期：2026-10-24。本文件属于交接材料，不是新一轮产品运行回执。审查员只读取文档、原始材料及定点源码；没有运行应用、调用产品模型、查询个人校园资料、修改产品实现或新增测试。原运行结果均保留原报告的日期、版本、数据与证据范围。

本次已实际阅读全文：`.agents/skills/zaichang-backend-director/SKILL.md`及其五份references：`harness-and-agency.md`、`memory-and-continuity.md`、`persona-proactivity-and-rhythm.md`、`openui-spatial-and-cross-module.md`、`extensions-and-evaluation.md`；`docs/PRODUCT_CONTRACT.md`、`ARCHITECTURE.md`、`CURRENT_STATUS.md`、`docs/evidence/2026-10-23-stage01.md`。架构长文分块补读，不能由一次截断输出认作读全。路线图本次重点实读总原则/材料职责/Stage01及其历史B01–B04，其他阶段主要用于全貌定位；以下对原始文件和代码再分别注明范围。

## 1. 新主代理首先要理解的项目

在场是围绕一个持续对话、为大学生日常生活提供真实帮助的个人伙伴。它要让人愿意回来：可以认真讨论一道证明、看讲义、处理课程变动、商量安排、共同创作、排练难开口的话，也可以玩、分享快乐、安静相处。成绩、效率与完成率不支配所有生活价值。用户不必报内部工具名，也不必先把心情或任务整理成系统能识别的分类。

“进入温柔乡”指熟悉、亲近、有被记住的感觉与具体可靠的帮助一起成立。角色不是工具办完事后附上的口吻。她先注意什么、怎样承担复杂问题、何时认真反驳、何时转身听新的意思，都属于人格。长期记忆需要保留理由、条件、例外与变化；主动性包括先准备出有用的东西、选择合适时机、继续负责，也包括不介入与允许没有任务的一刻。

当前内置人格方向为 MyGO!!!!! / Ave Mujica 十位角色；10/23旧图审主要覆盖祥子、睦、灯、爱音。当前源码已有十角色槽位并按实际portrait过滤，场景/主题覆盖应按专题07和当前注册复核；人格、头像槽位与完整演出覆盖范围不同。原作明确资料、访谈解读和在场原创演绎要分别维护；用户编辑的人格与称呼优先。旧原创角色及既有自定义数据的可读性要保留，不能把旧图退役理解成删除用户的文字人格。角色可以表达亲昵和想念；“我替你查了成绩”仍需要真实查询。角色图切换、关系配置、本人事实与读取权限各归自己的状态。

产品必须能办成事，并让人在整个过程里感到同一个伙伴在场。温柔不能替代完整证明、事实调查和已授权行动；可靠不能变成每轮朗读内部合规说明。界面操作名称可以简短自然，不必都演成角色台词；错误应说清实际影响、保住草稿与原对象，并给出可继续的路径。

**本次用户的新要求优先：**下一位主代理必须先认识项目全貌、重新读完第一阶段所有登记文件和真实原始来源，再从第二阶段重新做深。第一阶段已有成果应继承、复核和保护；不能因为“曾完成”跳过，也不能机械推倒重写。每阶段要持续追问还缺什么、还可以怎样更好，积极研究、创新、实做、修复和再观察，做到当前授权与可用条件下确实没有已知可修缺口，再进入下一阶段。短路线图是起点，不是能力上限。

## 2. 真实主循环与权威状态

主链只有一条：`App / 同一 composer → preload / 有限 IPC → Harness / RuntimeCoordinator / PolicyKernel / ContextCompiler → runtime/hermes.ts → runtime/hermes/sidecar.py → 锁定 Python AIAgent → 宿主模型传输与 ToolRegistry → 业务 owner → 原消息正文 / Scene / PresentationView / renderer`。

`runtime/hermes/lock.json`在本次审查时仍锁 Hermes `0.21.2`、commit `d595e636c83aa0b9606d4e914e1140ae9c796897`、Python `3.13`。上游依赖按冻结锁处理。Hermes 的模型请求和工具执行回到 Electron main，不能自行绕过宿主访问凭据、SQLite或学校接口。四个窄接缝是 RunFactory、StateSink、TransportObserver、ToolBridge；不是四套代理主脑。

Electron main 独占凭据、SQLite、权限、文件与副作用；renderer 只提出有限操作、显示真实内容、管理本机草稿和外观。主模型理解完整原话、选择工具、寻找反例、改判、采用子报告并回答；宿主负责身份、来源、用途、传输、留存、取消、预算、版本、幂等和实际提交。控制解析、用途核验、动作核验、记忆复核与完成核对是有界辅助调用，不能演变成先给生活话题分类、再裁掉主助手能力的第二主脑。

开发用的八位子代理与产品运行时的原生 delegate 不是同一件事。产品子调查只能收缩父来源与权限、只读、共享预算、遵守取消与版本，不再次委派。任务说明不替代根用户原话签发读取用途；报告生成后、父采用前与后续请求边界仍要核原来源。多份转述不会增加独立证据根。

当前普通产品模型与显式 Luna 代测分别由 `shared/types.ts`、`model-selection.ts`、`provider.ts`和`luna-provider.ts`确定。Luna 单次 completion 传输接现有账号，Hermes 仍负责主循环；这不是产品已支持通用 ChatGPT 登录的证明。实际型号看本次返回的 `responseModel`，配置名字不是实证。后续产品模型代测仍只用当前已授权 Luna，不调用 DeepSeek补测。

## 3. 六层记忆及其不可混淆的边界

| 层 | 核心对象 | 对下一阶段的实际意义 |
| --- | --- | --- |
| 原文证据 | SourceEvent / EvidenceSpan；event、version、Unicode范围、speaker、subject/world、root来源 | 原文是第一权威；标题、预览、摘要、向量候选不能代替原文已读。本人、第三人、虚构作品和排练分清。 |
| 条件理解 | Assertion；valid time、recorded time、条件、例外、支持和修订 | 短期例外不覆盖长期常态；更正、现实变化、过期、争议、停用和永久遗忘有不同语义。 |
| 决策经验 | DecisionExperience / FrictionHypothesis | 记住当时为什么拒绝、试过什么、后来条件是否改变；不能压成永久“不喜欢”。 |
| 协作脉络 | frame / option / Work / Episode / CooperationRecord | 同一题、同一排练、同一作品、同一规划意图跨回合继续；生成、展示、看见、理解、接受、执行分别记证。 |
| 领域观察 | DomainObservation；课程、考试、成绩、体艺、日历、天气、空气、地图、运动 | 原始记录、官方有效次数、本人报告、本机轨迹分别处理；保存快照、刚刷新、学校实时状态各有范围。 |
| 派生视图与索引 | FTS、向量、实体、ContextPack / Scene | 帮助寻找与呈现，不能成为新事实库；依赖变化后按原来源失效。 |

四轴控制分别看读取/采集、传输与推断、保留、披露与行动。“不保存聊天”不等于删除独立已授权日历；“关闭记忆”不删除纯角色；“只比较、不改”不禁止已经允许的必要读取；“不出本机”必须在任何云端控制解析之前生效，不能先送云端识别限制。

更正、撤回与遗忘沿真实event/version/Unicode范围和实际派生链传播；迟到子报告、旧协议缓存、准备、历史、导出都不能恢复已退出正文。独立未删片段和独立合法业务继续保留。普通修订或暂停不自动抹掉合法历史；永久遗忘则清关联派生正文与证明。当前语义候选代码不等于默认每轮启用 BGE：默认 ContextCompiler不自动附加该服务，记忆深入调查复用 `recall_experience / delegate.memoryInquiry`，唯一详细方法在 `prompts/memory-inquiry.md`。

## 4. 单一 owner、OpenUI与行动

| 对象 | 权威 owner / 入口 | 跨模块必须保住什么 |
| --- | --- | --- |
| 原话及选句 | KernelRepository、NativeSourceBookmarkService | session/message/event、contentVersion、hash、Unicode范围；DOM文本不是宿主已核原话。 |
| 资料/PDF | MaterialService | resourceId、原SHA/version、page、range/crop；不能复制无来源摘录替代原件读取。 |
| 用户笔记 | NotesService | noteId、revision、content hash、范围；保编辑稿、冲突、历史、撤销和回收站。 |
| 同一道题 | StudyCompanionService / NativeStudyService | problem identity、revision、原题来源；本人尝试与助手帮助分开，给过提示不等于独立掌握。 |
| 日历与排程 | CalendarService / LocalCalendarService / NativeAgendaService | 原活动ID、expectedRevision、occurrence、试放和提交区别；保准备、收尾、转场、休息和所选时窗。 |
| 地点与路线 | CampusMapAdapter、MapService、map-routing、assets/map-v2 | 稳定地点/route身份、地图版本、有向路段、入口估算和来源；故事插画不是导航几何。 |
| 本机运动 | WorkoutSessionKernel / NativeWorkoutService | 同一运动身份、原始测点、派生计算、可信时间、producer及停止回执；学校计次另归体艺来源。 |
| 学校体艺 | TiyiAdapter与独立连接器 | 认证与加密原响应、snapshot/pointer、真实分页、功能目录和个人记录的区别；不复制成另一套事实库。 |
| 准备、关注和来信 | 原 Work / Attention / Cooperation owner | 原托付、来源、期限、channel、停止条件、准备版本和真实曝光；准备好不等于送达或已看。 |

`SceneSnapshot`是宿主从真实owner形成的有限事实快照；`PresentationView`是当前消息的呈现；语义选择只是“指着这里说”；OpenUI程序局部状态是当前作品输入；业务行动和回执另有事务。模型可以自由组织有限组件和纯函数，但不能任意执行JS、伪造校园行或由一个滑块直接改日历。

OpenUI已有真实链路：`present_view.program → 共享AST/来源/CAS核验 → 原Message.views → InteractiveProgramView → 受检局部状态 → saveProgramLocalState → program:local-state:save → NativeProgramLocalState.save → Continue / 同一composer → currentInteractive`；增量 `previous + patch`仍合成整稿核验，保原program身份、版本、来源和发表锚点。不能把它写成尚无状态回流，也不能拿已接线证明所有正常模型请求都能自然构作到理想质量。声音、动画和按住等transient状态必须按生命周期停止/复位；持久参数与用户发送瞬间冻结值、处理中后来又拖动的值分别处理。

动作走 `Action → Approval → Attempt → Receipt`。明确授权且可撤销的本地修改不重复问；未授权方案只预览。CAS、planRef、幂等键和原来源在提交边界复核。`outcome_unknown / cancellation_unknown`先查原动作再恢复，不能因界面超时盲重发。对外草稿经ReleaseBrief最小受众投影，未真实发送保持草稿。预约、付款或影响他人的写入须沿具体原授权与真实回执，当前只读成果不赋予额外写权限。

持续托付与自发好奇都复用同一Harness和原owner。时间节点与真正变化可以触发重评，重评不自动扩大授权；无新价值时安静。固定已约提醒独立调度。桌面失焦与进程退出不同，退出/睡眠后没有常驻执行保证；位置桥存在也不等于完整手机/平板产品、跨设备同步和后台生命周期已完成。

## 5. 第一阶段必须重新读的原始文件与精确坐标

### 5.1 真实路径与阅读纪律

仓库根目录并没有路线图简写的 `sources/original/upload` 和 `sources/unpacked/gemini`。本次已实查的完整包根为：

`C:/Users/17601/Documents/ChatGPT/在场/work/codex-deep-review-20261021/在场-Opus深度重构-完整交接包-20261021/`。

下表用 `P/`代表该完整包根、`G/`代表`P/sources/unpacked/gemini/在场-Gemini交接包/`、`U/`代表`P/sources/original/upload/`。另有 `work/deep-refactor-20261022/handoff/`等副本；换副本必须核内容版本，不凭同名继承阅读。下载长信在 `C:/Users/17601/Downloads/在场-给Opus的深度重构长信-20261021.md`，本次实查仍271行。

旧行号对应旧版本。新代理先核文件/版本，按标题与上下文定位；读取命令输出被截断的部分不算读完。主代理亲读不能由子代理总结或技能中的“已经烙印，不用再翻原文”豁免。本次用户要求明确优先。

### 5.2 S00全貌与Stage01核心原文

| 文件 / 坐标 | 为什么必须读 | 本次本审查阅读身份 |
| --- | --- | --- |
| 下载长信全文L1–271；Stage01重点L15–84、L238–271，历史B04另强调L53–68、L254–271 | 从产品生活愿望、人设全过程、单主循环、工具、主动、记忆、OpenUI、验证到后来职责纠偏；正文里旧单人、仅本地和恢复安排需受最新指令裁决。 | 已分段阅读全文；首次合并输出截断后补读相关中段与尾段，不以首次输出代替遗漏。 |
| `work/successor-20261022/companion-correction-20261022.md`全文 | 用户直接反对用调用/型号统计替代对人格和实际交流的观察；保护Gemini活力、拒绝审计式台词。 | 全文实际读取。 |
| `U/在场的记忆讨论.txt` L2261–2400 | 痛批关键词裁工具、输出短就减少调查、年龄/疲惫套短句；要看批判的具体原例与证据边界。 | 这140行实际读取。 |
| 同文件L2621–2781 | 唯一Hermes主循环、主模型语义控制、宿主确定性责任、真实子调查、开放记忆及反向攻击架构。 | 这161行实际读取。 |
| `G/00-给Gemini的一封信.txt`全文 | 人格、昵称、工具过程、主动、默认值、真实界面与后继维护的完整委托。 | 全文实际读取。 |
| `G/01-这次具体哪里不对.txt`全文 | 6张在场失败与5张参考产品的具体观察；既有笔记/路由的问题不能只改得更可爱。 | 文字全文实际读取；本审查没有打开这11张原图，不冒领亲看。 |
| `G/02-在场现在怎样运转-从哪里改.txt`全文（历史B02重点L1–105；B04重点L96–123） | 真实组装、传输回调、owner、等待、后台及证据差异，避免重做已存在能力或只改角色卡。 | 全文实际读取；其中2026-10-19状态须对照当前实现。 |
| `G/03-角色与主动助手资料入口.txt`全文（历史B02重点L1–108） | 官方人物/访谈/视频、原作与演绎边界，研究过文字不等于看过视频；主动产品资料不是内部机制证明。 | 全文实际读取；没有重访其外网来源，不继承旧作者“已看过”身份。 |
| `G/04-把这些片段聊一遍.txt`全文（历史B02重点L1–95） | 21个正常生活片段检验人格、重开、过程交流、主动及真实结果；不是生产固定答案库。 | 全文实际读取；没有重跑这些片段。 |
| `G/05-请把这次反馈留在项目里.txt`、`G/06-阅读依据与交接说明.txt` | 已在reading-ledger登记B02→F01；第一阶段全文件重读还应覆盖文档职责与阅读证据。 | 本审查仅由台账定位，正文未读。新主代理必须补读。 |
| `docs/ideas/COMPANION_EXPERIENCES_2026-10-18.md` L17–26、L149–204、L327–382 | 个人帮法、先带一点实质、自主判断、允许安静、接住野心、让人格进入认真做事与可玩作品。 | 上述连续范围实际读取；不声称本次全文。 |
| `P/02-当前仓库与实际断点.txt`全文（B01历史至少L1–96；B04重点L63–93）、`P/03-人格与全过程交流.txt`全文（B04重点L75–105） | 历史源码与截图分别能证明什么；已存在底座、默认人设、流式接缝、全链文风与原有成果保护。 | 两份全文实际读取；固定SHA快照的行号不代替当前代码。 |
| `P/00-从这里开始.txt`、`P/01-给Opus的完整委托.txt`、`P/04-记忆与协作连续性.txt` | S00入口、完整授权与全貌；B02历史还登记过04的L1–95。 | 本审查通过路线图/台账定位，正文未读；全貌接手须补读。 |
| `U/harness讨论(1).md` L1–101 | 原大学生/环境建模、128场景、12时间线与广义主动；场景不能变关键词路由。 | 指定范围实际读取。 |
| `U/在场-Harness-完整设计与最终实施提示词.md` L661–714（H1–H5） | domain/provider/tool/skill分工、渐进发现、manifest、分域同步与既有能力适配。 | 指定范围实际读取。 |
| `docs/research/CHARACTER_SOURCES_2026-10-21.md`全文 | 官方事实、访谈理解、项目演绎、Gemini保留内容和仍未看过视频的边界。 | 全文实际读取；旧原创视觉/默认状态已被当前规范更新。 |

### 5.3 不得遗漏的台账登记：B01–B04还有这些文件

`docs/reading/2026-10-22/reading-ledger.json`、`FILE_GUIDE.md`、`SOURCE_SEGMENTS.md`是完整登记权威入口。**台账的summary_read_ranges是前序摘要作者读过的旧范围，不是下一位主代理的阅读回执。**本次已实际查询该JSON中全部`planned_phase`包含B02/B03/B04的记录；B01存在大量“按运行依赖选段”通用登记，不应把它误解成每个许可证都决定当前人格修复，也不能将其从总材料交接中删除。按依赖完成各份阅读、注明全文/定点/目录，并保留全量台账来对账。

以下是第一阶段实质链路登记清单，路径相对仓库根。源码已演进，新接手应按真实符号重读，不能套旧行号宣布已读：

- **B01输入、范围、原话、状态接缝：**`src/main/harness.ts`、`main.ts`、`preload.ts`、`demo.ts`、`model-selection.ts`、`testBoundary.ts`、`md.d.ts`；`src/main/runtime/turn-controls.ts`、`controls.ts`、`policy.ts`、`coordinator.ts`、`context.ts`、`discourse.ts`、`semantics.ts`、`interaction-control-context.ts`、`action-delegation.ts`、`completion-review.ts`、`observation-review.ts`、`structured-result.ts`、`model-usage.ts`、`hermes.ts`、`investigation-frontier.ts`、`method-work-help.ts`、`release-composer.ts`、`release-projection.ts`、`release-store.ts`、`spatial.ts`；`src/shared/harness.ts`、`interaction.ts`、`limits.ts`、`schemas.ts`、`types.ts`、`model-contract.json`、`curve-expression.ts`、`method-work-help.ts`、`notes-source.ts`；`prompts/working-details.md`、`docs/HARNESS_EVOLUTION.md`、`docs/STUDENT_HARNESS.md`。
- **B02人格、个人方法与继承：**`src/shared/persona.ts`、`persona-performance.ts`、`persona-portrayals.ts`、`persona-card-import.ts`、`personal-method.ts`；`src/main/runtime/prompt-composition.ts`、`personal-methods.ts`、`personal-method-continuity.ts`；`prompts/system.md`；`docs/research/PERSONAL_MEMORY_CONTINUITY_2026-10-18.md`（旧登记1–166）、`PERSONAL_MEMORY_ROUND2_2026-10-18.md`（1–141）、`PERSONAL_METHODS_MATERIALS_2026-10-18.md`（1–54）、`PERSONA_TOOLS_2026-10-18.md`（1–80）；既有`tests/harness/persona-portrayals.test.ts`可读可运行，不新增用例。旧登记的`assets/design/generated/2026-10-18-personal-memory/daily-rhythm-manifest.json`（1–105）及`daily-rhythm-prompts.txt`（1–62）须向当前资产总目录核对迁移/退役位置，本审查未据旧路径认定仍可用。
- **B03能力自然发现：**`src/main/runtime/tool-surface.ts`、`skills.ts`、`src/main/tools.ts`；实际Broker在`src/main/capabilities/broker.ts`，**不是**技能/路线图部分旧链接中的`src/main/runtime/broker.ts`；`docs/research/TOOL_DISCOVERY_2026-10-21.md`（旧登记1–149）；与B05/F03–F05共用登记的`runtime/evidence-images.ts`、`life-collaboration-tools.ts`以及`P/07-研究来源与方案比较.txt`须按当前任务关系接回。紫金港地图研究执行包是共享研究来源，不代表本阶段已重新读过或已验证。
- **B04回合内流式、去重、打断与故障：**`src/main/provider.ts`、`luna-provider.ts`、`runtime/hermes.ts`、`conversation-rhythm.ts`、`model-wait.ts`、`harness.ts`，还要接当前`protocol-history-coverage.ts`、`presentation-delivery.ts`、`completion-review.ts`、原Notes变更事件与renderer接线。旧台账B04的provider范围1–140、183–426及strictDialect定位，Luna范围12–250、255–272，rhythm1–126，均只作旧版本定位。
- **S00/B01旧harness包：**`docs/source-materials/2026-10-18/harness-pack/`中的`00-START-HERE`、`01-CODEX-START-PROMPT`、`02-REPOSITORY-AUDIT`、`03-HUMAN-AND-WORLD-MODEL`、`04-HARNESS-DESIGN`、`05-MEMORY-CONTEXT-PERSONA`、`06-IMPLEMENTATION-AND-ACCEPTANCE`、`07-RESEARCH-DECISIONS`、`08-SCENARIOS-128`、`09-REVIEW-AND-LIMITS`；`contracts/design-types.ts`、`examples/configuration-proposal.json`、`examples/persona-presets.json`；`scenarios/scenario-schema.json`、`scenarios.json`、`timelines-guide.md`、`timelines.json`、`FILE-MANIFEST.json`和相关evidence（attachment-intent-audit、cloud-restriction-probe、implementation-review、probe-cloud-restriction-results、repo-retrieval-manifest）。台账还保留外层ZIP与内层ZIP条目；应读展开原件，不能把ZIP存在记作全部正文已读。旧probe脚本是历史材料，不自动授予运行/新增runner权。

全貌文档必须连读：`README.md`、`AGENTS.md`、`PROJECT_NAVIGATION.md`、`docs/PROJECT_BASELINE.md`、`PRODUCT_CONTRACT.md`、`ARCHITECTURE.md`、`CURRENT_STATUS.md`、`CONTINUE_FROM_HERE.md`、`CONVERSATION_SCENES.md`、`FRONTEND_DESIGN.md`、路线图全文、深度评鉴入口与下一阶段提示词。五大项目技能按本次明确要求读取，两个总监技能及专项references用于理解，不能成为不读原始讨论的捷径。

## 6. 第一阶段已经做出的东西，重新开始第二阶段时必须保护

第一阶段权威汇总为`docs/evidence/2026-10-23-stage01.md`，本次已全文读取。它明确记录本轮从第一阶段重读、八位子代理与主代理完成实现/修复/复查并收尾；曾提前分派第二阶段后收回，没有把早读或旧成果算本轮完成。这个“已交付”是原轮次结论，不能免除接手理解，也不应凭空否认其实际成果。

| 领域 | 历史已落地成果 | 接手时的保护/复核重点 |
| --- | --- | --- |
| B01 原话与隐私 | 本机前置拦截补漏；区分查网页与发云；明确重新采用的引用内约定可生效；“只比较不改”不误造局部读取禁令。 | 不把自然语法识别宣传成理解全部语言；未加引号的假设政策讨论仍可能被保守拦下，原报告已注明。不能以减少延迟跳过传输前限制。 |
| B02 人格主权 | 用户改过性格/口吻/例句后，不由旧preset偷偷补回旧人格；纯角色在关闭记忆后继续；十角色注意力进入认真查找、讲解、创作与改主意。 | 不删除Gemini例句，不通过固定词/句长/昵称频率代替人格；保持当前用户设定与事实依据。真实交流样本不证明永久稳定。 |
| B03 渐进发现 | 目录可空查全览、精确能力优先、提供可继续地址；scopeEligible诚实区分范围资格与动作已批准；union不伪造空required；排练自然创建、保存、重开续同owner。 | 发现/连接/本轮可读/写入获准/成功读取分别表达；不因只读能力详情而执行写能力。私下点评与独立成稿目的分开。 |
| B04 公开接力 | 稳定已发表前段与可替换尾段、最近2400 Unicode码点现场身份、消息ID覆盖去重、回答期笔记修订通知/删除屏障、普通transport错误保合法已显示内容。 | 不把临时预览记accepted，不把未显示后台答案说成已讲过；停止/补话不复活旧调查。修复仍沿同一Hermes续改，不加统一润色器。 |
| 来源/缓存补强 | 旧画面目录只给地址；用途核对后沿精确原Scene回读；材料工具结果退出跨轮不透明协议缓存；前情按需要由主助手接回。 | 保留地址≠正文已读；同轮曾读与下一轮可重新读取分开；局部限源不预塞旧正文。 |
| 个人方法 | 局部amend先合并原步骤/条件，再核整稿；reviewDigest绑定同份待存内容，CAS与来源共同核查；保存/局部修订/重开/回读已有真实入口观察。 | 核对A不能保存换成B；今天不借用不改长期方法；来源退出不回读正文。 |
| 地图真回读 | 同版路线事实交回主助手和完成核对，保来源、估算、故事身份及实际计量；两点返回原Scene估时。真实桌面曾失败，修后正常重开并按同句完成。 | 现有路线展开不重算；已记录道路与两头估算接入分开。原失败完整wire未留，不把源码发现说成排他根因。 |
| 实际界面与阅读 | 主代理Windows真实Electron沿正常composer操作完整积分、查路、地图聚焦与键盘返回；长回答背景遮挡已修后亲看。 | API呈现与桌面画面分别记证；窗口重叠造成的鼠标返回不能冒充成功。后续UI改动仍须亲操最终集成。 |

该阶段原报告称最后一批后现有282项检查、类型和完整构建通过，Hermes9项已通过；这些数字只证明当时对应版本/范围。原报告未声称生产DeepSeek、全自然语言、长期人格、全端通知或所有等待已经消失。静态字符量从77,666到69,824也不等于token或首字等待的受控性能证明。Luna传输短期复用节省部分准备，不建立产品第二聊天循环。

早期逐步证据还在`work/successor-20261022/`：`B01.1-evidence.md`、`B01.2-evidence.md`、`B02.1-evidence.md`、`B02.2-evidence.md`、`B03.1-evidence.md`、`B03.2-evidence.md`、`B04.1-evidence.md`、`B04-cache-evidence.md`、`B04-source-change-evidence.md`、`B04-transport-evidence.md`及`reading.json`、`B04-cache-reading.json`、`B04-source-transport-reading.json`。本审查全文读了B01.1/B01.2/B02.1/B03.2，读了B03.1正文；其余只定位/由路线图与阶段报告交叉确认，没有逐份私有原wire审计。新主代理应补读这些脱敏说明，私人诊断库和完整校园原文不复制进交接或Git。

路线图B02历史还登记了一个后续B14问题：旧Store默认版本迁移可能把明确保存的`remindersEnabled=false`改为true。这里仅确认历史确有此登记，未检查当前是否已修；新主代理应沿当前Store实现和Stage05登记核实，不能把它在交接中丢掉，也不能未经复现宣称当前仍必然存在。

## 7. 当前源码入口与必要纠偏

| 入口 | 应当沿什么问题阅读 | 本次阅读程度 |
| --- | --- | --- |
| `src/main/harness.ts` | start前置准入、run模型边界、onText、同run child、工具回路、两次续改、finish/cancel/barrier。当前关键定位：run约990，现场文本约1265–1380，原用途入口约1642，Hermes及完成核对约2176–2315。 | 全文件符号定位与文档交叉；未逐行阅读全文。新接手须沿实际调用读核心块。 |
| `runtime/hermes/sidecar.py`、`src/main/runtime/hermes.ts`、`lock.json` | 模型/工具回调怎样回宿主、真实AIAgent、子任务收缩、取消与事件顺序。 | 锁全文；桥/侧车由架构和references交叉定位，未全读源码。 |
| `src/main/runtime/prompt-composition.ts`、`prompts/system.md`、`working-details.md` | 角色在前、共同原则、交互偏好、rhythm、本轮说明；前后台与worker各自读到什么，是否用平实说明保护理解空间。 | 三份全文实际读取；working-details首次截断后补读开头，正文覆盖已补齐。 |
| `src/shared/persona.ts` | personaGuidance如何尊重用户改动，initialPersona当前确为sakiko，新选项只列十原作与custom，legacy仍可解析。 | 实读325–344、400–509及符号定位；不宣称全文件读完。 |
| `src/shared/persona-performance.ts`、`persona-portrayals.ts` | 人格如何进入attention/listen/create/weigh，不让办事变同一种客服；来源分层。 | 符号和文档定位，未全文读。路线图旧runtime路径已核为错误。 |
| `src/main/runtime/conversation-rhythm.ts` | draft/publication/commit/final、来源退出、前缀去重、2400码点现场片段、凭据流式脱敏。 | 全文实际读取；技能示意名如committedPrefix不替代当前spoken实现。 |
| `src/main/runtime/turn-controls.ts` | 本机前门与语义控制分工；引号约定、网页禁搜和云端禁传分别处理。 | 实读38–99及符号定位；未全文。 |
| `src/main/capabilities/broker.ts`、`runtime/tool-surface.ts`、`tools.ts`、`runtime/skills.ts` | 目录资格、分页、精确入口、discover/describe/invoke、read/write差别、原schema、按需详情与预算。 | 符号/元数据定位；未将其全文阅读作为本次完成依据。 |
| `src/main/runtime/context.ts`、`policy.ts`、`storage/repository.ts`、`memory/service.ts` | 实际读到什么、原来源证明、保留/传输/主体/时间、遗忘与late result、派生传播。 | 当前架构/技能全文解释已读；核心源代码仍需新主代理完整追实际依赖。 |
| `runtime/interactive-program*.ts`、`shared/interactive-library.ts`、renderer/presentation | 原Scene、程序、局部输入、真实发表与业务状态独立；currentInteractive带回同一composer。 | 架构/专项reference全文已读，源码入口定位；未宣称交互实测。 |

注意三类旧材料失真：①总监技能写“以后无需再翻数万行原文”，与本次明确要重读相冲突，执行用户要求；②`extensions-and-evaluation.md`把移动GPS/官方体艺实时入口仍统写待接入，当前Stage02已有窄位置桥、运动owner和本人部分读取，必须看当前证据逐项更新判断；③`PROJECT_BASELINE.md`、Gemini02、角色来源旧文档中的默认原创人物、旧分支与待接状态属于当时基线，不能盖过`CURRENT_STATUS`和当前源码。不能相反地用新源码把当时失败改写成从未发生。

## 8. 下一位主代理的第一阶段接受条件

先亲自写清项目为何存在、一条真实对话如何工作、各业务owner、全貌与阶段关系、两条前序对话在干什么、第一阶段为何这么改，再分配第二阶段研发。随后对照本清单与全量阅读台账，逐文件登记当前版本、实际连续阅读范围、关键反驳/转折、未读与下一位置；目录、摘要、别人的“已读”单独列，不能合并为主代理亲读。

第一阶段复核不要求推倒已有全部代码，也不要求无变化反复全套验证。先保护健康成果，按旧真实触发和新发现检查必要路径；发现当前可修的在范围内缺陷，就诊断、修复、沿原触发再看。阶段极致意味着既完成明确目标，也认真发掘有价值的相邻改进并落成真实结果，且无已知可修缺口；不是空喊100分、无限新增测试或以一句“以后再做”跳过当前能做的工作。

第二阶段仍是当前阶段。10月24日体艺纯直连修复只补上了此前网络断点，并不能把体艺缩成资料/汇总/流水/订单，也不能宣布第二阶段结束。新团队应从第二阶段全貌重新排查、研究与深做，保住最新直连通路，把官方应用/电脑端的真实功能、读取与写入条件、GPS与生活陪伴的关联逐项查清。MuMu正常可用是可实操参照和定位差异的工具，不能用WebVPN替代用户明确偏好的直连。详细第二阶段范围与资源由本交接其他专项审查承接。

本审查没有新建测试、runner、业务数据或临时脚本，亦没有运行产品或查询私人资料；没有需要清理的任务生成物。只新增本交接文档。
