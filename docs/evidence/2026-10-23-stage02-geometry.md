# Stage 02：运动测点与共享地图的派生对应

2026-10-23，基于 `main` 的 `ddc5403cbf580b43f48935caf56c94b693a8ba26` 与本轮共享未提交工作。此记录只覆盖运动地图几何子任务，不是全校园重新测绘、实际跑步或学校有效打卡的验收。

## 范围与入口

- task_scope：Stage 02 的 WGS84 测点、东西田径场和启真湖既有路网对应；保留原始测点与真实未知。
- impact_scope：共享地图的本机只读派生入口。未修改任何 `assets/map-v2` 文件、源坐标、道路连接、道路权重、渲染或个人地图配置。
- completion_scope：提供可用的本地道路候选及场馆范围观察；不提供实测精度保证、自动圈数、跑道分道判断或学校有效性结论。
- 技能：map-engineering 1.0.0 / rule 1.0.0；五个项目技能及前后端各五份 references 已读。地图专项读取 core、baseline-scope、check-rules、coverage-state、sources-alignment、geometry-roads、buildings-grounds、workflow、zijingang profile、qa-acceptance 与 anti-evasion。

唯一入口为 `CampusMapAdapter.matchWorkoutFix`（`src/main/mapService.ts`），内部复用该 adapter 的公共 qualified `baseGraph`、原始 `geography.geojson` 与 `shared-facts.json` 场馆事实。实现为 `src/main/map-workout.ts`，跨 owner 数据契约为 `src/shared/map-workout.ts`。Workout owner 保存 raw fix、拒绝理由、分段与里程；匹配结果只是可选派生数据，不反写这些事实。

当前快照为 `campus-v3-f86b9ec6a26fb2b2`。源 `network.json` 为 7,323 节点、7,984 边；正常 adapter 补齐既有公共接入的分段后为 7,466 节点、8,127 边，其中 8,123 条符合候选道路类别与已知步行限制。分段仍引用原 `sourceEdge`，匹配按原边去重，不将接入估计的分段当成独立新道路。

原始材料已按本任务精读：TIYI_READING_PLAN 全文、08_zju_tiyi 摘要；旧项目 README、功能覆盖核对 1–27、`web/workout-core.js` 全文与 `docs/mobile-gps-port.md` 全文；ZIP 生活融合 267–356；用户补充原话与长信中地图、校园口径、真实 owner 的相关段。路线图写出的旧 `src/workout-core.js` 实际不存在，采用真实路径 `web/workout-core.js`。

## 场馆事实与长度裁决

| 对象 | 本轮重新核实的事实 | 不可据此推出 |
| --- | --- | --- |
| 东田径场 `relation/14296233` | [校方场馆介绍](https://tyys.zju.edu.cn/redir.php?catalog_id=172636)田径场段明确东、西场均配置 400 米标准跑道；这是场馆名义参数 | 当前 GPS 已走一圈、具体分道长度、测点误差或学校认可 |
| 东场参考曲线 | `venues.json` 的 `geometricLoopM=434.7068245115637`，`lapBasis` 明确为 OSM 内外沿中间参考环线；`scripts/build-map-v3.py` 第 138 行从局部投影线长生成 | “434.7 米外圈”或现场认证测量线 |
| 西田径场 `way/161322822` | 同一校方来源支持名义 400 米；源资料只有场馆外轮廓，`loop=null`、`laneCount=null`、`geometricLoopM=null` | 把东场的参考曲线、8 道或显示示意分道复制成西场实测 |
| 启真湖 `relation/7927357` | 使用同一 `network.json` 的既有道路、桥头节点与条件，不构造“环湖标准圈” | 从岸线、画面或水面参考中心补一条可跑路线 |

通过原有 `scripts/map_v3_coordinates.py.to_local` 将参考曲线变回 EPSG:32651 后，直接计算得到 **434.7068245110121 米**，吻合存储值。现有 `metersBetween` 对同一曲线作球面距离求和得到 **435.06246004695214 米**；两种计算口径不同，均不构成现场测量。新匹配器不使用这两项长度算圈数，也不修改地图资产来强行统一数值。

## 算法选择与原始依据

[Newson/Krumm 原论文](https://www.microsoft.com/research/publication/hidden-markov-map-matching-noise-sparseness/)以车辆真实轨迹研究 HMM 匹配；它说明应结合观测噪声与路网，不能证明本校园手机跑步误差已被消除。[OSRM Match 文档](https://project-osrm.org/docs/v5.24.0/api/#match-service)明确允许离群点空匹配、歧义和轨迹分裂；[Valhalla 文档](https://valhalla.github.io/valhalla/api/map-matching/)也区分真实 GPS map snapping 与仅适用于既有路线的 edge walking。

[W3C Geolocation](https://www.w3.org/TR/geolocation/#accuracy)描述 accuracy 为米制半径，其系统采集说明采用 95% 置信水平；[Android Location](https://developer.android.com/reference/android/location/Location#getAccuracy())明确 getAccuracy 是 68% 水平半径。它们不能未经转换便当作同一 Gaussian sigma。路线图中的 Kalman / 强吸附不是数据事实；当前缺乏校园测量线和设备误差校准，本次选择保守的局部候选观察，不叠一层未经校准的平滑制造准确感。

实现仅对单个 fix 作校园局部切平面投影，残差用项目原有 WGS84 `metersBetween` 计算。候选半径为 `max(5m, reportedAccuracy)`，报告精度超过 30m 或未知时不生成候选；5m 是容纳中心线/道路宽度差的搜索下限，30m 是保守停选政策，均不是实测误差上限、置信概率或为获得匹配而调大的阈值。地图位置误差显式保留 `null`。

每条候选带原道路/边 ID、sourceEdge、位置、投影比例、残差、通行条件与可按 ID 重定位的来源地址。多条源路同时在报告范围内便保留歧义，最多返回六条并保留候选总数；单条才提供 selected。场馆观察使用原始面和孔洞，报告范围触及边界时为 near-recorded-boundary。结果保留 fix 来源、模拟/设备属性、观测时间、地图版本及 network/geography/shared-facts 三个实际依赖哈希。没有插值、补线、路由行程、配速重算或圈数。

## 本轮实际执行

使用正常 `CampusMapAdapter` API 和现有公共地图数据直接调用，无新增测试文件、fixture、runner 或临时测试脚本。所有传入点明确标为 `public-map-reference / simulated`，不冒充个人实测。

| 观察位置/状态 | 亲读的实际输出 |
| --- | --- |
| 东场参考曲线首点，5m 报告半径 | 单道路候选 `way/1528935418:39`，残差约 4.874m；识别东场 source-track-area；lapCount=null |
| 西场源外边界首点，5m | 无道路候选；保留西场 source-venue-outline、near-recorded-boundary；没有生成伪环线 |
| 启真湖现有浏览参考中心，5m | unmatched / no-recorded-road，候选为空；没有强吸到岸边 |
| 南桥头 `way/411343573:0` 的原边中点，5m | 该边残差 0，附近另外三条原道路亦在范围内，输出 ambiguous 和四个源候选，没有补路线 |
| 崇仁路公共接入分段的真实节点 | `way/216939230:1@2:public:0` 及同源分段归回 `sourceEdge=way/216939230:1`，仅一条来源候选、残差 0；来源文件按 edge.id 或 edge.sourceEdge 定位 |
| 同一东场参考点，accuracy=null / 80m | 分别 accuracy-missing / accuracy-too-wide；均 weak-signal、无候选、无派生坐标 |
| 原始 fix | 调用后仍为原坐标、精度、时间、来源及 simulated；输出不改 raw |

`npm run check` 已通过；既有 `node --import tsx --test tests/map-v2.test.ts tests/map-v3-core.test.ts` **43/43** 通过，包含来源拓扑、孔洞、实际路由、地图身份与条件处理。`git diff --check` 对自有文件无空白错误。上述检查不代替真实手机 GPS、运动锁屏、模型理解或界面体验验证；这些仍由该阶段相应 owner 与主代理分别验收。

## 适用地图门槛与剩余边界

Q01/Q02/Q12/Q18/Q23/Q24/Q25/Q27/Q28 适用：沿同一原路网和两个场馆身份对应；显式拒绝未知 CRS；候选不冒充入口、到达或运动完成；保留三项输入哈希；没有提交个人轨迹或修改原始材料。Q04–Q11、Q13–Q17、Q19–Q22 的源几何、体量、场线生成、样式及相机均未修改，因此本次没有重新声明其全图事实/视觉通过。源数据与渲染的既有有效关系仅在本变更未触及的范围复用。Q26 的新测试工程未获用户授权；用正常 API 的真实返回及现有地图检查核查行为，不新增所谓检查器或改判通过标准。

运行结果为本地几何部分可供集成复核；全校园精度、真实手机跑步和学校有效打卡均未获本记录接受。最关键未知仍为源路网实测位置误差、具体跑道测量线、设备多径误差与真机轨迹；需要对应现实观测，不能由 43 项通过、一个零残差或图像好看替代。本次未启动定位设备、网络定位或后台资源，无需释放新增运行句柄；未清理既有缓存。
