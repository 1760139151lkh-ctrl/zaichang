# 日程直接操纵：当前接线与下一步实施边界

2026-10-23。本次为主代理统一布局、亲审原图之前的只读调查；没有修改产品源码、生成图片、启动模型或新写测试。HEAD 为 `6d5dcc1dd4b3bab7053a333366c6661a21e1b571`，工作区已有大量并发修改；以下以实际未提交源码为准，不把既有审查中已补齐的缺口再列成待做。

已完整读本轮 `goal-objective.md`、仓库协作规则、Product Design Director 的主文件及 evolve/motion 章节；亲读日程三块、Workspace/AgendaEditor、App 引用接线、日历展开与事务、规划试放/采用合同。已有 `agenda-audit.md`、`agenda-focus-integration.md` 是历史实施证据，下面不将其操作记录冒称为本代理亲验。

## 当前实际能力

| 操作 | 当前正常入口与宿主链 | 保留的数据身份与权限 |
| --- | --- | --- |
| 今天/选日看个人与校园安排 | `App → AgendaView → agendaDay → NativeAgendaService.day → broker local.agenda.read → expandAgenda`；校园走原 `useCampusDaySchedule` | 宿主展开真实重复实例；`AgendaReference` 保原 id/revision/occurrenceDate，`occurrenceId` 区分同系列不同实例。全天、未知结束和跨日完整范围没有猜成短块。 |
| 拖动/键盘试放 | `AgendaDayTimeline` pointer capture、4px 门槛、边缘滚动、15 分钟吸附；方向键十五分钟、Shift 一分钟；松手/回车 → AgendaEditor | 手势只建本页草稿，保完整时长；原位 ghost、按新落点碰撞分栏与重叠形态均已存在。Escape、失焦、pointer cancel/lost capture、切日/时区会回原位。 |
| 试放后查看冲突 | `AgendaEditor → agendaPreviewChange → NativeAgendaService.preview → projectCalendarChange / previewCalendarPlan` | 只读核原对象当前修订、当前 agenda 和选中的校园范围；结果 `applied:false`，不会生成采用票据。冲突存在仍允许本人明确保存自己的安排。 |
| 保存/单次调整 | `zaichang.action → acceptLocal/changeLocalFromUI → ActionRuntime.directLocal → LocalCalendarService.apply` | 沿原 Action id 修订；CAS、动作/回执、提醒调度归原 owner。重复单次写原发生日期的 exception；整个系列另有明确范围选择。 |
| 撤回本次挪动 | Workspace 的 `undoMove` 先 `state()` 回读再同对象保存 | 当前 revision 必须等于本次保存后的 revision，撤回产生新修订；重复实例只恢复该 occurrence exception。他处新改不能被旧撤回覆盖。 |
| 安排带回聊天 | `AgendaEditor.onDiscuss → App.discussAgenda → composer typed chip → send.agendaFocus → NativeAgendaService.resolveReference → currentAgenda` | 不拼机器句到原稿、不自动发送、不把试放当许可；原 id/revision/occurrenceDate 及 proposedStart 由 host 回读。后续模型边界重新检查。 |
| 安排看地点/返回 | 只在原 `planning.placeId` 已有时用现有地图入口；App 持 `AgendaViewPosition` | 不按同名猜地点、不冒充到达；选日、scope、轴/列表、查询已可随页面回程保留。 |
| 聊天比较轴试放 | `PlanningComparisonTimeline → SemanticSelection.planningTrial → resolvePlanningTrial` | 原 Scene/option 和原日期/时区/完整占用保留；host 返回 hypothetical_not_evaluated、executionAuthorized:false。它与已保存 agenda 的拖动身份不同。 |
| 规划/持久意图采用 | 原 `planning.draft/replan → PlanningApplicationService → planRef → prepare/approve/execute` | 意图归 `h_work plan/planning_intent`，不等于日历项。拖动不能直接改计划参数再沿旧 planRef 保存；完整准备/收尾/休息及逐项顺序仍由原 planner 决定。重启后重算，不恢复旧票据。 |

## 具体剩余问题及最小修法

1. **长标题会令宿主预览失败。** `native-agenda.ts:133` 把 `after.title` 直接给 `planningPreviewInput.alternatives[].label`，后者最大100字，而实际安排 title 最大160字。101–160字的合法安排会在预览参数解析处失败。修改内部预览 label 为有界文本或固定简短标签，原标题继续留在 `assessedOccurrence`；不缩短/覆盖用户数据，也不扩大原 planner 合同。

2. **拖动中更新原对象时，旧手势可能被默默套到新版本。** Timeline 的 Move/PointerMove 保存了旧 reference，但在 `Workspace.tsx:659–661` 的 onPropose 中仅按 id 找当前 owner，替代原 item，未比较 reference.revision。Timeline 的 `disabled` 只阻止开始手势；后续 move/finish 没有在当前 entries/revision 改变时取消。最小修法：在 Timeline 根据当前同 occurrence 的 id/revision/起止与手势基线取消失效手势，并在 onPropose 最后核同 reference 修订再开编辑。真实新版本应保持可见；旧草稿可保留供人理解，但不得隐式变成新时长、新版本的试放。此项目前为源码风险，尚未在实际 UI 重现。

3. **聊天比较轴的中断生命周期仍少于今天轴。** 目前比较轴处理本地 Escape/pointercancel/切 scene 或 day，但未补窗口 blur 与 lost pointer capture 的等效退出。应局部补取消/卸载清理，不能整体换拖拽引擎或破坏跨 A/B 保持同 DOM 的既有运动。实际拖动/失焦/重新抓取必须正常速度观察。

4. **改过时长后的讨论动作可能承诺了没有带回的试放。** AgendaEditor 在 duration 不等于原 beforeDuration 时有意不附 trial，保护原完整时长；但按钮仍仅以 `trialInstant` 显示“讨论这次试放”。此时进入聊天只有原对象，没有当前改过的试放。最小修法可让按钮名称与实际提交合同一致；如主代理决定支持带回整份编辑草稿，应另有 typed 条件并让 host 真实解释，不能把新时长塞进现有“保原完整时长”trial 或假造本人原话。

5. **回程目前保留日期与布局，未保存轴滚动/普通选中对象。** `AgendaViewPosition` 只有 selectedDate/scope/dayLayout/query；有 agendaContext 才恢复编辑焦点，普通从安排看地图后返回未保证原卡仍在眼前。可把观看用的 selectedOccurrenceId 与滚动锚提升给同一 App owner（地址+像素或对象锚即可），不持久化为个人偏好/授权。最终布局确定后再判断是否有必要，不能为此添第二导航状态库。

6. **最终集成证据仍需亲走。** 本次未打开产品或图片，不声称视觉、动效、窄窗、主题、Luna 或校园通过。已有 audit 中的原生操作只覆盖其明确实例；尤其新 App chip/send 与回程、重复单次取消/恢复、全天、窄窗/主题不能从历史构建推定。

## 实施与核查路径

主代理亲审日程原图、确定统一空间和按钮标尺之后，沿现有组件小块修复上述1–4；回程锚点与整体布局由 App/壳负责人协调，不在此并发改共享 App。任何“拖动自动重排其他承诺”的新能力必须交同一 planner 重新计算，保持原对象、完整工作量、来源与当前授权，不能把视觉分栏当成实际重排成功。

正常运行沿现有 `npm run dev:luna:test` 或 `start:luna:test`，用明确的独立合成 `ZAICHANG_DATA_DIR`；包装器删除 DeepSeek key、启用 Luna 代测传输。只用现有构建/检查与正常 UI/API，不新写 runner、断言集或夹具。

本轮应实际观察：拖动跨空白与相撞 → 松手预览 → 取消原记录不变 → 明确保存同 id 新 revision → 撤回为再一修订；重复单次/系列与跨日原范围；在途手势遇新 revision 后退出；失焦/丢失捕获/切日/键盘取消；合规长标题预览；带回聊天保原稿及完整 typed 条件、取消不发送；从原地点回到同日期同对象。Luna 对话还须读实际 responseModel 与宿主采用结果，不能仅以 chip 或截图出现认定闭环。

## 经授权的两项修复与实际证据

随后主代理亲读并明确授权修复上述1、2，仅修现有功能缺陷，不改视觉布局：

- `native-agenda.ts` 将规划内部 option label 固定为短标签“这次修改”，不改变原安排 title 或 planner 的100长度契约。
- `AgendaDayTimeline.tsx` 为指针/键盘手势捕获日期、时区、当前读取边界、日窗与原 occurrence 的 id/revision/起止/时长。稳定值变化时在 layout 阶段取消失效手势；move/finish/键盘确认处也重核。只因新数组引用或不相关行更新不会取消同一有效手势。
- `Workspace.tsx` 传当前 privacy/policy/source/public 边界，并在最终 onPropose 只接同 id、同原 reference.revision 的 owner，不再以新修订替代旧手势。实际写入仍由原保存事务负责。

实际 `npm run check`、`git diff --check` 通过。后一命令只有并发文件既有 CRLF→LF 提示，没有空白错误。未新增/扩展测试代码。

按既有 esbuild 的 Markdown loader 方式编译真实 `Store` 产品模块，直接调用内存 Store / NativeAgendaService 正常 API，没有断言集、模拟宿主或 runner：合法160字安排从08:00只读试放至08:20后，返回 `assessedOccurrence.item.title.length=160`、标题逐字相同、`applied=false`；回读原 owner 仍08:00/revision=1，agenda 数量仍1。没有数据库文件、模型或校园调用。该观察核长标题与只读结果，不代表 UI 手势已验证。

在途修订/来源变化与最终拖动过程仍待主代理的统一隔离UI操作，本代理不将类型通过冒称其通过。

本项唯一一次性产物是 `.test-build/agenda-drag-store.cjs` 的产品编译副本，核完后已删除；文件逻辑长度4,812,999字节（约4.81 MB），不把它当作实际释放磁盘空间。其他既有产物未清理。
