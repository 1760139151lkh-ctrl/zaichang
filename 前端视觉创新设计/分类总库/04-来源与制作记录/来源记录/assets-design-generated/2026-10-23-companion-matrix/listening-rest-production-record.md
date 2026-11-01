# 祥子倾听／休息：实际生成与原景分层链

本记录只导航真实调用和生产参数。母图已由主代理逐图批准，静态旧层也由主代理亲看；新倾听接触影、运行准入和真实Stage拖动仍待主代理验收，生产者未代签。

## listening

- 原母图：[实际Prompt](sakiko-listening-apricot-prompt.txt)、[原生成来源与SHA](sakiko-listening-apricot-source.json)。唯一原始输入是获审空房v4。
- **选用原始mask实际调用**：[sakiko-listening-apricot-mask-prompt.txt](sakiko-listening-apricot-mask-prompt.txt)。原RGB黑白mask保留为`...-mask-candidate-v1.png`；未直接冒充有效alpha。
- **matching BG实际调用**：[sakiko-listening-apricot-background-prompt.txt](sakiko-listening-apricot-background-prompt.txt)。从本母图移走人物，明确两只脱下便鞋留房间；原产物为`...-background.png`。
- 全部提取尝试、退回原因和工具默认输出SHA：[extraction-source](sakiko-listening-apricot-extraction-source.json)。失败mask与其他退稿未作为后续生成输入。
- 原RGB精确alpha校准：[v7参数](sakiko-listening-apricot-calibration-v7.json)、[处理脚本](listening-rest-layer-calibration.py)、[v7处理来源](sakiko-listening-apricot-layer-source.json)。只处理真实可见裙摆／发束／靠枕边界，不补画被遮挡人体；完整RGB逐字节来自母图。
- 新接触影：[共享helper参数v8](sakiko-listening-apricot-layer-parameters-v8.json)、[共享helper](extract-scene-layers.py)、[v8实际生产记录与全部输出SHA](sakiko-listening-apricot-layer-processing-v8.json)。输入matte是已亲看v7 figure的原alpha，alpha新增改动为0。只选袜脚—榻垫、衣摆／髋—座面的真实薄接触ROI，距figure不超过3原像素；normal source-over RGBA原景残差，不新画椭圆，不用multiply，不携带整块垫纹或地板。
- v8 figure完整RGB仍与母图相同；两只脱鞋及其地上阴影始终静留BG，鞋区RGB变化0。背景显式清掉原身体／接触影后，新的影层才随figure一起移动。
- [scene候选](sakiko-listening-apricot.scene.json)保持`review.approvedByPrimary=false`；`contactShadow.mode=separate`，短行程候选`.008`。独立锚点／热区／支承理由见[geometry observations](sakiko-listening-apricot-geometry-observations.json)。

## rest

- 原母图：[实际Prompt](sakiko-rest-apricot-prompt.txt)、[原来源与SHA](sakiko-rest-apricot-source.json)。
- **选用原始mask实际调用**：[sakiko-rest-apricot-mask-v3-prompt.txt](sakiko-rest-apricot-mask-v3-prompt.txt)；对应工具原产物保留为`...-mask-candidate-v3.png`。其他错位mask／放大cutout均退回，不回喂。
- **matching BG实际调用**：[sakiko-rest-apricot-background-prompt.txt](sakiko-rest-apricot-background-prompt.txt)，从本母图移走人物及其穿着鞋。
- [完整提取调用链](sakiko-rest-apricot-extraction-source.json)、[最终精确参数v6](sakiko-rest-apricot-calibration-v6.json)、[实际处理记录](sakiko-rest-apricot-layer-source.json)、[处理脚本](listening-rest-layer-calibration.py)。最终figure为`...-figure-calibrated-v4.png`、灰度alpha为`...-alpha-calibrated-v6.png`、matching BG为`...-background-calibrated-v5.png`；不同版本号由真实迭代产生，非stem推断。
- [scene候选](sakiko-rest-apricot.scene.json)仍未自签；多点支承保持`travel=0`，不造可拖的隐藏轮廓或新姿态。根已亲看静态浅深底／重合成，源码准入仍由根完成。

## 当前图像证据

本机忽略目录`.test-data/life-layer-review/`：

- listening新影层：`listening-shadow-v8-light.png`、`listening-shadow-v8-dark.png`及其`-detail.png`；完整背景端点`listening-shadow-v8-full-bg-left.png`、`...-right.png`与`...-center.png`；无人物BG为原图目录`...-background-calibrated-v8.png`。
- rest：`rest-final-light-detail.png`、`rest-final-dark-detail.png`、`rest-final-recombined.png`；无人物BG为`...-background-calibrated-v5.png`。

端点是**Pillow在完整1536×1024原画布**按BG→normalRGBA原景影→原RGB figure绘制的静态检查，位移±12.288px、垂向±1.10592px；没有变换生产层文件，没有冒称浏览器、Electron真实拖动或Stage动效已通过。主代理将另审实际集成。
