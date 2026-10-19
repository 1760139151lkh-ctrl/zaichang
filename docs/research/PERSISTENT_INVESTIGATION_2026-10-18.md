# 同一项只读调查的原文续读

研究基线：`e4254aa8edf4a9796b006629ad371eee3bf445bb`，2026-10-18。第四批后端源码实施中；本文区分选定契约、已写入源码的接线与尚未运行的验收目标，不以源码存在声称运行通过。持续总目标仍进行。前一批规划／来源成果及其检查范围见[第三批状态](../CURRENT_STATUS.md#personal-memory-round3)。

## 要解决的实际缺口

完整请求把准确、完整、可纠正且不需用户操心的记忆作为核心。[记忆原文](../source-materials/2026-10-18/memory-discussion.txt)第579–599行强调找回工作位置，第2684–2701行要求真实子调查与父助手整合；[持续补充](../source-materials/2026-10-18/ongoing-improvement-20261018.md)要求每轮继续比较与实施非平凡机制。完整记忆、最新桌面Harness及前端原话已重新分段读取，材料内旧门禁、测试开发要求和历史完成回执不覆盖当前用户指令。

当前`reviewOpportunities`每轮仍用同一锁定Hermes，9次模型、12次工具、120KB读取、30K token和180秒边界。`beginOpportunity`新建当前scope和预算；`settleReview`只记持久退避。`EvidenceBrowser`固定快照cursor仅在内存Map中30分钟有效，子调查的workers和父消费元数据也只在本次进程。退出后可以重新发现机会，却不能准确知道哪些原文只是预览、哪些正文读到一半、哪些结果尚未由父助手真正采用。

## 候选比较与取舍

| 路线 | 收益 | 取舍 |
| --- | --- | --- |
| 持久完整Hermes transcript／执行检查点 | 可直接恢复推理位置 | 会再保存私人正文、子报告和旧环境，删除、权限与运行预算均更复杂；当前不引入另一图引擎或恢复旧scope |
| 持久自由研究摘要 | 简单，模型容易接续 | 丢掉原文条件与未看缺口，还产生第二层事实和遗忘责任；不选作恢复真相 |
| 原机会拥有地址、覆盖与事务ACK | 能在新范围里重新读到正确位置，不复制事实 | 选定。预览、实际正文范围、父成功采用和持久提交分开；未提交结果重新读取，不承诺保存未落盘的推理 |
| 只增加预算或延长cursor | 可减少部分中断 | 无法覆盖进程退出和未采用尾项；不代替持久续读 |

一手实现的实际比较沿[第三批候选](PERSISTENT_PLANNING_INTENT_2026-10-18.md)继续：LangGraph固定提交`98043c37abc60374030f960a03a6e0d4c0112643`的[SQLite saver](https://github.com/langchain-ai/langgraph/blob/98043c37abc60374030f960a03a6e0d4c0112643/libs/checkpoint-sqlite/langgraph/checkpoint/sqlite/__init__.py)以checkpoint／task身份持久pending writes；Artificium `6c391f33a6b3cb94da27cc6d151192ad2aabfecb`的[记忆游标与ACK](https://github.com/officialgr/agent-artificium/blob/6c391f33a6b3cb94da27cc6d151192ad2aabfecb/artificium-code/artificium/memory.py)区分待确认chunk、版本与继续／暂停。借鉴其提交边界，不复制全文chunk、自由carry或独立life_loop。固定[Hermes delegation](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/delegate_tool.py)继续负责真实只读worker，宿主提供当前来源和持久地址；不升级锁、不替换生产模型。

## 选定的宿主协议

状态由原`help_opportunity`拥有的SQLite child ledger保存。只存来源／版本／范围、固定枚举位置、有序pending批次和实际正文续读地址；不存query、自由摘要、指令、正文、transcript、旧scope或批准。普通新查询不带cursor时仍从头开始，相同来源与时间不自动等于同一个子问题。

每次读取预算与最终安全输出通过后才stage。工具失败、取消、过长降级为unknown或没有实际工具调用身份，不得推进持久位置。子产出和父模型请求已经发出都不等于ACK：主助手直接读取须有匹配安全输出实际进入其请求、provider成功及来源／取消复核；委派范围还须先有同一worker确实收到该工具输出并成功返回，再有精确批准报告实际供父模型采用。原文枚举只确认已采用的连续页前缀；正文逐实际采用范围确认，允许新预算下的小页逐轮替代旧的大pending地址，剩余地址与中间缺口仍保留。两者均与一次实际`decide_help`判断共用SQLite事务。退出、失败或未提交判断，pending下次重读，不恢复旧子报告。

持久覆盖明确区分`parent_original`和`worker_report`，混合范围不合成“父已见全文”。后者表示子代理读过、报告已被父助手采用，不证明父逐字读过、语义正确或现实条件齐备；只在host内存出现的原文、child最后未进入后续模型请求的工具输出也不能算已读。两类均保留原地址可重新读取，不为证明覆盖复制报告正文。

恢复目录分别给出两类读取者的范围与完整性。`continue`从已确认正文的首个缺口开始，pending地址不参与计算，因此未确认页不会把下一轮直接带到其末尾。重新开启枚举代次会退役该代旧的内存投递句柄，旧工具消息不能确认替代后的新页；恢复cursor只属于新绑定的本次run。

固定快照的枚举、预览和正文完整性分别记录。普通`read_evidence`的实际UTF-8字节与token守原共享预算，partial保留nextOffset；授权quote用局部offset，同时保留原文坐标，不能借恢复扩成父消息全文。初始与`inspect_help`只给当前合法、可分页的地址索引，正文仍经正常工具产生新回执。

同一机会的合法退避或暂停保留位置；新的运行使用新scope、预算、cursor和工具身份。停止、拒绝、到期或授权失效不创建备用机会。权限暂窄不能把未见行当已读而跳过尾项；限制／版本变化后，旧pending不能补签新baseline。永久遗忘清相关地址与覆盖，机会删除级联清理。存储预算满时保持未推进位置并给明确缺口，不截尾；累计计账不新增终身停止门槛。

## 本轮源码接线与运行状态

`investigation-frontier.ts`负责原机会拥有的地址账、当前授权绑定、原文／预览范围、父读取与子报告读取区分、两层provider投递票据及判断事务ACK。`coordinator.ts`把原授权quote保持为局部视图，并在初始上下文与精确`inspect_help`给出分页续读目录；前台显式查目录只得到当前用途下的新读取入口，不取得后台调查的提交权。`attention.ts`在实际判断事务内提交覆盖。`background-delegation.ts`在合并前核对同一tool-call的宿主报告，只交接真正成功供worker读取的观察；`delegation-evidence.ts`给有界来源目录，区分候选预览、正文片段和外部读取的重新查询入口。

委派报告沿锁定Hermes的[`_build_result_entry`](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/delegate_tool_child_run.py)契约核对：须有唯一对应worker的`completed`条目、完成的退出原因与非空summary。只有worker生命周期的produced、没有对应报告正文，不能补成父已采用；缺失、重复、失败、空报告或预算截断保留失败与未确认覆盖。

该机制还依赖`harness.ts`真实模型请求边界上的投递接线、`tools.ts`安全输出后的stage、`context.ts`共享读取预算与实际正文范围，以及`repository.ts`迁移／遗忘清理。这些是同一实现中的接缝，不是另一套记忆或后台循环。当前源码不得外推为`materials.read`、公开网页分页或全部外部连接均可跨进程续读。

**本轮用户明确要求暂不验证，等待其另行要求。** 因此本轮未运行测试、typecheck、build、Hermes、Luna或真实账号调用，也没有新增测试代码、fixture或runner。以下保留未来可用的验收目标，不构成已通过记录或进入前端的前置门禁。

## 待用户要求后执行的验收目标

使用正常API短调用、既有检查和实际Hermes入口，不新增或扩展测试、fixture或runner。

- 重开恢复同一机会：已提交连续位置保留，未ACK页重新读；新消息不混入旧固定快照，也不把完成枚举说成语义调查完成。
- 预览不吞正文：读到一半后重开仍能回读已提供范围和继续位置，条件与否定不因页边界消失。
- 供父模型与提交分开：provider失败、取消、未提交判断和工具输出降级均不ACK；成功父采用加真实判断只推进一次。
- 委派按两层实际投递核对：child成功本身不推进，报告被采用也不将未供child的原文算已读；恢复如实保留读取者和报告采用关系。
- 当前权限与生命周期：暂窄、局部更正、未来限制、暂停／解除、停止、到期及永久遗忘各按实际关系核对，独立机会继续。
- 不扩大授权片段，不恢复旧scope或旧worker报告；无Scene的准备仍沿现有来源证明链。
- 既有普通cursor和前台读取保持兼容；本切片尚不等于`materials.read`、公开网页分页或所有外部连接都有跨运行续读。

完成本轮可实施后端源码并列清具体缺口后，继续决定现有准备／返回流程需要的界面变化；本轮暂缓验证不阻断后续前端，新增页面仍须先GPT Image。用户不用维护游标或调查清单，现有真实准备、选择与停止入口继续承担产品流程。
