# 祥子 resume-violet：主代理逐 SHA 静态图层准入

当前场景：`sakiko-resume-violet-literary-included-v1`。主代理在当前健康会话明确批准本页精确母图、空底、F、S 的固定 included 组合；不是用户签字，也不是运行、独立动态或 360 活动矩阵完成。

原景 RGB 在 U=MAX(L(F),L(S)) 下只绘一次。S 含原位座垫、木地板和柔软接收，并可与 F 重叠；它不是可以独立平移的 caster。travel / slope / perspective 全部为 0。

## 精确选源

|角色|来源|SHA-256|运行素材|
|---|---|---|---|
|mother|[sakiko-resume-violet-literary-extension-v1.png](../../../../../2026-10-25-literary-room/sakiko/missing-theme-extension-v1/sakiko-resume-violet-literary-extension-v1.png)|`f336dd4689043b487411daa49d93ee83ce67fc670d01c971d42938ba84222973`|[sakiko-resume-violet-literary-included-v1-mother.png](../../../../../../运行素材/companion/scenes/sakiko-resume-violet-literary-included-v1-mother.png)|
|background|[background-v1.png](background-v1.png)|`a05b00ade84a17de62e1f61813db70647dddd70f51f364a5bca3a486944c1327`|[sakiko-resume-violet-literary-included-v1-background.png](../../../../../../运行素材/companion/scenes/sakiko-resume-violet-literary-included-v1-background.png)|
|figureMask|[figure-mask-v1.png](figure-mask-v1.png)|`a4001631c77753fe3cc6643a8ffc5823c1b8b440756875aa56ca67065f6e2717`|[sakiko-resume-violet-literary-included-v1-mask.png](../../../../../../运行素材/companion/scenes/sakiko-resume-violet-literary-included-v1-mask.png)|
|contactMask|[contact-mask-v1.png](contact-mask-v1.png)|`763f3247f1bb48d3b0645d94b161c8c65f4668f0877675d981c02f1f57d2c09d`|[sakiko-resume-violet-literary-included-v1-contact-mask.png](../../../../../../运行素材/companion/scenes/sakiko-resume-violet-literary-included-v1-contact-mask.png)|

## 主代理实际亲看的 Browser 文件

只记录下列 5 个文件。它们保留正式 CUA 原始截图字节，扩展名为 .png、实际编码为 image/jpeg。下表尺寸由真实解码读取，纠正旧 producer 记录按 PNG 文件头猜尺寸的元数据；未重编码、未改变 SHA。截图仅用于审核，禁止作生图输入。

|文件|真实尺寸|SHA-256|
|---|---|---|
|[mother-composite-v1.png](browser-observations/mother-composite-v1.png)|1265 × 454|`f1095c711a00926a9ef9e53df30b65d3f4e3d497d99a196f3005a603a98991c7`|
|[light-dark-checker-full-v1.png](browser-observations/light-dark-checker-full-v1.png)|1265 × 528|`8362654b78b6f186ab0d0e04b3d2b8126cc2b8c04e0191b09795c19e1fea593f`|
|[face-hair-original-union-composite-v1.png](browser-observations/face-hair-original-union-composite-v1.png)|1265 × 448|`cd40ba24120cf1499b6e8669e872cad64889f401dfc13bf2ab636ec67e3f6a44`|
|[book-seat-original-union-composite-v1.png](browser-observations/book-seat-original-union-composite-v1.png)|1265 × 544|`8e66ad6b516c929b875cd6ac5e3e6a2109e6184dfa81bc921891ac6ed588a439`|
|[shoes-contact-original-union-composite-v1.png](browser-observations/shoes-contact-original-union-composite-v1.png)|1265 × 497|`9e0a70cd0eafcb320b1d1270674dbcaadd3080bcf063fed1659b1ab73e15acd0`|

## 固定几何与保护范围

- F >32：`[951,124,1328,904]`；S >32：`[914,533,1325,913]`；U >32：`[914,124,1328,913]`（右/下为 exclusive）。
- 阈值仅用于只读几何元数据；原始连续 PNG 掩膜未阈值化、未裁切或手改。
- 本次七组 U 总范围 `[762,86,1378,955]`；加水平 96 / 垂直 12 源像素保护范围为 `[666,74,1474,967]`，高度 893。现有同族 protected-fit / safe-cover 函数未改。
- 座/地锚点分别为 `[1150,605]` / `[1150,895]`：亲看原母后选择可见裙臀接垫、完整鞋底落地中点；不是隐藏关节或移动标定。

## 登记和验证

- manifest：[sakiko-resume-violet-literary-included-v1.scene.json](../../../../../../运行素材/companion/scenes/sakiko-resume-violet-literary-included-v1.scene.json)
- 原母/BG/F/S 均为 1536 × 1024 PNG，逐字节复制；源 SHA 对照已核。
- 静态登记：已写入。
- 现有 manifest 解析：pending primary normal build/actual selection; no extra Vite build started under earlier primary instruction。
- npm run check：passed (npm run check -> tsc --noEmit, exit 0)。
- 实机体验：未由本代理验收；留给主代理正式构建与正常入口检查。

本记录只覆盖本组四个精确 SHA。旧 producer pending/false 标记保留为历史，HOLD 图和错误尝试保留原据、不作当前运行素材或后续生图输入。微小原姿态/光照差异按用户保留原图的要求维持。

完整逐文件元数据、直接主代理授权原话及验证状态见 [JSON](root-primary-layer-admission-v1.json)。
