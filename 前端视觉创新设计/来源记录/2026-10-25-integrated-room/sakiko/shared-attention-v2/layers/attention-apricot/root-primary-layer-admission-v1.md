# 祥子 attention-apricot：主代理逐 SHA 静态图层准入

当前场景：`sakiko-attention-apricot-shared-page-included-v2`。主代理在当前健康会话明确批准本页精确母图、空底、F、S 的固定 included 组合；不是用户签字，也不是运行、独立动态或 360 活动矩阵完成。

原景 RGB 在 U=MAX(L(F),L(S)) 下只绘一次。S 含原位座垫、木地板和柔软接收，并可与 F 重叠；它不是可以独立平移的 caster。travel / slope / perspective 全部为 0。

## 精确选源

|角色|来源|SHA-256|运行素材|
|---|---|---|---|
|mother|[sakiko-attention-apricot-shared-page-v2.png](../../sakiko-attention-apricot-shared-page-v2.png)|`f04805d0e723420c48cf4e16005d4c863df50042339c65290a34491e553de238`|[sakiko-attention-apricot-shared-page-included-v2-mother.png](../../../../../../运行素材/companion/scenes/sakiko-attention-apricot-shared-page-included-v2-mother.png)|
|background|[background-v1.png](background-v1.png)|`a1d2b37b4f404b4217a093ca22c1cda916e227922822c32859faf7f6901931bf`|[sakiko-attention-apricot-shared-page-included-v2-background.png](../../../../../../运行素材/companion/scenes/sakiko-attention-apricot-shared-page-included-v2-background.png)|
|figureMask|[figure-mask-v2.png](figure-mask-v2.png)|`63c8a0a3953f741cc687f324f4045f5856506de3010d84f92c85f94f24d81b46`|[sakiko-attention-apricot-shared-page-included-v2-mask.png](../../../../../../运行素材/companion/scenes/sakiko-attention-apricot-shared-page-included-v2-mask.png)|
|contactMask|[contact-mask-v1.png](contact-mask-v1.png)|`68cede6cd8df635abb1208bb1829d8f6ca67cd8528aa8de434999f60a78927f0`|[sakiko-attention-apricot-shared-page-included-v2-contact-mask.png](../../../../../../运行素材/companion/scenes/sakiko-attention-apricot-shared-page-included-v2-contact-mask.png)|

## 主代理实际亲看的 Browser 文件

只记录下列 5 个文件。它们保留正式 CUA 原始截图字节，扩展名为 .png、实际编码为 image/jpeg。下表尺寸由真实解码读取，纠正旧 producer 记录按 PNG 文件头猜尺寸的元数据；未重编码、未改变 SHA。截图仅用于审核，禁止作生图输入。

|文件|真实尺寸|SHA-256|
|---|---|---|
|[mother-composite-v2.png](browser-observations/mother-composite-v2.png)|1265 × 584|`7bca0351181beeb5553900413ff2550a6c0861b620465fd0d7589a3e608c2a92`|
|[light-dark-checker-full-v2.png](browser-observations/light-dark-checker-full-v2.png)|1265 × 584|`fa854adbb39bcf502040935dcaa4fd830cb11f058683dc180a1240bb77c83132`|
|[face-hair-original-union-composite-v2.png](browser-observations/face-hair-original-union-composite-v2.png)|1265 × 584|`d4a2687e75725ebbea7e877d318f5ab9619e5f9785f5f0b1105c276985c45a49`|
|[book-seat-original-union-composite-v2.png](browser-observations/book-seat-original-union-composite-v2.png)|1265 × 584|`5afdc8c1f1a90572aa955b6790795f0d00e1a30d18ec36acfbc7004df26c7f61`|
|[shoes-contact-original-union-composite-v2.png](browser-observations/shoes-contact-original-union-composite-v2.png)|1265 × 584|`724e466e1d55b2725ec66a17731224f47d2c5f27e94b9a5898f3a6ae39b003e7`|

## 固定几何与保护范围

- F >32：`[901,112,1373,929]`；S >32：`[849,547,1376,948]`；U >32：`[849,112,1376,948]`（右/下为 exclusive）。
- 阈值仅用于只读几何元数据；原始连续 PNG 掩膜未阈值化、未裁切或手改。
- 本次七组 U 总范围 `[762,86,1378,955]`；加水平 96 / 垂直 12 源像素保护范围为 `[666,74,1474,967]`，高度 893。现有同族 protected-fit / safe-cover 函数未改。
- 座/地锚点分别为 `[1180,590]` / `[1001,914]`：亲看原母后选择可见裙臀接垫、完整鞋底落地中点；不是隐藏关节或移动标定。

## 登记和验证

- manifest：[sakiko-attention-apricot-shared-page-included-v2.scene.json](../../../../../../运行素材/companion/scenes/sakiko-attention-apricot-shared-page-included-v2.scene.json)
- 原母/BG/F/S 均为 1536 × 1024 PNG，逐字节复制；源 SHA 对照已核。
- 静态登记：已写入。
- 现有 manifest 解析：pending primary normal build/actual selection; no extra Vite build started under earlier primary instruction。
- npm run check：passed (npm run check -> tsc --noEmit, exit 0)。
- 实机体验：未由本代理验收；留给主代理正式构建与正常入口检查。

本记录只覆盖本组四个精确 SHA。旧 producer pending/false 标记保留为历史，HOLD 图和错误尝试保留原据、不作当前运行素材或后续生图输入。微小原姿态/光照差异按用户保留原图的要求维持。

完整逐文件元数据、直接主代理授权原话及验证状态见 [JSON](root-primary-layer-admission-v1.json)。
