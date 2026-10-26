# 祥子 attention-mist：主代理逐 SHA 静态图层准入

当前场景：`sakiko-attention-mist-shared-page-included-v2`。主代理在当前健康会话明确批准本页精确母图、空底、F、S 的固定 included 组合；不是用户签字，也不是运行、独立动态或 360 活动矩阵完成。

原景 RGB 在 U=MAX(L(F),L(S)) 下只绘一次。S 含原位座垫、木地板和柔软接收，并可与 F 重叠；它不是可以独立平移的 caster。travel / slope / perspective 全部为 0。

## 精确选源

|角色|来源|SHA-256|运行素材|
|---|---|---|---|
|mother|[sakiko-attention-mist-shared-page-v2.png](../../sakiko-attention-mist-shared-page-v2.png)|`0bb53a305da106c8e499cc3c97cb9c399e8958ce421c5077a97631683ae2bb88`|[sakiko-attention-mist-shared-page-included-v2-mother.png](../../../../../../运行素材/companion/scenes/sakiko-attention-mist-shared-page-included-v2-mother.png)|
|background|[background-v1.png](background-v1.png)|`db4e12b935f35db0a1351fda73714b6d7de7668d842ee07ebadf6c9c41650c1f`|[sakiko-attention-mist-shared-page-included-v2-background.png](../../../../../../运行素材/companion/scenes/sakiko-attention-mist-shared-page-included-v2-background.png)|
|figureMask|[figure-mask-v1.png](figure-mask-v1.png)|`674382410a477e70b8a22085e024f2e292d83c3c7d070daf05e30b0c0c1e47ab`|[sakiko-attention-mist-shared-page-included-v2-mask.png](../../../../../../运行素材/companion/scenes/sakiko-attention-mist-shared-page-included-v2-mask.png)|
|contactMask|[contact-mask-v2.png](contact-mask-v2.png)|`01b4fe55552c04a7d4340bcc5b210a157d6eb6b3c274cbbaa41b308122f29b7f`|[sakiko-attention-mist-shared-page-included-v2-contact-mask.png](../../../../../../运行素材/companion/scenes/sakiko-attention-mist-shared-page-included-v2-contact-mask.png)|

## 主代理实际亲看的 Browser 文件

只记录下列 5 个文件。它们保留正式 CUA 原始截图字节，扩展名为 .png、实际编码为 image/jpeg。下表尺寸由真实解码读取，纠正旧 producer 记录按 PNG 文件头猜尺寸的元数据；未重编码、未改变 SHA。截图仅用于审核，禁止作生图输入。

|文件|真实尺寸|SHA-256|
|---|---|---|
|[full-native-composite-v1.png](browser-observations/full-native-composite-v1.png)|854 × 592|`84bfe1dc6650bec217b1f31fce40e2e8d84883934320b97f36a90e62c4e8fc6a`|
|[light-dark-checker-v1.png](browser-observations/light-dark-checker-v1.png)|839 × 582|`3de77ec6cdf6da703fd22744a85ef896ebdeeacc07b5d6ff5e11cfb0665e85f0`|
|[face-hair-original-union-composite-v1.png](browser-observations/face-hair-original-union-composite-v1.png)|839 × 582|`5eb9ade002aa9fafce59c372bbfb50d28876c83cf242bc37d69e4a83c043019b`|
|[book-original-union-composite-v1.png](browser-observations/book-original-union-composite-v1.png)|839 × 582|`be54b6be54e91aa1d05544f050fa16e26ab3bb948f4f89ffa28eff6c080fb516`|
|[shoes-contact-original-union-composite-v1.png](browser-observations/shoes-contact-original-union-composite-v1.png)|839 × 582|`8cea51fc8580c0ac5b77f1fb6328ee0d3c5a1c1c6a6491aee0c9145cbad274c0`|

## 固定几何与保护范围

- F >32：`[903,114,1354,927]`；S >32：`[891,530,1344,939]`；U >32：`[891,114,1354,939]`（右/下为 exclusive）。
- 阈值仅用于只读几何元数据；原始连续 PNG 掩膜未阈值化、未裁切或手改。
- 本次七组 U 总范围 `[762,86,1378,955]`；加水平 96 / 垂直 12 源像素保护范围为 `[666,74,1474,967]`，高度 893。现有同族 protected-fit / safe-cover 函数未改。
- 座/地锚点分别为 `[1180,588]` / `[1005,914]`：亲看原母后选择可见裙臀接垫、完整鞋底落地中点；不是隐藏关节或移动标定。

## 登记和验证

- manifest：[sakiko-attention-mist-shared-page-included-v2.scene.json](../../../../../../运行素材/companion/scenes/sakiko-attention-mist-shared-page-included-v2.scene.json)
- 原母/BG/F/S 均为 1536 × 1024 PNG，逐字节复制；源 SHA 对照已核。
- 静态登记：已写入。
- 现有 manifest 解析：pending primary normal build/actual selection; no extra Vite build started under earlier primary instruction。
- npm run check：passed (npm run check -> tsc --noEmit, exit 0)。
- 实机体验：未由本代理验收；留给主代理正式构建与正常入口检查。

本记录只覆盖本组四个精确 SHA。旧 producer pending/false 标记保留为历史，HOLD 图和错误尝试保留原据、不作当前运行素材或后续生图输入。微小原姿态/光照差异按用户保留原图的要求维持。

完整逐文件元数据、直接主代理授权原话及验证状态见 [JSON](root-primary-layer-admission-v1.json)。
