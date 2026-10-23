# 主壳、主题与返回：源码调查和待定合同

2026-10-23；当前分支 `codex/personal-memory-continuity-20261018`。本记录只读调查已有源码及共享未提交改动，尚未批准图稿、修改产品代码或声称界面验收。

## 当前真正的入口

- `src/renderer/main.tsx` 载入 `App`、`design-system.css`，初始化 appearance 和 companion。`design-system.css` 只导入 `tokens.css`、`life-panels.css`。当前没有找到 `style.css` 或 `refinements.css` 的运行导入；不能因旧文件存在，就把其规则当成当前叠层或去修它们。
- `npm run dev` 经 `scripts/dev.mjs` 构建 Electron 并启动 Vite 5173；`npm run dev:luna:test` 经已有 Luna wrapper 去除 DeepSeek key 再启动同一入口。真实桌面通过有限 preload Bridge 读取宿主，不是浏览器单开 5173 就具备业务能力。
- Electron 默认 1220×850，最小 420×570，透明标题栏由 renderer 自绘（`main.ts:935`）。公共 `npm run review` 只支持公共地图，不能当作主产品替代验收。
- CUA 当前发现 Chrome 正常连接，但没有在场主产品的浏览器标签；本调查尚未实际观察运行画面，以下视觉风险均明确来自代码。

## 页面、状态和现有连续性

| 分类 | 正常入口与容器 | 需要按同一任务观察的状态 |
| --- | --- | --- |
| 对话 | App → `Navigation` 的聊天；`conversation-space` → workspace | 启动/读取失败、空欢迎、已有对话、长文/Scene退让、生成/停止/补一句、引用/附件、多行草稿、滚动离开底部、重进历史 |
| 资料共读 | 留下→资料，或头像菜单→一起读资料；retained-heading + MaterialsPanel + 同一个对话/composer | 无资料、列表、PDF/文本、页码/缩放、选段、批注编辑/冲突/未保存、分屏拖动、900以下原文/一起聊切换、跨页面再回来 |
| 笔记 | 留下→笔记；retained-heading + NotesFrame嵌入版 | 空白、列表、阅读、编辑草稿、保存/冲突、回收和恢复、分页/搜索、引用回聊天 |
| 今天 | Navigation→今天；`PagePanel` + `today-page` | 日期/周导航、时间轴/列表、无安排/错误、单项编辑、试放/撤销、托付页、返回原对话 |
| 形象与人格 | 头像→陪伴的样子；SettingsPanel初始陪伴页 | 角色选择/收藏/自定义、场景预览、光线、位置大小直接操纵、形象/人格分别保存、草稿与撤回 |
| 阅读与节奏/连接 | 头像→连接与偏好；SettingsPanel初始偏好页 | 明暗/字号/密度/少动态、主动和通知设置、连接/失败/取消、校园资料返回；改变设置后仍在同一页面 |
| 关于你 | 头像菜单；SettingsPanel初始记忆页 | 原来源/记忆管理、编辑、遗忘以及未保存内容保护 |
| 地图 | 同一消息/安排/头像菜单进入MapSheet | 原起点/终点/条件/相机，展开、聚焦与回原页；该状态必须继续归地图owner |
| 暂时表面 | 历史搜索、图片预览、当轮范围、退出草稿、公开展示、先坐一会儿 | 关闭、Escape、焦点回触发处、保留原稿/阅读位置；不为每个表面新建聊天或数据副本 |

已有良好基础应保留：Navigation 的三项主路径稳定、菜单已有键盘循环/外点关闭/Escape回焦；PagePanel 聚焦标题；Modal会返回触发焦点；聊天与资料复用同一composer且保留输入法和选区；笔记和资料首次进入后用 `active/hidden` 保持组件，避免来回切页丢草稿；日程新接的 `AgendaViewPosition` 在App内保留日期/范围/布局/搜索；PDF阅读地址按 resourceId+SHA、当前边界、页码/偏移/缩放/scroll持久化，重新读取仍归真实宿主。

恢复仍有不同寿命：外观和阅读分屏比例为localStorage；资料阅读地址为有限有来源版本的localStorage；settingsDraft、笔记/批注草稿、日程位置为当前窗口；SettingsPanel按view key重挂载，内部tab/滚动并未全局记住。不能把当前窗口返回和关闭进程重开合称“都能恢复”。

## 目前错位来自不同容器和状态结构

1. `App.tsx:1716` 的新 `room-collapse-toggle` 位于 `.app-main` 的 `titlebar` 之前。全src只有该处命中，没有CSS。它是column flex内的普通button，按正常布局会占行、把导航向下推。这是需要真实画面复现的明确代码风险；用户也已拒绝窗景边左右箭头分界设计，应取消此种常驻分界入口，保留 `chatSpace` 与阅读锚点的实质能力。
2. 外层共同标题没有共同标尺：PagePanel默认 `--reading-width`、padding-top42；今天width1040/padding24；设置wide width1240/padding28，又被rhythm/conversation width1150覆盖；连接width770；留下heading用自己的padding clamp(24,5vw,78)，内容又另定margin。不同内容宽度有理由，标题和返回动作因此无故漂移没有理由。
3. Navigation在标题栏绝对水平居中；窄窗有100高两层规则，旧design-system还有48高规则，靠更高特异性覆盖。需要维护现有两层成果，不能随意改一个titlebar高度影响其余宽度。
4. 主题变量已完整覆盖四palette的明暗语义色；但固定背景、少量影色、角色光线是不同来源。`CompanionScene`只按morning/dusk/night选背景，不读取palette。主题切换并不等于视觉资产/光影已校准。
5. 四主题入口已经在CompanionSettings的预览下方“界面色彩”；明暗/字号/密度在SettingsPanel“阅读与节奏”。两组并非缺失，但发现路径分散，当前没有统一的外观任务关系。
6. 角色可拖动是预览专属 `interaction`；普通聊天的editable未传入。当前拟合逻辑是矩形范围百分比和平面缩放，没有床面/地面透视锚点约束，不能把它当成用户要求的全场景、贴合空间的角色直接操纵。

## 待主代理图稿审查后采用的共同合同

### 容器和动作位置

沿当前top bar和三主路径，不增加第二套侧栏。统一的是稳定的外框、标题基线、返回槽与控件家族，正文按阅读/工作任务有不同最大宽度。

- 主壳顶栏只有一份，切页不改变品牌、主导航、历史/新对话/形象和窗口控制的位置；桌面72高、窄窗两层的现有方式先保留，具体尺度由统一图稿决定。
- 让 PagePanel 和 retained-heading 共用一组shell gutter/top-spacing/header-gap值。日程、设置、笔记、资料可保留各自width，但外部标题左锚和返回动作右锚一致；宽内容区内部可以再缩阅读列，不把所有内容强压成同一细列。
- 返回/关闭属于临时层时回触发来源；普通页面的“回到对话”回同一session和草稿。跨模块引用保留原owner地址，不能复制正文假装连续。
- 主要动作放当前对象标题同行右侧或编辑页固定末端；背景/主题切换不改变按钮几何。紧凑窗口先重组层级，不能靠缩字/裁掉操作和整页overflow hidden取得对齐。
- 窗景退让由内容需要和明确切换决定。入口进入同一固定动作槽；不恢复昼夜双拼或可拖分割线。

### 主题与资产

- 保留现有 `Appearance.palette`（apricot/mist/violet/rain）与 `theme`（system/light/dark）、readingScale、density。palette和明暗是两个可理解的选择，不顺手重置用户另一项偏好。
- 全部控件沿已有语义token：bg/surface/raised/wash、text等级、border/separator、accent/hover/soft/ink/focus以及反馈色。重点是实际叠层后的可读性和空间关系，不能只列hex。
- 同一外观区域容纳四主题选择与明暗/字号/间距；陪伴预览可以复用该入口或指向它，不维护第二份状态。变更即时可见，重开继续保持，系统明暗只在system时生效。
- 每个获选主题必须有同窗口/内容的GPT Image校准稿，且场景背景、光线和人物组合有明确适用资产，未有资产不能声称“图像随主题完整切换”。主题不能用UI绿色替代暖色体系；窗外植物保留自然色。
- 原景分离资源应保存同一场景尺寸、场景锚点、角色接触点/允许位置区和动作姿态关系。拖动不得越过正文保护区，缩放不破坏脚/床接触。这个合同需要图稿和角色/场景实现共同负责，不能只给body加CSS滤镜。

### 验证合同

主代理定图后，从同一真实桌面入口、隔离资料目录检查相近窗口下的所有独特页面关系；先看1220×850，再420×570及内容开始拥挤处，不用遍历所有按钮或新增测试脚本。

至少亲操：主导航跨页及菜单键盘、打开/收回窗景、长回复退让、资料分屏拖动与中断、修改主题/明暗/字号后的真实页面、切回草稿和阅读位置、MapSheet回原页、Modal关闭回焦、日程试放与实际回执。按实际受影响状态选择；与模型交接分开核，Luna不可用不能阻止不依赖它的界面完成，也不能冒称真实模型链路通过。

源码现状不是验收结论。本记录未新建测试或runner、未调用DeepSeek、未删除共享修改、未提交或推送。
