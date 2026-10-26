# 文学房间：干净来源恢复与空间判断

本轮先保全用户选择的近景关系，再解决真实界面在其上出现的灰盒和割裂。下文是当前制作代理的直接观察与设计判断；不代替主代理亲看、最终角色矩阵准入或运行验收。

## 第一张图已精确找回

用户附件第一图对应[文学祥子原母](../../2026-10-25-ambient-redesign/sakiko-reading-literary/sakiko-reading-apricot-literary-v1.png)。它由旧主聊天 `01a16fb3-8f8d-7c72-a744-a441e8907c91` 的 text-only 调用生成，完整[原提交 Prompt](../../2026-10-25-ambient-redesign/sakiko-reading-literary/sakiko-reading-apricot-literary-v1.prompt.txt)仍在。

附件与原母都是1536×1024，PNG文件SHA不同，但解码RGB字节SHA完全相同：`af11b20a2f872eb345eb5aafbb646dbc2aac2de78e5218c33bcb7b4db709e638`。原母PNG为`e9d41849151b5678082567ed80cada650ab47e7955dd6061dbd2251a5c03a9fd`；附件PNG为`86b2af7843f9602e8099675765b3cbfd1c2aa344aabf09afc72cfd44d3ecea60`。这次恢复是同一像素图像，不是重新描摹的替代图。

第一图成立的原因不只是角色好看。近处人物、座垫、窗台、桌灯和远湖共享一间有深度的房间；脸、手、书与膝部属于同一个相处时刻。桌椅和前景植物让人相信这里有人生活。角色约占右侧三分之一，身体及完整鞋部可读，画面的亲近尺度不应被旧room4的小人物标准重新压缩。

第二附件是运行画面，灰色问候块、输入块与书签块盖住了这间房的关系。它只能作为运行缺陷证据；不得成为任何后续生图输入、光影源或身份参考。解决方式应同时落实到组件材质和阅读层次，不能再以全页白渐变抹掉房间。

## 本轮恢复范围

已通过只读 `read_thread` 读取旧主聊天与22个发现的后代，并沿其全部可用分页取回 `imageGeneration.savedPath` 和 `revisedPrompt`。没有向旧聊天或代理发送消息。

- [原始生成输出目录](recovered-imagegen-originals-v1.json)：573个去重工具输出，573个原文件均存在；保存工具返回的 `revisedPrompt`，不把它冒称独立恢复的原提交Prompt。
- [字节与来源对应](recovery-source-map-v1.json)：记录实际SHA、大小与既有来源记录。568个输出能映射既有来源，373个关联文学新房间。提及来源、文件名或SHA均不自动签署审美、分层或运行通过。
- 5个旧room4爱音分层输出没有找到既有来源记录，已按原字节保存在[旧房间归档](recovered-legacy-originals/source.json)。其总逻辑大小5,449,235字节；它们是恢复资料，不能计入文学新房间的新覆盖，也不能作其生成参考。

进一步按输出SHA核对后，571个原始输出确认有工作区内的同字节副本。余下2个旧room4祥子RGBA分离尝试经亲看仍带有大片彩色光晕，未达到原位分离目标，因此只记录原始工具路径与拒绝理由，不重新收进当前资产工作面、不作生成输入。恢复数量不靠重新导入已失败工件凑齐。

用户点名的三个旧代理目录都仍有原文件：Rana rest/play/attention 对应会话89个输出，Weather layers recovered 69个，Recover visuals 95个。会话名不等于其所有后续图的角色；例如原Rana专线后期也承担了初华、海铃主题补图，已按实际来源记录映射。

## 可复用的干净空底

我亲自看过[文学空景目录](../../2026-10-25-literary-room/plates/)中的8张：clear-day、twilight、rain-night、overcast-day、rain-day、dry-night、time-day、time-night。它们保持近景文学房间的机位，窗框、书桌、椅背、边桌、窗台座与编织毯连续；没有UI、人物残影或左右昼夜拼接。日间和夜间图均可作为进一步同景姿态的环境参考。该制作观察不继承旧主代理的准入签字。

首选[clear-day空底](../../2026-10-25-literary-room/plates/literary-room-clear-day-v1.png)，SHA `f9a1a6a33c682a27dd2a8bf40ff361e0c9ceed52bbc7bd811db70694bef8664c`。没有必要重新生成同一空底来增加数量。超宽版应由这张空底扩景，不从运行灰块截图扩图；原图区域若有改变，应另立候选并重核，不假称像素不变。

## 空间设计判断

默认聊天保留完整房间和一位近处伙伴。问候是无框短句，输入是一张稳定、克制的薄纸；恢复书签与专注操作附着输入边缘，不再各自长成灰色卡片。开始读长文、推公式或比较安排时，纸面自然成为主角，角色转向真实工作位或让出内容，不能仅把全身图缩成一张174×116的小房间。

左侧不应永久清成空墙。桌灯、书架和窗帘可以继续透出，但主要文字区约x3%–50%、y26%–70%应避免深黑植物或极强窗格明暗直接穿字。清晰度由局部纸面、真正不透明的墨色和有限背景柔化共同取得，不让整片父容器或文字一起变透明。

分类应按空间关系区分：床沿相处、真正伏案共读、安静持书、看向同一安排、侧身倾听、倚靠休息、角色兴趣共创、从自己的事转头回应、带同一停点回来。聊天/倾听/恢复可以共享合法座位，但不同文件名不自动成为新骨架。纸鸟也不能成为十人的统一性格。

## 晚期原图的直接观察与待主代理亲看清单

| 原图 | 当前观察 | 后续判断边界 |
| --- | --- | --- |
| [灯·雨夜接续](../../2026-10-25-literary-room/tomori/light-activity-wave-b/tomori-resume-rain-literary-v1.png) | 手与翻开的本子自然，座垫承重、完整鞋部和雨夜暖灯同景；表情有安静迎接的温度 | 静态母图候选；没有证明恢复了任何真实对象或有可运行分层 |
| [灯·暮色小发现](../../2026-10-25-literary-room/tomori/light-activity-wave-b/tomori-play-violet-literary-v1.png) | 手中小纸物清楚，年轻表情与暮色照明协调，画面没有UI污染 | 不以换手中道具单独签署新空间动作；角色兴趣还应由产品内容决定 |
| [乐奈·休息](../../2026-10-25-literary-room/rana/apricot-wave-a/rana-rest-apricot-literary-v1.png) | 完整身体、座面和鞋部关系可读，异色眼与简洁衣着有辨识 | 与attention/chat几乎同端坐，尚不足以表达独立休息姿态 |
| [乐奈·回应](../../2026-10-25-literary-room/rana/apricot-wave-a/rana-attention-apricot-literary-v1.png) | 转向观者的意图能读到 | 与rest接近，应从她自己的吉他/望窗活动中转回，不能凭枚举计满 |
| [乐奈·雨夜闲聊](../../2026-10-25-literary-room/rana/chat-light-wave/rana-chat-rain-rain-night-v1.png) | 窗外雨与灯侧暖光完整，无硬分割 | 这是同一活动的光线变体，不能再计为独立身体姿态 |
| [祥子·暮色阅读](../../2026-10-25-literary-room/sakiko/light-activity-wave-a/sakiko-reading-violet-literary-v1.png) | 延续用户第一图的阅读、支撑与近机位，暮色光线自然 | 需要主代理亲看后才可进入相应主题格；原始画面不证明动态可中断 |
| [祥子·雨夜休息](../../2026-10-25-literary-room/sakiko/light-activity-wave-a/sakiko-rest-rain-literary-v1.png) | 凝视窗外与暖灯的情绪成立，完整鞋部可见 | 实际仍是普通端坐，更丰富的靠枕/休息身体关系仍须补，不将静态望窗视作常规动态完成 |

## 首张超宽纯空景候选

主代理要求后，使用clear-day空底作为唯一参考调用内置ImageGen，生成[超宽空景v1](literary-room-clear-day-ultrawide-v1.png)；[实际Prompt](literary-room-clear-day-ultrawide-v1.prompt.txt)与[来源及复核](literary-room-clear-day-ultrawide-v1.source.json)同时保存。工具实际返回1774×887，严格2:1；请求值2048×1024不能冒称实际值。

新左书架、书桌和暖墙的空间连续、材质细腻，没有人物、UI或灰块。但工具也重绘了原右景：灯桌、椅子、窗框的比例/位置改变，原右前景深色家具退出。因此它目前只是完整超宽空间候选，不能直接替换现文学矩阵的精确原位背景，不声称原图右区像素不变。是否只用扩景范围或另行采用，须主代理亲看决定。

本线未修改产品源码、运行注册或任何既有准入文件，没有调用产品模型代测，没有创建新测试或通用审计runner。未删除任务资产；没有清理。
