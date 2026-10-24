# 06 · 运动 owner、地图、设备与跨端交接审计

记录日期：2026-10-24（用户时区 America/Los_Angeles）。本页用于新聊天先理解已有成果、原始意图和缺口，再从第二阶段重新深做。它不是第二阶段结项报告，也没有重新采集定位、登录学校、运行运动或上传记录。

## 必须先建立的全貌

运动不是一个孤立配速面板。用户要的是同一个伙伴从桌面一起安排今晚，到口袋里陪走、陪跑，再回到桌边继续相处；真实体艺记录、课程、天气、路线、个人决定可以在获准范围内共同帮助判断。学校是否有效记次由校方结果证明，位置由实际设备观察证明，本地运动由唯一运动对象证明。三者有联系，却不能彼此代签。

路线图第二阶段 `B05.4/B05a` 已有较深实现，但仍未结束。其后 `B13` 继续设备生命周期，`B16` 继续学校真实动作，`M01–M03` 做完整跨端/手机/平板，`F03/F03a` 深做共享地图与人物运动相处。不要为了抢跑后续阶段宣布当前底座已极致；也不要因这些章节在后面，就把第二阶段真实入口、数据含义、可持续性和既有缺陷留成空壳。

本次用户再次要求第二阶段从头审视、以八个子代理深挖、不断 push 和创新。路线图给的是最低方向，不是限制发现的天花板。每阶段必须用实际场景证明体验与机制都已充分打磨，已观察到且能修的缺陷修完并重查，才讨论下一阶段。保存旧成果，重新验证它们；“从头”不等于重写正确 owner 或丢弃已有证据。

## 原始依据与必读材料

本专题已亲读以下来源；后继者仍须与主交接中的第一阶段全量阅读一起完成，不能只拿本页代替原文。

| 来源 | 本专题实际阅读范围与意义 |
| --- | --- |
| [总路线图](../../../REFACTOR_ROADMAP_2026-10-22.md) | Stage02 全段；Stage05 中持续 GPS 与学校打卡；Stage07 全段；Stage09 全段；开篇跨端愿景与当前起跑点。尤其 Stage07 末尾的原话顺序：先用 iOS Swift 打磨手机与 iPad，再转 Android，避免两端做成差别巨大的产品。现有 Android 位置桥不是违反顺序抢做完整 Android 产品。 |
| [体艺/GPS阅读计划](../../../reading/2026-10-22/TIYI_READING_PLAN.md) | 全文；明确旧桌面演示、HDC 官方页面交接、真实位置、学校提交和后续运动相处分属不同链路。它早于第二阶段实现，其中“目前未接”的描述须与更新证据合看。 |
| [08 旧成果总结](../../../../work/deep-refactor-20261022/summary/08_zju_tiyi.md) | 全文；解释 2026-09-09 旧项目与在场的关系，不能把旧项目 README 的通过算成在场通过。 |
| 原始生活融合全文 | 实际提取目录：`work/deep-refactor-20261022/handoff/在场-Opus深度重构-完整交接包-20261021/sources/original/upload/在场-生活融合-完整设计与实施交接.md`；本专题读 L267–356、461–468、501–506、649–658。设备观察不天然等于本人位置；同一事项跨端用稳定身份/修订接续；离线不让两端各自重发动作；没有同步服务不能显示已同步。 |
| 旧体艺项目 | 下节给真实路径；已读 README、功能覆盖核对、`docs/mobile-gps-port.md`、`web/workout-core.js`、`src-tauri/src/phone_bridge.rs`。旧 `src/workout-core.js` 路径写错，真实文件在 `web/`。认证和各业务 API 的完整审计由体艺专题承接。 |
| 第二阶段证据 | [总记录](../../../evidence/2026-10-23-stage02.md)、[workout](../../../evidence/2026-10-23-stage02-workout.md)、[Android时钟](../../../evidence/2026-10-23-stage02-android-clock.md)、[计步](../../../evidence/2026-10-23-stage02-cadence.md)、[iOS](../../../evidence/2026-10-23-stage02-ios-location.md)、[伴侣接续](../../../evidence/2026-10-23-stage02-companion-workout.md)、[桌面](../../../evidence/2026-10-23-stage02-desktop.md)、[几何](../../../evidence/2026-10-23-stage02-geometry.md)、[独立边界](../../../evidence/2026-10-23-stage02-adversarial.md)。本页将其当历史实际观察，未冒领本轮重跑。 |
| 当前机制说明 | [ARCHITECTURE 本地运动与校方体艺来源](../../../ARCHITECTURE.md)、[CURRENT_STATUS](../../../CURRENT_STATUS.md)、[PROJECT_NAVIGATION](../../../../PROJECT_NAVIGATION.md)。版本、权限和来源以实际 owner 为准。 |

## 现有设备、工具与独立成果在哪里

以下区分 2026-10-24 本次只读观察、10月23日实际运行证据、10月03日环境档案。未把旧 PID、ADB alias、Simulator UDID、窗口 ID 或端口响应当永久常量。下一次使用先重发现实际设备，保留用户已运行的应用、会话和数据。

| 对象 | 实际路径/入口 | 本次确认与可复用范围 |
| --- | --- | --- |
| 在场 Windows 源码与普通 Electron | `C:/Users/17601/Documents/ChatGPT/在场`；正常项目启动/构建遵循 `package.json`；当前 Electron 可执行文件为仓库 `node_modules/electron/dist/electron.exe` | 本次仅只读进程路径，看到多个此可执行文件进程；没有据此认定每个实例的 profile、登录、窗口或构建版本相同，没有关闭它们。10/23 桌面证据才说明当时同 profile 重开与实际操作。 |
| MuMu | `C:/Program Files/Netease/MuMu/nx_main/MuMuNxMain.exe`、`nx_main/adb.exe`；设备程序在 `nx_device/12.0/shell/MuMuNxDevice.exe`，虚拟化组件在 `C:/Program Files/MuMuVMMVbox/Hypervisor/` | 本次看到 MuMu 主程序、设备程序与虚拟化进程在运行，ADB 服务也已运行；只读 `adb devices -l` 看到两个现有可用连接别名。别名不是两台物理手机的证明；正常 provider 以 boot 身份去重。未新建连接、未改模拟位置、未启动运动。 |
| MuMu 官方浙大体艺 | Android 包名 `net.crigh.mysport`，位于当前 MuMu 的应用安装区；下次用既有 ADB/正常界面重新定位 | 本次只读 `pm path net.crigh.mysport` 确认已安装，未读 App 私有数据/账号。用户截图及10/23记录证明当时主页、课外锻炼汇总与有效流水正常；10/24本次未重开 App，也没有把安装存在当当前登录成功。 |
| Android 在场位置桥 | [apps/location-bridge/android](../../../../apps/location-bridge/android/README.md)，包名 `cn.zaichang.location`；当前 manifest 版本 `0.1.3`/versionCode 4 | 本次只读 `pm path cn.zaichang.location` 确认当前 MuMu 已安装桥；源码当前0.1.3不自动证明设备上版本，因此没有写成已回读安装版本。已存在 `apps/location-bridge/android/build/zaichang-location-bridge-debug.apk`。它是位置提供器，不是完整手机版。 |
| Android 编译依赖 | `C:/Users/17601/AppData/Local/Zaichang/android-development/sdk`；`.../jdk-17.0.16+8` | 本次实查 Android35 `android.jar`、build-tools35.0.0 `aapt.exe`、JDK `bin/java.exe` 存在。构建入口是 `python apps/location-bridge/android/build.py`，可显式 `--sdk/--java-home`；不靠 Codex 内置 runtime。未重编译或安装。 |
| HDC | `C:/Users/17601/Documents/Codex/2026-09-09/wo-d/work/hdc-current/hdc.exe`；新在场可用 `ZAICHANG_HDC_PATH`，旧体艺项目使用 `ZJU_HDC_PATH` | 本次核到文件存在和已有 hdc.exe 进程。未运行设备连接/解锁/登录。进程存在不证明鸿蒙设备连接，更不证明在场有 HDC 原生位置流。 |
| 旧浙大体艺电脑端 | `C:/Users/17601/Documents/Codex/2026-09-09/wo-d/work/zju-sports-desktop`；产物与覆盖报告在同任务 `outputs` | 本次读到源目录、README 与报告；实查 `outputs/浙大体艺_本机预览_0.3.7.exe` 和对应源码预览 ZIP 均存在。旧0.3.7是 Tauri/Windows 本机预览，依赖同任务 `work/python-deps`、Python与签名组件；不可把单独EXE叫独立发布版。未运行旧EXE。 |
| 本机虚拟 Mac 根 | `C:/Users/17601/Documents/Codex/2026-10-03/https-www-aiformortals-co-blog-inkwell`；`work/local-vm-experiments/wsl` | 本次核根与WSL资料目录存在。ios-develop 机器档案说明 WSL发行版为 `Inkwell-Lab`，虚拟系统盘在发行版内部 `/opt/inkwell-lab/sequoia-kvm/mac-system.qcow2`。此盘、Xcode和设备数据不可当缓存删除、重新导入或重建。 |
| 本机 Mac 可见入口 | 机器档案的 SSH `127.0.0.1:2222`、VNC `5902`、noVNC `http://127.0.0.1:6081/vnc.html?autoconnect=1&resize=scale` | 本次只读 Windows 监听表，三个端口均有本机监听；没有SSH连接、启动/唤醒VM或检查桌面。监听不证明 Mac 已解锁、Xcode/Simulator健康。需要时先用 ios-develop 的只读 status/doctor 与实际 noVNC 确认；不要因 SSH 暂无响应另造 VM。 |
| iOS 位置桥配置/源码 | 私有配置 `%LOCALAPPDATA%/Zaichang/apple-location.json`（或 `ZAICHANG_IOS_SSH_CONFIG`）；[apps/location-bridge/ios](../../../../apps/location-bridge/ios/README.md) | 本次仅核配置文件存在，没有读账号、SSH私钥或配置正文。Windows `python build.py` 经现有本机 OpenSSH编译，Mac `build.sh`；快照/产物在 Mac用户 `~/Library/Application Support/Zaichang/LocationBridge/builds/`。源码、Python标准库、OpenSSH、Xcode即可继续，不依赖 Codex会话。 |
| iPhone/iPad Simulator与真机 | 10/23证据：iPhone17/iOS26.2、iPad Air11-inch M3类型/iOS26.2；真实 CoreLocation 回调已取得 | 当时核 macOS15.8.1/x86_64、Xcode26.3/17C529、Swift6.2.4、iOS26.2/23C54。10/03技能档案另记已有真实iPad，不等于这次已连接；10/23 USB检查实际0台。本次未检查USB/Simulator运行；不能宣称当前连着真机或完整手机产品。 |

本次没有打开浏览器/原生界面，也没有收集坐标、原始运动正文、账户、Cookie、token、设备稳定身份或私钥。只读目录与进程的结果不替代后继实际操作；路径存在也不保证版本、登录与数据仍新鲜。

## 旧桌面体艺到底积累了什么

旧项目不是可随意丢掉的玩具：它有UAA、专门体艺会话、实际账号菜单、查询、历史筛选、原业务窗口、签名兼容机制与19功能范围经验。`outputs/功能覆盖核对.md` 明确细分真实列表、空结果、页面入口、HTTP502、登录过期、未做预约/付款/报名/反馈等，不可被压成“19项都完成”。完整体艺能力与连接断点看本交接的体艺专题；本页关注运动与设备。

其 `web/workout-core.js` 是一个内存状态/距离/配速原型，Windows来源固定为 `desktop-preview`。`workout-recorder.js` 的 Android/iOS `navigator.geolocation.watchPosition` 分支和 Tauri移动平台声明，只是可移植入口，不是已交付手机版。旧 `docs/mobile-gps-port.md` 明确缺权限/后台/加密草稿/恢复与真机实测；Windows直接 `savesports` 关闭。

旧 `phone_bridge.rs` 的 `phone_bridge_status/open_workout/press_start` 经已授权HDC打开官方体艺页、检查锁屏与开始按钮，把后续运动交还手机官方App。历史现场手机锁屏，未真实开始或上传；该桥不把手机令牌交给桌面，不把Windows演示路线发学校。读到 `sporttype/prejudgment/savesports` 路径也不等于签名、幂等、写入和学校有效计次已完成。

因此后继者应复用正确协议理解与业务覆盖，沿在场既有Broker/owner接入；不要并排塞进第二套Tauri运动系统，不要因旧版已查过就跳过当前学校响应。

## 当前在场的真实调用链与源码责任

```text
私人共享地图 CampusMap → WorkoutControls
  → preload 的有限 workout:* IPC
  → main.ts 的 NativeWorkoutService
  → 唯一 WorkoutSessionKernel
     ├─ MapLocationProvider.createWorkoutStream
     │  ├─ Windows GeoCoordinateWatcher
     │  ├─ ADB → Android LocationManager + 可选 step sensor
     │  ├─ iOS本机SSH → Simulator里的原生CoreLocation桥
     │  └─ HDC当前仅发现/明确无兼容位置流
     ├─ WorkoutDraftStore → 原SQLite meta + 系统safeStorage
     └─ CampusMapAdapter.matchWorkoutFix → 公共路网的派生候选

原Harness/Broker → workout.current → 同一owner的一刻有限摘要
```

| 文件 | 应掌握的合同 |
| --- | --- |
| [shared/workout.ts](../../../../src/shared/workout.ts) | raw fix、filteredCoordinate、quality、segment、trustedDelta、指标、学校状态与来源分别保存；`revision`属于控制，`sampleRevision`属于测点；`recordingSource`是明确选过的producer，不是人当前在哪里。 |
| [runtime/workout-session.ts](../../../../src/main/runtime/workout-session.ts) | 唯一计时/采点/过滤/控制/恢复owner；没有学校上传、模型请求或后台代理。开始、暂停、继续、结束、取消按原ID与expectedRevision串行处理；旧回调generation失效。 |
| [runtime/workout-native.ts](../../../../src/main/runtime/workout-native.ts) | 私人模式与位置权限、实际设备选择、原运动ID传到native、原producer停采恢复；取消建立精确 `workout:<uuid>` 屏障，清理原引用并通知policy。 |
| [runtime/workout-storage.ts](../../../../src/main/runtime/workout-storage.ts) | 按本机 principal/workspace命名空间的同SQLite存储；safeStorage加密头和逐点追加，事务保存新点与摘要；无安全存储不落明文。delete fence与cleanup在解密正文前检查。 |
| [device-location.ts](../../../../src/main/device-location.ts) | Windows连续watcher，ADB发现/去别名、受限原生桥交接、当前boot时钟核对、同运动STOP回读；HDC尚无可读原生采样实现。 |
| [ios-location.ts](../../../../src/main/ios-location.ts) | 仅本机127.0.0.1配置、StrictHostKeyChecking、有限SSH命令；只发现已Booted的iOS设备，明确选择；私有原子control文件与当前进程回执，绝不默选第一台或自动boot新设备。 |
| [workout-cadence.ts](../../../../src/main/runtime/workout-cadence.ts) | 真实step事件的短窗估算，与GPS独立；无传感器/拒绝/等待/过期分别表达。 |
| [capabilities/workout.ts](../../../../src/main/capabilities/workout.ts) / [workout-source.ts](../../../../src/shared/workout-source.ts) | 摘要只读、用途与本人/现实/私下来源核验；proof绑定实际读到的运动ID、修订和时刻；取消撤回精确运动，普通测点/暂停/结束不抹掉当时合法观察。 |
| [map-workout.ts](../../../../src/main/map-workout.ts) / [shared/map-workout.ts](../../../../src/shared/map-workout.ts) | 路网候选、歧义、场馆范围和输入哈希；不反写raw，不算圈数，不生成不存在的道路或学校成绩。 |
| [WorkoutControls](../../../../src/renderer/map/WorkoutControls.tsx) / [CampusMap](../../../../src/renderer/map/CampusMap.tsx) | 活组件读同owner，真实设备/保留选择、键盘、停止未知、加密恢复/取消；公共地图不挂私人控件。 |

### 计时、距离、滤波与来源不能合并成一个“准”字

- 原始经纬度始终WGS84，采集epoch、收到时刻、可比较的设备boot单调时钟、原报告时钟各自保留；Android68%精度与其它未知/95%口径不等同。海拔基准、未知速度也单独保留。设备位置不能推断本人正在移动。
- 开启时长 `elapsedActiveMs`、连续合格采样时间 `trustedActiveMs`、观察到移动时间 `movingMs` 不同。当前平均配速基于可信采样时间/因果滤波距离；当前配速用30秒连续合格窗，至少5秒与5米；不是靠持续前端timer编造。
- 未知或大于50米精度、过期、无效、时间倒退和离群点不计距。大于15秒间隙、换源、暂停和质量断点分段；不把丢失路段用直线补全。公里分段在实际合格区间内插值，不能补成一条连续跑完的证据。
- Kalman是未经设备校准的本机因果估计，原始合格点距离 `rawDistanceMeters`仍保留；地图候选不参与改写raw或运动里程。地图“吸附”不是强行贴路创造准确感。
- 同一Android设备/boot/来源的GPS与network全部原观察入一份轨迹。采集年龄与收到年龄均在10秒内才比较报告精度，等精度优先GPS。未选点 `provider-not-selected`不是坏点，不推进可信时间、滤波、距离或静止；切换断段，不计源间偏移。10秒是本机政策，不是Android频率承诺。
- MuMu曾把epoch量级数据放入`getElapsedRealtimeNanos`，network却正常boot量级。当前保留`reportedElapsedRealtimeMs`与`clockQuality`；只有落在当前设备boot范围的报告才成为可算`elapsedRealtimeMs`。没有猜偏移、重写采集时刻或放松倒退门槛。
- `provenance`具有粘性：模拟器、mock、未知来源不能在后半段洗成真人运动。学校字段当前固定`submission:not-submitted/validCount:null`，模拟路线永不证明学校有效记录。

### 自动暂停、停止、取消与恢复

可靠低速连续成立才自动暂停：前后点均有速度绝对值≤0.3m/s、精度≤15m、没有计入移动距离，累计可信静止达20秒，再经同控制CAS与当前观察复核，复用真正pause/stop流程。弱信号、缺速度和拒收时序不是静止。暂停后不暗中做移动探测，不自动重启；继续需明确操作。

Android桥通过同运动ID、随机订阅nonce、5秒续租与20秒lease连接；原生最近最多64个位置/计步交接事件。iOS桥最近最多16点，同运动/nonce/命令ID/短有效期，20秒lease，离开App/权限退出/保存失败会停。两桥都保有取消nonce墓碑，旧start/权限回调不能重新开启。Android当前debuggable+ADB `run-as`是本机开发协议，不能直接成为公开手机版安全方案。

**“发了STOP”“过了20秒”“连接没了”“正文删了”均不等于停采已确认。** Android要同身份stopped、零位置/计步订阅、空双缓冲，并核系统location/sensor当前连接；iOS同身份stopped、零监听与空缓冲。异运动拒绝接管。恢复清理仅构造原身份流并stop，不start采样。

取消先保存独立加密cleanup控制，再撤回精确来源、删除本机正文，设备暂离线不能阻止本机遗忘。清理控制只保原运动/producer和清理结果，不保轨迹/指标/原始时刻。三件事分别记：本机正文删除、原引用撤回、设备停止；有一步未确认就沿原身份重试。普通权限退出隐藏实时正文/指标并停采，独立合法保留草稿仍在；它不等于取消全部历史。

加密草稿重开先paused/interrupted，关闭期间不计运动时长，不自动定位；明确继续才开新订阅。不解密失败就覆盖旧稿；可以保原件并让新运动只留当前窗口。当前只存一份本地运动草稿，不是完整运动历史库。临时记录随应用关闭退出正文，但关闭临时记录不冒称撤回所有独立合法历史。

### 伴侣究竟已接到哪一步

`workout.current` 已接到原Broker/Harness：她可按当前原话/用途读取已有本地运动的一刻摘要，包含状态、时间、距离估计、配速、精度、暂停、最近分段、保留/清理和未提交学校状态。它不含坐标、轨迹、设备身份、任意文件，不启动/修改采样，也不创建新聊天引擎。来源proof沿真实读取传给当轮、历史、子调查和帮助记录。

10/23真实Windows流与Luna对话证明弱定位不会被说成零速度，精确取消该运动后相关助手正文/帮助退出，独立另一运动合法历史仍在；取消后可以自然聊别的话。它没有证明十角色长期伴跑、实时语音、持续鼓励或主动里程提醒已完成。点击开始运动不等于订立持续托付，不得每个测点都启动模型，不得硬编码祥子/睦的万能打气模板。

## 历史实际成功及不能扩大的结论

| 历史观察 | 当时实际成立 | 仍不成立 |
| --- | --- | --- |
| MuMu正常短流 | 开始/暂停/继续/结束，重复时间点修复；GPS/network原点保留，正常取消后正文退出 | 真人在校园走过、精度校准、有效学校计次 |
| Android最终正常API流 | 约24.864秒可靠静止自动paused，34位置点；8秒后时间/点数冻结；明确resume后55点并finish，原流零订阅/双空缓冲 | 该短API工厂的原生stream ID与Kernel记录ID不同；不能冒充NativeService同ID整合证明 |
| 普通产品同MuMu身份 | 桌面主代理实际核原Bridge开始、24.936秒/34点暂停与renderer重载保持；点继续到r3/46点；结束到r4/34.455秒；Native同运动ID零订阅/双空缓冲 | 户外精度、手机触控和所有动效状态；未人为关闭GPS或制造精度反转，不能填GPS超时回退/反向精度已实测 |
| Android步频链 | 实际桥升级与构建；MuMu缺step detector/counter，返回unsupported/null，停止零位置/计步订阅与双空缓冲 | 有数值真人步频、锁屏省电/真实传感器权限转换、由GPS补步频 |
| Windows加密恢复 | 同数据目录、同运动、63条原观测重开先暂停；01:01不随关机时间增长；继续收到约2933m精度弱点不计距；结束01:26并回原地图焦点 | Windows真实跑步精度或手机后台能力 |
| 断线取消恢复 | 专用profile中断本次ADB alias；取消后session空、仅独立加密cleanup；正常重开无正文/不采样；明确重连原设备、原引用重试，最终cleanup清空 | 旧无producer草稿的设备选择器全部组合已验；不能伪造旧稿来补证 |
| iOS长流 | 实际Swift6编译/签名/安装、CoreLocation模拟回调；首轮批量漏时被修；修后140点/约1117.546m、首公里124.733秒，符合8m/s模拟设定 | 真人GPS精度、正式手机版、App Store/真机签名、校园跑步或学校承认 |
| iOS自动暂停与停采 | 21合格点、0.01m/s/5m，约20秒可信静止后paused；改变模拟位置仍冻结；明确resume再采；最后同IDstopped/零监听/空缓冲并清模拟流；iPhone/iPad均点过原生停止按钮 | 所有锁屏/断电/权限组合、真实iOS后台定位或步频 |
| 地图故障恢复 | 真实阻断/解除地图程序资源后原按钮重试，原地点/草稿/焦点保留；公共误挂私人运动控件白屏已修，公开页无运动/本机出发入口 | 全GPU组合通过、公共站点已部署、完整运动地图轨迹已经实现 |

证据中已有282/282、Hermes9/9、地图专项48/48与最终类型/构建记录。这些是当时版本和范围的既有检查，不是本交接重新运行，也不替代本人业务正文、真机GPS、触摸与动效。新聊天代码变化后按实际影响复核，禁止新建测试/harness/runner来扩大工程；现有检查、正常API短调用与真实界面仍可使用。

## 地图边界与一个必须诚实登记的缺口

公共地图源仍在`assets/map-v2`，实际manifest为campus-map/v3；桌面与`apps/review-web`共用同一地图实现、路由与相机。不能为运动再建一张旁路地图；想象校园插画也不提供导航几何。

几何当前只做候选匹配：精度未知或>30m不选，搜索半径`max(5m,报告精度)`；多条源路在范围内保持歧义，最多六候选并保总数。每个候选带原边/sourceEdge、条件、来源地址、地图版本与三项输入哈希。源地图自身位置误差未校准，`mapAccuracyM:null`；场馆重叠不是到达证明、分道识别或已跑圈数。

校方东/西田径场均是名义400m标准跑道。东场`434.7068245115637m`是OSM内外沿中间的参考几何环线，不是“外圈”、认证测量线或GPS实测；西场只有源轮廓，不能复制东场环线/分道补圈数。启真湖以真实道路与桥头连接为准，水岸线和浏览中心不能补成可跑环湖标准圈。

**当前地图里有真运动入口/控制卡，不等于地图已画本次实时运动轨迹。** 本次亲读`WorkoutControls`全组件与`CampusMap`集成，组件订阅owner并显示指标/控制，未见将`session.points`交给地图engine；`map-engine.ts`现有普通`location`/`route`等源，未见运动轨迹源或运动setter。故真实运动路径、精度圈/计划路线对比、历史运动回放与同surface镜头接续仍不能报告完成。此处是静态集成观察，本轮未打开界面；后继在做相关体验时仍需亲核实际当前渲染。

## 跨端已有基础与真正尚缺的部分

源码已存在`src/main/capabilities/ports.ts`的`SyncPort`，不能说项目完全没有同步基础。它当前是宿主注册可信device handle、按原scope/epoch/修订处理`edit_work`或外部动作提案的端口：检测delete fence、对象冲突、离线pending、幂等意图；外部动作不由同步直接执行。它不是已经运行在桌面/手机/平板之间的网络同步网关。

当前`apps`只有`location-bridge`和`review-web`；没有完整`apps/mobile`产品工程。Android/iOS位置桥没有聊天、六层记忆、日历/资料/笔记/手写/OpenUI完整壳，也没有统一跨端对象传输。桥只把有界位置交接给桌面owner；“电脑可读模拟器GPS”不是“手机已有同一个完整伙伴”。

后续M01必须把获准身份、SourceEvent/Assertion/Work/Action/Notes/Bookmark/WorkoutSession稳定ID与因果版本接起来，处理真实配对/传输、离线冲突、privacyEpoch/删除取消传播和单一外部动作责任租约。DPAPI密文/凭据不能原样当手机认证，不能复制本机私人目录；不能用localStorage外观偏好冒充同步或长期记忆。每台设备位置有其时间/误差/来源，桌面位置不得覆盖用户明确说的手机位置。

## 第二阶段重做时仍须深挖和实际证明

1. **把学校功能做全做深。** 当前纯直连恢复是新起点，所有体艺菜单/本人动态正文/学期规则/细项与分页继续逐资源落实。订单查询只是其中一块，不能据此缩窄体艺愿景；同时学校写入、预约/付款/报名/签到/上传仍须沿真实动作与当前授权，不能让模拟运动替学校提交。
2. **真实来源与可持续运动质量。** 用可用MuMu与iOS链复核当前集成，再取得具备条件的真机证据：室内/户外精度、离群漂移、不同源过期/反向精度、计步传感器有数值、权限切换、后台/锁屏/睡眠/断线。缺设备是具体缺口，不是把模拟器成功改称真人成功；独立可做的校务、模型、地图与恢复工作继续。
3. **原同身份生命周期再深入。** 开始/暂停/继续/结束/取消、迟到回调、原生停止按钮、撤权、加密恢复、不可解密/旧producer未知、停止失败重连，都沿原owner回执核实。不要把与Kernel不同的stream ID观察挪来盖产品同ID验收。
4. **真实运动进入同一地图。** 先以合格Image稿表达运动中控制与人物退让，再接活组件：raw/filtered/候选含义清晰，轨迹断段诚实、精度圈与计划路线独立、镜头用户触碰立即接管、收起返回同surface/焦点。图稿和卡片上的数字不能替代真实轨迹流程。
5. **她怎样与人一起运动。** 在已有有限摘要与来源撤回正确基础上，让主模型按真实原话/关系/运动用途理解与独立判断；轻松散步可收起达标数字，训练可讨论配速，弱信号不自称用户没动。不做固定鼓励器，也不为每个测点开模型请求；长期主动陪跑需要原托付/渠道/停止条件和真实生命周期。
6. **独立运行与跨端顺序。** 保留桥的独立Python/JDK/SDK/OpenSSH/Xcode构建，不依赖临时Codex会话；完整手机/平板仍按路线图先iOS Swift深磨，再Android，实际核触控/手势/安全区/音频/恢复与三端接力。位置桥debug协议不能直接公开发布。
7. **完成标准由真实生活决定。** 亲自经历桌面安排→真实允许的移动观察→运动控制/对话→暂停恢复→回桌面续接；学校记录有校方回读，个人资料仍私下，公共review仍隔离。每发现可修的在范围问题就修、按原触发重查。八路团队做实质研发与证伪，主代理掌舵并亲看最终集成，不能用成员“已完成”替代接受。

## 本次交接工作的操作与清理

仅编写本审计文件；无产品代码/规则/依赖/既有证据修改。只执行文件阅读、目录/文件存在检查、进程名与可执行路径、已有本机监听表、已有ADB服务的设备与两个指定包安装路径查询。没有开启/停止/重启应用、改变定位/权限/代理、连接学校、读取登录或本人资料、发送其它用户聊天消息。

未生成测试/runner/临时脚本，也未清理任何文件；因此没有可报告的本次清理文件或空间回收。所列旧EXE、ZIP、桥APK、VM盘、SDK、密钥、原始证据均保留。
