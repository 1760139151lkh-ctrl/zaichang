# 前端、视觉、直接操纵与 OpenUI 交接审计

本件为 2026-10-24 新主代理交接中的一个专题。当前任务是完整交接，当前研发阶段仍是第二阶段；本件没有启动应用、重新验收界面、生图、请求模型、读取私人业务数据库或修改产品代码。以下分别标明产品要求、历史观察和本次源码阅读，不能将三者互相充当完成证据。

## 1. 先理解整件产品，再理解网络断点

“在场”是一段能够持续相处、共同做事、离开再接上的交流。学习、资料、笔记、安排、校园与体艺是她帮助人的具体生活内容；她同时可以聊天、共创、玩笑、倾听或安静相处。不能把项目缩减成校园查询器、运动轨迹工具、体艺订单面板或右侧有立绘的聊天网页。

新主代理须按总交接的第一阶段全量阅读清单完整接住项目原话、产品灵魂、主模型与宿主边界、来源/记忆/行动契约及原有成果，再从第二阶段开新团队深入。只看本件或直连修复回执，不足以接手。最新网络修复提供继续研究体艺的可行入口，不是第二阶段完成，更不是后续前端阶段已经完成。

每个阶段都要不断发现真实不足、主动提出和完成契合主线的创新，反复经过“理解真实使用→实现→亲自体验→寻找反例→修复→复查”。路线图列举只是起点，不能当工作上限；也不能为了创新抢跑后续阶段、另造系统、堆面板或放宽来源与权限。用户本次明确要求第二阶段从头深入并使用八个子代理；旧视觉接力中的“六个子代理”是当时槽位说明，不能盖过现在的要求。

## 2. 全站组成与单一输入

| 产品面 | 现有宿主与意义 | 下一主代理应把握的关系 |
| --- | --- | --- |
| 聊天与窗边空间 | `App.tsx`、`Navigation.tsx`、`Workspace.tsx` | 顶层三导航是聊天、今天、留下；资料、记忆、角色、偏好沿现有入口进入。不是每种能力建一个失联的新应用。 |
| 今天与日程 | `Workspace.tsx`、`AgendaDayTimeline.tsx`、`CampusDaySchedule.tsx` | 个人安排与学校课表同日阅读，但仍各归原 owner。时间轴表达真实占用、冲突与试放，不以填满一天为目标。 |
| 留下与笔记 | `NotesPanel.tsx`、`presentation/NoteSceneView.tsx`、NotesService | 用户自己写的原文、助手建议、引用与版本分别保留；从某一句继续聊可回原文。 |
| 资料与 PDF | `MaterialsPanel.tsx`、`MaterialPdfPage.tsx`、MaterialService | 原文、页面、文字层、选段、批注与对话保持来源和当前阅读位置；不能烧进图片或仅转述摘要。 |
| 陪学双纸 | `presentation/StudySceneView.tsx`、Study owner | 原题、本人尝试、助手帮助与提示深度分开；原题和推导并排，仍使用同一个 composer。 |
| 地图、路线与运动 | `ConversationMap.tsx`、共享 `map/`、spatial/workout owner | 内嵌、展开、收回沿同 surface/相机；运动是原记录的生命周期，体艺有效次数仍来自学校。 |
| 动态作品 | `presentation/InteractiveProgramView.tsx` 及有限组件库 | 真实参数、声音、图形与受限运动可由模型组合，用户操作可回流；不是任意脚本宿主或第二业务状态库。 |
| 商量、共做、故事、排练、来信、小发现 | Discussion/CompanionSession/PlanningComparison/Rehearsal/LifeScene/Curiosity 等组件 | 均从原对话或作品展开，保同对象、来源、修订与返回；想象内容不变成现实经历。 |
| 关于你、相处方式、角色、主题与连接 | `HarnessViews.tsx`、`CompanionSettings.tsx`、`companion.tsx`、`appearance.ts`、`TiyiConnection.tsx` 等 | 个人理解、纯角色核心、形象、外观偏好与账号连接分别管理。换形象不暗改人格，预览不等于采用或授权。 |
| 返回与恢复 | `workspace-return.ts`、各业务 owner、App 恢复路径 | 只保存查看地址/布局条件的恢复层不替代草稿、材料、日程或 Study owner，不恢复旧批准、已取消运行和被撤来源。 |

`ConversationComposerDock.tsx`管理的是现有 composer 的停靠位置，不持有第二份问题、答案或提交路径。App 移动同一 HTMLElement host 到当前可见的 Study 槽，草稿、附件、选区与 IME 应继续存在。所有跨模块修改仍由 Electron main 通过有限 Bridge 执行。

## 3. 审美与角色约束

已完整阅读[前端总监技能](../../../../.agents/skills/zaichang-frontend-director/SKILL.md)及其五份 references；它们提供灵魂、角色、图像、空间、动效、协同与验收方法。现行具体基线仍须结合[FRONTEND_DESIGN](../../../../FRONTEND_DESIGN.md)、用户最新指令和当前集成代码理解，不能将技能中的模板数值机械覆盖已工作的界面。

### 3.1 人味来自具体帮助

角色应在查资料、解题、改变主意、共创、恢复、失败与等待全过程保留性格。不能闲聊像祥子、办事立刻变标准客服，也不能写死“我在/慢慢来/先喝水”路由。准确理解问题、保住原稿、指出真正卡点、完成可核实的帮助，比一张大立绘或固定安慰更重要。

内置人物体系是 MyGO!!!!! 与 Ave Mujica 十人：祥子、睦、初华、海铃、若麦、灯、爱音、乐奈、素世、立希。中文显示名沿项目约定，稳定 ID 不因译名变化复制。外观和原作履历应核官方；项目里的陪读、安排、散步等是原创互动，不把它们写成原作经历或用户共同往事。用户已经保存的自定义角色和本地文字继续可读、可编辑，退役路人视觉不再回流。

### 3.2 空间与四主题

- 闲聊可以有完整房间和亲近角色；长文、数学、PDF 与复杂安排必须让连续阅读面成为主体。角色随任务自然退到合法侧座，不遮脸、公式、选区、页码或主要按钮；用户的 hidden/corner、减少动态与窄窗选择优先。
- 暖杏、晨雾蓝、暮色紫、夜雨暖金是同一空间的完整光线与语义色状态。主题切换保控件槽位、草稿、阅读锚和输入；不能昼夜左右硬分，也不能用箭头对比滑块。
- 禁止绿色 UI 强调、成片绿底与绿按钮。自然植物、真实地图自然地物及睦原作固有发色/服饰允许保留本色，不能为禁绿破坏角色身份。
- 完整窗框、窗台、家具透视、可走通道和小桌用途要成立；生活层次不能靠正文后堆植物或厚渐变遮错房来制造。正文安全区与后景装饰分别管理。
- 先实看已集成画面，保护已经对齐的区域；数字相等不证明视觉重心相同，数值不同也不必然是错误。导航/输入槽位共用标尺，不强迫所有任务采用同一分屏比例。

### 3.3 图稿档案与四步 Image 管线

所有前端视觉资产归 `前端视觉创新设计/`，SHA-256 将原来源、Prompt、原图、等级、处方、实际引用联系起来。A 是审美/布局标杆，仍不是业务事实；B 保留有效构图并精准修身份或局部；C 先完整提炼触发、对象、交互、状态、来源、取消/返回及代码落点；D 退出当前资产树并修引用。蒙版、地图纹理、历史运行截图按真实用途排除审美分级，不能把黑白 alpha 当废图，也不能把历史截图当新设计参考。

首页、学习、资料/PDF、日程、笔记、地图、角色、主题、恢复及新小界面，均须先有合格 GPT Image 设计，再转活组件；可明确复用合格对应稿。禁止 CSS 截图、手绘占位、整页贴图或静态假按钮冒充设计创新与真实功能。

1. 先定统一参考画布、相机、导航/输入槽、正文安全区、家具平面、座位锚和光向；空间错误先重做纯净空景。
2. 优先祥子或睦做单角色跨类别打样。主代理逐幅亲看完整人体、脸、支撑、遮挡与空间；不能只换道具、同一托腮算多种姿态。
3. 母姿态合格后才扩角色、活动、四主题；矩阵记真实存在的格子，不把 fallback 算成新增资产或覆盖。
4. 从合格整幅同景母图原景分离。母图、空景、人物/蒙版、接触影与前景共享完整画布和像素坐标；正文、按钮、图表与地图另由真实组件渲染。

结构错误图绝不作为后续参考输入，包括作为“仅身份参考”的第二张图。用不含错误人物的纯净空背景加精准纯文字重建完整人体，检查髋—膝—踝、肢体归属、正常比例与支撑后再分离。正确支撑不要求两脚永远着地：标准搭腿可一脚承重另一脚悬空，床沿坐也可两脚自然垂落。蒙版不能修骨架，RGBA/同尺寸/alpha峰值不证明边缘合格。GPT Image 的未公开底层架构不能被写成已知技术定律。

主代理必须亲看黄金标杆、高价值候选和每张新图，并亲自操作最终集成界面。子代理批准字段、联系表、哈希或口头保证都不能替代这两项责任。本交接没有再次亲看这些原图，不签署任何新视觉批准。

## 4. 设计史与当前代码必须分开

10月23日[深度评鉴入口](../../../../前端视觉创新设计/2026-10-23-深度评鉴/README.md)和[全量图稿评鉴](../../../../前端视觉创新设计/2026-10-23-深度评鉴/全量图稿评鉴.md)记录了当时 306 个唯一来源、当前保留 A28/B45/C80 及用途排除项等。那是有时间边界的清理结果，不是本次重新统计、不是全部合格姿态数、也不是今天全矩阵已验收。

重点标杆的因果关系：U04/R124/R146/R160 是原文与推导可互相核对；U03/U30/R164 是试放原位与修改后果可比较；U05/U29/R153 是本人笔记为主体、引用能回来源；U11/R158/R163/R166 是同一路线在消息与大地图中连续；R149 是轻量、可纠正的理解条目；R155 是视觉、表达节奏与主动频率分别管理。不能照抄图上日期、公式、成绩、路线和样例话术成为事实。

C 级功能族还包括：同时间轴方案比较、完整准备/通勤/休息、原题局部追问、更小提示、恢复原页、来源纠正与临时例外、共写分支、范围展示/ICS、异常恢复、波形相位/幅值/时刻以及钢琴机械阶段/声音。应沿现有共同机制深化，不能逐图复制几十个孤岛页面。

以下旧结论已经不能直接搬成当前事实，必须重新看现码和最终实机：

| 旧审计/状态文字 | 本次当前源码实际见到 | 交接裁决 |
| --- | --- | --- |
| “只有四个内置视觉身份” | `companion.tsx`已列十个 `characterSlots`，`COMPANIONS`按实际存在的 portrait 过滤；`SceneCharacter`也有十人 | 身份槽、头像可选、真正可用场景是三件事。不能继续一概说只有四人，也不能反向宣布十人全活动/主题矩阵已完成。 |
| “多数图共用默认 seat/hitPolygon” | `companion-scenes.tsx`已有九个 legacy 独立标定条目，以及 `*.scene.json`动态注册、审核字段和支撑约束 | “尚无逐资产机制”已过时。现机制不等于每张图质量已通过；新主代理需亲看真实轮廓、接触、热区与运行。 |
| “只能原文拖到聊天、Study无接收器” | 当前有 `SourceBookmarkTray`、`NativeSourceBookmarkService`、`NativeStudyService.previewBookmark/acceptBookmark`、Study目标注册与 drop 接收 | 当前已存在来源托盘→同题 Study 的受控实现；它受原题范围限制，不是任意材料落任意推导行。旧缺口不能当成完全从零任务。 |
| “全是 easing，尚无 spring机制” | 当前有 `motion/use-spring.ts`、`use-split-motion.ts`；角色 Stage、资料/Study分隔线等已调用 | 已有数值弹簧/速度接管基础；不能继续说完全没有，也不能凭源码宣布全站 SwiftUI级手感完成。 |
| “focus是下一轮拟补薄owner” | `focus-session.ts`已有本机主动开始/暂停/继续/结束及检查点 | 当前已有 owner。它不是学习质量、掌握或后台常驻证明；关闭后的时间不会自动计入，重开将原 running 记为 paused。 |
| “只拟做恢复书签” | `workspace-return.ts`已有严格地址 schema、查看条件、边界绑定与查看地址检查点；App有回读各owner的恢复路径 | 可继承并实际核验，不能重新造第二份恢复正文或恢复旧批准。 |

本次看到五个祥子 `.scene.json` 注册文件（闲聊、学习、阅读、整活、注意新对象的暖杏候选）；登记字段和文件存在不等于本次批准或实机通过。共享工作树可能继续演进，接手时须重新核当前实际注册、引用、状态与远端基线。不得为凑“十角色全覆盖”恢复已删除错腿资产。

另有规范数值时序：技能 reference 03 中 48px 顶栏、16px 分隔缝等是其设计模板；`FRONTEND_DESIGN`与当前相关代码说明的桌面72px/窄窗100px、资料默认56%与Study32.1%等是已存在基线。应从真实层叠、响应式和光学关系调整，不用前者直接盖掉后者。历史手术单的行号也要按符号重新定位。

## 5. OpenUI 真实链路、状态与限制

五种对象严格分开：`SceneSnapshot/SceneRef`是版本化事实；`PresentationView`是本次准入引用与呈现；interactive program是有限组件/纯表达式/局部输入；semantic selection是当前指向；preparation是实际准备及展示记录。相互不签发权限或业务完成。

当前链路由本次源码阅读确认：

1. `runtime/coordinator.ts`的 `present_view`经 `createInteractiveProgramPresentation`进入`runtime/interactive-program.ts`。宿主核当前主助手、原消息、来源、受众、前版修订、bindings与SourceSlot，然后编译有限DSL。支持当前原作的受控局部续改；不是任意 React 或脚本运行。
2. `InteractiveProgramView.tsx`用真实 `@openuidev/react-lang` Renderer及共享 `interactive-library.ts`，`toolProvider={null}`。组件不直接获得文件读取、网络、凭据或业务工具。
3. `interactive-context.tsx`以 `checkedProgramPatch`核局部输入；用户动作可接管旧运动。View保留最新输入、手动字段和程序身份；隐私/来源边界切换后旧view/doc不得复活。
4. `program-local-state.ts`合并保存约120ms，经`preload.ts` → main IPC → `NativeProgramLocalState`，按session/message/program revision/hash、privacy epoch、policy revision、expected state revision读写同一消息的`localState`。冲突保留“眼前变化未覆盖过去”的事实，不静默自称保存。
5. Continue/节点追问/发送沿App携最新inputs及原program/node引用回原对话。发送前读取当前输入，而不是一直用点击时的过期副本。下一轮由原宿主再核来源和程序。

局部交互不每帧调模型，也不直接写日历/笔记。声音必须由真实用户动作启动，活动播放/按住/时钟和动效恢复有各自瞬时状态规则，不因重开自动发声。会话仅临时保留时局部状态也不借持久化绕过。模型“会生成一个组件”的证据，不等于它对所有自然问题都自主选得合适；要通过普通对话→真实操作→原对象回流→继续理解证明体验。

历史有限实测是10月23日 Luna 生成二次曲线，a由1拖到1.65，y(2)由4变6.6，宿主保存、切页恢复、续问读到当前值；记录中也有模型参数失败后自修与标签裁切。这证明当时一条闭环，不证明钢琴、全部科学模型、所有取消/撤权/重开状态已通过，更不代替当前集成实机。本交接未重跑。

## 6. 学习、资料、笔记、日程的真实 owner

### 6.1 书签与同题学习

`SourceBookmarkTray.tsx`只保用户手里的一张来源地址和预览，不是业务store。拖出传`sourceBookmarkAddress`，pending-file bearer票据不放进可被其他应用接收的payload。预览由原owner重读；目标可为聊天、笔记、已注册Study。选择目标先预览，收下才调用对应提交；Esc/放回关闭，边界变化或晚到结果不抢新焦点。

`NativeSourceBookmarkService.preview`分别调用Material原读、Notes quote或conversation当前证据owner。conversation按消息、版本、SHA与Unicode范围核原话，引用不冒充用户再次说出/再次赞同。`keep`重新核源后创建带引用的笔记；现有笔记正文和编辑草稿不被覆盖。

`NativeStudyService.previewBookmark`先回读当前Study并核`expectedRevision`，只允许属于同一道原题/同原材料页、原句范围或原笔记版本范围的书签；有crop时还核范围。另一题应先留对话，不偷偷更换原problem。`acceptBookmark`再核边界、沿`studyCompanion.keepBookmark`写同owner，移除书签同样核原版本。它不是任意步骤插入、手写或无界“任何资料拖到任何Study”的实现。

`StudySceneView`仍将原题、learnerAttempt、help、历史与公开提示深度分开；small_hint有接过、稍后、放下等当前选择，打开前重新回读同帮助对象，避免题变后泄露旧提示。书签、辅助便签与角色动作不能推断“读过即掌握”。

### 6.2 资料与 PDF

MaterialService保原资源、SHA、页码/文本范围、pending/saved身份、保留与来源绑定，原文/图片/文字层分别看实际结果。`nativeReadPage/nativeQuote/nativeBookmarkQuote/nativeMoveNote`均沿原owner；异步读取后再核来源边界。正文预览、检索命中、读图描述均不冒充原文已读。

PDF图像与透明选择层共享宿主页坐标。笔记移锚带`noteId + expectedRevision + from/to`，两端原文均回读，NotesService保存同笔记的新修订并保撤回语义。不能以它宣称已经具备任意手写、任意批注和跨平台全链。

Windows原生PDF→文字层→选择→移锚→保存→正常重开需要Windows实证。旧Linux隔离实例与合成页的观察范围不能替代；本轮交接没有完成该复核。

### 6.3 笔记

NotesService独占完整文档、draft、quoteIdentity、版本、历史、回收/状态与undo。当前来源引用与用户笔记原文各自保留，不把摘录复制为失去来源的新个人断言。`expectedRevision`冲突不得吞草稿、静默覆盖或拿旧正文绕来源退出。恢复历史应生成可追踪的新修订，不抹去更新的用户工作。

### 6.4 日程

`NativeAgendaService.day/preview`读原日历，preview依原record/occurrence、修订、时区投影更改并核当前课表和完整占用。时间轴已有ghost、吸附、碰撞和试放语义；实际保存/撤回仍回原Action/日历owner，不由renderer本地变色决定成功。

准备、工作、收尾、转场、休息和保护占用都须保留；本人选择的时间窗之外不自动算空闲，未知结束仍未知。固定课程与个人可改项分别对待。群组重排若只逐项成功，不能称整组原子完成；日历保存、外部执行、通知提交、用户已读和实际完成也不是同一结果。试放后讨论可携原安排回同输入，返回时不得丢同一草案。

## 7. 直接操纵、草稿、焦点和恢复的验收原则

所有受影响动作都有接收、试放、确认、取消、失败与恢复；预览零正式业务写入，确认/保存才向原owner提交。指针按下接管旧动画，沿当前位置与可用速度继续；拖动中直接跟手，合法释放后再归位；反向、Esc、失焦、离屏、对象更换与旧异步回执各自有确定终态。键盘和点击须有同等入口，减少动态不改变业务结果。

现有 `useSpringValue`用有限时间积分保数值/速度，`stop()`返回当前状态；`useSplitMotion`有PointerCapture、Esc、Enter、方向/Home/End、取消不写比例、确认后持久化与窗口失焦清理。角色Stage有合法座面范围，缺完整轮廓/地面姿态时限制移动；它仍不是任意跨家具物理系统。新代码是否触及所需状态、手感和全部distinct screens必须实操，不凭hook存在就宣布达标。

`workspace-return.ts`严格仅存地址与查看条件，不放正文、草稿、副作用回执或权限；App按原session/Material/Study/Notes/Agenda owner回读后才恢复页码、选段、滚动锚和焦点。恢复书签的放下不会删业务对象，也不会生成进度债。`focus-session.ts`只是本人主动开启的本机计时，不读取情绪、不写Study/Work、不请求模型；重开默认暂停而非追算关闭期间时长。

主代理最终应正常速度操作连续任务：原资料选段→托盘预览→同题Study→讨论当前一步→留下→回原页→正常重开；同日课程/个人安排→冲突试放→讨论→保存→撤回；原路线展开→手势接管→收回→继续问；同一composer在纸内/外移动仍保草稿、选区与IME。所到状态均应与原对象和版本相同，不能只验首页或点击按钮亮起。此处是接续验收准则，没有声称本轮已经操作。

## 8. 后续阶段的雄心，不是目前达成的功能

路线图Stage06/11要求通用OpenUI的科学、数学、乐理造物，钢琴按键→琴槌→琴弦→阻尼/延音、力度、声音和波形真实因果，不能用一只刺耳Oscillator按钮或静态SVG交差。Stage07要求独立真实跨端和手机/平板体验；当前用户追加的iOS先做、充分打磨后再转Android的顺序应沿总交接保留。Stage08–11要求全站图稿兑现、十角色多维同景、地图与日程沙盘、双纸/手写、故事/排练、来信/好奇心和全状态闭环。这些是后续目标，不因现有有限基础、模拟器可用或某张设计稿存在而获得完成状态。

第二阶段的校园/体艺/原生位置/运动深化可以并应修复其真实使用所必需的当前界面与同owner回流，但不能把全部后续视觉重做偷换为第二阶段已交付。体艺更不止订单/锻炼汇总：按总交接核19入口和各子模块的动态正文、学校能力、本人数据、权限与可写边界，追踪真实需要并形成更完整生活体验。MuMu和电脑端是能帮助观察官方流程的实际资源，不是给未读模块预填通过的替代物。

## 9. 来源、代码落点与阅读边界

关键文档：

- [产品契约](../../../PRODUCT_CONTRACT.md)、[动态界面契约](../../../CONVERSATION_SCENES.md)、[当前状态](../../../CURRENT_STATUS.md)、[第一阶段重新精读与实做](../../../evidence/2026-10-23-stage01.md)。
- [FRONTEND_DESIGN](../../../../FRONTEND_DESIGN.md)、[深度评鉴入口](../../../../前端视觉创新设计/2026-10-23-深度评鉴/README.md)、[全量图稿评鉴](../../../../前端视觉创新设计/2026-10-23-深度评鉴/全量图稿评鉴.md)、[逐页手术单](../../../../前端视觉创新设计/2026-10-23-深度评鉴/逐页手术单.md)、[代码链路审计](../../../../前端视觉创新设计/2026-10-23-深度评鉴/代码链路审计.md)、[视觉接力提示词](../../../../前端视觉创新设计/2026-10-23-深度评鉴/下一阶段深度优化与创新延拓提示词.md)。
- [前端技能](../../../../.agents/skills/zaichang-frontend-director/SKILL.md)与[灵魂/人物](../../../../.agents/skills/zaichang-frontend-director/references/01-soul-and-personas.md)、[视觉矩阵](../../../../.agents/skills/zaichang-frontend-director/references/02-visual-matrix-and-imagegen.md)、[空间对齐](../../../../.agents/skills/zaichang-frontend-director/references/03-spatial-craft-and-alignment.md)、[动效/OpenUI](../../../../.agents/skills/zaichang-frontend-director/references/04-motion-openui-and-direct-manipulation.md)、[架构/协同/验证](../../../../.agents/skills/zaichang-frontend-director/references/05-architecture-synergy-and-verification.md)。

当前重点代码入口：

| 链路 | 入口 |
| --- | --- |
| 主壳/唯一输入/恢复 | `src/renderer/App.tsx`、`Workspace.tsx`、`Navigation.tsx`、`ConversationComposerDock.tsx`、`workspace-return.ts`、`study-reading-position.ts` |
| Bridge/宿主 | `src/main/preload.ts`、`src/main/main.ts`、`src/shared/types.ts` |
| 图像注册/角色/外观/弹簧 | `src/renderer/companion.tsx`、`companion-scenes.tsx`、`appearance.ts`、`motion/use-spring.ts`、`motion/use-split-motion.ts`、`ReadingDivider.tsx`、`focus-session.ts` |
| 来源托盘/同题接收 | `src/shared/source-bookmark.ts`、`src/renderer/SourceBookmarkTray.tsx`、`presentation/StudySceneView.tsx`、`src/main/runtime/source-bookmark-native.ts`、`study-native.ts`、`study-companion.ts` |
| 资料/笔记 | `src/renderer/MaterialsPanel.tsx`、`MaterialPdfPage.tsx`、`NotesPanel.tsx`、`src/main/materials/service.ts`、`materials/pdf.ts`、`src/main/notes/service.ts` |
| 日程 | `src/renderer/AgendaDayTimeline.tsx`、`Workspace.tsx`、`presentation/PlanningComparison*.tsx`、`src/main/runtime/native-agenda.ts`、`src/main/actions/planning*.ts`、`calendar.ts` |
| OpenUI生成/回读 | `src/shared/interactive-{library,program,functions}.ts`、`src/main/runtime/interactive-program*.ts`、`coordinator.ts` |
| OpenUI渲染/回流 | `src/renderer/presentation/InteractiveProgramView.tsx`、`program-local-state.ts`、`interactive-{context,primitives,graphics,motion,press,audio}.tsx`、`src/main/runtime/interactive-program-local-state.ts` |

本专题实际阅读：完整前端技能与五份references、FRONTEND_DESIGN、深度评鉴README、手术单、代码链路审计、视觉接力提示词、产品契约、当前状态、CONVERSATION_SCENES与第一阶段实做报告；全量评鉴读取了总则、A/B/C全部实质优缺点/空间/功能/处方字段，结合D去重后的缺陷/动作/处方及X用途规则。没有逐条再次抄读每个重复哈希/来源别名或亲看306条对应原图。代码按上述核心链路全文或相关函数范围阅读，其他入口作定位，不宣称全仓逐行通读。

本专题没有读取两个用户聊天的全文；该工作由总交接专线完成，也没有浏览/发消息给另一前端开发聊天。没有读取账户、私人材料正文、业务数据库；没有重跑桌面、触摸、PDF、声音、Luna或现有检查，因此只交接代码理解与历史证据范围。下一主代理仍须亲读总交接的第一阶段完整材料并做当前实机，而不是用这份报告替代。
