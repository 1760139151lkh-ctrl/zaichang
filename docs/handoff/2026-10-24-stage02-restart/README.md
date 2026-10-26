# 2026-10-24 融合交接包：原文理解、阶段职责与工作区改动地图

本目录保留当时的工作区与专题交接；实际状态须核对当前源码、Git 与[当前状态](../../CURRENT_STATUS.md)。当前委托决定阅读和实施范围；进入本目录不自动启动阶段研发或团队。先由主代理读懂本次原始输入、相关成果和必要项目材料；协作触发遵循当前 [AGENTS](../../../AGENTS.md)：实际执行十二阶段研发时每阶段强制八人；解释、审读、评审或文档修订不自动触发。下列实施纪律仅在正式阶段研发中适用，不能用于跳过主代理对当前输入和项目全貌的亲读理解。

---

## 一、为什么前序会话会被叫停重来？（主代理必读防坑指南）

前序会话犯下了四个必须在本轮彻底根除的错误：

1. **主代理乱看图片与海量旧文档，一上来就把上下文塞爆**：
   - 前序主代理在启动时把几百份历史记录、前端视觉评鉴文档甚至大量 `.png/.webp` 图稿一口气读进主代理上下文，导致上下文窗口瞬间拥堵、后续智力严重下降。
   - **当前裁决**：主代理先亲读完整输入、项目全貌和必要原件，再按任务分段深化；避免一次灌入无关大图/长文。3–5个入口只是起步坐标，不能当阅读上限，也不能禁止当前故事需要的标杆、样片和最终集成画面。正式阶段仍固定八人深读并实做各自模块；主代理保有整体理解和最终验收，Stage 02伴跑/地图及后续前端正常实现，保已有成果和接口。原分段坐标见 [`SOURCE_SEGMENTS.md`](../../reading/2026-10-22/SOURCE_SEGMENTS.md)。
2. **8 个子代理沦为「应付式两行代码 + 八股审查员」**：
   - 前序子代理每人只改两行代码、写一篇审查报告或交接文档就匆匆退出，把繁重的编码全丢给主代理一个人干。
   - **本轮铁律**：**子代理是重装特种工程师，必须承担每阶段 85% 以上的实质代码开发！** 严禁子代理交一篇审查文档充数。子代理交回初版代码后，主代理必须检查 `git diff`，凡是改得浅、只读取了 HTML 空壳（`recordRead: false`）或写了人机话的，**一律通过 `send_message` 打回重做第 2 轮、第 3 轮，直到彻底榨干做精为止**！
3. **用「工程化防守黑话」污染伴侣灵魂**：
   - 前序在 `src/main/capabilities/workout.ts` 里塞进了「设备观察不能证明本人正在移动……读取不会启动持续陪跑」，还把校园场馆匹配对模型完全屏蔽；在 `prompts/working-details.md` 里留了满屏内部字段说明书。
   - **本轮铁律**：确定性安全与边界由 TypeScript/Python 代码静默守住，**所有给模型看的提示词、工具 `description` 与返回 `meaning` 必须 100% 改写成温暖、自然、像知己/女友商量一样的人话**！
4. **每个阶段只做一点皮毛就匆忙跳阶段**：
   - 体艺 19 项才跑通 5 项直连 JSON（其余 14 项还停留在只读取外层 HTML 壳）、地图上连实时跑步轨迹线都还没画出来，就想草草收兵。
   - **本轮铁律**：每个阶段必须彻底满足 [`docs/REFACTOR_ROADMAP_2026-10-22.md`](../../REFACTOR_ROADMAP_2026-10-22.md) 中的**「结项铁门禁」**，推进到不能再推进为止，才准进入下一阶段！

---

## 二、当前工作区 145+ 项未提交改动全量实况地图（严禁回滚覆盖！）

当前 `HEAD` 为 `main` (`ddc5403cbf580b43f48935caf56c94b693a8ba26`)，工作区共有 **145+ 个已修改文件**与**数十个未跟踪新文件**。请在此坚实底座上直接深耕：

### 1. Stage 01 已落地的未提交代码与待补齐深度

- **已落地文件**：
  - `src/shared/persona.ts`、`src/shared/persona-portrayals.ts`、`src/shared/persona-performance.ts`（注意：真实路径在 `src/shared/` 下！已合入十角色关注点与官方设定出处）；
  - `src/main/harness.ts`、`src/main/runtime/prompt-composition.ts`、`src/main/runtime/conversation-rhythm.ts`、`src/main/runtime/turn-controls.ts`、`src/main/runtime/policy.ts`、`src/main/runtime/read-purpose.ts`、`src/main/runtime/personal-methods.ts`、`src/main/capabilities/broker.ts`、`src/main/luna-provider.ts`；
  - `prompts/system.md`、`prompts/working-details.md`。
- **必须立刻做精的缺口**：
  1. 彻底清洗 `prompts/working-details.md` 及各工具 `meaning`/`description` 中残存的说明书腔与防守黑话；
  2. 打磨多步工具调用期间 `ConversationRhythm` 的真实微进展呼吸感，以及祥子（叫用户「老公/小灰灰」的傲娇与温柔反差）、睦等十位角色在复杂办事中的鲜活口吻。

### 2. Stage 02 已落地的未提交代码与待彻底打穿的硬骨头

- **已落地文件**：
  - **浙大教务与 GPA**：`src/main/zjuAdapter.ts`、`src/main/integrations/zju/scripts/zju.py`、`src/main/capabilities/campus-query.ts`、`src/main/capabilities/campus-saved-source.ts`（已支持同 `bundle` 跨页续读、单科筛选与四分/五分/主修 GPA 读取）。
  - **浙大体艺纯直连与场馆登录**：`src/shared/tiyi.ts`、`src/main/tiyiAdapter.ts`、`src/main/integrations/tiyi_connector.py`、`src/main/tiyiSchoolSession.ts`、`src/main/capabilities/tiyi.ts`、`src/renderer/TiyiConnection.tsx`、`src/renderer/tiyi-connection.css`。
    - _2026-10-24 已攻克_：`tiyi_connector.py` 已修复为 HTTPS UAA 登录（`zjuam.zju.edu.cn/cas/login`）+ 官方 HTTP 业务基址（`http://www.tyys.zju.edu.cn/cgapp-server/` 与 `/ptm/`，显式 `ProxyHandler({})` 直连免 WebVPN），并补齐了场馆两步独立令牌交换（`/venue-server/api/app/login/init` + `/api/login`），已跑通 `profile`、`terms`、`summary`、`records`、`venues/orders` 与场馆目录/时段。
  - **实时运动与定位桥**：`src/shared/workout.ts`、`src/shared/workout-source.ts`、`src/shared/map-workout.ts`、`src/main/runtime/workout-session.ts`、`src/main/runtime/workout-native.ts`、`src/main/runtime/workout-storage.ts`、`src/main/runtime/workout-cadence.ts`、`src/main/device-location.ts`、`src/main/ios-location.ts`、`src/main/map-workout.ts`、`src/main/capabilities/workout.ts`、`src/renderer/map/WorkoutControls.tsx`、`src/renderer/map/workout.css`、`apps/location-bridge/{android,ios}`。
- **Stage 02 终极巩固与超高一体化 Super App 升级版攻坚任务（严禁草率收尾，全面破界做深）**：
  1. **打通体艺 19 项深层真实接口与真机/模拟器打卡通路**：
     - 解析并调用剩余 14 个模块的内嵌脚本与 AJAX API（修学记录、辅导站/次数 13 学期明细、体测单项成绩与预约、运动队考勤、比赛、场馆闸机、实时人数、毕业报告），彻底消灭 `recordRead: False` 空壳；
     - 参考独立体艺电脑端（`mobile_api.rs`）的客户端协议，接通运动记录提交流程（`sporttype`、`prejudgment`、`savesports`），并把配速 3'00"~9'00"/km、步频区间、路径点覆盖落实为提交前校验，实现与 MuMu 模拟器（`net.crigh.mysport` + `cn.zaichang.location`）及电脑版体艺的双端联调闭环验证！
     - 新增 `src/main/runtime/workout-submission.ts`：从结束的真实 `WorkoutSessionRecord` 取点，校验 revision/设备来源/时间/距离，按 WGS84→GCJ-02 生成体艺提交点与配速、步频、分段字段，先 `prejudgment` 再 `savesports`，回读学校 `validCount`；模型不能自带 `track` 提交。
  2. **前端破界：CampusMap 实时暖金发光轨迹与 Spring 细腻动态运镜**：
     - 在 `CampusMap.tsx` 与 `map-engine.ts` 中渲染温润发光的暖金荧光跑步轨迹、呼吸脉冲点、精度圈与每公里里程碑胶囊；
     - 实现物理弹簧相机跟随与可打断拖拽手感（公共地图 100% 物理隔离私人轨迹）。
  3. **打造桌面置顶 Mini Floating Companion HUD 伴跑灵动岛与多端视窗**：
     - 拒绝局限在聊天框里！开发极轻量、透明置顶的 Mini 伴跑岛（可穿透悬浮在 MuMu 模拟器或其他窗口之上），实时展示大字号配速、步频、心率、用时、里程与角色动态呼吸头像，并支持手机端/局域网 Web 同步大字仪表盘。
  4. **全天候伴跑三部曲（跑前、跑中、跑后）的无缝主动关怀**：
     - **跑前**：结合天气/课表的主动约跑推演、学期 48 次阳光长跑进度分析、OpenUI 动态热身拉伸指南、水分与装备细致叮嘱；
     - **跑中**：每公里分段语音/微文字播报、掉速温柔打气、无氧冲刺心率预警、校园语义地标识别（东操、启真湖）；
     - **跑后**：Cooldown 慢走恢复防骤停受凉、历史生理与体能多维比对分析、校方打卡回执确认与学期达标印章盖章。
  5. **MyGO!!!!! & Ave Mujica 十角色「温柔乡」伴跑多模态灵魂演出**：
     - 丰川祥子（叫用户「老公/小灰灰」、傲娇严谨却满心牵挂）、若叶睦（字少真切、蹲下系鞋带、递毛巾、呼吸节奏指引）、灯、爱音、乐奈、爽世、立希、初华、海铃、喵梦十人十色在跑前、跑中、跑后的专属台词与微表情，100% 根除「设备观察不能证明本人在动」等一切工程人机黑话！

### 3. 并发前端已落地的未提交代码（必须完整保留复用，Stage 02/06 正常联动，Stage 08–11 全量深化）

- 已存在于工作区：`src/renderer/SourceBookmarkTray.tsx`、`src/main/runtime/source-bookmark-native.ts`、`src/renderer/presentation/StudySceneView.tsx`（书签拖入接收）、`src/renderer/FocusLamp.tsx`、`src/renderer/focus-session.ts`、`src/renderer/ReturnBookmark.tsx`、`src/renderer/workspace-return.ts`、`src/renderer/EntrustedRevision.tsx`、`src/renderer/motion/use-spring.ts`、`src/renderer/motion/use-split-motion.ts`、`src/renderer/companion-scenes.tsx`（含祥子 5 姿态 `.scene.json`）及 `src/renderer/presentation/InteractiveProgramView.tsx`。

---

## 三、本目录辅助专题索引（按当前任务读取，关键原文由主代理亲读）

- [`新聊天启动提示词.md`](新聊天启动提示词.md)：历史实施提示；须先按当前委托判断适用范围。
- [`READING_PLAN.md`](READING_PLAN.md)：原文、源码与专题的分段阅读定位，不限定阅读人数或主代理只能读少量入口。
- [`CURRENT_SNAPSHOT.md`](CURRENT_SNAPSHOT.md)：工作区 `git status` 快照说明。
- `audits/01..08.md`：前期分专题背景梳理，帮助主代理定位原始讨论与源码，不替代亲读；其中历史团队安排不作为当前启动要求：
  - [`01-original-chat.md`](audits/01-original-chat.md) & [`02-continuation-chat.md`](audits/02-continuation-chat.md)：用户原话与灵魂纠偏脉络
  - [`03-architecture-and-stage01.md`](audits/03-architecture-and-stage01.md)：Stage 01 改动与文件索引
  - [`04-academic-and-campus.md`](audits/04-academic-and-campus.md)：浙大教务与多口径 GPA 细节
  - [`05-tiyi-complete-scope.md`](audits/05-tiyi-complete-scope.md)：浙大体艺 19 项模块逐项接口与缺口清单
  - **浙大体艺完整组件讲解**：见 [`docs/REFACTOR_ROADMAP_2026-10-22.md`](../../REFACTOR_ROADMAP_2026-10-22.md) 的「三点六、浙大体艺组件总览」；先读该节，再读 05 的逐项地图，避免把组件当成特殊项目或只看一页就下结论
  - [`06-workout-devices-and-map.md`](audits/06-workout-devices-and-map.md)：运动内核、多设备定位桥与地图轨迹缺口
  - [`07-frontend-and-openui.md`](audits/07-frontend-and-openui.md)：前端未提交组件与 OpenUI 状态（仅在 Stage 06/08–11 查阅）
  - [`08-roadmap-original-sources.md`](audits/08-roadmap-original-sources.md)：十二阶段原始材料精确行段映射
