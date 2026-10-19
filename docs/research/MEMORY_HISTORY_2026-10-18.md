# 让理解的变化可以回读

这项能力直接回应记忆讨论中“现实中何时成立”和“系统当时以为什么”的区别，以及按需解释理解变化的需要。沿用现有Assertion与原文所有者，模型通过`read_understanding(view=history)`读取同一稳定ID的修订；不增加人物档案、自由摘要或另一套记忆库。

`h_assertion_revision_log`在原SQLite事务内记录宿主时间、操作、前版本及精确变化原话地址。SUPPORT、例外、真实变化、纠正和停止分别保留；SUPERSEDE与例外的新旧对象有可继续读取的关联。旧版本没有宿主提交记录时保持`legacy_unknown`，不从原文日期或旧`recordedFrom`推算。现实有效区间仍来自原Assertion，`knownAt`与`validAt`是两条不同时间轴。

历史页保留各版条件、例外、状态和结构差异，按固定修订上界分页。每个旧正文独立核当前引用、来源版本与许可；纠正、删除、撤权或退出本轮范围时只保留当前仍可读的变化定位，不恢复旧正文。历史读取不会使旧事实重新参与当前规划或恢复批准。已提供的历史修订在后续模型边界复核，原始历史工具链不会进入跨回合模型缓存。

实现入口为`src/main/memory/history.ts`、`MemoryService.commitVerified`、`KernelRepository`的宿主修订日志，以及现有`read_understanding`。记忆方法可发现这条路径，使用者不需要管理ID、版本或游标。上游Mem0的[history实现](https://github.com/mem0ai/mem0/blob/main/mem0/memory/storage.py)提供操作账本的比较输入；在场没有采用其复制old/new全文的路径，而是复用既有版本与合法引用。

按用户最新要求，本项实施期间没有新增测试、fixture或runner，也没有运行测试或真实模型；源码接线和方法说明已落盘，运行效果不以此前检查数字背书。文件/PDF专属历史、跨设备同步及长期语义质量不由这项接口宣称完成。
