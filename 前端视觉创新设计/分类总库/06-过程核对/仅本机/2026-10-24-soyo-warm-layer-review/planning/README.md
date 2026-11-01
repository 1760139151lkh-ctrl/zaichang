# Soyo planning apricot 原景层候选

只处理已由主代理准许的完整 v2 母图。原母图、原始 Prompt/source 未修改。

最终层：来源记录/assets-design-generated/2026-10-23-companion-matrix/soyo-taki/soyo-planning-apricot.scene.json，保留 figure/mask calibrated-v7，background/shadow 已升 v8 清除原人物鞋影。主审 false，未注册运行，不是运行验收。

已实际查看原母图与 actual Prompt/source、GPT Image 返回的全空房、最终深浅底局部与全幅原景/空房。修正了 v1 的皮肤/袖口误删、v2 的椅木/地板夹带、v3 的右手误删；v5 自动指尖肤色补入误带纸片，拒绝，用 v4 同坐标手层和明确原指尖 alpha 轮廓替代。未修补任何人体 RGB。

四层均保持 1536 × 1024；人物完整 RGB 字节 SHA 与原母图均为 aa021e9a358ad0ba9852d91ef4c85907e1ef28f2219ebccb0eae012201394265。原像素坐标 identity，无缩放/平移/扭曲。bodyBounds 像素 [640,298,991,781]，safeTextBoundary 0.40；travel/slope/perspective 全 0，桌面两张纸、杯灯、椅子归房间，人物右手指尖仍触原桌纸。

空房生成：image_gen.imagegen，exec-001f8ce5-614d-4ded-a96f-e6ac9828efcc。sole input 为正确完整 v2 原母图 e002a836c881d736966bce3a254de9ef5e4a0417efc5b260eaeaea64d85904d6；实际生成 Prompt/输入与输出 SHA 在 background-generation-v1.json。只在完整原人物足迹局部拼入生成空房，足迹外保原图像素；接触暗影为 source-over RGBA 残差，限原接触 ROI 与人物外缘 3 px，不带地板色块。

最终供亲看人物为 planning-v7-{dark,light}.png 及 detail；完整房间/空房为 planning-v8-{room,empty}.png，planning-v8-shadow-cleanup-detail.png 是原人物鞋影清除区。额外坐标网格与历版仅诊断，无运行引用。整套仍需主代理亲看、必要修正和原 Stage 操作。

未接触 src、main、9222、全局设置、人格数据、Primary 审批或运行记录。未新增测试代码。此步没有清理文件，保留校准依赖以可复现。
