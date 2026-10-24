# 接手现场：版本、已有资源、私人证据和操作边界

记录于2026-10-24，America/Los_Angeles。主代理本轮核Git与文件，八路审查核既有文本/源码及少量只读设备metadata；没有进行本轮产品运行、模型或账号验收。以下是接手坐标，未来使用前要重新核当前状态。

## 1. Git与共享工作树

| 项目 | 本轮实际观察 |
|---|---|
| 工作区 | `C:/Users/17601/Documents/ChatGPT/在场` |
| 当前分支/HEAD | `main`，`ddc5403cbf580b43f48935caf56c94b693a8ba26` |
| 远端 | `https://github.com/1760139151lkh-ctrl/zaichang`；`git ls-remote --heads origin`所见六个分支头均为上述SHA |
| 本地分支包含 | `codex/ci-pending-sync-20261022`、`codex/map-audit-integration`、`codex/personal-memory-continuity-20261018`、`main`各分支头均被当前HEAD包含；不能因分支仍在就认定功能未合 |
| 工作树 | 元数据快照时有百余个已跟踪修改、千余个未跟踪条目（精确数量及采集时刻见JSON），含当前源码、桥、专题文档与大量视觉资产；数字会随共享工作继续变化，不是垃圾数量或完成指标 |
| 仓库可见性 | `gh repo view --json ... visibility`实查为 **PUBLIC**，不是根据package的`private:true`或旧文档猜测 |
| 已发布包 | 项目包版本仍0.3.0；旧便携EXE、当前本地构建、源码远端、公共地图站点各是独立状态 |

详见[机器可读快照](WORKSPACE_SNAPSHOT.json)，含实际UTC采集时刻、真实package脚本与Hermes锁。它不冻结后续变化。

**大量当前实现不在HEAD提交内。** 接手先核已跟踪修改和全部未跟踪文件，不能只读`git show HEAD`、拉取远端干净版本或从旧EXE开始推断现状。保留共享成果，不reset、不强制覆盖、不空合并、不因数量大批删资产。另一个用户拥有的前端聊天仍可能在同一工作区工作；原委托禁止去消息它，不借“协调”重启/打断/接管其实例。当前只授权读取指定两个聊天写交接，未授权发送消息。

提交/推送时看显式文件、实际差异、来源及许可，不`git add -A`吞入所有未知资产和私有资料。源码同步、EXE打包发布和公开站点部署分别完成与报告。此交接轮没有commit/push，也没有创建新用户聊天、goal或自动化。

## 2. 哪份状态应当优先看

1. [本轮用户原话](USER_REQUEST.md)：新聊天先全貌/第一阶段全读，再从Stage02开头全新八路深做；每阶段持续创新至当前能达到的最好。
2. [当前纯直连修复](../../evidence/2026-10-24-tiyi-direct-repair.md)：HTTP协议与场馆独立认证已修，现有连接器与默认构建helper实测成功。不是本交接轮又查了一次账号。
3. [Stage02总记录](../../evidence/2026-10-23-stage02.md)和各专项：含当前补记与历史证据；按各项实际日期/版本/环境解释。
4. [Stage01真实交付](../../evidence/2026-10-23-stage01.md)：前序交付成立，但不免除新主代理完整阅读和对当前改动的必要复核。
5. 旧[HTTPS502记录](../../evidence/2026-10-24-stage02-direct.md)及更早WebVPN等待/失败保留历史，不再作现在必须手工登录WebVPN的理由。

两个旧聊天的元数据和语义区别见审查01/02。fork新增回合正常completed、`error:null`，其`get_goal`为null；继承了文字历史，不自动继承目标对象。原聊天过去的业务登录blocked也不证明模型死亡。用户当前主动新开是交接意图，不能包装成故障恢复。

## 3. 私人证据只给坐标，不复制正文

以下文件可能含私人身份、业务内容、运行标识或完整协议。新主代理有具体任务和当前许可时，通过原owner和必要范围核查；不整包输出、不把dpapi解密到公共文件、不从浏览器profile搬Cookie。

| 本机位置 | 用处和边界 |
|---|---|
| `C:/Users/17601/.codex/sessions/2026/10/23/rollout-2026-10-23T09-19-11-01a1698f-26ee-7822-9afd-647ab0dca74e.jsonl` | 原大聊天历史，约87MB。用户消息/公开回复/工具结果/加密reasoning要分别处理，避免整行打印巨大payload和图片字节 |
| `C:/Users/17601/.codex/sessions/2026/10/24/rollout-2026-10-24T00-14-33-01a1698f-26ee-7822-9afd-647ab0dca74e_01a16cc2-e1c4-7711-8027-d4c0eb0e7de0.jsonl` | 原聊天后续登录与Clash等回合；不将`interrupted`改写成模型错误 |
| `C:/Users/17601/.codex/sessions/2026/10/24/rollout-2026-10-24T00-47-52-01a16ce1-60ff-7003-bdd6-6ea6d58555a5.jsonl` | fork独立新增回合及元数据；继承历史由平台合成，不等于该文件又做一遍旧工作 |
| `C:/Users/17601/.codex/tmp/zaichang-stage01-20261023/continuation.md`、`continuation-stage02.md`、`continuation-stage02-latest.md` | 第一/二阶段私有接续；latest内部也有多个倒序追加时点，顶部旧HTTPS502已被新修复覆盖，更下方旧等待不能复活 |
| `C:/Users/17601/.codex/tmp/zaichang-network-diagnosis-20261024/direct` | 本聊天此前独立新登录和查询的DPAPI原响应/会话；有限状态JSON说明哪些回执成功，私人成绩/健康/轨迹并未进入交接 |
| `C:/Users/17601/.codex/tmp/zaichang-stage02-direct-20261024` | fork的修复前HTTPS失败结果和加密诊断，不是当前无法直连的证据 |
| `C:/Users/17601/.codex/tmp/zaichang-stage02-runtime-20261023` | 原主代理专用产品profile/独立校方Session与正常运动入口历史；不是新聊天可以接管或复制的默认用户profile |
| `%LOCALAPPDATA%/Zaichang/tiyi/native-current` | 官方App旧现场截图、层级和19项有限观察；不公开个人页面、原APK或健康记录，不用静态截图证明当前会话 |
| `%LOCALAPPDATA%/Zaichang/tiyi/connector.json`与独立目录同名配置 | 已有签名兼容组件/依赖等主机设置。只核配置是否可用，不输出值/密钥，不把原APK签名二进制随源码分发 |
| `%LOCALAPPDATA%/CodexZjuStudentInfo/credentials.dpapi`、已配置校园source/vault | 原校园凭据与加密bundle由既有连接器管理。读取源码和本交接不等于授权任意个人查询；需要查询时走正常入口和当前用途 |
| `%LOCALAPPDATA%/Zaichang/apple-location.json`或`ZAICHANG_IOS_SSH_CONFIG` | 私有Apple本机SSH配置；本轮只核存在，不读账号、密钥或全文 |

更多私有运动/停止/恢复证据位置见专题06和对应原阶段记录；它们只导航、不携带原测点与设备稳定身份。旧PID、窗口句柄、Node变量、临时session ID、ADB别名、模拟器UDID、登录状态与短票据都是当时现场，不复制成代码常量。

## 4. 可用设备和旧成果

本节简表来自[设备专题06](audits/06-workout-devices-and-map.md)的实际只读定位。版本/是否已登录/是否正在运行要按该报告标出的时间看，不把目录、进程或监听当完整可用证明。

| 资源 | 实际入口 | 继续工作应怎样理解 |
|---|---|---|
| MuMu与ADB | `C:/Program Files/Netease/MuMu/nx_main/MuMuNxMain.exe`、同目录`adb.exe`；设备程序在`nx_device/12.0/shell/` | 本轮看到既有进程、设备连接和官方体艺/在场位置桥安装。只读metadata，没有开运动、改定位或碰登录 |
| 官方浙大体艺 | 包`net.crigh.mysport`，MuMu正常界面 | 用户截图和历史逐页观察是需求/协议参照；当前账户可用、页面完整和在场已读取分别看 |
| 旧体艺电脑端 | `C:/Users/17601/Documents/Codex/2026-09-09/wo-d/work/zju-sports-desktop` | Tauri本机0.3.7预览及完整源码，报告和EXE在父工作区`outputs/`；不是已集成在场或独立可分发新版 |
| Android位置桥 | [源码和说明](../../../apps/location-bridge/android/README.md)，包`cn.zaichang.location` | 当前源码0.1.3；是debug开发位置provider，不是手机伴侣完整产品，不公开其ADB调试合同 |
| Android SDK/JDK | `C:/Users/17601/AppData/Local/Zaichang/android-development/sdk`、`jdk-17.0.16+8` | SDK35/build-tools35和JDK已存在；不要无必要重装。普通构建入口见bridge README |
| HDC | `C:/Users/17601/Documents/Codex/2026-09-09/wo-d/work/hdc-current/hdc.exe` | 发现工具/进程不等于鸿蒙真机在线；当前位置provider尚无可读HDC原生流 |
| 虚拟Mac | `C:/Users/17601/Documents/Codex/2026-10-03/https-www-aiformortals-co-blog-inkwell`，WSL `Inkwell-Lab` | 已有系统盘/Xcode/设备资料必须保留，不能因短时SSH失败重造VM或当缓存删除 |
| Mac可见/连接入口 | 本机SSH2222、VNC5902、[noVNC](http://127.0.0.1:6081/vnc.html?autoconnect=1&resize=scale) | 本轮只见监听；不证明Mac已解锁或Simulator健康。按`ios-develop`与当前工具状态正式进入 |
| iOS桥 | [源码和说明](../../../apps/location-bridge/ios/README.md) | 有Swift/CoreLocation与iPhone/iPad模拟回调历史实证；桥不是完整iOS/iPadApp，未以模拟器证明真人定位/正式后台能力 |

手机/平板后续产品明确先Swift iOS手机+iPad深入打磨，再转Android，统一灵魂和对象，不做两个差异巨大产品。已有Android位置桥用于第二阶段采样不等于提前交付Android手机版。

地图里已有真实运动控制卡和同owner指标；当前审读未见把运动points传入地图engine的轨迹绘制接口。实时运动轨迹、精度圈/计划路线对照和历史回放不能预填完成。当前只保一份本机运动草稿，不是完整历史运动库。模拟轨迹和本地结束不能代学校审核/有效记次。

## 5. 正常命令与依赖

命令必须以实际[package.json](../../../package.json)、[Hermes锁](../../../runtime/hermes/lock.json)、当前脚本和bridge README为准。下面仅列现有入口，不是要求接手时不加判断全部重跑：

```text
npm run check
npm test
npm run test:hermes
npm run build
npm run dev
npm run dev:luna:test
npm run start:luna:test
npm run review
npm run build:review
npm run preview
npm run package
```

模型实测只用当前已授权Luna，不测试调用DeepSeek；普通产品默认协议由代码保留，不因代测把默认换掉。是否需要真实模型要与要证明的行为相称，构建、原生API、模型自然选用与最终UI各有证据。

隔离产品验证按 `scripts/run-luna-test.mjs`、`testBoundary.ts`和现有启动方式设置独立资料目录。测试根须是资料目录的严格父目录，不能把两者设成同一路径；不要照抄旧进程/端口/窗口或抢占另一聊天正在用的profile。能复用现有正常入口就不造新runner。不同浏览器、产品自持学校Session与账号密码入口互不复制Cookie。

当前教务优先使用已配置/本机安装的 `C:/Users/17601/.codex/skills/zju-student-info`，项目`integrations/zju-student-info`在本轮未见。体艺签名兼容组件也有外部依赖。这些都是部署/独立运行必须解决并核许可的真实条件，不能把“本机能运行”写成新电脑自带。交付应用的持续文件和运行依赖最终不得依赖临时Codex进程/REPL；Codex工具可以帮助制作和验证，不充当产品后台。

旧公开地图仅含选定公共地图，不连接桌面数据、模型、学校账号或任意文件。源码更新不自动部署网站。旧版本EXE不包含新源码能力，打包也不自动发布。

## 6. 验证与清理现状

此前阶段记录有282项、Hermes9项、地图专项48项、真实Luna和设备流程；此次直连修复另有新认证、查询和最终构建/默认helper回读。每份只证明所记版本/环境/范围，不借数字扩大结论。

**本交接轮只做文档内容、来源、链接、目录、Git/元数据和有限源码一致性核查，没有重新跑产品模型、账号、UI、GPS或整套构建。** 交接文档检查不是新的功能验收。新聊天应按实际变化做必要验证，发现可修问题必须修和复查，不能拿禁写测试当免验条款。

本交接轮没有删除任何文件或清理缓存，原始材料、设备盘、SDK、APK、签名依赖、用户数据和诊断都保留。此前匿名节点诊断已停止本任务自有临时内核并清理含节点凭据的临时配置，具体文件/大小见纯直连修复记录，不能把那次清理说成本交接又清了一次。
