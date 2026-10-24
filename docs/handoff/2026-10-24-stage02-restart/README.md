# 2026-10-24 终极融合交接包：上下文保护 · 八路重装子代理 · 全工作区改动地图

本目录是开启新会话推进「在场」全栈打磨的**现场交接导航中心**，与最高行动纲领 [`docs/REFACTOR_ROADMAP_2026-10-22.md`](../../REFACTOR_ROADMAP_2026-10-22.md) 完全融合。

---

## 一、为什么前序会话会被叫停重来？（主代理必读防坑指南）

前序会话犯下了四个必须在本轮彻底根除的错误：

1. **主代理乱看图片与海量旧文档，一上来就把上下文塞爆**：
   - 前序主代理在启动时把几百份历史记录、前端视觉评鉴文档甚至大量 `.png/.webp` 图稿一口气读进主代理上下文，导致上下文窗口瞬间拥堵、后续智力严重下降。
   - **本轮铁律**：**在 Stage 01 – Stage 06（后端阶段）期间，主代理 100% 严禁打开任何图片文件或前端视觉评鉴文档！** 主代理只读当前阶段的核心路线图与自己直接统筹的 3–5 个入口源码，其余长文行段（按 [`SOURCE_SEGMENTS.md`](../../reading/2026-10-22/SOURCE_SEGMENTS.md) 切分）与子系统代码一律分片交给 8 个子代理去精读！
2. **8 个子代理沦为「应付式两行代码 + 八股审查员」**：
   - 前序子代理每人只改两行代码、写一篇审查报告或交接文档就匆匆退出，把繁重的编码全丢给主代理一个人干。
   - **本轮铁律**：**子代理是重装特种工程师，必须承担每阶段 85% 以上的实质代码开发！** 严禁子代理交一篇审查文档充数。子代理交回初版代码后，主代理必须检查 `git diff`，凡是改得浅、只返回 HTML 空壳（`recordRead: false`）或写了人机话的，**一律通过 `send_message` 打回重做第 2 轮、第 3 轮，直到彻底榨干做精为止**！
3. **用「工程化防守黑话」污染伴侣灵魂**：
   - 前序在 `src/main/capabilities/workout.ts` 里塞进了「设备观察不能证明本人正在移动……读取不会启动持续陪跑」，还把校园场馆匹配对模型完全屏蔽；在 `prompts/working-details.md` 里留了满屏内部字段说明书。
   - **本轮铁律**：确定性安全与边界由 TypeScript/Python 代码静默守住，**所有给模型看的提示词、工具 `description` 与返回 `meaning` 必须 100% 改写成温暖、自然、像知己/女友商量一样的人话**！
4. **每个阶段只做一点皮毛就匆忙跳阶段**：
   - 体艺 19 项才跑通 5 项直连 JSON（其余 14 项还停留在只抓外层 HTML 壳）、地图上连实时跑步轨迹线都还没画出来，就想草草收兵。
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
  - **浙大教务与 GPA**：`src/main/zjuAdapter.ts`、`src/main/integrations/zju_connector.py`、`src/main/capabilities/campus-query.ts`、`src/main/capabilities/campus-saved-source.ts`（已支持同 `bundle` 跨页续读、单科筛选与四分/五分/主修 GPA 读取）。
  - **浙大体艺纯直连与场馆登录**：`src/shared/tiyi.ts`、`src/main/tiyiAdapter.ts`、`src/main/integrations/tiyi_connector.py`、`src/main/tiyiSchoolSession.ts`、`src/main/capabilities/tiyi.ts`、`src/renderer/TiyiConnection.tsx`、`src/renderer/tiyi-connection.css`。
    - *2026-10-24 已攻克*：`tiyi_connector.py` 已修复为 HTTPS UAA 登录（`zjuam.zju.edu.cn/cas/login`）+ 官方 HTTP 业务基址（`http://www.tyys.zju.edu.cn/cgapp-server/` 与 `/ptm/`，显式 `ProxyHandler({})` 直连免 WebVPN），并补齐了场馆两步独立令牌交换（`/venue-server/api/app/login/init` + `/api/login`），已跑通 `profile`、`terms`、`summary`、`records`、`venues/orders` 与场馆目录/时段。
  - **实时运动与定位桥**：`src/shared/workout.ts`、`src/shared/workout-source.ts`、`src/shared/map-workout.ts`、`src/main/runtime/workout-session.ts`、`src/main/runtime/workout-native.ts`、`src/main/runtime/workout-storage.ts`、`src/main/runtime/workout-cadence.ts`、`src/main/device-location.ts`、`src/main/ios-location.ts`、`src/main/map-workout.ts`、`src/main/capabilities/workout.ts`、`src/renderer/map/WorkoutControls.tsx`、`src/renderer/map/workout.css`、`apps/location-bridge/{android,ios}`。
- **Stage 02 必须由 8 路重装子代理彻底攻克的三大核心任务**：
  1. **打通体艺剩余 14 个子模块的真实内嵌数据接口**：目前 `tiyi_connector.py` L693–705 对 `study_records`（修学记录）、`counselling`（辅导站 13 学期切换）、`counts`（次数查询 13 学期切换）、`fitness_attendance`（身体素质课考勤）、`fitness`（体测成绩/预约/反馈）、`teams`（运动队/考勤）、`competitions`（我的比赛）、`venue_entries`（场馆出入记录）、`venue_live`（场地实况）、`feedback`（意见反馈）、`graduation_courses`（体测与锻炼课）、`graduation_report`（毕业体艺报告）、`westward`（西迁活动）、`codoon`（咕咚）仍只返回外层 HTML 空壳（`recordRead: False`）。必须解析并调用这些子系统（`/cts`、`/ms`、`/pft`、`/gms`、`/club2`、`/westward`、`/ggtypt`）的内嵌脚本 API 与学期参数查询，拿到真实个人记录！
  2. **把实时 GPS 运动轨迹画上 `CampusMap`**：将 `WorkoutState.session.points` 实时接入 `src/renderer/CampusMap.tsx` 与 `src/renderer/map/map-engine.ts`，在地图表面渲染暖金实时轨迹线、当前位置呼吸光点、精度半径圈与每公里分段点（同时确保 `apps/review-web` 公共地图物理隔离私人运动层）。
  3. **重塑 `workout.current` 的校园场地感知与伴侣人味**：在 `src/main/capabilities/workout.ts` 中安全投影 `CampusWorkoutMatcher` 匹配的校内场馆/路段名称（如「紫金港东田径场」「启真湖步道」，不外泄原始经纬度），并彻底重写那段「设备观察不能证明本人正在移动……不会启动持续陪跑」的冷水黑话，让祥子/睦真正像陪在你身边的伴侣一样关心你的跑步状态！

### 3. 并发前端已落地的未提交代码（后端阶段严禁破坏，Stage 08–11 直接接力深化）
- 已存在于工作区：`src/renderer/SourceBookmarkTray.tsx`、`src/main/runtime/source-bookmark-native.ts`、`src/renderer/StudySceneView.tsx`（书签拖入接收）、`src/renderer/FocusLamp.tsx`、`src/main/runtime/focus-session.ts`、`src/renderer/ReturnBookmark.tsx`、`src/main/runtime/workspace-return.ts`、`src/renderer/EntrustedRevision.tsx`、`src/renderer/motion/use-spring.ts`、`src/renderer/motion/use-split-motion.ts`、`src/renderer/companion-scenes.tsx`（含祥子 5 姿态 `.scene.json`）及 `src/renderer/InteractiveProgramView.tsx`。

---

## 三、本目录辅助专题索引（仅供对应阶段的子代理按需查阅，主代理勿一次性全塞！）

- [`新聊天启动提示词.md`](新聊天启动提示词.md)：直接复制发给新会话的终极启动指令。
- [`READING_PLAN.md`](READING_PLAN.md)：严格保护主代理上下文的「主代理轻量统筹 + 8 子代理分片精读」计划。
- [`CURRENT_SNAPSHOT.md`](CURRENT_SNAPSHOT.md)：工作区 `git status` 快照说明。
- `audits/01..08.md`：前期分专题背景梳理（供对应子代理按需参考，绝不替代精读原始用户讨论与源码）：
  - [`01-original-chat.md`](audits/01-original-chat.md) & [`02-continuation-chat.md`](audits/02-continuation-chat.md)：用户原话与灵魂纠偏脉络
  - [`03-architecture-and-stage01.md`](audits/03-architecture-and-stage01.md)：Stage 01 改动与文件索引
  - [`04-academic-and-campus.md`](audits/04-academic-and-campus.md)：浙大教务与多口径 GPA 细节
  - [`05-tiyi-complete-scope.md`](audits/05-tiyi-complete-scope.md)：浙大体艺 19 项模块逐项接口与缺口清单
  - [`06-workout-devices-and-map.md`](audits/06-workout-devices-and-map.md)：运动内核、多设备定位桥与地图轨迹缺口
  - [`07-frontend-and-openui.md`](audits/07-frontend-and-openui.md)：前端未提交组件与 OpenUI 状态（仅在 Stage 06/08–11 查阅）
  - [`08-roadmap-original-sources.md`](audits/08-roadmap-original-sources.md)：十二阶段原始材料精确行段映射
