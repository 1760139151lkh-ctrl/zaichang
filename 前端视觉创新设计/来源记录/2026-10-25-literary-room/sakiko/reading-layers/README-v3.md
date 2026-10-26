# V3 · included 联合主体技术候选

[固定观察页](reading-layers-included-observe-v3.html) · [精确来源与边界](reading-layers-included-bundle-v3.json) · [原生 SVG](union-source-v3.svg)。

使用既有 `figure-mask-v2.png` 与 `shadow-mask-v1.png`，先各取亮度，再在 SVG 中以 `feBlend mode=lighten` 作 MAX。原母 RGB 只通过联合 mask 显现一次：空 BG + 人物、完整裙边鞋底及贴身接触材质的联合主体。没有新 PNG，没有新生图。

本候选的 `contactShadow.mode = included`。原来“干净独立影”的提取问题没有被宣称修好。浅底、深底与棋盘能看到裙下的一条原亚麻材质、鞋底附近的原地板暗部，它们与人物一起属于这份固定姿态联合精灵。

已实际查看原母/重组整景、MAX 覆盖、浅深棋盘原像素全主体，以及 face/book/hem/heel 对照。候选只允许整套显隐或整套姿态替换；整套与 BG 共享视口变换。travel/slope/perspective=0，不提供独立身体变形、独立影运动或迁移到其他支撑面的能力。

源母 RGB、BG、F 与 S 的 SHA 已核且文件未改；root 拒绝的 `figure-rgba-candidate-v1.*` 没有作为输入或颜色来源。原 JSON 与 PNG 保留，未改 src/TS、测试或端口。root 已亲看 #scene/#checker/#hem/#heel 并批准精确四 SHA 的固定原坐标 included 联合层；primary=true，runtime=false。完整边界见 [主审准入记录](sakiko-reading-apricot-literary-included-primary-admission-v1.json)。旧 v1/v2 独立影候选仍为 false，未改。

