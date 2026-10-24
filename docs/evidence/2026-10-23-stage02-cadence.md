# Stage 02：原生计步来源与窗口步频

本块依据当前用户要求和 Stage 02 的步频能力展开。独立体育项目的 `web/workout-core.js` 与 `docs/mobile-gps-port.md` 没有真实计步来源，不能把原桌面演示或 GPS 配速当作步频。

## 实现

- Android 位置桥 0.1.2 的 `StepReader` 使用实际 `TYPE_STEP_DETECTOR`，缺少时才使用 `TYPE_STEP_COUNTER`。有设备传感器时单独申请身体活动权限；拒绝不阻断已有位置权限。无传感器、权限拒绝、注册失败、等待事件和停止分别保留。
- 原生保留计数原值、事件单调时钟、来源、设备/开机/订阅身份、传感器名称/厂商/版本与模拟属性。仅保留最近 64 条交接事件；由同一次显式运动、租期和停止机制管理，不建第二份运动库。
- 桌面 `WorkoutLocationStream.start` 的可选第三回调独立交付计步观察，不依附 GPS 点。`WorkoutCadenceEstimator` 在最近 30 秒的真实计数变化中推导窗口步频，至少需要 4 秒与 3 步；超过 15 秒没有新事件即为未知。计数回退、订阅/设备/开机变化、长间隔与异常跳变都重新开窗，不跨间隙补步。
- `WorkoutSessionKernel` 保存最近一条原始计步观察到同一加密草稿，在读取时检查新鲜度。暂停、结束、恢复新订阅与停止均将当前步频归为未知；GPS 精度差不抹去独立的真实计步观察。模拟来源始终保留。
- 原生停止注销位置和 sensor listener、清空两个缓冲；新协议桌面同时回读零订阅，并检查系统当前 location/sensor 连接中没有本桥。广播请求自身不代表停止成功。
- ADB 设备发现使用与原生桥一致的实际 build 属性和 MuMu 系统包证据标记模拟器，不凭外观像手机的 model 名称认定真机。

## 已观察

- Android 35 / JDK 17 正常 `python apps/location-bridge/android/build.py` 编译、打包、签名验证成功。
- `npm run check` 在本块 source 与当前集成处通过。
- 正常 `discoverLocationDevices()` 入口将当前 MuMu 的两个连接别名合为同一设备，且在开始采样前报告 `provenance: simulated`。
- 当前 MuMu 的正常 `dumpsys sensorservice` 列表没有 step detector 或 step counter。不能在这里宣称已测得真人步频；移动模拟位置也不会补出步频。
- 0.1.2 用正常 `adb install --no-incremental -r` 保留数据升级成功。正常 `createWorkoutLocationStream().start` 实际收到 12 次 GPS 回调及独立的计步观察：`status: unsupported`、`source: null`、`cumulativeSteps: null`、`provenance: simulated`。估算器接纳同一原生观察并给出 `stepsPerMinute: null`、`status: unsupported`，没有把缺传感器写成零步。
- 正常 `stop()` 完成，桌面入口确认停止成功；回读原生 `stopped`、位置订阅 0、sensor 订阅 0、GPS 交接缓冲 0、计步交接缓冲 0。入口同时完成系统当前 location/sensor 连接检查。模拟器保持运行，独立交互式 Node 会话正常退出。

本块没有新增测试文件、样例轨迹、测试 runner 或伪造计步记录。以上是当前设备缺计步 sensor 的真实路径，不能替代具备 sensor 的真机上的有数值步频和权限切换观察。

## 依据与限制

[Android Motion sensors](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion) 说明计步 detector 与 counter 的事件含义及身体活动权限；counter 可能比 detector 延迟。窗口步频是基于设备报告的派生值，不能表述为每秒精确测量。

[Android 前台服务类型](https://developer.android.com/develop/background-work/services/fgs/service-types#health) 要求匹配用途与权限。Android 14 起本桥仅在实际计步来源存在且身体活动权限已授予时启用 `health`，否则仅启用 `location`。真机计步准确率、锁屏/省电和实际跑动中的时效尚需有相应传感器的物理设备观察；本次模拟器缺 sensor 的事实不能替代这些证据。
