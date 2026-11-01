# 四位 Ave Mujica 的边缘小猫候选

日期：2026-10-25。作者：`/root/mujica_matrix`。每位各一次内置 ImageGen 调用，一次只画一位；先完整读取对应人物护照与 `character-art-direction.md`，再写本次相处。原始输出只复制保存，未修改像素。

唯一图像输入是用户已采用的 `运行素材/companion/edge/sakiko-meme-cat-v3.png`：只借简洁二维画法、完整横趴猫身、头身家族尺度与支撑线。四位的头、发形、眼色与微表情分别重画，没有输入 V1/V2、私人 WeChat 参考、官网原图或被否决的人形稿。

| 人物 | 原图 | 这次的小瞬间 |
| --- | --- | --- |
| 睦 | [mutsumi-meme-cat-v1.png](mutsumi-meme-cat-v1.png) | 原本在自己的小调里，听见熟悉的轻敲，稍偏头注意；薄荷长发、两条细夹、金褐双色圆眼与小闭口 |
| 初华 | [uika-meme-cat-v1.png](uika-meme-cat-v1.png) | 正听着一个余音，对方停笔后抬起一点好奇；短金发、紫色双色圆眼与小张口 |
| 海铃 | [umiri-meme-cat-v1.png](umiri-meme-cat-v1.png) | 发现对方又拨歪纸角，一点一本正经的玩笑；深色侧分发、青灰双色圆眼、不对称小眉与克制闭口 |
| 若麦 | [nyamu-meme-cat-v1.png](nyamu-meme-cat-v1.png) | 自己的小节拍被发现，有点“你听见啦”的得意；短紫发、红紫双色圆眼、活一点的小张口 |

这些情境是项目原创导演提案，图里没有实际纸、音乐、业务回执或台词。猫化不改变角色文字人格，也不算十角色×九活动×四主题的人形矩阵覆盖。

四张都是 **1536 × 1024 RGBA**，直接读取 alpha 范围均 **0–254**，与 v3 源的范围相同。白脸、前爪、腹部、后腿与尾巴是同一种少线条二维画法，完整母图已逐张亲看。又在 **220px 宽**的暖杏浅底与深底亲看，发形/眼色仍可辨，白身轮廓清楚。具体 SHA、实际原 Prompt、唯一输入、护照/method 哈希和工具原路径均在每张对应 `.source.json`；本目录 `.prompt.txt` 是实际提交全文。

[深浅底小尺寸观察图](review/four-cats-light-dark-220px.png)只是工程审查证据，**不得作生图输入或运行素材**。没有借审查拼图做任何下一张图。

当前四张都只是完整静态候选，`primaryApproved=false`、`layerApproved=false`、`runtimeAccepted=false`、`registered=false`。没有改全局注册、runtime 或 renderer，没有声称左右镜像、沿真实边移动、冒泡已经实现。尾、眼、耳还在整张 PNG 中，`independentTailLayer=false`；需要实际局部动作时继续制作对应层，不能晃动整张图冒充尾动。

等待主代理逐张亲看决定。未执行清理；四张工具原输出按工具要求保留。
