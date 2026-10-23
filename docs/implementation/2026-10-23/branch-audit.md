# 全分支功能审计 · 2026-10-23

审计基线：`6d5dcc1dd4b3bab7053a333366c6661a21e1b571`，当前工作分支 `codex/personal-memory-continuity-20261018`。远端核对时间为 2026-10-23 00:21 PDT 前后。该时间点的结论是：**GitHub 六个分支和本地四个分支的提交内容均已进入当前提交历史，无需再次 merge 或 cherry-pick；本地 `main` 指针仍落后，需要在本轮最终成果核查后同步。历史合并不等于功能及视觉验收。**

本报告只新增自身文件，未修改源码、分支指针或其他工作树，未提交或推送。开场 `git status --short` 为空；本轮其他代理随后新增的 `docs/implementation/` 内容属于共享工作，未据此重写开场状态。

## 取数与覆盖

- 完整读取本次《在场前端优化.md》；任务书明确要求全分支功能融合及最终 GitHub 同步，覆盖旧阶段只本地与暂停安排。阅读仓库 AGENTS、README、项目导航、当前状态和此前合并交接，按真实源码核对关键功能链。
- 首次 `git fetch --all` 的 Git HTTPS 直连返回 `Recv failure: Connection was reset`；直接 curl 也出现同类错误。此为网络操作失败，没有模型会话终止。
- `gh api repos/1760139151lkh-ctrl/zaichang/branches --paginate` 成功返回全部六个分支。读到 Windows 已有系统代理后，用单次 `git -c http.proxy=http://127.0.0.1:7897 fetch --all` 成功取回全部分支；同参数 `ls-remote --heads origin` 再次确认六个分支和完整 SHA 与本地远端引用一致。未更改全局或仓库代理配置。
- 远端 fetch 规则为 `+refs/heads/*:refs/remotes/origin/*`，没有仅拉部分分支。`origin/HEAD` 是指向默认分支的符号引用，不计作第七分支。
- 以下“当前独有/该分支独有”取自 `git rev-list --left-right --count HEAD...<ref>`；右侧全为零，表示没有尚未进入当前提交历史的分支提交，不把树差异误称为未合并提交。

## 全部分支与提交关系

| 引用 | 头提交 | 当前独有 / 该分支独有 | 结论 |
| --- | --- | --- | --- |
| 本地 `codex/personal-memory-continuity-20261018` | `6d5dcc1dd4b3bab7053a333366c6661a21e1b571` | 0 / 0 | 当前集成基线 |
| 本地 `main` | `4edd9225d745e394a7642a064cc3e184195eea4c` | 19 / 0 | 旧指针；成果不在该指针之后丢失，远端 main 已更新 |
| 本地 `codex/map-audit-integration` | `e16d3fe575feb4edef72f42bc6a129bc3d6b58fe` | 22 / 0 | 地图及发布记录祖先已吸收 |
| 本地 `codex/ci-pending-sync-20261022` | `ad71c41a52ab5c25622502d3b885025f0d6feaf2` | 1 / 0 | CI 修复及本机 70 文件进展已吸收 |
| 远端 `main` | `6d5dcc1dd4b3bab7053a333366c6661a21e1b571` | 0 / 0 | 与当前基线相同 |
| 远端 `codex/personal-memory-continuity-20261018` | `6d5dcc1dd4b3bab7053a333366c6661a21e1b571` | 0 / 0 | 与当前基线相同 |
| 远端 `codex/memory-proactive-harness-20261018` | `c7cff22884fe9a3050879067dd49012f685d8cfd` | 21 / 0 | 记忆、后台调查、规划已吸收并继续演进 |
| 远端 `codex/window-continuity-20261022` | `499933d7a4a0c32812ffc6843f5b07c1b3f8ea29` | 12 / 0 | 阅读保护与窄窗布局已吸收；后续布局调整需本轮实看 |
| 远端 `design/image-first-checkpoint-20261018` | `e9f3860f27293ebc656240463a6a7d427a20d064` | 26 / 0 | 资料阅读、留下、角色选择、今天页等第一批界面已吸收 |
| 远端 `design/windowlight-continuation-20261018` | `319a0231d28c1ad0c8d5914319e4d2baac878d91` | 25 / 0 | 本地检索、托付管理、校园与对话地图已吸收 |

关键汇合点：

1. `74e099a2a3e23d0e7fffb075a1c1e22727976004` 的父提交为 `0c4e50f`、`319a023`；`319a023` 的前序包括 `e9f3860`。两个 design 分支先经此处进入主线。
2. `fa9b03779139aab162e7e11b20f9ddfc3d54d59a` 的三个父提交为 `75af077`、`499933d`、`424e759`，将地图建模资料主线、阅读空间分支及记忆/人格/OpenUI 分支汇合。
3. `ad71c41a52ab5c25622502d3b885025f0d6feaf2` 的父提交为 `fa9b037`、`327a855`，合入本机后续来源、资料、校园及环境修正；`6d5dcc1` 随后只增加 CI 同步记录和状态说明。
4. 本地额外保存引用 `refs/opus-checkpoints/start-20261021` 并非工作分支。其提交 `d3c730c` 在图上独立，但树 SHA 为 `926b4dabb612a2001147affc674b8d6f57446a1f`，与主线 `e150b0f` 完全相同；两者 `git diff --stat` 和 `--name-status` 均为空。无需为了保留内容再合入该快照。

## 按功能核对实际吸收情况

### 地图审计主线与本地旧 main

`codex/map-audit-integration` 的头提交只修正文档中便携版启动与解压等待说明；其前序地图工程已在后续主线内。当前仍复用 `src/renderer/map/CampusMap.tsx`、`src/main/mapService.ts` 和共享地图路由。比较该头到当前，地图范围仅继续修改同一 MapService、共享 surface、ConversationMap 及其样式，没有出现另一套地图实现或分支独占地图数据。

本地 `main@4edd922` 的头改动仅保留原 Harness 讨论字节；后续功能在当前分支及远端 main 内。该指针应在交付时前移，不能通过切回旧 main 开发来覆盖现有成果。

### 第一批 image-first 界面

原分支实际增加了 `MaterialsPanel`、原生资料 Bridge、资料阅读/导出、角色画廊、笔记工作区、今天页及设置重排，不只有图稿。当前保留其原入口：

- `src/main/materials/service.ts` 的 `nativeList` / `nativeReadPage` / `nativeOriginal` 仍经资料 owner 和字节 SHA 核验；`src/main/main.ts` 的 `materials:list/read/export` 与 `preload.ts` 接在同一链。
- `App.tsx` 中资料原文与对话仍并置，新增的 `ReadingDivider` 沿同一已挂载工作区调宽度；没有把阅读器替换成静态图。
- 原分支将引文拼接进自由草稿的旧做法已由当前 typed `MaterialQuoteReference`、独立可取消引用和主进程 `nativeQuote` 代替；这是后续有意改进，不能把旧版 `quoteMaterial` 机械覆盖回来。
- `NotesPanel`、`Workspace`、`CompanionSettings` 和 `SettingsPanel` 均仍在主界面使用；未发现从 `e9f3860` 到当前删除其产品源码文件。保留文件及接线只证明实现吸收，不代表本轮视觉和完整操作通过。

### windowlight 本地检索、托付与校园场景

原分支新增的 `src/main/search.ts`、`LocalSearchPanel.tsx`、`EntrustedPanel.tsx`、共享 search/attention-control 契约，在 `319a023..HEAD` 比较中无改动，原功能被完整保留：

- 本地检索用 Unicode 地址、消息/笔记版本和资料 SHA 导航；分页、取消及来源变化在原 owner 上处理。当前 `main.ts` 创建 `LocalSearchService`，`preload.ts` 提供 `searchLocal/searchResolve/searchCancel`，面板实际调用这些接口。
- 托付面板调用 `attentionList/attentionChange`；原生点击由 `NativeControls` 记成明确 user_control，再用同对象 revision 和 controlVersion 暂停、继续或结束，未改成只改前端状态。
- 校园与地图 Scene 仍沿 `AssistantPresentation` 和 `ConversationMap` 呈现；当前 focus 组合保留同一挂载对象、同一地图相机记忆，扩展和收回只改变显示空间。没有恢复旧独立地图/假业务回执。

### memory-proactive 的记忆、调查及规划

亲读原提交 `c7cff22` 的记忆提取、范围限制、上下文分页、后台调查、机会定时器、规划草案/采用、空气质量与角色绑定改动，再沿当前同名模块和入口核对：

- 提取重试用内容身份和幂等键，资源不足保持 pending；精确原话更正与限制仍在 `memory/model.ts` / `memory/service.ts` 演进，未回退到按候选数组位置去重或把预算耗尽记为无个人事实。
- `BackgroundDelegation` 仍由同一 `Harness` 创建，子调查保持原托付范围、来源、预算、当前性和实际采用检查；`OpportunityScheduler` 仍由 `main.ts` 连接 `attention.nextReviewAt`，不是第二个后台代理循环。
- `planning.draft`、`PlanningApplicationService` 与原 `LocalCalendarService` 保留 `planRef`、完整工作/准备/收尾/转场/休息/留白、按顺序采用、事务前版本核验及真实提交后账本。当前再增加持久意图、恢复及同份方案采用卡；不得用旧分支版本覆盖这些后续责任。
- `air_quality.lookup` 保留独立 AQI 制式、缺测和覆盖含义。原提交的 UTC 五天窗已由当前地点当地自然日窗口替代（`air-quality.ts` 的 `dateInZone/dayBounds`），本轮融合应保留后者。
- 人格与形象解耦、显式绑定仍保留，当前增加更多预设与来源材料。角色选择不被当作新权限或已完成业务动作。

### window-continuity 的阅读保护

原 `499933d` 把 Electron 最小宽度降为 420，加入长答复自动阅读空间、窄窗不挤窗边、切换时保存滚动锚点，并收窄窗景与人物区域。当前 `main.ts` 仍为 `minWidth: 420`，`App.tsx` 仍有 `chatSpace`、`compactConversation`、`needsReadingRoom`、`atWindow` 和阅读锚点恢复，窄窗规则也仍在。

合并后人物显示改为可直接拖动/缩放的 `companion-placement-area`，quiet 时隐藏人物；这吸收了阅读保护的目的。但 `.window-room` 左界从旧分支的 55% 改到当前 44%，不是字节完全相同的布局。因此本轮不能仅凭祖先关系声称植物侵入已解决，应按上传参考图在真实宽/窄窗口核验裁切与遮罩。

### personal-memory 与 CI-pending 的双线汇合

`424e759` 一线包含各角色表达、工具发现、通知/提醒、交互程序与来源快照，`fa9b037` 又加入资料 typed quote、Note 学习题源、Scene focus、今天试放和可调整人物。当前这些实现同时存在：`InteractiveProgramView` 及共享 interactive 库保留；`SceneComposition` / `ReadingDivider` / `AgendaDayTimeline` 均接在现有入口，没有互相替代。

`327a855` 一线的资料导航、公共文字解码、真实当地时间/天气统计、公共/个人空间来源和校园快照修正，经 `ad71c41` 继续并入。特别核对了合并易冲突的资料接缝：typed quote 读取和普通资料工具读取共同进入 `RuntimeCoordinator.recordMaterialRead`；context receipt 保留 `materialNavigationSources`，没有只保留其中一套导入。

当前 `ZjuAdapter` 仍区分 saved_snapshot 与 live_session；真实存在 reading identity 才比较其变化，固定快照版本、账号成员和读前后绑定门继续保留。不得回用旧分支的“没有 readingIdentity 即账号变化”判断，也不能把 CI 修复误理解为取消账号检查。

## 本轮需要主代理收口的融合点

这些是当前集成实现和本次要求之间的差距，不是尚未拉取的分支：

| 范围 | 实际证据 | 本轮处理 |
| --- | --- | --- |
| 角色素材 | `companion.tsx` 的爱音/灯仍 import `../../assets/brand/mark.svg`，保留了角色 ID 但尚无对应实际形象 | 换为本轮审定的真实人物资产并检查全部调用处；占位不能计作多角色交付 |
| 旧新图稿保存 | 交接列出的 22 PNG/19 唯一内容在此前 CI 同步时缺失；`git cat-file -t 9e0391b7...` 当前也取不到历史声称的冻结对象 | 对本次 ZIP、图库及本轮新图逐哈希确认；可恢复就恢复真实字节，不能拿 manifest 或旧图冒充原稿 |
| 窗景与阅读保护 | 旧 55% 窗景裁切后来改为 44%，人物改用独立位置区域 | 在本轮实际内容与相近窗口中看边界、植物和遮罩；保留可直接操纵与阅读锚点 |
| 学习与 Note 原题 | 历史 handoff 明确原题重复、共享原文方案未完成，现仅有 typed Note 题源和 focus 两面并置 | 按本轮学习/批注链修整实际信息关系，不能以两个面板存在当完整融合 |
| 原生资料与地图 | 历史保存点明确完整附件选择→引用→笔记→重开回原文、地图 focus 快速往返与手势尚未全部实查 | 沿真实 Electron Bridge 及当前状态核操作；不回滚到原分支旧引用字符串 |
| 日程 | 当前 AgendaDayTimeline 与规划采用同在，历史正常试放/确认/撤回范围有限 | 继续同对象身份/版本链，核实际复杂布局与本轮新增交互 |
| 最终主分支 | 本地 main 仍在 4edd922，远端 main 与当前基线相同 | 最终已核成果提交后更新本地 main 并按本次明确授权同步 GitHub；保留旧工作分支 |

没有发现必须从旧分支另挑提交才能补齐的功能，也没有发现需要以丢弃某个分支为代价的产品互斥。真正冲突是旧实现与后续责任的取舍：保留当前 typed 来源、同对象动作和真实 owner；视觉可以重做，不能把旧字符串引用、UTC 日界或弱来源检查覆盖回来。

## 证据边界与复查命令

本项为分支及源码审计，没有启动产品、调用模型或账号，也没有新写/扩展任何测试代码或 runner。此前 CI 文档中的通过记录只保留其原版本和范围，不提升为本轮验收。

可重查的现有命令：

```text
git -c http.proxy=http://127.0.0.1:7897 fetch --all
git -c http.proxy=http://127.0.0.1:7897 ls-remote --heads origin
gh api repos/1760139151lkh-ctrl/zaichang/branches --paginate
git for-each-ref --format='%(refname) %(objectname)' refs/heads refs/remotes/origin
git rev-list --left-right --count HEAD...<ref>
git rev-list --parents -1 fa9b037
git rev-list --parents -1 ad71c41
git diff --name-status d3c730c e150b0f
git diff --diff-filter=D --name-status e9f3860..HEAD -- src prompts runtime
git diff --diff-filter=D --name-status c7cff22..HEAD -- src prompts runtime
```

引用当前实现：[资料 owner](../../../src/main/materials/service.ts)、[运行协调](../../../src/main/runtime/coordinator.ts)、[资料上下文](../../../src/main/runtime/context.ts)、[规划采用](../../../src/main/actions/planning-application.ts)、[本地日历事务](../../../src/main/actions/local-calendar.ts)、[本地搜索](../../../src/main/search.ts)、[托付控制](../../../src/main/runtime/controls.ts)、[主界面](../../../src/renderer/App.tsx)、[人物与窗景](../../../src/renderer/companion.tsx)、[地图](../../../src/renderer/map/ConversationMap.tsx)。历史限定范围见[连续性保存点](../../HANDOFF_2026-10-23_CONTINUITY.md)和[CI 同步记录](../../CI_SYNC_2026-10-22.md)。

本项未做清理；所有现存工作树、历史引用、素材、构建与诊断资料均保留。
