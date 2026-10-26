# MyGO五位边缘猫与乐奈独立反向：静态rig候选

本轮在每次生成前读取对应角色完整护照与`character-art-direction.md`，亲看五张原猫，再分别制作同画布语义mask。灯的小石头、爱音纸鸟、乐奈拨片、素世便签、立希纸桥全部保在固定身体层，保住各自原来的具体事情；没有把好图改成同一个空白趴姿。原图、原source与已准入四Mujica文件均未改。

## 文件与标定

| 角色/方向 | 原RGB层 | 原画布尾根 | 纸边y | 复核 |
| --- | --- | --- | --- | --- |
| 灯 | [body](tomori/tomori-edge-meme-cat-v1-body.png) · [tail](tomori/tomori-edge-meme-cat-v1-tail.png) | (1357,659) | 848 | [128px/根部](tomori/static-production-review.png) |
| 爱音 | [body](anon/anon-edge-meme-cat-v1-body.png) · [tail](anon/anon-edge-meme-cat-v1-tail.png) | (1358,670) | 854 | [128px/根部](anon/static-production-review.png) |
| 乐奈·头左身右 | [body](rana/rana-edge-meme-cat-v1-body.png) · [tail](rana/rana-edge-meme-cat-v1-tail.png) | (1344,672) | 846 | [128px/根部](rana/static-production-review.png) |
| 素世 | [body](soyo/soyo-edge-meme-cat-v1-body.png) · [tail](soyo/soyo-edge-meme-cat-v1-tail.png) | (1356,673) | 850 | [128px/根部](soyo/static-production-review.png) |
| 立希 | [body](taki/taki-edge-meme-cat-v1-body.png) · [tail](taki/taki-edge-meme-cat-v1-tail.png) | (1351,676) | 851 | [128px/根部](taki/static-production-review.png) |
| 乐奈·独立头右身左 | [body](rana-reverse/rana-head-right-v1-body.png) · [tail](rana-reverse/rana-head-right-v1-tail.png) | (199,656) | 832 | [128px/根部](rana-reverse/static-production-review.png) |

每层均1536×1024 RGBA。全部可见RGB与各自源图的同坐标RGB直接差分，三通道范围均为0；透明区RGB归零。尺寸、SHA、alpha bounds、归一化pivot/support及实际源轮廓见[production-summary](production-summary.json)和各目录`*-rig-candidate.json`、`production-calibration.json`。

## 乐奈换方向不换左右眼

[两方向深浅底对照](rana-facing-pair-128-light-dark.png)使用两张独立原图，没有任何一张通过整图mirror取得反向。乐奈自身右眼为金、自身左眼为蓝；本两幅近正脸均表现为观者左金右蓝，即使头从画布左侧换到右侧也不交换。

新[反向原稿](rana-reverse/rana-head-right-v1.png)由ImageGen独立重组，头和两前爪在右、身体和尾在左，仍有自己的银白短发、小猫口与蓝拨片。完整[Prompt](rana-reverse/rana-head-right-v1.prompt.txt)与[source](rana-reverse/rana-head-right-v1.source.json)保留了具体相处目的、护照/方法版本和唯一原猫参考。它是另一个方向候选，不是另一个角色ID。

两套乐奈均为`mirrorSafe:false`。组件按方向选择相应真实asset，不给其外层`scaleX(-1)`；独立方向各有实际尾根、层序与纸边，不能把x坐标简单取反后套用。气泡文字继续位于图层外。

## 分离方法与实际修复

每人自己的三色ImageGen mask仅负责语义归属：白为头身/爪/当前实物，红为真实尾，黑为背景/散光。粗mask存在少选原描边的情况，因此用原native alpha和逐图臀部墨线校准，所有原alpha≥250的实心源像素都保在语义守卫内；不根据mask重画人物。

原alpha在230–250之间收掉广泛蓝色散光，原RGB不变。尾层只取原来可见的尾巴，加18px邻近原RGB藏在身体前景后的搭接；身体保留原海军蓝根部遮挡。先tail、后body。通常尾微动先限±3°，本轮仅静态观察−5°/0°/+5°，不把整PNG晃动当尾动。

爱音首张mask把大片白脸误标黑，已拒绝并用原图+技术mask重取v2；没有按错误黑洞做成透明脸。灯首轮源轮廓校准后发现9个尾尖抗锯齿像素仍归body，已把其语义守卫由12px校准为14px，复查固定body在远尾尖的alpha为0；身体/脸/原RGB均未改变。其他角色各用实际守卫与弧线，未套相同坐标。

## 已亲看范围与交接边界

五张完整原图、新乐奈反向完整原稿、各自实际尾根与腹线已亲看。每套仅保一张足够判断的制作证据：128px浅/暗纸边与镜像（乐奈明确不镜像）以及局部尾根极值。去大蓝晕后发色/眼色/嘴形、原道具和低趴支撑保持，身体/前爪固定，小角度接缝在正常小尺寸可读。

当前是五个角色、六套方向的静态候选，不是六个新角色，也不折算人形活动矩阵。`primaryApproved:false`、`runtimeAccepted:false`等待root逐图亲看与集成实操。实际左右停靠、拖动接管、冒泡、减少动态、可打断尾动和模型理解均不由静图签署。没有修改全局runtime或life源码，没有新测试runner；没有清理。
