# 2026-10-23 · 在场接续保存点

## GitHub 紧急保存范围

用户随后要求立即合并，不再等待新 PNG 的上传。本次 `main` 保存全部分支的合并代码与已上传文本；下面列出的 22 个新 PNG 路径（19 个唯一内容）尚未上传，本轮完整图稿、实际截图与选定 runtime 原图保留在本地冻结提交 `9e0391b7fb4ded3b122b2667e087792cef902cab`。本文件后续的图稿和截图链接属于该本地完整快照，不能视为此 main 已保存相应二进制。

已有祥子、睦及晨/暮/夜窗景暂沿用远端原素材；新爱音、灯保留角色与偏好 ID，形象暂用在场标记，不冒用其他人物。原图上传后应恢复 `companion.tsx` 的两条 PNG import，并按原 SHA 补回以下文件。这是可接续的紧急保存点，不是完整视觉交付或全体验验收。

- `assets/design/generated/2026-10-23-continuity/home-conversation-narrow.png`
- `assets/design/generated/2026-10-23-continuity/note-study-continuity.png`
- `assets/design/generated/2026-10-23-continuity/reading-candidates.png`
- `assets/design/generated/2026-10-23-continuity/scene-focus-map.png`
- `assets/design/generated/2026-10-23-continuity/today-trial.png`
- `docs/evidence/2026-10-23-continuity/learning-open-original-note.png`
- `docs/evidence/2026-10-23-continuity/narrow-home-adjusted.png`
- `docs/evidence/2026-10-23-continuity/restarted-home.png`
- `docs/evidence/2026-10-23-continuity/root-learning-width-corrected.png`
- `docs/evidence/2026-10-23/today/today-timeline-430-final.png`
- `docs/evidence/2026-10-23/today/today-timeline-desktop-final.png`
- `docs/evidence/2026-10-23/today/today-timeline-drag.png`
- `src/renderer/assets/companion/anon.png`
- `src/renderer/assets/companion/dusk.png`
- `src/renderer/assets/companion/reading-dusk.png`
- `src/renderer/assets/companion/morning.png`
- `src/renderer/assets/companion/reading-morning.png`
- `src/renderer/assets/companion/mutsumi.png`
- `src/renderer/assets/companion/night.png`
- `src/renderer/assets/companion/reading-night.png`
- `src/renderer/assets/companion/sakiko.png`
- `src/renderer/assets/companion/tomori.png`

## 保存目的与范围

用户已将当前优先级改为：立即保存本轮全部已有成果，并把 GitHub 所有分支合入 `main`，保留原分支。此文记录冻结时的真实完成范围和未完成项，**不表示本轮全界面、全交互或通用 OpenUI 已全面验收**。本轮从 `codex/window-continuity-20261022` 的 `499933d7a4a0c32812ffc6843f5b07c1b3f8ea29` 开始；旧阶段“暂停扩展”的要求不作为这次工作的限制。

主代理亲自查看了现有 133 张图及本轮候选和运行画面，并负责设计选择。这里不宣称每张图均以全尺寸查看。采用暖白、暖灰和少量暖金，阅读空间优先；人物与窗口背景的比例和边界继续由实际布局承担。

## 本轮已写入的资料接续

- `MaterialsPanel` 中的真实原文与原聊天接续；选段可“聊这一段”或“留在笔记”。引用是独立可取消、可返回的输入附件，保留自由草稿，不拼接机器前缀。
- `MaterialQuoteReference` 只传递 resourceId、SHA-256、页码及 Unicode code point 范围。主进程读取原件并重新核对 hash、来源许可、资料边界和范围；模型上下文由实际宿主读取构建。
- “留在笔记”复用现有 Note owner 和 source 结构，保存用户明确选取的摘录及出处名称、hash 和原地址，不暗中持久保存整份未发送临时附件。原件移走后摘录仍保留，返回原文须重新核验并给出恢复入口。
- 资料面板关闭重开保留当前进程内的页/段、滚动位置与缩放；已发送且允许保存的原件地址可跨重启回到原件。这里没有承诺跨进程恢复阅读滚动位置。
- 资料传输、来源收回及旧引用失效接回既有 `sourceBoundary`、harness、context receipt 与 Notes 来源入口。当前附件的 session-only context fallback 仅限同轮合法事件，不借此恢复持久来源。

关键代码：`src/shared/materials.ts`、`src/main/materials/service.ts`、`src/main/runtime/context.ts`、`src/main/runtime/coordinator.ts`、`src/main/harness.ts`、`src/renderer/MaterialsPanel.tsx`、`src/renderer/NotesPanel.tsx` 及 `App.tsx` 对应局部。

既有 `tests/harness/privacy.test.ts` 的 5 项针对性宿主检查已通过：原件预览不自动绑定/保存/入模；已存原件重启与忘记；Unicode/emoji/重复文本的精确摘录及错误 hash/页码/范围拒绝；typed quote 只提供选段、保留原输入与独立笔记、来源受限时失效；临时附件 typed quote 不落盘仍能进入本轮正确上下文。这些机制检查不能代替真实附件 UI 验收。

## Scene、地图、学习和字体

`SceneLayout` 增加 `focus`，采用主内容与辅助资料组合，切换主要查看对象保留同一挂载对象。主代理已修正单子项保留空栏的问题；学习工作面按最小 600 px、相邻资料按 280 px 组织，宽度不足纵排，动态画面可使用约 1160 px 的实际内容宽度。

`ConversationMap` 在 focus 期间收到 compact 时延迟到返回再应用；返回动画期间保留祖先不裁切。`ReadingDivider` 的样式冲突与 Shift 步长已修。以上代码已保存，完整地图展开/手势/返回实操仍待检查。

`tests/harness/campus-scenes.test.ts` 新增的 1 项 focus 集成检查已通过：保留精确 Scene 引用、顺序、事实和版本，DSL 不复制资料正文；current-only、其他会话、错误 revision 拒绝且不半发布，也不生成行动。

真实 Luna 试验暴露了学习题源未支持独立 Note 的缺口。现已补 typed note 题源与同一 study 对象的纠正，沿原 Note owner 读取，不复制笔记正文冒充聊天 evidence。`NotesPanel` 首次导航的 StrictMode 异步取消问题亦已修复。尚未落盘的 `SceneSourceContext` 新方案已取消，没有把半实现纳入本保存点。

字体在 `tokens.css` 增加 `--font-reading`、`--font-handwritten`，平台宋/楷体之后回退到随包 Noto Sans SC；学习正文、旁注和输入、笔记、商量纸、排练、信、好奇体验与校园标题统一使用。移除了好奇页覆盖全局 fallback 的局部字体声明，没有覆盖 KaTeX 数学字体、安装字体或新增依赖。

## 实际观察与证据

下列文件均来自隔离环境的合成资料，不是用户私有记录。身份和 hash 见[证据 manifest](evidence/2026-10-23-continuity/manifest.json)。

| 证据 | 已观察范围 |
| --- | --- |
| [桌面首页（原图未取得）](../前端视觉创新设计/资产迁移与D级处置.md#原图缺失或仅本机未同步) | 主代理亲看默认桌面人物与窗景。 |
| [窄窗口首页（原图未取得）](../前端视觉创新设计/资产迁移与D级处置.md#原图缺失或仅本机未同步) | 主代理亲看窄窗；背景与人物改用共享坐标区域。 |
| [学习组合宽度修正后（原图未取得）](../前端视觉创新设计/资产迁移与D级处置.md#原图缺失或仅本机未同步) | 主代理最终只读实看：组合约 1149 px，笔记约 403 px、学习约 726 px；原窄竖条故障消失、中文方块消失。原题重复仍存在，共享原文方案未完成。 |
| [学习中打开原笔记（原图未取得）](../前端视觉创新设计/资产迁移与D级处置.md#原图缺失或仅本机未同步) | 来源代理检查真实原笔记导航；修复首次挂载导航与读取竞态。 |
| [真实 Luna 学习纠正汇总](evidence/2026-10-23-continuity/learning-correction-result.json) | Note → 选句 → 同一 study 纠正，修后 8 项 responseModel 均为 `gpt-6-luna`；没有测试生产 DeepSeek。仅保留隔离合成场景的聚合结论与步骤状态数量，不含原文、对象标识或详细回执；最终成功不表示整条链零错误。 |

来源代理在冻结代码上完成 `npm run check` 与 `npm run build`，均 exit 0；包含 TypeScript、地图桥、renderer、Electron 与 review 构建。只有 chunk 体积和 npm proxy 警告。该结果不代替真实操作或模型质量验收。

“今天”另有[实际操作交接](TODAY_HANDOFF_2026-10-23.md)及其三张截图：实现代理沿真实 UI/host 检查拖动期间不写入、松手前后对照、确认同一 id 的 revision 2→3、撤回原时间到 revision 4，以及键盘 Shift 微调/Escape 不写入、430 px 窄窗无横向溢出。该实例为示例模型，不是 Luna 日程验证；并发撤回冲突、密集/跨日安排及全状态主代理比图仍未完成。

## Image 原图

五张原图、SHA-256、源文件名和采用范围已保存在 [2026-10-23-continuity](../assets/design/generated/2026-10-23-continuity/README.md)：

- [reading-candidates.png（原图未取得）](../前端视觉创新设计/资产迁移与D级处置.md#原图缺失或仅本机未同步)：仅采用 A，B 未采用。
- [scene-focus-map.png（原图未取得）](../前端视觉创新设计/资产迁移与D级处置.md#原图缺失或仅本机未同步)。
- [note-study-continuity.png（原图未取得）](../前端视觉创新设计/资产迁移与D级处置.md#原图缺失或仅本机未同步)。
- [today-trial.png（原图未取得）](../前端视觉创新设计/资产迁移与D级处置.md#原图缺失或仅本机未同步)。
- [home-conversation-narrow.png（原图未取得）](../前端视觉创新设计/资产迁移与D级处置.md#原图缺失或仅本机未同步)。

采用图是艺术与交互概念，不是事实资料或运行截图。早期错误公式候选不计入采用成果。设置、记忆、角色、搜索、恢复、休息、公开展示与排练等旧图按该目录索引相对链接承接。

## 接续时优先补完

1. 真实 Electron 原生附件选择 → 阅读 → 选段 → 保留自由草稿 → 发送或存笔记 → 关闭重开 → 返回原文的完整操作。当前附件入口是主进程 `dialog.showOpenDialog`，不等于 HTML filechooser；不能注入假的 Bridge 代替宿主后宣称验收。
2. 地图 focus 的拖动/缩放、打断与快速往返、场景修订期间 compact、返回原位置及窄窗/减少动态实操。
3. 最终 Study/Note 新组合布局的完整操作与原题重复问题；本保存点只有修正后的实际只读画面，不能称全流程已验收。
4. 资料中缝与恢复状态的连续实际操作；“今天”的正常试放/确认/撤回已有上述实际证据，其并发和复杂时段边界按独立交接文档继续。

以上缺口按用户要求留为精确接续项。当前优先完成保存与全分支合并，不继续扩展设计，不以图稿存在、源码存在或构建成功替代完成事实。

## 全分支整合时的复验

远端分页核对共六个分支。`codex/personal-memory-continuity-20261018` 的 `424e759` 与本轮起点确实分叉，因此正常合并了其既有实现，不仅登记父提交。保留该分支的 InteractiveProgram/FigureScene、来源快照、工具与角色机制，并同时保留本轮资料引用、Note 题源、focus、人物素材与 Today 交互。学习快照兼容额外核对原题身份与笔记 proof：旧回执仍核原来源，改题源不把旧帮助的来源静默替换。

合并后再次 `check` 与完整 `build` 均 exit 0；既有 `conversation-evolution` 8/8、资料 5/5、focus 1/1 针对性机制检查通过。上述 Luna 和 UI 文件产生于合并前的冻结实现；合并后没有再次调用模型或重新完成全状态 UI 验收。

统一图库保留另一分支的原始字节和来源索引；既有设计链接与运行素材兼容路径同时保留。本轮实际运行人物及窗景继续使用 `src/renderer/assets/companion/` 的已选新素材，没有以旧哈希归档文件名覆盖新图，也没有用新图改写旧归档的原始字节。原五个工作分支保留，最终以 `main` 合并提交作为接续入口。
