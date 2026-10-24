# 在场 iOS 位置随行

这个原生 CoreLocation 小应用把用户明确开启的运动位置交回在场唯一的 `WorkoutSessionKernel`。当前桌面连接的是本机 Mac 里的 **Apple Simulator**；它的所有位置始终标为 `simulated`，不能解释为真人 GPS，也不会上传学校。

源码在本目录，Windows 构建入口为 `python build.py`，Mac 构建入口为 `bash build.sh`。只用 Python 标准库、正常 OpenSSH、已安装的 Xcode；关闭 Codex 后仍可运行。原生应用不连互联网，没有聊天、模型或第二份运动数据库。

## 配置与运行

在用户自己的 `%LOCALAPPDATA%/Zaichang/apple-location.json` 保存本机 Mac 连接资料，或用 `ZAICHANG_IOS_SSH_CONFIG` 指向私有配置。密钥和已核实主机记录由用户保存在仓库以外，私钥保持仅本人可读的权限；不能关闭主机核验或复制未验证的主机指纹。

```json
{
  "host": "127.0.0.1",
  "port": 2222,
  "username": "your-mac-account",
  "identityFile": "C:/Users/you/AppData/Local/Zaichang/ssh/local-mac-key",
  "knownHostsFile": "C:/Users/you/AppData/Local/Zaichang/ssh/known_hosts",
  "developerDirectory": "/Applications/Xcode.app/Contents/Developer"
}
```

先正常打开本机 Mac 和一个实际存在的 iPhone/iPad 模拟器。只编译用 `python build.py`；安装、打开时显式指定从 `xcrun simctl list devices` 读到的设备：

```text
python build.py --device <actual-booted-simulator-udid>
```

脚本将当次 Windows 源码打包到本机 Mac 的 `~/Library/Application Support/Zaichang/LocationBridge/builds/`，运行 Swift 6 编译与正常本地签名，再装入指定模拟器。不会默选第一台设备或重建虚拟 Mac。Simulator 安装是本地开发签名，不是 App Store 发布或真机安装证明。

桌面通过 `discoverIosLocationDevices()` 只列已经启动的 iOS 模拟器。用户选定后，`createIosWorkoutLocationStream({ deviceId, workoutId })` 通过 App 私有 Documents 的原子控制文件开始、续租或停止；正常打开 App 后读取其当前进程回执，心跳不激活界面，也不反复弹出 URL 确认。原生位置许可仍由 iOS 正常呈现。

## 位置与停止

每个控制带原运动 ID、随机会话标识、独立命令 ID 和时间。原生桥只处理最近的新命令，重开时忽略原进程留下的命令，不自动恢复位置。每次正常开启 CoreLocation 时，以原生设备自己的时钟记下起点，忽略早于这次订阅的缓存位置，原始位置时间不改写。20 秒收不到续租、离开 App、关闭权限、用户停止或文件保存失败都会停止 CoreLocation。停止会移除监听并清空短暂位置缓冲；桌面需核到同一运动的 `stopped`、零监听、零缓冲才确认停止，无法核实时保持未知，不能去停止另一段运动。

原生缓冲只保最近 16 点，放在 App 私有目录，停止清空。桌面保留方式仍由运动 owner 的「当前窗口／本机加密」选择决定；本桥不把坐标送给模型或长期记忆。Apple 的负 speed、负 course 以及 `verticalAccuracy <= 0` 都作为未知；`altitude` 使用平均海平面基准。[Apple altitude](https://developer.apple.com/documentation/corelocation/cllocation/altitude)、[speed](https://developer.apple.com/documentation/corelocation/cllocation/speed)、[verticalAccuracy](https://developer.apple.com/documentation/corelocation/cllocation/verticalaccuracy)。

界面先参考本轮已批准的[运动控件图稿](../../../前端视觉创新设计/精选图稿/A-标杆/2026-10-23-workout-controls/README.md)，再生成并亲看[原生位置随行图稿](../../../前端视觉创新设计/精选图稿/B-微调复用/2026-10-23-ios-location-helper/README.md)，落实暖灰金、单一状态与宽停止动作。模拟来源明确可见，不把图稿中的地图几何用于定位，也不把图稿当运行截图。

本轮实际平台和操作证据见[第二阶段 iOS 位置记录](../../../docs/evidence/2026-10-23-stage02-ios-location.md)。iPhone/iPad 真机签名、户外 GPS、后台锁屏连续采样与跨设备同步分别需要其本身的实现和实测，不能由模拟器运行推断。
