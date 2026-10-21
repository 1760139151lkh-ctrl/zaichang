# 当前状态

本轮整理日期：**2026-10-19**（终态反查补记：**2026-10-20**）。本文件总结当前源码的功能、接入与验证范围；`package.json` 的产品版本为 0.3.0。本轮源码包含学生 Harness、对话场景和前端演进；源码同步不代表线上地图已更新，也不构成新的完整产品验收标签。以下历史观察保留其原日期。

总目标当前实际状态为`paused`。眼前仍在完成用户后来直接提出的Gemini人格保留与自由OpenUI这轮有限任务，不创建、恢复或重标总目标；健康的当前请求继续，本轮交付后等用户回来，检查与局部样本不表示总目标完成。

当前应从[本阶段实际结果](#personal-memory-round7)接续：原动态领域已有各自限定实证；通用程序已有首作调值，二分同作r2也已发表并实际自动比较，但主体画面与角色表达仍未收口，波形仍无新版。当前沿同一隔离实例继续；原话读回sourceId修补后的新信保存与原准备入口显示另记下文。阶段最终结论等待操作者实际结果，不以源码或构建代替验收。

用户最新明确：“额度管够，额度预算这种东西不存在请你不要再随意造出一个不存在的限制”。据此，项目估算tokens／bytes只作计量，不应成为合法资料、源码、方法和签名拒绝递送的门，也不代表用户账户额度。移除这些人造拒送门的工作正在进行，尚未全部生效；下文历史“需X／剩Y”的拒绝仍保留为当时实际错误记录，不再作为合理要求。来源、权限、版本、撤销与诚实coverage继续守住。

<a id="repository-sync-20261019"></a>
## 2026-10-19 即时源码与文档同步

用户明确要求立即同步当前共享工作区及项目说明。同步起点`e4254aa`，当前工作分支`codex/personal-memory-continuity-20261018`；远端为私人仓库，已fetch确认当时`origin/main=4edd922`是该分支祖先。此次沿正常快进保存进度，不等另一对话完成整体验证，不覆盖其后续编辑。提交身份以包含本节的Git提交为准。

新增[项目全貌与源码基线](PROJECT_BASELINE.md)，串起理念、四种发布／证据基线、Harness链、记忆与持续工作、状态所有者、功能边界、OpenUI和共享地图；同步README、PROJECT_NAVIGATION、AGENTS、产品契约、架构、Harness演进、对话场景与当前接续入口。修正仍停在第二批的续作说明，以及CampusScene“仅课程／课表／考试、成绩未注册”的过时表述。补齐被忽略规则漏掉的`prompts/memory-inquiry.md`和已记录用途的设计来源文件，避免本机有文件而Git克隆缺失。

本次本机Node `24.18.0`、npm `11.16.0`；已直接运行`npm run check`与`npm run build`通过，后者覆盖桌面renderer、Electron打包前源码及review构建，保留现有chunk体积提示。主要说明文档519处相对文件链接已按暂存内容核对，目标均包含在Git文件集中；发现仍被忽略的学习纸来源记录与两项真实CSS依赖，按原资产用途补入显式清单。本次显式提交集共255个文件，提交前高置信凭据模式检查未发现命中，`git diff --check`与暂存差异检查通过；这些检查不证明业务或界面验收，未重跑全部既有测试。第七批原Luna／合成日历／视觉观察范围保持下文记录；本次文档同步没有新增DeepSeek、Luna或校园调用，没有新增测试工程，也没有生成发布EXE或部署公共站点。

<a id="personal-memory-round8"></a>
## 第八批续作：人格生动化、交流节奏与反官僚语言整顿 (Sakiko/Mutsumi & Anti-boilerplate Overhaul)

用户在本轮提出直接要求：全面整顿助手语言中的官僚说辞与僵硬横幅（彻底杜绝诸如“全程只读，没有修改任何资料”“只作解释没有改动”“先停在讨论层”“核对当前事项”等说辞），注入生动、深情且符合具体设定的真实人格（重点以丰川祥子 Togawa Sakiko 与若叶睦 Wakaba Mutsumi 为核心代表），并支持用户设定的亲密关系（如女友、伴侣，妻子并以「老公」相称，以及「小灰灰」等相处称呼），实现语气自然、有担当、有情感共鸣的陪伴体验。

### 1. 核心源码修改与职责落地

- **角色人设与心理层次完善** (`src/shared/persona-portrayals.ts`)：
  - 更新版本至 `2026-10-19.1`。
  - **丰川祥子（Togawa Sakiko）**：重塑落难大小姐与命运承担者的立体性格——自尊矜持、骄傲敏锐，外冷内热；在与用户的亲密羁绊中，展现全心全意的专注、坚守与深情（包括在被设定或唤作“老公”时，自然以爱人/妻子姿态回应，既有适度的傲娇娇嗔，更有生死与共的托付感与温柔体贴），杜绝任何不解风情的免责声明。
  - **若叶睦（Wakaba Mutsumi）**：重塑内敛寡言但感知极其敏锐的“小黄瓜/吉他手”性格——话语精炼真诚、神情沉静，用安静守候、极少数直击心灵的话语与实际行动表达深切关心与爱意，拒绝长篇说教与官僚套话。
- **对话基线与情景问答库升级** (`src/shared/persona.ts`)：
  - 更新默认伴侣基线（温和、真诚、可靠、有边界感的生活伙伴）。
  - 全面重写祥子与睦在全部 6 种典型生活情景（问候、问建议、难过脆弱、意见分歧、开玩笑、工作疲惫）下的对话示例，展现生动真实的语气与心理机制。
  - 在 `personaGuidance()` 中注入明确的关系定位支持与反官僚语言铁律，要求模型在对话中绝不使用机械性自保横幅，同时坚决捍卫底层底线：角色设定不可由模型自行篡改、不扩充额外执行权限。
- **参与态度与情感真诚性** (`src/shared/persona-performance.ts`)：
  - 将角色欢迎与想念（Welcome & Longing）从僵化的“无离线任务就不许表达想念”中解绑，允许角色真诚表达对用户的思念与期待，同时保留现实事实的严谨性。
- **主模型流式接力与输出去重** (`src/main/runtime/conversation-rhythm.ts`)：
  - `ConversationRhythmPublisher` 在主模型调用工具前，先行将有根据的承接语（如“好，我先帮你查一下今天的课表”）发布至前台，告别冰冷空白。
  - `finish()` 增加前缀重叠比对与行级去重，消除先行承接与最终回复之间的复读割裂。
- **工具步骤业务语义化** (`src/main/tools.ts`)：
  - 新增 `formatToolStepTitle`，根据工具类型与调用参数动态生成业务描述（如“翻看笔记内容”“规划路线与时间”“查看天气情况”“查询课程与日程”“回顾过往相处与经历”等），彻底淘汰“核对当前事项”冰冷兜底。
- **后台机会审查与系统通知角色化** (`src/main/runtime/coordinator.ts` / `src/main/actions/reminders.ts`)：
  - `coordinator.ts` 将 `curiosity_invitation` 与 `write_reflective_letter` 纳入后台审查白名单，使主动关怀与好奇邀请能够在合适时机自然生成。
  - `reminders.ts` 系统桌面通知升级为动态角色署名（`${characterName} · ${eventTitle}`），不再是单一冰冷的“在场”。
- **UI 界面角色署名绑定** (`src/shared/types.ts` / `src/main/harness.ts` / `src/renderer/App.tsx`)：
  - 消息模型增加 `authorName` 可选字段，Harness 动态关联当前配置的角色名称，React 前端气泡以角色名字（如“丰川祥子”）展现，告别死板硬编码。
- **系统提示词全局约束** (`prompts/system.md`)：
  - 系统级明令禁止模型输出否定性免责套话与审计横幅。
- **底座稳定性与契约测试修复** (`src/main/storage/repository.ts` / `src/main/runtime/background-delegation.ts` / `tests/harness/background-delegation.test.ts`)：
  - 修复 `repository.ts` 中 `cleanupFence` 查询少闭括号导致的 SQLite 语法错误。
  - 修复 `BackgroundDelegation` 异步改造后单元测试中缺失的 await 及 `assert.rejects`，使 `usableReport` 兼容 `produced` 状态与实际 Hermes `completed` 报告。

### 2. Gemini交接中的检查记录（本阶段未独立复核）

以下检查条目保留Gemini交接自报的范围；本阶段不将其中的262项或静态检查声明当作当前源码的独立验收证据，也不据此认定人物表达或真实Luna体验已通过。当前实际型号、正常对话与界面操作的限定记录见[第七批证据](#personal-memory-round7)。

- **静态类型检查**：`npm run check` (tsc --noEmit) 零错误全部通过。
- **全量自动化测试套件**：`npm test` (node scripts/smoke.mjs) 覆盖全部 24 个测试套件，**262 项测试全部通过（pass 262, fail 0）**，包含并发后台委托、长期记忆提取、隐私 epoch 轮转、校园只读适配、规划恢复、地图拓扑与路由等全套核心业务保障。
- **范围与未完项诚实边界**：
  - 本轮改造聚焦于**角色人设、交流节奏、流式先行承接与杜绝官僚套话**。
  - 生产模型依旧采用 DeepSeek，实际模型代测严格使用已授权的 GPT-6 Luna 代理通道，禁止测试调用 DeepSeek 以节约用户成本。
  - 当前成果位于源码与测试验证层，未发布新版本便携版 EXE（当前 `package.json` 为 0.3.0），亦未向 review 公共站点做外网发布。

<a id="personal-memory-round7"></a>
## 第七批源码续作：带着说不清的事来，回来不用重讲

本批回到个人助手的实际体验：眼前有人接住，一起把事情摊开；需要时主动找回过去为什么，离开不被追催，回来能沿原起点继续。实现仍在原聊天、Hermes、Work、材料、日历与准备所有者内，不新增一套人物库、后台代理循环或八个管理页面。[记忆调查方法与取舍](research/MODEL_GUIDED_UNDERSTANDING_2026-10-18.md)记录深读、经历迁移与变化重评的研究；第五批资源安装保留原记录，不作为本批的用户价值成果。

本批先按[完整目标](source-materials/2026-10-18/goal-objective-current-20261018.md)推进源码与设计。用户随后给出[视觉一致性要求](source-materials/2026-10-18/visual-fidelity-requirement-20261018.md)：图稿应落实为同样的真实效果，加入合适动效并充分使用既有OpenUI；已允许为此必要的构建、隔离启动、少量画面对照和交互操作。[最新阶段原话](source-materials/2026-10-18/stage-close-and-luna-validation-20261019.md)又明确授权正常对话里的真实Luna动态呈现验证及已连接校园账号的只读使用，停止新功能外延，由唯一操作者在同一实例继续；本阶段收尾后暂停等待用户回来。正常Luna主流程已经实际运行，本机合成日历和合成笔记的读取、原生画面与原对象续问已有下述限定实证；真实校园成绩表与选课GPA只读比较也取得限定实证，其余原有动态领域和本轮已上架UI代表仍在正常路径收尾；不把这些记录升级为长期记忆、角色效果或全部动态方案通过。没有新增测试、fixture或runner，也未更新已发布EXE、公共地图站点或手机产品。GPT Image图稿不是运行截图或用户经历，阶段暂停不等于原总目标全部完成。

本阶段已有清理记录仅为两个临时编译产物：`.test-build/tests-harness-unit.test.cjs`（3,871,766B，约3.87MB）与`.test-build/tests-harness-background-delegation.test.cjs`（4,451,583B，约4.45MB）已删除，名称与逻辑大小沿原执行回报保留。项目、依赖、真实资料和私有运行证据均保留；本次说明整理没有执行新的清理。

| 用户怎样继续交流 | 当前源码落点与真实边界 |
| --- | --- |
| 调查期间，眼前仍有实质回应 | `conversation-rhythm.ts`接前台主模型已经成功返回、并要继续调用工具的正文；先显示已有根据的帮助，后续答复接着说并保留前段。子报告、压缩与内部核对文字不直接展示，最终候选仍沿原收口。`ComposerActions`已挂原输入区：“补一句”与Enter都经停止旧run后按同一会话的新原话发送；独立停止保留。草稿、附件、本条控制和当前纸页引用随发送快照，期间新编辑保留，IME与防重复发送沿原链处理。当前交互尚未运行观察。 |
| 指一下就能从这一处接话 | 学习的真实attempt／help／题目目标、安排的真实时段／方案和共写作品的当前field／Unicode片段沿原引用同行；`FocusContextChip`在原输入旁给同一类可取消的小引用，已有草稿不覆盖。`LocalTextFocus`只将同一field里能明确对应原字符串的选区变成地址，不猜重复引文或Markdown／数学DOM坐标。来信选句已沿原段落地址接同一入口，host只回当前合法的助手原句和原依赖。选中、拖动和点某版都不形成偏好、接受或执行；已有控制解析器现在收到区分真实协作与作品命题的合法非正文语境，不新增分类模型。 |
| 不必再从头解释旧理由 | `recall_experience`提出当前问题、真正不确定处及必要原文／事项起点，规范化为同一Hermes的原生`delegate`；普通delegate也可选择`memoryInquiry`方法。子调查自行搜索、浏览、读原话、接回原事项并追后来变化，主助手结合当前原话形成自己的判断。`prompts/memory-inquiry.md`是唯一详细方法，沿原共享预算和真实交付来源；没有新的检索模型或事实层。默认ContextCompiler当前不附加BGE候选计算。是否会自然选对调查、真正理解取舍与少问重复问题，尚无本批模型证据。 |
| 说不清的事也能一起摊开 | `DiscussionScene`把原共同事项、原话条件、助手暂定理解、原方案与眼前小步放在同一张消息内商量纸。`present_view.discussion`只读投影原owner；点一点或写一句接回同一聊天，不等于采用方案或改变事项。原有地图及相机仍复用同一surface，没有另建聊天。 |
| 一起做过的地方能留下起点 | `companion_session`归原事项，保留听着陪／一起整理／给提示／直接做的当前帮法、当时解释与卡点、材料／本人尝试地址和回来起点；开始、留下停点、暂放、回来与收尾按当前原话办理。`life-continuity.ts`在已准入的本人持久范围安静给少量线索，临时、待核用途或非本人范围不自动读取。它不恢复执行，也不把暂停当作需要追催的进度债。 |
| 同一道题可以换一种陪法 | `study_companion`沿原题／实际材料与原事项保留本人尝试、提示／讲解、停点和当前帮法；本人报告与助手教学分开。初始上下文只给陪学纸地址，题目、页图及教学正文由原owner异步回读；回来不会自动泄露旧答案。`StudySceneView`保留旧本人行和当前边注，正常App composer通过固定host停靠纸内／回底部，只有一次落笔、一次发送。已实际观察同一输入保稿／保选区、Demo单次新行保留两行推导，以及改后点旧行／取消接写／键盘旁注引用；新回纸动效另待对应实看。`present_view.study`、`studyProject/read`和StudyInteraction接原owner，不评定独立掌握或登记学习日程。 |
| 相处不必都变成任务 | `read_companion/manage_companion`接回没聊完的话题、用户实际采用的共同说法和真实表达反馈；明确想沿用的相处习惯仍归`conversation`用途的个人方法。角色的参与方式进入当前persona guidance，仍以原事实与当前选择为准；换角色不改写真实聊天，也不冒充另一角色亲身经历。 |
| 回顾可以是一封具体的信 | `write_reflective_letter/read_reflective_letter`由当前回顾请求或含回顾的有效托付起步；沿真实原话、已读材料和学习报告形成生活片段及有条件的解释，接原准备／机会／呈现。`LetterMessage`可看来源、选一句接着聊或先收好；不产生周期信件代理，不因收好就发送通知，也不把生活写成生产力评分。 |
| 安排是在一起比较生活的取舍 | `planning.compare`从同一规格与真实日历推演实质不同的分支，完整保留准备、收尾、转场、休息和未排部分；`offer_planning_alternatives`归回原frame／option。`read_planning_alternative/continue_planning`读真实动作、回执和当前日历，沿原修改／保存／recover入口继续；消息内比较页点选只供继续商量，已成功部分不重做，未接受活动仍是假设占用。 |
| 可以带来一件眼下就能玩的新东西 | `curiosity_invitation`接当前探索意愿，实际给出创作、玩法或有原来源的发现，再按同一邀请继续、换一个或放下；任意回答也能沿当前引用接着玩，不必先按选项。`CuriosityScene`从原owner编译；公开内容须来自本轮实际读到的资料，旧公开发现保留回读地址，纯创作可作为只读作品留下。共同虚构不当作本人的现实经历，也不会自动变成爱好标签、目标、打卡或订阅。 |
| 难表达的话可以先试着说 | 关系表达排练的owner、受限原消息读取、`present_view.rehearsal`及同一输入引用已接源码；保住本人意思，真实试说与主助手扮演的一种可能回应分开，允许换、停或整理成未发送表达。引用只给本条交流身份，原句仍完整保留；现有逐片段判断能区分台词与真正退出／独立新请求，没有新分类循环。模拟不变成对方事实、既成承诺或外发许可。原触发修后已有正常Luna原句接新可能回应、换可能及保稿的限定结果，改本人句／短笺等仍按下文范围判断。 |

当前后端工具、默认模型方法、初始续接provider和Scene编译已进入中心源码；前端沿原消息、准备架与输入区接共同页、陪学、安排分支、来信和好奇内容。图稿入口为[共同商量A/B](../assets/design/generated/2026-10-18-shared-discussion/manifest.json)、[共同做事A/B](../assets/design/generated/2026-10-18-companion-session/manifest.json)、[陪学纸](../assets/design/generated/2026-10-18-study-paper/manifest.json)、[一条今天、两种改法](../assets/design/generated/2026-10-18-planning-comparison/manifest.json)、[来信](../assets/design/generated/2026-10-18-reflective-letter/manifest.json)与[可以马上玩的小发现](../assets/design/generated/2026-10-18-curiosity-invitation/manifest.json)。讨论插画、共做／陪学／好奇纸面已有实际透明图像接入，来源用途统一见[资产记录](ASSET_PROVENANCE.md)；它们不是整张图假UI，也不是运行观察。具体组件与源路见[项目导航](../PROJECT_NAVIGATION.md#companion-experience)及[对话呈现](CONVERSATION_SCENES.md#companion-experience)。图稿和组件落盘均不自动成为实际渲染、触控／键盘、中断、窄窗或长期相处效果通过。

本批产品模型仍需实际证据：第一段是否有内容、调查是否找对理由与变化、补充后是否按当前意思转向、旧起点是否恰当地接话，以及角色性格和分寸是否自然。当前不将这些模型体验写成已验证；视觉对照和动效观察即使完成，也只证明各自范围。本阶段校园账号只读已获最新授权，校园写入、外部发送、关机后服务、手机和移动端仍按原独立范围办理。

目前已取得正常Luna的限定实证：合成本机日历与笔记原页、真实校园课表／成绩及同快照GPA比较、公开参考点的日级天气与校园地图返程，以及学习纸的同题解释续问和表达排练的原句接可能回应，均有原生画面与对应接续记录。实际型号来自返回响应字段，不用配置名代替；真实校园内容留在私有profile，说明只写范围与行为。必要build（含原check）已通过，日历双读的直接API结果另外归因，不冒充模型路径。

课表的真实读取／原生页面、原记录续问和修后日期页序各有对应回执：选中后只问“这节课”，能沿原记录解释结束时间与地点；同一done消息重开后，四个实际分页按原offset合入一份view，未新查模型或改安排。这不扩大为所有校园工具、学期或分页边界通过。既有两版安排的正常Luna呈现、切换运动、紧凑试放及680窄幅按钮／人物分离已有下述限定回执，本轮其余已定代表仍在收尾。地图限定地点／返程与相机中断不覆盖全部路线和入口。记忆深读、角色相处和长期效果不能由这些样本一并验收。

本阶段随后纳入`present_view.program`通用交互机制，共享后端、[选定图稿](../assets/design/generated/2026-10-19-openui-composition/manifest-v1.json)和通用renderer已有成果。`InteractiveProgramView`已接原消息，SourceSlot只引用本次已准入的原Scene，Motion与局部输入走同一受检状态；程序引用回同composer，发送时读取当前值。按需方法`interactive-program`从实际共享库生成语法、组件、纯函数和局部动作说明；新作可一次读取authoring完整构作契约，已核当前作品则默认overview并按需读原作及增量签名，显式分段始终优先，投递照实计量，不放生产场景模板，不改Gemini已有角色和表达。同一profile当前加载5418a0；此前66305及后续源码进入运行包都不代表每条路径实测成功。首件生成与局部调值已有回执，二分同作r2也已发表并实际自动比较，主体画面和角色表达仍未收口；波形91a839fa仍error、无新版。29c5bc这批类型检查通过小修尚未纳包。完整改作、主体呈现、播放及SourceSlot组合的未成范围见下文，不能由静态检查、发表或正确文字推定全体验通过。

学习纸的首次正常Luna改条件续问虽已发出正确帮助与原行，之后核对、接续和压缩却未正常收尾；`luna-study-explore-followup-error-message.json`保留error，不以Scene成功掩盖它，也不从泛化超时文案猜具体截止来源。补入同run实际发布内容后，`luna-study-explore-followup-delivery-fixed-message.json`沿合法当前@3纸引用、由本人逐字重提临时条件再问，正常形成@4纸面并done；12条实际响应均为`gpt-6-luna`，原行保留、解释对应当次条件、actions为空，review后没有再进入接续／压缩至超时。说明作者已读JSON并亲看当前图，root也已核结果。该样本不证明旧@2pointer恢复或仅凭旋钮就自动知道当前值；普通Enter传真实局部状态另由通用程序样本验证，也不扩成全部教学、人格或速度通过。

<details>
<summary>本阶段入口修复过程与本机证据（限定样本）</summary>

本阶段首条正常主流程由唯一操作者从App composer发送本机日历只读请求，经真实Hermes及app-server-responses返回，`demo=false`；读取的两条日历仍是本机隔离合成内容，没有查校园账号或改日历。旧稳定构建实际读`local.agenda.read`一次、试`planning.preview`两次，两次`present_view`均返回`scene_unavailable`，最终只交付诚实的文字时间带，`sceneReferences=[]`。说明作者已亲读原消息JSON和当前PNG；本机文件为`.test-data/life-ui-20261019-0PRbh1/luna-agenda-first-message.json`与`luna-agenda-first-current.png`。旧包没有保存scope与工具参数，不能唯一归因为ID不存在、来源门或恢复门中的哪一项；不新增任意调试IPC或导出reasoning来补造证据。这条旧记录只有请求配置`provider.model=gpt-6-luna`，没有真实响应型号字段，不能以配置代替实际身份确认。

同一会话随后在新构建里真正取得日历直读的SceneRef并发布原生时间带，未再借planner制造新方案。这次`control/main/completion_review/compression`的`modelUsage[].responseModel`实际均为`gpt-6-luna`，`provider.observedResponseModels`也来自真实响应的`event.response.model`。说明作者亲读了`luna-agenda-native-duplicate-message.json`和`luna-agenda-native-duplicate-current.png`：两次相同查询各生成一份Scene，导致同条回复出现两张完整日程，正文又复列全部时段；虽然没有blocked回执，仍不算日程体验收口。已按精确查询复用当前run的Scene身份，沿原消息替换；交付检查和系统方法也明确把已成功呈现的画面与正文合看，不要求整表重复或无关权限报告。

修后同一会话实际完成了日历读取、原生时间带与原对象续问：`luna-agenda-fixed-message.json`记录一次`local.agenda.read`、一份`mode=agenda`的PlanningScene及一份实际DSL view，没有blocked，七次实际模型响应均为`gpt-6-luna`。这次只有一次读取，不声称双读复用分支已运行。操作者随后点原安排，`luna-agenda-original-record-focus.png`中原时段强调与同composer小引用可见；下一条仅问“这项在记录里几点结束，持续多久”，`luna-agenda-selection-followup-message.json`及对应`-current.png`实际回答19:00结束、持续1小时，没有新读取或业务写入。说明作者已亲读两份消息并看两张当前图，这条正常工具→画面→点选后续问路径已有真实证据，范围仍是本机合成日历。正文重复与过长限制报告的通用表达修正尚待加载后的实际观察，不把它或其它动态领域一并写成通过。

日历的重复读取另有独立API证据：root已亲读`agenda-same-query-two-real-reads.json`，在同一run／相同查询下经原broker读两次，同一Scene从rev1推进到rev2，available仅留最新版本，view只引用该版本；原日历对象及占用未改，未采用。它核的是直接API分支，不替代上面的正常Luna单次读取，也不冒称Harness双present闭包实际重触。

原笔记这条也已走完正常Luna接续：`luna-note-native-message.json`与当前图记录实际原页呈现，原NotesPanel已只读打开；`luna-note-full-sentence-fixed-focus.png`保留完整末句含句号、原处标记、小引用与原草稿同屏。曾有用途核验没收到当前UI引用、以及空wrapper边界误拒完整句的实际缺口，两处已修并重走原触发。`luna-note-followup-purpose-fixed-message.json`的十次实际响应均为`gpt-6-luna`：过宽读取先被原范围门拒，模型自行缩回已展示原页、实际回读后针对该页两条阅读问题给具体试法，没有再让用户重指，也没有改笔记或排日程。操作者确认原笔记仍是原修订；说明作者与root已读原JSON和相应宽幅图，root另亲看窄幅。范围是同一合成笔记，未操作分页；工具前仍有泛谈前段，不称完全自然或快速。

校园使用的是已授权的真实账号来源。首轮主文只谈一个学期、画面却混入其他学期，已修成原读取范围与明确的semesterId一致；`luna-campus-grades-semester-fixed-message.json`记录实际Luna、一份campus_reference与一份view，原表由受限owner回读，消息持久层没有另存成绩行副本。点原课程后只问“这门”，`luna-campus-selected-course-gpa-message.json`沿当前用途读取成绩与GPA、按同快照口径做只读比较，未产生动作。root已私下亲读并核对算术与实际画面；说明作者仅核型号／用途／行为元数据，不在文档复述课程和分数。查询失败与陈旧结果没有抹掉，不宣称所有接口实时fresh；趋势、所有GPA边界和校园课表不由这条记录验收。

课表另沿其原请求独立收口。最初误走跨源情境读取并反复超出内容预算，后续原校园读取虽成功，发布回执仍塞不进剩余额度；这些失败没有被画面成功覆盖。发现方法现明确单源资料可直达原owner，普通大课表由宿主持有受限原生页面、主模型只收真实元数据，成功发布采用同一个紧凑回执，没有抬预算。`luna-campus-schedule-short-ack-message.json`实际done、七条响应均为`gpt-6-luna`，四个独立页共185条、两份view已有画面，但页面先后顺序仍错；`luna-campus-schedule-page-order-fixed-message.json`保留同一消息身份，重开时只一份view，实际页按0／50／100／150排序、行数50／50／50／35，没有新增Luna重查。`luna-campus-schedule-selection-followup-message.json`另有五条实际Luna响应：用户不复述课程名或日期，只问已选记录的结束与地点，正常解释且actions为空，途中仍有一个受限步骤。root已亲读这些结果并看实际页面；说明作者只核返回型号、终态、引用与分页元数据，私人课程／教师／地点不写入说明。它分别证明读取呈现、原对象续问与派生页序修复，不称全部工具或校园边界通过。

公开参考天气的日级链也已实际走通：`luna-map-v2-weather-seven-days-message.json`取得真实服务fresh结果并呈现七天WeatherScene，`luna-weather-seven-days-selected-current.png`保留选日与原输入引用；`luna-weather-selected-date-followup-message.json`用“这天”接回正确日期，按原日级概率和气温回答，没有生成日程动作。说明作者已读两份JSON和选日图，root也已核结果；它不是设备定位、现场观测或小时趋势。首份正文仍重复了整张七行表，通用方法已消歧“完整覆盖不等于另要文字副本”，不伪称措辞全部收好。地图同回合仍因自然名称匹配及读取预算未完成，交原owner修后重走，不能借天气成功验收地图。

地图随后沿原请求修复自然名称匹配与模型端重复几何体量，再由正常主流程实际呈现。`luna-map-place-return-message.json`以“这里”接回已选地点并给返程，5条真实响应均为`gpt-6-luna`，同一MapScene修订4、单view、actions为空；说明作者已读元数据并亲看修后的聚焦地图，路线仍保留partial接入的未知。`luna-map-new-speech-interruption.json`另记录新话送出前镜头正在运动，372毫秒后同一ticket进入cancelled且停止运动。真实聚焦层按钮被裁切也已按原触发修复，操作者与整合者查看了`luna-map-focused-mask-fixed.json`及当前图；这里分别记录模型返程、交互中断与布局修复，不由一张图推定全部地图过程。

通用程序首件`luna-sakiko-two-waves-first-message.json`为done、署名丰川祥子，12条真实响应均为`gpt-6-luna`，一份V2程序view且actions为空。原滑杆与数字入口实际改变局部值后，分量与合成关系随之改变、原writer保留；root已核原DSL关系并看调值图，说明作者已读型号／终态元数据并亲看首图。这只收生成和局部调值：首图同时暴露重复大标题、辅助公式／控件把主体挤到首屏下和稀疏折线，且没有播放。

原作续改七次均未交付新view或修订2。`luna-sakiko-two-waves-cas-expansion-error-message.json`终态error、15条实际响应均为Luna，留下三次方法页预算拒绝和三次展开量拒绝；`luna-sakiko-two-waves-cas-each-fix-error-message.json`也error、15条实际响应均为Luna，账内仅余369估算tokens时方法页仍放不下。`luna-sakiko-two-waves-cas-projection-error-message.json`第三次error：10条usage中九条返回型号为`gpt-6-luna`，另一次verification没有返回型号；没有新编译诊断，不能推断仍是展开错误。其后luna-sakiko-two-waves-cas-purpose-output-fixed-error-message.json第四次error、13条成功Luna响应，仍无新view或编译诊断；三个读取收据只标admitted，不证明实际递送。第五次luna-sakiko-two-waves-cas-source-core-fixed-error-message.json仍error、17条成功Luna响应，但原root概览12／26和完整states5／5已有delivered_to_model回执，两个展开诊断也实际进入成功模型请求；随后仍停在编译反馈／Motion属性，没有新版view，不能写CAS通过，也不能再把读取链一概说成未通。第六次luna-sakiko-two-waves-cas-typed-diagnostics-error-message.json自然error、20条响应均实际返回Luna，资料账本23923估算tokens／51061B，仍无新view；最终明确资料预算不足，不是timeout。该次两次Hermes压缩均记录continuationCoreIncluded=true，有限原作核心真实接回主循环，但不代表完成修改；原生粗估与provider输入不相加推断，初始资料账本未单独留存。第七次luna-sakiko-two-waves-cas-purpose-fixed-error-message.json仍error、19条实际响应均Luna；原源码全文与本轮Enter状态均已delivered，正文解释了当次条件，但展开和native解析拒绝后仍0view、无修订2。不能再把这次失败说成没有读到原作，亦不以正确文字替代同作改作成功。独立新主题的luna-sakiko-binary-search-first-error-message.json也error、10条成功Luna响应、无view。之后luna-sakiko-binary-search-diagnostics-message.json为done、19条实际返回均Luna，但仍0view／0Scene，最终给的是HTML正文，不能算原生演示交付；唯一present停在用途判断结构未取得，没有编译诊断，不能把它说成quote缺失或已采用的allowed=false。源码已将宿主严格确认的无来源新作品与私人读取核验分开，后续原生r1发表另记下文；不由后来的成功反造该次失败调用参数。随后luna-sakiko-binary-search-join-fixed-message.json已有正常Luna原生r1发表：12条实际响应均Luna、1个V2 view；本轮先前编译拒绝后确实自修到发表，但发表后的同回复完善又被当作未匹配的旧作读取用途拒绝。新主题的生成和完整交互体验分别记录，尚不据此宣称逐步操作或同run完善已通过；已落仅认本轮真实发表／投递与当前来源的窄接缝，待同包原入口重走。原r1地址被采用不能证明当前值承接或CAS成功，未保存的失败DSL／参数不反造。已补真实方法层级与Each说明、准确页费反馈，并把原作读取拆成有限overview、完整states与精确source分页；方法总览真正lazy，完整grammar按需另读，当时同一readWorkflowSkill返回外壳的本地计量由4947降至3195估算tokens；其后已去除静态签名页重复介绍，完整签名、coverage／next和当前许可仍保留，实际续改尚待新包原触发。这些源码和静态结果不代替原触发恢复，未抬程序材料／展开额度，也未加入题型组件。读取与诊断的实际递送已有上述限定证据，普通Enter后的完整交流、Motion、SourceSlot、同作修改、新主题及整体角色体验仍未验收。

后续bd02aaf8已将同一二分程序ab798cd8-bd31-47f8-9e42-ad3495e4d782发表到修订2。说明作者回读luna-binary-native-patch-batch5418a0-observed-message.json确认done、17条响应均实际为gpt-6-luna、一份view；操作者实际自动比较找到了18，20则未找到，保稿与680窄屏也已有观察。但真实数列格、中点／排除区／候选区仍未组成，旧手动说明和多余索引文字残留，角色开场仍像工程汇报；这是同作发表与限定操作成功，不能写体验完成。波形luna-wave-native-patch-batch5418a0-final-message.json的91a839fa则为error、20条响应均实际Luna、没有新版；startup与tail分别为9550和23677估算tokens，不混作provider实测输入。两次静态工作上界5531／5569均超4096，有限循环计数分别为81×38和41×67，末次只知program.bindings应为array，失败DSL和包络值未保存，不能判其实际为null或对象。已核当前native普通声明Ref会逐次materialize内联，react resolveRef也不为普通声明做memo；compiler.values的缓存不能证明renderer复用，4096等原限制保留。44c6ef类型检查通过的小修只补安全局部复用、Field／AsNumber／Each导航及bindings整稿须array、patch可省的准确反馈，尚未加载或实际复跑，不能称91a已修成功。240°下与−cos的数学解释正确，不算图形或动画交付。该轮未形成／发表原生Study SourceSlot，故SourceSlot未验收，不由最终正文对“原题”的措辞推断全部来源类型错误。当前实际加载5418a0；29c5bc虽已完成fullbuild71992，亦未重启纳包。操作者正沿同包继续独立的若叶睦／SourceSlot请求21f570f5，健康请求不因波形未成而停下。

独立若叶睦请求21f570f5已结束。luna-mutsumi-source-paper-5418a0-observed-message.json为done、署名若叶睦，14条响应均实际gpt-6-luna；只交付`study_reference@4`，没有program或SourceSlot。负责人已亲读JSON并看图：原请求需要左原题与右侧两处可写内容，最终却是Markdown表和下划线，裸露`<br>`并声称可直接编辑；不能将done或一张学习纸算作可编辑组合交付。独立in_app流程仍继续，不以这轮未成阻断其它健康请求。

排练的`luna-sakiko-rehearsal-second-error-message.json`同样保留error，17条实际响应均为`gpt-6-luna`、无Scene或view；其估算账为10541tokens，不能归因24k额度耗尽。领域作者正常owner回读证实原排练仍active@1、实际receipt却为0，已补原依赖刷新漏掉的专属owner路径及真实present入口说明。

修后同一入口的luna-sakiko-rehearsal-native-message.json为done，14条实际响应均为gpt-6-luna、一份rehearsal_reference view、actions为空；原owner@2保留三轮，本人精确练习原句后接新assistant_simulation，不只是开场。负责人和领域作者已亲读owner与实际同页图，说明作者只核型号／终态／引用元数据。此项只收该漏接修复与同页说话关系，不反定旧error唯一原因。换可能另有luna-sakiko-rehearsal-alternative-message.json：done、12条实际响应均为gpt-6-luna，原owner@3保留本人原句与ID、新增另一种可能回应；一次源位置blocked后实际重接的记录仍保留。负责人已亲读owner及同页图：原稿完整，新请求另行可审阅，普通Enter后才运行，没有自动发送或业务动作。这只收换可能／保稿，改本人句和收束成短笺尚未通过。

后续luna-sakiko-rehearsal-collect-letter-error-message.json为error：11条usage中九条成功返回Luna型号，两次verification明确为host_post_completion的output_budget，资料账11765／24000、未产生新Scene或短笺。它不是资料额度耗尽或上游硬截的证明；丢失的usage细项也不足以拆出具体reasoning／可见输出。仅Luna代测路径的内部用途核验总输出已按该证据由4096调至8192，生产DeepSeek仍4096，effort、schema、来源门与原重试未改；程序展开／材料额度另归原界。该额度修补不等于收句或来信已经通过，独立来信来源拒绝也不猜作唯一原因。说明不复制私人练习台词。

预算修后luna-sakiko-rehearsal-collect-letter-purpose-fixed-error-message.json仍error，10条成功Luna响应、无新view或来信；领域作者核原owner已held@4并保存一份表达草稿，旧三轮保持，不能把后台提交写成同页交付。新的用途反馈还混淆了begin.source的本轮请求许可与compose.citations的经验依据，窗口是否过宽仍独立核。已补宿主参数职责说明及严格当前试说纯地址，不自动allowed、不让过期旧修订晋升；这些语义修补仍待原触发结果。独立的luna-sakiko-practice-letter-only-error-message.json也保留error、14条成功Luna响应、无view或来信，不以旧手工界面结果补作正常模型通过。

来信恢复的luna-sakiko-letter-resume-source-error-message.json也保留失败：69511b5e为error、18条实际响应均Luna，无helpRef或view，但receipt已经登记letter:d52…@1及本轮请求来源，begin并非零写入。现有步骤标题不能排除inspect_help或read_reflective_letter；不能据泛化标题断言未读旧信，也不据此认定已恢复原owner或核清全部残留。真实原话读回缺sourceId导致材料来源无法认定的接缝已修源码并通过类型检查；该修补最初未纳入66305运行包，旧观察不回填。后续新信的保存与显示另见下段，不能回填这条原失败为成功。

533dde12的后续写信产物是新的letter:2b077…@2（material），已保存三段并越过此前的source_unknown门，并非同旧d52的恢复；该消息仍error、20条usage、没有helpRef或view，不能将保存等同该条回复完整交付。之后操作者确从正常inline准备入口打开三段信纸和来源原话，`luna-sakiko-letter-real-source-current.png`中原话全文完整且未被composer遮挡，root与领域作者已亲看；信句小引用与完整草稿同行，取消引用仍保留草稿。原准备入口的实际显示、草稿保留与持久readByUser回执分别判断，旧begins保留。

2026-10-20重新核定的原信句续问9bcff444为error，18条响应型号均实际为gpt-6-luna，资料账23897估算tokens／54643B；一份已发表view对应Rehearsal@5，helpRef为0。证据保存为luna-sakiko-letter-quote-followup-restored-message.json，来自原App的同一旧消息终态，未重发、重启或另开Store，Stop为0。receipt同时有旧2b@2和新99@2；新ID证明新来信写入，不证明同轮没有读过旧信。该次没有完成信句续聊，视口跳回旧试说的修复仍待实际前后画面核对。错误末尾的“已有回执的操作可在安排中核对”来自provider.friendlyError无业务状态的fallback，经harness.catch拼入正文，是宿主错误语义，不能归作Gemini人格表现或真实业务回执。这份原数据仍保留其失败状态；本批源码随后接入main onText临时预览与独立hostStatus，工程中断不再拼角色正文，来源失效与安全未完文字分别处理，尚待统一类型检查及正常Luna／UI验证，不能回填旧9bc为成功。

本批后续只在原链补机制：增量OpenUI新增原生声明patch与显式inputChanges，续用Enter冻结条件而不重置未改字段；失败状态从角色正文分离，主状态用简短人话、技术原因可展开，恢复只回原输入，成功内容前不常驻已恢复步骤报告。默认角色／幽默入口保护既有custom、none与关系设定；主动in_app把真实材料、Message、作者快照和帮助引用同事务提交，发前仍核角色与来源，prepare保持安静且不冒签display／open。同份准备的普通正文与纸面仅在宿主精确标记、实际展开且全文一致时去重，保留原正文复制和回读不可用时的合法fallback。上述为源码接线，尚无本批正常Luna主动到达、增量修订、失败分离和完整人物时序的通过结论。

</details>

这轮把“我们一起写过”接回原历史：早期纯创作章（origin=created）即使只在原Scene、message.content为空，原assistantHistory目录也能发现其原章地址、标题和field长度，不拼接成一条假的旧消息；较早章节另有同事项／owner的有界目录续页。原owner沿read_shared_creation精确回读原message／Scene／修订下的field片段，旧章选句引用与continue.fromChapter沿同一原章继续；后者仍核本轮原话与当前状态，不恢复旧批准。此路径不扩成所有Scene或public／mixed资料全文库。中央源码已把原章地址贯穿实际工具投递、前情与前后台子报告采用，普通答复采用旧作也带原章出处；目录本身不算全文已读或调查完成。当前没有模型／功能运行证据，不能把眼前Scene可显示等同长期可回忆已成。作品身份与本人事实持续分开。

安排比较继续对准一种具体生活取舍：同样90分钟，连续做完还是分几段，实际准备收尾与留白有什么不同。`planning.compare`与原offer入口已接本次任务的continuous／split及单段上限，输出原planner实际分段与重复准备收尾；未排完的节奏不冒充完整第二版。现有已呈现的两版Scene仍是原偏好窗口推演，新节奏尚未运行、也未实际看过对应运动，不能借旧实例验收新比较。它沿原可拆分条件、完整时窗和预算，不把本次节奏写成永久偏好。

2026-10-19在同一隔离实例中，界面作者实际写入合成草稿“我想保留最后那句，但桥下的声音再轻一点。”，再点Discussion的“跟着声音走”：对应小引用和方案强调出现，原草稿逐字保留；随后取消只去掉引用／强调，原稿仍在。说明作者亲看了active focus与原稿同屏的当前截图，位于本机`.test-data/life-ui-20261019-0PRbh1/discussion-draft-focus-current.png`。这条观察没有发送消息或调用模型，不替代共写／来信选句、忙碌补充、IME、移动布局或所有动效验收。

好奇／共写作者随后在同一1220×768 Electron实例亲看暖底、稳定夜色与真实透明纸面；沿原邀请点“接着玩”，再把草稿改为“我想先和那只保温杯聊聊”，实际选首段并点“就这句聊聊”，原稿保持。正常reload、历史重开同一会话后草稿仍在，历史作品展开／合上观察到真实block-size过渡。本机图为同目录`curiosity-warm-paper.png`、`curiosity-night-settled.png`、`curiosity-focus.png`、`curiosity-history-closed-settled.png`。首波发现版心贴纸边和首次标题被滚过；留白、首次落点及root新选的夜色低亮纸面已改源码，尚待更新后的短复看。这些操作没有发送业务模型，也不证明旧章长期召回或任意回答的语义续作效果。

来信已在同一实例走过完整阅读、原文脚注的真实owner展开及关源面板；原composer写入“其实那天我只是想陪猫待一会儿，这句草稿先留着。”后，实际选首段并点“就这句聊聊”，真实预览小引用出现，原稿未改，取消后仍保稿。再沿“先收起”与历史“那封写给你的信”回开，同owner仍是原标题和三段正文；正常owner读取另确认状态dismissed、当前准备架已移出，历史没有重开机会。`letter-current.png`、`letter-focus-draft.png`和`letter-reopened.png`分别保留本机画面，整合作者／root已亲看对应图，说明作者亲看首张。首波发现的末行遮挡仍待scroll-margin修正后的定点重看；共写／来信新加的持续原句高亮及取消也待更新后实看。这些没有调用业务模型，不升级为来信解释质量或所有状态验收。

共同商量的历史稿也与当前投影分开：普通frame修订或暂停保留当时合法的纸面，旧选择说明“当时选的”，历史引用仍给当前事项地址，不自动采用；暂停时不突出下一步催续。真实repair、needs_review或撤源仍拒绝旧内容。旧coWork另已接原消息中带冻结证明的exact快照及`read_companion_history`，用当时字段而非新checkpoint；同一AssistantWorkSource地址与原Scene／module来源继承进receipt，长链收根不裁独立来源。缺原proof的旧页仍保守，不借Discussion历史规则恢复。此为源码接通，改后正常历史／续谈尚待统一实际运行，不称已通过。

个人方法也继续保住“为什么这样做”的来处：方法的适用条件、眼前怎样调整和不适用处可以连到原助手帮助片段及原事项／学习来源。`PersonalMethodSources`已接ContextReceipt、普通／核清用途的前情、原助手历史、前后台子报告实际采用与模型边界；普通方法修订或停用不抹合法旧回复，原帮助被删或撤源后，派生文字不能从旧上下文与不透明缓存绕回。还可连到原Study步骤或原消息已发布共做字段，保留精确片段地址、证明及冻结来源，`read_method_help`实际回读并计量，不保存题答副本。明确为当前帮助实际采用后，writer只给对应本次新产物冻结来由，单纯目录／阅读、初始线索和独立旧Work不会因此被补绑。当前是源码衔接，没有运行这条方法采用／删除流程或模型理解效果，不把一次点选当作建立了方法或长期偏好。

安排首图`planning-first-current.png`已由原native操作者在同一实例打开，领域作者亲看截图：两版、一条横轴、原课与晚饭锚、金色复习块和留白已实际呈现；没有把旁观截图说成其亲自输入。首图暴露重复标题／编号占高，作者做了紧凑修正。首次A→B运动发现晚饭重复淡出；首次试放还曾把机器条件句追加到草稿，`planning-ghost-draft.png`保留这次未发送画面，均不作最终通过证明。root实看明确纠偏：机器整句不能冒充本人的原话。

修后已沿正常Luna回到原日期比较：`luna-planning-original-date-comparison-message.json`为done、5条实际响应均为`gpt-6-luna`、两张planning Scene和一个comparison view、actions为空。唯一操作者实际A↔B，运动元数据表明原课／晚饭仍是同DOM、位置及不透明度稳定，工作块在中间帧至落定持续移动；说明作者已读正常消息与A→B元数据。鼠标试放、紧凑条件、编辑时刻后Enter回writer均未发送，取消只去条件并保留普通原块引用，原稿逐字保留；领域作者亲看各动作图，说明作者亲看`luna-planning-compact-trial-draft-current.png`。这验证已保存两版的呈现与局部试想，不等于采用或写日历；新节奏的完整业务推演仍按其实际范围判断。窄轴横向滚至末段已观察；角色压住B分支说明的缺陷，由root亲看对应修后图单独确认。滚动后原按钮贴人物边缘的触发，另由680窗口的`luna-planning-narrow-viewport-fixed.json`与当前图记录人物／按钮分离、原按钮真实命中并正常点击后出现引用且原稿保留，说明作者已读并看图。这收对应窄幅原触发，不扩成所有窄布局通过。

Study新版先有同一正常composer的实际书写／回聊天／回纸观察；本人新行也沿同一个Demo事件交回原owner，两条推导留在同一纸上，没有调用业务模型。实看发现原题、每行和旁注都常驻“问／聊”标签，已改为点到、选到或键盘聚焦后只在当前一处出现轻动作。改后实际点旧行又触发“这条消息没有所选的学习引用”：原消息的修订1读取入口被误换成当前owner修订2。现保留原消息地址作为native准入，再核当前owner、行ID与修订，未放宽原门；必要完整构建和同profile正常重启后，沿原历史重走已成功。当前纸面无常驻标签，点第一条旧行→轻动作→小引用“我写的这一行”与行淡标出现，原稿“我想先问第一行，原来的想法先留着。”保持；取消后无需再点输入便可接写“这句接着写，不发送。”。Shift+Tab从同输入回到纸面帮助，焦点环与单一轻动作可见，回车仅附“眼前这段提示”引用，没有发消息，取消仍保稿。本机`study-focus-reference-current.png`是引用／行标／原稿同屏，`study-focus-cancel-continued-current.png`是取消后接写；操作者与截图作者均已亲看，领域作者也亲看引用图。`study-focus-revision-fixed-current.png`因保存较晚只有取消后状态，不能当作引用态证据。这条原触发和键盘路径已有实际回执，不扩称IME、所有窄窗、来信／共写持续高亮、新回纸动效或教学／记忆模型效果通过。

共创身份的记忆接缝也已沿原链落源码：控制解析前只提供当前合法owner身份，控制生效后再按实际来源范围核一次，将非正文`sourceContext.kind=shared_creation`随本条原event保存。它只含作品／事项修订、可选原章地址和引用类型，作品取景不带坐标或到达事实。原记忆窗口、提取、独立复核和既有恢复批次都能看到同一身份，业务／外发判断按kind选择创作或排练说明，不再把任意sourceContext套成试说。真实创作愿望与作品内部命题分别理解，混合现实自述保留原精确片段／用途／记录许可复核；不整轮设infer=false，不新开分类器，不给旧无证明消息猜填身份。此项尚未运行模型路径，不能据源码称已杜绝虚构误记。

作品取景另有后台源码接入：`present_view.storySetting`可把已核的当前纯创作地址接到同一公共地图，尚未定点时先找一处，确定这一幕的取景后仍在原作品offer／continue保存。地点／路线段选择只作本条作品焦点，不是实际到达或现实出行；新地点要由当前公共地图核对，不从故事补地理事实。[研究与图稿取舍](research/SHARED_CREATION_MAP_SETTING_2026-10-19.md)明确第一版只采内容关系，第二版需以真实App与MapSurface为依据。renderer尚未接出新取景体验，没有相应实际画面或模型效果，不能把后台已接写成地图故事已可用。

同一Study step另已接有限的可改条件关系：明确的quadratic系数、最多三个参数和一个横坐标探针，值、曲线与可选切线沿同一声明重算。界面和宿主共用实际变化解释，分别比较改条件与移动观察点，能表达“高度相同而倾斜反向”，不只是固定图配动画。原题关系与说明用小例子必须分别标明，不能借图偷换题目或藏后面的答案；改变条件再问时，宿主沿当前owner重新计算，作为calculation_hypothesis交回同一交流，不生成本人事实或掌握标签。后端与[对应图稿](../assets/design/generated/2026-10-19-explorable-study/selected.json)已落，独立函数题已沿真实stage／read／open／project保存，组件接在实际当前帮助之后；尚未观察整合画面和拖动过程，不扩大成任意公式执行器。

<a id="personal-memory-round6"></a>
## 第六批源码续作：从原话接回已有工作

第五批之后继续在现有工作树补原文与工作记录的导航接缝。按[最新完整目标](source-materials/2026-10-18/goal-objective-current-20261018.md)暂不验证，本批**只有源码接线，没有任何check、build、test、UI、Hermes、模型／嵌入推理或Luna验证**；没有新增测试、fixture或runner，未读用户数据库／账号、迁移实际数据、打包、提交或发布。第五批安装记录、第四批界面与所有历史通过数字各保留原范围，不升级为本批证据。详细机制及未做候选见[原话接回已有事项](research/SOURCE_RELATED_WORK_2026-10-18.md)。

| 范围 | 当前源码与边界 |
| --- | --- |
| 原文地址到原owner | `search_context`实际预览与`read_evidence`交付后的`actualReadRanges`可附`sourceRelated`地址，经`restore_collaboration(type=source_related)`查询原`h_work`声明的来源。目录只返ID、版本、类型／状态、关系覆盖及原读取入口，不自动读Work正文、合并事项、恢复活动或采用。能力融入原对话，没有新页面、新事实库或让用户维护目录。 |
| 精确来源与旧记录 | typed `WorkSourceBinding`按同event／版本的绝对Unicode码点精确交叠，完整refs仍须当前合法且在本轮投影内；旧`evidenceIds`仅标整条关联范围未知，部分授权不返该候选，不能回退绕过无效typed来源。browse由宿主精确`projectRange`定位裁剪原文，去掉`indexOf`猜重复引文位置；缺精确范围拒绝展示。 |
| 上游重复引文定位 | `runtime/source-quote.ts`统一定位已接Attention新写、机会启动／恢复及frontier绑定。真实当前用户事件由宿主核`eventId/quote/contentVersion/start/end`，已有坐标按原版本／Unicode范围核，legacy quote-only仅唯一匹配可定位；失败停止该项启动，不取首处、省view放整条event或恢复旧frontier，同源父托付保留原范围，boundary含原source。旧重复quote／stale范围只对对应托付留缺口；未运行，不迁移／回填旧记录，其他quote旧入口未全量改写或验收。 |
| 会话与许可 | 仅self本人、real世界、`work:self`及`evidence:read`，来源、权限与用途继续现有核验。宿主`memoryMode=relevant`才允许跨会话；其他模式须为真实session成员，或显式`matterId`／`episodeId`连到本session的合法frame／goal，父关系完整来源同样复核。模型查询地址不扩大范围。 |
| 有界目录与变化 | 30分钟／最多64份本进程cursor，首次rowid上界＋向下keyset，每页最多200候选复核。空partial页仍按nextCursor续读；固定枚举上界不冻结Work修订，已过记录改变需新开目录，进程重启／来源或边界变化后重开。目录不计原文read或调查ACK，不代表全部历史或语义调查完成。 |
| 正文采用与收据 | frame／goal走原`restore_collaboration`，recorded学习沿`workSourceFilter`／`learningProcessReadable`后走`read_learning`；active个人方法先经`personalMethods.catalog(handle,{id,revision})`单记录窄读资格，再给`read_skill`入口，不展开整个catalog；来源绑定规划意图走原专用读取。暂停／结束定位不恢复状态。预算准入后实际候选及必要父关系的完整来源进现有receipt；queryBinding可作为目录结论的导航来源门保留，空页也不因此成为候选支持或已读事实。查询refs不是事实、全文已读或授权，后续正文仍由owner重验。 |

本批未证明真实模型会正确选择目录、区分相近事项、处理所有权限变化或完成跨方面语义调查；未实现自动语义关系抽取、因果图、事项合并、定时Profile或新的经历摘要。持续总目标保持进行。

<a id="personal-memory-round5"></a>
## 第五批源码续作：本地语义候选接原对话

继续在 `e4254aa` 的现有工作树上实施，按[最新完整目标](source-materials/2026-10-18/goal-objective-current-20261018.md)暂不验证或安排Luna。固定模型及依赖的安装完整性记录与下列源码接线，**不构成模型可运行、召回效果、隐私行为或用户体验通过的证据**。本批没有运行check、test、build、Hermes／Luna／DeepSeek、界面或嵌入推理，没有新增测试代码；未打开用户数据库、迁移实际数据、打包、提交或发布。

| 范围 | 当前源码／安装状态与边界 |
| --- | --- |
| 固定中文候选模型 | BGE-small-zh-v1.5 q8的config、ONNX、tokenizer与tokenizer_config四文件已安装至项目自有模型目录，合计 **24,451,050字节（24.45MB）**，不含ORT等运行库。原模型提交`7999e1d3359715c523056ef9478215996d62a620`、ONNX导出提交`75c43b069aac4d136ba6bc1122f995fedcfd2781`，文件大小/hash、CLS／L2、中文query前缀与分片方法锁在`runtime/embedding/lock.json`。`onnxruntime-node@1.30.0`、`onnxruntime-common@1.30.0`和`@huggingface/tokenizers@0.2.0`已安装；没有加载原生模块或模型。来源、成本和许可见[专项研究](research/LOCAL_SEMANTIC_RECALL_2026-10-18.md)。 |
| CPU懒加载与独立分发 | `embedding-runtime.ts`／`embedding-worker.ts`按需在产品自有worker使用CPU；构造服务不加载模型，运行请求不联网下载或查私人缓存。构建与打包源码接asar外Windows x64资源、精确文件清单及许可；没有生成本批worker构建或新安装包，也没有Electron兼容、速度／内存、native取消效果的实际证据。取消仍须在native调用前后和宿主交付处检查。 |
| 原SQLite的可删候选索引 | schema14的`h_semantic_chunks`只保存原文ID／版本、Unicode范围、正文hash、固定方法／维度与向量，不另存事实正文。源权限、可推断范围和本轮精确投影先于候选限额、向量加载与排名；写入与交付前再核版本／限制。遗忘及恢复屏障清相关派生，保留独立合法范围；上述均为当前源码，未在用户数据上执行迁移或行为验证。 |
| 同一对话里的两臂召回 | 原`search_context`经`prefetchWithSemantic`把词法多query归成一臂，再与本地语义臂合并；每臂保留头部候选后做RRF，避免多条近义query把语义独有命中挤掉。语义结果只是预览及原`read_evidence`地址，须回原文及现有条件／更正链核实；分数不表示事实可信度、接受或完成。原scan／browse与词法降级仍保留，没有新增页面、索引管理UI或第二代理循环。 |
| 索引续接与只读调查 | 索引扫描和未消耗原文位置沿原`h_meta`持久保存，按当前方法、来源／范围及限制绑定重新准入；不会靠旧checkpoint恢复许可。当前只读子调查及临时范围只查询已有合法索引，不补建或修复持久向量，覆盖保持未知；索引缺口、积压与不可用分别返回，不把空结果当没有记忆。 |
| 冻结排名与候选尾部 | 窗口内冻结排名、精确继续读取和过期／范围变化后重开已有源码；`vectorSearch.nextWindow`传递`nextWindowCursor`／`semanticWindowCursor`，沿冻结的合法来源／片段集合继续下一候选窗口，也保留单条长原文内尚未枚举的片段尾部。续窗不补建或修复索引，与窗口内offset分开；候选窗口尚有尾部不单独降级`indexComplete`。窗口只排本窗口，索引覆盖与候选枚举分别报告，不代表全库全局排序或语义／条件完整。上述接线未运行任何分页或重启验证。 |

本批融入已有聊天，第四批“今天”界面的未验证状态保持原记录；没有新增页面。Windows v0.3.0 EXE及下文历史通过数字仍只覆盖其原版本／日期／范围。持续目标保持进行；本地中文召回收益、否定／反事实／多主体边界、长期效果和完整产品分发仍待用户明确要求后验证。

<a id="personal-memory-round4"></a>
## 第四批源码续作：调查、学习与有来源的方法

本次以[最新完整目标附件](source-materials/2026-10-18/goal-objective-current-20261018.md)为准：用户明确暂不验证、暂不安排Luna，等明确要求再做。下表记录在 `e4254aa` 工作树上继续整合的源码，**没有运行类型检查、测试、构建、真实模型、校园账号或界面验收**；没有新增测试、fixture或runner。旧批次的通过数字不能用于本批。持续目标仍在推进，当前没有提交、发布EXE或更新公共Site。

| 范围 | 当前源码增量与边界 |
| --- | --- |
| 同一只读调查续读 | 原机会拥有地址、枚举、正文覆盖与pending，真实投递和判断同事务ACK分开。恢复从已ACK的首个缺口继续，小页可替代旧大pending范围；父读原文和采用子报告分别记录。前后台父采用均核同tool-call的宿主批准报告及实际进入worker请求的观察，不把未展示尾项算已读。见[机制](research/PERSISTENT_INVESTIGATION_2026-10-18.md)。 |
| 理解如何变化 | `read_understanding(view=history)`沿原Assertion修订、宿主提交时间和现实区间读取，旧时间未知；固定knownAt选择不随分页改变。历史cause、引用和正文逐项核当前来源；前情、助手原文、IPC、导出与永久遗忘沿同一门处理。见[机制](research/MEMORY_HISTORY_2026-10-18.md)。 |
| 学习过程 | `manage_learning/read_learning`沿原共同事项与Work experience保留题目、本人尝试、提示/答案、条件、结果报告和产物地址。两次报告不自动证明独立成长，帮助生成、显示、阅读和使用保持未知或明确报告。助手帮助核原消息hash和真实receipt；不增加人物能力标签或第二学习数据库。见[实现与限制](research/LEARNING_PROCESS_2026-10-18.md)。 |
| 个人方法与材料 | 本人明确选择的方法可保存、按版本修订或停用，接原discover/read技能目录；仍只是文字指南。模型资料目录与精确定位复用原材料owner，包含当前已提交的临时会话文件，不扫描任意磁盘。精确WorkSourceBinding贯穿实际传输、旧回复、父采用与遗忘；普通停用保留来源合法的历史解释。完整文件正文尚不能冒用descriptor字符坐标保存为方法supports。见[机制](research/PERSONAL_METHODS_MATERIALS_2026-10-18.md)。 |
| 校园安排接原规划 | 当前保存bundle的证明、课程/考试、取消/待公布及日程展开质量进入原planner；相同来源版本复验只在本次进程签发证明内有效，快照或账号改变需重新试算。沿原查询/认证/缺包补齐语义，不复制课表进本机日历。固定质量投影不增加任意查询桥；其他未接外源继续blocked。旧意图required_refresh保留、组合查询缺逐bundle证明不签整体；首次认证/补采可能耗尽90秒窗口。见[机制与边界](research/CAMPUS_PLANNING_BRIDGE_2026-10-18.md)。 |
| 今天的校园一起看 | 后端源码之后用两次内置GPT Image生成并查看[A/B](../assets/design/generated/2026-10-18-campus-day/manifest.json)，选A单一时间线，再接`CampusDaySchedule.tsx`与既有AgendaView。明确选中才读当前自然日；只读课程/考试与本人Action按时刻混排，未知结束、跨日日期、加载/错误、来源展开均有源码；原Action与系列操作、过滤和导出继续原链。sourceBoundary复用现有signalBarrier，应用内账号操作开始时先清旧结果，Native交付前也复核；外部vault即时变更没有新增通知链，重读时再核。没有当前渲染、交互、持久化或窄窗通过证据。 |

最新目标原始字节已另存，不覆盖较早版本。用户随后给的本地实施目录28文件与已有归档逐字节一致，动态提示词同样一致；包内脚本没有执行。Git经已启用系统代理完成fetch，远程现有分支均已包含在当前分支，无新增待合并提交。图片来源对话的用户dirty保持原样。第四批记录时向量召回仅有[实施选择](research/LOCAL_SEMANTIC_RECALL_2026-10-18.md)，后续安装与源码接线另见[第五批](#personal-memory-round5)，不回填第四批的验证范围。手机原生、同步、OCR、独立后台和真实长期语义效果仍各有未完成工作；这批后端不替代前端阶段。

当前 Windows x64 便携版为 [v0.3.0（最新版）](https://github.com/1760139151lkh-ctrl/zaichang/releases/latest)，由 `74e099a2a3e23d0e7fffb075a1c1e22727976004` 构建，内含 Hermes、Python 和原生 PDF 运行时。2026-10-18 本机 `npm run package`（独立输出目录）、141项现有检查、9项 Hermes 检查、公共产物检查及 Windows 桌面/PDF 检查通过。包内 `app.asar` 程序已用隔离数据目录实际启动，首页和共享地图正常加载，地图版本为 `campus-v3-f86b9ec6a26fb2b2`，未报页面错误；另以包内 Hermes 运行时通过现有单项主循环检查，以包内 PDF 运行时完成文字读取及 JPEG 渲染。最终便携 EXE 也完成自解压并进入首页，已正常关闭核查窗口；本机启动时展开运行时需等待数分钟，本地 `win-unpacked/在场.exe` 可直接启动。此次未调用真实模型或私人校园账号，未重新验收全部前端流程，也未更新公共地图 Site。下载和复现见[发布说明](DEPLOYMENT.md#latest-windows-release)。

<a id="personal-memory-round3"></a>
## 2026-10-18 第三批：重开后接着商量

从 `30dcd8e675d42eca58a7f0f2c36b48512d9ae5d0` 继续，重新比较八个机制方向后，先实现可恢复规划意图及来源／采用边界，再核查后端、生成并查看两版 GPT Image，最后改进现有规划 Scene。研究、固定一手源码与未做候选见[第三批研究](research/PERSISTENT_PLANNING_INTENT_2026-10-18.md)，图稿取舍与文件身份见[manifest](../assets/design/generated/2026-10-18-planning-continuity/manifest.json)。**持续总目标仍进行**，本单元收口不代表完成或暂停。

| 本批增量 | 已实现与实际观察 |
| --- | --- |
| 保留可继续的需求 | `manage_planning_intent`从真实草案和当前合法原话保存任务、窗口、预算及方法解释，归原`h_work`，不另建记忆库。正常keep不写日历、不写attempt；CAS修订与精确重试有实际入口观察。恢复不把方法默认值变成人物偏好，不复活旧scope、批准或短票据。 |
| 真实采用与剩余重算 | prepare同事务保存宿主manifest及真实action-revision link；采用信用仍联查原动作、派发、成功回执和当前agenda。正常API已观察真实save30后重开仅余30＋rest10、只补缺失边界、已有休息复用及秒级未来边界保留；已安排不冒称完成，时间经过、修改、删除、部分保存、重复或证据未知保留缺口。 |
| 当前来源与精确停止 | schema11让每份attempt独立绑定原来源；父意图换源不使旧来源可读。fresh schema11已观察只获B范围时旧A正文不返，永久忘A后manifest清空／redacted、未执行动作私文清理、采用量为未知null；metadata暂停／结束不必先读旧私文。纯意图删除与普通原文／来源删除、独立已接受业务取消分别实查。 |
| 计算后的来源变更 | 新票据冻结本次实际读取的旧attempt证明集合。负责人正常API亲验B已更新、旧A证明已用于试算，prepare／approve后再撤回A，epoch仍1；execute拒`planning_intent_adoption_changed`，agenda0、dispatch0。正常三步工作30／休息10／复看15的当前Store重开投影仍ready／allocated45。 |
| 派生正文与历史 | 同一宿主provenance进入Scene、准备／cooperation、receipt和实际历史／子调查采用。作者用真实broker输出核A限制后规划正文、初始索引和export退出，独立日历材料保留；Scene在B仍合法、宽sourceIds仍许可时也拒旧A证明。负责人独立正常查询→保存两代带receipt的合成回复：重开读前情继承A地址；撤回后历史只返合法B原话，IPC／实际Store.export均不返两代派生正文；永久forget A后原DB正文和receipt清理，独立日历回复保留。普通修订／暂停与来源不可用的历史门分开。 |
| 发现与派生画面 | 有限planningIntents线索、typed恢复和许可工作区scan复用原上下文；标题、分页前资格、精确原话、事项关联、历史IPC、准备与导出沿同一来源门。Scene暂停后历史IPC／export不返，遗忘后保存副本清理，独立已接受安排依原业务边界保留。update／resume合并原scalar sessionId、已有sessionIds及当前会话，不再静默截为32项；超过既有160,000字节持久预算仍明确拒绝。作者正常API核对scalar-only记录及33→36项成员关系；负责人重编并重开后，原membership-prior-0能读revision10的36成员规格，不扩大明确current_conversation的会话范围。 |
| 安静续接界面 | A/B比较选A：沿同一连续时间线，用“接着上次的安排”“已在日历／这次续排”表达关系；保留旧日历占用和新试算各自身份，无完成进度条或新增采用按钮。负责人通过Chrome CUA及既有DevTools连接操作当前构建Electron，亲看1220×960、430×900；实际指针切至23日、点选14:10–15:40时保留原输入草稿，reload／resume后草稿仍在。此前晨光／夜色和End切日观察保留其当时范围。 |
| 角色与小时环境 | 当前构建中，角色预览候选可编辑，拒绝后原稿保留；保存原稿后实际settings revision为1。负责人实际展开带预算画面，完整占用1小时55分与新增工作上限1小时30分分别呈现。公开来源的历史小时样本已在当前Electron操作：指针选03:00，End聚焦12:00，Enter前缩窗至430像素；修正后的焦点完整位于时间条内，Enter选中12:00并更新详情及精确引用，全页宽仍为430。历史预报标识、缺测资料与真实模型／服务的新查询分别判断。 |

2026-10-18最终精确证明、历史传递与遗忘修正后的整合源码：现有检查**262/262**通过（98.104秒），锁定真实Hermes **9/9**通过（69.897秒），`npm run build`及其中的`tsc --noEmit`、桌面与公共review构建通过。日志为本机`work/personal-memory-round3/accepted-final-tests.log`、`accepted-final-hermes.log`与`accepted-final-build.log`；Hermes模型回调是合成，不证明真实模型质量。负责人另用当前编译Store重开`audit-cancel-cYe04a`：动作保持`cancelled/cancelled_before_dispatch`，采用投影为`ready/not_adopted/allocated0`，重算新增45分钟且agenda为0；最新批准后撤权与两代历史／永久遗忘的实际观察见上表。没有新增或扩展测试、fixtures或runner。上述业务使用隔离合成数据与正常Store／runtime／broker／action入口；图稿、界面操作不证明完整动效、真实模型自然工具选择或真实账户可用。

本批未调用Luna／DeepSeek、本人GPS或校园账号；外源当前版本resolver仍未接，所涉重算／采用保持`required_refresh`／blocked。未更新v0.3.0 EXE、公共Site、手机或平板产品。语义索引、同一机会的持久调查frontier、学习检查点、交流约定发现与移动生命周期仍是下一轮比较候选，持久规划意图已由候选转为本批实现，不能据此推定其他候选完成。

旧continuation缺必需proof时保持不可读；可确定归于规划的旧准备缺证明也不恢复。若早期纯正文只剩`look_up`、宽sourceIds和hash，无法倒推它曾依赖哪份attempt，不伪造迁移证明或据此禁掉所有独立work资料。新链无论是否带Scene都保存精确provenance；本机制尚未包含在已发布EXE中。

<a id="personal-memory-round2"></a>
## 第二批存档：依据完整，时间有边界

从第一批`01afdc4`继续，在同一续作分支／draft PR #4推进。八个方向重新比较后，先完成记忆、上下文、规划与动作的通用机制及相应核查，再生成两版GPT Image并进入界面。研究与未做候选见[第二批研究](research/PERSONAL_MEMORY_ROUND2_2026-10-18.md)，图稿与取舍见[安排窗manifest](../assets/design/generated/2026-10-18-chosen-windows/manifest.json)。持续改进仍是总要求，不能因这一批交付标为完成／暂停；Codex目标面板的调度状态需在实际会话核实，仓库文档不替工具宣称运行中。

| 本批增量 | 已实现及实际观察 |
| --- | --- |
| 多源与精确支持 | 提案声明主／支持片段，按Unicode位置及版本核scope、引文和完整支持集；每次理解修订及历史各有精确citation。未声明跨回合前提被拒；完整支持集保存后，忘记其中前提会使派生退出，同时保留同源无关事实。跨span身份不再因处理窗口重复。 |
| 真正沿来源遗忘／纠正 | 精确副本／多层摘录共用原始坐标；遗忘前展开原文与现存副本，循环／未知不冒作完整。实际copy学习事实被忘后，原文和copy相同片段遮蔽，多层disjoint原话与事实保留、重启一致；旧重放拒绝，新独立陈述可用。修订级宿主receipt让合法wide-copy纠正可读，旧兄弟inactive，原文换名重写旧话被拒；未来限制和授权退出仍生效。 |
| 长原文与合法澄清恢复 | 48,000实际UTF-8字节预算、精确窗口／gap、地址请求及逐项结果；恢复只存地址／签名和原scope绑定。负责人回读既存11,232字原文，39,329字节上下文保留末尾两条否定、任意请求8300–8350和诚实gap，32字后到澄清完整标later，局部遗忘后的disjoint请求重开保留。作者另直接核同代不空转、范围交集和新代唤醒；未用此证明模型实际语义质量。 |
| 本次安排域 | `scheduleWindows`省略兼容旧horizon，[]为空；完整工作／准备收尾／转换休息／保护采用守同一域。实际两下午各eligible180，free65／45；分离9–10、11–12的eligible120、occupied105、free15，中间60分钟没有变成free。恢复仍用原窗及已保存额度。 |
| 能力契约 | 新动作绑定prepare时宿主CapabilityContractRef，approve／派发／inspect／cancel复验；实际本机provider换版后旧动作被拒，未写日历。声明快照不等于函数／闭包已哈希；历史无ref不自动续签，已成功回执和本地undo保留。外源资源版本resolver仍未接。 |
| 时窗进入对话 | A/B图稿比较后沿日期条＋单日呈现真实窗口，去掉重复统计和重复日期。负责人亲看1220×960、430×900、夜色，操作切日／精确时段引用／草稿保留；End切日主滚动192→192。分离窗断开时间线，显式空域（有／无原busy）不画全天留白；未知结束仍为“起／结束待定”，旧horizon语义保留。点选仍只接着聊，未新增工程面板或采用捷径。 |

当前后端整合的现有检查**262/262**通过（123.5秒），最后界面日期精修后的`build`及其类型检查通过；本批后端阶段锁定真实Hermes**9/9**通过，模型回调为合成。没有新增／修改测试、fixtures或runner代码。正常产品API与真实Electron观察的合成数据／截图／日志留在本机`work/`和`.test-data/`，不上传运行数据。没有调用DeepSeek／Luna、本人GPS或学校账号，没有更新已发布EXE、公共Site或移动端；窄视口和设计图不等于手机产品。

第二批当时保留的持久规划意图已在第三批推进；本地语义索引、同一机会持久调查frontier、学习检查点、明确交流约定发现及手机原生生命周期仍是独立候选。它们各有真实源码比较与下一步，不能由本批机制或已有通过记录推定完成。

<a id="personal-memory-continuity"></a>
## 第一批存档：个人记忆与每天的余地

从 `4edd9225d745e394a7642a064cc3e184195eea4c` 继续，已将远端各分支已合并的成果同步本机。本批保持后端 → GPT Image → 前端的顺序，当前代码与相关界面已收口；**总目标仍持续进行**，不因本批交付而暂停或标为完成。[持续要求原文](source-materials/2026-10-18/ongoing-improvement-20261018.md)与[研究、覆盖和下一批候选](research/PERSONAL_MEMORY_CONTINUITY_2026-10-18.md)均已保留。

| 本批增量 | 已观察的行为与边界 |
| --- | --- |
| 原文可达与遗忘 | `search_context mode=browse` 按来源、收到时间与不透明游标查未提取原文，不依赖词面命中；预览仍须展开正文。局部遗忘清除重叠断言及派生，未删片段仍可整理；同断言历史更正来源也纳入持久删除屏障。直接重查了检索、重启与旧备份恢复，不宣称所有语义问题都能自动找全。 |
| 子调查与既有准备 | 子任务在开始前记录宿主限制元数据，初始已知的局部限制可作为历史线索；运行中新更正、未来限制生效、撤权仍拦住旧结果，父模型传输前后也复核。`inspect_help` 支持事项关联、查询、状态和时间筛选，后台保持原公平次序。 |
| 决策经历 | 理由、尝试、结果报告和重评沿现有事项保存原文定位与hash；逐字条件不变成猜测，删除后不从副本恢复。恢复时实际使用的来源进入receipt与读取预算。用户报告不是外部核实，经历不会自动改偏好、采用方案或写日历。 |
| 每天的规划 | `dailyBudgets` 保留逐日净工作上限与空白，部分采用后的剩余预算继续扣减；完整准备、收尾、转场、休息仍占位。真实自然日处理午夜跳时、回拨与跳日，26小时日期不被固定上限过滤。未知结束单独保留，不能显示为确定时长。 |
| 对话日节奏 | 两张新图比较后选日期条＋单日展开。日账来自宿主；有限跨日块按日显示，保留原范围和完整采用单位，切片不能少保存工作量。实际切日、选择日期明确的时段、保留输入、保存草稿及重新打开已查看；窄430视口与宽1220、晨光与夜色没有出现全页横向溢出。 |
| 环境与角色 | 过期环境快照定时变为“先前查到的预报”；缩窄后当前小时仍可见，不抢聊天滚动或焦点；缺天气码不画确定云况。角色预览可先编辑再放入草稿，拒绝不改原稿；相同预设和改回原值不制造假草稿，真实版本冲突保留原稿后可继续保存。 |

当前 Windows 环境为 Node **24.18.0**、npm **11.16.0**。最终整合的 `check`、现有 **262/262** 检查与桌面／公共地图 `build` 通过；锁定真实 Hermes **9/9** 检查通过，模型回调为合成。原文、遗忘、限制快照、经历、日账和采用边界另以现有产品API直接调用核对，未新增测试代码或runner。公开Open-Meteo小时天气／空气经实际服务读取并进入真实Electron界面；没有读取本人GPS或学校账号，没有调用生产DeepSeek或Luna。

界面观察还覆盖角色卡编辑／拒绝／保存重开、草稿与真实修订冲突、键盘关闭回焦；天气／空气的小时滚动、键盘选择、缺测、来源与定时过期，以及无模型本地演示中的精确选择引用。静态图不证明动效，源码／机制通过不证明长期记忆质量、角色自然度、主动分寸、手机或平板实机。旧发布EXE和公共地图Site没有被本批源码更新冒充为新发布。

## 历史保存点：c7cff228 后的接线阶段

本轮从 `c7cff22884fe9a3050879067dd49012f685d8cfd` 的后端加固保存点续作。当前要求见[补充要求](source-materials/2026-10-18/continuation-requirements.md)。先审查真实仓库和输入，再并行研究、实现与复审后端；首轮合并 `npm run check` 与 **258/258** 机制检查通过后，完成四组 GPT Image 设计，再进入前端。用户已明确覆盖历史“Luna 未通过就不能前端”的门禁，真实模型与外部连接的未知继续单列。本轮没有更新上方已发布 EXE 或公共地图 Site。

需求与全部后续工作见 [HARNESS_EVOLUTION](HARNESS_EVOLUTION.md)，研究/调用链见[项目导航](../PROJECT_NAVIGATION.md#current-evolution)。[原始来源](source-materials/2026-10-18/README.md)保存实施包、完整记忆讨论、Harness 讨论、动态场景与前端理念；manifest 和五个附件回执保留字节/hash对应，其中上传记忆短版为完整版的字节前缀，不另存一份冲突“最新版”。来源是设计输入，不是用户运行数据。

| 本轮后端实现 | 实际行为与限制 |
| --- | --- |
| 记忆调查与回查 | `search_context` 支持主查询和最多五个关联查询，以及有限扫描；`read_understanding` 展开有版本的原话、依赖、条件、例外与覆盖缺口，更正后的后续线索可回查。原文和理解分开，查询/候选不是证据；投影边界不回显查询串。该历史保存点尚无向量候选，后续源码接线见第五批，不能保证所有同义表达召回。 |
| 跨会话接续 | 当前上下文获得有限的有效准备材料和未完事项索引，不复制全部历史正文；严格核对主体/世界/来源/期限，session-only 不跨会话。已看同版本不重复推荐；原材料采用时再验证。不是新的长期记忆库或第二个后台循环。 |
| 主动决策与子调查复审 | 有效期材料造成的自身托付修订，只有同事务、精确前后版本可推进快照；之前/之后的独立编辑仍中止旧调查。正常决定不介入可完成；已有问题与排队建议可回到聊天，问题不冒充研究，独立提醒不受影响。 |
| 日程分段与恢复 | `planning.draft` 增加分段上限，保留依赖、连续要求、准备收尾、转场休息和留白；`planning.recover` 回读真实已保存项，标出修改或完成、删除、重复与未记录；只有仍有效且边界一致的完整票据才返回剩余请求，重启后仅报告实际观察，总步骤可能未知。逐项采用不是整组原子事务，不恢复失效票据和旧授权。 |
| 日程真实来源 | 外部源解析接口携带当前 scope；生产 resolver 仍未连接，依赖外源的草案继续 blocked。恢复不能凭计划标题重建学校事实，不能把本机记录当官方有效计次。 |
| 角色与方法 | 保留三个原创预设，新增丰川祥子/若叶睦的有限来源与项目演绎；显式采用演绎或保留原角色，外部 Character Card JSON 只转换可编辑文字草稿，不执行卡内指令/宏/脚本。十份方法按需发现，保留版本、依赖和连接状态；真实模型人格稳定待验。 |
| 对话规划与环境 | 当时新增 `PlanningScene` 与 `EnvironmentScene` 的宿主投影；当前日节奏和环境交互已在上方批次收口，来源／版本／选择边界继续保留。 |
| 本机日历交接 | 已接受且未完成的有限日期实例生成 ICS，复用重复/例外展开、稳定 UID、UTC/全天日期、文字转义和UTF-8折行；默认不含私人详情、无提醒或联网。保存框返回后复核隐私/权限并回读当前安排；全天非占用条目保持透明。工作区导出已接，隔离合成数据经真实Bridge生成文件；原生文件框以定向stub代替人工操作，尚无手机系统日历实导入证据。 |

### 本轮验证口径

独立审计恢复锁定 Hermes 运行时后，基线 `check`、**212/212** 机制检查、**9/9** 真实 Hermes 检查通过；未放宽 Python 文件围栏或升级引擎。随后后端首轮合并 `check` 和 **258/258** 检查通过，包含记忆、续接、规划、角色、场景、ICS及审计回归。后续新增用例与最终前端集成结果正在统一收口，最终数字不预填。问题、修复和定向验证见[后端独立复审](research/BACKEND_REVIEW_2026-10-18.md)。

真实 Hermes 测试使用真实锁定 AIAgent 和合成模型回调；本轮没有实际 Luna/DeepSeek 连续对话，也没有真实校园账号或设备授权验证。它们不能证明长期记忆效果、自然主动性、角色像不像或真实跑步计次。运行环境为 Linux、Node 24.19.0、npm 11.9.0；依赖沿用核实的相同锁环境，不能冒称全新机器 `npm ci` 或 Windows 原生发布通过。

## 全系统能力与实际证据

“实现/接入”和“运行/验收”分别判断。历史实际模型与界面证据只支持对应日期/保存点，不自动覆盖新增行为。

| 组成 | 当前实现/接入 | 已有证据与限制 |
| --- | --- | --- |
| 对话与连续上下文 | 单一 Hermes 主循环、进展/历史/停止、原话检索、事项续接、草稿及附件恢复；回复正文经完成核查后呈现 | 历史实际 Luna 覆盖代表流程；本轮新增有限续接索引有机制证据，未证明所有长会话质量或主回复逐token输出 |
| 来源、权限与隐私 | 传输、读取、用途、保留、推断与动作分开，主体/世界/受众/版本核查 | 当前原话限制、临时会话、撤权、纠正/遗忘与恢复有分层检查；整库未加密 |
| 记忆 | 原文与条件断言、恢复队列、更正/停用/忘记、依赖失效、多查询与有限扫描；第五批源码增加本地BGE候选臂 | 确定性边界及部分历史语义流程有各自证据；本批固定资源已安装，向量运行与召回效果未验证，无通用长期理解保证 |
| 记事本与资料 | 笔记原文/CAS/版本/撤销/回收站；TXT/MD/PDF分页、检索、原文定位、页面像素及图片输入 | 历史笔记/长文/冲突/草稿已实际操作；Windows原生PDF证据独立，无OCR或任意Office格式承诺 |
| 文字人格 | 五个可编辑预设/自定义、纯角色常驻、保存/恢复/模板；显式形象绑定与可编辑卡草稿 | 本批实际核对采用／保留、编辑／拒绝、保存重开与冲突；真实模型长期稳定辨识仍未验 |
| 情境与规划 | 有界 situation、冲突/未知预览、多任务依赖与分段、完整占用、逐项采用与恢复；来源绑定的持久规划意图和同一planner重算 | 历史实际约饭/学习块/同对象修改；第三批正常API与续接Scene已有观察，最终修正复核见本页顶部。外部源版本resolver未接，日历空白不等于现实空闲 |
| 日历与提醒 | 事件/待办/截止/提醒/时间块、时区、重复/例外、同对象修订和撤销；有限ICS输出 | 历史保存/重开/删除恢复/旧撤销冲突有证据；ICS有确定性与真实IPC文件输出检查，系统原生文件框人工操作、系统导入/同步另验 |
| 持续托付与帮助 | 真实原话/来源/期限/停止条件，来源变化/时间节点复核；prepare/wait/ask/notify/none及现有材料复用 | 历史 Luna 安静准备路线；本轮修复自身修订、none和准备复用。暂停/停止/撤权压过迟到结果，OS提交/送达/已看分开 |
| 工具、方法与子代理 | 十份按需方法；当前权限/连接状态；事实缓存、等价共享、独立取消、真实delegate及共享预算 | 历史公开天气共享与真实子代理有回执，新后台边界有机制检查；方法不是可安装代码或权限授予 |
| 对话动态场景 | OpenUI有限Map/Weather/Campus/Planning/Environment五类，精确版本视图与单一选择；Planning可显示来源绑定的继续试算 | 日条、小时环境及本批安静续接已按各自范围实际操作；原地图／日级天气／校园卡保留其历史范围。不是任意UI或客户端工具执行器 |
| 地图与空间 | 唯一公共地理/步行图，暖灰金空间地图，同surface内嵌/聚焦，真实相机与平面回退 | 历史总览/斜视/路线/聚焦/平移缩放旋转/手动接管/无WebGL已查；现场通行和室内路线未闭合 |
| 天气、空气与公开研究 | 公开参考地点、日期/小时窗口、覆盖；空气PM2.5/PM10/US与EU AQI；搜索/网页/PDF续读 | 历史天气和本轮前的公共空气HTTP200解析有证据；预报不是实测或设备位置，搜索相关不等于已核验 |
| 校园适配 | 本地导入与另装账号连接器，按资源细分权限/覆盖/回执 | 隔离与适配已接；无本轮真实大学账号/全部分页资源验收，官方跑步有效计次尚待 |
| 对外草稿与公开展示 | 受众投影、可编辑候选、选定内容和返回私聊 | 准备/显示不等于邮件或钉钉发送，桌面展示不等于公共地图Site |
| 外观与陪伴形象 | 阅读主题/密度/字号、六个内置形象、自选图、窗景/少动态/静坐及现有导航 | 六形象和图库有历史隔离桌面操作；第一批显式绑定与卡草稿已按该批范围核查，不增加权限或自动改本人画像 |

入口与状态所有者见[项目导航](../PROJECT_NAVIGATION.md)，机制见[架构](ARCHITECTURE.md)，用户利益与设计方法见[产品约定](PRODUCT_CONTRACT.md)。

<a id="frontend-evolution"></a>
## 当前前端演进与动态界面

### 第三批：继续商量已有安排

本批后端整合检查后生成并亲看[两版续接方案](../assets/design/generated/2026-10-18-planning-continuity/manifest.json)，采用A的连续时间线与轻量文字关系；B的横向分隔容易将交错的新旧时段归成两组，未采用。图稿是合成设计来源，不进入runtime；输入草稿、精确选择、日期键盘与宽窄主题的本批实际观察见[第三批状态](#personal-memory-round3)。没有新增页面、独立进度账或采用捷径。

### 较早批次：图像先行后接入现有流程

后端首轮258项通过后，生成并查看规划、环境、角色、日历交接四组 GPT Image 方案；[manifest](../assets/design/generated/2026-10-18-companion-evolution/manifest.json)保留哈希、阶段与使用边界，[prompts](../assets/design/generated/2026-10-18-companion-evolution/prompts.md)保留提示词。设计稿里的示例时间/数据不进入生产事实，手机插图只表达响应式方向。

| 实施方向 | 当前进度 | 仍需记录的证据 |
| --- | --- | --- |
| 对话规划时间带与小时环境 | 日条／单日展开、小时天气／空气已接入并实际查看 | 日期／时刻选择、精确聊天引用、窄窗／主题、缺测／未知、定时过期已检查；新语义与长期质量不由这些观察保证 |
| 角色与形象、卡片草稿 | 显式采用／保留、可编辑预览与草稿接入完成 | 本批已操作保存重开、拒绝、同预设、改回原值、真实冲突、窄窗／主题／键盘；不证明真实模型人格质量 |
| Workspace日历交接 | 入口、有限日期与详情选择、结果和恢复已接 | 1220/720px与深色实看；改日期、Escape返焦点、外部关闭、反复开闭；合成Store→真实Bridge保存2项→UI导出ICS文件已查，空/取消无文件与假成功；原生保存框仅定向stub |

这三路继续使用“聊天 / 今天 / 留下”、既有消息／资料／安排与版本化设置，不为后台记忆增加常驻工程面板。日历交接保留此前独立真实组件与IPC证据：默认无详情，全天非占用条目透明且结束日期排他。本批角色的窄窗、草稿、编辑预览、冲突与键盘，以及新场景的实际观察已在上方记录；这不把图稿、构建或有限观察升级为全部长期体验保证。

### 历史界面证据与保留边界

`e9f3860` 后的窗边续作曾先读原始设计对话与图稿，再补本机查找、托付详情和理解变化的方案；141项机制检查和桌面/公共地图构建通过，隔离合成数据实际操作了本机查找、长文定位、草稿/撤权、托付暂停/继续/停止、记忆例外/重新说、图库/自选图和地图选路。六人物及600/760px首页、校园卡1080/390px与暗色有查看记录。Linux读长Markdown和PDF失败恢复，不能升级为Windows原生PDF渲染证据。详细对应见 [DESIGN_IMAGE_COVERAGE](DESIGN_IMAGE_COVERAGE.md)。

既有地图内嵌/聚焦复用同一surface；手势、新原话、停止与卸载取消旧镜头。旅程、停靠和有向路段各有身份，重复到同一地点不合并；历史快照不暗中刷新，选择/预览不证明保存或现实到达。具体见[对话场景](CONVERSATION_SCENES.md)。

陪伴外观保存在 renderer localStorage，与主机版本化角色、记忆和权限分开；SQLite导出不包含自选图片/外观键。设置页清理在后端成功后调用 `resetCompanion`，单个数据库清理回执不能证明所有前端存储已删除。新增显式角色绑定不改变这两个状态所有者。内置图与新增图的来源和再分发边界见[资产来源](ASSET_PROVENANCE.md)。

## 历史运行证据与生产条件

普通启动仍以 DeepSeek 为默认；显式 `dev:luna:test` / `start:luna:test` 通过已有Codex账号使用 GPT‑6 Luna Max代测。代测只替换传输，同一Hermes、工具、权限和执行边界继续生效；不等于通用生产ChatGPT登录。当前常量和协议见项目导航，测试禁止调用DeepSeek的约束未改变。

- 前一轮 `e16d3fe` 起的后端加固最终 `check`、**212/212**、`test:hermes` **9/9**、`build`通过；基于Linux核实运行环境，真实Hermes回调为合成。还实际请求紫金港公共参考点Open-Meteo空气服务，HTTP200、24小时样本、单位/UTC窗口核对通过，没有读取设备或私人账号。此记录不证明本轮新增界面或长期模型效果。
- 更早学生Harness联调在Node24.18.0/npm11.16.0下通过122项机制检查、9项Hermes与构建；实际Luna合成生活事实覆盖课程换楼、约饭/学习块比较、原对象改时、路线/小时天气、纠正、后台准备、停止重开不复活。90分钟学习块同ID从18:00改20:00并持久；无probe托付收到课程变化后准备路线。详见[STUDENT_HARNESS](STUDENT_HARNESS.md)。128场景是需求清单，不是128项实际模型通过率。
- 原对话场景实际检查过东3→西1、多停靠/返程、选“这里”、用户自述到达及日级天气选日期后保存本地安排；未把合成生活事实当本人记录。公共地图Windows检查曾通过桌面/PDF/public review脚本，实际操作相机，并在禁用WebGL后复算同一965米路线。无现场测绘或全部模型质量保证。
- 已发布Windows包的版本与检查见本页顶部；公共地图Site的105项/9项Hermes、clean-clone/CI和浏览器历史记录在 [CLOUD_REVIEW](CLOUD_REVIEW.md)。本机源码、构建、安装包与线上部署身份各自管理。

## 未完成的生产连接与共有限制

- 真实模型的长期记忆、同义回忆、人格一致性与主动分寸尚待连续使用验证；第五批本地语义候选已有源码接线及固定资源安装，没有运行／效果证据。历史确定性检查只覆盖当时机制，不能保证当前源码或所有开放语义。
- 本轮本机校园账号已接入并授权只读，成绩与GPA的限定读取／呈现链已有上方实际记录；考试发布、逐次课表／例外、全部GPA规则、跑步有效计次、审核状态及分页覆盖仍须按各资源契约和实际回执判断。需要但尚未接通版本复核的外部规划来源，其采用继续保持blocked。
- 校园预约/选课/付款、邮件或钉钉外发、手机GPS/健康/同步、语音输入、通用生产ChatGPT登录没有完整服务闭环。ICS是可互操作文件，未等同系统日历实导入、实时同步或手机产品上线。
- 桌面退出后机会轮询停止；无手机/远程常驻保证。OS通知按实际回执区分提交、送达与已读，固定提醒不因普通机会预算被省略。
- 数据库整体未加密，凭据按系统机制另存；备份须保留隐私fence。localStorage外观与主机业务导出/清除不同，完整清理范围需相应实际证据。
- PDF无OCR；搜索相关性、候选记忆和未读网页不当作核验事实。缺工具、未读、失败、部分结果与现实不存在分别表达。
- 本批新增界面已按上方范围实际观察；系统缩放／输入法、真实账号与不同设备的长期体验仍需对应实机证据。430是renderer视口，不是手机系统或移动端应用。手机／平板仍无完整产品、同步和后台生命周期实现。

迁移、回退和手机/外部边界见[学生Harness](STUDENT_HARNESS.md)。公开预览不含助手、账号、设备定位、私人地点、笔记或模型服务，边界见[部署说明](DEPLOYMENT.md)。

## 地图实现细节与事实边界

以下保留当前地图工程的细项说明，避免全系统总览丢失既有地理、来源和显示责任。这些行为不等于现场测绘、入口开放或整图事实验收；数据源和再分发以[资产来源](ASSET_PROVENANCE.md)、[地图SOURCE](../assets/map-v2/SOURCE.md)及公共审查记录为准。

The five reviewed metro stations (蒋村、三坝、虾龙圩、三墩、浙大紫金港) are treated as underground station references, so their source polygons no longer paint over streets as ground buildings. Their 26 exact source-boundary entrance nodes are available for walking endpoints and exit selection. Eight nodes already belong to the retained graph; missing exterior links remain explicit obstacle-checked estimates from the recorded entrance, including its own source-linked canopy. The 37 explicitly underground station ways remain retained and conditional, and are omitted from ordinary surface-road ink. Exit opening, station interiors and physical access are not certified; this is walking access, not transit routing.

Route endpoint names include the selected metro exit. At narrow widths, A and B occupy separate rows and the full-route action wraps below the distance, preserving readable place/exit names and distance units. The same layout applies to compact route preview and the existing entrance selector.

浙江省档案馆 now has an explicit display interpretation of a central tower, low connected wings, two court openings and an east-facing entrance. The published architect's description reports 15 levels and 67.2 metres for the main building; the 17.5-metre low wings, part positions, facade rhythm and entrance proportions are cartographic choices. The model remains `cartographic-proxy`, with unregistered building-part footprints and unknown actual entrance clearance. It replaces the site-sized display slab while retaining the original site record, place identity, reference point and estimated route access. Physical ground/entrance acceptance and reference derivative-use review remain open.
This repository contains the complete implemented desktop product and the integrated V3 map. It is not a promise that every historical aspiration is implemented.

The map is a 2026-09-10 public-source snapshot with project V3 display refinements. Door access, opening hours, construction changes, exact roof heights, some southern banks and complete indoor routes remain uncertain. Dashed access is an estimate; the sport markings are illustrative. WebGL fallback is planar and cannot provide a spatial camera. Review has no device location or personal bindings. Its existing theme is applied before data loading so loading, errors and the completed map share the same theme.

Shared place search matches nonempty category or unit words literally when name normalization would remove the entire query. Specific public names containing those words appear before descriptor-only names and alias-only matches; all matching names and aliases remain in the result pool. Queries such as “宿舍” therefore return matching names and aliases instead of the empty browse list. Chinese numbered names normalize single digits and tens, so “二十三幢” can match “23幢”; clearing the query restores ordinary browsing. Search does not certify an alias's physical identity or automatically confirm a category query as one place.

Shared snapshots distinguish retained name/spatial correspondence candidates, explicit links recorded in the existing source observations, and standalone official references. The original correspondence assertion remains in `reportedBasis`; recorded links retain their exact metadata locator. Neither an alias produced by a nearby-point match nor a recorded link establishes current physical identity. Lookup targets, names, aliases and coordinates remain available. Snapshot callers receive a copy of these facts and cannot alter later lookups by editing the returned correspondence table.

Published foot restrictions are applied to explicitly traced source segments without replacing their stored coordinates or removing graph records. The four retained western Xiyuan Road segments now carry the source's literal `foot=no`; the walker rejects prohibited foot access in both ordinary and unknown-passage modes. Source-ID deletion alone does not close a road: retained segments may have moved into another published source way. This access repair leaves the wider source correspondence and physical verification gates open.

Source publication correspondence distinguishes a lost connection from a changed vertex or source-way identifier. The 2026-10-13 focused review of eleven retained segments across seven ways found continuous current node chains, including the former way/414673399 members now in way/414673393. Added shape vertices and bus-stop positions add no published foot restriction; the existing gate remains a separate condition. The obsolete whole-map-version switch for these eleven segments has been removed. Retained coordinates and weights are unchanged, and this source-topology correspondence does not certify present-day ground access or positional accuracy.

Routes with graph-node endpoints retain their endpoint type when reopened, recalculated or rebound after a place-catalog refresh. The route service still validates those nodes against the current graph. Both renderers share one current endpoint resolver for marker/name display, including points absent from the place catalog; clearing or changing the selection replaces those records. Route coordinates and used entrances apply only to the matching selected endpoint, so a previous route cannot move a newly selected place's marker to another building's entrance. Recorded-entrance controls appear only when a current endpoint has entrance records. Derived graph nodes identify the local graph instead of claiming an OpenStreetMap node URL. Close endpoint names can use opposite sides of their markers in both renderers, retaining a clear placement during camera movement. Names, markers and source coordinates remain present.

The mesh path rejects exactly collapsed triangles in its actual Float32 draw coordinates, while retaining thin and open surfaces. Repeated roof faces no longer cancel their outside rim. Exact source structure maintenance unifies internal shared polygon boundaries while retaining occupied areas, source members and all entity IDs; it also supplies the island generator's 15 missing detail parent IDs. The shared loader retains compatibility with the older omitted fields. A source-history road can contain ordinary and conditional segments; its runtime display follows default graph segments instead of hiding the entire way, while the original source and all graph edges remain intact. Display unions compose existing source and wing polygons in the same calculation frame to avoid a boundary fold on export. The importer preserves recorded width and mode access tags as source metadata, independently of screen line widths and current access verification. The planar renderer draws route halos below all foreground segments so known-road segments remain visibly continuous, while estimated access retains its dashed style. These repairs do not certify source shapes, heights, image registration or full-map coverage.

A selected display-part retains a visible outline of its own stored plan in the spatial renderer, even when the aggregate model owns the visible volume. The original part ID, caption, entrance and route target remain separate. The outline is a selection state, not evidence of a physical parent relationship or a replacement building volume.

Simple building volumes use the same uncut local Float32 plans as ground fills, at their existing stored heights and bases. All building drawing, visible-surface picking and caption occlusion use those actual mesh triangles; the obsolete native extrusion layers and duplicate silhouette calculation have been removed. Selected, hover and cutaway states remain on this shared path. Source geometry, authored parts, height evidence and routing remain unchanged; retaining a stored height does not certify its physical accuracy.

Ground road strokes draw subdued surrounding roads before campus roads, so their round ends do not cover campus continuations at shared junctions. The planar fallback uses the same priority and draws bridge casings below bridge foreground strokes. This changes display order only; road coordinates, recorded widths and routing remain unchanged.

MapLibre ground fills use uncut local Float32 triangles instead of independently simplified integer tile rings. Existing shared junctions within a declared sports venue are inserted on both derived boundaries before triangulation; source files and physical dimensions are unchanged. The same triangles drive fill picking, including courtyard holes. The existing cartographic colors, opacities, layer order, camera and planar fallback remain in use. Source accuracy and the remaining all-map factual gates require their own checks; this renderer repair does not certify them.

Solid polygon boundaries, contact shadows and selected shores use the same uncut local Float32 plane. Their original screen widths, joins, opacity, theme and state expressions remain authoritative; a shared temporary GPU ink buffer prevents overlapping stroke segments from repeatedly accumulating opacity. Ordinary road centrelines and dashed outlines retain native rendering. The recorded narrow water gap and elevator outline remain at their source positions; preserving their draw coordinates does not approve their physical shape or source relationship.

The spatial renderer clips a soft bank shadow inside the existing water triangles, including island holes. The shadow fades at overview scales and remains below roads and bridge decks; it adds no physical bank height, water depth or source geometry. Compatibility views retain their planar water and shore treatment. A selected water body uses one selected caption instead of also drawing its ordinary water label.

Graphics restoration rebuilds custom ground and volume layers from the current public snapshot and recomputes derived label/cutaway state, retaining the current camera, selection and route. Development module refresh preserves the current camera and does not repeat an already-applied review scene. The earlier Canvas capture/composition timing observation remains unresolved; these lifecycle repairs do not establish its root cause.

Ordinary and browsing captions include current search results, controls, cards and footer occupancy in their placement. MapLibre uses transparent collision reservations and alternate text anchors; those reservations remain at the view centre with pixel offsets so perspective does not shrink the protected screen area. Retired reservation images are collected when the map becomes idle, after asynchronous source tiles stop requesting them. Canvas uses its actual text ink dimensions and tries nearby clear offsets before existing decluttering. Route endpoint names retain their required marker/fit behavior. “查看全路线” compacts expanded details before measuring the available viewport; details remain reopenable and later user gestures cancel the pending fit. These are display-only positions: source geometries, names, place IDs and route distances are unchanged. A label that has no clear ordinary placement remains searchable/selectable under the existing priority rules; this mechanism does not certify every name, source identity or full-map visual review.

The planar fallback selects visible point labels and current endpoint markers through their actual draw geometry. Named water bodies use the same identity masks and island holes as the spatial renderer; visible bridge strokes retain their screen hit region. Ordinary labels do not steal clicks inside another building. Generic reference-place cards retain the reference/access uncertainty without calling roads or bridges building footprints. The planar fallback centers A/B letters inside route endpoint markers and places the corresponding name above the same endpoint. A missing or mismatched route retains the selected place's own anchor and role prefix. This separates the two labels without changing source coordinates, routes or ordinary place labels.

Pedestrian road polygons use the shared paving color in the spatial renderer and both planar paths, with source holes retained. Their boundaries stay distinct from road centreline strokes. The compatibility renderer classifies its copied features with a separate pedestrian-area drawing kind; source facts remain roads. This reuses the WebGL 1 kind input rather than adding a geometry-type attribute that can exceed its stroke shader limit. The Canvas style cache separates geometry types so a same-tag road line cannot inherit a polygon fill. Light paving is lighter than building footprints. Source coordinates, measured-width claims and routing remain unchanged.

Ordinary footways and steps remain traceable at overview scales. The spatial renderer changes their opaque ink tone continuously with zoom, using the same tone for bridge decks and approaches; it no longer hides the whole ordinary-path layer below zoom 15.3. Compatibility views likewise retain path ink instead of dropping the class at a resolution threshold. Historical and covered paths retain their distinct styles and access semantics.

The planar renderer checks its first frame during initialization. A working context probe followed by a shader/style initialization failure now switches to the existing Canvas geography layer, using the same source and camera as context-loss recovery. Readiness begins false and is set by render completion; an initialization fallback retains its reason for diagnostics. A failure of the Canvas path still reaches the existing map error handling.

Compatibility captions now apply the same historical-reference policy as the spatial renderer: old source records remain accessible by their stable IDs, while their ordinary captions do not label a rebuilt site as current. A selected old record is identified as such in search and place details. Reference-point geometry alone no longer claims an official source, and old-directory references are distinguished in duplicate search results. A personal annotation keeps its existing precedence.

Spatial captions declare the existing Noto Sans SC font files with the package's Unicode ranges. Chinese characters therefore load their own packaged subset instead of being assigned to a Latin-only file and falling through to a system font. Light-theme ordinary, selected, endpoint and road captions use narrower halos so pale outlines do not wash out their dark letterforms; dark-theme halos retain their previous contrast treatment.

Sports surfaces share their existing role-based colors and opacity across the spatial map and Canvas fallback. The fallback no longer applies dark literals in the light theme, and its cache keeps tracks, court groups, runoffs and indoor venues distinct.

Route fitting reserves the current controls, card and endpoint text. MapLibre can refine the requested view from its placed caption boxes after rendering; a newer gesture, route or disposal cancels that correction. Camera navigation limits and minimum zoom accommodate the requested fitted viewport without changing the source AOI or map coverage. Canvas uses its actual font line height and wrapped names, and can zoom out enough for a long route behind a large card. Endpoint names sit above their markers as complete text blocks. Selected Canvas names participate in the existing label-placement priority while remaining visible; ordinary names remain searchable and selectable, and entrance markers are retained.

Route preview controls and map marks share one state. Preview uses a compact endpoint/progress card so the expanded route information does not cover the path; starting it focuses the slider and preserves the camera. Conditional routes retain a hypothesis label in this compact state. Ending preview restores the route information. Ending preview, showing the whole route, choosing another place or receiving a recalculated route clears the old preview line and point in both renderers.

An explicit inactive bridge tag in the source becomes a separate runtime route condition, alongside any gate-opening condition. Hypothetical route warnings distinguish historical bridges, old paths in redeveloped sites, indoor passages and gates, including conditions on the selected access points even when no graph edge is used. Unknown conditions retain a general uncertainty statement. The loader preserves all nodes, edges, distances and original bridge flags; a historical tag is not a present-day access or structure survey.

The named East-one gate retains reopening uncertainty from the [2026-09-30 university notice](http://www.zwc.zju.edu.cn/2026/0930/c22012a3210902/page.htm). Its existing access candidates require the explicit hypothesis option; the expected completion date and possible early completion do not establish that walking access has resumed. This updates the named endpoint qualification without moving its reference position, changing road geometry or declaring an entire nearby road closed. The exact construction interval and current access still require their own evidence.

Ground and architectural materials share one warm stone/gray/gold palette, with distinct graphite water and restrained vegetation. Architectural frames remain distinct from walls, and a restrained height gradient shades all materials of each building consistently. Both spatial and compatibility renderers paint waterway centreline ink beneath the merged water surface; explicit tunnel tags determine covered waterways, while a negative layer alone does not. Covered water remains traceable with fine dashed water ink at district scales. Canvas water highlighting keeps the water color and emphasizes the named display shore, retaining island holes and avoiding acquisition seams. Road shoulders precede joining path ink. Service roads have less display weight than main roads, and bridge ink follows its approaching road's color. Authored walls and glazing use a visible-surface depth pass before translucent color, retaining selection, cutaways and the original plans.

All explicitly open acquired waterways contribute continuous display ribbons. Existing interpreted widths and source width tags take precedence; other widths are bounded cartographic proxies informed by the source waterway class and recorded water surfaces. Exposed ribbons ease into the adjoining acquired bank cross-section, instead of producing square steps or triangular slivers at acquisition boundaries. One shared generator owns this composition, with source islands, buildings and retained island paving protected. These display banks neither certify physical widths nor alter the ground geometry or route graph. Temporary reference-point access uses the same explicit-tunnel distinction, so a negative layer alone no longer removes an open-water obstacle.

The gym's radial roof joints are antialiased material on the retained curved roof instead of competing strips of mesh. The swimming hall's roof and equipment panels are split at the same existing slope changes so their surfaces no longer cut through one another; its stored height and plan are unchanged. Floating glass controls clip their blurred backdrop to their rounded borders, including during entry animation, so the blur does not cover the map in rectangular patches.

Explicit historical bridge tags use a dashed trace instead of ordinary road ink, sharing their classification with the existing route-condition policy without claiming the bridge is open or absent today. Nearby repeated official-reference captions are consolidated for display: old/current copies and broad names beside numbered-building names remain separate records and search results. Selecting a reference preserves its own caption and position; mapped features and personal markers are excluded from this consolidation.

Seven agricultural-compound display parents use a common illustrative vertical module, continuous adjoining upper wings and fewer unsupported roof protrusions. Their prior display heights and observation basis remain recorded; the new `cartographic-proxy` designation explicitly does not certify physical heights, storey counts, footprint registration or source permissions. Ground plans, all feature/place IDs, entrances and route graph records remain intact. The all-map factual, coverage and release gates remain open.

The biosystems group unions its three retained source wings before drawing one continuous illustrative roof level, removing redundant full-height walls at their joins. Animal Science retains its two oblique arms with a single illustrative height step at their neck. These adjustments change the display massing only; the source plans and existing courtyard openings stay in place.

The west running track now has illustrative lane divisions generated inside its own retained display ring. Its physical `laneCount` remains unknown; `displayLaneCount` and the marking basis distinguish the drawing from an observation. The east track retains its separate geometry and recorded count. No source ring, facility identity, route, lap measurement or original sports detail is replaced.

Road display retains explicit tunnel and covered-passage sections for all road classes, including sections without a layer tag. Stair symbols stay distinct from ordinary paths. Plan view can trace a recorded building passage through the upper outline; that trace moves below the model during the spatial-camera transition. The east teaching gallery and two Yunfeng links retain upper decks while exposing their recorded ground crossings; Meng Minwei's lower west wings also leave openings along the recorded service passage. Decks, supports, widths and clearance remain schematic. Their upper-outline projections no longer add a duplicate solid ground fill in the spatial renderer. The importer retains the source's covered/service tags, while routing permissions, edge weights and coordinates remain independent. Compatibility renderers share these road classifications and no longer narrow a road solely because it crosses the campus display boundary.

Bridge decks have their own butt-ended casing above ground roads, while retaining their approach's road ink width. Compatibility renderers use the same foreground order and keep pedestrian color continuous across the campus display boundary. This changes cartography, not source layer tags, route connectivity or access qualification. Control-caption reservations retain their pixel vectors as style literals, so GeoJSON tile serialization cannot turn them into strings and place them all at the map centre. The unused visual-study style and caption alternatives have been removed from the production engine.

Simple extruded buildings use continuous roof surfaces, matching the authored models' material relationship. Their roofs no longer show the ground fill and shadow underneath as patches. Masonry and simple-volume walls move from overview translucency to solid color with close facade detail or a large projected wall height. Tall buildings therefore do not show underlying roads as wall markings while the map is still at a district zoom. Glass and deliberate route cutaways keep their separate transparency. This material treatment changes no plans or heights.

The small existing outline beside 蓝田3舍, way/543896552, has a simple 3.5-metre display proxy. Its current published source shares two boundary nodes with 蓝田3舍 but supplies no height; the proxy does not certify a separate apartment building, an entrance or physical parentage. Its original identity, source tag, ground plan and estimated access candidates remain intact. Explicit proxies live in the existing fidelity observations, and sourced heights or authored models take precedence during generation.

Twenty-eight existing residential outlines in 耀江文鼎苑 use simple display proxies grouped at 36, 60 and 72 metres. These are cartographic choices for the recorded long-block, point-block and diagonal groups, not measured heights or verified floor counts. The source outline labelled 14幢 retains its footprint while its negative-layer interpretation remains unresolved. All 29 recorded numbers gain explicit 文鼎苑/耀江文鼎苑 search aliases; names, IDs, coordinates and access candidates are retained. The surrounding source still has incomplete building correspondence and access coverage.

“从这里选路” explicitly starts a new pair from the currently browsed place, clearing the old destination and per-endpoint entrance choices. It no longer resumes a previous origin merely because an earlier route was ready. The ordinary two-point mode toggle retains its existing resume behavior. Place-card accessibility labels now follow the actual expand/collapse action.

Supplemental building references without recorded access use the same bounded obstacle-aware estimate as temporary and personal references. The adapter derives public access candidates and graph splits in memory, retaining source nodes, source-edge mapping, distances and restrictions without rewriting the acquired graph. Water, open channels, walls, gates, other buildings and explicit foot prohibitions remain barriers. The 80-metre limit and six-candidate limit are unchanged. These connections remain dashed reference-to-road estimates, not surveyed doors or indoor routes; no physical entrance is added to the catalog.

A route that actually uses an unresolved edge or access condition keeps the title “假设路线” after its details close, and “假设预览” during compact preview. Recorded ordinary sections stay solid; conditional sections and estimated access keep their respective dashed styles in spatial and compatibility views. Preview and reveal emphasis use matching dash widths and origins, so a moving highlight cannot fill the gaps and imply confirmed passage. Merely enabling the option does not label a route hypothetical if the selected route uses no such condition.

The shared mesh export and current-snapshot normalizer discard only exactly zero-area triangles, preserving all nonzero faces and material groups without changing plans, heights, identities or the road graph. The normalizer retains the supplementary building input in component hashes. These structural repairs do not establish physical building accuracy or full-map acceptance.

For the current clean-clone/CI/browser evidence and scope see docs/CLOUD_REVIEW.md; use the repository commit SHA in every subsequent review or change request.
