# 当前状态

核对日期：**2026-10-18**。本文件总结当前源码的功能、接入与验证范围；`package.json` 的产品版本为 0.3.0。本轮源码包含学生 Harness、对话场景和前端演进；源码同步不代表线上地图已更新，也不构成新的完整产品验收标签。

当前 Windows x64 便携版为 [v0.3.0（最新版）](https://github.com/1760139151lkh-ctrl/zaichang/releases/latest)，由 `74e099a2a3e23d0e7fffb075a1c1e22727976004` 构建，内含 Hermes、Python 和原生 PDF 运行时。2026-10-18 本机 `npm run package`（独立输出目录）、141项现有检查、9项 Hermes 检查、公共产物检查及 Windows 桌面/PDF 检查通过。包内 `app.asar` 程序已用隔离数据目录实际启动，首页和共享地图正常加载，地图版本为 `campus-v3-f86b9ec6a26fb2b2`，未报页面错误；另以包内 Hermes 运行时通过现有单项主循环检查，以包内 PDF 运行时完成文字读取及 JPEG 渲染。最终便携 EXE 也完成自解压并进入首页，已正常关闭核查窗口；本机启动时展开运行时需等待数分钟，本地 `win-unpacked/在场.exe` 可直接启动。此次未调用真实模型或私人校园账号，未重新验收全部前端流程，也未更新公共地图 Site。下载和复现见[发布说明](DEPLOYMENT.md#latest-windows-release)。

## 2026-10-18 续作：后端已完成，前端接入中

本轮从 `c7cff22884fe9a3050879067dd49012f685d8cfd` 的后端加固保存点续作。当前要求见[补充要求](source-materials/2026-10-18/continuation-requirements.md)。先审查真实仓库和输入，再并行研究、实现与复审后端；首轮合并 `npm run check` 与 **258/258** 机制检查通过后，完成四组 GPT Image 设计，再进入前端。用户已明确覆盖历史“Luna 未通过就不能前端”的门禁，真实模型与外部连接的未知继续单列。本轮没有更新上方已发布 EXE 或公共地图 Site。

需求与全部后续工作见 [HARNESS_EVOLUTION](HARNESS_EVOLUTION.md)，研究/调用链见[项目导航](../PROJECT_NAVIGATION.md#current-evolution)。[原始来源](source-materials/2026-10-18/README.md)保存实施包、完整记忆讨论、Harness 讨论、动态场景与前端理念；manifest 和五个附件回执保留字节/hash对应，其中上传记忆短版为完整版的字节前缀，不另存一份冲突“最新版”。来源是设计输入，不是用户运行数据。

| 本轮后端实现 | 实际行为与限制 |
| --- | --- |
| 记忆调查与回查 | `search_context` 支持主查询和最多五个关联查询，以及有限扫描；`read_understanding` 展开有版本的原话、依赖、条件、例外与覆盖缺口，更正后的后续线索可回查。原文和理解分开，查询/候选不是证据；投影边界不回显查询串。向量检索未接，不能保证所有同义表达召回。 |
| 跨会话接续 | 当前上下文获得有限的有效准备材料和未完事项索引，不复制全部历史正文；严格核对主体/世界/来源/期限，session-only 不跨会话。已看同版本不重复推荐；原材料采用时再验证。不是新的长期记忆库或第二个后台循环。 |
| 主动决策与子调查复审 | 有效期材料造成的自身托付修订，只有同事务、精确前后版本可推进快照；之前/之后的独立编辑仍中止旧调查。正常决定不介入可完成；已有问题与排队建议可回到聊天，问题不冒充研究，独立提醒不受影响。 |
| 日程分段与恢复 | `planning.draft` 增加分段上限，保留依赖、连续要求、准备收尾、转场休息和留白；`planning.recover` 回读真实已保存项，标出修改或完成、删除、重复与未记录；只有仍有效且边界一致的完整票据才返回剩余请求，重启后仅报告实际观察，总步骤可能未知。逐项采用不是整组原子事务，不恢复失效票据和旧授权。 |
| 日程真实来源 | 外部源解析接口携带当前 scope；生产 resolver 仍未连接，依赖外源的草案继续 blocked。恢复不能凭计划标题重建学校事实，不能把本机记录当官方有效计次。 |
| 角色与方法 | 保留三个原创预设，新增丰川祥子/若叶睦的有限来源与项目演绎；显式采用演绎或保留原角色，外部 Character Card JSON 只转换可编辑文字草稿，不执行卡内指令/宏/脚本。十份方法按需发现，保留版本、依赖和连接状态；真实模型人格稳定待验。 |
| 对话规划与环境 | `PlanningScene` 从真实 preview/draft 投影工作、忙碌、准备、收尾、转场、保护和未知；`EnvironmentScene` 投影小时天气或空气，保留各指标单位/标准与覆盖。选择只引用一个精确对象，所有相关来源恢复时重查；渲染进行中。 |
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
| 记忆 | 原文与条件断言、恢复队列、更正/停用/忘记、依赖失效、多查询与有限扫描 | 确定性边界及部分历史语义流程有证据；无向量后端或通用长期理解保证 |
| 记事本与资料 | 笔记原文/CAS/版本/撤销/回收站；TXT/MD/PDF分页、检索、原文定位、页面像素及图片输入 | 历史笔记/长文/冲突/草稿已实际操作；Windows原生PDF证据独立，无OCR或任意Office格式承诺 |
| 文字人格 | 五个可编辑预设/自定义、纯角色常驻、保存/恢复/模板；新演绎来源与外部卡草稿 | 原三预设历史同事实差异有限，新两角色有配置/边界检查，真实模型稳定辨识未验；显式界面接入中 |
| 情境与规划 | 有界 situation、冲突/未知预览、多任务依赖与分段、完整占用、逐项采用和恢复 | 历史实际约饭/学习块/同对象修改；新增恢复有机制检查。外部源版本resolver未接，日历空白不等于现实空闲 |
| 日历与提醒 | 事件/待办/截止/提醒/时间块、时区、重复/例外、同对象修订和撤销；有限ICS输出 | 历史保存/重开/删除恢复/旧撤销冲突有证据；ICS有确定性与真实IPC文件输出检查，系统原生文件框人工操作、系统导入/同步另验 |
| 持续托付与帮助 | 真实原话/来源/期限/停止条件，来源变化/时间节点复核；prepare/wait/ask/notify/none及现有材料复用 | 历史 Luna 安静准备路线；本轮修复自身修订、none和准备复用。暂停/停止/撤权压过迟到结果，OS提交/送达/已看分开 |
| 工具、方法与子代理 | 十份按需方法；当前权限/连接状态；事实缓存、等价共享、独立取消、真实delegate及共享预算 | 历史公开天气共享与真实子代理有回执，新后台边界有机制检查；方法不是可安装代码或权限授予 |
| 对话动态场景 | OpenUI有限Map/Weather/Campus/Planning/Environment五类，精确版本视图与单一选择 | 原地图/日级天气/校园卡有历史操作；本轮新场景后端已查，实际界面进行中。不是任意UI或客户端工具执行器 |
| 地图与空间 | 唯一公共地理/步行图，暖灰金空间地图，同surface内嵌/聚焦，真实相机与平面回退 | 历史总览/斜视/路线/聚焦/平移缩放旋转/手动接管/无WebGL已查；现场通行和室内路线未闭合 |
| 天气、空气与公开研究 | 公开参考地点、日期/小时窗口、覆盖；空气PM2.5/PM10/US与EU AQI；搜索/网页/PDF续读 | 历史天气和本轮前的公共空气HTTP200解析有证据；预报不是实测或设备位置，搜索相关不等于已核验 |
| 校园适配 | 本地导入与另装账号连接器，按资源细分权限/覆盖/回执 | 隔离与适配已接；无本轮真实大学账号/全部分页资源验收，官方跑步有效计次尚待 |
| 对外草稿与公开展示 | 受众投影、可编辑候选、选定内容和返回私聊 | 准备/显示不等于邮件或钉钉发送，桌面展示不等于公共地图Site |
| 外观与陪伴形象 | 阅读主题/密度/字号、六个内置形象、自选图、窗景/少动态/静坐及现有导航 | 六形象和图库有历史隔离桌面操作；新显式绑定与卡草稿流程待本轮界面收口，不增加权限或自动改本人画像 |

入口与状态所有者见[项目导航](../PROJECT_NAVIGATION.md)，机制见[架构](ARCHITECTURE.md)，用户利益与设计方法见[产品约定](PRODUCT_CONTRACT.md)。

<a id="frontend-evolution"></a>
## 当前前端演进与动态界面

### 本轮：图像先行后接入现有流程

后端首轮258项通过后，生成并查看规划、环境、角色、日历交接四组 GPT Image 方案；[manifest](../assets/design/generated/2026-10-18-companion-evolution/manifest.json)保留哈希、阶段与使用边界，[prompts](../assets/design/generated/2026-10-18-companion-evolution/prompts.md)保留提示词。设计稿里的示例时间/数据不进入生产事实，手机插图只表达响应式方向。

| 实施方向 | 当前进度 | 仍需记录的证据 |
| --- | --- | --- |
| 对话规划时间带与小时环境 | 后端来源/版本/选择契约完成，真实组件实现中 | 真实组件渲染、选择续接、窄窗/主题及未知恢复 |
| 角色与形象、卡片草稿 | 共享契约和安全转换完成，设置入口接入中 | 保留原角色/采用演绎、草稿可编辑/拒绝、保存失败与恢复 |
| Workspace日历交接 | 入口、有限日期与详情选择、结果和恢复已接 | 1220/720px与深色实看；改日期、Escape返焦点、外部关闭、反复开闭；合成Store→真实Bridge保存2项→UI导出ICS文件已查，空/取消无文件与假成功；原生保存框仅定向stub |

这三路继续使用“聊天 / 今天 / 留下”、既有消息/资料/安排与版本化设置，不为后台记忆增加常驻工程面板。日历交接已通过独立真实组件与IPC观察：默认无详情，全天非占用条目透明且结束日期排他。角色已观察采用演绎保存新revision、撤回和草稿保护，窄窗/冲突仍在收口；场景正在实际查看。最终全量检查待统一记录，不把图稿或源码存在写成全部前端验收。

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

- 真实模型的长期记忆、同义回忆、人格一致性与主动分寸尚待连续使用验证；向量检索未接。确定性检查可保护已知机制，不能保证所有开放语义。
- 校园查询需另装并私下认证连接器；考试发布、逐次课表/例外、GPA规则、跑步有效计次、审核状态及分页覆盖须看具体资源契约。外部规划来源版本resolver尚未接入，依赖它的采用保持blocked。
- 校园预约/选课/付款、邮件或钉钉外发、手机GPS/健康/同步、语音输入、通用生产ChatGPT登录没有完整服务闭环。ICS是可互操作文件，未等同系统日历实导入、实时同步或手机产品上线。
- 桌面退出后机会轮询停止；无手机/远程常驻保证。OS通知按实际回执区分提交、送达与已读，固定提醒不因普通机会预算被省略。
- 数据库整体未加密，凭据按系统机制另存；备份须保留隐私fence。localStorage外观与主机业务导出/清除不同，完整清理范围需相应实际证据。
- PDF无OCR；搜索相关性、候选记忆和未读网页不当作核验事实。缺工具、未读、失败、部分结果与现实不存在分别表达。
- 本轮新界面仍在集成；原生窗口、系统缩放/输入法、真实账号和不同设备的长期体验需要对应实机证据。手机/平板有设计方向，没有完整产品、同步和后台生命周期实现。

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
