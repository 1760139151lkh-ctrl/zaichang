# 2026-10-23 视觉资产盘点与功能入口

本记录负责资产身份、来源边界、亲读导航和当前代码职责入口。主代理仍须亲自审视每张设计原图并操作最终界面；此表没有把来源归档、静态入口或联系表当作视觉、功能、动效或模型链路验收。

## 范围与数量

- 当前仓库扫描得到 1,523 个图像文件、1,389 个不同 SHA-256。扫描包含忽略区中的历史图像，但排除 Git 对象、依赖、运行时、构建与缓存。完整排除目录和逐文件清单仅存本机。
- 统一图库有 110 张已审查设计、素材与品牌原图；另有 1,260 张历史运行截图/讲述参考，仅存本机，分类清单完整保留，不能算成新增设计稿。
- 原始编号系列共有 22 张。其中原 5、6、19 仍存在于旧设计目录，但不在 110 张图库 catalog 中；本轮纳入逐图审视，不把它们的散落副本计成新创意。
- 本次上传 all-images.zip 有 31 个 PNG 成员、31 个不同文件 SHA-256，全部与本次扫描仓库的文件 SHA 不同。解包后逐成员字节相同，原ZIP保留。不同文件SHA不表示创意或构图一定独立。
- 本次 7 张附件中，前 5 张为本次扫描未见的文件；附件 6 与已有校园桥夜景逐字节相同，附件 7 与已有共写故事 A/B 逐字节相同。
- 优先亲读集为 149 张不同文件：110 张图库 + 3 张原编号补入 + 31 张 ZIP + 5 张新附件。38 页联系表每页最多 4 张，单格宽 800 像素，保持原比例；SVG 品牌原件须直接打开，联系表明确留入口。

仅本机阅读入口：`前端视觉创新设计/统一图库/仅本机/2026-10-23-front-end-audit/READING_INDEX.md`。同目录保留 `review-order.json`、`repo-images.json`、`repo-duplicate-groups.json`、`zip-images.json`、`attachments.json`、`original-numbered-series.json`、`contact-pages.json` 和原字节 ZIP 提取。没有修改、删除或重编码任何来源原图。

扫描排除目录名：.cache、.git、.npm-cache、.runtime、.test-build、.test-data、__pycache__、build、coverage、dist、dist-electron、dist-review、node_modules、output、playwright-report、release、test-results、tmp。本次生成的本机审视导航也从扫描排除，避免将联系表循环计为原稿。

## 最早原系列 20 张的证据

原编号 1–22 全部在提交 `a82cc45803cccf2306266a24442a35886972a23e` 首次进入 Git，提交作者时间为 `2026-10-18T06:49:46-07:00`。原文件名末尾数字与 `前端视觉创新设计/图像与页面对应.md` 的图号逐项对应。可可靠恢复用户所指最初系列的 1–20；同一次提交没有更细的图像生成时间证据，因此不把复制日期、当前文件时间或 ZIP 成员日期冒充生成顺序。

| 原图号/亲读号 | 原图主题 |
|---|---|
| 1 / V001 | 晨光里的在场-1 |
| 2 / V002 | 在场：慢慢来，我在。-2 |
| 3 / V003 | 在场：雨夜倾听-3 |
| 4 / V004 | 在场学习桌：一起推导线性微分方程-4 |
| 5 / V005 | 东三到西一的沿湖路线-5 |
| 6 / V006 | 启真湖校园漫游路线图-6 |
| 7 / V007 | 在场：今天，慢慢安排-7 |
| 8 / V008 | 在场：我们聊过的常数-8 |
| 9 / V009 | 在场·留下：一页安静笔记-9 |
| 10 / V010 | 在场·关于你-10 |
| 11 / V011 | 陪伴与窗边氛围定制-11 |
| 12 / V012 | 在场：初次见面与资料连接-12 |
| 13 / V013 | 在场：四种从容状态-13 |
| 14 / V014 | 在场：按你的节奏-14 |
| 15 / V015 | 在场：把安静带在身边-15 |
| 16 / V016 | 在场首页：慢慢来，我在。-16 |
| 17 / V017 | 在场地图展开与回归分镜-17 |
| 18 / V018 | 在场｜标量方程学习界面-18 |
| 19 / V019 | 去西一的路-19 |
| 20 / V020 | 在场四态设计板-20 |

## 已观察到的静态缺口

本次盘点时 `src/renderer/companion.tsx` 将爱音、灯的 image 指向品牌 `mark.svg`，同时把它们列入可选形象。这是可见角色资产缺口，不应由图标冒称角色。ZIP 08/09 和 23/24 分别含这两人的立绘/姿态候选，主代理亲看后可选择真实资产或另行生成。
品牌 SVG `mark-c2ceba84f237.svg` 使用 `#355B48` 绿色背景，需同本次统一暖色主题判断；窗景植物与绿色 UI 控件应分开处理。
此处为盘点时观察，集成后的修复与体验证据由本轮实现记录更新，不能把本节当最终缺陷结论。

## 149 张逐图功能映射

逐图价值、真实所有者、布局/素材类型及本轮覆盖缺口已在下方独立覆盖审查中逐项细化；不再保留初扫阶段宽泛的模块候选，避免将学习小组展示误归为共创、将表达排练误归为故事。

## 核查与交接状态

已直接核对：文件可读、尺寸、字节数、SHA-256；31 个 ZIP 成员完整原字节提取；7 附件与仓库/ZIP的逐字节关系；catalog 与所有本机来源记录的对应；38 页联系表实际比例；原始 22 张的 Git 引入记录。
本子任务没有改产品、没有生成产品素材、没有运行真实模型，没有替代主代理逐图审美与最终集成验收。没有清理原图或散落副本；本次导航与提取保留为复核资产。

## 逐图可采用价值、真实所有者与本轮覆盖缺口

本节为独立覆盖审查，依据原图身份、部分定点图像、当前源码与带日期的既有证据；不代表本子代理亲审了149张画面，更不替主代理看图、定案或验收。`同流程备选`表示功能/布局关系重复，不表示文件字节相同；所有原稿保留。下表的当前缺口包括明确未实现处和最终集成仍须实核的流程，不能把后一种写成已复现bug。中央catalog与README尚未变更，待主代理审完全图并明确采用后处理。

| 编号 | 可采用价值 | 实际owner | 本轮缺口/应核结果 | 类型 |
|---|---|---|---|---|
| V001 | 窗边进入、问候、原输入和继续上次聚合 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 独立场景设计 |
| V002 | 陪伴距离的早期备选；与V016比较人物对输入的占用 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 同流程布局备选；保留原稿 |
| V003 | 雨夜暖灯与倾听距离，维持真实交流而非预设情绪台词 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 独立场景设计 |
| V004 | 原文与交流并排的早期书桌，交互价值由V018/V148延续 | MaterialsPanel.tsx；ReadingDivider.tsx；StudySceneView.tsx；main/runtime/study-presentation.ts | 真实资料→原页/选段→普通续问→解释→回原文；分屏拖动/窄窗与重开阅读地址核最终接线 | 同流程早期布局 |
| V005 | 对话中路线与地点接入，内容优先由V019修订 | ConversationMap.tsx；CampusMap.tsx/MapSurface；main/mapService.ts；SceneService.selection | 最终总览/俯视/斜视/路线/建筑聚焦与展开回归、手势中断、无WebGL回退操作；保持同一相机与草稿 | 同地图早期布局 |
| V006 | 沉浸校园漫游与镜头控制，由V022收敛人物占用 | ConversationMap.tsx；CampusMap.tsx/MapSurface；main/mapService.ts；SceneService.selection | 最终总览/俯视/斜视/路线/建筑聚焦与展开回归、手势中断、无WebGL回退操作；保持同一相机与草稿 | 同地图早期布局 |
| V007 | 轻日期条、时间秩序和真正留白 | Workspace.tsx AgendaView；AgendaDayTimeline.tsx；LifePanels.tsx AgendaEditor；原Action/CAS/undo | 拖后预览→冲突/重复范围→同Action采用→撤回→回聊；课表只读，不把试放当改历 | 独立场景设计 |
| V008 | 从旧对话、资料、笔记找回具体一处 | LocalSearchPanel.tsx；App.tsx openConversation/openSearchResult；main/search.ts | 查找到真实命中并回到原消息/原页；改源或撤回后重读，不以列表出现证明定位成功 | 独立场景设计 |
| V009 | 安静记事的原布局，正文空间由V021修订 | NotesPanel.tsx；NoteSceneView.tsx；main/notes/service.ts；main/runtime/note-presentation.ts | 真实写入/选句/版本/冲突/回收恢复与返回交流；重开核实际正文及来源地址 | 同笔记早期布局 |
| V010 | 个人理解与来源、纠正、暂停、忘记可达 | HarnessViews.tsx MemoryPanelSimple/UnderstandingPanel；原Assertion与source owner | 修改/暂停/忘记沿原Assertion；来源展开与正文撤回后复核，画面不冒充新的本人事实 | 独立场景设计 |
| V011 | 形象、距离、光线各自选择而不捆绑人格 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 独立场景设计 |
| V012 | 首次进入按需连接而非强迫先配齐工具 | SettingsPanel.tsx；HarnessViews.tsx ScopeSettings/SourcePermissions；原Settings/Policy owner | 改后重开与对应业务入口核实际值；窄窗/错误态查看当前布局，不把连接表单当账号可用证明 | 独立场景设计 |
| V013 | 等待/确认/失败分态呈现，由V020避免矛盾状态并列 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 同状态早期设计板 |
| V014 | 相处方式、主动性和阅读节奏由用户控制 | SettingsPanel.tsx；HarnessViews.tsx ScopeSettings/SourcePermissions；原Settings/Policy owner | 改后重开与对应业务入口核实际值；窄窗/错误态查看当前布局，不把连接表单当账号可用证明 | 独立场景设计 |
| V015 | 同产品的窄窗入口/内容/输入关系；不意味着跨设备服务 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 响应式多态设计板 |
| V016 | 更安静的首页与轻继续入口，窗光给内容留地 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 独立场景设计 |
| V017 | 展开→探索→收回的同地图连续过程 | ConversationMap.tsx；CampusMap.tsx/MapSurface；main/mapService.ts；SceneService.selection | 最终总览/俯视/斜视/路线/建筑聚焦与展开回归、手势中断、无WebGL回退操作；保持同一相机与草稿 | 交互过程分镜 |
| V018 | 资料原文、当前推导与输入保持同一工作桌 | MaterialsPanel.tsx；ReadingDivider.tsx；StudySceneView.tsx；main/runtime/study-presentation.ts | 真实资料→原页/选段→普通续问→解释→回原文；分屏拖动/窄窗与重开阅读地址核最终接线 | 独立场景设计 |
| V019 | 原对话中的路线轻控件与足够正文 | ConversationMap.tsx；CampusMap.tsx/MapSurface；main/mapService.ts；SceneService.selection | 最终总览/俯视/斜视/路线/建筑聚焦与展开回归、手势中断、无WebGL回退操作；保持同一相机与草稿 | 独立场景设计 |
| V020 | 各阶段独立出现、真实停止/重试/修改/撤回 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 状态设计板 |
| V021 | 侧边索引、正文和旧版本/恢复形成安静记事本 | NotesPanel.tsx；NoteSceneView.tsx；main/notes/service.ts；main/runtime/note-presentation.ts | 真实写入/选句/版本/冲突/回收恢复与返回交流；重开核实际正文及来源地址 | 独立场景设计 |
| V022 | 透明空间地图的沉浸画布与克制悬浮控制 | ConversationMap.tsx；CampusMap.tsx/MapSurface；main/mapService.ts；SceneService.selection | 最终总览/俯视/斜视/路线/建筑聚焦与展开回归、手势中断、无WebGL回退操作；保持同一相机与草稿 | 独立场景设计 |
| V023 | 小时天气与空气各自制式/来源，语境内继续 | LifeSceneViews.tsx EnvironmentHours；AssistantPresentation.tsx；原weather/campus snapshots | 真实快照/选日/选小时/回输入；失败保留原值和真实时间，不显示来源未给字段 | 独立场景设计 |
| V024 | 地图失效后仍能保留原对话并恢复 | ConversationMap.tsx；CampusMap.tsx/MapSurface；main/mapService.ts；SceneService.selection | 最终总览/俯视/斜视/路线/建筑聚焦与展开回归、手势中断、无WebGL回退操作；保持同一相机与草稿 | 异常/恢复设计板 |
| V025 | 选日期、展开详情、原输入引用；同天气流程不同修订 | LifeSceneViews.tsx EnvironmentHours；AssistantPresentation.tsx；原weather/campus snapshots | 真实快照/选日/选小时/回输入；失败保留原值和真实时间，不显示来源未给字段 | 同流程布局/字段修订；不算三项新功能 |
| V026 | 选日期、展开详情、原输入引用；同天气流程不同修订 | LifeSceneViews.tsx EnvironmentHours；AssistantPresentation.tsx；原weather/campus snapshots | 真实快照/选日/选小时/回输入；失败保留原值和真实时间，不显示来源未给字段 | 同流程布局/字段修订；不算三项新功能 |
| V027 | 选日期、展开详情、原输入引用；同天气流程不同修订 | LifeSceneViews.tsx EnvironmentHours；AssistantPresentation.tsx；原weather/campus snapshots | 真实快照/选日/选小时/回输入；失败保留原值和真实时间，不显示来源未给字段 | 同流程布局/字段修订；不算三项新功能 |
| V028 | 共同作品沿真实公共地点取景，并与虚构身份同行 | shared/story-setting.ts；main/runtime/story-setting.ts；coordinator.ts present_view；ConversationMap.tsx | 明确缺口：coordinator.ts含storySetting冻结拒绝；renderer尚不展示view.setting，需完成取景→同作品续写闭环 | 独立场景设计 |
| V029 | 路线/地点/建筑与平面视图聚焦，同surface保持返回 | ConversationMap.tsx；CampusMap.tsx/MapSurface；main/mapService.ts；SceneService.selection | 最终总览/俯视/斜视/路线/建筑聚焦与展开回归、手势中断、无WebGL回退操作；保持同一相机与草稿 | 同地图多态/布局备选 |
| V030 | 路线/地点/建筑与平面视图聚焦，同surface保持返回 | ConversationMap.tsx；CampusMap.tsx/MapSurface；main/mapService.ts；SceneService.selection | 最终总览/俯视/斜视/路线/建筑聚焦与展开回归、手势中断、无WebGL回退操作；保持同一相机与草稿 | 同地图多态/布局备选 |
| V031 | 阅读宽度、文字与动态节奏由实际偏好控制 | SettingsPanel.tsx；HarnessViews.tsx ScopeSettings/SourcePermissions；原Settings/Policy owner | 改后重开与对应业务入口核实际值；窄窗/错误态查看当前布局，不把连接表单当账号可用证明 | 独立场景设计 |
| V032 | 原题/当前一步/函数曲线因果同屏；仍采用通用交互构作 | shared/interactive-library.ts；InteractiveProgramView.tsx；interactive-graphics.tsx；原program/source/localState owner | 普通Luna发表同program→改值/拖点→保稿→发送最新inputs→同作修订/重开；参数因果与窄窗实看 | 学习交互不同内容样例 |
| V033 | 资料列表与真实正文阅读，修掉V041多余导航 | MaterialsPanel.tsx；main/materials/service.ts；原resource/读取地址 | 打开真实选中文件并恢复实际页；导入/失败/撤源/重开用同resource核；图稿公式不是文件事实 | 同资料流程修订版 |
| V034 | 笔记里的一句想法可精确接着聊并回到原文 | NotesPanel.tsx；NoteSceneView.tsx；main/notes/service.ts；main/runtime/note-presentation.ts | 真实写入/选句/版本/冲突/回收恢复与返回交流；重开核实际正文及来源地址 | 独立场景设计 |
| V035 | 给特定受众编辑稿、精确预览、展示和回私聊 | App.tsx ReleaseCard/prepareDisplay/endDisplay；LifePanels.tsx DisplayReview/PublicDisplay；main/runtime/presentation.ts/release-store.ts | 编辑当前稿→预览→开始展示→返回私聊保稿；原修订变化后不展示旧稿；最终画面与操作仍需当前根实核 | 独立场景设计 |
| V036 | 与V035相同流程；保留分明的私稿/审阅/公开画面 | App.tsx ReleaseCard/prepareDisplay/endDisplay；LifePanels.tsx DisplayReview/PublicDisplay；main/runtime/presentation.ts/release-store.ts | 编辑当前稿→预览→开始展示→返回私聊保稿；原修订变化后不展示旧稿；最终画面与操作仍需当前根实核 | 同流程早期布局；额外侧栏不照搬 |
| V037 | 原题/当前一步/函数曲线因果同屏；仍采用通用交互构作 | shared/interactive-library.ts；InteractiveProgramView.tsx；interactive-graphics.tsx；原program/source/localState owner | 普通Luna发表同program→改值/拖点→保稿→发送最新inputs→同作修订/重开；参数因果与窄窗实看 | 学习交互不同内容样例 |
| V038 | 相位、叠加、时间、播放和解释共用同一局部输入 | shared/interactive-library.ts；InteractiveProgramView.tsx；interactive-graphics.tsx；原program/source/localState owner | 普通Luna发表同program→改值/拖点→保稿→发送最新inputs→同作修订/重开；参数因果与窄窗实看 | 波形交互多版；数学修订须以真实计算核 |
| V039 | 相位、叠加、时间、播放和解释共用同一局部输入 | shared/interactive-library.ts；InteractiveProgramView.tsx；interactive-graphics.tsx；原program/source/localState owner | 普通Luna发表同program→改值/拖点→保稿→发送最新inputs→同作修订/重开；参数因果与窄窗实看 | 波形交互多版；数学修订须以真实计算核 |
| V040 | 相位、叠加、时间、播放和解释共用同一局部输入 | shared/interactive-library.ts；InteractiveProgramView.tsx；interactive-graphics.tsx；原program/source/localState owner | 普通Luna发表同program→改值/拖点→保稿→发送最新inputs→同作修订/重开；参数因果与窄窗实看 | 波形交互多版；数学修订须以真实计算核 |
| V041 | 资料列表/预览的早期来源，功能由V033/V105延续 | MaterialsPanel.tsx；main/materials/service.ts；原resource/读取地址 | 打开真实选中文件并恢复实际页；导入/失败/撤源/重开用同resource核；图稿公式不是文件事实 | 同资料流程早期布局；额外侧栏不照搬 |
| V042 | 原题/当前一步/函数曲线因果同屏；仍采用通用交互构作 | shared/interactive-library.ts；InteractiveProgramView.tsx；interactive-graphics.tsx；原program/source/localState owner | 普通Luna发表同program→改值/拖点→保稿→发送最新inputs→同作修订/重开；参数因果与窄窗实看 | 学习交互不同内容样例 |
| V043 | 击键、杠杆/顶杆/琴槌脱开、琴弦与制音/声音看见因果 | shared/interactive-library.ts Press/Voice/Motion/Curve；interactive-audio.tsx；interactive-press.tsx；interactive-program-local-state.ts | 明确缺口：已有基础元件/旧按住发声观察，完整机构尚未交付；需同作击键→脱开击弦→衰减/制音/声音因果与慢放、延音实操 | 同机制两版布局；不是独立钢琴专页 |
| V044 | 击键、杠杆/顶杆/琴槌脱开、琴弦与制音/声音看见因果 | shared/interactive-library.ts Press/Voice/Motion/Curve；interactive-audio.tsx；interactive-press.tsx；interactive-program-local-state.ts | 明确缺口：已有基础元件/旧按住发声观察，完整机构尚未交付；需同作击键→脱开击弦→衰减/制音/声音因果与慢放、延音实操 | 同机制两版布局；不是独立钢琴专页 |
| V045 | 同一作品/问题的两种分支铺陈、夜桥意象和选中回聊 | DiscussionSceneView.tsx；main/runtime/discussion-scene.ts；原collaboration frame/option | 分支点选只附原option引用并保稿；普通续问/当前版本重新展开；桥图不能当真实到达或原文来源 | A/B原生布局；附件7逐字节相同 |
| V046 | 一个可立即参与的小发现/虚构故事，继续/换一个/放下可达 | CuriosityInvitationView.tsx；main/runtime/curiosity-invitation.ts/curiosity-scene.ts；原作品章/来源 | 同作品offer/continue/另一段/先放下→历史章回读；选句沿field/Unicode，虚构与本人现实分开 | 独立场景设计 |
| V047 | 自己的表达与一种模拟回应分开，随时改变想法 | RehearsalSceneView.tsx；main/runtime/relationship-rehearsal.ts；原rehearsal owner | 真实原句与模拟回应分别呈现；改意/再试/整理句子/先放下与历史版本实核，不把模拟写成现实记忆 | 独立场景设计 |
| V048 | 同一件事的共做停点、相关资料与下次继续 | CompanionSessionView.tsx；main/runtime/companion-session.ts；原共做owner | 同共做页继续/停住/回来；实际资料地址回原reader，不能自动重开已停止托付或制造任务债 | A/B布局；不复制成新任务系统 |
| V049 | 日夜长文/公式/代码维持可读且不让人物压正文 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 主题对照设计板 |
| V050 | 状态只附在眼前对象，停止/修改/失败恢复可操作 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 状态对照设计板 |
| V051 | 逐科学业记录以真实来源内嵌交流 | AssistantPresentation.tsx CampusRecords；CampusAcademicView.tsx；CampusDaySchedule.tsx；main/capabilities/campus-query.ts | 选课表/成绩/考试实际只读对象后回聊；缺时间/快照失败/只读边界准确，真实账号与合成观察分开 | 独立场景设计 |
| V052 | 笔记、版本/来源与其他内容的关系可到达 | NotesPanel.tsx；NoteSceneView.tsx；main/notes/service.ts；main/runtime/note-presentation.ts | 真实写入/选句/版本/冲突/回收恢复与返回交流；重开核实际正文及来源地址 | 笔记版本/恢复关系设计 |
| V053 | 今天/笔记/形象三种窄窗关系各自成立 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 跨屏响应式设计板 |
| V054 | 来信正文为主，来源按需展开，精确句子接回交流 | LetterMessage.tsx；LetterHistoryCard.tsx；LifePanels.tsx PreparationShelf；main/runtime/reflective-letter.ts | 完整来信→脚注→精确选句保稿→先收起→历史重开实操；旧证据末行遮挡/持续高亮需最终重看 | 独立场景设计 |
| V055 | 一段已接受安排可带走为真实日历文件 | Workspace.tsx calendar export；main/actions/calendar-export.ts；已接受Action实例 | 实际保存ICS后读回日期/时区/范围/备注与实例；只导出已接受安排，不因导出创建提醒 | 独立场景设计 |
| V056 | 工作、准备/休息和留白以完整占用呈现 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 独立场景设计 |
| V057 | 对照真实旧版本的布局/内容限制 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 历史运行截图；不算GPT Image新图稿 |
| V058 | 日条/单日展开/多日对照和同planRef续排，保留完整占用 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 同安排流程不同原生A/B或响应式修订 |
| V059 | 日条/单日展开/多日对照和同planRef续排，保留完整占用 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 同安排流程不同原生A/B或响应式修订 |
| V060 | 日条/单日展开/多日对照和同planRef续排，保留完整占用 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 同安排流程不同原生A/B或响应式修订 |
| V061 | 日条/单日展开/多日对照和同planRef续排，保留完整占用 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 同安排流程不同原生A/B或响应式修订 |
| V062 | 在同一真实日程上编辑时长、地点、重复与撤销 | Workspace.tsx AgendaView；AgendaDayTimeline.tsx；LifePanels.tsx AgendaEditor；原Action/CAS/undo | 拖后预览→冲突/重复范围→同Action采用→撤回→回聊；课表只读，不把试放当改历 | 独立场景设计 |
| V063 | 日条/单日展开/多日对照和同planRef续排，保留完整占用 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 同安排流程不同原生A/B或响应式修订 |
| V064 | 日条/单日展开/多日对照和同planRef续排，保留完整占用 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 同安排流程不同原生A/B或响应式修订 |
| V065 | 托付详情将准备、路线和暂停/停止放回同一件事 | EntrustedPanel.tsx；LifePanels.tsx PreparationShelf；原Attention/Work/托付owner | 真实托付→准备→打开/接着聊→暂停/停止/重开，核原Work状态与source；不以卡片存在证明主动性 | 独立场景设计 |
| V066 | 日条/单日展开/多日对照和同planRef续排，保留完整占用 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 同安排流程不同原生A/B或响应式修订 |
| V067 | 日条/单日展开/多日对照和同planRef续排，保留完整占用 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 同安排流程不同原生A/B或响应式修订 |
| V068 | 日条/单日展开/多日对照和同planRef续排，保留完整占用 | LifeSceneViews.tsx PlanningTime；PlanningComparisonTimeline.tsx；main/actions/planning.ts；原planRef与Action事务 | 选择同planRef时段→改条件→续排/采用；准备/休息完整占用与拒绝条件保留，实际模型闭环待核 | 同安排流程不同原生A/B或响应式修订 |
| V069 | 形象选用与性格草稿独立，采用仍是用户明确选择 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 独立场景设计 |
| V070 | 理解可变，原来源和修改范围可查 | HarnessViews.tsx MemoryPanelSimple/UnderstandingPanel；原Assertion与source owner | 修改/暂停/忘记沿原Assertion；来源展开与正文撤回后复核，画面不冒充新的本人事实 | 同理解/纠正流程布局修订 |
| V071 | 角色核心、自己的例句和以前约定可编辑/回退 | SettingsPanel.tsx；HarnessViews.tsx ScopeSettings/SourcePermissions；原Settings/Policy owner | 改后重开与对应业务入口核实际值；窄窗/错误态查看当前布局，不把连接表单当账号可用证明 | 独立场景设计 |
| V072 | 模型连接和校园资料权限按原契约分开管理 | SettingsPanel.tsx；HarnessViews.tsx ScopeSettings/SourcePermissions；原Settings/Policy owner | 改后重开与对应业务入口核实际值；窄窗/错误态查看当前布局，不把连接表单当账号可用证明 | 独立场景设计 |
| V073 | 本机数据带走/清除由真实范围与可撤回选择承接 | SettingsPanel.tsx；HarnessViews.tsx ScopeSettings/SourcePermissions；原Settings/Policy owner | 改后重开与对应业务入口核实际值；窄窗/错误态查看当前布局，不把连接表单当账号可用证明 | 独立场景设计 |
| V074 | 本轮如何参考/保留与长期来源权限分别表达 | SettingsPanel.tsx；HarnessViews.tsx ScopeSettings/SourcePermissions；原Settings/Policy owner | 改后重开与对应业务入口核实际值；窄窗/错误态查看当前布局，不把连接表单当账号可用证明 | 独立场景设计 |
| V075 | 多形象收藏、自选图片、存在距离与位置预览 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 同形象选择流程不同布局 |
| V076 | 托付期限、可用来源、准备结果及暂停/停止可达 | EntrustedPanel.tsx；LifePanels.tsx PreparationShelf；原Attention/Work/托付owner | 真实托付→准备→打开/接着聊→暂停/停止/重开，核原Work状态与source；不以卡片存在证明主动性 | 同托付流程不同布局；并非纯人物素材 |
| V077 | 原话找回与有限上下文读取后再采用 | LocalSearchPanel.tsx；App.tsx openConversation/openSearchResult；main/search.ts | 查找到真实命中并回到原消息/原页；改源或撤回后重读，不以列表出现证明定位成功 | 同找回流程不同布局；并非纯人物素材 |
| V078 | 理解可变，原来源和修改范围可查 | HarnessViews.tsx MemoryPanelSimple/UnderstandingPanel；原Assertion与source owner | 修改/暂停/忘记沿原Assertion；来源展开与正文撤回后复核，画面不冒充新的本人事实 | 同理解/纠正流程布局修订 |
| V079 | 可复用窗景/光线，内容和人物保持独立层 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯窗景素材/光线候选 |
| V080 | 可复用窗景/光线，内容和人物保持独立层 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯窗景素材/光线候选 |
| V081 | 可复用窗景/光线，内容和人物保持独立层 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯窗景素材/光线候选 |
| V082 | 可复用窗景/光线，内容和人物保持独立层 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯窗景素材/光线候选 |
| V083 | 桥与雨夜人影作为故事意象，增强作品氛围 | DiscussionSceneView.tsx；main/runtime/discussion-scene.ts；原collaboration frame/option | 分支点选只附原option引用并保稿；普通续问/当前版本重新展开；桥图不能当真实到达或原文来源 | 纯插画素材；不证明真实地点/本人到达 |
| V084 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V085 | 可复用窗景/光线，内容和人物保持独立层 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯窗景素材/光线候选 |
| V086 | 安静休息时的窗边阅读氛围 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 整场景插画；不作含字整页背景 |
| V087 | 可复用窗景/光线，内容和人物保持独立层 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯窗景素材/光线候选 |
| V088 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V089 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V090 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V091 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V092 | 桥与雨夜人影作为故事意象，增强作品氛围 | DiscussionSceneView.tsx；main/runtime/discussion-scene.ts；原collaboration frame/option | 分支点选只附原option引用并保稿；普通续问/当前版本重新展开；桥图不能当真实到达或原文来源 | 纯插画素材；不证明真实地点/本人到达 |
| V093 | 原文和手稿保留可读结构，纸质只提供轻触感 | study-scene.css/note-scene.css/rehearsal.css/letter.css；原可读DOM与owner不变 | 仅作纸面/装饰；在真实公式/长文/窄窗下核纹理对比与边缘，正文和可访问交互保留为DOM | 纯纸面/装饰素材 |
| V094 | 原文和手稿保留可读结构，纸质只提供轻触感 | study-scene.css/note-scene.css/rehearsal.css/letter.css；原可读DOM与owner不变 | 仅作纸面/装饰；在真实公式/长文/窄窗下核纹理对比与边缘，正文和可访问交互保留为DOM | 纯纸面/装饰素材 |
| V095 | 原文和手稿保留可读结构，纸质只提供轻触感 | study-scene.css/note-scene.css/rehearsal.css/letter.css；原可读DOM与owner不变 | 仅作纸面/装饰；在真实公式/长文/窄窗下核纹理对比与边缘，正文和可访问交互保留为DOM | 纯纸面/装饰素材 |
| V096 | 原文和手稿保留可读结构，纸质只提供轻触感 | study-scene.css/note-scene.css/rehearsal.css/letter.css；原可读DOM与owner不变 | 仅作纸面/装饰；在真实公式/长文/窄窗下核纹理对比与边缘，正文和可访问交互保留为DOM | 纯纸面/装饰素材 |
| V097 | 原文和手稿保留可读结构，纸质只提供轻触感 | study-scene.css/note-scene.css/rehearsal.css/letter.css；原可读DOM与owner不变 | 仅作纸面/装饰；在真实公式/长文/窄窗下核纹理对比与边缘，正文和可访问交互保留为DOM | 纯纸面/装饰素材 |
| V098 | 原文和手稿保留可读结构，纸质只提供轻触感 | study-scene.css/note-scene.css/rehearsal.css/letter.css；原可读DOM与owner不变 | 仅作纸面/装饰；在真实公式/长文/窄窗下核纹理对比与边缘，正文和可访问交互保留为DOM | 纯纸面/装饰素材 |
| V099 | 校园与天气结果回到当前交流和对应地点 | AssistantPresentation.tsx CampusRecords；CampusAcademicView.tsx；CampusDaySchedule.tsx；main/capabilities/campus-query.ts | 选课表/成绩/考试实际只读对象后回聊；缺时间/快照失败/只读边界准确，真实账号与合成观察分开 | 独立场景设计 |
| V100 | 多形象收藏、自选图片、存在距离与位置预览 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 同形象选择流程不同布局 |
| V101 | 停止/中断后原草稿、已公开正文和可继续处同行 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 异常/恢复过程设计 |
| V102 | 资料打开失败保稿、重试和回原文保持连贯 | MaterialsPanel.tsx；main/materials/service.ts；原resource/读取地址 | 打开真实选中文件并恢复实际页；导入/失败/撤源/重开用同resource核；图稿公式不是文件事实 | 异常/恢复过程设计 |
| V103 | 托付期限、可用来源、准备结果及暂停/停止可达 | EntrustedPanel.tsx；LifePanels.tsx PreparationShelf；原Attention/Work/托付owner | 真实托付→准备→打开/接着聊→暂停/停止/重开，核原Work状态与source；不以卡片存在证明主动性 | 同托付流程不同布局；并非纯人物素材 |
| V104 | 首次连接顺序围绕眼前需要 | SettingsPanel.tsx；HarnessViews.tsx ScopeSettings/SourcePermissions；原Settings/Policy owner | 改后重开与对应业务入口核实际值；窄窗/错误态查看当前布局，不把连接表单当账号可用证明 | 独立场景设计 |
| V105 | 原资料与对话真正并排，选句沿同一输入继续 | MaterialsPanel.tsx；ReadingDivider.tsx；StudySceneView.tsx；main/runtime/study-presentation.ts | 真实资料→原页/选段→普通续问→解释→回原文；分屏拖动/窄窗与重开阅读地址核最终接线 | 同学习流程布局修订 |
| V106 | 调整同一日程、明确保留/撤回原对象 | Workspace.tsx AgendaView；AgendaDayTimeline.tsx；LifePanels.tsx AgendaEditor；原Action/CAS/undo | 拖后预览→冲突/重复范围→同Action采用→撤回→回聊；课表只读，不把试放当改历 | 同编辑流程布局修订 |
| V107 | 原话找回与有限上下文读取后再采用 | LocalSearchPanel.tsx；App.tsx openConversation/openSearchResult；main/search.ts | 查找到真实命中并回到原消息/原页；改源或撤回后重读，不以列表出现证明定位成功 | 同找回流程不同布局；并非纯人物素材 |
| V108 | 统一品牌在窗口/安装/应用中保持识别 | assets/brand；Electron brand构建；App.tsx/companion.tsx实际引用 | 最终导出品牌与图标实际显示；绿色底色按本轮主题审定，品牌图不得占用角色身份 | 品牌图标多格式；不算角色或独立页面 |
| V109 | 统一品牌在窗口/安装/应用中保持识别 | assets/brand；Electron brand构建；App.tsx/companion.tsx实际引用 | 最终导出品牌与图标实际显示；绿色底色按本轮主题审定，品牌图不得占用角色身份 | 品牌图标多格式；不算角色或独立页面 |
| V110 | 统一品牌在窗口/安装/应用中保持识别 | assets/brand；Electron brand构建；App.tsx/companion.tsx实际引用 | 最终导出品牌与图标实际显示；绿色底色按本轮主题审定，品牌图不得占用角色身份 | 品牌图标多格式；不算角色或独立页面 |
| V111 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V112 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V113 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V114 | 输入、继续阅读、看今天、先坐一会组成轻入口 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 同首页不同空间候选 |
| V115 | 输入、继续阅读、看今天、先坐一会组成轻入口 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 同首页不同空间候选 |
| V116 | 直接拖动试放、看关联资料、讨论改动再回到原安排 | Workspace.tsx AgendaView；AgendaDayTimeline.tsx；LifePanels.tsx AgendaEditor；原Action/CAS/undo | 拖后预览→冲突/重复范围→同Action采用→撤回→回聊；课表只读，不把试放当改历 | 同日程交互多版/窄窗状态 |
| V117 | 分屏跟手调比例，原段落与当前问题保持同一地址 | MaterialsPanel.tsx；ReadingDivider.tsx；StudySceneView.tsx；main/runtime/study-presentation.ts | 真实资料→原页/选段→普通续问→解释→回原文；分屏拖动/窄窗与重开阅读地址核最终接线 | 同学习交互多版；V148为本次新参考 |
| V118 | 笔记选句→继续推导→回原页，保留原稿与来源 | NotesPanel.tsx；NoteSceneView.tsx；main/notes/service.ts；main/runtime/note-presentation.ts | 真实写入/选句/版本/冲突/回收恢复与返回交流；重开核实际正文及来源地址 | 同笔记交互多版 |
| V119 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V120 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V121 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V122 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V123 | 可复用窗景/光线，内容和人物保持独立层 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯窗景素材/光线候选 |
| V124 | 地图展开与返回，同一地点、草稿和相机连续 | ConversationMap.tsx；CampusMap.tsx/MapSurface；main/mapService.ts；SceneService.selection | 最终总览/俯视/斜视/路线/建筑聚焦与展开回归、手势中断、无WebGL回退操作；保持同一相机与草稿 | 同地图交互多版 |
| V125 | 多角色候选、位置/远近和光线在同一预览里可调 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 独立场景设计 |
| V126 | 深浅模式正文对比与当前资料引用位置 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 主题对照；不将外部桌面框照搬进App |
| V127 | 可复用窗景/光线，内容和人物保持独立层 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯窗景素材/光线候选 |
| V128 | 可复用窗景/光线，内容和人物保持独立层 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯窗景素材/光线候选 |
| V129 | 直接拖动试放、看关联资料、讨论改动再回到原安排 | Workspace.tsx AgendaView；AgendaDayTimeline.tsx；LifePanels.tsx AgendaEditor；原Action/CAS/undo | 拖后预览→冲突/重复范围→同Action采用→撤回→回聊；课表只读，不把试放当改历 | 同日程交互多版/窄窗状态 |
| V130 | 同首页/阅读/聊天/今天在窄窗口切换仍保持对象身份 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 响应式设计板；不意味着手机服务 |
| V131 | 查历史、来源失效、夜间休息与未保存笔记返回 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 多状态恢复设计板 |
| V132 | 输入、继续阅读、看今天、先坐一会组成轻入口 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 同首页不同空间候选 |
| V133 | 同首页/阅读/聊天/今天在窄窗口切换仍保持对象身份 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 响应式设计板；不意味着手机服务 |
| V134 | 直接拖动试放、看关联资料、讨论改动再回到原安排 | Workspace.tsx AgendaView；AgendaDayTimeline.tsx；LifePanels.tsx AgendaEditor；原Action/CAS/undo | 拖后预览→冲突/重复范围→同Action采用→撤回→回聊；课表只读，不把试放当改历 | 同日程交互多版/窄窗状态 |
| V135 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V136 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V137 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V138 | 真实形象候选支持多角色/多姿态与内容退让 | CompanionSettings.tsx；companion.tsx；appearance.ts；PersonaEditor.tsx | 采用后实核形象/位置/主题持久化和内容退让；所有可选角色须真图，视觉选择与人格分开 | 纯人物素材/动作候选；不自动改变人格 |
| V139 | 分屏跟手调比例，原段落与当前问题保持同一地址 | MaterialsPanel.tsx；ReadingDivider.tsx；StudySceneView.tsx；main/runtime/study-presentation.ts | 真实资料→原页/选段→普通续问→解释→回原文；分屏拖动/窄窗与重开阅读地址核最终接线 | 同学习交互多版；V148为本次新参考 |
| V140 | 地图展开与返回，同一地点、草稿和相机连续 | ConversationMap.tsx；CampusMap.tsx/MapSurface；main/mapService.ts；SceneService.selection | 最终总览/俯视/斜视/路线/建筑聚焦与展开回归、手势中断、无WebGL回退操作；保持同一相机与草稿 | 同地图交互多版 |
| V141 | 分屏跟手调比例，原段落与当前问题保持同一地址 | MaterialsPanel.tsx；ReadingDivider.tsx；StudySceneView.tsx；main/runtime/study-presentation.ts | 真实资料→原页/选段→普通续问→解释→回原文；分屏拖动/窄窗与重开阅读地址核最终接线 | 同学习交互多版；V148为本次新参考 |
| V142 | 笔记选句→继续推导→回原页，保留原稿与来源 | NotesPanel.tsx；NoteSceneView.tsx；main/notes/service.ts；main/runtime/note-presentation.ts | 真实写入/选句/版本/冲突/回收恢复与返回交流；重开核实际正文及来源地址 | 同笔记交互多版 |
| V143 | 直接拖动试放、看关联资料、讨论改动再回到原安排 | Workspace.tsx AgendaView；AgendaDayTimeline.tsx；LifePanels.tsx AgendaEditor；原Action/CAS/undo | 拖后预览→冲突/重复范围→同Action采用→撤回→回聊；课表只读，不把试放当改历 | 同日程交互多版/窄窗状态 |
| V144 | 首页→概率交流→资料卡与窄窗；内容和形象因场景调整 | App.tsx MessageView/ActionCard；RichText.tsx；原message/view锚点 | 最终长文、公式、代码、等待/停止/恢复实操；检查原草稿与当前引用，不用静态卡片当链路证明 | 连续流程/响应式设计板 |
| V145 | 植物侵入正文是必须复现/修复的真实布局触发 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 本次运行截图/缺陷依据；不算设计图稿 |
| V146 | 日夜光影和空间比例标尺；人物青春感另由新资产落实 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 参考原稿；不照搬成熟人物画风/逐句台词 |
| V147 | 日夜光影和空间比例标尺；人物青春感另由新资产落实 | App.tsx welcome/RestSpace；companion.tsx；companion.css | 最终窗宽/长文/休息往返实看；植物、人物、窗景不侵入正文，保稿与恢复同源 | 参考原稿；不照搬成熟人物画风/逐句台词 |
| V148 | 分屏跟手调比例，原段落与当前问题保持同一地址 | MaterialsPanel.tsx；ReadingDivider.tsx；StudySceneView.tsx；main/runtime/study-presentation.ts | 真实资料→原页/选段→普通续问→解释→回原文；分屏拖动/窄窗与重开阅读地址核最终接线 | 同学习交互多版；V148为本次新参考 |
| V149 | 清楚的时间线、留白和关联对象是最终操作标尺 | Workspace.tsx AgendaView；AgendaDayTimeline.tsx；LifePanels.tsx AgendaEditor；原Action/CAS/undo | 拖后预览→冲突/重复范围→同Action采用→撤回→回聊；课表只读，不把试放当改历 | 本次新日程参考 |

### 重点穿透结果与取舍

- **V035/036公开展示：** 两张是同一流程的修订版。真实链为App.ReleaseCard编辑/复制 → prepareDisplay保存原草稿并选择artifact/matter精确修订 → DisplayReview → PresentationService持有id/revision/hash → PublicDisplay只读已选正文。public projection清掉私人对话/日程/准备等，返回由endDisplay恢复原会话/页面。不是待造的学习小组产品；最终仍要实际改稿、预览、展示、改源失效和保稿返回。`main/runtime/presentation.ts:35–89/153–155`、`App.tsx:1152–1188/1694–1695`、`LifePanels.tsx:803–915`为本次所读源码。
- **V043/044钢琴：** 不能把Graphic+Press发声等同完整机构。Press、Voice、Motion、Curve已支持同program局部字段；Voice默认静音，用户开声才创建AudioContext，失焦/卸载释放，声音/按住状态transient不恢复。CURRENT_STATUS:209/221仍把完整机构与键盘同作列为未交付。要求是同一作品里按键、脱开/击弦、回弹、余振与制音、力度/延音/慢放共用状态并看见因果，普通Luna发表与操作续问一并实核，保持通用构作而非硬编码钢琴专页。
- **V045故事与V028地图取景：** V045分支/夜桥素材已经接原DiscussionSceneProjector与collaboration frame/option，点选返回SemanticSelection而非接受。小故事与旧章节由Curiosity原owner和Unicode field焦点继续。地图取景是独立明确缺口：CuriosityView有setting、backend保留storySetting构作，但`coordinator.ts:2295–2296`仍直接冻结拒绝，renderer不读取view.setting；要完整落实V028，需要取景入口和同作品地址回流，不把故事地理当本人到达。
- **V054来信：** 原PreparationShelf→LetterMessage有真实正文与脚注；letterSource只按paragraph/source下标回原证明，精确选句交typed LetterReference，resolveReference重新核原owner/revision/来源，dismiss与LetterHistoryCard重开不恢复机会。CURRENT_STATUS:461旧观察尚留末行遮挡修正后重看和持续高亮核查；本轮要长信/脚注/选句保稿/收起/历史重开最终观察，不用旧图宣称当前通过。
- **统一主题：** `interactive-program.css`中的`.tone-green {color:#68836a}`及品牌SVG绿色仍是可见UI候选，须和本轮主题统一；窗外绿植不受此限制。角色位图和新主题采用仍由主代理裁决。

### 新原图进入中央图库的准备边界

已备31个ZIP原字节、7附件对应关系与149序号/来源。主代理明确每张采用/保留后，只把获准的设计/素材原图按SHA归并进入原有主题目录，补catalog的尺寸/字节/来源/用途/衍生关系及README；不把联系表、真实账号画面、完整本机路径或截图自动上传。新shell/角色候选也需选定结果及原工具记录后纳入同一目录；不先建第二图库。未删散落副本。
