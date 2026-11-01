# 喵梦 night · 同母原 RGB 固定联合层静态已准入

[完整闭合记录](assembly-v1.json) · [真实浏览观察页](included-observe-v1.html) · [原生联合 SVG](union-source-v1.svg) · [同母 BG 合成](composite-source-v1.svg)

当前选定 F=figure-mask-v1.png、S=contact-mask-v1.png、BG=background-v1.png；完整原母与三选件 SHA 见 JSON。所有 PNG 为实际 Image 输出原字节；无像素擦补、裁切、阈值或形态学编辑。

`U=MAX(L(F),L(S))`，sRGB Rec.709 连续亮度，原母 RGB 每个联合/合成只绘一次。S含真实局部布/木接收与少量前景重叠，经MAX合并，固定原位使用，`travel/slope/perspective=0`，不独立移动角色、纸扇、座面或鞋影。BG从本母真实Image去人，不换commonplate、不声称不可见纹理逐像素恢复。

制作线已在正式 Chrome 亲看 7 张原母/合成、浅深棋盘、脸发、完整纸扇双手、裙座膝、全鞋地面和单独receiver截图，原bytes在 `browser-observations/`。未见须重画母图的身份/姿势问题；这些仅为候选层的实际观察，root现已亲看该7图并准入选定STATIC，详 [分级准入](root-primary-layer-admission-v1.json)。截图和观察页禁止作为Image输入。

本组实际 Image 次数 6；HOLD及重新生成沿来源完整保留（详generationRecords），不复用坏遮罩。本层选定原PNG与scene已静态登记，runtime、动态、360、userApproved仍未签。未写src/TS选择器/CSS/9335，无新测试或清理。
