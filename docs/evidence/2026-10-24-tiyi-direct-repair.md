# 体艺纯直连恢复

2026-10-24。用户展示 MuMu 官方体艺 App 正常主页，明确要求在场直接访问，不使用 WebVPN。本次针对连接协议修复，不宣布第二阶段或十九项全部读取完成。

## 原因与实现

学校统一认证 HTTPS 可用，但当前 canonical HTTPS 体艺业务回调返回 nginx 502，www HTTPS 入口证书主机名不匹配；官方旧 HTTP 业务入口可达。此前连接器把学校原 HTTP 地址强制改成 HTTPS，并按传输方式选择不同业务地址，因而 Clash 直连已经命中仍无法登录业务。官网 HTTPS 可用不能证明业务 API 的 HTTPS 可用。

现有八份 Clash 订阅共用全局校园直连规则，后续订阅扩展未覆盖它。本轮各选一个配置节点作匿名对照：三个可达出口与无代理直出均表现为 HTTPS 502、HTTP 正常登录跳转；其余所选节点出现握手或超时，不能据此判定整个订阅无效。没有继续重复写同一规则或切换用户当前节点。

`src/main/integrations/tiyi_connector.py` 现在沿官方原协议使用 HTTP www 业务基址与 CAS service，保留回调原协议和主机；课程基址同样恢复官方 HTTP www。Python 显式关闭该连接器的环境/系统代理，direct 不依赖所选 Clash 节点。统一认证仅准 HTTPS 的两个既有后端路径，业务请求限原体艺域和既有模块/场馆接口；UAA Cookie 即使服务端遗漏 Secure 也只经加密请求发送。未关闭证书校验、复制浏览器 Cookie 或新增学校业务写入。

这一选择保留官方现有 HTTP 业务的传输取舍：账号密码仅交给 HTTPS UAA，体艺服务票据、业务令牌和业务数据仍经过 HTTP。不能描述成全程加密。WebVPN 保留为显式可选方式，direct 不自动转入它。

## 正常入口的实际结果

本机已有校园凭据和签名组件。以独立私有目录、显式最终源码 helper 和不存在的 legacy 会话目录，直接执行现有 `TiyiAdapter.authenticate()`；此前该目录没有 session。实际完成新 UAA 认证、原 HTTP 业务回调和本人 profile 读取，返回 `fresh`，原始业务 JSON `code=200`，profile 的账号归属校验通过。

主代理亲读原 owner 的 DPAPI 回执，只投影 scheme、host、path 和 HTTP 状态：UAA 登录/公钥均 HTTPS 200，登录接续 302；HTTP www 体艺回调 302→200；HTTP www 本人资料 API 200。未打印查询参数、凭据、身份数值或原文。

继续通过同一现有连接器得到：

| 查询 | 实际结果 |
|---|---|
| 本人资料 | 新认证后的 `fresh`，完整当前响应 |
| 学期 | `partial`，真实列表和原快照下一页地址；属于正常有界分页 |
| 锻炼汇总 | `fresh`，真实业务回复 |
| 锻炼流水 | `partial`，真实列表和原快照下一页地址；未冒充全历史已读 |
| 场馆订单 | 修复独立场馆登录后 `fresh`，JSON `code=200` 和正常分页结构；不声称一定存在订单 |

## 场馆的独立缺步与修复

最初订单查询返回业务 401。实际 `/venue/login` 只提供 SPA 壳，当前官方网页还会 GET `/venue-server/api/app/login/init`，解析其 OAuth token，再空表单 POST `/venue-server/api/login`。后续 `cgAuthorization` 必须是该登录返回的场馆 token，`cgappauthorization` 仍为 native token；此前连接器跳过这两步，把 native token 同时用于两个头。

现按公开客户端合同补齐该交换；只解析返回的 `oauth_token`，不访问其中携带的地址；令牌仅留本次 Connection 内存及原加密响应，不返回为业务数据。场馆登录的账号须与 native 本人会话一致，并沿此身份节点传递去标来源，场馆或课程名称不会被统统当人名。重查原订单触发，初始化、登录、订单接口均 HTTP 200，最终业务 `code=200`。

`src/main/tiyiSchoolSession.ts` 对仍保留的可选宿主通道同步允许这两个精确认证地址与各自方法，OAuth 头仅可用于空表单登录 POST；原五个只读接口之外没有新增预约、签到、支付或上传能力。此次成功路径没有调用该 WebVPN 通道，不将静态边界检查说成其认证实测。

## 最终验证与边界

Python 语法检查、现有 TypeScript 检查、完整 `npm run build` 均通过，保留 Vite 既有模块扩展名提示和大 chunk 提示。构建后不再指定源码 helper，直接通过 TiyiAdapter 的默认构建 helper，重新取得本人 profile 与场馆订单的 `fresh` 回执；构建 helper 与最终 Python 源码 SHA-256 一致。没有编写测试、fixture 或 runner。新旧失败回执和本人原文仍留本机 DPAPI，不进入公共源码。

本次没有改默认产品数据库、校园/体艺读取开关，或操作用户当前 MuMu 会话。独立连接验证成功不表示已替用户开启默认产品的读取许可，也不证明所有十九项子模块或学校业务写入完成。完整阶段继续由原第二阶段记录维护。

临时匿名节点诊断内核已停止，含节点凭据的临时配置和日志已清理；所删文件逻辑大小分别为 3.301 KB、0.396 KB、0.005 KB、32 KB，不宣称等于实际回收磁盘空间。没有清理共享项目文件或个人数据。
