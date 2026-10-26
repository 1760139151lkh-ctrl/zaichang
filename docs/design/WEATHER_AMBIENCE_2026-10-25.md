# 天气与房间氛围接入说明

更新：2026-10-25。本文记录现有源码契约与本轮证据；窗口、场景与最终视觉的集成验收由主代理另行记录。

## 来源与职责

房间环境入口固定使用杭州公开参考点 `30.2741, 120.1551`、`Asia/Shanghai`，始终声明 `userLocation:false`。它不读取 GPS、地图定位、大学账号或用户实际住址。原天气工具仍可查询紫金港和明确提供的公开参考地点；全局环境入口不接受前端传入地点或 URL。

沿用 [weather.ts](../../src/main/capabilities/weather.ts) 与 [builtin.ts](../../src/main/capabilities/builtin.ts) 中的 Open-Meteo provider、`weather.lookup` v6 和原 CapabilityBroker。同一请求补取 current 天气码、`is_day`、气温、降水及 daily 日出日落；旧保存结果允许没有新增字段。current 是来源的模型时刻，不能称为现场测站实况；降水保留来源给出的统计区间。[来源说明](https://open-meteo.com/en/docs)

[environment.ts](../../src/main/runtime/environment.ts) 只保存该 owner 回执的进程内显示投影，没有第二数据库、天气客户端或模型循环。[共享类型](../../src/shared/environment.ts) 为 `CompanionEnvironment`，经有限 `Bridge.environment()` 和既有 `State.environment` / `onEvent` 回流。renderer 不发天气网络请求，也不管理 broker 缓存。

## 有效状态、权限与时区

| 情况 | 环境投影 |
| --- | --- |
| 许可有效，来源 current 时刻有效且未到期 | `fresh`；使用来源 WMO 分类和独立的 `isDay` |
| 天气设置关闭或 `weather:read` 已撤销 | `disabled`；清空天气值和来源时间，不继续读取 |
| 缺 current、未知码、缺昼夜值、读取失败等 | `unavailable`；`condition:unknown`、`isDay:null` |
| 回执、模型时刻或太阳边界已到期 | `expired`；天气值未知，保留时间元数据供识别旧结果 |

日预报中的当天最严重天气码不充当当前天气。晴／多云夜晚不自动变成雨夜，白天下雨也不自动变成黑夜。图像是表现资产，不反向证明此刻晴雨。

`timeZone` 始终是杭州参考地点的 `Asia/Shanghai`；`clockTimeZone` 单独来自用户 Settings，供缺天气时的时间模式使用。浏览器或 Windows 的本地时区不暗中替换两者。

设置开关与 policy grant 都沿原 owner 核验。环境读取只缩小已有 `weather:read` 和公开来源范围，不签发新的模型权限；关闭或撤权会取消在途读取、清除可用投影，迟到结果不能恢复旧状态。

## 刷新与显示控制

原 broker 负责等价范围缓存、单飞、请求预算与撤权取消。天气回执最长缓存30分钟，并受参考地点当日结束限制。房间投影还受 current 时刻最长60分钟及下一日出／日落边界约束；边界落在两个模型样本之间时，只在来源明确给出的下一统计步长再试一次，缺旧样本不无限重试。

只有现有主窗口可见、未最小化、未锁定、未挂起且未退出时，才允许激活读取。隐藏、托盘收起、最小化、锁屏、挂起和退出均停止 timer 并取消本窗口的在途请求。恢复与聚焦仍检查完整门控：`resume` 只解除挂起，`unlock-screen` 只解除锁定；监听在 renderer 加载前建立，避免页面加载或事件顺序提前重启天气。进程关闭后不承诺继续更新天气。

“随天气”的外观偏好与 `weatherEnabled` 是两件事。自动外观只采用有效天气；缺测、关闭或过期时明确回到声明时区的时间模式。手动主题保持用户所选的整套纸面、光照与场景关系，天气回执不改写手动偏好。外观预览作为独立草稿叠在当前底层之上；天气更新不覆盖预览，取消后回到最新底层，而非旧天气快照。具体投影由 [appearance.ts](../../src/renderer/appearance.ts) 负责。

## 已观察的证据与边界

- 前一实现轮通过正常 `Store(':memory:')` / 原 runtime 入口读取真实杭州公源：04:19 UTC 得到 WMO 1、`isDay:true`、current 时刻04:15；04:51 UTC 得到 WMO 2、current 时刻04:45，来源区间均为900秒。这是当时的模型回执，不是本文发布后的实时天气。
- 重复读取的 broker 回执为 miss → hit；改变用户 clock 时区后，天气地点时区仍为 `Asia/Shanghai`。关闭设置及单独撤销 grant 后均保持未知，UI 读取没有重新授予权限。
- 使用真实回执的到期时间后一个毫秒直接调用生产投影，得到 expired／unknown／`isDay:null`；这不冒充实际等待整个 TTL 的窗口操作。Store 关闭后的直接读取安全返回 disabled。
- 前一实现轮既有检查为282/282、Hermes 9/9。本次独立复核修复了锁定／挂起期间被 show、focus 或较早 resume 重新激活的路径，随后 `npm run check` 通过；没有新增测试、fixture、runner、模型或外部请求。
- 本文不声明重载后的 Electron IPC、真实锁屏／休眠硬件事件顺序、托盘恢复、天气与预览连续过程或最终房间画面已全部实机通过。这些由主代理在统一构建与重载后核验。

