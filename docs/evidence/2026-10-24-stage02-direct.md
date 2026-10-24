# 第二阶段：按最新网络状态重试直连

> 本页保留修复前的真实 HTTPS 失败复核。随后已按用户要求完成[体艺纯直连恢复](2026-10-24-tiyi-direct-repair.md)，新登录与实际查询成功；当前能力以该修复记录和 CURRENT_STATUS 为准。

2026-10-24。用户说明刚切换过节点，要求优先继续直连、能不用 WebVPN 就不用。本轮据当前现场重新操作，不沿用昨天的失败来作结论，也没有要求重新登录 WebVPN。

## 产品连接器的实际结果

主代理直接调用现有 `TiyiAdapter.authenticate()`，随后用普通 `read({ resource: 'profile', refresh: true })` 再核已有会话路径；两次都没有提供 WebVPN transport。连接组件、校园凭据和保存会话均实际存在。两次返回均为 `unavailable / APP_SERVICE_UNAVAILABLE / HTTP 502`，没有取得个人业务正文。

主代理再沿原加密诊断读取有限状态，仅显示主机、路径和 HTTP 状态，不显示查询参数、票据、账号、Cookie 或正文。实际链为：

| 原请求路径 | 实际状态 |
|---|---|
| `zjuam.zju.edu.cn/cas/login` | 200 |
| `zjuam.zju.edu.cn/cas/v2/getPubKey` | 200 |
| `zjuam.zju.edu.cn/cas/login`，提交后及接续 | 302、302 |
| `tyys.zju.edu.cn/cgapp-server/cas/appLogin` | 502 |

这是本轮真实统一认证后的业务入口失败，不能改写成缺少用户授权或要求再次手动输入账号。个人观察和完整诊断仅保存在本机加密存储。

## 网络路径的独立复核

独立成员从现有源码确认地址后，以无凭据普通请求分别检查无代理直出和当前 Clash 代理；相同的 canonical HTTPS 业务入口两路都返回 502，TLS 校验本身通过。Python 默认 `ProxyHandler()` 会识别当前 Windows 代理；本轮已单独比较两条出口，不能仅凭名字“直连”判断进程绕过了代理。

`https://www.tyys.zju.edu.cn/` 的同一业务路径在两路均遇证书域名不匹配。实际证书覆盖 `*.zju.edu.cn` 与 `zju.edu.cn`，不覆盖 `www.tyys.zju.edu.cn`。未绕过证书验证。

已知旧页面的跳转也分别核到：canonical `/ptm/loginto` 指向 HTTP 旧登录；`/pft/loginto` 和 `/gms/loginto` 指向 HTTPS `www` 旧登录。canonical `/ggtypt/login` 虽 HTTP 200，正文是 `ERROR CODE 401`，没有可用登录表单，未当作安全替代成功。无凭据 HTTP 入口的 302 仅用于确认旧协议差别，没有沿 HTTP 发送任何认证。

## 本轮结论与范围

继续遵循用户最新偏好，以直连为优先，WebVPN 保留为明确选择的备选。当前代码中 direct 失败不会自动切 WebVPN；本轮没有改代理、Clash、证书规则或源码来掩盖上游失败。

上述证据来自现有产品连接器的正常入口。复用原产品资料目录的启动尝试在取得窗口前退出 0，未确认其退出原因；当前另有产品实例运行，没有强制争用目录。本文不宣称已经把运行实例的保存方式改成直连。

本轮未新增测试、fixture、runner，也没有源码变更，因此未机械重跑构建。已核正常调用结果、加密诊断的有限状态与两条真实网络出口；第二阶段本人业务读取仍未完成。没有清理文件，私人诊断继续留本机。
