# 项目导航

**先看全貌：[项目全貌与源码基线](docs/PROJECT_BASELINE.md)。** 该页统一说明理念、源码／EXE／公共站点的不同基线、单一 Harness、状态所有者、OpenUI、地图与功能边界；当前接续见 [CONTINUE_FROM_HERE](docs/CONTINUE_FROM_HERE.md)。本文件继续维护详细文件索引，实际验证统一归 [CURRENT_STATUS](docs/CURRENT_STATUS.md)。

> **前端视觉设计主文档：[前端视觉创新设计/图片来源对话.md](前端视觉创新设计/图片来源对话.md)**。图片、补充图稿和素材入口见根目录 [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md)，页面对应见[图像与页面对应](前端视觉创新设计/图像与页面对应.md)。

本文件是当前项目的入口、职责与文件索引，本轮整理日期为 **2026-10-19**。以实际 checkout 和所述调用链为准；本轮源码包含学生 Harness、对话场景与前端演进，源码提交、线上部署和历史验收分别记录。[当前状态](docs/CURRENT_STATUS.md)维护功能与证据，[架构](docs/ARCHITECTURE.md)解释运行机制。

<a id="current-evolution"></a>
## 本轮续接：记忆、主动陪伴与对话体验

当前续作先读[完整目标](docs/source-materials/2026-10-18/goal-objective-current-20261018.md)和[最新视觉要求](docs/source-materials/2026-10-18/visual-fidelity-requirement-20261018.md)。本批主线是[带着说不清的事来，回来不用重讲](docs/CURRENT_STATUS.md#personal-memory-round7)：主模型深读、眼前交流、共同商量、陪学、相处与具体生活内容沿同一聊天接力，图稿需落实为真实画面与动效。下面的[本轮入口](#companion-experience)定位实际owner与界面；源码接入不借用旧验收，必要视觉观察与未运行的产品模型分开记录。[第六批](docs/CURRENT_STATUS.md#personal-memory-round6)、[第五批](docs/CURRENT_STATUS.md#personal-memory-round5)和[第四批](docs/CURRENT_STATUS.md#personal-memory-round4)分别保留原导航、候选与学习等历史增量。较早同步记录曾在`e4254aa`继续整合已合并分支，本轮保留共享dirty工作，不将该历史同步记录说成之后每次checkout的证明。

较早阶段的[完整原始请求](docs/source-materials/2026-10-18/goal-objective-20261018.md)和[持续改进补充原话](docs/source-materials/2026-10-18/ongoing-improvement-20261018.md)仍可追溯 → [需求与实现明细](docs/HARNESS_EVOLUTION.md) → [当前状态与证据](docs/CURRENT_STATUS.md)。此前从 `c7cff228` 完成过一轮后端与四组 GPT Image 方案；随后在合并后的 `4edd922` 上补原文浏览/精确遗忘、决策经历、准备发现、逐日规划和技能依赖组，后端收口后改进已有规划/环境/角色界面并实际检查。检查数字与界面证据统一在状态文档记录，不借用旧轮结果。这里保留较早持续推进要求；当前阶段以最新直接要求为准，完成本阶段收尾后暂停，原总目标不因此被标为全部完成。

[原始来源归档](docs/source-materials/2026-10-18/README.md)保留实施包、完整记忆讨论、最新54,484字节桌面Harness讨论、完整goal附件、持续补充原话及动态/前端理念，逐文件字节/哈希与各轮回执分别记录。旧41,067字节Harness和早期短版记忆的前缀关系均保留；本次桌面记忆文件与完整归档相同，不重复复制。归档是私人参考，不是运行时指令或本人画像。

<a id="companion-experience"></a>
### 本轮入口：交流、共做与回来时的起点

入口仍是原聊天，有限画面随内容出现；以下是代码职责导航，不是使用者需要选择的一组管理页面。统一状态在[第七批](docs/CURRENT_STATUS.md#personal-memory-round7)，设计与实际呈现边界见[对话场景](docs/CONVERSATION_SCENES.md#companion-experience)。

当前执行顺序已由[阶段收尾原话](docs/source-materials/2026-10-18/stage-close-and-luna-validation-20261019.md)收束：停止创新外延，完成正常Luna动态呈现、既有校园只读及真实失败修复后暂停，等待用户回来。下面的源码入口与实际通过范围分开，不用配置型号、手动投影或旧图替代本阶段证据。

| 人的任务 | 入口与状态所有者 | 主要源码 |
| --- | --- | --- |
| 按眼前的问题自由做一个可操作的内容 | `present_view.program`接原Message.views；`read_skill id=interactive-program`从实际共享库生成authoring完整构作契约与原总览／grammar／签名小页；新作一次取得契约，编辑按需读原作和增量签名。通用renderer、原Scene的SourceSlot、有限Motion与同composer引用／发送时局部状态已接源码；真实Luna与交互结果另见状态文档 | 共享定义`src/shared/interactive-{program,library,functions}.ts`；宿主`src/main/runtime/interactive-program.ts`、`interactive-program-{compiler,ast,edit,guidance,sources,reference}.ts`及`skills.ts`；呈现`src/renderer/presentation/InteractiveProgramView.tsx`、`interactive-{context,primitives,graphics,motion}.tsx`与`interactive-program.css`，由`AssistantPresentation.tsx`和`App.tsx`接入 |
| **她怎么说话**（人格、形象、关系定位与语气表达） | 角色预设与心理层次、相处约定与昵称称呼（如「老公」「小灰灰」等）、系统提示词反官僚审计规则 | `src/shared/persona-portrayals.ts`（祥子/睦等核心人设与情景示例）、`src/shared/persona.ts`（陪伴基线、关系情景问答、抗官僚语言指南）、`src/shared/persona-performance.ts`（欢迎想念与参与方式）、`prompts/system.md`（系统级反官僚语言约束） |
| **中途怎样接话**（流式接力、前置承接、工具步骤描述） | 真实主模型先行语义承接、工具过程自然命名、收尾段落去重 | `src/main/runtime/conversation-rhythm.ts`（自然语言接力、承接语引导、输出去重）、`src/main/tools.ts`（`formatToolStepTitle` 业务感知化步骤重命名） |
| **没发消息时怎样来找我**（后台机会发现、安静准备与关怀提醒） | 后台机会审查白名单放行好奇邀请与回顾来信、系统通知动态署名 | `src/main/runtime/coordinator.ts`（机会审查放行 `curiosity_invitation` / `write_reflective_letter`）、`src/main/actions/reminders.ts`（系统桌面通知带具体角色署名与事件情境）、`src/main/harness.ts` 与 `src/renderer/App.tsx`（消息气泡角色署名绑定） |
| 看应用已经记下的安排，再指一项继续问 | `look_up source=local`沿原日历有界读取，实际返回的sceneRef可交`present_view`；不是重新试排 | `src/main/runtime/agenda-scene.ts`、`scenes.ts`、`coordinator.ts`；复用PlanningScene的`mode=agenda`及原时间带，真实模型与点选续问范围见当前状态 |
| 读实际成绩、比较明确的GPA口径 | 原校园查询返回CampusScene；detail／table／trend只呈现实际命名字段，点记录后沿当前用途重新读取 | `src/shared/scenes.ts`、`src/main/runtime/scenes.ts`／`coordinator.ts`、`src/renderer/presentation/CampusAcademicView.tsx`；真实账号读取与实际呈现分别记录，不以源码代验收 |
| 把一页原笔记留在这段对话里读 | `manage_note operation=read`实际页给`present.arguments`，`present_view.note`回同NotesService核原页；选句只接着聊 | `src/shared/notes-source.ts`／`note-presentation.ts`、`src/main/runtime/note-presentation.ts`、`src/main/notes/service.ts`、`src/renderer/presentation/NoteSceneView.tsx` |
| 深入找回过去为什么、后来变了什么 | `recall_experience`规范为原生`delegate`；原delegate也可带`memoryInquiry`，子调查仍归同一父run | `src/main/runtime/memory-inquiry.ts`、`background-delegation.ts`、`harness.ts`；唯一详细方法`prompts/memory-inquiry.md`，`skills.ts`复用它 |
| 眼前先得到帮助，还能补一句改变方向 | 同一主助手已返回的实质前段先呈现，最终答复接续；补充停止旧run后走普通新原话入口 | `src/main/runtime/conversation-rhythm.ts`、`src/main/harness.ts`、`src/renderer/ComposerActions.tsx`与`App.tsx` |
| 指着一行、一段或一句继续说 | 原StudyInteraction、SemanticSelection、companionReference、curiosityReference及letterReference精确目标随普通输入同行；小引用可取消，已有草稿保留 | `src/renderer/LocalTextFocus.tsx`／`FocusContextChip.tsx`、纯renderer的`ConversationTextFocus.tsx`、`RichText.tsx`真实文本源位置与`App.tsx`；`src/shared/study-presentation.ts`／`curiosity-source.ts`／`reflective-letter.ts`；`src/main/runtime/interaction-control-context.ts`及`turn-controls.ts` |
| 一起创作，作品里的“我”不串成本人经历 | 本条已核作品／取景地址形成非正文来源身份，随原event保留；原理解、复核与恢复分别识别创作活动和作品命题，不整轮禁止推断 | `src/shared/harness.ts`的sourceContext union、`src/shared/source-context.ts`、`src/main/runtime/interaction-control-context.ts`、`coordinator.ts`、`src/main/memory/context-windows.ts`／`model.ts`／`service.ts`；当前仅源码，无记忆模型效果证据 |
| 把一件说不清的事摊开商量 | `present_view.discussion`投影原frame、option与当前小步；选择只接着聊 | `src/shared/discussion-scene.ts`、`src/main/runtime/discussion-scene.ts`／`scenes.ts`、`src/renderer/presentation/DiscussionSceneView.tsx` |
| 一起做、暂放、回来接起 | `manage_companion_session/read_companion_session`，原matter下`companion_session`；旧页的冻结解释沿`read_companion_history`回读，不以新停点替换 | `src/shared/companion-session.ts`、`src/main/runtime/companion-session.ts`、`coordinator.ts`及repository原Scene来源门、`src/renderer/presentation/CompanionSessionView.tsx`；旧页来源延伸已接源码，待统一实际运行 |
| 同一道题按当前意愿提示、换例子或讲清楚 | `study_companion/read_study_companion`，原matter下`study_companion`；原题与材料仍归原owner；正常composer可停靠纸内，只有一次发送 | `src/shared/study-companion.ts`／`study-presentation.ts`、`src/main/runtime/study-companion.ts`／`study-presentation.ts`／`study-native.ts`、`src/renderer/presentation/StudySceneView.tsx`与`src/renderer/ConversationComposerDock.tsx` |
| 在同一题边改条件、看变化再继续问 | 有限quadratic关系归当前Study step，值／曲线／切线由同一声明重算；当前改变是计算假设，不是本人事实或掌握 | `src/shared/explorable-study.ts`、`src/main/runtime/explorable-study.ts`、`src/renderer/presentation/ExplorableStudyView.tsx`；源已接，实际整合画面待观察 |
| 自然接回旧话题、共同说法和明确相处方法 | `read_companion/manage_companion`沿原frame；`conversation`个人方法仍经read_skill | `src/shared/companion-continuity.ts`、`src/main/runtime/companion-continuity.ts`／`life-collaboration-tools.ts`／`personal-methods.ts` |
| 有用的做法带着当时帮助和条件继续用 | 个人方法沿原owner，PersonalMethodSources保留原帮助／事项／学习来处；可回读当时Study步骤或已发布共做字段；普通修订保留合法历史，删除／撤源阻止派生文字回流 | `src/shared/personal-method.ts`／`method-work-help.ts`、`src/main/runtime/personal-methods.ts`／`personal-method-continuity.ts`／`method-work-help.ts`、`context.ts`、`src/shared/harness.ts`的receipt与repository来源门；当前未运行新采用链 |
| 初始只给少量可回读线索 | ContextCompiler的`setLifeContinuity` provider，实际准入后登记records、bindings与学习引用 | `src/main/runtime/life-continuity.ts`、`context.ts`、`coordinator.ts`；不打开陪学材料，不恢复活动 |
| 写给当下这个人的一封回顾 | `write_reflective_letter/read_reflective_letter`接原机会、准备与呈现；脚注走受限原来源IPC | `src/shared/reflective-letter.ts`、`src/main/runtime/reflective-letter.ts`／`reflective-letter-tools.ts`、`src/renderer/LetterMessage.tsx`／`letter.css` |
| 一起比较安排的真实取舍 | `planning.compare`、`offer_planning_alternatives/read_planning_alternative/continue_planning`接原frame／option及动作链；本次continuous／split保留同一工作量及实际各段准备收尾，新节奏未运行 | `src/main/actions/planning-comparison.ts`、`src/main/runtime/planning-conversation.ts`／`planning-conversation-tools.ts`／`planning-comparison-scene.ts`、`src/renderer/presentation/PlanningComparisonHeader.tsx`／`PlanningComparisonTimeline.tsx` |
| 带来一件已经准备好的新鲜事 | `curiosity_invitation`沿当前邀请及原frame／option；任意回答沿同一临时引用继续，换一个／放下不变成目标 | `src/shared/curiosity-invitation.ts`／`curiosity-scene.ts`／`curiosity-source.ts`、`src/main/runtime/curiosity-invitation.ts`／`curiosity-tools.ts`／`curiosity-scene.ts`、`src/renderer/presentation/CuriosityInvitationView.tsx` |
| 找回以前一起写过的原章，再从那里继续 | 助手历史的作品目录和`read_shared_creation`回读原message／Scene，`continue.fromChapter`保留原章出处；目录不算已读正文 | `src/main/storage/repository.ts`、`src/main/runtime/curiosity-invitation.ts`／`curiosity-tools.ts`、`context.ts`、`src/shared/harness.ts`的AssistantWorkSource |
| 保留作品取景的后端恢复入口 | 本阶段联动取景界面未交付，正常工具已冻结该入口；原公共地图和共同创作正文仍各自可用 | `src/shared/story-setting.ts`、`src/main/runtime/story-setting.ts`与[取舍研究](docs/research/SHARED_CREATION_MAP_SETTING_2026-10-19.md)保留后端源码；没有可用StorySettingView，不列为当前正常对话可呈现能力 |
| 先试说一段难表达的话 | `manage_relationship_rehearsal/read_relationship_rehearsal`与`present_view.rehearsal`仍接同一主助手和输入；模拟回应不是现实关系事实 | `src/shared/relationship-rehearsal.ts`、`src/main/runtime/relationship-rehearsal.ts`／`relationship-rehearsal-tools.ts`／`rehearsal-presentation.ts`／`rehearsal-ingress.ts`／`rehearsal-native.ts`、`src/renderer/presentation/RehearsalSceneView.tsx` |
| 角色真正参与听、一起做与权衡 | 当前persona guidance采用参与方式，原角色核心仍可编辑且不增加权限 | `src/shared/persona-performance.ts`、`src/shared/persona.ts`、`src/main/harness.ts` |

中心工具注册、Scene编译及真实消息发布在`src/main/runtime/coordinator.ts`／`src/main/harness.ts`；消息内组件入口在`src/renderer/presentation/AssistantPresentation.tsx`，输入动作与当前纸页引用归`App.tsx`。`ComposerActions`已接原输入区，补充沿停止旧run→普通新发送办理。图稿入口：[共同商量](assets/design/generated/2026-10-18-shared-discussion/manifest.json)、[共同做事](assets/design/generated/2026-10-18-companion-session/manifest.json)、[陪学纸](assets/design/generated/2026-10-18-study-paper/manifest.json)、[安排比较](assets/design/generated/2026-10-18-planning-comparison/manifest.json)、[来信](assets/design/generated/2026-10-18-reflective-letter/manifest.json)、[可以马上玩的小发现](assets/design/generated/2026-10-18-curiosity-invitation/manifest.json)。好奇纸面从设计图编辑提取为`src/renderer/assets/curiosity/manuscript-paper.png`，来源与用途见[纸面资产说明](assets/design/generated/2026-10-18-curiosity-invitation/paper-asset.json)。图稿不进入运行时事实；实际画面与动效的观察见当前状态，不能从文件存在推定。

| 本轮研究与审查 | 实施方向 |
| --- | --- |
| [主模型引导的理解](docs/research/MODEL_GUIDED_UNDERSTANDING_2026-10-18.md) | 围绕当前问题深读理由、迁移相关经历并在变化后重评；高层入口沿同一Hermes真实子调查，不以下载模型或索引工程替代主动理解。当前源码接线，尚无产品模型和体验验证 |
| [原话接回已有事项](docs/research/SOURCE_RELATED_WORK_2026-10-18.md) | `memory/source-related.ts`与`repo.sourceRelatedWorkPage`复用原Work声明的来源；预览／`actualReadRanges`给绝对Unicode地址，经`restore_collaboration(type=source_related)`取得候选与原owner入口。typed精确交叠、legacy整条未知、session／许可／完整关系来源分开；30分钟keyset目录不计原文read／ACK，不恢复活动，不建新事实库。同轮托付／调查链的`runtime/source-quote.ts`统一定位已接源码，不回填旧库或重定位失效范围；未运行，未全量改写其他quote入口 |
| [课表与个人日视图图稿](assets/design/generated/2026-10-18-campus-day/manifest.json) | 后端源码整合之后生成A/B并选A；`renderer/CampusDaySchedule.tsx`/`Workspace.tsx`/`today.css`接同一天只读校园安排与个人Action；未启动或验收当前界面 |
| [校园快照与规划](docs/research/CAMPUS_PLANNING_BRIDGE_2026-10-18.md) | `actions/planning-campus.ts`、`capabilities/campus-saved-source.ts`沿ZjuAdapter原链签发当前bundle证明，约束进入原planner；NativeCampusCalendar与共享契约提供只读日视图；本地元数据变化沿原Domain/attention链 |
| [同一调查原文续读](docs/research/PERSISTENT_INVESTIGATION_2026-10-18.md) | `runtime/investigation-frontier.ts`、`delegation-evidence.ts`与coordinator/Harness两层投递；只保存地址、覆盖与事务ACK，未ACK正文仍有缺口；本批源码未运行验证 |
| [学习尝试与帮助](docs/research/LEARNING_PROCESS_2026-10-18.md) | `memory/learning-process.ts`沿原Work experience及共同事项，`manage_learning/read_learning`保留原题、尝试、帮助、条件与报告地址，不推断掌握；来源沿ContextReceipt、历史与遗忘传递 |
| [个人方法与材料发现](docs/research/PERSONAL_METHODS_MATERIALS_2026-10-18.md) | `runtime/personal-methods.ts`接原discover/read技能入口；`materials/service.ts`接有界目录和精确原话定位，临时会话仍不持久复制；WorkSourceBinding贯穿实际采用正文 |
| [完整资料与当前能力基线](docs/research/SOURCE_CAPABILITY_MAP_2026-10-18.md) | 逐份回读原始材料及ZIP全部28文件，明确校园查询、单课材料、并行子代理、资料阅读等原已存在；将当前dirty增量、重复建设风险及真实剩余方向分开，后续实施先以此核准基线 |
| [本地语义候选的实际取舍](docs/research/LOCAL_SEMANTIC_RECALL_2026-10-18.md) | 从固定Khoj/Mem0与HF模型比较推进到BGE q8源码接线；四个模型文件24,451,050字节及固定依赖已安装，CPU懒加载worker、schema14派生索引与词法／语义两臂融合已写入原入口；冻结排名和下一候选窗口续接也已接源码，运行／效果未验证，见[第五批](docs/CURRENT_STATUS.md#personal-memory-round5) |
| [理解变迁回读](docs/research/MEMORY_HISTORY_2026-10-18.md) | `memory/history.ts`沿同一Assertion读取修订、原有条件与现实时间；schema13只新增宿主提交元数据，旧时间未知，旧正文仍服从当前引用；已接`read_understanding(view=history)`，本项按用户要求未运行测试或模型 |
| [第三批：可恢复的规划意图](docs/research/PERSISTENT_PLANNING_INTENT_2026-10-18.md) | 从 `30dcd8e` 比较八方向后，保留原Work规格、独立attempt来源与prepare原子关联，联查原动作／回执／日历后同一planner重算；安静续接界面已有实际观察，最终恢复边界复核状态见[第三批状态](docs/CURRENT_STATUS.md#personal-memory-round3) |
| [继续商量图稿比较](assets/design/generated/2026-10-18-planning-continuity/manifest.json) | 后端整合检查后生成并亲看A/B；选A连续时间线与轻量关系文字，保留原日历上下文；图稿与实际操作证据分别记录，合成来源截图只留本机 |
| [第二批：证据、恢复与契约](docs/research/PERSONAL_MEMORY_ROUND2_2026-10-18.md) | 精确多源citations、来源坐标归一、48KB上下文与合法澄清恢复、整体安排窗、动作契约；当时保留的规划意图、调查、学习与向量候选分别在第三至第五批继续接线，历史报告不代替当前状态，手机仍是独立里程碑 |
| [安排时窗图稿比较](assets/design/generated/2026-10-18-chosen-windows/manifest.json) | 后端检查之后生成A日期条/B折叠日，采用A的真实时窗表达；样例资料、窄窗布局和实际产品证据分开 |
| [个人记忆与生活连续性](docs/research/PERSONAL_MEMORY_CONTINUITY_2026-10-18.md) | 本次16域/12时间线交叉审计、原文浏览、精确遗忘、决策经历、准备发现/逐日承载及候选取舍；源码机制与语义/设备证据分开 |
| [记忆](docs/research/MEMORY_EVOLUTION_2026-10-18.md) | 多查询、有限扫描、原始依据与纠正后续线索 |
| [主动创新](docs/research/INITIATIVE_INNOVATION_2026-10-18.md) | 跨会话准备材料与未完事项的有限续接索引 |
| [角色和方法](docs/research/PERSONA_TOOLS_2026-10-18.md) | 原作来源、可编辑演绎、显式形象绑定、角色卡草稿与十份按需方法 |
| [日程](docs/research/PLANNING_EVOLUTION_2026-10-18.md) | 分段上限、部分采用恢复、当前范围与真实外源缺口 |
| [对话场景](docs/research/CONVERSATION_EVOLUTION_2026-10-18.md) | 时间带、小时天气/空气、来源投影与单一语义选择 |
| [后端独立审查](docs/research/BACKEND_REVIEW_2026-10-18.md) | 实际调用链、后台取消/版本、复用、ICS与验证边界 |
| [此前源码研究](docs/research/HARNESS_RESEARCH_2026-10-18.md) | 第一轮恢复、纠错、后台调查和规划的固定仓库版本与取舍 |
| [四组 GPT Image 记录](assets/design/generated/2026-10-18-companion-evolution/manifest.json) | 规划、环境、角色、日历交接；先于本轮界面实现，不代表界面或移动端已完成 |

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
| [HARNESS_EVOLUTION](docs/HARNESS_EVOLUTION.md) | 个人助手需求、记忆/主动/日程/技能/角色细节、创新方向及分阶段实施顺序 |
| [本轮补充要求](docs/source-materials/2026-10-18/continuation-requirements.md) | 当前用户意图、创新范围、后端→图像→前端、旧门禁覆盖及资料保真要求；研究见本页顶部 |
| [完整goal与持续补充](docs/source-materials/2026-10-18/README.md) | 保真原始请求、最新用户持续改进原话及适用范围；阶段交付后继续非平凡优化，不把历史文件变成运行时授权 |
| [2026-10-18 原始来源](docs/source-materials/2026-10-18/README.md) | 用户指定新版实施包及记忆、产品理念、动态界面、前端讨论原文；私人归档和逐文件哈希 |
| [STUDENT_HARNESS](docs/STUDENT_HARNESS.md) | 学生生活联动、迁移回退、已完成验证及128条需求归属／T8边界 |
| [CONVERSATION_SCENES](docs/CONVERSATION_SCENES.md) | Scene/View/语义选择、内嵌地图、天气及动态呈现契约 |
| [CLOUD_REVIEW](docs/CLOUD_REVIEW.md) | 公共地图的本地/历史线上场景、操作和证据范围 |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | 构建、打包、公共产物导出与实际发布的区别 |
| [ASSET_PROVENANCE](docs/ASSET_PROVENANCE.md) | 地图、模型、字体、引擎、UI图片和用户图片的来源／再分发边界 |
| [DESIGN_IMAGE_COVERAGE](docs/DESIGN_IMAGE_COVERAGE.md) | 本轮逐图对应、补图、实际落地与后续工作；保留原始设计文档 |
| [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md) | 第三方软件和数据许可索引；不修改 `licenses/` 上游原文 |
| [地图 SOURCE](assets/map-v2/SOURCE.md) | 当前地图数据说明与有日期的历史研究观察；随源码提交，原始研究输入仍留本地 |
| `assets/design/generated/01a14ed0-bc5b-7403-9599-b0c0f3c19589/` | 用户指定的29张生成图片原文件归档，文件名与字节保留；`manifest.json` 记录尺寸与哈希，不是运行时依赖 |
| `前端视觉创新设计/` | 用户明确要求上传的两份原始 Markdown、45张原图及两份生成记录；保留原相对路径，仅作设计与来源参考，不是生产提示词或另一套实现 |
| `.agents/skills/project-navigation/SKILL.md` | 本机定位与索引方法；引用本导航，不承担运行时路由或授权 |
| `.agents/skills/project-foundations/SKILL.md` | 本机使命与用户利益指引；当前策略与实现状态回到本导航 |
| `.agents/skills/product-design/SKILL.md` | 本机体验设计方法；原则和实际采用／验证证据分开 |
| [.env.example](.env.example) | 可选连接器和独立本机数据目录示例；不包含密钥或已登录账户 |

`package.json`、`.nvmrc`、`.env.example`、`.devcontainer/`、`.github/workflows/` 和构建脚本是命令与工具链的实际依据；文档引用它们，不维护另一套配置。运行时 `prompts/` 属于产品行为输入；文档同步不会把研究包、场景答案或私人对话写入其中。

其他随源码保留的维护工具：`build-brand.mjs` 生成品牌资源；`check-deepseek-balance.mjs` 与 `verify-zju-account.ts` 需另外配置凭据和对应账号授权，不能用于未经授权的测试。`audit-map-coverage.mjs`、`build-official-coverage-reference.mjs` 需要另行授权的本地参考输入；`verify-map-optimality.py` 是依赖本地路线样本与 Gurobi 的旧核查工具。`fetch-map-v2.mjs` 保留旧V2直接导入行为，不是当前地图刷新入口；当前入口仍为 `npm run map:import`。这些文件不参与普通构建或运行，不意味着已附带其本地资料或当前通过记录。

<a id="user"></a>
## 用户相关对象与状态所有者

| 对象 | 权威状态与边界 |
| --- | --- |
| 当前原话、聊天、草稿与附件 | `Store` / `storage/drafts.ts` / `materials/service.ts`；读取、留存、传输分别控制，临时会话结束按自己的生命周期清理 |
| 用户可编辑笔记 | `NotesService`，原文/CAS/历史/回收站；内容不是自动人物断言或行动指令 |
| 文字角色与交互偏好 | `shared/persona.ts`、`shared/interaction.ts` 和 Store settings；版本化明确设定，混合私人旧 guidance 留在私有迁移记录 |
| 个人理解 | evidence/assertion、`memory/service.ts`；来源、条件、有效性、更正与遗忘，自动推断不改用户角色或权限 |
| 目标、承诺、商量中的事和准备资料 | `runtime/work.ts`、`collaboration.ts`、`planning-intents.ts`、`cooperation.ts`、`attention.ts` 和 release 存储；持续规划规格归同一Work，决策经历归原frame，采用证明归原动作／回执／日历；用户报告、假设、邀请、接受、停用与实际展示分开 |
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
| 本机统一查找与定位 | `shared/search.ts` → `main/search.ts` → search IPC/Bridge → `LocalSearchPanel.tsx`；跳转前再次核对原文版本、范围与偏移，查询不送模型 |
| 持续托付的直接控制 | `shared/attention-control.ts` → `NativeControls` / `AttentionService` → `EntrustedPanel.tsx`；有界分页、具体暂停记录、期限、来源与关联准备内容 |
| 工作区、历史与直接操作 | `Navigation.tsx`、`Workspace.tsx`、`App.tsx`；导航只切换已有视图，业务状态通过 Bridge 回到宿主 |
| 陪伴外观与安静空间 | `main.tsx` → `CompanionProvider` → `companion.tsx` / `CompanionSettings.tsx` / `companion.css`；二次元/插画/写实、收藏、多张自选图与改名；v2原子外观状态、少动态与 `RestSpace`；单纯外观更换不自动改角色，显式绑定见人格链 |
| 对话与主模型 | `App.tsx` → `preload.ts` IPC → `main.ts` → `harness.ts` → `runtime/hermes.ts` → `runtime/hermes/sidecar.py` → 锁定 `AIAgent`；模型请求和工具返回宿主 |
| 模型选择与网络 | `model-selection.ts`、`provider.ts`、`luna-provider.ts`、`network.ts`；`scripts/run-luna-test.mjs` 提供显式代测入口，不能由renderer或保存设置切换 |
| 原话控制、权限与用途 | `runtime/turn-controls.ts`、`controls.ts`、`policy.ts`、`read-purpose.ts`、`privacy-control.ts`、`action-delegation.ts`、`attention-boundary.ts`；发送前边界及每次实际操作均重新核查 |
| 上下文、来源与用量 | `runtime/context.ts`、`basis.ts`、`observation-review.ts`、`completion-review.ts`、`model-usage.ts`；按任务检索原始证据，记录实际来源/对象版本/工具与模型回执 |
| 工具发现与提供者 | `main/tools.ts` → `runtime/coordinator.ts` → `capabilities/broker.ts` → `builtin.ts` / `ports.ts` / 领域provider；共享预算和当前范围不交给插件自行扩大 |
| 按需技能方法 | `runtime/skills.ts` → `discover_skills` / `read_skill`；十份有版本/hash的方法，all/any依赖组和availablePaths保留各入口连接/权限与覆盖区别；读方法不执行代码 |
| 后台只读子调查 | `harness.ts` → `runtime/background-delegation.ts` → 同一 Hermes children 协议；授权片段、来源子集、共享预算；host捕获局部更正baseline，实际读取来源出现新限制后在模型/父采用边界停止旧报告 |
| 缓存与真实委派 | `capabilities/broker.ts`、`runtime/cooperation.ts`、`collaboration.ts`、`hermes.ts` 和 sidecar；独立等待者取消、版本快照、父代理消费与旧结果失效 |
| 记忆与连续事项 | `memory/model.ts` / `service.ts` / `retrieval.ts` → `runtime/context.ts` / `work.ts` / `discourse.ts` → `storage/repository.ts`；多查询/扫描、证据展开、更正后续；精确遗忘清理重叠派生/可归因旧版本，保留同源独立片段及后续提取；`HarnessViews.tsx` 提供原话、更正、停用和忘记入口 |
| 本地语义候选与原文回读 | `search_context` → `runtime/coordinator.ts` → `context.ts.prefetchWithSemantic` → `memory/semantic-recall.ts` / `semantic-store.ts` → 原SQLite `h_semantic_chunks`（schema14）；合法来源／Unicode原范围／版本／hash先于向量加载与排名；词法与语义各成一臂，保留头部候选后RRF；预览附原`read_evidence`地址，不成为事实。`h_meta`保存索引扫描断点，只读子调查不补建索引；冻结窗口内排名分页与`nextWindowCursor`尾部续窗均已接源码，续窗不补建／修复索引，边界见第五批状态 |
| 原文到已有工作记录的导航 | `context.ts`的候选／browse预览及`tools.ts`→`recordEvidenceRead(actualReadRanges)`给可选`sourceRelated`地址 → `restore_collaboration(type=source_related)` → `memory/source-related.ts` → `storage/repository.ts.sourceRelatedWorkPage`；typed完整binding核合法且精确交叠，legacy原文ID仅整条合法时返范围未知。仅self／real／`work:self`及evidence read，宿主relevant才跨会话，否则核session或显式parent；30分钟／64份固定rowid keyset、每页最多200候选复核，空partial续页。方法按原`personalMethods.catalog(handle,{id,revision})`窄核，学习沿`workSourceFilter`／`learningProcessReadable`；再走原owner，不计read／ACK或恢复 |
| 固定本地嵌入资源与分发 | `runtime/embedding/lock.json` → `scripts/embedding-runtime.mjs` / `setup-desktop.mjs` → `memory/embedding-contract.ts` / `embedding-runtime.ts` / `embedding-worker.ts`；产品自有worker懒加载固定BGE q8、ORT Node1.30.0与HF tokenizers0.2.0，仅CPU。四个文件24,451,050字节已安装，构建／打包源码使用asar外独立Windows x64资源，应用请求不自动下载；本批未构建、加载或推理，许可见`licenses/`与第三方声明 |
| 无字面依赖的原文浏览 | `search_context(mode=browse)` → `memory/browse.ts` → `storage/repository.ts` → `read_evidence`；许可来源/收到时间先筛，固定快照keyset cursor有界续页；仅给previewOnly，正文采用再查当前scope与版本 |
| 决策经历与理由重评 | `update_collaboration(operation=experience)` → `runtime/collaboration.ts` → 原WorkRecord frame；稳定optionId、逐字条件locator、原文版本/hash、64条有界数组；恢复先核当前来源，不把用户报告变成已核实结果或新接受；实际展开引用进入context receipt |
| 跨会话续接 | `runtime/continuity.ts` → `context.ts`；有限索引指向既有准备与事项，逐项核对来源/版本/范围；`inspect_help`可按query/精确relatedTo/状态/时间发现较早准备，正文采用仍复验，不以未列出当不存在 |
| 记事本 | `shared/notes.ts` → `main/notes/service.ts` → `Store.notes` → notes IPC / scoped `manage_note` → `renderer/NotesPanel.tsx` / `notes.css`；`note_attention` 仅携带版本元数据 |
| 文字人格与形象绑定 | `shared/persona.ts` / `persona-portrayals.ts` / `persona-card-import.ts` → Store版本更新 → `PersonaEditor.tsx` / `SettingsPanel.tsx` / `CompanionSettings.tsx`；显式保留角色或采用演绎，预览可编辑/拒绝/放入草稿，保存才生效；修订冲突保留稿，同内容不误判未保存，纯角色不依赖普通记忆开关 |
| 本地安排与版本／撤销 | `shared/calendar.ts` → `actions/calendar.ts` / `local-calendar.ts` / `runtime.ts` → `Store.writeAgendaProjection` / `deleteAction`；`LifePanels.tsx` / `Workspace.tsx` / App动作卡回读真实状态 |
| 情境、空闲与可行规划 | `capabilities/builtin.ts` → `actions/planning.ts` / `availability.ts`；`situation.read` 有界读取，`planning.preview` 计算冲突/未知并给版本绑定方案；接受后改原对象 |
| 多任务日程与采用/恢复 | `planning.draft` / `planning.recover` → `actions/planning-draft.ts` / `planning-days.ts` / `planning-application.ts` → `prepare_action` / `local-calendar.ts` / `ActionRuntime`；逐日新增工作上限/真实占用留白、声明时区的自然日、unknownEnd、完整占用与剩余预算恢复；短期票据和逐项采用不恢复旧授权 |
| 跨重开的规划意图 | `manage_planning_intent` / `restore_collaboration(type=planning_intent)` → `runtime/planning-intents.ts` / `work.ts` → `h_work`；`planning.replan` → `actions/planning-intent-contract.ts` / `planning-intent-ledger.ts` → 同一planner；prepare事务写attempt及action-revision link，schema11逐attempt验来源，成功仍查原回执和当前agenda；`continuity.ts`提供有限线索，许可scan与精确回读不靠用户报ID |
| 规划派生内容的实际依据 | `shared/harness.ts`的`PlanningMaterialProvenance` → `planning-intents.ts`精确proof复核 → `context.ts`／前后台子调查receipt → `attention.ts`／`cooperation.ts`／`scenes.ts` → repository的分页、历史与遗忘及`presentation.ts`／导出；不只隐藏画面，也不丢失跨回合正文依赖 |
| 本地日历交接 | `shared/calendar-export.ts` → `preload.ts` / `main.ts` 的 `calendar:export` → `actions/calendar-export.ts` → `expandAgenda`；保存对话框后复验隐私/权限并回读当前安排，有限范围ICS，无联网/提醒；`Workspace.tsx` / `CalendarHandoff.tsx` 已接，实际验证范围见当前状态 |
| 机会按时唤醒 | `runtime/opportunity-scheduler.ts` → `AttentionService.nextReviewAt/settleReview` → `Harness.reviewOpportunities`；单timer、公平选择、失败退避与周期对账，退出停止 |
| 公共空气质量 | `capabilities/air-quality.ts` → `builtin.ts` 的 `air_quality.lookup`；复用公共天气参考点与权限，返回模型小时样本，非手机传感或校园实测 |
| 持久变化发现与托付 | Store日历/NotesService事务 outbox → `runtime/coordinator.ts` → `storage/domains.ts` journal/cursor/ack → `attention.ts` / `work.ts`；处理更新、tombstone、时间节点、暂停恢复和范围内新机会 |
| 准备、投递与提醒恢复 | `runtime/attention.ts` / `cooperation.ts` → `actions/reminders.ts` / `runtime.ts` → h_jobs/h_deliveries；`PreparationShelf` / 消息helpRefs记录实际可见版本，明确提醒保留独立调度 |
| 对外草稿与桌面公开展示 | `runtime/release-store.ts` / `release-composer.ts` / `release-projection.ts` / `redaction.ts` / `presentation.ts` → `LifePanels.tsx`；选定产物、内容复核和返回私聊，不自动发送消息 |
| 资料、PDF与图像 | `shared/materials.ts` → `materials/service.ts` / `pdf.ts` / `worker.ts`；选择文件、绑定scope、分页原文/表格候选/实际页面像素；`scripts/material-runtime.mjs` 管原生依赖，`MaterialsPanel.tsx` / `materials.css` 与 App 同一聊天并排；native IPC 复核来源、版本与当前权限，读取不自动发送模型 |
| 校园记录与外部连接 | `zjuAdapter.ts`、`capabilities/campus-query.ts` / `campus-reference.ts` / `builtin.ts`、`storage/domains.ts`；独立受限子进程连接器、细分资源权限、导入/账号来源与覆盖 |
| 公共研究 | `capabilities/research.ts` / `public-network.ts` → 公共搜索/网页/PDF读取；公开地址、域名限制和scope/URL/版本绑定的续读句柄 |
| 天气 | `capabilities/weather.ts` → `builtin.ts` 的 `weather.lookup`；公开参考地点/时区/日期/小时窗口与缺字段覆盖，日级Scene不推导小时结果 |
| 对话动态场景 | `shared/scenes.ts` → `runtime/scenes.ts` / `scene-projections.ts` / coordinator → `Message.scenes/views` → `presentation/AssistantPresentation.tsx` / `LifeSceneViews.tsx`；地图共用既有surface；规划逐日显示、跨日originalRange保留，continuation轻量区分已在日历／这次续排；历史IPC／准备／导出复验意图来源和修订；小时环境过期计时/选中可见/未知图标；`ChatInput.selection`和输入chip回传精确引用，不因切日或观看自动采用 |
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
| 构建、依赖与发布 | `package.json`、`vite*.config.ts`、`scripts/setup-*.mjs` / `build-*.mjs` / `stage-hermes-runtime.mjs` / `embedding-runtime.mjs`、`.github/workflows/`；`export-review.mjs` 导出已构建公共产物，不自动发布；第五批嵌入资源分发只有源码接线，未打包 |
| 检查与样例 | `tests/`、`scripts/smoke.mjs` / `desktop-smoke.mjs` / `pdf-smoke.mjs` / `check-review.mjs`、`examples/campus.example.json`、`main/demo.ts`；明确样例与真实运行，文档同步不新增测试运行器 |

## 地图数据与生成维护

当前 Windows 发布为 [v0.3.0](https://github.com/1760139151lkh-ctrl/zaichang/releases/tag/v0.3.0)，构建源码 `74e099a`，本地输出为 `release/zaichang-0.3.0-20261018-74e099a/`。最新下载入口和复现命令见 [DEPLOYMENT](docs/DEPLOYMENT.md#latest-windows-release)。`package.json` 仍保留原默认输出目录 `release/life-fusion-map-v3-20261005-refinement-r3`，本次打包用命令行覆盖到独立目录；旧快捷方式未改动，不能据此认定它运行最新版。

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

