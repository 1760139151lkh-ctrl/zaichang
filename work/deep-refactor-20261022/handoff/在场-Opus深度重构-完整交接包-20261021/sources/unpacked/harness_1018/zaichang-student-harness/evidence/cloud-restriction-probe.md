# 本机传输门禁隔离探针

本证据针对固定提交 ba73b049089af718d337076364c6db0f98776d4f 中的 localCloudRestriction。2026-10-18 实际从只读快照读取 authoredControls 与 localCloudRestriction 原函数体，在 Node VM 中执行。仅去掉函数 TypeScript 类型标注，将 hasCredentials 设为恒 false，以隔离语言匹配的影响。没有调用模型、网络、用户 API、数据库或 Electron。

实际结果保存在 [probe-cloud-restriction-results.json](probe-cloud-restriction-results.json)。其中 cloudBlocked=true 只表示该原函数返回 true。整个请求为何随后不进入主回路，是 [当前源码审阅第 4 节](current-memory-attention-audit.md) 追踪调用链的静态结论，不是端到端运行证明。

## 已证实结果

“不必解释云端部署，帮我记明天的课程”返回 true，显示对任务内容的否定被误当作禁止向云模型发送。“不要联网查，直接用我给你的课本讲解”也返回 true，而“不用上网查资料，就依据这道题推导”返回 false。这要求分开网页搜索限制与云模型传输限制；修复不能先上传用户明确禁止发送的文本再请云模型分类。

真正的本机限定“这段只在本机分析，不要发给云模型”返回 true，是应保留的保护。另两个基准输入见 JSON。六例并不构成完整语言覆盖，也不意味着全部 Harness 测试已通过或失败。

## 在 Codex 的已有仓库上复查

包内 [probe-cloud-restriction.cjs](probe-cloud-restriction.cjs) 是可移植的同一探针包装器，不包含私有源码，也没有固定临时目录依赖。将仓库路径作为唯一参数：

    node evidence/probe-cloud-restriction.cjs /path/to/zaichang

脚本只读两个指定源文件，输出其 SHA-256 和相同输入的布尔结果。它不执行 git，也不声称已核定用户本地 checkout 的 commit。运行前由实施者记录当前 git commit 与工作区差异；要对照历史证据，请选择上述固定提交。修复后若函数结构已变化而提取匹配不到，脚本会说明需要更新诊断适配器，这不是产品失败结论。

如果将修复发展成正式测试，建议从真实传输/工具授权边界做集成断言，不长期依赖源文本正则提取。覆盖相同语义换措辞、相同词面换作用域、引用与原话、局部禁令加独立任务，以及真正禁止上传时零云请求。不要为本探针六句话添加六个生产特例。
