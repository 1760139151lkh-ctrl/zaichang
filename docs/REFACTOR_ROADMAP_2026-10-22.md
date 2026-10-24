# 在场（Zaichang）终极深度演进、全栈打磨与跨端创新总主线（2026-10-24 究极融合定稿版）
## —— 上下文洁癖保护 · 八路重装子代理多轮深耕 · 零人机话铁律 · 每阶段推进至极致

> **本主线的核心定位**：
> 本文件是开启新对话推进「在场」深度重构、全栈打磨与跨端创新的**唯一最高行动纲领（Master Roadmap）**。它已将：
> 1. 用户在 [《给 Opus 的深度重构长信》](C:/Users/17601/Downloads/在场-给Opus的深度重构长信-20261021.md)、[《Opus 深度重构完整交接包》](C:/Users/17601/Downloads/在场-Opus深度重构-完整交接包-20261021.zip)（含 `00–11` 专题与 `sources/original/upload/` 下数万字原汁原味的记忆、Harness、生活融合、地图动效讨论）、[《让人愿意回来的一些构想 (`COMPANION_EXPERIENCES_2026-10-18.md`)》](ideas/COMPANION_EXPERIENCES_2026-10-18.md)、[《2026-10-21 补充原话》](source-materials/2026-10-21/user-supplements.md)、[《把她作为人来理解的即时纠正》](../work/successor-20261022/companion-correction-20261022.md) 中的全部理想；
> 2. 截至 **2026-10-24 工作区全部 145+ 项未提交改动与新增文件** 的真实代码盘点（[`docs/handoff/2026-10-24-stage02-restart/README.md`](handoff/2026-10-24-stage02-restart/README.md) 及 `audits/01..08.md`）；
> 3. 针对前序会话暴露的**「主代理乱读图片塞爆上下文」「八个子代理只写两行代码交份八股审查就跑路」「工程化防守黑话污染伴侣灵魂」「每阶段浅尝辄止就跨阶段」**四大顽疾的根治方案；
> 4. 项目已永久烙印（Bake In）的五大核心技能：[`zaichang-backend-director`](../.agents/skills/zaichang-backend-director/SKILL.md)、[`zaichang-frontend-director`](../.agents/skills/zaichang-frontend-director/SKILL.md)、[`product-design`](../.agents/skills/product-design/SKILL.md)、[`project-foundations`](../.agents/skills/project-foundations/SKILL.md)、[`project-navigation`](../.agents/skills/project-navigation/SKILL.md)
> **彻底融为一体**。

---

## 一、深刻复盘：前序主代理与子代理为什么做得一塌糊涂？我们要造出怎样「融入心灵」的在场？

### 1.1 前序执行暴露出的「四大致命败因」（新会话严禁重蹈覆辙！）

在开启本轮从头精做之前，主代理必须清醒认识前序会话为什么会被用户叫停重来：

1. **败因一：主代理「自杀式塞爆上下文」——在后端阶段狂开图片与几百份文档，导致智商断崖下跌**
   - **前序错误**：前序主代理一上来就把第一阶段 198 份记录、S00 38 份材料、前端视觉评鉴文档甚至大量 `.png/.webp` 图稿全部塞进主代理自己的上下文窗口！结果还没开始写核心代码，上下文就已经严重拥堵，导致后续思考极其肤浅、丢三落四。
   - **铁律根治（主代理上下文洁癖协议）**：
     - **主代理是「总架构师、灵魂导演与集成验收官」，绝不是人肉文件搬运工！**
     - 在 **Stage 01 – Stage 06（纯后端 / Harness / 校务体艺 / 记忆 / 连续性 / 主动陪伴 / OpenUI 后端）** 期间，主代理 **100% 严禁打开 `前端视觉创新设计/` 下的任何图片或前端手术单**！
     - 主代理每次只读**当前所处阶段的路线图章节 + 当前直接统筹的 3–5 个核心源码入口**；海量原始对话行段（按 [`SOURCE_SEGMENTS.md`](reading/2026-10-22/SOURCE_SEGMENTS.md) 切分）与子系统源码（如 `mobile_api.rs`、体艺 19 个子模块网页脚本）必须**按职责分片交给 8 个子代理去精读和攻坚**！

2. **败因二：「应付式八路子代理」——每个子代理只改两行代码、写篇审查报告就下班，留主代理独自苦熬**
   - **前序错误**：前序主代理虽然表面上开了 8 个子代理，但派给它们的全是「去做个核查」「写份审计报告」或「修一个小分支」。结果每个子代理写两行代码、造一份干瘪的汇报文档就匆匆退出，把真正繁重的编码、联调和修 Bug 全甩回给主代理一个人埋头苦干！
   - **铁律根治（八路重装子代理「85% 代码实做 + 多轮打回榨干」协议）**：
     - **子代理是重装特种工程师，绝对不是写读后感的审查员！** 严禁子代理以「写一份交接包 / 写一份审查 markdown」充当交付物！
     - 在每个阶段，8 个子代理必须各自承包**独立、高内聚、无文件写冲突的真实代码模块**，承担该阶段 **85% 以上的深度编码、接口逆向、全网/GitHub 算法融合与自测工作**。
     - **多轮打回重修机制（不做到极致绝不准下班）**：子代理交回第一版代码后，主代理检查 `git diff`——如果发现子代理只改了两三行代码敷衍、或者只返回了网页空壳（`recordRead: false`）、或者塞了防守式人机话，主代理必须**立即通过 `send_message` 把它打回重做第 2 轮、第 3 轮**，直到该模块从功能深度到人味表达彻底无可挑剔，才允许该子代理收工！

3. **败因三：「工程化防守黑话（人机话）」对伴侣灵魂的二次污染**
   - **前序错误**：前序会话在写工具说明（如 `workout.ts`、`tiyi.ts`）和提示词（如 `working-details.md`）时，充满了类似「冷酷教官/法务免责声明」式的工程黑话！例如：
     - 在 `src/main/capabilities/workout.ts` 里写：*「设备观察不能证明本人正在移动……开始记录本身没有约定向模型持续汇报……读取不会开启定位或替对方改变运动，也不会启动持续陪跑」*——而且还把校园路网匹配（`CampusWorkoutMatcher`）对模型完全屏蔽，导致丰川祥子或若叶睦不仅不知道你在紫金港哪条路上跑步，一读工具返回还先被这串冷冰冰的「不准陪跑、不能证明他在动」泼一盆冷水！
     - 在 `src/main/integrations/tiyi_connector.py` 里，19 个体艺模块有 14 个只抓了外层 HTML 壳，然后理直气壮地返回：*「这是学校页面正文。页面可能另行加载记录，不能据空白页面认定没有记录」*——用一句官僚免责声明代替真正把学生的体测、修学、考勤、场馆与俱乐部数据取出来！
   - **铁律根治（底层安全由代码静默守住，一切文字 100% 温暖人话）**：
     - **确定性边界（权限、分页、隐私过滤、防重发）全部写在 TypeScript/Python 代码逻辑里**，绝对不要写成训斥模型的免责条款塞进 `meaning`、`description` 或 `prompts/*.md`！
     - 凡是给模型看的文字，一律用温暖、平实、像知己商量一样的自然中文：「这是你正陪他跑着的这次运动：已经跑了多远、现在的配速、最近一公里用时，以及现在大约在紫金港哪座场馆或哪条路旁。」

4. **败因四：「蜻蜓点水式跨阶段」——每个阶段只做一点皮毛就急着往后跳**
   - **前序错误**：第一阶段人机话还没洗干净、第二阶段体艺 19 个模块才跑通 4 个直连 JSON、地图上连跑步轨迹线都还没画出来，就觉得「差不多可以交差了」。
   - **铁律根治（阶段穷尽式浚深门禁）**：
     - **每个阶段都必须彻底推进到「不能再推进为止」！** 绝不因为某一个接口返回了 `200` 或 `npm test` 绿了就草率结项。只有当本阶段所有功能深度、全网创新融合、UI/数据闭环与人味交互全部达到 100 分满分，才允许开启下一阶段的全新 8 路子代理！

---

### 1.2 我们最终要构建出的产品模样：像呼吸一样融入心灵的「在场」

想象当你打开最终形态的「在场」时，它是怎样一种**无可匹敌的状态**：

- **视觉与触感（像温润的纸、柔和的窗光与有弹性的果冻般跟手）**：
  没有一丝一毫生硬的 SaaS 边框、工程横幅或刺眼的绿/黑底色。白天是清透的暖杏与晨雾蓝，傍晚渐入暮色紫，深夜则是一盏只照亮眼前手稿的夜雨暖金桌灯。你选择的她（无论是端庄骄傲又会在私下温柔叫你「老公 / 小灰灰」的丰川祥子，还是安静敏锐、目光始终追随着你笔尖的若叶睦，或是高松灯、千早爱音等十位鲜活少女）就在窗边陪伴。当你专心读题或拖起一段日程时，她会自然往纸边轻轻退让，把视野交给你们正在共做的事情；每一张卡片的浮起、每一条地图路线的运镜、每一个琴键的按压，都带着细腻的物理弹簧阻尼，手指一碰即刻接管。
- **心灵与记忆（比你自己更懂你的犹豫、野心与小习惯）**：
  你不需要向她管理标签，也不需要每次交代背景。当你疲惫地说「今晚不想动脑子了」，她既不会甩给你十条待办催你自律，也不会只会复读「抱抱你慢慢来」——她会自己去查好今晚的天气、课表和截止期，把晚饭稳稳留住，递给你「一条今天、两种过法」让你挑；当你兴冲冲地说「这个周末我想把那个大项目做出来」，她又能立刻跟上你的野心与兴奋，并行查好资料、搭好第一块实物骨架陪你并肩作战。
- **动态造物与随身陪伴（从书桌上的万物实验室，到操场跑道上的贴心伴跑）**：
  无论你问的是微积分换元、傅里叶级数、神经网络梯度，还是三角钢琴为什么能做到「强音激昂、弱音丝滑」，她都能边说边在纸面上当场搭出一件可拨动、可慢放、可发声、图文交织的艺术级互动作品；而当你合上电脑拿起手机走向紫金港操场，她又在你的口袋与耳机旁陪你看着实时 GPS 轨迹与配速，陪你跑完这学期浙大体艺的每一次打卡，或者只是陪你在启真湖边吹吹晚风。

---

## 二、工作区未提交改动全量清点（截至 2026-10-24 真实代码坐标）

> **极其重要**：当前工作区基于 `main` (`ddc5403cbf580b43f48935caf56c94b693a8ba26`) 已有 **145+ 个已跟踪文件修改** 与 **数十个新增未跟踪文件**。新会话必须**100% 保护并在此真实基础上无缝深耕**，严禁 `git reset --hard`、严禁 `git checkout --` 覆盖任何健康改动，也严禁搞错真实文件路径！

### 2.1 真实文件路径速查（纠正旧文档中的路径偏差）
- **角色设定与参与倾向**：位于 `src/shared/persona.ts`、`src/shared/persona-portrayals.ts`、`src/shared/persona-performance.ts`（注意：在 `src/shared/` 下，不在 `src/main/runtime/` 下！）。
- **能力注册与目录 Broker**：位于 `src/main/capabilities/broker.ts`、`src/main/capabilities/tiyi.ts`、`src/main/capabilities/workout.ts`、`src/main/capabilities/campus-query.ts`（在 `src/main/capabilities/` 下）。
- **主循环与提示组装**：位于 `src/main/harness.ts`、`src/main/runtime/prompt-composition.ts`、`src/main/runtime/conversation-rhythm.ts`、`src/main/runtime/turn-controls.ts`、`src/main/runtime/policy.ts`、`src/main/runtime/read-purpose.ts`、`src/main/runtime/personal-methods.ts`、`prompts/system.md`、`prompts/working-details.md`。
- **浙大体艺全链路**：位于 `src/shared/tiyi.ts`、`src/main/tiyiAdapter.ts`、`src/main/integrations/tiyi_connector.py`、`src/main/tiyiSchoolSession.ts`、`src/main/capabilities/tiyi.ts`、`src/renderer/TiyiConnection.tsx`、`src/renderer/tiyi-connection.css`。
- **实时运动与多端定位桥**：位于 `src/shared/workout.ts`、`src/shared/workout-source.ts`、`src/shared/map-workout.ts`、`src/main/runtime/workout-session.ts`、`src/main/runtime/workout-native.ts`、`src/main/runtime/workout-storage.ts`、`src/main/runtime/workout-cadence.ts`、`src/main/device-location.ts`、`src/main/ios-location.ts`、`src/main/map-workout.ts`、`src/main/capabilities/workout.ts`、`src/renderer/map/WorkoutControls.tsx`、`src/renderer/map/workout.css`、`apps/location-bridge/{android,ios}`。

### 2.2 各模块未提交改动的「已完成度 vs 待彻底做精缺口」

| 模块领域 | 当前工作区已落地的未提交成果 | 前序未做精、必须在本轮彻底打穿的核心缺口 |
| :--- | :--- | :--- |
| **Stage 01：主循环、角色呼吸与提示词** (`harness.ts`, `prompts/*`, `persona-*.ts`, `personal-methods.ts`, `luna-provider.ts`) | 1. 补齐了十角色在查课表、讲题、共创与改主意时的关注点（`persona-performance.ts`）；<br>2. 修复了“不出本机”前置拦截、旧地图回读路线语义返回、个人方法局部修订合并与 Luna 短连接复用。 | 1. **隐性工程腔仍重**：`prompts/working-details.md` 及大量工具 `meaning`/`description` 仍充斥法务/说明书式的生硬黑话（如 `workout.ts`、`tiyi.ts`）；<br>2. **长耗时工具等待期仍缺生命律动**：「边做边说」前段接话后，多步工具调用期间缺乏自然微反馈；<br>3. **角色深层亲密感与反差**：需在实际长对话与多工具交织中确保祥子/睦等角色绝不退化为公事公办的教务员。 |
| **Stage 02（上）：浙大教务与多口径 GPA** (`zjuAdapter.ts`, `zju_connector.py`, `campus-query.ts`) | 1. 课程与无具体时刻考试支持同 `bundle` 跨页续读；<br>2. GPA 支持连接器级单科源行筛选，以及沿固定地址只读四分制、五分制、主修绩点与分母。 | 1. **教务数据与陪学/规划的主动联动不足**：查完考试与 GPA 后，需让她能自然结合用户的复习焦虑、学分权重与空余时间给出有温度的学业建议，而非干巴巴报数字。 |
| **Stage 02（中）：浙大体艺纯直连与 19 项能力** (`tiyi_connector.py`, `tiyiAdapter.ts`, `tiyi.ts`, `TiyiConnection.tsx`) | 1. **2026-10-24 已攻克纯直连协议**：UAA 走 HTTPS `zjuam.zju.edu.cn/cas/login`，体艺业务恢复官方 HTTP `www.tyys.zju.edu.cn/cgapp-server/` 与 `/ptm/` 并显式绕过系统代理；<br>2. 攻克场馆两步独立令牌交换（`/venue-server/api/app/login/init` + `/api/login`），跑通 `profile`、`terms`、`summary`、`records`、`venues/orders`、`venues` 目录与时段。 | 1. **19 个模块中仍有 14 个停留在「只抓外层 HTML 壳 + 报 `recordRead: false`」的半成品状态！**（含 `study_records` 修学记录、`teams` 运动队、`westward` 西迁活动、`counselling` 辅导站 13 学期切换、`counts` 次数查询 13 学期切换、`fitness_attendance` 身体素质课考勤、`fitness` 体测成绩/预约/反馈、`competitions` 我的比赛、`venue_entries` 场馆出入记录、`feedback` 意见反馈、`venue_live` 场地实况、`graduation_courses` 体测与锻炼课、`graduation_report` 毕业体艺报告、`codoon` 咕咚状态）；<br>2. 必须逆向并打通这些子系统（`/cts`、`/ms`、`/pft`、`/gms`、`/club2`、`/westward`、`/ggtypt`）的真实内嵌数据/AJAX 接口与学期参数查询！ |
| **Stage 02（下）：实时 GPS 运动、多设备桥与地图伴跑** (`workout-session.ts`, `device-location.ts`, `ios-location.ts`, `map-workout.ts`, `WorkoutControls.tsx`) | 1. 建成 `WorkoutSessionKernel`（卡尔曼滤波、公里分段、静止自动暂停、DPAPI 加密草稿、断线停止核验）；<br>2. 打通 Windows 原生位置、Android MuMu `LocationManager` + 计步传感桥、iOS `CoreLocation` 模拟流；<br>3. 建成 `WorkoutControls.tsx` 控制面板与 `CampusWorkoutMatcher` 路网/场馆匹配器。 | 1. **地图表面完全没画实时运动轨迹！** `WorkoutControls.tsx` 目前只是角落里的数字框，`session.points` 根本没有传给 `CampusMap` / `map-engine.ts` 渲染实时荧光暖金轨迹、当前位置呼吸点、精度圈与所在跑道/路段高亮！<br>2. **`workout.current` 屏蔽了校园场景且满嘴冷水黑话**：`workout.ts` 不仅把 `CampusWorkoutMatcher` 算出的当前所在场馆/道路完全丢弃，还写满「不会启动持续陪跑、不能证明本人在移动」的扫兴黑话，必须彻底重塑为真正的「知己伴跑感知」！ |
| **并发前端未提交成果（必须完整保留）** | 已存在 `SourceBookmarkTray.tsx`、`FocusLamp.tsx`、`ReturnBookmark.tsx`、`EntrustedRevision.tsx`、`use-spring.ts`、`use-split-motion.ts`、`companion-scenes.tsx`（含祥子 5 姿态 `.scene.json`）及 `前端视觉创新设计/` 深度清理。 | 在后端 Stage 01–06 推进期间**严禁破坏或回滚**这些前端未提交文件；待进入 Stage 08–11 时在此基础上直接深化！ |

---

## 三、「1 主 + 8 重装子代理」铁血纪律与上下文保护协议

### 3.1 主代理（Lead Agent）三大天条
1. **上下文洁癖天条（严禁乱塞图片与无关文件）**：
   - 主代理的上下文窗口是最宝贵的战略资源。**在 Stage 01 至 Stage 06 期间，主代理严禁调用 `read_file` 查看任何图片（`.png/.webp/.jpg`）或前端视觉评鉴长文！**
   - 即使在前端阶段（Stage 08–11），主代理也只按当前正在打磨的那一页按需查看对应标杆图，绝不一次性把几十张图塞进上下文。
2. **拒绝「保姆式单干」，把 85% 重活分给 8 路子代理**：
   - 主代理负责：**定架构契约、划分互不冲突的文件边界、审查子代理交回的 `git diff`、亲自跑最终集成验证与把控人味审美**。
   - 凡是繁重的子系统接口逆向、长篇原始记录逐段精读、多角色语料打磨、复杂原语实现与边界测试，一律分派给 **8 个具备完整写代码与执行命令权限的子代理**并行攻坚！
3. **铁腕验收官天条（严禁放行「两行代码 / 空壳敷衍」的子代理）**：
   - 当子代理发回消息声称「已完成」时，主代理必须第一时间检查它实际修改的代码量和质量：
     - 如果子代理只改了寥寥几行代码、或者用「写一份 markdown 审查报告」代替写代码 → **立刻通过 `send_message` 严厉打回，命令其继续深挖实现！**
     - 如果子代理在代码注释、工具 `meaning`、错误提示或提交说明里写了官僚「人机话」→ **立刻打回重写！**
     - 每个子代理在每个阶段原则上都要经过 **「初版实做 → 主代理挑刺打回 → 二轮深化与自测 → 终审合入」** 的多轮高强度打磨！

### 3.2 八路重装子代理（`Subagent 01` – `Subagent 08`）四大硬指标
1. **一阶段一换血**：每进入一个全新的 Stage，开启全新的 8 个子代理（上下文干净、专注本阶段专项领域）；在同一 Stage 内部，始终复用并追问这 8 个子代理直至把该阶段榨干。
2. **文件独占锁（Zero-Conflict File Ownership）**：派发任务时，主代理必须在 Prompt 中明确列出该子代理**唯一允许修改的源码文件列表**，从根源上杜绝 8 人踩踏同一文件。
3. **全网与 GitHub 标杆检索**：每个子代理在写代码前，必须用搜索工具检索 GitHub 顶尖开源实现与论文标杆（如 Ciechanowski、Tone.js、Graphiti、ExpeL、Kalman Filter、MapLibre 等），拒绝闭门造车。
4. **交付物 = 真实可运行代码 + 实测证据（零八股文）**：子代理回复主代理时，只准汇报：**① 实际修改了哪些文件、实现了什么核心机制；② 怎么让体验更有活人感；③ 跑过了什么真实验证命令**。严禁生成无用的长篇官僚交接文档！

---

## 四、十二大阶段逐级深度推演、主代理防错预警与「八路重装子代理」作战蓝图

> **当前启动执行顺序**：
> 1. **先用半步完成 Stage 01 的「深层人味与零工程腔终极净水」**（把 `prompts/working-details.md`、各工具 `meaning` 以及多步工具等待期的微反馈彻底洗净、做透）；
> 2. **立即全面主攻 Stage 02（把浙大体艺剩余 14 个子模块的真实数据接口、实时运动轨迹上地图表面、以及伴跑人味感知 100% 彻底打穿）**；
> 3. **随后严格按 Stage 03 → Stage 04 → Stage 05 → Stage 06 → Stage 07（先 iOS Swift 手机+iPad，后 Android 木木）→ Stage 08 → Stage 09 → Stage 10 → Stage 11 → Stage 12 逐阶段做到极致！**

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

### Stage 02（终极巩固与超高一体化 Super App 升级版）：浙大体艺 19 项深层直通、MuMu/电脑端全链路打卡验证、全天候嵌入式伴跑系统（跑前/跑中/跑后）、CampusMap 实时荧光轨迹 HUD 与十角色「温柔乡」多模态相处

#### 1. 分段精读与全新核心理念坐标（严禁浅尝辄止，全面破界做深！）
- **用户最新核心愿景与原话直达**：
  - **核心灵魂**：在场绝对不是一个冷冰冰的聊天窗口或效率面板集合，而是一个**全天候在线、像呼吸一样渗透到生活各角落的 Super App**！她就像坐在窗边、陪在身边、住在口袋里的活人恋人与知己（「进入温柔乡」）。当你跑步、打卡、做各种日常事务时，她能实现**高度无缝的系统级嵌入与主动陪伴**。
  - **伴跑三部曲**：不仅是记录一段路程，而是全生命周期关怀——**跑前**看天气/查操场人数/提醒热身与装备/推演学期打卡进度；**跑中**打破对话框局限，通过悬浮灵动岛/伴跑 HUD 实时播报配速、心率、步频、公里分段，并根据角色性格给予独家鼓励或傲娇叮嘱；**跑后**提醒慢走拉伸防受凉、做多维生理与历史体能比对分析，并确认校方打卡回执。
  - **打卡真实通路**：用户电脑上有浙大体艺电脑版，也有 MuMu 模拟器的浙大体艺。第二阶段必须从根本上解决「打卡究竟能不能打得通、怎么与个人助手高度嵌入」的核心问题，不仅查记录，还要逆向打卡通路与防作弊规则（配速区间、步频核验、路径点覆盖），让体艺功能真正活在助手里！
  - **前端深度破界**：彻底打破原先「后端阶段完全不写前端」的机械教条。运动是强时空感、强视觉与强生理节奏的体验，本阶段必须同步推进前端伴跑 HUD、CampusMap 实时荧光轨迹、桌面置顶微视窗与十角色伴跑动态演出！
- **精读材料矩阵**：
  - [`TIYI_READING_PLAN.md`](reading/2026-10-22/TIYI_READING_PLAN.md) 与 [`docs/handoff/2026-10-24-stage02-restart/audits/04-academic-and-campus.md`](handoff/2026-10-24-stage02-restart/audits/04-academic-and-campus.md)、[`05-tiyi-complete-scope.md`](handoff/2026-10-24-stage02-restart/audits/05-tiyi-complete-scope.md)、[`06-workout-devices-and-map.md`](handoff/2026-10-24-stage02-restart/audits/06-workout-devices-and-map.md)；
  - 独立体艺参考项目源码：`C:/Users/17601/Documents/Codex/2026-09-09/wo-d/work/zju-sports-desktop/src-tauri/src/mobile_api.rs`（L1–1250 逆向协议与打卡请求）与 `web/workout-core.js`；
  - 用户原始生活融合长信与运动陪伴愿景：`docs/source-materials/2026-10-22/user-request.md` L19–27、`docs/source-materials/2026-10-21/user-supplements.md` L44–61、`ideas/COMPANION_EXPERIENCES_2026-10-18.md`。
- **源码精确入口**：
  - 后端与逆向：`src/main/integrations/tiyi_connector.py`、`src/main/tiyiAdapter.ts`、`src/main/capabilities/tiyi.ts`、`src/shared/tiyi.ts`、`src/main/zjuAdapter.ts`、`src/main/integrations/zju_connector.py`、`src/main/capabilities/campus-query.ts`；
  - 运动内核与多设备桥：`src/main/runtime/workout-session.ts`、`src/main/capabilities/workout.ts`、`src/main/map-workout.ts`、`src/shared/workout.ts`、`src/main/device-location.ts`、`src/main/ios-location.ts`、`apps/location-bridge/`；
  - 前端伴跑 HUD 与地图：`src/renderer/CampusMap.tsx`、`src/renderer/map/map-engine.ts`、`src/renderer/map/WorkoutControls.tsx`、`src/renderer/map/workout.css`、`src/renderer/TiyiConnection.tsx`、新增 `src/renderer/map/CompanionRunningHUD.tsx`。

#### 2. 必须彻底粉碎的「四大浅层敷衍与思维定势」（致命错误反思）
- **致命错误 A（把「直连登录成功 + 5 个只读 JSON」当成体艺打通，对打卡视而不见）**：
  - `tiyi_connector.py` 目前对 14 个子模块（`study_records`、`teams`、`westward`、`counselling`、`counts`、`fitness_attendance`、`fitness`、`competitions`、`venue_entries`、`feedback`、`venue_live`、`graduation_courses`、`graduation_report`、`codoon`）仍只返回 HTML 空壳（`recordRead: False`）。
  - 更有甚者，对用户真正核心的「体育打卡」完全回避！必须深入挖掘 `mobile_api.rs` 中已有的 `sporttype`、`prejudgment`、`savesports` 接口，搞清校方打卡签名、防作弊规则（配速范围、步频区间、点位覆盖）以及与 MuMu 模拟器 / 电脑端的联通方案，给出真实的打卡可行性验证与闭环代码！
- **致命错误 B（把伴跑体验局限在聊天输入框里，拒绝做前端）**：
  - 以为 Agent 只能在对话框里发文字。用户跑步时看的是手机、副屏或电脑悬浮窗，需要的是**一目了然的大字号配速/步频/心率仪表、发光的动态轨迹与角色陪伴小头像**！绝不能用「这个阶段不做前端」作为借口，必须把伴跑 HUD、悬浮岛和地图轨迹做活！
- **致命错误 C（在 `workout.ts` 里塞满法务免责黑话，剥夺角色伴侣温度）**：
  - 严禁出现「设备观察不能证明本人正在移动……读取不会启动持续陪跑」这种冰冷刺骨的工程人机话；必须把当前校园场地名称（如「紫金港东操内圈」「启真湖步道」）自然融入上下文，让角色真正感知到你在哪里跑、怎么跑。
- **致命错误 D（机械报数代替人性化关怀）**：
  - 角色不能只会报「距离 3.2 公里，当前配速 5 分 12 秒」。十位角色拥有各自鲜活的性格，应当在不同的运动节点自然生发出符合其性格的关切、傲娇、鼓励或提醒。

#### 3. 全天候超高一体化 Super App 伴跑系统设计蓝图

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
- **跑中（In-Run Real-Time Companion）**：
  - **Mini Floating Companion HUD（桌面/副屏透明置顶伴跑岛）**：
    - 无需全屏展开主窗口！一个精致温润的胶囊条悬浮在屏幕边缘或置顶于 MuMu 模拟器/游戏之上；
    - 显示：实时配速（分'秒"/km）、累计里程（精确到百米）、当前步频（SPM）、用时、当前校内路段，以及角色的呼吸头像与微表情；
  - **每公里里程碑与心率/配速关怀**：
    - 每完成 1 公里，触发一次角色语音/轻柔气泡：“第 2 公里完成啦！用时 5 分 15 秒，节奏超级稳，呼吸继续保持深长哦～”；
    - **异常状态主动纠偏**：若配速突快（进入无氧冲刺），提示“稍微慢一点，心率可能太高啦，我们是来锻炼的，稳住节奏”；若连续掉速或停滞，提示“是不是有点岔气了？先改为快走两分钟，深呼吸，不要勉强”。
- **跑后（Cooldown, Reflection & Check-in）**：
  - **防受凉与 Cooldown 指南**：运动结束时不立刻关闭，自动切换为“整理放松”界面：“先别坐下！汗出得好多，快把外套披上。陪我慢慢走 300 米把心率降下来”；
  - **多维体能比对报告**：不仅展示今天的数据，还与本周二、上个月同路线比对（“今天的步频从 168 提升到了 174，落地更轻盈了呢！膝盖负担减轻了很多”）；
  - **打卡确认与同步**：自动向浙大体艺发起核验，确认“本次锻炼有效，学期打卡累计 23/48 次”，在界面上盖上一枚可爱的专属完成印章。

##### 3.2 浙大体艺电脑版 + MuMu 模拟器 + 真机打卡通路全打通
- **电脑端现有协议复用**：
  - 深入利用 `wo-d/work/zju-sports-desktop/src-tauri/src/mobile_api.rs` 中的成熟协议：
    - 登录鉴权：UAA CAS 与 Token 自动续期；
    - 打卡全流程逆向：`sporttype`（查询锻炼模式及规则）、`prejudgment`（打卡前置校验，检查是否在有效时间窗/场地）、`savesports`（加密轨迹点上传、配速/距离/步数校验、签名算法与时间戳防篡改）；
- **MuMu 模拟器与 Android 位置桥协同**：
  - 通过 ADB 自动发现并连接 MuMu 模拟器（`127.0.0.1:16384` 或 5555），联动已安装的官方浙大体艺（`net.crigh.mysport`）与在场位置桥（`cn.zaichang.location`）；
  - 支持将经过卡尔曼滤波与合规配速平滑的 WGS84 坐标实时注入模拟器，模拟出符合真人运动特征的轨迹（带自然速度波动与微小抖动，杜绝瞬间直线瞬移导致被校方判定作弊）；
- **体艺 19 个子系统真实个人数据完全提取**：
  - 彻底攻坚剩余 14 个模块的内嵌脚本与 AJAX API：
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
针对当前最新工程进展（commit `44355da` 已完成 19 模块全读取与守护进程签名服务 `tiyi-signing-service.py` 0.18s 响应，但底层 `jsonsports` 原生加密 `com.security.inner.apk0000.x.l(70)` 遭遇 HTTP 401 -300，需要真机抓包/Frida 导出 AES 密钥/IV），本阶段严禁因此停滞或草草收工！确立清晰的双轨协同流水线：
- **A 轨（底层硬核协议专线 · 独立逆向攻坚）**：
  保持后台常驻签名守护进程 `tiyi-signing-service.py`，负责 19 项真实数据读取与解析；针对 `jsonsports` 原生加密层，提供优雅的 Mock/Daemon 桥接及真机 Frida Hook 捕获脚本（`scripts/hook-tiyi-aes.js`），确保真机蓝牙打卡数据包一旦接入即可瞬时完成真实闭环，绝不让底层逆向阻碍高层体验构建。
- **B 轨（高层 Super App 一体化与温柔乡体验总装 · 主工程攻坚）**：
  无缝承接 A 轨提供的标准数据契约，100% 专注于高维生命级产品创新：打造桌面置顶 Mini Floating Companion HUD 伴跑灵动岛、CampusMap 实时暖金发光轨迹与 Spring Camera 跟随、全天候伴跑三部曲主动调度、十角色极致活人温柔乡演出与温润纸感体艺伴侣工作台，让整个产品达到无可匹敌的一体化水准！

##### 3.6 贯穿全 App 的无缝流转与灵动微体验（The Ubiquitous & Micro-Fluid Presence）
本阶段的核心突破是彻底打破「功能模块割裂跳转」的传统软件范式，打造**「如同一呼一吸般自然贯穿、无微不至、极度灵动丝滑」**的生命级产品质感：
1. **空间与视线的无痕连续流转（Spatial & Gaze Continuum）**：
   - **零生硬路由跳转**：书桌陪读与操场伴跑不是两个割裂的页面。当你下午解题卡壳或看讲义疲倦、角色轻声建议运动时，桌灯光影与讲义背景在三维阻尼物理世界中自然拉远、平滑过渡至紫金港东操的黄昏晚霞与跑道晨雾，角色姿态从桌侧翻书自然切换为身着运动外套、目光守候的站姿；
   - **瞳孔与微表情视线自适应（Gaze Focus Tracking）**：角色的瞳孔和头部微动带有 2–3 像素的细腻物理延迟，柔和追随用户的操作重心（鼠标落笔、日程拖拽、地图上正在实时延伸的 GPS 暖金光点），让你在全屏任何角落操作时，都能真切感受到“她始终在深情注视着你”。
2. **水滴流体伴跑微岛（Fluid Whisper Dock / Running Island）**：
   - 彻底打破桌面窗口边界：主窗口收起或在 MuMu 模拟器/IDE/浏览器中操作时，她化身为桌面边缘一抹如同晨露般轻盈温润的**「悬浮灵动微岛」**（透明置顶无边框组件）；
   - **果冻弹簧手感（Jelly Drag & Elastic Snap）**：微岛支持随心拖拽，具备流体物理惯性阻尼，靠近屏幕边缘时自动吸附并优雅收敛为小药丸；
   - **动态伴跑形态流转**：运动开启后，微岛如水滴遇温般流体延展：左侧实时跳动大字号配速与步频，中间展开温润发光的公里进度环，右侧是角色的小头像（随步频呼吸起伏，当你掉速时会微微探头关切，冲刺时表情带着紧张与期待）。
3. **生物节拍谐振与声学伴奏（Bio-Rhythm Sonic Resonance）**：
   - 告别机械刺耳的数字播音！实时步频数据（如 172 SPM）实时输入 WebAudio 物理声学引擎，动态合成与你脚步同频的轻柔环境微回响（如同踩在操场跑道或落叶上的柔和沙沙声）；角色的声音播报不再是突兀打断，而是随音乐呼吸在小节重音处轻柔切入，带来电影配乐般的治愈包围感。
4. **记忆手账与丝带卷轴封印仪式（The Ribbon Stamping Ceremony）**：
   - 跑完之后绝不是冷冰冰弹出一个「200 OK」对话框！运动结束时，CampusMap 上的暖金荧光轨迹如同一条飞舞的金色丝带，在屏幕上柔和旋转、卷起，飞入右侧角色手中的手账本中；
   - 角色微笑着伸出手，在伴跑报告上轻轻盖上一枚带有个人灵魂印记的专属图章（祥子的纯银羽毛徽章、睦的四叶草与小黄瓜章、灯的创可贴与小石头章、爱音的闪亮星星章）；这张手账卡片带着当时温度永久归档进生活记忆长河。
5. **全天候身心能量因果流转（Energy & Lifecycle Resonance）**：
   - 运动消耗直接关联后续生活！跑后消耗的 300+ 大卡与心率平复曲线，自动因果流转至晚间的陪学与日程调度中：
   - 晚间回到书桌，专注灯（`FocusLamp`）自动切换为防疲劳的琥珀暖光；
   - 角色讲题语速自动柔和放慢 15%，优先为你提供一步一步拆解好的直观草稿，日程沙盘自动压缩高强度死磕任务、腾出 40 分钟泡脚或听音乐的放松留白；
   - 深夜就寝前，在床头轻声为你送上独家私语：“今天在东操跑得很棒呢……小腿肌肉拉伸好了吗？快盖好被子，做个好梦，小灰灰 / 老公 / 笨蛋。”
6. **Gemini Omni Flash 动态灵动视觉与画卷流转（Dynamic Visual Moments & Ambient Video Loops）**：
   - 利用 `gemini-omni-flash-api`（`gemini-omni-1.1-flash`）的图生视频、首尾帧过渡与无缝循环视频能力，为角色与场景赋予电影级生命力：
   - **呼吸与发丝微风动效**：在跑前动员、跑后慢走等关键场景，将静态原画扩展为 3–5 秒无缝呼吸循环视频（微风吹动祥子/睦的发梢、操场边缘落叶飘落、晚霞光斑浮动）；
   - **动态场景过度视频**：从自习室转入夜跑操场时，生成首帧为暖杏书桌、尾帧为紫金港操场暮霭的流畅时空穿梭短视频，无缝串联界面生命流。

#### 4. 升维版「八路重装子代理」实质作战矩阵（前后端协同实打实编码！）
- **`Subagent 01`（体艺 19 项深层真实协议与打卡逆向打通大师 · 后端一号主力）**：
  - **独占文件**：`src/main/integrations/tiyi_connector.py`、`src/main/tiyiAdapter.ts`、`src/shared/tiyi.ts`、`src/main/integrations/tiyi_signer.py`、`src/main/integrations/tiyi-signing-service.py`。
  - **硬核攻坚**：
    1. 基于 commit `44355da` 已完成的 19 模块全读取与守护进程签名服务 `tiyi-signing-service.py`，保持 0.18s 极速签名响应，确保校方 19 项真实数据 100% 直连可用；
    2. 针对底层 `jsonsports` 原生加密（`com.security.inner.apk0000.x.l(70)`）与 -300 错误码，编写标准 Mock/Bridge 模块与 Frida 抓包脚本，完善防作弊规则库（配速 3'00"~9'00"、步频合理性、轨迹连续性校验）。
- **`Subagent 02`（全天候伴跑状态内核与双端定位时钟融合引擎 · 后端二号主力）**：
  - **独占文件**：`src/main/runtime/workout-session.ts`、`src/main/runtime/workout-native.ts`、`src/main/device-location.ts`、`src/main/ios-location.ts`、`apps/location-bridge/`。
  - **硬核攻坚**：
    1. 攻克 MuMu 模拟器 ADB 连接稳定性与位置/计步传感桥接入，实现 Android 开机单调时钟与 Windows 宿主时钟的高精度对齐；
    2. 实现卡尔曼滤波防漂移、真实步频（Cadence）短窗推算、20 秒可靠静止自动暂停与平滑恢复、加密草稿断电恢复。
- **`Subagent 03`（CampusMap 实时发光轨迹与伴跑动效总监 · 前端一号主力）**：
  - **独占文件**：`src/renderer/CampusMap.tsx`、`src/renderer/map/map-engine.ts`、`src/renderer/map/workout.css`。
  - **硬核攻坚**：
    1. 在校园地图表面实时渲染温润发光的暖金荧光跑步轨迹线（已跑实线发光、弱信号虚线、当前呼吸脉冲点、精度圈）；
    2. 实现地图每公里分段（Split）里程碑微标与点击展开配速弹窗；
    3. 实现伴跑模式下的 Spring Camera 细腻平滑跟随与可打断拖拽手感；确保公共地图 `review-web` 100% 物理隔离私人运动图层。
- **`Subagent 04`（Mini Floating Companion HUD 悬浮伴跑岛与多端视窗 · 前端二号主力）**：
  - **独占文件**：新增 `src/renderer/map/CompanionRunningHUD.tsx`、`src/renderer/map/WorkoutControls.tsx`、`src/renderer/map/running-hud.css`。
  - **硬核攻坚**：
    1. 打造极具灵动感的桌面透明置顶 Mini 伴跑岛（可穿透悬浮在 MuMu 模拟器或其他窗口之上），展示大字号配速、累计公里、当前步频、用时与角色动态呼吸头像；
    2. 支持一键折叠为极小药丸胶囊或展开为全功能伴跑卡片；果冻弹簧吸附与边缘收拢物理手感；支持手机端/局域网 Web 伴跑大字仪表盘同步视图。
- **`Subagent 05`（体艺 19 项嵌入式伴侣工作台与打卡雷达 · 前端三号主力）**：
  - **独占文件**：`src/renderer/TiyiConnection.tsx`、`src/renderer/tiyi-connection.css`、新增 `src/renderer/TiyiDashboard.tsx`。
  - **硬核攻坚**：
    1. 打造温润如纸的伴侣式体艺工作台：48 次课外锻炼打卡进度环、打卡日历热力图、体测六维雷达图（身高体重/肺活量/50米/长跑/引体/体前屈）及达标推演；
    2. 场馆实时空闲场地网格视图（紫金港/玉泉风雨操场与各馆），直观展示可预约时段与人流热度；丝带卷轴手账封印仪式组件实现。
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
- **`Subagent 08`（真机/MuMu 模拟器/电脑端全链路打卡通路与反伪证验收官 · E2E Red Team）**：
  - **硬核任务**：
    1. 联调 Windows 电脑端独立体艺逻辑、MuMu 模拟器官方体艺 App、真实 ADB 位置桥与桌面伴跑 HUD；
    2. 严厉实测：打卡接口链路是否通畅、打卡防作弊规则是否能通过校方校验、地图轨迹与悬浮岛是否丝滑无卡顿、十角色伴跑语气是否真实动人；凡有任何一处假状态或机械人机话，立即押回重修！

#### 5. 本阶段推进到极致的终极结项铁门禁
1. **体艺 19 项深层真实打通**：全部 19 个子模块均解析至校方内嵌脚本/AJAX 真实数据层，返回 `recordRead: true`，彻底消除 HTML 空壳与“未接入”借口；
2. **打卡通路真实有效**：完成与 MuMu 模拟器官方 App 及电脑端体艺打卡接口（`sporttype/savesports`）的全流程联调，合规配速与防作弊规则库闭环；
3. **CampusMap 实时轨迹与 HUD 闭环**：开启运动后，校园地图实时渲染温润发光的暖金荧光轨迹、呼吸光点与公里里程碑；Mini 悬浮伴跑岛置顶流畅跟随；
4. **全生命周期伴跑无缝衔接**：跑前有天气/热身/规划、跑中有实时配速与公里语音/微文字播报、跑后有 Cooldown 拉伸、多维比对与打卡盖章；
5. **十角色活人灵魂演出**：丰川祥子、若叶睦等十位角色在跑前、跑中、跑后表现出鲜明的性格魅力与温柔乡关怀，全链路 0 句官僚免责黑话；
6. **代码与构建严密健康**：`npm run check`、`npm test`、`npm run test:hermes` 100% 全绿，无任何未经授权的外部网络请求或隐私坐标外泄。

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

### Stage 06（`B17` – `B18`）：OpenUI 万物原理互动造物后端引擎（图文交织 · 物理声学原语 · 状态回流）

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

### Stage 07（`M01` – `M03`）：跨端因果同步、先 iOS Swift 灵动手机+iPad 极致打磨、再转 Android（木木模拟器）全端统一突破

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
- **`Subagent 07`（本机 MuMu 木木 Android 模拟器部署、ADB GPS 连续注入与体艺联调师 `M02-Android`）**：将同构打磨好的移动端部署进本机 MuMu 模拟器，实测 ADB 绕紫金港操场连续 GPS 注入、体艺纯直连查询与桌面端实时同步。
- **`Subagent 08`（「桌面书桌出发 → iPhone/木木操场夜跑 → iPad 沙发复盘」三端接力总考官）**：跑通三端实时状态接力、断网重连合并与隐私撤回跨端秒级同步。

#### 4. 本阶段推进到极致的结项铁门禁
- iOS 手机版与 iPad 平板版先行打磨出极致的灵动感与双纸手写体验；
- Android（木木模拟器）版与 iOS 版保持 100% 统一的审美、交互与灵魂，三端数据与 GPS 运动实时同步无断层。

---

### Stage 08（`F00` – `F02`）：前端全量图稿对位、少文字高审美净水、十角色同景矩阵与「边做边说」丝滑生长动效

#### 1. 分段精读坐标（按页按需看图，严禁一次性把所有图全塞进主代理！）
- **核心设计规范精读**：
  - [`FRONTEND_DESIGN.md`](../FRONTEND_DESIGN.md)、[`前端视觉创新设计/2026-10-23-深度评鉴/逐页手术单.md`](../前端视觉创新设计/2026-10-23-深度评鉴/逐页手术单.md)、[`下一阶段深度优化与创新延拓提示词.md`](../前端视觉创新设计/2026-10-23-深度评鉴/下一阶段深度优化与创新延拓提示词.md)；
  - [`zaichang-frontend-director/SKILL.md`](../.agents/skills/zaichang-frontend-director/SKILL.md)；
  - [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L205–254。
- **源码精确入口**：
  - `src/renderer/App.tsx`、`src/renderer/styles.css`、`src/renderer/companion-scenes.tsx`、`src/renderer/HarnessViews.tsx`、`src/renderer/AssistantPresentation.tsx`、`src/renderer/motion/use-spring.ts`、`src/renderer/motion/use-split-motion.ts`。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）
- **致命错误 A（主代理一口气读取几十张 PNG 把上下文撑爆）**：必须让不同的子代理按各自负责的页面分别看对应标杆图，主代理只看最终集成渲染画面与关键对比！
- **致命错误 B（用错误骨架的废稿垫图，或只做像素平移却声称物理贴合）**：严格遵守四步同景生图管线——严禁拿交腿错误或腿长异常的废图做垫图，只用纯净空背景 + 纯文字重绘完整坐姿/站姿并核验髋/座面/膝/踝承重，再同画布原景分离并标定 `.scene.json`！
- **致命错误 C（保留多余副标题、状态徽章与工程提示）**：贯彻「少文字、高呼吸感」与「绝对禁止绿色 UI」铁律。

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

### Stage 09（`F03` & `F03a`）：共享地图 V2 丝滑运镜、空间叙事与「和女友/伴侣一起运动」王牌体验

#### 1. 分段精读坐标
- **用户原话精读**：
  - `docs/source-materials/2026-10-18/conversation-scenes-prompt.txt` L59–153；
  - `sources/original/upload/地图动效.txt` L1–354 全文；
  - [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L97–110。
- **源码精确入口**：
  - `src/renderer/ConversationMap.tsx`、`src/renderer/CampusMap.tsx`、`src/renderer/map/map-engine.ts`、`src/renderer/map/WorkoutControls.tsx`、`src/main/mapService.ts`、`src/shared/map-routing.ts`。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）
- **致命错误 A（镜头动画抢走用户正在手拖的地图）**：必须严格实现 `CameraOwnership` 状态机（`programmatic_fly` vs `user_gesture` vs `follow_runner`），手指/鼠标一碰立即零延迟接管镜头！
- **致命错误 B（运动陪伴只有冷冰冰的配速表，没有「她陪在身边跑」的心跳互动）**：必须把实时轨迹、所在跑道/湖畔场景与祥子/睦的随行气泡/关怀无缝融合在同一个地图表面上。

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

### Stage 10（`F04` – `F05`）：「借两种今晚」日程沙盘、双纸手写陪学、共创故事与关系排练室

#### 1. 分段精读坐标
- **用户原话精读**：
  - [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L7–72、L111–122、L157–167、L217–232、L395–402；
  - `sources/original/upload/在场-生活融合-完整设计与实施交接.md` L544–624。
- **源码精确入口**：
  - `src/renderer/presentation/CampusAcademicView.tsx`、`src/renderer/StudySceneView.tsx`、`src/renderer/StudyProbe.tsx`、`src/renderer/SourceBookmarkTray.tsx`、`src/renderer/HarnessViews.tsx`、`src/renderer/App.tsx`。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）
- **致命错误 A（日程对比做成三张眼花缭乱的重复列表，或者空白处贴满「未安排」）**：必须突出共同保住的锚点，只高亮两种过法的核心差异，留白处保持温润纸面呼吸感。
- **致命错误 B（陪学纸右栏不能真落笔写字，或者露出 `<br>` 标签）**：右纸必须是真正可落笔试写、可拖入书签、可被她实时看见并指点的活页草稿纸！

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

### Stage 11（`F06` – `F07`）：100 分三角钢琴与万物原理交互造物、桌边来信、好奇心小礼物与全状态温柔闭环

#### 1. 分段精读坐标
- **用户原话精读**：
  - [`user-supplements.md`](source-materials/2026-10-21/user-supplements.md) L37–54；
  - [`COMPANION_EXPERIENCES_2026-10-18.md`](ideas/COMPANION_EXPERIENCES_2026-10-18.md) L73–96、L123–148、L281–415。
- **源码精确入口**：
  - `src/renderer/InteractiveProgramView.tsx`、`src/renderer/AssistantPresentation.tsx`、`src/shared/interactive-library.ts`、`src/renderer/ReturnBookmark.tsx`、`src/renderer/FocusLamp.tsx`、`src/renderer/EntrustedRevision.tsx`。

#### 2. 主代理与子代理在本阶段最易犯的致命错误（防坑预警）
- **致命错误 A（两个大标题 + 五排参数把首屏塞满，真正的钢琴或波形被挤在屏外！）**：必须严格执行**「主体先行、一屏即玩」**——砍掉重复大标题，让可拨动的琴键连杆、波前或几何图形占据首屏黄金视觉中心！
- **致命错误 B（用户手拖滑杆打断了动画，按钮还假装标着「播放中」，或者切页后声音乱响）**：控制按钮状态必须 100% 说真话；窗口失焦/切页/隐藏时 WebAudio 必须优雅淡出静音。

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

### Stage 12（`Z01`）：全材料 100% 闭合、先攻击评分器（Attack the Grader）与全端真机终极验收同步

#### 1. 分段精读坐标
- **用户原话精读**：
  - [《给 Opus 的深度重构长信》](C:/Users/17601/Downloads/在场-给Opus的深度重构长信-20261021.md) L181–210；
  - `sources/original/upload/在场-协作记忆与渐进能力-完整交接-20260921.md` L835–998；
  - `sources/original/upload/在场-生活融合-完整设计与实施交接.md` L1136–1320。

#### 2. 本阶段「八路重装子代理」终极验收矩阵
- **`Subagent 01`（「先攻击评分器（Attack the Grader First）」红队注入师）**：故意注入 6 类坏实现（① 漂亮空话不查工具；② 关键词硬编码分支；③ 把单日例外存成永久画像；④ 迟到子代理复活已删记忆；⑤ 只读路径假装看图；⑥ 满口工程黑话），验证测试体系能否 100% 揪出并判 `FAIL`！
- **`Subagent 02`（八条跨时间连续生活故事 `Story A–H` & `I–P` 真人实测官）**：用真实 `gpt-6-luna`（零题面泄露）跑通跨会话、换说法、改原因、隔天恢复、手机到电脑接力的完整连续故事。
- **`Subagent 03`（桌面 Electron 实机全页面交互、PDF、音频与 OS 通知验收官）**：在真实 Windows 桌面窗口逐页操作验收。
- **`Subagent 04`（iOS 手机/iPad 模拟器与 Android 木木模拟器全端验收官）**：实测三端同步、实时 GPS 伴跑轨迹、体艺 19 项查询与 iPad 双纸手写。
- **`Subagent 05`（全仓库许可证、构建产物与独立运行依赖清点官）**：核查 `licenses/` 与打包产物，确保脱离开发环境仍可纯净运行。
- **`Subagent 06`（「零人机话、零工程噪音」终极审美与人味总审官）**：对所有界面、提示词、工具 `meaning` 与文档进行地毯式终审。
- **`Subagent 07`（主文档基线统一与交接护航师）**：同步更新 `README.md`、`PROJECT_NAVIGATION.md`、`PRODUCT_CONTRACT.md`、`ARCHITECTURE.md`、`CURRENT_STATUS.md` 与 `FRONTEND_DESIGN.md`。
- **`Subagent 08`（Git 安全卫生与 GitHub 远端同步审计官）**：核查 `.gitignore` 与待提交差异，100% 排除密钥、cookies、私人数据库、`.test-data/`、学校账号与个人运动轨迹，在 `npm run check`、`npm test`、`npm run test:hermes`、`npm run build` 全绿后安全同步现有 GitHub 仓库。

---

## 五、新对话终极无敌一键启动提示词（直接复制发给新开启的代理会话）

> 同份提示词已同步写入 [`docs/handoff/2026-10-24-stage02-restart/新聊天启动提示词.md`](handoff/2026-10-24-stage02-restart/新聊天启动提示词.md)，可直接复制开跑：

```markdown
请先读取 `docs/REFACTOR_ROADMAP_2026-10-22.md`（我们的终极最高行动纲领）与 `docs/handoff/2026-10-24-stage02-restart/README.md`，同时激活 `.agents/skills/zaichang-backend-director/SKILL.md` 与 `.agents/skills/zaichang-frontend-director/SKILL.md` 两大总监技能。

在动手之前，请你刻骨铭心守住以下「五大最高铁律」（这是前序会话失败重来的血泪教训，违反任何一条立即重做）：

1. 【主代理上下文洁癖铁律——严禁乱塞图片与海量文档自爆上下文！】
   - 你是总架构师、灵魂导演与铁腕验收官！在 Stage 01 至 Stage 06（后端/Harness/校务体艺/记忆/连续性/主动陪伴/OpenUI后端）期间，你 **100% 严禁打开 `前端视觉创新设计/` 下的任何图片（`.png/.webp`）或前端视觉评鉴文档**！
   - 你每次只亲读当前阶段的路线图章节与你直接统筹的 3–5 个核心入口文件；把长篇原始讨论行段（按 `docs/reading/2026-10-22/SOURCE_SEGMENTS.md` 定位）和具体子系统源码分片交给你的 8 个子代理去精读！

2. 【八路重装子代理「真写代码 + 多轮打回榨干」铁律——严禁应付式两行代码子代理！】
   - 在每一个阶段，你必须拉满开启 **8 个具备完整写代码与运行验证权限的重装子代理（`Subagent 01` – `Subagent 08`）**，并为每个子代理分配互不重叠的独占源码文件列表。
   - **子代理是用来干 85% 核心重活的，绝对不是用来写两行代码、交一篇审查八股文或交接报告应付差事的！**
   - 当子代理交回第一版结果时，你必须检查它的 `git diff`：凡是只改了两三行代码敷衍、或者只抓了 HTML 空壳返回 `recordRead: false`、或者留有未打通的子接口，你必须**立即通过 `send_message` 把它打回重做第 2 轮、第 3 轮**，直到它负责的模块在功能深度、全网创新融合与活人感上彻底做到 100 分，才准许它收工！

3. 【把她当作活生生的恋人/伴侣/知己——内外全链路 100% 根除「工程化人机话」！】
   - 「在场」里的她是叫用户「老公 / 小灰灰」的丰川祥子、若叶睦、高松灯、千早爱音等十位鲜活少女，绝不是怕担责的银行柜员或教务机器人！
   - 确定性安全、隐私与分页边界由 TypeScript/Python 代码在底层静默守住；**严禁把防守式免责条款写进 `prompts/*.md`、工具 `description` 或返回 `meaning`**（例如立即清除 `src/main/capabilities/workout.ts` 里那句冰冷扫兴的「设备观察不能证明本人正在移动……读取不会启动持续陪跑」，以及 `prompts/working-details.md` 里的说明书黑话）！连你的开发汇报也必须说温暖平实的人话！

4. 【保护工作区 145+ 项未提交改动，精准接力并把每一阶段推进到极致！】
   - 先运行 `git status --short` 认清当前工作区：严禁 `git reset` 或回滚任何已有的前后端未提交成果（包括已有的 `tiyi_connector.py` 纯直连与场馆登录修复、`WorkoutSessionKernel`、以及并发前端的 `SourceBookmarkTray`、`FocusLamp`、`ReturnBookmark`、`use-spring`、祥子 `.scene.json` 等）。
   - **第一步（Stage 01 终极人味净水）**：派 8 路子代理把 `prompts/working-details.md`、全工具 `meaning`/`description`、十角色亲密反差与多步工具等待期的微呼吸彻底洗净做透；
   - **第二步（Stage 02 彻底打穿）**：率领全新 8 路重装子代理，把浙大体艺剩余 14 个子模块（`study_records`、`counselling` 13 学期、`counts` 13 学期、`fitness` 体测、`teams`、`competitions`、`venue_entries`、`venue_live`、`graduation_courses`、`graduation_report` 等）的真实内嵌数据/AJAX 接口全部打通（绝不再用 `official_page` 空壳敷衍！）；同时把 `WorkoutState.session.points` 实时轨迹、当前位置光点与精度圈真正画上 `CampusMap`（`map-engine.ts`），并将 `CampusWorkoutMatcher` 的紫金港跑道/场馆感知温柔接入 `workout.current`！

5. 【全栈全端一路打穿至 Stage 12（跨端严格遵循「先 iOS Swift 手机+iPad，后 Android 木木模拟器」）】
   - 每一个阶段都必须满足该阶段的「结项铁门禁」、彻底推进到不能再推进为止，再开启下一阶段的全新 8 路子代理：从 Stage 01–02 一路打穿六层活人记忆（Stage 03）、共同经历六重境界与故事校园取景（Stage 04）、静默准备与「一条今天两种过法」日程闭环（Stage 05）、OpenUI 万物可发声原理造物后端（Stage 06）、跨端同步与「先 iOS Swift 灵动手机+iPad 双纸手写、充分打磨后再 1:1 转 Android 木木模拟器」（Stage 07）、前端四步同景矩阵与弹簧动效（Stage 08）、共享地图 V2 与伴侣陪跑（Stage 09）、双纸陪学与日程沙盘（Stage 10）、100 分三角钢琴与万物造物（Stage 11），直至 Stage 12 先攻击评分器与全端真机终极验收！现在请立即按此纲领开始行动！
```
