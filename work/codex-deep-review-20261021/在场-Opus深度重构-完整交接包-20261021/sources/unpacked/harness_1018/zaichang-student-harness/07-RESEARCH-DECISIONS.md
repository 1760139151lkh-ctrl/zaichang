# 07｜研究依据、采用决策与适用边界

核实日期：2026-10-18。本文说明本提示词包采用哪些外部机制、为什么采用，以及证据能够支持到哪里。R01–R20 是稳定来源编号；“本项目决策”是结合在场现状作出的设计选择，不代表来源已经验证了这些选择在大学生生活中的效果。

## 阅读基线

在场仓库审阅 SHA 为 `ba73b049089af718d337076364c6db0f98776d4f`。`runtime/hermes/lock.json` 固定 Hermes **0.21.2**、commit **`d595e636c83aa0b9606d4e914e1140ae9c796897`**、Python **3.13**。公开研究直接读取了这一 commit 的关键源码，并与 2026-10-18 可访问的官方说明对照。**本轮没有执行上游 Hermes 或项目的 Hermes 测试。** 项目接线与测试覆盖设计采用本包的仓库源码审计结论；测试源码存在不能写成当前测试通过。若引用历史文档的 passed 记录，应标为既往报告，不能当作本轮执行结果。

有三项已核实的宿主差异会直接影响实施判断：

- 在场 sidecar 设置 `skip_memory=True`、`skip_background_review=True`，且 `_build_system_prompt` 来自宿主。因此上游原生 `MEMORY.md` 的会话冻结机制只作为对照设计；不能据此断言当前在场因为这一机制读取旧 GPS，或要求直接启用第二套自动记忆。
- 当前代码已接入 `delegate`；仓库 `tests/harness/hermes.test.ts` 中已有使用真实 AIAgent 与合成 hostmodel、覆盖端到端链路行为的测试实现。本轮仅审阅源码，未执行这些测试，因此不能声明当前链路已通过测试，也未验证生产模型效果、并发承载或成本。
- 当前形态是 Windows Electron 桌面，已有本地日程、提醒、记忆以及地图、GPS、天气入口；手机持续感知、后台运行及完整校园数据接入仍需后续完成。桌面调度和模型测试代用都不能自动升级为移动端或生产链承诺。

**采用方向：继续利用既有 Hermes 执行基础和在场宿主，在领域层补上情境、机会、计划修订及可核验结果。** 不以更换框架、训练模型或一次接全插件作为第一步。

## 一、核心判断：打通生活决策闭环

用户要的助理需要持续理解一个人在什么环境中、正承诺什么、关心什么、眼前发生了什么变化，并推进对这个人有用的事情。工具调用、定时任务、记忆和人格分别解决其中一部分。把它们装在一起，并不会自动得到好的主动行为。

适合在场的主线是：外界变化成为有来源的事件；事件修订当前情境及既有承诺；助理判断哪些事情因此值得做；先完成已有授权范围内的准备；结合行动时间窗和人的注意状态决定是否出现；执行后读取结果；将明确反馈用于以后调整。Hermes 继续承担模型调用、工具循环、会话与隔离工作等通用执行职责。在场自己的领域层负责“学生生活里什么值得注意，以及这次行动到底改变了什么”。这是综合研究判断，而不是某一个框架原封不动的架构。

这里有三处需要明确分开：

- **主动能力与热情表达。** 主动能力体现为能发现并推进有价值的事情；热情表达体现为亲近、自然、记得上下文。消息更多不能证明前者。一个热情的伙伴也会在用户专注时安静准备，在适当时候带来完整结果。
- **知道事实与猜测需要。** 下节课的教室、天气预报的发布时间和用户明确安排可以作为事实依据；“你现在应该焦虑”“你一定想学习”只能是待核实推断。即使各项事实都准确，对用户目标的判断仍可能错误。
- **能执行与值得执行。** 已有日历、天气、地图工具，只证明具备一部分动作手段。需要进一步检查必要信息是否齐全、是否还来得及、是否会破坏已约定事项，以及结果是否真的送达或写入。

Horvitz 的混合主动交互研究同时考虑自动行动、询问与暂不介入；JITAI 文献把需要支持、可接收支持、支持负担分开；PTIME 把日程约束与个人取舍接在同一流程；现代 Proactive Agent / ProActor 说明机会识别和时机选择可以被专门评测，但尚不能保证在真实大学生活中可靠。[R11–R17]

## 二、对现有 Hermes 的准确借鉴与版本差异

### 2.1 不要先换框架；先列出真实暴露的能力

在场已有 Windows Electron 桌面、地图、GPS、天气、本地 calendar/reminders/memory 及 stdio 链，移动链尚未完成。实施需沿用五列能力核对：上游是否存在、锁定版本是否存在、在场是否包装、运行配置是否启用、实际路径验证到哪一层。上游机制、宿主接线、测试源码、既往测试报告、本轮执行结果和真实生产运行分别记录。

已核实锁定版本具有的机制：

| 能力 | d595e636… 的证据 | 对在场的直接含义 |
| --- | --- | --- |
| 持久短记忆 | tools/memory_tool.py 与 tools/memory_tool_store.py：MEMORY.md / USER.md，加载时冻结 system-prompt snapshot，写盘后不改变当前 prompt | 原生机制在在场 sidecar 已关闭；当前情境由宿主提供。借此区分长期摘要与动态情境，不能把上游行为当当前 GPS 过期的根因 |
| 记忆修改 | MEMORY_SCHEMA 公开 add / replace / remove，支持原子批量 operations；replace 找到包含 old_text 的整条 entry 后整体替换 | 仅在真正调用上游原生记忆时适用；宿主自己的 memory 工具按自身契约处理。不能用当前文档的 patch 签名调用锁定原生工具 |
| 子代理 | tools/delegate_tool.py：fresh conversation、goal + context、独立 task_id、父工具集减 child-blocked、批量 tasks、output_schema 及一次有限纠错、运行中的 steer / stop | 在场代码已接入 delegate，已有真实 AIAgent＋合成 hostmodel 的端到端测试源码；本轮未执行。沿既有桥接扩展，执行测试及生产模型质量、取消竞态与预算验证列入实施工作 |
| 子代理预算 | tools/delegate_tool_config.py：默认并发 10、默认深度 1，配置可变；默认没有固定 wall-clock 上限，另有状态检测 | 这些是通用框架默认值，不能直接当学生桌面助理的产品预算 |
| 定时工具 | tools/cronjob_tools.py 实际注册 cronjob_manage，Python 函数保留 cronjob；动作 create/list/update/pause/resume/remove/run | 接入必须使用真实 registry；文档常用简称 cronjob，名称不能想当然 |
| cron 上下文 | 同一源码的 tool contract 指明 fresh session、当前聊天上下文不自动带入，最终回答用于 delivery | 持久任务应引用稳定任务记录，并在运行时重新读情境；不能只抄一段含“明天/这里/那门课”的临时 prompt |
| 人格 | 锁定版本的官方人格文档已有 HERMES_HOME/SOUL.md 主身份及会话级 personality overlay | 在场系统提示由宿主构建，应沿宿主人格/提示入口实现显式配置；SOUL.md 是参考机制，不能假定该文件自动生效 |
| 缓存与压缩 | 锁定版本官方文档已有 ContextEngine 插件、压缩与 provider prompt-cache 路径 | 它们负责上下文成本，不替代持久事实和执行状态 |

当前 upstream 主分支核实 SHA 为 d24fe22029c9d42dd7cd3702df4c02b1e92b9506，提交时间 2026-10-18T07:10:21Z。它的 memory 文档已经改为 add / patch / remove，并拒绝 replace；当前 cron 代码还经过后续拆分，当前的 cron/scheduler_tick.py 在锁定版本不存在。**不能把 main 文档中的新接口直接写进在场实施代码，也不能把一次升级 Hermes 混成学生领域重构的必需步骤。**[R01–R06]

### 2.2 学生情境、记忆和人格各自保存什么

建议在现有存储上区分以下逻辑对象；这里描述的是数据责任，不要求每一项单独建数据库。

1. 用户明确设置：希望怎样被称呼、角色风格、提醒强度、学习偏好和当前边界。修改来自用户，记录生效范围。用户切换人格不应改写课表、健康事实或执行授权。
2. 事实与承诺：课程的具体 occurrence、作业截止、已约好的聚餐、已提交的预约、体育任务进度。需要来源、有效时间、版本和后续修订关系。
3. 当前情境：当前时区、定位及精度/时间、即将发生的承诺、天气预报有效窗、联网/设备状态、用户当前自述。这些信息有短生命周期。
4. 情节记忆：发生过什么、谁说了什么、哪次计划为何改变、用户怎样反馈。保留可恢复原证据。
5. 助理归纳：例如“近几次用户更愿意在教学楼留出长学习块”。它是带证据和适用条件的推断，不能自动变成永恒人格事实。
6. 程序经验：某个学校接口怎样查询、某种失败怎样恢复。可在工具适配层或技能中复用，与个人隐私画像分开。

长期摘要用于低成本提供稳定背景；关联检索用于找细节；本次情境包让模型看到最新有效状态。LongMemEval 的实验证据提醒我们：用抽取事实或摘要彻底替换原始内容可能损失问答信息。Generative Agents 中反思保留指向原始记忆的依据，但仍发生知识添饰。因此在场应让“归纳”能回查、能更正、能失效，不把另一段模型文字当新观察。[R02、R05、R16、R18]

### 2.3 上下文缓存的实现目标

建议由现有宿主上下文构建器组织稳定前缀：身份、工具契约、少量稳定规则和版本化配置；短时情境、任务快照及最新变化放在本次输入靠后位置。每次重排整个世界状态、把当前时间写入早期 system prompt，都可能损害前缀重用。是否命中仍须观察真实 provider 的回执，不能因采用上游推荐结构就声称命中。

缓存、压缩、记忆的生命周期不同。provider prompt cache 节省重复输入成本；压缩缩短当前会话；长期记忆跨会话保留信息。它们不能互相冒充。实际缓存效果应读 provider 返回的 usage、命中 token 和延迟，不以 prompt 长得相似为证。不同模型、账号、provider 路线的缓存能力不同；Hermes 关于 Anthropic 缓存的实现不构成 DeepSeek 或 ChatGPT 登录链具有相同行为的证明。[R05]

## 三、建议落实的主动机制

### 3.1 让有效变化可靠地进入决策

一个上游信号应带事件 ID、来源、接收时间、事实发生/生效时间、适用时区、有效期限和质量。天气更新、课程 occurrence 变更、任务完成、用户新消息、地点跨区、预约窗口开放、设备重新上线都可推动决策。GPS 每一次轻微漂移不是一次新的生活决策。

事件入口先做去重、版本比较和便宜的范围/时效筛选。已知依赖优先找到该复查的事项，例如天气变化关联户外计划、教室修改关联对应课程出行、体育记录完成撤销旧提醒。对尚无依赖的新来源和有效新变化，保留有预算的语义发现入口；固定词表与既有 watch 不能穷尽人的新需要。保持低频对账以恢复漏掉的变化和失去订阅的来源，避免无变化时反复调用模型。

相同提醒/任务只应有一位持久执行 owner。在场已有 reminders scheduler 时，应先弄清其责任，再决定是否接 Hermes cron；不能同时让两套调度独立创造和发送相同提醒。OpenClaw 当前把周期心跳也纳入统一 automation owner，说明“定时检查”和“主动提示”能共享持久调度，但仍有不同的上下文与投递契约。[R04、R07]

### 3.2 一个可用的机会记录

模型可以从当前事实、目标和开放事项提出新的机会。每个候选至少要交代：服务哪个目标；触发的新证据是什么；为什么现在值得处理；现在能先完成什么；还缺什么信息；最早/最晚行动时间；已准备/可执行/失效状态；如果用户不响应会怎样；如何核实完成。

这比“优先级=0.84”更可审查。若采用排序分数，先把它标明为可调整启发式；除非有校准数据，不把模型生成的小数当真实成功概率、打扰概率或精确效用。保留硬约束过滤、可解释的取舍和用户直接覆盖。复杂权重应由实际冲突迫出来，不作为第一版能力的前置条件。

机会的输出可以是：

- 安静准备：查到教室、算好路线、准备一段新日程、整理待办素材；
- 在已有对话中自然提起：用户正聊晚上的安排，此时接上雨天与打卡机会；
- 等到可用时间窗再提醒：现在仍在上课，下课后仍来得及处理；
- 主动打断：已确认且临近失去处理机会的重要变化；
- 暂缓或放弃：证据过期、目标撤销、用户已处理、消息已送达、推断缺关键前提；
- 在必要时问一个具体问题：例如聚餐开始时间决定是否还能保留完整学习块。

这些是执行结果类型，产品不必把六种内部状态都做成按钮。JITAI 的关键启发是变化频率应该由“会不会改变决策”决定，并且“此刻不给支持”也是设计好的结果；不能把其健康行为研究中的具体间隔和阈值机械照搬到大学生。[R11–R13]

### 3.3 规划从可实现的下一段时间开始

不要等待全校园、全健康、全社交插件齐备才做规划。已接入的本地日程、提醒、地图和天气足以形成第一个真实闭环。先管理下一段可用时间，并逐步扩展到一天、一周和跨周目标。

规划需要区分不可移动承诺、用户可调整计划、待确认邀请和愿望。每项工作至少有时间窗、预计耗时范围、依赖、地点/资源、进展、可否分段，以及用户真正关心的取舍。课程不是固定 weekday 字符串：应由具体日期 occurrence 承载调课、停课、节假日和例外。

重规划首先找受变化影响的部分，保留其它已确认事项。例如朋友约晚饭之后，应比较提前学习、缩短这次学习、换学习地点等真正不同的安排，并说明牺牲了什么。不能每来一个信号就全盘重写今天，也不能默认学业指标永远压过社交、休息与兴趣。

PTIME 的实用启发是：一个冲突常有多个合理放宽方向，需要结合个人偏好展示有意义的选项。它主要研究会议排程，不直接提供在场所需的连续学习、运动期限、移动路线与天气风险模型。“局部修订、稳定已有承诺”是本项目进一步的设计选择，不应伪称论文已经验证了完整学生日程系统。[R14]

### 3.4 用一个连贯案例验收

例：用户明确希望今天保留一块连续学习时间，并尚有体育任务。下午课程临时换楼；朋友邀请晚上吃饭；天气来源随后将傍晚预测改为下雨。

系统应依次做到：保存课程变更并撤销旧目的地；按新教室与当前定位的有效性准备路径；把朋友邀请识别为未确认安排；结合可用学习块和运动窗口提出几种可行调整；用户选定以后只修改有关计划；雨势变化若不再影响新计划就安静更新；若朋友又改时间则修订同一安排，而非新建一份无关联日程；完成运动后取消尚未发送的相关提醒。

此案例需有缺失版本：定位过期则无法声称“按你现在位置”；体育平台未接入则进度只能来自已提供记录；无可靠分钟级天气则不能承诺具体几点一定下雨；朋友消息无读取授权时只能使用用户转述；应用离线期间不能声称仍持续观测。每种降级仍应完成眼前已可做的准备。

### 3.5 子代理用于真正独立的推理工作

简单查询并发可直接由工具层批处理，不必每个 API 都开一位会思考的代理。需要各自判断、会产生大量材料的独立任务才适合子代理，例如查询一组选课约束、比较几种长期学习安排、研究一段复杂出行。

每位子代理收到明确任务、当前 world-state 版本、相关事实、允许工具、预算、取消条件和结果契约。父代理统一接回事实、建议、来源、失败和完成状态，再做面向用户的综合决策。子代理不应自行修改共享人格或相互覆盖日程。用户改变目标、原始事件被撤销或 deadline 过去时，父代理应取消或标记已过期结果；迟到结果不能偷偷写回旧计划。

在场代码已接入锁定 Hermes 的 delegate；`tests/harness/hermes.test.ts` 已有真实 AIAgent 与合成 hostmodel 的端到端测试实现，本轮未执行。下一步在既有接口上补足与具体任务有关的快照、取消和结果归并，并实际运行有关测试。上游默认并发、深度与成本不是产品需求。预算由任务价值、延迟目标和实际设备/模型能力决定；生产模型仍需单独实测。[R03]

### 3.6 桌面、手机与登录链分别验收

当前可以先在桌面完成真实闭环。未来 Android 的周期 WorkManager 最小间隔为 15 分钟，实际执行时间受系统和约束影响；因此桌面每分钟扫描不能原样搬到手机，也不能把周期任务登记等同于准点送达。移动适配需独立验证唤醒、到期通知、恢复和电量表现，再据实声明后台能力。[R19]

截至核实日期，OpenAI 已提供通过 Codex app-server 使用获准 ChatGPT plan OAuth token 的官方路径。模型目录不证明账号有权调用；应使用在场自己的授权流程与令牌生命周期，完成选定模型的实际 inference turn 后再判断该次调用成功。项目中的 Luna 仍是测试代用，不能据此标记生产 ChatGPT 登录链完成。[R20]

## 四、人格与记忆如何兼顾热情、自主设定和真实认识

建议人格拆成用户可选的角色设定、表达习惯、互动主动程度三组，而把事实和工具权限留在各自的层。角色可以是温柔的伙伴、直率的同学、俏皮的虚构角色；用户可以自写，也可用默认模板。默认模板要有实际对话样例和可观察风格区别，不只写“热情、贴心、活泼”。

角色设定应在平常闲聊、紧迫提醒、用户低落、用户拒绝建议、信息不足和行动失败时仍成立。例如温暖可以表现为“我先把能查的查清了，你下课再看也来得及”，而不必句句昵称、表情或鼓励。行程事实应保持一致，不因人格不同而变更路线、截止日期或权限。

用户编辑的人格应与助理归纳的用户偏好分别保存，并让前者具有清晰的编辑权。助理可以总结“最近几次长学习块被临时约饭切碎后，你更希望提前商量”；需要连着依据、适用期限和更正入口，而不是把它改写成“用户不喜欢社交”。一次沉默也不能永久归纳为讨厌提醒，更不能自动停掉用户明确要求持续运行的任务。

第一次使用不必填写庞大问卷。给合理默认值，在真实决策碰到会实质改变结果的差异时再收集一点反馈。PTIME 对偏好表达负担的讨论支持逐步获得偏好，但不能据此声称系统已能可靠学习人格。人格是否自然，仍需要真实对话和用户反馈来检验。[R06、R14、R18]

## 五、评测应证明什么

至少同时评估四种结果：是否发现值得做的事、是否在合适时机出现、是否真实推进或完成、是否让用户觉得相处舒服。不能只统计点击、回应率、提醒次数或“Agent 说自己做完”的比例。

| 验收问题 | 建议观察 | 必须保留的反例 |
| --- | --- | --- |
| 能发现吗 | 从截至当前的事件流识别机会，包含用户未直接请求的机会 | 外表相似但无需求的情境；没有新证据重复提起 |
| 信息可信吗 | 读当前版本、正确区分事实/推断/未知、回查原始依据 | 调课、时区切换、过期天气、用户更正、相似姓名 |
| 时机对吗 | 在有效机会窗内准备和投递，衡量过早/过晚/错失 | 正在考试、专注中、机会已消失、消息迟到 |
| 行动有用吗 | 看真实回执与可见状态变化 | 工具调用失败、写入未持久化、仅生成日程未提交 |
| 会修订吗 | 新信息只改变受影响的计划，撤销旧提醒 | 用户改变主意、朋友改期、课程取消、跨设备冲突 |
| 能恢复吗 | 离线/重启/重试不会重复外部动作和消息 | 同事件重复送达、任务执行中重启、结果晚到 |
| 记忆正确吗 | 提取、跨会话综合、时序、更正、合理弃答 | “没有提过”的假前提、过期偏好、总结添饰 |
| 相处舒服吗 | 清楚而自然、在合适时候主动、有连续性 | 全是工程状态汇报；热情模式变成密集打扰 |

场景集应提供可观察输入、期望的行动类别、可接受时间窗、应保持安静/应询问的条件和真实结果检查；不要写唯一标准台词。必须有“删掉一个信息以后，哪一步就不能成立”的配对样本，并防止把未来事件放进当前模型输入。

ProactiveBench 的人类标注与模拟环境适合帮助构造可重复事件流，但论文承认误报和用户中心验证不足。ProActor 的 oracle 标注可看到未来对话，且其验证为英语客服和贷款情境；因此它的回溯标注方法不能直接当在线助理可使用的信息，也不能直接证明适合中文校园生活。LongMemEval 评的是互动记忆问答，不等于真实外部行动成功。最终应有真实接入的端到端小闭环，再逐步加入真实使用观察。[R15–R17]

## 六、一手来源登记

以下将同一机制的源码与官方说明归为一个来源条目，避免把同源网页数量当作独立证据。共 20 个条目，覆盖开源代码、官方实现说明、产品一手发布与学术论文。所有条目均于 2026-10-18 核实；未标源码 commit 的动态网页只代表当天可访问版本。每条分别给出阅读范围、支持主张、局限及采用决策。未将第三方综述、搜索摘要或营销转述用作技术实现依据。

### R01 — Hermes Agent：锁定源码与版本

- 标题：NousResearch/hermes-agent；锁定提交 “fix(model): a selected model id is never rewritten to a catalog neighbour”。
- URL：[https://github.com/NousResearch/hermes-agent/commit/d595e636c83aa0b9606d4e914e1140ae9c796897](https://github.com/NousResearch/hermes-agent/commit/d595e636c83aa0b9606d4e914e1140ae9c796897)
- 版本：2026-09-12T21:05:36Z；与在场 lock 中 commit 一致。对照 main 为 d24fe22029c9d42dd7cd3702df4c02b1e92b9506。
- 实际阅读：commit 元数据；下列 R02–R06 文件关键实现、schema 和文档；当前主分支目录与对应说明。
- 支持主张：Hermes 已含通用代理运行基础；“上游没有”必须以锁定版本核对。
- 局限：本项为公开源码核验，没有执行上游或项目 Hermes 测试；在场包装接线与预期测试覆盖来自仓库源码和测试源码审阅，不能据此声称测试通过或生产运行已验证。
- 本项目决策：版本固定、接口盘点；领域重构与升级框架分开评估。

### R02 — Hermes Memory Tool / MemoryStore；Persistent Memory

- 版本：Hermes 0.21.2，commit `d595e636c83aa0b9606d4e914e1140ae9c796897`；“当前说明”为 2026-10-18 网页快照，未假定与锁定源码等同。
- URL：[https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/memory_tool.py](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/memory_tool.py)
- URL：[https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/memory_tool_store.py](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/memory_tool_store.py)
- 当前说明：[https://hermes-agent.nousresearch.com/docs/user-guide/features/memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)
- 实际阅读：锁定源码 MEMORY_SCHEMA、load_from_disk、_mutate、replace、format_for_system_prompt；当前文档记忆注入、session_search、容量与修改动作。
- 支持主张：短摘要冻结；持久写入不等于本轮可见；文件写入有锁和原子更新；旧 replace 为整条替换，当前 patch 为局部替换。
- 局限：短文本存储不是学生事实数据库；当前文档新增特性不属于锁定版本。在场以 skip_memory=True 关闭此原生机制、skip_background_review=True 关闭上游后台回顾，因此冻结快照不能用来诊断现有 GPS 数据是否过期。
- 本项目决策：保留宿主已有记忆入口，强化时效与来源；世界状态由宿主投影进入本次上下文。原生 MemoryStore 仅作对照，不开启第二套自动归纳或迁移记忆主权。

### R03 — Hermes Subagent Delegation

- 版本：Hermes 0.21.2，commit `d595e636c83aa0b9606d4e914e1140ae9c796897`；“当前说明”为 2026-10-18 网页快照，未假定与锁定源码等同。
- URL：[https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/delegate_tool.py](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/delegate_tool.py)
- URL：[https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/delegate_tool_config.py](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/delegate_tool_config.py)
- 当前说明：[https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation](https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation)
- 实际阅读：锁定 schema、子上下文构造调用、结果/中断状态说明、运行控制、默认并发/深度/timeout。
- 支持主张：fresh 子上下文需要完整交接；可用结构化结果与运行中控制；默认资源参数不是产品最优值。
- 局限：子代理权限和完成回传还取决于宿主及配置。项目审计读取了 delegate 接入代码及 `tests/harness/hermes.test.ts` 中真实 AIAgent＋合成 hostmodel 的端到端测试实现；本轮未执行这些测试，也未实测生产模型效果。
- 本项目决策：沿现有 delegate 桥接，主代理归并决策；子代理有快照版本、预算与取消条件；简单查询直接并发。

### R04 — Hermes Scheduled Tasks (Cron)

- 版本：Hermes 0.21.2，commit `d595e636c83aa0b9606d4e914e1140ae9c796897`；“当前说明”为 2026-10-18 网页快照，未假定与锁定源码等同。
- 锁定源码：[https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/cronjob_tools.py](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/cronjob_tools.py)
- 当前说明：[https://hermes-agent.nousresearch.com/docs/user-guide/features/cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron)
- 实际阅读：工具注册 cronjob_manage、create/update/run 参数、fresh-session delivery 契约；当前说明中的 missed-fire 与 catch-up 段。
- 支持主张：调度创建、执行、投递各有状态；任务上下文不能依赖临时会话；恢复策略必须明确。
- 局限：当前文档的 catch-up 细节未回溯逐一验证旧版，不能作为在场既有保证。
- 本项目决策：一项工作一位调度 owner，持久事件/回执用于恢复；实施时验证旧版真实语义。

### R05 — Hermes Context Compression and Caching

- 版本：Hermes 0.21.2，commit `d595e636c83aa0b9606d4e914e1140ae9c796897`；“当前说明”为 2026-10-18 网页快照，未假定与锁定源码等同。
- 锁定说明：[https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/website/docs/developer-guide/context-compression-and-caching.md](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/website/docs/developer-guide/context-compression-and-caching.md)
- 当前说明：[https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching](https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching)
- 实际阅读：ContextEngine、双压缩、Anthropic cache marker、稳定前缀、模型/账户变化。
- 支持主张：缓存、压缩和持久记忆是三种机制；前缀稳定性与模型路线影响成本。
- 局限：官方性能比例未在本项目重测；provider-specific 机制不能推广到所有 API。
- 本项目决策：稳定配置和动态情境分层；用实际 usage 验证效果，避免按文档百分比承诺节省。

### R06 — Hermes Personality & SOUL.md

- 版本：Hermes 0.21.2，commit `d595e636c83aa0b9606d4e914e1140ae9c796897`；“当前说明”为 2026-10-18 网页快照，未假定与锁定源码等同。
- 锁定说明：[https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/website/docs/user-guide/features/personality.md](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/website/docs/user-guide/features/personality.md)
- 当前说明：[https://hermes-agent.nousresearch.com/docs/user-guide/features/personality](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality)
- 实际阅读：主身份位置、HERMES_HOME 范围、用户文件不覆写、持久身份与 session overlay 的区分。
- 支持主张：已有可自定义身份入口，可与短期互动方式分开。
- 局限：可配置不等于人格质量，也不自动提供中文角色编辑体验。在场的 _build_system_prompt 来自宿主；SOUL.md 的上游装载规则不能当作项目现状。
- 本项目决策：通过现有宿主提示构建器消费用户的人格配置；与自动归纳、事实、权限分开；不并行启用另一套主身份源。

### R07 — OpenClaw Heartbeat / Automation

- 版本：2026-10-18 可访问的官方 README / 文档；本条未锁定可复现运行的发行版或源码 commit。
- URL：[https://docs.openclaw.ai/gateway/heartbeat](https://docs.openclaw.ai/gateway/heartbeat)
- URL：[https://docs.openclaw.ai/automation](https://docs.openclaw.ai/automation)
- 实际阅读：system-owned monitor、统一 automation owner、activeHours、owner 投递、NO_REPLY/结构化静默结果、channel 不可用时的行为。
- 支持主张：内部定时处理可以不产生用户消息；独立任务与背景心跳有不同契约；一次 occurrence 有明确 owner。
- 局限：只核验公开实现说明，未运行；其默认策略是本产品选择，不是通用规律。
- 本项目决策：借鉴可持久恢复且可静默的后台工作；不迁移整套 OpenClaw，也不照搬固定 30 分钟周期。

### R08 — Khoj: personal AI / Automations

- 版本：2026-10-18 可访问的官方 README / 文档；本条未锁定可复现运行的发行版或源码 commit。
- URL：[https://github.com/khoj-ai/khoj](https://github.com/khoj-ai/khoj)
- URL：[https://docs.khoj.dev/features/automations/](https://docs.khoj.dev/features/automations/)
- 实际阅读：官方 README 的 personal knowledge、可设 persona/model/tools 的 agents、文件检索和自动化；automation 文档的时区及邮件投递依赖。
- 支持主张：个人资料、角色和定时研究可在一个面向个人的产品中共存；投递依赖实际服务配置。
- 局限：这些资料不证明已有可靠的校园全情境规划；定时执行查询不等于自主发现需要。
- 本项目决策：记事本/资料入口可成为上下文资源，自动化结果要自然回到人使用的地方。

### R09 — Introducing Muse: The World’s First Personal AI Agent Built for Everyone

- URL：[https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)
- 版本：正文日期 September 8, 2026 / September 30, 2026。
- 实际阅读：发布稿正文 How It Works 与 Built to be Private, Safe, and Secure。
- 支持主张：Meta 此产品确实将长期目标、持续执行、记住个人细节、主动建议、用户可变授权和行动记录作为产品承诺。
- 局限：这是官方产品说明；未披露完整机会评分、人格记忆算法和失败率，不能反推其内部设计。
- 本项目决策：借鉴用户只需自然交谈、助理推进目标并带回结果的体验目标；不把独立 VM 当所有学生助理的必需架构。

### R10 — Introducing Grok Bot

- URL：[https://x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)
- 版本：Aug 11, 2026。
- 实际阅读：官方发布稿的独立计算机、自然消息、多 Bots 协作、示范流程成 routine、记住偏好和主动跟进。
- 支持主张：用户所说 Grok Bot 是可明确定位的 always-on agent 产品；其形象是持续合作的工作伙伴。
- 局限：产品说明与内部员工例子不是可复现的算法论文；“更了解你”没有揭示学习机制。
- 本项目决策：借鉴连续工作和少交接负担，不照搬企业多机器人组织架构或默认赋予广泛外部动作权。

### R11 — Principles of Mixed-Initiative User Interfaces

- 作者/年份：Eric Horvitz，CHI 1999。
- 原文：[https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz-1.pdf](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz-1.pdf)
- 官方页：[https://www.microsoft.com/en-us/research/publication/principles-mixed-initiative-user-interfaces/](https://www.microsoft.com/en-us/research/publication/principles-mixed-initiative-user-interfaces/)
- 实际阅读：12 项原则、LookOut 排程案例、目标不确定性、行动/不行动/对话的期望效用与阈值讨论。
- 支持主张：主动动作要考虑目标不确定性、注意成本、可纠正性与直接控制；询问也有成本。
- 局限：经典小系统研究，不是现代 LLM 可靠性的证明；效用模型需要估计或设计假设。
- 本项目决策：允许自动准备、必要询问、合适时机行动，用户能快速纠正；不强迫所有情况先弹确认。

### R12 — Learning and Reasoning about Interruption

- 作者/年份：Eric Horvitz、Johnson Apacible，ICMI 2003。
- 原文：[https://www.erichorvitz.com/iw.pdf](https://www.erichorvitz.com/iw.pdf)
- 作者页：[https://www.erichorvitz.com/learninterrupt.htm](https://www.erichorvitz.com/learninterrupt.htm)
- 实际阅读：多事件源、预期打扰成本、不同通知方式、Interruption Workbench 的采集/用户标注/建模步骤。
- 支持主张：同一用户在不同时刻、不同通知渠道下的打扰成本不同；可打断性不是仅靠课表推出的二值标签。
- 局限：办公环境及较小实验；当前手机信号与本项目数据并未验证同样效果。
- 本项目决策：优先使用明确专注/课程/用户反馈；信号不足时保留不确定，不虚构知道其注意状态。

### R13 — Just-in-Time Adaptive Interventions (JITAIs) in Mobile Health: Key Components and Design Principles for Ongoing Health Behavior Support

- 作者：Inbal Nahum-Shani 等；DOI 10.1007/s12160-016-9830-8。读取作者团队大学站点的 2016 文章版本，期刊卷期为 2018 年 52(6)。
- 原文：[https://dept.stat.lsa.umich.edu/~tewaria/research/nahum-shani16just-in-time.pdf](https://dept.stat.lsa.umich.edu/~tewaria/research/nahum-shani16just-in-time.pdf)
- 期刊记录：[https://academic.oup.com/abm/article/52/6/446/4733473](https://academic.oup.com/abm/article/52/6/446/4733473)
- 开放记录：[https://pmc.ncbi.nlm.nih.gov/articles/PMC5364076/](https://pmc.ncbi.nlm.nih.gov/articles/PMC5364076/)
- 实际阅读：六要素、需要与可接收支持、intervention fatigue、decision point 频率、近端/远端目标。
- 支持主张：应把人及环境的变化与支持类型、时机、强度结合；不给提示也是设计结果；频率依赖有效变化和负担。
- 局限：健康行为领域的设计方法，不证明学习/GPA效果，也不授权依据零碎健康数据做诊断。
- 本项目决策：借用决策结构和负担意识；按学生真实目标重新定义结果和评估。

### R14 — PTIME: Personalized Assistance for Calendaring

- 作者/年份：Pauline M. Berry、Melinda Gervasio、Bart Peintner、Neil Yorke-Smith，ACM TIST 2011，2(4), Article 40。
- 原文：[https://starlab.ewi.tudelft.nl/papers/n92.pdf](https://starlab.ewi.tudelft.nl/papers/n92.pdf)
- 官方机构页：[https://www.sri.com/publication/ptime-personalized-assistance-for-calendaring/](https://www.sri.com/publication/ptime-personalized-assistance-for-calendaring/)
- 实际阅读：引言、系统组成、偏好模型设计、用户调查、约束推理与通过选择结果学习偏好。
- 支持主张：日程具有个人取舍；超约束问题需要不同放宽方向；低负担初始偏好结合逐次反馈。
- 局限：主要是会议排程；研究人群和能力不覆盖完整大学生活，也不证明用户喜欢被全自动排满。
- 本项目决策：固定承诺与可调整计划分开，冲突时提供少量有意义方案，逐步积累上下文偏好。

### R15 — Proactive Agent: Shifting LLM Agents from Reactive Responses to Active Assistance

- 作者：Yaxi Lu 等；ICLR 2025。
- 原文：[https://proceedings.iclr.cc/paper_files/paper/2025/file/75c37811e830bf029584b1c6fac17726-Paper-Conference.pdf](https://proceedings.iclr.cc/paper_files/paper/2025/file/75c37811e830bf029584b1c6fac17726-Paper-Conference.pdf)
- 官方会议页：[https://proceedings.iclr.cc/paper_files/paper/2025/hash/75c37811e830bf029584b1c6fac17726-Abstract-Conference.html](https://proceedings.iclr.cc/paper_files/paper/2025/hash/75c37811e830bf029584b1c6fac17726-Abstract-Conference.html)
- 实际阅读：事件收集、Environment Gym、User Agent、事件更新→预测任务→反馈→执行，以及附录局限。
- 支持主张：主动识别可以用事件流/人类接受拒绝标注评测；需要显式无动作结果。
- 局限：大量模拟资料、环境有限、误报仍高，作者明确提出需更多用户中心验证。
- 本项目决策：场景模拟用于回归与发现缺口，真实体验验收单独保留；本轮不以训练大模型为先决条件。

### R16 — LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory

- 作者：Di Wu 等；ICLR 2025。
- 原文：[https://proceedings.iclr.cc/paper_files/paper/2025/file/d813d324dbf0598bbdc9c8e79740ed01-Paper-Conference.pdf](https://proceedings.iclr.cc/paper_files/paper/2025/file/d813d324dbf0598bbdc9c8e79740ed01-Paper-Conference.pdf)
- 代码：[https://github.com/xiaowu0162/LongMemEval](https://github.com/xiaowu0162/LongMemEval)
- 实际阅读：五项能力定义、索引/检索/阅读三阶段、5.2 value decomposition 与 5.3 key 设计结果。
- 支持主张：记忆应覆盖更新、时序、跨会话综合与弃答；仅用摘要或提取事实替换原内容可能丢失信息。
- 局限：互动记忆问答 benchmark，不是动作成功、长期信任或学生收益评测。
- 本项目决策：保留原记录与来源；用摘要辅助检索；新增更正和未知测试，而非只测能否搜到关键词。

### R17 — ProActor: Timing-Aware Reinforcement Learning for Proactive Task Scheduling Agents

- 作者：Lei Ding、Bin He、Chenguang Wang、Yang Liu；ACL 2026，18257–18303。
- 原文：[https://aclanthology.org/2026.acl-long.832.pdf](https://aclanthology.org/2026.acl-long.832.pdf)
- 官方页：[https://aclanthology.org/2026.acl-long.832/](https://aclanthology.org/2026.acl-long.832/)
- 实际阅读：reference action/window、动作一致性/时机/错误触发/就绪指标、oracle 使用未来对话、Limitations。
- 支持主张：动作对、参数对和时机对需要分开评估；一个动作可以有多段合理窗口，标注只是参考。
- 局限：英语 ABCD+ 与 Home Loan；训练对话不超过 50 turns；oracle 可见未来，模型泛化仍受限。
- 本项目决策：时间窗＋动作准备状态进入场景契约；在线输入只含当时事实；先借评估思想而非引入其 RL 训练设施。

### R18 — Generative Agents: Interactive Simulacra of Human Behavior

- 作者：Joon Sung Park 等；arXiv 2304.03442v2，2023-08-06。
- 原文：[https://arxiv.org/html/2304.03442v2](https://arxiv.org/html/2304.03442v2)
- 实际阅读：记忆流、4.2 reflection、反思证据指针、规划、6.5 记忆与添饰、两游戏日的端到端模拟范围。
- 支持主张：观察、反思和规划可分离；归纳能保留所据的原始记忆引用。
- 局限：25 个模拟人物的可信行为，不证明准确认识真实用户；论文展示了知识添饰案例。
- 本项目决策：借用带依据的归纳和连续性；真实画像保持可纠正，避免把模拟人物研究当完整“人模型”。

### R19 — Define work requests（Android WorkManager）

- URL：[https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)
- 版本：官方页最后更新 2026-10-16 UTC；2026-10-18 核实。
- 实际阅读：periodic work、flex intervals、constraints、delayed work、retry/backoff，以及 expedited work 的负载/配额条件。
- 支持主张：周期最短 15 分钟，执行时间不精确；约束可导致延后或跳过，expedited 也有配额和负载限制。
- 局限：本页不涵盖全部 Android 通知、精确定时和厂商行为，也不是 iOS 后台保证。
- 本项目决策：WorkManager 可承担允许延迟的持久同步/补偿；桌面每分钟扫描不可直接移植。移动端精确到期需求另选适用平台机制并真机验证。

### R20 — Codex app-server（Sign in with ChatGPT）

- URL：[https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- 版本：2026-10-18 可访问的官方文档；页面未标固定 app-server 发行版。
- 实际阅读：OAuth token 注入、Responses provider、initialize/initialized、thread/turn 流程、model/list 限制、turn.status 及令牌续期。
- 支持主张：获准的 ChatGPT plan OAuth token 有官方 app-server 路线；模型目录可能是客户端内置目录，完成实际模型调用才验证该次访问。
- 局限：文档存在不证明在场已经获准、账号有某模型权益或现有 Luna 代用完成生产集成。
- 本项目决策：用应用自身授权与令牌存储/续期；真实 selected-model turn 以 completed 回执验收，失败/中断不计成功。登录或 catalog 成功单独记录。

## 七、应进入 Codex 提示词的实施约束

实施提示词最值得明确的不是“必须用某框架”，而是以下可检查结果：

1. 从真实锁定版本和在场现有入口延伸，说明哪些上游能力已经暴露、哪些需要薄适配。
2. 让至少一个真实学生场景走完事件变化、情境更新、安静准备、自然提示、执行回执、后续修订。
3. 将校园/用户常量从通用逻辑中移到数据和设置；保留保证正确性的代码规则，不把所有确定性逻辑都污名化为硬编码。
4. 人格可编辑，归纳可修正，事实有来源，动态状态可失效；缓存和子代理不会悄悄改变这些边界。
5. 每项重要行为既有该主动的样本，也有信息不足、应该等待、已经完成和变化后撤销的对应样本。
6. 不把模拟器通过称为真实接入完成，不把 cron 创建成功称为准时送达，不把摘要写入称为事实已被本轮正确使用。
7. 按实际数据与运行环境推进；GPS、健康、邮件、校园动态数据未连通时，清晰提供手动/已知数据路径，完成当前可用闭环。
8. 在场宿主继续负责身份、个人记忆和本次上下文；上游 memory/background review 已关闭，不把原生冻结摘要当现有问题根因。
9. delegate 的接入源码、合成 hostmodel 测试源码、实际测试执行结果与生产模型实测分别记录；本轮只有源码审阅，执行验证留给实施阶段。扩展已有接口，避免重复实现。
10. Android 后台、桌面调度和官方 ChatGPT plan 登录各有独立运行约束；以平台与真实模型结果验收，不把目录、模拟器或任务登记当最终完成。

这套方案的研究增量是把主动性落实为有事实依据、能选择时机、会持续修订的生活协作。人格让它的出现更自然，运行机制让它确实有事做、做得到、做过之后记得发生了什么。
