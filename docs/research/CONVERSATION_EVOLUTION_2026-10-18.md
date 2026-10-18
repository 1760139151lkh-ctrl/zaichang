# 对话内时间、环境与生活接续

研究与实施日期：2026-10-18。仓库起点 `c7cff228`；本文以本轮实际源码检查为依据。完整读取用户提供的《在场-对话内地图与动态界面-Codex完整提示词-20261018.txt》，先核对后端，不把其中研究版本的缺口原样当成今天的缺口。未在后端阶段读取参考图片。

## 当前已经连通的部分

`shared/scenes.ts → runtime/scenes.ts → coordinator.ts → renderer/presentation/AssistantPresentation.tsx` 已是一条实际 OpenUI 1.0.1 链。地图复用原引擎和相机；地图、按日天气、校园记录有宿主快照、精确引用、来源范围、跨轮语义选择与历史保存。准备场景有 `preparationOnly` 屏障，取得后台结果不自动获得呈现权。`present_view` 只组合取得的快照，不执行任意脚本、预约或日历修改。

本轮检查发现最有价值的缺口是已有能力没有成为共同交流对象：`planning.preview/draft` 已会计算完整占用和保护留白，小时天气、空气也已有真实适配器，但用户只能从文字结果继续，无法点向“这段时间”“这个时刻”。因此不另造日程引擎、天气源或聊天系统，补已有事实的呈现与引用链。

## OpenUI 的源码核查

2026-10-18 经 GitHub API 查询，`thesysdev/openui` 的 main 为 `8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5`，与提供的研究材料一致。读取了以下实际文件，不仅阅读 README：

| 源码 | 观察 | 本项目取舍 |
| --- | --- | --- |
| [useOpenUIState.ts](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/packages/react-lang/src/hooks/useOpenUIState.ts) | `blocked = isStreaming || !bundle.complete || !!bundle.error`；Query effect 在 blocked 时不提交。ActionPlan 等待 Mutation，但 `custom_action` 只是调用 handler。 | 已有工具先取得事实，宿主输出有限引用；不让 token 流承担事实查询，也不以自定义动作数组当相机时间线。 |
| [Renderer.tsx](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/packages/react-lang/src/Renderer.tsx) | 一般数组 `renderDeep` 使用 index key；初始状态通过 `initialState` 接入；工具 provider 是可选能力。 | 保留已有 SceneStack 的场景稳定 key；不把可选 toolProvider 接成第二条浏览器执行通道。 |
| [queryManager.ts](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/packages/lang-core/src/runtime/queryManager.ts) | 查询缓存按 tool、args、deps；加载时可能返回 prevCacheKey 或 defaults；销毁会清计时器，Mutation 用 generation 排除迟到结果。 | 查询缓存不能替代事实存档，默认值不能当当前天气。事实快照、来源与取消沿用主机机制；新 Scene 不自行发网络请求。 |
| [package.json](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/packages/react-lang/package.json) | React Lang 版本 1.0.1，MIT；不要求采用整套聊天外壳。 | 沿用仓库安装版本与既有组件，不迁移 Hermes 或模型传输。 |

这些是代码结构与接口核实，不是宣称在本项目复现了所有上游边界故障。

## 本轮新增的后端

### 一段属于自己的时间

`PlanningScene` 从 `planning.preview` / `planning.draft` 的真实输出投影。它保留核查窗口、时区、忙碌、工作、准备、收尾、转场与休息、用户保护的留白和计算余量。预览的可用分钟与墙上时长分开；未知结束不被改成精确结束。没有排进去的事情、条件和来源覆盖仍保留。

时间带的目的不是把下午填满。“这段别安排”在机制里是一条真实保护约束，画面也能明确地留出来。点工作块得到 `time_block` 语义引用；若它对应宿主已创建的采用票据，同时保留原 `planId/blockId`。引用不携带浏览器自由拼出的动作参数，不创建任何日历项。后续采用仍用原行动链核验完整占用、顺序、权限、来源版本和票据期限。旧场景只是历史计算，不能恢复重启或过期的票据。

场景除了 `local-agenda` 本身，还保留生成它实际依赖的外部来源 ID。恢复时重新检查这些来源是否仍在本轮范围内，并核对校园、天气、地图对应权限，避免把外部私人资料包装成本地日历后逃过范围检查。

### 出门前看见一个具体时刻

`EnvironmentScene` 只使用现有天气/空气适配器的有效输出，按能力分别生成场景，保留原地点、时区、取回时间、覆盖和未知。气温/天气代码对应时刻，降水量与降水概率对应明确的前一小时；不把这两种量画成同一个无差别“该小时状态”。空气保留 PM2.5、PM10、US AQI 和 European AQI，不混成中国官方 AQI，不从数值生成个人适宜运动或现场开放结论。

日级天气仍有自己的 `WeatherScene`。查询小时天气时，工具的 `sceneRef` 指向小时画面，`dailySceneRef` 指向同次读取的日级概览；模型选择合适尺度。空气与天气不能因时间相近就擅自合成，必要时通过原 `compare` 布局并列，来源和时间各自保留。点小时样本生成 `environment_sample` 引用，下一句可以明确指向它，但不授权排程、不表示用户在那里。

## Brainstorm 与下一步取舍

| 想法 | 真正新增的生活价值 | 现有接入点与尚缺条件 |
| --- | --- | --- |
| 时间带与留白（本轮后端已接） | 比较“能安稳坐下多久”，也能认真保留不被安排的一段时间 | 现有 planning、精确场景引用；后续呈现需 ImageGen 先行 |
| 小时出行窗（本轮后端已接） | 把“今晚出去吗”落到有来源的具体时刻，允许继续商量 | 现有 weather/air；没有分钟级停雨、现场传感器或身体状态判断 |
| 两种下午 | 比较“从容一点”和“多去一站”真实差异，允许回到刚才的方案 | 已有多个 PlanningScene + MapScene；未来跨场景选中联动须额外核验同一旅程身份 |
| 回到上次卡住的地方 | 学习开始前自然接回用户原笔记或上次没看完的材料，减少重新寻找 | Notes/materials/evidence 已有；需要独立笔记快照与原文范围，不把回看等同于掌握 |
| 到了之后的小准备 | 有可信到达原话后收起路线，接上书单、预约信息或下一步 | 现有到达报告、attention、notes；不能以路线预览终点触发 |
| 一句轻量好消息 | 用户牵挂的事项有真实变化时，用最短解释交代为何值得高兴 | attention/change feed；需要来源和用户关切依据，避免无根据夸奖与硬塞庆祝 |
| 低精力时保全重要的事 | 用户明确说累时，在真正截止和已接受承诺之间给出更轻的方案 | planning 的条件、effort 与保护窗口；当天状态不固化成长期人格 |
| 一次旅程的接力 | 电脑上选定的旅程在未来手机上继续当前一站 | 现有稳定 journey/stop/scene 身份；仍需真实跨设备同步与新鲜定位，不提供假同步按钮 |
| 有边界的偶遇 | 路过图书馆时遇见之前想看的书，而不是多一项任务 | 条件意图、notes 与可信位置；设备观察、出门授权、抑制重复仍需真实接入 |
| 无任务探索 | 随便看校园、聊一处建筑，助手有内容但不把它升级成日程 | 现有 browse/map.search；新增内容须来自真实资料，不虚构安静、空位或营业状态 |

## 验证口径

新增 `tests/harness/conversation-evolution.test.ts` 检查准备/收尾/留白保真、未知结束及来源依赖、天气前一小时语义与缺测、空气制式、精确版本选择和撤权、coordinator 到真实 PlanningScene 的接线及 planRef 保留。与既有校园场景测试共同运行；测试使用独立合成数据，没有访问本人账号或伪装生产结果。类型检查与定向机制测试通过只说明后端连接成立，前端渲染和实际模型自主选择须分别观察。

实现位置：`src/shared/scenes.ts`、`src/main/runtime/scene-projections.ts`、`src/main/runtime/scenes.ts`、`src/main/runtime/coordinator.ts`。地图地理数据、路网与相机引擎未改动。
