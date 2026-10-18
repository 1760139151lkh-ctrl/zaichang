# 日程规划：节奏、采用恢复与后续接入

日期：2026-10-18。研究和实现基线：`c7cff22884fe9a3050879067dd49012f685d8cfd`。本文件只记录日程后端，未读取前端图片，也未访问真实校园账号。测试使用独立合成数据。

## 从现有实现继续

附件 `harness-pack/04-HARNESS-DESIGN.md` 第 5 节要求模型提出安排、确定性区间计算验证，并保留连续学习、休息、兴趣、承诺和未确定信息。现有 `planning.draft` 已有依赖、截止、允许窗口、精力区间、准备收尾、转场、保护留白、工作预算与完整日历指纹。`PlanningApplicationService` 已经逐项核对 `planRef`，在原有本地动作事务里保存，不声称整组原子成功。因此本轮没有另建调度引擎或第二套日历。

两个真实缺口值得立即补：单个可拆任务仍会尽量占满整个空档，无法表达“每段最多 75 分钟，但至少 45 分钟”；采用中断后虽有内存进度回执，却没有模型可调用的恢复入口，重启后的真实已存日历也不便与原方案关联。

## 实际源码研究

下列链接在本轮通过 GitHub 读取了文件全文，表中是本项目的判断与取舍。没有复制其实现，也没有运行上游工程。

| 来源与精确位置 | 读到的机制 | 在场采用或不采用的理由 |
| --- | --- | --- |
| [Super Productivity：普通任务排程](https://github.com/super-productivity/super-productivity/blob/68d27f64989e402a2b8e2f9efe995b854e531d05/src/app/features/schedule/map-schedule-data/create-schedule-view-entries-for-normal-tasks.ts)；[按天组合](https://github.com/super-productivity/super-productivity/blob/68d27f64989e402a2b8e2f9efe995b854e531d05/src/app/features/schedule/map-schedule-data/create-view-entries-for-day.ts) | 普通任务按剩余时长顺序排列，接入被占用块，延续前一天片段与重复投影；这是可解释的构造式排程。 | 延续“剩余工作量”与“日历占用”分开：恢复扣除工作分钟，准备、休息不算完成工作。保留已接受安排，避免恢复时重复新增。没有把顺序排程说成全局最优。 |
| [Super Productivity：占用块投影](https://github.com/super-productivity/super-productivity/blob/68d27f64989e402a2b8e2f9efe995b854e531d05/src/app/features/schedule/map-schedule-data/create-view-entries-for-block.ts)；[对应测试](https://github.com/super-productivity/super-productivity/blob/68d27f64989e402a2b8e2f9efe995b854e531d05/src/app/features/schedule/map-schedule-data/create-view-entries-for-block.spec.ts) | 已排任务、外部日历、午休、重复投影与延续片段分别带类型；测试明确检查午休的区间与跨对象排序。 | 休息必须占真实时间，不能只出现在说明文字。现有分开的 transition/protected 保存单位继续使用。其“生成视图”不等于用户接受，在场维持独立动作授权。 |
| [Timefold：员工排程约束](https://github.com/TimefoldAI/timefold-quickstarts/blob/76993a35123a127f9b630a8f7a37a1fbe76a24b0/use-cases/employee-scheduling/src/main/java/org/acme/employeescheduling/solver/EmployeeSchedulingConstraintProvider.java)；[约束测试](https://github.com/TimefoldAI/timefold-quickstarts/blob/76993a35123a127f9b630a8f7a37a1fbe76a24b0/use-cases/employee-scheduling/src/test/java/org/acme/employeescheduling/solver/EmployeeSchedulingConstraintProviderTest.java) | 重叠、不可用与班间休息作为硬约束，日期偏好作为软约束；休息不足按分钟计算。 | 借鉴硬条件与偏好分开以及精确边界反例，不采用员工公平分工或固定十小时规则。学生个人生活没有默认生产率目标，工作节奏由当次需求给出。源码测试也须独立审读：该版本 `oneShiftPerDay()` 测试引用 `noOverlappingShifts`，不能仅因测试存在便证明对应约束已验收。 |
| [Google OR-Tools：flexible job shop 实例](https://github.com/google/or-tools/blob/stable/examples/python/flexible_job_shop_sat.py)，本次读取 blob `aa617420c4c84ecedeb2ef410627574d6d36ba1a` | 显式起止/时长变量、任务先后、候选可选区间、资源不重叠，最后另设 makespan 目标。 | 借鉴“可行约束”和“优化目标”应分开。当前 30 个任务、有界个人窗口无需引入 Python 求解服务或把最短完工当默认目标。未来比较多套方案时可用约束求解器，但必须保留未知来源、留白与用户选择。 |

另通过网页搜索定位了 Super Productivity 的实际自动排程使用讨论 [#9120](https://github.com/super-productivity/super-productivity/discussions/9120)，作为“自动排满界面可能不等于用户愿望”的产品反例；讨论不是算法正确性的证据。上游排程代码与测试才承担机制依据。

## 本轮落地

### 1. 可选学习节奏，保留连续思考

`planning.draft.tasks[].maximumChunkMinutes` 表达本次单段工作上限，沿用 `minimumChunkMinutes`、`splittable` 和 `restMinutes`。未设置时不强制打断长时间思考；没有允许拆分时，超过上限返回 `split_permission_required`，不会擅自切块或删工作量。上下界相互矛盾直接报告。零休息仍是调用者明确选定的零休息，字段不是医疗建议或自动番茄钟。

例如 180 分钟工作、每段 45–75 分钟、每段准备和收尾各 5 分钟、段间休息 10 分钟，会构造 75、60、45 分钟三个工作段，另保留 30 分钟准备收尾和 20 分钟休息。任务依赖只能在全部工作安排后解除。一个方案最多 256 个工作段，细碎请求达到上限后明确保留余量，避免输入一分钟碎片造成无界计算。

### 2. `planning.recover` 真实采用恢复

能力入参为 `{planId}`，只读当前本地日历中的持久 `planRef`。内存票据还在且范围、来源、日历和时效都通过时，返回完整 `nextProposal`；仍走现有动作事务和授权，不自动恢复写入。

回读检测原保存行被删除、移动、完成、变为未接受状态、重复 `blockId` 或出现未登记到票据的同方案行。发现这些情况返回 `review_required`，不通过计数推断完成。重启后只报告当前观察到的行，`totalSteps`、`completedSteps` 保持未知，不重放旧方案，也不把当前没有记录当作过去从未写入。

对仍可核对的原票据，`remainingRequest` 可提供重算起点：按完整已保存工作段扣工作分钟；把已安排前置任务转成最早开始约束，保留未安排的依赖，不把未来工作写入 `completedTaskIds`。若工作段被编辑、拆分保存尚不完整或中断时还欠休息/转场，则不生成会丢占用的简化请求。模型须更新当前时间与来源后再调用 `planning.draft`。已存安排始终留在原日历中，不新建副本。

### 3. 来源复验仍有明确边界

版本回调现在接收 `(sourceId, currentScope)`；一次核验中同源只读一次，避免同一轮读取到两个版本后偶然各自“相等”。同源声明版本冲突、来源不在范围、无法取到版本均继续阻断采用。

**生产外源版本回调仍未接入。** 不能把模型提交的 `sourceVersion` 或某个连接器的全局“最新”字符串当成可信完整源。下一步应由宿主在真实读取时签发范围化依据，绑定来源、查询窗口、覆盖状态、对象集合摘要、有效期与隐私版本；事务采用时重新检查当前对象和撤回状态。天气、位置、规则、课程和当前自述的有效期不同，不能共用一个无限有效版本。缺少此链只限制依赖该外源的方案采用，不阻塞本地明确自述方案、规划预览、恢复或前端工作。

## 继续探索的功能

- **最少扰动重排**：以真实对象 ID/revision 为锚，仅移动被新事实影响且已获授权的可移动块。当前实现提供恢复和重算起点，还没有自动重排已接受块。
- **有差异的候选**：保留原顺序、集中深度工作、给朋友留时间，分别返回真实约束和取舍；不靠一个伪精确生活分数选答案。当前模型可多次调用草案计算，但没有新的全局优化器。
- **估时经验**：用户主动提供实际进展后比较估计区间，形成带情境的记忆证据；不把“已保存日程”或计时器结束当成完成，当前未做被动行为推断。
- **跨设备接续**：手机先展示最近确认日历与真实同步状态；回到在线后核对版本再采用。当前恢复仅针对本机持久日历，没有宣称手机同步或关机后运行。

## 验证记录

本轮 `tests/harness/planning.test.ts` **23 项通过**；`tests/harness/planning-application.test.ts` **19 项通过**，后者使用仓库现有 esbuild `.md` loader 与独立合成环境运行。覆盖包含段长/总量/准备休息、极小分段上限、原动作事务和部分成功、回滚、过期、真实重启、删除移动重复、范围检查、从实际 `look_up` 能力读恢复，以及两次回读之间保存新步骤不会得到旧缓存。`npm run check` 通过。

这些证据验证确定性排程、宿主工具接线与持久事务，不代表真实校园账号、模型对长期偏好的理解或实际用户体验已经验收。未调用 DeepSeek，未因 Luna 通道不可用停止本轮工作。
