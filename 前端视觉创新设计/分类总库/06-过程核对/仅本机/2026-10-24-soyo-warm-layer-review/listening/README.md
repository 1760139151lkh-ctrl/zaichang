# Soyo listening apricot 原景层候选

最终引用为 soyo-listening-apricot.scene.json → calibrated-v20 四层，support=window-seat，travel/slope/perspective 全 0。approvedByPrimary=false，未注册运行。源母/原 mother Prompt/source 未修改。

已独立亲读 actual v2 mother Prompt/source，亲看正确完整母图、生成 matching BG、深浅底/重合成/空房，以及原发/窗柱像素网格。v20 人物 RGB 仍取整个原母图，无缩放/位移/扭曲/脸/人体或毛发 RGB 重画。头部、脸、白领与金币/胸章均完整；一手在膝上、一手撑原坐垫；两袜脚归人物，两只脱下的 floor loafers 归房间且保原位置。

母图 SHA：a40505d14d142b608ed50b76de82c80b07ba144e21529f225561161181b5ced4。四层均 1536×1024，alpha bounds [1197,257,1444,587]。人物 RGB payload 与原母相同，具体 SHA 见 layer-processing-v20.json。

Imagegen 语义蒙版：v8 返回头部上移/放大，明确拒绝，未当输入；v9 用完整正确 mother sole input 成为校准基底；v12 同样只用正确完整母图，整张左侧空隙存在错误，因此只取其右后发已对齐的局部 alpha。三次实际 prompt、executionId、输入/输出 SHA 分别在 mask-prompt / mask-source v8、v9、v12。原图 RGB 从未取自这些 mask，也不把失败蒙版当人物或后续生图输入。

真实默认生成输出：
- v8 rejected：generated_images/01a16e45-e592-7451-9d06-1779d8efd536/exec-b4de628d-776e-49e8-8291-75a55eb53c10.png
- v9：generated_images/01a16e45-e592-7451-9d06-1779d8efd536/exec-5e044fc7-aa47-4540-a074-b1fcbceceff4.png
- v12：generated_images/01a16e45-e592-7451-9d06-1779d8efd536/exec-6784870a-b0d5-4e32-b396-63b30eb6feca.png

v7 仍混窗柱、v14 宽范围排除误削真发、v15 局部 GrabCut 丢失真发，均不采用。v16–18 的试清不在最终链上。最终 v20 直接回到已独立视看的 v13 alpha；按 source grid 只清 x1399..1407,y441..459 和 y467..484 两段真正空气中的亮窗柱，完整保留原发束穿越。v19 顶边在 y437..440 碰到真实弯曲亮发，原RGB微区对照后仅将第一清除段起点移至441。不同候选记录、原始 mask 与参数依赖都保留，没有清理。

最终亲看入口 listening-v20-{dark,light,room,empty}.png，detail 同名为人物近看；真实细发/窗柱放大见本目录 mother-hair-window-grid.png 及上一级 listening-post-source-coordinate-grid.png。mother-upper-hair-crossing.png 与 v20-upper-hair-crossing.png 可对照最后一个亮发微边。原 Stage、窄屏、动效与主代理最终亲审尚未完成；此处没有运行通过声明。

未改 src、main、9222、全局、人格数据、共享 helper 或父代理专用 production 脚本；未新增测试代码。
