# Rest · 单次 joint coverage 方法原型

[观察页](rest-joint-coverage-observe-v1.html) · [bundle](rest-joint-coverage-bundle-v1.json) · [精确 prompt 与来源](joint-coverage-v1.source.json) · [原生 SVG](joint-source-v1.svg)。

仅 1 次 built-in ImageGen，唯一输入是 root 准入 rest 原母 144a167d…a460f8。输出为 1536×1024 RGB 不透明亮度 mask，未改 PNG。SVG 只以单 mask 显现一次原母 RGB，再叠在 matching clear BG 上；整套 motion=0，非独立 caster。

生产视检 HOLD：人物、发眼、掌、裙边、完整双鞋保留，但脚下外侧真实源地板暗部没有充分选入。观察页 #shoes 给出原母、棋盘主体与重组三列；bundle 附少量只读源像素记录。完整整景近似不构成接触层已干净的证明。

不追加生图，不阈值或改像素，不注册/不改共享源码。primary/layer/runtime=false，交 root 亲审。
