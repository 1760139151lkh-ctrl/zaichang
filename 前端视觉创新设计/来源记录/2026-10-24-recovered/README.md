# 中断前生图的找回与归宗

用户指定的原聊天为 `01a16cc3-5c11-7800-84a4-ffa19495a0a4`。本次沿它的父聊天 `01a1691d-235b-7041-a398-cdca45afae60` 和真实子代理关系追溯，共核对 37 个聊天。没有用“同一天生成”代替来源关系，也没有把私人会话原始日志放入项目。

## 确认找到了什么

544 条 `image_gen.generation` 结束事件中，541 条成功、3 条失败且没有图像字节。541 张成功结果的事件图像字节与 `$CODEX_HOME/generated_images` 原文件逐一 SHA-256 一致，未发现已经成功生成但在本机丢失的图片。3 条失败调用不算作“图丢失”，也不算成矩阵覆盖。

初查时，541 张中有 516 张已经以完全相同字节存在于本项目视觉目录，25 张尚未归宗。**工作目录存在与 GitHub 已保存是两回事：审计时仅 11 个输出哈希有 tracked 文件路径。** `recovery.json` 逐项保留当时的 tracked 状态，后续提交不会改写这份时点证据。

25 张未归宗图在本恢复线全部亲自打开。21 张是放大或移位的旧人物提取、污染的 mask、改动物件的背景，或已由新版继承的旧 UI 稿，继续保留退出决定；没有把 D 类或错误骨架重新放回素材库。另 4 张是在中断前已经完成、尚未被复制的干净背景，已复制到本目录，原生成文件保留。

## 本次实际恢复的四张图

| 文件 | 对应原母图 | 亲看结论与使用边界 |
| --- | --- | --- |
| [若麦·看向纸条·暖杏背景](nyamu-attention-apricot-background-recovered-v1.png) | `nyamu-attention-apricot-mother-candidate-v3.png` | 书上原竖卡、杯灯和椅子保留，人物及穿着的鞋退出；窗框、凳面与暖光完整。可继续同景分离。 |
| [若麦·递出小纸偶·暖杏背景](nyamu-play-apricot-background-recovered-v1.png) | `nyamu-play-apricot-mother-candidate-v1.png` | 纸偶随持有它的人物一起移除，没有留在桌面悬空。原书、杯灯和织物完整。 |
| [睦·看向纸条·暖杏背景](mutsumi-attention-apricot-background-recovered-v1.png) | `mutsumi-attention-apricot-mother-candidate-v1.png` | 原桌面竖卡保留，人物与穿着的鞋退出，凳面、靠枕及完整窗景连贯。 |
| [爽世·共读推导·暮紫背景](soyo-study-violet-background-recovered-v1.png) | `soyo-taki/soyo-study-violet-mother-candidate-v1.png` | 学习椅的原朝向与摊开的桌面纸张保留；单一落日与湖面反光共轴，人物没有残留。 |

这四张均只登记为 **B 级原景分离背景候选**。每张图的同名 `.prompt.txt` 是原工具事件记录的 `revisedPrompt`，不是事后补写的生成描述。它们的完整原母图也在本线逐张打开对照。背景好看不等于人物 alpha、原像素配准、接触影、拖动终点或运行准入已经通过；本次未据此修改 renderer 或批准运行场景。

## 已接回原生产来源

四张背景的生产入口仍是各自原母图的 source 文件，新增的 `recoveredBackground` 指向本目录的唯一原文件、精确 Prompt 与原母图哈希。没有为恢复另造一套场景选择或审批来源。

| 原生产入口 | 分离时的实际物件边界 |
| --- | --- |
| [若麦 attention v3 source](../assets-design-generated/2026-10-23-companion-matrix/nyamu-attention-apricot-v3-source.json) | 书上竖卡留在背景，人物与穿着的鞋归 figure。 |
| [若麦 play v1 source](../assets-design-generated/2026-10-23-companion-matrix/nyamu-play-apricot-source.json) | 手里纸偶随人物一起提取，原桌面书杯灯保留。 |
| [睦 attention v1 source](../assets-design-generated/2026-10-23-companion-matrix/mutsumi-attention-apricot-source.json) | 灯旁竖卡留在背景，不因视线或手势把它改成手持物。 |
| [爽世 study violet source](../assets-design-generated/2026-10-23-companion-matrix/soyo-taki/soyo-study-violet-source.json) | 原椅背、椅腿与摊纸留在背景，保留真实遮挡，桌前行程为 0，不补绘被挡肢体。 |

`recoveredBackground.file`、`prompt`、`inputMother.file` 都相对其 source 文件解析。生产者可以直接取这一组继续同母图分离；四个来源仍明确 `primaryLayerApproved: false` 与 `runtimeAccepted: false`，没有沿用失败 mask 或把背景候选算成动作覆盖。

## 如何核对

[recovery.json](recovery.json) 的每条记录包含原工具、执行 ID、来源聊天、UTC 时间、原生成路径、原文件 SHA-256、工具事件结果与文件字节是否一致、初查工作区路径、当时的 Git 跟踪状态，以及是否在本恢复线亲看。四张恢复图还携带母图路径与母图哈希；21 张未保留尝试写明了逐图去留理由。

本次来源核对覆盖全部 541 张成功输出，实际新增候选只占 4 张。516 张已有图的来源核实不冒充本线重新看完它们，也不代替当前角色专线的母图逐张审查、主代理审美签字或真实界面操作。未生成的主题格应继续通过 image generation 补齐，不能解释为“网络中断把图弄丢了”。

本目录仅保存精选生成图、它们的图像 Prompt 和必要来源元数据；没有保存 raw sessions、私人消息正文、账号、凭据、数据库或浏览器资料。

本轮公开提交的精确选取见 [publication-scope.json](publication-scope.json)，Prompt 与来源的隐私审读边界见 [公开素材审读](PUBLICATION_REVIEW.md)。清单只选当前四个生产组合及其原输入，不允许递归强制加入全部视觉工作目录。
