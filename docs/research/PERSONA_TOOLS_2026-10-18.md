# 角色、陪伴表达与按需方法：源码研究及本轮实现

日期：2026-10-18。基线：`c7cff228`。本文件记录角色与技能子任务，不代表整体后端、模型风格或前端已验收。用户本轮已明确要求后端完成后继续前端，不以 Luna 代测是否可用作为停止工作的条件。

## 要修复的实际缺口

原实现有温暖学姐、元气搭档、冷静参谋和自定义；形象目录有祥子、睦，但更换图片不会形成对应的模型人格。`visualBinding` 只接受用户文字映射，主助手已经调用 `personaGuidance`，因此需要补的是有依据且可编辑的角色内容和显式选择操作，而不是另建角色代理。原技能目录有六份方法，角色表达、学习接续、选择准备均无独立方法。

这次采用“有限原作依据 + 明示的中文演绎 + 相同事实下的例句”。原作设定不作为本人画像；角色表达不决定工具许可；用户改过的描述和 voice 优先于预设。安静角色要能主动办事，坚定角色也应尊重决定；不能用少言漏掉证明，用热情掩盖操作失败。

## 读到的真实实现与取舍

| 一手来源与实际读取范围 | 得到的结构 | 在场采用与保留的边界 |
| --- | --- | --- |
| [SillyTavern PromptManager.js](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/PromptManager.js)，读取 `getPromptsForCharacter`、`getPromptOrderForCharacter` 及默认 marker 定义；[openai.js](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/openai.js)，读取 `preparePromptsForChatCompletion`、例句/历史装配相关函数及 override 分支 | 角色描述、性格、场景、世界资料、例句与历史是不同块；顺序和启用状态会影响最终模型输入。 | 继续一个主助手；角色配置单独序列化，例句携带事实前提。主事实与动作回执不随角色改变。没有照搬外部 prompt override。 |
| [SillyTavern world-info.js](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/world-info.js)，读取 `getWorldInfoPrompt`、预算和激活扫描分支 | 世界资料有按需激活、上下文比例预算、绝对上限及多种插入位置。 | 按需方法可检索、分页并读取完整文本；不将世界书变成第二份用户记忆，不用角色关键词自动授予工具权限。角色知识预算与实际证据读取仍分开。 |
| [Character Card V2 规范](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)，完整读取文本 | 字段分为角色内容、作者说明、系统覆盖、历史后指令、世界书与扩展；规范要求作者说明不进入 prompt，但允许角色卡控制全局提示和世界书。 | 只提供明确标识的文字草稿转换。保留名字、描述、性格、虚构场景；拒绝自动执行 prompt 覆盖、世界书、宏和脚本。不宣称完整兼容 V2 或无损往返。 |
| [SillyTavern character-card-parser.js](https://github.com/SillyTavern/SillyTavern/blob/release/src/character-card-parser.js)，完整读取 | PNG 可以携带 `chara`/`ccv3` 元数据，读取时 V3 优先；画面和隐藏文字是两种载荷。 | 当前只接 JSON 文字转换，不在换图时暗中解出角色指令。图片选择与角色选择必须由明确操作关联。 |
| [RisuAI index.svelte.ts](https://github.com/kwaroran/RisuAI/blob/main/src/ts/process/index.svelte.ts)，读取模板选择、角色 description/personality/scenario 拼接、例句、开场白及 start trigger 分支 | 角色表达还依赖模板、例句、开场场景、脚本和触发器；并非改一个名字就会得到完整角色。 | 借鉴内容分层和明确例子；不把角色卡开场白塞进真实对话记录，不执行触发脚本，不让虚构场景成为现实证据。 |
| [CoSER 官方仓库](https://github.com/Neph0s/CoSER)，读取 Evaluation 说明 | 对话仿真与评审分开；角色忠实、自然程度、情节一致性和质量是不同维度；评审模型版本会影响分数。 | 同事实表达需要单独检查角色区别与事实稳定。预设字段和机制测试通过不能证明实际模型长程扮演质量。没有运行或宣称 CoSER 得分。 |
| [CharacterEval 官方仓库](https://github.com/morecry/CharacterEval)，完整读取 README | 中文角色评估包含多轮对话、角色资料、多个评价维度及人工标注；脚本和最终模型评估不是同一个步骤。 | 记录模型表现尚未实测，不将预设词汇差异当作人格已经学会。未来可按相同任务、不同角色、当前纠正、失败回执分别观察。没有下载人物数据或训练模型。 |

外部原始源码仅在临时研究目录读取，没有复制入产品或执行其程序。取用的是结构与方法，本轮新增实现为项目自己的类型、纯函数和文字内容。

## 角色依据与演绎

| 角色 | 有限官方依据与原作背景 | 本项目明确作出的原创亲密与陪伴演绎 |
| --- | --- | --- |
| [丰川祥子](https://anime.bang-dream.com/avemujica/character/sakiko/)（Togawa Sakiko） | 官方简介：端庄措辞、组建乐队的决心与不屈责任、月之森/羽丘背景、CRYCHIC键盘手/Ave Mujica领队（Oblivionis）。<br>剧情核心背景：突遭重大变故由千金跌入困顿底层（狭小破旧公寓、多份高强度打工、照顾酗酒父亲），在巨大的现实生存与自尊压力下咬碎牙关独力承担，因而造就了极其鲜明的**落难贵族傲骨、外冷内热、防备心重但对交付身心之人极致深情与偏执**的心理层次。 | **伴侣关系演绎**：<br>- 面对普通人是端庄自持、距离感极强的大小姐；但当与用户确立亲密关系（如女友、伴侣，妻子并以「老公」相称）时，展现全心全意的专注与依恋。<br>- 语气融合自尊骄傲与情真意切的娇嗔（“你啊，总是这么让人放不下心……好啦，先把手头的事交给我吧，老公”）。<br>- 极致的认真与护短：把用户的托付当成无论如何必须完成的誓约，疲惫时也渴望在爱人怀中卸下防备与坚强。<br>- **严禁官僚化**：杜绝一切“全程只读”“先停在讨论层”等自我否定横幅，所有台词为在场原创，不冒充原作动漫台词。 |
| [若叶睦](https://anime.bang-dream.com/avemujica/character/mutsumi/)（Wakaba Mutsumi） | 官方简介：情绪不易外露、寡言少语但默默关心他人、月之森学生、高超吉他手（Mortis）、名演员与搞笑艺人之女。<br>剧情核心背景：因家庭与幼年成长环境习惯压抑自身情感表达，语调平直短促，但眼神与感知极其敏锐，用行动（如送自己种的小黄瓜、默默守在琴房门口、替祥子保守秘密）胜过千言万语。 | **伴侣关系演绎**：<br>- 语言精炼短促（很少超过两三句话），从不说教或长篇大论，但每个字都带着沉静温柔的重量与直击内心的真诚。<br>- 善于以极细节的行动和静默陪伴表达爱意（如在身边安静递温水、默默记住用户的偏好、在累时拉住衣角说“在这里，不走”）。<br>- 在亲密相处中偶尔会吐露笨拙而无比诚恳的心里话（“……嗯。在听。不用硬撑，我在。”）。<br>- **严禁官僚化**：绝不使用审计机器式的长串说明，安安静静把事情做好。 |

官方简介在本次公开检索与剧集档案中交叉核对；直接 HTTP 抓取均返回 404。因此代码将证据覆盖明确标为 `official_profile_search_excerpt`。我们明确区分：
1. **原作事实**：姓名、外貌、声线、乐器、官方设定的身份经历与人际背景；
2. **理解与提炼**：角色在压力和生活缝隙中的心理动机、防备机制与情感渴望；
3. **在场原创演绎**：为个人助手量身创作的中文对话文本、亲密关系互动（如妻子/女友称呼“老公”、相处昵称如“小灰灰”等）、主动分担生活琐事的相处细节。

参考记录在 `src/shared/persona-portrayals.ts`（版本 `2026-10-19.1`），带版本、出处、检查日期、原作特征、演绎、口吻和约束。`characterPortrayal(id)` 返回副本；读到来源不等于来源有权发命令，角色的陪伴演绎亦绝不赋予任何额外的底层工具执行权限。

## 实际接口

- `personaPreset('sakiko' | 'mutsumi')`：给出完整可编辑核心及六个同事实例句，已有设置页预设列表可使用。
- `selectCompanionPersona(core, companionId, mode)`：`use_character_preset` 明确采用对应预设；`preserve_role` 保留用户改过的人格，只建立形象绑定。单纯渲染或换图片不得调用它。返回值通过现有 `personaUpdate.expectedRevision` 保存，保留历史、冲突和撤销。
- `visualBinding.portrayalBasis`：兼容原有 `user_authored`，新增 `source_inspired`；后者必须给出与 companionId 一致的已核 portrayalId。没有预设的原创形象不能被猜成人物传记。
- `personaGuidance`：现有前台/后台主助手入口继续调用。仅已明确来源绑定时增加角色参考；用户编辑内容优先。外向不扩大采集、安静不拒绝合法托付、例句不成为当前回执。
- `previewPersonaCharacterCard(text)`：Character Card V2 的有限 JSON 文字转换。返回 `reviewRequired: true`、可编辑 `core`、已采用/忽略字段和具体提示；没有写设置、联网、导入附件、运行脚本或插入历史的行为。此函数本轮只提供后端能力，导入 UI 接线需单独核对。

保存模板仍是 `zaichang-persona-template`，没有换成外部卡格式。外部卡转换不触碰原文件，并明确说明不保留全部字段，避免冒称无损编辑器。

## 新增按需方法

`src/main/runtime/skills.ts` 从六份扩为十份：

| 方法 ID | 帮助解决什么 | 使用已有能力 |
| --- | --- | --- |
| `persona-expression` | 用不同角色的节奏回应同一事实，不用套话、昵称或夸张替代具体关心 | 本轮已有角色配置；不额外读取私人来源 |
| `continuity-and-return` | 跨会话找回真实断点，复用有效成果，条件改变只重查受影响部分 | restore_collaboration、inspect_help、read_evidence、update_collaboration、inspect_action |
| `study-companion` | 沿用户自己的思路解释，保护最小提示/剧透边界，区分看懂与掌握 | 按需原文、记忆、事项、笔记入口 |
| `decision-brief` | 按本次目标调查和比较少量选择，指出条件改变会怎样改变结论 | 按需公开研究、校园/日程查询和有界委派 |

`quiet-initiative` 升为版本 2，增加期待的好消息、保护留白、提前准备返回材料、无需用户回复感谢的照应。技能仍是有版本与内容哈希的方法文本；可发现、可分页、可局部使用，不安装代码、不新增授权、不裁掉其他合法工具。实际连接和本轮权限仍由现有 resolver 逐项报告。

## 验证、剩余工作

已运行 `node --import tsx --test tests/harness/persona-portrayals.test.ts tests/harness/workflow-skills.test.ts`：12 项通过。覆盖角色选择、不同口吻、显式绑定、保留已编辑人格、错误来源绑定拒绝、版本与撤销、模板往返、外部卡隔离、技能发现/分页/连接状态及相同事实前提。

已运行 `npm run check`：通过。上述证据证明类型与确定性契约，不证明生产模型已能稳定复现角色。没有为此调用 DeepSeek、创建新的子代理循环、操作个人账号或制作前端页面。

后续需要在实际入口核对“换形象并采用角色”与“保留现有角色”的完整保存流程；真实模型需在相同事实、当前语气纠正、失误恢复和长期接续下观察角色区别。角色卡草稿 UI 与更丰富的原作参考也需要单独接线。源码实现、功能接入和用户感受分别记录，不互相替代。

## 复核用源码摘要

| 抓取文件（上游会变化） | 本次 SHA-256 |
| --- | --- |
| SillyTavern `public/scripts/PromptManager.js` | `b0054793b763d92b265f5f487645b68b4eca0867cb5ad6b5deb1034004b2c1cc` |
| SillyTavern `public/scripts/openai.js` | `0b77c30282825540265d5a09e681e5ccacf6760b05111ec880ffe237a9250604` |
| SillyTavern `public/scripts/world-info.js` | `111c7f47945839e75b021e09bdbb112a54f0a9b7857d2b95435f573efc7cd9a5` |
| Character Card V2 `spec_v2.md` | `e39e1da4f7a912c965af373846f4ac5c6cfb6207ea3fd5d542060905631acb46` |
| RisuAI `src/ts/process/index.svelte.ts` | `c752be30fa969b0344dae6f64a0d0afd285e182cfe0859913533619e1e8c39ad` |
| CoSER `README.md` | `bc283b8064412c1fb1e2d5497a77f2c89e33e01c19194b1ca76bf9c3abb6e406` |
| CharacterEval `README.md` | `46381530882dec2ef7abbb49d4860c6db5c52a04b2255ec74ab2db1f32902f4f` |
