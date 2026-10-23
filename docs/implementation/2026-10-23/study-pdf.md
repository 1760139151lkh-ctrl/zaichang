# 本轮学习、资料与 PDF 接续

2026-10-23。已完整读取本轮 `goal-objective.md`、仓库 AGENTS、Product Design Director 及已有产品演进、动效与观察相关参考；本轮目标覆盖旧的暂停和停止扩展安排。当前 checkout 是 `codex/personal-memory-continuity-20261018`，HEAD `6d5dcc1dd4b3bab7053a333366c6661a21e1b571`。以下以当前共享未提交源码为准，不将 `study-audit.md` 的既有运行记录升级为这次任务的验收。

## 已有价值与实际入口

「留下 → 资料」不是新建的材料库。`App.tsx` 同一 `conversation-space` 中保持 `MaterialsPanel` 与原聊天、原 composer；窄于 900px 切换原文/一起聊。原文件由 `attachText → MaterialService.stageFile` 产生宿主引用，`materialsRead/Quote/KeepQuote/Notes` 经有限 Bridge 和 main IPC 进入既有 owner。renderer 不持有任意路径读取权。

共享 dirty 已实现了上一轮提出的主要基础，不能重做：

- 原 PDF 页面像素与 `textRuns` 使用同一已核字节，原提取顺序/Unicode 坐标和 bbox 回传；`MaterialPdfPage` 的透明文字层可以选段、投影搜索/引用/笔记淡标。
- 「聊这一段」回到原 composer，仅带 `resourceId + sha256 + page + start/end`；保留用户原稿。发送时 main 再读原件，不信任前端显示引文。
- 「记一笔」保存原 Notes 实体，`source.material` 指向原件；页边入口打开同一 Note id，以原 revision 编辑。新批注与已有批注草稿分别留在本窗口，Esc 收起，存在「继续写」入口。
- `useMaterialReadingPosition` 只持久保存原件地址/hash、页码、阅读方式、缩放和滚动；重新取得合法列表后才恢复，不恢复文件权限或正文。`ReadingDivider` 已有 pointer capture、Esc 回滚、键盘、双击复原和比例持久化。
- `App` 当前已传 `reference` 与 `onUnsavedChange`，旧 `study-audit.md` 中「仍待接线」已不再适用。
- 笔记页「回到原文/聊这一段」沿 `App.openMaterialSource → materialsQuote` 重开原位置；原件退出后，独立笔记仍归 Notes，来源地址不授予重新读取原文件的许可。

学习纸是另一种同对象呈现：`StudySceneView → studyProject` 按原 message 准入并读取当前 `study_companion` owner；原题、attempt、help、next 均有稳定 id 和 revision。它复用同一个停靠 composer，点旧行/帮助只加一个可取消引用；「给提示/例子/解释」仍是普通对话输入。`ExplorableStudyView` 已能拖参数和观察点，并按当前帮助关系重算；继续问时提交 `StudyInteraction.explore`，宿主重新回读和计算。不能新造学习数据库或把鼠标拖动当作掌握事实。

## 图稿功能映射的对象

本次亲看了原图「留下资料阅读」、编号 18「标量方程学习界面」及上一轮本机 PDF 实现截图。主代理仍须自己逐图审美及确定统一网格。

| 图中关系 | 真实对象和必须保留的身份 | 当前差距 |
| --- | --- | --- |
| 资料清单 + 最近阅读 + 预览 | `MaterialItem` 与同 hash 的 reading position；预览仍调用原 `materialsRead` | 清单现在作为弹层/无文件首页出现，未形成原图中并排的可选资料与预览；文件项也没显示已存在的最近页码。不能把设计图 36 页等数字当真实元数据。 |
| 左 PDF / 右讨论，角色退到小头像 | 原 `MaterialsPanel`、原聊天和 composer；同一个 material quote | 外层分屏已可调整；新统一壳布局须保留该比例、两边阅读位置和小引用，而非重挂第二套聊天。 |
| 选段与页边批注相连 | 原 `MaterialQuoteReference`，原 Note id/revision；视觉 anchor 由与源范围交叠的 textRun 投影 | 目前页边图钉是按首个交叠 run 自动摆放，编辑器固定右下角；没有可拖动批注和源位置的连续连接。 |
| 把眼前一段带去讨论 | 当前合法 source address；草稿不改字、不自动发送 | 只有点按「聊这一段」；尚无原选段/批注拖到 composer 的真实落点。 |
| 原题 / 自己尝试 / 伙伴帮助 | 同一 Study owner、problem/attemptId/stepId；原消息准入与当前 revision 分开 | 学习纸两列比例是 CSS 固定值；若本轮把它纳入可直接调整的纸桌，需要独立布局状态，不能把拖动写成 Study 业务修订。 |

## 本轮建议实施边界

等待主代理亲看全图、发出统一布局规范后，再落下列实质增量。它们应接在已有实现上。

1. **批注可搬，原文位置不动。** 页边笔记打开后，其标题条成为可拖位置；在 reader 可视范围内跟手移动，边缘约束，Esc 回到本次拖动起点，键盘有等效移动。当前笔记与 source run 之间显示细线，缩放、滚动、分屏变化时一起更新。保存仍更新同一 Note；拖位置只改变布局，不改 `source.material`。跨页/换文件时不能把旧批注连到当前无关页。
2. **选段带回当前交流。** 从现有轻动作或页边源标拖出一个轻量引文，composer 出现可见落点，放下后重走 `materialsQuote` 再调用原 `onQuote`。保留原稿、不发送、不创建笔记。用应用内 pointer 手势与 typed address，避免把外部拖来的任意 JSON、复制文字或文件路径当内部授权。窄窗通过同一「聊这一段」提供等效入口。
3. **资料列表与预览成为同一次挑选。** 用现有列表/当前文件阅读面，选文件立即预览，当前阅读地址仍在；显示实际已保存的最近页码，继续读和一起聊都走原入口。标题搜索、取消选择、未送出的 pending 原件退出、来源变更和打开失败继续保留。不能为了完整原图增加课程/生活等没有 owner 的装饰导航。
4. **学习纸的可调空间按真实布局决定。** 若统一图稿保留原题与稿纸的明确分区，可以复用 ReadingDivider 的 capture/Esc/键盘模式，但参数与外层 reader/chat 比例分别存。窄宽堆叠时停止横向拖动并保留两面内容。不要为了「全场景拖拽」让整段文字无意拖走、阻碍选字。

批注重新绑到另一个原文范围属于业务来源修改，当前 Notes API 无此合同。本轮可先完成明确有价值的「移动批注视图 + 原址连线 + 带去交流」，不把移动纸面伪称改了原始锚点；若设计明确需要重新绑源，必须在宿主增加同 Note CAS 的精确新来源更新，不能只改前端坐标。

## 需要针对性留意的接缝

- `materialsNotes` 每页只返前 100 条及 `hasMore`，当前 UI 忽略尾页。至少给既有笔记入口可达的继续查看方式，不能让「全部批注」在第 101 条静默缺失。
- 笔记编辑器可在浏览另一页时保留原草稿；任何连线、拖动和落点均应按 editor 自己的 source 对象决定，不能默认当前 reader 即其原页。
- 当前 textRuns 仅携归一 bbox 与 `dir`，透明层按横排放置；旋转文字等复杂 PDF 尚不能据此承诺字形/选区完全重合。普通讲义先实际检查公式、中英混排和跨 run 选区；确有错位再沿原 PDF transform 修，不新增客户端 PDF 引擎或 OCR。
- 当前 reading hint 仅在文字模式展示，原页已有像素；不得再次出现「切到页面」却身处页面的提示。
- `nativeReadPage` 是单个原生 reader 请求，Study 内嵌原页和资料预览若同时请求会互相取消；复用入口或明确当前预览 owner，避免悄悄发两份竞争页面读。

## 正常入口核查范围

进入实现后，在同一隔离 Electron profile 沿「留下 → 资料 → 原页选段 → 记笔记/拖动 → 带回对话 → 回原页 → 换页/缩放/分屏 → 笔记回源 → 正常退出重开」实际操作。检查草稿原字、同一 Note id/revision、源 hash/Unicode 地址、阅读位置与布局位置，而不只看按钮是否能点。再看统一主题、长中文和公式、窄窗切面、拖动中 Esc/失去 capture、当前源退出后的恢复。实际 Luna 的选择与工具回传另走原真实链路，不由前端正常操作代证。

本次至此只读调查与记录，没有改产品源码、生图、运行模型或新增测试/runner；没有清理文件。当前真实 UI 尚待主代理统一启动后查看，不把之前本机截图当本次集成成品。
