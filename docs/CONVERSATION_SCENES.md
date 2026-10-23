# 对话场景、OpenUI与跨模块交互

<a id="unified-scenes-20261023"></a>

本页维护当前动态界面契约，更新于2026-10-23。真实实现与证据范围见[当前状态](CURRENT_STATUS.md)，视觉规则见[FRONTEND_DESIGN](../FRONTEND_DESIGN.md)，下一步缺口见[逐页手术单](../前端视觉创新设计/2026-10-23-深度评鉴/逐页手术单.md)。旧阶段暂停/停止创新安排已失效；历史精确说明另存[场景档案](CONVERSATION_SCENES_HISTORY_20261023.md)。

动态界面属于同一段交流：真实结果从原回复展开，用户操作接回原对象和原输入，关闭后保留位置与草稿。`src/`是唯一实现，OpenUI使用锁定`@openuidev/react-lang 1.0.1`，不另用聊天外壳、默认皮肤或新地图替代在场。

## 五种对象不可混称

| 对象 | 职责 | 不因此表示 |
| --- | --- | --- |
| `SceneSnapshot/SceneRef` | 工具取得的版本化业务事实及`id+revision` | 已允许跨会话、撤权后继续读取，或图片里的假数值是真事实 |
| `PresentationView` | 当前准入引用、组件库版本和有限OpenUI DSL | 新事实、任意脚本、直接业务授权 |
| 通用interactive program | 同一消息下的有限组件、表达式、输入与受约束动作 | 任意React/网络代码、第二个业务Store或任意工具调用 |
| `SemanticSelection/VerifiedSelection`及focus引用 | 当前选中的地点/日期/路段/原文/步骤/节点与来源版本 | 到达、掌握、长期偏好、接受安排或执行批准 |
| `PreparationView/Message.helpRefs` | 当前仍有效准备材料与消息绑定的帮助记录 | 已绘制场景、已展示正文、通知已送达或永久合法副本 |

模型决定何时需要查资料、画地图、比较和继续调查，宿主核身份、来源、用途、对话归属、版本与权限。组件读取准入的精确快照，所有真实写入仍归原Action/Note/Study等owner。

## 从事实到原消息

`shared/scenes.ts`定义事实；`main/runtime/scenes.ts`核来源和精确版本。地图可从`map_route/map_overview/map_search`真实结果建立，天气/日历/校园/笔记等沿各自真实读取进入Scene。`present_view`引用已有结果并组织观看方式，宿主编译有限声明：

```text
root = SceneStack([scene0, scene1], "stack")
scene0 = MapScene("<scene-id>@<revision>")
scene1 = WeatherScene("<scene-id>@<revision>")
```

`Message.scenes`保当时事实，`Message.views`保组件库版本、引用和DSL；`renderer/presentation/AssistantPresentation.tsx`经真实`defineComponent/createLibrary/Renderer`渲染。没有结果时不先造事实占位。公开正文可在同一主助手消息边做边流动；子调查日志与内部推理不经此出口。

组件库模块级创建，场景key使用稳定身份；消息文字更新不能反复销毁地图/学习纸。历史场景保存当时结果，不隐式刷新天气、换最新课表或重播镜头；重新采用需核当前来源。旧笔记/题目/章节恢复经原owner回读，不靠缓存副本绕门。

## 通用OpenUI程序已经有真实回流

<a id="explorable-mechanisms-20261021"></a>

主助手可通过`present_view.program`组合共享库的文本、布局、图形、几何、局部输入、滑块、拖点、按压、合成声音和有限动效。宿主只接受有限语法、纯函数与合格引用；客户端不执行任意脚本、网络请求或业务工具。`SourceSlot`只展开本次准入的原业务Scene，保原选择和来源。

当前实际链路为：

1. `runtime/coordinator.ts → createInteractiveProgramPresentation`核当前主助手、回复、来源及原作品修订，形成同一消息中的program。
2. `interactive-context.tsx`的checked patch验证局部输入；`InteractiveProgramView.tsx`保留当前inputs，不用截图假装滑块/拖点。
3. `program-local-state.ts → preload/main IPC → NativeProgramLocalState`按program身份与expected revision做SQLite CAS；写入失败/冲突不能静默宣称已保存。
4. 点当前节点、选择继续或发送时，App携带message/program/revision及最新inputs回同一聊天；主模型下一轮可读到当前状态与来源。

因此已有“用户操作→宿主保存→原对象续聊”的真实实现。它不表示每帧都请求Luna，不自动改日历/笔记，也不证明所有请求都能自然自主生成合适作品。旧真实Luna样本覆盖地图、陪学纸和交互图形等有限范围；本轮是否重跑及结果以当前状态为准。

局部值可随同一消息恢复，按住、播放、发声和活动动画在重开时复位，避免自动响。声音须由用户动作启动，减少动态与取消继续有效。当前`interactive-motion.tsx`等使用有限WebAnimations/easing；不是全产品弹簧物理已完成的证明。

关键实现：`shared/interactive-library.ts`、`interactive-program.ts`、`main/runtime/interactive-program.ts`、`interactive-program-local-state.ts`、`renderer/presentation/InteractiveProgramView.tsx`与`interactive-{context,primitives,graphics,motion,press,audio}.tsx`。

## 跨模块同一对象契约

| 来源与动作 | 已有实现 | 仍需深化/不可误称 |
| --- | --- | --- |
| 材料/PDF选段→聊天 | Material quote保资源ID、页码、原文范围和修订，宿主重读后进入唯一composer | 直接落到任意Study推导行尚无drop闭环；不能用“已能拖到聊天”冒充 |
| PDF笔记移锚 | 原noteId与expected revision，从原页/原锚试移到候选锚，保存/撤回回Notes/Materials owner | Windows原生解析、文字层、移锚与跨进程恢复需独立实机证据 |
| 原题/学习双纸 | Study owner保题、尝试、帮助和公开深度，真实宽度拖动；同一composer可停靠纸内 | 不是任意PDF手写系统，不推断已掌握，不另造第二输入 |
| 今天活动试放 | AgendaDayTimeline真实拖动/吸附/ghost/碰撞，Workspace沿原id/revision准备修改，保存与撤回回原owner | 不自动移动硬课程，不把preview当commit或整组原子重排 |
| 地图展开/聚焦/收回 | ConversationMap复用同surface/相机，原地点/路线身份回输入，手势可中断 | 不是任意真实通行、GPS或到达证明，不用概念桥图替换地理 |
| 角色拖动 | 有限座面轨道、位置偏好、本机恢复与取消 | 不等于跨床/桌/沙发的任意物理贴合，固定hitPolygon也不等于逐姿态标定 |
| 笔记/准备→继续 | 真实owner/修订/来源引用接回原聊天，保草稿与当前focus | 不把引用文本拼成本人新话，不恢复已撤材料或通知权 |

新流转必须沿“稳定源身份与当前版本→明确目标owner→preview→提交/取消→结果回流→可恢复”实现。缺少字段时只补契约，不复制正文制造第二事实。sourceContext中的作品/模拟身份、当前本人原话和管理交流继续分开。

## 共同页、陪学与返回

<a id="companion-experience"></a>

| 画面 | 来源与继续 |
| --- | --- |
| Discussion | 原frame/option中的条件、分歧和下一小步；点选只继续商量，历史稿不因普通修订消失，当前失效仍守来源门 |
| Companion session | 同一共做停点、材料地址和回来起点；回到时重评旧解释，不自动执行旧步骤 |
| Study | 原题、本人尝试与助手帮助分开；一点提示、换例子、完整解释服从当前意愿，未公开答案不能随历史恢复泄露 |
| Planning comparison | 一条共同日期/时间线比较实质方案；试放保typed条件，不追加成“本人原话”，实际采用核原planRef与短票据 |
| Note/letter | 原笔记页或有来源的来信正文，选句回唯一输入；旧信不恢复托付/事实权，脚注经原来源打开 |
| Curiosity/rehearsal | 真实已准备的发现或明确虚构作品/可能回应；体验不变目标或订阅，排练不冒称对方真说过 |

`ConversationComposerDock`只移动原App composer的同一HTMLElement host，保草稿、附件、选区与IME；纸内不能另放第二textarea。局部焦点共用`ReadableFocus/LocalTextFocus/FocusContextChip`：平时让人读，实际点选/键盘聚焦后才给一处轻动作，不每行常驻一排“问/聊”。取消引用不改原稿，不自动发送。

回来源打开面板、笔记改版、材料撤回和异步读取要核原owner与当前边界，不能把旧读取晚到结果塞给新的焦点。返回回原消息/页码/滚动锚点；是否实际重开成功与源码接线分别记录。

## 地图、天气和日程的事实边界

MapScene保每次停靠的独立身份、有向路段、选中入口、距离来源与条件。相邻同名道路可在模型摘要中合并，完整几何与逐边记录仍在宿主；道路段时间不等于全程，接入/楼内/停留未知不补。重复经过同一点不合并两次stop，反向路段要分别算。

内嵌/聚焦使用同一地图实例，离屏释放绘图时保布局和观看状态；焦点地图不因原消息离屏卸载。手势、新原话、停止生成和卸载取消旧镜头。手动浏览后普通模型建议不夺回视角；新的明确观看请求绑定本轮逐字原话，仅授权观看。历史恢复不重播旧相机请求。无WebGL用同数据平面兼容路径，不假称三维。

Weather/Environment保地点、时区、来源、获取时间、小时或日聚合范围及缺测`null`。公开杭州/校园参考点不是设备定位；日概率不能推成几点停雨。固定offset日统计与IANA自然日可能不同，重复小时保offset消歧，过期快照显示为先前资料。天气和空气各自保标准/单位；查询时刻不是预报发布时间。

PlanningScene日账由宿主算，renderer不另造工作/留白账；所选安排窗和窗外分开，跨日块保originalRange及同一planRef，未知结束仍null。`continuation`引用原意图与采用proof，已在日历/新试算/已完成不能混称，恢复不复活旧批准。校园课表/考试和个人安排同页显示也仍归不同owner，学校事实不因点选写入Agenda。

## 准备材料到当前交流

`manage_attention`保托付范围和期限；`decide_help`的prepare必须引用真实取得材料或已核复用。后台`preparationOnly`不能自行上屏或动镜头。前台`inspect_help`读目录与精确材料，复用时用同一artifact/helpRecordId绑定当前run，Harness写`Message.helpRefs`。

`PresentationService.preparations()`投影仍有效版本，App只按机会/修订/helpRecordId匹配到原回复后的PreparationShelf；实际可见后报displayed，打开、收起、仅一次、停止另有操作。`PreparationShelf`有scenes字段不等于自动渲染地图；真正嵌入仍需前台`present_view`形成Message.scenes/views。生成、绑定、显示、通知提交、打开各自独立。

“接着聊这件事”带`PreparationFocusReference`回同composer，不拼正文伪造新原话；正文仍经inspect_help按当前来源/版本/时效回读。取消小引用保原稿，失效时不从缓存恢复，普通work刷新不偷偷替换为新版准备正文。

## 新场景与验证

新领域先复用真实能力定义带来源/时间/覆盖/缺失的snapshot，再在SceneService核身份和选择，注册schema/组件与宿主编译，最后将操作接回原语义引用或业务owner。没有真实数据/执行能力时，不注册可误认已完成的空壳按钮。

每个新页面/小界面先有GPT Image；文字、图表数值、日期、路线和动作实际由宿主提供。主代理按同视口实看并操作选择、拖拽、取消、保存、返回、冲突与恢复，分别记录类型/构建、机制、真实Luna、外部服务、桌面和Windows设备范围。完整审计见[当前状态](CURRENT_STATUS.md)与[代码审计](../前端视觉创新设计/2026-10-23-深度评鉴/代码链路审计.md)。

固定OpenUI开发适配`presentation/openui-development.ts`抑制1.0.1可选Inspect自动挂载；不改变Renderer或隐藏真实渲染错误，升级时按已安装包重新核对。上游链接和旧API研究不能替代当前锁定源码。
