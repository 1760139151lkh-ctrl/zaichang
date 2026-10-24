# 地图内运动记录控制

2026-10-23，Stage02。新图通过内置 GPT Image 生成；实现前已亲看当前隔离桌面地图、既有合格稿 R166、U011 和本次新图，再据图实现真实 React 控件。图稿仅定义浮层、读数与动作层级；地图地理、路由、角色和相机继续归原实现。图里的示例数值不是个人运动证据。

- 图稿：[workout-controller.png](workout-controller.png)，1586×992。
- 场景：`S6_MAP`；图稿主题为暖杏，运行控件继承当前主题；无角色图层。
- SHA-256：`23eff64720e2ee7b18b2109c5c53d4edd2b74eb0bbaff4987a1ca612d117fec1`。
- 引用设计：R166（`e3fec483409129be333e38e0bde3fdf060ff8889865cb3f8c5a8b1abee0e3f0b`），只作为布局与暖灰金材质参考，不把地图像素当实际轨迹。
- 亲看结论：本成员及主代理均亲看，运动浮层的读数、主次操作和次级记录详情构图可采用；左右双卡仅用于展示开始/暂停两种设计状态，产品同一时刻只展开一张卡。只采用控件，不采用地图几何；当前运行视觉验收另行记录。
- 分类：A，仅限运动控制卡的布局、材质与动作层级；图中地图几何与示例数值不在采用范围内。来源为本轮 GPT Image，按上述 SHA-256 关联原始 Prompt、母图与实现。
- 实现：[WorkoutControls.tsx](../../../../src/renderer/map/WorkoutControls.tsx)、[workout.css](../../../../src/renderer/map/workout.css)。不作为整页图片或地图贴图使用。
- 当前为局部设计采用，不代表运动多端、最终运动美学或真实跑步已验收。

## 本次工具 Prompt（原文）

```text
Use case: ui-mockup. Create a high-fidelity, implementable desktop UI design for the existing Chinese campus companion app 在场. The supplied image is composition/material reference only: retain its warm ivory campus map as a quiet backdrop, existing top bar and map controls; do not invent navigation geography or change the map's main composition. Design ONLY a compact workout controller floating at bottom right, width about 360px, positioned above the footer, leaving the map readable. No characters. Refined warm ivory paper and translucent frosted material, restrained champagne/ochre accent, soft ink brown text, subtle border, elegant typography, generous but compact spacing. Absolutely no green UI. Show one main card in the recording/paused flow titled '跑步', small human state '已暂停', simulated-source line 'MuMu · 模拟位置'. Large primary distance '0.00' with '公里', secondary actual time '00:42', and honest pace '—'. Two clearly organized buttons '继续记录' as main warm gold action and '结束' as secondary. A small progressive disclosure '本次记录' reveals credible time '可信时间 00:00', cadence '步频 未知', and retention '仅在当前窗口保留'. Include a small close control in the card header. A secondary inset at left, visually clearly a design-state specimen rather than another active panel, shows the same controller before start: title '记录一次运动', segmented choice '步行  跑步  骑行', device selection 'MuMu（模拟位置）', retention choice '当前窗口 / 加密保存在本机', and a single main '开始记录' button. Keep this highly usable and calm, not an engineering dashboard. Do not show coordinates, IDs, coverage percentages, school upload, success badges, graphs or fake tracks. The workout UI will become live React controls, not an image overlay. All labels in Chinese, readable, precise alignment. 16:10 wide canvas.
```

输入：R166 原设计稿；输出保留为本目录图稿。未使用个人定位或轨迹作为生图输入。
