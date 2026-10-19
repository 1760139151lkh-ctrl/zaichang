# 校园保存快照接入原规划

本批在 `e4254aa` 工作树上继续接线，仍沿原ZjuAdapter的查询、认证和缺包补齐语义；没有第二查询执行桥、第二课表或日历写入器。用户最新目标要求暂不验证，本文件只记录源码契约，没有学校账号、模型、调度或实际规划运行结果。

`CampusSnapshotProofs`只为原连接器实际返回、当前账号history能定位的bundle签发宿主证明。证明绑定连接器root、加密账号/保存head和实际bundle字节；模型给hash不能签发。当前已签发资源或组合版本可供同一planner采用前重核，重启后不恢复。涉及多bundle的join/resources结果没有逐bundle契约时不签主bundle冒充整个结果。

`readCampusPlanningConstraints`按窗口与原连接器学期约定读取课程、考试、停课和待公布，分页覆盖与结束未知分别保留。未知结束不能因overlap入口把它当瞬时记录而漏掉；停课按规则身份与原日期对应。固定同bundle的schedule_quality投影保留未展开规则及官方校历校核状态，不向模型开放任意pointer。部分覆盖、时间未知或生成质量不可核不当作空档。

当前保存的校园安排进入原PlanningApplicationService的busy与sourceCoverage，票据采用前仍核当前账号、来源与版本；它们没有复制进本机agenda，也不证明出席或本人有空。NativeCampusCalendar通过有限Bridge提供同一份只读窗口，显式私人读取可以沿原认证路径进行，公开展示前后均拒绝交付。外部执行仍按原业务授权。

本地保存变化由原coordinator drain链比较加密元数据stamp：只有活跃、当前可读且来源许可的托付才参与；初见只建基线，变化经原DomainService/journal/attention传递。暂停或暂不可读的消费者保留pending，独立合法事项继续。stamp不解密、不联网、不进入模型，也不证明学校刚发布了新安排。没有新timer或后台主循环；模型关闭时延到原调度恢复，断开连接本身不产生学校变化事件。

仍需后续工作：本批90秒能力边界可能被首次认证/补采耗尽；组合来源未有逐bundle证明；旧持久规划意图原有required_refresh不会由校园port自动抹掉；其他外源仍缺各自resolver。真实校园账号、保存变动唤醒、课程质量字段与采用行为尚未运行。手机日历同步、预约和外发不由这条桥实现。

源码入口：`actions/planning-campus.ts`、`capabilities/campus-saved-source.ts`、`zjuAdapter.ts`、`actions/planning-application.ts`、`runtime/planning-intents.ts`、`capabilities/builtin.ts`及`runtime/campus-calendar.ts`。显示层沿共享`campus-calendar.ts`契约；前端实施与图稿范围见当前状态。
