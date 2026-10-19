# 个人方法与模型资料发现：本轮机制取舍

日期：2026-10-18。基线为 `e4254aa` 及当前未提交工作树。本记录描述本轮源码与接线约定；按用户最新目标不运行测试、类型检查、构建、模型或账户验证，不能将下面的实现意图写成实际运行结论。

## 原有入口与本轮差异

原产品已有十份 bundled 工作方法，`discover_skills` / `read_skill` 已支持按需发现、能力需求、连接状态及同用途替代路径。原生“留下”资料入口已有 TXT / Markdown / PDF 保存、文字层分页、原页像素、并排阅读、引用、查找和恢复。本轮并非第一次接入技能或文件阅读。

本轮新增两处窄能力：用户明确选中的个人方法沿原 `h_work` owner 保存、修订、停用，再进入同一方法目录；模型通过 `materials.describe` 的有界目录找回已经提供的文件，通过 `materials.find` 定位确切原话。没有新增页面、文件系统访问权限或可执行插件机制。

## 候选与依据

[Agent Skills 规格源码](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx)将描述、方法正文和附加资源分层加载，并允许脚本和参考文件。[Anthropic 的原始工程说明](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)解释了先发现少量描述、需要时再加载方法正文的做法。这支持按需提供程序性知识；它们没有为本产品规定私人来源的保留或执行许可。

| 候选 | 本轮判断 |
| --- | --- |
| 把所有方法永久塞进系统提示词 | 不采用。目录和按需正文已存在，全量加载增加不相关内容，也让被撤回的方法难以沿原来源退出。 |
| 通用技能市场与脚本安装 | 不采用。当前需求是保留本人选择的做法；安装代码、运行脚本和新增账户权限是另一项明确工作。 |
| 自动从成功聊天生成永久“经验” | 不采用。一轮顺利不证明用户选择以后都如此；也不能用模型自评替用户固定规则。 |
| 来源绑定、可修订的方法文字 | 采用。方法归原工作记录，与人物事实、角色核心、长期托付和已接受日历对象分开。 |
| 把文件摘要再存成模型资料事实库 | 不采用。原件、引用和删除沿原 MaterialService；摘要不能代替原件的条件或图像覆盖。 |
| 当前许可下的有限目录与精确定位 | 采用。先找到原地址，再回读正文；未命中保持明确检索覆盖，不冒充语义无关。 |

以上取舍是本项目的工程判断，不是外部来源对效果的实验证明。

另实读固定[Voyager SkillManager](https://github.com/MineDojo/Voyager/blob/55e45a880755d0c8c66ca7fb5fe7962ac8974f89/voyager/agents/skill.py)的描述检索与代码保存路径，以及[LangMem metaprompt](https://github.com/langchain-ai/langmem/blob/48e3c11f5bb527282c7d5339c6a87a0b35abccfc/src/langmem/prompts/metaprompt.py)从实际轨迹提出必要修订的路径。借鉴目录→按需正文与有依据的最小修订，不照搬自动保存/运行代码或模型自行改系统提示词；一次成功也不成为本人选择以后照做的许可。

## 个人方法契约

`runtime/personal-methods.ts` 接受 `save` / `revise` / `disable`。`source` 必须是本轮本人原话的 event、contentVersion、Unicode 范围与逐字引文；附件或网页不能自行授予保留许可。名称、描述、步骤、条件、禁止项及已注册工具需求由 `source` 与声明 `supports` 一起支持，语义充分性由 coordinator 原有有界委托核验负责。宿主在保存前再次核当前来源和完整支持集合。

持久方法保存为 `recipe_candidate` / `data.type=personal_method` 的 `WorkRecord`，带原 `WorkSourceBinding`，不写 Assertion、不执行代码、不读需求来源、不改角色和日历。临时会话不持久保存；普通当轮要求可以直接照做。`save` 的原请求有幂等记录，重复请求不重复建对象。`revise` 使用 expectedRevision，已停用对象仍保持停用。`disable` 只读对象元数据并复核本次停止原话，不展开旧方法；没有“修改即恢复”路径。

`catalog` 只从当前本人、现实、私有、允许 work / evidence 的 active 原工作记录读取，继续应用仓库已有来源与用途过滤。方法描述进入模型时由 coordinator 记录实际交付记录的来源；`read_skill` 返回版本、hash、需求状态及明确的 guidance authority。来源改变或被遗忘后沿原工作记录可读门和永久清理退出，不建立另一套事实库。

实际交付的 bound Work 另将精确 `WorkSourceBinding` 地址写入同一 ContextReceipt 的 `workSourceBindings`，按 canonical 去重，不复制方法或原话正文。`recordWorkSourceBindings` 用于历史正文和已采用子报告的来源继承；`conversationWorkSourceBindings` 只取得实际交付历史消息的地址，`workBindingsReadable` 沿原 Work 来源门逐项复核。模型前的 `refreshDependencies` 在修复提示开关之前核这些地址，来源更正而 epoch 不变时也拒绝继续传输旧工具正文。普通方法修订或停用不要求历史对应当前方法版本；原来源仍合法的历史解释可以保留。读取历史、消息 IPC／导出复用现有 `planningMessageReadable` 门；永久遗忘沿原清理展开地址重叠及依赖，清受影响派生回复和receipt。旧历史没有这些地址时不伪造补签。

当前 `supports` 是 EvidenceEvent 正文坐标。完整文件导入后的 file event 通常保存宿主 descriptor，`materials.read` 返回的 TXT / PDF 正文并不是这个 descriptor 的可引用字符区间。因此本轮不会把“读过文件”伪装成该文件已支持方法保存：文件方法若尚无可核的正文来源契约，会保持不能据此保存。后续如需支持，应由现有材料 owner 核 SHA、页码／范围及当前许可，而非把文件正文复制进新库或拿 descriptor 补签。

## 模型文件发现与定位契约

`materials.describe` 省略 resourceId 时按文件名 query、类型和收到时间过滤；每页最多 12 项，最多扫描 200 个候选，返回不透明 nextCursor。query 只匹配文件名。目录仅有文件地址、SHA、版本、收到时间及现有 `materials.read` 参数，不读文件正文。

游标绑定主体、workspace、world、audience、用途、来源、grants、retention、当前事件及隐私／策略版本，最长保留 30 分钟且不超过原 scope 期限，进程重启不恢复。宿主为已提交的本机文件分配进程内提交序列；首屏冻结序列上限，新提交文件不移动旧页，每项仍核当前来源。这个序列也覆盖不落盘的临时会话文件，不依赖它们在持久 `h_evidence` 中有行。未发送草稿和公开 PDF 不进入本机模型目录；公开 PDF 继续走 research owner。空 partial 页若仍有 cursor 可以继续；换范围须重新开始。

`materials.find` 是有界确切文字查找，文字文件使用原 Unicode 坐标，PDF 仅搜索指定页文字层，返回至多 12 个短上下文、nextOffset、nextPage 和回读入口。不判断语义相关，不证明全文已读，也不搜索扫描图像。片段凭据检查、文件 SHA 与来源复核复用原实现。普通 `materials.read`、`materials.observe`、原生资料 UI 仍使用同一 MaterialService 与原始字节生命周期。

`skills.ts` 在原十份方法上增加 `document-investigation`，并在原 continuity 方法说明如何明确保留个人做法。方法目录不是生活关键词路由，不阻止模型直接调用简单查询，也不让用户管理文件 ID、游标或方法登记才能继续聊天。

## 整合责任与未验证范围

根代理负责 coordinator、harness、tools 与 repository 的最终整合：本人保留意愿的独立核验、读取用途、上下文预算、实际采用 provenance、来源撤回后的派生正文和永久遗忘均须沿既有入口传递。`workSourceBindings` 已在 shared、ContextCompiler、repository、coordinator 的历史读取与模型前门、后台子报告采用处接线；前台 child 的最终 approved-report 采用由根代理在同时修改的 harness 块合并。材料目录和方法目录不会因为有描述就拥有业务行动许可。

本轮未运行任何检查命令、模型、真实账户或 UI；临时文件目录、分页边界、Unicode 定位、修订／停用／幂等、当前用途和遗忘仍未实际操作验证。旧 bundled 方法、原生资料阅读及历史检查结果不能升级为这些新增行为的通过证据。没有新增或扩展测试、fixture、runner，也没有任务产生的临时文件需要清理。
