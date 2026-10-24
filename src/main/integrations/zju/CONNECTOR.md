# 在场教务只读连接器

本目录携带 `zju-student-info` 的必要运行源码，使用 Python 3.11+ 标准库；桌面版优先使用随应用分发的 Python，也可使用用户配置的 Python。入口为 `scripts/zju.py`，原有 `academic`、`quick`、`select`、`read`、`history`、`diff`、资源与字段目录保持同一合同。

源码与公开协议、模型、校历配置的引入清单和逐文件 SHA-256 在 `upstream.json`；修改文件另保留引入时的 SHA 和修改说明。学业模型、绩点映射与校历处理参考并改编自 Celechron 固定提交 `94e0ca63ed961febf4d852bcdf81cfa8bdc653bd`，原 GPL-3.0 许可证保留在 `LICENSE`，原归因保留在 `references/source-attribution.md`。此目录不包含测试代码或个人查询回执。

凭据与完整数据仍由原 `vault.py` 使用 Windows CurrentUser DPAPI 保存到 `%LOCALAPPDATA%/CodexZjuStudentInfo`。已有本机数据可继续读取，不搬进应用资源、源码或 Git；在另一 Windows 账号或电脑上需要通过本机凭据窗口重新录入，不能把旧加密文件当作可跨设备的账号凭据。

连接器只读取本人学校资料。课程、考试和成绩保留原来源、学期、分页、采集时间与完整性；这里没有预约、签到、支付、退选或其他业务写入入口。学校查询与本机保存观察均不表示用户实际出席或已执行安排。考试原行没有时间文字，只说明接口这次没有返回时刻，不自动判断校方尚未公布或这门课不考试。
