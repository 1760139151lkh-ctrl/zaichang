# OpenUI、Scene 与 Luna 接线审查

2026-10-23，本轮为只读调查。没有修改产品、调用付费模型、更改生产默认、创建测试代码或读取校园账号。以下源码事实、历史观察与本轮运行结果分别记载。

## 本轮依据与验收含义

已读桌面《在场前端优化.md》全文、当前 AGENTS、PROJECT_NAVIGATION 的动态呈现入口、CONVERSATION_SCENES 的程序及 Scene 合同，以及 CURRENT_STATUS 和 HANDOFF 的对应证据。19 份 pasted-text 的 SHA-256 归为四组，已读四份不同原文；它们是任务材料，授权范围由本次直接请求及主代理分工决定。

用户要的是正常对话产生真正可操作的画面、操作带着同一对象回到宿主与对话。操作不应暗中改日历或自动发送；局部试想、普通交流与实际动作仍应按各自所有者完成。

## 现有链路：已在源码中落实

| 环节 | 实际入口与行为 |
| --- | --- |
| 主模型选择画面 | `src/main/runtime/coordinator.ts` 的 `present_view` 同时接受原 Scene 与 V2 program；`read_skill id=interactive-program` 的构作合同来自实际共享库。 |
| 通用交互 | `src/shared/interactive-library.ts` 有 Number、TextInput、SequenceInput、Choice、Toggle、Press、Button、Graphic、DragHandle、Curve、Motion 与 SourceSlot。没有按钢琴、波形或题目另开一套聊天引擎。 |
| 宿主编译 | `interactive-program.ts` → `interactive-program-compiler.ts` → 原生 OpenUI 解析和求值。有限 DSL、字段、展开量、函数与组件属性均检查；客户端不执行任意脚本或工具。 |
| 真实数据绑定 | `interactive-program-sources.ts` 只承认实际投递的 observationId 与字面路径。只读资料、源片段、用途、到期、父作品与原 Scene owner 逐项保留，不能用参数代替来源证明。 |
| 点击、文字与拖动 | `interactive-context.tsx` 的 patch 对完整 next `$ui` 核验。`interactive-primitives.tsx` 的控件和 `interactive-graphics.tsx` 的拖点均走此处，既更新原生状态，也产生同一程序精确节点引用。 |
| 同一输入框 | `InteractiveProgramView.tsx` 提交 message/program/revision/nodeId 和读取当前 inputs 的闭包；`App.tsx` 保留自由草稿，正式发送前再次读取完整最新值。局部操作只增加引用，不自动发送。 |
| 宿主回流 | preload 的 `send` → main 的严格 schema → Harness → `resolveProgramReference`。宿主从原消息回读同版本程序，重算同一 DSL 并定位真实生成节点；客户端只能提供地址与声明范围内的局部输入，不能提供派生答案或工具名。 |
| 状态保存 | `program-local-state.ts` 延迟 120ms 合并保存，经 Bridge → `NativeProgramLocalState`，按 session/message/program/revision/hash、隐私 epoch、policy revision 和 stateRevision CAS 保存到原 Message.views.localState。没有第二套事实表。 |
| 恢复与瞬时状态 | `restoredProgramState` 恢复原参数；transient 字段回安全初值。临时会话不落盘，Data 不存储为事实，旧数据未重新准入时只给可回读地址。保存冲突和失败有局部可恢复提示。 |
| 同作修订 | `interactive-program-edit.ts` 保留未改原声明，明确 null 才删除；已有字段继承本次正式输入，inputChanges 才显式重置。CAS 冲突不自动追最新版本。前端跨新修订尽量保留用户正在手调的同字段。 |
| 来源和取消 | `programSourcesReadable/currentProofReadable` 继续核来源、版本、限制和 Scene owner。边界改变后的旧 view 对象不能重新获准。Motion 在手动接管、失焦、离屏、不可见或禁用时停止；Press 失焦与取消释放。 |
| Scene 选择 | `SceneService.selection` 从同 session、sceneId、sceneRevision 回读真实地点、时段、记录等目标；规划试放仍是 typed 条件，不表示采用。SourceSlot 交回同一 Scene renderer 与选择入口。 |

本轮没有从这条静态链推定界面或 Luna 体验已通过。

## 当前缺口与实施取舍

1. **本轮合并后的真实模型闭环未核。** 历史文件有真实 Luna 通用程序和多轮同作修订，也有失败；2026-10-23 合并交接明确没有在合并后再跑完整模型与 UI。必须从当前整合版本正常进入对话、产生程序、改值、保稿、发送续问，再核宿主收到的值和实际 responseModel。
2. **SourceSlot 是可用能力，实际学习组合仍有未交付记录。** 旧若叶睦请求只给 study_reference 与 Markdown 下划线，不能算可编辑双栏。当前学习负责人已定位原 PDF 无文字层／原页选段／旁注编辑的直接缺口；应把真实原题 Scene 放入 SourceSlot，与真正 TextInput 等交互并置，沿原 study/note/material owner 回读，不用图稿文字替换原题。
3. **时间轴流转还不完整。** 日程负责人核明个人 Action 的拖动→确认→CAS→撤回链存在；今天的拖后冲突反馈、重复系列与同对象回聊仍需补。复用 expandAgenda、agendaSnapshot 和 SemanticSelection，保持原 Action ID；不把另一个 program 里的数字日期当已保存日历。
4. **构作复杂度应继续靠通用表达解决。** 旧波形多次 Each 展开超过 4096 节点，不能抬额度掩盖。当前 Curve 已把一条连续曲线计为一个几何节点，可让滑块、拖点、相位、参数曲线与讲解共享局部状态，适合原请求的学习推导。已有控件也可承接新关系，不应增加学科专页或话题路由。
5. **视觉与持续过程仍要当前整合实看。** SourceSlot 的最小宽度、图形坐标与窄屏、地图聚焦往返、同作发表时拖动接管、编辑器 IME、减少动态与声音启停，分别需要真实操作。源码中的保护不能替代这些观察；静态截图尤其不能证明动效和按住流程。

这一阶段未发现可以仅凭上述源码确定的来源绕过或任意客户端执行缺陷；不能把“尚未验收”包装成已定位运行 bug。

## Luna 当前环境：本轮实际只读结果

- Node `v24.18.0`，npm `11.16.0`。
- Codex CLI `0.163.0-alpha.11` 存在；`login status` 返回 `Logged in using ChatGPT`，没有读取或打印 token。
- OpenUI 安装包、`dist-electron/main.cjs`、Hermes sidecar 和 `.runtime/hermes-agent/.venv/Scripts/python.exe` 均存在；本轮调查时没有 Electron 在运行。
- 现有入口为 `npm run dev:luna:test` / `npm run start:luna:test`，由 `scripts/run-luna-test.mjs` 仅对启动进程设置 `ZAICHANG_MODEL_TRANSPORT=luna-app-server-test` 并移除 DeepSeek key 环境变量。
- `model-selection.ts` 只允许启动环境选代测传输；renderer 与已保存设置不能切换该传输。普通生产默认仍是 DeepSeek。
- `luna-provider.ts` 固定 `gpt-6-luna`，原请求 reasoning effort 为 max；App Server 临时传输关闭继承工具与 MCP，原 Hermes 仍拥有模型／工具循环。返回 `response.completed.model` 不等于指定型号时拒收，不凭配置名字宣布实际型号。

这些结果证明运行依赖与登录存在，**不证明当前真实 Luna 请求成功、账号有可用额度或上游接受本轮请求**。按主代理协调，本轮没有调用模型。

## 可复用的正常验证入口

由统一桌面操作者使用现有 `scripts/test-environment.mjs` 的 `isolatedEnvironment` 创建全新 `.test-data` 子目录，再经已有 Luna wrapper 启动 Electron。保持 `ZAICHANG_TEST=1`，使用合成生活资料；不要复用可能含真实校园内容的历史 profile，不调用 DeepSeek。

最短必要流程是：普通用户原话请求一件可探索内容 → 模型选择并发表原生 program → 用户改一个数值或拖点，同时保留自由草稿 → 普通发送“按现在这组继续” → 核同 program/revision/nodeId 与最新 inputs → 核真实回答采用相同条件；再对同作普通续改，核修订与用户手调承接。地图／学习／日程分别沿各真实 owner 补受影响流程，不能用纯 program 样例替代。

状态保存应正常关闭与重开同一隔离 profile 后回读；来源变化应在原 owner 中实际撤回或修订，检查旧 Data/SourceSlot 不恢复。所有模型实跑分别记录 Message 终态、views/scenes、tool 结果和 `modelUsage[].responseModel`，界面记录实际操作与有限截图；不编写新 runner、fixture 或断言集。

本轮直接执行了既有 `node --import tsx --test tests/harness/interactive-curve.test.ts`：4/4 通过，约 0.56 秒；只证明现有曲线解析、宿主编译与局部求值检查，没有模型或 UI 结论。另亲读旧 r27 的慢速、谐波、声音及减少动态原始观察；那些属于 2026-10-22 原版本，未升级为本轮验收。

## 本次变更与清理

只新增本审查文档。没有产品改动、构建、模型调用、推送、部署或清理；无清理文件可报告。

## 后续授权实施与真实 Luna（进行中）

上文为初次审查范围。随后主代理明确授权完成通用可发声作品的真实链路；以下是新阶段，未把作品发表当作全部功能通过。

独立合成 profile 为 `.test-data/openui-piano-luna-20261023-Y9nrWH/`，正常 wrapper 固定 `gpt-6-luna/max`，DeepSeek key 环境变量移除，没有校园账号或私人资料。最初加载的 main SHA 为 `7dd63279…`，renderer index SHA 为 `50f20996…`。正常关闭自己实例后已在同一 profile 重开，backend 为 `c8300032…`，renderer 复用现有项目 Vite 服务；未关闭其他实例或重启共享服务。

首轮真实发表同一个 V2 program r1（85 声明、1174 展开节点），终态 done；原始请求、完整回复、原 DSL 和截图仅保本机。括号、可空文字拼接和原生函数参数三次拒绝均保留，模型自行修到发表，没有预写程序或假 provider。

本代理亲看并实际操作后发现：

- 未击键、phase=0、四键均松开时，仅踩踏板就使平线变成波形，已保存实际图。
- 真实键盘按下约239ms时，phase仅0.03，音频已创建 Oscillator/Gain；原声明到phase0.48才对应击弦，音画起点不一致。
- 松键而踏板仍踩住，两个相隔32秒的 AudioContext 读取中，声音包络均停在0.011232；放踏板后归零。两键合奏另有两个独立正包络，制音能工作，但自然衰减不正确。
- 源码与实际图对应：琴键横梁颜色融入纸面，槌杆按位置插值而变长；机构与控件因原800px消息宽度及 row 子项缺伸缩而上下分离。

音频证据来自用户真实开启声音、按键、原生 WebAudio 图和实际增益读取；没有把它写成物理扬声器听感已通过。

第二轮正常同作续改已实际回读完整原稿，状态读取的 `stateOrigin=this_turn_admitted_ui_reference`，模型自然确认当前力度0.35。该轮最终因单次 Luna 请求的10分钟传输超时结束为 error，未发表新修订；失败项的输入／输出用量没有返回，不能猜算。它是产品内局部传输失败，没有据此替换当前 Codex 会话或另开 profile。

正常关闭重开已实核原 r1 的 localState 保留力度0.35，phase回0、踏板松开、声音关闭。初次只调用角色跟随helper而未选择实际形象，App按原mio形象恢复默认澪，故第二轮署名澪；这是本次操作路线偏差，未归为产品人格缺陷。重开后已从真实设置选择并采用祥子，persona source=user/revision=1，第三轮署名丰川祥子。

本轮通用源码修补：

1. `interactive-program.css` 让 row 中的 Paper 与已有图形、数字控件一样可伸缩；实际含多块并排 Paper 的作品复用既有工作页1160px上限，普通文字仍保800px阅读宽。重开已实见总宽1149、两块各567.5；此时另发现最新无view回复会使大人物重新压到旧作品，已把当前图和 App.hasScene 的真实触发交主壳负责人修复，尚未据此称最终布局通过。
2. 构作方法让诊断留给助手自己修稿，交流围绕可操作内容与发现；复杂作品先发表有意义的主体，再沿同作完成其余要求，未降低完整交付要求。
3. 原 `PresentationDeliveries` 漏掉无label/title的 Voice，且缺 Press 关联和 Motion.releaseBehavior。现向原同轮复核补真实配置，并明确配置不是用户操作、浏览器播放或设备听感。直接对本轮实际原程序调用产品 API 已读到4个Voice、4个Press及finish，未创建测试／fixture／runner。

`npm run check` 已通过。一次性产品编译副本 `.test-build/openui-presentation-delivery.cjs`（1,038,275B，约0.99MiB）已删除；这是逻辑大小，不作为已释放空间声明。当前仍在同一作品继续完成因果、几何、真实八度键位、正常／慢看与重开后实操，未完成项不能以旧r1 done或本节说明替代。

机构核对参考为 Yamaha 原厂的[击弦机与制音说明](https://www.yamaha.com/en/musical_instrument_guide/piano/mechanism/mechanism003.html)及[击弦、琴桥与音板](https://www.yamaha.com/en/musical_instrument_guide/piano/mechanism/mechanism002.html)；原图A／B作为构图输入，错误键位和机械关系不进入正确性依据。
