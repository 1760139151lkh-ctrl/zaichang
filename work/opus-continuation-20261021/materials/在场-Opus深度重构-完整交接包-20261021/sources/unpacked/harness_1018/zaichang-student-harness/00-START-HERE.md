# 在场 · 学生生活 Harness 实施提示词包

**目的：让 Codex 在现有在场代码上，真正做出会理解情境、主动准备、自然相处、持续修订的学生生活助理。**

交付日期：2026-10-18。版本：1.0。审阅仓库：`1760139151lkh-ctrl/zaichang`，基线 `ba73b049089af718d337076364c6db0f98776d4f`。

## 怎么使用

1. 解压整个包，保留目录关系。把它放在仓库外或已经忽略的本地目录；本包含私人项目审阅，不要整包提交或发布。
2. 在 Codex 中打开「在场」实际 checkout，让 Codex 能读到这个解压目录。
3. 将 [01-CODEX-START-PROMPT.md](01-CODEX-START-PROMPT.md) 从“任务”起的正文发给 Codex。它会按固定基线重新核对当前代码，沿 06 的 T0–T7 完成核心改造和验证。
4. 若换会话继续，附上同一包及 Codex 上次的实际变更/验证记录，使用下面的续做提示，不必重新从头设计。

> 继续执行《在场·学生生活 Harness 实施提示词包》。先读 01 与上次实际变更/验证记录，检查当前代码差异；保留已经完成的工作，继续 06 中尚未完成的 T0–T7。找到并修复真实断点，不增加场景关键词分支。对缺环境只标受影响的验收，不把其它核心工作停在计划。交付实际代码、体验和验证结果，后续外部生产连接按 T8 处理。

这不是要用户一次阅读完所有材料。看当前进展先读 02；理解产品路线读 03–05；直接开始开发用 01 和 06；设计争议查 07 与 evidence；要检查“换一个条件还成立吗”看 08 和时间线。

## 本轮最重要的判断

现版已经有真实 Hermes 主循环、有限子代理、证据化记忆与纠错、本地日历/提醒、主动关注、地图和工具适配。用户记忆中的“目前只做了地图、GPS、天气”低估了当前代码进展。下一步应把这些能力接成持续的生活协作，不能照旧讨论推翻已修正的主路径。

需要补足的核心包括：有来源且及时更新的情境；从广义托付派生关注并发现陌生新机会；因时间窗而重新判断；可行与局部的规划；跨渠道不重复的帮助；可编辑人格与学习记忆分工；正确的缓存失效和异步结果回收。当前已复现的词面云端限制误判、静态可见的变化出口截断等，均落实到具体改造入口。

“主动”既包括发现考试换楼、准备路线，也包括把完整休息留给人、带来感兴趣的好消息、等下课再说、接受拒绝后自然相处。它不是通知越多越好，也不是用户每次点名技能才开始动。

## 文件导航

| 文件 | 用途 |
|---|---|
| [01-CODEX-START-PROMPT.md](01-CODEX-START-PROMPT.md) | 可直接发送给 Codex 的主实施提示词 |
| [02-REPOSITORY-AUDIT.md](02-REPOSITORY-AUDIT.md) | 当前真实进展、9 个改造问题/风险、固定提交源码链接 |
| [03-HUMAN-AND-WORLD-MODEL.md](03-HUMAN-AND-WORLD-MODEL.md) | 十二维人与环境模型、覆盖依据、推断边界 |
| [04-HARNESS-DESIGN.md](04-HARNESS-DESIGN.md) | 情境、广义托付、机会、规划、地图、连接器与运行方案 |
| [05-MEMORY-CONTEXT-PERSONA.md](05-MEMORY-CONTEXT-PERSONA.md) | 原文/记忆、四类缓存、人格式样与现有子代理接法 |
| [06-IMPLEMENTATION-AND-ACCEPTANCE.md](06-IMPLEMENTATION-AND-ACCEPTANCE.md) | T0–T7 核心工作单、T8 后续里程碑、分层验证 |
| [07-RESEARCH-DECISIONS.md](07-RESEARCH-DECISIONS.md) | 20 个来源条目：读了什么、借鉴什么、不能证明什么 |
| [08-SCENARIOS-128.md](08-SCENARIOS-128.md) | 128 个可读的合成情境，16 领域，每条含反事实与验收 |
| [09-REVIEW-AND-LIMITS.md](09-REVIEW-AND-LIMITS.md) | 本轮实际打磨、范围与未验证项 |
| [contracts/design-types.ts](contracts/design-types.ts) | 逻辑数据契约草案，先映射已有类型，不是即插即用实现 |
| [examples/persona-presets.json](examples/persona-presets.json) | 三个人格预设与自定义空白项，不含用户真实画像 |
| [examples/configuration-proposal.json](examples/configuration-proposal.json) | 配置责任示例，保留已有用户设置 |
| [scenarios/scenarios.json](scenarios/scenarios.json) | 128 场景的机器可读版本 |
| [scenarios/scenario-schema.json](scenarios/scenario-schema.json) | 该版本语料的字段约束 |
| [scenarios/timelines.json](scenarios/timelines.json) | 12 条逐步事件轨迹，当前输入与裁判信息分离 |
| [scenarios/timelines-guide.md](scenarios/timelines-guide.md) | 连续评测运行方式与能力边界 |
| [evidence/repo-retrieval-manifest.json](evidence/repo-retrieval-manifest.json) | 110 份源码/文档读取清单与内容哈希 |
| [evidence/attachment-intent-audit.md](evidence/attachment-intent-audit.md) | 附件演变、用户最后纠错、旧报告的证据边界 |
| [evidence/current-memory-attention-audit.md](evidence/current-memory-attention-audit.md) | 当前记忆/语义/主动性的详细静态审阅 |
| [evidence/cloud-restriction-probe.md](evidence/cloud-restriction-probe.md) | 本轮已执行的局部探针范围与复查方法 |
| [evidence/research-review.md](evidence/research-review.md) | 独立架构研究审查与采纳记录 |
| [evidence/implementation-review.md](evidence/implementation-review.md) | 独立实施一致性审查与六项修正 |

## 使用时不要混淆

场景中的学校规则、时间、天气、人物、情绪与生活习惯全部是合成资料。不得导入真实用户 profile，也不能把场景预期答案喂给被评测模型。场景模式 offer/ask/act/wait/silence/correct 是评价用分类，实际运行映射既有 attention 状态和工具结果即可，不要求建立第七层分类器。

types/config/persona 是拟实施样例，字段名可随现有代码调整；事实来源、版本、范围和回执语义不能丢。明确用户提醒、随事项变化的授权派生提醒、尚未承诺投递的主动候选分别处理。已有范围足够时直接做；真正缺了关键授权或事实时才询问。

本包完成的是仓库与附件审阅、研究、建模、方案、场景、提示词和文档打磨。本轮未改仓库，未运行完整应用/生产模型/手机/校园 API。源码里有测试不等于本次已执行；当前 isolated probe 只证明一个局部函数的输入输出。详细边界见 09。

需要复核文件结构时，可在解压目录运行 `python3 evidence/validate-package.py`。它仅检查包内编号、字段、相对链接和事件时间顺序，不调用模型或测试项目；本次结果保存在 [package-validation.json](evidence/package-validation.json)。
