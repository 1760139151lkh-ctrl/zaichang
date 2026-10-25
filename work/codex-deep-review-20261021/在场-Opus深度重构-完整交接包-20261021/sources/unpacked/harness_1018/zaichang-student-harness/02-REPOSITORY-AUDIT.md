# 当前进展与改造入口

## 1. 审阅范围和可信度

核实日期：2026-10-18。仓库：私有 [1760139151lkh-ctrl/zaichang](https://github.com/1760139151lkh-ctrl/zaichang)。本轮通过用户指定的 GitHub 插件读取，未提交或修改仓库，未调用个人校园账号、模型密钥或健康来源。

固定基线：[`ba73b049089af718d337076364c6db0f98776d4f`](https://github.com/1760139151lkh-ctrl/zaichang/commit/ba73b049089af718d337076364c6db0f98776d4f)，提交时间 2026-10-18 07:28:17 UTC，提交说明为地图改进整合与旧产物移除。递归树共 261 个条目且未截断；围绕 Harness、存储、工具、地图连接、文档和测试选择读取 110 份文件，全部以 Git blob SHA 核对一致。清单见 [repo-retrieval-manifest.json](evidence/repo-retrieval-manifest.json)。这是有目的的源码审阅，不声称审过仓库每一行或完成运行时全面测试。

本轮完整阅读附件《在场的记忆讨论》2904 行，保留用户最终纠错优先的演变关系。附件中的旧包、旧测试报告和旧模型效果不是本次验证证据；附件示例也不是当前用户真实资料。[附件审阅](evidence/attachment-intent-audit.md)

证据分四层：源码直接可见；隔离函数探针已运行；依据源码提出待复现风险；拟实施的产品设计。下文用这些层次标注，不能混成“产品已验证完成”。

## 2. 实际已经做到了哪一步

| 部分 | 当前源码能确认的内容 | 当前不能据此宣称的内容 |
|---|---|---|
| 应用形态 | Electron 桌面、聊天/取消/历史、本地材料、日历和地图；`package.json` 版本 0.3.0 | 独立手机 App、手机离开电脑后持续工作 [E01] |
| Hermes | 固定 0.21.2 / commit `d595e636…` / Python 3.13；sidecar 实例化真实 AIAgent，宿主转发模型与工具 | 换过名字的自写循环，或所有上游功能默认开启 [E02] |
| 主模型语义 | neutral interpretation、原话和上下文进入主循环；能力按真实范围发现，旧 speech-act 词面路由没有发现调用者 | 已完全消除所有局部词面门控，或所有语义样本都正确 [E03] |
| 日历与提醒 | event/todo/deadline/reminder/time_block、重复规则与例外、revision、undo、空闲区间计算、提醒执行器 | 日程尚为空白；或已经具备完整人生规划/关闭应用后保证投递 [E04] |
| 记忆 | 原始证据、断言、事项/工作、模型提取与审核、条件、更正/撤回/遗忘及连续处理机制 | 向量召回已接、跨轮条件永不丢失或全库资料已加密 [E05] |
| 主动关注 | focus/probe/change/机会、模型决定 none/wait/prepare/ask/notify、实际材料要求、去重与停止 | 能自动发现任何新生活需要；目前仍主要围绕已登记且有 probe 的关注 [E06] |
| 子代理 | sidecar 已接 upstream delegate；独立子循环、父子预算与取消关联；仓库有相关真实引擎测试源码 | 本次已运行这些测试；上游全部异步 steer/stop 已在产品暴露 [E02、E12] |
| 地图/定位 | 共享校园地图、步行路线；Windows GeoCoordinateWatcher，`phoneConnected:false` | 手机 GPS、室内/骑行/无障碍通行已验证 [E07] |
| 天气 | Open-Meteo 杭州城市参考点日级预报，30 分钟缓存，明示非用户定位 | 校园实时降雨或基于手机位置的分钟级预测 [E07] |
| 校园工具 | 多领域 schema 和外部 `ZAICHANG_ZJU_SOURCE` 只读适配链；配置、授权与查询分离 | 各领域都已经登录、全量覆盖、动态课程例外与外部提交已核验 [E08] |
| 人格 | 五轴交互偏好和最长 4000 字自由 guidance，有默认值与设置界面 | 人格完全不可调；或已有完整角色模板、版本迁移和显式/自动学习分离 [E09] |
| 模型 | DeepSeek 生产常量 `deepseek-flash`；Luna app-server 是明确标记的测试代用 | 把测试代用当普通用户 ChatGPT 登录生产集成 [E10] |
| 通知与后台 | 桌面进程内轮询，OS 提交回执细分；窗口全关后 app.quit | submitted 等于 delivered/seen，退出后继续观察或必然提醒 [E11] |

因此，本轮应完成的是现有能力的生活化整合和机制修补。不能按“只有地图、GPS、天气”的回忆重新造一套 Harness，也不能因源码已有工具就宣布整个学生助理已经成熟。

## 3. 已定位问题与证据等级

### F01：一处真实的词面控制会误解输入

`runtime/turn-controls.ts:31–33` 的 `localCloudRestriction` 用正则预判不准云端处理；`harness.ts` 随后跳过模型控制解析并终止云端主回路。使用固定 SHA 的原函数体作隔离探针，仅将凭据检测 stub 为 false：

| 输入 | 本地 helper 结果 | 判断 |
|---|---|---|
| 不要联网查，直接用我给你的课本讲解。 | true | 把禁止搜索扩成禁止云模型处理 |
| 不用上网查资料，就依据这道题推导。 | false | 相近任务限制得到不同路径 |
| 不必解释云端部署，帮我记明天的课程。 | true | 非传输限制误触发整轮阻断 |

这是**已运行隔离探针 + 静态调用链**，没有执行完整 Electron 或模型回合。原理与结果见 [cloud-restriction-probe.md](evidence/cloud-restriction-probe.md)。修复需在本机分清真禁止外发、禁搜索和任务谈论；不向云发请求来判定是否禁止向云发送。[E03]

### F02：业务变化到主动关注的出口有覆盖缺口

`coordinator.ts:547–549` 只将 `delta.upserts.slice(0,8)` 送往 `watches.signal`，未在此出口投递 tombstone。`domains.ts` 自身会处理完整 upserts/tombstones，并有其它依赖失效路径。

这是**静态可证的出口截断**；不能直接声称第九条调课一定漏提醒，因为另有 probe/重评路径。应做十条变更加取消的集成轨迹，修成可批处理、可恢复且不丢消息的出口。[E05、E06]

### F03：后台模型就绪判定与测试 transport 不一致

`harness.ts` 的 `reviewOpportunities` 在没有 `this.key()` 时返回，而恢复路径兼容 `usingLunaTestTransport()`。这使合法 Luna 测试代用与 DeepSeek key 的就绪条件可能不一致。

这是**静态差异，影响待运行复现**。统一按已选 transport 的实际就绪状态判断，不以随便放一个假 key 绕过；保留生产/测试标识。[E06、E10]

### F04：主动机制有基础，广义发现和时间演化不足

当前 `attention.scan` 处理 active focus 且已有 probe；每批最多先取 24 项、每次 2 项，probe 下一扫描固定约 30 分钟。main 约每 60 秒调机会复核。它支持有意义的新结果，但产品愿景还需要从一次广义托付建立范围内新关注、发现未关联变化、因行动窗开启而唤醒和公平处理积压。

这是**已见实现 + 产品差距**，不是说当前只有定时闹钟。补充设计见 04 §4；实际行为需事件时间线检验。[E06、E11]

### F05：时空证据尚不能支持手机全天候生活判断

天气固定城市点，定位明确为 Windows 原生；地图是当前校园步行数据，入口/营业/现场可通行仍需相应证据。真实参数化与平台接入应分阶段做，不把 `GPS` 这个概念当已实现设备链。[E07]

### F06：显式角色设置与私人人生资料仍耦合

`SettingsPanel.tsx` 已有自由 guidance，`harness.ts:946–947` 仅在 `memoryMode==='relevant'` 且不要求额外 read purpose 时注入；五轴 interaction guidance 独立注入。角色可配置已有起点，装配规则还需要拆分。

旧 guidance 可能混有私人经历，不能整段改成不受记忆范围控制的常驻 PersonaCore。迁移保留私有原文，只提取确定的纯角色部分；见 05 §5。[E09]

### F07：记忆前情与检索覆盖需要针对性验证

`repository.ts:577–585` 的 pendingConstraints 仍按“必须/未完成要求/截止/不接受/保留”等文字选前情；这是后台 memoryContext，不是前台工具裁剪。`workerContext` 对原话、断言和条件有长度裁剪，当前跨度与审核又有原文读取，不能断言整段原文全部丢失。

`runtime/context.ts` 有词法/全文检索和相关原文展开，明确 `vectorSearch:'not_connected'`。固定相关候选中的硬约束未必涵盖所有条件。用后置限定、跨轮原因、偏好更正、已解除否决理由的样本找实际断点；不要通过新关键词表解决。[E05]

### F08：提示词累积与包装成本要测，而非凭长度判坏

system prompt 和控制 schema 含较多历史特例说明，控制解析可重试/复核；这有维护与调用成本风险。当前主路径已回到模型语义理解，不能继续加每场景的响应补丁。记录物理调用、上下文覆盖、真实 tool round trip，再与薄参考路径对照，决定删减与合并。[E03、E10]

### F09：供应商文档与代码事实有漂移

AGENTS/文档提到 DeepSeek transport contract，而 `shared/model-contract.json` 当前仅载 Luna 代用配置，生产 model 常量在 `shared/types.ts`。`provider.ts` 默认 thinking 值不能代表调用实际值；主路径会显式启用，不应照旧附件说“始终非思考”。修文档与统一声明入口时保持实际生产选择，不静默换模型。[E01、E10]

## 4. 如何处理“硬编码”

| 类别 | 处理 |
|---|---|
| 关键词决定人生意图、主体性格或工具能力 | 移出开放语义控制；保留模型原话与可发现能力，针对误判修机制 |
| 学校坐标、学期、课次规则、天气地点 | 进入有来源和作用域的校区/来源配置或查询参数 |
| 默认免打扰、轮询批量、并发和预算 | 保留合理可编辑默认值；紧迫硬提醒与普通发现分别调度，不伪装普遍规律 |
| 版本校验、时间算术、权限、幂等、回执状态 | 保留确定性校验；这是正确性边界 |
| 全文检索关键词、工具目录搜索 | 保留并改善召回/展开；模型选择查询词不等于词表替模型决定能力 |
| 已无调用的旧 helper | 先确认无运行/兼容职责，再小范围清理；不用大清理代替用户功能 |

## 5. 固定提交源码索引

所有下列链接指向本轮审阅 SHA。文件中的行号只作当时定位，实施时应按符号重找。

- E01：[README](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/README.md)、[AGENTS](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/AGENTS.md)、[package.json](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/package.json)。
- E02：[Hermes lock](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/runtime/hermes/lock.json)、[sidecar](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/runtime/hermes/sidecar.py)、[宿主适配](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/runtime/hermes.ts)。
- E03：[policy](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/runtime/policy.ts)、[turn-controls](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/runtime/turn-controls.ts)、[coordinator](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/runtime/coordinator.ts)、[system prompt](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/prompts/system.md)。
- E04：[本地日历](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/actions/local-calendar.ts)、[空闲计算](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/actions/availability.ts)、[共享日历类型](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/shared/calendar.ts)。
- E05：[repository](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/storage/repository.ts)、[domains](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/storage/domains.ts)、[记忆 service](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/memory/service.ts)、[context](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/runtime/context.ts)。
- E06：[attention](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/runtime/attention.ts)、[harness](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/harness.ts) 及 E03 coordinator。
- E07：[定位](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/mapLocation.ts)、[天气与内置能力](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/capabilities/builtin.ts)、[地图服务](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/mapService.ts)。
- E08：[校园适配](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/zjuAdapter.ts) 及 E07 builtin。
- E09：[交互偏好](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/shared/interaction.ts)、[设置界面](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/renderer/SettingsPanel.tsx) 及 E06 harness。
- E10：[provider](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/provider.ts)、[model selection](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/model-selection.ts)、[Luna 测试代用](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/luna-provider.ts)、[contract](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/shared/model-contract.json)、[types](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/shared/types.ts)。
- E11：[main](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/main.ts)、[reminders](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/src/main/actions/reminders.ts)。
- E12：[Hermes 测试源码](https://github.com/1760139151lkh-ctrl/zaichang/blob/ba73b049089af718d337076364c6db0f98776d4f/tests/harness/hermes.test.ts)。本轮未执行，测试存在不代表当前已通过。

## 6. 下一次打开项目时先做什么

检查当前 checkout 与该 SHA 的差异，已有修复不要重复写。先从 F01/F02/F03 的可复查位置和真实传输链建立基线，再沿 [06](06-IMPLEMENTATION-AND-ACCEPTANCE.md) 的 T0–T7 完成一个真正可运行的学生闭环。详细类型是讨论起点，实际命名、表结构和迁移依现有实现调整。
