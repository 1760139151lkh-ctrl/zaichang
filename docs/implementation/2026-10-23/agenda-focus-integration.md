# 今天的原安排接回对话

2026-10-23，承接 OpenUI 审查后由主代理明确授权实施。此项修改的是宿主引用链；今天页的触发、输入引用与最终 Luna／桌面观察由主代理统一集成。

## 已接入

`Bridge.send.agendaFocus` → main 严格 schema → Harness 的真实引用标记 → `InputControls` → `RunSession` → `NativeAgendaService.resolveReference` → `ContextPack.data.currentAgenda`。

焦点只含原 `id/revision/occurrenceDate` 与可选 `trial.proposedStart`。宿主沿本轮 scope 回读原日历；当前修订不符、重复实例已取消、来源不在范围或试放缺完整时长时，不从客户端标题或旧副本补回。当前新话不改写成机器生成的条件句。

主助手收到的内容限于所指这一次：原标题、对应单次说明、类型、时区、完成状态、有限规划条件、原发生日期与完整起止。不会因引用一次重复活动而展开全部 exceptions、提醒台词或旧动作批准。receipt 记录 `local-agenda` 与原 agenda id/revision，读取内容计入原预算。

原 `NativeAgendaService` 由 RuntimeCoordinator 持有，main 的 `agenda:day/preview-change` 复用同一实例。日视图、只读预览与对话引用不产生第二套日历状态。

用途与本地动作核验获得的是刚复核的地址、实例时间及试放条件；`executionAuthorized:false` 保留真实含义。它可以解释“这件／这个时间”，执行许可继续从本人新话与原合法前文判断，沿原动作事务、CAS 和回执办理。只比较或试放不会写入日历。

`refreshDependencies` 在后续模型边界重新核原焦点；对象、发生日期或许可变化时，旧 currentAgenda 与试放退出，不用旧时间继续推演。

协作补充：在原控制解释入口为 `notebookQuote` 和 `mapRouteReference` 增加本轮 source／owner 复核后才提供的无正文活动身份；这些原生引用不会被误标为共同创作身份。该接缝由本代理与 continuity_modules 协调，笔记及路线正文仍归它们的原 owner。

## 实际检查与观察

- 此链及后续用途／委托核验字段完成后，`npm run check` 实际通过。
- 对产品 `Store` 模块按现有 esbuild 的 Markdown 资源方式编译后，直接调用正常 `Store/RuntimeCoordinator/NativeAgendaService` API；没有 mock、断言集、新测试代码或 runner，没有调用模型。
- 一项20分钟合成安排从08:00只读试放到08:20，currentAgenda 保原 id/r1，trial 为08:20–08:40，执行许可为false。回读原owner仍08:00/r1，本人原消息逐字不变。
- 一项合成重复系列保 `occurrenceDate=2026-10-23`，其单次例外实际从24日00:10开始，60分钟范围完整，投递的是单次说明而非系列说明。试放仍保60分钟。随后沿原 `acceptLocal` 正常更新同owner至r2，再调用原 `refreshDependencies`，旧 currentAgenda 已移除，旧试放不再采用；系列单次例外完整保留。
- `git diff --check` 没有空白错误。中间一次共享工作区的 `check` 在并发新增 `Workspace.tsx` 147–148 三处 `number | undefined` 报错，实际是 agendaDay 的状态边界未收窄；日程负责人按真实就绪边界修正后，本代理再次运行 `npm run check` 已通过。这仍不替代主代理最终整合与界面复核。

这些观察证明真实宿主读取、试放身份、单次跨日范围和版本失效，**不证明 main IPC 的桌面交互、Luna 对话理解或完整今天页体验已经通过**。该闭环仍由主代理在当前整合包统一操作。

## 文件与清理

本链的小块位于 `src/shared/types.ts`、`src/main/main.ts`、`src/main/harness.ts`、`src/main/runtime/{policy,coordinator,context,interaction-control-context,action-delegation,read-purpose}.ts`；未改 App、AgendaDayTimeline 或 AgendaEditor。

已删除本项一次性产品编译副本 `.test-build/agenda-focus-store.cjs`，文件长度4,797,923B（约4.58MiB）；这是文件逻辑大小，不作为已释放磁盘空间声明。直接观察使用内存 Store，没有新数据库、模型调用、DeepSeek调用、推送或部署。
