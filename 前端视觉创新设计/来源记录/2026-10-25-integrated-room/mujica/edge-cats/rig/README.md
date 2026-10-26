# 四位Mujica边缘猫：独立静态分层候选

四张原猫均在制作前亲看完整原图、实际尾根与腹线；只以各自原图生成独立三色语义蒙版，不读被拒祥子图、不共用祥子遮罩或标定。原PNG和原source JSON均未修改。

| 角色 | 原RGB身体与尾层 | 尾根原坐标 | 纸边原y | 128px深浅底/镜像及根部极值 |
| --- | --- | --- | --- | --- |
| 睦 | [body](mutsumi/mutsumi-meme-cat-v1-body.png) · [tail](mutsumi/mutsumi-meme-cat-v1-tail.png) | (1354,660) | 846 | [亲看证据](mutsumi/static-production-review.png) |
| 初华 | [body](uika/uika-meme-cat-v1-body.png) · [tail](uika/uika-meme-cat-v1-tail.png) | (1353,664) | 847 | [亲看证据](uika/static-production-review.png) |
| 海铃 | [body](umiri/umiri-meme-cat-v1-body.png) · [tail](umiri/umiri-meme-cat-v1-tail.png) | (1347,662) | 850 | [亲看证据](umiri/static-production-review.png) |
| 若麦 | [body](nyamu/nyamu-meme-cat-v1-body.png) · [tail](nyamu/nyamu-meme-cat-v1-tail.png) | (1359,666) | 845 | [亲看证据](nyamu/static-production-review.png) |

每层均1536×1024 RGBA，所有可见RGB与各自原图的同坐标三通道差分范围均为0。只处理alpha/所有权与完全透明区域的RGB归零，没有重画脸、头身、发色或尾形。完整大小、SHA、alpha bounds与逐图标定见[制作总表](production-summary.json)，各角色目录内的`*-rig-candidate.json`保留完整来源/方法。

## 空间与层序

先画tail，body在前。尾根处的身体深海军蓝弧线属于前景，不能和尾巴一起摆；两层使用同一个全画布变换。左右镜像只作用于共享外层，尾层继续使用自身原坐标pivot，气泡文字放在镜像层外。猫随所属框真实边缘移动，不以全PNG晃动替代尾动。

纸边y按每张图实际腹底墨线分别选定，前爪下缘分别登记，略垂在纸边下；不是人为把所有爪底拉成同一线。128px总画布宽下角色形体约60px高，发形、双色眼和嘴形仍可分辨。夜间小白脸保原色，通过小比例和边缘关系融入，不增加新白色面板。

## 蒙版与精确分离

每人一次内置ImageGen调用，唯一输入为该人的原猫。输出同画布三色mask：白色头身/爪/描边，红色真实尾巴及描边，黑色背景/蓝色散光。真实Prompt、工具输出与SHA均保存在各自目录。

原始语义mask不能直接当精确alpha。按原图实际不透明轮廓，给粗mask扩足遗漏深色墨线：睦/初华/若麦为18px，海铃为26px；这只是覆盖源像素的语义守卫，并不扩画轮廓。逐图确认原alpha≥250的实心源像素均未被守卫裁掉。原alpha在230–250之间收掉散光，原RGB不变；红尾语义在源轮廓和各自臀部弧线内校准。

每根尾巴只有原像素。尾根留18px邻近原RGB搭接藏在身体后，身体保留原海军蓝根部墨线及最多4px的原墨线遮挡，避免小角度接缝；没有绘制不可见新尾根。原位叠合的alpha会因重叠舍入略有变化，因此不声称与原含光晕PNG字节相同。

## 已观察范围

每人仅保留一张够判断的生产证据：上方是128px正常/镜像在深浅底的纸边关系，下方是尾根−5°/0°/+5°静态细节。完整四张源图及共同根部坐标图也已亲看。大蓝色散光退出，原形与角色脸/头发/眼色保留，身体和爪没有随尾动；正常小尺寸未观察到开缝或悬浮。常规微动先限±3°以内，±5°仅为本次静态极值观察范围。

这些是静态素材候选，四人的`primaryApproved`和`runtimeAccepted`仍为false，等待root亲看与实际集成。拖动、镜像控制、冒泡、减少动态、可打断尾动和真实模型理解均不由本图签署。没有修改全局runtime、life源码、原source或祥子诊断，没有新测试runner；没有清理。
