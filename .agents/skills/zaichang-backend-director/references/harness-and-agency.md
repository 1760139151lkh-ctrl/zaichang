# Harness 运行时、Hermes 原生桥接与可审计行动 (`harness-and-agency.md`)

> 对应核心代码：[`src/main/harness.ts`](../../../../src/main/harness.ts)、[`src/main/runtime/hermes.ts`](../../../../src/main/runtime/hermes.ts)、[`runtime/hermes/sidecar.py`](../../../../runtime/hermes/sidecar.py)、[`src/main/tools.ts`](../../../../src/main/tools.ts)、[`src/main/runtime/skills.ts`](../../../../src/main/runtime/skills.ts)、[`src/main/actions/`](../../../../src/main/actions/planning.ts)、[`src/main/runtime/release-projection.ts`](../../../../src/main/runtime/release-projection.ts)。

---

## 1. 锁定版 Hermes `AIAgent` Sidecar 与四大窄适配器

在场不自己造简陋的 `while (tool_call)` 玩具循环，而是通过 [`src/main/runtime/hermes.ts`](../../../../src/main/runtime/hermes.ts) 与 [`runtime/hermes/sidecar.py`](../../../../runtime/hermes/sidecar.py) 驱动锁定的 Python Hermes `AIAgent`（版本与 commit 哈希严格锁定在 [`runtime/hermes/lock.json`](../../../../runtime/hermes/lock.json)，运行时在 `ContextReceipt.engine` 中记录 `commit` 与 `adapterSha256`）。

### 四大窄适配器（The 4 Narrow Host Adapters over `zc.*` JSON-RPC）

| 适配器 | `zc.*` RPC 方法 | 职责与安全边界 |
| --- | --- | --- |
| **1. `RunFactory`** | `zc.run.start`, `zc.run.ready`, `zc.child.authorize`, `zc.child.open` | 为主回合与每个并行子代理（`delegate`）创建绑定了 `runId`、`privacyEpoch`、`taskVersion` 与受限工具集（`tools`）的独立 `AIAgent` 实例。 |
| **2. `StateSink`** | `zc.child.event`, `zc.child.result`, `zc.run.complete` | 接收子代理状态流转（`queued → running → produced → consumed / failed`）、上下文压缩回执（`HermesCompressionReceipt`）与最终消息序列。 |
| **3. `TransportObserver`** | `zc.model.complete` | **Python侧不持有API Key或旁路请求模型**。模型请求回宿主，核当前范围、实际传输和来源，计量真实usage，经ConversationRhythm发布合法正文。预算按当前provider合同处理；Luna声明输出数为advisory，不能沿用旧16384/4096数字作完成后的拒收门。压缩与取消继续沿锁定主循环。 |
| **4. `ToolBridge`** | `zc.tool.call` | 将 `AIAgent` 的工具调用路由回宿主 `ToolRegistry.execute()`，绑定当前 `ScopeHandle`、`AbortSignal` 与 `ContextReceipt` 审计账本。 |

---

## 2. 三层渐进能力发现（Progressive Capability Discovery via `look_up`）

如果把几十个工具的完整长篇说明、参数边界和领域规则全部塞进每一轮开场 System Prompt，不仅浪费 Token，更会让模型变成满脑子规则教条的「法务机器」。

在场采用**三层渐进式能力披露**（定义于 [`src/main/runtime/skills.ts`](../../../../src/main/runtime/skills.ts) 与 [`src/main/tools.ts`](../../../../src/main/tools.ts)）：
1. **L0 · 开场极简目录（Compact Capability Directory）**：开场只告诉模型有哪些能力域（记忆回顾、日程规划、浙大校园数据、紫金港/玉泉地图、笔记、资料阅读、可接续陪学、OpenUI 实时交互视图、对外草稿准备等）。
2. **L1 · 按需查找（`look_up`）**：当模型遇到具体情境（如需要画互动函数图像、查体育打卡、做日程冲突规划）时，调用 `look_up` 获取对应能力域的精选方法与前置条件。
3. **L2 · 深入工作细节（`prompts/working-details.md` & 专项导引）**：仅在调用相关工具或展开复杂交互程序（如 `interactive-program-guidance.ts`）时，按需注入精确的 DSL 语法与坐标约定。**注意**：看过工具目录或签名不代表已经读过用户的私人资料正文。

---

## 3. 受限并行子代理分派（Bounded Parallel Delegation）

主模型可通过原生 `delegate`（或 `recall_experience`）并行派发只读调查子任务，但宿主实施严格的特权收窄（Privilege Narrowing）：
1. **权限单调递减**：子代理的 `ScopeHandle` 只能是父回合 `sources` 与 `grants` 的真子集（强制 `actionMode: 'read'`、`infer: false`、`child: true`），**绝不允许子代理写日历、改笔记、发通知或递归再派子代理**。
2. **根原话唯一授权原则**：子代理调用 `verifyReadPurpose` 时，宿主强制校验**根用户原话（`run.ingress.authoredText`）**是否构成读取用途依据——父代理写的 `task.instruction` 只是任务描述，**绝不能作为扩大读取用户私密资料的新授权**！
3. **共享预算与版本复核**：所有兄弟子代理与父代理共享同一个宿主的 `readBytes` 与 `estimatedTokens` 预算计数器。子代理返回 `summary` 后，父代理在真正消费该报告（`consumed`）并向用户开口前，宿主必须通过 `childSourcesChanged()` 与 `inheritChildProof()` 复核子代理读过的每一个对象版本（`providedObjectVersions`）是否仍然新鲜且未被撤回。

---

## 4. 可审计行动状态机（`Action → Approval → Attempt → Receipt`）

在场中的一切业务写入（本地日历增删改、重复日程单次例外、持续托付登记、外部写操作）都遵循确定性事务状态机：

```
Proposed / Previewed (试放/预览，未落库)
   ↓ (已获用户原话明确授权，或用户在确认卡点击批准)
Approved (绑定 expectedRevision、planRef 短票据与幂等键)
   ↓
Attempting (记录 Attempt 与请求摘要)
   ├─► Succeeded + Receipt (confirmed_success：已落库并生成可核查回执)
   ├─► Failed Confirmed (failed_confirmed：明确失败，原状态完好回滚)
   └─► Outcome Unknown (outcome_unknown / cancellation_unknown：超时或中断，结果未明)
```

### 行动铁律
- **试放绝不写入**：`preview_calendar_plan` 或 `NativeAgendaService.preview` 只在内存中投影变更并计算冲突与可约空窗，数据库 revision 分毫不改。
- **短票据（`planRef`）不跨期冒用**：排程方案生成的 `planRef` 绑定具体的 `planId`、`blockId`、参数哈希与过期时间。过期或底层日历已被改动的票据自动失效，**绝不用新版父事项去补签旧票据**。
- **`outcome_unknown` 严禁盲目重发**：当外部或跨进程动作处于 `outcome_unknown` 时，必须先通过 `inspect_action` 核查真实状态，诚实告知用户哪一步已有成功回执、哪一步仍待确认，绝不静默重复扣款或重复提交。

---

## 5. 完成度回看与自我修复（Completion Review & Non-Intrusive Repair）

在主模型准备结束回合时，若本轮涉及工具调用、长文多项托付（`>8000` 字或显式约束）、对外草稿、笔记并发修改或退出清理，宿主会触发 [`reviewCompletion`](../../../../src/main/runtime/completion-review.ts)：
- **伙伴式回看，而非机械重写**：回看器只检查是否有**漏掉的明确托付（`missing`）**、**与工具真实观察相矛盾的事实宣称（`contradictions`）**（例如工具返回 `not_connected` 却说「已经帮你发过去了」，或未读原文却编造页码）以及**回合中刚发生的笔记修改（`unseenNoteChanges`）**。
- **保留角色原声续改**：若发现缺口，宿主最多通过同一 Hermes 引擎续接 2 次（`:continuation:1`, `:continuation:2`）。先前随工具流式说出的前段、已展开的视图（`PresentationView`）和已完成的稿件均完好保留；仅将可替换尾段（`replaceableTail`）交由角色自己按原有的语气补齐或更正，**绝不用第二个冷冰冰的审查模型去篡改角色的文风与温度**。

---

## 6. 二十条系统核心不变量（The 20 System Invariants `INV-01` – `INV-20`）

任何后端修改必须满足以下 20 条硬性不变量（对应自动化测试与评估门禁）：

- **`INV-01`（原文不可篡改与码位精确）**：`SourceEvent` 的逐字原文与 Unicode 码位区间一旦落库不可静默篡改；引用必须精确对齐码位。
- **`INV-02`（独立证据根防膨胀）**：同一 `root_event_id` 的多次复述、摘要或子代理转述，不能增加 `independentRootCount`。
- **`INV-03`（双时态与例外隔离）**：单日/短期例外（`ADD_EXCEPTION`）不得覆盖或删除长期常态断言（`Assertion`）。
- **`INV-04`（阻碍假设可证伪）**：`DecisionExperience` 中的拒绝原因（`FrictionHypothesis`）在前提改变时必须可失效，不得演变为永久禁令。
- **`INV-05`（六阶段协作状态不冒充）**：`generated`、`rendered`、`seen`、`understood`、`accepted`、`executed` 严格区分；UI 选中、拖动或浏览不等于接受或完成。
- **`INV-06`（`local_only` 零出网）**：标记为 `local_only` 的输入或附件，在任何阶段（含前置控制解析、意图分类、检索、生成）均不得发往云端 Provider。
- **`INV-07`（`session_only` 阅后即焚）**：`session_only` 回合不落盘对话历史、不进后台记忆队列、不在会话结束后残留协议链缓存。
- **`INV-08`（遗忘屏障全链路生效）**：`privacy_epoch/fence`变更后立即阻断受影响内容继续采用，再沿真实依赖清理存储、索引、编译包、草稿及在途结果；保留独立未删片段。物理清理、备份与离线设备各有状态，不把普通修订或当前阻断冒称全部副本瞬间擦除。
- **`INV-09`（外部文本与角色卡零指令权）**：附件、工具输出、校园通知、外部角色卡永远作为 `data` 隔离，不得开启权限或触发未授权工具。
- **`INV-10`（主模型零词法阉割）**：不得因情绪词、年龄词或正则匹配剥夺主模型的工具访问权或分析深度。
- **`INV-11`（子代理权限单调收窄）**：`delegate` 子代理权限必为父 `ScopeHandle` 子集，只读、无副作用、共享总预算，且用途必须锚定根用户原话。
- **`INV-12`（日历完整占用与窗外未知）**：排程必须包含准备/收尾/转场/休息与保护占用；查询时间窗之外的时间段不得推断为空闲。
- **`INV-13`（CAS 乐观锁与短票据校验）**：所有状态更新（日历、笔记、互动程序局部状态、对外草稿）必须校验 `expectedRevision`；过期 `planRef` 不得执行。
- **`INV-14`（`outcome_unknown` 先核查后恢复）**：结果未知的动作不得自动盲目重发；已有 `confirmed_success` 回执的动作在局部报错时必须诚实保留。
- **`INV-15`（对外披露最小化与草稿诚实）**：`audience !== 'self'` 时必须经由 `ReleaseBrief` 隔离投影；忙闲投影不泄露私人标题；未接通发送通道时绝不宣称「已发送」。
- **`INV-16`（校园数据口径诚实）**：区分有效体育打卡与原始记录、区分天气降水与 AQI、区分不同 GPA 算法、保留校园卡原始数值单位、区分真实导航几何与故事插画。
- **`INV-17`（未读不装已读）**：预览、标题、目录、截断页或检索命中不等于已读全文；缺口必须如实反映在 `ContextReceipt` 与回复中。
- **`INV-18`（流式节奏与脱敏前置）**：所有流式输出片段在抵达 UI 前必须完成凭据脱敏与来源有效性检查；工具前段与终稿自然衔接不重说。
- **`INV-19`（主动陪伴克制与固定提醒必达）**：持续照看遵守 `noveltyKey` 去重与安静时段；明确设定的固定时刻提醒独立准时触发。
- **`INV-20`（零鸟言鸟语与人格连贯）**：主界面与角色正文中绝不泄漏内部校验码、完成度分数、工程术语或万能客服套话。
