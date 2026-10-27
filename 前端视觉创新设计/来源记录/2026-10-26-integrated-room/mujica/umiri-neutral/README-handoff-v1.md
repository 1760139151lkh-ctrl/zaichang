# 海铃日夜：固定同母原 RGB 联合层候选

本轮先完成日间，再处理夜间。没有改健康母图或其同母空景，没有改共享代码、运行注册、角色人格、头像或其它角色素材。所有新 mask 使用内置 Image Generation；任何 HOLD mask、运行拼图、评审截图与用户导出上传图均未作为生图输入。

## 当前交主代理亲看的两套

| 候选 | 精确 bundle | 实际浏览入口 | 最新截图 |
| --- | --- | --- | --- |
| DAY / neutral-presence / time-day / mist / morning / unknown-weather | [day/assembly-fj-v2.json](day/assembly-fj-v2.json) | [day/joint-observe-v4.html](day/joint-observe-v4.html#scene) | `day/browser-observations/final-v2/` |
| NIGHT / neutral-presence / time-night / rain / night / unknown-weather | [night/assembly-fj-v1.json](night/assembly-fj-v1.json) | [night/joint-observe-v2.html](night/joint-observe-v2.html#scene) | `night/browser-observations/final-*.png` |

预览沿仓库原有 localhost:5188 视觉资料服务的 `/来源记录/2026-10-26-integrated-room/mujica/umiri-neutral/` 路径打开。观察页分别可看全景、浅深棋盘、完整脸发、书手膝、坐面侧掌、双靴地面；每处都是相同原母 RGB 的原位选取，不是生成标白图的 RGB。单独 SVG 在各目录的 `union-final-v1.svg` 与 `composite-final-v1.svg`。

两套统一采用 `U=MAX(L(F),L(J))`，原母 RGB 只绘制一次，再置于各自同母移除空景上。J 含与 F 重叠的人物及原位 receiver，**不是可独立搬运的投影或新人物**；其独用白色区域并不替代原完整 F。人物/手书/局部坐垫/鞋地面一起固定在源画布，`travel/slope/perspective=0`。没有阈值、形态学、手画补片、PNG 像素修绘，也没有双重叠色。

日间使用新人物 F（从健康日母重建），关闭原 F 将膝间皮肤褶线误抠的细孔；新 J 提供接触软边。夜间保留原健康人物 F，并与新 J-v3 联合，使鞋底齿槽的原暗像素不因 J 单独覆盖不足而透亮。既有 MAX 管线即可表达这套组合；这里没有改引擎或注册。

## 亲看的结果

两套最终 MAX(F,J) 均已在当前正式 Chrome 扩展会话亲看：完整房间/合成、浅深棋盘全轮廓、脸与细发、原书和留页手、连续膝部皮肤、裙下与侧掌支撑、两只完整平台系带靴及近端软落地。人物的原有会意微笑、自己的书和掌心受座保留；闭帘不引入天气主张。细源色轮廓沿发和手的边缘仍可见，最终边缘审美由 root 决定；这里只建议固定同母静态采用。

浏览默认截图曾连续超时，当前健康标签和已有工作均保留；之后使用同一正式标签公开的 CDP 能力，读取实际 CSS 内容矩形，取得原截图 PNG。没有另起浏览器控制栈、改代理、关闭其它页面或更换会话。主代理仍须亲看候选与真实集成界面，静态截图不签动态、任意家具移动、运行或360活动覆盖。

## 哪些没有采用

日间独立 contact-mask v1 含侧掌外的小蓝格纹尾，v2/v3 的臀下接收上漂，v4 的地面接收提前结束，均已明确 held，未用作后续输入。F1/F2 和 S1/S2 的中间件保原 Prompt 与原输出，不把标白 RGB 当成成品颜色。早期 `assembly-joint-v1.json` 是历史单 J 提案，当前以 `assembly-fj-v2.json` 为准。

夜间 J-v1 独用时鞋底齿槽透亮，J-v2 误纳大块坐垫且丢地面接收，均未采用。最终 J-v3 只在与原 F 的 MAX 组合中提出；其 source 说明适用范围，不写成独立完整人像 mask 已通过。旧候选与新原件均保留，不用被退回的图继续生成。

本轮新生成共11张技术选区/遮罩（day8、night3），没有新人物母图。每张同名 `.source.json` 保完整实际 Prompt、工具参数、输入 SHA、原工具路径、输出 SHA、字节一致性、观察与 held 状态；原 PNG 只复制未改。所有主代理准入、用户批准、运行、动态与矩阵完成字段保持 false，等待 root 实看裁决。

没有清理，没有提交或推送。

