# 学习、资料与 PDF 调查（2026-10-23）

范围：依据《在场前端优化.md》及附带重复文本，检查真实资料阅读、学习纸、PDF 选段、笔记来处与分屏。此页记录源码事实与尚须运行确认的差别，不把旧截图或历史证据算成本轮验收。

## 已读与当前基线

- 已完整阅读桌面任务、仓库 AGENTS、Product Design Director 技能、MaterialsPanel、ReadingDivider、materials 共享契约、原生资料 read/quote/keepQuote 路径，检查 StudySceneView、App 的相关接线与 NotesPanel 回源。
- 19 个 pasted-text 文件按 SHA-256 分成四个内容组：1/3/4/5，2/6，7–13，14–19；已逐组完整读取。它们是当前任务的不同排版，不是 19 份不同新增范围。首组开头另有旧助手润色说明，按附件内容理解，不作为本轮额外指令。
- 调查时 checkout 为 `codex/personal-memory-continuity-20261018`，HEAD 为 `6d5dcc1`。当次 `git status --short` 无输出；不存在可归因于本次学习调查的未提交产品实现。

## 真实入口与对象身份

| 人的动作 | 当前入口与链路 | 当前证据与限制 |
| --- | --- | --- |
| 留下 → 资料，选择 PDF/MD/TXT | `App.tsx` retained 导航 → `MaterialsPanel` → Bridge `attachText/materialsList/materialsRead` → `MaterialService.nativeReadPage` | 真实原件快照；无另一个前端材料库。仍须本轮操作。 |
| 原文与聊天并排 | `App.tsx` 同一 `conversation-space.with-materials` 内保留 MaterialsPanel 与原聊天；`ReadingDivider` 调布局变量 | pointer capture、Esc 取消、双击复原、键盘调节、localStorage 比例均有代码；窄于 900px 切成原文/一起聊两面，DOM 保留。须实拖与重入。 |
| 选一段接着聊 | `MaterialsPanel.captureSelection` → `materialsQuote` → `App.quoteMaterial` → 原 composer 引用 → 发送时再沿 `resolveQuote` 回读 | `resourceId + sha256 + page + Unicode start/end` 保持同一地址；输入原稿不加伪用户文字。当前仅 `<pre>` 文字视图可选。 |
| 选段留在笔记，再回原文 | `materialsKeepQuote` → `nativeKeepQuote` → `NotesService.create` 的 `source.material` → NotesPanel 的「回到原文 / 聊这一段」 | 笔记归原 owner；源地址保留。当前只能先保存摘录再进入笔记编辑，没有原页旁的批注编辑。 |
| 打开一道题当前一步 | `AssistantPresentation` → `StudySceneView` → `studyProject` 回读当前 owner | 原题、自己的每行尝试、帮助与下一步各有身份；当前一个 composer 可停靠纸内。原消息引用和 owner revision 必须分别保留。 |
| 点原题/旧行/帮助续问 | `ReadableFocus` → 当前 `studyProject` 核 revision/id → `StudyInteraction.reference` → 同一输入 | 只有当前一处轻动作，无常驻逐行标签；已有历史运行证据，不能升级为本轮通过。 |
| 学习纸回 PDF 或笔记 | `StudySceneView.openOriginal` → `App.onOpenMaterial` / `onOpenStudySource` → 原资料/原笔记入口 | 原出处沿真实 owner 读取，不能以标题或相似题重建身份。 |

## 原稿映射与应保留的关系

已亲看附件 `image-4.png`、统一图库 `在场｜标量方程学习界面-18-9c6131000bc8.png` 与 `留下资料阅读-4f028800f8fa.png`。主代理仍应亲自审这些原图。

- 附件第四张是左原 PDF/右问题与帮助/下方同一输入的连续桌面。左边高亮和页边注释指向原文，右边帮助不遮左边数学，角色退为小头像。图中矩阵可逆条件的写法不宜照抄；源码内容来自真实资料与模型，不能把设计图中的讲义合成用户文件。
- 编号 18 保留同样空间关系，并把例子改为一阶标量方程，示意内容更准确。它应作为阅读分屏的布局标尺，附件第四张补其批注关系。
- 留下资料阅读展示资料清单与上次阅读位置。当前代码的 reading bookmarks/scroll positions 仅存组件内存，跨重启只保存分屏比例；不能声称「关闭应用后回到上次一页」已成立。
- 图库学习与阅读共 17 张，还包含一步步想清积分、推导与提问、积分题分步讲解及通用互动图稿；应沿原 Study/OpenUI 当前帮助承接，不能为每个话题造硬编码专页。

## 需要完成的实质缺口

1. PDF「页面」现在只返回 `image`，`text=''`；原页是 `<img>`。已有 `parsePdf(operation:'read')` 返回每个 text item 的归一化 bbox、文字顺序和换行，原页渲染也来自同一 PDF.js。可把原页渲染与文字层在同一次受限 nativeRead 中返回，建立带源 Unicode 起止的透明文本层，再复用既有 quote/notes 入口。不能用 DOM 的位置猜原文或在前端 OCR 猜引文。
2. 原文选段被送到 composer 后，高亮随浏览器 selection 消失；目前没有能从笔记返回仍在 PDF 页上看见来源的持久关系。应从原 `source.material` 投影页内高亮/笔记入口，读取/撤源仍由 owner 核；不能把副本笔记当作继续访问原文件的许可。
3. 批注须允许用户在保留原选段地址的同时写自己的话；当前 keepQuote 仅存摘录，再去 NotesPanel 编辑。宜复用原笔记实体而非新增 annotation 数据库。
4. 资料书签与滚动重入目前是内存状态；需实际判断跨切页/换聊天/重启的期望范围，并在现有用户偏好存储或最小非正文布局状态中保存地址。source boundary 变化必须清对应地址；不要持久复制原文或原图。
5. 窄窗单栏必须保留当前页、焦点、草稿和同一资料引用。实际 resize/拖动/引用弹层/翻页/错误恢复、主题与中文公式要亲看，check/build 不能代替。

## 正常运行与验收入口

- `npm run dev` 是正常 Electron 主进程/renderer 入口；实际模型核查用既有 `npm run dev:luna:test` 或 `start:luna:test`，遵守独立合成数据目录与返回型号回执，不调用 DeepSeek。
- 原生 PDF 构建由 `scripts/material-runtime.mjs` / `src/main/materials/worker.ts` 进入既有运行时。已有 `scripts/pdf-smoke.mjs` 与 `tests/pdf-smoke.ts` 可检查底层 read/render，仍须实际用户选文、翻页与回源。
- 正常工作流：新隔离资料 → 留下/资料打开 PDF → 原页选段 → 带入同一 composer 且保稿 → 留为原笔记并编辑批注 → 回原页聚焦 → 调整左右宽度并取消/重入 → 窄窗切面回到原位置。撤源/异常后不能继续用缓存正文。
- 本调查没有新增测试、runner、fixture，没有调用模型/校园账号，没有更改产品代码或用户数据，没有清理文件。

## 后端实施与实际检查（同日续接）

主代理已审定「原 PDF 文字层 + 原 Notes 批注投影」。后端已补 `MaterialPage.textRuns` 的原 PDF extraction 顺序、归一化 bbox 与 Unicode 地址；原页和文字使用同一已验字节、取消与来源边界，文字层失败时仍保留可读原页。`materialsNotes` 先核原件资格，再由原 Notes 查询本人的 active、同 resourceId/SHA/页码笔记；`materialsKeepQuote` 可同时附上用户写的批注，不增加第二笔记库。

已完成的实际检查：

- `npm run check` 通过。
- 重新编译并运行既有 privacy 文件的三项相关检查：原生预览不持久上传、保存资料重启/遗忘、Unicode 精确引用与独立笔记，3/3 通过。未新增检查代码。
- 直接调用产品 API，在内存 owner 上用含 emoji 的真实 Unicode 地址保存选段和自己的批注，返回原 Note id/revision 与 source.material；按原件查询投影返回同一 Note。
- 直接用既有合成文件 `ordinary-handout.pdf` 调 `stageFile` → `nativeReadPage(view:page)`，返回第 1/2 页、1132×1600 JPEG 与三条准确的原文/地址/bbox。未新增 PDF fixture，没有调用模型。

这些结果只证明上述后端行为和既有约束。前端此时仍等待主代理图稿审定，不能称原页可选或批注体验已经完成。

## 前端实施与当前实际观察

主代理亲看 V004、V018、V139、V141 后批准沿原好稿实施。`MaterialPdfPage.tsx` 在真实 PDF 图上放透明文字层，选择端点直接回每个原文 run 的 Unicode 地址。原页支持引用、搜索与笔记淡标、页边点位和轻量批注；正文像素始终保留。重叠于同一处的多条笔记可沿同一标记逐条翻看。未新增 annotation 数据库或客户端 PDF 引擎。

`MaterialsPanel` 的笔记保存/编辑沿原 `materialsKeepQuote`、`notesRead`、`notesUpdate`；来源仍是原 `source.material`。页边编辑按来源单独保留窗口内草稿，Esc 收起后有「继续写」入口；恢复后保留原字，修订冲突保留草稿，不覆盖另一处的新版本。`onUnsavedChange` 提供给 App 的原退出/忘记保护；`reference` 提供给同一 composer 的高亮/取消关系。**这两个 App props 仍须主代理整合后定点复查，不能由组件端存在推定它们已接入。**

已接 `useMaterialReadingPosition`：仅地址、hash、页码、缩放、滚动和顺序持久化，正文/选段/笔记草稿不入 localStorage。先取得当前合法材料列表，再恢复最近原件；source boundary 变化清地址，不从偏好恢复读取权限。

本轮在独立合成 profile，通过正常 Electron 与原 Bridge，实际完成：

- 原 PDF 页鼠标选段 → 轻动作 → 同一 composer 引用；原中文草稿完整不变，没有发送消息或调用模型。
- 在页边写自己的话并保存；从原页标记回开同一 Note，编辑后读回同 id 的 revision 2/3。第二页不串第一页笔记；笔记页「回到原文」实际定位第 1 页的原 Unicode 范围。
- 指针拖动 56% → 64%，Esc 回 56% 且仍在原第 2 页；正常拖到 61%、键盘左移到 59%。发现并修复旧 divider 的 Esc 冒泡至全局返回聊天，修后按同一触发重查。
- 缩放、翻页、1440/760/390 宽度、原文/一起聊切面、夜色与晨光均亲看。390 宽度批注编辑无横向页面溢出，原 PDF 可按原缩放横向查看。新页图同时携文字后导致图表提示误说「切到页面」的问题已修，提示只在文字模式出现。
- 正常「保存并退出」后重开同一 profile，读回第 2 页、115% 缩放、scrollTop 290、59% 分屏、原中文草稿和同一 Note revision 3。
- 最终源码重新加载后，原页翻页、图钉、编辑、Esc、继续写、撤回临时接写均再次实际操作；该轮 renderer 异常监听无记录。
- 直接调用产品 API 确认 pending 原件退出后，页边投影按原来源拒绝；原先明确保存的独立笔记仍由 Notes owner 保留。

当前观察是本模块的原生数据与交互，不是 Luna 教学效果、任意 PDF 排版或全部主题的验收。资料使用现有合成 `ordinary-handout.pdf`，没有生成测试代码、runner 或 fixture，没有读取私人校园资料。

本机证据：`.test-data/study-ui-20261023/evidence/study-pdf-note-desktop.png` 与 `study-pdf-note-narrow.png`，均已亲看。主代理仍应亲看并实际核集成后的 App。

清理：已删除本次临时编译件 `.test-build/study-existing-privacy.cjs`（5.20 MB）与 `.test-build/study-product-store.cjs`（4.58 MB）；这些是逻辑文件大小，不声称对应释放磁盘空间。保留隔离 profile、正常构建运行时与上述诊断/复现证据。
