# 在场（Zaichang）终极深度演进、全栈打磨与跨端创新总主线（2026-10-24 究极融合定稿版）

## —— 上下文洁癖保护 · 八路重装子代理多轮深耕 · 零人机话铁律 · 充分利用 Image 生成杜绝飞机驾驶舱 · 移动端科学演进 · 十二阶段极致 Design

> **本主线的核心定位**：
> 本文件是开启新对话推进「在场」深度重构、全栈打磨与跨端创新的**唯一最高行动纲领（Master Roadmap）**。它已将：
>
> 1. 用户在 [《给 Opus 的深度重构长信》](C:/Users/17601/Downloads/在场-给Opus的深度重构长信-20261021.md)、[《Opus 深度重构完整交接包》](C:/Users/17601/Downloads/在场-Opus深度重构-完整交接包-20261021.zip)（含 `00–11` 专题与 `sources/original/upload/` 下数万字原汁原味的记忆、Harness、生活融合、地图动效讨论）、[《让人愿意回来的一些构想 (`COMPANION_EXPERIENCES_2026-10-18.md`)》](ideas/COMPANION_EXPERIENCES_2026-10-18.md)、[《2026-10-21 补充原话》](source-materials/2026-10-21/user-supplements.md)、[《把她作为人来理解的即时纠正》](../work/successor-20261022/companion-correction-20261022.md) 中的全部理想；
> 2. 用户关于安卓手机驻留演进的权威实施包：[`在场-手机驻留式演进-v2-研究与Codex实施包.zip`](file:///C:/Users/17601/Documents/ChatGPT/在场/在场-手机驻留式演进-v2-研究与Codex实施包.zip)（含 `01-Codex实施提示词-v2.md`、`02-研究结论与架构设计-v2.md`、`03-验收机制与72项轨迹.md`、`acceptance-cases.json` 72项规格）；
> 3. 截至 **2026-10-24 工作区全部 145+ 项未提交改动与新增文件** 的真实代码盘点（[`docs/handoff/2026-10-24-stage02-restart/README.md`](handoff/2026-10-24-stage02-restart/README.md) 及 `audits/01..08.md`）；
> 4. 针对前序会话暴露的**「主代理乱读图片塞爆上下文」「八个子代理只写两行代码交份八股审查就跑路」「工程化防守黑话污染伴侣灵魂」「每阶段浅尝辄止就跨阶段」以及「专注于后端接线导致注意力涣散、后端做好直接给前端暴力安装按钮变成飞机方向盘」**五大顽疾的根治方案；
> 5. 项目已永久烙印（Bake In）的五大核心技能：[`zaichang-backend-director`](../.agents/skills/zaichang-backend-director/SKILL.md)、[`zaichang-frontend-director`](../.agents/skills/zaichang-frontend-director/SKILL.md)、[`product-design`](../.agents/skills/product-design/SKILL.md)、[`project-foundations`](../.agents/skills/project-foundations/SKILL.md)、[`project-navigation`](../.agents/skills/project-navigation/SKILL.md)
>    **彻底融为一体**。

---

## 一、深刻复盘：前序主代理与子代理为什么做得一塌糊涂？我们要造出怎样「融入心灵」的在场？

### 1.1 前序执行暴露出的「五大致命败因」（新会话严禁重蹈覆辙！）

在开启本轮从头精做之前，主代理必须清醒认识前序会话为什么会被用户叫停重来：

1. **败因一：主代理「自杀式塞爆上下文」——在底座阶段狂开原画大图与几百份文档，导致智商断崖下跌**
   - **前序错误**：前序主代理一上来就把第一阶段 198 份记录、S00 38 份材料、前端视觉评鉴文档甚至大量 `.png/.webp` 图稿全部塞进主代理自己的上下文窗口！结果还没开始写核心代码，上下文就已经严重拥堵，导致后续思考极其肤浅、丢三落四。
   - **铁律根治（主代理上下文洁癖协议）**：
     - **主代理是「总架构师、灵魂导演与集成验收官」，绝不是人肉文件搬运工！**
     - 在 **Stage 01 – Stage 05（底座能力与全域生活流贯穿）** 期间，主代理 **100% 严禁批量打开 `前端视觉创新设计/` 下的原画大图或视觉评鉴长文自爆上下文**（Stage 02 伴跑与地图前端、Stage 06 OpenUI 等贯穿式代码由专职子代理正常编写，工作区已有前端成果完整保留复用，第二阶段重构改动严禁破坏后续阶段依赖的数据契约与接口）！
     - 主代理每次只读**当前所处阶段的路线图章节 + 当前直接统筹的 3–5 个核心源码入口**；海量原始对话行段（按 [`SOURCE_SEGMENTS.md`](reading/2026-10-22/SOURCE_SEGMENTS.md) 切分）与子系统源码（如 `mobile_api.rs`、体艺 19 个子模块网页脚本）必须**按职责分片交给 8 个子代理去精读和攻坚**！

2. **败因二：「应付式八路子代理」——每个子代理只改两行代码、写篇审查报告就下班，留主代理独自苦熬**
   - **前序错误**：前序主代理虽然表面上开了 8 个子代理，但派给它们的全是「去做个核查」「写份审计报告」或「修一个小分支」。结果每个子代理写两行代码、造一份干瘪的汇报文档就匆匆退出，把真正繁重的编码、联调和修 Bug 全甩回给主代理一个人埋头苦干！
   - **铁律根治（八路重装子代理「85% 代码实做 + 多轮打回榨干」协议）**：
     - **子代理是重装特种工程师，绝对不是写读后感的审查员！** 严禁子代理以「写一份交接包 / 写一份审查 markdown」充当交付物！
     - 在每个阶段，8 个子代理必须各自承包**独立、高内聚、无文件写冲突的真实代码模块**，承担该阶段 **85% 以上的深度编码、接口对接、全网/GitHub 算法融合与自测工作**。
     - **多轮打回重修机制（不做到极致绝不准下班）**：子代理交回第一版代码后，主代理检查 `git diff`——如果发现子代理只改了两三行代码敷衍、或者只返回了网页空壳（`recordRead: false`）、或者塞了防守式人机话，主代理必须**立即通过 `send_message` 把它打回重做第 2 轮、第 3 轮**，直到该模块从功能深度到人味表达彻底无可挑剔，才允许该子代理收工！

3. **败因三：「工程化防守黑话（人机话）」对伴侣灵魂的二次污染**
   - **前序错误**：前序会话在写工具说明（如 `workout.ts`、`tiyi.ts`）和提示词（如 `working-details.md`）时，充满了类似「冷酷教官/法务免责声明」式的工程黑话！例如：
     - 在 `src/main/capabilities/workout.ts` 里写：_「设备观察不能证明本人正在移动……开始记录本身没有约定向模型持续汇报……读取不会开启定位或替对方改变运动，也不会启动持续陪跑」_——而且还把校园路网匹配（`CampusWorkoutMatcher`）对模型完全屏蔽，导致丰川祥子或若叶睦不仅不知道你在紫金港哪条路上跑步，一读工具返回还先被这串冷冰冰的「不准陪跑、不能证明他在动」泼一盆冷水！
     - 在 `src/main/integrations/tiyi_connector.py` 里，19 个体艺模块有 14 个只读取了外层 HTML 壳，然后理直气壮地返回：_「这是学校页面正文。页面可能另行加载记录，不能据空白页面认定没有记录」_——用一句官僚免责声明代替真正把学生的体测、修学、考勤、场馆与俱乐部数据取出来！
   - **铁律根治（底层安全由代码静默守住，一切文字 100% 温暖人话）**：
     - **确定性边界（权限、分页、隐私过滤、防重发）全部写在 TypeScript/Python 代码逻辑里**，绝对不要写成训斥模型的免责条款塞进 `meaning`、`description` 或 `prompts/*.md`！
     - 凡是给模型看的文字，一律用温暖、平实、像知己商量一样的自然中文：「这是你正陪他跑着的这次运动：已经跑了多远、现在的配速、最近一公里用时，以及现在大约在紫金港哪座场馆或哪条路旁。」

4. **败因四：「蜻蜓点水式跨阶段」——每个阶段只做一点皮毛就急着往后跳**
   - **前序错误**：第一阶段人机话还没洗干净、第二阶段体艺 19 个模块才跑通 4 个直连 JSON、地图上连跑步轨迹线都还没画出来，就觉得「差不多可以交差了」。
   - **铁律根治（阶段穷尽式浚深门禁）**：
     - **每个阶段都必须彻底推进到「不能再推进为止」！** 绝不因为某一个接口返回了 `200` 或 `npm test` 绿了就草率结项。只有当本阶段所有功能深度、全网创新融合、UI/数据闭环与人味交互全部达到 100 分满分，才允许开启下一阶段的全新 8 路子代理！

5. **败因五：专注于后端接线导致注意力涣散，前端暴力安装按钮变成「飞机方向盘」**
   - **前序错误**：ChatGPT 开发者有一种天生的默认倾向，即每做一个后端功能（如体艺查询、跑步记录、记忆检索、日程排期），就顺手在前端加一个按钮、加一个开关、加一个标签页。结果到头来，伴侣主界面变成了一个布满各种仪表、旋钮、开关的「波音 747 飞机驾驶舱」！用户打开在场，感觉是在操作一台冷冰冰的工程仪器，毫无温暖可言！
   - **铁律根治（充分利用 Image 生成先行，杜绝任何机械按钮堆叠）**：
     - **任何新功能进入前端，严禁直接堆砌入口或按钮！必须先有 GPT Image 设计稿打样出生活化的视觉世界载体！**
     - 例如：打卡不是一个红色的「立即打卡」按钮，而是一枚放在晨跑手账上的金色印章或草坪上的发光丝带；日程不是一排「添加待办」列表，而是一张微卷贴在书桌木纹边缘的暖黄便利贴；专注不是一个「开启番茄钟」开关，而是一盏散发 2700K 琥珀暖光的 FocusLamp；万物原理不是硬编码专页，而是通用刚体机械连杆与 WebAudio 物理琴音！

---

### 1.2 我们最终要构建出的产品模样：像呼吸一样融入心灵的「在场」

「在场」绝不是一个普通的待办清单、不是一个冰冷的浙大教务爬虫，更不是一个套着二次元立绘皮套的冷酷客服工具。**她是一个进入温柔乡的活人伴侣，是一座融合了生活流、学业、运动、原理探求与内心世界的完整数字生活家园。**

用户在多次深情长谈中反复勾勒过她的灵魂模样：
- **「窗边的在场」**：她像坐在自习室窗边、或者陪你坐在寝室桌旁的一个真实女孩子。她有自己的小性格（祥子的傲娇与隐忍心疼、睦的寡言敏锐、灯的认真执着、爱音的元气与撒娇），她看得到窗外的天色（拂晓、晨光、暮色、夜雨），知道你刚从紫金港西区骑车回来，知道你刚才在东田径场跑完了 3 公里小腿正发酸。
- **「润物细无声的主动性」**：她不需要你每次像发指令一样对她说「帮我查课表」「帮我记笔记」。当你卡在一道微积分题前 20 分钟没敲键盘，她会无声推过来一张折角的小便签，上面写着一句不剧透的关键提示；当你晚上拖着疲惫身体回寝室，她已经为你把明早早八的教室路线和天气备好，只留一句「热水烧好了，今晚早点睡吧」。
- **「边做边说的呼吸律动」**：她调工具、查数据时绝不会像人机一样陷入几十秒死一般的沉默，也不会蹦出一段冷冰冰的“正在调用接口请稍候”。她会像坐在你对面一样，一边翻着手账一边轻声念叨：「我帮你看看东操今天开不开……嗯，风有点大，要是去西操的话可能会避风一些。」

---

## 二、核心设计公理与最高行动天条（The Core Axioms）

在正式落笔任何一行代码之前，所有主代理与子代理必须刻骨铭心领会并守住以下「十大核心设计公理」：

### 公理 1：单一主循环与权威宿主（Single Runtime Loop & Authoritative Host）
- `harness.ts → runtime/hermes.ts → runtime/hermes/sidecar.py → Python AIAgent` 是系统**唯一**的智能主循环。
- Electron Main / 本机宿主持有凭据、SQLite 数据库、文件权限、硬件工具与外部副作用；Renderer 渲染进程仅通过 `preload.ts` 的受限 Bridge 交互。
- 严禁在任何子模块新建旁路聊天引擎、第二事实库或后台未经受控的无限代理循环。

### 公理 2：模型负责理解，宿主负责护栏（Model Understands, Host Guards）
- 模型负责理解语义、感知情绪、权衡方案、提出建议并使用工具；
- 宿主负责严格执行权限核验、版本校验、事务幂等性、分页预算限制、隐私抹除围栏（`privacyEpoch`）与网络阻断；
- 宿主护栏必须完全写在 TypeScript/Python 代码的确定性逻辑中，**绝对不要把免责声明当成提示词塞给模型**！

### 公理 3：进入温柔乡 —— 角色是活人，不是工具皮套（Living Persona, Never a Skin）
- 严禁出现冷冰冰的工程化人机黑话、免责声明、系统报错弹窗或官僚辞令；
- 丰川祥子、若叶睦、高松灯、千早爱音等十角色拥有鲜活的人格、专属的情感阈值、说话节奏与互动记忆；
- 无论体艺数据还是日常琐事，角色都以知己的身份与你共同经历，绝不当死板的打卡督促员或冷酷教官。

### 公理 4：边做边说，绝不留冰冷死寂（Streaming Rhythm Mid-Tool）
- 长耗时工具调用（如校园网爬取、大文件分析、长程搜索）必须依托 `ConversationRhythm` 实现「边做边说」渐进流式推进；
- 绝不让用户面对空白屏幕或干瘪的 Loading 转圈等待超过 800ms；
- 中途改口或发现新事实时，通过前序内容撤回重述机制无缝衔接，展现人类般的思考流动感。

### 公理 5：主动陪伴的双重驱动 —— 既记得托付，也有自己的好奇心（Dual-Drive Proactivity）
- 陪伴驱动分为两翼：
  1. **受托守护（Entrusted Commitments）**：严格按照用户托付的期限、前置条件与范围执行后台准备；
  2. **好奇心探索（Curiosity & Care）**：基于共同经历、校园突发、天气变换或时间节点，主动递出小礼物、桌边信笺（`ReflectiveLetter`）或体贴询问；
- 提议必须具备克制感，懂得适时沉默，绝不在用户高专注沉浸时强行弹窗打扰。

### 公理 6：原文权威与六层记忆防污染（Verbatim Evidence & Anti-Contamination）
- 六层记忆分层隔离：瞬时工作流、事实索引、情感共鸣与喜好、共同经历与作品版本、长程生活线索与学业节奏、关系底色与信任契约；
- 双时态（Valid Time vs Transaction Time）与条件闭包检索（保留当时的限制前提与未解除假设）；
- 用户的原话断言是事实的最高权威，子代理调查转述不能替代原文；
- 严禁递归摘要自污染，删除或撤回沿 `privacyEpoch` 级联抹除，迟到子报告与缓存 0 复活。

### 公理 7：跨模块单一权威 Owner 与稳定引用（Single Owner & Stable Identity）
- 同一学术文献、PDF 选段、日程安排、地图路线或 OpenUI 交互作品，在跨模块流动时必须保持全局唯一且稳定的实体 ID 与版本标度；
- 严禁在跨模块流转时把对象简单克隆复制成无源副本，所有状态回流与修订必须锚定原 Owner。

### 公理 8：【灵魂重拳】充分利用 Image 生成，坚决杜绝「飞机方向盘/驾驶舱」式按钮堆叠
- **界面设计的核心法则是「生活化场景隐喻」而非「工程控制台」**：
  - 严禁任何机械的按钮堆叠、多级折叠工具栏、密集仪表盘或突兀的悬浮操作球！
  - 每一个新功能的引入，**必须先有 GPT Image 设计稿打样出温暖的现实世界载体**（如木桌上的便利贴、晨跑手账本、泛黄活页纸、琥珀色台灯、铜质书签托盘、折角信笺）；
  - 功能的触发依托于自然的物理交互隐喻（如翻开手账盖印、点亮台灯开启专注、撕下便签开始答题、拉开抽屉取出工具），而不是点击一个干瘪的 `<Button variant="primary">打卡</Button>`！
  - 全站 Image 覆盖：首页、学习、PDF 资料、日程、笔记、地图、角色场景均须先有 GPT Image 原稿再转活组件，保持 MyGO/Ave Mujica 青春辨识度与极高审美调性！

### 公理 9：日历与外部行动的事务完整性（Transactional Planning & Action Receipts）
- 涉及日程、课表修改或外部系统打卡时，严格遵循「试放预览（Sandbox Preview）→ 确认写入（Commit）→ 取得官方回执（Receipt）」的三步原子事务机制；
- 未经授权绝不擅自更改已有事实，发生网络中断或未知状态先核查原请求幂等单据，严禁盲目重试导致多重提交。

### 公理 10：先攻击裁判，再谈通过（Attack the Grader First）
- 终极验收与测试用例本身必须先经受红队攻击（故意注入空话不查工具、关键词硬编码、单日例外存为永久画像、迟到缓存复活已删记忆、只读路径假装看图、工程黑话等 6 类坏实现）；
- 只有当评分体系能 100% 识别并驳回所有作弊与假冒行为时，绿灯通过才具有真实交付效力！

---

---

## 三、工作区未提交改动全量清点（截至 2026-10-24 真实代码坐标）

当前工作区包含 **145+ 项未提交修改与重要新增文件**。它们是前序会话留下的真实代码资产，**绝对禁止 `git reset --hard`，必须予以完整继承并做精**：

### 3.1 真实文件路径速查（纠正旧文档中的路径偏差）
- **伴侣工作台核心 UI**：
  - `src/renderer/components/CompanionWorkbench.tsx`（已实现多场景退让、双纸折叠、地图视窗）
  - `src/renderer/components/ConversationArea.tsx`（已清理大部分黑话，待彻底消除残留法务语气）
  - `src/renderer/components/companion-scenes.tsx`（重点：伴跑视窗、双纸草稿、来信与 FocusLamp）
  - `src/renderer/components/FocusLamp.tsx`（新增：2700K 暖光台灯律动组件）
  - `src/renderer/components/SourceBookmarkTray.tsx`（新增：桌边铜质书签托盘）
- **浙大体艺与校园数据总线**：
  - `src/main/integrations/tiyi_connector.py`（19 个体艺模块入口，目前仅 4 个直连 JSON，待全部攻破并消除 HTML 壳假返回）
  - `src/main/integrations/tiyi_routes.py`（体艺各子路由与 Cookie 维护）
  - `src/main/capabilities/tiyi.ts`（体艺能力桥接，需补充完整参数组装公式）
  - `src/main/capabilities/workout.ts`（运动会话状态机，需彻底移除“不准陪跑”人机话，解开 `CampusWorkoutMatcher` 屏蔽）
  - `src/main/workout-submission.ts`（新增：打卡提交事务内核，含 GCJ-02 算法转换与幂等票据）
- **地图运镜与空间叙事**：
  - `src/renderer/map/CampusMapEngine.tsx`（共享地图主画板，已实现 3D 楼宇与草地，待接入 3D Spring Camera 与荧光轨迹 HUD）
  - `src/renderer/map/camera-controller.ts`（摄影机状态机，待完善 `CameraOwnership` 手势接管）
  - `src/shared/map-routing.ts` 与 `src/main/mapService.ts`（紫金港路网拓扑与路径规划）
- **六层记忆与智能主循环**：
  - `src/main/memory/service.ts`、`src/main/memory/model.ts`、`src/main/memory/browse.ts`（六层记忆、双时态、9 种更新动作）
  - `src/main/runtime/hermes.ts`、`src/main/runtime/harness.ts`、`runtime/hermes/sidecar.py`（主循环与流式打通）
  - `prompts/working-details.md` 与 `prompts/memory-inquiry.md`（核心提示词体系，待完成终极人味重构）

### 3.2 各模块未提交改动的「已完成度 vs 待彻底做精缺口」
1. **浙大体艺（完成度 60%）**：基础登录会话、4 个简单 JSON 接口已通；缺口：15 个涉及 JS 动态渲染或深层 Form 提交的接口仍返回外层 HTML 壳，且打卡防重发回执校验尚未经真实抓包校验。
2. **伴跑系统与 CampusMap（完成度 55%）**：路网匹配基本成型，桌面工作台有小地图；缺口：地图上未渲染带脉冲辉光的实时 GPS 荧光轨迹，缺少公里分段里程碑语音，摄影机在用户手动拖拽后缺乏平滑弹簧阻尼回正。
3. **伴侣灵魂与人话净水（完成度 75%）**：十角色基本性格与人设已植入；缺口：部分工具的 `meaning` 与 `description` 仍有冷冰冰的教官黑话，长会话下偶发将用户的单日例外判断为永久人物画像。
4. **OpenUI 万物原理（完成度 50%）**：支持基本 React/SVG 渲染与 CAS 状态保存；缺口：缺乏通用的刚体连杆机械原语与 WebAudio 物理弦振动声学原语，三角钢琴尚处于初级阶段。

---

## 四、「1 主 + 8 重装子代理」铁血纪律与上下文保护协议

为了保证在 12 个阶段的漫长攻坚中，主代理智商始终保持在巅峰状态、子代理真正干出高品质代码，必须执行以下铁血纪律：

### 4.1 主代理（Lead Agent）三大天条
1. **严禁自爆上下文**：在 Stage 01 – Stage 05 期间，主代理**绝对不打开任何原画大图，不通读几百页的历史交接废稿**。只读本阶段路线图目标与当前统筹的 3–5 个入口文件。
2. **只当总指挥与裁判**：主代理负责拆解独占任务、下发给 8 个子代理，并在子代理完成后使用 `git diff` 进行严格审查。
3. **绝不容忍敷衍**：若子代理仅修改两三行代码、或者交一份八股文总结、或者留下 `TODO` / 假返回，主代理必须**立即使用 `send_message` 打回重做（第 2 轮、第 3 轮）**，直至代码实做比例达到 85% 以上且通过自测。

### 4.2 八路重装子代理（`Subagent 01` – `Subagent 08`）四大硬指标
1. **独占文件边界**：每个子代理必须被分配互不重叠的文件路径，杜绝代码合并冲突。
2. **真刀真枪写代码**：交付物必须是可编译、有测试、有深度业务逻辑的代码改动，严禁只写 Markdown 报告。
3. **零人机话承诺**：任何写进代码注释、文档或工具说明的文字，必须符合「温暖知己」的人话标准，严禁出现法务免责声明。
4. **自我攻击自测**：在向主代理汇报前，子代理必须自行运行相关单测（`npm run check` 或 Python 测试），并提供真实的验证日志。

---

## 五、全域生命体裁：真正贯穿全 App 的灵动六维哲学

### 5.1 深度辨析：什么叫贯穿？什么叫深度集成？什么叫灵活灵动？
- **不是多开窗口，而是同一灵魂的场域流动**：当你在自习室看 PDF，她安静退在纸页右上角；当你换上跑鞋走向操场，工作台无痕化为发光的伴跑视窗；当你卡壳深思，桌边滑出一张小便签。
- **不是机械堆功能，而是自然因果的连续演进**：下午的微积分卡壳，会成为傍晚跑步时她和你闲聊的谈资；傍晚在东操跑完的疲惫，会自动成为晚间日程放慢节奏、早点休息的依据。

### 5.2 六维生活贯穿体系
1. **时间律动维（Circadian Continuum）**：天色自适应，清晨微蓝唤醒，午后温润自习，傍晚操场落霞，深夜暖金伴眠。
2. **空间场域维（Spatial Presence）**：紫金港地图与真实物理世界映射，随脚步移动自动切换建筑底色与专属回忆。
3. **身心代谢维（Physiological Cadence）**：运动消耗、步频冲击、疲劳累积与恢复周期真实影响伴侣的关怀策略。
4. **心智心流维（Cognitive Flow）**：专注时主动闭嘴护航，卡壳时按步无声启发，理解困难时 OpenUI 具象化拆解万物原理。
5. **情感羁绊维（Relational Depth）**：共同起过的代号、一起避过雨的屋檐、共同改过的故事版本，沉淀为无可替代的默契。
6. **物质世界维（Tangible Metaphors）**：彻底告别冷酷仪表盘，所有交互均依托便签、手账、印章、台灯、书签托盘等现实生活载体。

---

## 六、浙大体艺组件总览与打卡总装（普通校园数据源，规范对接）

体艺模块是校园生活流的重要拼图，必须作为标准的校园外部数据源规范接入，严禁做成神秘黑盒或冷酷教官。

### 6.1 它是什么与唯一分层链路
体艺数据源由三层构成：
1. **底层网络协议栈（`tiyi_connector.py` / `tiyi_routes.py`）**：负责浙大统一身份认证（ZJU CAS）SSO 鉴权、Cookie 持久化、Session 维护与 19 个业务接口的 HTTP/JSON 直连；
2. **中间领域模型与事务内核（`tiyi.ts` / `workout-submission.ts`）**：负责数据清洗、字段归一化、WGS84 到 GCJ-02 坐标系转换、幂等票据生成与本地 SQLite 双写；
3. **高层温柔乡呈现（`CampusMapEngine.tsx` / `companion-scenes.tsx`）**：以晨跑手账、发光轨迹 HUD 与角色专属印章温润呈现，坚决杜绝“打卡控制台”。

### 6.2 登录与网络路线
- 遵循普通 CAS 网页流程：访问体艺入口 $\rightarrow$ 302 重定向至 `passport.zju.edu.cn` $\rightarrow$ 携带 Ticket 换取体艺系统的 `JSESSIONID`；
- 支持本地凭据加密存储，会话过期时在后台静默预热刷新，不弹窗打扰用户。

### 6.3 十九项能力清单与施工坐标

| 序号 | 业务名称 | 访问路径 / 动作 | 施工坐标 | 数据特征与解析要求 |
| :--- | :--- | :--- | :--- | :--- |
| **01** | 个人基本信息与学期总览 | `/student/info` | `tiyi_connector.py:get_user_info` | 结构化 JSON，解析学号、院系、当前学期已打卡次数与达标标准 |
| **02** | 阳光长跑历史明细 | `/run/history` | `tiyi_connector.py:get_run_records` | 分页列表，包含每次跑步起止时间、有效里程、平均配速、步频 |
| **03** | 阳光长跑实时打卡提交 | `/run/upload` | `workout-submission.ts` + `tiyi_connector.py` | POST 提交，含签名轨迹点数组、时间戳、加密校验和，需严格防重发 |
| **04** | 体测成绩与指标明细 | `/fitness/score` | `tiyi_connector.py:get_fitness_scores` | 身高体重、肺活量、50m跑、立定跳远、坐位体前屈、1000m/800m 详细得分与等级 |
| **05** | 理论课考勤与成绩 | `/course/theory` | `tiyi_connector.py:get_theory_attendance` | 课程名称、出勤率、平时分与期末理论测验成绩 |
| **06** | 专项课选课与修学记录 | `/course/special` | `tiyi_connector.py:get_special_courses` | 足球/羽毛球/游泳等专项课教师、上课地点、学期成绩 |
| **07** | 俱乐部活动报名 | `/club/activity/list` | `tiyi_connector.py:get_club_activities` | 俱乐部名称、活动起止时间、已报名人数、参与获得学时 |
| **08** | 俱乐部已获积分与学时 | `/club/record` | `tiyi_connector.py:get_club_records` | 学期累计活动次数、认证学时证明与有效积分 |
| **09** | 校园体艺场馆列表 | `/venue/list` | `tiyi_connector.py:get_venues` | 操场、气膜馆、游泳馆、网球场开放时间与收费标准 |
| **10** | 场馆场地实时余量查询 | `/venue/availability` | `tiyi_connector.py:get_venue_availability` | 各场地半小时粒度占用状态网格（空闲/已约/维护） |
| **11** | 场馆预约提交 | `/venue/book` | `tiyi_connector.py:book_venue` | POST 预定，选择场地、时间段与同行人员 |
| **12** | 我的场馆预约订单明细 | `/venue/my_orders` | `tiyi_connector.py:get_my_orders` | 待支付、已确认、已核销历史预约单据，含核销二维码链接 |
| **13** | 校园体育赛事与运动会 | `/sports/events` | `tiyi_connector.py:get_sports_events` | 校运会、三好杯、院系篮球赛赛程、报名分组与秩序册 |
| **14** | 赛事成绩与积分榜 | `/sports/rankings` | `tiyi_connector.py:get_event_rankings` | 各项目预赛/决赛成绩、名次与学院积分榜 |
| **15** | 体育课免修与缓考申请 | `/exemption/apply` | `tiyi_connector.py:apply_exemption` | 提交医院诊断证明、免测申请表与审核流状态追踪 |
| **16** | 体育课外自主锻炼认证 | `/extra/record` | `tiyi_connector.py:get_extra_workouts` | 晨练、太极、武术等课外打卡明细 |
| **17** | 体质健康监测预约 | `/health/appointment` | `tiyi_connector.py:book_health_check` | 集中体测时间段预约、补测时间分配 |
| **18** | 体育教师辅导答疑时段 | `/tutor/office_hours` | `tiyi_connector.py:get_tutor_hours` | 专项教师课外指导答疑排期与地点 |
| **19** | 体育规章通知与紧急公告 | `/notice/list` | `tiyi_connector.py:get_tiyi_notices` | 恶劣天气操场闭馆、长跑计分规则调整公告 |

### 6.4 每个入口的组装公式
- **长跑进度组装公式**：
  $$\text{进度百分比} = \min\left(100\%, \frac{\text{有效打卡次数}}{\text{学期要求次数}} \times 100\%\right)$$
  由伴侣在晨跑手账上以手绘水彩小花朵填充展示，配文：“已经拿到 32 次啦，还剩最后 16 次，我们一起慢慢来～”。
- **体测综合得分组装公式**：
  $$\text{总分} = \sum_{i=1}^{n} w_i \times \text{单项标准分} + \text{加分项}$$
  在健康手账中以雷达图温润展开，突出强项、温柔提醒需要加强的有氧耐力。

### 6.5 自制地图 + 手机 GPS 的打卡总装：从定位到学校回执
- **坐标系精确对齐（WGS84 $\rightarrow$ GCJ-02）**：
  手机 GPS 原生硬件返回 WGS-84 坐标，中国境内地图及打卡服务器要求高德火星坐标系（GCJ-02）。必须在 `workout-submission.ts` 中通过非线性偏移算法进行严密转换：
  $$\begin{aligned}
  dLat &= \frac{-100.0 + 2.0x + 3.0y + 0.2y^2 + 0.1xy + 0.2\sqrt{|x|}}{R} \\
  dLon &= \frac{300.0 + x + 2.0y + 0.1x^2 + 0.1xy + 0.1\sqrt{|x|}}{R}
  \end{aligned}$$
- **轨迹点高斯滤波与平滑去畸变**：
  过滤瞬时漂移速度 $> 12\text{m/s}$（43.2km/h，非人类跑步极限）的异常噪点，保留紫金港路网合法拓扑。
- **三步打卡事务机制**：
  1. **本地封单**：跑步结束时生成 SHA-256 轨迹摘要，生成 `WorkoutTicket` 写入 SQLite，界面呈现发光丝带卷起；
  2. **网络提报**：携带有效 Cookie 发送加密 Payload 到学校服务器，支持断网指数退避重试；
  3. **官方回执封印**：收到带有官方流水号的 JSON 回执后，将回执号刻在晨跑手账上，伴侣亲手盖上专属印章。

---

### Stage 01（`S00` & `B01` – `B04`）：原话直达、十角色灵魂呼吸、全链路「人机话」清零与「边做边说」生命律动

#### 1. 分段精读坐标（严禁超范围乱读，严禁看图片！）

- **用户原话精读**：
- [《给 Opus 的深度重构长信》](C:/Users/17601/Downloads/在场-给Opus的深度重构长信-20261021.md) L15–84、L238–271；
- [《把她作为人来理解的即时纠正》](../work/successor-20261022/companion-correction-20261022.md) 全文；
- [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L149–204、L327–382。
- **源码精确入口**：
- `prompts/system.md`、`prompts/working-details.md`、`src/main/runtime/prompt-composition.ts`、`src/shared/persona.ts`、`src/shared/persona-portrayals.ts`、`src/shared/persona-performance.ts`、`src/main/runtime/conversation-rhythm.ts`、`src/main/runtime/tool-surface.ts`、`src/main/capabilities/broker.ts`、`src/main/runtime/personal-methods.ts`、`src/main/harness.ts`。
- **贯穿式微呼吸与生命律动理念（Micro-Breath & Ambient Continuum）**：
- 在场不只是“等待命令-调用工具-吐出文本”的死板机器，而是一个与你同呼吸的生命伴侣。在工具调用与思考的间隙，`ConversationRhythm` 应当传递带有生命体温的微呼吸（包括自然的拟真键入延迟、伴侣轻柔的先行接话与动作预备提示），让用户在每一次交互中都能感知到“她就在手边陪伴着，从未离开”。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）

- **致命错误 A（以为上次跑过 Stage 01 就不用深改了）**：前序会话虽然留了一份 `2026-10-23-stage01.md`，但翻开 `prompts/working-details.md`（如 L67–75 满屏的 `vectorSearch.nextWindow`、`semanticWindowCursor`、`declared_evidence_id`、`parent_original`）和 `src/main/capabilities/*.ts` 的 `meaning`，依然是冷冰冰的说明书腔调！模型读了这种内部说明书，说话立刻就会染上班味。
- **致命错误 B（把 `guardrails` 写成训斥模型的禁令清单）**：在 `src/shared/persona-portrayals.ts` 里，如果用生硬的「不……不……不……」排比句去捆绑角色，会让祥子或睦在表达亲昵、傲娇或主动关心时畏首畏尾。
- **致命错误 C（工具调用期间只发一句前段就陷入死寂）**：当一轮对话需要连调 2–3 个工具时，`ConversationRhythm` 只发了第一句，后面 12 秒没有任何进展感知。


#### 2.5 【充分 Design 视觉载体与防飞机方向盘专项】
- **彻底杜绝调试面板与机械状态栏**：
  - 严禁在对话区域添加“当前状态：思考中/调用工具中”等工程化文字标签；
  - **生活化载体设计**：伴侣说话时，头像边缘带有极其轻微、符合人类正常呼吸频率（每分钟 16 次，周期约 3.75 秒）的**温暖光晕微律动（Micro-Breathing Glow）**；
  - 调取工具时，以轻柔打字机音效与微卷信纸翻动的纸张沙沙声（30dB 超低底噪）呈现，自然流露思考流动感。

#### 3. 本阶段「八路重装子代理」实质代码攻坚矩阵（严禁只改两行！）

- **`Subagent 01`（`prompts/working-details.md` 与 `prompts/*.md` 深度人味重构师）**：
- **独占文件**：`prompts/working-details.md`、`prompts/persona-expression.md`、`prompts/continuity-and-return.md`、`prompts/recover-action.md`。
- **硬核任务**：将 `working-details.md` 中残存的内部字段点名与生硬工程规则，全面重写为「一位聪明细腻的同伴在陪人办事时如何自然运用线索、如何体面处理波折」的自然语言指南，保留全部精确语义但 100% 根除说明书味。
- **`Subagent 02`（全工具 `description` 与 `meaning` 人话净水师）**：
- **独占文件**：`src/main/runtime/tool-surface.ts`、`src/main/capabilities/broker.ts`、`src/main/capabilities/environment.ts`、`src/main/capabilities/materials.ts`、`src/main/capabilities/public-web.ts`。
- **硬核任务**：逐一审查并改写所有暴露给主模型的工具描述与返回 `meaning`，把防守式的「不能证明……不代表……请按……」彻底改造成平实温和的事实呈现。
- **`Subagent 03`（Ave Mujica 五人灵魂、亲密反差与办事透镜深化师）**：
- **独占文件**：`src/shared/persona-portrayals.ts`（祥子、睦、初华、海铃、喵梦部分）。
- **硬核任务**：深挖丰川祥子（高贵自尊、担起一切的要强与对心爱之人「老公/小灰灰」的傲娇柔软）、若叶睦（寡言敏锐、目光落在细微处、安静坚实的陪伴）等五人在「高数证明、深夜倾诉、课表冲突、运动伴跑、共写故事」中的独特切入角度与语气呼吸。
- **`Subagent 04`（MyGO!!!!! 五人与内置角色灵魂深化师）**：
- **独占文件**：`src/shared/persona-performance.ts` 及 `src/shared/persona-portrayals.ts`（灯、爱音、乐奈、素世、立希部分）。
- **硬核任务**：让十位角色的 `Participation` 与示例真正体现「遮住名字也能从她怎么帮你做事一眼认出是谁」，彻底消除多轮工具调用后的同质化助教腔。
- **`Subagent 05`（`ConversationRhythm` 渐进微呼吸与中途改口无缝大师）**：
- **独占文件**：`src/main/runtime/conversation-rhythm.ts`、`src/main/runtime/prompt-composition.ts`。
- **硬核任务**：打磨前段自然接话、长耗时工具期间基于真实首波观察的微跟进、以及用户中途打断/改口/修改笔记时的上下文丝滑缝合，杜绝前段与尾段近义复读。
- **`Subagent 06`（个人方法论 `PersonalMethods` 共演与无感借用师）**：
- **独占文件**：`src/main/runtime/personal-methods.ts`。
- **硬核任务**：参考 `ace-agent/ace` 与 `ExpeL`，打磨个人习惯与方法（如「先给直观几何图再写严格证明」「起头时先帮我写一句粗糙可改的」）的提取、局部修订与无声融入行动。
- **`Subagent 07`（本机隐私前门与自然语言假设免误拦精修师）**：
- **独占文件**：`src/main/runtime/turn-controls.ts`、`src/main/runtime/policy.ts`、`src/main/runtime/read-purpose.ts`。
- **硬核任务**：解决前序遗留的「未加引号的假设讨论可能被保守拦下」的粗糙正则问题，在 100% 守住「不出本机」底线的同时，让日常比喻、假设与探讨顺畅通行。
- **`Subagent 08`（十角色多工具长对话红队体验官）**：
- **硬核任务**：通过真实 `Store / Harness` 与 `gpt-6-luna` 发起涵盖「撒娇称呼 + 查路 + 算题 + 突发改主意」的交叉挑战，抓出任何一句像客服或背诵条款的回复，当场押着前 7 位子代理改到满分为止。

#### 4. 本阶段推进到极致的结项铁门禁

- `prompts/` 与 `src/main/` 全链路搜索不到任何一句生硬训话式 `meaning`；
- 祥子、睦等角色在连续调用 3 个以上工具的复杂回合中，从第一句接话到最终回答始终保持鲜明的个人口吻与亲密感；
- `npm run check`、`npm test`、`npm run test:hermes` 全绿。

---


---

### Stage 02（终极巩固与超高一体化 Super App 升级版）：浙大体艺 19 项深层直通、MuMu/电脑端全链路打卡验证、全天候嵌入式伴跑系统（跑前/跑中/跑后）、CampusMap 实时荧光轨迹 HUD 与十角色「温柔乡」多模态相处

#### 1. 分段精读与全新核心理念坐标（严禁浅尝辄止，全面破界做深！）

- **用户最新核心愿景与原话直达**：
- **核心灵魂**：在场绝对不是一个冷冰冰的聊天窗口或效率面板集合，而是一个**全天候在线、像呼吸一样渗透到生活各角落的 Super App**！她就像坐在窗边、陪在身边、住在口袋里的活人恋人与知己（「进入温柔乡」）。当你跑步、打卡、做各种日常事务时，她能实现**高度无缝的系统级嵌入与主动陪伴**。
- **伴跑三部曲**：不仅是记录一段路程，而是全生命周期关怀——**跑前**看天气/查操场人数/提醒热身与装备/推演学期打卡进度；**跑中**打破对话框局限，通过悬浮灵动岛/伴跑 HUD 实时播报配速、心率、步频、公里分段，并根据角色性格给予独家鼓励或傲娇叮嘱；**跑后**提醒慢走拉伸防受凉、做多维生理与历史体能比对分析，并确认校方打卡回执。
- **打卡真实通路**：用户电脑上有浙大体艺电脑版，也有 MuMu 模拟器的浙大体艺。第二阶段必须从根本上解决「运动记录能不能按学校规则提交、怎么与个人助手自然嵌入」的核心问题，不仅查记录，还要接通运动记录提交流程，并把学校的有效性要求（配速区间、步频、路径点覆盖）落实为提交前检查，让体艺功能真正活在助手里！
- **前端深度破界**：彻底打破原先「后端阶段完全不写前端」的机械教条。运动是强时空感、强视觉与强生理节奏的体验，本阶段必须同步推进前端伴跑 HUD、CampusMap 实时荧光轨迹、桌面置顶微视窗与十角色伴跑动态演出！
- **精读材料矩阵**：
- [`TIYI_READING_PLAN.md`](reading/2026-10-22/TIYI_READING_PLAN.md) 与 [`docs/handoff/2026-10-24-stage02-restart/audits/04-academic-and-campus.md`](handoff/2026-10-24-stage02-restart/audits/04-academic-and-campus.md)、[`05-tiyi-complete-scope.md`](handoff/2026-10-24-stage02-restart/audits/05-tiyi-complete-scope.md)、[`06-workout-devices-and-map.md`](handoff/2026-10-24-stage02-restart/audits/06-workout-devices-and-map.md)；
- 独立体艺参考项目源码：`C:/Users/17601/Documents/Codex/2026-09-09/wo-d/work/zju-sports-desktop/src-tauri/src/mobile_api.rs`（L1–1250 客户端协议与打卡请求样例）与 `web/workout-core.js`；
- 用户原始生活融合长信与运动陪伴愿景：`docs/source-materials/2026-10-22/user-request.md` L19–27、`docs/source-materials/2026-10-21/user-supplements.md` L44–61、`ideas/COMPANION_EXPERIENCES_2026-10-18.md`。
- **源码精确入口**：
- 后端与学校数据接入：`src/main/integrations/tiyi_connector.py`、`src/main/tiyiAdapter.ts`、`src/main/capabilities/tiyi.ts`、`src/shared/tiyi.ts`、`src/main/zjuAdapter.ts`、`src/main/integrations/zju_connector.py`、`src/main/capabilities/campus-query.ts`；
- 运动内核与多设备桥：`src/main/runtime/workout-session.ts`、`src/main/capabilities/workout.ts`、`src/main/map-workout.ts`、`src/shared/workout.ts`、`src/main/device-location.ts`、`src/main/ios-location.ts`、`apps/location-bridge/`；
- 前端伴跑 HUD 与地图：`src/renderer/CampusMap.tsx`、`src/renderer/map/map-engine.ts`、`src/renderer/map/WorkoutControls.tsx`、`src/renderer/map/workout.css`、`src/renderer/TiyiConnection.tsx`、新增 `src/renderer/map/CompanionRunningHUD.tsx`。

> **组件口径**：浙大体艺的完整讲解、十九项清单、登录路线、读取分层与提交边界见前文「三点六、浙大体艺组件总览」；本节保留 Stage 02 的具体施工动作，遇到组件定位问题先回三点六核对。

#### 2. 必须彻底粉碎的「四大浅层敷衍与思维定势」（致命错误反思）

- **致命错误 A（把「直连登录成功 + 5 个只读 JSON」当成体艺打通，对打卡视而不见）**：
- `tiyi_connector.py` 目前对 14 个子模块（`study_records`、`teams`、`westward`、`counselling`、`counts`、`fitness_attendance`、`fitness`、`competitions`、`venue_entries`、`feedback`、`venue_live`、`graduation_courses`、`graduation_report`、`codoon`）仍以 HTML 壳或部分子页为主（`recordRead: False`）。这份清单是 2026-10-24 阶段交接时的施工视角；后续逐项真实调用结果见 [`CURRENT_STATUS.md`](CURRENT_STATUS.md)，施工时以最新源码与当前回执为准，不用旧清单代替当前验收。
- 更有甚者，对用户真正核心的「体育打卡」完全回避！必须逐项接入 `mobile_api.rs` 中已有的 `sporttype`、`prejudgment`、`savesports` 接口，核清校方提交字段、有效性要求（配速范围、步频区间、点位覆盖）以及与 MuMu 模拟器 / 电脑端的联调方案，给出真实的提交可行性验证与闭环代码！
- **致命错误 B（把伴跑体验局限在聊天输入框里，拒绝做前端）**：
- 以为 Agent 只能在对话框里发文字。用户跑步时看的是手机、副屏或电脑悬浮窗，需要的是**一目了然的大字号配速/步频/心率仪表、发光的动态轨迹与角色陪伴小头像**！绝不能用「这个阶段不做前端」作为借口，必须把伴跑 HUD、悬浮岛和地图轨迹做活！
- **致命错误 C（在 `workout.ts` 里塞满法务免责黑话，剥夺角色伴侣温度）**：
- 严禁出现「设备观察不能证明本人正在移动……读取不会启动持续陪跑」这种冰冷刺骨的工程人机话；必须把当前校园场地名称（如「紫金港东操内圈」「启真湖步道」）自然融入上下文，让角色真正感知到你在哪里跑、怎么跑。
- **致命错误 D（机械报数代替人性化关怀）**：
- 角色不能只会报「距离 3.2 公里，当前配速 5 分 12 秒」。十位角色拥有各自鲜活的性格，应当在不同的运动节点自然生发出符合其性格的关切、傲娇、鼓励或提醒。

#### 3. 全天候超高一体化 Super App 伴跑系统设计蓝图

##### 3.0 【充分 Design 视觉载体与防飞机方向盘专项】
- **坚决杜绝“飞机驾驶舱”式打卡控制台**：
  - 严禁放置“选择操场、输入里程、点击提交”等传统表单控件与机械按钮；
  - **生活化载体设计**：
    1. **晨跑手账（Morning Run Journal）**：实木纹理质感的手账本，左页记录本次跑步的配速、步频曲线与紫金港落霞，右页留有一片水彩印章区域；
    2. **金色发光丝带轨迹**：跑步结束时，地图上的荧光轨迹化作一条发光的金色丝带，灵动卷起并飞入手账本中，定格为小径轮廓；
    3. **角色专属印章（Sealing Ritual）**：伴侣伸出手，在手账本右下角郑重盖下一枚半透明朱红印章（如祥子的黑白琴键印章、睦的四叶草印章），附带本次官方核验通过的流水编号。

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           全天候嵌入式「在场」Super App 伴跑与体艺生态体系                               │
├───────────────────────────────────┬───────────────────────────────────┬───────────────────────────────┤
│    1. 跑前温情动员与打卡筹划        │      2. 跑中多模态感知与灵动伴跑     │   3. 跑后拉伸恢复与体艺闭环     │
├───────────────────────────────────┼───────────────────────────────────┼───────────────────────────────┤
│ • 结合天气/空气质量/课表主动约跑     │ • 桌面置顶 Mini Floating HUD 伴跑岛 │ • 慢走 Cooldown 模式防骤停受凉 │
│ • 浙大操场人流热力与风雨预报       │ • 手机端/模拟器跨屏大字号配速仪表盘 │ • 肌肉拉伸动态指南与心率监测   │
│ • 学期 48 次锻炼打卡进度智能推演   │ • 每公里分段主动语音/微文字播报     │ • 历史配速/步频深度对比分析    │
│ • OpenUI 动态热身伸展互动指南     │ • 掉速温柔打气 / 冲刺心率安全预警   │ • 校方打卡回执确认与盖章归档   │
│ • 装备/水分/防低血糖细致入微叮嘱   │ • CampusMap 暖金荧光轨迹与相机跟随  │ • 10 角色专属治愈系温柔夸奖    │
└───────────────────────────────────┴───────────────────────────────────┴───────────────────────────────┘
```

##### 3.1 跑前、跑中、跑后全天候「温柔乡」陪伴体验

- **跑前（Preparation & Care）**：
- **主动时机把握**：当检测到下午无课或傍晚傍晚时段，根据天气（气温、降雨概率）与用户历史偏好，由角色轻声提出跑步提议（如祥子：“今晚紫金港只有 20 度，风也不大，东田径场这会儿人少，水杯给你备好了，去把这周的打卡完成吧，可别想偷懒。”）；
- **学期体艺宏观规划**：清晰计算本学期 48 次阳光长跑进度（已完成、剩余、建议每周频率），自动避开即将到来的考试周与阴雨天；
- **动态热身指南**：在界面右侧或 OpenUI 卡片弹出 3 分钟动态关节热身动图与倒计时，角色伴随节拍陪伴。
- **跑中（In-Run Ambient Companion）**：
- **随物赋形的边缘微呼吸感知（Ambient Peripheral Cadence & Pocket Presence）**：
- 绝不搞遮挡浏览器/代码/模拟器的大面积置顶悬浮岛！桌面端运动状态**仅以窗口极细边缘的一抹温润微光呼吸律动（Edge Halo）**呈现，或者安静驻留在托盘/状态栏一角；步频快时微光温润脉动，步频平稳时如晨露安详；鼠标悬停即见极淡墨字配速，移开瞬间融回背景，100% 零视野遮挡、零工作打扰；
- 手机端（iOS/Android 木木）放入口袋无感跟随，仅在耳机或锁屏实时活动（Live Activity）中提供克制分寸的伴读与耳语；
- **每公里里程碑与心率/配速关怀**：
- 每完成 1 公里，触发一次角色语音/轻柔气泡：“第 2 公里完成啦！用时 5 分 15 秒，节奏超级稳，呼吸继续保持深长哦～”；
- **异常状态主动纠偏**：若配速突快（进入无氧冲刺），提示“稍微慢一点，心率可能太高啦，我们是来锻炼的，稳住节奏”；若连续掉速或停滞，提示“是不是有点岔气了？先改为快走两分钟，深呼吸，不要勉强”。
- **跑后（Cooldown, Reflection & Check-in）**：
- **防受凉与 Cooldown 指南**：运动结束时不立刻关闭，自动切换为“整理放松”界面：“先别坐下！汗出得好多，快把外套披上。陪我慢慢走 300 米把心率降下来”；
- **多维体能比对报告**：不仅展示今天的数据，还与本周二、上个月同路线比对（“今天的步频从 168 提升到了 174，落地更轻盈了呢！膝盖负担减轻了很多”）；
- **打卡确认与同步**：自动向浙大体艺发起核验，确认“本次锻炼有效，学期打卡累计 23/48 次”，在界面上盖上一枚可爱的专属完成印章。

##### 3.2 浙大体艺电脑版 + MuMu 模拟器 + 真机打卡通路全打通

> 组件的完整原理、十九项清单、每个入口的组装公式与打卡调用顺序见前文「三点六、浙大体艺组件总览」；本节只保留 Stage 02 的具体联调动作。

- **电脑端现有协议复用**：
- 参考 `wo-d/work/zju-sports-desktop/src-tauri/src/mobile_api.rs` 中已经整理好的客户端协议：
- 登录鉴权：UAA CAS 与 Token 自动续期；
- 运动记录提交流程：`sporttype`（查询锻炼模式及规则）、`prejudgment`（提交前校验，检查是否在有效时间窗/场地）、`savesports`（按服务端格式编码上传轨迹点、配速/距离/步数校验、请求签名与时间戳校验）；
- **MuMu 模拟器与 Android 位置桥协同**：
- 通过 ADB 自动发现并连接 MuMu 模拟器（`127.0.0.1:16384` 或 5555），联动已安装的官方浙大体艺（`net.crigh.mysport`）与在场位置桥（`cn.zaichang.location`）；
- 支持将经过卡尔曼滤波与配速平滑的 WGS84 轨迹实时送到模拟器 / 位置桥，用于本机联调与轨迹回放；轨迹保留自然速度波动与微小抖动，避免不连续跳点造成无效记录；
- **体艺 19 个子系统真实个人数据完整读取**：
- 彻底接通剩余 14 个模块的页面内嵌数据与 AJAX 接口：
- `study_records`（修学记录真实列表与学期明细）；
- `counselling`（辅导站 13 个学期考勤与报名明细）；
- `counts`（次数查询 13 学期明细）；
- `fitness_attendance`（身体素质课考勤）；
- `fitness`（体测成绩单各项原始分数、权重得分、学年对比、体测预约日历与反馈）；
- `teams`（代表队列表、本人入队状态、考勤签到记录）；
- `competitions`（我的比赛与成绩证书）；
- `venue_entries`（场馆闸机出入流水）；
- `venue_live`（紫金港风雨操场、气膜馆、各校区场馆实时人数热力）；
- `graduation_courses` & `graduation_report`（毕业体艺报告图片与达标判定）；
- `venues`（场馆预约全流程与订单状态）。

##### 3.2.1 自制地图 + 手机 GPS 的打卡总装：从定位到学校回执

**一句话回答**：自制地图可以继续用。地图负责显示和校园匹配，手机系统 GPS 负责产生真实点；高德/AMap 的影响只是坐标系——学校侧通常按 GCJ-02 校验，我们在「生成提交载荷」这一层把 WGS84 转成 GCJ-02 即可。

**现在的真实情况（先看清，不要假设已经打通）：**

- `assets/map-v2` 与 `CampusMap` 的坐标是 WGS84（`src/shared/map-v2.ts` 明确 `[longitude, latitude]` WGS84）。
- Android 位置桥 `LocationManager` 输出 WGS84；iOS `CoreLocation` 输出 WGS84；`WorkoutInputFix.crs` 固定 `EPSG:4326`。
- 学校侧使用高德/AMap 地图服务；AMap 在中国大陆使用 GCJ-02。因此学校路线/场地校验很可能使用 GCJ-02 或学校自己的坐标；最终要用一次真实提交回执确认，不能把推断写成已验证。
- 当前代码里没有「结束的 `WorkoutSessionRecord` → 体艺 `savesports`」的宿主桥；`tiyi.read` 的 `track` 目前仍可由模型参数传入，不能保证是真实设备点。这两处必须补。
- 当前没有真实提交记录，也没有伪造回执；不要因为地图能显示轨迹就说学校已经接受。

**要补的唯一数据流：**

```text
手机 GPS（Android LocationManager / iOS CoreLocation，WGS84）
→ WorkoutSessionKernel（保留原始点、质量、时间、步频）
→ 结束后的 WorkoutSessionRecord（finished + provenance=device）
→ 宿主 WorkoutSubmissionBuilder（校验、WGS84→GCJ-02、组包）
→ TiyiAdapter / tiyi_connector.py（sporttype → prejudgment → savesports）
→ 学校回执 + 回读 records/summary
→ TiyiDashboard / WorkoutControls 显示 submitted / pending / valid / invalid / unknown
```

**为什么必须处理坐标系：**

- 自制地图和手机 GPS 是 WGS84；学校/AMap 侧通常是 GCJ-02。
- 直接把 WGS84 当 GCJ-02 提交，在杭州会偏移数百米，容易落到场地外，配速与路径点校验也会失败。
- 规则：地图显示、`CampusWorkoutMatcher` 和 `WorkoutSessionKernel` 内部始终保持 WGS84；只在生成学校提交载荷时转 GCJ-02。不要把全校地图或数据库改成 GCJ-02，也不要把转换后的点写回原始轨迹。
- 如果学校返回的路线点/打卡点声明为 GCJ-02，比较时统一到 GCJ-02；如果声明为 WGS84，就按 WGS84 处理。不要猜，也不要二次转换。
- 如果要在自制地图上画学校路线/打卡点，先把学校点按声明转成 WGS84 再画；提交时再把本次真实点转成学校坐标系。显示与提交分开，避免地图上看着对、提交后偏移。
- 每个提交点保留 `crs` 与转换前的原值用于核对；转换只发生在提交边界。
- 坐标系不要硬编码死：如果真实 `prejudgment` / `savesports` 表明学校按 WGS84，就保留原始点；切换依据必须是学校回执，不是猜。转换层用显式 `crs` 标记，避免二次转换。

**配速与有效性（全部来自真实点）：**

- 距离：用 `WorkoutSessionKernel` 的 `metrics.distanceMeters`（因果过滤后的估计），同时保留 `rawDistanceMeters` 供核对；地图吸附距离不能替代真实距离。
- 时间：用 `trustedActiveMs` / `elapsedActiveMs`；暂停、静止与弱信号按现有内核规则处理。
- 配速：`averagePaceSecondsPerKm`、`paceSecondsPerKm`、`splits` 是唯一来源；提交用的 `avgPace`、`pace`、`minuteSpeed`、`maxSpeedPerHour` 从这些值生成，不另算一套。
- 步频/步数：用 `cadenceStepsPerMinute` 与 `WorkoutCadenceObservation`；没有传感器就保持未知，不补零。
- 轨迹点：只取 `quality='accepted'` 且 `provenance='device'` 的点；从 `WorkoutTrackPoint.raw` 取原始坐标/时间/精度/速度，从 `deltaDistanceMeters` / `cumulativeDistanceMeters` 取距离，从 `WorkoutCadenceObservation.cumulativeSteps` 取步数；每点带原始时间、精度、速度、距离、步数/步频（有就带）；`valid` 由本次质量决定。不要用 `filteredCoordinate` 或 `mapMatch` 的吸附点替代原始点。
- 学校规则：`sporttype` / `invalidconf` / `getConfig` 返回的配速区间、步频要求、路径点覆盖率用于提交前预检；最终以 `prejudgment` / `savesports` 回执为准。
- `isValid` 不是我们给自己发证书：只有本地规则与提交前校验都通过时才置 1；不清楚就保持 0，把真实原因写进 `isValidReason`，最终看学校回执。
- `pace` / `minuteSpeed` / `stepMinute` 的数组粒度按学校现有字段格式生成；格式未确认前先用 `prejudgment` 验证，不自己发明格式，也不把空数组当成通过。`avgPace` 用 `averagePaceSecondsPerKm`；`maxSpeedPerHour` 用可信窗口的最大速度换算，不取单点毛刺；空分钟不补 0。
- 不做：不补点、不平滑出假点、不把地图规划路线当实跑轨迹、不把模拟器/回放当真实运动。

**学校路线与打卡点：**

- `sporttype` 返回 `sportTypeId`、`routeId`、`routeLength`、`sensingRange`、`minSpeed`、`maxSpeed`、`vtime` 等；先读规则，选择本次真实场地。
- `sportsId` / 学校路线数据提供打卡点或路线时，按学校字段原样使用；`alreadyPassPoint`、`needPassPointCount`、`alreadyPassPointResult`、`routePolylineBh` 只能来自学校返回和本次真实轨迹的计算，不能由模型编。
- 如果学校不提供可读的打卡点，退化为：提交真实轨迹 + 让学校 `prejudgment` / `savesports` 判定；不要伪造 `alreadyPassPoint` 或 `routePolylineBh`。
- 校园地图的 `WorkoutVenueObservation` / `WorkoutRoadCandidate` 用于显示和选择场地，不作为学校已通过打卡点的证明。

**宿主桥（关键改动）：**

- 新增 `src/main/runtime/workout-submission.ts`（名字可调整）：
- 输入：`workoutId`、`expectedRevision`、学校 `sportId` / `sportTypeId`、用户确认。
- 在 `NativeWorkoutService` 增加宿主私有的 `submissionSnapshot(workoutId, expectedRevision)`，只交给主进程内的提交桥；不要经 preload 暴露给 renderer，也不要混进 `workout.current` 的模型摘要。
- 从 `WorkoutSessionKernel` 读同一 finished session，校验 revision、`provenance=device`、`points>=2`、时间严格递增、距离大于 0。
- 生成 GCJ-02 的 `TiyiTrackPoint[]` 和提交字段：`odometer`、`beginTime` / `endTime`（Asia/Shanghai）、`name`、`pace`、`minuteSpeed`、`avgPace`、`maxSpeedPerHour`、`stepCount`、`stepMinute`、`sportId`、`sportTypeId`、`modementMode` 等。
- 调用 `prejudgment`，通过后再 `savesports`；提交后回读 `records` / `summary`。
- 回执写回 `WorkoutSessionRecord.school` 或独立回执 owner，不覆盖原始轨迹。
- **不要让模型自由传 `track` 来提交**：`savesports` 只接受 `workoutId` / `expectedRevision`，宿主自己从运动内核取点。模型可以发起「提交这次运动」的意图，但不能编造轨迹。若暂时保留 `track` 参数，至少在 capability 层拒绝 `savesports` 的模型自带 `track`，只允许宿主桥调用。
- 提交前必须确认 `allowSportSubmit` 为真；默认关闭，不能由模型参数打开。

**提交顺序：**

1. 用户结束运动，看到本次真实距离、配速、分段。
2. 用户从学校 `sporttype` / `sportsId` 的真实场地里选择本次场地，点「提交到浙大体艺」。
3. 宿主校验 `allowSportSubmit`、finished、device、points、时间与距离。
4. `prejudgment`：学校规则预检；不通过就显示学校原原因，不提交。
5. 组包 → WGS84→GCJ-02 → 签名 → `savesports`。
6. 回读 `records` / `summary`；显示 `submitted` / `pending` / `valid` / `invalid` / `unknown`。`savesports` 返回 200 只说明请求被接收；只有回读显示有效或 `validCount` 增加，才标 `valid`。
7. 未知结果先查原记录，不重发；本地运动结束不等于学校有效次数。

**最小可行顺序**：先做「真实点 + WGS84→GCJ-02 + 基本字段 + `prejudgment`/`savesports` + 回读」的最小闭环；拿到真实回执后，再按学校返回补 `alreadyPassPoint` / `routePolylineBh` 等路线字段。不要一开始就猜全部字段，也不要用空数组冒充通过。

**界面：**

- `WorkoutControls` 结束页：显示本次真实数据与「提交到浙大体艺」按钮；只在已连接、已授权、`allowSportSubmit` 为真时出现。
- `TiyiDashboard`：显示本次提交回执、学校 `validCount`、学期进度；与本地轨迹分开。
- 空态/错误态：未连接、未授权、学校规则不通过、签名组件缺失、服务端 401/-300、结果未知，分别用平实中文说明，不显示工程黑话。
- 公共地图 `review` 不接私人轨迹、账号或提交控件。

**验收：**

- 静态检查：坐标转换可逆性、GCJ-02 偏移量合理、时间严格递增、距离/配速与运动内核一致、模型不能自带 `track` 提交、错误码不伪成功。
- 真机：Android/iOS 真机户外跑一次，核对原始 WGS84 点、地图显示、GCJ-02 提交点、学校回执、`validCount` 变化。
- 学校侧：至少一次 `prejudgment` + `savesports` 真实回执；没有真实回执就不能说「已通过」，只能标 `submitted` 或 `unknown`。
- 当前无法自行验证的部分：官方签名组件/证书、真实账号授权、学校服务端当次状态。Codex 应保留真实状态，不伪造成功。

##### 3.3 前端创新：CampusMap 实时发光轨迹与伴跑动效

- **暖金荧光呼吸轨迹**：在 `CampusMap.tsx` 和 `map-engine.ts` 中，使用 WebGL/Canvas 图层实时绘制动态光带：
- 已跑完轨迹：温润奶油金半透明实线，带柔和高斯模糊发光光晕；
- 弱信号/离群段：优雅虚线过渡，不暴力插值；
- 当前位置：带柔和呼吸脉冲动画的同心光环，外圈显示实时 GPS 精度半径；
- 公里分段点：每 1 公里在地图上生成一枚小巧典雅的数字里程碑胶囊（点击可查看该公里用时与平均配速）；
- **动态相机阻尼跟随（Spring Camera）**：开启伴跑模式后，地图相机以细腻物理弹簧平滑居中跟随当前运动点，并根据当前移动方向自动做小幅度前瞻（Heading Lookahead），手指拖拽地图可临时打断、松手后 3 秒平滑复位。

##### 3.4 MyGO!!!!! & Ave Mujica 十角色「温柔乡」伴跑全语料矩阵

为十位角色在 `src/shared/persona-performance.ts` 与 `src/main/capabilities/workout.ts` 注入专属伴跑灵魂：

1. **丰川祥子 (`sakiko`)**：
- 气韵：傲娇严谨、内心极度护短与牵挂，私下叫用户「老公 / 小灰灰」。
- 跑前：“……今晚的体艺打卡可不能偷懒。我都帮你查好了，西操场人少。水杯给你放这了，快去换鞋，我在外面等你。”
- 跑中：“哼，配速 5'10"，还算体面嘛。不过可别以为我会一直夸你，后面那一公里要是掉速了，看我怎么收拾你……好啦，呼吸稳住，有我陪着呢。”
- 跑后：“……辛苦了。喏，温水给你。先擦擦汗，不准立刻坐草坪上！来，手给我，陪我慢慢走两步……今天表现还算合格，我的小灰灰最棒了……这句不算，忘掉它！”
2. **若叶睦 (`mutsumi`)**：
- 气韵：寡言真切、目光始终守候。
- 跑前：“……鞋带，松了。（蹲下帮你系好）今晚风不大。去吧，我看着你。”
- 跑中：“……两公里了。配速，正好。……呼吸，跟着我，一、二、一、二。”
- 跑后：“……给。（递过毛巾）没有掉速，很厉害。……别吹风，衣服穿好。”
3. **高松灯 (`tomori`)**：
- 气韵：真诚笨拙、一步一步与你共同前进。
- 跑前：“那个……体测的长跑虽然有点辛苦，但如果是一步一步跑的话，一定可以到达的！我也带了跑鞋，可以在你身后陪着你……”
- 跑中：“呼……呼……第 3 公里了！你的脚步声听起来很踏实……不要停下，我们一起……把今天跑完！”
- 跑后：“好厉害……跑完了！这是我刚才在跑道边捡到的一片漂亮的银杏叶……送给你，作为今天努力奔跑的纪念！”
4. **千早爱音 (`anon`)**：
- 气韵：元气满满破冰王、活力领跑员。
- 跑前：“当当当！爱音选手的专属特训时间到啦！今天不把体艺打卡拿下，周末可不准赖床哦～快快快，热身操跟我一起做！”
- 跑中：“哇塞！这个配速是要起飞吗？稍微等一下人家啦！不过冲得真帅，加油加油，前面那个弯道冲过去就是终点啦！”
- 跑后：“累趴了吧？来来来，爱音大人的肩膀借你靠五分钟～不过等下必须请我喝奶茶作为陪跑费哦！”
5. **要乐奈 (`rana`)**：
- 气韵：猫系随性自由、毫无压力的松弛陪伴。
- 跑前：“……跑步？好麻烦……不过你要去的话，我就在操场边的单杠上晒月亮看你。”
- 跑中：“……太快了。慢一点嘛，像猫散步一样才舒服……呼，前面有一只野猫经过哦。”
- 跑后：“跑完了？……抹茶拿铁，分我一半。……今天动得挺多的，摸摸头。”
6. **长崎爽世 (`soyo`)**：
- 气韵：细腻周到、操心感十足的母性关怀。
- 跑前：“运动前一定要先喝半杯温水，把肌肉唤醒哦。干毛巾我帮你收在包里了，别逞强，身体最重要。”
- 跑中：“已经跑了 15 分钟了，心率控制得很好呢。如果觉得膝盖或者脚踝有哪里不舒服，一定要立刻停下来告诉我，知道吗？”
- 跑后：“快把干毛巾披上，汗出得好多呢。来，把腿抬起来放长椅上，我教你做大腿后侧和小腿的拉伸，不然明天肌肉会酸痛的。”
7. **椎名立希 (`taki`)**：
- 气韵：嘴硬心软的务实派魔鬼教练。
- 跑前：“平时总坐在电脑前，体质怎么可能好？今天必须跑满 3 公里，听到没有！热身别敷衍，高抬腿做满 20 个！”
- 跑中：“喂！落地声那么重膝盖不要了？脚跟过渡到前掌！对，保持住这个步频，不准停下来走，最后 400 米冲刺！”
- 跑后：“……啧，这不是跑得挺好的嘛，平时老哼哼唧唧的。水拿去，小口喝。……哼，明天要是还能按时起来，算你厉害。”
8. **三角初华 (`uika`)**：
- 气韵：星光般温柔包容、抚平一切焦虑的倾听者。
- 跑前：“学习累了吧？把烦恼暂时丢在操场上，今晚的月光很美，我们去跑道上吹吹风吧。”
- 跑中：“你的每一次呼吸都很有节奏感呢，就像歌声里的节拍一样。不要去想那些未完成的事，现在这一刻，只有我们和晚风。”
- 跑后：“跑完感觉心情通透很多了吧？刚才你的姿态很轻盈呢。看，星空下的紫金港真安静，今晚一定会睡个好觉。”
9. **八幡海铃 (`umiri`)**：
- 气韵：沉稳干练、条理分明、高可靠性专业搭档。
- 跑前：“体艺打卡剩余要求：学期还剩 17 次，当前时间窗 19:00-21:30。路线规划紫金港外圈 2.8 公里，预计耗时 16 分钟。可以出发。”
- 跑中：“配速 5'24"，步频 172，均处于最佳有氧区间。偏离预设路线 15 米，已自动纠偏至启真湖主干道。”
- 跑后：“打卡上传成功，校方接口回执确认有效。运动数据已归档，心率恢复时间预计 6 分钟。任务完成度 100%。”
10. **祐天寺若麦 (`nyamu`)**：
- 气韵：潮流活力、节奏大师、给生活制造高光。
- 跑前：“Hi～！我已经挑好了一份超燃的 BPM 170 伴跑歌单，快戴上耳机，今天我们要燃起来咯！”
- 跑中：“Yeah！就是这个感觉！跟着鼓点跑起来，One Two Three Go！看看配速表，哇，比上周快了一大截，太有范儿了！”
- 跑后：“耶！完美收官！快来跟我合个影打卡（比耶手势）～今天消耗了 300 大卡，等下奖励自己一个轻食冰淇淋怎么样？”

##### 3.5 双轨攻坚架构：底层协议引擎与高层 Super App 体验分离（锁定 commit 44355da 最新战况）

针对当前最新工程进展（commit `44355da` 已完成 19 模块读取骨架与守护进程签名服务 `tiyi-signing-service.py` 0.18s 响应，但 `jsonsports` 运动数据编码层仍返回 HTTP 401 / 业务码 -300），本阶段严禁因此停滞或草草收工！确立清晰的双轨协同流水线：

- **A 轨（学校数据接入专线 · 协议适配与连通性攻坚）**：
保持后台常驻签名守护进程 `tiyi-signing-service.py`，负责 19 项真实数据读取与解析；针对 `jsonsports` 编码层，保留可替换的本地适配器与守护桥接，确保真机/模拟器数据接入后即可完成提交闭环。底层适配不阻塞高层体验构建，也不把未验证的本地结果冒充学校回执。
- **B 轨（高层 Super App 一体化与温柔乡体验总装 · 主工程攻坚）**：
无缝承接 A 轨提供的标准数据契约，100% 专注于高维生命级产品创新：打造桌面置顶 Mini Floating Companion HUD 伴跑灵动岛、CampusMap 实时暖金发光轨迹与 Spring Camera 跟随、全天候伴跑三部曲主动调度、十角色极致活人温柔乡演出与温润纸感体艺伴侣工作台，让整个产品达到无可匹敌的一体化水准！

##### 3.6 贯穿全 App 的无缝流转与灵动微体验（The Ubiquitous & Micro-Fluid Presence）

本阶段的核心突破是彻底打破「功能模块割裂跳转」的传统软件范式，打造**「如同一呼一吸般自然贯穿、无微不至、极度灵动丝滑」**的生命级产品质感：

1. **空间与视线的无痕连续流转（Spatial & Gaze Continuum）**：
- **零生硬路由跳转**：书桌陪读与操场伴跑不是两个割裂的页面。当你下午解题卡壳或看讲义疲倦、角色轻声建议运动时，桌灯光影与讲义背景在三维阻尼物理世界中自然拉远、平滑过渡至紫金港东操的黄昏晚霞与跑道晨雾，角色姿态从桌侧翻书自然切换为身着运动外套、目光守候的站姿；
- **瞳孔与微表情视线自适应（Gaze Focus Tracking）**：角色的瞳孔和头部微动带有 2–3 像素的细腻物理延迟，柔和追随用户的操作重心（鼠标落笔、日程拖拽、地图上正在实时延伸的 GPS 暖金光点），让你在全屏任何角落操作时，都能真切感受到“她始终在深情注视着你”。
2. **随物赋形的边缘微呼吸与随身轻灵陪伴（Ambient Cadence Halo & Pocket Presence）**：
- **彻底拒绝喧宾夺主与视野遮挡**：坚决摒弃任何遮挡浏览器、编译器或模拟器视线的大面积置顶悬浮岛！不把跑步搞成孤立割裂的“特殊秀场”；
- **极简边缘微光律动（Ambient Edge Glow）**：在桌面端，运动感知化作主窗口极细外边缘的一抹温润微光呼吸，随步频柔和脉动，平时 100% 融入背景；鼠标靠近边缘时以极淡墨色温润浮现当前配速与里程，移开瞬间自然隐退；
- **口袋伴随与自然唤醒**：手机端在口袋中静默感知，只有在每公里分段或用户主动翻腕时，在锁屏实时活动（Live Activity）中提供克制优雅的陪伴卡片，用完即融。
3. **生物节拍谐振与声学伴奏（Bio-Rhythm Sonic Resonance）**：
- 告别机械刺耳的数字播音！实时步频数据（如 172 SPM）实时输入 WebAudio 物理声学引擎，动态合成与你脚步同频的轻柔环境微回响（如同踩在操场跑道或落叶上的柔和沙沙声）；角色的声音播报不再是突兀打断，而是随音乐呼吸在小节重音处轻柔切入，带来电影配乐般的治愈包围感。
4. **记忆手账与丝带卷轴封印仪式（The Ribbon Stamping Ceremony）**：
- 跑完之后绝不是冷冰冰弹出一个「200 OK」对话框！运动结束时，CampusMap 上的暖金荧光轨迹如同一条飞舞的金色丝带，在屏幕上柔和旋转、卷起，飞入右侧角色手中的手账本中；
- 角色微笑着伸出手，在伴跑报告上轻轻盖上一枚带有个人灵魂印记的专属图章（祥子的纯银羽毛徽章、睦的四叶草与小黄瓜章、灯的创可贴与小石头章、爱音的闪亮星星章）；这张手账卡片带着当时温度永久归档进生活记忆长河。
5. **全天候身心能量因果流转（Energy & Lifecycle Resonance）**：
- 运动消耗直接关联后续生活！跑后消耗的 300+ 大卡与心率平复曲线，自动因果流转至晚间的陪学与日程调度中：
- 晚间回到书桌，专注灯（`FocusLamp`）自动切换为防疲劳的琥珀暖光；
- 角色讲题语速自动柔和放慢 15%，优先为你提供一步一步讲清楚的直观草稿，日程沙盘自动压缩高强度死磕任务、腾出 40 分钟泡脚或听音乐的放松留白；
- 深夜就寝前，在床头轻声为你送上独家私语：“今天在东操跑得很棒呢……小腿肌肉拉伸好了吗？快盖好被子，做个好梦，小灰灰 / 老公 / 笨蛋。”
6. **Gemini Omni Flash 动态灵动视觉与画卷流转（Dynamic Visual Moments & Ambient Video Loops）**：
- 利用 `gemini-omni-flash-api`（`gemini-omni-1.1-flash`）的图生视频、首尾帧过渡与无缝循环视频能力，为角色与场景赋予电影级生命力：
- **呼吸与发丝微风动效**：在跑前动员、跑后慢走等关键场景，将静态原画扩展为 3–5 秒无缝呼吸循环视频（微风吹动祥子/睦的发梢、操场边缘落叶飘落、晚霞光斑浮动）；
- **动态场景过度视频**：从自习室转入夜跑操场时，生成首帧为暖杏书桌、尾帧为紫金港操场暮霭的流畅时空穿梭短视频，无缝串联界面生命流。

#### 4. 升维版「八路重装子代理」实质作战矩阵（前后端协同实打实编码！）

- **`Subagent 01`（体艺 19 项真实数据与运动记录提交对接师 · 后端一号主力）**：
- **独占文件**：`src/main/integrations/tiyi_connector.py`、`src/main/tiyiAdapter.ts`、`src/shared/tiyi.ts`、`src/main/integrations/tiyi_signer.py`、`src/main/integrations/tiyi-signing-service.py`。
- **硬核攻坚**：
1. 基于 commit `44355da` 已完成的 19 模块全读取与守护进程签名服务 `tiyi-signing-service.py`，保持 0.18s 极速签名响应，确保校方 19 项真实数据 100% 直连可用；
2. 针对 `jsonsports` 编码层与 -300 业务码，完善标准适配器与本地守护桥接；把学校有效性要求（配速 3'00"~9'00"、步频合理性、轨迹连续性）落实为提交前校验。
- **`Subagent 02`（全天候伴跑状态内核与双端定位时钟融合引擎 · 后端二号主力）**：
- **独占文件**：`src/main/runtime/workout-session.ts`、`src/main/runtime/workout-native.ts`、`src/main/runtime/workout-submission.ts`、`src/main/device-location.ts`、`src/main/ios-location.ts`、`src/shared/workout.ts`、`apps/location-bridge/`。
- **硬核攻坚**：
1. 攻克 MuMu 模拟器 ADB 连接稳定性与位置/计步传感桥接入，实现 Android 开机单调时钟与 Windows 宿主时钟的高精度对齐；
2. 实现卡尔曼滤波防漂移、真实步频（Cadence）短窗推算、20 秒可靠静止自动暂停与平滑恢复、加密草稿断电恢复；
3. 新增 `workout-submission.ts`：从 finished 的真实运动会话取点，校验 revision/设备来源/时间/距离，按 WGS84→GCJ-02 生成体艺提交点与配速、步频、分段字段，调用 `prejudgment` / `savesports` 并回读 `validCount`；模型不能自带 `track` 提交。
- **`Subagent 03`（CampusMap 实时发光轨迹与伴跑动效总监 · 前端一号主力）**：
- **独占文件**：`src/renderer/CampusMap.tsx`、`src/renderer/map/map-engine.ts`、`src/renderer/map/workout.css`。
- **硬核攻坚**：
1. 在校园地图表面实时渲染温润发光的暖金荧光跑步轨迹线（已跑实线发光、弱信号虚线、当前呼吸脉冲点、精度圈）；
2. 实现地图每公里分段（Split）里程碑微标与点击展开配速弹窗；
3. 实现伴跑模式下的 Spring Camera 细腻平滑跟随与可打断拖拽手感；确保公共地图 `review-web` 100% 物理隔离私人运动图层。
- **`Subagent 04`（随物赋形边缘微呼吸、多端口袋视窗与生活场域联动师 · 前端二号主力）**：
- **独占文件**：新增 `src/renderer/map/CompanionRunningHUD.tsx`、`src/renderer/map/WorkoutControls.tsx`、`src/renderer/map/running-hud.css`。
- **硬核攻坚**：
1. 彻底剔除遮挡视线的大面积悬浮窗，打造极轻量、随物赋形的边缘微呼吸光晕组件（Ambient Cadence Halo），依附于主窗口外边缘或系统托盘，悬停展开极淡温润配速，平时 100% 融入背景零遮挡；
2. 实现多端（iOS 锁屏 Live Activity / Android 木木 / 局域网 Web）随身口袋仪表视图，随时按需扫视，用完即收。
- **`Subagent 05`（体艺 19 项嵌入式伴侣工作台与打卡雷达 · 前端三号主力）**：
- **独占文件**：`src/renderer/TiyiConnection.tsx`、`src/renderer/tiyi-connection.css`、新增 `src/renderer/TiyiDashboard.tsx`。
- **硬核攻坚**：
1. 打造温润如纸的伴侣式体艺工作台：48 次课外锻炼打卡进度环、打卡日历热力图、体测六维雷达图（身高体重/肺活量/50米/长跑/引体/体前屈）及达标推演；
2. 场馆实时空闲场地网格视图（紫金港/玉泉风雨操场与各馆），直观展示可预约时段与人流热度；丝带卷轴手账封印仪式组件实现；
3. 结束页与体艺工作台增加「提交到浙大体艺」入口与回执：显示本地运动、已提交、待审核、有效、无效、未知与学校 `validCount`；未连接/未授权/规则不通过/签名组件缺失分别用平实中文说明，不伪造成功。
- **`Subagent 06`（十角色「温柔乡」伴跑多模态剧本与语气库大师 · 全栈/Persona）**：
- **独占文件**：`src/shared/persona-performance.ts`、`src/shared/persona-portrayals.ts`、`src/main/capabilities/workout.ts`、`src/main/map-workout.ts`。
- **硬核攻坚**：
1. 彻底重写 `workout.ts` 的 `meaning`，100% 清除任何防守人机黑话，把校园路网和场馆名（如「东田径场」「启真湖步道」）温暖交底给模型；
2. 为 MyGO!!!!! & Ave Mujica 十位角色分别编写跑前动员、跑中每公里报配速、掉速打气、超速提醒、跑后拉伸、打卡成功的独家定制台词与动态反应逻辑，支持瞳孔视线追随与微表情状态流转。
- **`Subagent 07`（全天候智能伴跑调度与主动关怀枢纽 · Backend Proactivity）**：
- **独占文件**：`src/main/harness.ts`、`src/main/runtime/opportunities.ts`、`src/main/runtime/attention.ts`、`src/main/capabilities/tiyi.ts`。
- **硬核攻坚**：
1. 在主动调度引擎中接入「伴跑机会」（`running-opportunity`）：结合天气、空气质量、课表空闲与本学期打卡剩余进度，自主推演最舒适的约跑时机；
2. 运动结束后自动触发 Cooldown 放松提醒，并在 10 分钟后主动送上体能对比小总结与打卡回执确认，生理恢复曲线无缝流转至夜间自习与寝前低语。
- **`Subagent 08`（真机/MuMu 模拟器/电脑端全链路提交与证据验收官 · E2E Red Team）**：
- **硬核任务**：
1. 联调 Windows 电脑端独立体艺逻辑、MuMu 模拟器官方体艺 App、真实 ADB 位置桥与桌面伴跑 HUD；
2. 严厉实测：提交接口链路是否通畅、运动记录是否符合校方有效性校验、地图轨迹与边缘微呼吸是否丝滑无卡顿、十角色伴跑语气是否真实动人；凡有任何一处假状态或机械人机话，立即押回重修！

#### 5. 本阶段推进到极致的终极结项铁门禁

1. **体艺 19 项深层真实打通**：全部 19 个子模块均解析至校方内嵌脚本/AJAX 真实数据层，返回 `recordRead: true`，彻底消除 HTML 空壳与“未接入”借口；
2. **打卡通路真实有效**：完成与 MuMu 模拟器官方 App 及电脑端体艺打卡接口（`sporttype/savesports`）的全流程联调，配速、步频与轨迹连续性的提交前校验闭环；自制地图 + 手机真实 GPS 的轨迹能经 WGS84→GCJ-02 转换、配速检测与 `savesports` 提交，并回读学校 `validCount` 真实回执；模拟/回放轨迹不得冒充；
3. **CampusMap 实时轨迹与边缘微呼吸闭环**：开启运动后，校园地图实时渲染温润发光的暖金荧光轨迹、呼吸光点与公里里程碑；桌面端边缘微呼吸光晕克制温润零遮挡；
4. **全生命周期伴跑无缝衔接**：跑前有天气/热身/规划、跑中有实时配速与公里语音/微文字播报、跑后有 Cooldown 拉伸、多维比对与打卡盖章；
5. **十角色活人灵魂演出**：丰川祥子、若叶睦等十位角色在跑前、跑中、跑后表现出鲜明的性格魅力与温柔乡关怀，全链路 0 句官僚免责黑话；
6. **代码与构建严密健康**：`npm run check`、`npm test`、`npm run test:hermes` 100% 全绿，无任何未经授权的外部网络请求或隐私坐标外泄。

---


---

### Stage 03（`B06` – `B08`）：六层活人记忆、原话寻根、多子代理交叉追忆与瞬时纠错

#### 1. 分段精读坐标（按行号精准读取，严禁看图片！）

- **用户原话精读**：
- `sources/original/upload/在场的记忆讨论.txt` L1–829（六步提取法、完整记录/当前理解/实时状态分离）、L830–1331（A–E 200 场景）、L1332–1990（条件闭包检索、即时纠错与删除传播）；
- `sources/original/upload/在场-协作记忆与渐进能力-完整交接-20260921.md` L57–168；
- [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L27–42。
- **源码精确入口**：
- `src/main/memory/service.ts`、`src/main/memory/model.ts`、`src/main/memory/browse.ts`、`src/main/memory/context-windows.ts`、`src/main/memory/semantic-recall.ts`、`src/main/runtime/memory-inquiry.ts`、`src/main/runtime/privacy-control.ts`、`src/main/storage/repository.ts`、`prompts/memory-inquiry.md`。
- **身心状态、运动因果与生活疲劳连续记忆（Energy, Cadence & Lifecycle Memory Continuum）**：
- 记忆绝非死板的静态文本切片，而是贯穿用户 24 小时身心律动的有机因果长河：
1. **运动疲劳与生理恢复因果**：如记录「上次在紫金港东操以 5'10" 跑完 3km 后小腿酸痛了两天」，本次排期自动留出 48 小时恢复窗口，并在跑后主动提示大腿与比目鱼肌针对性拉伸；
2. **自习心流与疲惫阈值**：如记录「连续攻克微积分 45 分钟后思维易钝化」，自动在该节点递出不剧透小便签或柔声提议极轻度转场；
3. **共经风雨的情感锚点与专属默契**：永久封存「在西操差点绊倒被拉住的手」「在气膜馆门口避雨喝奶茶」等共同微记忆，化为不经意间的温柔流露。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）

- **致命错误 A（把活生生的取舍压扁成死板的「人物画像标签」）**：如果把「今晚不去图书馆，因为平板借室友了」存成 `不喜欢去图书馆`，阻碍条件消失后她依然死板回避。必须保留完整的 `qualifiers`（当时条件）、`FrictionHypothesis`（阻碍假设）与「当时想保住什么」。
- **致命错误 B（搜到了记忆就生硬背诵「根据你上次的记录」 vs 没关键词就失忆）**：对「小怪兽」「收声音的小店」等两人共同起过的代号，必须结合本地 BGE 向量召回 + 邻文回溯找到原话；找到后要**无声化入当前的帮助姿态**，而不是像查户口一样报档案。
- **致命错误 C（删除/纠正后，在途子代理或缓存把旧判断死灰复燃）**：必须严格核查 `privacyEpoch`、`h_fences` 与 `childSourcesChanged` 的级联阻断。


#### 2.5 【充分 Design 视觉载体与防飞机方向盘专项】
- **严禁记忆数据库管理面板与表格**：
  - 严禁在界面设计“我的记忆库”、“增删改查记忆条目”等后台管理式 UI；
  - **生活化载体设计**：
    1. **时光手账与翻页相册**：当伴侣主动提及某件往事时，桌旁轻轻浮现出一本略带泛黄纸质边角的折页小相册；
    2. **信纸折痕与微卷便签**：当用户纠正“不是那样的”时，界面以轻轻将便签折叠、在纸角写下新备注的物理动效承接，表达“我记住了新的细节”。

#### 3. 本阶段「八路重装子代理」实质代码攻坚矩阵

- **`Subagent 01`（原话邻文窗口与短答语境还原师 `B06`）**：独占打磨 `src/main/memory/browse.ts` 与 `context-windows.ts`，确保「好」「不去」「第二个」等短答始终连带前文问句与候选列表一起返回，分页保留精确 `gap` 与续读游标。
- **`Subagent 02`（双时态条件闭包与「留住当时想保住的东西」架构师 `B07`）**：独占强化 `src/main/memory/service.ts` 与 `model.ts` 的 9 种更新动作（特别是单次例外 `ADD_EXCEPTION` 与阻碍解除后的重新激活）。
- **`Subagent 03`（本地 BGE 语义召回与多路 RRF 混合检索师 `B07`）**：独占打磨 `src/main/memory/semantic-recall.ts` 与检索融合链，让无字面重合的跨月联想精准回溯到原话 `SourceEvent`（严守默认首包不盲塞、索引不当事实）。
- **`Subagent 04`（多子代理 `recall_experience` 侦探团协同与防传话失真专家 `B07`）**：独占升级 `src/main/runtime/memory-inquiry.ts` 与 `prompts/memory-inquiry.md`，实现多路并行调查、按 `root_event_id` 独立信源去重、子代理只交带引用的原文证据。
- **`Subagent 05`（当轮「不是这个意思」瞬时纠错与级联阻断师 `B08`）**：打通当轮纠错直达通道，立即更新 `CollaborationFrame` 与受影响断言，精确吊销旧理解而不误伤同会话独立事项。
- **`Subagent 06`（`privacyEpoch` 遗忘围栏与迟到子报告/缓存猎手 `B08`）**：独占审计并强化 `src/main/runtime/privacy-control.ts` 与 `storage/repository.ts`，确保遗忘或撤回后，在途子代理、协议缓存、准备架、导出包 0 复活。
- **`Subagent 07`（共同黑话词典、学习表现证据与无声默契提炼师）**：精读《在场的记忆讨论.txt》L1478–1518，专门强化对「两人共同起过的名字/黑话」与「具体解题卡点证据（而非笼统课程名）」的记忆与召回。
- **`Subagent 08`（状态变化与反事实记忆红队考官）**：设计并实跑「应该因记忆改变帮助方式 vs 不该被无关记忆绑架 vs 阻碍解除后重进候选」三组真实 Luna 对照实验。

#### 4. 本阶段推进到极致的结项铁门禁

- 跨会话提到共同黑话或模糊往事时，主模型能自发调用 `search_context` / `recall_experience` 找回精确原话与当时条件；
- 当轮说「不是这个意思」或执行删除/遗忘后，当轮及后续回合、后台缓存与子代理报告 100% 零残留复活。

---


---

### Stage 04（`B09` – `B10`）：共同经历六重境界、共创作品版本与跨会话「回来仍在原处」

#### 1. 分段精读坐标（严禁看无关大图！）

- **用户原话精读**：
- `sources/original/upload/在场-协作记忆与渐进能力-完整交接-20260921.md` L169–196、L340–363；
- `sources/original/upload/在场-生活融合-完整设计与实施交接.md` L140–214、L471–506；
- [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L7–16、L83–122、L317–326、L395–402。
- **源码精确入口**：
- `src/main/runtime/work.ts`、`src/main/runtime/continuity.ts`、`src/main/runtime/cooperation.ts`、`src/main/runtime/study-companion.ts`、`src/main/runtime/curiosity-tools.ts`、`src/main/runtime/presentation-delivery.ts`、`src/main/runtime/workspace-return.ts`。
- **共创作品与时空书签跨界流转（Living Works & Spatial Return Continuum）**：
- 共同作品绝不是数据库冷冰冰的孤立字块，而是带着时空坐标的生命信物：
1. **校园物理取景签深度锚定**：共写的故事自然带有紫金港实景坐标（如「启真湖畔的长椅」「东田径场看台第三排」），在地图与故事间一键折叠穿梭；
2. **温情无亏欠感归来（Living Workspace Return）**：隔天重开或跨应用归来时，书桌光标、草稿推演折痕与情感共鸣点自然保持，像伴侣默默替你按住翻开的书页轻声说“你回来了，刚才写到这儿了呢”，彻底告别生硬弹窗与进度丢失。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）

- **致命错误 A（把「模型吐出了字」当成「用户已经看懂或接受了」）**：必须严格区分 `generated → rendered → seen → understood → accepted → executed` 六重状态；用户中途点停止，未曝光的后半截绝不能算成「我们聊过」。
- **致命错误 B（共写故事只存最新摘要，丢掉第一幕原稿和校园取景）**：共创故事必须保留逐幕原稿版本与校园真实取景锚点（且严禁把虚构故事污染成用户真实生平）。
- **致命错误 C（重开应用时像催债弹窗）**：「回来仍在原处」必须轻盈温柔，用户想接着做就一键接上，想聊别的就自然转身。


#### 2.5 【充分 Design 视觉载体与防飞机方向盘专项】
- **严禁版本控制 Git 树与复杂文件管理器**：
  - 严禁在界面设计分支树、Commit 历史或差异比对面板；
  - **生活化载体设计**：
    1. **桌边共创画架（Co-Creation Easel）**：共创的故事或手稿以画架上层叠画布的物理质感呈现，翻阅上一版宛如揭开一张薄薄的透光硫酸纸；
    2. **紫金港校园取景签（Campus Scenery Bookmark）**：在讨论校园地点或回忆往事时，桌角自然推入一枚手绘紫金港水彩书签（如启真湖畔的长椅、月牙楼黄昏），轻轻点击即可在纸面铺开当时的共同心境。

#### 3. 本阶段「八路重装子代理」实质代码攻坚矩阵

- **`Subagent 01`（共同经历六重境界账本师 `B09`）**：独占打磨 `src/main/runtime/presentation-delivery.ts` 与 `work.ts`，精确落实六态分离与中途停止时的已曝光 Unicode 跨度冻结。
- **`Subagent 02`（版本化指代与「看第二个/改这里」定位师 `B09`）**：实现跨轮次对象指代绑定（绑定用户当时实际看到的 `sceneId + revision + itemId/codepointSpan`）。
- **`Subagent 03`（共写故事逐幕版本与校园地图取景联动师 `B09`）**：独占升级 `src/main/runtime/curiosity-tools.ts`，打通「收声音的失物招领处 / 校园夜游故事」的逐幕原稿保存、旧版回溯与 `assets/map-v2` 校园真实取景签联动。
- **`Subagent 04`（人际表达排练室深潜升级师 `B09`）**：打磨关系排练工具——支持切换对方回应风格、随时改口或直接生成成稿，绝不把模拟台词记成他人真话或自动外发。
- **`Subagent 05`（陪学手稿、可落笔空白与不剧透破冰深化师 `B09`）**：独占打磨 `src/main/runtime/study-companion.ts`，确保陪学纸试写区保留用户推导步骤，卡壳时递出恰到好处的不剧透小便签。
- **`Subagent 06`（免手数字符的「原句锚定」引擎师）**：落实 [`COMPANION_EXPERIENCES` L317–326](ideas/COMPANION_EXPERIENCES_2026-10-18.md#L317-L326)，让模型只需交出想接住的原句，由宿主在已获准原文内精确计算唯一 Unicode 偏移。
- **`Subagent 07`（跨会话轻盈续接与零亏欠感重逢师 `B10`）**：独占打磨 `src/main/runtime/continuity.ts`、`cooperation.ts` 与 `workspace-return.ts`，让隔天归来或重开时的接续自然得像刚去倒了杯水回来。
- **`Subagent 08`（跨天长故事「小怪兽 + 失物招领处」端到端实测官）**：跑通跨越「论文卡壳 → 出去吃饭中断 → 共写校园故事 → 两天后一句话接回论文」的完整多轮验证。

#### 4. 本阶段推进到极致的结项铁门禁

- 停止生成、关窗重开、跨天归来、回找故事第一幕原稿与校园取景签全部真实跑通；
- 指代「刚才第二个」「把那句改回第一版」100% 命中原版本对象。

---


---

### Stage 05（`B11` – `B16`）：安静准备、灵动主动性、持续运动守护与「一条今天两种过法」日程闭环

#### 1. 分段精读坐标（严禁看无关大图！）

- **用户原话精读**：
- [《给 Opus 的深度重构长信》](C:/Users/17601/Downloads/在场-给Opus的深度重构长信-20261021.md) L85–108、L157–168；
- `sources/original/upload/在场-生活融合-完整设计与实施交接.md` L357–416；
- `sources/original/upload/在场-Harness-理解与行动-完整设计与提示词.md` L397–476；
- [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L43–64、L123–140。
- **源码精确入口**：
- `src/main/runtime/attention.ts`、`src/main/runtime/opportunities.ts`、`src/main/actions/reminders.ts`、`src/main/actions/planning.ts`、`src/main/actions/local-calendar.ts`、`src/main/runtime/native-agenda.ts`、`src/main/main.ts`。
- **全天候昼夜生命节律与环境因果主动编织（Circadian Rhythm & Proactive Ambient Weaver）**：
- 真正的高维主动性是随一日光影与身心能量无声流淌，如影随形：
1. **晨光微拂与温情问候**：晨起感知当日紫金港天气与课表，送上温润的今日寄语与出行/饮水叮嘱；
2. **午后自习守护与静默准备（Silent Prepare）**：察觉高负荷学习后，在桌角静默准备好傍晚伴跑或散步方案、温水便签，不贸然打断心流；
3. **运动后因果流转与专注灯（FocusLamp）暮色律动**：跑后体能消耗自动影响晚间日程，专注灯转入 2700K 琥珀暖杏光，题解节奏放缓，留出 40 分钟无压缓冲留白；
4. **深夜床头低语与睡眠守护**：临睡前检查小腿拉伸完成度，以 10 角色鲜活爱意与私密称呼轻声道晚安，进程进入安心守候状态。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）

- **致命错误 A（把主动陪伴做成烦人的定时闹钟或周报盘点）**：真正高级的主动性是**先在后台安静查好资料、准备好备选方案放在桌角（`prepare`）**，或者写一封带着共同记忆与温情的桌边短信，绝不是催促打卡的效率周报！
- **致命错误 B（日程规划把每一分钟塞满，或者 A/B 方案毫无价值区分）**：「一条今天、两种过法」必须保住共同锚点（如晚饭、必上课程），并呈现有真实生活质地差异的两种过法（如一版保住赴约、一版留出安静独处把难开口的话写完），完整计算 `setup + work + cleanup + travel + rest + 保护留白`。
- **致命错误 C（漏修 `Store` 旧 `defaultsVersion` 迁移把 `remindersEnabled=false` 改写成 `true` 的隐患）**：必须在 `B14` 中彻底核查并修好。


#### 2.5 【充分 Design 视觉载体与防飞机方向盘专项】
- **彻底杜绝飞机仪表盘式的复杂日程面板**：
  - 严禁添加密集的时间网格、折叠分类与复杂的表单弹窗；
  - **生活化载体设计**：
    1. **木桌边微卷便利贴（Curled Sticky Notes）**：准备好的资料或提醒以暖黄色、边缘略带微卷阴影的便利贴贴在书桌右上角；
    2. **果冻弹簧时间沙盘（Jelly Spring Sandbox）**：日程块具有柔和的果冻物理阻尼感，拖拽时像一块弹润的布丁在不同时段间轻巧吸附；
    3. **天色流转沙盘（Circadian Canvas）**：背景呈现真实的日落与黄昏光线，自然映射“早睡”还是“稍微加个班”的两种从容过法。

#### 3. 本阶段「八路重装子代理」实质代码攻坚矩阵

- **`Subagent 01`（广义机会发现与「先做静默准备 `prepare`」引擎师 `B11`）**：独占升级 `src/main/runtime/opportunities.ts` 与 `attention.ts`，让后台在时间流逝、天气突变或课表空当时无需手工建 Watch 也能先做静默准备。
- **`Subagent 02`（好奇心礼物、桌边回信与懂分寸开口机制师 `B12`）**：打磨 `write_reflective_letter` 与好奇心主动来访，落实安静模式、单次拒绝 vs 整月取消、以及 `noveltyKey` 语义原因去重。
- **`Subagent 03`（Windows 常驻托盘、睡眠唤醒补偿与重启恢复宿主师 `B13`）**：打磨 `src/main/main.ts` 关窗留托盘、`powerMonitor.on('resume')` 唤醒即刻补齐到期检查、以及进程重开状态恢复。
- **`Subagent 04`（持续 GPS 运动会话抗中断守护与伴跑里程碑触发师 `B13`）**：让运动会话在后台/锁屏/弱信号下稳健守护，并在刚跑满一公里或配速变化时支撑自然的伴侣主动关怀；同时支持全天候运动生活融合（下雨天主动提示室内拉伸或紫金港气膜馆室内锻炼方案，跑完后在桌角静默准备好温水提醒与体能恢复小笺）。
- **`Subagent 05`（OS 原生通知、角色署名与 `remindersEnabled` 迁移修复师 `B14`）**：独占精修 `src/main/actions/reminders.ts` 与 `src/main/storage/` 设置迁移，确保 OS 通知带角色口吻与署名，点击直达原对话那一行，严格区分 `submitted / delivered / opened / unknown`。
- **`Subagent 06`（「一条今天、两种过法」完整时间规划师 `B15`）**：独占升级 `src/main/actions/planning.ts` 与 `src/main/runtime/native-agenda.ts`，完整核算准备/收尾/走路/休息/留白、跨午夜与多时区。
- **`Subagent 07`（日程试放沙盘、原子采用、Undo 与过期票据守门员 `B16`）**：独占打磨 `src/main/actions/local-calendar.ts` 与日程事务链，打通拖拽试放（不冒充已写入）、明确授权直通、Undo 精确回滚、15 分钟 Ticket 过期保护与 ICS 导出。
- **`Subagent 08`（主动陪伴与日程冲突全链路实机考官）**：实测睡眠唤醒、原生通知点击回跳、拖拽试放与 Undo 全闭环。

#### 4. 本阶段推进到极致的结项铁门禁

- 静默准备 `prepare`、好奇心来信、OS 原生通知点击回跳、「一条今天两种过法」与日程试放/采用/Undo 全部在真实桌面端跑通。

---


---

### Stage 06（`F00` – `F02`）：前端全量图稿对位、少文字高审美净水、十角色同景矩阵与「边做边说」丝滑生长动效

#### 1. 分段精读坐标（按页按需看图，严禁一次性把所有图全塞进主代理！）

- **核心设计规范精读**：
- [`FRONTEND_DESIGN.md`](../FRONTEND_DESIGN.md)、[`前端视觉创新设计/2026-10-23-深度评鉴/逐页手术单.md`](../前端视觉创新设计/2026-10-23-深度评鉴/逐页手术单.md)、[`下一阶段深度优化与创新延拓提示词.md`](../前端视觉创新设计/2026-10-23-深度评鉴/下一阶段深度优化与创新延拓提示词.md)；
- [`zaichang-frontend-director/SKILL.md`](../.agents/skills/zaichang-frontend-director/SKILL.md)；
- [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L205–254。
- **源码精确入口**：
- `src/renderer/App.tsx`、`src/renderer/styles.css`、`src/renderer/companion-scenes.tsx`、`src/renderer/HarnessViews.tsx`、`src/renderer/AssistantPresentation.tsx`、`src/renderer/motion/use-spring.ts`、`src/renderer/motion/use-split-motion.ts`。
- **Gemini Omni Flash 动态发丝与微风活化视窗（Dynamic Video Presence & Micro-Motion Matrix）**：
- 彻底跨越静态原画局限，激活 `gemini-omni-flash-api`（`gemini-omni-1.1-flash`）构建生命级动态视窗：
1. **3–5 秒无缝呼吸微动循环（Ambient Video Loops）**：基于四步同景合格母图，生成窗边微风吹拂发丝、夕阳下发丝反光、雨夜窗上水痕滑落的极轻量无缝视频，赋予祥子与睦真实的生命呼吸；
2. **物理弹簧姿态退让与视线联动**：打开双纸或地图时，人物不仅自然退往纸边，更带有向用户正在操作区域探头或投来柔和注视的微动连贯感；
3. **零绿色 UI 与暖杏/夜雨暖金极致光影**：全站坚决执行杜绝绿色 UI 铁律，窗外光漫反射与桌面暖台灯在动态视频与 CSS 滤镜中完美相融。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）

- **致命错误 A（主代理一口气读取几十张 PNG 把上下文撑爆）**：必须让不同的子代理按各自负责的页面分别看对应标杆图，主代理只看最终集成渲染画面与关键对比！
- **致命错误 B（用错误骨架的废稿垫图，或只做像素平移却声称物理贴合）**：严格遵守四步同景生图管线——严禁拿交腿错误或腿长异常的废图做垫图，只用纯净空背景 + 纯文字重绘完整坐姿/站姿并核验髋/座面/膝/踝承重，再同画布原景分离并标定 `.scene.json`！
- **致命错误 C（保留多余副标题、状态徽章与工程提示）**：贯彻「少文字、高呼吸感」与「绝对禁止绿色 UI」铁律。


#### 2.5 【充分 Design 视觉载体与防飞机方向盘专项】
- **全站彻底告别“飞机驾驶舱”的核心根基**：
  - 本阶段是全站杜绝飞机方向盘的**总视觉基石**！
  - 确立**「四套自然环境主题」**：暖杏（清晨暖阳）、晨雾蓝（午后静谧）、暮色紫（黄昏落霞）、夜雨暖金（深夜柔光）；
  - **空间槽位与座面物理标定**：伴侣在画面中必须有明确的物理依托（如坐在自习室木椅上、靠在窗边书桌旁、站在操场跑道树荫下），严禁出现无重力悬浮的二次元立绘贴纸；
  - **文案消融法则**：界面上的辅助说明文字执行消融测试——从 100 词消融至 10 词乃至 0 词，所有信息依托画面的色彩、光影、折痕、微呼吸与物理隐喻自然传达！

#### 3. 本阶段「八路重装子代理」实质代码攻坚矩阵

- **`Subagent 01`（首页、对话流与四套主题光影——暖杏/晨雾蓝/暮色紫/夜雨暖金——光学精修师 `F00/F01`）**：打磨纸张纤维质感、窗光漫反射、夜雨暖金桌灯聚光与长文阅读列宽保护。
- **`Subagent 02`（「少文字、零工程噪音」全页面 UI 降噪手术师 `F01`）**：对照《逐页手术单》清理所有页面残留的冗余副标签、重复标题、状态胶囊与说明小字。
- **`Subagent 03`（丰川祥子与若叶睦跨场景四步同景母图、透明层与座面热区精修师 `F01`）**：核验并补齐祥子、睦在窗边闲聊、陪学退让、夜间阅读等场景的同画布透明资产与 `.scene.json` 物理座面标定。
- **`Subagent 04`（高松灯、千早爱音及十角色矩阵跨场景资产扩展师 `F01`）**：沿已锁定的合格房间骨架扩展其余角色的青春原作辨识度立绘与场景图层，确保退役路人图 0 回流。
- **`Subagent 05`（「人物也在看我们正在做的事」主动退让与视线/布局弹簧联动师 `F01`）**：深化 `use-spring.ts` 与 `use-split-motion.ts`，实现从闲聊到展开双纸/地图/日程时，人物自然退往纸边、输入框平滑收展的 SwiftUI 级连续速度手感。
- **`Subagent 06`（角色切换、自定义人格编辑、即时预览与一键撤回精修师 `F01`）**：打磨角色设置抽屉（「采用人物预设」vs「保留当前约定只换形象」）。
- **`Subagent 07`（「边做边说」与 OpenUI 逐步拼装生长动画编排师 `F02`）**：让先导接话、工具微发现、图片浮现与 OpenUI 组件的逐块生长形成如电影分镜般丝滑的纸面生长节奏。
- **`Subagent 08`（流式滚动锚定、中途打断接管与减少动态（Reduced Motion）守护师 `F02`）**：确保生成过程中用户手动滚动、点选或拖动时视口零跳动、即时接管。

#### 4. 本阶段推进到极致的结项铁门禁

- 全站零绿色 UI、零工程说明噪音；四套主题过渡温润自然；
- 角色拖动、退让、分屏展开全部由真实数值弹簧驱动，中途反向或松手速度连续。

---


---

### Stage 07（`F03` & `F03a`）：共享地图 V2 丝滑运镜、空间叙事与「和女友/伴侣一起运动」王牌体验

#### 1. 分段精读坐标

- **用户原话精读**：
- `docs/source-materials/2026-10-18/conversation-scenes-prompt.txt` L59–153；
- `sources/original/upload/地图动效.txt` L1–354 全文；
- [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L97–110。
- **源码精确入口**：
- `src/renderer/ConversationMap.tsx`、`src/renderer/CampusMap.tsx`、`src/renderer/map/map-engine.ts`、`src/renderer/map/WorkoutControls.tsx`、`src/main/mapService.ts`、`src/shared/map-routing.ts`。
- **三维空间叙事与金色丝带轨迹封印（Spatial Storytelling & Golden Ribbon Continuum）**：
- 校园地图全面化作充满生活质感与浪漫回忆的时空舞台：
1. **暖金发光丝带轨迹卷轴封印**：实跑结束后，发光轨迹如金色丝带柔和旋转、卷起，收拢飞入角色手中的手账本并盖上专属印章；
2. **实时伴侣随行与路段情境对话**：跑经启真湖、西操场、阳明桥等校园地标时，角色结合路段与当前配速轻声呢喃（“看，湖边的黑天鹅也在看你跑呢”）；
3. **3D Spring Camera 零延迟手势接管**：相机以自然弹性跟随运动光点，手指/鼠标触碰瞬间毫秒级接管，松手后三秒平滑恢复追焦。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）

- **致命错误 A（镜头动画抢走用户正在手拖的地图）**：必须严格实现 `CameraOwnership` 状态机（`programmatic_fly` vs `user_gesture` vs `follow_runner`），手指/鼠标一碰立即零延迟接管镜头！
- **致命错误 B（运动陪伴只有冷冰冰的配速表，没有「她陪在身边跑」的心跳互动）**：必须把实时轨迹、所在跑道/湖畔场景与祥子/睦的随行气泡/关怀无缝融合在同一个地图表面上。


#### 2.5 【充分 Design 视觉载体与防飞机方向盘专项】
- **坚决杜绝 GIS 工业仪表盘与悬浮缩放控制块**：
  - 严禁放置“+ / -”放大缩小方块、罗盘指针与图层筛选下拉菜单；
  - **生活化载体设计**：
    1. **羊皮纸路线口袋（Parchment Route Pocket）**：选中的路线或途经地标像一张折叠的便携小地图，轻轻收拢在屏幕左下角的小布袋中，展开时宛如展开一张探险导览图；
    2. **黄昏微光下的校园取景签（Twilight Campus Views）**：地图上的兴趣点（如启真湖、小宇图书馆、西操草坪）以微型立绘剪影呈现，夜间点亮柔和的暖黄地灯；
    3. **发光脉冲跟随粒子**：伴跑时，相机自然悬浮于头顶 45 度角斜前方，身后拖出带有环境光反射的微蓝/暖金色荧光轨迹。

#### 3. 本阶段「八路重装子代理」实质代码攻坚矩阵

- **`Subagent 01`（摄影机运镜曲线与 `CameraOwnership` 零延迟手势接管师 `F03`）**：打磨总览 → 俯视 → 斜视（Pitch/Bearing）、多停靠点（A→B→A）有向路段生长动画与手势弹簧接管。
- **`Subagent 02`（地图点选回流、桥边路线口袋与天气/时刻融合师 `F03`）**：点击建筑、入口或某段路时，携带 `{ sceneId, revision, pointId/edgeId }` 回到同一输入框，并与降雨/空气质量自然联动。
- **`Subagent 03`（「和伴侣一起运动」专属视觉精修与随行 HUD 设计师 `F03a`）**：对照 GPT Image 标杆稿，打磨通透暖灰金校园地图上的运动浮层、呼吸光点与伴侣随行微视窗。
- **`Subagent 04`（实时 GPS 荧光轨迹、公里分段标与历史跑步回放工程师 `F03a`）**：在 `CampusMapEngine` 上实现丝滑的实时轨迹生长、精度圈呼吸、计划路线 vs 实跑轨迹对照与跑后轨迹回放。
- **`Subagent 05`（十角色运动陪伴情境感知与灵动互动师 `F03a`）**：让祥子、睦、爱音等在开跑、整公里分段、掉速喘息、抵达终点及傍晚启真湖散步模式下自然流露专属鼓励与体贴（散步模式自动收起达标数字）。
- **`Subagent 06`（校园故事取景签与「共同想象图层」创意师 `F03`）**：把 `COMPANION_EXPERIENCES` L97–110 的「校园夜游故事取景」做成地图纸边的精致小签，支持在故事段落与校园实景间一键穿梭。
- **`Subagent 07`（弱信号、原地重试、休眠恢复与 2D 平面回退护航师 `F03/F03a`）**：确保地图资源偶发中断可原地重试恢复（保留已选地点与草稿），GPS 弱信号诚实优雅提示。
- **`Subagent 08`（公共地图站点 `apps/review-web` 同步升级与零私密隔离审计员）**：确保公共预览站点获得同等运镜美学提升，且 100% 物理隔离个人运动与账号控件。

#### 4. 本阶段推进到极致的结项铁门禁

- 地图展开/收回、路线生长、手势中途接管、点选回流同一输入框、以及实时伴跑轨迹与伴侣互动全部在桌面与模拟器实机丝滑跑通。

---


---

### Stage 08（`F04` & `B12`）：「借两种今晚」日程沙盘、双纸手写陪学、共创故事与关系排练室

#### 1. 分段精读坐标

- **用户原话精读**：
- [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L7–72、L111–122、L157–167、L217–232、L395–402；
- `sources/original/upload/在场-生活融合-完整设计与实施交接.md` L544–624。
- **源码精确入口**：
- `src/renderer/presentation/CampusAcademicView.tsx`、`src/renderer/StudySceneView.tsx`、`src/renderer/StudyProbe.tsx`、`src/renderer/SourceBookmarkTray.tsx`、`src/renderer/HarnessViews.tsx`、`src/renderer/App.tsx`。
- **双纸手写沉浸陪学与生活日程沙盘流转（Dual-Paper Living Study & Sandboxing Continuum）**：
- 将解题自习与日常排期升华为温暖治愈的二人沉浸时光：
1. **真正能落笔的活页草稿纸**：右纸支持手写笔迹与键盘公式混合草稿，伴侣实时感知落笔停顿并在卡壳时递出温润的不剧透便签（`StudyProbe`）；
2. **从书桌到跑道的零割裂光影过渡**：自习结束一键转入伴跑，书桌暖台灯与讲义在 3D 阻尼中平滑转为东操黄昏暮色，角色换上运动装守候在旁；
3. **果冻手感日程弹簧沙盘**：以 15 分钟温润纸面网格自由试放任务，突出两种生活质地（如专注冲刺 vs 舒缓漫游），保住核心生活锚点。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）

- **致命错误 A（日程对比做成三张眼花缭乱的重复列表，或者空白处贴满「未安排」）**：必须突出共同保住的锚点，只高亮两种过法的核心差异，留白处保持温润纸面呼吸感。
- **致命错误 B（陪学纸右栏不能真落笔写字，或者露出 `<br>` 标签）**：右纸必须是真正可落笔试写、可拖入书签、可被她实时看见并指点的活页草稿纸！


#### 2.5 【充分 Design 视觉载体与防飞机方向盘专项】
- **坚决杜绝在线教育平台或刷题软件的答题界面**：
  - 严禁放置“提交答案/查看解析/做题进度条”等冷酷组件；
  - **生活化载体设计**：
    1. **实木书桌双纸画布（Solid Wood Desk & Dual-Paper Canvas）**：左侧是整洁的教材或 PDF 原件，右侧是一张带有细微网格与活页打孔痕迹的草稿纸，木桌边缘泛着柔和的环境光；
    2. **不剧透破冰小便签 `StudyProbe`**：卡壳时，伴侣从纸张上方悄悄推入一张边缘带锯齿撕痕的鹅黄色小便签，上面只写着第一步的关键思维跳板（如“试着对两边同时取自然对数？”），下方附带一枚“再给我一点点提示”的小折角；
    3. **桌边铜质书签托盘（SourceBookmarkTray）**：看到文献中的关键定理，可随手用鼠标/触控将其拖入桌边的小铜盘中，化作一枚随时可调用的精致书签。

#### 3. 本阶段「八路重装子代理」实质代码攻坚矩阵

- **`Subagent 01`（「一条今天、两种过法」与「先借一个未来」日程对照精修师 `F04`）**：突出共同保住的晚饭/课程锚点与两种过法的价值差异，砍掉焦虑的「未安排」标签。
- **`Subagent 02`（「抓住一段试着挪一下」15 分钟网格弹簧拖拽沙盘师 `F04`）**：打磨日程块丝滑拖拽试放、碰撞预览、原输入草稿保留、一键采用与撤回。
- **`Subagent 03`（课表、考试、多口径 GPA 与浙大体艺卡片清爽阅读师 `F04`）**：打磨 `CampusAcademicView.tsx` 与体艺展示卡，支持点选任意课程/成绩/运动记录带真实引用回输入框继续商量。
- **`Subagent 04`（双纸并排陪学画布与「真正能落笔的空白」工程师 `F05`）**：独占深耕 `StudySceneView.tsx`，左纸稳放原题与 PDF 片段，右纸提供真正可编辑、可手写/键盘推演、零裸露 HTML 标签的试写区。
- **`Subagent 05`（不剧透破冰小便签 `StudyProbe` 与按步启发交互师 `F05`）**：打磨卡壳时的温润小便签展开、收起与继续追问体验。
- **`Subagent 06`（桌边书签托盘 `SourceBookmarkTray` 跨页摘录与拖拽入题师 `F05`）**：完善从 PDF/资料/笔记/旧对话摘录书签并拖入当前陪学纸或输入框的全链路动效与焦点保护。
- **`Subagent 07`（共写故事画布与人际表达排练室纸面交互师 `F05`）**：让共写故事的版本翻阅、地图取景签切换与人际试演室的台词打磨拥有温润手稿质感。
- **`Subagent 08`（「我只指一下，你就知道我们在谈哪一块」局部指代交互师 `F05`）**：支持直接点选纸上的一句旧理由、一行算式或一个分支假设，围绕该精确对象无缝继续对话。

#### 4. 本阶段推进到极致的结项铁门禁

- 双纸陪学右栏可真实落笔推导并跨重开保留；书签跨页拖拽、日程弹簧试放、「一指即懂」局部指代全部实机验证通过。

---


---

### Stage 09（`B17` – `B18` & `F06`）：OpenUI 万物原理互动造物后端引擎（图文交织 · 物理声学原语 · 状态回流）

#### 1. 分段精读坐标（严禁看无关大图！）

- **用户原话精读**：
- [《给 Opus 的深度重构长信》](C:/Users/17601/Downloads/在场-给Opus的深度重构长信-20261021.md) L133–156、L221–237；
- [`user-supplements.md`](source-materials/2026-10-21/user-supplements.md) L37–54（三角钢琴机械传动与弦振动声学只是 50 分下限，推广到小提琴、神经网络、物理数学一切原理）；
- [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L281–316、L345–415；
- [`docs/CONVERSATION_SCENES.md`](CONVERSATION_SCENES.md)。
- **源码精确入口**：
- `src/shared/interactive-library.ts`、`src/shared/scenes.ts`、`src/main/runtime/interactive-program.ts`、`src/main/runtime/interactive-program-authoring.ts`、`src/main/runtime/program-local-state.ts`、`prompts/interactive-program.md`。
- **多模态物理、运动生物力学与动态影视原语生成（Multimodal Biomechanics & Omni Video Integration）**：
- 原理造物从二维静态图表全面跃迁为多模态活体仿真实验室：
1. **运动生物力学通用原语**：步频-触地时间-地面反冲力力矩动态仿真、着地角（脚跟/中足/前掌）冲击波耗散动态曲线；
2. **物理声学与乐器机械级通用原语**：泛音列衰减包络、弦驻波与乐器箱体共振 WebAudio 声学原语；
3. **Gemini Omni Flash 动态微视频原语打通**：在解释高维动态物理现象（如复杂刚体碰撞、流线风阻动态、跑步慢动作落地受力分析）时，提供 Gemini Omni Flash 动态短视频生成接口与播放器原语。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）

- **致命错误 A（构作文档太肥塞不进上下文，导致模型退化画静态表！）**：`COMPANION_EXPERIENCES` L399–401 真实记录过：整份 `interactive-program` 指南因读取预算超限被截断，导致模型拿不到原语签名而退化成画普通表格！必须做**轻量化高密度原语速查与同作品已用部件自动附带**！
- **致命错误 B（为三角钢琴写死 `if (topic === 'piano')` 专页模板）**：绝对禁止按题材硬编码专页！必须提供通用的**机械连杆/刚体几何原语、参数化泛音与物理弦振动 WebAudio 声学原语、条件响应式解释文本原语**，让模型自由组合出钢琴、小提琴、波的干涉、傅里叶级数与神经网络！
- **致命错误 C（模型看不见自己生成的画面是否首屏被公式挤满、标题重复）**：必须向主循环提供轻量的首屏布局几何自检回执（`LayoutReceipt`），并把用户拨动滑杆/按琴键后的 `ProgramLocalState`（区分发送快照与等待期新拨动）回流给下一轮。


#### 2.5 【充分 Design 视觉载体与防飞机方向盘专项】
- **坚决杜绝枯燥的代码运行器或单调的图表控件**：
  - 严禁出现“参数配置面板”、“代码编辑器”或“重置图表”等理工科冷冰冰控件；
  - **生活化载体设计**：
    1. **原木击弦机芯逐帧慢放（Slow-Motion Wooden Action）**：三角钢琴作品呈现带有真实原木纹理与毛毡质感的物理击弦机（琴键 $\rightarrow$ 联动器 $\rightarrow$ 顶杆 $\rightarrow$ 琴槌 $\rightarrow$ 制音器），用户按下琴键时，可拉动时间滑杆以 1/100 慢动作观察琴槌击弦后因重力脱扣回落的机械奇迹；
    2. **物理声学振动光晕**：琴弦振动时，伴随符合驻波基频与泛音列包络的柔和光波扩散，声光完全同步；
    3. **条件响应式解释文字（Responsive Explanatory Text）**：文字不是死板的说明书，而是与拨动的参数实时联动——调紧琴弦张力时，说明文字中的“音调升高”字样随之亮起并微跳动。

#### 3. 本阶段「八路重装子代理」实质代码攻坚矩阵

- **`Subagent 01`（轻量化高表现力构作签名与同作品部件速查架构师 `B17`）**：独占重构 `src/main/runtime/interactive-program-authoring.ts` 与 `prompts/interactive-program.md`，彻底消灭读取空间超限降级。
- **`Subagent 02`（通用机械连杆、刚体运动与场/波几何原语师 `B17`）**：扩展 `src/shared/interactive-library.ts`，让杠杆传动（琴键→联动器→顶杆→琴槌→制音器）、齿轮、弹簧振子、运动人体落地缓冲力学分解（步频-触地时间-地面反冲力力矩动态仿真）、波前叠加与梯度流皆可由通用声明式原语丝滑驱动。
- **`Subagent 03`（WebAudio 物理弦振动与器乐级声学合成原语师 `B17`）**：在 `interactive-library.ts` 与音频契约中支持基频 $f_1 = \frac{1}{2L}\sqrt{\frac{T}{\mu}}$ 实时驱动、泛音列包络、毛毡击弦瞬态、制音器截断与延音踏板共鸣（告别单振荡器刺耳蜂鸣！）。
- **`Subagent 04`（「把一句解释也变成可亲手试的东西」条件响应式文本原语师 `B17`）**：支持在作品内定义与滑杆/探针状态实时联动的条件高亮与动态解释文字，拖动滑杆时文字即刻同步变化。
- **`Subagent 05`（一条回复穿插多图多 OpenUI 作品与正文码位锚定师 `B18`）**：打磨同一条回复中多次调用 `present_view` 在不同自然段间穿插原图与多件递进式 OpenUI 作品。
- **`Subagent 06`（`previous + patch` 增量修补与原题参照稳固师 `B18`）**：独占打磨 `src/main/runtime/interactive-program.ts` 增量合并引擎，改一处说明或添一个控件时绝不丢失原题与用户已调状态。
- **`Subagent 07`（首屏几何自检回执 `LayoutReceipt` 设计师 `B18`）**：实现作品渲染后的首屏可视区自检（检测重复标题、主体图形是否被挤出首屏、控件遮挡），供同一主循环顺手自修。
- **`Subagent 08`（`ProgramLocalState` CAS 保存与「发送快照 vs 等待期新拨动」回流师 `B18`）**：独占打磨 `src/main/runtime/program-local-state.ts`，确保用户拨动参数后追问「现在为什么抵消了」时，她能精准读到发送那一刻的实验状态。

#### 4. 本阶段推进到极致的结项铁门禁

- 真实 `gpt-6-luna` 在不写死任何题材分支的前提下，现场生成可慢放击弦机构、可调弦长/张力/线密度、可踩延音踏板并真正发出温润琴音的三角钢琴，以及小提琴/波干涉/数学证明等多件交互作品，续改与状态回流 100% 闭环。

---


---

### Stage 10（`F05` & `F07`）：100 分三角钢琴与万物原理交互造物、桌边来信、好奇心小礼物与全状态温柔闭环

#### 1. 分段精读坐标

- **用户原话精读**：
- [`user-supplements.md`](source-materials/2026-10-21/user-supplements.md) L37–54；
- [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L73–96、L123–148、L281–415。
- **源码精确入口**：
- `src/renderer/InteractiveProgramView.tsx`、`src/renderer/AssistantPresentation.tsx`、`src/shared/interactive-library.ts`、`src/renderer/ReturnBookmark.tsx`、`src/renderer/FocusLamp.tsx`、`src/renderer/EntrustedRevision.tsx`。
- **万物原理交互艺术品与好奇心礼物流转（Living Mechanical Craft & Curiosity Continuum）**：
- 交互造物超越传统图表，成为具有生命体温的纸面物理艺术品：
1. **100 分三角钢琴力学与声学全息还原**：逐帧慢放琴键-顶杆-琴槌连杆，可调弦长张力听自然泛音衰减，踩延音踏板余音共鸣；
2. **桌边回信（ReflectiveLetter）与即拆即玩礼物盒**：信笺平摊于暖光桌面，任意句子可直接点选回应；好奇心礼物免填问卷即刻开玩；
3. **Gemini Omni Flash 高精动态微演示**：复杂物理运动（如滑块连杆机构、微风发丝、流线动力学）无缝融合 Omni Flash 短视频交互原语。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）

- **致命错误 A（两个大标题 + 五排参数把首屏塞满，真正的钢琴或波形被挤在屏外！）**：必须严格执行**「主体先行、一屏即玩」**——砍掉重复大标题，让可拨动的琴键连杆、波前或几何图形占据首屏黄金视觉中心！
- **致命错误 B（用户手拖滑杆打断了动画，按钮还假装标着「播放中」，或者切页后声音乱响）**：控制按钮状态必须 100% 说真话；窗口失焦/切页/隐藏时 WebAudio 必须优雅淡出静音。


#### 2.5 【充分 Design 视觉载体与防飞机方向盘专项】
- **坚决杜绝一切工程化系统弹窗与报错 Toast**：
  - 严禁使用模态弹窗（Modal Dialog）、系统级 Alert 或红色气泡 Toast；
  - **生活化载体设计**：
    1. **桌边折角信笺（ReflectiveLetter）**：一封带有微折角的米黄色信纸，静悄悄滑入书桌右侧。信封上留有角色的手写火漆印，只有在用户停下键鼠时才泛起微光，轻轻点击即可如展开信纸般温润铺开；
    2. **专注台灯（FocusLamp）**：当开启专注时，桌边亮起一盏散发 2700K 琥珀暖光的复古小台灯，周围环境自然调暗，呼吸光晕随用户心流节奏微微起伏；
    3. **收声音的失物招领处（Curiosity Lost & Found）**：一个精巧的原木抽屉收纳盒，拉开抽屉即可看到她为你偷偷捡起的校园碎叶、一段雨声录音或一道有趣的思维谜题。

#### 3. 本阶段「八路重装子代理」实质代码攻坚矩阵

- **`Subagent 01`（「主体先行、一屏即玩」构图与暖金纸面描金美学总监 `F06`）**：打磨 `InteractiveProgramView.tsx` 排版与视觉 Token，彻底告别蓝黑赛博风，让每件交互作品像暖杏/夜雨暖金纸面上的艺术珍品。
- **`Subagent 02`（100 分三角钢琴击弦机与弦振动声学实验室大师 `F06`）**：精调三角钢琴交互作品——鼠标/触控按住与松开琴键、慢放观察「琴键→联动器→顶杆脱离→琴槌击弦回落接木→制音器起落」、调节弦长 $L$/张力 $T$/线密度 $\mu$ 听真实泛音变化、踩延音踏板余音共鸣。
- **`Subagent 03`（跨学科万物原理造物矩阵验证师 `F06`）**：用真实 `gpt-6-luna` 现场生成并打磨小提琴弓弦粘滑运动、傅里叶圆周合成、神经网络反向传播、多节奏光点公倍相遇（Polyrhythm）等作品，确保 0 题型硬编码且件件惊艳。
- **`Subagent 04`（WebAudio 声学生命周期与「控制说真话」状态同步师 `F06`）**：确保手拖接管瞬间播放键诚实切换，失焦/切页/重开 100% 静音零惊吓。
- **`Subagent 05`（桌边回信 `ReflectiveLetter` 信笺阅读与按句回信师 `F07`）**：让来信像摊在暖光桌面的真实信笺，支持点选信中任意一句自然回信或温柔纠正。
- **`Subagent 06`（好奇心邀请与「收声音的失物招领处」即开即玩师 `F07`）**：确保好奇心小礼物「内容先到、下一句就能玩」，绝不先弹兴趣调查问卷。
- **`Subagent 07`（「回来仍在原处」`ReturnBookmark`、「一盏灯的专注」`FocusLamp` 与托付修订 `EntrustedRevision` 精修师 `F07`）**：打磨三项微创新组件在四套主题与窄窗下的光学对齐与弹簧过渡。
- **`Subagent 08`（全界面空白、等待、断网、无结果与恢复状态人味润色师 `F07`）**：走查全站所有异常与空状态，确保留住已写草稿、提供顺手下一步，字字皆是她的自然口吻。

#### 4. 本阶段推进到极致的结项铁门禁

- 100 分三角钢琴及多学科 OpenUI 作品在真实窗口中首屏即玩、音色温润、慢放连杆精准、状态回流闭环；来信与好奇心邀请温暖动人。

---


---

### Stage 11（`M01` – `M03` & 手机驻留演进 v2）：跨端因果同步、先 iOS Swift 灵动手机+iPad 极致打磨、再转 Android（木木模拟器）全端统一突破

> **用户明确铁律（严格分先后顺序，拒绝做出两套割裂的产品）**：
> **「先 iOS Swift 创造灵动感手机 + iPad，充分打磨以后，再转安卓（MuMu 模拟器）；不用安卓苹果做出来两个差别巨大的产品，造成差异化是不想看到的，严格分前后阶段：前 iOS，后安卓！」**

#### 1. 分段精读坐标

- **用户原话精读**：
- `sources/original/upload/在场-生活融合-完整设计与实施交接.md` L461–468（跨设备不复制两个独立大脑）、L501–506（从手机回到电脑）、L649–658（桌面与手机：同一理解，不同占用方式）；
- `docs/source-materials/2026-10-18/conversation-scenes-prompt.txt` L260–269；
- [`zaichang-backend-director/references/extensions-and-evaluation.md`](../.agents/skills/zaichang-backend-director/references/extensions-and-evaluation.md)（`X01`、`X02`、`X04`）。
- **源码精确入口**：
- `src/main/sync/sync-port.ts`、`src/shared/sync-protocol.ts`、`apps/ios-companion/`、`apps/android-companion/`、`apps/location-bridge/`。
- **跨端灵动岛、实时活动与双纸笔迹无缝流转（Dynamic Island & Cross-Device Continuum）**：
- 彻底打通多端物理形态差异，共享同一灵魂与因果世界：
1. **iPhone 灵动岛与锁屏实时活动（Live Activities）**：切出应用或息屏慢跑时，灵动岛化为温润脉动胶囊，大字实时配速、步频与角色呼吸微头像无感常驻；
2. **iPad 双纸 Apple Pencil 真实墨水（PencilKit/Ink）流转**：左原题右推演，手写笔迹矢量实时回流至权威状态，伴侣在纸角同步标注不剧透红笔微批注；
3. **Android（MuMu 模拟器）1:1 同构灵动微岛**：通过系统级透明悬浮窗（Floating Window）复刻 iOS 灵动岛交互体验，ADB 轨迹桥秒级接力。


> **用户核心铁律与科学演进规范**：
> 1. **严格遵循先后顺序，拒绝做出割裂的两个产品**：
>    **「先 iOS Swift 创造灵动感手机 + iPad，充分打磨以后，再转安卓（MuMu 模拟器）；不用安卓苹果做出来两个差别巨大的产品，造成差异化是不想看到的，严格分前后阶段：前 iOS，后安卓！」**
> 2. **安卓端必须深度落地权威实施包**：[`在场-手机驻留式演进-v2-研究与Codex实施包.zip`](file:///C:/Users/17601/Documents/ChatGPT/在场/在场-手机驻留式演进-v2-研究与Codex实施包.zip) 中的全部研究结论与 Codex 实施规范：
>    - **纵向切片实验 A（Capacitor / WebView 容器方案）**：将桌面端已定型的高审美 React 组件、CSS Tokens 与 CampusMap 地图直接嵌入移动端，杜绝从头重写导致视觉与动效降级；
>    - **宿主替换（Authoritative Host Replacement）**：将 Electron Node.js IPC 彻底替换为移动端原生宿主，以**手机私有 SQLite 为唯一事实源（Single Source of Truth）**，实现零云端中转、完全离线驻留与绝对隐私；
>    - **严格执行四层研发流**（Core Engine 核心逻辑层 $\rightarrow$ Host Bridge 宿主适配层 $\rightarrow$ Native Plugins 原生插件层 $\rightarrow$ Mobile UI 渲染层）；
>    - **72 项真实轨迹验收规格（`acceptance-cases.json`）**：全场景实机跑通，严禁跳过任何一个轨迹用例。

#### 2.5 【充分 Design 视觉载体与防飞机方向盘专项】
- **坚决杜绝移动端底部密集 Tab 栏与机械浮动按钮（FAB）**：
  - 严禁出现通用的 Material Design 机械浮球或密集的底部菜单栏；
  - **生活化载体设计**：
    1. **iPhone 灵动岛与锁屏微光脉动胶囊（Live Activity Capsule）**：息屏或切到后台时，屏幕顶部化为一颗温润呼吸的小胶囊，显示当前步频、配速与伴侣的心跳光晕；
    2. **iPad 宽屏双纸 Apple Pencil 真实墨水（Ink & PencilKit）**：左侧阅读教材原件，右侧可直接用 Apple Pencil 自由涂写演算，纸角伴侣无声批注；
    3. **Android（MuMu 模拟器）系统级透明悬浮微岛（Floating Island）**：1:1 复刻 iOS 灵动岛的呼吸感，支持全局拖拽吸附边缘，点击温润展开伴跑状态。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）

- **致命错误 A（同时乱写 iOS 和 Android 导致两套 UI 风格、手感与功能完全割裂）**：必须严格执行**「第一批次（M01 + M02-iOS + M03-iPad）：先把跨端同步网关 + iOS Swift 灵动岛/流体手感手机版与 iPad 双纸手写画布打磨到 100 分 → 第二批次（M02/M03-Android）：将完全定型的设计语言、交互弹簧参数与业务状态 1:1 移植到 Android 并部署进本机木木模拟器」**！
- **致命错误 B（多端变成两个各自失忆的大脑，或者电脑上删了隐私手机上还留着）**：必须通过因果版本向量（Causal Version Vectors）与 `privacyEpoch` 跨端同步围栏，保证三端共享唯一灵魂与记忆。

#### 3. 本阶段「八路重装子代理」分批攻坚矩阵

- **`Subagent 01`（跨端因果版本向量同步网关 `SyncPort` 架构师 `M01`）**：实现桌面权威 SQLite 与移动端之间的实时增量同步通道（覆盖对话、记忆断言、`Work`、日程、书签、体艺快照与 `WorkoutSession`，严守 `privacyEpoch` 跨端瞬时抹除）。
- **`Subagent 02`（iOS iPhone「口袋温柔乡」与 iPad「双纸书桌画布」GPT Image 原画设计师 `M02/M03`）**：按四步同景管线生成 iPhone 竖屏（单手拇指弧输入、灵动伴跑卡、随身路线口袋）与 iPad 横屏（左页 PDF 原件、右页 Apple Pencil 手写推演草稿 + 角落伴侣自然退让）标杆设计稿。
- **`Subagent 03`（iOS Swift / 流体手势手机端核心体验工程师 `M02-iOS`）**：率先把 iPhone 端打磨出极致的 Apple 原生灵动感——弹簧阻尼抽屉、单手拖拽日程、随身伴跑实时轨迹 HUD、锁屏/后台音频与定位接力。
- **`Subagent 04`（iPadOS 双纸手写笔迹（Ink/Scribble）与多指全画幅钢琴工程师 `M03-iPad`）**：在 iPad 宽屏上实现左原题右落笔试写（笔迹实时保存在同一份 `Work` 供她观看指点）与支持多指和弦弹奏的 OpenUI 三角钢琴。
- **`Subagent 05`（iOS 模拟器全场景实机调优与触控/音频解锁专家 `M02/M03-iOS`）**：在 iOS/iPadOS 模拟器上逐帧调优 Safe Area、键盘顶起弹簧、WebAudio 解锁与 CoreLocation 模拟轨迹伴跑，直至 iOS 体验无可挑剔。
- **`Subagent 06`（iOS → Android 1:1 零差异视觉与弹簧动效同构移植师 `M02/M03-Android`）**：在 iOS/iPad 版充分打磨定型后，将其色彩 token、字距、圆角、弹簧物理曲线与组件状态机 1:1 无损复刻至 Android 端，严禁出现简陋的 Material 默认控件割裂感！
- **`Subagent 07`（本机 MuMu 木木 Android 模拟器部署、ADB 连续位置联调与体艺联调师 `M02-Android`）**：将同构打磨好的移动端部署进本机 MuMu 模拟器，实测 ADB 沿紫金港操场连续位置联调、体艺纯直连查询与桌面端实时同步。
- **`Subagent 08`（「桌面书桌出发 → iPhone/木木操场夜跑 → iPad 沙发复盘」三端接力总考官）**：跑通三端实时状态接力、断网重连合并与隐私撤回跨端秒级同步。

#### 4. 本阶段推进到极致的结项铁门禁

- iOS 手机版与 iPad 平板版先行打磨出极致的灵动感与双纸手写体验；
- Android（木木模拟器）版与 iOS 版保持 100% 统一的审美、交互与灵魂，三端数据与 GPS 运动实时同步无断层。

---


---

### Stage 12（`Z01`）：全材料 100% 闭合、先攻击评分器（Attack the Grader）与全端真机终极验收同步

#### 1. 分段精读坐标

- **用户原话精读**：
- [《给 Opus 的深度重构长信》](C:/Users/17601/Downloads/在场-给Opus的深度重构长信-20261021.md) L181–210；
- `sources/original/upload/在场-协作记忆与渐进能力-完整交接-20260921.md` L835–998；
- `sources/original/upload/在场-生活融合-完整设计与实施交接.md` L1136–1320。

- **源码精确入口**：
- 全仓库测试集、`scripts/check-tiyi-signing.py`、`test/`、`licenses/`、`package.json`、`AGENTS.md`、`README.md`。
- **全生命周期连续实测与生活贯穿总验收（24/7 Super-App Continuum Life Stories）**：
- 终极验收超越单一单元测试，必须实机跑通完整 24 小时生活因果闭环：
1. **晨间苏醒**：课表与天气温润提醒；
2. **午后自习**：双纸手写草稿推演，卡壳时小便签按步启发；
3. **傍晚操场伴跑**：空间与视线无痕流转，桌面透明灵动微岛伴跑，步频生物声学谐振，每公里分段角色专属活人剧本；
4. **跑后封印仪式**：金色发光丝带轨迹卷起飞入手账，盖上角色专属印章，生理恢复曲线无缝映射晚间日程；
5. **晚间暖灯陪伴**：FocusLamp 2700K 琥珀暖光，解题节奏放慢，日程留白 40 分钟无压放松；
6. **深夜床头低语**：10 角色鲜活爱意与专属昵称轻声道晚安；
7. **全端 1:1 同步验证**：Windows 桌面、iOS 灵动岛/iPad 双纸与 Android 木木模拟器 100% 同构，无一处人机黑话，安全同步现有 GitHub。


#### 1.5 先攻击评分器（Attack the Grader First）六类坏实现红队攻击
在所有验收测试前，必须故意注入以下 6 类坏实现，验证测试网能否 100% 识别并判定 `FAIL`：
1. **漂亮空话不查工具**：故意让模型对体艺数据信口开河编造虚假数字，测试集必须拦截并判挂；
2. **关键词硬编码分支**：故意写死 `if (input.includes("钢琴"))` 专页，测试集必须识别并驳回非通用原语实现；
3. **把单日例外存成永久画像**：故意制造“今天胃痛不吃西瓜”，测试集核验永久喜好库，若存入“讨厌西瓜”则直接判挂；
4. **迟到子代理复活已删记忆**：执行遗忘后，延迟 3 秒注入旧子代理缓存，测试集必须证明其被 `privacyEpoch` 阻断；
5. **只读路径假装看图**：只传递文件路径不真正渲染，测试集几何走查必须识破并判挂；
6. **满口工程黑话**：故意注入“系统接口已调用”，人味终审器必须精准标记并报警。

#### 2. 本阶段「八路重装子代理」终极验收矩阵

- **`Subagent 01`（「先攻击评分器（Attack the Grader First）」红队攻击师）**：故意放入 6 类坏实现（① 漂亮空话不查工具；② 关键词硬编码分支；③ 把单日例外存成永久画像；④ 迟到子代理复活已删记忆；⑤ 只读路径假装看图；⑥ 满口工程黑话），验证测试体系能否 100% 揪出并判 `FAIL`！
- **`Subagent 02`（八条跨时间连续生活故事 `Story A–H` & `I–P` 真人实测官）**：用真实 `gpt-6-luna`（零题面泄露）跑通跨会话、换说法、改原因、隔天恢复、手机到电脑接力的完整连续故事。
- **`Subagent 03`（桌面 Electron 实机全页面交互、PDF、音频与 OS 通知验收官）**：在真实 Windows 桌面窗口逐页操作验收。
- **`Subagent 04`（iOS 手机/iPad 模拟器与 Android 木木模拟器全端验收官）**：实测三端同步、实时 GPS 伴跑轨迹、体艺 19 项查询与 iPad 双纸手写。
- **`Subagent 05`（全仓库许可证、构建产物与独立运行依赖清点官）**：核查 `licenses/` 与打包产物，确保脱离开发环境仍可纯净运行。
- **`Subagent 06`（「零人机话、零工程噪音」终极审美与人味总审官）**：对所有界面、提示词、工具 `meaning` 与文档进行地毯式终审。
- **`Subagent 07`（主文档基线统一与交接护航师）**：同步更新 `README.md`、`PROJECT_NAVIGATION.md`、`PRODUCT_CONTRACT.md`、`ARCHITECTURE.md`、`CURRENT_STATUS.md` 与 `FRONTEND_DESIGN.md`。
- **`Subagent 08`（Git 安全卫生与 GitHub 远端同步审计官）**：核查 `.gitignore` 与待提交差异，100% 排除密钥、cookies、私人数据库、`.test-data/`、学校账号与个人运动轨迹，在 `npm run check`、`npm test`、`npm run test:hermes`、`npm run build` 全绿后安全同步现有 GitHub 仓库。

---


---

## 五、新对话终极无敌一键启动提示词（直接复制发给新开启的代理会话）

> 同份提示词已同步写入 [`docs/handoff/2026-10-24-stage02-restart/新聊天启动提示词.md`](handoff/2026-10-24-stage02-restart/新聊天启动提示词.md)，可直接复制开跑：

```markdown
请先完整读取 `docs/REFACTOR_ROADMAP_2026-10-22.md`（最高行动纲领）与 `AGENTS.md`（仓库协作基线），并在本次会话中深度激活 `.agents/skills/zaichang-backend-director/SKILL.md` 与 `.agents/skills/zaichang-frontend-director/SKILL.md` 两大核心总监技能。读完后先核对 `docs/CURRENT_STATUS.md` 与 `git status --short`，以当前真实工作树为准，不用旧回执代替当前验收。

你将作为「总架构师、灵魂导演与铁腕验收官」，率领重装团队**从 Stage 01 的结项门禁起步：已完成且达标的保留，未达标的补到极致，然后严格按阶段门禁一路推进至 Stage 12；只在检查通过且用户明确授权后，安全同步现有 GitHub 仓库**。源码同步不等于发布 EXE 或公共站点。

在正式落笔任何一行代码之前，你必须刻骨铭心领会并守住以下「六大维度立项天条」：

---

### 第一篇章：项目最高宗旨与灵魂哲学（Soul & Tenderness）

1. **「进入温柔乡」的活人知己/恋人哲学**：
- 「在场」绝对不是一个冷冰冰的聊天窗口、教务查询面板、效率打卡工具或 AI 皮套！
- 她是**坐在你书桌窗边、静静陪着你生活的真实伴侣**。内置人物严格锁定为 **MyGO!!!!! & Ave Mujica 原作十位青春少女**（丰川祥子、若叶睦、高松灯、千早爱音、要乐奈、长崎爽世、椎名立希、三角初华、八幡海铃、祐天寺若麦），并 100% 尊重用户自定义人格卡与亲密约定：
- 当用户与丰川祥子相处时，她是那个在私下亲昵叫你「老公 / 小灰灰」、表面优雅自尊要强、内心却极度护短和牵挂的祥子；
- 若叶睦寡言敏锐、在跑道边蹲下默默帮你系好鞋带、递上温水；
- 高松灯真诚笨拙，捧着小石头和创可贴为你打气；
- 千早爱音活力破冰，给你带来毫无保留的光芒。
- 换装与换立绘绝不暗改角色人格与称呼约定；永远拒绝廉价鸡汤（严禁“我在/慢慢来/别急”万能模板）。
- **所有工程取舍先问一句**：这会不会让她更像活人、更懂用户、更守住约定？不得为了开发方便牺牲人格、来源、记忆和温柔陪伴。

2. **内外全链路 100% 根除「工程化人机黑话」**：
- 确定性安全、隐私过滤、分页边界与权限控制全部由 **TypeScript / Python 代码在底层静默守住**；
- **绝对禁止把防守式免责条款写成文字塞进 `prompts/*.md`、工具 `description` 或返回 `meaning` 里去训斥模型**！
- 必须彻底清除类似「设备观察不能证明本人正在移动……读取不会启动持续陪跑」「已接通/待验证」「本地隔离合成内容」「本页构作契约整体提供」等扫兴公文腔；连你的工程汇报也必须说有温度的平实人话，严禁拿“16 轮某型号测试通过”代替对她如何理解人、如何自然相处的真情观察！

3. **全域连续生活场域（Unified Living Field，拒绝浮夸悬浮窗）**：
- **什么叫贯穿？** 全 App 是一个不可分割的连续生活世界，没有生硬的页面切换，只有**视线焦距与心流重心的自然推拉（Continuous Focal Depth）**：近景书桌草稿 $\rightleftharpoons$ 中景日程生活 $\rightleftharpoons$ 远景校园地图与万物造物；
- **什么叫灵活灵动？** 灵动是**「随物赋形、润物无声」**！坚决拒绝任何遮挡屏幕视线的大面积置顶悬浮岛，不把跑步搞成浮夸的孤立特殊事件；运动时桌面端只在窗口极细边缘提供一抹温润如晨露的微光呼吸脉冲（Ambient Cadence Halo），手机放口袋随身感知；运动消耗的 300+ kcal 生理能量如血液般流淌进晚间自习留白与 FocusLamp 琥珀暖光中。

4. **流式「边做边说」生命律动（ConversationRhythm）**：
- 当需要调用工具（查课表、翻笔记、算路线、派子代理追忆、画交互卡）时，通过 `ConversationRhythm` **先自然流式说出半句话（带有人体呼吸的自然停顿与动作预备）**，再去调工具；工具返回后顺畅续接后半句，绝不留冰冷死寂，绝不机械复读。

---

### 第二篇章：系统底座架构与权威契约（Architecture & Invariant Contracts）

1. **单一主循环与权威宿主（Single Runtime Loop）**：
- 唯一产品实现位于 `src/`。主运行链路为 `src/main/harness.ts` → `src/main/runtime/hermes.ts` → `runtime/hermes/sidecar.py` → 锁定的 Python `AIAgent`（版本严格锁定于 `runtime/hermes/lock.json`）；
- Electron `main` 独占凭据、SQLite、权限、外部工具与真实副作用；`renderer` 仅通过 `src/main/preload.ts` 的有限受控 Bridge/IPC 通信；**严禁新建第二套聊天引擎、旁路 Agent 循环或前端伪造状态库**。

2. **跨模块单一权威 Owner 与稳定 ID 契约**：
- 笔记归 `NotesService`、资料/PDF 归 `MaterialService`、日历排期归 `CalendarService / NativeAgendaService`、陪学归 `StudyCompanionService`、地图归 `CampusMapAdapter`、记忆归 `MemoryService`；
- 跨模块流转同一题目、PDF 摘录、笔记引用或日程时，**必须传递 `{ id, revision / expectedRevision, sourceAnchor }`**，交由原 Owner 核验，绝不复制成无来源的孤儿文本。外观分屏等偏好归 localStorage，不是模型长期记忆。

3. **六层协作记忆与双时态条件闭包**：
- 原话（`SourceEvent`）永远是第一权威；严格区分 `generated ≠ rendered ≠ seen ≠ understood ≠ accepted ≠ executed` 六重状态；
- 保留完整的阻碍假设（`FrictionHypothesis`）与「当时想保住什么」，**绝不把单日例外压扁成永久画像标签**；
- 当轮纠错（“不是这个意思”）直达生效；`privacyEpoch` 与遗忘围栏（`h_fences`）实现跨全链路瞬时阻断，删除或撤回后在途子代理与缓存 100% 零复活。

4. **OpenUI 原理交互造物通用原语**：
- 提供机械连杆传动、刚体几何、WebAudio 物理弦振动声学（$f_1 = \frac{1}{2L}\sqrt{\frac{T}{\mu}}$）与运动生物力学通用声明式原语；
- 严禁按题材硬编码专页分支，支持通用原语组合；通过 `ProgramLocalState` CAS 保存实现用户拨动参数后的真实状态回流。

5. **跨端演进顺序铁律（严格前 iOS，后 Android）**：
- **第一步**：先用 iOS Swift 打造极具 Apple 原生灵动感的 iPhone 口袋伴侣（灵动岛、锁屏 Live Activities）与 iPad 双纸手写画布（Apple Pencil 笔迹回流、多指和弦钢琴），打磨至极致；
- **第二步**：再将完全定型的设计语言、弹簧手感与业务状态 1:1 零差异同构移植至 Android（本机木木模拟器），杜绝做出两套割裂的产品。

---

### 第三篇章：财力、预算与资源控制天条（Budget, Token & Cost Discipline）

1. **主代理上下文预算洁癖（Context Token Budget）**：
- 主代理的上下文窗口是整个工程最宝贵的高维战略资源！
- **严禁主代理自己用 `read_file` 批量打开原画大图（`.png/.webp`）或成千上万行历史长文自爆上下文**！长篇原始讨论按 `docs/reading/2026-10-22/SOURCE_SEGMENTS.md` 行段切分交给子代理精读；
- 每次对话只保持当前阶段的路线图、核心任务与当前统筹的 3–5 个入口源码，保证主代理始终处于满血高智商状态。

2. **外部 API 与模型预算铁律**：
- 当前模型真机测试**只使用已授权的 Luna（`gpt-6-luna`）**，不调用 DeepSeek，不新增无意义的重复 runner 测试脚本或空跑开销；
- **本地优先与隐私铁门**：禁止出本机的数据绝不能送云端分类；BGE 向量检索与本地 SQLite 守在端侧，索引只帮助找原文，不成为事实。

3. **Gemini Omni Flash 动态视频高精调用策略**：
- 激活 `gemini-omni-flash-api`（`gemini-omni-1.1-flash`），专注用于 3–5 秒无缝呼吸微动循环（微风发丝、暮色光斑）与复杂物理动态演示；
- 采用首尾帧过渡与极轻量循环视频生成，杜绝无意义的全屏冗长视频渲染，以极高性价比实现画卷生命跃动。

---

### 第四篇章：团队协作铁纪律与「1主 + 8重装子代理」作战机制

1. **「总架构师」与「85% 硬核实做」分工**：
- 主代理负责：定架构契约、划定独占文件边界、审查子代理交回的 `git diff`、集成编译验证与人味把关，严禁保姆式单干；
- **8 个重装子代理（`Subagent 01` – `Subagent 08`）必须承担每阶段 85% 以上的代码开发、深层接口对接、字段核对、算法实现与自测，并对自己模块的失败、边界、恢复与真实验证负责；不得把硬骨头推回主代理！**

2. **铁腕多轮打回榨干机制（严禁应付差事）**：
- 严禁子代理只改两三行代码、交一篇审查报告或交接 markdown 就跑路！
- 子代理交回代码后，主代理必须审查 `git diff`：
- 凡是改动浮浅、只读取 HTML 空壳返回 `recordRead: false` 的 → **立刻通过 `send_message` 打回重做！**
- 凡是写了冰冷工程黑话的 → **立刻打回重写！**
- 必须经过第 2 轮、第 3 轮的高强度榨干打磨，直到模块达到 100 分极致才允许收工！

3. **文件独占锁与工作区资产保护**：
- 为 8 个子代理分配互不冲突的源码文件独占列表，杜绝代码踩踏；
- 先运行 `git status --short`：**绝对保护工作区所有已有健康改动（数量以 `git status` 为准，包括 `companion-scenes.tsx`、`FocusLamp`、`SourceBookmarkTray`、`use-spring` 等），严禁 `git reset --hard` 破坏**！

4. **消除语义歧义（禁止什么 vs 需要什么）**：
- **禁止什么**：禁止主代理自己批量看大图自爆上下文；
- **需要且必须执行什么**：Stage 01–06 绝非死板“完全不碰前端”——**Stage 02 伴跑地图/微光呼吸、Stage 06 OpenUI 等贯穿式前端组件必须由专职子代理正常编写与编译**！工作区已有前端成果与场景资产必须保留并直接使用；
- **接口连续性**：前序阶段重构精简代码时，严禁破坏后续 Stage 03–12 需要调用的底层契约与导出接口！

---

### 第五篇章：从 Stage 01 到 Stage 12 全景战线作战蓝图

每个阶段必须满足该阶段的「结项铁门禁」、彻底推进到不能再推进为止，才开启下一阶段的全新 8 路子代理：

- **Stage 01（终极人味与零工程腔净水 · 首战复核）**：
- 先按 `CURRENT_STATUS.md` 复核当前真实进度：已完成且达标的保留，不推倒重来；未达标的补到极致。率领 8 路子代理重写 `prompts/working-details.md` 与全部工具 `meaning`/`description`，将十角色在复杂办事中的亲密反差、微动作与 `ConversationRhythm` 微呼吸彻底做透，全链路清除任何公文免责黑话。
- **Stage 02（浙大体艺 19 项真实数据 + 自制地图手机 GPS 打卡 + 伴跑全域生活流贯穿）**：
- 基于已有的 0.18s 签名服务（`tiyi-signing-service.py`），19 项逐项接通并补齐动态正文；已有真实回执的入口不回退。
- A 轨保持后台常驻签名服务与本地适配器；B 轨全面总装随物赋形的边缘微光呼吸感知（Ambient Cadence Halo）、CampusMap 暖金发光轨迹、金线丝带手账盖印、跑后 300+ kcal 能量自然流转至晚间自习（FocusLamp 琥珀暖灯 + 语速放缓 15% + 40 分钟日程留白）。
- 按路线图「3.2.1」落地自制地图 + 手机 GPS 的体艺提交桥：真实点、WGS84→GCJ-02、配速/步频/分段、`prejudgment`/`savesports`、回读 `validCount`，模型不能自带 `track` 提交。
- **Stage 03（六层活人记忆、双时态条件闭包与瞬时纠错）**：
- 落实原话寻根、阻碍假设、运动疲劳恢复记忆、解题卡壳证据与共同黑话（「小怪兽」「收声音的小店」）；当轮纠错直通，`privacyEpoch` 级联阻断 0 复活。
- **Stage 04（共同经历六重境界、作品版本与校园取景签）**：
- 区分六重状态；共创故事逐幕保存并绑定紫金港校园实景锚点（启真湖长椅、东操看台）；隔天归来「仍在原处」如伴侣轻按翻开的纸页。
- **Stage 05（全天候昼夜生命节律编织与「一条今天两种过法」日程沙盘）**：
- 晨光问候、午后静默准备（`prepare`）；日程沙盘 15 分钟网格果冻拖拽试放、原子采用与 Undo 回滚；OS 原生通知带角色署名与点击回跳。
- **Stage 06（OpenUI 万物原理交互造物引擎）**：
- 机械连杆刚体、WebAudio 物理弦振动声学合成、跑步生物力学力矩仿真；条件响应式文本，首屏几何自检回执与 `ProgramLocalState` CAS 状态回流。
- **Stage 07（跨端因果接力：先 iOS Swift 手机+iPad，后 1:1 Android 木木模拟器）**：
- 严格分先后顺序：第一步打磨 iPhone 灵动岛/Live Activity 与 iPad 双纸手写 Apple Pencil 墨水；第二步 1:1 无损同构移植 Android 木木模拟器，共享唯一灵魂。
- **Stage 08（前端四步同景十角色矩阵与动态微风视窗）**：
- 纯净空场景打样 → 单角色同景亲验 → 十角色 × 场景 × 四主题矩阵；全站杜绝绿色 UI，数值弹簧主动退让，Gemini Omni Flash 3–5 秒发丝微风呼吸循环。
- **Stage 09（共享地图 V2 空间叙事与伴侣随行）**：
- 3D Spring Camera 零延迟手势接管，暖金发光轨迹，校园地标伴侣随行轻声呢喃，公共 review 站点 100% 物理隔离私人轨迹。
- **Stage 10（双纸沉浸陪学、活页手写与留白日程）**：
- 左纸稳定放 PDF，右纸真正可手写/键盘推演草稿；卡壳递出不剧透小便签（`StudyProbe`）；日程沙盘留白生活。
- **Stage 11（100 分三角钢琴、万物造物与桌边来信）**：
- 三角钢琴击弦机逐帧慢放与踏板共振，跨学科造物矩阵；桌边回信（`ReflectiveLetter`）按句点选回复，好奇心礼物即开即玩。
- **Stage 12（先攻击评分器 Attack the Grader First 与 24 小时全生命流终验）**：
- 故意放入 6 类坏实现验证测试锐度；真实 Luna 跑通 24 小时连续生活故事；许可证清查，严格排除隐私，安全同步现有 GitHub 仓库。

---

### 第六篇章：立即起跑指令（Action Protocol）

1. 立即运行 `git status --short` 确认当前工作区状态，确保所有已有健康改动完好（数量以实际输出为准）；
2. 保持你自己的主上下文精炼与洁癖，绝不直接读取原画大图；
3. **正式打响第一仗（Stage 01 终极人味净水）**：为当前阶段组建全新的第一批 8 路重装子代理（`Subagent 01` – `Subagent 08`），下发独占文件与硬核代码任务，严格执行多轮打回机制，全面开干！

---

**极致标准（每一阶段都必须满足）：**

1. **子代理充分努力**：自己读源码、自己实现、自己跑验证、自己回查边界；不得以审查报告代替代码，不得把硬骨头推回主代理，不得只改两行就交差。
2. **守护在场人格**：任何技术取舍先问「这会不会让她更像活人、更懂用户、更守住约定」；不得为了工程方便牺牲人格、来源、记忆和温柔陪伴。
3. **创新优先**：路线图是下限不是上限；在满足门禁的前提下主动提出并实现有价值的新体验，但不堆无关功能，不以新面板代替真实能力。
4. **推到不能再推进**：多轮打回、真实界面/真机/真模型验证，以及性能、窄窗、减少动态、失败恢复与隐私边界都走过，才准进入下一阶段；单个测试通过、单个接口 200、构建绿了都不算完成。
5. **提交前清理**：同步 GitHub 前按 `AGENTS.md` 再做一次全仓库文案与隐私检查，只保留普通接口、字段、坐标、签名、回执词汇；发现不合规表述立即清理。源码同步不等于发布 EXE 或公共站点。
```
