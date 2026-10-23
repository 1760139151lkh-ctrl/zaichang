# 准备引用与 OpenUI 原宿主核验 · 2026-10-23

本页只记录本轮实际发生的操作。模型采用项目已有的 `luna-app-server-test` 代测传输，生产默认仍为 DeepSeek；本轮没有调用 DeepSeek 服务。数据为隔离目录里的公开数学问题与明确合成的准备对象，没有校园账号读取。

## 准备引用

`PreparationShelf → App composer → send IPC → Harness → ContextCompiler → inspect_help` 已接入精确准备地址。正文不拼进用户消息，原草稿保留；小引用可移除和回原对象。`preparation:open` 复用原通知 focus 投影，校验当前来源、版本和时效后再显示。

沿原 Store、AttentionService、PresentationService、ToolRegistry 操作一组明确合成对象，未注入模型回复：

| 实际操作 | 结果 |
| --- | --- |
| 创建六份同名、不同正文的准备问题，选第一份 | 第一份已不在最近五项；原 focus 入口仍能精确打开。 |
| 将其原 id、revision、helpRecordId 带入当前 context | context 只有地址、回读参数与语义说明，不含准备正文。 |
| `inspect_help` 只传该 id | 取得第一份原正文，没有取得其余同名正文。 |
| 原对象更新为另一版本后再次只传同 id | 返回 `preparation_changed`；模型漏传可选版本参数也没有换读另一版。 |

这些是确定性的原宿主行为核验，不是 Luna 对准备的自然理解或真实窗口操作验收。

后续审查发现：只锁 `inspect_help` 仍不够。原通用 `refreshDependencies` 会把已记录 work 的新版本整份放进 `host_state_change`，可能把选中准备的新 `artifact` 带回模型。现每个刷新边界重新核验原准备，失效时移除 `currentPreparation`，只发送一次带原地址的无正文 notice；通用 work 刷新跳过这个精确选中 ID，也不把 receipt 升为已读新版。用户本轮新话及原引用保持。

原 API 进一步核对了回读前版本变化、正文已读后版本变化、材料自身到期、状态暂停及关闭可选 `repairRejudge` 五种情况：`changed`、`dependencyNotices`、`observations` 和 pack 都没有新标题或新正文；原 reference 与 receipt revision 保持，用户新话仍在；旧地址的显式回读返回 `preparation_changed`，再次刷新不重复发 notice。到期场景采用 30 秒材料期限、推进 60 秒，未跨越会话 scope 期限；此前跨三小时的尝试触发 `scope_expired`，只作为原授权到期阻断，未当成材料到期验证。修复后原有 `attention-controls`、`continuity-index`、`turn-surface` 再次 18/18，类型检查通过。这些检查不将有限原 API 核查升级为模型在所有竞争条件下均已验收。

禁用 `repairRejudge` 时，这个原地址门禁仍发送一次无正文 notice，但不记为使用了可选 repair 机制；最后原 API 核得该计数保持 `0 → 0`，新正文仍未投递。

合并远端 `6d5dcc1` 的空间来源、材料导航及笔记版本通知后，再沿原 API 核对改版、材料到期、暂停与关闭 `repairRejudge` 四种情况，均通过：原地址与原 receipt revision 保持，每次只发一次失效 notice，没有带入另一版标题或正文；第二次刷新不重复通知，用户本轮新话保留，关闭增强时计数未增加。这是合并后的确定性来源边界核查，不是新增模型验收。

## 真实 Luna 动态作品与续谈

在同一个隔离 profile 中沿原 `Store/Harness.start` 正常入口发公开数学问题，使用原 Hermes 及原模型客户端，没有注入模拟客户端、工具结果或静态画面。当前环境 Electron 的单实例／显示连接受系统 socket 限制，因此此处是原宿主 API 对话，不能称为桌面 UI 验收。

| 轮次 | 发生的行为 | 实际模型元数据 |
| --- | --- | --- |
| 请求可调 `a/h/k` 的二次函数图 | 模型自主选择 `present_view.program`；首稿字符串拼接不符合严格函数规则，宿主拒绝。操作者在 90 秒等待窗口结束时停止，尚未发表作品。 | 1 次 control、4 次 main，返回均为 `gpt-6-luna`。 |
| 同会话正常要求继续完成 | `done`；发表一份真实 `Message.views[].program`，包含 `Curve("a*(x-h)^2+k")`、顶点 `DragHandle` 及三个 Number slider，初值 `a=1,h=0,k=0`。 | 1 次 control、3 次 main、1 次 completion_review，返回均为 `gpt-6-luna`。 |
| 原对象调整后正常续问 | 沿 `NativeProgramLocalState` 保存 `a=-1,h=2,k=1`，关闭 Store 再开后原值与 `stateRevision=1` 保留。带同一 message/program/revision/nodeId 与当前输入续问；模型正确解释 `y=-(x-2)^2+1`、顶点右移 2 上移 1、开口向下且宽窄不变。没有另造画面或业务动作。 | 1 次 control、2 次 main、1 次 completion_review，返回均为 `gpt-6-luna`。 |

上述 14 条实际响应均通过 `modelUsage[].responseModel` 确认；各轮 `provider.observedResponseModels` 同样为 `gpt-6-luna`。Hermes commit 为 `d595e636c83aa0b9606d4e914e1140ae9c796897`，Python 3.13.16。第一轮被停止的结果没有升级为完成；后两轮实际 `done`。

当时本机证据位于未提交的 `.test-data/visual-20261023/zaichang.sqlite`；环境清理后原数据库尚未恢复，本页保留的是清理前实际观察记录，不是恢复后的模型复测。会话 `2e14eefa-929a-403d-af0d-0d39447b43c9`；作品消息 `b02aeb47-8daa-4768-bdeb-b172e07b89e7`；续问回复 `bfa4a721-2556-4247-9327-a5bf2250c6d7`。数据库与完整回执未加入仓库。后续主代理已在真实 renderer 组件中操作指针拖动与键盘，参数和曲线联动，见[画面与操作范围](2026-10-23-youthful-presence/README.md)。完整 Electron 端到端仍未验收。

## 既有检查

- `npm run check` 通过。
- 仓库既有 `npm test` 为 280/282；两项 ZJU adapter 合成 fixture 返回 `forbidden`，其中一项随后读取不存在的 `records[0]`。相关 adapter 与测试源文件本轮未修改。最终 fetch 发现远端已修正 adapter 将“无 readingIdentity”误当成“账号变化”的问题；此前将失败归因于 fixture 缺账号元数据不准确。这是合并前历史结果，最终集成结果另记。
- 最后修改后重新编译并运行既有 `attention-controls`、`continuity-index`、`turn-surface`，18/18 通过。没有新增测试源文件或 runner。

这些检查不替代准备 chip 的真实点击、草稿保留观察或完整动态界面体验验收。

## 环境清理后的恢复核查

丢失未推送工作目录后，按保留的代码片段与操作记录，在远端 `6d5dcc1` 基线上恢复本轮准备引用，保留远端空间来源、材料导航与笔记版本通知。恢复后的原 API 再次通过改版、材料到期、暂停、禁用 repair 四种来源门禁核查；六个独立托付下的同名准备中，第一份超出最近五项后仍能由原地址打开，`inspect_help` 取得第一份正文，改版后即使只传 ID 也返回 `preparation_changed`，没有读取新版。核查使用原 Store、AttentionService、RuntimeCoordinator 与 ToolRegistry；未添加测试源文件或 runner，也未新增模型调用。此前真实 Luna 结果是清理前的观察记录，不能视为恢复后的模型复测。

## 制作过程的对外表达修正

首轮真实编排失败后，公开正文曾出现“数值标签的拼接没通过校验”。这把工具诊断当成了角色进展。现仅在 `prompts/system.md` 的「让结果被看见」补充一段共用表达规则：依据真实诊断自己修正，不播报组件字段、解析、拼接与校验；需要等待时说明正在调整的画面或操作，确实未完成时具体说明影响并继续可用解释。角色仍自行决定措辞；工具错误、诊断记录、成功回执与来源门禁未改，没有输出过滤器。实际检查确认原 foreground/background prompt composition 都加载了该段。

沿上述同一真实会话追加一次正常问题：“刚才那张图是不是没做好？我想接着用刚才那一张。”前台回复保存为 `done`，先说要看看原图，再真实核对原作品，说明可继续使用原图；未照念旧诊断，没有另发作品或业务动作，也没有在本轮未携带当前输入时宣称知道眼下滑块值。该轮 1 次 control、3 次 main、1 次 completion_review 的实际响应均为 `gpt-6-luna`；消息为 `b256eb5a-c7aa-47fe-9717-31505f822a45`。120 秒本地等待上限结束了后续等待，保存的前台结果仍为 `done`，不将后台整理记作全部完成。

这一条验证了既有失败后的恢复表达，没有再次人为制造编排错误，不能推成所有失败分支均已通过。此次仅改系统指引与这份经验记录；生产默认及 Luna 代测分工保持原状，`git diff --check` 通过。
