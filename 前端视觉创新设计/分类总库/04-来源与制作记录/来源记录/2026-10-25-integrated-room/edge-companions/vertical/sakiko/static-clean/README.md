# 祥子竖挂：静态透明素材

原图已由主代理亲看并准入静态方向。这里仅保原RGB和原画布清透明散点，不是尾动rig。原图实际1254×1254，并非Prompt里的1024；原图SHA `5bfc229f5c0506f6fcb93646d4058543d42dbba910eafb5f99a5ebdefcb55d05`。

本原图没有横趴原稿的宽蓝晕，不套230–250 opacity gate。使用其自己生成的 ImageGen 整猫蒙版，扩8px后保留全部原alpha≥8像素；仅去alpha≤1散点及蒙版外极低alpha，2692个原非零alpha像素变透明，原alpha≥8没有丢失。其他native alpha继续保持原值，所有可见RGB与原图同坐标差为0，无裁切、缩放、重画或生成隐藏身体。实际clean alphaBounds为`[265,13,1028,1207]`，alpha0–255。

输出 `sakiko-vertical-edge-cat-pilot-v1-static-clean.png`，SHA `df20ec4413dff5e68460b6b46d2f19db2ebf94c85d303e3bb8ee448862a38cbd`。

竖边独立锚点为source `(915,805)`，归一化`(0.7296650718,0.6419457735)`。x915亲看穿过上前爪y495–552、下前爪y661–733、后爪y984–1061。y805取真实主躯干约580–1030的中部作摆放参考，不是假定所有爪同高或新增关节。镜像候选的连续坐标锚点`(339,805)`；只水平镜像、头保持直立，绝不可把横趴图旋转90°冒充竖挂。

已亲看整张与`static-128-light-dark-grip-review.png`的128px浅暗/正常/水平镜像和实际竖线。新clean与镜像摆放仍待主代理及life真实界面验收，metadata不代签runtime。禁止整PNG晃动假尾；没有独立尾层。未修改registry、App、Edge或原图/source记录。
