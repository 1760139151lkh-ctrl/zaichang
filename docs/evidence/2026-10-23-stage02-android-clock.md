# Stage 02 · Android 位置时钟与来源选择实核

2026-10-23，使用现有 MuMu 设备、保留数据升级的在场位置桥 0.1.3，以及正常 `MapLocationProvider → WorkoutSessionKernel` 入口。官方体艺的数据与登录均未改动。本页不包含坐标、设备安装身份或私人运动原文。

## 实际缺陷与修复

同一次真实读取中，MuMu 的 GPS 将 epoch 量级数值放入 Android `Location.getElapsedRealtimeNanos()`，network 则报告本次开机的 uptime。把两者直接当作同一单调时钟计算，会让运动 owner 拒绝本可读取的 GPS 点。Android 官方文档说明 elapsed realtime 应属于当前开机，能与 `SystemClock.elapsedRealtimeNanos()` 比较；它不应与 Unix epoch 混用。[Android Location](https://developer.android.com/reference/android/location/Location#getElapsedRealtimeNanos())

位置桥现在同时交付当前设备开机时钟。桌面保留每个点的原生报告为 `reportedElapsedRealtimeMs`，在 `clockQuality` 中区分落在开机范围、超出范围和无法核对；只有范围正常值才作为可计算的 `elapsedRealtimeMs`。没有猜偏移、修改原采集时刻、拆分 provider 的真实 boot 身份或放宽时间倒退检查。所有 GPS 与 network 回调仍进入同一个运动 owner，原始点和原拒绝原因都保留。

## 来源选择仍由唯一运动 owner 负责

先只修复时钟、连续读取约 57.315 秒：录制中快照实际包含 **76 个位置点**，GPS 接受 18 点、开始前缓存过期 1 点；network 接受 56 点、开始前缓存过期 1 点。采样修订为 77，另包含计步来源观察，不能把修订数当作位置点数。没有 `source-change`。GPS 约每三秒一次，network 约每秒一次。这个录制中快照证明时钟修复让 GPS 正常进入 owner，同时也暴露 network 速度仍会打断 GPS 低速证据；该轮停止情况依据独立的原生停止回读，不把录制中快照说成已结束状态。

随后由 `WorkoutSessionKernel` 在同一 Android 设备、开机与模拟来源内比较两源的最近合格观察。采集时刻与接收时刻均在本地十秒窗内时，按 Android 报告的水平精度半径选择更清楚的来源，相等时优先 GPS；这不是对真实定位准确率或 Android 回调频率的保证。较弱来源以 `provider-not-selected` 留在同一轨迹，原坐标、时刻、精度、速度和报告时钟均不改，不推进测量锚点、可信时长、距离、滤波或静止累计。手动开启期间的会话时钟仍正常经过。来源过期或失效时可以回到可用来源，切换重新建立基线，不把来源之间的偏移算作移动。

## 最终源码的正常入口实采

重新启动独立正常 Node 进程加载最终源码，通过正常运动入口运行同一 MuMu 来源：

- 约 24.864 秒后实际因 `stationary` 自动暂停；保留 34 个位置点、采样修订 35。GPS 接受 8 点、过期 1 点；network 接受 2 点、过期 1 点、未选 22 点。开始时尚无可用 GPS 的 network 观察保留，GPS 更清楚时再切换，没有为了得到暂停而改速度。
- 间隔八秒再次读取，运动时长仍为 24864.1132 毫秒，位置点仍为 34；原生已经停止，位置与计步订阅均为零，两个交接缓冲均为空。
- 显式继续后正常回到录制状态，又取得 21 个原始位置点；随后正常结束。结束状态为 `finished`，总计 55 个位置点、采样修订 57，实际开启时长约 41.076 秒。原生最终回读仍为 `stopped`、零订阅和空缓冲；桌面停止入口同时核对系统当前 location/sensor 连接。
- GPS 的异常 elapsed 报告仍在各原始点中保存；没有拿它与 network uptime 作差。模拟来源保持 `simulated`，学校提交保持 `not-submitted`、有效次数未知。正常 Node 进程退出码为 0。

`npm run check` 与 Android 原生编译、签名均通过。本轮没有修改系统定位权限、关闭 GPS 来源、制造精度反转记录或编写测试脚本，因此十秒后 GPS 自然缺失、真实手机室内精度反转与身体计步数值不属于这次实际观察。模拟设备的低速输入不证明本人静止、真实手机行走、真实跑步配速或学校有效打卡。

完整观察与停止回读留在本机私有诊断目录，不随公共源码同步。

这次短 API 采样工厂使用的原生 stream 身份与 Kernel 记录身份独立，零订阅回读证明该实际 stream 已停止；不将它写成 `NativeWorkoutService` 同一运动身份绑定的集成验收。正常产品中的同身份、最新来源选择与新增暂停文案仍须一起复核。
