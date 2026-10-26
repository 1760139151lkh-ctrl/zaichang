# 图稿关系与真实组件交接

2026-10-25，study_reading已亲看本目录两张图，并报告按root准入边界实现 `src/renderer/ReadingDesk.tsx`、`src/renderer/reading-desk.css`；shell线实现 `src/renderer/AttachmentTray.tsx`。本线直接定位到这三个真实文件及其公开组件，不把文件存在当运行验收。

采用的关系：同一文件点击打开或提到最前；PDF原页/原文字和note继续由Materials owner持有；frame可分别拖动、resize、叠放、bring/close；附件独立小红册与真图缩略，短截原名，pointer只试放换序、键盘等效。封面装饰由真实组件制作，不裁生成图作PDF glyph。图中min/max/traffic dots不作新业务功能。

截至本次交接，root App接入与统一mainready后的两PDF加图片实操由root/study/shell继续核对。本线未操作该新Desk运行版本，不能签自由窗口、换序、来源保持、取消/焦点或窄屏已经验证。实际素材的source JSON继续记录图像生产事实，本条只补当前已定位的实现路径与待运行边界。
