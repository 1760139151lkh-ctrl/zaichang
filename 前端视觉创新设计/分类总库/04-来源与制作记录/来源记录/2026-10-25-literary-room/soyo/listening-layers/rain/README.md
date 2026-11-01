# 爽世倾听 · 夜雨固定原像素联合层候选

[浏览观察页](listening-included-observe-v1.html) · [完整来源与 SHA](listening-included-bundle-v1.json) · [原生联合 SVG](union-source-v1.svg) · [实际合成 SVG](composite-source-v1.svg)

母图 RGB 仅从原母取一次，`U=MAX(L(F),L(S))`。F 包含整个人物与身旁合书，S 包含同原景局部坐垫、书底及完整鞋边落地影。所有 PNG 保持 Image 原字节；未采用标记图里重画的人物 RGB。

当前选用 F1 / S3 / 专属空 BG1。已实看原母/合成、浅深棋盘、脸发、手膝、裙摆、整书封边与全鞋；相应浏览截图在 `browser-observations/`，禁止用作生图输入。旧接触版本与具体问题保留在各 source 文件，不回流至新 Image。

这是固定原位 included 层，`travel/slope/perspective=0`。接收面可带原坐垫或木地板小块材质，不能当独立可移 caster。空 BG 是 Image 对原母的移除修复，不声称房间全部隐藏/外部像素位精确恢复。

母图已有 root 静态方向批准；本层仍 `primaryLayerApproved=false / runtimeAccepted=false / runtimeRegistered=false`，等待 root 亲看准层。未改 App、后端、总 ledger 或运行注册；不新增人形母图/动作覆盖数。
