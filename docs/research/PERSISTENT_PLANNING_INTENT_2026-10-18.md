# 可恢复的规划意图：研究取舍与当前机制

2026-10-18。研究基线：`30dcd8e675d42eca58a7f0f2c36b48512d9ae5d0`；本文记录其后的第三轮持续改进，当前持久协议为schema11。后端主体及continuation Scene合同已落入当前工作树；后端整合的262项既有检查、9项锁定Hermes检查与构建通过后，生成并亲看两版GPT Image，再沿现有时间带实施续接呈现并操作真实Electron。最终审查修正了历史成员、派发前取消及重算后原证明撤回的边界，并把精确来源贯穿准备、画面和跨回合正文。各层证据见下文及当前状态；这不是新的发布包说明，持续总目标仍进行。

本轮解决的是：用户重开应用或换会话，能找回一件正在商量的安排，读到当时保留的任务、窗口、预算和依据，再结合当前真实日历继续试算。保留规格、排进日历与本人完成工作分别记录；旧票据和批准不会随意图恢复。

## 原始需要与八个比较方向

[完整请求](../source-materials/2026-10-18/goal-objective-20261018.md)要求记忆与日程自然工作，不让用户管理工具和记忆，并要求从真实候选比较中选机制。[记忆讨论](../source-materials/2026-10-18/memory-discussion.txt)第579–599、1630–1669行把持续性定义为恢复目的、决定、条件、否决理由和真实结果地址，第1689–1714行要求本轮更正、当前事实和执行前复核。原始[128场景／12时间线](../source-materials/2026-10-18/harness-pack/scenarios/)中的 S025／S027、S029–S032、S070、S082／S100／S102、S117／S123／S128及TL01／TL11，分别提供了取舍、减负、留白、完成报告、草案与采用、局部撤销、条件更正和撤权的关系。它们是合成设计输入，未被当作本人事实、运行时指令或本轮全部通过记录。

八个方向的共同取舍如下；这些是机制比较，不是八套并行状态。

| 方向 | 比较的可行路线 | 选定机制与理由 | 没有采用的默认 |
| --- | --- | --- | --- |
| 1. 产品续接 | 仅回读聊天；结构化非执行规格；完整 planner 快照 | 选择结构化规格，原文回读继续兜底。能稳定保留安排需求，又不重复维护当前日历和旧执行环境 | 不把“记得任务名”当恢复；不把全快照当当前事实 |
| 2. 业务归属 | 直接塞进 frame；通用候选 plan；独立记忆系统；既有 work 的专用类型 | `h_work` 的 `kind=plan,data.type=planning_intent`；可用 matterId关联已有共同事项，无须制造空frame。通用候选与持续需求保持语义区分 | 不自动加入选中方案，不创建人物Assertion或另一份记忆库 |
| 3. 真实采用证明 | 数日历行；模型报告进度；持久成功布尔值；宿主manifest联查原业务 | 宿主清单明确工作组、净工作、完整占用及边界；联查原动作、派发、真实回执和当前对象版本 | 准备／休息／保护不抵扣净工作；已安排不等于完成 |
| 4. 事务接缝 | afterCommit记账；保存意图时存成功；prepare时存不可执行关联 | 在实际动作prepare事务内登记child manifest/action link；成功仍只归原回执。能区别从未准备与证明已不可用，不增加第二成功账本 | 不在只读试算中写attempt；不靠提交后内存cursor作持久证明 |
| 5. 来源与停止 | 仅新handler验来源；通用JSON后过滤；共享绑定门；恢复全文后再停止 | 共享 `WorkRecord.sourceBinding`，资格核查先于标题、匹配、计数、分页；已知对象可不读旧私文而暂停／结束 | 停止不要求先恢复被撤回正文；恢复活动仍须原规格来源可读 |
| 6. 当前重算 | 复活Ticket；旧参数重放；仅把旧工作当busy；保留工作锚点后同一planner重算 | 新时间域、新Ticket、原预算扣一次；已核未来工作作为host retained锚点，已存边界只提供覆盖，缺失边界由同一构造器补齐 | 不把已排前置当completed，不漏准备／休息，不重复收费或自动平移日期 |
| 7. 自然发现 | 用户报ID；只搜标题；塞入必须做的nextStep；有限独立索引＋按许可分页 | `planningIntents`有限线索，typed restore精确读／父事项关联／许可工作区scan；实际来源和对象版本进入ContextReceipt | 首页少量线索不代表全库；没找到不要求用户重讲，也不说明没有其他范围记录 |
| 8. 模型工作流与默认值 | 自由回填spec；每次试算自动保留；把解析参数当用户偏好；真实planId导出＋当前用途核验 | 专用 `manage_planning_intent`，宿主从真实票据导出，沿现有delegation verifier核当前保留用途及支持来源；规格整体标为规划解释和方法默认值 | 默认休息／留白不成为长期偏好；保留、恢复、点选均不批准日历或后台托付 |

聊天回读路线仍可行，尤其适合旧资料和缺失规格时的辅助重建；它不能提供确定的任务段扣量。完整不可执行快照也可用于历史诊断，但当前需要的收益主要来自静态需求、来源与真实采用关联，没必要复制busy、外部正文、旧scope和完整输出。最终采用的是可维护的中间路线。

## 状态和执行仍各有一个所有者

当前主要源码入口为 [PlanningIntentService](../../src/main/runtime/planning-intents.ts)、[契约](../../src/main/actions/planning-intent-contract.ts)、[采用投影与重算材料化](../../src/main/actions/planning-intent-ledger.ts)、[PlanningApplicationService](../../src/main/actions/planning-application.ts)、[同一规划器](../../src/main/actions/planning-draft.ts)及[ActionRuntime](../../src/main/actions/runtime.ts)。

- **规格**归一条h_work记录，`contractVersion=1`，有调用方CAS、specDigest和精确specBasis。现有WorkService提供专用writer；通用update、同步合并不能替换受保护的规格或来源绑定。可独立存在，matterId只关联真实已读frame，不复制一套frame决定。
- **宿主清单**归 `h_planning_intent_attempts`，由intent_id外键归原work所有；planId为一次真实计算身份，spec_digest绑定规格依据。schema11为每次attempt独立保存当时的source_binding与redacted标志；不能借父意图新版来源读取旧attempt。清单保留unit角色／顺序／参数摘要、工作组净区间与完整占用、typed边界、来源版本元数据和allocationBasis，不存scope、approval、可执行arguments或外源正文。上限2048单位／256KiB，超限明确拒绝，不截尾。
- **动作关联**归 `h_planning_intent_action_links`，键含planId/blockId/actionId/actionRevision，保存实际actionDigest，没有success字段。没有到h_actions的删除级联，避免证明被清理后反而误报从未准备；intent清理则删除其child元数据。
- **成功与当前占用**仍归原 `h_actions/h_attempts/h_receipts/agenda`。原本地事务核写后对象并产生 `confirmed_success/local_saved`，compensation和日历版本高水位提供真实保存版本。它们不因保存意图或重算而另抄一份成功状态。
- **当前执行票据**仍是原Application内存Ticket，最多50份、15分钟并受scope时效约束；新重算使同意图旧关联票据不能继续采用。持久材料不是Ticket、批准或当前权限。

[repository迁移与writer](../../src/main/storage/repository.ts)在永久屏障回放前依次建立schema10两张child表及schema11的attempt来源门。旧schema10无法证明每个attempt的原始来源，迁移不借当前parent回填，统一将旧manifest清为`{}`并置`redacted=1`，保留opaque存在关系。它表示旧采用证明未知，不能当成零采用或据此重复安排。旧普通plan、旧planRef及缺manifest历史同样不反向补造新意图／采用证明。当前尚未发布这套新协议；旧原型／schema10诊断属于其当时快照，不作为fresh schema11 keep的回归证据。

## 从保留到重新采用的真实入口

1. `planning.draft`继续只读。普通比较、问候、只想倾诉或只是选中一个时段不自动建持续记录。确有跨轮继续用途时，主助手可调用 `manage_planning_intent(keep/update)`，提供真实planId及当前用户原话的精确版本／Unicode范围，必要支持放supports。模型不能提交自写spec、manifest、actionId或成功数。
2. [coordinator](../../src/main/runtime/coordinator.ts)先生成实际提案，沿既有本地delegation语义核验；内部verdict绑定提案digest、当前用户依据和实际parameterObservationIds，host再核实际来源。保留用途不要求用户逐项批准方法默认值，但一次试算或旧规格存在也不自动构成新许可。没有真实模型调用，本轮普通API的显式host核验输入只证明此接缝之后的状态协议。
3. 成功keep只写非执行work，`agendaChanged:false,memoryAssertionCreated:false`，且不登记attempt。相同来源和planId精确重试回同一对象；后续update/pause/resume/retire需已读id及expectedRevision。已有动作准备的旧草案不能事后归入新意图；应从当前日历重新试算。
4. 继续时可从 `planningIntents`索引或 `restore_collaboration(type=planning_intent)`发现／精确回读。默认列表active；按当前明确用途可查paused/retired，读取不会恢复状态。`discoveryScope=permitted_workspace,mode=scan`提供当前许可分页，不依赖标题词面或用户手填ID；受限会话模式不扩大跨会话范围。update／resume保留原scalar sessionId、已有sessionIds与当前会话的并集，不再静默slice(-32)丢掉较早成员；既有160,000字节持久内容预算超限时明确拒绝，不截尾保存。
5. `planning.replan({id,expectedRevision})`回读当前规格、真实日历及采用证明，先产生 `ready/needs_review/no_future_domain/required_refresh`材料化结果。只有ready才调用同一个planner生成新planId和短票据，并可沿既有PlanningScene呈现；它不改规格revision、不写attempt、不采用日历。旧 `planning.recover({planId})`仍是原计划观察入口，不会因此恢复旧Ticket。
6. 新方案实际采用仍走原prepare/批准/preflight/本地事务。ActionRuntime同步LocalPlanPort在prepare同一事务中登记host manifest和真实action-revision link，失败整体回滚；revise不能去掉／替换旧planRef。原本地保存事务仍单独写真实agenda和成功receipt；afterCommit仅推进内存cursor，不能改报真实业务成功。准备关联不使spec revision增加，也不让后续单位因自己记账而失效。

研究早期曾提出“commit时复制一份成功关联”“在work内嵌整份manifest”和“复用自由JSON规格”等方案；当前实际选择是上述**prepare原子关联＋原回执联查**，这些早期候选没有同时落入产品。

## 来源绑定、精确遗忘与不读私文的停止

顶层 `sourceBinding.version=1`含eventId/contentVersion/start/end、宿主解析出的真实sourceIds与requiredGrants。writer检查当前用户primary、合法user/external支持，拒assistant来源；参数实际借用的非本地源同时要有精确支持，不能仅凭captured scope、工具成功或sourceCoverage声明成为合法长期依据。必要支持仍有语义核验责任，结构校验不宣称逐字段意思被形式证明。

共享source gate沿work、workData、关联／共同事项、continuity、当前事项、同步／导出等读面先核资格，受限标题和数量不先流出。原文版本、当前许可、保留范围与 `availableInferenceRanges`均参与；绑定事项的自动水合只读精确片段，明确sourceRange/boundRange及未读部分，不回退为整条父消息。[ContextCompiler](../../src/main/runtime/context.ts)和[continuity](../../src/main/runtime/continuity.ts)记录实际work revision、Evidence版本／sourceIds；replan也登记当前采用的agenda版本，不能用能力外层的local-agenda标签掩盖work和原话来源。

attempt还有独立的读门：先取planId/specDigest/source_binding/redacted元数据，逐份通过其自身当前来源核验后，才取manifest和关联动作／回执。父意图由来源A修订到B，不使旧A变成B的可读材料；导出也先过每attempt的门。任一旧证明已redacted或不在当前范围，采用投影返回`needs_review,evidenceCoverage=unavailable,allocatedMinutes:null`，不暴露旧正文，也不把不可读误算为零。单纯收窄读取范围不等于永久删DB；永久遗忘才沿精确来源清理。

重算之后也不能只核新版父意图。宿主`attemptBasis`冻结本次实际读取的plan／intent身份、spec／manifest摘要和原sourceBinding，在原prepare／批准／派发边界复验；后来同票据的新attempt不反向加入旧集合。`PlanningMaterialProvenance`沿Scene、准备正文、cooperation和ContextReceipt传递，分页、初始前情、IPC和导出共用当前来源门。历史解释保留原来源合法性，与准备／可交互Scene要求当前修订分开；实际读前情和父采用子调查继续继承来源，不能靠下一轮回复洗掉A。永久遗忘按这些精确refs清派生正文、画面及证明，同时保留独立材料。旧无归因纯正文不能凭宽sourceIds逆推proof；新链不论有无Scene均记录，旧可辨认continuation缺proof保持不可读。

`pause/retire`可以只读已知对象的id/revision/status/type元数据，依据当前原话和CAS变更，preview／结果均 `contentAvailable:false`，不输出旧title/spec，也不要求local-agenda。它不替换来源、不恢复权限；resume则必须读回原规格和specBasis，来源不可用时不能借新控制原话洗白。控制原话只留下有限lastTransition地址/hash，不把每次“暂停／继续”追加成规格成立的依赖。

原文同源不相交片段遗忘不会销毁有精确依据的独立规格；永久遗忘按每attempt自己的精确refs处理，即使parent已经换成新来源，也会将旧manifest清为`{}`、置redacted，并清理旧关联中未执行动作的参数／补偿等私文，取消其后续使用。仍存在的opaque关系只保留未知证明。显式删除intent时，先找到并sanitize关联动作，再由owner的FK cascade清child表，避免唯一关联先消失而漏清旧提案。**只遗忘非执行意图**不等于删原话；默认保留独立已接受日历／真实回执的例外仅用于纯typed intent对象删除，不含source／原文span删除，且须符合原精确业务契约。普通fact／source erasure不获得此例外，明确删除业务／local-agenda也仍走自身删除边界。保留成功记录不授予旧提案重试权；已redacted动作不能经prepare精确重试或revise恢复参数，普通已取消动作清私文后仍保持cancelled语义。不能从旧快照或manifest恢复被忘正文。

## retained重算与方法默认值

采用投影逐项核：宿主manifest归属／版本／时区；真实action完整digest和CapabilityContractRef；真实派发身份；唯一confirmed_success/local_saved回执；实际recordId；当前日历revision／高水位／参数／planRef／accepted状态。工作组全部单位完整才给净工作信用。移动、删除、done、重复、部分保存、pending或证明不可读均保留具体缺口；已勾完成、时间过去或扫描无记录都不能推成完成或零成功。

多次重算从**原意图envelope**扣当前可核已安排净工作一次，合并实际工作组去重，不把上次“剩余”再当新总量。原依赖保留，已经完整排定的前置成为有reservedEnd的scheduled anchor，`completedTaskIds`保持空；无法映射到新规格的旧采用不自动获信用。

host-only retained context不在模型输入schema。已核未来工作是不可改锚点；已保存的休息／转场仅提供边界覆盖，不成为新中间地点。同一边界算法支持复用真实已有休息、补缺失入口／出口、仅修边界而不新增工作；无法容纳时明确 `planning_retained_boundary_unfit`，不省去占用生成表面可用方案。所有新完整占用守scheduleWindows及当前未来域，原日期不滚动；真实日界、跨日净工作和unknownEnd沿已有算法。

新规格 `version=1,interpretation=model_interpretation_with_method_defaults`保存解析后的静态任务／窗口／预算等。这个标签**不证明每个参数是用户明说，也没有实现逐字段用户确认标记**。默认rest10、reserve30或priority只保留为该次方法解释，不写人物偏好。后续新规格修订从新的真实票据导出并使用CAS；恢复不借当前planner默认值重新解释为用户长期选择。当前skill `schedule-planning`升至v3，说明上述实际工具分工。

动态busy、travel、energy、sourceCoverage事实及旧condition状态不原样存为当前真相；保留requiredRefresh元数据和必要条件描述。旧completedTaskIds转为需当前完成依据。`coverageMode=retained_local_interpretation`只说明约束来自仍合法的保留解释；不表示新查过全部现实、精力或外部承诺。unestablished、外源、动态条件／完成依据均要求刷新；当前外源版本resolver尚未接入，不能靠重开或保存给予“当前有效”。

## continuation Scene是同源派生投影

[规划投影](../../src/main/runtime/scene-projections.ts)只接收采用证明ready且覆盖满足的重算结果；`allocatedMinutes`和`scheduledMinutes`必须是真实、有限、非负数，null／NaN不能被转为零。`continuation`携带intentId、intentRevision与sourceBinding。前者表示已核仍保留的已安排净工作，后者是这次新试算净工作；Scene不把它们变成本人已完成或本次已接受。

[SceneService](../../src/main/runtime/scenes.ts)在get、选择和恢复前核当前active意图、同revision及完全相同的来源绑定；模型可见结果、历史消息IPC、[准备材料／Presentation](../../src/main/runtime/presentation.ts)和[Store.export](../../src/main/store.ts)采用同一来源与版本门。暂停或修订后，DB仍留的历史快照也不能通过这些入口恢复。永久forget另检查跨会话assistant消息中saved continuation Scene的自身来源和intent关系，物理清理其副本，不能仅依赖当时那轮的普通dependency edge。该合同与下述UI实现分层记录，真实模型和长期体验不由投影证明。

通用work中尚未展开的原话不因候选资格核查就计为provided；source-bound规格和实际展开片段则继续登记真实来源依赖。这样既不把“库里有”冒充“模型已读”，也不让派生Scene绕过原规格的来源门。

## 图像比较与现有时间带的续接

后端整合262/262、锁定Hermes9/9与build通过后，按原暖灰／克制金色与简洁陪伴方向生成A/B并逐张查看，文件身份、提示词及用途见[manifest](../../assets/design/generated/2026-10-18-planning-continuity/manifest.json)。选A的单一连续时间线与轻量“已在日历／这次续排”关系；B的横向时间分隔容易把交错的原日历和新方案归为两组，不采用。样例时间和任务均来自隔离合成宿主链，不是本人安排；改前来源截图只留本机，不分发，不进入runtime。

`LifeSceneViews.tsx`保留原日期条、日历背景、精确块选择和“尚未保存”，无新增批准按钮或第二进度账。负责人通过Chrome CUA及既有DevTools连接操作当前构建Electron，在1220×960、430×900实际指针切至23日、选择14:10–15:40，原输入草稿保留，reload／resume后仍在；此前晨光／夜色、End切日与“先留着这句话”的观察保留其当时范围。当前角色预览候选可编辑，拒绝后原稿保留，保存原稿后实际settings revision为1。每日预算文案已明确“这天新增工作的上限”，不把全部占用算作新增工作。

负责人另以公开来源的历史小时样本实际操作当前Electron：指针选03:00，可信End键聚焦12:00，完整Enter激活后精确选择引用与详情均为12:00。随后复现End与Enter之间缩窗时，ResizeObserver把旧选中03:00滚回而隐藏焦点12:00；共享`useChoiceVisibility`已改为优先显示strip内实际聚焦按钮，再回退当前选中。最新helper／文案后的构建、类型及这条缩窗操作已重查：430视口的12:00焦点完整可见，Enter更新同小时详情和引用；此前后端通过不被当作UI证据。历史样本不是当前实时预报，静态截图、窄视口和图稿不作为完整动效、手机系统或真实模型验收。

## 一手实现的借鉴与不采用部分

| 固定来源 | 实际读到的机制 | 本轮借鉴与局限 |
| --- | --- | --- |
| ProjectFlow `f374ec55ea3aa1d5f3c6ad64f2c3a98e8d966038`：[AgentProposal](https://github.com/wubq511/ProjectFlow/blob/f374ec55ea3aa1d5f3c6ad64f2c3a98e8d966038/backend/app/models/agent_proposal.py)、[service](https://github.com/wubq511/ProjectFlow/blob/f374ec55ea3aa1d5f3c6ad64f2c3a98e8d966038/backend/app/services/agent_proposal_service.py) | 持久proposal、拒绝理由、确认产生真实业务created_ids；业务commit后才尝试记忆提取 | 借鉴提议／真实状态／可选记忆分开；其JSON payload不代替本项目精确来源和票据边界，也不额外要求已授权用户重复批准 |
| Smart Agentic Calendar `6088e957e17eda94fd362f8e420510827b5ed858`：[replan coordinator](https://github.com/fbdo/smart-agentic-calendar/blob/6088e957e17eda94fd362f8e420510827b5ed858/src/engine/replan-coordinator.ts) | 单处dirty/replanning合并重算，替换schedule后另更新task status；scheduled与completed分开 | 借鉴集中重算与分开完成语义；不采用全量自动替换已接受安排。“保留旧安排”的catch注释不证明后续任务更新失败也原子回滚 |
| LangGraph `98043c37abc60374030f960a03a6e0d4c0112643`：[SQLite saver](https://github.com/langchain-ai/langgraph/blob/98043c37abc60374030f960a03a6e0d4c0112643/libs/checkpoint-sqlite/langgraph/checkpoint/sqlite/__init__.py) | thread/namespace/checkpoint与pending writes持久化 | 是全量执行检查点的可行候选；当前仅需业务规格和精确采用关联，没有引入LangGraph、替换Hermes或恢复旧运行权限 |

以上固定源码用于取舍，没有把其宣传、测试数量或性能写成本产品保证；也没有改动Hermes锁或模型生产配置。

## 已观察结果和仍未覆盖的部分

以下区分独立根代理观察与作者观察；合成资料通过正常Store／runtime／broker／action接口，不是本人校园账号或真实模型效果。没有新增测试、fixture、runner、stub或手写成功回执。

| 证据范围 | 实际结果 | 结论限度 |
| --- | --- | --- |
| 根代理前段独立核查（schema10当时快照） | keep后日历0、attempt0；真实local_saved30，规格revision仍1；重开新plan只需review30＋rest10 | 证明当时host垂直链；旧attempt升级11后不再冒称有来源证明，fresh schema11另见下行 |
| 根代理精确遗忘核查 | 同源disjoint尾遗忘后intent仍active；遗忘intent后原规格原话仍在，accepted agenda＋receipt保留，attempts清空 | 区分源片段、业务意图、独立已接受安排和成功事实的删除边界 |
| 根代理与service作者fresh schema11来源链 | A下prepare但未执行，B更新为active revision2；只有B范围时旧A正文不可读、DB仍保留；永久forgetA后旧manifest为`{}`／redacted，旧action为cancelled／args`{}`／audience redacted，B仍可读；adoption为needs_review且allocatedMinutes为null；导出没有旧body/actions | 证明旧attempt不借parent新版来源，权限收窄与永久遗忘分开；未知采用没有伪装成零，未声称真实模型或账号验证 |
| 根代理当前schema11完整业务链 | 真实save30→重开只剩30＋rest10；forgetintent后accepted calendar仍1、原source仍在；待采用rest被清理且revise拒；实际取消已接受安排后calendar为0 | 证明纯intent遗忘、未执行提案清理与独立已接受业务取消的区别；不是仅检查按钮存在 |
| 根代理continuation Scene | fresh Scene暂停后raw保存副本仍1，但历史IPC／export为0；forgetintent后raw Scene副本已清、accepted calendar仍1 | 证明当前来源／状态门和永久副本清理；界面操作另见上节 |
| 根代理普通来源遗忘 | actual forget原source后calendar为0、preserved例外undefined、Scene无 | 证明普通fact／source erasure未借用pure intent例外保留业务或派生画面 |
| planner作者较早正常采用链（旧schema当时快照） | 真实保存工作30→重开补rest10＋review30；保存rest后再开仅review；第三次采用后累计allocated60一次、无新单位 | 证明当时跨attempt不重复扣量、已有休息复用；不是本人完成60分钟工作，升级后不保留无来源信用 |
| planner作者较早边界修复（旧schema当时快照） | 独立入口5＋工作30已存，出口未存；重开只有出口5且真实采用成功，再开无新单位 | 覆盖当时support-only修复，未把零新工作误判为不能采用；fresh11另有来源与边界观察 |
| planner作者fresh schema11秒级边界 | 实际入口09:00:30–09:05:30已存；09:00:10重开，新horizon09:01但工作仍09:05:30，仅提缺失出口；09:00:31真实directLocal采用被planning_retained_started拒，原entry及唯一attempt/link保留，无迟到动作残留 | 区分新写入分钟对齐与未来已保存边界原几何；边界开始后重新核验，未由时间经过推定完成 |
| service／模型接线作者正常输出 | keep精确重试、CAS、prepare失败回滚、revision去planRef被拒；child静态读但adoption not_checked、child replan拒；无旧来源可metadata retire且不输出旧title/spec | 证明宿主scope／事务／公开协议；没有运行真实delegation模型 |
| 作者外源协议 | 正常ingest的**合成external source_record**；缺精确ref拒 `planning_intent_unbound_source`，补ref后仍 `required_refresh`；去掉campus范围不返派生标题 | 不是真校园账号、真实服务或已接外源resolver；单一sourceCoverage声明不能自证 |
| 既有局部检查 | 作者重编后原planning/application/ICS相关检查48/48，类型与限定diff检查通过；曾发现普通未绑定票据hook阶段回归并修复 | 只证明该次局部范围，不能独自为模型语言质量或最终整合背书 |
| 根代理本轮整合快照 | 首次全量258/262的4个兼容失败已修；重跑既有检查262/262（100.8秒）、锁定Hermes9/9和build通过，随后才生成A/B并进入UI | 日志为本机`root-integrated-tests-final.log`／`root-final-build.log`等；这是最终审查修正之前的通过快照，不能替之后变更背书 |
| 根代理重开后的审查修正观察 | 原chat-a可读chat-b更新后的revision2／45分钟规格；read adoption为ready/not_adopted/allocated0，replan为scheduled45／appliedfalse；真实savedthenundo反例仍needs_review，calendar0 | 负责人以正常API重开作者合成SQLite亲查；历史成员关系保留，不使current_conversation扩大范围；明确未派发且未保存才可不计采用，不扩大成所有取消／缺记录皆为零 |
| 根代理当前派发前取消复核 | 当前编译Store重开`audit-cancel-cYe04a`：动作保持`cancelled/cancelled_before_dispatch`，adoption为`ready/not_adopted/allocated0`，重算新增45分钟、agenda0 | 负责人正常API独立观察；核对beforeDispatch前后取消竞争的持久状态复验与catch保留marker，只对明确未派发、未保存成立，不把未知或已undo当成零采用 |
| 成员关系作者正常API | scalar-only旧记录经update／resume保留原会话；33个已有成员经更新、恢复和重开后为36，未截成32 | 合并原scalar／数组／当前会话，超160,000字节明确拒绝；不因此扩大current_conversation读取范围 |
| 根代理成员关系独立复核 | 重编当前Store并重开`audit-membership-d83COV`，以`membership-prior-0`成功读取revision10、36个成员的意图 | 证明较早原成员在当前实现及重开后仍可发现，不将作者输出当独立验收 |
| 根代理成员关系修正后的历史快照 | 现有检查262/262（105.240秒），`npm run build`中的`tsc --noEmit`及桌面／公共review构建通过 | 本机`root-current-tests.log`／`root-current-build.log`；随后先修共享DOM可见性helper／预算文案，再补下列精确证明边界。这个通过快照不代替后续修正的检查 |
| 根代理重算后、批准后撤原证明 | 正常B update revision2→实际replan使用旧A proof→prepare／approve→A restrictSource，epoch仍1；execute拒`planning_intent_adoption_changed`，真实agenda0／dispatch0；当前Store重开正常三单位样本仍ready／allocated45 | 本机`root-attempt-gate-byP9Gi`及保存的真实replan输出；不是实际模型判断，也不把已批准当已执行 |
| Scene与准备的真实来源门 | 真实replan输出的Scene在B仍合法、宽sourceId仍获准时拒A旧proof，available0／attached get拒；真实broker输出→无Scene正文准备在A撤回后，inspect、初始索引、Presentation和Store.export仅保留独立日历材料 | Scene与prepared分别正常API核查；作者观察不冒充负责人全部亲验，永久forget另观察旧正文／cooperation清理、B及独立材料保留 |
| 根代理两代前情、导出及永久遗忘 | 实际broker planning.replan→receipt证明→合成消息保存→重开读前情，新receipt继承A地址；第二代保存后撤A，模型history仅保留合法B原话，IPC和实际Store.export不返两代派生正文；MemoryService.forget A后DB原正文与receipt清，独立日历回复仍在 | 本机`root-history-proof-NKqbJs`，正常Store／runtime／broker／context入口；演示正文显式合成，不是实际Luna、本人数据或模型语义验收 |
| 最终证明链整合 | 现有262/262（98.104秒）、锁定Hermes9/9（69.897秒）及build／类型／公共review构建通过 | 本机`accepted-final-tests.log`／`accepted-final-hermes.log`／`accepted-final-build.log`；无新增测试源码，Hermes使用合成模型回调，不代表真实模型语义或账户质量 |

本机诊断证据索引：`work/personal-memory-round3/implementation-decision.md`为本轮选定契约；`planning-ledger.md`末Implementation observations及Targeted second-boundary review记录覆盖枚举、三attempt、support-only和fresh schema11秒级实际路径；`intent-commit-contract.md`末运行时接线说明prepare事务选择如何替代早期commit-link候选；`work-intent-owner.md`末记录service协议；`intent-current-observations.json`的finalProtocol为schema11修订前当前覆盖枚举下的真实输出摘要，早期prefetch及旧schema记录不可冒充最终11结果；`intent-model-workflow.md`与`intent-product-choices.md`保留未实施前的方案比较。这些work资料是本机诊断，不是应用依赖或公开部署输入；本文已独立保留必要结论。

本轮已按后端→GPT Image→UI推进到实际界面观察，最终取消／成员修正的正常入口及后端整合检查已有上述证据。最后共享可见性helper／文案后的类型与构建通过；负责人实际重查End后、Enter前由1220缩窄到430，12:00焦点完整可见，Enter更新同小时详情与引用。另展开既有带预算画面，完整占用1小时55分与新增净工作上限1小时30分分别呈现。截图仅本机`current-environment-focus-narrow.png`与`current-budget-copy.png`留存，不进入runtime或公共部署。外部当前资源刷新、真实模型自然工具发现／保留判断、本人账号和移动生命周期仍未由本单元验证。原v0.3.0发布事实保留，持续目标不因本阶段归档自动结束。

## 下一轮候选比较：研究，尚未实施

本轮续读完整记忆／最新桌面Harness／前端讨论、原始goal与持续补充，三份桌面文件SHA-256与归档逐一相同；旧讨论中的测试开发要求、历史完成回执和已取消Luna门禁不成为当前指令。结合全仓模块导航及当前调用链，继续比较以下四条通用机制，没有新增场景关键词分支，也未将研究写成产品能力。

| 候选 | 用户需要与当前接缝 | 新读固定一手实现及取舍 |
| --- | --- | --- |
| 同一机会的持久调查前沿，建议优先 | 记忆原文第579–599行要求恢复工作位置，第2684–2701行要求真实子调查与父消费。当前`EvidenceBrowser`的Map／30分钟cursor和`BackgroundDelegation`的workers／消费元数据仅在本次进程；`settleReview`只保存退避，`beginOpportunity`重新建本次预算。此前正常API的重开丢位置观察见[第二轮研究](PERSONAL_MEMORY_ROUND2_2026-10-18.md#同一机会的持久调查前沿)，本轮重核源码，没有冒称重跑。 | Agent Artificium `6c391f33a6b3cb94da27cc6d151192ad2aabfecb`的[InfiniteAttention／next_chunk](https://github.com/officialgr/agent-artificium/blob/6c391f33a6b3cb94da27cc6d151192ad2aabfecb/artificium-code/artificium/memory.py#L564)与[checkpoint](https://github.com/officialgr/agent-artificium/blob/6c391f33a6b3cb94da27cc6d151192ad2aabfecb/artificium-code/artificium/memory.py#L669)把待ACK重交、chunk版本确认、继续／暂停／提前结束分开。借鉴交付与ACK边界；不复制其全文chunk、自由carry、多文件独立写入或自有life_loop，字节长度快照也不能代替来源版本。 |
| 学习过程与提示边界 | 记忆原文第1478–1517行要求具体表现、辅助程度及已公开内容；当前study-companion方法已有这些原则，但learning仍是通用Work种类，frame未保存题目版本／本人尝试／已提供帮助的持续关系。 | OATutor `a1df9d67bc7b90157bcbbaf38ac3f04b42e139f0`的[ProblemCard提交](https://github.com/CAHLR/OATutor/blob/a1df9d67bc7b90157bcbbaf38ac3f04b42e139f0/src/components/problem-layout/ProblemCard.js#L314)、[提示记录](https://github.com/CAHLR/OATutor/blob/a1df9d67bc7b90157bcbbaf38ac3f04b42e139f0/src/components/problem-layout/ProblemCard.js#L434)与提示内作答按problem／step／seed关联。取具体表现与帮助关系，不搬提示扣分、掌握概率或打开即已读的假设；需要独立核验来源、提供／已读及后来澄清，实施成本高于前沿。 |
| 可撤销的本地语义候选 | 原文第430及481行要求跨措辞体验和漏提取原文仍可找到；当前多查询RRF仍由lexical候选组成，browse可兜底但长历史成本较高。 | QMD `86d2365d17fc682e491c2c53d1e4a884aee8682a`的[fingerprint](https://github.com/tobi/qmd/blob/86d2365d17fc682e491c2c53d1e4a884aee8682a/src/store.ts#L175)、[向量读取](https://github.com/tobi/qmd/blob/86d2365d17fc682e491c2c53d1e4a884aee8682a/src/store.ts#L4976)与[structuredSearch](https://github.com/tobi/qmd/blob/86d2365d17fc682e491c2c53d1e4a884aee8682a/src/store.ts#L6682)提供模型代际及由主模型展开的lex／vec融合。取可重建索引；其集合／文档过滤不替代实际编码字符范围的当前资格。CPU模型、分发、包体、删除和延迟仍需独立实测，本轮未安装或下载。 |
| 回看理解如何变化 | 记忆原文第155、1328行区分某时现实与当时认知。当前`search_context.at`只筛当前断言的valid time；版本表未记录可靠宿主提交时刻，SUPPORT／例外／失效可沿用旧recordedFrom，不能把这些字段直接当历史认知时钟。 | 实际读取Graphiti `7b0182f94d27075db488636cd5456981ee10b987`的[EntityEdge](https://github.com/getzep/graphiti/blob/7b0182f94d27075db488636cd5456981ee10b987/graphiti_core/edges.py#L242)，其created／expired与valid／invalid字段分开，但未来计划语义与本项目不同；[XTDB时态查询](https://docs.xtdb.com/reference/main/sql/queries.html#temporal-filter)分离valid／system time。推荐以后在同一SQLite写入口保存修订提交元数据并按需投影历史，旧时刻未知不猜填；历史仍受当前删除／权限门，不引入图数据库或每周事实摘要。当前未实施。 |

前三条实现的HEAD由2026-10-18实际`git ls-remote`固定，再读取对应源码；也读了Deep Agents `4bf50225d9f2bd777c1b2aa722e76273eb772ab0`的[subagents.py](https://github.com/langchain-ai/deepagents/blob/4bf50225d9f2bd777c1b2aa722e76273eb772ab0/libs/deepagents/deepagents/middleware/subagents.py)：最终结果交回父ToolMessage不等于持久枚举前沿，不为此另引擎或恢复全会话。末段负责人还实际读取LangGraph固定SQLite saver、Artificium原码和Graphiti上述固定版本；XTDB链接为当日访问的文档。上游源码未被安装、运行或作为本产品效果证明。

前沿的有界建议仍归原help_opportunity，可由外键归原Work的宿主child ledger存已提交位置／未ACK批次，避免每读都改机会revision，也避免只在settleReview写入而丢硬退出进度。每次恢复须重新核托付、来源、版本、限制和权限，以新scope／cursor／toolCallId实际回读，父消费后同commit ID事务ACK；只存地址与覆盖，不复制正文、子报告或旧批准。持久计账与单轮预算、托付整体上限分别设计，不因重开恢复擅自新增终身停止门槛。暂停保留定位，停止／拒绝／到期不复活备用机会；这些均待下一轮选定与实施，当前候选列表不是创新范围的上限。
