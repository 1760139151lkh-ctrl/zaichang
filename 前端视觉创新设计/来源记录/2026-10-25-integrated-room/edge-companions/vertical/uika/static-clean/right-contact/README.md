# uika：原native alpha保留的竖挂静态素材

原图已由root亲看并准静态方向；本次不重画、不新生图、不抠掉原有主体。完整原图和真实浅暗合成显示native alpha已正常，原黑底工具预览中的蓝云位于alpha0隐藏RGB。只把完全透明像素的RGB置0，所有alpha值及任意alpha>0的RGB逐像素保持原值；无裁切、缩放或换脸。新clean等root亲看128板，不代签runtime。

- clean：`uika-vertical-edge-cat-v1-static-clean.png`，SHA `1eb2776d49e53c5c9a56f25efe87ed44e6c5ea1dfa77b75e8b50142512fa66cf`。
- 实际画布：[1254, 1254]；实际nonzero alphaBounds：[25, 8, 1125, 1228]。原A1微散点会扩大这个实际bounds，不篡改。
- 实际可见轮廓参考alpha≥8 bounds：[266, 34, 1011, 1217]；这是布局参考，不能冒充PNG实际alphaBounds。
- 独立竖接触轴/sourceY锚点：`(915,835)`；归一化[0.7296650717703349, 0.6658692185007975]。Y仅取真实主躯干近似中部作为摆放参考，不造关节；三爪各有原生y位置。
- MirrorSafe：True。Only horizontal mirror candidate reviewed; upright face and native aspect retained, no quarter-turn.

亲看`static-128-light-dark-grip-review.png`与`source-contact-coordinate-review.png`，真实接触轴已画在同源128px高浅暗底与三只爪的原生局部。原角色/source记录未修改，完整Prompt/依赖/原ImageGen输出沿candidate内原sourceRecord读取。没有独立尾层，只能静态sprite；不许晃整张PNG声称摆尾，也不旋转90度冒充另一种抱边。
