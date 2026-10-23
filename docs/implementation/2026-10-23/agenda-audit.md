# 今天、日程时间轴与同对象流转审查

本轮日期：2026-10-23。本记录区分起始源码审查、随后获授权的实施和实际观察；代码存在、直接 API、原生操作与尚待整合的范围分别记录。

## 依据与范围

- 已亲读桌面《在场前端优化.md》全文、仓库 `AGENTS.md`；本轮直接任务要求覆盖旧暂停、停止创新及只在本地的阶段安排。附带资料中的旧设想仍须与原话、当前源码区别。
- 已读本机 Product Design Director 的 `SKILL.md`。这里只形成产品判断；后续任何可见变更仍须亲看最终集成画面和实际操作。
- 调查起点：分支 `codex/personal-memory-continuity-20261018`，HEAD `6d5dcc1dd4b3bab7053a333366c6661a21e1b571`，提交时间 2026-10-22 23:23:22 -07:00。起始 `git status --short` 和日程相关 `git diff` 均无输出；不能将本轮其他代理随后修改覆盖为同一证据。
- 重点亲读：`Workspace.tsx` 的 AgendaView，`AgendaDayTimeline.tsx` 全文，`LifePanels.tsx` 的 AgendaEditor，`today.css`；原日历/规划/采用/Scene/选择/Bridge 调用链。合同对照 `PRODUCT_CONTRACT.md` 日程与场景部分、`CONVERSATION_SCENES.md` 日历/规划部分及 `PROJECT_NAVIGATION.md` 对应入口。
- 不新增测试代码、临时 harness 或 runner；本调查没有发模型请求、访问校园账号或修改产品代码。

## 真实所有者与当前路径

| 人的操作 | 当前调用链 | 已成立的边界 |
| --- | --- | --- |
| 在“今天”看安排 | `App.tsx:1708` → `Workspace.tsx:69` AgendaView → `State.agenda`；个人有日期、已知时长的非重复项 → `AgendaDayTimeline.tsx:112` | 原 `Action.id/revision` 保留。校园项经 `useCampusDaySchedule` → `campusSchedule` 单独只读，不写本机日历。 |
| 在轴上拖动 | `beginPointer:264` → `pointerPosition` / 自动滚动 → `finishPointer` → `onPropose` → `Workspace.tsx:553` → AgendaEditor `initialStartsAt` | 试放只保存在组件状态；未调用保存。原位置留虚影，拖动保留原时长。 |
| 键盘试放 | `AgendaDayTimeline.tsx:308` | 方向键 15 分钟，Shift 1 分钟；回车进确认；Escape/失焦/日期或时区变化取消。 |
| 确认修改 | `LifePanels.tsx:144` → `zaichang.action` → `src/main/preload.ts` → `main.ts:771` → `RuntimeCoordinator.acceptLocal:4877` → `changeLocalFromUI:4962` → `ActionRuntime.directLocal` → `LocalCalendarService.apply` → Store 原 agenda | 同对象 compare-and-swap 原修订；不复制新安排。原写入会维护动作、回执、日历修订与提醒。 |
| 撤回这次挪动 | `Workspace.tsx:207` undoMove → 先 `state()` 回读 → 只恢复 startsAt/timeZone/duration → 同一 action 路径 | 仅当前修订仍等于保存修订时可撤回；他处已改不会被旧撤回覆盖。 |
| 聊天看日历 | `local.agenda.read` → `expandAgenda` → coordinator `scenes.agenda` → `agendaSnapshot` → `PlanningScene(mode=agenda)` → 原消息呈现 | host 展开重复与例外；agendaRecord 保存 id/revision/occurrenceId/occurrenceDate/状态；跨日保 originalRange，不造空闲。 |
| 聊天里比较、拖动提议 | 原 `planning.compare` / option → `PlanningComparisonTimeline` → `SemanticSelection.planningTrial` → `SceneRegistry.selection:515` → `resolvePlanningTrial` | 原日期、时区、完整时长及 option 来源由 host 回读；试放是 typed 临时条件，状态为 `hypothetical_not_evaluated`，执行授权始终 false。 |
| 采用规划 | 原 planRef → PlanningApplicationService → 原 action / approval / execute | 保存单位已包含准备/收尾；转场、休息与保护占用有独立完整单位，不能只复制工作正文。逐项采用并非整组原子提交，重启/过期票据不会恢复。 |

## 已有价值应保留

1. **轴上的直接操作不是空壳。** 指针先越过 4px 才视为拖动，真实跟随 pointer，15 分钟吸附后保留精确落点；边缘自动滚动，指针捕获、取消及拖后误点击抑制均已有实现。无需重写为另一套拖拽引擎。
2. **日期没有依赖操作系统时区。** `agendaDayWindow` 以声明时区的两个真实午夜构造窗口，允许 23/25 小时；`fromTimeInput` 对 DST gap/fold 不静默猜测，并可用原 instant 保留未改的重复时刻。全天 civil date 独立于 instant。
3. **采用与查看已经分开。** 今天拖动先确认，聊天选块仅给 composer 引用；已接受、愿望、邀请、未接受方案在宿主合同里分别存在，不能为了统一外观合并状态。
4. **同对象已有长期身份。** Action 的 id/revision、规划的 planRef、场景的 agendaRecord、地图的 placeId、笔记的 NoteReference 各有真实 owner。跨页应传精确地址，保留这些 owner，不再建“统一对象副本”或第二事实层。

## 具体缺口与最小方案

### A. 当天轴没有展开重复实例

代码事实：`Workspace.tsx:149–153` 把所有 recurrence 放到“重复的安排”列表并排除当天主体；`agendaTimedRange:36` 也明确排除 recurrence。于是每天发生的个人安排只能在列表尾看到系列，不能与今天课程/一次性事项形成一张真实占用图。周上日期圆点同样只来自非重复项。

最小方案：加薄的、仅限本人本机的有界日视图 Bridge，宿主复用 `expandAgenda`；结果沿已有 `agendaSnapshot`/`agendaRecord` 形式或等价 typed 投影返回 occurrenceId、原 Action id/revision、原 occurrenceDate 与 originalRange。renderer 只排版，不复制 recurrence 算法。单次编辑精确带原发生日期，整个系列仍由现有 AgendaEditor 范围控件负责。全天、无结束与未定日期仍用相应形态，不为了入轴猜时长。

### B. 试放反馈没有看到冲突，也没有重新布局碰撞关系

代码事实：今天拖动松手后直接进入 AgendaEditor；保存路径没有调用 `previewCalendarPlan`。`arrangeLanes` 只按原 entries 计算，拖后的新落点仍沿原 lane/lanes；重叠可能仅视觉盖住另项，而没有告诉人挪动造成什么影响。现有 `planning.preview` 已会核同目标版本、重复实例、转换成本、未知结束与来源覆盖，且是只读计算。

最小方案：在原编辑 sheet 内增加宿主预览的窄接口，只接受原 targetId/expectedRevision 与当前实际编辑字段；host 回读原对象和当前 agenda，复用 `projectCalendarChange` 与 `previewCalendarPlan`。来源覆盖由 host 提供，renderer 不得声称校园/天气已齐。校园只可沿已获准的真实读取 owner 加入，不能把画面上可见 rows 反签为证明。拖动期间可以给轻量重叠形态，松手后的已知冲突/未知来源由 host 回读结果解释。保留用户明确保存自己的安排的能力，不把“存在重叠”误改成无条件禁存。

### C. 今天到聊天只传日期，安排对象与试想丢了

代码事实：`Workspace.tsx` 的“接着聊这一天”只调用 `onContinue('我们接着聊 YYYY-MM-DD 这一天的安排。')`；普通安排卡点击只编辑，没有同对象继续谈的入口。`App` 当前 composer 支持 Scene selection、NoteReference、MaterialQuote 等 typed 引用，但无原生 agenda 记录引用。

最小方案：优先让今天的原生日程投影注册同一合法 Scene，回聊天时传 `SemanticSelection(kind=time_block)` 的真实 scene/id/revision/blockId；如果注册不能符合现有 Scene admission，则加小型 AgendaReference，host 以 id/revision/occurrenceDate 回读，不借伪造 Scene id 绕过原门。引用在现有 composer 表示一处焦点，可取消，不向草稿追加机器条件句。让拖后有“继续商量”路径，typed proposedStart 独立于本人原话；进入聊天不自动保存、不授予调整其他事项的许可。

### D. 有地点的同一安排无法从今天抵达地图

代码事实：`CalendarFields.planning.placeId` 存在；聊天 agenda projection 已投影 placeId。AgendaDayTimeline 的 props 只有 onEdit/onPropose，普通 Action 行也没有地点动作。`AgendaView.onMap` 只传给“还在商量的事”里的 MatterCard；日程卡没有用到它。校园 course.location 是文字，不能按名称直接冒充真实 placeId。

最小方案：仅当 host 原对象有合法 placeId 时，在当前聚焦安排的轻动作给原地图入口；保留 agenda id/revision 作为返程上下文，地图返回定位到同一个原对象。地点名称只作显示，不能用同名猜关联。暂不把安排位置当设备位置或已到达。

### E. 两个时间轴的试放手感与取消语义不一致

代码事实：今天轴 15 分钟（Shift 1 分钟），聊天比较轴 5 分钟（Shift 左右）并只出现 ghost；前者有 window blur/Escape/pointer lost 取消，后者只在局部 keydown/pointercancel/选日变化取消，没有相同的全局 blur/lost capture 生命周期。`PlanningComparisonTimeline` 的原 key/host identity 及跨版本布局稳定做得有价值，不宜整体替换。

最小方案：保留各自方向与场景的布局，统一明确的取消/中断契约和焦点恢复；对比较轴补足丢失 pointer capture、窗口失焦、拆卸清理等局部生命周期。步长可以按场景保持，不要仅为“统一”删掉今天的一分钟精调。动效必须在实际连续 A↔B、拖动与中断中观察，静态截图不能确认。

### F. 邻近体验机会

- **安排的回程书签。** 从今天看地点/聊安排后返回，保留当前日期、轴/列表和原对象焦点，降低“回来再找一次”的负担。现有 view 条件挂载使 AgendaView 离开即卸载，应将少量观看状态提升到 App 的正常 owner，或沿有界导航地址恢复；不持久化为用户偏好。
- **完整占用的可读折叠。** 原规划保存单位已把准备/收尾计入 duration，用户看到的标题与 detail 可以在聚焦时展开工作段和完整占用，常态只保留一张清楚的时间卡。转场/休息仍是独立原对象，不随工作卡拖动而隐形迁移。
- **只在焦点处出现动作。** 地图、接着聊、修改、完成围绕当前卡出现，不给每张卡堆一排常驻辅助标签；键盘 focus 同样可达。具体视觉由主代理结合参考图确定，本记录不代替审美裁决。

## 正常入口验收方式

后续应在独立合成数据目录用既有 `npm run dev:luna:test` 或既有隔离桌面入口操作；禁止测试 DeepSeek，不把真实校园正文留进可提交证据。

1. 从聊天经正常 action 采用一项具体安排，再开今天，确认仍为同一 id/revision；拖动跨空白与另一安排，看到原位置、当前落点、完整时长及冲突关系。松手先有可审阅 sheet，取消后原记录不变；确认后回读同 id 新 revision。
2. 用键盘精调再 Escape、拖动时 Escape、窗口失焦、切日、中途取消、边缘滚动；亲看过程与焦点，不能只看最终截图。撤回挪动后应是新的修订；他处先改后再撤回，旧撤回不得覆盖后改。
3. 让一个真实重复系列、一次例外、取消例外与跨午夜事项进入同一日视图，核 occurrenceDate/occurrenceId 和完整范围；日轴、列表与编辑同源。用声明时区观察 23/25 小时日，不以 24 小时像素长度推断。
4. 从同一安排进入聊天，保留输入原稿；引用可独立拿掉，试放条件可编辑/取消，Enter 不自动发送。正常 Luna 后续问实际读到原记录地址与当时/当前版本差别，不能只证明 chip 出现。
5. 从含合法 placeId 的安排到地图，再返回同日期/同焦点；不新建安排、不伪造到达。保存后再到聊天看当前日历，原对象只出现一次。
6. 在 1280 左右常用宽度、680 窄窗、长标题、重叠短块、全天/未知结束、空/加载/异常与至少浅/深主题观察集成画面；对齐用户时间轴参考，检查人物与内容、轴刻度和卡片的空间，操作整个动效过程。
7. 现有 `npm run check` / `npm run build` 只作为语法、类型和打包证据；必要现有日历检查只按影响调用。上述正常入口、状态回读、Luna 实际 responseModel 与视觉观察分别记录，不能互相代替。

## 后端实施与实际观察

主代理审定后新增 `src/shared/agenda.ts` 与 `src/main/runtime/native-agenda.ts`，前端等待主代理看图审定，没有提前改 UI。日读沿原 broker 的 `local.agenda.read`；变更预览沿原 `projectCalendarChange` 与 `previewCalendarPlan`，不另写重复、冲突或采用算法。两入口均核本人/real/self、evidence:read、local-agenda、privacyEpoch/policyRevision/sourceBoundary 和 public 展示边界；原记录修订有变化时拒绝旧地址。选中校园范围时只通过原 planning 保存快照读取与当前性检查。

跨聊共享合同为 `AgendaFocus { record: { id, revision, occurrenceDate? }, trial?: { proposedStart } }`。`resolveReference` 回读当前 owner 与原实例，试放保持完整 duration，返回 `executionAuthorized=false`。它不伪造 Scene，也不拼接机器句到本人原话；send/composer/context 接线由主代理协调，仍需正常 Luna 检验。

实际执行 `npm run check` 通过。直接导入 Store 的首次尝试被现有 `.md` 资源加载方式阻止，随后按现有 esbuild 配置编译产品模块再调用现有 API；这属于局部工具路线修正，没有新测试/runner，也没有换会话。采用现有已记录为合成的 SQLite 原生备份，不修改原证据库：

- `.test-data/agenda-native-20261023-NXRMgF/day.json`：读取 2026-10-23 得到重复提醒的当天 occurrence，原 record id / revision=2 和 occurrenceDate 保留，occurrenceId 精确到本次日期；end 为 null，没有猜出时长。
- `.test-data/agenda-preview-20261023-6NlZPD/preview.json`：原 20 分钟“正常写作A”由 08:00 试放到 08:20，明确返回与 08:20–08:40“正常写作B”的冲突；来源覆盖只说本机，其他日程仍未知。preview 的 `applied=false`，typed trial 仍为 20 分钟且 `executionAuthorized=false`。同库回读原 A 仍 08:00、revision=1，agenda 仍六项。
- `.test-data/agenda-native-20261023-NXRMgF/override-reopen.json`：沿原 `acceptLocal` 把已有合成系列的一次实例调整成跨午夜的完整 60 分钟，取得 confirmed_success、原系列 revision=3；正常关闭重开后，23/24 两个日读均保留这次 occurrenceDate=23 和同一完整范围，24 日的正常实例仍是另一 occurrence。将前者只读试放到后者的时刻，返回同系列另一实例的真实冲突。没有把跨日显示片段另存为安排。
- 同目录 `dst-day.json`：新 Native 日入口实际读 America/Los_Angeles 的 2026-11-01，窗口 07:00Z 至次日 08:00Z，为真实 25 小时；该合成库这一天为空，没有把空日历说成全部现实空闲。

本轮后端尚未宣称：真实校园读取、全天的新接口实际运行、最终 UI 手感或 Luna 链路。这些应随集成继续核查。没有模型调用、账号读取、新测试代码或清理文件；临时编译产物和合成证据位置已留明，收尾只删除确认可重建的本轮编译文件。

## 日程界面实施与原生操作

主代理亲看 V007、V116、V129 后审定沿现有合适图稿实施，无需重复生图。本负责人随后也亲看这三张完整原图，并读 Product Design Director 的 motion/craft 章节，修改 `Workspace.tsx`、`AgendaDayTimeline.tsx`、`LifePanels.tsx` 与 `today.css`：

- 日读用 Native 的真实实例投影；同系列的跨日例外与当天正常实例按 occurrenceId 分开，编辑回原 Action id/revision/occurrenceDate。手势、ghost、选中和当前对象都不再只以系列 id 匹配。
- 原位 ghost、15 分钟跟手吸附、一分钟键盘精调、Escape/丢失指针/失焦取消继续保留；试放相撞后，按新落点分栏，另一项安排仍可见。跨日显示保留完整原范围，不给切片独立拖动保存。
- 左侧连续时间轴与右侧当前对象组成同一页。日期/分区同排，课表/范围同排；右栏从页面内容起点开始，空说明按需展开，已有说明默认展开。真冲突就在正在改的对象里，范围细节按需读。
- 重复实例编辑保留“只改这一次/整个系列”；取消一次只写原实例 cancelled，不保存未提交的其他草稿；明确恢复可沿同一系列保存。挪动撤回同样区分单次例外，且回读当前修订后只恢复这一处时间字段/例外。
- 原地点有合法 placeId 时复用地图入口；支持 typed 讨论原对象/试放。手势条件不拼进本人草稿，不自动发送、采用或排其他安排。若用户已改时长，讨论入口只引用原对象，不把缩短后的草稿冒充“保持原完整时长”的试放。
- 先前开始、尚无结束的原安排不会被忽略后再显示“这一天没有安排”；当前日之外的 unknown_end issue 按具体原对象与起始时间给可打开的一处记录。
- `AgendaViewPosition`、`onPositionChange`、`onDiscuss` 与 `focus` 是交给 App 的窄接口。只有原 id/revision 仍相符时才恢复先前试放，且不恢复批准。App 由 branch_fusion 集中接线，不由本负责人并发修改。

原生实例使用既有合成库的原生备份，保留在 `.test-data/agenda-ui-20261023/zaichang.sqlite`。启动沿现有 Luna 代测包装器和真实 Electron 桌面，不建临时 runner，没有发模型请求。原生窗口重开用于载入新的产品构建，继续同一个合成 profile；它不是模型会话失败恢复。

本负责人实际通过 Computer Use 看过并操作：今天入口 → 原对象 → 鼠标把 08:00–08:20 试放至 08:15–08:35 → 原位 ghost、完整 20 分钟和 B 的真实冲突 → 关闭试放后回原时间 → 再试放 → 保存 → 撤回挪动。首轮发现顶部工具占高、右栏起点过低、B 被试放卡盖住、空说明占掉操作区等问题，已修后重看与继续操作。

实际状态与证据：

- `after-ui-trial-before-save.json`：界面已经试放，原 A 仍 id=`3f5146eb-1b3d-43bf-9187-a5671606c6ec`、revision=1、08:00、20 分钟，agenda 六项。
- `after-ui-save.json`：通过右栏真实“保存”后，同 A 到 revision=2、08:15、20 分钟，仍六项。
- `after-ui-undo.json`：通过真实“撤回挪动”后，同 A 到 revision=3、08:00、20 分钟；不是旧修订回写。
- `evidence/agenda-trial-conflict.png` 与同名 `.txt`：实际看过的试放、原位 ghost、A/B 同时可见、右侧真实冲突及可操作保存/取消。截图中的内容是合成原生数据，不是设计图。
- `evidence/agenda-after-undo.png` 与同名 `.txt`：实际撤回后的原位日程。图与状态均只留本机忽略区。

本机 Windows helper 曾返回输入几何不可用、用户输入检测、另有请求活跃，以及操作后立即捕获旧帧；均按当前目标重新观察并继续同一实例，没有把这些局部工具/等待问题称作模型会话失败。没有操作课程页、私人账号或其他已有 profile。

`npm run build`（包含 check、桌面与公共 review）通过，后续 UI 修正又通过 check 与 Vite 产品构建；现有 chunk 大小警告保留。没有新增或扩展测试代码。

目前交由整合继续的明确范围：App typed chip/send 与返回接线后的真实 Luna、所有主题/约 680 窄窗、重复单次取消/恢复的原生 UI、全天和真实校园。本负责人未将后端 API 证据扩称这些均已通过。shell_space 正在承接主题/宽窄集成检查；最后补的字段顶线对齐与浮动撤回条也需在该整合构建里复看。浮动撤回条用于让保存回执不再把整条时间轴推下。

清理：已删除本轮两份可重建编译模块 `agenda-native-owner-20261023.cjs`（约 4.77 MB）和 `agenda-native-service-20261023.cjs`（约 819 KB），这些是文件逻辑大小，不声称等于释放磁盘空间。合成库、输出、截图与必要恢复资料保留；独立桌面仍可供主代理亲核。
