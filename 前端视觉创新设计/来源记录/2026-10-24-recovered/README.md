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

## 本轮主聊天及子代理的未汇报成功图复查

另存的 [current-run-unreported.json](current-run-unreported.json) 只追本轮 `01a16fb3-8f8d-7c72-a744-a441e8907c91` 和 session 元数据能证明的真实子孙，不覆盖上面的旧 541 张基线。纳入两路仍健康的乐奈子代理、`cast_mujica_recovered` 子树，以及三条已由主代理确认失败的原会话；后者本次只读，原失败证据没有改写，也没有在失败会话中续跑工作。同 ID 的两份主聊天日志按生图执行 ID 去重。

本轮快照共 15 个会话、117 条生图结束事件，其中 111 张成功原图全部找到，原文件与工具事件的图片字节 SHA 一致。109 张已有项目副本，剩余两张是原生产记录明确拒绝的祥子透明提取：放大/泛光，没有重新恢复进项目。其余 6 条是无成功图像的工具事件，不冒充丢失图片或新的模型会话故障。

实际补回主代理视野的是九个此前尚未按完整 bundle 汇报的祥子主题工件。它们原本已经由健康生产者立即复制到唯一生产目录，本恢复线逐张打开并把精确事件 Prompt、原路径和项目地址补存进新索引，随后按九条短路径发给主代理；没有为了声称“救回”而再造第二份 PNG。

| 类别 | 项目原文件，均位于 `来源记录/2026-10-24-matrix/sakiko/` |
| --- | --- |
| 三种净空背景 | `sakiko-resume-mist-background-v1.png`、`sakiko-resume-violet-background-v1.png`、`sakiko-resume-rain-background-v1.png` |
| 当前人物轮廓 | `sakiko-resume-mist-mask-v1.png`、`sakiko-resume-violet-mask-v1.png`、`sakiko-resume-rain-mask-v1-tight.png` |
| 独立接触范围 | `sakiko-resume-mist-contact-mask-v1.png`、`sakiko-resume-violet-contact-mask-v1.png`、`sakiko-resume-rain-contact-mask-v1.png` |

原生产者随后完成了 [theme-layer-production.json](../2026-10-24-matrix/sakiko/theme-layer-production.json) 和 [resume-theme-layer-bundles.json](../2026-10-24-matrix/sakiko/resume-theme-layer-bundles.json)，并报告已发送三个原房间/浅深底预览地址。它们仍由原生产者和主代理负责审查；本次没有修改这些来源、运行注册或审签。两个带蓝窗边的旧雨夜 mask 保留原拒绝记录，不列入九个当前候选。

“已生成”“已 copy”“制作者 final 列过”“已给主代理发路径”“主代理真正打开”“批准”在新索引里分开记录。没有足够直接回执的项保留未确定，不凭图片数量、文件存在或制作者口头判断宣称主代理已收组或通过。没有发现因响应终止而遗漏复制的合格完整人物母图，也没有因此重生整套图。

### 2026-10-25 三条终止会话的限定复核

[current-run-unreported-v2.json](current-run-unreported-v2.json) 仅复核主代理指定的三条失败会话（祥子 master、weather child、quiet fallback）、已存在的 `weather_layers_recovered` 和当前主聊天，共五个会话；没有扩到无关聊天、重跑旧 541 基线、建立替代会话或继续失败会话。原失败证据与上一份回收索引的文件哈希前后相同。

流式核对得到 66 条生图结束事件、63 张成功原图。63 张均与工具事件的图像字节 SHA 一致，并找到明确的输出 SHA 来源记录和现有 Prompt 文件。61 张有项目内相同 SHA 副本；另两张仍是此前已明确拒绝的透明人物提取，没有恢复进项目。没有新的未归宗成功图，因此本轮没有复制新 PNG，也没有打开一批旧图或重新生图。

重点核到：V5 母图、背景、最终人物 mask-v3 与接触 mask；weather 失败前的阴天母图、净空背景与分离工件；主代理补齐的 time-only 日/夜背景，均已有精确 SHA 的项目副本及生产来源。quiet fallback 没有成功生图事件，默认生成目录也不存在；日/夜两张来自主聊天的真实成功事件，未算到 quiet 名下。三个非成功生图工具事件不冒充成功图或模型终止证据。

本次只补来源核对记录，没有修改生产 source、运行注册、并行角色目录或原审签；现有素材的采用范围仍沿各自真实生产记录。
