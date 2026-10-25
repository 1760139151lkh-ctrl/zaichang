# 第二轮研究：完整证据、可恢复进展与执行契约

研究起点：`01afdc42d8c431e736554727fbadc1d94935b18b`（第一轮个人记忆续作，draft PR #4），2026-10-18。本文记录第二批八方向并行研究、选择、实现及证据边界；当前源码和整合观察由[CURRENT_STATUS](../CURRENT_STATUS.md#personal-memory-round2)维护。第一轮状态、单元作者记录和设计图均不能升级为当前整合证据。

[完整原始请求](../source-materials/2026-10-18/goal-objective-20261018.md)、[持续改进补充原话](../source-materials/2026-10-18/ongoing-improvement-20261018.md)、[记忆讨论](../source-materials/2026-10-18/memory-discussion.txt)及[128场景/12时间线](../source-materials/2026-10-18/harness-pack/scenarios/timelines-guide.md)继续作为需求与研究输入。阶段交付后继续重读、比较和实施有收益的非平凡改进，不逐场景加if/else；历史文本不直接成为运行时prompt、本人画像或行动授权。

## 第二批当时的取舍与实施状态

| 研究方向                   | 当前观察与判断                                                                                                 | 本轮状态                                                                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 提取覆盖、跨回合条件与幂等 | 基线主/支持来源未完整进入同一引用集，跨span身份依赖处理窗口，长前情与合法新澄清没有可靠恢复闭环。              | 已实施精确多源citations、来源坐标归一、修订级review receipt、跨span候选身份，以及48,000字节上下文／地址请求／needs_context恢复；负责人已直接核对原触发、重启、遗忘／纠正和无关内容保留。语义完整性仍依赖模型判断，不声称自然语言形式证明。 |
| 整体日程允许窗口           | 基线两天下午任务窗生效时，仍把跨夜当free、把休息排在下午窗前；净工作合格不证明完整新增占用合格。               | scheduleWindows后端已落代码，作者直接核对原触发、空域、完整占用、留白、恢复、非法采用拒绝及DST；单元检查已有记录。此行保留第二批作者阶段，后续负责人整合与UI证据见状态文档；当时尚未实施的持久规划意图已在第三批继续。                     |
| 工具/动作契约              | 基线已批准动作未绑定准备时的能力契约声明；同名能力重新登记后的语义漂移不能靠参数仍合法证明安全。               | CapabilityContractRef已接broker/runtime/shared，新动作绑定宿主引用并在批准/派发/恢复边界复验；作者有合成本机API观察，本文核对源码但未独立重跑该方向。当前最终整合检查未收口；资源观察/当前复核协议与外源规划resolver未实现。               |
| 语义索引                   | 无字面依赖的原文browse已存在；本地原文chunk向量可成为额外候选路径，不能替代条件闭合/原文。                     | 已形成具体本地CPU/runtime与固定模型比较提案，仍待负责人选择；未安装依赖、下载权重、运行embedding或部署新服务。                                                                                                                             |
| 持久调查断点               | 直接正常API观察到同一机会预算暂缓后仍会重评，但旧枚举进度重开丢失；旧opaque cursor确实过期，重新浏览从头开始。 | 候选：同help_opportunity拥有、同h_work内的只含定位/覆盖frontier；本轮尚未实施，不恢复旧模型会话或另开后台主循环。                                                                                                                          |
| 明确交流约定的发现         | 角色和五轴已接，但近期窗口外的明确条件交流约定没有按用途展开的入口；源码缺口不等于已测出的漏用率。             | 候选：复用Assertion、scan及原核验/CAS/撤回链；不额外固定口头禅、情绪路由器或自动改角色。                                                                                                                                                   |
| 学习过程与提示依赖         | 未发现确定性“成绩/答对→独立掌握”映射；正确原则已有，但没有题目版本、实际尝试与已提供提示的持续关系。           | 候选：同collaboration frame学习检查点。没有新增掌握分数、知识点分类表、强制练习或第二记忆库。                                                                                                                                              |
| 手机/平板生命周期          | 桌面React/地图可复用，Node SQLite/Python Hermes/系统通知/凭据与移动原生生命周期不能靠WebView壳替代。           | 研究候选，未安装SDK、创建Android工程、部署服务或验证真机；有限携带与系统调度契约可另行选定。                                                                                                                                               |

后续只有对应作者的源码、实际调用与独立整合证据成立，才把该行改为已实现/已核查；“研究完成”“分配实施”和“产品可用”是不同状态。

## 本轮已实施的记忆闭环

`h_assertion_citations`按每个理解修订保存精确event/version/Unicode范围和primary/support/authorization；主源可与多个同源或跨源片段共同支持。review只获得声明支持集的原文，发现用的前情／锚点仅作定位；完整正文只发现遗漏、矛盾或断章取义，不能暗中补足未引用条件。旧单源接口缺扩展字段保持兼容，任何明确否定都拒绝；新支持字段一旦出现须完整且精确覆盖声明集。currentOwner的事实片段与明确保存许可分别保留，不能借此开启整条混合作者消息的推断。

同一语义候选的提取身份不再含span起点，而绑定实际引用位置、支持集、操作与目标；模型重排不改变身份。同源不同位置保持不同。`storage/source-lineage.ts`归一可证明的同文整源副本及精确摘录，多层组合只返回坐标和元数据；未知映射与循环不能充作独立证据或完整定位。永久删除和生效语义停止共用这些坐标，新推断窗口、提取目录及恢复请求清理复用`availableInferenceRanges`。

遗忘先在未改写正文时展开原始位置及既有副本／后代，再签持久屏障。负责人实际观察从copy学到的“画画”遗忘后，原文和copy同为[0,8)遮蔽，多层[14,20)“安静”原话与独立事实仍active；重开后保持一致，旧未遮蔽重放被拒，已遮蔽副本只保留合法余量，新独立self-root陈述仍可用。递归启动审计覆盖早期版本留下的深层未知重放；后者为独立源码审查发现并修复的恢复入口，未伪称创建新旧版数据库测过它。

纠正／收窄／停止同样沿真实引用坐标限制原文，不能换predicate或副本绕开。`h_citation_restriction_receipts`只由宿主同事务为新理解修订签发精确限制元数据，解决“新纠正引用了含旧话的宽片段，却与旧兄弟一起被停用”的矛盾；旧理解无回填，普通save不重签，未来限制未提前确认，授权／隐私停止不被豁免。负责人实际wide-copy纠正后，新结论active、原文旧兄弟inactive、重命名旧原话source_suppressed，重开一致；未来限制和授权投影失效的同批级联也另行直接核对。

`memory/context-windows.ts`替换固定excerpt补丁：按实际序列化48,000 UTF-8字节预算提供精确窗口，保留合法／已提供范围与gap，后到澄清明确标later。contextRequests每项按版本／权限／范围／预算给结果，`h_memory_context`只存地址、签名、尝试范围和原scope绑定；重开不恢复更宽来源。真正新合法上下文、请求覆盖或方法变化进入原有队列，同代不空转；异步ACK不能吞未见澄清。负责人及作者用正常API直接看过长原文尾部否定、任意请求展开、重开、局部遗忘后disjoint请求保留、原范围收缩与新代唤醒，没有用新模型stub代替真实语义效果。

后端阶段负责人现有262项、真实锁定Hermes9项和构建通过，均没有新增检查代码；Hermes模型回调为合成，没有调用DeepSeek或Luna。随后已生成并比较[安排窗A/B](../../%E5%89%8D%E7%AB%AF%E8%A7%86%E8%A7%89%E5%88%9B%E6%96%B0%E8%AE%BE%E8%AE%A1/%E6%9D%A5%E6%BA%90%E8%AE%B0%E5%BD%95/assets-design-generated/2026-10-18-chosen-windows/manifest.json)，再实现前端。最终界面观察、后续必要检查和当前保存点以状态文档为准；向量、持久调查前沿、学习检查点、交流约定发现和手机原生生命周期仍未因这批机制而自动完成。第二批当时保留的持久规划意图已在[第三批](PERSISTENT_PLANNING_INTENT_2026-10-18.md)实施，其新证据不反向替代本批记录。

## 已直接观察的提取断点及通用修复方向

原始讨论要求“可以，但周末不行”保留前文的对象、条件和时间，不能只把当前短句存为人物事实。当前提取上下文能提供priorEvents，提交却主要绑定当前event；已有target的review又只给一条来源。这使“语义曾看见前提”与“宿主能够追踪前提退出”之间脱节。

本方向通过既有Fixture/MemoryService正常API直接写入合成前提与省略答复，再遗忘前提。观察到答复断言仍active、检索仍返回其中来自已删前提的条件，实际evidenceIds仅含答复。这个结果证明引用协议缺口，未调用模型，不能推定真实模型一定提出同一候选。若靠一律拒绝省略答复避免它，合法跨回合记忆能力仍未落实。

另一直接调用把位于1800字符窗口边界的同一引文放入两个实际excerpt；当前幂等键含span.start，两个键写成两条active断言，引用范围相同。通用身份应绑定实际来源版本、精确主/支持片段、操作与目标，而不是哪个窗口碰巧看到它；也不能以去掉span标识为由模糊合并全库相似文本。

已授权的方向是：候选声明真正使用的多段支持引用，宿主逐字、逐来源核scope/保留/版本/范围，独立review看完整支持集；当前revision与历史revision的引用都保留精确位置，再由统一事务提交断言、引用、幂等回执后ACK。一个来源可有多个不相邻片段，不能以bounding range代替而误删中间独立内容。原文、断言、索引仍各有原所有者，不迁移成新的图谱真相。

上下文恢复另分单元：实际观察到有界前情漏掉长消息末尾条件，needs_context保留诚实gap但合法新澄清未自动唤醒；手动retry又会遇到相同excerpt。应提供真实范围/总长/事件顺序和可展开地址，让前提在原范围内取得；后续澄清需标明later身份。按来源/上下文/方法版本变化触发有界重试，不能无限刷同一次不完整输入，也不能固定再塞一段尾部当完整性证明。

独立源码复审另提出必须随引用表一起处理的接缝：历史revision要按自身引用核当前scope，不能先凭当前revision可读再裸读旧payload；多个不相邻range的兼容NULL不能触发整源删除；SUPPORT不能因共同roots而丢同源第二个独立片段；当前本人投影的事实片段与保存许可片段各自有来源责任。历史world读取方法在基线没有找到生产调用，因此不将该服务接缝写成已确认可见入口故障；修复及独立证据仍待当前整合。

## 整体安排域与日程意图分开

直接现有planner API观察到：两天任务allowedWindows均为14–17，每天净工作90分钟时，旧freeMinutes仍为510/920，第二天休息在13:50–14:00。任务窗、连续核查horizon和本人本次允许的整体安排域不是一回事；仅调整画面或改一句“尚未安排”不能修复这个关系。

已实现的`scheduleWindows`位于`src/main/actions/planning-draft.ts`，复用原构造器；`planning-application.ts`从计算器的有效保护范围生成采用单位。输入最多64个带offset的起止窗口，重叠/相接合并并与horizon取交集。省略保留`horizon_only`的旧试算行为，但不证明本人现实可安排；显式空数组就是空域，不退回全天。完整任务reservation、共享转场/休息和有效保护采用都须落在连通窗口内；任务自己的allowedWindows继续是更细的任务/资源约束。域外间隙不伪造为忙碌、睡眠或保护事件，也不参与本次留白。这是计算器收到的本次范围，不自动成为用户已确认的承诺或执行授权。

宿主输出`scheduleCoverage{mode,windows,meaning}`及每日`eligibleWindows/eligibleMinutes/outsideScopeMinutes`。date/from/to仍是自然日与查询horizon的交集，initialFree/free/occupied都在本次域内统计，`occupiedMinutes + freeMinutes = eligibleMinutes`；净工作预算仍只计本次新增工作。没有整体窗口的旧调用保留原数字；空域日为eligible0，不生成全天free。恢复seed保留原窗口并在重算时取当前horizon交集，不扩大范围；保护请求有未纳入部分时明确条件并保持采用blocked，planRef/精确参数/提交复核保持原边界。Scene须投影同一宿主范围与数字；旧Scene没有字段时保留兼容路径，不能反向补造新日账。负责人正在接线和整合，本文不将源码存在等同于最终界面通过。

日程作者已亲自通过现有生产函数/服务的短API调用核对：原触发free510/920变为90/80，第二天休息为14:00–14:10；空域的work/free/protected/采用单位全空；两个分离窗口内净工作60连同准备、交通和休息共占105分钟、留白15；全窗口reserve45只新排75并保留余15；没有eligible窗口的一天要求reserve30时如实shortfall30，条件不归咎已有承诺。恢复保留两窗且已存30后每日额度60降至30，改采用参数到10:15间隙被原守卫拒绝；LA回拨日仅明确的重复时刻窗口60计eligible，其余1440分钟为outsideScope。该单元完成时类型检查、既有日程/ICS29项及当时工作树的完整npm test262/262（124.1秒）通过，没有新增测试或模型调用。负责人当前另跑的最终整合检查、随后GPT Image/UI和真实模型对字段的使用都未由这些记录证明，不写为已通过。

第二批当时尚未实施持久规划意图，以下保留其候选思考；当前实现与最终取舍见[第三批研究](PERSISTENT_PLANNING_INTENT_2026-10-18.md)。原任务规格、范围、原因与稳定frame/option可归已有WorkService/h_work，使用现有CAS与精确来源读取，实际占用仍归日历，授权仍是当前短期票据。intentId不等于一次planner planId；跨重启回读候选应给当前观察与replanSeed，不能重放旧nextProposal。若需精确剩余量，非执行性manifest必须按实际保存回执/对象/净工作范围核对修改、删除、done和重复，不能数planRef行就扣工作，也不能把未来安排当已经完成。该批planning.recover按当时契约在重启后只报告真实日历行，尚不具备持久意图恢复能力。

## 动作契约与事实版本分层

原broker的scope、参数、输出、缓存、在途entry核验，以及动作的批准、digest、幂等、回执、事务前核验继续保留，本轮没有重写动作引擎。基线prepare与execute之间存在契约漂移缺口：同名能力可以保持参数形状，却改变provider/source/effect/egress等含义；版本字符串或当前可调用不证明仍是原来批准的契约。本轮已针对这条声明绑定链实施，不能再把它写成只有研究方案。

`capabilities/broker.ts`现由宿主生成冻结的CapabilityContractRef，摘要绑定provider与能力身份/版本、来源、输入输出JSON Schema、效果/出站、权限、主体/世界、预算和inspect/cancel/idempotency等声明。注册保存元数据数组/definition快照并捕获原handler引用；`actions/runtime.ts`的新prepare自行取得契约引用并纳入动作digest，approve/preflight及broker实际派发/恢复键边界比较当前契约。`shared/harness.ts`中的引用optional仅为历史记录可读取，旧动作缺引用或契约不同时不能自动补成当前授权。快照不意味着执行函数、闭包或动态连接状态已经被证明不变。

本文已对照上述当前源码确认引用生成、注册快照、assertContract、动作digest与恢复边界接线。该方向作者另有合成正常API观察：同名provider改版后execute及旧inspect/cancel key被`capability_contract_changed`阻断；历史未绑定动作不能新批准/执行，同契约重开后可继续执行；修改调用方原元数据数组不改变宿主声明；既有成功回执和本地undo保留，已撤销状态不能经revise退回待批准。这些调用不是本次文档核对者独立重跑的结果，也不是实际远端服务验收。作者的局部check/npm test记录不能升级为负责人当前树的最终整合通过。指纹只覆盖可序列化声明，custom refinement/transform与handler实现语义改变仍须提升版本，不能宣称函数内容已被哈希。

已派发或结果未知的动作继续保持原回执与未知后果，不能因契约变动说成“没执行、可以重发”。核查/取消须由能识别原执行契约的通道支持；原通道不可用就保留准确缺口，不把旧幂等键交给新provider猜结果。

真实外源规划resolver仍未接：当前`RuntimeCoordinator`构造PlanningApplicationService只传clock，没有接入`currentSourceVersion`解析器；统一资源观察引用与当前复核回执也未实施。能力契约回答“如何调用”；资源观察回答“计划依赖哪一地点/时间窗/资源表示”；当前复核回执回答“这份表示仍可被何种当前语义支持”。三者不能用一个sourceId粗粒度数字、provider版本或本次时钟代替，也不能把资源`fresh`或同版快照可读解释成当前仍适用。缺少真实复验的外部规划依赖继续blocked；不在SQLite提交事务里偷偷联网，也不为让状态变ready而虚构当前数据版本。

## 保留为候选的生活连续性机制

### 可重建的本地语义索引

候选只给原文chunk增加可重建索引，继续沿同一SQLite事实所有者、search_context、RRF、完整bundle和browse兜底。方案比较后建议先在独立CPU worker中核对Transformers.js 4.3.1/ONNX Runtime Node，固定multilingual-e5-small q8为纵向基线，再按同一契约比较EmbeddingGemma 2文本encoder q4/MRL；Python独立ORT/tokenizers依赖是另一条真实路径，不能污染冻结Hermes环境。

当前只核了源码和模型文件元数据，没有安装、下载或实测本机延迟/RSS/召回。Ollama命令存在但标准loopback服务连接拒绝，不据此断言整机无模型或换扫其他端口；云embedding也不会因聊天模型账号已连接就自动获准。

语义资格要在距离计算前覆盖当前owner/主体/世界/来源/用途/受众与**实际被编码的全部字符范围**，不能全库top-k后再过滤。向量基于整块隐藏文字时，仅把预览投影成获准片段仍会泄露/借用隐藏相关性。首版只编码同源精确chunk，授权不含整块时跳过该持久向量，原文/browse继续可用。

generation绑定模型全部文件/运行时/tokenizer/prefix/pooling/切块/维度/归一化；同维度不代表可混算。局部遗忘可能保留contentVersion，必须核内容digest并清理旧向量/待提交结果，剩余原文可重建。模型卡分数、包大小与API200都不证明实际语义效果；余弦不是事实置信度，固定阈值不能替代证据适用性。

### 同一机会的持久调查前沿

正常Store/Attention/Coordinator API直接观察到：browse一页并展开后遇到真正tool_budget，原机会按settleReview进入等待并在退避后重新被pending选中；Store重开后旧cursor不可用、新pack无枚举位置，重新浏览再次从同一较早原文开始。收窄收到时间排除托付原话后也观察到相同结果。两轮modelCalls均为0；这说明读进度丢失，不是托付丢失，也不是模型会话终止。

候选在同一h_work中由原help_opportunity拥有一个内部frontier，父机会仍独占调度、期限、停止和下一唤醒。只存有界locators、未决方向、枚举/跨度覆盖及host-only位置，不复制工具正文、自由子代理摘要、旧scope或批准。每次读成功先保存未ACK批次，父语义处理后才按同一commit ID事务推进ACK；硬预算/退出最多重核未ACK批次，不能跳过尾项或假装整个调查完成。

恢复沿原beginOpportunity，先核当前托付/机会、scope、来源、内容/限制与版本，再重发新opaque cursor；旧locator只表示曾读过，正文采用还须当前真实读取与新toolCallId。内部position必须排除generic work输出或走统一安全投影，不能靠不告诉模型ID保护。子产出、父消费与父ACK分别保留；pause保留定位，stop/decline/到期不恢复备用机会，外部动作unknown仍走原动作核查。

### 明确交流约定

现有persona、五轴、完整当前原话和记忆核验已经区分当前参与、长期偏好、角色核心和私人资料。新增更多角色故事或每轮情绪分类不能补上“已经明确约定过，却无法按用途找到”的接线。

候选是同一Assertion中的明确交流约定类别，仍由语义提案与独立核验产生；临时口吻、推断建议、沉默不进入。复用scan公开精确predicate/kind过滤，在许可来源/有效性过滤后分页，完整bundle展开条件；初始只给可发现信息，不常驻私人正文。旧guidance/普通偏好不批量迁类。当前要求与适用条件优先细化表达，但不改变事实、任务完整性、动作权限或PersonaCore。

### 学习检查点

原始B1/D5、能力记忆段、S003/S023/S065/S069及TL04明确要求保留具体步骤、辅助程度、可比前后表现与未开放结论。当前study-companion已正确提醒这些区别，learning却仍只是WorkRecord允许种类；frame没有题目/尝试/提示关系，decision experience又必须绑定生活选项，不能把数学步骤伪装成option来复用。

候选复用原frame、原文/材料和助手历史，保存problemRef、learnerAttemptRef、同次帮助定位、可修订判断依据和原nextStep。助手done历史只证明曾提供过内容，不证明用户读过；外部帮助未知不自动变成独立。一次正确只支持具体任务结果，助手求出答案不归为学习者过程；后来澄清用过答案应退出相关旧判断，题目/标准答案改变也重评，不能直接升“已掌握”。已有教学不永久污染新的真实尝试，网络重试也不算新证据。

当前用户想直接知道答案时仍可直接答，不强制自证或复习。学习检查点不自动改日程、建通知/目标或读取旧私事；这部分尚未实施，具体schema/来源读取/预算/恢复接口需先分配和核查。

### 手机/平板的独立切片

当前没有Android工程或已验证的手机Hermes链。本轮只读探查在PATH和常见SDK位置未发现相应工具，不推断整机任何位置都没有。候选保持同一React/地图与业务语义，由移动原生宿主负责私有SQLite、窄桥、凭据和系统提醒；完整同一Hermes/Python/依赖与ABI、进程生命周期仍须独立证明。

第一个有限但有用的切片可以是显式携带已接受安排/少量本人笔记、离线查看/记事和本机提醒。它不等于完整移动助手、实时多主同步或后台持续调查。调度未来alarm与真正notification提交必须分开，OS提交不等于送达/已看；Force Stop后不承诺继续运行。不能将Vite端口或电脑Gateway改名为手机本地产品。

## 固定的一手来源与不照搬的默认

下列为对应研究方向实际读取的固定版本/论文；没有把上游项目运行、性能或测试数字迁移为在场结果。仅有目录/README而未取得的源码不作为实现证据。

| 方向与来源                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 读到的机制与本项目取舍                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hindsight `5331da2f4db369528bb122075341a7de9c3df6df`：[fact_extraction.py](https://github.com/vectorize-io/hindsight/blob/5331da2f4db369528bb122075341a7de9c3df6df/hindsight-api-slim/hindsight_api/engine/retain/fact_extraction.py)、[retain hook](https://github.com/vectorize-io/hindsight/blob/5331da2f4db369528bb122075341a7de9c3df6df/hindsight-integrations/codex/scripts/retain.py)                                                                                                                                                                                                                     | 结构边界拆分、有界续处理、operation/document身份有价值；请求前推进计数、时间戳文档身份或失败降级不等于成功消费，也不提供完整隐私/删除语义。                                    |
| Graphiti `417c3a125ae3ac53c19b8e53fffaccf3e665a88e`：[bulk_utils.py](https://github.com/getzep/graphiti/blob/417c3a125ae3ac53c19b8e53fffaccf3e665a88e/graphiti_core/utils/bulk_utils.py)                                                                                                                                                                                                                                                                                                                                                                                                                         | 前序episode顺序、批内canonical UUID与事务可借鉴；图谱本身不替代条件支持片段与历史引用。历史重复边issue不被当成本次版本缺陷证明。                                               |
| [LongMemEval v2](https://arxiv.org/html/2410.10813v2)、[Sleep-time Compute v1](https://arxiv.org/html/2504.13171v1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 保留回合/原文，预处理收益依赖查询与情境；摘要/fact不能取代完整依据，后台compute不保证ACK、删除或权限。                                                                         |
| [RFC7953 §4–5](https://www.rfc-editor.org/rfc/rfc7953)；Nextcloud `fd34f03dfe75a69df13496ffa5b7633841d16e92`的[convert.js](https://github.com/nextcloud/calendar-availability-vue/blob/fd34f03dfe75a69df13496ffa5b7633841d16e92/src/convert.js)；Cal.DIY `6bfe2df9d13c456dc9374c9e6581b36fba188728`的[getUserAvailability](https://github.com/calcom/cal.diy/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/availability/lib/getUserAvailability.ts)                                                                                                                                            | 可用范围与busy分开、空集合保留为空、时区与扣占用顺序有价值；不照搬办公日9–17模板、墙上时刻临时Date或把域外称现实忙碌。未接CalDAV/团队预约。                                    |
| Transformers.js `511bb61a7c46b73e33f1af3fb308fbd1afe98c02`：[Node后端](https://github.com/huggingface/transformers.js/blob/511bb61a7c46b73e33f1af3fb308fbd1afe98c02/packages/transformers/src/backends/onnx.js)、[资源加载](https://github.com/huggingface/transformers.js/blob/511bb61a7c46b73e33f1af3fb308fbd1afe98c02/packages/transformers/src/utils/hub.js)；ORT Node1.30 tag `f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7`的[binding](https://github.com/microsoft/onnxruntime/blob/f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7/js/node/lib/binding.ts)                                                          | Node原生CPU路径真实存在，远程模型默认允许，须固定本地资源/禁止自动下载；Node填wasm并不自动取消原生依赖。需实际目标平台stage/asarUnpack，不把npm整包元数据当安装增量。          |
| E5作者模型 `614241f622f53c4eeff9890bdc4f31cfecc418b3`的[契约](https://huggingface.co/intfloat/multilingual-e5-small/blob/614241f622f53c4eeff9890bdc4f31cfecc418b3/README.md)与[ONNX转换761b726](https://huggingface.co/Xenova/multilingual-e5-small/tree/761b726dd34fb83930e26aab4e9ac3899aa1fa78)；EmbeddingGemma2作者 `914f7f89142e33e77833254d9c9b90c3cef7303b`的[契约](https://huggingface.co/google/embeddinggemma-2/blob/914f7f89142e33e77833254d9c9b90c3cef7303b/README.md)与[ONNX转换daa72c5](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX/tree/daa72c51243991dfcaf9f9137d2c573d8f7790c0) | 前缀、pooling、token上限、MRL与归一化必须按所选模型锁定；量化名不保证体积更小，外部权重数据不能漏算。当前只读元数据，没有下载或实测哪只更适合个人中文记忆。                    |
| LangGraph `98043c37abc60374030f960a03a6e0d4c0112643`：[pending writes](https://github.com/langchain-ai/langgraph/blob/98043c37abc60374030f960a03a6e0d4c0112643/libs/langgraph/langgraph/pregel/_loop.py#L461-L545)、[SQLite checkpoint](https://github.com/langchain-ai/langgraph/blob/98043c37abc60374030f960a03a6e0d4c0112643/libs/checkpoint-sqlite/langgraph/checkpoint/sqlite/__init__.py#L458-L495)                                                                                                                                                                                                        | 成功部分、pending写、superstep checkpoint及resume/replay分开；有输出不等于成功，exit持久化不保证任意退出点。借鉴ACK边界，不引入第二图引擎或直接复制其状态payload。             |
| Letta Code `7be3c81f9cfce481994fe4484d59a5bf17cdb48a`：[transcript完成](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/cli/helpers/reflection-transcript.ts#L1870-L1930)、[整合完成](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/cli/helpers/reflection-launcher.ts#L626-L682)                                                                                                                                                                                                                                            | 成功且合并或无变化才消费反思边界；旧Python V1不能冒充现行。Git记忆工作树/私人transcript不是本项目必要依赖，重试Map也不能称完整持久恢复。                                       |
| Hermes `548091836760a67e331b8f5643be8e5c08fae1e6`：[runtime owner journal](https://github.com/NousResearch/hermes-agent/blob/548091836760a67e331b8f5643be8e5c08fae1e6/agent/runtime_session_store.py#L195-L335)；OpenClaw `1446ecc39398c6e4f53cda9a260342cb914e8cb8`的[scratch提交](https://github.com/openclaw/openclaw/blob/1446ecc39398c6e4f53cda9a260342cb914e8cb8/src/infra/heartbeat-dispatch.ts#L181-L225)                                                                                                                                                                                                | durable pending→owner提交→receipt/ACK与scope/owner/CAS有价值，但payload journal和自由scratch不能变成本项目第二份私人正文。只研究固定上游，不修改产品Hermes锁或启用另一个cron。 |
| [MCP Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)、[缓存](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching)、[RFC9110 §8.8](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8)及[§13.1.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1)                                                                                                                                                                                                                                                                         | 发现/授权/annotations/事实版本各有职责；清单失效不是执行批准，HTTP validator绑定具体表示，客户端先HEAD再写仍有竞态。本项目未据此宣称接入新版MCP或外部原子写入。                |
| LangMem `48e3c11f5bb527282c7d5339c6a87a0b35abccfc`：[tools.py](https://github.com/langchain-ai/langmem/blob/48e3c11f5bb527282c7d5339c6a87a0b35abccfc/src/langmem/knowledge/tools.py)、[hot-path示例](https://github.com/langchain-ai/langmem/blob/48e3c11f5bb527282c7d5339c6a87a0b35abccfc/docs/docs/hot_path_quickstart.md)                                                                                                                                                                                                                                                                                     | 用途namespace有利发现，但此工具层put/aput没有在场expectedRevision CAS，默认保存边界也不同；取发现结构，不替换现有核验/撤回。                                                   |
| [Global Faithfulness / APC v2](https://arxiv.org/abs/2405.07726v2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 当前相关约束与不应违背的约束分开；不把虚构角色评测变真实用户心理分类，也不追加一轮强制风格分类。                                                                               |
| [Bastani等PNAS全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/)、[Shen/Tamkin v2](https://arxiv.org/abs/2601.20245v2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 有辅助的任务表现、之后无辅助的表现和长期学习不同；研究人群/任务/时间边界不能变成本产品效果或强制不给答案的依据。                                                               |
| DeepTutor `6cf793bd868ba5ecbe64722936d4be8fab5a01df`：[models.py](https://github.com/HKUDS/DeepTutor/blob/6cf793bd868ba5ecbe64722936d4be8fab5a01df/deeptutor/learning/models.py)、[assessment.py](https://github.com/HKUDS/DeepTutor/blob/6cf793bd868ba5ecbe64722936d4be8fab5a01df/deeptutor/learning/assessment.py)、[service.py](https://github.com/HKUDS/DeepTutor/blob/6cf793bd868ba5ecbe64722936d4be8fab5a01df/deeptutor/learning/service.py)                                                                                                                                                               | immutable attempt、精确目标关联、void/repair、ungraded与辅助条件可借鉴；默认independent=True或简化正确率不适合开放个人助理的能力认证。只阅读既有测试，没有运行或复制。         |
| HarperZ9/learn `77f36cb1e2be2a820010967001ba8e411e914099`：[session.mjs](https://github.com/HarperZ9/learn/blob/77f36cb1e2be2a820010967001ba8e411e914099/src/tutor/session.mjs)、[tutor.mjs](https://github.com/HarperZ9/learn/blob/77f36cb1e2be2a820010967001ba8e411e914099/src/tutor/tutor.mjs)                                                                                                                                                                                                                                                                                                                | 可视化不计表现、尝试与session分开；hash链仅证明记录连续，不证明本人独立，调用方correct和固定次数/正确率不能直接作为掌握认证。                                                  |
| Android官方[离线优先数据层](https://developer.android.com/topic/architecture/data-layer/offline-first)、[WebView本地资源](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)、[进程生命周期](https://developer.android.com/guide/components/activities/process-lifecycle)、[后台工作](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)                                                                                                                                                                              | 手机原生数据和系统调度各有生命周期；后台周期不等于准点提醒，WebView壳不证明Node/Python可运行。本轮未安装工具、生成APK或做真机验证。                                            |

## 后续证据与持续推进

当前源代码和正常API验证仍在进行。对应实施单元需要分别保留：实际最早分歧、一般机制修复、原触发重查、来源/版本/删除/恢复边界，以及当前整合构建与现有检查。没有新建测试源码、fixtures或runner；需要的观察通过现有API/命令与正常界面完成。真实模型、本人账户和移动设备仍各有自己的证据，不从宿主或上游检查推出。

候选保持明确未做：语义索引、持久调查frontier、交流约定发现、学习检查点和移动纵切均不因写入本研究而成为已接通能力。下一轮继续比较收益、依赖与维护成本，在真实功能链上推进；本文件不终结当前持续目标，也不替最终状态文档提前宣布通过。
