# 九人v3 · 圆形头像用途主审准入

root已亲看四张真实三框Browser截图（10个角色34/48浅暗底），结合此前全部新原PNG与96圈，准新九人用于圆形头像的面部审美与选框。此为主代理用途裁决，**不是用户签字，也不是自由抠像/房间母图/任意立绘准入**。

主审意见：青春短柔面、轻而各异的笑意；34px辨识、48px传递表情。圆形头像材质内允许暖色边光，不据此声称原PNG任意alpha用途合格。

- **108% / left−4% / top−6%**：Tomori、Taki、Umiri、Mutsumi；睦兼顾自身左侧双夹。
- **114% / left−7% / top−10%**：Anon、Rana、Soyo、Uika、Nyamu，强化眼神与笑意。
- **Sakiko**：既有选定soft-youth-v3、108%(−4,−6)原样；PNG字节、import、映射块均保持不变。

九张原v3精确复制至运行素材/companion/portraits/{role}-youth-charm-v3-20261025.png。各源/副本SHA及逐字节一致、TS实际import/hash/frame回读见[root-purpose-admission.json](root-purpose-admission.json)。旧九人v2文件完整保留。仅修改companion-portraits.ts对应九项与必要来源说明，没有改其他TS/CSS或9335。

`npm run check` → `tsc --noEmit`，实际退出0。没有新测试、runner或新Image调用，未手修/裁写PNG。

**runtimeAccepted=false。** 代码映射登记不替代主代理亲看真实聊天/标题栏的集成验收。没有据此修改用户批准状态。旧11图/原评审与frames候选记录保留为历史，本准入覆盖当时的待主审/保守选框措辞；历史“当前v2”栏是开始评审时快照。所有评审板/截图仍禁止后续Image输入。无删除清理。
