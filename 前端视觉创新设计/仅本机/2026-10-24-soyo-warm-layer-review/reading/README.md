# Soyo reading apricot 分层候选

最终：soyo-reading-apricot.scene.json → figure/mask calibrated-v8，background/shadow calibrated-v10。主审 false、运行未注册。

独立亲读原 reading-v2 actual Prompt/source，亲看正确完整母图、已生成 matching empty BG、原图坐标网格及 v8 深浅底/全原景/空房。以原坐标轮廓重新提取，保留完整原 RGB，包括浅色脸/皮肤、白领、两只手、两只鞋、膝上书页与真实后发；坐垫/背枕/小腿后木条归房间。只处理 alpha 与原景局部配准，不画人体或书页，不修改母图/原生成历史。

source mother SHA 68b71f572a6566147acf1bbe104cd05a1bc6e9194ea01039a3e40b785e60f23e。原 RGB payload 和 figure payload 同为 bec38b4bd120a73e5b4ce459905741bb5034a0783a28a053103682f944922c7b；保持 1536×1024，identity 无缩放/平移。bodyBounds 像素 [1109,293,1434,767]；固定 bench，travel/slope/perspective 全 0，safeTextBoundary 0.70。

v3 重建完整原轮廓保书/肤色；v4 局部清发后枕；v5 颜色筛选在袖/后发交界误删少量像素，已拒绝；v6 按原像素限定房间排除并按真实小腿边界收紧；v7–v8 精确回补原深蓝袖与内发交界。不可采用旧 v1/v2 或中间 v5 作为最终人物。所有调整保实际原色，原脚本与参数保留以复现。

最终亲看入口：reading-v8-dark.png / light.png；同名 detail 为人物局部，reading-v8-back-hair-light.png 为右后发交界。完整房间/空房为 reading-v10-room.png / empty.png；reading-v10-shadow-region.png 对照 generated-bg-shadow-region.png，移除原人物在座垫/前木板/地板的连通投影；v9 发现残留竖边后已再扩范围重查。figure/mask SHA 未变。正常原 Stage、窄屏与主审尚未进行，不能将此候选计为已验收运行。

未改共享 helper、父代理专用 production 脚本、src、9222、人格或 Primary 记录。未新增测试代码，未清理文件。
