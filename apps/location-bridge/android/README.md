# Android 原生位置桥

这是桌面在场运动会话的原生位置提供器。它不是完整手机版，也不读取或上传学校体育记录。无网络权限，只经用户已授权的 ADB 调试连接把系统位置交给桌面唯一的 `WorkoutSessionKernel`。

Android 正常申请前台精确/粗略位置权限，由 `LocationManager.requestLocationUpdates` 订阅 GPS 与 network。每个原始点保留 WGS84 坐标、系统采集 epoch 时刻、设备单调时钟、精度（Android 报告的 68% 水平精度半径）、可选海拔/速度/方向、安装级设备身份、provider 和系统 `isMock`。模拟器身份或模拟输入会使 `provenance` 保持 `simulated`，即使系统返回 `isMock=false` 也不会变成真实运动。

0.1.3 同时交付当前设备开机时钟，桌面先核对每点报告的 elapsed realtime 是否落在本次开机范围内。MuMu 实际出现过 GPS 把 epoch 量级的数值放入该字段、network 却正常报告 uptime 的情况；原值保存在同一轨迹点的 `reportedElapsedRealtimeMs`，`clockQuality` 说明范围核对结果。超范围值不成为可计算的 `elapsedRealtimeMs`，也不减去一个猜测的偏移量；会话保留原采集时刻，继续由唯一运动 owner 核对时间顺序。旧桥没有提供开机范围时保留原报告并标为 `unverified`，不猜测它是可比较的单调时间。

位置桥仍交付 GPS 与 network 的全部原始回调，来源选择属于桌面唯一运动 owner。它比较同设备、同开机的近期合格观察与报告精度；较弱来源作为 `provider-not-selected` 保留在同一原始轨迹中，不改坐标、时刻或速度，也不推进测量锚点。当前十秒新鲜窗是本地策略，不是 Android 回调频率或真实精度保证；来源切换重新建立距离基线。实际时钟与停止观察见[本次记录](../../../docs/evidence/2026-10-23-stage02-android-clock.md)。

0.1.2 也可读取 Android 的计步传感器：优先 `TYPE_STEP_DETECTOR` 的实际逐步事件，缺少时才用 `TYPE_STEP_COUNTER` 原始累积计数。Android 10 起单独申请身体活动权限，拒绝后仍可定位。缺计步传感器、没有允许身体活动、正在等第一步和已停止分别保留，不能把未知当作零步。原始计数、sensor 名称/厂商/版本、设备开机时钟、订阅身份和模拟来源通过同一个有界缓冲交给桌面 owner。桌面只在短时间内有足够事件时推导窗口步频；GPS 速度、步长和地图移动都不能补出步频。计数器可能延迟，因此它也不是每一秒的精确即时步频。

计步仅随同一次显式运动位置订阅存在；暂停、结束、取消、租期到期和服务销毁都会注销 sensor listener 并清空交接缓冲。Android 14 起在具备实际计步来源和身体活动权限时显式启用 `health` 前台类型，否则仅启用 `location`，不因可选计步被拒绝而阻断定位。停止回读同时核对原生的零 sensor 订阅和空事件缓冲。参照 [Android motion sensors](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion) 与 [前台服务 health 类型](https://developer.android.com/develop/background-work/services/fgs/service-types#health)。

桌面使用随机 session nonce 显式开始，通过应用私有 `location-state.json` 接收最近最多 64 点的交接缓冲，去重后交给运动 owner；它不是第二份持久轨迹。未获得权限、没有 fix 或未知精度均不补坐标或默认精度。停止时 `removeUpdates`、清空缓冲和前台通知。后台服务不自动重启；桌面每 5 秒续期一次连接，20 秒收不到续期会停止定位并清空缓冲，因此桌面退出或 USB 丢失不会留下无限订阅。

`workoutId` 将原生订阅绑定到同一运动 owner。桌面停止后须回读同一身份的 `stopped`、空缓冲、零订阅，并核对系统当前定位 provider 中已没有本桥监听；广播发出本身不算成功。断开连接或回读失败时 `stop()` 拒绝并保留重试身份，不能把 20 秒超时当作已观察到停采。重启后可用原加密草稿中的 `workoutId + recordingSource` 新建流并只调用 `stop()`，不会自动 `start()`；其它运动仍活跃时拒绝接管。Windows 位置子进程持有原桌面进程句柄，父进程退出后在轮询中进入 `finally` 释放 watcher。

`StopReceiver` 要求 Android `DUMP` 权限，外部应用不能续期或停止别的会话；旧 nonce 也不能操作当前会话。取消 nonce 留有有界墓碑，迟到的启动 Activity 或权限回调不会重新开启已停止的订阅。位置桥 `android:debuggable=true` 是本机开发连接的必要条件，`run-as` 只读取这个应用的私有缓冲。这个调试协议不适用于公开发布的手机版本，后续正式手机宿主必须替换为平台内受限、已认证的连接；不能将 `run-as` 当通用用户数据读取接口。

## 独立构建

需要 Python 3、JDK 17、Android platform 35 与 build-tools 35.0.0。普通 Android SDK Manager 可安装后两项；不需要 Gradle、Node、Codex 或模型。构建脚本不下载依赖、不修改全局 PATH。

```sh
python build.py --sdk /path/to/android-sdk --java-home /path/to/jdk-17
adb -s <selected-serial> install --no-incremental -r build/zaichang-location-bridge-debug.apk
```

也读取 `ANDROID_HOME`/`ANDROID_SDK_ROOT` 和 `JAVA_HOME`。Windows 若未设置这些变量，只检查用户自己的 `AppData/Local/Zaichang/android-development/{sdk,jdk-17*}`。APK 与签名中间文件留在 `build/`，debug keystore 使用用户自己的 `.android/debug.keystore`；不提交产物或密钥。

桌面正常入口为 `MapLocationProvider.discoverDevices()` 与 `createWorkoutStream({source:'adb',deviceId:<selected-serial>,workoutId:<owner-id>})`。多 transport 指向同一设备时，按本次开机身份去重；多台设备时要求明确选择。原始 fix 的 `deviceId` 是稳定安装身份，`transportDeviceId` 另保原调试连接标识，不把两者混用。已知模拟器可进一步传 `simulated:true`，这个标记只能提高模拟约束。CLI 路径由 `ZAICHANG_ADB_PATH` 配置，也检查常见 SDK 与 MuMu 安装目录。HDC 仅能报告本机当前连接；没有兼容的原生鸿蒙位置提供器时明确报告不可采样，不拿“打开官方页”代替位置流。

参考：[Android Location](https://developer.android.com/reference/android/location/Location)、[位置更新与权限](https://developer.android.com/develop/sensors-and-location/location/permissions)、[前台 location 服务](https://developer.android.com/develop/background-work/services/fgs/service-types#location)、[SDK Build Tools](https://developer.android.com/tools/releases/build-tools)。Android `LocationManager` 输出按 WGS84 处理；本桥不读取地图 SDK 的 GCJ-02 坐标，也不进行未声明的坐标转换。
