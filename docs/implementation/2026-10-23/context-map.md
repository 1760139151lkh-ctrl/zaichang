# 地图与跨模块对象接续：本轮只读核查

日期：2026-10-23。已亲读本次 goal-objective.md 全文、根 AGENTS.md、Product Design Director 及相关动效/已有产品演进章节。首轮以当前共享工作树源码作只读核查，未修改源码、调用模型、访问私人账号、启动桌面或新增测试；第二轮给出最小接口方案，第三轮按主代理明确授权补后端笔记证明链。这里的“已接线”不等于桌面或真实模型验收。

## 产品判断

一个地点或一条路应能随人正在做的事展开、退回纸边，再回到原来的镜头与问题。地图本体、原作品、原资料与笔记继续各归自己的 owner；统一的是可回读的对象地址和人的操作过程，不建立一个新的通用事实副本。

本轮最值得实现的两处：把已有内嵌地图的按钮展开补成连续拖拽；让原共同作品真正记住用户指向的公共地点、道路双端和取景镜头。后者已经有新后端合同，当前缺前端的最后一段。

## 现有能力与必须保留的链路

| 人的操作 | 当前源码落点 | 核查结论 |
| --- | --- | --- |
| 消息内地图展开、收起和返回对话 | `ConversationMap.tsx:99` 的 `focusMap`、119 的可打断 WAAPI 过渡；396 起的标题操作 | 已用同一个 MapSurface。聚焦前保占位与收起状态，取消旧镜头；聚焦时背景 inert，Tab 围在当前地图，Esc/返回恢复原焦点。不能换成另一张地图或整页截图。 |
| 平移、缩放、旋转、俯仰并接管镜头 | `map-engine.ts:164` 起的输入；514 起的 ownership；604 起键盘 | MapLibre 原生 pan/pinch，滚轮围绕指针即时缩放；pointerdown/wheel/键盘夺取 ownership，中断旧相机和路线讲解。`snapshot/restore` 已有；PlanarCampusMap 也有同名接口。 |
| 地图选点/选路段回同一聊天 | `ConversationMap.tsx:320/335` → `SemanticSelection` → `App.selectScene` → `send` | 场景 ID/revision 与地点/路段 ID 是实际地址；只是本轮引用，不声明位置、到达、长期偏好或安排批准。 |
| 独立地图把当前整条路带回聊天 | `CampusMap.tsx:237` → `shareMapContext` → `SpatialService.share/sharedRoute` → `coordinator.ts:1625` | 当前未提交源码已经携带真实两端及 kind、入口、避台阶/条件道路、地图/profile 版本。主机用 selectionId 重核后重算并投影，不接受 renderer 的路线正文。保留两分钟及 epoch 边界。 |
| 从路线小引用回原地图 | `App.tsx:1240/1356`、`MapContextHandoff.previewMemory` | 原 routeConditions、previewRoute 与局部相机/选择回同一 MapSheet；不是回后来浏览过的全局地图状态。机器生成的路线条件没有拼进本人原话。 |
| 材料选段、页边笔记、原文返回 | `MaterialService.nativeQuote/nativeKeepQuote/nativeNotes`、`NotesService.forMaterial`、`MaterialsPanel`、`NotesPanel.openMaterial` | 资源 ID/SHA/PDF 页与页内 Unicode 地址贯穿。笔记有独立 note ID/revision；`source.material` 仅是回原文地址。源退出不该从笔记副本复活。当前页边编辑直接更新原 Notes owner，不需要再建注释库。 |
| 普通笔记本身回聊天 | `NotebookQuoteReference` → `NotesService.quote` → `NotesPanel` 选句 → `App.quoteNotebook` → `currentNote` | 新源码已接。未保存稿先走原保存与 CAS，之后按真实新 revision 取段；冲突留本稿。不可把原消息 NoteScene 引用伪造为通用笔记引用。 |

现有 `docs/implementation/2026-10-23/continuity-audit.md` 已记录材料/笔记/路线共享的先前实现接续。本报告不重开这些实现，也不把先前静态结果升级为当前运行结论。

## 精确缺口

### 1. 地图容器没有拖拽展开/聚焦/收回

`ConversationMap` 目前只有 `focused`/`collapsed` 和按钮切换，没有对应 pointer 捕获、拖动进度或松手落点。地图画布本身虽可拖动，但这只移动相机，不能满足本次容器直接操纵要求。

建议沿原标题/轻量抓手做纸边、展开、聚焦三档连续操纵；只在容器抓手开始手势，不占用地图画布的原生平移/旋转。拖动时同一地图跟手，松手根据实际距离/速度收束；Esc、pointercancel、反向与快速重入都从当前可见几何继续。保留原按钮和键盘入口，并保住事实快照、相机、阅读落点和草稿。不得为实现拖拽另起 map surface。

### 2. 原作品取景合同有镜头，前端从未交付镜头

`shared/map-view.ts` 已有限定义 EPSG:3857 中心、resolution、rotation、pitch；`SemanticSelection.mapView` 已进入 host schema。`SceneService.selection:532/574` 只允许原共同作品地图的 place/leg 取景，核原作品四地址、公共地图版本及道路双端；`retainStorySetting` 会将镜头和原公共地址保存在原作品 setting，省略保留、null 删除。

但是 `ConversationMap.choose:320` 与 `pickLeg:335` 没有附 `mapView`，renderer 也没有使用 `scene.storySetting.place.view`。因此用户刚拖到的具体取景既不会随选择保存，也不会从原作品恢复。已有 `engine.snapshot()`/`restore()` 可用，无需扩地图引擎接口。应仅在明确取景的选择引用中带当前有限镜头，在同一作品合法重开时恢复；普通地图拖动仍只留本窗口状态，不能自动持久偏好。

### 3. 公共取景的小引用仍会读个人 overlay 名称

`ConversationMap` 已给作品地图的 `MapSurface` 与按 cameraIntent 查地点传 `publicOnly: true`。但 `App.selectScene` 的 `place` 分支仍用默认 `api.mapPlaces()` 给 chip 取名；相同公共 ID 若有个人改名，公共图和输入引用就可能出现不同名字。host `SceneService` 使用公共地点名。需让 chip 与其原 scene 采用同一 publicOnly 视图，不以个人 overlay 覆盖公共作品取景。

### 4. 选点后的本地标题与场景实际目标需保持一致

`ConversationMap` 的 `memory.selected` 独立保留；切换 activeLeg 时当前 effect 更新 leg/progress/playing，但未同时清掉 selected。按钮 `pickLeg` 会清，模型改 activeLeg 的路径不会。后续集成操作需要观察：先点建筑，再让同一 Scene 更新路段，地图下方若仍写旧建筑，应沿实际新目标清局部选择，不动原用户引用或故事事实。此项是源码发现的具体风险，尚未操作复现。

## 实现后应由实际入口确认的结果

在主代理统一的同一隔离桌面中，以真实公共地图和现成合成资料操作：原回复地图拖开、接管相机、反向收回，草稿/原阅读落点不丢；正常速度下查看过程，并在窄窗、减少动态和真实无 WebGL 路径核同一对象关系。静态图不能证明这些过程。

原共同作品中明确选定地点/路段后，发送的引用应包含实际镜头和原作品四地址；真实主链继续写作后，正常关闭与重开仍回同一 setting。公共取景不得用个人地点覆盖、设备定位或故事人物行动来冒充现实发生。Luna 若局部不可调用，应继续完成不依赖模型的接线和 UI，限定未验证范围。

材料→页边笔记→笔记本→聊天→原材料的核查继续沿原 owner，关注同 SHA/页内地址/同一笔记修订及异常后保稿；不要只凭小引用可点击就验收完整流转。相关资料交互由其模块负责人实施，地图模块不重写材料 owner。

本次只新增本说明，没有清理文件。

## 第二轮：不改布局的最小接口方案（尚未实施）

主代理已亲审 V005/006/017/019/022/024，确定同地图 surface 连续展开、相机可拖、路线段推进、入口/绕行恢复。本轮只回读源码与设计接口，不提前加入容器手势或改布局。

### 三处前端接缝的最小 diff

1. **公共取景命名只需改一个调用参数。** `App.selectScene` 的 place 分支：

   ```diff
   -try{const places=await api.mapPlaces();
   +try{const places=await api.mapPlaces({ publicOnly: scene.kind === 'map' && !!scene.storySetting });
   ```

   保留现有 request/session/boundary 晚到核验。普通现实地图继续使用原个人 overlay；作品取景与其 MapSurface、host SceneService 同用公共视图。无需改 IPC、数据库或默认地图配置。

2. **镜头只取四个合同字段，平面回退补真实 pitch=0。** `SavedCamera` 还可含 `scale`，`mapViewSchema` 是 strict；不能直接 `{...camera}`。PlanarCampusMap.snapshot 不含 pitch，也不能把这一情况当失败或伪造三维俯仰。ConversationMap 从 `../../shared/map-view` 引入原 mapViewSchema，在同文件增加局部转换：

   ```ts
   function settingView(camera?: MapSurfaceMemory['camera']) {
     if (!camera) return;
     const parsed = mapViewSchema.safeParse({
       center: camera.center, resolution: camera.resolution,
       rotation: camera.rotation, pitch: camera.pitch ?? 0,
     });
     return parsed.success ? parsed.data : undefined;
   }
   ```

   `choose/pickLeg` 仅对 `scene.storySetting` 把这个有限值附到本次 SemanticSelection；普通地图选择不加。首次为某个 viewMemory 建立对象且没有本窗口相机时，用 `scene.storySetting.place.view` 初始化 `memory.camera`，只接受三处 mapVersion（Scene.source、storySetting、place）彼此一致的 host 快照。已有相机优先，不能在每次 revision 或正文更新时 restore 抢镜头。沿原 constructor 的 saved camera 优先级恢复，不增加一套镜头请求或存储。

   **发送前再取同一显式引用当前的实际镜头。** 单在 `pickLeg` 中拍快照会取到 fitRoute 动画开始前的旧镜头；用户选点后再拖镜头，早先 mapView 也不会变化。最小接线可以继续使用现有 `views` 局部状态：ViewMemory 增加 `selectionReference?: SemanticSelection` 和 `sceneRevision?: number`；仅 storySetting 的真实 choose/pickLeg 将发出的同一个引用对象记在该 memory，当前 render 记录 sceneRevision。导出一个只查现有 views 的 `currentConversationMapSelection(reference)`：只命中引用对象严格相等、sceneRevision 相等的 memory，再用上面的 settingView(memory.camera) 复制出带当前 mapView 的参数；找不到时保留当时明确选中的值，不猜其他地图。历史 continuation 克隆不要继承 selectionReference 的对象匹配资格。

   App 在最终 `api.send` 前调用该函数得到 `selectionForSend`，仅将它用于 send.selection；保留 `selectedScene` 原对象作为 stillCurrent、取消和清理的身份比较。这样不逐帧 setAppState、不新增 Bridge/数据库/代理，也不把拖动本身变成新选择或本人原话。原 `clearConversationMapViews` 和96项上限沿用。

3. **旧 selected 必须同时清 React 和 memory。** 两个实际路径都要做：

   ```diff
   // activeLegId effect 的 sourceLegId 改变分支
   +memory.selected = undefined;
   +setSelected(undefined);
   // pickLeg 中现有 setSelected(undefined) 之前
   +memory.selected = undefined;
   ```

   原风险比首次报告更具体：pickLeg 当前虽清 React selected，却没清 memory.selected；地图因离屏或收起卸载再挂载后，会再次从旧 memory.selected 初始化。activeLeg 更新时还应在这一帧用 `memory.sourceLegId === scene.activeLegId` 派生可显示选点，避免新路段先出现、旧 caption 等到 effect 后才消失。只清局部观看选择，不清 App 中已明确发起的旧引用、不改事实快照或原作品。

### 同 source owner 的版本与恢复复核

确认已成立的合同：

- `SceneService.selection` 先按原 session、sceneId/revision 取 Scene，再核唯一目标；mapView 仅接共同作品的 place/leg。公共地图的当前 manifest 要同时匹配原 map source 与 storySetting.mapVersion。
- 作品四地址由 `CuriosityInvitationService.referenceIdentity` 核当前 option/frame 版本及 session；继续时再核 input.id/expectedRevision/expectedMatterRevision/placeId/mapVersion，matterId 还与真正 previous frame 相合。UI 提供的 place/镜头不能自行变成新作品或现实位置。
- 道路节点用原 route adapter 回读真实 kind/ID；原路的公共 profile 基线、双端及 geometry/status 不被一次默认重算偷偷替换。`continue.setting` 省略保留、null 移除；带新地点但公共源临时不可用时不制造取景事实。
- 保存 setting 仍在原 Work 事务中，生成公共地图 evidenceRef 并并入原 option 的 sourceBinding；旧章从原 message/Scene 回读，不从目录或 mutable seed 伪造已交付正文。
- 地图拖动的普通本窗口相机与用户明确保存的作品取景分开。平面恢复只恢复中心/比例/旋转，不宣称有三维 pitch。

**另外发现的真实后端缺口：作品地图 Scene 尚未自带笔记依赖。** `createCuriosityPresentation` 会把 `repo.workNoteSources(handle, read.records)` 存入 CuriosityScene.provenance，`assertCuriositySnapshotSourcesReadable` 明确核它；但 `createStorySettingPresentation` 的 MapStorySetting 只有 sourceBinding 与 assistantWorkSources。它首次发表时的总 ContextReceipt 通过 `recordWorkSources` 已有 noteSources，因此不是“从未检查来源”；缺的是独立 Scene 在下轮 restore/adopt 时的同一笔记证明。`SceneService.permitted` 和 coordinator 的 receiptScenes map 分支只继承前两类，且 `SceneService.all` 直接读取原 messages/scenes，不能以总消息旧 receipt 曾正确来代替新采用的核验。

最小修复应沿原 note proof 合同展开，不另建来源系统：

1. MapStorySetting 增加 `noteSources`（原 noteSourceProofSchema，限256项）；factory 由原 `workNoteSources` 提供实际证明，包括明确的空数组，不能从标题或当前文本推断。
2. SceneService.permitted 核该原证明；coordinator 的 receiptScenes map 分支调用现有 recordNoteSources，和 sourceBinding/assistantWorkSources 同步继承。新发表的 recordWorkSources 继续保留，不能删掉而只靠 Scene。
3. repository 的 scene metadata 投影、conversationNoteSources 和 noteMaterialsAffectedBy 使用同一个 `storySetting.noteSources` 路径；generic planningMessageReadable 已有 provenance.noteSources 分支可复用。让单独 Scene 重用、历史采用和永久遗忘都识别这份证明，不能只隐藏画面。
4. **旧无字段不能默认当 []。** 最保守而可恢复的兼容是只从有宿主元数据证明的精确原始发表 message+sceneId+revision 的 ContextReceipt.noteSources 数组取证（原 owner/workspace、done 状态、来源范围、fence 同核），不读正文、不回填永久记录。不能把同 Scene 后来被转载到另一条消息时的空 receipt 当原始证明，也不凭“目前最早一条”猜原始发表；如果当前保存格式不能证实这层原始关系，就不走该兼容。缺这个确切证明时回原 Work 正常 read 后重新生成 Scene。不得借当前 Work 的新 noteSources 给旧 Scene 补签。若主代理选择本轮不补兼容助手，旧无证明地图应保持不可采用，原作品和独立公共地图仍可正常打开。此取舍需要亲读原保存实例后确定，当前没有伪造兼容通过。

### 主代理需要亲读的精确函数范围

| 文件与行段（当前共享源码） | 要判断的实际内容 |
| --- | --- |
| `src/renderer/App.tsx:256–303` | selectScene 全分支，place 名称视图与晚到核验 |
| `src/renderer/App.tsx:982–1038`、`1088–1119` | send 冻结引用、stillCurrent 与最终提交/清理；当前镜头只能复制到参数，不能破坏原对象比较 |
| `src/renderer/App.tsx:2319–2327` | current/history memoryKey 分开，以及唯一 ConversationMap 挂载 |
| `src/renderer/map/ConversationMap.tsx:10–31`、`63–87`、`144–181`、`314–350` | 原 memory、activeLeg 与 choose/pickLeg；最小 diff 的全部局部状态 |
| `src/renderer/map/CampusMap.tsx:380–435`、`470–500` | 原相机回调、constructor saved camera、inline route 变更不新建 surface |
| `src/renderer/map/map-types.ts:4–10`、`map-engine.ts:482–516`；`planar-map.ts` 的 snapshot/restore | pitch 可缺省、scale 额外字段、两种真实相机接口 |
| `src/main/runtime/scenes.ts:176–193`、`259–296`、`516–608` | permitted/all/get/selection 的恢复、版本、公共双端与作品 owner 门 |
| `src/main/runtime/story-setting.ts:18–84`、`89–145`、`148–183` | 公共端点、保存、呈现和无正文 ingress 身份 |
| `src/main/runtime/curiosity-invitation.ts:116–185`、`240–278`、`372–406`、`437–476` | 原 owner/current/read、四地址、CAS、setting 保留/移除及同事务来源 |
| `src/main/runtime/curiosity-scene.ts:41–52`、`86–98` | 原 CuriosityScene 已有 noteSources 完整模式，作为地图的对照 |
| `src/main/runtime/coordinator.ts:1717–1737`、`1838–1841`、`2759–2764` | 当前作品回读与地图 Scene 再采用时证明继承的差别 |
| `src/main/storage/repository.ts:1411–1446`、`1822–1880`、`2793–2802`、`4497–4540` | 元数据投影、原 note proof、Scene 读门与永久遗忘 |

以上行号需以最终集成文件复核；本轮没有运行/模型/体验通过结论，也没有新增测试或清理。

## 第三轮：后端笔记证明链已补齐（限定直接 API 观察）

主代理亲读并确认来源缺口后，明确授权仅修后端证明链。没有修改 App、ConversationMap、可见布局或手势；前述三处前端方案仍未实施。

本次源码改动的精确落点：

| 文件 / 函数 | 本次增量（保留此前共享改动） |
| --- | --- |
| `shared/story-setting.ts` 的 mapStorySettingSchema | 引入原 noteSourceProofSchema，必填至多256项的 noteSources；不设默认值。 |
| `runtime/story-setting.ts` 的 createStorySettingPresentation | 由原 repo.workNoteSources(handle, result.records) 取得并保存真实证明；明确空数组也保存。旧图不可沿地址继续时，事实性错误给出省略旧地图地址、从已读回原作品重建的入口。 |
| 同文件 mapStoryReferenceIdentity | 无正文 SQL 只多读取 noteSources 元数据；缺数组、无效证明、原笔记不可读时不给旧取景提供创作身份。 |
| `runtime/scenes.ts` 的 permitted | mapStorySetting 严格解析与原 noteSourcesReadable 共同守独立地图 Scene。普通地图没有 storySetting，不受此门连带影响。 |
| `runtime/coordinator.ts` 的 receiptScenes 地图分支 | 采用原地图 Scene 时调用 recordNoteSources，不只继承 sourceBinding/assistantWorkSources。 |
| `runtime/interactive-program-sources.ts` 的 bindProgramSceneSources | SourceSlot 的作品地图核原 note proof，将证明同时放入 program receipt 与 sceneMetadata，不让通用作品成为旁路。 |
| `storage/repository.ts` 的 conversationPlanningMetadata / conversationNoteSources / planningMessageReadable | 精确保留 storySetting.noteSources 元数据；仅 Scene 的历史再采用也能继承，缺字段不能默认为空。 |
| 同文件 noteMaterialsAffectedBy | 消息及准备 artifact 的地图取景按原 note ID清除；旧无证明取景保守处理，明确 [] 的独立作品和无 storySetting 公共地图保留。 |

没有做旧数据回填：当前 MapScene / MapStorySetting 保存格式没有不可歧义的原始发表 message+owner+scene+version 来源标记，同一 Scene 又可被多条消息引用。仅凭某条消息或当前 Work 无法证明是原始发表，因此没有实现猜测兼容。原作品 owner 重读后可以生成新的、有明确证明的地图 Scene。

实际检查：`npm run check` 在完整改动后通过；现有 `npm test` 的282项全部通过（exit 0，约74秒）。最后仅调整旧地图错误的恢复地址说明后，再次 check 与 git diff --check 通过；没有新增或改写测试、fixture或runner。

另外使用持久 Node REPL 直接调用现有产品 API；一次性导入项目正常 TypeScript 与 Markdown 资源后，创建独立 `Store(':memory:')`，身份为 `context-map-api / isolated-local / desktop`，仅连接仓库公开地图。没有模型调用、私人账号、真实个人数据或额外桌面实例，也没有编写脚本文件或断言用例。实际观察如下：

- 原 Notes owner 创建并读取合成笔记后，`resolveNotebookQuote` 提供真实 r1/SHA/0–9 范围；原 Curiosity owner保存其来源，createStorySettingPresentation 生成的 mapStorySetting.noteSources 与之相同。
- 原 `runtime.compile` 的 ContextReceipt 获得同一笔记证明；将真正生成的同一 Scene 经原 `store.putMessage` 保存并再采用，`conversationNoteSources` 在只有 Scene、没有原总 receipt 的那条消息中仍返回同一 r1证明。这是直接 API 与合成内容，不是 Luna 的真实对话结果。
- 原 Notes.update 写到 r2 后，旧合法 r1 取景仍可读；正常移入回收站后，取景 snapshotReadable 与仅 Scene 的 planningMessageReadable 都返回 false。独立取景与普通公共地图仍返回 true。
- 新独立作品由原 factory 明确得到 `noteSources: []`；直接给原门一个缺字段地址时被拒。未给旧取景猜填任何笔记版本。
- 原 `memory.forget([], [noteId])` 精确遗忘后，有总receipt与仅Scene的两条派生消息正文均为空、Scene实际移除；独立故事消息正文、明确[]的地图取景、普通公共地图保留。之后 `memory.forget([], ['notes:self'])` 再次验证这三者仍保留；独立取景的无正文身份入口仍能核出原作品四地址。

`memory.forget([noteId])` 首次因该接口的 objectIds 不接受笔记本 ID而返回 target_missing；随后沿其已有 sourceIds 入口执行上述真实删除。该局部参数错误已纠正，没有新建或替换会话。

供主代理亲核的直接入口为：`NotesService.create/read/update/changeState` → `NotePresentationService.resolveNotebookQuote` → 原 `CuriosityInvitationService.execute/read` → `createStorySettingPresentation` → `SceneService.remember/snapshotReadable` → `RuntimeCoordinator.compile` → `KernelRepository.conversationNoteSources/planningMessageReadable` → `MemoryService.forget` → 原 `Store.messages`回读。均为现有入口，没有新增验证 API。SourceSlot 的实际来源闭包目前取得源码/类型/既有检查证据，本轮没有另外构造完整 OpenUI 模型作品来冒充实流。

这些直接调用使用内存SQLite，关闭后销毁；没有跨进程重开持久化、桌面渲染、Luna动态选择或拖拽体验通过结论。主代理仍需按集成后的实际入口亲核。没有清理共享产物；现有 npm test 生成的忽略目录保留给整合使用。
