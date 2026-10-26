# 六层协作记忆、双时态断言与四轴隐私屏障 (`memory-and-continuity.md`)

> 对应核心代码：[`src/main/memory/service.ts`](../../../src/main/memory/service.ts)、[`src/main/memory/model.ts`](../../../src/main/memory/model.ts)、[`src/main/storage/repository.ts`](../../../src/main/storage/repository.ts)、[`src/main/runtime/context.ts`](../../../src/main/runtime/context.ts)、[`src/main/runtime/memory-inquiry.ts`](../../../src/main/runtime/memory-inquiry.ts)、[`prompts/memory-inquiry.md`](../../../prompts/memory-inquiry.md)。

---

## 1. 为什么在场需要「六层协作记忆」而不是扁平的 Memory 列表？

普通聊天机器人的记忆往往退化为两种极端：
1. **扁平贴标签（Flat Tagging）**：把学生一句气话（「我这辈子再也不学微积分了」「今天只想躺平」）当成永久人格标签，或者把一次临时拒接建议当成「用户讨厌运动」；
2. **传话游戏式摘要污染（Recursive Summary Contamination）**：每轮对话生成一段摘要，下一轮再对摘要做摘要，最终把助手自己的推测当成用户亲口说的事实，越滚越假。

在场的记忆系统是为了支撑**跨越数周、数学期的真实校园共同生活**而设计的六层结构：

### 六层记忆架构（The 6-Layer Memory Stack）

| 层级 | 核心对象与物理表 | 权威语义与边界 |
| --- | --- | --- |
| **L1 · 原文证据层 (`SourceEvent` / `EvidenceSpan`)** | `h_evidence`, `h_spans`, `h_evidence_fts` | **唯一第一手事实来源**。保存逐字原文（`text`）、Unicode 码位偏移（`start`, `end`）、说话人（`user \| assistant \| external`）、主体与世界（`subjectId`, `worldId`: 区分本人、第三人、作品虚构世界与角色试演 `sourceContext`）、版本（`contentVersion`）与根来源 ID（`root_event_id`）。 |
| **L2 · 双时态条件断言层 (`Assertion`)** | `h_assertions` | 从本人原话中提炼的结构化理解。具备**双时态（Bi-Temporal）**、**结构化条件树（`ConditionAST`）**、**例外列表（`exceptions`）**与**独立证据根计数（`independentRootCount`）**。 |
| **L3 · 决策经验与摩擦假设层 (`DecisionExperience` & `FrictionHypothesis`)** | `h_decisions`, `h_work` | 记录一次真实权衡中的**候选项、采纳/拒绝结果、明确拒绝原因（`reason`）以及该原因何时失效（`expiresWhen`）**。例如：「不去图书馆是因为没带平板」——一旦后来借到了平板，旧阻碍自动失效，不再死板避开图书馆。 |
| **L4 · 协作脉络与作品层 (`CollaborationFrame` / `Work` / `Episode` / `CooperationRecord`)** | `h_work`, `h_episodes`, `h_cooperation` | 记录正在推进的事项（`Matter`）、陪学纸（`study_companion`）、关系排练（`relationship_rehearsal`）、对外草稿（`ReleaseArtifact`）与助手过往提供过的帮助（`CooperationRecord`）。严格区分六阶段状态：`generated ≠ rendered ≠ seen ≠ understood ≠ accepted ≠ executed`。 |
| **L5 · 领域实时观察层 (`DomainObservation` / `LiveState`)** | `h_observations`, `ZjuAdapter`, `CampusMapAdapter` | 课表、考试、绩点（标注明确口径，不混算不同学分绩制）、体育打卡（严格区分**学校有效打卡次数**、**原始刷卡流水**与**学生口头自述**）、天气与空气质量（区分降水/风力与 AQI）、校园卡余额（保留原始数值与单位，不擅自换算圆角分）、校园拓扑地图 V2。 |
| **L6 · 派生视图与多路检索索引层 (`DerivedViews`)** | `h_vectors`, `h_entities`, `ContextPack` | FTS5 2-gram 中文全文索引、本地向量候选索引、实体图谱与开场小锚点。**派生层永远只是寻址路标，本身不具备事实权威**；一旦底层 `SourceEvent` 或 `Assertion` 更正/撤回，派生层同步失效。 |

---

## 2. 双时态断言（Bi-Temporal Assertions）与 9 种演化操作

### 2.1 双时态坐标（Valid Time vs. Transaction/Recorded Time）
每条 `Assertion` 同时维护两组时间轴：
- **事实有效时间（`validFrom` ~ `validTo`）**：这件事在现实生活中什么时候成立（如「这学期周四下午没课」「今晚脚踝扭了不跑步」）。
- **系统记录时间（`recordedFrom` ~ `recordedTo` / `revision`）**：在场是什么时候听说、什么时候更正或归档这条理解的。

### 2.2 九种显式记忆演化操作（9 Memory Evolution Operations）
记忆不是简单的 CRUD，而是由 [`MemoryService`](../../../src/main/memory/service.ts) 执行的 9 种精确语义操作：

1. **`ADD`**：新增一条有原话证据锚定的新理解。
2. **`SUPPORT`**：新的独立原话印证了既有理解。**注意**：必须核验 `root_event_id`，同一句原话被引用或总结 10 次，`independentRootCount` 仍为 `1`；只有来自不同 `root_event_id` 的独立原话才增加独立支撑度。
3. **`REFINE`**：在不推翻原意的前提下，补全更细致的条件、范围或细节。
4. **`ADD_EXCEPTION`**：**原规律完全保留，仅登记本次或特定时段的例外**。
   - *经典场景*：学生平时「喜欢连续两小时深度学习」，今天说「今天太累了只想歇着，别排长块学习」。此时必须用 `ADD_EXCEPTION`（带今日 `validTo`），**绝不能用 `SUPERSEDE` 或 `CORRECT` 抹掉他平时的长期习惯**！
5. **`SUPERSEDE`**：**现实情况发生了阶段性变化**，从指定时间（`validFrom`）起用新常态接替旧常态，但**保留旧记录作为当时合法的历史背景**（如「从下周起搬到紫金港西区宿舍」）。
6. **`CORRECT`**：**之前说错了或听错了**。直接废止错误断言，阻断其继续参与推理，并清理其错误派生。
7. **`DISPUTE`**：不同来源或前后说法存在尚未核清的矛盾，标记为 `disputed`（有待核对），在对话中温和确认，不武断二选一。
8. **`EXPIRE`**：到达 `validTo` 或触发事件完结后自然过期。
9. **`RETRACT` / `FORGET`**：用户主动撤回或要求遗忘，立即触发跨全链路隐私屏障。

---

## 3. 十二维学生理解模型（12-Dimension Student Model）

在场对用户的理解涵盖 12 个有机交织的维度（定义于 `src/shared/harness.ts` 与 `src/main/memory/`）：
1. **课程、作业与考试节点（Academic & Deadlines）**
2. **精力节律与作息峰值（Energy & Circadian Rhythm）**
3. **常驻地点与通勤偏好（Locations & Commute）**
4. **学习环境与感官偏好（Environment & Sensory Preferences）**
5. **长期目标与启动阻力（Goals & Initiation Friction）**
6. **人际关系与沟通边界（Relationships & Social Boundaries）**
7. **身体与情绪气象信号（Wellbeing & Emotional Weather）**
8. **财务与预算硬约束（Financial Constraints）**
9. **当日/短期临时例外（Temporary Exceptions）**
10. **协作元偏好（Meta-Preferences：喜欢先给结论还是先铺垫、喜欢多主动还是少打扰）**
11. **历史决策与未采纳原因（Decision Experience & Rejection Reasons）**
12. **尚未核清的留白与歧义（Unresolved Ambiguities）**

---

## 4. 四轴数据控制与瞬时遗忘屏障（4-Axis Privacy & Instant Fence）

### 4.1 四轴独立校验（Four Orthogonal Control Axes）
在 [`PolicyKernel`](../../../src/main/runtime/policy.ts) 中，每一次数据流动都拆分为四个正交轴分别核验，**绝不混为一谈**：
1. **读取/采集轴（`collect / read`）**：本轮允许读哪些 `sources`（`history:self`, `profile:self`, `work:self`, `local-agenda`, `campus:local`, `campus:zju-account`, `file:*`）。
2. **传输与推断轴（`transmission / infer`）**：
   - `local_only`（禁止出本机的数据**绝对不能先发给云端模型做意图分类或权限解析**！必须在本地由 `localCloudRestriction` 先行拦截）；
   - `infer: boolean`（是否允许从本轮原话提炼长期偏好）。
3. **保留周期轴（`retention`）**：
   - `purpose_scoped`（常规保存并慢慢了解）
   - `history_no_inference`（只留对话原文，不提炼长期画像）
   - `session_only`（阅后即焚：仅在当前会话内存链有效，关闭对话或切换会话即彻底清除，不写历史表、不进记忆队列；但用户明确下达并确认的本地日历操作仍按独立业务记录保留）。
4. **披露与行动轴（`audience / actionMode`）**：
   - `audience: 'self' | 'group' | 'public'`；
   - 附件文字、工具返回、网页内容或角色卡设定永远是 `data`，**绝不具备签发权限或扩大读取范围的指令权威（`authority`）**。

### 4.2 瞬时遗忘与更正屏障（`privacy_epoch` + `h_fences`）
先区分普通修订、停用理解、撤回提案、来源撤权与永久遗忘，沿原Owner处理其实际范围：
1. 当前纠正及时进入有效上下文，原引用仍按内容版本核验；普通笔记修订不自动升级为全局隐私删除，也不清掉独立历史。
2. 来源撤权或遗忘沿 `privacyEpoch/policyRevision/h_fences` 与真实依赖阻断受影响采用；SQLite、索引、缓存、准备、声音与恢复材料按相应语义清理，未受影响片段和独立事项继续。
3. `Harness` 在边界变化处丢弃不再可用的草稿与调查结果；不要把“停用这一条理解”解释为取消所有后台帮助。已经向外披露的内容或离线设备不能被承诺瞬间收回。
4. **迟到子代理拦截**：交付与父采用前沿 `childSourcesChanged()` 和原来源限制复核；旧范围下生成并不赋予新采用权，受影响正文不能从报告或缓存复活。真正已经合法发表的独立历史仍按自己的依据回看。

---

## 5. 多路检索与 `recall_experience` 原生记忆调查

### 5.1 开场轻量锚点（Small Opening Anchors）
- 默认 `ContextCompiler.compile()` **只放置极小、高确定性的当前开场锚点**（当前时间与时区、当前会话活跃事项 `currentMatter`、少量已核实的核心长期偏好），**绝不在开场塞入大段历史对话或未经核实的 BGE 向量候选**。

### 5.2 按需深入调查（`recall_experience` & `prompts/memory-inquiry.md`）
当对话涉及过往经历、习惯变化、上次做到哪儿或某句原话时，主模型通过原生 `delegate`（携带 `memoryInquiry`）或 `recall_experience` 启动受限记忆调查：
- **唯一详细方法准则**：见 [`prompts/memory-inquiry.md`](../../../prompts/memory-inquiry.md)。
- **四路协同寻址**：
  1. 结构化双时态断言与条件过滤（`Assertion`）；
  2. CJK 2-gram 实体与 FTS5 精确字面检索（防止中文短词漏召回）；
  3. 本地向量语义候选（仅作寻址线索，不直接当事实）；
  4. **回溯 `SourceEvent` 原文核对上下文**（检查前后文是否有否定、反讽、角色扮演 `sourceContext` 或临时条件）。
- **分页与诚实边界**：空页、截断或单次未命中**不等于「从来没提过」**；子代理沿既有分页预算继续核查，把「查到了哪条原话、当时的条件是什么、还有哪块没翻完」诚实交还主模型，绝不把内部索引 ID 甩给用户管理。
