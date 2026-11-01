# Sakiko chat：三光线原遮罩复用探查

本次只问一个问题：已准入暖杏 chat 的 exact F/S 能否不经改动地覆盖三个已准入新光线原母。结论为 **0/3 通过，3/3 producer fail**；root 尚未对这些复用候选作独立签字，runtime 均 false。原母的静态准入与本次失败分开，既有13场景保持冻结。

[原像素观察页](sakiko-chat-light-mask-reuse-observe-v1.html) 包含三案完整原母/真实复合、脸发、双掌完整裙摆、完整双鞋及宽座面。局部 viewBox 保持源坐标，1 CSS 像素对应1源像素；全景缩到576×384仅作关系查看。每案另有1536×1024技术SVG。

| 案例 | 原位实看结果 | 决定 |
|---|---|---|
| mist / overcast-day | 左侧头顶/长发、掌膝和鞋后跟被旧选择罩裁去，空房木栏/坐垫露在身体内 | FAIL |
| violet / twilight | 脸保留较多，但发束/发结外缘、膝内侧、袜腿及鞋后跟仍被裁去 | FAIL |
| rain / rain-night | 左侧头顶/长发与掌膝被裁去，原空房木栏横穿掌膝区域；鞋后跟覆盖不足 | FAIL |

所有来源、审批指针和SHA在 [精确记录](native-mask-reuse-qualification-v1.json)。共用原暖杏 F=976e6a52…ba59d、S=9ee1264c…e159，保留实际连续 luminance，使用 `MAX(luminance(F), luminance(S))`；每个复合只绘制一次对应新母 RGB，底层为其真实已准空房。全画布1536×1024、x/y为0、travel/slope/perspective均0。接收材质仍是 included receiver，不称纯投影。

没有改PNG、阈值化、描边、膨胀、颜色差自适应或平移；没有生成新图、改共享TS、注册新场景或更新360矩阵完成数。后续若需要这三案真实分层，应由root批准后，以各自正确新母制作对应F/S；本探查不会自动启动生成。
