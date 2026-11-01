# 乐奈闲聊 · 三种目标光

本目录为 root 限定的 3 次完整母图：mist / overcast-day、violet / twilight、rain / rain-night，各一次，无重试，预算已用完并停止。三张原图均1536×1024，已逐张亲看；primary、layer、runtime 与注册均未准入，待 root 审母。

每次第一输入是对应已准入目标空 plate，决定 camera、家具、全景与所有照明；第二输入是 root 已准 Rana chat（SHA 060e897c7b9ebdefc5ab84d6fbada2983625b19e6a4ebc57501ede19c5259919），只传身份、黑白服、已支持坐姿及头鞋比例。提示词明确排除第二输入的暖杏硬日照、身体/白袖亮斑、窗格/叶影和地板太阳矩形。没有把旧暖杏图当完整照明基准。

每个 call 均同次 exec 立即保存实际 PNG、exact prompt、input/output SHA 与 toolOriginalPath，再显示检查；没有保存大结果副本或进行 raster 后处理。

| palette / environment | 原母 | SHA-256 |
| --- | --- | --- |
| mist / overcast-day | [没说完的那一半](rana-chat-mist-overcast-day-v1.png) | 00f5f20045cb1464e4cdf8fe755c44db46a812c6ad6da75dcd3dc3c9f217b3f0 |
| violet / twilight | [故事拐弯的地方](rana-chat-violet-twilight-v1.png) | 535cdfa7a3b9845083bc6836a1e1d33ce1b95d8c69b2cb2200a2066c394c9598 |
| rain / rain-night | [把声音留在灯里](rana-chat-rain-rain-night-v1.png) | 36b4ce5e0c04f83d6f2651b4e618454e731a0553831140228d229a80b2a377b7 |

## 实际检查

- 阴天：云层、干燥日景与柔散光成立；整景可见地板、垫面、腿和白袖未观察到旧硬太阳窗格/叶斑。局部灯暖保持，金蓝眼睛和短发可读。
- 暮色：全窗连续玫瑰/紫暮光与暖灯，人物皮肤、银发和白袖共同变光。地板仍有目标准 plate 原已存在的明暗带，需 root 对照实际光源判断，不声称所有条带都被移除。表情是直接追问，笑意很轻。
- 雨夜：雨滴/雨痕、暗云夜景及湖面灯影在窗外；室内干燥，人物与白袖/腿/地板共同夜间暖灯塑形，未观察到旧硬白昼窗格斑。神态是认真有思考，并未因下雨自动悲伤。

三图完整头鞋、原近窗榻尺度、髋/膝/掌/软垫与靴/地板关系在全景可读，未观察到明显断体或悬空；这仍是 producer 静态观察，不代替 root 主审、不签分层或运动。未新增图层、scene 注册、源码、测试或 runner；Rana 八活动另波次保持封存。

[机器可读交付与精确文件审计](rana-chat-light-wave-manifest.json) 记录每图 prompt/source SHA、两输入实际 SHA 校对、目标 plate 准入、toolOriginalPath 存在性和准入边界。
