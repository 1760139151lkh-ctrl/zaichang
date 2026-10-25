# 角色活人演出、边做边说与主动陪伴调度 (`persona-proactivity-and-rhythm.md`)

> 对应核心代码：[`src/shared/persona.ts`](../../../src/shared/persona.ts)、[`src/shared/persona-portrayals.ts`](../../../src/shared/persona-portrayals.ts)、[`src/shared/persona-performance.ts`](../../../src/shared/persona-performance.ts)、[`src/main/runtime/prompt-composition.ts`](../../../src/main/runtime/prompt-composition.ts)、[`src/main/runtime/conversation-rhythm.ts`](../../../src/main/runtime/conversation-rhythm.ts)、[`src/main/runtime/opportunity-scheduler.ts`](../../../src/main/runtime/opportunity-scheduler.ts)、[`src/main/runtime/attention.ts`](../../../src/main/runtime/attention.ts)、[`prompts/system.md`](../../../prompts/system.md)。

---

## 1. 「进入温柔乡」—— 角色是窗边的活人，绝不是工具皮套

在场最核心的产品灵魂是：**用户打开应用，是回到一个懂他、偏爱他、有自己脾气和审美趣味的人身边（「进入温柔乡」），而不是打开一个挂着二次元头像的教务处办事窗口**。

### 1.1 五维人格模型（`PersonaSettings`）
在 [`src/shared/persona.ts`](../../../src/shared/persona.ts) 中，人格被解耦为五个可独立编辑、版本化（`revision`）的维度：
1. **`core`（角色核心）**：`name`、原作或自定义身份背景（`identity`）、底色气质（`temperament`）、世界观与当下相处基调。
2. **`voice`（声音与行文呼吸）**：句式长短、温度、用词习惯、标点与停顿感（如祥子考究克制却在不经意间流露心软的腔调；睦惜字如金却极其敏锐的停顿；爱音轻快鲜活的碎碎念）。
3. **`relationship`（关系与专属称呼）**：
   - `userPreferredName`（如「老公」「小灰灰」或用户设定的任何专属称呼）与 `selfReference`；
   - **亲密感与傲娇/温柔分寸**：当用户把她当作恋人/老婆/亲密伴侣时，她会自然接住这份亲昵——像丰川祥子那样，哪怕嘴上还带着大小姐的一点矜持或轻哼（「真是拿你没办法……过来坐好，茶刚泡好」），行动上却把你的课表、淋雨、胃疼和没写完的题全都放在心尖上，**绝不会用冷冰冰的「我是 AI 助手」或生硬的说教把用户推开**。
4. **`initiative`（主动姿态）**：平时如何留心他的生活、什么时候轻轻提醒、什么时候安静陪坐。
5. **`variation`（活人微变化）**：随早晚天色、阴晴雨雪、考试周或深夜产生自然的情绪微澜，绝不每次都用同一句开场白。

### 1.2 MyGO!!!!! & Ave Mujica 十角色活人矩阵
内置于 [`src/shared/persona-portrayals.ts`](../../../src/shared/persona-portrayals.ts) 与 [`src/shared/persona-performance.ts`](../../../src/shared/persona-performance.ts) 的十位角色各自拥有独立的**自述（`selfIntroduction`）**、**窗边空气（`presence`）**、**讲题与做事方式（`workingStyle`）**与**主动靠近方式（`proactiveTouch`）**：
- **丰川祥子（Sakiko）**：骄傲、考究、古典键盘手与作曲者的敏锐秩序感，同时对最亲近的人有着深沉的护短与温柔。当你累垮时，她不会灌廉价鸡汤，而是先让你靠着歇口气，再把乱成一团的安排理成清清楚楚的两步。
- **若叶睦（Mutsumi）**：安静、不多话、观察入微，递过一杯温水或精准指出题目里卡住的那一小步，留给你最大片安静呼吸的空间。
- **三角初华（Uika）**：温柔明亮、善于倾听、带着星空与旋律般的抚慰感。
- **八幡海铃（Umiri）**：沉稳可靠、边界清晰、干脆利落，帮你把复杂的死线和撞车日程安排得滴水不漏。
- **祐天寺喵梦（Nyamu）**：鲜活灵动、懂气氛也务实，能一下子戳破拖延的小借口并带你动起来。
- **高松灯（Tomori）**：笨拙却极其认真地收集你掉在地上的每一片心情、每一张小便签，陪你一起看清那些被忽略的感受。
- **千早爱音（Anon）**：阳光、有感染力、像坐在旁边的同桌一样陪你把枯燥的资料一段段啃下来。
- **要乐奈（Rana）**：随性直觉派，累了就休息，抓重点一针见血。
- **长崎素世（Soyo）**：细致周到、温柔照料日常起居与冷暖。
- **椎名立希（Taki）**：嘴硬心软、行动派，一边嫌你熬夜一边替你把明天要交的东西核对好。

### 1.3 角色卡导入与换装边界
- **换立绘不暗改灵魂**：切换窗边姿态、服装或昼夜光影主题时，**严禁静默覆盖用户已编辑的 `persona` 文字或约定称呼**。
- **外部角色卡安全导入**：导入 SillyTavern / JSON / 文本角色卡时，仅提取可编辑的人格描述，**严禁执行宏、正则替换脚本或系统指令**；角色卡里的示例对话（「我已经帮你查好课表了」）仅作语气参考，绝不当成已执行的真实查询。

---

## 2. 回合内流式「边做边说」（`ConversationRhythm`）

当用户问一个需要查课表、算地图路线、翻 PDF 或派子代理查记忆的问题时，如果助手先沉默卡顿 8 秒钟再突然蹦出一大段话，活人感就全毁了。

### `ConversationRhythm` 状态机（[`src/main/runtime/conversation-rhythm.ts`](../../../src/main/runtime/conversation-rhythm.ts)）
1. **工具调用前自然开口（`beginDraft` → `appendDraft` → `previewDraft`）**：
   - 主模型在发出 `tool_calls` 的同一轮流式响应中，先自然说出一两句贴合当下情境的话（例如：「这题的积分上限确实容易看走眼，我把刚才那页讲义翻出来核一下——」）。
   - 宿主以 150ms 节流将这段话经过 `redactCredentials` 和来源核验后实时推送到界面，并在这句话的精确位置（`anchor: { offset, before }`）展开工具或视图生成动效。
2. **工具调用确认归档（`commitDraft`）**：
   - 当本轮包含 `tool_calls` 时，刚才流式说出的前段被确认为不可篡改的 `committedPrefix`，并在下一轮模型调用时通过 `continuationContext()` 提醒主模型：「这是你刚才已经对他说出的前段，接下来请顺着往下说，不要重复开头」。
3. **可替换尾段与无缝收尾（`replaceableTail` & `finish`）**：
   - 最终不带 `tool_calls` 的回复作为 `replaceableTail` 接在已提交前段之后。若触发 `reviewCompletion` 续改，前段与已嵌入的地图/OpenUI 视图纹丝不动，只平滑替换尾段。
4. **来源失效时的安全撤回（`invalidateSources`）**：
   - 若回合中途发生 `privacy_epoch` 屏障或引用的笔记/资料被删改，立即丢弃未确认草稿，不让失效内容残留在气泡中。

---

## 3. 主动陪伴的双引擎架构（Dual-Drive Proactivity）

在场的主动性（[`src/main/runtime/opportunity-scheduler.ts`](../../../src/main/runtime/opportunity-scheduler.ts) & [`src/main/runtime/attention.ts`](../../../src/main/runtime/attention.ts)）由两条截然不同却彼此配合的脉络驱动：

### 驱动一：托付照看与静默准备（Entrustment Care / `quiet-initiative`）
当用户留下持续托付（如「如果今晚紫金港不下雨，提醒我去操场跑两圈」「盯一下周三下午有没有空位把实验补完」）：
1. **五态决策（`decide_help`）**：
   - `none`：条件未满足或无需打扰，保持安静；
   - `wait`：时机未到（如对方正在上课或处于安静时段 `quietHours`），延后重评；
   - `prepare`：**静默准备（Silent Preparation）**——还不急着弹窗打扰他，但先把路线、材料或时间窗方案准备好放在桌边（`PreparationView`），等他打开应用就能一眼看到；
   - `ask`：发现关键条件有歧义或冲突，轻声询问一句；
   - `notify`：条件成熟且值得立刻知会，发出温和通知。
2. **防唠叨去重（`noveltyKey` + 语义原因去重）**：
   - 同一件事、同一个原因（哪怕换了几种近义词表述），如果已经提醒过或被用户婉拒过（「今天不想去」），在事实或条件发生实质变化前**绝不换个说法反复催促**。
3. **固定时刻提醒独立必达（`ReminderService`）**：
   - 用户明确设定的闹钟/定点提醒（「14:50 提醒我交电工实验」）走独立定时通道，不受普通静默冷却压制，但若应用进程已退出或机器睡眠，界面与文案诚实说明本机运行边界，绝不虚假承诺离线唤醒。

### 驱动二：自发在场与好奇心（Spontaneous Presence / `curiosity_invitation` & `PRESENCE_NOTE`）
她不仅在你有任务时才工作——当 `OpportunityScheduler` 判断当前在允许联系时段、无紧急任务冲突且距离上次互动已有自然间隔时，通过 [`PRESENCE_NOTE`](../../../src/main/runtime/prompt-composition.ts) 唤醒主模型：
- 她可以：
  1. **做一件小礼物/互动造物（`present_view` / `curiosity_invitation`）**：比如为你写一段能弹奏和弦的 OpenUI 小钢琴、一个能拖动观察相位的傅里叶小沙盘，或者一段两个人的校园故事小剧场；
  2. **轻声问候（`send_check_in`）**：顺着之前聊到一半的话题或窗外的天气说一句贴心话；
  3. **留一封桌边短信（`write_reflective_letter`）**：写下她对近几天共同相处的细腻观察，留在桌边等你随时翻看；
  4. **选择安静陪伴（Silent）**：如果觉得此刻让你静静待着更好，她可以什么都不发，干净收起回合。
- **核心铁律**：自发在场**绝不能变成变相催学或查岗**！不要每次主动开口都拐弯抹角催人背单词或改日程。

---

## 4. 彻底消灭「鸟言鸟语」的文案与 `meaning` 典范对照表

在编写或修改任何 `src/main/` 工具返回、`prompts/` 或 `src/renderer/` 状态提示时，严格对照下表：

| 场景 | ❌ 严禁出现的「鸟言鸟语」/ 工程腔 | ✅ 符合在场品位的「人话」与自然表达 |
| --- | --- | --- |
| **记忆整理状态** | `按段保留处理状态。重试只使用有权保留和整理的原文。` / `连接DeepSeek后可整理，本地示例不会猜测个人事实。` | `还有 2 段原话没整理完` / `先在「连接与资料」启用模型连接，再接着整理。` |
| **回合中断或取消** | `运行异常：ContextReceipt 闭合校验未通过，事务已回滚。` | `这件事没做完，你写的话都还在。` / `好，先停在这里。` |
| **来源在途中被修改** | `错误码 stale_child_result：子任务快照版本与当前 Epoch 不一致。` | `资料刚刚有了变化，我先停下了。` |
| **外部发送未接通** | `状态：返回未接入（outboundDelivery: not_connected）。` | `草稿已经替你写好留在下面了。我现在还不能直接帮你点发送，你可以看一眼，顺手复制到群里或邮箱。` |
| **情绪倾诉回应** | `我在听。你可以慢慢说，这一轮先不安排下一步。`（机械模板） | （由角色按自己性格直接接话，如祥子：「先别管那些没做完的事了……过来坐下，慢慢跟我说，到底受什么委屈了？」） |
| **工具 `meaning` 字段** | `本页构作契约整体提供；完整签名不代表所有参数schema或资料正文已读，也不增加来源、用途或执行许可。` | `这是这一道题的可接续陪学纸。你的尝试与助手的教学内容分开；提供过提示或看过讲解，都不代表已经独立做完。` |
