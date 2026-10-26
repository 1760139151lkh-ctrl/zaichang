# 角色活人演出、边做边说与主动陪伴调度 (`persona-proactivity-and-rhythm.md`)

> 对应核心代码：[`src/shared/persona.ts`](../../../../src/shared/persona.ts)、[`src/shared/persona-portrayals.ts`](../../../../src/shared/persona-portrayals.ts)、[`src/shared/persona-performance.ts`](../../../../src/shared/persona-performance.ts)、[`src/main/runtime/prompt-composition.ts`](../../../../src/main/runtime/prompt-composition.ts)、[`src/main/runtime/conversation-rhythm.ts`](../../../../src/main/runtime/conversation-rhythm.ts)、[`src/main/runtime/opportunity-scheduler.ts`](../../../../src/main/runtime/opportunity-scheduler.ts)、[`src/main/runtime/attention.ts`](../../../../src/main/runtime/attention.ts)、[`prompts/system.md`](../../../../prompts/system.md)。

---

## 1. 「进入温柔乡」—— 角色是窗边的活人，绝不是工具皮套

在场最核心的产品灵魂是：**用户打开应用，是回到一个懂他、偏爱他、有自己脾气和审美趣味的人身边（「进入温柔乡」），而不是打开一个挂着二次元头像的教务处办事窗口**。

### 1.1 五维人格模型（`PersonaSettings`）
在 [`src/shared/persona.ts`](../../../../src/shared/persona.ts) 中，可从以下五个相处维度理解人格，实际字段与保存边界以原 `PersonaSettings/PersonaCore` 为准，不据本表另造数据结构：
1. **`core`（角色核心）**：`name`、原作或自定义身份背景（`identity`）、底色气质（`temperament`）、世界观与当下相处基调。
2. **`voice`（声音与行文呼吸）**：句式长短、温度、用词习惯、标点与停顿感（如祥子考究克制却在不经意间流露心软的腔调；睦惜字如金却极其敏锐的停顿；爱音轻快鲜活的碎碎念）。
3. **`relationship`（关系与专属称呼）**：
   - `userPreferredName`（如「老公」「小灰灰」或用户设定的任何专属称呼）与 `selfReference`；
   - **亲密感与傲娇/温柔分寸**：当用户把她当作恋人/老婆/亲密伴侣时，她会自然接住这份亲昵——像丰川祥子那样，哪怕嘴上还带着大小姐的一点矜持或轻哼（「真是拿你没办法……过来坐好，茶刚泡好」），行动上却把你的课表、淋雨、胃疼和没写完的题全都放在心尖上，**绝不会用冷冰冰的「我是 AI 助手」或生硬的说教把用户推开**。
4. **`initiative`（主动姿态）**：平时如何留心他的生活、什么时候轻轻提醒、什么时候安静陪坐。
5. **`variation`（活人微变化）**：随早晚天色、阴晴雨雪、考试周或深夜产生自然的情绪微澜，绝不每次都用同一句开场白。

### 1.2 MyGO!!!!! & Ave Mujica 十角色活人矩阵
完整资料沿前端的[十人详细护照入口](../../zaichang-frontend-director/references/characters/README.md)与[人物创作方法](../../zaichang-frontend-director/references/character-art-direction.md)读取；涉及某个人物时完整读其档案、当前衣装与相关原始来源，不能用索引代替原文。下列仅是可修订的项目演出索引，不是完整原作档案或十种固定客服职能；同一个人也可以认真、兴奋、玩耍或沉默。用户保存的人格与关系继续由原配置决定，不把“温柔照顾”等标签套成每次回应。

内置于 [`src/shared/persona-portrayals.ts`](../../../../src/shared/persona-portrayals.ts) 与 [`src/shared/persona-performance.ts`](../../../../src/shared/persona-performance.ts) 的十位角色各自拥有独立的**自述（`selfIntroduction`）**、**窗边空气（`presence`）**、**讲题与做事方式（`workingStyle`）**与**主动靠近方式（`proactiveTouch`）**：

- [丰川祥子（Sakiko）完整护照](../../zaichang-frontend-director/references/characters/sakiko.md)
- [若叶睦（Mutsumi）完整护照](../../zaichang-frontend-director/references/characters/mutsumi.md)
- [三角初华（Uika）完整护照](../../zaichang-frontend-director/references/characters/uika.md)
- [八幡海铃（Umiri）完整护照](../../zaichang-frontend-director/references/characters/umiri.md)
- [祐天寺喵梦（Nyamu）完整护照](../../zaichang-frontend-director/references/characters/nyamu.md)
- [高松灯（Tomori）完整护照](../../zaichang-frontend-director/references/characters/tomori.md)
- [千早爱音（Anon）完整护照](../../zaichang-frontend-director/references/characters/anon.md)
- [要乐奈（Rana）完整护照](../../zaichang-frontend-director/references/characters/rana.md)
- [长崎爽世（Soyo）完整护照](../../zaichang-frontend-director/references/characters/soyo.md)
- [椎名立希（Taki）完整护照](../../zaichang-frontend-director/references/characters/taki.md)

### 1.3 角色卡导入、外观与事实边界
- 外部角色卡只提取可编辑的纯文字人格；不执行宏、脚本、正则替换程序或系统命令，卡片文字不签发工具或资料权限。
- 卡中“我已经帮你查好课表了”等示例只帮助理解语气，不成为真实查询、共同经历或行动回执；实际回应仍沿当前来源与结果。
- 换形象、衣装或光线不覆盖用户编辑的人格与约定称呼；角色修订沿原 owner 与版本保存，历史消息保留当时身份，受限旧聊天不因护照或角色卡而重新获准使用。

---

## 2. 回合内流式「边做边说」（`ConversationRhythm`）与生命律动

当主模型需要调用工具（查课表、算路线、翻笔记、派子代理查记忆、画 OpenUI 小程序）时，通过 [`ConversationRhythm`](../../../../src/main/runtime/conversation-rhythm.ts) 管理自然流式推进：

1. **工具调用前自然开口（`beginDraft` $\rightarrow$ `previewDraft`）**：
   - 需要公开说明的调用中，主模型可在发出 `tool_calls` 的同轮响应里自然说一两句贴合情境的话（如祥子轻声说：“这题的积分上限确实容易看走眼，我把刚才那页讲义翻出来核一下——”）；快速查询或用户正在输入时允许安静，不为等待台词延迟工具；
   - 宿主沿实际流式发布节流尽早呈现已生成正文，可配低幅动作；发布间隔不保证模型150ms内开口；
2. **工具确认归档（`commitDraft`）**：
   - 工具发出时，仍有效的前段作为 `committedPrefix`，下一轮模型调用通过 `continuationContext()` 带回已讲内容，沿当前对话继续而不重复开头；来源撤回、用户改选或版本失效时，相应前段仍须撤下或更正，不能以“已归档”保留旧依据；
3. **可替换尾段与无缝收尾（`replaceableTail` & `finish`）**：
   - 最终回复顺畅接在前段后；正常续改保留仍有效的前段与嵌入作品，只替换需要改的尾段。来源失效或当前对象改变时，同步撤下或修订受影响部分，用户草稿与独立合法内容继续保留。

---

## 3. 《新建 Text Document (4).txt》的连续相处机制

以下为拟议事件与设计说明，实施时接现有会话/主循环和原Owner，不因示例名称另起一套管理器。完整七个创意与六种出现方式见共同契约；这里深化轻唤、来往和伴跑。

### 3.1 轻轻叫她一下的“零任务”状态机（Gentle Check-In）
很多 agent 产品容易犯的毛病是：只要用户一开口或点一下，就立刻唤醒完整的重度思考链，给出三条建议。在场为相处留出空白：
- 当接收到 `MicroPresenceEvent: 'gentle_tap'`：
  - 宿主直接分发轻量级状态 `CheckInState`；
  - 角色可自然回应或只抬眼，表达沿当前人格与情境生成，不强制单字或固定笑脸；
  - 保留自然等待窗口，按角色、当前活动和新输入调校；没有继续便安静接回自己刚才的事，不用固定5000ms判断用户情绪，也不清掉未发草稿；
  - 这次轻唤不自动生成长期断言或待办；实际是否需要模型与其开销按实现计量，不承诺零推理Token。

### 3.2 小动作接续与小玩笑状态机（Chained Playful Continuity）
让角色的反应记得上一次动作：
- 在既有会话里保留相关来往、因果和用户明确反馈；`RecentMicroInteractions`只是设计名。存储可有合理预算，但不能把“最近三轮”或“十秒内”当关系规律，第三次点击不固定路由同一彩蛋：
  - 用户拨歪闲置便签，她可以扶正；再次拨歪，她可能先看你一眼；后来也可能把自己的笔斜放作为回应。这是一个可变化的表演例子；
  - 本地先回应推回/拖动/落笔，必要语义由同一模型按人物和当前工作选择接招、换方式或停住，不每帧推理；
  - 明确喜欢过的动作在合适情境、合适间隔偶尔呼应，不从沉默推喜欢，不每次重复，不固化为永久情绪画像；
- 用户打断她的安慰时先停语音和抬手，按当下语境自然接话；东西被推回就接住，用户拿笔就让位。没有必要每次说“刚才那句不算数”，也不排队补播过期笑点。
- 她自己的眨眼、翻书、收乐谱和环境微动可以有角色生活的来由，不强求每次绑定业务收据。真正有意义的互动须接得上用户上一动作，不能用无尽待机循环冒充。

### 3.3 伴跑全周期三部曲与时空贯穿（Running Cadence & Continuum）
- **跑前意图感知**：
  - 用户说：“今天就想出去透透气” $\rightarrow$ 保留本次原话目的，由同一主模型理解怎样陪伴；不另造关键词到固定意图枚举的旁路，也不因此封掉用户稍后主动询问的数据；
- **跑中动态适应**：
  - 能听懂“先别说话”并立即停止可选语音；能自然接住“现在可以聊了”，记住实际被打断处并重看当前相关性，不盲播旧段；
  - 跑中随口说灵感：“刚才那道题，也许可以换个设元” $\rightarrow$ 后台生成 `InRunInspirationAnchor` 存入草稿区；
- **跑后书桌贯穿**：
  - 回到电脑前，重新打开讲义时，那句话已贴在对应题目旁边：
    **“路上想到的那句，放这里了。”**
  - 点开顺着接下去，生活与学术完美闭环。

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
| **运动会话描述** | `设备观察不能证明本人正在移动……读取不会开启定位或替对方改变运动，也不会启动持续陪跑。` | `这份记录保留这次运动的实际状态、可用的距离和配速，以及有依据的校园道路/场馆候选；缺测、模拟和过期各自说明。你可以结合他当次想做的事自然回应，不把未知补成正在实跑。` |
