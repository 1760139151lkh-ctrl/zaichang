# 共同做事：原消息中的回来起点

工具：内置 GPT Image。后端生命周期与专用owner读取接通之后生成。A/B在同一合成内容下比较；采用A。图稿是设计输入，不是产品截图或体验验证。未计算文件哈希。

## 完整生成提示词

Use case: ui-mockup. Create a polished wide design comparison board for an existing Chinese personal desktop companion app named 在场. It is a calm place to return to, warm gray/ivory, restrained muted gold, generous whitespace, clear Chinese typography, translucent layered paper and window light. The design belongs INSIDE ONE EXISTING CHAT MESSAGE / discussion page, not a new dashboard, no permanent sidebars of features. Produce two genuinely different comparable layouts, A on left and B on right, both with the same realistic synthetic content and both showing a paused shared working session. Above each layout the tiny A/B label belongs to the presentation board, not product UI. Existing subtle navigation is only 聊天 / 今天 / 留下. User message: 我先去上课，下次接着吧。 Task title: 实验报告 · 讨论部分. Main remembered working explanation: 结果已经列好了，我们停在解释第二组数据为什么偏低。 Return point: 先把可能影响测量的条件挑出来，不急着重写整段。 Source materials: 实验记录.pdf · 第 3 页, 你刚才写的两句解释. Primary action text 接着这里, secondary text 先放着. Layout A: continuation within prose, a slender warm gold margin mark, the next starting sentence is the focal point, materials as understated expandable inline references; no nested cards. Layout B: an open notebook/paper passage relationship, original excerpt glimpsed beside an airy current working margin, with the continuation action tucked naturally at the bottom; still one coherent message, no box grid. Both must feel personal, unhurried, warm and ready to use; content takes priority over decoration. A very small abstract window-light motif may appear, no large character illustration. Precisely show the same short Chinese content, legible text, genuine reading hierarchy, comfortable desktop and a small narrow-window inset for each. Avoid timers, progress bars, task trees, completion percentages, engineering fields, source hashes, permissions panels, emotional scoring, notifications counts, literal memory management, checklists, arbitrary icons, loud gradients, fake metrics. Do not show any claim of completed learning or mastery. This is an original AI-generated UI design concept, not a screenshot of a running product.

## 采用关系

保留A的连续阅读和轻量原材料入口，把动作留在本段内容末尾。刚离开时不突出召回；回来明确继续时才强调起点。实际原资料打开后吸收B的双纸对照。材料、尝试和状态来自宿主owner投影；续接回到普通输入框，带精确owner引用，由原主模型继续处理。未实现图稿中的全局新窗口或合成示例数据。当前已获必要视觉启动／对照授权，隔离渲染与动效比较仍待完成。

## 透明纸张艺术素材：2026-10-19

参考为本目录已亲看A/B原图，工具为内置GPT Image edit，`transparent_background=true`。输出只提取空白纸面、页边和阴影，保存到 `assets/ui/companion-session-paper.png`。实际文字、材料和操作由应用渲染，未贴整张假UI。已读取艺术文件的RGBA与透明周边像素元数据，没有对图像使用Python编辑。

完整编辑提示词：

Edit the provided original AI-generated 在场 UI concept, using only the warm fibrous paper surfaces and page edges in the right-hand B notebook as material reference. Create a clean production UI ART ASSET: one single blank ivory-warm gray writing sheet, almost perfectly front-facing and rectangular, upright portrait, subtle handmade paper fibers, quiet natural corner irregularities, delicate layered bottom edge and very soft realistic translucent shadow. No text, no UI, no controls, no screen, no room, no objects, no clip, no icons, no drawn handwriting. The sheet surface must be evenly lit, pale warm neutral, with ample empty center suitable for real selectable HTML text placed on top. Keep paper texture tactile but extremely subtle, not yellow or dirty. The entire surrounding background must be genuinely transparent alpha, with the translucent shadow on alpha. Isolate only the sheet and its soft shadow; do not retain any part of the app window or room. This is a texture and page-edge asset that will be used behind REAL app content, never a screenshot or placeholder UI.
