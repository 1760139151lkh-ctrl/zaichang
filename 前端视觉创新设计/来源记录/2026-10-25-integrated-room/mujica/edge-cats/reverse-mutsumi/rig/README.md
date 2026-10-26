# 睦：头右、身尾左的独立方向

主代理已亲看并接受本目录上一级的原始新方向；本目录交付该原图的清 alpha、同画布 body/tail 静态候选，等待主代理亲看分层结果。原图、原 source JSON 和另外四份 Mujica rig 均未修改。

- 原图：`../mutsumi-meme-cat-head-right-v1.png`，1536×1024 RGBA，SHA-256 `3edcb5c85458c4150e196056347c3a8214d229392fc784aad4e49f4682432b74`。
- 分层：`mutsumi-meme-cat-head-right-v1-tail.png` 在后，`mutsumi-meme-cat-head-right-v1-body.png` 在前，两者共享原画布和同一变换。整张结果见 `mutsumi-meme-cat-head-right-v1-clean.png`。
- 实测尾根 `(230,626)`，归一化 `(0.1497395833,0.611328125)`；纸边 y=`833`，归一化 `0.8134765625`；前爪可见下缘参考 `(968,859)`、`(1230,858)`。纸边来自腹部 x475–515 的 y828–838 原生深线中点，前爪自然略垂出纸边，不强迫爪尖同高。
- 不能整图镜像：原角色自身左侧双银夹在近正面观察的右侧。与原方向分别选择独立素材，不靠 CSS 翻转改变方向。

本次先重读完整睦护照及创作方法，再亲看完整原图和带坐标的真实尾根。唯一 ImageGen 输入为本张新原图；`semantic-mask-v1.prompt.txt` 和 `.source.json` 保留实际提交文字、原输出及 SHA。蒙版是粗语义边界，并非像素精确裁边。其整猫标签扩14px后，所有原图 alpha≥250 实心像素均被包含；尾标签扩12px后按本图实际左臀弧约束。最后使用原始 RGB 与 native alpha230–250 门限清除宽蓝晕。所有可见输出像素的 RGB 与原图同坐标差值均为0，未重画脸、双银夹、身体或尾巴。

尾根保18px现有原像素下搭，身体前景保4px原深色臀线交叠；不补不存在的隐藏尾。原生 alpha 最大254，交叠重组可能产生255，不宣称整张 RGBA 与原稿逐字节相同。

亲看证据：`source-root-coordinate-review.png` 仅作原图测量；`static-production-review.png` 上排128px浅/暗背景，下排尾根−5°/0°/+5°，全部不镜像。正常微动建议±3°，静态极值不能证明运行中的拖动、打断、跟边缘和减少动态。`primaryApproved=false`、`runtimeAccepted=false` 保留，等主代理与 life 线分别验收。
