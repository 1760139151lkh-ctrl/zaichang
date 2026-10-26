# 祥子 attention-violet：主代理逐 SHA 静态图层准入

当前场景：`sakiko-attention-violet-shared-page-included-v2`。主代理在当前健康会话明确批准本页精确母图、空底、F、S 的固定 included 组合；不是用户签字，也不是运行、独立动态或 360 活动矩阵完成。

原景 RGB 在 U=MAX(L(F),L(S)) 下只绘一次。S 含原位座垫、木地板和柔软接收，并可与 F 重叠；它不是可以独立平移的 caster。travel / slope / perspective 全部为 0。

## 精确选源

|角色|来源|SHA-256|运行素材|
|---|---|---|---|
|mother|[sakiko-attention-violet-shared-page-v2.png](../../sakiko-attention-violet-shared-page-v2.png)|`69c14d7b7df22f634e3bc884c01396bdcd0d3f0fe70678803a05a10b52366208`|[sakiko-attention-violet-shared-page-included-v2-mother.png](../../../../../../运行素材/companion/scenes/sakiko-attention-violet-shared-page-included-v2-mother.png)|
|background|[background-v1.png](background-v1.png)|`1aa2ca1254bcbb917cae56db6c09d1725f6b17d2f10d8b43b81189ea95068d6b`|[sakiko-attention-violet-shared-page-included-v2-background.png](../../../../../../运行素材/companion/scenes/sakiko-attention-violet-shared-page-included-v2-background.png)|
|figureMask|[figure-mask-v2.png](figure-mask-v2.png)|`5285f653e453905d38e5992bbd20cc46f54d0d390cd59308a1dc13dde11b5061`|[sakiko-attention-violet-shared-page-included-v2-mask.png](../../../../../../运行素材/companion/scenes/sakiko-attention-violet-shared-page-included-v2-mask.png)|
|contactMask|[contact-mask-v1.png](contact-mask-v1.png)|`89cf69bd67f18c81c4170e4897850cc0d7e88c896c815b2fa4c6bdc40ae4c967`|[sakiko-attention-violet-shared-page-included-v2-contact-mask.png](../../../../../../运行素材/companion/scenes/sakiko-attention-violet-shared-page-included-v2-contact-mask.png)|

## 主代理实际亲看的 Browser 文件

只记录下列 8 个文件。它们保留正式 CUA 原始截图字节，扩展名为 .png、实际编码为 image/jpeg。下表尺寸由真实解码读取，纠正旧 producer 记录按 PNG 文件头猜尺寸的元数据；未重编码、未改变 SHA。截图仅用于审核，禁止作生图输入。

|文件|真实尺寸|SHA-256|
|---|---|---|
|[01-scene.png](browser-observations/01-scene.png)|1265 × 720|`24d383c5e4d3d10717f41457a023f0c14f020d1262931fd4bd16904223d4762e`|
|[02b-checker.png](browser-observations/02b-checker.png)|839 × 582|`cdd57a08318b2c0ce96eb51b347732892c557d48c9a57af85ae4106b0876e926`|
|[03-face.png](browser-observations/03-face.png)|1265 × 720|`a89f62111478f43a3e5253cd47d6183ab95e3cf62aaff801608fe15c95d39d47`|
|[04c-book-left-detail.png](browser-observations/04c-book-left-detail.png)|1265 × 720|`8c8d95d276c77f721d4edcde74f913a7433c36829b722df89628beb771199035`|
|[04d-book-composite.png](browser-observations/04d-book-composite.png)|837 × 592|`877e743d62ef1e828efa1ebf179ad82249a6eb5f09c606a1fa2e44acff5d90a7`|
|[05-hem.png](browser-observations/05-hem.png)|1265 × 720|`eaae27b34f37ba2b22208a0eec179b72dbfc1a166682b97b14f604478e81ec8e`|
|[06-shoes.png](browser-observations/06-shoes.png)|1265 × 720|`de96055ed0c9a184ffb54a4f5dcf717ea437076eb423253e6199329529757048`|
|[07-contact.png](browser-observations/07-contact.png)|1265 × 720|`ef7802397d8f67113d595cc78a3d3ccd5cac4c46ab5fdb3d37431c7b7ed781e5`|

不声称主代理看过 `02-subject.png` 或 `04b-book-union.png`。

## 固定几何与保护范围

- F >32：`[904,115,1375,928]`；S >32：`[880,541,1366,937]`；U >32：`[880,115,1375,937]`（右/下为 exclusive）。
- 阈值仅用于只读几何元数据；原始连续 PNG 掩膜未阈值化、未裁切或手改。
- 本次七组 U 总范围 `[762,86,1378,955]`；加水平 96 / 垂直 12 源像素保护范围为 `[666,74,1474,967]`，高度 893。现有同族 protected-fit / safe-cover 函数未改。
- 座/地锚点分别为 `[1180,584]` / `[1008,916]`：亲看原母后选择可见裙臀接垫、完整鞋底落地中点；不是隐藏关节或移动标定。

## 登记和验证

- manifest：[sakiko-attention-violet-shared-page-included-v2.scene.json](../../../../../../运行素材/companion/scenes/sakiko-attention-violet-shared-page-included-v2.scene.json)
- 原母/BG/F/S 均为 1536 × 1024 PNG，逐字节复制；源 SHA 对照已核。
- 静态登记：已写入。
- 现有 manifest 解析：pending primary normal build/actual selection; no extra Vite build started under earlier primary instruction。
- npm run check：passed (npm run check -> tsc --noEmit, exit 0)。
- 实机体验：未由本代理验收；留给主代理正式构建与正常入口检查。

本记录只覆盖本组四个精确 SHA。旧 producer pending/false 标记保留为历史，HOLD 图和错误尝试保留原据、不作当前运行素材或后续生图输入。微小原姿态/光照差异按用户保留原图的要求维持。

完整逐文件元数据、直接主代理授权原话及验证状态见 [JSON](root-primary-layer-admission-v1.json)。
