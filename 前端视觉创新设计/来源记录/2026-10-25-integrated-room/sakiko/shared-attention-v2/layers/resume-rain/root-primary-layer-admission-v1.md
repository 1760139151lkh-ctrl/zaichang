# 祥子 resume-rain：主代理逐 SHA 静态图层准入

当前场景：`sakiko-resume-rain-literary-included-v2`。主代理在当前健康会话明确批准本页精确母图、空底、F、S 的固定 included 组合；不是用户签字，也不是运行、独立动态或 360 活动矩阵完成。

原景 RGB 在 U=MAX(L(F),L(S)) 下只绘一次。S 含原位座垫、木地板和柔软接收，并可与 F 重叠；它不是可以独立平移的 caster。travel / slope / perspective 全部为 0。

## 精确选源

|角色|来源|SHA-256|运行素材|
|---|---|---|---|
|mother|[sakiko-resume-rain-literary-extension-v2.png](../../../../../2026-10-25-literary-room/sakiko/missing-theme-extension-v1/sakiko-resume-rain-literary-extension-v2.png)|`e1161313017fa5038b241a7f8ee8e846fd7675e8b9b7e63ee5c2458487b7b7f9`|[sakiko-resume-rain-literary-included-v2-mother.png](../../../../../../运行素材/companion/scenes/sakiko-resume-rain-literary-included-v2-mother.png)|
|background|[background-v1.png](background-v1.png)|`853958136489141916ebcf8b67f00afd073e8c24d3fea3ef82a0d0b98a1680c7`|[sakiko-resume-rain-literary-included-v2-background.png](../../../../../../运行素材/companion/scenes/sakiko-resume-rain-literary-included-v2-background.png)|
|figureMask|[figure-mask-v1.png](figure-mask-v1.png)|`4fe64d73e8fa4e31acd1de7fbcf95fb6975f9bc289376f86bb662cc683144e5c`|[sakiko-resume-rain-literary-included-v2-mask.png](../../../../../../运行素材/companion/scenes/sakiko-resume-rain-literary-included-v2-mask.png)|
|contactMask|[contact-mask-v3.png](contact-mask-v3.png)|`9270e99fa777b8d1a9ff485b86a0918d8c2222285580aff083b6a1f4bd77bb9e`|[sakiko-resume-rain-literary-included-v2-contact-mask.png](../../../../../../运行素材/companion/scenes/sakiko-resume-rain-literary-included-v2-contact-mask.png)|

## 主代理实际亲看的 Browser 文件

只记录下列 5 个文件。它们保留正式 CUA 原始截图字节，扩展名为 .png、实际编码为 image/jpeg。下表尺寸由真实解码读取，纠正旧 producer 记录按 PNG 文件头猜尺寸的元数据；未重编码、未改变 SHA。截图仅用于审核，禁止作生图输入。

|文件|真实尺寸|SHA-256|
|---|---|---|
|[mother-composite-v3.png](browser-observations/mother-composite-v3.png)|1265 × 454|`a62c6be27597876ae05e1dfed24ab908b5f7a8c68ed2c2838a57d0f43d181391`|
|[light-dark-checker-full-v3.png](browser-observations/light-dark-checker-full-v3.png)|1265 × 528|`98386d404e0ea3d529b70809cd55065efba252c72c5bb85bbb1210ccd3b2d26c`|
|[face-hair-original-union-composite-v3.png](browser-observations/face-hair-original-union-composite-v3.png)|1265 × 435|`a4f307f78fbadde0166a7fc9bac0e2d35655c4b03afef66d36afec95c1977638`|
|[book-seat-original-union-composite-v3.png](browser-observations/book-seat-original-union-composite-v3.png)|1265 × 569|`abae1326408719636c3f346fbf48f025264439f69898fa3ba2d88848ee536b9f`|
|[shoes-contact-original-union-composite-v3.png](browser-observations/shoes-contact-original-union-composite-v3.png)|1265 × 572|`e437722ecfd85a7c92d4416758f3bc7e6b5ba2c329f25036eea2e1e04f7df5ae`|

## 固定几何与保护范围

- F >32：`[980,134,1336,903]`；S >32：`[985,563,1320,919]`；U >32：`[980,134,1336,919]`（右/下为 exclusive）。
- 阈值仅用于只读几何元数据；原始连续 PNG 掩膜未阈值化、未裁切或手改。
- 本次七组 U 总范围 `[762,86,1378,955]`；加水平 96 / 垂直 12 源像素保护范围为 `[666,74,1474,967]`，高度 893。现有同族 protected-fit / safe-cover 函数未改。
- 座/地锚点分别为 `[1144,592]` / `[1105,891]`：亲看原母后选择可见裙臀接垫、完整鞋底落地中点；不是隐藏关节或移动标定。

## 登记和验证

- manifest：[sakiko-resume-rain-literary-included-v2.scene.json](../../../../../../运行素材/companion/scenes/sakiko-resume-rain-literary-included-v2.scene.json)
- 原母/BG/F/S 均为 1536 × 1024 PNG，逐字节复制；源 SHA 对照已核。
- 静态登记：已写入。
- 现有 manifest 解析：pending primary normal build/actual selection; no extra Vite build started under earlier primary instruction。
- npm run check：passed (npm run check -> tsc --noEmit, exit 0)。
- 实机体验：未由本代理验收；留给主代理正式构建与正常入口检查。

本记录只覆盖本组四个精确 SHA。旧 producer pending/false 标记保留为历史，HOLD 图和错误尝试保留原据、不作当前运行素材或后续生图输入。微小原姿态/光照差异按用户保留原图的要求维持。

完整逐文件元数据、直接主代理授权原话及验证状态见 [JSON](root-primary-layer-admission-v1.json)。
