# 记忆演进：真实召回、条件展开与纠正续接

日期：2026-10-18。项目起点：`c7cff22884fe9a3050879067dd49012f685d8cfd`。本报告区分已读来源、工程决策、已接线实现和验证边界；不以设计包或上游基准分数代替产品验证。

## 输入覆盖与本轮要求

完整读取的两份记忆材料存在严格包含关系：上传的《在场的记忆讨论.txt》共 1,972 行，与项目来源 `01-txt` 的前 1,972 行逐行相同；项目来源另外有 932 行后续讨论，总计 2,904 行。阅读覆盖共同部分及全部新增部分，没有将历史对话中的“现在执行”“切换架构”等命令当作本轮执行指令。

共同部分要求：原始证据、可纠正断言、进行中的事情、实时业务状态、派生视图和检索索引分开；主体、世界、条件、例外和时间不能丢；当前纠正立即生效；原文未提取也应可找到；完整条件组合进入上下文，不能仅检索几个相似句子。二百个假想问题属于探索及验收输入，不是二百个生产路由分支。

项目来源独有的后续部分明确批评“关键词替模型决定意图与合法能力”，并选择真实 Hermes 主循环。它要求记忆内容保持开放自然语言，精确控制身份、来源、时间、用途和版本；模型可以改写搜索、继续取证和委派，不能通过名称好看的硬编码分类器提前失去能力。已有 `src/main/runtime/hermes.ts` 与受控证据断言实现保留，本轮没有另造事实系统。

本轮用户进一步明确：记忆是主任务；主动性、工具接入和个性表达为相关目标；后端与前端顺序分开，但不以 Luna 或某个单独验证阻塞全部后续工作。记忆增强不增加用户需要操作的“记忆管理页面”。

## 实际检查的开源实现

以下版本均通过 GitHub commit API 固定后读取实际源文件，非仅阅读 README。检索日期为本报告日期。

| 项目 | 固定版本 | 实际读过的机制与测试 |
| --- | --- | --- |
| Graphiti | `417c3a125ae3ac53c19b8e53fffaccf3e665a88e`，2026-10-17 | `search.py` 的独立召回与 RRF/重排短名单，`search_filters.py` 的时态过滤，`edges.py` 的有效/失效字段，cross-encoder 短名单回归 |
| Hindsight | `5331da2f4db369528bb122075341a7de9c3df6df`，2026-10-16 | `retrieval.py` 的多路检索、`fusion.py` 的秩融合、`temporal_extraction.py` 的查询时间锚点；关联展开与时间范围测试 |
| Mem0 | `0724291bd864cf807e88ee8981c8226644e8fb42`，2026-10-14 | `memory/main.py` 的 ADD 提取、候选形成、关键词/实体加分与失效过滤；session scope 编码及实际写入路径测试 |

### Graphiti：不能在重排前就丢掉另一条召回路径

源码的 `edge_search` 将全文和向量结果收集后融合。`test_edge_cross_encoder_rrf_shortlist.py` 专门构造全文搜索充满弱命中、语义搜索第一条才是真正答案的情况，要求该答案实际进入 cross-encoder 的候选输入，并最终排第一。值得借鉴的是“候选如何进入下一步”的检查，而不是只宣称存在两个搜索器。

时态字段和搜索过滤是分开的：`SearchFilters` 中 `valid_at`、`invalid_at`、`expired_at` 默认为空，因此产品调用侧必须明确实施自己的当前可用性语义。我们不以存在失效时间字段推定任何上层工具都会自动排除旧事实。上游 issue #1645 提过 MCP 旧事实过滤问题，但本轮不据该 issue 宣称当前版本仍有同一缺陷。

来源：

- [搜索实现](https://github.com/getzep/graphiti/blob/417c3a125ae3ac53c19b8e53fffaccf3e665a88e/graphiti_core/search/search.py)
- [时态过滤](https://github.com/getzep/graphiti/blob/417c3a125ae3ac53c19b8e53fffaccf3e665a88e/graphiti_core/search/search_filters.py)
- [关系对象](https://github.com/getzep/graphiti/blob/417c3a125ae3ac53c19b8e53fffaccf3e665a88e/graphiti_core/edges.py)
- [短名单回归测试](https://github.com/getzep/graphiti/blob/417c3a125ae3ac53c19b8e53fffaccf3e665a88e/tests/utils/search/test_edge_cross_encoder_rrf_shortlist.py)
- [MCP 检索行为问题讨论](https://github.com/getzep/graphiti/issues/1645)

### Hindsight：融合、关联展开和时间边界必须一起成立

`retrieval.py` 把 semantic、BM25、graph、temporal 召回交给真实 memories store；`fusion.py` 根据名次融合，而非直接相加不可比的原始分数，还为每路候选提供上限。`test_recall_time_range_graph.py` 先证明关联确实可达，再验证时间过滤同样作用于图上的邻居，防止种子合法而邻居越过时间边界。

`temporal_extraction.py` 接受 reference date，并将解析失败和“没有时间信号”按明确路径降级。我们保留宿主提供的当前时刻及用户时区，让模型提出 `at`；没有把中文时间短语映射成新的场景词表。借鉴关联展开，但不搬入新的图数据库、后台观察系统或第二套记忆服务。

来源：

- [多路检索](https://github.com/vectorize-io/hindsight/blob/5331da2f4db369528bb122075341a7de9c3df6df/hindsight-api-slim/hindsight_api/engine/search/retrieval.py)
- [融合实现](https://github.com/vectorize-io/hindsight/blob/5331da2f4db369528bb122075341a7de9c3df6df/hindsight-api-slim/hindsight_api/engine/search/fusion.py)
- [时间提取](https://github.com/vectorize-io/hindsight/blob/5331da2f4db369528bb122075341a7de9c3df6df/hindsight-api-slim/hindsight_api/engine/search/temporal_extraction.py)
- [关联展开测试](https://github.com/vectorize-io/hindsight/blob/5331da2f4db369528bb122075341a7de9c3df6df/hindsight-api-slim/tests/test_link_expansion_retrieval.py)
- [图邻居时间过滤测试](https://github.com/vectorize-io/hindsight/blob/5331da2f4db369528bb122075341a7de9c3df6df/hindsight-api-slim/tests/test_recall_time_range_graph.py)

### Mem0：检查实际候选集，也检查范围键如何使用

固定版本的 `_add_to_vector_store` 使用新增式提取，读取相同 scope 的近期消息和相关记忆后调用模型。`_search_vector_store` 会查询 semantic 和 keyword，但候选对象由 `semantic_results` 建立，关键词分数和实体分数用于加分。因此不能仅从“做了关键词搜索”推出关键词独有命中一定进入候选集。这是本轮选用真正候选并集融合的具体理由。

`test_session_scope.py` 不只检查辅助编码函数，还检查 ADD 流水线是否真的用它读取和保存消息，覆盖分隔符造成的范围键碰撞。在场沿用现有宿主范围与 repository 过滤，不让模型生成用户 ID，也不从记忆服务自行扩大来源。

来源：

- [主实现](https://github.com/mem0ai/mem0/blob/0724291bd864cf807e88ee8981c8226644e8fb42/mem0/memory/main.py)
- [范围键与流水线测试](https://github.com/mem0ai/mem0/blob/0724291bd864cf807e88ee8981c8226644e8fb42/tests/memory/test_session_scope.py)

## 在场的问题与采用的增量

基线已有证据断言、局部原文纠正、版本、删除传播和待处理记忆恢复。本轮没有重新实现这些机制。具体缺口在 `ContextCompiler.prefetch`：单一 query 的字符匹配；只补一层 `exceptionIds`，未展开既有依赖链；搜到旧措辞时主要返回历史限制，没有主动带出明确更正来源。

| 候选方案 | 选择与理由 |
| --- | --- |
| 手写同义词/生活场景词表 | 不采用。会重现历史讨论明确批评的词面控制问题。 |
| 先接一个没有配置模型的向量接口 | 不采用。接口存在不提供当前召回收益，也引入未经证明的服务依赖。 |
| 每轮强制经过意图、情绪、画像、规划多级分类 | 不采用。拖慢普通交流并提前固化解释；主 Hermes 模型保持语义控制权。 |
| 主模型提出多个查询，宿主融合真实结果 | 已实现。复用当前模型、索引、权限和原文，相关条件/语言可在新问题中动态组合。 |
| 在字面完全不重合时提供有界候选浏览 | 已实现。模型可请求 `mode=scan`，再直接判断候选语义；不强迫用户重复表述，也不把全部画像永久塞进上下文。 |
| 显式依赖展开与更正续接 | 已实现。复用 `h_dependencies`、断言版本、例外与原文限制，不凭共同词汇编造关系。 |

## 真实接线

`prompts/system.md` 指导主助手在个人条件会改变判断时主动取证。`search_context` 的 schema 和执行路径位于 `src/main/runtime/coordinator.ts`，参数交给 `ContextCompiler.prefetch`。查询、分页、断言及原文由原 `KernelRepository` 实际读取；结果写入 `pack.data.retrievedContext`、`pack.assertions` 与证据/对象版本收据，并作为工具观察进入原 Hermes 循环。

没有额外的记忆代理主循环，没有强制每句先检索，也没有让关键词决定工具是否可见。普通交流不需要展示记忆；有需要时主模型可以继续改查询、扫描、读取原文或委派。

具体新增：

1. `relatedQueries` 最多五个，加原 query 最多六路。NFKC、大小写和重复 query 去重；每路同一 ID 只计一次排名贡献。RRF 排名不是记忆置信度，也不增加独立证据数量。
2. 多 query 的断言和原文分别融合真实候选 ID。强约束候选单列，不被普通结果挤掉；但强度不使无关约束自动适用。
3. 融合每路最多 51 条，返回 `rankingWindow`、常规页指针和 `queryContinuations`。后者可用单 query + offset 继续到更深候选，不把窗口内排序叫作全量搜索。
4. `mode=scan` 对当前许可、有效且核验过的断言分页；权限、有效期和核验先于 LIMIT/OFFSET。扫描本身不判断语义相关，主模型阅读后决定哪些能用；它不是向量搜索。
5. 每个断言带齐当前有效例外、原始依据和最多三层已有依赖。根断言及完整支持不可分割，额外展开至多 24 个对象；版本漂移、不可读来源、深度/对象限额都有 `dependencyCoverage` 缺口。缺口不能被当成已闭合条件。
6. 临时例外到期后停止作用；不会把“今天不跑”永久保留，也不会因到期的例外让长期偏好永久不可用。
7. 命中被纠正的原话时，沿精确 `replacementEventId` 取回最多 16 个更正来源。旧片段仍是 `historical_only`，不恢复旧断言；未取全或无权限有覆盖说明。
8. 授权片段投影先于输出，不能经派生断言、关联展开或更正链接扩成整条私人消息。投影输出不回显 query 或其他片段的限制谓词；后台原有 canary 测试继续适用。
9. 字节/上下文预算在完整 bundle 上复核；不足时只给定位预览并明确 `previewOnly`，不截断条件后注入有效事实。所有后续工具仍复核当前范围。

另外，由主动性分支新增的 `continuity.ts` 已在相同 compiler 接线：少量开放事项和真正准备好的材料作为跨轮索引进入上下文，source provenance 与版本进入同一收据。它不创建另一套记忆，不把旧探索变成用户的新义务；详细语义、实现和测试归其对应报告。

## 验证及实际边界

`tests/harness/memory-retrieval.test.ts` 覆盖：中文问题/英文原文的零字面命中及多query恢复；无字面关联的扫描；55 条过期记录不挤掉当前候选；完整分页；依赖链、版本变化和片段隐私；临时例外到期；旧词命中后的更正续接；禁止来源；RRF重复去重；融合深页；根节点预算和三层深度边界。它检查真实 SQLite、context pack 和收据，不只断言最终回复文本。

首次八项新增测试通过；补入临时例外后，新增九项及原 memory-continuity/search/privacy 合计 34 项通过。随后加入根预算/深度用例，记忆新增测试最终 10/10 通过；`npm run check` 和 `git diff --check` 随后通过。后台授权片段回归曾发现 coverage 回显 query 的 canary，已停止在片段投影中回显 query。最终当前分支总体验证由主代理统一运行并记录，以上数字不冒充实际模型或所有外部连接验收。

这些是确定性机制测试，relatedQueries 由夹具提供，证明工具确实能执行跨语言查询、扫描及正确传递来源，不证明生产模型在所有措辞下会自动选对查询。实际主模型的调用选择、长期用户体验、召回收益/成本仍应在真实会话与留出问题上继续观察。向量嵌入服务仍未接入；当前进步来自真实模型可用的多query与候选浏览，不将其包装为向量语义索引。

仍保留的边界：候选扫描随记忆规模增加需要更多模型阅读；RRF窗口不提供全局精排保证；只展开已经记录的依赖，无法证明所有现实条件都已知；更正来源保留原文性质，不自动把其中所有句子变成新事实；历史时点读取仍按现有断言状态/有效时间语义，不宣称已实现完整双时态快照查询。

后续值得继续的研究是可撤销、可重建的嵌入索引与跨语言留出集，且必须保持当前事实所有权、删除传播、时间过滤和原文兜底。先测出缺少哪类召回，再决定是否新增运行依赖。
