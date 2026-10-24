# Stage02：原生 iOS 位置流与本机模拟器

2026-10-23。只记录本轮当前源码和实际操作；本阶段总收尾由主代理独立验收。没有联系另一个用户前端会话，没有新建测试、fixture 或 runner，也没有上传学校运动数据。

## 实现与来源

已亲读 Stage02 主线、体艺阅读计划、原始生活融合 L267–356 与独立 sports 项目的 `mobile-gps-port.md`。旧项目的 `watchPosition` 平台声明与 Windows 演示路线不作为真实 iOS GPS；本次新增原生 `CoreLocation` 采样桥。

位置沿 `MapLocationProvider → createIosWorkoutLocationStream →` 本机正常 OpenSSH → 原生 App 私有控制消息与 CoreLocation 回调 → `WorkoutSessionKernel`。只有一个运动 owner；它继续负责轨迹、滤波、指标、保存和状态。模拟器坐标始终携带 `transport: ios-simulator`、`provenance: simulated`、`mock: true`，不因系统软件模拟标识的取值而转为真机来源。

- [ios-location.ts](../../src/main/ios-location.ts)：只列实际已启动的 iOS 模拟器，显式设备选择，本机连接与有界读写，原生消息逐点回流。
- [原生桥、独立构建及配置方法](../../apps/location-bridge/ios/README.md)：Swift 6、CoreLocation、正常系统权限；Python 标准库/OpenSSH/Xcode 构建，不依赖 Codex 的会话或技能安装路径。
- [原生 Image 图稿与本次 Prompt](../../前端视觉创新设计/精选图稿/B-微调复用/2026-10-23-ios-location-helper/README.md)：图稿先于最后一次小界面精修，实际以 SwiftUI 控件呈现，图稿不充当运行截图。

Apple 官方文档本轮已读取：负 [`speed`](https://developer.apple.com/documentation/corelocation/cllocation/speed) 表示未知；[`verticalAccuracy`](https://developer.apple.com/documentation/corelocation/cllocation/verticalaccuracy) 小于等于零时海拔也无效；[`altitude`](https://developer.apple.com/documentation/corelocation/cllocation/altitude) 为平均海平面基准。当前保留合法水平位置，将缺少的速度、航向与海拔转为 null，不把未知当静止或 WGS84 椭球高。

## 实际运行与发现的缺陷

本机现有虚拟 Mac 最初停在 OpenCore，SSH banner 因此不可用。通过正式 noVNC 选择原系统盘，用户本人解锁后，实际读到 macOS 15.8.1、x86_64、Xcode 26.3/17C529、Swift 6.2.4、iOS 26.2/23C54。没有重建 VM、替换模型会话、重装 SDK 或关闭安全保护。

原生 App 通过 Swift 6 编译、正常本地签名核验并安装到实际 iPhone 17 / iOS 26.2 Simulator。正式系统权限页允许本次位置，CoreLocation 实际返回坐标与5米精度，无速度/海拔时为未知。iPad Air 11-inch M3 类型的 iOS 26.2 Simulator 同样实际启动、安装、显示原生页并收到2个回调；这是设备类型与运行环境，不能推断真实 M3 性能或真机 GPS。

初版以 `simctl openurl` 发送控制，真实 iOS 26 会弹打开确认；已改为 App 私有 Documents 原子控制文件。开始仅正常 launch 原生 App，核对其当前进程回执；续租与停止不反复弹框或激活 App。旧进程遗留命令在重开时忽略，已停止的订阅标识保留短小墓碑，迟到开始不能重新开位置。

随后用系统 `simctl location start --speed=8 --interval=1` 的正常入口输入一段约1.33公里的明确模拟移动，没有造 GPX、固定路线 fixture 或回放 runner。首轮在真实 SSH 批量回调下发现配速偏快：135点约1070.85米，首公里约93.30秒；原始相邻测量间隔表明逐回调的主机单次时间上限漏掉了批内间隔。

运动 owner 已修为：连续好点共享本次实时累计的宿主时间预算，每条仍受测量间隔与剩余预算限制；超过15秒、坏点、换源和暂停仍先断段，不补缺测。用同一健康入口重开原生长流后，实际140点约1117.546米，首公里 **124.733秒**，当时实时配速 **124.693秒/公里**、平均 **124.725秒/公里**，与8米/秒约125秒/公里相符。记录中原始距离、派生滤波距离、可信时间和模拟来源各自保留；结束后停留的真实时间会使最终全程平均变慢，不能强行保持125。

## 停止、边界与留存

2026-10-23 本阶段最后的自动暂停补核继续使用同一健康代理会话、同一 VM 和实际采样链。正常 `simctl location start --speed=0.01 --interval=1` 得到21个连续合格 CoreLocation 点，原生速度0.01米/秒、精度5米；滤波计距0米，原始约0.2008米，可信区间约20030.6毫秒。唯一 owner 实际进入 `paused`、`pauseReason: stationary`，随后同身份原生回读为 `stopped`、零监听与零缓冲。有限 `projectWorkoutCurrent` 也正常保留暂停原因与停止状态，不含原始轨迹。

暂停期间继续改变系统模拟位置，实际点数仍为21，已计时间、可信时间与距离保持不变；没有自己重新开始。随后明确调用原 owner 的继续操作，重新开启同一运动的新订阅，接收1米/秒的真实 CoreLocation 流，状态为 recording，原暂停原因清空，计距继续增加。最后正常结束至110点、约88.355米；同身份原生停采回读再次为 stopped、零监听与零缓冲，普通 Node 进程退出，并通过系统 `simctl location clear` 清除本次模拟路线。

原生桥同时加上本机时钟的订阅起点，早于本次 `startUpdatingLocation` 的缓存位置在源头忽略，原始时间与坐标不改写。当前 Swift 源通过 Swift 6 编译、签名并覆盖安装两台已有模拟器。此次补核没有编写新脚本、测试或回放数据。

- 用另一运动身份尝试停止时，原生流明确拒绝，原运动仍继续收到点，不接管其他 owner。
- 正常结束运动后，核到同一身份 `stopped`、零位置监听、零原生缓冲；再用系统入口改变模拟坐标，原生回调序号没有继续增加。
- 按 Image 稿改成宽停止按钮后，实际在 iPhone 原生页点「停止位置」，在场 owner 随即进入暂停且读取停止；原生回读为 `stopped`、零监听、零缓冲。iPad 上也实际点过该按钮并正常收尾。
- 原生采样只保最近16点的私有缓冲，停止清空；电脑草稿由唯一运动 owner 决定当前窗口保留或系统安全存储加密。原始位置不发给模型，不进入长期记忆。
- 控制绑定运动身份、随机订阅标识、独立命令与短有效期；20秒租约、离开 App、关闭权限、保存失败会停采。租约与墓碑机制有源码实现，本轮未把所有断电/锁屏/权限组合都实际跑遍。

当前私有配置和受限 SSH 密钥、已核实的 known-host 记录在用户自己的 LocalAppData/Zaichang；源码仓库不保存密码、密钥、设备标识或账户。Mac 编译快照与产物在用户的 `Library/Application Support/Zaichang/LocationBridge/builds`，安装后的 App 属于实际 Simulator，关闭 Codex 不会删除。最后从正常新进程沿 `MapLocationProvider` 复查同样实际收到2个原生位置并完成停止；两次开发 Node 进程均正常结束，没有遗留采样。

原始回调、两轮全运动、原生停采回读与实际截图只留本机私有证据目录。当前 TypeScript `npm run check` 与原生 Swift 6 编译/签名通过；最终全项目检查由主代理在合流后执行。

## 本页不覆盖的交付

这是本机 Apple Simulator 的原生位置底座。本轮正常 USB 检查实际为0台已连接 Apple 设备。完整 iPhone/iPad 产品、真实 USB 设备签名与安装、户外 GPS 精度、后台锁屏连续采集、全对象跨端同步和学校有效计次分别属于其实际实现与验收，不能从本桥或模拟器运行推断完成。没有把模拟移动冒充真实跑步。
