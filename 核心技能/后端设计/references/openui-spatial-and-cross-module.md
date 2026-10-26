# OpenUI 实时交互造物、空间连续性与跨模块单一 Owner (`openui-spatial-and-cross-module.md`)

> 对应核心代码：[`src/main/runtime/interactive-program.ts`](../../../src/main/runtime/interactive-program.ts)、[`src/main/runtime/interactive-program-local-state.ts`](../../../src/main/runtime/interactive-program-local-state.ts)、[`src/shared/interactive-library.ts`](../../../src/shared/interactive-library.ts)、[`src/main/runtime/source-bookmark-native.ts`](../../../src/main/runtime/source-bookmark-native.ts)、[`src/main/runtime/study-companion.ts`](../../../src/main/runtime/study-companion.ts)、[`src/main/runtime/native-agenda.ts`](../../../src/main/runtime/native-agenda.ts)、[`src/main/mapService.ts`](../../../src/main/mapService.ts)、[`src/shared/map-routing.ts`](../../../src/shared/map-routing.ts)。

---

## 1. OpenUI (`@openuidev/react-lang`) 实时交互造物与状态回流

在场中的动态视图（`PresentationView` / `InteractiveProgramView`）绝不是静态截图或死板的 JSON 表格，而是由主模型通过 `present_view` 实时编写、支持物理拖拽与声光交互的 **OpenUI Lang 活程序**。

### 1.1 现有原语与拟扩展能力（实施前核实际共享库）

下文构作与调用名须映射现有定义。`Linkage/Fulcrum/Hammer/Damper`等机构名称是待设计能力，不能因文档列出就声称已注册；新增机制优先由通用约束与图形组合承载。
定义于 [`src/shared/interactive-library.ts`](../../../src/shared/interactive-library.ts) 与 [`src/renderer/presentation/`](../../../src/renderer/presentation/AssistantPresentation.tsx)：
- **几何与物理探索**：`Canvas`、`Curve`（参数曲线/函数图像）、`Point`、`Line`、`Area`、`DragHandle`（可在画布上直接拖动的二维控制柄，实时驱动 `$params` 变量）、`Motion`（时间轴/弹簧物理演化）。
- **声音与乐理交互**：`Voice`（音高、波形、包络合成）、`Press`（可弹奏琴键/触发垫）、`AudioTrace`（实时声波与频谱轨迹）——让丰川祥子或初华能直接在对话里为你写出一架可弹奏、可调和弦色彩的桌边小钢琴。
- **机械连杆与声学原语**：
  - 连杆传动：`Linkage`、`Fulcrum`、`Hammer`、`Damper`，支持 $1/100$ 慢放观察三角钢琴击弦机脱扣回落；
  - 物理弦振动：$f_1 = \frac{1}{2L}\sqrt{\frac{T}{\mu}}$ 实时参数化泛音列包络合成，踩延音踏板余音共振。
- **真实来源插槽**：`SourceSlot`（通过稳定 `sceneId + revision` 嵌入真实的浙大课表、地图路线或学习卡片，**严禁在 DSL 里手抄伪造校园数据**）。

### 1.2 流式生成、增量修补与 CAS 局部状态回流
1. **流式生成感知**：当模型开始流式输出 `present_view` 工具参数时，宿主通过 `onToolCallProgress` 在当前回复文本锚点处即时挂载 `presentationActivity`（`generating` → `checking`），让用户看到作品正在她笔下展开。
2. **`previous + patch` 增量续改**：当用户说「把阻尼系数调大一点」或「再加一条切线」时，模型无需重写整份程序，只需传入 `previous: { messageId, programId, revision }` 与增量 `patch`；宿主校验源程序身份与权限后原位升级 `revision`，保持视图在消息流中的原始锚点位置不变。
3. **120ms 防抖 CAS 持久化（`NativeProgramLocalState`）**：用户在 OpenUI 视图中拖动滑块、`DragHandle` 或切换开关时，前端以 120ms 防抖调用 `saveInteractiveProgramState`，携带 `expectedStateRevision` 落库到 SQLite。刷新或重启应用后，用户调过的参数状态原样保持。
4. **`Continue` 真实状态回流**：当用户点击交互程序上的动作按钮或接着提问时，前端将 `{ messageId, programId, revision, nodeId, stateSnapshot }` 一并传回主循环；宿主核验后注入 `pack.data.currentInteractive`，让模型清楚看到用户刚刚把哪个参数拖到了多少，顺着他的探索继续聊。

---

## 2. 跨模块单一权威 Owner 与稳定 ID 契约

在场的**对话（Chat）**、**今天/日程（Today/Agenda）**、**陪学（Study）**、**资料/PDF（Materials）**、**笔记（Notes）** 与 **校园地图（Map）**是已有主要空间。运动、互动作品、来信/好奇心、角色/主题设置和返回小界面同样必须接入当前语义，不能把这六项误写成助手只能理解的范围；完整功能面映射见[共同契约2.5](../../../docs/design/PRESENCE_SYSTEM_2026-10-25.md#25-全功能可理解要有真实的双向接口)。

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

## 3. 从附件创意推演的五项协议草案

这些是设计提案，不是现有IPC/API。字段与既有对象对接后才能实施；每项补齐原Owner、稳定ID、版本、来源和取消范围。共同记号不签发授权，物件交接不转移业务数据所有权。

下例泛型 `R` 必须实例化为原Owner已存在或经本阶段扩展的具体引用联合，例如资料/笔记/消息引文、日程实例、路线、Work/Scene/Program等；沿各自schema验证，不接任意URI或复制正文建“万能对象库”。当前 `context.ts` 的 `focused_work` 与 `coordinator.ts` 的 `current*` 是对接起点。每个功能注册可读语义、可用动作与回读入口，模型沿同一Hermes判断如何协作，而不是按页面标签选择固定话术。

### A. 共同指向与轻松纠偏契约（AI Pointer Protocol）
- **契约定义**：
  ```typescript
  export interface AIPointerTarget<R> {
    pointerId: string;
    targets: { key: string; ref: R }[]; // 可同时指A/B，含原Owner的版本化锚点
    relation?: { from: string; to: string; explanation: string; basis: R[] };
    cueId: string;                     // 复用共同cue的角色、场景、epoch与失效约束
  }
  ```
- **纠偏机制**：页码、Unicode范围或AST节点服从目标Owner；屏幕rect留在前端解析，地图点/边不强填文档页码。用户改选后先撤旧指向，再沿现有Bridge更新本轮协作上下文，模型沿新对象重新解释；不能只移动光标，内容还在回答旧题。`amend_pointer`若作为实现名，须先登记真实接口，不假称现有方法。
- **创新完成条件**：共同注意支持“两处之间”的关系、提及符号与原文呼应、伙伴/用户指针独立及自然退强调。找不到可靠锚点允许明确停住，继续找原文；不能因此把精确指向整项删掉。

### B. 新旧草稿相认描图纸契约（Drawing Paper Overlay Protocol）
- **契约定义**：
  ```typescript
  export interface TracingPaperMatch<R> {
    previous: R;
    current: R;
    pairs: { previous: R; current: R; explanation: string }[];
    changedConditions: string[];
    mode: 'overlay' | 'paired-pointers' | 'side-by-side';
    alignment?: { matrix: [number, number, number, number, number, number]; basis: R[] };
    proposalRevision: number;
  }
  ```
- 模型先取得旧尝试原稿与当前材料，再提出可解释的映射和差异；用户可否定/移动对应，修订跟进。只有空间映射可成立才叠合，不能用任意变形冒充数学等价。
- 过去旋转图与今天复指数、计划/实跑、初稿/改稿、概念图/完整模型都可相认；三种模式保持同一引用和关系。按住纸角叠合/松开复原是一个完整表达，点击/键盘等价入口保留；它不是只有透明度的动效。

### C. 双人轮流操作同一对象（Turn-Taking Living Canvas）
- **契约定义**：
  ```typescript
  export interface CanvasCollaborativeDelta<R, D> {
    operationId: string;
    groupId: string;
    target: R;
    baseRevision: number;
    author: 'user' | 'companion';
    operation: D;            // 该Owner经schema核验的具体局部变更联合
    dependsOn: R[];
    phase: 'proposed' | 'preview' | 'submitted';
  }
  ```
- `D`覆盖各Owner真正支持的辅助线/端点、路线候选、日程试放、段落差异、作品参数等局部操作；不把全产品锁死在三个几何动作，也不放开任意脚本/JSON。结果与新revision由Owner真实回执返回，不能由前端自填成功。
- “只要这一笔”独立采用，拒绝其它部分不擦用户后续修改；前提变化让相关依赖停止或重算。递来、摊开、接住、收回保持连续，输入/笔迹先接管，原有阶段04/07–10分别落到具体对象。

### D. 随身携带当前事情跨页换形态（Traveling In-Flight Context）
- **契约定义**：
  ```typescript
  export interface TravelingContextSnapshot<R> {
    threadId: string;
    focus: R[];                 // 当前对象或比较组，保各自版本/原锚点
    relationRefs: R[];          // 关系沿原Work/关联Owner保存
    checkpointRef?: R;         // 未完问题、步骤与停点，按当前许可回读
    operationGroupId?: string;
    cueId?: string;            // 有效动作可接续；失效动作安全收手
    carrierStyleId: string;    // 经审核的前端表现，不接受模型任意HTML
  }
  ```
- 不以四个 `sourceModule` 枚举排除资料、笔记、作品、来信、设置或后续真实功能；当前语义与工具通过既有注册机制覆盖全功能。悬浮球/纸角/小桌面/声音/小状态按任务采用，边缘光是辅助表现。
- 携带的是同一事情的身份、关系和未完位置，不只是一个字符串符号。比较布局在本机续接；跨设备同步对象组/对应关系，适配新视口，不复制原页每个像素，也不抢焦点。
- 切页不重置迎宾；可定位且接触兼容时顺势续动作，用户接管或来源失效就从当前姿态收手。主循环下一次使用前重新核来源、授权、角色与版本，不能借快照复活取消的工作。

### E. 共同经历小记号契约（Relational Token Protocol）
- **契约定义**：
  ```typescript
  export interface RelationalToken<R> {
    id: string;
    revision: number;
    target: R;
    appearance: { kind: 'preset'; styleId: string } | { kind: 'user-artwork'; ref: R };
    meaningRefs: R[];          // 原话、命名、作品与实际采用依据
    adoptedFrom?: R;
    createdAt: string;
  }
  ```
- 预设图钉/问号之外，引用用户真实笔迹、矢量或图像版本，能保留歪星星与自己画的形状；不要为了存储方便抹掉共同手艺。显示含义时回原Owner取内容，不再抄一份永久私人引文。
- 原路段“太窄”的理由可随路线到日程，旧题的共同名字可随新稿继续理解；不是简单在两个页面贴同一图标。支持改名、换画法、移除和遗忘的对应传播，普通修订不删除仍合法历史。

### F. 五项协议如何共同服务AI体验

来源/对象引用 → 当前语义与关系 → 同一模型调查、解释、提议或改判 → 原Owner操作/回执 → 物件/角色/声音表现 → 用户指正或接手 → 原对象新状态，必须形成双向闭环。轻唤和连续玩笑也沿当前会话理解，本地响应不等待模型；不另建动画Agent或固定三次点击脚本。

验收须走真实连续操作，既看模型是否理解关系，也看对象是否真改、跨页是否接得上。五项类型出现在文档或代码里不算兑现；阶段闭合标准见路线图和[共同契约](../../../docs/design/PRESENCE_SYSTEM_2026-10-25.md)。
