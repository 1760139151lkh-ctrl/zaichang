# 祥子既有三主题 · 逐格观察

2026-10-24，`sakiko_scene_master` 逐张打开了下面 21 张非暖杏活动母图，同时复看三张非暖杏 chat。这里是制作线观察，不代签主代理审美、分层或运行验收。

原文件共同目录：`前端视觉创新设计/来源记录/assets-design-generated/2026-10-23-companion-matrix/`。

## 二十一个母图

| 活动 / 主题 | 实际观察 | 配准与后续采用边界 |
| --- | --- | --- |
| study / mist | 侧身写字，髋压椅垫、两鞋可辨，头发与衣服受到同一清晨光。 | 椅背/椅腿遮挡要按本张保留；不套暖杏人物层。 |
| study / violet | 手在纸面、脊背前倾，桌灯与夕光共同照明；膝鞋关系成立。 | 桌面小物与椅位有细微变化，需本张原景分离。 |
| study / rain | 暖灯照脸和纸，身后蓝夜光，双鞋有前后自然遮挡。 | 不把被前鞋/椅腿遮住的结构补画成可见；桌椅固定支承。 |
| reading / mist | 窗榻向左斜坐，书打开，肩背放松，两个小腿与鞋连续。 | 膝前后错位是透视，不是错误交腿；保本张坐面与脚点。 |
| reading / violet | 夕光下专注原文，手指/书本有握持，双鞋落地。 | 与晨雾膝鞋位置略异，不按主题只换色。 |
| reading / rain | 窗榻读书，脸受暖灯、发受冷窗光；两鞋完整、无断肢。 | 原夜景曝光成立；不拿白天人物套夜底。 |
| planning / mist | 坐椅翻手账并抬眼，髋/坐面与两鞋支承成立。 | 本张书桌明显向右扩、灯更靠右；禁止直接配基础 room-mist 空景。 |
| planning / violet | 手账与手搭在桌边，头微偏向人，双腿有正常前后层次。 | 桌椅取景比暖杏略偏左，必须本张配准。 |
| planning / rain | 暖灯下拿半开本，视线有自己的判断感，双鞋在地。 | 桌椅整体较晨雾更靠左；独立校准、桌面接触固定。 |
| listening / mist | 抱膝，两只袜脚压在榻垫，鞋放地面，神态倾听。 | 袜脚和髋都在榻上；地上的鞋是房间物件，不能误作身体脚点。 |
| listening / violet | 夕光抱膝，手臂/膝/袜脚相互关系完整，鞋成对放地。 | 不要求这张双脚落地；地上鞋不随人物拖动。 |
| listening / rain | 雨夜抱膝但不是苦笑或卖惨，脸可读；袜脚与榻面相接。 | 需分清榻面接触影与地上静置鞋影。 |
| rest / mist | 身体转向窗，手撑垫，侧脸看景，两腿落地。 | 头发轮廓不同于chat，不借其热区。 |
| rest / violet | 背/肩朝窗，手掌贴垫，夕光下自然停顿。 | 窗榻与双鞋成立；需本张层，不以chat换头。 |
| rest / rain | 安静望雨，身躯重心落在榻面，手掌支承、两鞋连续。 | 近侧手与枕/毯边界须精确；不扩大横向行程。 |
| play / mist | 前倾递纸鸟，支撑手在榻，腿一前一后正常落地。 | 前倾改变身体范围，不能用chat热区或坐点。 |
| play / violet | 纸鸟与指尖有托持，目光主动但克制，完整膝踝鞋。 | 夕光手掌/发丝要随本图提取，不能用暖杏层重染。 |
| play / rain | 雨夜有小发现仍带轻松表情，没有自动变忧伤；纸鸟与手相接。 | 两鞋仍支承在原地面；完整原景分离后才准入。 |
| attention / mist | 侧头看桌上小纸对象，手在榻旁，双腿完整落地。 | 小纸对象归背景，不随人物移动；视线对象有具体位置。 |
| attention / violet | 视线落桌面，肩略转、手撑垫，夕光融入原房间。 | 小纸对象与台灯/桌面都是本张物件，禁止拼接另主题。 |
| attention / rain | 窗冷灯暖、侧头看桌上对象，鞋与地面接触成立。 | 与其他主题的手脚位置不同，须独立边界与支承记录。 |

这些母图未见必须立即退场的成熟面相、缺肢、悬空坐面或错误交腿。此结论限于亲看的完整母图，不等于分层/运行已通过。按当前工作区文件名与来源目录检索，这 21 张没有对应的 figure/background/mask/shadow 或 scene.json；未把这个有界检索结论扩写成外部生成目录“绝不存在”。

## 三个 chat 来源与既有层

三份 `sakiko-chat-{mist,violet,rain}-v1-actualprompt.txt` 已完整读取，均明确唯一输入为对应的纯净空房、角色身份以文字提供，并没有把暖杏人物或错误骨架作为图像输入。实际 Prompt SHA 与母图 SHA 都逐项等于对应 `-v1-source.json` 中记录；原工具 execution ID 与原路径仍在该源文件中。

| 主题 | 原始输入 | 母图 SHA-256 | 既有待主审 bundle |
| --- | --- | --- | --- |
| mist | room-mist-candidate.png | bda7f03d62e096dbc892b8d1e5b7fed446a3b3886d8255f70bbe2fb5db45efd0 | background/figure/mask/shadow-calibrated-v3 + sakiko-chat-mist.scene.json |
| violet | room-violet-candidate.png | 8e9b860772095ed911c4c257d6d6769e5c5064f4c793e325e65eadc9e79e1e88 | background/figure/mask/shadow-calibrated-v9 + sakiko-chat-violet.scene.json |
| rain | room-rain-candidate-v2.png | a57a3b22791dd9525d9e1dc565fe76866edb7c4d067e3cb94d67e6dfb06628a6 | background/figure/mask/shadow-calibrated-v3 + sakiko-chat-rain.scene.json |

`legacy-chat-layer-preview.html` 只引用这些既有文件，在真实 Chrome 中查看了原房间合成、浅/深底及原像素局部。晨雾 figure 和 shadow 的 RGB 在透明像素中仍保留原房间/残差，直接图片查看器会把透明 RGB 显成整房或彩色残差；实际 alpha 合成后没有整房贴片。这是为何必须在正常透明渲染里判断，而不是只根据 PNG 预览的 RGB 宣判。尚未修改这些旧层，也未改变其 `approvedByPrimary`。

## 主代理四张一组

各名均添加 `.png`，共同目录同上；这是精确原文件名单，不是拼图或替代审稿：

1. `sakiko-study-mist-mother-candidate-v1`、`sakiko-study-violet-mother-candidate-v1`、`sakiko-study-rain-mother-candidate-v1`、`sakiko-reading-mist-mother-candidate-v1`。
2. `sakiko-reading-violet-mother-candidate-v1`、`sakiko-reading-rain-mother-candidate-v1`、`sakiko-planning-mist-mother-candidate-v1`、`sakiko-planning-violet-mother-candidate-v1`。
3. `sakiko-planning-rain-mother-candidate-v1`、`sakiko-listening-mist-mother-candidate-v1`、`sakiko-listening-violet-mother-candidate-v1`、`sakiko-listening-rain-mother-candidate-v1`。
4. `sakiko-rest-mist-mother-candidate-v1`、`sakiko-rest-violet-mother-candidate-v1`、`sakiko-rest-rain-mother-candidate-v1`、`sakiko-play-mist-mother-candidate-v1`。
5. `sakiko-play-violet-mother-candidate-v1`、`sakiko-play-rain-mother-candidate-v1`、`sakiko-attention-mist-mother-candidate-v1`、`sakiko-attention-violet-mother-candidate-v1`。
6. `sakiko-attention-rain-mother-candidate-v1`、`sakiko-chat-mist-mother-candidate-v1`、`sakiko-chat-violet-mother-candidate-v1`、`sakiko-chat-rain-mother-candidate-v1`；其中后三张主代理已亲看母图，分层仍独立待审。
