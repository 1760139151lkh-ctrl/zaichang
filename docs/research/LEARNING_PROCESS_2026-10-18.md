# 学习过程：同一事项的尝试、帮助与有条件对照

本轮只增加学习过程的来源契约，沿用原 collaboration frame 与 `h_work`。它不是第二套个人记忆库，也不是独立掌握评估器。按本轮用户明确要求，未运行测试、类型检查、构建、模型或校园账号；下面的实现描述不作为功能或体验验收证据。

## 基线与本轮增量

[能力基线](SOURCE_CAPABILITY_MAP_2026-10-18.md)已确认，校园单课活动、作业、成绩、考试与材料读取原已存在；原 [CollaborationService](../../src/main/runtime/collaboration.ts) 也已有方案、拒绝理由、尝试报告、结果报告和重评。不能把这些写成此次首次接通。

真正缺少的是：回来继续一道题时，能在同一事项下分开找回原题、本人这一次的尝试、已生成的提示或答案、本人说用过哪些帮助、平台／提交产物、当时条件和仍未弄明白的部分。原研究中的 S003，以及[记忆与生活连续性研究](PERSONAL_MEMORY_CONTINUITY_2026-10-18.md)所述“学习断点与提示边界”，都是这个缺口；合成场景不是本人事实或运行时分支表。

原[记忆讨论](../source-materials/2026-10-18/memory-discussion.txt)要求原始证据与临时工作视图分开，同一原话经摘要和代理转述不能变成多份独立证据。本轮采取这一共通机制，没有按课程名、题型或场景编号分流。

## 方案取舍

| 方案 | 取舍 |
| --- | --- |
| 将分数、做题次数或助手判断写成能力／掌握标签 | 不采用。作业产物、本人报告和独立表现的证据不同，累计次数也不能填补缺失的帮助史。 |
| 继续只用通用 decision experience | 原能力保留，但不足以清楚表达原题版本、帮助来源和两次报告的关系。 |
| 保存每次学习聊天的正文副本或总摘要 | 不采用。副本会使删除、更正、范围收缩和答案暴露产生第二条恢复路径。 |
| 在原事项下保存有类型的过程地址，按当前来源回读 | 采用。保留原 Work 的归属、用途、修订和删除链，具体表现仍回到真实原文。 |

此前的 [Tutor CoPilot 原码阅读](PERSONAL_MEMORY_CONTINUITY_2026-10-18.md)只支持“教学帮助应结合具体对话和策略”的启发；其研究 demo 不证明本产品的学习效果。本轮没有新增教育效果或长期记忆效果的外部实证结论。

## 实现与语义

[LearningProcessService](../../src/main/memory/learning-process.ts) 在原 `experience` WorkRecord 中保存 `data.type = learning_process`。每条对应模型据真实原话识别的这一次尝试，`matterId` 指向同一 collaboration frame。

| 部分 | 保存与返回的含义 |
| --- | --- |
| `source` | 本轮本人报告、修订或停止的当前用户消息片段；附件中的命令不取得保留许可。 |
| `problem` | 原题／学习对象的精确版本和 Unicode 位置；相同文字或标题不证明是同一来源。 |
| `attempt` | 本人尝试或尝试报告的原话地址，始终明确为 `user_report`。 |
| `assistance` | 提示、例题、完整答案、工具或同伴帮助的地址；助手消息保留内容 hash 和当时真实依据的来源地址。 |
| `useReport` | 本人说实际用过该帮助的原话。生成、展示、阅读和实际使用分别报告，缺证据时保持未知。 |
| `outcomeReports`、`independenceReports` | 本人当时的结果及独立完成自述；不升级为宿主核实。 |
| `artifacts` | 提交物、分数或完成记录的精确地址；另按真实 Evidence 标出本人报告、导入记录、外部记录或模型派生，类别本身不是平台认证。 |
| `conditions`、`unresolved` | 当时条件和本人仍未弄明白的片段，不压成永久能力或性格。 |
| `occurredTimeSource` | 用户关于发生时间的原话；实际发生时间未知。收到时间与记录时间另外列出。 |

持久部分只存地址、hash、关系及类别，不复制原题、答案、私人报告或条件正文。读取输出提供有限预览、`previewOnly` 与原有 `read_evidence`／`read_assistant_history` 继续读取入口。预览不是全文；未展开不表示没有相应过程。

`record` 需要当前可读的原题、本人尝试和本轮用户来源；同一原题与尝试地址的重试产生同一个稳定 ID。完全相同的重试返回已有记录，补充或纠正必须带准确版本走 `revise`，新的一次尝试另建记录。

`revise` 只替换明确提供的字段，省略保留原条件和帮助关系，显式空数组才清空对应地址。已停止记录不能靠修订或再次提到重新启用。原依据已经不可读或停止时，不能从不可读旧记录拼回新规格；重新记录只能使用当前合法的真实来源。

`retire` 以当前本人的原话和准确记录 ID／修订控制，只读 Work 元数据及所属事项地址，不为停止重新读取旧过程或旧父事项。旧过程已被来源变更阻断时，可用`read_learning(id,metadataOnly=true)`核当前修订，再停止recorded/stale/blocked记录；控制元数据不能用于正文恢复。停止不是遗忘原文，也不取消已接受的日程或学校业务。

## 两份尝试报告怎样对照

`read_learning(compareIds=[a,b])` 必须属于同一事项，且不能以同一记录与自身比较。服务沿现有 `sameSourceOrigin` 核题目、尝试与条件的真实来源谱系：

- 两个记录来自同一次尝试报告或其精确副本时，返回 `same_attempt_report`，不能当成两次尝试。
- 原题同源时可以并排看过程；仅文字、题名或课程相似不算同源。
- 已记录条件采用双向同源集合覆盖，重复引用不能掩盖另一侧不同条件；两边都未记录条件仍是不可判定。
- 两个不同报告地址不证明两次独立完成，收到时间也不证明尝试先后。帮助史和条件是否完整始终未知。

返回 `growthEstablished: false`、`twoIndependentAttemptsEstablished: false` 及独立表现／掌握未知。模型可以据当前原话解释两次自述中的具体变化，不能让这个目录自行颁发“已掌握”结论。回读旧答案也不自动取得对本轮用户泄露全部解法的理由，应结合原话中的最小提示与探索条件。

## 来源、修订与遗忘

一手取舍继续参考固定版本：[Open edX学习入口](https://github.com/openedx/openedx-platform/blob/d7859be168dfe80f1baa9b3cea41e7447703d56e/xmodule/capa_block.py)分开提交、评分、提示和答案请求，宿主发布事件仍不能证明使用者看见或采用；[xAPI时间语义](https://github.com/adlnet/xAPI-Spec/blob/ca782a1129bc6ae848640ff4e8e262334bdd0ba5/xAPI-Data.md#247-timestamp)区分发生与保存。在场只借鉴字段分工，不采用缺失发生时间时回填保存时间的规则，也不采用不可删除的永久学习账本。以上是机制比较，不是本项目学习效果的验证。

普通 Evidence 引用先核 scope、内容版本、精确片段及 hash，再交原 `resolveWorkSourceBinding` 核当前合法推断范围；精确副本、摘录、限制及局部删除沿现有 source lineage 生效。

助手提示不是本人事实。其原消息需为本人的已完成助手消息，必须有当前可核对的 ContextReceipt、来源许可、真实依赖版本及规划来源。旧消息缺少充分回执时拒绝，不从旁边聊天补造依据。依赖不能精确定位时只可按当前整段合法的原文保守绑定；这可能使旧提示不可续读，但不能把不完整证明洗成可用。

这些助手依赖与其他学习引用共同进入同一 Work `sourceBinding`；助手原消息本身另记删除依赖。读取与主循环采用前再次核当前记录修订、助手内容 hash、真实来源集合及子调查片段范围。仓库的普通 Work 读取／导出也须同样拦住不再合法的助手来源，不能只在 `read_learning` 隐藏而从恢复事项绕回。

第一版不保存循环引用：助手消息实际回执中直接或经已采用上下文间接引用的学习记录 ID 由宿主返回。最终目标记录 ID 确定后，若本次帮助消息已依赖同一记录，record／revise 在写入前拒绝，避免更新后立刻使自己的帮助依据失效。可以引用更早的原帮助消息，或保留本人实际使用帮助的原话；不为绕过循环复制助手正文或另建 Work 历史库。

本轮采用每条过程记录的完整来源门禁：某个帮助、条件或报告的来源停止使用，会停止该条当前过程投影，而不是去掉帮助后继续显示为似乎独立完成。其他独立记录和原事项可以继续。后续若需要按字段安全恢复，必须同时表达缺失条件／帮助以及逐项来源；本轮没有宣称已实现这一能力。永久遗忘沿原 Work 的依赖清理移除相关派生，不复制成功账本或独立保存学习正文。

## 与宿主接线的确切接口

服务导出 `learningWriteInput`、`learningReadInput` 两个 Zod 契约，以及以下入口：

```ts
new LearningProcessService(repo: KernelRepository, work: WorkService)
save(handle: ScopeHandle, sessionId: string, input: z.infer<typeof learningWriteInput>)
read(handle: ScopeHandle, input: z.infer<typeof learningReadInput>, permits?: (ref: WorkSourceRef) => boolean)
assertCurrent(handle: ScopeHandle, recordId: string, revision: number, permits?: (ref: WorkSourceRef) => boolean): void
```

`save` 的 record/revise 返回真实 WorkRecord；retire 返回原仓库的 `{ id, revision, status }`。`read` 返回用户过程投影、诚实的分页／比较状态，以及供宿主登记实际采用版本的 `records`；内部 `records` 不应直接作为第二份正文输出给模型。`assertCurrent` 在先读后用时复核来源，过期即拒绝，不恢复旧授权。

宿主依赖的新增或扩展接口如下：

```ts
WorkService.saveLearningProcess(handle: ScopeHandle, record: WorkRecord, expectedRevision?: number): WorkRecord
KernelRepository.learningAssistantSource(handle: ScopeHandle, input: {
  messageId: string; start: number; end: number; quote?: string; contentSha256?: string;
}): { id: string; text: string; contentSha256: string; sourceRefs: WorkSourceRef[]; learningProcessIds: string[] } | undefined
```

专用 Work writer 限定 `experience`／`learning_process` 和真实 sourceBinding，沿原事务保存。助手方法同时核真实消息长度、范围、quote／hash 及依赖；`sourceRefs` 必须稳定排序，`learningProcessIds` 来自真实回执的学习来源链，两者均不能由模型指定。原 `sourcedWorkMetadata` 扩出 `matterId`，`transitionSourcedWork` 扩为可核所属事项的学习 `recorded/stale/blocked → retired`，仍只有当前本人原话能控制。

工具入口为 `manage_learning`／`read_learning`，由原 Harness 注册并沿现有预算与 ContextReceipt 采用实际展开的引用；后台只读子调查可读但不能写，父代理采用前仍复核来源。该接线、前端呈现和后续实际观察由整体实施记录维护，本文件不把源码契约描述写成已运行通过。
