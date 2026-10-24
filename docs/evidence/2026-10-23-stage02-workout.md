# Stage02 本机运动会话内核

本页只记录本轮 `WorkoutSessionKernel` 的实现和实际观察，不代表学校计次、真人运动精度或移动后台已经通过。

`src/shared/workout.ts` 是会话对象合同；`src/main/runtime/workout-session.ts` 是唯一运动会话 owner；`src/main/runtime/workout-storage.ts` 在既有 SQLite meta 内保存系统保护后的密文。原始 fix 与 Kalman 推算坐标分列，路网匹配只是本机派生参考，不参与修改测得坐标或计算路网里程。控制修订与采样修订分开，避免新定位回调使正常暂停按钮持续失效。

会话保留轨迹采样、精度及其置信口径、海拔及基准、测得/收到时间、设备与模拟来源。`recordingSource`单独保存用户明确选择的producer，零fix中断也能找回原设备；它不是位置事实，旧稿没有时保持未知。稳定设备ID与私密transport alias分开，不把Android设备标识误当ADB序列号。手动开启时长、连续合格采样时长与观察到移动的时长分别计算；步频只可来自真实step sensor事件，无传感器、采样不足或过期时保持未知。精度大于50米、格式错误、过期、倒退和明显离群点不计距；中断、弱信号、暂停或来源切换分段，不以直线补齐缺测路程。重复/迟到缓存回调只拒收，不清除较新的合格采样锚点。配速使用30秒内连续合格区间，公里分段仅在真实接收的合格区间内插值。

可靠静止现在会真正自动暂停：连续合格区间的前后两点都须报告速度绝对值不大于0.3米/秒、精度不大于15米，且没有计入移动距离，累积可信时长达到20秒后才触发。该决定沿原控制修订核验，执行前再核当前仍在记录且仍为静止；随后复用手动暂停的停采流程，保存`pauseReason: stationary`。弱信号、缺速度和被拒时序不作为静止证据。暂停后没有后台移动探测或自动重开定位，继续仍须明确操作；原运动卡通过既有`pauseDetail`说明原因。

同一Android设备、boot与来源身份的GPS/network原始观测都进入这一份轨迹。owner只保每源最近的测量时刻、收到时刻、报告精度及选中源；两项年龄均在10秒内才比较，报告半径相等时优先GPS，网络更清楚时可选网络，不把provider名当真实性证明。10秒是本机根据当前约3秒GPS周期设置的有界派生策略，小于15秒缺测断段，不是Android频率保证。未选点为`provider-not-selected`，不算坏点，不推进测量锚点、可信时长、里程或静止判定；原坐标、速度和时刻仍保留。略早于先到network的合格GPS可提供有限时效的可用证据，但仍沿时间拒点规则，不倒退accepted时间。已选源失效、过期或被更清楚的观测替换时，切换断段；未选坏点不破坏另一条仍新鲜的合法锚点。暂停、取消和真实来源/质量断点清空选择证据，恢复不借旧选择启动采样。

步频第三回调已接入独立的`WorkoutCadenceEstimator`：GPS弱点不抹掉实际sensor事件；最新一条原始观察随同一加密header保存，当前步频按短窗口与新鲜度计算。暂停、结束和恢复时清空当前估计，恢复不会复用旧订阅的步频。`ios-simulator`仅为GPS producer协议枚举扩展，不是iPhone真机或iOS步频已经可用的证据。

暂停、结束、取消、关闭和权限退出都会使旧回调失效并请求真正关闭定位流。每次读取状态都同步核验原访问范围，不等待下一次定位回调或外层通知才隐藏轨迹与指标；退出后的投影只保留不含位置的本机控制引用，合法独立草稿保留为暂停。恢复读取不重启定位，显式继续才重新采集。取消/删除与普通权限退出分开；不可解密的旧草稿不被新会话覆盖，临时运动仍可继续。没有安全存储时明确保留在内存。加密轨迹逐点追加，摘要与新点在原 SQLite 事务内一起保存，避免长轨迹每秒被完整重写。

明确取消会先删除本机正文，再关闭设备；手机暂时离线不会阻止本机遗忘。若STOP尚不能确认，只保留不含轨迹、指标和原时刻的`pendingStop`，明确展示停止未知并允许重试。为避免崩溃后丢失尚未关掉的订阅身份，同一存储owner在清正文前保存独立加密的cleanup控制回执，三项清理都成功后才移除；回执不是另一份运动记录。没有系统密钥或写盘失败时明确不能保证恢复。普通权限退出仍保留合法独立草稿。恢复清理通过私有`WorkoutStopOwner`把真实会话ID与原producer交给native，不通过对外读投影偷取已经隐藏的位置来源。

成功CAS后同步`onCancel(id)`建立精确来源撤回，不影响独立其他运动。不可解密的草稿也只需读取明文header的合法UUID来撤回原引用。load/save均在解密正文前检查同id的delete fence与清理回执，阻断“fence成功但本机删除失败后重开复活”；旧fenced header只恢复opaque清理身份和停止未知，不猜设备、不重开采样。

普通临时运动随应用关闭时，仅丢弃临时运动正文并核实停采；独立合法保留的聊天与有限摘要不因此被忘记。该停采控制明确用`sourceRetraction: not-required`，不冒称已执行撤回。真正取消或明确丢弃原记录才沿精确来源fence清理派生。

## 本轮直接正常入口观察

通过 `node --import tsx --input-type=module -e` 短直接调用现有 `MapLocationProvider.createWorkoutStream` 与 `WorkoutSessionKernel`；没有新增测试代码、断言、fixture、runner或临时脚本。来源为设备成员实际安装的 Android LocationManager 桥，目标是当前 MuMu 实例。所有数据始终为 `provenance: simulated`，未向学校提交，也没有把坐标写入证据或公开文件。

- 首轮：开始15秒 → 暂停 → 等待1.5秒 → 继续6秒 → 结束 → dispose。暂停时19点，暂停期间仍19点；运动时长保持15007.63毫秒。结束共27回调，状态finished，流stopped，配速和步频均为空。现场发现 GPS/network 同采样时刻重复回调会清空滤波锚点，已修复。
- 同触发复查：同设备重新开始10秒 → 结束 → dispose。共14回调，其中4个重复时间拒点，合格点只在同一段；合格采样时长9012.01毫秒，小于手动开启时长10006.15毫秒。静止时滤波距离为0米，原始合格点差累计0.5574米，未用漂移编造运动路程。
- 当前没有可用HDC连接的实际入口：开始后会话paused、定位流stopped、0点，具体原因保留为“无法连接鸿蒙设备，请检查 HDC 与设备授权”；直接继续重试仍是paused/stopped，随后正常结束并dispose。没有留下无限走时的空会话。
- 真实MuMu桥正常取消：采集7秒，收到10点且保持simulated，producer metadata在；直接cancel后session=null、pendingStop不存在、access仍active，随后正常dispose。没有把取消误标成权限退出。
- iOS成员通过真实CoreLocation模拟器、SSH轮询与同一Kernel走连续8m/s长流，发现批次内逐回调限时导致漏时：原135点、1070.85米，同段实际采样间隔148545.77毫秒，旧内核只计99124.03毫秒，首公里误算93.30秒。已改为把连续合格的测得区间分配到累计宿主活动预算；原15秒断段、弱信号和暂停检查保留，不补漏测。
- 同一健康REPL正常结束旧会话并重新加载后再次连续采样：140点、1117.546米，连续测得区间与可信时长均139385.913毫秒；平均124.725秒/公里、当前窗口124.693秒/公里、首公里124.733秒，符合8m/s约125秒/公里。本人亲读两份私有原state，只聚合核算，不把坐标提交仓库。此为模拟器测点管线与批次算法证据。
- 自动暂停的实际正向证据来自iOS原成员的正常simctl低速路线（0.01米/秒、每秒采样）和真实CoreLocation桥：21个合格点、精度5米、可信静止20030.605毫秒后，owner为paused/stationary且stream最终stopped；记录用时22065.756毫秒，距离估计0米、原始差累计0.200836米。原生同workout回执为0订阅/0缓冲。暂停后把模拟器路线改成1米/秒，点数、采样修订、用时、可信时长和距离仍全部冻结，没有暗中重启定位。明确resume后才到达新点：revision3、recording、原暂停原因清空，86点、段3、64.257米；随后正常finish为revision4、finished、110点、88.355米、stream stopped。本人亲读这四份私有状态并独立普通调用`projectWorkoutCurrent`，有限摘要严格schema通过且保留stationary，未向模型或公共文档传原点。
- Android实际源还暴露出GPS报告的elapsedRealtime处于epoch量级、network处于boot量级的问题。该错误由原设备owner在原生/adapter核实际boot范围后修正可用性判断，异常原值仍保留为reported字段，没有在Kernel强行重写时刻。仅修时钟后两源都会accepted，但network报告1米/秒会打断GPS约0.02米/秒的静止证据，因此新增上述同owner选源。
- Android成员用最终精度比较版的新正常Node进程核同一MuMu触发：约24.864秒自动paused/stationary/stopped，34位置点与35次采样修订；GPS为8条accepted、1条stale，network为2条accepted、1条stale、22条provider-not-selected，rejectedPoints只有2，证明未选原点仍存且不冒充坏点。原network合格点为段3，GPS合格点为段4，切换没有桥接两源偏移。8秒后用时仍精确24864.1132毫秒、可信时长22008.2585毫秒，点数与采样修订不变；明确resume才继续到55点，随后finished/stopped、用时41076.1163毫秒。本人亲读这些实际私有state，普通`projectWorkoutCurrent`严格schema通过，同时保留最近未选观测与最近合格观测的区别。暂停和结束原生均保持这一直接API流的同一桥workout身份、0位置订阅/0计步订阅/双空缓冲；此直调流自行生成的身份与Kernel记录ID不同，不把它冒充桌面NativeService的身份绑定验收。成员正常退出Node，未动官方体艺。此轮实际取得初始network接手及更清楚GPS切换，未人为关闭GPS或制造精度反转，因此没有把GPS过期后回退及反向精度选择预填为实测通过。
- 真实Electron系统安全存储下，另开专用私有profile，通过已有Bridge开始加密运动；实际观测到8个轨迹点、9次采样修订，来源simulated、加密保存。仅断开本次使用的MuMu TCP ADB连接，保留ADB服务、另一设备alias及体艺数据；正常cancel返回停止尚未确认，session已为空，localRemoval与sourceRetraction均complete，pendingStop为encrypted-local。只读SQLite时，本次运动键只剩version/id/ciphertext三个字段的cleanup envelope，密文494字节，没有运动body或point键。
- 随后正常关闭这个专用桌面，同profile重开并调用已有restore：恢复同id/revision的最小cleanup，session仍为空、stream仍unavailable，没有开启采样。已知producer原样保留，requiresDeviceSelection为false；未擦除身份来伪造旧稿picker验收。明确重连原设备后，用原pending引用重试cancel，同workout停止核对成功；state不再有pendingStop，SQLite运动键为零。设备只读回执为同workout、stopped、位置/步频订阅均0、两个缓冲均0。最后正常app.quit，专用桌面退出码0。没有kill ADB服务、重装、清数据、停止官方体艺或新增脚本。
- 当前工作树 `npm run check` 通过。检查时间属于本轮调用；其他团队并行变动的历史通过不在此继承。

正常加密运动草稿的重开、原点数保留、明确继续与finish由主代理亲自操作，见[主代理桌面复核](2026-10-23-stage02-desktop.md)；上面的离线取消和加密cleanup恢复由本页owner成员操作。旧无producer草稿的显式设备picker没有在本次正常新记录上伪造验收。模拟器连续采样证明当前管线和批次算法，不证明真人户外精度、真手机锁屏/后台或学校有效计次。Kernel本身没有学校提交接口，没有模型调用和无限后台代理。

## 研究与采用边界

- [W3C Geolocation](https://www.w3.org/TR/geolocation/)：位置属于设备观测；精度和时刻有独立含义，停止监听必须释放watch。API本身不保证设备真实位置。
- [Android Location](https://developer.android.com/reference/android/location/Location)：采样时刻、设备单调时钟和mock标志分别保留；模拟器身份不能被mock=false覆盖。W3C的95%半径与Android的68%半径不同；滤波仅按声明做各向同性高斯近似，未知口径不声称统计保证。
- [Android LocationManager](https://developer.android.com/reference/android/location/LocationManager)：GPS使用GNSS卫星，network来自附近基站与Wi-Fi；GNSS的响应与精度仍取决于信号条件。两源优先关系由当前实际新鲜度与报告精度决定，未从provider名称推断必然更准，也未把请求周期当实际采样保证。
- [GPS测量误差与距离偏差原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC4786863/)：频繁采样不自动消除距离累计偏差。因此原始点、估计、数据缺口与实际采样证据分别保留。
- [GPSLogger原仓库过滤实现](https://github.com/mendhak/gpslogger/blob/master/gpslogger/src/main/java/com/mendhak/gpslogger/GpsLoggingService.java)：核查时间、精度、异常跳点和采集生命周期的已有实践；本轮没有复制其源码或新增依赖。
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)：当前锁定Electron 44沿用项目同步系统保护入口，Linux拒绝basic_text降级；Windows保护来自DPAPI，不能把它描述成阻挡同一OS用户其他应用的隔离沙箱。草稿密文保护与全库加密分开。
- [Microsoft GeoCoordinate](https://learn.microsoft.com/en-us/dotnet/api/system.device.location.geocoordinate.-ctor?view=netframework-4.8.1)：Windows原字段允许带符号速度和360度航向；内核及恢复合同保留这些值，未将有效坐标整点拒绝。静止观察只使用速度绝对值，不把负速度当作停止。
