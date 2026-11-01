# 灯 · 中性日夜原景层候选

**当前已撤销采用。** 用户直接否决日母的成熟／“大妈感”；root因此撤回这两张中性日夜母图及派生层的准入。两份候选、当前准入与全部母/派生PNG均标记禁止后续输入，空间线已移除2份本轮scene和8张运行副本。精确撤回记录与适用母SHA见 [CURRENT_IMAGE_INPUT_EXCLUSIONS.json](CURRENT_IMAGE_INPUT_EXCLUSIONS.json)。下文技术观察与当时准入仅保历史，不能当当前批准；独立头像不因本次母图否决而自动改判。

本轮沿现有已准静态母图完成可复核候选，不重画健康人物、不改运行注册。这里是 `neutral-presence / environmentBasis:time / weather:unknown` 的固定同原位层，不计九活动或360格覆盖。

| 光线 | 当前四件原件与来源 | 当前观察 |
|---|---|---|
| 日间 | [候选包](day/candidate-bundle-v1.json) · [母图](day/mother.png) · [F-v3](day/figure-mask-v3.png) · [S-v1](day/contact-mask-v1.png) · [同母空底](day/background-v1.png) | 四张PNG原字节复用健康原件；本轮实际IAB亲看7视图，无书下内黑线、扩大臂孔或鞋轮廓缺口。 |
| 夜间 | [候选包](night/candidate-bundle-v1.json) · [母图](night/mother.png) · [F-v5](night/figure-mask-v5.png) · [S-v3](night/contact-mask-v3.png) · [同母空底](night/background-v1.png) | 旧联合层前鞋侧出现棋盘细缝；本轮4次Image，最终 clean母→新白选→S-v3修复连续覆盖与柔边，回到原触发近景重看。 |

当前可打开 [日间观察页](http://127.0.0.1:5188/来源记录/2026-10-26-integrated-room/mygo/tomori/day/native-observe-v1.html) 与 [夜间观察页](http://127.0.0.1:5188/来源记录/2026-10-26-integrated-room/mygo/tomori/night/native-observe-v1.html)。同目录 `union-source-v1.svg`、`composite-source-v1.svg`、`contact-source-v1.svg` 使用新本地文件相对引用，不依赖生成工具目录。

## 夜间修复的实际范围

`F-v5 + S-v1` 在原坐标 `850 825 110 90` 中，前鞋上缘有1像素级未选线；放在相近木底时不显眼，棋盘底明确可见。本轮第一张 `contact-mask-v2` 直接选全鞋补住细缝，但原木接收外沿偏硬，保诊断未采用；第二张 `figure-mask-v6` 直接提人形，反而出现书下内黑线与扩大臂缝，同样退回。两张均未作后续输入。

随后仅从已准干净完整夜母新生成 `contact-step1-marked-v3`，亲看完整双鞋及原局部柔接收白选，再只将该健康白选转为 `contact-mask-v3`。最终继续用健康既有F-v5及同母BG-v1。4份新实际Prompt、每一输入/原工具输出/工作副本SHA、画布与状态保在对应 `.source.json`；PNG没有像素手补、阈值化、缩放或形态处理。

最终又亲看原母/合成、浅深棋盘、完整双鞋及放大原触发鞋侧；细缝消失、原鞋边连续，接收外沿已柔化。脸发、手与全册继续取同一原母；身体内部极细原帘缝按既有主代理固定included裁决保源，只在原位成立。当前12张实际浏览截图包含早期6张观察、2张HOLD诊断及4张最终S-v3复核，不把诊断算当前终版。

## 组合法与边界

覆盖为 `MAX(L(F), L(S))`，原母RGB只绘一次，S与F重叠处不会叠亮。S包含原坐垫/木地板接收材质，夜间S-v3还完整覆盖双鞋以保证边缘连续；它不是独立的可移动投影。母图、层和背景共1536×1024，固定原坐标，travel/slope/perspective全部为0。

原背景中被人物遮住的纹理由同母Image去人生成，不声称整画布逐像素还原。主代理当时逐图准入、空间线曾登记两scene与8PNG，本线当时回读并回算一致，均保留为历史事实；用户现已否决身份，当前准入撤销且运行登记已移除。相关记录保精确原消息和追加撤回，不追改旧Prompt/生成事实。运行、动态和360活动从未在本线获准通过。源和诊断继续保留，无清理。
