# 对话场景与 OpenUI

动态画面让一次真实查询更容易理解和继续操作，不是另外一套聊天、地图或行动引擎。对话继续使用原有消息列表、输入框、Hermes、模型传输与行动记录。`@openuidev/react-lang` 固定为 **1.0.1**；不使用 `react-ui` 的聊天外壳或默认皮肤。整体目标和设计证据口径见 [产品与体验契约](PRODUCT_CONTRACT.md)，实际验收范围见 [当前状态](CURRENT_STATUS.md)。

主模型决定何时需要地图、天气、比较或继续取证；宿主核对事实、来源、所属对话、版本和权限，再编译有限组件声明。使用者不必先说技能名称。普通拖动和选择不逐次交给模型，图片形象也不参与场景事实生成。

## 几类对象各负责什么

| 对象 | 保存什么 | 不代表什么 |
| --- | --- | --- |
| `SceneSnapshot` / `SceneRef` | 工具取得的事实快照，以及精确 `id + revision` | 仅有一个引用就允许跨对话或撤权后恢复资料 |
| `PresentationView` | 获准引用、组件库版本和实际 OpenUI DSL | 新的事实、任意前端程序或真实业务动作 |
| `SemanticSelection` / `VerifiedSelection` | 用户选择的地点、日期或有向路段及其来源版本 | 定位、到达、长期偏好、已接受安排或行动批准 |
| `PreparationView` | 仍有效的准备正文、来源、期限和可选场景快照 | 永久聊天副本、安排写入或通知已送达 |
| `Message.helpRefs` | 某条回复绑定的机会版本与帮助记录 `helpRecordId` | 正文和地图已经展示，或过期材料仍应继续出现 |

消息内地图、天气与课程／课表／考试是已接通的组件分支。笔记、安排、角色和资料阅读仍使用其既有界面与权限路径，不因为已经有 OpenUI 就宣称所有领域都实现了动态组件。

## 从事实到画面

`src/shared/scenes.ts` 定义版本化事实快照。`MapScene` 保存旅程、每次停靠的独立身份、分别计算的有向路段与观看意图；`WeatherScene` 保存查询时刻、来源、时区和按日数据。缺失天气数值保留 `null`，界面显示未知。

`src/main/runtime/scenes.ts` 验证场景所属对话、资料权限、来源与精确版本。主模型通过 `map_route` 取得路线后可直接呈现地图，通过 `weather.lookup` 取得天气场景引用；`map_overview` 或唯一匹配的 `map_search` 也可建立浏览场景。`present_view` 决定继续呈现哪些已有结果、怎样组织及观看哪一处。宿主把经过验证的引用编译成有限的 OpenUI Lang：

```text
root = SceneStack([scene0, scene1], "stack")
scene0 = MapScene("<scene-id>@<revision>")
scene1 = WeatherScene("<scene-id>@<revision>")
```

`Message.scenes` 保存当时的事实；`Message.views` 保存组件库版本、引用与实际 DSL。`src/renderer/presentation/AssistantPresentation.tsx` 使用安装包的 `defineComponent`、`createLibrary` 和 `Renderer` 解析并渲染这些声明。组件只能读取该视图获准的精确快照。没有客户端 `toolProvider`、任意脚本、外部 URL 动作或能直接执行预约/日程的场景组件。实际日程建议、接受和撤销仍走消息中的既有行动界面、IPC 与主机核验。

处理步骤和工具画面可以在消息仍运行时更新，场景在真实结果通过准入后接到同一条回复；当前 Hermes 主回复正文缓冲到完成并核查后呈现，不是逐 token 文字流。没有结果时不先造地图或天气占位事实。路线由既有 `CampusMapAdapter` 与共享 `MapSurface` 呈现，桌面独立地图、消息内地图与公开地图 review 不产生第二份地图实现。

`main/runtime/map-model-view.ts` 为模型提供道路摘要：保留地点与停靠身份、选中的入口、距离、条件与来源，并合并相邻同名且通行含义相同的道路边。完整几何与逐边记录保留在主机和地图快照中。读取的原始字节仍计入原有预算，模型 token 按真正回传的摘要计量；只有结果通过准入后才发布新地图，不以提高预算或丢掉未知条件换取成功。

## 校园结果的来源与继续交流

`CampusScene` 仅接入 `courses / schedule / exams`。coordinator 从真实工具结果注册快照，保留本地导入或账号来源、来源版本与哈希、原始记录身份、时间、地点及查询覆盖。主机恢复时再次核对来源、scope、精确版本和权限；缺项保留为空，不从聊天文本猜测课表。`present_view` 可引用该 Scene，有限 `CampusScene` 组件允许切换记录、展开来源及继续交流。

`SemanticSelection.kind = record` 携带 `recordId` 与 Scene 精确版本；验证后实际记录进入下一轮上下文。它不批准日历写入。成绩和 GPA 未注册为这种可恢复快照，原有临时用途授权仍走独立路径。

## 选择、观看与行动

地图拖动、缩放、聚焦、暂停以及天气日期的选择直接响应，不逐次调用模型。具有交流含义的选择使用 `SemanticSelection`，携带场景身份与版本、地点/日期/路段身份。App 在下一轮 `ChatInput.selection` 中提交；宿主重新验证后以 `currentSelection` 加入当前上下文。选择只是当下的引用或试算，不是到达、长期偏好或保存安排的授权。

天气能力允许杭州、紫金港公共参考位置或明确声明为公开参考的坐标与时区，覆盖该地点当地今天起七天。`WeatherScene` 保留地点、时区、日级结果、获取时间与覆盖信息，不代表设备定位。`WeatherDays` 的标题读取 `scene.location`，组件说明使用通用地点含义，不再把其他公开地点写成杭州。

天气代码按来源的 WMO 代码语义映射，保留冻雨、强阵雨、雷暴与冰雹等区别；未知代码不猜测。按日概率不推导小时天气、停雨时间或路线局地天气；桌面 `weather.lookup` 另可取得明确时间窗的小时资料，但该资料不改变此日级画面的含义。选择某日再说“那就那天下午”时，日期可以接续；具体起止时刻和本地安排仍须按原话、当前日程与行动权限核验。获取时间不是预报发布时间，缺测 `null` 也不是零降水。

一个地点可以在同一旅程中停靠两次，每次有独立 stop 身份；去程和返程分别计算，不能把反向路段当作已取得。道路距离、接入估计和已知停留分别保留，行走时间为有条件区间，不能保证门禁、楼内时间或准时抵达。

## 从安静准备到当前对话

`manage_attention` 保存限定来源、期限、规则与渠道的托付；来源必须足以支持未来承诺的结果，不只是首个 probe。真实变化或时间窗进入机会判断后，`decide_help` 可选择 `prepare / wait / ask / notify / none`。`prepare` 必须引用本次实际取得的材料、所给的有效外部证据或核验后的旧产物，目录、失败结果和用户的托付原话不能冒充已经查到的路线。

后台取得场景时使用 `preparationOnly`，读取本身不获得向用户展示或移动镜头的权利。`SceneService` 可在仍有效的准备产物中保留精确场景引用和快照；来源、对象版本、到期或停止条件变化后，旧准备不能自动恢复上屏。

前台主模型通过 `inspect_help` 查找和读取已有材料；不知道 ID 时先读有界目录。要把它放进当前交流，可用 `decide_help` 的 `reuseArtifact` 与 `presentInConversation`，绑定同一份材料及帮助记录。后台不能自行设置 `presentInConversation`。

具体数据链是：

1. `AttentionService.decide` 核对材料及实际观察中的 sceneRefs，生成 `conversationHelpRef`。
2. `RuntimeCoordinator` 将该精确引用记入当前 run；Harness 完成回复时写入 `Message.helpRefs`。
3. `PresentationService.preparations()` 投影仍有效的 `PreparationView`；`App` 只在机会 ID、修订和 `helpRecordId` 都匹配时把它接到该回复后的 `PreparationShelf`，并从当前独立资料区去掉同一引用。
4. 资料正文实际进入可视区域后，前端调用 `helpAction: displayed`；打开、收起、仅一次和停止关注另有现有操作。生成、绑定、展示、系统提交和打开不互相冒称。

当前 `PreparationShelf` 显示准备正文、来源、期限及继续/收起/跟进控件；即使 `PreparationView` 带有 `scenes`，它也没有直接调用 OpenUI 地图渲染器。真正把这些地图或天气画面接到回复中，还需前台 `present_view` 生成 `Message.scenes / views`。因此“保存了准备场景”“绑定了 helpRefs”和“地图已经在对话中绘制”是三个不同结果。

`helpRefs` 引用的是当前仍可用的准备材料；过期或撤销后，不要求历史回复继续展示旧正文。这与 `Message.scenes / views` 保存当时事实快照的历史策略不同。重复帮助判断和通知去重沿用同一机会与帮助记录，不新增一套场景通知账本。

## 消息更新、历史与地图资源

组件库在模块级创建，SceneStack 按场景稳定身份设置 React key，消息内容或处理进展更新不重建地图。事实版本可以更新，观看状态由共享地图 surface 按场景身份保留。内嵌与聚焦使用同一地图实例；离屏地图延迟挂载/释放，保留稳定占位，聚焦期间不因聊天位置离屏而卸载。

离屏时仍保留同一段地图标题、停靠顺序和解释的实际布局，仅释放绘图 surface，不用不同高度的通用占位替换整张场景。模型可用 `cameraIntent: 'explain'` 请求一次完整道路讲解；相机由同一 ownership 跟进实际完成/取消信号，界面中的讲解和预览控件只在引擎可用后开放。

历史消息中的场景呈现保存过的结果，不隐式刷新天气、改用最新课表或重播路线。重新采用旧结果时需要由宿主和原有能力核对受影响事实与当前许可；不能仅因旧消息有场景就绕过本轮只读当前资料的限制。OpenUI 内部 Query 缓存不作为事实档案；本接入也不靠 OpenUI action 数组编排相机。

镜头、展开与试看路段只在当前桌面窗口的内存中保留，不额外写入浏览器存储；临时会话不会因观看地图留下相机记录。历史与当前场景分开保存观看状态。内嵌到聚焦不重建地图，历史恢复可根据当时的事实快照重新建立可操作视图。模型明确观看请求有独立身份，普通数据或文字更新不会重复执行它；停止生成、新原话、手势和卸载都会取消旧镜头及预览工作。

手动浏览后，普通模型相机建议也不夺回视角。明确的当前用户观看请求使用 `present_view.viewRequestQuote` 绑定本轮逐字原话，由主机标记 `cameraUserRequested`；这不授权日程或外部行动。新的明确观看请求会打开此前收起的视图，具体地点优先于模糊的“终点”意图，旅程和定位不随观看改变。恢复已完成的历史消息只恢复事实与可操作视图，不补播旧相机请求。

总览和单地点浏览可由已有 `map_overview` 或唯一匹配的 `map_search` 取得引用，再由 `present_view` 呈现，不必先建立路线或事项。道路时间只按已记录道路作区间估计，接入、楼内与未提供停留另计。到达后的收起可引用用户本轮逐字陈述；路线游标没有到达证明的权限。

## 陪伴形象与当前前端演进

陪伴窗景与头像属于页面外观，不是 `SceneSnapshot`。`CompanionProvider` 从桌面启动加载；当前工作树的 `App`、导航与设置正接入 `CompanionScene`、`RestSpace` 和 `CompanionSettings`。形象图片、光线、大小、位置及动态偏好留在本机渲染器存储，不进入角色模板或场景工具事实。

新导航的“聊天 / 今天 / 留下”、陪伴设置以及阅读布局正在同一工作树演进。已有源码路径不等于本轮重新走完全部新入口、图片导入/移除、休憩、窄窗、主题和动效；本轮学生闭环的实际地图、天气、笔记、人格与安排证据也不能自动覆盖后来加入的外观改动。当前挂载以 [App.tsx](../src/renderer/App.tsx)、[SettingsPanel.tsx](../src/renderer/SettingsPanel.tsx) 和 [main.tsx](../src/renderer/main.tsx) 为准。

六张内置陪伴 PNG 的来源与可分发审查仍见 [资产来源](ASSET_PROVENANCE.md)。自选图片只是在当前组件内本地处理的用户资料，图片被成功显示不证明许可、模型理解或主动观察能力。公开地图入口不导入这套陪伴界面。

## 新领域入口

天气和地图采用不同布局，共享身份、来源、时间、语义选择与行动边界。日历、成绩、预约、笔记、活动接入时依次补齐：

1. 在现有能力中读取真实结果，定义保留来源、时间、覆盖范围和缺失值的 `SceneSnapshot` 分支。
2. 在 `SceneService` 增加宿主快照创建及选择目标核验；不要让模型填写真正成绩、座位或回执。
3. 在组件库注册带 schema 和用途说明的组件，扩展 `SceneStack` 的允许项及宿主 DSL 编译。
4. 将明确选择接回 `SemanticSelection`，保留试算与已接受安排的区别。真实写入沿用已有权限、版本检查与结果回执。

不具备真实数据或执行能力的领域暂不注册空壳按钮。小时天气资料已接桌面读取，其专用画面仍未注册；实时空位、学校预约写入、手机定位、运动认证和跨设备同步分别需要自己的数据、权限与设备支持。

## 源码与 API 核对依据

本次文档同步按当前本地源码核对，没有新增模型调用、账号连接、远端文档检查或前端实机验收。关键入口为：

- 数据与声明：[scenes.ts](../src/shared/scenes.ts)、[shared/presentation.ts](../src/shared/presentation.ts)、[Message 定义](../src/shared/types.ts)。
- 场景权限、保留与选择：[runtime/scenes.ts](../src/main/runtime/scenes.ts)；工具取得结果及 `present_view`：[runtime/coordinator.ts](../src/main/runtime/coordinator.ts)。
- 准备、帮助引用与仍有效材料：[attention.ts](../src/main/runtime/attention.ts)、[runtime/presentation.ts](../src/main/runtime/presentation.ts)、[harness.ts](../src/main/harness.ts)。
- 实际场景渲染与生命周期：[AssistantPresentation.tsx](../src/renderer/presentation/AssistantPresentation.tsx)、[ConversationMap.tsx](../src/renderer/map/ConversationMap.tsx)、[App.tsx](../src/renderer/App.tsx)、[LifePanels.tsx](../src/renderer/LifePanels.tsx)。
- 天气字段与时间覆盖：[capabilities/weather.ts](../src/main/capabilities/weather.ts)；形象存储与设置：[companion.tsx](../src/renderer/companion.tsx)、[CompanionSettings.tsx](../src/renderer/CompanionSettings.tsx)。

OpenUI 阅读入口保留为：[自有聊天接入](https://www.openui.com/docs/build-agents/custom-chat-ui)、[组件与 schema](https://www.openui.com/docs/openui-lang/defining-components)、[Renderer](https://www.openui.com/docs/openui-lang/renderer)、[消息协议](https://www.openui.com/docs/openui-lang/message-protocol)、[增量编辑](https://www.openui.com/docs/openui-lang/incremental-editing)，以及 [Renderer 源码](https://github.com/thesysdev/openui/blob/main/packages/react-lang/src/Renderer.tsx) 和 [状态/动作源码](https://github.com/thesysdev/openui/blob/main/packages/react-lang/src/hooks/useOpenUIState.ts)。这些外链不是本轮重新核实远端最新版的声明；适配以项目锁定的 1.0.1 安装包与调用代码为准。界面关闭 OpenUI observability 发布。

`presentation/openui-development.ts` 在首次导入 runtime 前设置 1.0.1 开发入口使用的自动挂载 guard，使可选 Inspect 不自动出现在产品界面。这个受固定版本约束的适配升级时须重查；它不改 Renderer，渲染与数据错误仍由现有错误路径呈现。上游 [开发入口源码](https://github.com/thesysdev/openui/blob/main/packages/react-lang/src/devtoolsBootstrap.ts) 仅作为定位入口，不能替代已安装版本的实际核对。
