# 从已找到的原话接回已有事项

日期：2026-10-18。本项从 `e4254aa` 的第五批工作树继续，只记录当前源码、调用链与取舍。按[最新完整目标](../source-materials/2026-10-18/goal-objective-current-20261018.md)暂不验证：没有运行check、build、test、UI、Hermes、实际模型／Luna或嵌入推理，没有新增测试、fixture或runner，未读取用户数据库／账号、迁移实际数据、打包或发布。源码接入不表示功能、隐私行为或体验已经通过；当前阶段见[第六批状态](../CURRENT_STATUS.md#personal-memory-round6)。

## 要补的接缝

第五批已将本地语义候选接进原`search_context`，原词法、多query、scan、browse和精确回读继续存在。找到旧原话后，助手仍需知道它是否曾用于一个已存在的共同事项、学习过程、个人方法或规划意图。如果只能再猜事项标题查询，表达变化仍可能让已经找到的原话与原工作记录断开。

本批选择从现有记录声明的来源反查**候选地址**。它不建立新episode graph、不提取第二套事实、不把普通隐私依赖当作语义关系；既有`h_work`、原文及各专用owner保持职责。原讨论中的情境、理由与取舍要求见[资料与能力基线](SOURCE_CAPABILITY_MAP_2026-10-18.md)，本地向量的选型与限制见[第五批研究](LOCAL_SEMANTIC_RECALL_2026-10-18.md)。精确交叠只证明记录声明过这段来源，不证明两个事项语义相同、现在适用或应该合并。

这是一项可选的模型导航能力。普通对话已有足够依据时不强制反查，也不要求用户维护目录、标签、原文ID或游标。没有新增页面或索引管理UI，能力融入原聊天入口。

## 实际入口与来源坐标

调用链为：

`search_context`／`read_evidence`的实际结果 → 可选`sourceRelated`读取地址 → `restore_collaboration(type=source_related)` → `SourceRelatedService.page` → `KernelRepository.sourceRelatedWorkPage` → 各原owner读取入口。

- `src/main/runtime/context.ts`只在当前工具可用且本人工作区可读时附导航地址。它不因搜索命中而自动枚举Work，也不把Work正文、状态恢复或行动加入检索结果。
- 词法／语义候选和browse预览使用本次实际展示的原文范围；语义匹配片段更长时，导航仍以可见预览的精确范围定位。`read_evidence`经`src/main/tools.ts`处理最终可交付结果，由`recordEvidenceRead`给出`actualReadRanges`及可选导航。
- `sourceRefs`使用原文绝对Unicode码点坐标、`eventId`和`contentVersion`，不是UTF-16索引、字符串字节数或裁剪视图的相对offset。`actualReadRanges`只说明这次实际正文交付的范围，不表示已理解或采纳。
- 对后台授权片段，browse从宿主`projectRange`取得原范围，并核对实际裁剪正文；不再用`indexOf`猜相同引文在原文中的第一次位置。缺少精确范围或正文不一致时拒绝该页，不把猜测地址交给后续导航。
- 工具schema接受当前合法的原文地址作为查询参数；地址形状合法不证明此前读过全文。导航地址及查询`sourceRefs`均不是用户事实、同一事项证明、提取许可或业务授权。

同轮复查还发现授权原话定位的上游接缝：仅修browse，不能消除`beginOpportunity`、`investigationResume`和frontier绑定先选重复引文首处的风险。本轮已接入`runtime/source-quote.ts`／`resolveSourceQuote(event, raw)`：已有`contentVersion/start/end`须按原坐标与正文核对；给了部分或失效坐标时不退回文字搜索，legacy quote-only仅在唯一匹配时定位。Attention的citation允许版本／起止三字段同时提供，control核真实当前用户事件后保存宿主确定的`eventId/quote/contentVersion/start/end`五字段；coordinator保留父source原字段，机会启动、恢复及frontier绑定使用同一helper，frontier boundary也包含原source。显式引文位置无法解析时停止该项启动，不通过省略view放出整条event；旧重复quote或stale范围不能重定位或恢复frontier，只对相应托付保留缺口，同源父托付继续保持各自范围。

上述是本批限定托付／调查链的源码修补，没有运行验证，也没有迁移或回填旧库。其他quote旧入口未被本轮全量改写或验收，不能据此声称全项目重复引文问题均已解决。

## 哪些关系可以返回

`source-related.ts`的目录项仅包含原记录ID、当前revision、kind／type、status、关系类别、来源覆盖类别、必要的精确交叠地址及原读取入口，不返回事项标题、正文、旧理由或个人画像。

| 原记录 | 目录沿用的读取入口 | 当前范围 |
| --- | --- | --- |
| `collaboration_frame`的episode与goal | `restore_collaboration(relatedTo=原ID)` | 找回原事项和已有关系，不自动改变选择、进展或活动状态 |
| `learning_process`的experience | `read_learning(matterId, id)` | 仅`recorded`记录；不把报告变成掌握或独立表现 |
| 来源绑定的`personal_method` | `read_skill(id=personal:原ID)` | 仅`active`方法；方法仍是文字，不增加权限 |
| 来源绑定的`planning_intent` | `restore_collaboration(type=planning_intent, id=原ID)` | `active`、`paused`或`retired`均可作为定位候选；读取不恢复旧规格活动、票据或批准 |

导航仅为当前实际提供的owner工具生成入口。active个人方法还经`canReadRecord`调用原`personalMethods.catalog(handle, { id, revision })`的单记录窄读资格检查，不展开整个catalog；学习候选沿既有`workSourceFilter`进入`learningProcessReadable`复核。目录没有建立第二套方法／学习资格规则。后续正文读取仍走该owner自己的来源、版本、状态、用途和预算核验；发现一项暂停记录不代表恢复它。

关系分两种，不能混称：

1. **精确来源交叠**：具有typed `WorkSourceBinding`的记录，按同一原文ID／版本的Unicode区间交叠发现。宿主重新解析并核对**完整**binding，而非只核本次命中片段；所有refs均须当前合法，并落在本轮精确授权内。binding版本／hash／范围改变，或有一个支持片段不可读时，不返回该记录。输出`exact_source_overlap`、`exact_range`及交叠地址。
2. **旧式原文ID声明**：没有typed binding的旧记录只能沿其明确`evidenceIds`发现，标为`declared_evidence_id`、`whole_event_range_unknown`。它没有精确语义归因，不猜旧理由位于本次预览内。每条声明原文都须整条合法；只有一小段授权时不能用同一个event ID读取或暴露另一事项。缺typed来源不是绕过当前许可的理由。

无效typed binding不能退回legacy路径；同源、文字相似或普通`h_dependencies`相邻也不自动新增关系。

## 范围与会话边界

服务和repository都要求本人主体、`real`世界、`self`受众、`work:self`来源及`evidence:read`。候选还核原记录声明的来源、所需权限、原文可读性及typed binding；目录不是扩大范围的入口。

是否跨会话由coordinator当前宿主合同决定，模型不能通过目录参数选择：

- `memoryMode=relevant`允许在当前许可工作区查候选，仍逐条核来源和用途。
- 其他模式限实际当前session成员，或记录通过显式`matterId`／`episodeId`关联到当前session的合法frame／goal。不能因共享原文、同名、临近时间或sourceRefs合法，就把其他会话的事项拉进来。
- 通过父事项证明session成员关系时，该父事项及完整来源同样复核并进入必要的关系证明。子记录不借parent ID绕过来源检查。
- 后台`attentionEvidenceViews`的精确授权片段贯穿查询refs、候选完整binding及父关系证明；读取用途仍经现有`verifyReadPurpose`。导航不恢复历史授权。

## 目录分页与变化

目录游标保存在本进程内，最多64份，30分钟到期；进程重启、游标过期、原文／范围／会话／许可或工具边界改变后，从当前原文地址重新查找。首次输入最多8个refs；默认返回8项，可选1–20项，每页实际扫描最多`min(maxRows, 200)`条候选。

repository用首次SQL候选集合的rowid上界和向下keyset续接。这个上界只固定枚举的新增记录边界，**不冻结记录内容或修订**：每页重新查当前revision、权限和来源。已枚举记录后来改变，不会自动回到旧游标前面；确有需要时新开目录。游标不声称完整历史快照、全局语义排序或所有相关事项都已找到。

通过SQL初筛的记录仍可能在typed来源、完整投影或session证明复核时被排除。因此空页且`status=partial`／有`coverage.nextCursor`表示还有候选待枚举，不是“没有记忆”。按`coverage.read`继续原目录，不能混用普通query、offset、relatedTo或规划意图分页。

旧输入游标不可变。预算容纳不了目录页时不采用该页，可减小limit沿原地址重试，不以已产生但未交付的下一页位置跳过候选。`complete`仅指这次固定rowid上界内、当前合法且有声明关系的目录已枚举，不证明语义调查完成。

## 收据与阅读状态

预算准入并复核后，coordinator记录实际输出的候选记录版本，以及这些候选和必要session父关系所依赖的完整来源binding。它们使之后传输、历史、子代理采用及来源撤回继续沿现有收据边界核对，不复制另一份正文。

查询地址自身的`queryBinding`也可以作为目录结论的导航来源依赖保留，包括没有候选的目录页；这是“该目录基于哪些当前来源地址”的复核门，不是候选的支持证据、原文正文或已读事实。不能把它与实际返回候选的完整关系来源混称。

查询`sourceRefs`只是导航地址，不能因此进入`pack.assertions`或被说成已读事实。目录枚举、候选ID、sourceRelated读取建议和`actualReadRanges`也不能互相冒充；前者不产生原文正文read coverage，不推进investigation的阅读／判断ACK，不表示看过学习过程／方法／规划正文。真正需要使用时仍执行返回的owner入口，并按新结果判断语义适用。

## 仍未完成的方向

当前没有运行证据证明此导航能在真实长期对话中降低漏接、维持正确事项归属或正确使用全部工具；没有据此验收权限撤回、分页、重启、重复引文或父关系处理。第五批向量效果与第四批界面也继续保持各自未验证状态。

本批没有实现开放语义关系抽取、自动合并事项、跨方面调查的语义闭合、自动因果图、定时改写Profile或完整经历摘要。原文未曾被工作记录明确引用时，目录可能为空；仍需原search／browse／read／delegate调查，不能把空目录当作没有相关经验。下一步候选应从实际缺口继续选择，不将本批可选导航写成整个记忆目标完成。

维护位置：`src/main/memory/source-related.ts`维护目录、proof与游标；`storage/repository.ts`维护实际候选SQL；`runtime/context.ts`和`tools.ts`维护可见范围地址与实际原文阅读收据；`runtime/coordinator.ts`维护宿主模式、用途、精确授权、预算与各owner工具接线。导航入口见[项目导航](../../PROJECT_NAVIGATION.md#current-evolution)，当前完成边界见[CURRENT_STATUS](../CURRENT_STATUS.md#personal-memory-round6)。
