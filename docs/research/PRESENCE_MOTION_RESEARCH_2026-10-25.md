# 在场：动态、角色制作与连续体验的公开研究

检索与复核日期：2026-10-25。三条公开 idea 研究线分别讨论动作语言、角色生产、连续作品；主代理亲自打开下列采用的关键来源。研究代理没有承担仓库精读、文档修改或验收。

本文区分**来源明确支持的事实**与**针对在场的设计推论**。原型、论文、平台文档和创作者经验不是同一种证据。所有具体产品设计仍要用在场的真实用户故事验证。

## 1. 表达性动作要与功能动作一起设计

**来源**：[Apple ELEGNT 项目](https://machinelearning.apple.com/research/elegnt-expressive-functional-movement)、[论文全文](https://arxiv.org/html/2501.12493v1)。

研究比较了功能性动作与加入表达性动作的灯形机器人视频；有效样本为 21 人、六种任务。结果支持表达性动作可能改善部分互动感受，同时指出无理由持续移动、妨碍功能、动作与声音不匹配等问题。它不是对长期虚拟伴侣关系的证明。

**在场推论**：看向共同对象、收到纠正后收手、听用户说完，比持续眨眼更有意义。将眼神、身体、灯光与声音编排为同一个有来由的动作，同时给静止一个完整状态。

**落地**：共同契约七种动作语法；Stage 01 的“这里—下一行”；Stage 05 的准备后让位；Stage 10 的聆听与同乐。不能用论文包装“更多动画必然更亲密”的结论。

## 2. 流畅来自可改变主意

**来源**：[Apple WWDC18 — Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/)。

官方讲解强调对输入即时响应、允许重定向与中断、空间关系一致以及动作中的连续接管。

**在场推论**：用户拖动地图、接过纸页、改变选区时，界面应从当前位置继续；不等动画播完，不跳回初始帧。跨页可用同一对象建立方向感，但并非每次都需要长镜头。

**落地**：Stage 04 的递/接/摊/收，Stage 07 CameraOwnership，Stage 08 试放，现有 spring 速度连续机制。不要把所有属性都套弹簧。

## 3. 低动态是一种完整体验

**来源**：[W3C Understanding SC 2.3.3 — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)。

该条是 WCAG 的 AAA 成功标准，针对交互触发的非必要运动提供关闭能力；自动开始的运动另有相关准则，不能混为一项。

**在场推论**：静态布局、来源标记、清楚状态与焦点足以承载相同信息；低动态不应损失操作。避免用动效作为唯一错误、完成或关注提示。

**落地**：十二阶段各自的静音/低动态/键盘路径；Stage 12 以同一生活链验证。

## 4. Gemini 网页能力必须与本轮账号界面对应

**来源**：[Google Gemini Apps — Generate videos](https://support.google.com/gemini/answer/16126339?co=GENIE.Platform%3DDesktop&hl=en)。

本次官方帮助页描述 Gemini Omni 的视频生成/编辑、参考素材与多轮修改；页面说明可加入一个视频及最多五张图片，并列出计划、地区等可用条件。实际账号入口、模型与限额仍须在生成当轮观察；帮助页不能证明本用户本轮已经可用所有能力。

**在场推论**：GPT Image 固定身份、场景与关键姿态，Gemini 网页探索运动，代码承担可变目标、交互和状态。3–5 秒是某段产品动作的剪辑目标，不是伪造的网页 API 参数。

**落地**：[角色动态制作规范](../design/CHARACTER_MOTION_PIPELINE_2026-10-25.md)与 Gemini Skill 的在场移交参考；Stage 01/02 做样片，Stage 06 扩矩阵。

## 5. 角色运行时：选择合适的一套

**来源**：[Rive Web runtime parameters](https://rive.app/docs/runtimes/web/rive-parameters)、[Live2D Pose](https://docs.live2d.com/en/cubism-sdk-manual/pose/)、[Live2D Motion](https://docs.live2d.com/en/cubism-sdk-manual/motion/)、[Spine 双手持物示例](https://esotericsoftware.com/blog/Holding-a-two-handed-weapon)。

Rive 当前文档将旧 State Machine Inputs 标记为弃用并引导数据绑定；Live2D Pose 主要处理部件不透明度，动作优先级需要正确管理；Spine 的示例使用 IK 与 transform constraints 协调持物。

**在场推论**：身份、接触、通道归属与演员实例应先设计，再选运行时。若局部分层已足够完成共同注意，就先验证；需要手—物件约束时再引入合适 rig。不同演员状态独立，道具始终有唯一 owner。

**落地**：制作规范的姿态拓扑、遮挡图、有效矩阵、过渡图与失败分型；Stage 06 和 Stage 10。执行前复核实际版本、授权和资产制作成本，不一次安装三套框架。

## 6. 共同画布需要结构与视觉双重上下文

**来源**：[tldraw Agent starter kit](https://tldraw.dev/starter-kits/agent)。

官方示例结合当前选区、视口、近期操作、截图及结构化形状数据构建上下文，并在应用模型动作前做校验。

**在场推论**：共同注意需要实际对象 ID、版本、文本/笔迹锚点及当前可见区域；截图可以辅助理解，不能取代对象身份。并不照搬该示例的代理主循环，仍使用在场唯一 Hermes 链路。

**落地**：Stage 01 的精确指向、Stage 08 双纸、Stage 09 OpenUI；不进行持续屏幕监控，不把全部鼠标运动上传模型。

## 7. AI 建议可以像共同创作中的分支

**来源**：[Ink & Switch Patchwork — AI bots in version control](https://www.inkandswitch.com/patchwork/notebook/2024-version-control/07/)。

研究原型把 AI 修改放在分支上，支持部分或全部合并，差异和历史保留修改来源。这是原型实践，不是对所有协作场景的普遍效果保证。

**在场推论**：一组建议可以有共同外观与原因，但每个子对象的采纳和执行独立。用户可以只接受书签而不改日程，只接受故事的一句而不覆盖整稿。

**落地**：Stage 04/08 的共同操作组与局部采纳，Stage 05 主动提案，原 Owner 与 expectedRevision 继续生效。

## 8. 锁屏连续性受平台实际能力约束

**来源**：[Apple — Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)、[ActivityKit push updates](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications)。

官方资料说明 Live Activity 有活动时限，当前文档给出最长八小时；它自身的沙箱不能直接访问网络或接收位置更新。更新依赖应用或平台推送机制，不能把锁屏视图当成持续运行的完整宿主。

**在场推论**：用它承载有开始和结束的运动/当前任务，清楚表达过期、暂停、结束。桌面/iPad/手机共享对象，后台能力和输入方式分别适配。

**落地**：Stage 11，保留用户明确的先 iOS/iPad、后 Android 顺序；MuMu 验证不冒充真机证据。

## 9. 从研究转成在场的二十项具体决定

| 决定 | 为什么适合在场 | 写入位置 |
| --- | --- | --- |
| 当前共同对象决定眼神 | 用户说“这里”应被准确接住 | Stage 01、共同契约 |
| 纠正先撤旧指向再建立新目标 | 让“听进去了”当场可见 | Stage 01/03 |
| 输入/落笔接管角色表演 | 保护正在形成的思路 | Stage 01/08 |
| 准备与递出分开 | 主动性有心意，也能不打扰 | Stage 05 |
| 递出过程中可以停在桌边 | 不把用户锁进接受/拒绝弹窗 | Stage 05、制作样片 B |
| 稳定入口携带未完片段 | 换页仍是同一段相处 | Stage 04/11 |
| 点一下也能回应，不必领任务 | 陪伴包含无功利的轻互动 | Stage 01/10 |
| 真实采用才形成共同短语 | 避免单方面制造亲密记忆 | Stage 03 |
| 旧稿与新理解只画真实对应 | 尊重用户的思想与证据 | Stage 04 |
| 共同操作组允许部分采纳 | 一个自然请求不吞掉多个权限 | Stage 04/08 |
| 跑步目的保留用户原话 | 透气与训练是不同体验 | Stage 02 |
| 途中念头回到原题 | 生活与学习自然连续 | Stage 02/11 |
| 手势接管后相机不抢回 | 空间探索属于用户 | Stage 07 |
| 身份、场景、姿态三表校验 | 从源头阻止错图拼接 | Stage 06、制作规范 |
| 姿态用接触拓扑分类 | 坐稳、握住比情绪词更可执行 | 制作规范 |
| 道具交接明确换 owner | 避免手、纸、桌各动各的 | 共同契约、Stage 10 |
| 每演员独立状态与通道写者 | 多角色不会互相覆盖动作 | 制作规范 |
| 声音属于同一次动作 | 不靠逐字音效制造热闹 | Stage 01/10 |
| 隐藏恢复只展示有效新变化 | 不补播过期表演 | Stage 05/11 |
| 把静音与低动态走成同一故事 | 在场不依赖持续感官刺激 | Stage 12 |

这些是设计推论与实施要求，不是本轮已经完成的运行功能。每项都已进入路线图或共同规范，并附中断、失败或降级条件。

## 10. 2026-10-24本机合理化的定向复核

本次重新读取[Gemini网页视频帮助](https://support.google.com/gemini/answer/16126339?hl=en)与[Omni API文档](https://ai.google.dev/gemini-api/docs/omni.md)，也核对本机Antigravity的 `gemini-omni-flash-api` Skill。Omni及其API真实存在；错误在于把API插件脚本、未定义的 `gemini generate-video` 命令和网页控件混写，或把提示词里的秒数、帧率、首尾图当成成片保证。此次只核资料，没有上传素材、生成或实测账号额度。

重新读取[Yamaha钢琴Action说明](https://www.yamaha.com/en/musical_instrument_guide/piano/mechanism/mechanism003.html)，采用击弦、复奏和制音的因果关系作为设计依据。具体机构尺寸、调律、碰撞和声学仍需选定型号与模型；原文没有提供本项目固定10/8/2mm及8/12ms的统一验收依据。保留精密互动目标，改为经核机构与实际演奏/聆听验证，不以一个衰减式或漂亮生成片自证物理全模型。

原研究中的平台和角色运行时资料仍保留其原复核时点；此次没有把全部旧参考重新联网、真机或生成验证。针对项目的连续动作、共同记号和逐阶段设计属于原创推演，不能冒充已被这些来源证明的运行能力。

## 11. 上传TXT的贯穿体验线索复核

此次定向复核用来深化附件中的具体设计，不把搜到网页当成实际操作或完整观看作品。下表记录原作者/官方材料所支持的范围和本项目采用；没有新增依赖、部署参考项目或生成音视频。

| 参考 | 本次实际取得的依据 | 在场采用与边界 |
| --- | --- | --- |
| [Rauno：Invisible Details of Interaction Design](https://rauno.me/craft/interaction-design)、[Novelty](https://rauno.me/craft/novelty) | 作者原文：可打断、即时跟手、来源空间关系、高频操作与新鲜感、可随手玩的细节 | 共改/收起/展开连续，高频操作不反复铺演，玩乐仍保留；这些是设计观察，不套成固定90/10比例或削减动效目标。本次未操作原网页示例 |
| [Ken Wong：Florence GDC回顾](https://www.gdcvault.com/play/1025694/Letting-Go-A-Florence) | 官方检索摘要确认讲者与主题；现场页面跳转维护页，未完整观看讲座或游戏 | 附件提出的“操作承载关系变化”作为设计输入保留，具体递/接/收为在场原创推演；不声称看过游戏后逐帧复刻 |
| [DeepMind：AI Pointer](https://deepmind.google/blog/ai-pointer/) | 官方介绍指点、语音和周围语义共同传意，明确是实验演示、片段有缩短 | 共同指向、A/B关系和真实上下文接续；本项目仍核原对象、版本和许可，不承诺原型演示速度或整机无限感知 |
| [tldraw：AI integrations](https://tldraw.dev/docs/ai) | 官方资料将截图、形状、当前选择、近期操作和会话结合，动作按类型校验 | 同时接结构与必要视觉，共改后模型读真状态；复用在场主循环和Owner，不强制引入另一套canvas agent |
| [Apple ELEGNT](https://machinelearning.apple.com/research/elegnt-expressive-functional-movement) | 本文第1节已有研究依据，本次没有重播全部实验视频 | 注意、功能和表达共同编排；不能把“少量有意义动作”变成禁止角色自主生活，或把实验扩成长期亲密效果证明 |
| [Andy Allen/Thomas Williams：The Sound of Software](https://notbor.ing/words/the-sound-of-software) | 作者原文讨论声音变奏、相关动作的音色家族、相反动作的方向性、整体声景及用户控制 | 纸/木/琴有亲缘和变化，在目标设备聆听，静音仍完整；不照搬绕过系统静音的实现建议，也不生搬每个动作8–12变体数字 |
| [Google Seed Studio/Map：Little Signals](https://experiments.withgoogle.com/little-signals) | 官方说明六种物件用不同感官提示，在需要时从背景来到前景 | 低注意力方式可多样组合，光晕只是其中一种；不能用外围提示取代实际信息、稳定入口和停止控制 |
| [Hello Lamp Post：共同创作者说明](https://tomarmitage.com/2013/01/21/announcing-hello-lamp-post/)、[制作方/主办方项目记录](https://www.watershed.co.uk/studio/projects/hello-lamp-post) | 熟悉城市物件以独立代码承载互动和故事的项目说明 | 共同记号挂在真实对象与理由上；在场的私有关系留在原Owner，不照搬公共SMS或默认公开记忆 |
| [Embark](https://www.inkandswitch.com/embark/) | 研究原型以结构化提及、地图/日历视图及计算连接计划，保思考过程和决策语境 | 共同对象组、选择理由和原处准备跨页面延续；不复制原文/业务进新总库 |
| [Patchwork：AI bots in version control](https://www.inkandswitch.com/patchwork/notebook/2024-version-control/07/) | AI变更可放分支、部分/全部采用，差异和历史保作者 | 接一笔、留自己的稿、拒绝其余；业务外部行动仍核原授权与回执，不能用文档合并冒充执行 |
| [Patchwork：Account History](https://www.inkandswitch.com/patchwork/notebook/account-history/) | 原研究探索按时间找回当时文档状态，并在历史与最新版本之间查看；空间桌面也是其中一种组织模型 | 比较组/停点/摆放与版本关系一起续接，回来只点有用变化是本项目的进一步设计，不能反写为原研究已证明的效果 |
| [Nike NRC：Mindful Guided Runs](https://www.nike.com/au/running/guided-runs/mindful)、[Distance-Based](https://www.nike.com/au/running/guided-runs/distance-based/) | 官方资料给出对话式引导及按距离节点的音频陪跑；TXT所说某篇访谈未提供唯一链接，本次未试听整套课程 | 按本人目的/实际事件选择说什么、何时安静，幽默闲话由角色自然生成；不把固定课程或训练指标套给每次透气出门 |
| Cursor Buddy / [AIRI候选原仓库](https://github.com/moeru-ai/airi) | TXT未给Cursor Buddy唯一URL，无法仅凭同名认定项目；AIRI仓库介绍可见，本次未部署、运行或审其全部源码 | 指点/语音/角色表现可继续研究，未验证不写成可直接移植能力；不从参考项目另引人格/记忆主脑，也不把未选库列强制依赖 |

这些来源帮助校正设计，用户的完整目标仍决定交付范围。共同契约与各阶段门禁已经采用相应创意；真正的形式比较、角色动作和音色质量须在实施时用同一真实任务实际制作、操作与聆听，不能由本表代签。
