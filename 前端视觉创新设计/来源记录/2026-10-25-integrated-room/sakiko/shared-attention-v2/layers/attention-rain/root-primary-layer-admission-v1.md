# 祥子 attention-rain：主代理逐 SHA 静态图层准入

当前场景：`sakiko-attention-rain-shared-page-included-v3`。主代理在当前健康会话明确批准本页精确母图、空底、F、S 的固定 included 组合；不是用户签字，也不是运行、独立动态或 360 活动矩阵完成。

原景 RGB 在 U=MAX(L(F),L(S)) 下只绘一次。S 含原位座垫、木地板和柔软接收，并可与 F 重叠；它不是可以独立平移的 caster。travel / slope / perspective 全部为 0。

## 精确选源

|角色|来源|SHA-256|运行素材|
|---|---|---|---|
|mother|[sakiko-attention-rain-shared-page-v3.png](../../sakiko-attention-rain-shared-page-v3.png)|`e786baed27b104ea90afa41a398918f4efcebc72cc370518f058d555779c98ac`|[sakiko-attention-rain-shared-page-included-v3-mother.png](../../../../../../运行素材/companion/scenes/sakiko-attention-rain-shared-page-included-v3-mother.png)|
|background|[background-v1.png](background-v1.png)|`942f027ea58b53feb2b0a2c50f20fcd8f80f54d50332837f4a6a9c050a5ce463`|[sakiko-attention-rain-shared-page-included-v3-background.png](../../../../../../运行素材/companion/scenes/sakiko-attention-rain-shared-page-included-v3-background.png)|
|figureMask|[figure-mask-v4.png](figure-mask-v4.png)|`8694a78182b5d234fcc2e532a492536cbeec1286c6c7b15f852186db2babb65e`|[sakiko-attention-rain-shared-page-included-v3-mask.png](../../../../../../运行素材/companion/scenes/sakiko-attention-rain-shared-page-included-v3-mask.png)|
|contactMask|[contact-mask-v1.png](contact-mask-v1.png)|`43f9770fbde6eaf407d174362c1d6c4ae61f6e3552d35fecc98bb29bcbd5d992`|[sakiko-attention-rain-shared-page-included-v3-contact-mask.png](../../../../../../运行素材/companion/scenes/sakiko-attention-rain-shared-page-included-v3-contact-mask.png)|

## 主代理实际亲看的 Browser 文件

只记录下列 5 个文件。它们保留正式 CUA 原始截图字节，扩展名为 .png、实际编码为 image/jpeg。下表尺寸由真实解码读取，纠正旧 producer 记录按 PNG 文件头猜尺寸的元数据；未重编码、未改变 SHA。截图仅用于审核，禁止作生图输入。

|文件|真实尺寸|SHA-256|
|---|---|---|
|[mother-composite-v4.png](browser-observations/mother-composite-v4.png)|1265 × 454|`f9a527982ca7aed9973b68c502eea8cddef35f9978df44e0c66d54516d18fd0e`|
|[light-dark-checker-full-v4.png](browser-observations/light-dark-checker-full-v4.png)|1265 × 528|`dbc6f268156b51104f9fc549ebc54c2ae0dc94ad82b64b306ce98067be17003f`|
|[face-hair-original-union-composite-v4.png](browser-observations/face-hair-original-union-composite-v4.png)|1265 × 435|`b38ccad6eaa8918cca3d6ac7bdfdfb84950603be8ca550c4894b942bcbbb1313`|
|[book-seat-original-union-composite-v4.png](browser-observations/book-seat-original-union-composite-v4.png)|1280 × 450|`606cb1782bf2ad4b21e972602e624d66c7b501c6f5baf645f393dfe8edd866b5`|
|[shoes-contact-original-union-composite-v4.png](browser-observations/shoes-contact-original-union-composite-v4.png)|1265 × 521|`7e9811748fd81435cfef88de54c4b0ca8c34db24528e9c9a30441caf0d95c13d`|

## 固定几何与保护范围

- F >32：`[823,158,1327,921]`；S >32：`[762,532,1370,933]`；U >32：`[762,158,1370,933]`（右/下为 exclusive）。
- 阈值仅用于只读几何元数据；原始连续 PNG 掩膜未阈值化、未裁切或手改。
- 本次七组 U 总范围 `[762,86,1378,955]`；加水平 96 / 垂直 12 源像素保护范围为 `[666,74,1474,967]`，高度 893。现有同族 protected-fit / safe-cover 函数未改。
- 座/地锚点分别为 `[1184,606]` / `[902,902]`：亲看原母后选择可见裙臀接垫、完整鞋底落地中点；不是隐藏关节或移动标定。

## 登记和验证

- manifest：[sakiko-attention-rain-shared-page-included-v3.scene.json](../../../../../../运行素材/companion/scenes/sakiko-attention-rain-shared-page-included-v3.scene.json)
- 原母/BG/F/S 均为 1536 × 1024 PNG，逐字节复制；源 SHA 对照已核。
- 静态登记：已写入。
- 现有 manifest 解析：pending primary normal build/actual selection; no extra Vite build started under earlier primary instruction。
- npm run check：passed (npm run check -> tsc --noEmit, exit 0)。
- 实机体验：未由本代理验收；留给主代理正式构建与正常入口检查。

本记录只覆盖本组四个精确 SHA。旧 producer pending/false 标记保留为历史，HOLD 图和错误尝试保留原据、不作当前运行素材或后续生图输入。微小原姿态/光照差异按用户保留原图的要求维持。

完整逐文件元数据、直接主代理授权原话及验证状态见 [JSON](root-primary-layer-admission-v1.json)。
