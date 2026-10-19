# 对话场景与 OpenUI

2026-10-19 同步总览见[项目基线](PROJECT_BASELINE.md#openui动态呈现与地图怎样衔接)。工具取得事实、宿主核准Scene、固定OpenUI库呈现、选择回同一输入和实际动作分别有边界；本页描述接线，当前模型与画面证据统一归状态文档。

<a id="companion-experience"></a>
## 本轮：同一段交流里的共同页、陪学与来信

本批把画面放在原消息真正需要它的位置：说不清的事可以摊成一张共同商量纸，一道题只展开当前这一步，安排分支共看同一天，回顾则是一封可接着说话的信。入口仍是原聊天／准备架／输入框；用户不必先选择一组功能面板。[最新视觉要求](source-materials/2026-10-18/visual-fidelity-requirement-20261018.md)要求图稿与实际效果相同，并充分使用动效与既有OpenUI。下列定位源码与设计，实际渲染／交互观察和未运行的产品模型范围分开记在[第七批状态](CURRENT_STATUS.md#personal-memory-round7)。

[最新阶段要求](source-materials/2026-10-18/stage-close-and-luna-validation-20261019.md)明确把正常Luna对话中的原有日程、成绩、地图、笔记等动态领域也纳入收尾，并允许已接入校园账号的只读使用。当前停止创新外延，按实际失败修复；交付后暂停等用户回来，不将整份原动态方案或持续目标预先写成全部通过。

| 呈现 | 实际内容与接续 | 当前来源与动作边界 |
| --- | --- | --- |
| DiscussionScene | `present_view.discussion`从原frame／option组织原话条件、暂定解释、分歧和眼前小步；焦点继续属于同一事项 | 宿主编译有限Scene，选择只提供继续商量的引用；看过、点过或沿话题继续都不表示采用方案。 |
| 共做停点 | `CompanionSessionView`承接原`companion_session`，给上次起点、材料地址及自然续接 | 旧工作解释需要当前原话重评；材料标签不是文件页已读，暂放和回来不自动执行旧步骤。 |
| StudyScene | `present_view.study`从原陪学纸的真实异步读取编译当前题、本人尝试和这一步帮助；可要求一点提示、换例子或直接讲清楚 | 本人尝试与助手教学分开；当前意愿决定帮助深度。历史与缓存呈现保留原owner的读取地址，题目／页图／答案要重新沿受限读取恢复，旧引用不直接恢复教学正文或泄露后续答案。 |
| PlanningComparisonScene | `present_view.planningComparison`共用一条时间线和观看日期，对照实质不同的安排改法 | 真实PlanningScene预览沿同一planner和日历；移动原对象、未接受活动假设和未排部分分开。切换分支或选时段只接续商量，实际保存仍走原动作及planRef。 |
| 写给你的来信 | 原PreparationShelf中的`LetterMessage`让生活片段、改变与有条件的解释形成可读正文，来源按需展开 | 脚注通过`letter:source`回原材料；选一句只把真实选中文字带回原聊天。先收好与已送达不同，旧信回看不恢复托付、通知或事实许可。 |
| CuriosityScene | `CuriosityInvitationView`先给一件现在可体验的内容，再按原邀请继续；自由回答也能带同对象引用回原输入 | 公开依据来自实际投递的原文，创作保持创作；旧公开发现保留`curiosity_reference`回读地址，纯创作可作为只读作品留下。旧缓存不冒充新发现，点选不建目标／订阅。 |

陪学只有同一个落笔处。`ConversationComposerDock`让原App composer的同一HTMLElement host停靠当前纸内slot或回到底部，草稿、附件与IME仍属于正常输入；纸内不另放第二textarea或二次递交箭头。同一输入在纸／聊天间保稿、保选区、单次Demo发送后保留两行推导已有实际回执；新加的回纸运动仍待对应观察，不扩大成模型教学效果。

图稿先于对应组件：共同商量采用[连续手稿A](../assets/design/generated/2026-10-18-shared-discussion/manifest.json)，共做停点采用[原对话后的单一起点A](../assets/design/generated/2026-10-18-companion-session/manifest.json)，陪学采用[原题、本人手稿与当前边注](../assets/design/generated/2026-10-18-study-paper/manifest.json)，来信采用[正文为主的单一纸面](../assets/design/generated/2026-10-18-reflective-letter/manifest.json)，安排进一步采用[一条今天、两种改法](../assets/design/generated/2026-10-18-planning-comparison/manifest.json)，好奇采用[内容先行的小体验](../assets/design/generated/2026-10-18-curiosity-invitation/manifest.json)。好奇纸面从图像编辑得到无文字透明资产，已接`CuriosityInvitationView`，许可与派生见[纸面资产说明](../assets/design/generated/2026-10-18-curiosity-invitation/paper-asset.json)。图中的日期、活动、台词和装饰均为设计样例；组件使用原owner的真实数据，不把图稿作为用户记录或运行截图。构图、层次、留白和局部质感应进入实现；需要的图像元素沿可追溯资产提取，保留正文和交互的可访问结构。

交流节奏也沿原消息变化。`conversation-rhythm.ts`把主助手成功返回、且将继续工具调用的实质前段先显示出来，深调查后继续说；最终候选仍沿原收口，不显示子报告或内部推理。原输入区在调查中仍可写草稿；“补一句”经停止旧run后把新的原话送进正常对话，独立停止保留。没有新侧聊天，也没有要求用户先管理研究进度。输入、选择、材料和本条控制的连续操作尚未运行观察。

局部引用回同一输入。学习纸先让人读，常驻的“问这一题／问这一行／聊这一点”已移除；真实点到、选到或用键盘聚焦后，才在当前一处出现轻入口，回车也能沿原attempt／help／problem引用继续。安排点选沿真实block或option，共写选句沿当前field内的明确位置。原正文留在原纸面，输入框旁只给可取消的小引用，已有草稿不改，下一句可以完全改变意思。`RichText.sourceFocus`复用Markdown实际文本节点的原位置，纯文字则以整段DOM与原文相同为前提；不用重复引文猜位置。数学转换、跨field或其他无法证明的映射不伪造精确坐标。`ReadableFocus`与`LocalTextFocus`共用一次只呈现一处的轻动作，`FocusContextChip`统一输入提示，不在各处另造一套焦点面板；来源、本人报告、助手建议与虚构作品身份持续分开。新版Study已在同一隔离实例实际重走旧行点选、原稿与行标同屏、取消直接接写，以及键盘聚焦旁注／回车引用；原消息入口与当前owner修订混用的失败已修并按原触发复看，详情和实际图见[当前状态](CURRENT_STATUS.md#personal-memory-round7)。其他场景的持续选句标记、IME与模型理解仍各保留自己的证据范围。

表达排练沿同一消息展开：本人的试说与一种可能回应分别落在纸上，继续、换回应、停下或整理仍回同一输入，不出现第二聊天。图稿来自[表达排练设计](../assets/design/generated/2026-10-19-expression-rehearsal/manifest.json)，纸面与金枝使用实际透明资产，正文和动作保持真实组件。它演的是一种可能，不表示对方真的说过或事情已经发生；当前源码接线与后续实际渲染观察分别记录。

共写纸面已经有同一隔离Electron的首波观察：暖／夜色纸、已有自由草稿的选句引用、重开后的草稿保留和历史作品展开过渡均实际发生。纸边留白、首次题头落点与后来选定的夜色低亮处理仍在改后复看；精确图路径和范围见[本批状态](CURRENT_STATUS.md#personal-memory-round7)。作品选区沿原field地址继续，不从这条视觉记录推定主模型已理解或记得早期章节。

Discussion的当时稿不因普通事项修订或暂停而消失。历史场景保留当时版本与原来源，选择可带回当前事项继续商量；旧选中项说“当时选的”，暂停不突出催续动作。真正修复待核、来源撤回或不可读仍退出旧内容。source snapshot与当前投影的这次拆分是源码进展，改后正常续谈尚未观察；旧coWork停点缺证明时继续保守处理。

安排的同轴比较已有真实A／B切换和键盘试放，首版实际出现了机器条件句被追加到原稿的问题，root亲看后明确取消这条表达方式。当前试放只作typed条件：同一小引用里显示任务、可改时刻和完整原时长，原稿保持原字；日期、时区及预览身份仍归原Scene与宿主，不包装成本人说过的话。回退只取消试放条件，X另可去掉整个引用，没有新工具栏或自动发送。首波晚饭重复淡出及新条件编辑的实际过程仍待对应复看，不借旧图覆盖新连续／分段节奏、所有窄窗或采用链；具体记录见[当前状态](CURRENT_STATUS.md#personal-memory-round7)。

当前已有一条真实交互观察：同一隔离实例中，Discussion点选方案保留现有草稿，取消只去引用与强调，说明作者也亲看了引用和原稿同屏的当前截图。具体合成内容及本机截图路径见[第七批状态](CURRENT_STATUS.md#personal-memory-round7)，这条记录不扩展为所有选句、输入和模型理解通过。

第四批“今天”的校园一起看沿NativeCampusCalendar只读Bridge与既有AgendaView，不增加Scene种类或第二日历。课程/考试没有完成/删除动作，个人安排仍用原Action；“接着聊这一天”只回到对话提出日期请求，不伪造用户采纳校园事实或Scene选择。日历文件仍只导出自己已接受保存的安排，课表查看不会将课程写入agenda。按新目标本批未启动或验证界面，详见[第四批状态](CURRENT_STATUS.md#personal-memory-round4)。

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

消息内地图、天气与课程／课表／考试保留原组件分支，本批新增共同商量、陪学和安排比较的有限声明。阶段收尾还把日历直读、成绩／命名GPA和笔记原页接回同一有限Scene链，各分支的源码接入与实际运行证据分别记录；角色和资料仍归原所有者。

只想看已经记下的安排时，`look_up source=local`的实际结果给SceneRef，`present_view`展示`mode=agenda`的原时间带，不先造一份试排。成绩／GPA仍用CampusScene保留原值、实际口径、分母与覆盖，`campusDisplay`只在确有帮助时选择detail／table／trend；来源不支持的数值不补零。原笔记先经`manage_note operation=read`取得真实页，再用其`present.arguments`展开NoteScene；原文可选句回同一输入，选中不修改笔记或成为本人新事实。历史笔记保回读地址，原owner复核后才恢复正文。

已经发布的数据画面承载逐项内容，正文接结论、必要比较和真正影响答案的来源限制，不机械复印完整列表。实际工具的成功呈现回执与正文共同接受原完成检查；仅有目录或引用不证明画面已发布，更不代表用户已读、接受或动作成功。需要作品或明确要求可复制全文时，仍须交出真正内容。

## 从事实到画面

`src/shared/scenes.ts` 定义版本化事实快照。`MapScene` 保存旅程、每次停靠的独立身份、分别计算的有向路段与观看意图；`WeatherScene` 保存查询时刻、来源、时区和按日数据。缺失天气数值保留 `null`，界面显示未知。

`src/main/runtime/scenes.ts` 验证场景所属对话、资料权限、来源与精确版本。主模型通过 `map_route` 取得路线后可直接呈现地图，通过 `weather.lookup` 取得天气场景引用；`map_overview` 或唯一匹配的 `map_search` 也可建立浏览场景。`present_view` 决定继续呈现哪些已有结果、怎样组织及观看哪一处。宿主把经过验证的引用编译成有限的 OpenUI Lang：

```text
root = SceneStack([scene0, scene1], "stack")
scene0 = MapScene("<scene-id>@<revision>")
scene1 = WeatherScene("<scene-id>@<revision>")
```

`Message.scenes` 保存当时的事实；`Message.views` 保存组件库版本、引用与实际 DSL。`src/renderer/presentation/AssistantPresentation.tsx` 使用安装包的 `defineComponent`、`createLibrary` 和 `Renderer` 解析并渲染这些声明。组件只能读取该视图获准的精确快照。没有客户端 `toolProvider`、任意脚本、外部 URL 动作或能直接执行预约/日程的场景组件。实际日程建议、接受和撤销仍走消息中的既有行动界面、IPC 与主机核验。

处理步骤和工具画面可在消息运行时更新，场景在真实结果通过准入后接到同一条回复。本批允许前台主助手在继续工具前先发表已有根据的实质帮助；最终候选仍等原收口，未把全部协议正文改为逐token裸流。没有结果时不先造地图或天气占位事实。路线由既有`CampusMapAdapter`与共享`MapSurface`呈现，桌面独立地图、消息内地图与公开地图review不产生第二份地图实现。

`main/runtime/map-model-view.ts` 为模型提供道路摘要：保留地点与停靠身份、选中的入口、距离、条件与来源，并合并相邻同名且通行含义相同的道路边。完整几何与逐边记录保留在主机和地图快照中。读取的原始字节仍计入原有预算，模型 token 按真正回传的摘要计量；只有结果通过准入后才发布新地图，不以提高预算或丢掉未知条件换取成功。

## 校园结果的来源与继续交流

`CampusScene` 沿课程／课表／考试扩展到成绩与命名GPA等当前契约允许的有限资源；具体类型见 `src/shared/scenes.ts`，学业结果投影见 `campus-academic.ts`与`CampusAcademicView.tsx`。coordinator 从真实工具结果注册快照，保留本地导入或账号来源、来源版本与哈希、原始记录身份、时间、地点及查询覆盖。主机恢复时再次核对来源、scope、精确版本和权限；缺项保留为空，不从聊天文本猜测课表或成绩。`present_view` 可引用该 Scene，有限组件允许切换记录、展开来源及继续交流；源码扩展不证明真实账号和当前画面已验收。

`SemanticSelection.kind = record` 携带 `recordId` 与 Scene 精确版本；验证后实际记录进入下一轮上下文。它不批准日历写入。成绩与GPA的注册和恢复继续服从原校园owner、敏感来源与本轮用途；选择、历史快照或显示切换不新增私人资料读取许可。

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

陪伴窗景与头像属于页面外观，不是 `SceneSnapshot`。`CompanionProvider` 从桌面启动加载，`App`、导航与设置已接入 `CompanionScene`、`RestSpace` 和 `CompanionSettings`。当前对话含结构化画面时，后续一条普通文字回复不会把大人物重新压到内容上；陪伴偏好仍保留，头像与窗光继续存在。形象图片、光线、大小、位置及动态偏好留在本机渲染器存储，不进入角色模板或场景工具事实。

新导航的“聊天 / 今天 / 留下”、陪伴设置以及阅读布局正在同一工作树演进。已有源码路径不等于本轮重新走完全部新入口、图片导入/移除、休憩、窄窗、主题和动效；本轮学生闭环的实际地图、天气、笔记、人格与安排证据也不能自动覆盖后来加入的外观改动。当前挂载以 [App.tsx](../src/renderer/App.tsx)、[SettingsPanel.tsx](../src/renderer/SettingsPanel.tsx) 和 [main.tsx](../src/renderer/main.tsx) 为准。

六张内置陪伴 PNG 的来源与可分发审查仍见 [资产来源](ASSET_PROVENANCE.md)。自选图片只是在当前组件内本地处理的用户资料，图片被成功显示不证明许可、模型理解或主动观察能力。公开地图入口不导入这套陪伴界面。

## 新领域入口

天气和地图采用不同布局，共享身份、来源、时间、语义选择与行动边界。日历、成绩、预约、笔记、活动接入时依次补齐：

1. 在现有能力中读取真实结果，定义保留来源、时间、覆盖范围和缺失值的 `SceneSnapshot` 分支。
2. 在 `SceneService` 增加宿主快照创建及选择目标核验；不要让模型填写真正成绩、座位或回执。
3. 在组件库注册带 schema 和用途说明的组件，扩展 `SceneStack` 的允许项及宿主 DSL 编译。
4. 将明确选择接回 `SemanticSelection`，保留试算与已接受安排的区别。真实写入沿用已有权限、版本检查与结果回执。

不具备真实数据或执行能力的领域不注册空壳按钮。小时天气／空气现已注册 `EnvironmentScene`；实时空位、学校预约写入、手机定位、运动认证和跨设备同步分别需要自己的数据、权限与设备支持。

## 日节奏与小时环境：当前实现

`PlanningScene.daySummaries` 是宿主按本轮时区和真实自然日计算的可选投影，旧Scene可以没有它。逐日净工作、完整占用、空白与声明预算不由renderer另算。日期条只浏览同一Scene；点击时段仍提交精确scene/revision/blockId，再由宿主回读对象。

第二批新增`scheduleCoverage.mode=provided_windows`及宿主逐日eligibleWindows；日期和当前日显示真正安排窗，显式空域为“这一天先不安排”。分离窗口断开时间线，间隙不画成尚未安排；已有busy仍作背景，不将窗外算入本次空白或精力。旧horizon_only/缺字段保留原显示语义。左右/Home/End切日，焦点与横向可见性只在日期条内变化，不把聊天主滚动带走；点选仍只接着交流。

有限跨日时段在宿主投影按日分割，`originalRange`保留完整来源区间，`planRefs`仍引用完整采用单位。画面上的50／40分钟不是两个获准动作，不能将原110分钟占用改写成其中一片后提交。未知结束保留`end:null`及条件，不能为了按天排版发明结束时刻。自然日可能为23／25／26小时或被跳过；日账范围不齐时保留原完整时段，不静默删除未覆盖的日期。

`EnvironmentHours`保留天气和空气各自的小时／来源／制式；未知天气码使用虚线圆，不能暗示确定阴天。到`source.expiresAt`时以定时器切换为“先前查到的预报”，旧快照仍可作历史引用。小时／日期条仅在自身容器水平保持当前项可见，不抢聊天滚动或焦点；键盘可浏览并选择，用户输入草稿保持。

本批先生成并比较[两版日节奏图](../assets/design/generated/2026-10-18-personal-memory/daily-rhythm-manifest.json)，采用A的日期条＋单日展开，删去重复辅助文案；精确时间与业务数据来自宿主。实际Electron宽／窄、晨光／夜色、日期／小时点选、草稿保存重开、环境缺测与过期已观察。真实模型是否选对工具与参与时机、手机系统及长期效果仍是不同证据层，见[当前状态](CURRENT_STATUS.md#personal-memory-continuity)。

## 保留规划的继续试算

`planning.replan` 复用同一规划器和 `PlanningScene`，新增可选 `continuation`，绑定 `intentId/intentRevision/sourceBinding`和本次实际读取的`attemptBasis`。宿主只在采用证明 ready、来源覆盖满足且分钟为有限非负数时生成画面；证明未知或不可读不能把 `null` 转成零后呈现“尚未安排”。`allocatedMinutes` 表示当前可核且仍保留的已安排净工作，`scheduledMinutes` 表示本次新试算；两者均不等于实际完成，本次试算也不等于已接受。

SceneService 在读取、选择和恢复前重核 active 意图、同一修订及完全相同的当前来源绑定。模型可见结果、准备材料、历史消息 IPC 和导出对这种派生画面共用来源门；来源、修订或状态变化后，旧画面不能绕过限制。点选仍只提交精确 Scene 引用供交流；实际采用须核新短票据、完整 `planRef` 与原动作权限，不能复活重启前的票据或批准。

每份旧attempt仍核自己的精确来源与manifest摘要，不能只检查宽sourceId或新版父意图。相关正文也带同一provenance：来源停止后，准备、历史读取及导出不能仅移除Scene而继续返回派生计数；正常历史解释与当前可交互画面的时效要求分开。旧continuation缺必需proof时不可读，不补造当时证明。无归因字段的旧纯正文无法倒推全部来源，这一迁移限制保留在当前状态。

已有工作与休息由宿主按真实保存证据保留，新安排继续守原未来窗口、预算及完整准备／收尾／转场。新写下界可对齐到下一分钟，已存且仍在未来的秒级边界保留原范围，不裁成新事件或重复收费。画面不自行推断进度、重新计账或补造结束；旧 Scene 没有 `continuation` 时维持原协议。

本批后端整合检查后生成并查看[两版GPT Image](../assets/design/generated/2026-10-18-planning-continuity/manifest.json)，采用A连续时间线和轻量关系文字；B横向分组可能误分交错的新旧时段，未采用。`LifeSceneViews.tsx`沿现有时间带显示“接着上次的安排”“已在日历／这次续排”，保留原日期、真实日历背景和“尚未保存”；没有完成进度或新增批准入口。

负责人亲看1220×960、430×900与晨光／夜色，实际恢复原对话、切日、选取精确时段并保留已输入草稿，保存后reload／resume回读同一文字，End从22日切至23日。此为本批界面操作范围，不继承为动效、真实模型工具发现、长期质量或手机产品验收。后端最终审查修正及检查结果由[第三批状态](CURRENT_STATUS.md#personal-memory-round3)和[研究](research/PERSISTENT_PLANNING_INTENT_2026-10-18.md)分别记录。

日期／小时条在尺寸变化时优先保留其中正在操作的键盘焦点，否则显示当前选项，不改变聊天滚动或焦点。当前构建实际重查了End后尚未确认便缩窄窗口的小时选择，并核对精确引用；预算依据也分别说明新增净工作上限和含准备、休息的完整占用。

## 源码与 API 核对依据

本次文档同步按当前本地源码核对；本批Electron操作范围见上节，没有新增模型调用或账号连接，也未重新核实下列远端文档的最新版。关键入口为：

- 数据与声明：[scenes.ts](../src/shared/scenes.ts)、[shared/presentation.ts](../src/shared/presentation.ts)、[Message 定义](../src/shared/types.ts)。
- 场景权限、保留与选择：[runtime/scenes.ts](../src/main/runtime/scenes.ts)；工具取得结果及 `present_view`：[runtime/coordinator.ts](../src/main/runtime/coordinator.ts)。
- 继续规划与采用证明：[planning-intents.ts](../src/main/runtime/planning-intents.ts)、[planning-intent-ledger.ts](../src/main/actions/planning-intent-ledger.ts)、[scene-projections.ts](../src/main/runtime/scene-projections.ts)；历史与导出来源门：[runtime/presentation.ts](../src/main/runtime/presentation.ts)。
- 准备、帮助引用与仍有效材料：[attention.ts](../src/main/runtime/attention.ts)、[runtime/presentation.ts](../src/main/runtime/presentation.ts)、[harness.ts](../src/main/harness.ts)。
- 实际场景渲染与生命周期：[AssistantPresentation.tsx](../src/renderer/presentation/AssistantPresentation.tsx)、[ConversationMap.tsx](../src/renderer/map/ConversationMap.tsx)、[App.tsx](../src/renderer/App.tsx)、[LifePanels.tsx](../src/renderer/LifePanels.tsx)。
- 天气字段与时间覆盖：[capabilities/weather.ts](../src/main/capabilities/weather.ts)；形象存储与设置：[companion.tsx](../src/renderer/companion.tsx)、[CompanionSettings.tsx](../src/renderer/CompanionSettings.tsx)。

OpenUI 阅读入口保留为：[自有聊天接入](https://www.openui.com/docs/build-agents/custom-chat-ui)、[组件与 schema](https://www.openui.com/docs/openui-lang/defining-components)、[Renderer](https://www.openui.com/docs/openui-lang/renderer)、[消息协议](https://www.openui.com/docs/openui-lang/message-protocol)、[增量编辑](https://www.openui.com/docs/openui-lang/incremental-editing)，以及 [Renderer 源码](https://github.com/thesysdev/openui/blob/main/packages/react-lang/src/Renderer.tsx) 和 [状态/动作源码](https://github.com/thesysdev/openui/blob/main/packages/react-lang/src/hooks/useOpenUIState.ts)。这些外链不是本轮重新核实远端最新版的声明；适配以项目锁定的 1.0.1 安装包与调用代码为准。界面关闭 OpenUI observability 发布。

`presentation/openui-development.ts` 在首次导入 runtime 前设置 1.0.1 开发入口使用的自动挂载 guard，使可选 Inspect 不自动出现在产品界面。这个受固定版本约束的适配升级时须重查；它不改 Renderer，渲染与数据错误仍由现有错误路径呈现。上游 [开发入口源码](https://github.com/thesysdev/openui/blob/main/packages/react-lang/src/devtoolsBootstrap.ts) 仅作为定位入口，不能替代已安装版本的实际核对。
