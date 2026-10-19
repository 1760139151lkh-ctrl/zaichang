# 个人记忆、生活连续性与创新：2026-10-18

本轮先核实远端功能分支已合并并同步本地主线，源码审阅起点为 `4edd9225d745e394a7642a064cc3e184195eea4c`。研究输入包括[完整当前请求](../source-materials/2026-10-18/goal-objective-20261018.md)、[完整记忆讨论](../source-materials/2026-10-18/memory-discussion.txt)、[最新桌面Harness讨论](../source-materials/2026-10-18/harness-discussion-desktop-20261018.md)、[前端讨论文本](../source-materials/2026-10-18/frontend-discussion.txt)，以及实施包的[128个场景](../source-materials/2026-10-18/harness-pack/08-SCENARIOS-128.md)和[12条/59步连续时间线](../source-materials/2026-10-18/harness-pack/scenarios/timelines-guide.md)。以上均完整阅读；本研究阶段没有加载前端图片。下文新增机制对应此基线上的实际集成差异，不把未提交工作伪称固定发布版本。

材料是参考，不把历史命令、旧验收或模拟人物写成运行时指令、当前完成证明或本人画像。最新直接指令高于旧Luna门禁；实施顺序仍是后端机制收口→GPT Image→前端。当前全项目验收以[CURRENT_STATUS](../CURRENT_STATUS.md)为准，这份专项研究不替其他模块背书，也不把论文效果当成本产品保证。用户的持续目标仍在进行；本轮归档记录一个已检查的机制增量及继续起点，不以完成本批次代替完成总体目标。

## 需求不是“记得更多任务”

原讨论要求保留：原话中的原因、否定、例外和时间；收到邀请与已经接受的区别；今天的状态与长期偏好的区别；已经独立做到哪里与借助提示做到哪里；仍在探索与已经确定目标的区别。它也反复要求兴趣、创作、休息、期待和真实好消息有自己的位置，不把生活空白全部填成待办。

本轮选择的后端增量围绕这些关系组合，不按场景名称增加生产分支。

| 机制 | 实际实现入口 | 所解决的缺口与证据边界 |
| --- | --- | --- |
| 同源精确遗忘与剩余原文继续处理 | [memory/service.ts](../../src/main/memory/service.ts)、[storage/repository.ts](../../src/main/storage/repository.ts) | 不能因忘一条推断而永久封住同条消息的其他事实，也不能从旧摘要复活被遗忘片段；不是“删完一切存储副本”的外部保证。 |
| 不依赖字面命中的原文浏览 | [memory/browse.ts](../../src/main/memory/browse.ts)、[runtime/context.ts](../../src/main/runtime/context.ts) | `search_context` 的 `mode=browse` 按许可来源、收到时间与固定快照cursor继续找原文；预览不是完整依据，未列出不等于不存在。收到时间不冒充事情发生时间。 |
| 已准备帮助的内容/事项发现 | [runtime/attention.ts](../../src/main/runtime/attention.ts)、[runtime/continuity.ts](../../src/main/runtime/continuity.ts) | 主模型可按内容或真实关联找较早准备，或无query浏览；不是向量语义搜索。后台保留原公平到期队列，实际采用仍查当前来源与版本，不因重新表述获得额外打扰资格。 |
| 每日承载预算与保留空白 | [actions/planning-draft.ts](../../src/main/actions/planning-draft.ts) | 规划考虑已占用、分段、准备/收尾、转换与留白；没有位置仍保留剩余量，不宣称数学最优或自动搬走已接受安排。 |
| 方法要求中的等价替代入口 | [runtime/skills.ts](../../src/main/runtime/skills.ts) | `all/any`区别基础依赖与同用途替代路径；入口可用不等于当前来源覆盖已取得，也不替用户授予权限。 |
| 带证据的决策经历 | [runtime/collaboration.ts](../../src/main/runtime/collaboration.ts) | 把当时拒绝原因、条件变化、重评与结果报告接回同一事项/稳定方案，避免一次选择固化为永久偏好；只保存用户当时报告，不自动改画像、日历或接受状态。 |
| 允许查旧事、拒绝变化后的旧报告 | [harness.ts](../../src/main/harness.ts)、[background-delegation.ts](../../src/main/runtime/background-delegation.ts)、[repository.ts](../../src/main/storage/repository.ts) | 子调查编译前保存宿主专用限制基线，既有局部纠正不再永久阻断整份报告；读取后新变化及未来限制生效仍使旧结果失效，真实模型传输及采用边界复验。 |
| 日账与规划 Scene 共用事实 | [planning-days.ts](../../src/main/actions/planning-days.ts)、[scene-projections.ts](../../src/main/runtime/scene-projections.ts)、[shared/scenes.ts](../../src/shared/scenes.ts) | 真正自然日、未知结束和完整方案引用贯穿投影；显示拆段不拆现实任务，日账缺口不丢原块，前端不另算第二份工作/留白事实。 |

本表说明本轮源码机制的职责；具体整体验证与前端完成状态由负责人在收口时统一记录。前五项的进一步源码审阅与独立观察在本轮各专项工作记录中保留；此前机制背景见[记忆演进](MEMORY_EVOLUTION_2026-10-18.md)、[主动创新](INITIATIVE_INNOVATION_2026-10-18.md)、[日程](PLANNING_EVOLUTION_2026-10-18.md)及[角色/方法](PERSONA_TOOLS_2026-10-18.md)，不重复复制旧材料。

## 原文完整性、遗忘与子调查的接缝

此前 `mode=scan` 只浏览已核验的现行断言，而未提取原文仍仅经 `lexicalEvidence` 找回。多query可以改写，但不能保证找到没有字面线索、没有进画像的细节。因此新增原文 `mode=browse`：`sourceIds` 精确收窄来源，`receivedFrom/receivedBefore` 是收到原文时间的左闭右开区间；它们不是现实发生时间或 Assertion valid time。普通search传入这些browse参数会拒绝，不会静默忽略限制。

第一页面固定已收到事件上界，后续按 `seq < last` 遍历，新增事件不挤动旧页；当前删除与授权每页重查。随机不透明cursor只在宿主内保存位置、范围和身份/权限/epoch绑定，无私人正文或全库序号；30分钟、重启或范围改变后须重开。单次最多扫描本轮maxRows与200的较小值，空partial页仍有cursor时可继续。片段投影先于预览与可见长度，结果不带隐藏匹配、原始全文长度、限制谓词或全集计数；完整正文经 `read.tool/read.arguments` 继续读取，previewOnly不能充当闭合条件。预算通过后记录真实来源、原文版本和receipt，不增加第二记忆库。

直接既有Fixture／Coordinator API观察：尚未提取、span为pending且indexed=0的英文原话，在中文零字面目的下可按来源/时间找到；首页面后插入同时间范围的新行，原cursor仍接到旧尾项；真实search_context返回的read参数可由read_evidence取得正文。未授权来源与续页改时间拒绝；投影只输出授权quote及其长度。maxRows=1且当前投影不可见时得到partial和可续cursor。它们证明宿主通路存在，尚不证明主模型每次都选择对的调查方向或读完长文。

原文浏览也暴露了已有遗忘缺口。忘掉同源第一句的一个断言后，旧代码仍可搜索另一个引用同一句的断言；同一Assertion被CORRECT换依据后，遗忘只遮新原话，旧地址仍能以historical_only浏览。修复沿精确范围清理重叠/未知定位断言、历史版本、索引和依赖派生，同时保留不相交的原话、理解与精确子片段；同一Assertion的历史依据沿可归因纠正定位进入删除屏障，无法定位时保守处理相应来源。局部遮除不再把整条消息标成处理完，剩余原文可继续整理，删除片段仍不得重新提交。直接调用、关库重开及将旧SQLite快照恢复后，屏障重放均保留独立绘画事实并阻止旧地址返回；这不承诺撤回此前外发副本。

另一个旧限制是子报告只要读到带任意 `h_source_restrictions` 的原话就失败，导致合法历史调查无法完成。本轮已修，不能继续列为当前未解限制：前/后台child在compile前保存只含当前有效限制元数据与源版本的宿主基线，不读正文、不进入模型或持久状态、不随后续读取重新设基线。对实际providedEvidenceIds比较当前限制；稳定的局部历史限制可继续调查，整源停止、新纠正、原限制变化或未来限制开始生效仍拒绝旧报告。前台对actor及消息实际引用的produced/consumed报告在模型传输前后复验，成稿复用再查；后台沿validateBoundary、交付和consume核对。权限、机会/托付版本、取消和依赖检查没有放宽。

独立直接状态调用记录显示：已有局部CORRECT时可检索旧源、报告produced后consumed；在报告产生后新增CORRECT，或未来SUPERSEDE开始生效，则转failed并以stale_child_result拒绝采用。这些调用没有真实模型传输；传输前后闸和安全失败投影另按当前源码核查。来源不是摘要或子代理转述赋予的授权。

## 每日预算、未知结束与显示完整性

`dailyBudgets` 最多指定32个不重复本地日期，与原全窗口限制同时生效。每日工作额度仅计本次新增净工作；留白扣除原承诺、保护窗口、准备收尾、完整工作占用和最终共享交通/休息的区间并集，重叠不重复扣费。跨日连续任务按真实分钟分账，未允许拆段的任务不拆；已有承诺已使留白不足时保留原对象、shortfall和未排分钟。部分采用的remainingRequest按同一日界扣减已保存净工作，不重置每日额度，已存日历仍占位。

共用 `planningDayBounds` 不假设24小时：午夜跳时找首个真实瞬间，重复午夜取最早，跳过日期为空区间。专项调用记录覆盖23小时Santiago、25小时Havana／洛杉矶与Apia跳日。归档时再次直接调用当前生产helper：`Antarctica/Vostok` 的 `2023-12-18` 返回 `2023-12-17T17:00:00.000Z` 至 `2023-12-18T19:00:00.000Z`，1560分钟（26小时）；这是日界函数的实际结果，不能升级为该日期完整规划或界面验收。

负责人另实际调用了 `Antarctica/Troll` 的 `2026-10-24T12:00+02:00 → 2026-10-26T12:00Z`。归档审阅又独立直接执行当前 `draftCalendarPlan → planningSnapshot`：草案与Scene的三日留白均为 `[720,1560,720]`，一块free区间完整投影为三段且各带原范围；省掉中间daySummary再投影时，不再输出日账，保留原 `2026-10-24T10:00Z → 2026-10-26T12:00Z` 完整块并说明范围未齐。另直接调用带+08:00起点和null结束的外部busy，核算保守占位，但Scene只有一个end=null的busy块，没有伪造originalRange。这些均为生产函数的直接返回观察，没有新增测试或脚本，也不代表界面已实际走完。

未知结束的本地/外部busy可用窗口末尾作保守核算，但输出保留unknownEnd／issues，Scene保持end=null。Scene只采用覆盖完整窗口、日期唯一且边界连续的宿主daySummaries；有限结束块按这些日账拆显示部分，保留originalRange与完整planRefs。原工作、接受和动作回执仍归宿主，点选显示半段不产生半段保存参数。日账缺失或范围未对齐时不拆块，保留原完整时段并说明缺口；renderer不重新计算另一份工作／占用／留白事实。

源码核查到 `draftCalendarPlan → PlanningApplicationService → planningSnapshot → Scene` 和部分采用恢复各处真实字段。专项直接调用观察包括每日90分钟、跨午夜30/60分账、保留已有承诺与缺额，以及采用30分钟后剩余额度60。前端渲染/交互的本轮结果另见当前状态；此处不拿源代码或日账数字代替界面体验证据。

## 128个场景的交叉审计

完整逐条审阅后，按实质关系归并如下。场景清单是要求，不是128项已经通过的成绩单。

| 场景 | 不能遗漏的关系 | 本轮增量后的剩余边界 |
| --- | --- | --- |
| S001–008 学习与注意力 | 最小提示、具体卡点、专注转场成本、失败原因 | 学习表现/已公开提示的完整契约尚未实施；`learning`种类存在不代表独立掌握判断可用。 |
| S009–016 考核与期限 | 动态场次、提交回执、取消和独立闹钟 | 真实学校动态覆盖与动作回执另验，不以接口空值认定没有考试。 |
| S017–024 长期发展 | 小探索、前置条件、具体成长、目标改变 | 可逆选择窗口和真实成长比较还需进一步连接，不能从一次旁听建长期义务。 |
| S025–032 日程与重排 | 同对象局部调整、减负、留白和撤销 | 共同约定、外源版本及部分采用不能由草案自行批准。 |
| S033–040 社交邀请 | 意向、承诺、本人确认、私人原因 | 不推断他人好感或替他人填日历；经历只记当时理由，不永久排除社交。 |
| S041–048 关系与归属 | 双方需要、公平、可退出、解决后放下 | 位置不变不能推出孤独，未回复不能推出偷懒；陪伴分寸仍需实际模型观察。 |
| S049–056 空间与天气 | 起点质量、出入口、预测、设备和退路 | 无障碍、开放与手机设备信息有独立覆盖缺口。 |
| S057–064 身体与运动 | 多窗口、当次休息、缺测、有效计次 | 真实学期/规则/审核仍需认证；体育分类不是有效次数，缺测不等于身体异常。 |
| S065–072 情绪与选择 | 先听或分析的当轮需要、真实进展、玩笑不是定性 | 配置和宿主检查不能证明真实模型的情商或长期理解。 |
| S073–080 预算与资源 | 预期与到账、退款/代垫、通勤代价和隐私 | 未实现正式财务台账；明确范围的账单整理可复用材料，不让记忆复制余额权威。 |
| S081–088 生活与物品 | 携带成本、独立笔记、离线与实际兼容 | 准备清单不证明文件能开/设备能接；物品位置必须有来源。 |
| S089–096 校园制度 | 适用年份/主体、真实周次、陌生机会和等待窗口 | 真实公共通知/账户覆盖另验；缺连接只限制对应帮助。 |
| S097–104 兴趣与创作 | 原意保存、发现过程、自由时间、轻松庆祝 | 无阅读进度不猜已看完；不把兴趣自动建项目，不随机推送陪聊。 |
| S105–112 人格与互动 | 用户编辑、当轮优先、风格与事实分工 | 预设/例句不证明任意角色的完整还原；热情不扩大通知权限。 |
| S113–120 证据与纠错 | 主体、未来生效、示例隔离、归因与独立来源 | 召回之后仍要回查原文；多个代理复述不是多份独立证据。 |
| S121–128 协调与设备 | 同一逻辑事件、迟到隔离、互斥、持续托付与正常降级 | 桌面逻辑不等于手机GPS、后台常驻或跨设备同步已上线。 |

12条时间线全部59步也已交叉核对：TL01调课后约饭与局部重排；TL02多运动窗口及逐次有效计数；TL03陌生机会、时间推进和一次拒绝；TL04长原话尾部条件与未来生效；TL05角色/临时语气/私人资料分离；TL06时间地点权限使缓存失效；TL07真实委派取消与迟到隔离；TL08尾项、删除、重启和连续cursor；TL09unknown通知与确认；TL10手机夹具与本人起点；TL11笔记、计划、接受和独立撤销；TL12禁传输、禁搜索、禁外发与引用边界。没有把未来步骤或裁判信息送入产品模型；本研究没有把阅读这些规格冒充执行通过。

## 创新候选的取舍

| 候选 | 具体使用方式 | 本轮结论 |
| --- | --- | --- |
| 决策经历与可重评理由 | 当时因设备在家没选校园；借到设备但尚未试；重新考虑；实际尝试与结果回报；下次找回这次完整处境。 | 已落入现有collaboration frame，见下文。 |
| 学习断点与提示边界 | 记住题目版本、已讲到哪一步、哪些由本人独立完成；回来继续时保留还想自己发现的部分。 | 值得下一步实施，不能只加“已掌握”标签；本轮未声称已完成。 |
| 可逆探索窗口 | 比较科研/实习，找共同准备和最后决定时点，保留退出条件，不提前替人选择。 | 复用world/option/basis与时间节点的候选；没有自动报名/发送。 |
| 创作与生活的温柔续接 | 记住一段创作原意、一次看展体验或一句喜欢的话，以后相关时自然接上。 | 可复用笔记/事项/明确托付；不新增随机推送与隐形长期项目。 |
| 按需的理解变化回看 | 用户主动问“这周你的理解怎么变了”时，比较新旧原话与条件。 | 以纠正/basis/原文为依据的候选；派生回顾不能反过来变成新的独立证据。 |
| 可撤销的本地语义索引 | 中文/跨语言问题可增加非字面候选，原文和当前有效断言仍归同一SQLite所有者。 | 未接入embedding模型或服务；模型文件、CPU延迟、跨语言质量、版本/删除及只在本机处理边界须实际比较，不先建无模型的空接口。 |
| 跨运行的持久调查断点 | 在同一help_opportunity保存已核证据定位、版本和剩余方向；下一次唤醒重新读取。 | 未实施。浏览的30分钟进程内cursor不是持久frontier；不能重放旧toolCallId、子报告、scope或批准，ACK只在真实读取/采用后推进。 |
| 长期方案意图续接 | 保存原方案为何这样选、未排余量和改变的条件，重启后回读真实日历再重算。 | 未实施。候选由现有Work/事项拥有；15分钟票据不持久化、不恢复旧采用授权，也不把未做完自动挤到明天。 |
| 明确长期角色修改与轻方法发现 | 用户明确要求长期改变称呼/相处方式时沿现有角色CAS与历史保存；初始只给有限方法名称/版本，正文仍按需读取。 | 两项均仍是候选。临时语气不改核心，私人事实不导出为角色；目前已有十份方法不等于初始上下文已加入新方法目录，不增分类器或另一人格库。 |

这些候选不必各建一个后台服务或页面。学习状态仍需要题目版本、具体表现、已公开提示、辅助程度与独立复现证据；当前学习方法文本和learning种类不等于已具备这些状态。持久frontier、方案意图与语义索引也各有未完成契约，继续研究并落实有用机制，不以空接口占位。后续界面优先接现有聊天/今天/留下，确需新画面时仍先GPT Image；不能因候选漂亮就提前宣称完成。

这里列出的是当前已辨认且有具体继续接缝的候选，不是创新范围或数量上限；后续仍从真实个人生活中的帮助、原始材料和实际失败出发继续研究。

## 决策经历的最小契约

此前实际存在两种不相连的表示：frame的`rejectedOptions`有文字理由但没有稳定方案归属；option的`rejection.validWhen`能按能力条件重评，却没有真实尝试/结果的完整链。因此这次复用原episode作为所有者，增加`update_collaboration(operation=experience)`。

输入为原有`id/expectedRevision/source`，加`experience {kind, optionId, expectedOptionRevision, validWhen?, stopWhen?, recheckAt?, reassesses?}`。`kind`为`rejection/attempt_report/outcome_report/reassessment`。条件须逐字来自同一用户引文，不能由模型改写成“每周都不去”；未知可空。`recheckAt`只表示助手提出的复查元数据，不是用户承诺、现实发生时间或定时提醒。

宿主核对同一事项、主体、世界、工作区和方案版本；重评须指向同事项同方案已有经历。数组上限64条，达到上限明确不保存，不悄悄覆盖旧理由；精确重试幂等，同一报告更换条件/关联则报冲突，要求新的原话说明。旧frame没有经历数组时不需迁移，旧rejectedOptions不靠标题猜配ID。

持久化仅保存原文/条件的字符定位、内容版本、引文SHA-256、原文收到时间、记录时间和方案版本，不复制原话或条件正文。补记历史原话允许，但`reportedAt`沿用当时收到时间，区别于现在`recordedAt`。这是用户报告，不是外部核实，始终`verifiedOutcome:false`，不会自动写画像、日历或接受状态。

恢复先核读取权限与来源scope，再按项回读。源内容更正、版本/片段改变或局部删除导致hash不符时，相关经历只返回安全历史标记；同一消息的其他完整片段继续可用。不可读来源不展开，coverage只报本次返回量，不公开隐藏总数。经历来源不成为整个frame的额外证据前提；来源退出后，独立事项仍可继续更新。实际展开的引用由主循环记入上下文收据并按当前预算计费/复核。

### 已实际核查到哪一层

使用正常Store、Collaboration、WorkService与repository API的短调用，隔离合成SQLite，没有新增测试、夹具、runner或脚本。实际观察到：拒绝→条件变化但尚未试→尝试报告→结果报告→关库重开，4条报告与条件保留，方案仍candidate、selected为空，日历/画像为0；精确重试不增版本，变条件报冲突；同消息重复词的条件定位仍在选定引文内。

更正原理由片段后，旧经历仅安全标记、新结果仍可读；移除私人报告来源的读取范围与实际删除来源后，该正文不从副本恢复，frame继续更新；实际撤销evidence:read后读取入口拒绝。

最终集成另沿真实 `restore_collaboration` 工具分支核查：只收集已展开并与当前源版本相符的经历引用，加入providedEvidenceIds／providedSourceIds／providedObjectVersions；完整恢复结果经recordTool的hostRead预算闸，超量不能作为模型观察返回。事项本身不因丢失独立报告而获得该来源的读取权，也不因保存locator就自动带出正文。

负责人通过真实RuntimeCoordinator入口执行并保存的 `root-experience-receipt.log` 已逐项回读：被删除旧理由只有source_changed安全标记，独立的“这次坐得舒服。”报告仍可用；receipt包含 `hash-two-spans` 的evidence版本1和 `history:self/work:self` 来源。读取预算由5936到14671字节、估算token由2494到7590，含实际恢复返回体。该记录核实了接线和预算变化，不把它表述为实际模型理解、真实用户结果或长期记忆质量。

另复现并修复了局部遗忘保持contentVersion的边界：旧代码会把遮字后的`█████`误当报告正文。加入引文hash后，关库重开可恢复同源两个片段；删除第一个片段后仅第一条转为`source_changed`，第二条正文/条件仍完整，事项继续更新。类型与diff检查通过。以上是宿主/状态证据，不能证明真实模型每次正确理解理由、情商或长期人格效果；整体验证由负责人统一收口。

## 记忆与连续工作的候选比较

专题研究用GitHub commit API或git ls-remote核对所读revision，再读取固定源码。以下只归档本轮独有机制与取舍；Graphiti `417c3a125ae3ac53c19b8e53fffaccf3e665a88e`、Hindsight `5331da2f4db369528bb122075341a7de9c3df6df`、Mem0 `0724291bd864cf807e88ee8981c8226644e8fb42` 回读仍是[此前研究](MEMORY_EVOLUTION_2026-10-18.md)相同版本，不包装为更新或重复计入新成果。均未作为新增运行依赖。

| 候选与所读固定版本 | 具体源码证据与采用/拒绝理由 |
| --- | --- |
| Letta-code `7be3c81f9cfce481994fe4484d59a5bf17cdb48a` | [reflection-transcript.ts](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/cli/helpers/reflection-transcript.ts)、[memory-worktree.ts](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/agent/memory-worktree.ts)：仅成功整理才消费transcript cursor，父脏/冲突/未提交不消费。借鉴隔离提案、成功后ACK、提交前重核；不把MemFS/Git历史变成第二事实库或扩大遗忘责任。当前MemFS也不默认带向量索引。 |
| Hermes：在场锁定 `d595e636c83aa0b9606d4e914e1140ae9c796897`；另读上游 `22063fc099ec9ad8357d7f8f6e6248a0400680d3` | 锁定版[memory_tool_store.py](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/memory_tool_store.py)、[session_search_tool.py](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/session_search_tool.py)给有界写入和发现→定位→深读；当前[memory_caller_scope.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/agent/memory_caller_scope.py)绑定profile归属。采用职责，不启用其USER/MEMORY文件、添加式provider镜像或原生session日志；[memory_context.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/agent/memory_context.py)的权威回忆包装也不替代在场的原话/推断/历史用途分层。上游功能不能冒充本产品已接入。 |
| 同一上游Hermes的定时实现 | [monitor.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/cron/monitor.py)、[scheduler_delivery.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/cron/scheduler_delivery.py)分开变化hash、投递与聊天镜像；hash可在模型前推进，失败后未必重做同一观察。保留在场“观察到/成功消费/展示/送达”区别，不照搬先ACK再推理、进程内唯一队列或默认记忆启用配置。 |
| SimpleMem `db80b6a7c591e0ea730a058e9f5fc4eb06572299` | [hybrid_retriever.py](https://github.com/aiming-lab/SimpleMem/blob/db80b6a7c591e0ea730a058e9f5fc4eb06572299/simplemem/core/hybrid_retriever.py)真实合并语义/关键词/结构候选，并按信息缺口继续查询。借鉴由问题驱动补检索；不复制固定的每轮多级模型流水线，也不把模型自报coverage百分比当完整性证明。 |
| A-MEM `ceffb860f0712bbae97b184d440df62bc910ca8d` | [memory_system.py](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py)按note/context/tags动态关联与演化。链接可作可撤销索引；更新旧note语境不替代在场的用户纠正、来源条件、版本及遗忘协议。 |
| RLM `d04208afbad29ca675ab13478c40ee8bebc84bfe` | [core/rlm.py](https://github.com/alexzhang13/rlm/blob/d04208afbad29ca675ab13478c40ee8bebc84bfe/rlm/core/rlm.py)把长上下文作为可分段检查的外部材料，允许有界子调用。复用现有Hermes工具/只读delegate调查原文；不另引任意代码REPL、递归主循环或整库私人上下文。 |
| Hindsight 同上版本的新增阅读 | [reflect/tools.py](https://github.com/vectorize-io/hindsight/blob/5331da2f4db369528bb122075341a7de9c3df6df/hindsight-api-slim/hindsight_api/engine/reflect/tools.py)的tool_expand分别查fact与源document权限后才取正文；派生物可读不意味着整篇原文可读。采用这一接缝；fact导向召回不代替未提取原文的独立浏览。 |
| OpenClaw `2f595930f12591ba59b109467beb9a65baf7e8d4` | [run-queue.worker.ts](https://github.com/openclaw/openclaw/blob/2f595930f12591ba59b109467beb9a65baf7e8d4/src/cron/store/run-queue.worker.ts)、[heartbeat-dispatch.ts](https://github.com/openclaw/openclaw/blob/2f595930f12591ba59b109467beb9a65baf7e8d4/src/infra/heartbeat-dispatch.ts)分开排队、运行快照、回执及静默scratch。持久调查可借鉴版本化断点；现有SQLite队列不需重复新建，通知成功也不等于写入对话成功。 |
| Khoj `ae229ca894c0b80ad84664afcfdde523b5e87057` | [helpers.py](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/khoj/routers/helpers.py)、[api_automation.py](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/khoj/routers/api_automation.py)使任务沿自己的conversation继续，调度有合并/错过窗口边界。借鉴持续同一件事；不照搬额外通知判定模型或其运行间隔，持久化不证明停机后补做全部工作。 |

[LongMemEval](https://arxiv.org/abs/2410.10813)支持分别观察提取、多会话推理、时间、知识更新和信息不足时克制；[RLM论文](https://arxiv.org/abs/2512.24601)、[SimpleMem论文](https://arxiv.org/abs/2601.02553)、[A-MEM论文](https://arxiv.org/abs/2502.12110)提供原文分段、压缩/整合与动态链接的候选；[Sleep-time Compute](https://arxiv.org/abs/2504.13171)支持对高复用上下文提前计算，但收益依赖后续问题的可预测性。它们不证明在场长期理解、更正、遗忘或陪伴体验已可靠。记忆索引和整理视图继续可重建，原始证据不被摘要取代。

## 工具、日程与人格的源码取舍

| 固定来源 | 本轮独有的启发与限制 |
| --- | --- |
| Smart Agentic Calendar `6088e957e17eda94fd362f8e420510827b5ed858`：[replan-coordinator.ts](https://github.com/fbdo/smart-agentic-calendar/blob/6088e957e17eda94fd362f8e420510827b5ed858/src/engine/replan-coordinator.ts)、[scheduler.ts](https://github.com/fbdo/smart-agentic-calendar/blob/6088e957e17eda94fd362f8e420510827b5ed858/src/engine/scheduler.ts) | 借鉴合并变化、保留剩余分钟和失败旧结果；其内存replanning结束并不等于持久stale消失，提醒我们前端须投影真实回执。不给在场引入全量自动替换既有承诺。 |
| Open Sunsama `097dfd5f55dcf9c86e36b3923566ead4334447df`：[rollover/batch-processor.ts](https://github.com/ShadowWalker2014/open-sunsama/blob/097dfd5f55dcf9c86e36b3923566ead4334447df/apps/api/src/workers/rollover/batch-processor.ts)、[time-block-cascade.ts](https://github.com/ShadowWalker2014/open-sunsama/blob/097dfd5f55dcf9c86e36b3923566ead4334447df/apps/api/src/services/time-block-cascade.ts) | 完成与排期分开、未做完可回backlog；级联保间隔可参考。批处理实际不等于注释声称的事务，同日HH:MM回绕也不能直接处理跨日/时区/授权；不自动形成次日债。 |
| Super Productivity `68d27f64989e402a2b8e2f9efe995b854e531d05`：[普通任务投影](https://github.com/super-productivity/super-productivity/blob/68d27f64989e402a2b8e2f9efe995b854e531d05/src/app/features/schedule/map-schedule-data/create-schedule-view-entries-for-normal-tasks.ts) | 真实剩余工作、当日意向和普通任务分开；采用对象分工，不把排程视图当完成或接受事实。 |
| Agent Skills规范 `69ef37e9424c0a7ea9dd2293b559e43ec8176379`：[specification.mdx](https://github.com/agentskills/agentskills/blob/69ef37e9424c0a7ea9dd2293b559e43ec8176379/docs/specification.mdx) | 名称/描述先发现、完整方法按需读。轻目录仍可继续做；实验allowed-tools字段不授予在场执行权，不安装外部技能代码。 |
| SillyTavern `06bde939fb1e9c4c8d8641d810f0a916b5bce127`：[PromptManager.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/PromptManager.js)；Character Card V3 `f3a86af019fbd99f788f7a1155f399655b34ab35`：[SPEC_V3.md](https://github.com/kwaroran/character-card-spec-v3/blob/f3a86af019fbd99f788f7a1155f399655b34ab35/SPEC_V3.md) | 角色描述、性格、场景、用户persona、例句与历史分块；不采用系统覆盖、世界书插入、隐藏媒体或虚构历史。保持有限可编辑文字卡，不为本轮增加完整V3播放器。 |
| PersonaMem-v2 `d29d91d016add354e459dfeb0d24af08bc402e2a`：[data_preprocess.py](https://github.com/bowen-upenn/PersonaMem-v2/blob/d29d91d016add354e459dfeb0d24af08bc402e2a/MemAgent/data/data_preprocess.py)；InCharacter `f554202a94d4a83dc5407245bb18981899e872e6`：[README](https://github.com/Neph0s/InCharacter/blob/f554202a94d4a83dc5407245bb18981899e872e6/README.md) | 当前问题、历史与评分真值分开，角色访谈行为也不同于自报。不能把合成偏好标签、选择题成绩或助手自称像角色，当成真实用户理解或原作还原；未运行或训练这些基准。 |

[Global Faithfulness/APC v2](https://arxiv.org/abs/2405.07726v2)区分当前要主动体现的约束和不应被矛盾的被动约束。借此保持当前表达要求与角色核心并存，不声称接入了APC、NLI、DPO或心理量表。角色与权限、业务事实继续分开，界面编辑只改变用户明确保存的设定。

## 其他创新研究来源

以下固定版本于2026-10-18通过git ls-remote核对并实际读取源码；论文和Concordia的动态CHANGELOG单独标明，不伪称固定运行版本。没有把任何项目作为新增运行依赖。

- **Generative Agents**，[论文](https://arxiv.org/abs/2304.03442)、固定提交`fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4`的[reflect.py](https://github.com/joonspk-research/generative_agents/blob/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4/reverie/backend_server/persona/cognitive_modules/reflect.py)与[retrieve.py](https://github.com/joonspk-research/generative_agents/blob/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4/reverie/backend_server/persona/cognitive_modules/retrieve.py)。反思保留证据节点、检索区分事件/思想并组合相关度等信号。借鉴经验与派生理解分工，不照搬模拟人的自主生活，也不把多次召回当独立支持。
- **Tutor CoPilot**，[作者仓库与实际notebook](https://github.com/rosewang2008/tutor-copilot/blob/25c6eab7e416614f2033358bceddd30a4d5ca616/Tutor_CoPilot_Demo.ipynb)、[论文](https://arxiv.org/abs/2410.03017)，提交`25c6eab7e416614f2033358bceddd30a4d5ca616`。源码把课题、对话和教学策略结合，给人类教师有限建议。它是研究demo，启发保留当前思路/提示边界，不证明在场的大学生长期学习效果。
- **Thinking Assistants**，[作者论文](https://arxiv.org/abs/2312.06024)。反思提问可帮助人获得关键决策信息。采用其“关键未知”的视角，不把所有明确请求改成强制问卷。
- **Bender**，提交`a06595d623d9eaa109479fbfc744a20afd7c709c`的[reviewer.py](https://github.com/0717376/bender/blob/a06595d623d9eaa109479fbfc744a20afd7c709c/backend/app/reviewer.py)、[memory_store.py](https://github.com/0717376/bender/blob/a06595d623d9eaa109479fbfc744a20afd7c709c/backend/app/memory_store.py)、[books_tools.py](https://github.com/0717376/bender/blob/a06595d623d9eaa109479fbfc744a20afd7c709c/backend/app/books_tools.py)。实际区分任务、资料和个人记忆，阅读有offset/next_offset；但reviewer截前1500字符、异常丢弃，常驻记忆为4000字符JSON。取其分工与按需回读，不采用截断、丢恢复或全量个人记忆常驻；未验证其产品规模与效果。
- **Concordia演化**，[官方CHANGELOG 1.8.3](https://github.com/google-deepmind/concordia/blob/main/CHANGELOG.md)。AllSimilarMemories去掉近期性/重要性权重以符合接口含义。启发是召回契约和排序职责须清楚，不用统一时间衰减抹掉仍有价值的理由；动态分支不作为本项目运行版本证据。

原始来源版本、精确字节与哈希见[来源清单](../source-materials/2026-10-18/manifest.json)。论文/模拟系统的指标不迁移为在场的性能承诺；真实模型、账号、设备与长期体验仍分别取得证据。

## 本轮检查的层级与继续边界

已回读本机保存的整合日志：`final-integrated-tests.log` 为既有262项检查全部通过、零失败；`final-hermes.log` 为锁定真实AIAgent的9项检查通过，模型端为受控宿主回复；`final-integrated-build.log` 完成类型、renderer、Electron与公共review构建，记录有既有大chunk警告。它们属于该次整合运行，不替之后的显示修正、全部场景、真实模型、账户、移动端或长期体验背书；当前最终版本与后续界面观察继续由[CURRENT_STATUS](../CURRENT_STATUS.md)维护。

本轮新增能力使用现有生产入口、既有Fixture/API和既有检查，不新增测试代码、套件或runner。静态源码检查、直接合成状态、真实Hermes配受控回复、实际云模型、外部服务和用户体验分别记录。第一批当时未接入的语义embedding、持久调查frontier、长期规划意图和学习表现状态按候选记录；其中规划意图已在[第三批](PERSISTENT_PLANNING_INTENT_2026-10-18.md)继续实施，其他候选不能随之推定完成。继续比较和实现有价值的机制，不以本研究归档或本批次检查通过宣布持续目标结束。
