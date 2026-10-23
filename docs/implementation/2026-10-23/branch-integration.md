# 全分支集成复核 · 2026-10-23

复核基线为 `6d5dcc1dd4b3bab7053a333366c6661a21e1b571`。本轮重新完整读取当前 goal 附件、AGENTS，核对现有源码、真实 Git 对象及远端；本页补充较早的 [分支审计](branch-audit.md)，不将其先前的开场状态、运行或图片观察当作本次观察。复核结束时间约为 2026-10-23 02:30 PDT。

**结论：六个 GitHub 分支、四个本地分支均已抓取并逐项核查，当前没有分支独有的未融合提交。当前工作树的本轮新实现仍未提交；历史包含、源码接线、运行通过是不同的事实。另一个必须纠正的事实是，GitHub API 当前返回该仓库为公开仓库，不能继续沿用“现有私有仓库”的描述。**

## 真实远端与全部引用

本次成功执行 `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`；再用 `git ls-remote --heads origin` 核实全部六条远端 heads 的 SHA。未执行 merge、cherry-pick、checkout、reset、提交、推送或可见性变更。`origin/HEAD` 是符号引用，不计为额外分支。

表中数量为 `git rev-list --left-right --count HEAD...<ref>` 的“当前独有 / 该分支独有”。右侧均为零；这不是用两棵树的文件差异推测是否合并。

| 引用 | 提交 | 当前独有 / 该分支独有 | 代码与历史判定 |
| --- | --- | --- | --- |
| 本地 `codex/personal-memory-continuity-20261018` | `6d5dcc1` | 0 / 0 | 当前 checkout；本轮共享修改叠加于此 |
| 本地 `main` | `4edd922` | 19 / 0 | 指针滞后；该头只修正原 Harness 讨论字节，不是另一份未融合功能 |
| 本地 `codex/map-audit-integration` | `e16d3fe` | 22 / 0 | 地图与便携版历史已包含；头提交只更正文档中的启动等待事实 |
| 本地 `codex/ci-pending-sync-20261022` | `ad71c41` | 1 / 0 | 70 文件后续进展及校园 CI 修正已经包含 |
| 远端 `main` | `6d5dcc1` | 0 / 0 | 与当前提交相同 |
| 远端 `codex/personal-memory-continuity-20261018` | `6d5dcc1` | 0 / 0 | 与当前提交相同 |
| 远端 `codex/memory-proactive-harness-20261018` | `c7cff22` | 21 / 0 | 记忆、受托调查、机会调度及规划已包含并继续演进 |
| 远端 `codex/window-continuity-20261022` | `499933d` | 12 / 0 | 阅读空间、滚动锚点与窄窗规则已包含；本轮视觉仍须实际核验 |
| 远端 `design/image-first-checkpoint-20261018` | `e9f3860` | 26 / 0 | 资料原文、角色选择、留下、今天与设置的实现在同一产品链内 |
| 远端 `design/windowlight-continuation-20261018` | `319a023` | 25 / 0 | 本地检索、原生托付管理、校园与地图 Scene 已包含 |

核对的实际汇合点为 `74e099a`（包含 `319a023` 和其祖先 `e9f3860`）、`fa9b037`（父提交 `75af077`、`499933d`、`424e759`）及 `ad71c41`（父提交 `fa9b037`、`327a855`）。`6d5dcc1` 在 `ad71c41` 之后只增加 CI/状态说明。无需为了制造“本轮做过合并”的记录再合一遍旧分支。

## 逐分支的实际源码复核

本项亲读原提交的具体 diff，再核当前调用入口，不仅依据分支名称或提交标题：

- `e9f3860`：`MaterialService.nativeRecord/nativeReadPage/nativeOriginal` 约束 renderer 只读取用户选中的 pending 原件或已绑定 saved 原件；原生 Bridge 不接受任意本机路径。`MaterialsPanel` 的原始实现具有真实读取、取消、分页、PDF 页/文字切换、导出、选段及返回聊天。角色画廊有收藏、自定义图片、称呼与位置设置。当前仍沿这些 owner/Bridge 工作，后来的 typed quote 替代旧字符串拼接，不能回拷旧 `App/MaterialsPanel` 覆盖。
- `319a023`：亲读 `LocalSearchService` 的分类型有界分页、来源变化取消、Unicode 地址和 resolve 前重核，及 `attention-control` 契约。当前 `main/preload/App/LocalSearchPanel` 仍接同一 `searchLocal/searchResolve/searchCancel`，托付列表/暂停/继续/停止仍由 `NativeControls` 进入原对象 revision/controlVersion，不是仅前端隐藏卡片。该分支的资料、检索和托付源码继续存在。
- `c7cff22`：亲读记忆提取内容幂等键、预算/重试保留 pending、精确纠正片段、上下文分页及 `PlanningApplicationService`。当前 `PlanningApplicationService` 仍由 coordinator 创建并交给原日历动作链，保留 planRef、完整占用、采用顺序、事务核验及真实提交后进度。`OpportunityScheduler` 仍接 main 的原机会审查，不增加第二个模型循环；后续持久意图与来源门不能被旧版替换。
- `499933d`：亲读全部七个源码/样式文件的实际 diff。当前仍有 `minWidth:420`、`chatSpace/compactConversation/needsReadingRoom`、布局切换时保存阅读位置及 quiet 退让。原提交将窗景起点设为 55%，后续共享样式已不同，故祖先包含不能证明参考图的植物侵入已修复。其目的应通过本轮真实内容下的边界、裁切、滚动和窄窗观察验收。
- `ad71c41`：亲读冲突合并 diff；资料 quote 与资料导航的导入同时保留，typed quote 读取改走原 `recordMaterialRead`，保留真实读序和来源回执。当前重查位置/资料导航来源仍在 `coordinator` 模型边界执行。校园适配仍用真实 `readingIdentity` 存在时的变化比较，saved snapshot、当前账号成员及读前后快照绑定门并未因 CI 修复而取消。
- `6d5dcc1`、本地 `main@4edd922`、`map-audit@e16d3fe`：分别核其实际 diff；它们的头提交是有限文档修正，不含待移植的独有产品功能。所记录的旧构建、旧 EXE 启动和旧模型观察不升级为本轮证据。

本轮观察时共享树已经包含 50 个被跟踪文件的修改，以及 native agenda、PDF 原页、资料位置、角色变体与地图上下文等新文件；其他代理继续工作会改变这个数字。这里只保全并核对依赖，没有改动这些源码。新实现的最终运行与审美验收由主代理在同一真实实例完成。

## 历史图片字节与旧工作树

对每个分支的 `git ls-tree -rlz` 逐一比较 raster 图片 blob：当前 HEAD 有 244 条 PNG/JPEG/WebP/GIF 路径、112 个唯一 Git blob；每个本地及远端分支中的历史图片 blob 都在 HEAD 的某条路径继续存在，缺失 blob 数为零。旧路径、兼容路径与统一图库可能指向相同内容，因此 244 条路径不是 244 张独立原图，也不能据此删除产品仍引用的路径。Git blob 相同仅证明字节保存，不能代替主代理亲看图片、辨识角色或实现图稿功能。

五个工作树只读检查结果：当前共享工作树进行中；`ci-pending-sync` 工作树与两个旧地图工作树干净；`dd44` 的 detached `e4254aa` 工作树保留 221 个修改/未跟踪文件，不做清理。对后者逐文件核查：

- 221 个文件在当前工作区均有对应路径；101 个规范换行后与当前相同，107 个精确内容 blob 可从现有 Git 引用历史找回。
- 剩余 13 个精确旧版本中，11 个为旧文档组合；两个源码是 `harness.ts` 和 `note-presentation.ts`。与最接近的 `8cdd754` 比较，旧工作树删除了 `readPurposeReference/currentUserReference` 指代链，并非当前缺失的新能力；保留当前较新的来源指代机制。
- 该旧工作树全部 15 张修改/未跟踪图片的 SHA-256 均命中当前统一图库 catalog；没有从中找回此前交接列出的新 PNG。

较早 [连续性保存点](../../HANDOFF_2026-10-23_CONTINUITY.md) 中的 22 个 PNG 路径/19 个唯一内容和无法取得的冻结提交，是另一批明确未上传素材。以上“所有分支内图片 blob 保留”不能用来声称这批从未进入可取分支的文件已恢复；本轮 ZIP/本机搜图以当前资产审查为准。

## 公开仓库事实与同步边界

本次直接执行 `gh repo view 1760139151lkh-ctrl/zaichang --json nameWithOwner,isPrivate,defaultBranchRef`，返回 `isPrivate:false`、默认分支 `main`。仓库当前为公开仓库，与 AGENTS、图库 catalog 和旧 source-materials 的“现有私有仓库”前提冲突。本项未变更仓库可见性，已即时通知主代理。

用户本轮授权最终同步代码及审定视觉资产，不使本机数据库、凭据、账号记录或仅限私有备份的来源自动取得公开上传许可。最终文件集须按当前公开事实处理，尤其不可把 `仅本机/`、历史个人对话、账号结果、未审查截图和诊断包因“全量同步”而加入。此前远端内容已公开是现状，不能通过再次提交相同描述把它当成已获新的许可。路径级检查在 tracked 文件中只命中 `.env.example`，这不是内容级秘密检查的替代。

最终本地主分支可在已核成果提交后，从 `4edd922` 快进到最终集成提交，保留所有现有工作分支；不要切回旧 main 覆盖共享修改。任何实际同步仍由主代理按最终显式文件集和真实仓库边界处理，本报告没有执行。

## 统一 UI 实例的只读定位

02:30 PDT 前后复核进程与监听：没有 Electron、在场或 zaichang 桌面进程在运行；存在 127.0.0.1:5173 的共享 Vite 服务，没有 9222/9223/9333 的 Electron 调试监听。未读取账号或任何 profile 正文，未输出完整进程命令行，未启动/关闭实例。

`scripts/dev.mjs` 先构建 main、开启 Vite，再 spawn Electron；已有共享 5173 时不应另开 dev 服务造成端口漂移。正常桌面可由已构建的 `start:luna:test` 经原 `run-luna-test.mjs` 启动，并以 launch-only 环境指向同一 Vite 和主代理选定的合成 profile。原 `isolatedEnvironment` 提供 `ZAICHANG_TEST=1`、明确 `.test-data` 子目录并移除校园连接器环境；Luna wrapper 仅替换模型传输并删除 DeepSeek key 环境变量。真实返回型号仍须看响应，不由 wrapper 名称推定。

历史合成 profile 包含钢琴续作、今天、学习、窗景与跨模块接续，均保留。选择哪一个作为本轮统一操作实例由主代理协调；不能仅为多个代理方便并行而创建多份状态、复制生产资料或把旧 UI 回执升级成当前验收。

本项没有新增测试、fixture、runner，没有调用模型或校园账号，没有删除、移动或清理文件；只新增本报告。
