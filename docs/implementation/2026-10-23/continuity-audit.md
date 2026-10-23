# 笔记、资料与地图的连续体验调查

日期：2026-10-23。基线：`6d5dcc1dd4b3bab7053a333366c6661a21e1b571`，当前共享分支 `codex/personal-memory-continuity-20261018`。

首轮调查只读取产品源码、相应原始要求和下列图稿；随后经主代理审定开始实现文末三条接续。没有运行模型、访问学生账号、创建测试或启动另一个桌面实例。下文“已接”指源码调用链成立，不代表本轮已经实操验收。最终集成仍须在同一隔离桌面实例沿正常入口检查。

## 本次要求与判断依据

已读桌面《在场前端优化.md》全篇，以及 19 份粘贴附件的四组唯一正文（SHA-256 相同副本：1/3/4/5、2/6、7–13、14–19）；附件中的旧助手润色说明与本次用户请求区分。已读仓库协作规则、导航中相应调用链、现行 README 的运行命令、CURRENT_STATUS 中笔记/资料接续的限定证据。产品设计评审采用本机 Product Design Director 的 `SKILL.md`；该技能存在于磁盘，虽未显示在本轮技能目录中，不构成缺失。

亲自查看的本专题设计原件：

- 本次附件 `image-4.png`：PDF 第 12 页、正文高亮、页边手写提示与右侧同题推导；这是页上引用联动的明确标尺。
- `前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/留下资料阅读-4f028800f8fa.png`：文件列表、最近阅读页、正文预览、继续阅读/一起看看。
- `前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/一阶方程资料预览-05db65be83bb.png`：同上关系的另一构图。
- `前端视觉创新设计/统一图库/原图/设计参考-原始图/在场·留下：一页安静笔记-9-064d31bd4e1b.png`：笔记、来源问题、资料附件、和在场一起整理。
- `前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/日程与笔记并列-d618bb8f1492.png`：实际内容是笔记版本/收起/冲突对照，不能按文件名误判成日程能力。
- `前端视觉创新设计/统一图库/原图/界面设计-地图与天气/在场地图展开与回归分镜-17-005bc07b7b5b.png`：原消息内地图连续展开、接管、保留草稿及阅读落点。
- `前端视觉创新设计/统一图库/原图/界面设计-地图与天气/map-recovery-8bbcf3b784e5.png`：定位未知、入口不明、道路不可走时就地恢复。

这七张只代表本专题亲读，不能升级为主代理“全部图片已看”。`图片来源对话.md`第一行原始要求已亲读：轻松、温暖、可倾诉与自主延拓，不能把后文旧助手的所有设想当作已接受方案。

## 必须保留的现有能力

| 人的任务 | 当前真实调用链 | 现有价值与边界 |
| --- | --- | --- |
| 在留下里写一页，切走再回来 | `App.tsx` 的 `notesOpened` → 持续挂载的 `NotesPanel`，以 `active/hidden` 切显隐 → `notesCreate/notesUpdate` → `preload.ts` → `main.ts` notes IPC → `NotesService` → `h_notes`/版本 | 切模块不销毁编辑器；本窗口内多个未保存稿由 `drafts.current` 保留。修改以 expectedRevision 做冲突检查，不能改成无条件覆盖。 |
| 旧笔记、回收站、冲突与撤回 | `NotesPanel.showHistory/viewVersion/mutate` → 原 NotesBridge → `NotesService` | 图稿中的历史对照、回到现在、放回笔记、保留我的文字等已有具体实现。不是只有一张空壳笔记页。 |
| 找回一句笔记/资料/对话 | `LocalSearchPanel` → `main/search.ts` → 各 owner 回读 → `LocalSearchLocator` → `App.openSearchResult` → 原页面定位 | locator 分别绑定 message 内容哈希、note revision、material SHA/页内码点范围。打开时重新核当前原对象；不能改成标题猜测或按全文 `indexOf` 跳转。 |
| 读资料、选段与聊天 | `MaterialsPanel.captureSelection/useQuote` → `materialsQuote` → `MaterialService.nativeQuote` → `App.quoteMaterial` → 同一 composer 的小引用 → `send(materialQuote)` → `coordinator.resolveQuote` | 已有 resourceId + SHA + PDF页码 + Unicode码点起止，正文由宿主重读。引用不拼进本人原话，也不自动成为事实/赞同/执行许可。 |
| 选段留笔记，再回原文 | `materialsKeepQuote` → `nativeKeepQuote` → `NotesService.create`（独立用户笔记，source.material 只记地址）→ `NotesPanel.openMaterial` → `App.openMaterialSource` → `materialsQuote` 再核 → 原 `MaterialsPanel` 定位 | 已经有“留在笔记/打开笔记/回到原文/聊这一段”。源文件退出后独立笔记仍是用户保留的文档，回原文必须失败得准确，不能从笔记副本复活源文件。 |
| 跨会话找已有资料 | `materialsList({sessionId})` → `MaterialService.nativeList(sessionId)` | 返回所有仍合法、已保存绑定且非 publicSource 的资料；sessionId **只排序**。不能把它诊断成“资料库只能读当前会话”。 |
| 原文与对话调整宽度 | `App` 同一 `.conversation-space` → `MaterialsPanel` + `ReadingDivider` + 原聊天 | `ReadingDivider` 已有 pointer capture、拖动、Esc退回本手势初值、键盘左右/Home/End、双击复原、localStorage比例；两侧保持同一DOM。不要再造第二套阅读聊天。 |
| 消息地图展开、接管、收回 | `AssistantPresentation.renderMap` → `ConversationMap` → **同一个** `MapSurface` → 原 `map-engine`/`planar-map` | 现有 `focusMap` 保存占位、取消相机运动、用当前可见矩形开始可打断 WAAPI 变形；聚焦后 inert 背景、Esc/Tab/返回焦点。已有相机和选点记忆、路线讲解、手动接管、播放预览、多段旅程切换。 |
| 点地图对象继续聊 | `ConversationMap.choose/pickLeg` → `SemanticSelection(sceneId/revision/placeId或legId)` → 原 App composer → 原 send | 同一 Scene 和地点/路段身份能回流，选择没有直接提交安排或声明到达。 |
| 独立地图选起点回聊天 | `MapSurface.useContext` → `shareMapContext` IPC → `SpatialRuntime.share` → typed public/personal endpoint + epoch + 2分钟有效期 | **并非纯文本传递**。UI文字只是辅助，实际起点有宿主状态。设备定位与本轮模型共享分开，不能因好用而自动把坐标送出。 |

## 已确认的具体缺口与落地顺序

### 1. PDF 原页面与对话尚未形成同一处引用

位置：`MaterialsPanel.tsx:181` 的 captureSelection 只接受 `prose.current`（文字 pre）；`MaterialsPanel.tsx:277` 原页面只是 `<img>`。`shared/materials.ts` 的 MaterialQuoteReference 只有文字起止，没有页图区域。当前不能在图中的公式、示意图或扫描页上圈出一处，带着该处进入对话，也不能把回复边注定位回页上。

已有宿主基础：`materialCropSchema` 已定义规范化 0..1 区域；`materials.observe` 能按页码/crop 取真实像素，绑定 SHA、scope、rendererVersion 和对应工具回执。可沿这一 owner 增加有限原页面区域引用，让页上高亮与边注共享 `resourceId/SHA/page/crop`，发送时重新核查并走真实像素链。不能用截图切片假冒注释，不把模型回复或局部选中当成文件写入权限。

接受标准：打开真实合成PDF→在原页面指一处→原草稿不变、引用chip明确→真实模型/普通工具读取同SHA同页区域→回复指回同处→切页、返回、重新缩放均不漂移；去掉引用只去掉这一处。扫描页仍能用。此项需要实现和正常入口验证，当前未完成。

### 2. “继续阅读”目前只能活在当前窗口

位置：`MaterialsPanel.tsx:53–54` 的 `positions`/`bookmarks` 都是 `useRef(new Map())`；保存页码、offset、view、zoom仅在组件生命周期中，刷新或桌面重开后消失。`ReadingDivider` 持久的是分屏比例，不能据此说阅读进度已持久。资料卡也没有“最近读到第12页”这一可操作状态。

可落地：沿现有资料 owner 保存**阅读地址元数据**，绑定 resourceId/SHA/当前来源边界；不保存正文、像素、访问凭据或模型授权。新原件/撤源/隐私epoch变化时不恢复旧地址。资料列表直接展示页数与最近页，点击回到原 reader，不增加恢复向导或任务债。只保存用户实际停留的页，不把下载/列表预览当读过。

接受标准：同一PDF翻页并缩放/滚动→切到笔记再回来→正常关闭与重开仍到同页；源文件变动/退出后不复活。此项需实现及真实重开观察。

### 3. 原生笔记尚不能把笔记本身带到同一对话

位置：`NotesPanel` 对外回调只有 `onOpenMaterialSource/onOpenMaterials`；`openMaterial` 的源只读 `editor.note.source.material`。普通手写笔记没有“就这段聊/一起整理”的地址型交接。`NoteSceneView` 的原消息内笔记引用很好，但其 `NoteReference` 明确绑定 messageId/sceneId/sceneRevision，不是一个可从笔记本伪造的通用引用。

可落地：增加独立 typed notebook selection 地址，由 NotesService 对 noteId/revision/精确码点回读；向同一 composer 交接，不把全文拷成用户新话。未保存编辑稿与已保存笔记必须区分：保留草稿，必要时明确采用当前选段的临时文本身份，不能假称它已写入原修订。模型帮整理后，原 notebook 用 expectedRevision 保存，不另建笔记副本来“融合”。

图稿还存在“来自一起看这道题”回链。现在 NoteMetadata 有 `source.via/eventId`，普通笔记没有完整题目/StudyRef关系；不能仅因标题相同补一条关联。应只沿实际来源记录扩充回链。

接受标准：选笔记中一句→同一聊天保留原稿并带当前revision→模型读原选段→回到原笔记仍在同处；修改冲突继续原比对流程。当前未完成。

### 4. 独立地图只带回一个起点，整条正在看的路线会丢失

位置：`CampusMap.tsx:205` `useContext` 只取 `selection.origin || selection.destination`；`shareMapContext` 只接 fromId/includeDevice。用户刚比较的终点、两个入口、avoidStairs/allowConditional等没有作为当前路线语境交回原对话。虽然 endpoint 身份成立，**整条路线**的身份与条件没有成立。

可落地：交接 `MapRouteResult` 的版本绑定地址或由宿主重核的有限端点/入口/条件；把“看这条路”和“从这里出发”区分成对象动作。沿现有 Scene/SpatialRuntime接入，不抄一份路线或创建第二地图。回去仍是问法/预览，不是路线接受、真实位置、出发或到达。

接受标准：普通地图选择两点及入口/条件→带回→模型取得同两点与条件→同Scene重开→相机/草稿保持；修改选路/撤共享后旧上下文失效。当前未完成。

### 5. 低成本可顺手修正的返回文案

`App.tsx:1872` MapSheet returnLabel 只分别处理 chat/agenda/memory，其余都写“返回连接与偏好”。从笔记或资料页打开地图会显示错误返回对象；实际 onClose只是关sheet、原view保留。应按实际 WorkspaceView 显示返回笔记/资料等，保持真实返回与文案一致。不能把这一处文案修正当作全部跨模块连续体验完成。

## 正常运行与核查入口

- 正常桌面开发：`npm run dev`。需要真实代测模型时使用已有 `npm run dev:luna:test`，该脚本删除DeepSeek key环境并配置 `luna-app-server-test`；不要从默认桌面随手发模型请求。真实型号以返回的 responseModel 为据。
- 有桌面构建后：已有 `npm run start:luna:test`。同一隔离合成数据实例验证，不能把用户生产库复制为fixture。隔离路径和实际实例由主代理统一持有。
- 资料正常入口：导航“留下”→“资料”→选文件；原PDF页面/文字切换；文字选段→聊这一段/留在笔记→打开笔记→回到原文。
- 笔记正常入口：“留下”→“笔记”→保存/旧版本/最近收起的；搜索入口可跨对话/笔记/资料定位。不要用直接DB改值代替用户操作。
- 对话地图：正常模型取得 map_route/Scene→原回复中的地图；聚焦、平移/缩放/旋转、打断讲解、收回、原草稿续聊。静态public review只证明公共地图渲染，不证明桌面模型引用或私人来源。
- 必要已有检查：`npm run check`；涉及集成构建运行 `npm run build`。源码检查、现有检查、真实模型、原生UI、持久恢复各自记证；本报告本身没有运行它们。

## 最小改动原则

先补“同一处”的地址，再做空间和动效。保留已有 notes/materials owners、原composer、共享 MapSurface、SemanticSelection、当前隐私复验与 CAS；不加平行聊天、平行笔记、平行记忆、临时假数据看板。最高价值是一份真实资料从阅读→疑问→解释→留笔记→下次回原处连续成立，而不是多做一个展示页。

本报告无清理动作；没有新增临时脚本。现有检查命令产生的忽略目录仍用于本轮诊断，没有擅自清理共享产物。

## 主代理审定后的实现接续

以下为同一子任务后续源码变化，不回填上方调查时的体验证据：

1. `src/renderer/useMaterialReadingPosition.ts` 提供 `restore/save/latest/retain/clear/flush`，由资料前端负责人接入原 MaterialsPanel。仅保留64份资料的resourceId/SHA、页码、offset、观看方式、缩放、滚动与最近时间；200ms合并写本地偏好，隐藏/正常卸载时flush，不保存正文、文件名、像素或accessKey。持久身份绑定epoch/policyRevision，同窗完整boundary变化即清；process-local sourceBoundary重启归0不误清合法停点。恢复仅匹配当前owner给出的合法元数据，不能使退出的资料再次可读。
2. `NotebookQuoteReference` 与 `notes:quote` 由原 NotesService 精确回读当前已保存修订。`send.notebookQuote` 经同一 Harness/RunSession 进入 `currentNote`，原 noteSources 回执继续处理后续来源和历史；与绑定原消息Scene的 NoteReference 分开。当前用途解析只取得无正文身份。未保存稿不假冒已保存修订。原生笔记UI交接待主代理的图稿与前端接线。
3. `SharedMapRoute` 与 `MapRouteReference` 沿原 `map:share-context` 共享真实两端、入口、避台阶/条件道路和地图/profile版本。宿主短期选择返回selectionId，`send.mapRouteReference` 才在本轮真实scope下重核双端并重算原路由，将无坐标语义投影放入 `currentMapRoute`；两端若涉及私人地点各保留原配置proof，目的端proof具有明确的destination身份。撤共享、边界、地图或profile版本变化后不采用旧结果。地图UI交接待主代理前端接线；原单起点共享路径继续保留。

检查：已有 `npm test` 正常结束（exit 0），它覆盖启动时的共享源码，之后其他代理的持续修改不继承该结果。最后一次 `npm run check` 通过。没有新增测试、fixture、runner或DeepSeek调用；新交接功能的正常UI/持久重开/Luna仍需主代理在同一集成实例实走。

图稿审定后已接原生局部UI：`NotesPanel.onQuoteNote` 只在选句后出现，未保存稿先走原save/CAS，冲突留原对照；原笔记的Unicode选段和真实新修订经`notesQuote`回读，再交原composer。异步回包核当次callback身份、active与导航代，不能借后来会话的callback附到别处。保存后原笔记若又被改，会刷新该干净原页并重选，不覆盖较新的本地稿。

`MapSurface.onUseContext` 的双端交接传空text、真实两端label、typed routeReference，不把机器条件句拼成用户新原话。纯本地previewRoute/routeConditions/previewMemory供原chip回图时使用；同一地点、入口、条件与相机有明确回落处，不依赖后来浏览的全局地图memory。`initialConditions`复用原路由状态；道路node端点保真实kind。共享请求晚到或接收方拒绝时，以expectedSelectionId只撤自身，不清后来共享。App由独占整合负责人接线，本专题未直接修改App。
