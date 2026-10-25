# OpenUI 实时交互造物、空间连续性与跨模块单一 Owner (`openui-spatial-and-cross-module.md`)

> 对应核心代码：[`src/main/runtime/interactive-program.ts`](../../../../src/main/runtime/interactive-program.ts)、[`src/main/runtime/interactive-program-local-state.ts`](../../../../src/main/runtime/interactive-program-local-state.ts)、[`src/shared/interactive-library.ts`](../../../../src/shared/interactive-library.ts)、[`src/main/runtime/source-bookmark-native.ts`](../../../../src/main/runtime/source-bookmark-native.ts)、[`src/main/runtime/study-companion.ts`](../../../../src/main/runtime/study-companion.ts)、[`src/main/runtime/native-agenda.ts`](../../../../src/main/runtime/native-agenda.ts)、[`src/main/mapService.ts`](../../../../src/main/mapService.ts)、[`src/shared/map-routing.ts`](../../../../src/shared/map-routing.ts)。

---

## 1. OpenUI (`@openuidev/react-lang`) 实时交互造物与状态回流

在场中的动态视图（`PresentationView` / `InteractiveProgramView`）绝不是静态截图或死板的 JSON 表格，而是由主模型通过 `present_view` 实时编写、支持物理拖拽与声光交互的 **OpenUI Lang 活程序**。

### 1.1 核心交互原语（Interactive Primitives）
定义于 [`src/shared/interactive-library.ts`](../../../../src/shared/interactive-library.ts) 与 [`src/renderer/presentation/`](../../../../src/renderer/presentation/AssistantPresentation.tsx)：
- **几何与物理探索**：`Canvas`、`Curve`（参数曲线/函数图像）、`Point`、`Line`、`Area`、`DragHandle`（可在画布上直接拖动的二维控制柄，实时驱动 `$params` 变量）、`Motion`（时间轴/弹簧物理演化）。
- **声音与乐理交互**：`Voice`（音高、波形、包络合成）、`Press`（可弹奏琴键/触发垫）、`AudioTrace`（实时声波与频谱轨迹）——让丰川祥子或初华能直接在对话里为你写出一架可弹奏、可调和弦色彩的桌边小钢琴。
- **真实来源插槽**：`SourceSlot`（通过稳定 `sceneId + revision` 嵌入真实的浙大课表、地图路线或学习卡片，**严禁在 DSL 里手抄伪造校园数据**）。

### 1.2 流式生成、增量修补与 CAS 局部状态回流
1. **流式生成感知**：当模型开始流式输出 `present_view` 工具参数时，宿主通过 `onToolCallProgress` 在当前回复文本锚点处即时挂载 `presentationActivity`（`generating` → `checking`），让用户看到作品正在她笔下展开。
2. **`previous + patch` 增量续改**：当用户说「把阻尼系数调大一点」或「再加一条切线」时，模型无需重写整份程序，只需传入 `previous: { messageId, programId, revision }` 与增量 `patch`；宿主校验源程序身份与权限后原位升级 `revision`，保持视图在消息流中的原始锚点位置不变。
3. **120ms 防抖 CAS 持久化（`NativeProgramLocalState`）**：用户在 OpenUI 视图中拖动滑块、`DragHandle` 或切换开关时，前端以 120ms 防抖调用 `saveInteractiveProgramState`，携带 `expectedStateRevision` 落库到 SQLite。刷新或重启应用后，用户调过的参数状态原样保持。
4. **`Continue` 真实状态回流**：当用户点击交互程序上的动作按钮或接着提问时，前端将 `{ messageId, programId, revision, nodeId, stateSnapshot }` 一并传回主循环；宿主核验后注入 `pack.data.currentInteractive`，让模型清楚看到用户刚刚把哪个参数拖到了多少，顺着他的探索继续聊。

---

## 2. 跨模块单一权威 Owner 与稳定 ID 契约

在场拥有六个紧密相连的生活与学习空间：**对话（Chat）**、**今天/日程（Today/Agenda）**、**陪学（Study）**、**资料/PDF（Materials）**、**笔记（Notes）** 与 **校园地图（Map）**。

### 跨模块对象流转铁律（The Single-Owner Handoff Table）

| 业务对象 | 唯一权威 Owner | 跨模块传递的稳定引用 Schema | 严禁出现的反模式 |
| --- | --- | --- | --- |
| **对话中的某句原话选段** | `KernelRepository` (`h_evidence`) + `NativeSourceBookmarkService` | `ConversationBookmarkReference`: `{ sessionId, messageId, contentVersion, sha256, start, end }` | 严禁把前端选中的 DOM innerText 直接当成已核实原话传给模型或写入笔记 |
| **资料/PDF 中的页或摘录** | `MaterialService` | `MaterialQuoteReference`: `{ resourceId, version, sha256, page, start, end, crop }` | 严禁脱离 `resourceId + version + page` 复制一段无出处的文本 |
| **笔记本中的笔记或段落** | `NotesService` | `NoteQuoteReference` / `NoteSourceProof`: `{ noteId, revision, contentSha256, start, end }` | 严禁静默覆盖用户正在编辑的笔记草稿；回合中若用户改了笔记，`onChanged` 实时通知主循环 |
| **一道正在攻关的题目** | `StudyCompanionService` (`h_work: study_companion`) | `study:{sha256(matterId + source + problemIdentity)}` + `revision` | 严禁把「给过提示」当成「已独立掌握」；修改题干时保留 `priorProblemSources` 历史依据 |
| **日历安排与重复实例** | `CalendarService` + `NativeAgendaService` | `AgendaReference`: `{ id, revision, occurrenceDate? }` + `AgendaFocus.trial?` | 严禁把拖拽试放（`trial`）直接写入数据库或当成用户已批准修改 |
| **校园地点与路线** | `CampusMapAdapter` (`assets/map-v2`) | `MapRouteReference`: `{ routeId, schemaVersion: 'map-route/v2', from, to, sourceVersion }` | 严禁把故事插画（如想象中的木桥）当成真实导航几何；严禁把讨论过的地点当成用户当前 GPS 位置 |

---

## 3. 六个具体跨模块微界面（The 6 Life-Continuity Micro-Interfaces A–F）

这六个微界面将后端的严谨契约化作了自然、可触摸的窗边生活体验：

### A. 思路破冰小便签（Non-Spoiler Step Hint Card）
- **后端契约**：[`StudyCompanionService`](../../../../src/main/runtime/study-companion.ts) 与 [`StudyNativeService`](../../../../src/main/runtime/study-native.ts)。
- **体验闭环**：面对微积分、线代或电路难题，不直接糊一脸完整答案剥夺思考乐趣，而是生成绑定原题码位/页码的**「第一步怎么下笔」破冰小便签**（`kind: 'hint' | 'question'`，含 `focus` 与 `nextMove`），并允许展开可调节参数的 `explorableStudy` 几何直觉小画布。学生自己的尝试（`attempts`）与助手的提示（`steps`）严格分列。

### B. 桌边书签托盘（Cross-Module Source Bookmark Tray）
- **后端契约**：[`NativeSourceBookmarkService`](../../../../src/main/runtime/source-bookmark-native.ts) (`preview` & `keep`) + [`src/shared/source-bookmark.ts`](../../../../src/shared/source-bookmark.ts)。
- **体验闭环**：用户从对话气泡、PDF 讲义页或笔记本中选中一段话拖入桌边书签托盘（[`SourceBookmarkTray.tsx`](../../../../src/renderer/SourceBookmarkTray.tsx)），可一键带入陪学推导行、带入当前对话追问，或通过 `keep()` 保存为带精确来源回链（`material / notebook / conversation`）的独立笔记页，绝不污染原笔记草稿。

### C. 回来仍在原处（Gentle Return Bookmark）
- **后端契约**：[`src/renderer/workspace-return.ts`](../../../../src/renderer/workspace-return.ts)、[`src/renderer/study-reading-position.ts`](../../../../src/renderer/study-reading-position.ts) 与各 Owner 版本核验。
- **体验闭环**：当用户切去别的页面或关掉应用后重新回来，左下角温和浮现一张「上次停在《高等数学》第 14 页 / 那道积分题第 2 步」的书签（[`ReturnBookmark.tsx`](../../../../src/renderer/ReturnBookmark.tsx)）。点一下即回到原页码与原滚动位置；若只想闲聊，点 × 即可收起，**绝不把未做完的题变成催债弹窗**。

### D. 安排冲突试放沙盘（Agenda Conflict Trial Sandbox）
- **后端契约**：[`NativeAgendaService.preview`](../../../../src/main/runtime/native-agenda.ts) 与 [`previewCalendarPlan`](../../../../src/main/actions/planning.ts)。
- **体验闭环**：在「今天」页时间轴（[`AgendaDayTimeline.tsx`](../../../../src/renderer/AgendaDayTimeline.tsx)）或对话内的排程对比时间轴（[`PlanningComparisonTimeline.tsx`](../../../../src/renderer/presentation/PlanningComparisonTimeline.tsx)）上直接拖动日程块时：
  1. 实时展示包含 `setup（准备）+ work（核心）+ cleanup（收尾）+ travel/rest（通勤与休息）` 的完整占用幽灵块；
  2. 若与浙大课表或既有安排冲突，自动按 15 分钟网格计算并提供 `earlier（提前）` 与 `later（顺延）` 的无冲突候选位；
  3. 点击「就按这个时间改」走原 `calendar` Owner 的 CAS 提交；点击「带回对话和她商量」则把 `{ record, trial: { proposedStart, executionAuthorized: false } }` 传给主模型，由角色用她自己的话帮你权衡。

### E. 桥边路线口袋（Bridge-Side Route Pocket）
- **后端契约**：[`CampusMapAdapter`](../../../../src/main/mapService.ts) 与 [`src/shared/map-routing.ts`](../../../../src/shared/map-routing.ts)。
- **体验闭环**：当聊到「下课从东四去紫金港食堂再到田径场怎么走顺路」时，对话内直接展开路线口袋（[`ConversationMap.tsx`](../../../../src/renderer/map/ConversationMap.tsx)）。
  - **相机主权（`CameraOwnership`）**：自动运镜展示起点→终点有向路径（`buildDirectedPath`）；一旦用户手指/鼠标触碰拖图或缩放，**立即移交相机控制权**，绝不强行把镜头抢回去。
  - **诚实空间语义**：未获用户明确指定起点时，显示目的地位置并留出起点选择，绝不假装拥有实时 GPS；真实校园拓扑导航与故事场景里的想象木桥插画严格分离。

### F. 一盏灯的专注（Focus Lamp）
- **后端契约**：[`src/renderer/focus-session.ts`](../../../../src/renderer/focus-session.ts) 与 [`FocusLamp.tsx`](../../../../src/renderer/FocusLamp.tsx)。
- **体验闭环**：不搞打卡排行榜、番茄钟惩罚或专注失败羞辱。点亮桌边那盏暖灯，设定一段自习时光，窗边的她会调暗面板对比度、收起主动打扰，安静低头陪你写字或看谱；随时可以暂停、延长或提前收工，专注时长只属于此刻的陪伴氛围，绝不虚报为课程完成度。
