# 第二阶段：产品自己的体艺校园连接

2026-10-23。本文记录对 `src/main/tiyiSchoolSession.ts` 的独立审查与修复，不把浏览器已有登录、学校页面打开或本机类型检查当作十九项本人记录已读。

## 最早分叉与修复

本机安装的 Electron 是 44.3.0。旧实现使用 `session.fetch({ redirect: 'manual' })`，等待 302 回复后再读取 `Location`。该版本的 Fetch 适配仅监听普通响应与错误，而底层手动跳转在没有同步继续时会结束请求，因而这条链不能按旧写法取得认证跳转。这一点由[同版 Fetch 源码](https://raw.githubusercontent.com/electron/electron/v44.3.0/lib/browser/api/net-fetch.ts)与[同版 ClientRequest 源码](https://raw.githubusercontent.com/electron/electron/v44.3.0/lib/common/api/net-client-request.ts)共同确认。

修复改用 `net.request`，仍使用产品自己的持久 Session。跳转事件交回状态与目标后立即中止当前请求；不会跟随跳转发送原有请求头或正文。Python 取得原始学校目标后，下一次仍需经过宿主检查。事件语义与 Session 凭据选项以 [Electron ClientRequest 文档](https://www.electronjs.org/docs/latest/api/client-request)为依据。

这条方式能取得跳转状态与目标，不能取得跳转响应正文。因此该次 302 的空正文不能被描述为已保存原始正文。普通响应则按实际读取的字节保存，单次上限为 8 MiB。

## 同时修复的边界

- UAA 只走 HTTPS。`service` 仅接受原应用的 HTTP `www.tyys` 标识与两个已知 HTTPS 体艺标识，目标包括完整协议、主机与路径，额外端口、凭据、查询与片段均无法通过精确匹配。重复 `service` 也不会通过。
- 解开 WebVPN 跳转后重新检查原学校地址；应用授权和签名头不会交给 UAA，Cookie、Set-Cookie 与其它响应头不会进入 Python。
- 登录窗拒绝外部弹窗、下载与设备权限，没有 preload 或 Node 能力。编码过的代理前缀不能绕过原有主机检查。
- `gatewayStatus` 分开表达已确认登录、确实需要登录与本次暂时没核清。网络故障保留原有 Cookie，但不以旧路由声称本次成功；下一次会重新检查。较早的取消不会覆盖较新的成功检查。
- 检查与读取都受 25 秒上限及取消约束。`closeLogin()` 只关闭本产品的窗口，`cancelRequests()` 后仍可继续合法连接；退出时的 `dispose()` 才永久关闭实例并阻止迟到回复恢复状态。
- 登录页面加载失败只交回具体的人话，不把可能含认证票据的原 URL 放进 IPC 错误。

## 场馆读取的精确补充

随后亲读了本机保存的当前官方场馆主脚本 `chingo.2fa40da1.js` 中的请求函数 `V`、签名函数 `Y`，以及订单、培训和同伴列表的四份页面脚本。列表调用沿主函数默认的 GET；相邻的删除和保存调用另行显式使用 POST。宿主因此只补充以下三条完整 GET 路径：

- `/venue-server/api/orders/mine`：学生分支的本人订单，不开放管理员订单路径。
- `/venue-server/api/venue/trains`：培训列表，不据此冒称本人已经报名。
- `/venue-server/api/buddies`：本人账号的同伴列表。

首次扩展时，`cgappauthorization` 请求头仅用于这三条路径，登录窗的请求检查同样限制 GET。没有开放整个 `venue-server`、详情路径或任何新的 POST。类型检查实际退出 0；尚未取得这三项的实际本人 JSON 回复，不把静态脚本与路径支持记作读取成功。

其后又亲读了当前主脚本引用的 `chunk-7fcac090.46b26c39.js` 中 `getVenueInfo` 与 `getReserveDate`，两者仍沿 `V` 默认 GET，只新增：

- `/venue-server/api/reservation/campus/venue/info`：发现校区、场馆和场地。源码参数为 `schoolType`、`sportType`，艺术页面另外带 `isArt`。
- `/venue-server/api/reservation/day/info`：查看场地日期时段。源码参数为已发现的 `venueSiteId`、`searchDate`，普通用户不启用 CONCAT 或售票管理员的 `reservationType`、`schoolType` 分支。

当前精确集合因此为上述五条 GET，`cgappauthorization` 也仅限这个集合。没有增加预约、预占、订单提交、支付、码、修改同伴或任何 POST。日期时段回复里的 `token` 在源码中交给 `orderToken`；这类值留在私有连接器，不进入模型或公开内容。类型检查再次退出 0，实际接口读取仍需自持认证后的真实结果。

## 连接方式的保存与恢复

另独立核查主进程的 `tiyi_connection_via` 元数据：只将精确的 `webvpn` 恢复为 WebVPN，其余值回到直连，只影响 `getTransport` 的选择。写入方式后仍先核校园读取许可，再核学校会话与新 profile；这条元数据不调用授权，也不证明登录仍然有效。新的 Session 不从该元数据恢复路由或认证状态。

原 `PolicyKernel` 会独立保存用户明确设置的 grants/revoked，合法旧许可是否仍有效归原权限 owner，不能把“记住连接方式”写成“恢复许可”，也不能反过来说重开一定清空所有合法许可。以上为源码核查，未为这条元数据改动再次打开窗口或声称重启实测。

同时发现并交由连接器 owner 修复了登录格式边界，随后亲读确认：过期时间必须为有限、非负数，JWT 三段必须非空且符合 base64url 形式，并保留长度及 secret 检查。非有限数不会再绕过过期判断。协议中的零值保持原含义，不据此宣称当前登录有效；连接按钮仍以新的学校 profile 回复核实。

## 亲读范围与核查结果

已亲读两项总监技能及十份专项规范、产品设计/基础/导航入口，当前体艺 Adapter、Python 连接器、能力注册、共享结构与主进程入口，以及独立旧桌面项目的 README 和 `mobile_api.rs` 认证、会话、签名部分。原委托有关外部连接、退出恢复与校园数据口径的原话亦已回查。

当前桥对象不进入模型参数；模型选择资源、原快照与正文位置，不选择账号、Cookie、任意 URL 或外壳命令。学校菜单页面与延迟加载的本人记录仍有明确区别；本地运动没有变成学校有效记次或学校上传。连接器的离线原快照读取继续保留原采集时间与分页位置。

已直接核对连接按钮使用 `refresh: true` 取得新 profile 观察，且产品自己的 UAA 会话不再先要求旧凭据文件存在。它可复用有效应用登录；这不等于本次已经通过现场认证。签名兼容组件仍由本机独立提供，未复制原应用二进制到公开源码。

修改后 `npm run check` 实际退出 0。没有新增测试、夹具或运行器，没有读取其他浏览器的 Cookie、凭据或 profile，没有更改用户 VPN、代理规则或官方 App。

首次真实 Electron 入口刷新得到的是 `unavailable`，尚未取得预期的 `login_required`，因此上述源码判断没有被记作现场通过。后续移除了把请求 Writable 的 `close` 当作 HTTP 失败的判断；上传流结束不等于网络回复结束。失败状态现有仅含固定错误码、HTTP 状态与严格筛选的 `net::ERR_*` 的本机诊断，帮助实际入口继续定位，不输出地址、正文或凭据。关窗后的页面事件也增加了当前窗口身份与销毁状态检查，避免迟到加载事件再次发起连接检查。

随后主代理重新构建，在正常 Electron 的实际体艺卡片中再次执行 `refreshGateway: true`，画面显示“在场的学校 WebVPN 会话需要登录”，不再显示 `unavailable`。这次没有弹出登录窗，也没有读取任何其他浏览器的 Cookie。同一入口的原失败触发已重新核查并恢复。该次没有在 stdout 读取 HTTP 状态或 `Location`，所以不将它写作亲见原始 302 回复。

另以独立空 Electron 资料目录启动正常产品进程，通过已有 preload Bridge 逐步复核主进程边界，没有注入替身或新增运行器：

- 关闭 `campus:read` 后，`tiyiConnect` 即交回“校园资料的读取已关闭”，自有窗口仍为一个，`readAllowed` 为 false。该早退分支位于个人服务调用之前。
- 单独重新开启 `campus:read` 后，`readAllowed` 仍为 false，没有自动授予体艺子权限。
- 正常 WebVPN 连接打开该独立进程自己的空校方窗，自有窗口数从一变二；本机诊断实际记录 `WEBVPN_LOGIN_REQUIRED` 与 HTTP 302。
- 随后撤回父权限，自有校方窗立即关闭，窗口数回到一，状态继续为不可读取；稍后再读状态仍无窗口。该独立进程随后正常退出。

没有输入认证表单，没有读取其他浏览器 Cookie，也没有碰主代理已交给用户的登录窗口。独立资料目录仍能看见旧本机兼容组件及凭据文件“是否存在”的描述元数据，这不表示读取或复制了凭据，也不表示空窗口有学校认证。有限结果保存在本机私有证据中，不包含 URL、正文或凭据。

本次没有人为制造断网或延长在途请求，因而没有重复网络不可用现场，也没有直接见证 HTTP 正文传输中的取消。实际自持登录、认证后本人资料读取和十九项本人资源仍继续核查；本文不将这些未完成观察记作通过。
