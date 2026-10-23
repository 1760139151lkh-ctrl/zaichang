# 当前 Hermes、Luna 与 OpenUI 接线核查

2026-10-23。此页先记录本轮主代理分工下的只读调查，再记录后续明确授权的一处协议长度修复；未调用模型、启动桌面、读校园账号或创建测试。与已有 [OpenUI 审查](openui-audit.md) 配合使用，不把该页旧 UI 观察升级为当前整合验收。

## 本轮直接核过的事实

- 已读本次 goal-objective 原文、AGENTS、README、导航中动态呈现和模型传输入口、CONVERSATION_SCENES 对程序/Scene/来源/恢复的原文，以及 CURRENT_STATUS 中对应真实模型记录。旧暂停限制不覆盖本次直接请求。
- 当前工作树已有大量共享未提交修改，包括 `harness.ts`、`coordinator.ts`、`interactive-program-guidance.ts`、`presentation-delivery.ts`、Scene 和 renderer；这些与已有 openui-audit 中的后续实施相符。本轮保持原样。
- 实际 CLI 返回 `codex-cli 0.163.0-alpha.11`，`login status` 返回 `Logged in using ChatGPT`；Node 为 `v24.18.0`、npm 为 `11.16.0`。Hermes Python、sidecar、Electron 和 dist-electron 均存在。依赖和登录存在不证明新的真实请求必定成功。

## 数据与操作怎样贯通

| 环节 | 当前源码中的真实行为 |
| --- | --- |
| 主循环 | App → preload → main.send → Harness → `runtime/hermes.ts` → 锁定 Python `AIAgent`。模型与工具均回宿主；没有前端脚本执行器或第二套聊天。 |
| 模型构作 | `present_view.program` 接有限 DSL；共享库构作方法来自当前定义，宿主编译和求值后写原 `Message.views`。SourceSlot 只展开本次获准的原 Scene。 |
| 点击和拖动 | `interactive-primitives.tsx` 与 `interactive-graphics.tsx` 调 `InteractiveDocument.patch`；完整 next `$ui` 按声明核验，控件立即更新，并把原 message/program/revision/nodeId 引到同一 composer。 |
| 正式续问 | App.send 在发送前再取完整最新 inputs；main 严格解析；`resolveProgramReference` 回读原版本程序，宿主重算同一 DSL 并定位真实生成节点，投影给同一主助手。拖动不自动发送，也不签发业务写入授权。 |
| 局部保存 | `program-local-state.ts` 120ms 合并写入，Bridge → `NativeProgramLocalState`，逐 session/message/program/revision/hash、privacy epoch、policy revision 和 stateRevision CAS，保存原 view.localState。Store 流式正文保存保留较新的 localState。 |
| 恢复 | 非 transient 参数沿原版本恢复；按住、声音门和过程时钟回安全初值。App 关闭前 flush 同 owner 队列；恢复不取回旧授权、旧 Data 或运行中的动作。 |
| 中断与来源改变 | stop 取消原主/子任务，已发表合法内容和未完状态分开；来源边界改变后的旧 view 对象不能重新准入。Store 重开把原 running 消息标为 cancelled，不重新运行旧任务。 |

以上是代码和合同核查，本轮未进行 UI 操作，不能由此宣称动效、声音听感或所有状态通过。

## 确定的 Luna 续接缺陷

`src/main/luna-provider.ts` 接收完整响应后，按 `MODEL_WIRE_LIMITS.opaqueCharacters`（8,388,608 个 JS 字符串单元）核原始协议 items，再把同一 items 保存为带 `zaichang-luna:` 前缀的 reasoning_content。但 `decodeProtocol` 原先用独立硬编码 `530000` 拒绝后续输入。因此约 0.53M 至 8M 的完整合法响应会先被接纳，到下一次同链请求时再失败；失败来自本地传输契约不一致。

本轮只读打开已有独立合成 profile 的 SQLite，核得：

- 原首轮 assistant `384f0443-f41a-44db-9edf-ba852a6ac726` 实际 `done`，原 program `d500ec0b-5236-4b81-9da3-24ad366651d7` revision 1，localStateRevision 2；成功响应型号均有 `gpt-6-luna` 元数据。
- 第二轮 `36fb0e0a-9ed5-45bb-b359-ca11b742f323` 实际 `error`，最后 usage 记录 `request_timeout`；原步骤明确为 Luna 单请求超时，没有新作品修订。
- 第三轮 `e983c834-37da-49ae-908d-732c088b4dd1` 实际 `error`；前一 main 成功返回 49,404 outputTokens，后续失败 usage 为 `protocol_budget`，步骤原文为「Luna 协议状态超过本轮上限。」该文字精确来自上述 `decodeProtocol`，并非 8MiB 接收门、账号额度或 CLI 登录失败。

源码定位：`provider.ts:23`、`luna-provider.ts:191`、`luna-provider.ts:255`。可实施的最小修复是让编码/解码使用同一物理长度契约，前缀计数明确一致，保留原数组和 item 类型核验、来源/取消、上下文与单次请求边界；不靠关掉协议检查、重建会话或换模型掩盖失败。现有 tests 中未发现专门的 Luna provider 检查；本任务禁止新增测试，后续可直接调用现有 `lunaInput` 对真实协议或边界输入检查，并通过真实正常对话续接核结果，不写 harness/runner。

## 实施与验收入口

1. 先按主代理统一分工修复上述传输边界，再 `npm run check`；保留已有 openui-audit 的共享改动和作品。
2. 独立桌面操作者沿现有 `scripts/run-luna-test.mjs` / `npm run dev:luna:test` 或构建后的 `start:luna:test`。launch-only 环境选择 `luna-app-server-test`，生产默认不变；wrapper 移除 DeepSeek key。不要跑 DeepSeek。
3. 新增独立合成 profile 可复用 `scripts/test-environment.mjs` 的 `isolatedEnvironment`；既有钢琴 profile 是连续任务资料，若仍有操作者使用，先协调，不能另开并行作品冒充续接。
4. 正常原话产生一个 program → 实际改数值或拖点并保留自由草稿 → 普通发送续问 → 核宿主 currentInteractive 的同地址与最新 inputs、回复使用的实际条件及 responseModel。再实际同作续改、停止、正常关闭重开。不同 Scene 的真实 owner 流程各核，不用纯数值 program 代替日程/PDF/地图。
5. 最终记录 Message 终态、views/scenes、原工具回执和 `modelUsage[].responseModel` / `provider.observedResponseModels`；配置模型名称、静态构建和旧截图不代替本轮模型与 UI 结果。

## 后续授权修复与直接观察

主代理随后明确授权只修 `luna-provider.ts` 的上述长度不一致。现编码、解码共用 `LUNA_PROTOCOL_PREFIX`；接收时只序列化一次 items，按原 `opaqueCharacters` 核 JSON 载荷，解码时允许同一载荷加精确 14 单元前缀。原 item 类型核验、来源与取消、模型请求和上下文边界未改。

- `npm run check` 已通过。
- 直接调用产品 `lunaInput`，530,000 字符 encrypted_content 现实际返回同长内容，未再撞旧门。
- 同一产品 API 的短直接调用实际接收 JSON 长度恰为 8,388,608、外加 14 字符前缀的载荷；8,388,609 长度仍返回 `protocol_budget`。没有生成测试代码、fixture、断言或 runner。
- 直接以 tsx 执行现有 core 检查时，`.md` 导入缺 loader 而失败；改用仓库原 `npm test` 的现有编译/隔离入口后 **282/282 通过，69.641 秒**。没有修改现有测试，也不把局部入口错误归为会话失败。
- 按主代理协调没有发真实 Luna 请求；修后的正常模型续问与桌面交互仍由统一操作者完成。

本轮仅新增本说明并修改 `src/main/luna-provider.ts`。没有清理文件、模型调用、推送或部署。

## 统一桌面启动与钢琴原作诊断（后续分工）

主代理随后授权构建 main 并启动唯一隔离桌面，保留给主代理统一操作。本轮启动前没有 Electron 进程；原 Vite `127.0.0.1:5173` 已在监听，返回 HTTP 200，因此没有另起 dev 服务。

已只读核原 `.test-data/openui-piano-luna-20261023-Y9nrWH`：三条用户消息均为钢琴构作与实际问题修订请求，`hasKey=false`，没有 `deepseek-key.bin`、校园连接表或账号设置。启动沿已有 `scripts/run-luna-test.mjs`，明确 launch-only `ZAICHANG_DEV=1`、`ZAICHANG_TEST=1` 和原 profile 的绝对 `ZAICHANG_DATA_DIR`，移除校园 connector 环境；wrapper 按原机制移除 DeepSeek key。`ZAICHANG_TEST` 禁止原校园/地图私人配置的默认发现及后台主动启动；没有调用模型或操作界面。

`node scripts/build-electron.mjs` 成功，启动所用 `dist-electron/main.cjs` SHA-256 为 `ad174ab5d22fc6ff74f7a764eb74d1f6e825b5057c35db18412844946025d021`。启动时 Electron 主 PID 7040，renderer PID 56412，CDP `127.0.0.1:51536`；原 DevToolsActivePort 的旧 9451 已被本次真实端口替换。进程保留供统一操作，没有创建第二实例。

只读原 r1 DSL、共享库及 renderer 后，当前问题可以精确归因：

| 观察到的问题 | 原作与通用机制原因 | 同作可用修法 |
| --- | --- | --- |
| 没弹键，只踩踏板就有波 | `waveAmplitude = Choose(activeKeys || pedal, force, 0)`；phase 初始 0 时 `sin(8*x)` 已有非零位移。踏板被错误当作能量源。 | 用真实击弦事件/经过时间决定振幅，踏板只影响制音；未击弦振幅为零。 |
| 声音早于击弦 | Voice 只有 key gate，没有配置现成的 trigger；gate 上升沿立即 play。机构同 hitCount 启动固定 7000ms 的 Motion，phase 0.48 才进入击弦。 | 同一接触条件触发 Voice 与波形；正常/慢看用各自明确时标，避免把整件演奏永久放慢。Voice 已支持 trigger 布尔表达式或整数事件字段。 |
| 延音停在固定音量 | 原 settings `sustainLevel=.08`；宿主 ADSR 降到 `peak*.08` 后保持，pedal 只推迟 release。原实测 0.011232 平台与该配置一致。 | 钢琴式自然衰减使用现有 `sustainLevel=0` 与有限 decay；按住、延续和制音继续分开。不能为一种作品改掉全部通用持续音的契约。 |
| 琴槌杆伸长、传力不连贯 | 固定 pivot `(6.25,2.1)`，head 的 x/y 分别线性加 travel；端点距 pivot 随 phase 变化（force=1 时约 0.54→2.30）。keyBeam 完全静态，wippen 与 jack 也没有共用相接端点。 | 同一 pivot、恒长与角度求端点，连接部件复用同一接点；阶段区分驱动、脱开与自由回弹，不以缩短行程表达轻击而令其碰不到弦。 |
| 仅四枚等宽键 | r1 只定义 C4/D4/E4/G4 Press，未包含真实 C4–C5 白/黑键关系。 | 仍用通用 Press、Rect、Polygon 和频率声明，按真实音高与黑白键布局续改原程序。 |

这些是原稿与宿主机制的诊断；本轮没有替主代理作视觉/声音验收，也没有修改该原作、renderer 或其他共享 runtime。原语已经能表达主要修复；最终仍须真实同作构作、操作并核实际因果与恢复。
