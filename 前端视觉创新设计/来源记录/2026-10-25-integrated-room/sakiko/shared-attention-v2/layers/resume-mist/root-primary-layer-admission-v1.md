# 祥子 resume-mist：主代理逐 SHA 静态图层准入

当前场景：`sakiko-resume-mist-soft-recognition-included-v4`。主代理在当前健康会话明确批准本页精确母图、空底、F、S 的固定 included 组合；不是用户签字，也不是运行、独立动态或 360 活动矩阵完成。

原景 RGB 在 U=MAX(L(F),L(S)) 下只绘一次。S 含原位座垫、木地板和柔软接收，并可与 F 重叠；它不是可以独立平移的 caster。travel / slope / perspective 全部为 0。

## 精确选源

|角色|来源|SHA-256|运行素材|
|---|---|---|---|
|mother|[sakiko-resume-mist-soft-recognition-v4.png](../../sakiko-resume-mist-soft-recognition-v4.png)|`9c9e2aa283a1d809a3e6edf9f574e026de3046093e6c8dcd8b7c0316961dc624`|[sakiko-resume-mist-soft-recognition-included-v4-mother.png](../../../../../../运行素材/companion/scenes/sakiko-resume-mist-soft-recognition-included-v4-mother.png)|
|background|[background-v1.png](background-v1.png)|`cb609191291dfa5ff189878c890569ea4377cecded41b1962feb14746db3d7ad`|[sakiko-resume-mist-soft-recognition-included-v4-background.png](../../../../../../运行素材/companion/scenes/sakiko-resume-mist-soft-recognition-included-v4-background.png)|
|figureMask|[figure-mask-v1.png](figure-mask-v1.png)|`a48c3f85d41b27e58eb3080cf6e3279edd743bb509da669e47793e2fc292941a`|[sakiko-resume-mist-soft-recognition-included-v4-mask.png](../../../../../../运行素材/companion/scenes/sakiko-resume-mist-soft-recognition-included-v4-mask.png)|
|contactMask|[contact-mask-v2.png](contact-mask-v2.png)|`4dcb075e2072eeb42c44a2caba82f50c48335eccce9e537ba81f7cb72f89afb0`|[sakiko-resume-mist-soft-recognition-included-v4-contact-mask.png](../../../../../../运行素材/companion/scenes/sakiko-resume-mist-soft-recognition-included-v4-contact-mask.png)|

## 主代理实际亲看的 Browser 文件

只记录下列 5 个文件。它们保留正式 CUA 原始截图字节，扩展名为 .png、实际编码为 image/jpeg。下表尺寸由真实解码读取，纠正旧 producer 记录按 PNG 文件头猜尺寸的元数据；未重编码、未改变 SHA。截图仅用于审核，禁止作生图输入。

|文件|真实尺寸|SHA-256|
|---|---|---|
|[mother-composite-v1.png](browser-observations/mother-composite-v1.png)|1265 × 454|`edbe24d47c09fb3e9af6277466a8332cec9c2f1a1b9b31c3f4c77833022d88ee`|
|[light-dark-checker-full-v1.png](browser-observations/light-dark-checker-full-v1.png)|1265 × 528|`a4439e087d64437e63a633e58b3697c17037fb1b79051a2c4cff17af3009dc3b`|
|[face-hair-original-union-composite-v1.png](browser-observations/face-hair-original-union-composite-v1.png)|1265 × 430|`d5c09c57126dd28a0f145d5ff9e4e36497bc966b81e536f43c94f610d4e6fe84`|
|[book-seat-original-union-composite-v1.png](browser-observations/book-seat-original-union-composite-v1.png)|1265 × 501|`49a634b5ac99f91b1ef6fa26d8b314e7fab80e1ff5bea909d6607d03e6eb8c66`|
|[shoes-contact-original-union-composite-v1.png](browser-observations/shoes-contact-original-union-composite-v1.png)|1265 × 503|`01c43bcc68a47c0bb178d08caf042eec98a42ce366e97247de076d04a19f7e99`|

## 固定几何与保护范围

- F >32：`[812,86,1378,931]`；S >32：`[769,547,1373,955]`；U >32：`[769,86,1378,955]`（右/下为 exclusive）。
- 阈值仅用于只读几何元数据；原始连续 PNG 掩膜未阈值化、未裁切或手改。
- 本次七组 U 总范围 `[762,86,1378,955]`；加水平 96 / 垂直 12 源像素保护范围为 `[666,74,1474,967]`，高度 893。现有同族 protected-fit / safe-cover 函数未改。
- 座/地锚点分别为 `[1180,606]` / `[913,921]`：亲看原母后选择可见裙臀接垫、完整鞋底落地中点；不是隐藏关节或移动标定。

## 登记和验证

- manifest：[sakiko-resume-mist-soft-recognition-included-v4.scene.json](../../../../../../运行素材/companion/scenes/sakiko-resume-mist-soft-recognition-included-v4.scene.json)
- 原母/BG/F/S 均为 1536 × 1024 PNG，逐字节复制；源 SHA 对照已核。
- 静态登记：已写入。
- 现有 manifest 解析：pending primary normal build/actual selection; no extra Vite build started under earlier primary instruction。
- npm run check：passed (npm run check -> tsc --noEmit, exit 0)。
- 实机体验：未由本代理验收；留给主代理正式构建与正常入口检查。

本记录只覆盖本组四个精确 SHA。旧 producer pending/false 标记保留为历史，HOLD 图和错误尝试保留原据、不作当前运行素材或后续生图输入。微小原姿态/光照差异按用户保留原图的要求维持。

完整逐文件元数据、直接主代理授权原话及验证状态见 [JSON](root-primary-layer-admission-v1.json)。


## 历史 SVG 引用纠正（v2）

旧 `union-source-v1.svg` / `composite-source-v1.svg` 误指暖杏 attention 母与旧 S-v1，原字节/SHA 保留，明确不得作证或生图输入。新 [correct-source-v2.svg](correct-source-v2.svg) 与 [correct-composite-source-v2.svg](correct-composite-source-v2.svg) 仅引用当前正确 resume-mist 母/F/S-v2/BG，同画布 MAX 原RGB一次。原 PNG、几何、业务语义与已审 HTML 均未改。Root 实际38视图审批不扩签到旧 SVG；详情见 [纠正记录](svg-reference-correction-v2.json)。
