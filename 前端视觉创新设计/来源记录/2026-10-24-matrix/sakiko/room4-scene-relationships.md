# 祥子 · 同一房间中的九类使用情境

本记录区分页面情境、角色动作与主题光线。九个页面不等于九套身体骨架；有相同空间需要的页面可以明确复用已合格动作。复用不会被计成一幅新画，也不会被写成新动作。

2026-10-24 本线亲看了纯净 room4、祥子八张暖杏母图与三张其他主题的闲聊候选。主代理仍须亲看并判断当下采用范围；这里不代签运行验收。

## 固定空间

画布为 1536 × 1024。唯一空景底图为 `../../assets-design-generated/2026-10-23-companion-matrix/room-apricot-candidate-v4.png`，SHA-256 为 `fc408bc0206ddc9576736c9b14fabd669bebb4dd1bd455b14f2ee901586af9fa`。窗框、桌椅、窗榻、地面与相机关系一起保留。

- 窗榻聊天座面约为 `(0.842, 0.580)`，鞋底落点约为 `(0.767, 0.761)`。这不是所有姿态的默认参数。
- 书桌椅陪读座面约为 `(0.585, 0.577)`，鞋底落点约为 `(0.643, 0.701)`。固定书桌手部/椅背遮挡的姿态不能横向平移。
- 每张图沿其自己的 `scene.json` 保留实际身体范围、热区、接触影与有限行程；不将新图套旧标定。

## 已亲看的空间关系

| 动作 | 现存母图 basename | 可见关系与动作差别 |
| --- | --- | --- |
| chat | sakiko-chat-apricot-mother.png | 窗榻端坐朝向使用者，书在膝上，双鞋落地。 |
| study | sakiko-study-apricot-mother.png | 书桌椅侧身写推导，身体由椅座承重，手与桌面相接。 |
| reading | sakiko-reading-apricot-v2-mother.png | 窗榻向左斜坐看书，腿向左延伸，视线在原文。 |
| planning | sakiko-planning-apricot.png | 书桌椅看手账，腰与肩转向桌面，膝/双鞋落点与聊天不同。 |
| listening | sakiko-listening-apricot-mother.png | 窗榻抱膝，两只袜脚在软垫上，脱下的鞋完整留在地板。不能要求这张两脚落地。 |
| rest | sakiko-rest-apricot-mother.png | 躯干转向窗景，手掌撑软垫，留出沉默。 |
| play | sakiko-play-apricot-v4-mother.png | 向前探身递纸鸟，手势、上身重心和膝/鞋位置与chat不同。 |
| attention | sakiko-attention-apricot-v4-mother.png | 朝左看桌上新出现的小对象，手在身旁支撑，不向使用者抢注意力。 |

八张路径均在 `前端视觉创新设计/运行素材/companion/scenes/`。三张非暖杏 chat 候选为 `sakiko-chat-mist-mother-candidate-v1.png`、`sakiko-chat-violet-mother-candidate-v1.png` 与 `sakiko-chat-rain-mother-candidate-v1.png`，位于 `前端视觉创新设计/来源记录/assets-design-generated/2026-10-23-companion-matrix/`。本线逐张可见相机/房间关系一致、坐骨/软垫和双鞋关系成立；其来源记录仍标 `approvedByPrimary: false`，本线不擅改。

## 页面采用关系

| 页面情境 | 动作关系 | 使用边界 |
| --- | --- | --- |
| S1_HOME | chat，按真实交流可进入listening/play | 不把三种关系同时拼在一个房间。 |
| S2_STUDY | study | 书桌椅坐姿以原画布呈现；工作台布局让出正文。 |
| S3_PDF | reading | 长文可由用户选角落/隐藏，不能裁公式来保人物。 |
| S4_AGENDA | planning | 手账画面不代表日程已保存；正式状态仍归日程owner。 |
| S5_NOTES | reading或planning，明确复用 | 读自己的句子用reading，整理手账用planning；不以换本子计新骨架。 |
| S6_MAP | attention或rest，明确复用 | 注意力朝向路线内容；房间窗景不冒充真实校园几何。 |
| S7_CAST | chat，明确复用 | 选择外观不暗改已编辑的人格与称呼。 |
| S8_THEME | rest或chat，明确复用 | 每个主题必须使用该主题同源场景与人物，不给暖杏人物套色冒充完成。 |
| S9_RESUME | resume，独立的新动作 | 从看书抬头、以页签保住停点。四主题完整母图均获主代理亲看接受；暖杏分层准入限原位travel0，其他三主题分层与所有运行验收仍独立待审，不计全格完成。 |

## 新迎接动作

`sakiko-resume-apricot-v1-prompt.txt` 描述她保留书里的页签、肩背轻转向回来的人，而膝与髋仍向左。动作表达“位置留着”，不画大招手或表演式笑容。唯一输入为无人的纯净空房，不以任何有问题人体作为参考。

首次内置调用返回 `HTTP 404 / proxy_route_not_found / Unsupported router route`。用户修复工具后，主代理以相同完整 Prompt 与唯一空房输入成功重试；首个失败 attempt 与成功输出分别保存在 `sakiko-resume-apricot-v1-source.json`，没有抹掉失败。四张完整母图现为 `sakiko-resume-{apricot,mist,violet,rain}-mother-v1.png`。

暖杏分离改用 ImageGen 同画布黑白 mask 与原母图 RGB，避免透明提取自动放大和宽亮晕。`resume-layer-production.json` 保留各次真正输出、Prompt 和具体拒因。`resume-layer-preview-mask-v1.html` 与 `resume-layer-preview-mask-v2.html` 各自锁定版本；后者作为原 RGB 人物 mask 会带浅坐面条，已被主代理拒绝。主代理随后亲看接受原RGB / v1人物mask + v2深棕影mask（`#291c16`、0.48）的组合，范围限原位travel0；准确文件SHA与范围见 `primary-resume-approval.json`。四张新副本与独立 `sakiko-resume-apricot-v1.scene.json` 已复制运行目录，实际宿主Stage仍须另验，不将浏览器分层观察冒充运行验收。

晨雾、暮色、夜雨分别从各自已接受的母图生成匹配背景、干净人物mask和contact mask，没有共用暖杏层。夜雨v1/refined仍含少量蓝窗景发缘，已退为诊断；独立从原母图重画的tight版去掉了该背景边。三套完整原位候选均在真实Chrome看过原像素浅深底和原房间，固定页面为 `resume-{mist,violet,rain}-layers-v1-preview.html`；准确输出与候选bundle字节分别见 `theme-layer-production.json`、`resume-theme-layer-bundles.json`。这些三主题层尚未准入，未拷运行目录。
