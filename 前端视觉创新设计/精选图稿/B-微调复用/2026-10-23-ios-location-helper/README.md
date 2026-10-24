# iOS 位置随行：单一状态与可触停止

2026-10-23，Stage02。内置 GPT Image 新生成的原生小桥设计参考，独立于真实运行截图。没有使用个人位置、设备资料或轨迹作为生图输入。

- 图稿：[ios-location-helper.png](ios-location-helper.png)，852×1846，1393075 字节。
- SHA-256：`be5438ca753fb58a2f4f7a612c3ba0390378a1eb351520ffcba872d657cffc3d`。
- 分类：B，微调复用；场景为 `S6_MAP` 的原生位置随行小界面，暖杏，无角色。
- 真实原来源：本轮内置 GPT Image 输出 `exec-734cde6a-94c0-402c-9ddb-e8dfd7a9b292.png`，复制保存，不覆盖或删除原图。
- 成员亲看结论：单列内容、暖纸与暖墨、宽停止按钮可用于原生桥；图稿的文字与状态是设计示意，不是位置读取或停止证据。主代理的最终亲看结论另在本阶段记录落定。
- 改造处方与采用范围：原生停止按钮改为全内容宽、至少44pt内容高度，增加停止图标；标题和状态沿图稿改为暖墨，标题使用系统衬线字体。保留真实系统状态栏、动态文字和正常 SwiftUI 控件，不把图片贴进 App。保留实际来源与未知信息，不加地图、假指标或面板。
- 实际引用：[LocationBridge.swift](../../../../apps/location-bridge/ios/LocationBridge.swift)。图稿不作为运行图片或素材加载。
- 同系列来源：[桌面运动控制图稿](../../A-标杆/2026-10-23-workout-controls/README.md)。它此前提供暖灰金动作层级，当前图明确了原生小桥的触控与排版；两者都不提供导航几何。

## 本次工具 Prompt（原文）

```text
Use case: ui-mockup. Create a refined, implementable native iPhone UI design for 在场's tiny location companion helper. Portrait 9:19.5 canvas, a single uncluttered iPhone screen without hardware frame or marketing text. This is ONLY a local movement sampling helper, not a full fitness app. Warm ivory paper background, subtle warm gray type, restrained matte champagne/ochre gold, elegant native Chinese typography, generous breathing space, absolutely no green. A calm vertically grouped central column, left aligned and safely inset: small elegant walking figure icon in muted gold; title exactly '位置随行'; clear secondary current state exactly '正随本次运动记录位置'; quiet provenance exactly '模拟器位置 · 不代表现实中的你'. Under the text place one broad softly rounded warm gold action button, comfortable 50pt height, label exactly '停止位置' in clear ivory, a small stop-square icon optional. Preserve a stable composition with a consistent readable content width and warm subtle surface refinement; avoid dashboard panels, nested cards, huge empty top gap, decorative charts, fake route, measurements, maps, exact coordinates, device IDs, counters or badges. Show a plausible native iPhone status bar with no personal information. Prioritize stopping control discoverability and touch comfort. No characters or artwork. This is a GPT Image design reference that will be translated into live SwiftUI; do not simulate a screenshot of actual data.
```
