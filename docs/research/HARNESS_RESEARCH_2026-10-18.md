# Harness 研究依据与实施取舍 · 2026-10-18

对应 [需求、机制与实现边界](../HARNESS_EVOLUTION.md)，起始在场版本为 `e16d3fe575feb4edef72f42bc6a129bc3d6b58fe`。本文记录实际读取的一手代码、规范和论文，以及它们如何影响本轮实现。读取上游代码不等于运行过整个项目；源码可证明某段机制存在，不能证明产品长期质量。这里不收录私人讨论全文、测试用户资料、凭据或上游完整源码副本。

## 研究范围与证据约定

本轮并行研究记忆、主动调度、工具/技能/人格、日程规划，并独立审计当前在场的真实机制。用户提供的最新提示词包、128个场景和12条时间线用于理解需求及构造验收反例，不当作已经通过的运行结果。前端动效资料只用于核对事实、对象、版本及动作所需的后端契约；未读取前端参考图片，也未开始新页面实现。

固定 commit 的链接可以直接回到读取版本。日程研究的七个源文件经 GitHub 在 2026-10-18 读取分支内容，另外记录所得原字节的 Git blob SHA-1；blob 标识内容，不能冒充仓库 commit。未固定版本的规范标明读取日期。对只读摘要、未读全文或名称不确定的来源明确限制推论。

在场运行时仍锁定 Hermes 0.21.2、commit `d595e636c83aa0b9606d4e914e1140ae9c796897`。本轮研究到的 Hermes 新版 `22063fc…` 只是比较材料，没有据此静默升级引擎或假定新接口已存在于锁定版。

## 记忆：保留原话、条件与可撤销理解

原文、带条件理解、工作事项和日历业务对象继续各有明确身份；不为“增强记忆”再装一套平行人物档案。读取了项目完整记忆讨论、最新记忆设计、粘贴说明及实际仓储实现，将条件、原因、例外、数值、期限、现实/假设、本人/他人、声明/推断/执行结果分离作为必须保留的要求。

| 实际读取的一手来源与固定版本 | 学到的机制 | 没有照搬的部分 / 在场对应修改 |
| --- | --- | --- |
| Letta Code `7be3c81f9cfce481994fe4484d59a5bf17cdb48a`：[memory-worker.ts](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/agent/subagents/memory-worker.ts)、[conflict repair](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/agent/memory-conflict-repair.ts)、[MemFS](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/agent/memory-filesystem.ts)、[worker prompt](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/agent/subagents/builtin/memory-v2.md) | 私有worktree、取消清理、提交后再同步读者；attempt身份与锁比较避免迟到修复覆盖新状态 | 不把私人记忆迁成Git，也不声称Git删除已清干净历史。在场复用SQLite、版本和隐私屏障；`MemoryService`区分暂时失败与无新事实，持久恢复元数据使未完成段继续处理 |
| Mem0 `0724291bd864cf807e88ee8981c8226644e8fb42`：[main.py](https://github.com/mem0ai/mem0/blob/0724291bd864cf807e88ee8981c8226644e8fb42/mem0/memory/main.py)，`_add_to_vector_store/update/delete` | 实际V3 add走`ADDITIVE_EXTRACTION_PROMPT`并创建新UUID；hash去重、批量失败后单条回退、返回成功清单；显式update/delete另有路径 | docstring提到更新删除不等于add自动纠错；近邻top-k不等于完整冲突集合。在场保留显式操作，提取幂等从数组序号改为规范提案内容hash，不将空结果当可靠无事实证明 |
| MemOS `a7367d07e55db61099f7b4e2c1108bc5831a24f3`：[recall.py](https://github.com/MemTensor/MemOS/blob/a7367d07e55db61099f7b4e2c1108bc5831a24f3/src/memos/memories/textual/tree_text_memory/retrieve/recall.py)、[task_goal_parser.py](https://github.com/MemTensor/MemOS/blob/a7367d07e55db61099f7b4e2c1108bc5831a24f3/src/memos/memories/textual/tree_text_memory/retrieve/task_goal_parser.py)、[memory_update_handler.py](https://github.com/MemTensor/MemOS/blob/a7367d07e55db61099f7b4e2c1108bc5831a24f3/src/memos/mem_scheduler/task_schedule_modules/handlers/memory_update_handler.py) | graph/vector/BM25候选按ID合并；查询解析fast/fine可切换，fine失败回退；根据近期问题刷新工作记忆 | 不为每轮强制增加意图模型链，不照搬完整查询与旧新记忆日志。在场先修权限/有效时间在SQL排名分页之前；混合向量召回仍待接入，不宣称已有 |
| MemOS同commit：[manager.py](https://github.com/MemTensor/MemOS/blob/a7367d07e55db61099f7b4e2c1108bc5831a24f3/src/memos/memories/textual/tree_text_memory/organize/manager.py)、[reorganizer.py](https://github.com/MemTensor/MemOS/blob/a7367d07e55db61099f7b4e2c1108bc5831a24f3/src/memos/memories/textual/tree_text_memory/organize/reorganizer.py)、[handler.py](https://github.com/MemTensor/MemOS/blob/a7367d07e55db61099f7b4e2c1108bc5831a24f3/src/memos/memories/textual/tree_text_memory/organize/handler.py) | 摘要关联子来源；冲突经候选召回、模型融合、归档及`MERGED_TO`；失败路径和真实持久结果需独立核查 | `_hard_update`难解时按updated_at删较旧节点，不能代表事实权威；所读整理路径的进程队列及异常后task_done不证明持久重试；返回ID也不等于写成功。在场保留原文与时态，新增`h_memory_recovery`持久公平尝试/退避，局部更正用范围而非整源丢弃 |
| Graphiti `417c3a125ae3ac53c19b8e53fffaccf3e665a88e`：[edges.py](https://github.com/getzep/graphiti/blob/417c3a125ae3ac53c19b8e53fffaccf3e665a88e/graphiti_core/edges.py)、[edge_operations.py](https://github.com/getzep/graphiti/blob/417c3a125ae3ac53c19b8e53fffaccf3e665a88e/graphiti_core/utils/maintenance/edge_operations.py)，`resolve_extracted_edges/_apply_temporal_invalidation/resolve_edge_contradictions` | valid_at/invalid_at/expired_at/reference_time分开；保留invalidated_by，比较有效区间，迟到旧事件不无条件覆盖新事实 | 图本身不会区分纠正与未来变化，过期边不等于删除所有副本。在场让现有Assertion有效期参与查询；schema v6保存被更正原句位置，`BasisService`按有效时点失效相交依据，不误伤独立事实 |
| 小型独立评测 agent-memory-bench `0d5d225504865e81467b7d8cb4724c15c1f41664`：[mem0_adapter.py](https://github.com/hamza-dev-tech/agent-memory-bench/blob/0d5d225504865e81467b7d8cb4724c15c1f41664/membench/adapters/mem0_adapter.py)、[judge.py](https://github.com/hamza-dev-tech/agent-memory-bench/blob/0d5d225504865e81467b7d8cb4724c15c1f41664/membench/judge.py) | 版本、查询配置、提取成本和LLM judge分开；字符串不一致标记不等于完整正确性判定 | 不拿小样本榜单宣布通用最强，不把记忆检索一题正确等同交互生命周期可靠。在场分别报告机制、真实模型、外部来源与长期使用证据 |

论文用于设计验收，不移植成绩：

- [LongMemEval，2410.10813 v2](https://arxiv.org/html/2410.10813) 区分事实提取、跨会话推理、时间推理、知识更新和拒答；启发原文与派生事实并行取证、候选召回与最终回答分别检查。查询时间抽取本身也会错。
- [MemoryAgentBench，2507.05257 v4](https://arxiv.org/html/2507.05257)，读取2026-06-28版，区分准确检索、测试时学习、长程理解与选择性遗忘。较新事实覆盖不等于隐私彻底删除，多跳更新不能只靠更激进的覆盖提示。
- [Redis AI Research原始LongMemEval实验](https://redis.github.io/redis-ai-research-public/longmemeval-agent-memory/) 支持在其配置下原始片段与派生事实共同读取；页面混列实测与公开参考，成本排除基础设施，不能变成严格跨产品排名。

本轮落地的是连续恢复、提案重排幂等、有效条件先于排序、超过50条的真实分页、完整问题bigram、局部纠正原文仍可检索、改名predicate不能复活已纠正原句、持久公平退避，以及依据失效传播。源限制仅存证据ID、内容版本、Unicode位置和时间，不复制私人正文；旧记录缺定位明确`rangeUnknown`，不编造范围。追加的`ContextCompiler.sourceProjection`在模型可见序列化与回执之前缩小来源：只有片段授权时，不释放完整派生摘要、隐藏片段命中或片段外限制名称。

检索仍为字面bigram及原文路径，`vectorSearch:not_connected`如实返回；语义近义、隐喻、跨语言、实体别名和长期效果尚待验证。内容hash不是语义等价判定；完整“当时系统知道什么”的recorded-time回放、大规模多年历史性能、跨设备同步及备份清理均未因本轮机制修复而自动完成。

## 主动性：何时准备、何时出现、如何恢复

| 实际读取的一手来源与版本 | 学到的机制 | 没有照搬的部分 / 在场对应修改 |
| --- | --- | --- |
| OpenClaw `d35923f624281f2cd75a27bdfcfee46aec100b2c`：[scheduler](https://github.com/openclaw/openclaw/blob/d35923f624281f2cd75a27bdfcfee46aec100b2c/src/infra/heartbeat-runner-scheduler.ts)、[execution](https://github.com/openclaw/openclaw/blob/d35923f624281f2cd75a27bdfcfee46aec100b2c/src/infra/heartbeat-runner-execution.ts)、[cooldown](https://github.com/openclaw/openclaw/blob/d35923f624281f2cd75a27bdfcfee46aec100b2c/src/infra/heartbeat-cooldown.ts)。scheduler/cooldown全文，execution相关段落 | 唤醒来源、工作所属会话及交付归属分开；事件合并、忙碌延后与成功结束不能混为一谈；冷却状态要防抖 | 工程冷却不是用户生活重要性的评分。在场新增 `opportunity-scheduler.ts` 单定时器与 `AttentionService.nextReviewAt/settleReview`；沿同一个主循环，不另建生活关键词引擎 |
| Hermes `22063fc099ec9ad8357d7f8f6e6248a0400680d3`：[scheduler_tick.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/cron/scheduler_tick.py)、[jobs.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/cron/jobs.py)。前者全文、后者恢复/时间相关段落 | 持久时标先推进，再执行；锁与恢复检查共同避免重复发起 | 先推进仍有“推进后、执行前崩溃”的取舍，不是 exactly-once 证明。在场持久化机会复核与退避，不把内存 timer 当工作真相，也不把 cron 当语义主动性 |
| 独立 Android Muse `d75da15c3ff305d82ae9bd4a7dbb65e34ef520ce`：[ProactiveScoreEngine.kt](https://github.com/Zer0Qing/Muse/blob/d75da15c3ff305d82ae9bd4a7dbb65e34ef520ce/app/src/main/java/io/zer0/muse/data/proactive/ProactiveScoreEngine.kt)、[Runner](https://github.com/Zer0Qing/Muse/blob/d75da15c3ff305d82ae9bd4a7dbb65e34ef520ce/app/src/main/java/io/zer0/muse/schedule/ProactiveMessageRunner.kt)、[Worker](https://github.com/Zer0Qing/Muse/blob/d75da15c3ff305d82ae9bd4a7dbb65e34ef520ce/app/src/main/java/io/zer0/muse/schedule/ProactiveMessageWorker.kt) | 评分曾经历几乎不触发与几乎总触发两类边界问题；runner互斥、持久下次时间、退避；worker承认移动后台至少15分钟及Doze延迟 | 不照搬24小时强制发消息，不把助理输出的mood标签认作用户情绪。在场增加跨托付公平、临期优先、`on_request`阻断旧候选；不承诺手机秒级后台 |
| [ProactiveAgent，ICLR 2025原论文](https://proceedings.iclr.cc/paper_files/paper/2025/file/75c37811e830bf029584b1c6fac17726-Paper-Conference.pdf) | 正确沉默也应计入评价，触发灵敏并不代表帮助准确；任务、观察、主动时机需一同测试 | 不迁移论文分数或用调用次数衡量温暖。新增机制测试含忙碌、暂停、撤销、失败、过期、队列容量和重启反例 |
| [ProActor，ACL 2026论文页](https://aclanthology.org/2026.acl-long.832/)，只读取摘要，PDF未成功读取 | 主动时机可按有用窗口描述 | 仅用于 earliest-useful/latest-useful 的验收建议，不引述未读实验与内部算法 |
| [Horvitz，CHI 1999一手论文](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz.pdf) | 目标不确定性、注意力、延迟收益、打扰成本与可终止性需要共同考虑 | 不增加用户维护评分的面板；保留准备、等待、询问、行动及不介入，撤销和改变主意优先 |

历史 issue 用来补反例，不能认作现行版本仍有同一缺陷：[OpenClaw #64016](https://github.com/openclaw/openclaw/issues/64016) 是关闭的心跳过密报告；[Hermes #24289](https://github.com/NousResearch/hermes-agent/issues/24289) 是旧0.13.0时区提前报告，根因未确认且已关闭。它们支持测试频率与时区，不支持断言上游目前不可靠。

附件的 [Meta Muse原始介绍](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) 与上述 Android 开源项目不是同一产品。Meta页面没有公开足以复用的完整记忆/调度实现；[Grok Bot官方介绍](https://x.ai/news/introducing-grok-bot) 同样只提供方向。用户本轮所说 Growth Bot 尚未确认唯一官方源码，因此没有把第三方转录或同名仓库的内部架构归给它。这里采用用户希望“主动承担、主动查资料、主动推进”的目标，并用实际源码审查实现路径。

## 技能、工具、子代理与人格

| 实际读取的一手来源与版本 | 学到的机制 | 没有照搬的部分 / 在场对应修改 |
| --- | --- | --- |
| Hermes `22063fc…`：[skills_tool.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/tools/skills_tool.py)，`_skill_catalog/skills_list/skill_view` | 元数据目录与正文按需分离；目录缓存与读取时平台/禁用状态检查不同 | 该版读取技能可预处理模板并安装依赖，本轮不采用。新增 `runtime/skills.ts` 六个只含指南的内置方法，版本/hash及当前能力状态随结果返回 |
| Hermes `22063fc…`：[delegate_tool_toolsets.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/tools/delegate_tool_toolsets.py) | 父子工具集相交，展开后再次拒绝写记忆、发消息、cron、递归委派等工具 | 不套用通用terminal/file/web/MCP继承；在场后台调查来源是父托付范围子集，权限由宿主注入，子代理不能自行写业务对象 |
| Hermes `22063fc…`：[delegate_tool_tasks.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/tools/delegate_tool_tasks.py)、[delegate_tool_child_run.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/tools/delegate_tool_child_run.py) | 批量启动前校验；输出schema最多修复一次；`completed`可同时有`schema_valid:false`，迭代耗尽有独立原因 | 子任务“返回文字”不等于调查完整或证据有效。沿锁定协议接只读子任务，父端采用前核对版本、范围、取消和实际材料；不假定新版API可直接用 |
| Hermes `22063fc…`：[delegate_tool_results.py](https://github.com/NousResearch/hermes-agent/blob/22063fc099ec9ad8357d7f8f6e6248a0400680d3/tools/delegate_tool_results.py) | 剩余父上下文与静态上限共同约束摘要；截断、可展开文件和成本明确记录 | 不给任意文件路径，不让截断摘要冒充全量证据；在场保留受范围控制的来源回读和有界材料 |
| Letta Code `7be3c81f9cfce481994fe4484d59a5bf17cdb48a`：[recall_subagent_local.md](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/agent/prompts/recall_subagent_local.md)、[context-budget.ts](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/agent/subagents/context-budget.ts) | 搜索后按游标展开前后文，核对日期、当时结论；截断保留目录和说明 | 不采用all-agents或裸历史文件权限，不把4字符/token估算当中文可靠上界。`memory-investigation`沿当前scope展开原文、检查时序和例外 |
| Letta Code同commit：[skill.ts](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/tools/impl/skill.ts)、[subagent-tool-policy.ts](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/tools/subagent-tool-policy.ts) | 技能来源有解析优先级，资源清单显式截断；子代理深度限制从工具面收缩 | 在场先使用审核过的内置指南；未实现任意外部技能安装或无限递归。技能存在、来源连接、当前授权和数据覆盖是不同状态 |
| Letta Code同commit：[letta_local_memfs.md](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/agent/prompts/letta_local_memfs.md)、[initial-memory.ts](https://github.com/letta-ai/letta-code/blob/7be3c81f9cfce481994fe4484d59a5bf17cdb48a/src/backend/local/initial-memory.ts) | persona/self、用户知识、技能和历史分层；初始化拒绝路径碰撞 | 不采用模型自由改写用户指定角色核心。`shared/persona.ts`保持明确角色、用户事实、互动推断与当轮语气独立 |
| LangGraph `0870f5efcec9d486046ae8abce0735aa7d1f3b79`：[tool_node.py](https://github.com/langchain-ai/langgraph/blob/0870f5efcec9d486046ae8abce0735aa7d1f3b79/libs/prebuilt/langgraph/prebuilt/tool_node.py)、[_retry.py](https://github.com/langchain-ai/langgraph/blob/0870f5efcec9d486046ae8abce0735aa7d1f3b79/libs/langgraph/langgraph/pregel/_retry.py) | 先剥离模型伪造的隐藏参数再由宿主注入；中断传播；分类重试、退避与尝试内图写入清理 | 图内清理不撤回外部副作用。在场不新装LangGraph，保留现有scope、取消、幂等与回查；`recover-action`明确结果未知时不能盲重发 |
| [Agent Skills规范](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx)，2026-10-18读取main，未固定commit | 元数据、正文、附属资源渐进加载；`allowed-tools`为实验字段 | 声明需求不授予权限。`discover_skills/read_skill`按需提供方法，不以词命中代替模型语义，也不强迫简单请求加载指南 |
| [RoleLLM，ACL Findings 2024](https://aclanthology.org/2024.findings-acl.878/)、[InCharacter，ACL 2024](https://aclanthology.org/2024.acl-long.102/) | 角色档案、背景知识、说话风格可分层；访谈式性格评价不同于只看词句模仿 | 不迁移论文评分，不声称覆盖用户指定角色。新增显式 `visualBinding`，例句加载事实前提；不同风格仍共享同一事实、权限和动作回执 |
| InCharacter `f554202a94d4a83dc5407245bb18981899e872e6`：[ChatHaruhi.py](https://github.com/Neph0s/InCharacter/blob/f554202a94d4a83dc5407245bb18981899e872e6/code/ChatHaruhi/ChatHaruhi.py)，`generate_messages/add_story/add_history` | 角色system、检索经典场景与当前历史分别装入上下文和预算 | 经典剧情不是与现实用户共同经历。角色示例不能把“安排好了”的范句变成未经执行的成功事实；前端外观选择接线仍待后续 |

角色验收应给不同角色相同事实与工具回执，比较表达辨识度、当轮语气服从、失败如实说明、是否捏造共同经历及多回合稳定性。配置字符串不同只能证明配置不同，不能证明模型已形成稳定性格。

## 日程：可复核的多任务草案

以下七项代码均在2026-10-18读取。表中的SHA为所得文件原字节的Git blob SHA-1，链接仍指分支，不代表整个仓库已经固定到该版本。

| 来源 / 内容版本 | 学到的机制 | 没有照搬的部分 / 在场对应修改 |
| --- | --- | --- |
| [Super Productivity blockers](https://github.com/super-productivity/super-productivity/blob/master/src/app/features/schedule/map-schedule-data/create-sorted-blocker-blocks.ts)，blob `e53593c56ec4c5e41b29513abfe1ecde8e6d23bf` | 真实固定任务、外部日历和重复投影合并，按occurrence去重、本地日期推进 | 不照搬跳过全天事件的产品策略；`planning-draft.ts`复用在场真实实例与已接受承诺，不重造日历 |
| [Super Productivity normal tasks](https://github.com/super-productivity/super-productivity/blob/master/src/app/features/schedule/map-schedule-data/create-schedule-view-entries-for-normal-tasks.ts)，blob `7d36d525986468ebcdb636264e2d6a527b125a65` | 剩余任务量投影成时间条目 | 视图生成不等于用户接受；本轮草案保持`applied:false`、未排项和既有动作通道 |
| [Super Productivity remaining time](https://github.com/super-productivity/super-productivity/blob/master/src/app/util/get-time-left-for-task.ts)，blob `2d6e1e57e4811b96863bd62d5deda989a43bc960` | 叶任务估时减实际投入，剩余不低于0；父子任务语义另行处理 | 时间耗尽不自动认定事情完成。在场由模型读真实进度形成输入，时长未知不默认一小时 |
| [Cal.com getBusyTimes](https://github.com/calcom/cal.diy/blob/main/packages/features/busyTimes/services/getBusyTimes.ts)，blob `6a39cbb5b85006d233f2259a4acc0350f5c973ae` | 现有与待排对象缓冲共同占用空间；重排排除自身；来源失败显式保留 | 源码仍有窗口边缘查询FIXME，不作为无缺陷实现。修复在场`availability.ts/planning.ts`转场口径，草案保留来源覆盖与真实占用 |
| [OR-Tools optional intervals](https://github.com/google/or-tools/blob/stable/ortools/sat/samples/optional_interval_sample_sat.py)，blob `b130e3b79fd041f6f847541c52fc2f8eab14b3a6` | 是否排入为独立决策，可选interval无需全部存在 | 不塞满一天、不引入Python求解器。当前有界构造明确未排事项，保留空白与休息 |
| [OR-Tools job shop](https://github.com/google/or-tools/blob/stable/ortools/sat/samples/minimal_jobshop_sat.py)，blob `a79406febd49176474364c5697f41eee1d91e849` | interval/no-overlap/前置依赖分别建模 | 不把工厂最短完工当个人生活目标。多任务统一占用资源，前置未完整排入时后置不得先排 |
| [Timefold constraint provider](https://github.com/TimefoldAI/timefold-quickstarts/blob/stable/getting-started/hello-world/src/main/java/org/acme/schooltimetabling/solver/TimetableConstraintProvider.java)，blob `ed1678f92c572c13812e1a549315d702cbf03564` | hard冲突与soft偏好分离，可解释约束理由 | 不把偏好变永久硬限制。草案分开资源/截止等硬约束与偏好窗口，保留原因和条件 |

规范补充同样实际读取，2026-10-18访问：

| 一手规范 | 项目对应边界 |
| --- | --- |
| [Google Calendar条件版本更新](https://developers.google.com/workspace/calendar/api/guides/version-resources) | etag/If-Match可防丢失更新，冲突不应静默重放；一个目标CAS不能保证整个草案窗口仍空闲。采用前必须重新核对日历基线 |
| [Google Calendar增量同步](https://developers.google.com/workspace/calendar/api/guides/sync) | 分页结束才更新syncToken，删除参与失效，410需重建来源镜像；不能重建时误删独立本地安排和原话。本轮没有因此新增Google Calendar连接器 |
| [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545)，§3.6.1/3.8.4.4/3.8.7.4 | 使用非包含结束边界`[start,end)`、稳定UID/RECURRENCE-ID和修订；改开始时间不能把原课次变成新身份 |
| [OR-Tools求解状态](https://developers.google.com/optimization/cp/cp_solver) | FEASIBLE、OPTIMAL、UNKNOWN、INFEASIBLE含义不同；当前构造未找到位置不能声称全局无解或唯一选择 |

当前 `planning.draft` 从真实日历快照、时区、时长区间、依赖、资源窗口、保护空白、休息与出行成本生成只读草案；不是最优化器，也没有自动接受。`planning-application.ts`以最长15分钟的内存票据绑定完整占用，沿原动作入口按顺序采用；保存前在SQLite事务内核对日历全指纹、身份/策略、精确参数及来源版本。准备/收尾、转场、休息、保护时间不能在采用时悄悄删除；没有外部版本复验器则阻断依赖该来源的采用。重启或过期需重算，逐块保存不是跨动作事务，进度必须如实列出已保存范围。

减负、实际连续可用时间已作为参数和约束；条件式顺路办事、自动局部修复、真实馆藏或预约接入仍需各自实现和验证。独立审计发现的空草案过度声称可行、窗口外相邻承诺漏算、草案采用未绑定全日历、只保存核心工时等问题，分别进入可行状态、边界展开与受保护采用的实现和回归。

## 环境与校园数据：有入口不等于有覆盖

[Open-Meteo Air Quality官方文档](https://open-meteo.com/en/docs/air-quality-api) 在2026-10-18全文读取。本轮通过公共校园参考点请求验证HTTP200、24个小时样本及`pm2_5/pm10`的μg/m³、`us_aqi`和`european_aqi`独立单位。请求未使用设备坐标。新增 `capabilities/air-quality.ts` 和 `air_quality.lookup`，复用 `weather:open-meteo` 来源及 `weather:read` 权限，明确缺测、窗口和单位。

这些数据是CAMS模型网格预报，不是校园传感器或本人的暴露测量；US/EU AQI不能改称中国官方AQI。供应商没有返回模型发布时间时保留未知，不能拿抓取时间替代。天气不代替空气质量，位置只在会改变下一步且用途允许时获取。

跑步方面，当前校园资源适配里的`sports/practice_summary`只能证明存在查询分类，不能证明已获得学校有效计次、审核状态、学期分母和实际完整分页。`campus-sports`指南要求先核对这些字段和来源；本轮未使用用户学生认证，也未声称真实有效跑步次数已经查到。未来设备健康/运动记录也须接独立实际来源，不能由聊天猜测生成。

## 独立审计与验证责任

在场本身也是一手源码。对起始commit的机制复现发现：预算耗尽令尾部证据不能恢复；有效时间过滤晚于固定前50条截取；候选数组下标幂等吞掉重排后的新事实；单句更正导致整个证据事件不可搜索；更正后旧依据及主动候选仍有效。修复分别落在记忆模型/服务、SQLite检索与迁移、原文限制定位及`BasisService`，并以相同反例复验。保护无关事实、独立日历和未来生效的替代同样是检查目标。

其他跨模块审计专门检查后台子任务迟到返回、父范围收缩、暂停和记忆更正，避免把子摘要直接视作已完成准备。新增回归还确认`search_context`和`read_understanding`都遵守原文片段授权，子任务真实日程观察可进入父任务准备材料；12项后台专测通过，使用真实锁定Hermes父子调度与合成模型回调。日程审计检查草案出现后新增其他承诺、缓冲与准备占用，避免只有类型正确而实际发生冲突。最终运行命令及总数以 [CURRENT_STATUS](../CURRENT_STATUS.md) 为准，本文不以各代理中途通过记录替代最终全树结果。

真实模型入口当前不可用：没有可用Luna CLI配置/发现路径。没有调用生产DeepSeek或把fixture冒充实际模型。源码研究、SQLite机制测试和合成回调能证明边界与状态转换，不能证明长期记忆、主动时机、角色一致性和陪伴体验已经达标。因此后端完整体验门槛尚未放行；后续先补真实模型与外部连接验收，再按用户要求进入GPT Image先行的界面设计。
