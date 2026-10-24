# 体艺完整范围、纯直连断点与第二阶段重开依据

本审计写于 2026-10-24。它为新聊天重新理解并做深 Stage 02 提供事实地图，不是第二阶段完成回执。此次只读取源码和已有非私密文档；没有查询本人账号、解析学校响应、操作 MuMu/产品窗口、改动业务代码或运行学校写操作。下文“实际观察”均注明来自已保存的哪份阶段记录，不能改写成本交接又做过一次现场验收。

## 1. 用户这次特别要求保住什么

体艺不是“订单查询器”，也不是读到一次 profile 就结束。应以官方账号实际开放的全部功能为范围，持续研究十九个入口及其深层子页、查询条件、页面原文、记录、动作和恢复。用户现已明确：下一聊天先从第一阶段和整个项目原件建立完整理解，再从第二阶段开头重新盘点、开启八个继承当前模型/努力的子代理做实质工作；保留已经做对的底座，重新验证和推进未完成部分。路线图只是简写，不是创新上限。不得把这份断点当成跳过全貌阅读的通行证。

每一阶段都应继续寻找当前可证实的缺口、有价值的整合和体验改进，修复已观察的在范围问题，直到本阶段要求和可执行的改进真正做到当前条件下的最好，再进入下一阶段。不能因学校网络一项已通、已有检查通过或代理报告“完成”就推进阶段。也不要用无期限口号代替可验收结果：遇到真设备、权限、当前服务等约束，要列明已试路线、仍缺证据、继续条件，同时完成其余独立工作。

完整能力的目标不会自动把学校写入提前到当前只读连接器：Stage 02 建立可靠认证、完整读取和真实运动底座；后续 B16 的真实学校动作仍沿原 Action、授权、对象修订、幂等、未知结果核查及学校回读合同落地。旧代码里关闭的上传开关不是永远禁止实现的产品决定，但也不能把本地运动结束、开始按钮、接口名或模拟定位改称学校有效打卡。

## 2. 四层成果必须分开记录

| 层次              | 当前真实对象                                                                                           | 能说明什么                                                                        | 不能据此声称什么                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 官方 Android 现场 | 10/23 阶段记录的 MuMu 官方体艺 2.9.7、保数据升级与随后正常主页；本轮未重新核当前安装版本               | 原生 App 在当时正常会话能读哪些页面、记录和子系统；可作需求、协议和比较依据       | 在场自身已取得同样正文、十九项深层全完、模拟器位置为真人运动       |
| 旧独立电脑端      | `C:/Users/17601/Documents/Codex/2026-09-09/wo-d/work/zju-sports-desktop`，Tauri/Windows 0.3.7 本机预览 | 已有协议理解、桌面宽屏查询、JS 页面适配、学期选择与报告图片经验                   | 它已合并在场、旧 EXE 独立分发可用、历史个人记录是当前账号回执      |
| 在场当前读取      | `TiyiAdapter → tiyi_connector.py → CapabilityBroker`，来源 `campus:zju-tiyi`                           | 当前独立认证、原始观察 owner、受限资源与模型去标投影；少数入口已有新真实 API 回执 | HTML/SPA 壳是本人记录、目录是账号授权、所有十九项已读或已完成      |
| 学校认可的动作    | 正式 App/正式业务流程或将来沿 Action 的真实提交与回读                                                  | 学校接受、订单、审核、计次等各自原回执                                            | 本地 GPS、实践积分、手记、页面加载或请求发出等同有效次数/预约/支付 |

新聊天对每项工作都应写清这四层中的哪一层，避免移植过程把旧能力降格成壳又宣布“全面接入”。

## 3. 当前纯直连的准确断点

权威记录是 [2026-10-24-tiyi-direct-repair.md](../../../evidence/2026-10-24-tiyi-direct-repair.md)。[stage02-direct](../../../evidence/2026-10-24-stage02-direct.md)保留修复前 HTTPS 502 的现场，不是当前无法连接的结论；[stage02-tiyi](../../../evidence/2026-10-23-stage02-tiyi.md)中的早期强制 HTTPS、WebVPN 认证中等描述也应按时序读取。

### 根因与可行路径

官方 2.9.x 使用的业务基址是 `http://www.tyys.zju.edu.cn/cgapp-server/`，课程使用 `http://www.tyys.zju.edu.cn/ptm/`。原连接器把学校原 HTTP 地址强改成 HTTPS：canonical `https://tyys.zju.edu.cn/cgapp-server/cas/appLogin` 在当时返回 nginx 502，`https://www.tyys.zju.edu.cn/...` 则有证书主机名不匹配。学校普通 HTTPS 官网能打开，不代表同一业务 API 的 HTTPS 可用。MuMu 原生正常与在场旧实现失败并不矛盾。

当前源码已恢复官方原协议与注册的 CAS service，保留回调原 scheme/host。账号密码只交给 `https://zjuam.zju.edu.cn/cas/login`，公钥从其 `/cas/v2/getPubKey` 取得，UAA Cookie 强制仅在加密请求发送；体艺服务票据、令牌和业务数据按学校现行 HTTP 业务接口传输，不能说“全程加密”。没有关闭 TLS 证书校验、伪造 Host、导入其他浏览器 Cookie 或扩大任意 URL。

`Connection.__init__` 使用 `urllib.request.ProxyHandler({})`，因此这一 Python direct 路径显式绕过环境/系统代理，不依赖当前 Clash 选择的节点。此前八份订阅的全局校园直连规则已命中；对每份所选节点的匿名比较仅反映各被选出口，不证明一个订阅所有节点好坏。既已确认协议差异，不应再把“给所有订阅重复加规则”当主要修复。当前成功路线没有 WebVPN 中间层；WebVPN 仍是用户明确选择才使用的备选，不会 direct 失败后自动转入。

### 已取得的在场真实回执

下表是 10 月 24 日原修复任务经现有 `TiyiAdapter` 正常入口所得，不包含个人值：

| 资源                      | 记录中的实际结果                                                                             | 覆盖解释                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `profile`                 | 独立私有目录此前无 session，完成新 UAA 认证、HTTP 业务回调及账号匹配；`fresh`，业务 code 200 | 本次返回的本人资料；身份原值留本机                                                           |
| `terms`                   | `partial`，真实学期列表及原快照下一页地址                                                    | 正常有界展开，不是学校接口失败，也不是全列表已读                                             |
| `summary`                 | `fresh`，真实锻炼汇总                                                                        | 学校本次汇总，不自动覆盖全部历史或解释适用规则                                               |
| `records`                 | `partial`，真实流水及原快照下一页地址                                                        | 须沿原 snapshot/pointer 续读；未宣称全历史读完                                               |
| `venues + subpage=orders` | 修复独立场馆登录后 `fresh`，业务 code 200、正常分页结构                                      | “本人相关订单”可能包含同伴关联；不保证一定有订单，不含新预约/支付                            |
| 默认构建 helper           | 最终构建后不再指定源码 helper，重新读 `profile` 与订单均 `fresh`；helper 与源码 SHA-256 一致 | 排除了仅源码路径有效而正常构建仍旧版；仍不等于 renderer 卡片、Broker、真实模型十九项全链验收 |

场馆最初业务 401 的第二个根因也已修：`/venue/login` 只有 SPA 壳，官方客户端还要 GET `/venue-server/api/app/login/init`，只解析其 OAuth token，再空表单 POST `/venue-server/api/login`，取得独立场馆 `access_token`。业务 `cgAuthorization` 以后使用场馆 token，`cgappauthorization` 仍是 native token；场馆返回账号必须匹配 native 本人会话。连接器不访问 init 返回值中可能附带的地址，令牌不返回为模型业务正文。

在可选 `TiyiSchoolSession` 也同步放开上述两个精确认证路径/方法与空表单限制，原五个只读 GET 之外没有预约、支付或上传。此次 direct 成功没有调用 WebVPN 桥，因此不能声称可选桥已完成认证后同样实测。

原任务已经完成 Python 语法、TypeScript 和完整构建；没有新增测试/fixture/runner。没有改默认产品数据库、总校园读取或体艺读取开关；没有操作用户的 MuMu 会话。下一聊天应先核当前实际连接方式与许可，再沿正常界面、Broker/主模型和资源 owner 验证需要的范围，不能把独立连接验证视作已替用户打开全产品读取。

## 4. 当前十九项逐项地图

本表源于当前 `src/shared/tiyi.ts`、`src/main/capabilities/tiyi.ts`、`src/main/integrations/tiyi_connector.py`、旧电脑端覆盖报告，以及 [10 月 23 日体艺证据](../../../evidence/2026-10-23-stage02-tiyi.md)的原生十九项观察。MuMu 一列仅指当轮已记录的原生现场；旧电脑端是其历史报告和源码，均不能冒充最新在场回执。

| ID / 资源                              | MuMu 官方入口已观察范围                                                                | 旧电脑端可复用积累                                                     | 在场当前实现、缺口与继续方向                                                                                                                                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 77 `study_records` 修学记录            | 该入口明确未查询到记录                                                                 | 查询页曾返回同类明确空结果                                             | 当前走菜单、子系统授权和 HTML 提取，`official_page/recordRead=false`。需取得在场当前实际表格/JSON、筛选范围及明确空态来源；不能用 HTML 壳判断无记录。                                                                                                                                  |
| 5 `exercise` 课外锻炼                  | 当前学期评分/有效次数、有效/全部流水、单条里程时长配速轨迹、历史评分可见；未全历史读完 | 独立原生列表、学期/月/周和有效状态筛选、学校统计、轨迹配速详情         | `exercise/records` 直读 `sportlist`；配套 `terms/summary/statistics/record_detail/rules` 已实现。最新真实成功仅汇总和分页流水等上表范围。须读完所需原页，核学校有效/待审/无效及 `validCount`、适用学期/规则；详情/统计/规则、课程联动和主模型理解仍各验，精细轨迹不进入模型。          |
| 76 `notices` 活动预告                  | 列表加载，未逐篇全文                                                                   | 活动列表、搜索、分页、默认浏览器开官方原文                             | 已直读 `home_notice/advance_notice`，并非仅 HTML，但尚无 10/24 新直连成功记载。应继续原通知正文、日期/适用范围、原来源打开与正文连续读取；列表/摘要不能当全文已读，通知不是报名许可。                                                                                                  |
| 43 `teams` 运动队                      | 可申请队伍列表；本人代表队页明确角色无权限                                             | 列表、本人队伍与考勤路由                                               | HTML 页面与 `mine/attendance` 子页；原路径 `/cts/app/sportsTeamList`、`/cts/app/mySignList`。须读取真实动态列表/本人状态、权限差异和深页；申请、退出、现场签到另立动作，不能把账号无权限改成连接坏。                                                                                   |
| 78 `westward` 西迁活动                 | 子系统明确登录过期，背景零值不算统计                                                   | 历史同样保留过期异常                                                   | 菜单与子系统授权/HTML，尚无成功业务正文。需研究当前独立登录与实际页面请求，分清过期、停服、权限和确无活动，不回填零值。                                                                                                                                                                |
| 75 `counselling` 辅导站                | 当前学期考勤明确无数据，加载更多仍同；未报名/签到                                      | `openView` 适配、`records` 直达，13 个学校学期，历史↔当前切换曾实测    | HTML 和 `subpage=records` `/ms/jwt/app/student/attendance/record`；目前仅解析 HTML select，不执行 MUI/JS 学期切换。需真实学期范围、记录分页和主界面接续；报名/签到动作另核。                                                                                                           |
| 69 `counts` 次数查询                   | 当前学期稳定页暂无数据；历史选择器预览不是历史已查                                     | 主界面学校学期下拉、历史与当前查询                                     | 当前 HTML；旧页面 `/ptm/jwt/app/bank/exercise/student/query`，触发 `tabsNav`。需把真实学校学期和动态结果接入受限资源，不能与 `termSportTotal` 或实践积分盲相加。                                                                                                                       |
| 61 `venues` 场馆服务                   | SSO 返回历史预约管理；类型、日期、时段网格可见；未选位/下单                            | 场馆/艺术中心、个人中心、订单、同伴、培训；校区→场馆→场地→次日时段查询 | 当前有五个精确 GET：目录、日期时段、相关订单、同伴、培训，含独立场馆登录；`mine` 仍为 HTML。10/24 只有订单已获新真实成功。须在场正常入口验证普通/艺术目录、原 ID 和日期映射、容量限制、价格、上下游分页、过期恢复；同伴姓名电话和门锁/预约码不可带入模型。预约、取消、支付等尚未提供。 |
| 50 `fitness_attendance` 身体素质课考勤 | 当前入口无课程，不推断其他学期                                                         | 旧现场 HTTP 502，未通过                                                | HTML 入口已支持，当前在场尚缺业务正文。旧 502、MuMu 当前空课程、在场未知三者分开；研究课程/学期/考勤明细与学校当前真实状态。                                                                                                                                                           |
| 67 `training` 培训课程                 | 培训目录可读，本人报名页明确无报名                                                     | 班次、费用、时间、人数；未报名/支付                                    | 当前直接 `venue/trains` 零基学校分页，返回 `training_catalog`，不是本人报名；尚缺新成功回执与报名记录读取。继续班次详情、适用条件、名额、本人报名/订单关系，保留目录与报名的不同来源。                                                                                                 |
| 3 `fitness` 体测                       | 当年本人项目、总分上下部分加载；健康值仅本机                                           | `results/schedule/feedback` 直达、宽屏字体                             | 当前仅 HTML 及 `/pft/app/resultList`、`/pft/app/schedulestudent`、`/pft/app/feedback/my` 子页。须取得当前在场实际成绩项目、学年、日历和既有反馈正文；不能把预约日历加载说成已预约。健康信息按用途必要范围处理。                                                                        |
| 37 `competitions` 我的比赛             | 赛事目录/本人菜单；本人成绩明确无数据；报名/证书深层未读                               | 学校赛事列表入口；历史无赛事发布                                       | HTML `/gms` 页面，缺动态赛事、本人参赛、成绩和证书深层。继续核当前赛事与具体条件、正文/附件、本人记录；报名、资料提交、证书导出分别验证。                                                                                                                                              |
| 23 `classes` 上课考勤                  | 当前课程和逐次考勤；摘要与日期口径分开                                                 | 当前/历史课程和逐次考勤                                                | 当前专门 JSON：`course_terms→courses/classes→attendance`，先核学校学年/学期和本人的 courseId。尚无本次新直连课程回执。应核所需历史学期、逐次状态、日期范围、缺勤摘要含义，防止把未到日期说成旷课；现场签到不是读取。                                                                   |
| 73 `venue_entries` 场馆出入记录        | 当前学期明确无入场数据，不证明历史全空                                                 | 学校 13 学期、历史↔当前切换                                            | 当前 HTML，旧路由 `/ptm/jwt/app/zju/venue_entrance/student/query`、`selectTerm`。应接实际学校学期、原出入流水与分页；入场不证明运动完成或预约使用。                                                                                                                                    |
| 72 `feedback` 意见反馈                 | 我的反馈当前无条目；未进/提交表单                                                      | 我的反馈/我要反馈入口                                                  | 当前 HTML，只读已有页面；需要现有反馈内容、状态、分页与消息回执，不把空屏当全历史空。新反馈是写操作，不自动提交。                                                                                                                                                                      |
| 62 `venue_live` 场地实况               | 学校人数统计、刷新时间可见                                                             | 人数统计页面                                                           | 当前 HTML，尚缺在场真实数据。需获取实际计数、观测时间、范围和更新方式；不能以“实时”名义启动无限轮询，也不能把传感器零值说成现场无人。                                                                                                                                                  |
| 81 `graduation_courses` 体测与锻炼课   | 当前学期只有稳定标题，无成绩明细                                                       | 13 学期与切换；历史/当前均仅标题，未核个人成绩                         | 当前 HTML；旧 `/ptm/jwt/app/zju/graduation/student/home`、`selectTerm`。须研究动态成绩来源、适用年级/学年与空态，不能以选择器可切或标题显示声称毕业课程完成。                                                                                                                          |
| 84 `graduation_report` 毕业体艺报告    | 宣传封面和底图渲染，滚到底未见本人指标                                                 | 原学校两图实际载入/主界面预览；后续个人报告未全验                      | 当前仅提取图片 URL/文字，不下载/渲染/理解报告图片，`recordRead=false`。应沿合法原页面完整读图、区分宣传与本人报告、保留来源/版本，不能从图链接/封面推断本人毕业结论。                                                                                                                  |
| 85 `codoon` 咕咚运动                   | 独立 UAA 空表单，未绑定或第三方授权                                                    | 独立 OAuth 窗与服务状态，账号内仍待授权                                | 当前 host allowlist 不允许任意第三方；可能明确返回需 App/独立授权。应先核当前合同、用户同意和账户范围，禁止把体艺 token/签名发给咕咚；只有学校入口不等于咕咚功能接通。                                                                                                                 |

十九项之外仍有 profile、账号菜单、学校学期、当前/历史汇总、原始流水、详情、学校统计、运动规则、课程学期/课程/逐次考勤，以及搜索、收藏、读原文、保留上次合法结果、退出与恢复等横向工作流。完整集成应围绕用户的实际问题自然组合这些能力，不能机械把十九个按钮排成新面板。

## 5. 关键源码合同与原始文件导航

### 在场的唯一链路

- [`src/shared/tiyi.ts`](../../../../src/shared/tiyi.ts)：十九项 ID 与资源、查询参数、`TiyiObservation`、分页和覆盖。来源 ID 固定 `campus:zju-tiyi`。
- [`src/main/tiyiAdapter.ts`](../../../../src/main/tiyiAdapter.ts)：宿主持有 helper/配置路径，固定 JSON stdin 调 Python；模型不能选账号、文件、URL 或 shell。`describe/catalog/authenticate/read` 是直接调用入口。取消时结束 Python/签名器所属进程树；总超时 120 秒。
- [`src/main/integrations/tiyi_connector.py`](../../../../src/main/integrations/tiyi_connector.py)：认证、DPAPI、签名、受限请求和原观察。重点读 `safe_url`、`SchoolCookiePolicy`、`Connection.__init__/fetch/authenticate/api`、`module_page`、`venue_configuration/venue_request/venue_login/venue_discovery/venue_records`、`resource`、`main` 全链，不能只看 BASE 一行。
- [`src/main/capabilities/tiyi.ts`](../../../../src/main/capabilities/tiyi.ts)：`tiyi.catalog`、`tiyi.read` 及十九项能力；模型必须满足总校园读取和体艺子许可、本人/现实/私人受众、允许来源和用途。调用前后复核；资料投影保护身份、精细轨迹、联系人、门锁/预约码等。
- [`src/main/main.ts`](../../../../src/main/main.ts)：正常产品 `TiyiAdapter` 与构建 helper 绑定、连接方式持久化、`tiyi:status/connect/disconnect`、权限撤回取消与窗口关闭。`fresh` profile 后才授体艺子许可；总校园许可关闭时早退；保存 direct/webvpn 不等于保存授权或登录。
- [`src/main/preload.ts`](../../../../src/main/preload.ts)、[`src/shared/types.ts`](../../../../src/shared/types.ts)、[`src/renderer/TiyiConnection.tsx`](../../../../src/renderer/TiyiConnection.tsx)、[`src/renderer/SettingsPanel.tsx`](../../../../src/renderer/SettingsPanel.tsx)：实际校园连接设置与有限 Bridge。重开记住方式、停止仍留校园资料页/键盘焦点有旧实测；10/24 独立 API 成功不替代最新 UI 验收。
- [`src/main/tiyiSchoolSession.ts`](../../../../src/main/tiyiSchoolSession.ts)、[`src/main/integrations/tiyi-transport.ts`](../../../../src/main/integrations/tiyi-transport.ts)：仅可选学校 WebVPN 自持分区。不要重新制造 WebVPN 是 direct 必需品的前提。
- [`src/main/runtime/skills.ts`](../../../../src/main/runtime/skills.ts)：`campus-sports` 方法区分本地运动、体艺学校记录、教务实践和导入材料；同一运动摘要入口为 [`capabilities/workout.ts`](../../../../src/main/capabilities/workout.ts)，状态 owner 为 `WorkoutSessionKernel`。体艺接入不另造运动库或聊天循环。

### 原旧电脑端必须真正读到的原件

旧工作区根：`C:/Users/17601/Documents/Codex/2026-09-09/wo-d/`；旧项目根：该工作区的 `work/zju-sports-desktop/`。下表所有路径均相对旧工作区根。不得把源码/文档之外的用户数据、个人截图、票据或旧 profile 搬入仓库。

| 原件                                                                                                                                                                                    | 提炼内容                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work/zju-sports-desktop/README.md` 全文                                                                                                                                                | 0.3.7 本机依赖、已接入与未验证范围、学校动作边界、打包组件错误；旧 EXE 不是独立可分发成品                                                                                 |
| `outputs/功能覆盖核对.md` 全文                                                                                                                                                          | 十九项逐项已核范围与异常；此文件**不在**旧项目根目录                                                                                                                      |
| `outputs/开发预览说明.md` 全文                                                                                                                                                          | 0.3.3–0.3.7 的实际历史成果与交付位置；个人截图不进入公共交接                                                                                                              |
| `work/zju-sports-desktop/src-tauri/src/mobile_api.rs`                                                                                                                                   | 认证/五段专用会话、签名与子系统授权、动态账号菜单、模块导航、摘要/流水/通知/学期/统计；其实际后部还含约 1411 行的课程与 1476 行的详情，不能只读路线图旧“1–1250”范围就漏掉 |
| `work/zju-sports-desktop/src-tauri/src/mobile_bridge.js`                                                                                                                                | 仅在精确学校 CAS 回调接 `getUserName`；了解合同，不把旧页面桥原封不动复制到 renderer                                                                                      |
| `work/zju-sports-desktop/src-tauri/src/module_routes.rs`                                                                                                                                | PFT 成绩/日历/反馈、队伍/考勤、辅导站及场馆延迟目标；先完成场馆登录再进子页                                                                                               |
| `work/zju-sports-desktop/src-tauri/src/business_bridge.js`、同目录 `read_page.js`                                                                                                       | 原 App JS bridge、openView、当前页面/iframe/表格/网络结果、可见性与关闭选择器噪声、请求未完和真实空态。当前 Python 静态 HTML 不能自动继承这层能力                         |
| `work/zju-sports-desktop/src-tauri/src/query_terms.rs/js`                                                                                                                               | 69/73/75/81 四类学期选择，精确页面、选项标签与 JS picker 归属复核，切完再读结果；应提炼真实数据合同，不暴露任意页面执行能力                                               |
| `work/zju-sports-desktop/src-tauri/src/report_images.rs/js`                                                                                                                             | 正确报告路径、已加载图片、尺寸/数量/PNG实值限制、页面切换版本，保留原图而非只记 URL                                                                                       |
| `work/zju-sports-desktop/src-tauri/src/team_navigation.rs/js`、同目录 `codoon.rs`                                                                                                       | 队伍子页与咕咚独立 OAuth；账户内未授权部分仍未知                                                                                                                          |
| `work/zju-sports-desktop/docs/mobile-gps-port.md`、`work/zju-sports-desktop/web/workout-core.js`、同目录 `workout-recorder.js`、`work/zju-sports-desktop/src-tauri/src/phone_bridge.rs` | 旧演示/真实设备的区别、定位 provider 和手机官方接续；`workout-core.js` 实际在 **web/**，不是路线图旧写的 src/                                                             |

旧电脑端采用 WebView2 执行学校页面 JS 并采集其当前呈现；在场当前 Python `Page(HTMLParser)` 不执行学校 JS。因此迁移必须明确选择“把已确认的动态接口接为受限读取”或“经产品独立受限页面取真实渲染内容”等可评审路线，核来源、身份、动态加载、退出和正文覆盖；不能为填满表格把 HTML 标题改成成功，也不应把旧大桥泛化为任意网页命令。

### 阶段依据与证据的阅读次序

1. [TIYI_READING_PLAN](../../../reading/2026-10-22/TIYI_READING_PLAN.md)、[08 专题摘要](../../../../work/deep-refactor-20261022/summary/08_zju_tiyi.md)及其 `08_zju_tiyi-coverage.json`：原用户要求、来源和分阶段约束。它们描述的是 10/22 当时状态，不覆盖后来已实现的运动 owner。
2. [主路线图 Stage 02](../../../REFACTOR_ROADMAP_2026-10-22.md)、[阶段总记录](../../../evidence/2026-10-23-stage02.md)、[体艺专记](../../../evidence/2026-10-23-stage02-tiyi.md)：完整范围、原生十九入口、原始失败和新增实现。
3. [学校自持通道审查](../../../evidence/2026-10-23-stage02-school-transport.md)、[修复前直连复核](../../../evidence/2026-10-24-stage02-direct.md)、[最新纯直连修复](../../../evidence/2026-10-24-tiyi-direct-repair.md)：按时序辨认旧失败/当前成功，最终结论不回退。
4. [运动内核](../../../evidence/2026-10-23-stage02-workout.md)、[Android 时钟](../../../evidence/2026-10-23-stage02-android-clock.md)、[计步](../../../evidence/2026-10-23-stage02-cadence.md)、[iOS](../../../evidence/2026-10-23-stage02-ios-location.md)、[几何](../../../evidence/2026-10-23-stage02-geometry.md)、[伴侣运动](../../../evidence/2026-10-23-stage02-companion-workout.md)、[桌面集成复核](../../../evidence/2026-10-23-stage02-desktop.md)、[独立审查](../../../evidence/2026-10-23-stage02-adversarial.md)：避免把同一模拟器的内核/Native 身份、学校记录和主模型体验混为一类验收。

## 6. 分页、来源、个人数据与重开不能丢的细节

- `tiyi.catalog` 是本机用法目录；`menus` 才是学校账号动态目录，仍不证明每项可读。`enable`、`authenticationMethod`、学校原 URL/tokenUrl 都须按当前返回核对，不以固定十九项常量伪造账号权限。
- 观察按账号关联、资源和查询条件保存 `snapshotId`。`snapshotId/pointer/offset` 是同份不可变响应内续读；不先强制联网、不混新旧响应。更换条件或 `refresh` 是新查询。订单/培训的 `upstreamPage` 是学校零基新请求，不能与本机 offset 混用；按 `upstreamNext` 继续，不能拿一页或 page=-1 就声称全部。
- 列表与长文本有有界展开，字符串每页 6000 Unicode 码点；大型对象可能先返回 children 导航。`navigationOnly`、`official_page`、`catalog`、只拿字段目录和被 Broker 预算省略都不构成个人正文已读。`coverage.extent=returned_response` 仅覆盖收到的响应，不是校方全历史。
- `fresh/saved/partial/auth_required/unavailable` 与“真的读到什么”各自表达。保存的原文保留原抓取时间，不能重读旧快照就冒称刚刚联网。空数据、当前无权限、子系统过期、HTTP错误、业务 code 与格式变化分开。
- 本人运动详情先查自己的 `sportId/tableName`；考勤先核学校 `schoolYear/termId` 和本人课程，不能接受任意学生/课程 ID。场地 ID 必须由同账号、同普通/艺术模式的学校目录重新核对，按学校 `Asia/Shanghai` 日期查询；不从电脑本地时区猜日期或学期。
- 运动 `isValid`、`validCount`、学校汇总 `tips/datas`、原始条数、教务实践积分、学校有效计次各有语义，不能相加或替换。课程摘要缺勤数字不自动等于截至今日已发生旷课；未来日期与统计口径须核。
- 当前 `rules` 读取学校 sporttype/invalidconf；新公开 2026 两份制度 PDF 只是适用规则原文来源，不是硬编码分数阈值或本人进度。按专业、年级、学年和具体条款核适用，不能只凭旧评分表断言毕业资格。
- 原始响应字节、会话、原始错误和身份/健康/精细位置留 DPAPI owner；模型只得受限去标内容。联系人、电话、姓名、门锁密码、预约码和可恢复 token 不可因为新增订单/同伴能力而泄漏。学校页面或错误正文也不能签发新权限或变成产品指令。
- 连接方式是宿主元数据 `tiyi_connection_via`，不是许可；总 `campus:read` 和 `campus:tiyi:read` 各自核。撤回时取消在途并关闭自有校方窗；重新开启总权限不自动授子权限。旧合法来源与撤回范围分别处理，恢复偏好不能恢复过期批准。
- 在场现有本地运动唯一 owner、加密草稿、模拟来源粘性、取消 fence 和待停采清理应继续复用。MuMu 缺真实步频传感器时保持未知；模拟器和 iOS 模拟流的成功不证明真人户外精度、真机锁屏/后台或学校认可。

## 7. 本机设施与配置位置（仅地址，不含内容）

这些是后续有授权时定位的地址，不是本交接阅读或拷贝内容的要求：

| 位置                                                                                       | 归属与注意事项                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `%LOCALAPPDATA%/CodexZjuStudentInfo/credentials.dpapi`                                     | 已有校园账号 owner；不打印、不搬入项目。当前 direct 可按正常连接器使用，不在模型参数指定账号                                                                                   |
| 正常 Electron `app.getPath('userData')/tiyi/`                                              | 当前产品体艺私有目录；`session.dpapi/device.dpapi/observations/cache/failures/last-failure.dpapi` 是加密状态。具体当前 userData 应从正常进程定位，不能假定所有独立预览共用目录 |
| 当前私有目录 `connector.json`；回退 `%LOCALAPPDATA%/Zaichang/tiyi/connector.json`          | `legacyDirectory/signerDirectory/signerDependencies` 宿主配置。局部配置存在时独占选择，不从旧回退偷偷恢复缺字段；本审计未读取配置内容                                          |
| `ZAICHANG_TIYI_SIGNER_DIRECTORY`、`ZAICHANG_TIYI_SIGNER_DEPENDENCIES`、`ZAICHANG_PYTHON`   | 主机环境入口；不让模型传路径。签名原 APK 兼容组件由本机另供，不进公共源码                                                                                                      |
| `%LOCALAPPDATA%/local.zju.sports.desktop/`                                                 | 旧电脑端会话迁移输入，如 `app-session.dpapi`；有文件不等于当前会话有效，不导入其他 browser profile                                                                             |
| `%LOCALAPPDATA%/Zaichang/tiyi/native-current/`                                             | 原 MuMu 十九项私有清单和截图；登记过 `84-native-resource-evidence.json`。含身份/健康/轨迹的材料只本机，不能公开复制                                                            |
| Electron `persist:zaichang-tiyi-school`                                                    | 可选 WebVPN 产品自有分区。浏览器中已有登录与此分区不是同一会话，不提取 Chrome/Codex Cookie                                                                                     |
| 旧 `outputs/浙大体艺_本机预览_0.3.7.exe` 与 `work/zju-sports-desktop` / `work/python-deps` | 有用的现有电脑端设施；历史预览依赖本机环境，独立打包曾失败。运行前核当前文件/依赖与用户窗口，不为研究清数据或覆盖会话                                                          |

## 8. 接下来怎样真正做深

完成全项目、第一阶段及本专题原件阅读后，八路团队应围绕共享接入合同划清写文件归属；认证/主进程/Broker交界按依赖合并，由主代理亲自验集成。体艺工作至少应覆盖以下连续闭环，不能只让一个子代理填“十九项支持”表：

1. **保持现已可用的 pure direct 基线。** 先核当前工作树、构建 helper 和默认正常入口，尊重当前 direct 选择与许可；不要重开 HTTPS 强改错误、盲切代理或把用户重新导入 WebVPN。精确复查学校当前协议变化时保留证据。
2. **逐项取得真实数据与深页。** 用 MuMu 官方当前 UI、旧电脑端和当前公开客户端合同比较，以最小受限读取接入当前在场。每项列“目录/原生页面/在场原正文/深层筛选/实际动作”的证据层次；逐页读完所需正文和图，不凭名字或空壳收工。
3. **补齐旧成果在迁移中尚未达到的部分。** 四类学期切换、动态体测/队伍/比赛/辅导站、报告图片、通知原文、当前/历史与退出恢复尤其要认真复用；旧实现已解决的问题不应在新项目变成永久“待完善”。
4. **围绕人在校园里的一次真实需要组合能力。** 例如“本学期已认定多少、待审哪条、接下来怎么安排”要同时核学校适用规则、计次截止、原记录和已有课程/天气/地图来源，再由主模型自然回应；“想找个可用场地”先沿原目录/日期/限制看选择，不把空闲表直接当预约完成。要创新真实连接与体验，不新增无关仪表盘或固定安慰话术。
5. **完整交互和恢复留在同一对象。** 查询接收、停止、失败、恢复、原快照续读、原学期/选择/焦点、键盘与减少动态均要实际走。设计改动需先读指定 Product Design Director、先有对应 GPT Image 稿，再转活组件；源码检查或静态截图不能替代当前集成界面与过程。
6. **把将来学校全功能动作预备清楚。** 逐项整理预约/取消、报名/退出、意见反馈、体测预约、现场签到、上传/审核/支付等官方流程、对象身份、原授权和真实回执，而不是在 Stage 02 的只读 helper 偷开 POST。按路线图到 B16 时落到原 Action owner；未知结果先核原对象，不盲重发，模拟轨迹永不送校。
7. **阶段退出看实际目标。** 在场当前尚未全读十九项动态正文、未全验证真机移动/锁屏/学校写入，也未完成所有角色长期运动陪伴；未到该阶段的动作标清后续依赖，属于本阶段的正确性和体验缺口继续修。凡实际观察到在范围缺陷，诊断→修复→同触发重查，主代理对集成验收负责。

本交接无需为文档改动机械重跑产品构建；本次只核了上述实际源码/记录及文档内容。没有新增测试、fixture、runner、临时脚本、凭据副本或清理文件。
