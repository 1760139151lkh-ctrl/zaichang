# 教务、GPA 与校园来源交接审查

审查日期：2026-10-24。本文服务于新主代理全面理解在场后，重新从第二阶段开头深化实施。它是代码与已有证据的只读审查，不是本轮重新查了个人课表、成绩或校园账号的回执。本成员没有读取私人数据库、成绩/课程正文、协议原文或账号凭据，没有操作模拟器或应用，没有调用产品模型，没有新增测试、fixture 或 runner。只新增本文。

## 1. 必须先理解的产品目的

在场是陪大学生一起生活、学习、创作与办事的同一个伙伴，校园连接器是她理解现实的一种来源。校园能力不能收缩成“显示课表和算几个 GPA”的数据面板，也不能让成绩成为对人的总评价。

原始材料《在场-生活融合-完整设计与实施交接.md》7.1–7.2 的要求十分具体：保留资源发现、schema、条件/关系/聚合查询、覆盖、历史差异与原对象导航，不降级成三个固定查询模板；把课程、培养规则、目标、空间、设备、天气、学习表现和实践要求联系起来，形成确有依据的帮助。比如先修链是否影响之后选择、课间空档扣掉走路后是否还够打印、下一课前该回顾哪个概念、正式实践要求还剩多少余量。规则要适用于实际专业/年级/学期；不能由课程名推断培养要求，也不能凭 GPA 决定人生路线。

这也承接第一阶段：人格要进入“先注意到什么、怎样查、怎样解释分歧、怎样等待与接回来”的全过程。不能把查询后贴一句安慰称为陪伴。她可以反驳错误推算、认真讲完整证明、顺着用户的野心做深；对未知与失败说清眼前影响和继续路径，不背诵内部口径。

路线图只是下限。第二阶段要重新审视已有工作与真实断点，主动寻找有价值的跨模块结果；已经写出若干接口、一次 CLI 成功、一次模型回答或一组检查通过都不足以自动进入第三阶段。反复发现、修复、同触发复查，并由主代理亲自接受最终集成结果。

## 2. 截至本次审查能够支撑的状态

| 项目 | 已有实现/证据 | 证据边界与接续要求 |
| --- | --- | --- |
| 当前教务刷新 | [2026-10-23 教务专项](../../../evidence/2026-10-23-stage02-academic.md)记录正常 `quick classes --refresh` 重新取得两项课表来源，各有本次 UTC 采集时刻；同一 bundle、同一绝对窗、同字段读到末页，`next_offset=null`，无嵌套截断。 | 是当时环境的 CLI 来源核查，不等于本轮再次联网成功，不是当前桌面视觉或模型读取全部课程的证明，不证明出席或所有学年/考试已公布。私人课表及逐页结果没有进入公开文档。 |
| 课程学期 | `campusCourseLookupFilters`、`campusCourseQueryForSemester`把采集学期落实到实际课程行条件，同时保留明确跨学期选择。Adapter 会查询该 bundle 的真实学期。 | “选了学期快照”不能代替行级 `semester_id` 筛选；快照内还可能合并历年成绩/考试关联课程。未知学期不把全库当本学期。 |
| 无具体时刻考试 | 保留逐场考试和 `/normalized/exam_course_records` 原课程行两种不同对象；后者可固定版本分页。元数据质量不明仍给 partial，不捏造日期。 | 空日期的课程原行不必生成逐场考试；仅查有时刻事件会漏掉原行含义。要核“课程原行数”“解析出的考试场数”“当前页/全源/未知时间数”，不能混作一个总数。 |
| GPA 单科与权重 | [GPA 专项](../../../evidence/2026-10-23-stage02-gpa.md)记录：单科条件在连接器执行前成为真实筛选；经正常 Store/Harness、同产品对话与已授权 Luna，实际讨论了单科提分、总/主修分母和不同尺度。 | 该证据只支撑当次真实问题，不证明所有重修、课程替代、年级政策或正式审核用途均已完成。个人值、完整协议仍仅留本机。 |
| 主修汇总原对象 | 固定 `/normalized/transcript/major`，核成绩与主修两来源各自采集时间、完整性/新鲜度；有字段白名单。最终真实后轮通过原地址导航，只读 `gpa.fivePoint` 与 `gpa_credit_denominator`；实际请求、结果与一次读取回执一致。 | 是单对象，不伪造表格 offset/total/下一页。`gpa` 是四尺度对象，不能用选整个容器冒充仅读五分制。该后轮是模型/来源证据，不能继承为主修单对象最终桌面图表已亲验；当前常规学业 Scene 构造入口要求 `records` 数组。 |
| 历史快照续读 | 教务专项记录刷新后原 GPA 证明为 `historical_snapshot`，原 bundle 版本仍匹配；这一步只检查来源身份/字节版，没有解密成绩。 | 回读可固定不可变历史版本；规划与行动要求当前保存头，不能用历史 GPA/课表证明替当前安排签字。 |
| 显示与继续聊 | 已有 `CampusAcademicView` 明细/表格/趋势、制式切换、来源说明、选行后携带 scene/revision/record/scale；敏感持久消息保存 owner 地址，不保存成绩表副本。普通课程/课次/考试默认作为本机文档，模型只收到原地址与范围。 | 源码存在不证明最新桌面所有状态已逐一验过；趋势仅适用于至少两个真实学期、相同尺度，缺值不连假线。下一主代理须亲看实际内容与点选、回读、失效、重开。 |
| 规划校园约束 | 同一规划器读取课程、考试、校历取消/待公布及生成质量，按当前证明跨页；未知结束保守延至所选窗口末端。 | 不复制学校课次进本机日历；不证明出席、学校实时确认或本人空闲。未能展开规则、未公布日期、来源缺页仍阻止确认完整空档。 |

阶段总体仍为实施中，见[Stage02 总记录](../../../evidence/2026-10-23-stage02.md)。本轮审查没有重跑产品检查；该总记录与 GPA 专项中 282 项/9 项、类型与构建是各自当时源码和操作范围的历史回执，不是本次新增通过。

必须保留失败来历：GPA 曾因多余 `limit`、原快照地址缺失、过宽 `gpa` 选择失败；已沿同健康会话修正并复查。另一独立边界审查记录了“禁止刷新”被误解为只允许导入来源、以及把 GPA 汇总误判为整张逐科成绩的情况；保存方式、来源类别、实际字段、用途必须分别解释。不能只看最终两项值正确就删掉此前多读或误拒事实。

## 3. 真实代码链与对象归属

```text
本人当前原话/限源/用途
  → Harness / Coordinator 取得本轮合法 read scope
  → CapabilityBroker 校验 source / grant / 主体 / 现实 / 私下受众 / 契约 / 版本 / 取消
  → ZjuAdapter 的受限参数 → 已配置 zju-student-info Python CLI
  → 当前账号的加密 bundle + 规范化对象 + 来源覆盖
  → CampusSnapshotProofs 绑定账号/资源/bundle字节版
  → ContextCompiler 记原地址、字段、页位置、readOrdinal、观察时刻与原能力契约
  → 模型投影 / 本机 CampusScene 各按自身真实交付范围处理
  → 继续读或选行返回原 owner；规划另核 current-head proof
```

1. `src/main/zjuAdapter.ts` 是受限本机适配器，不让模型拼 shell 或任选目录。支持 `lookup/query/overview`、已保存来源、窄刷新、原对象读取、历史/差异、字段与身份去标；`campus:local` 导入与 `campus:zju-account` 账号来源分开。原有 `sports` 不把二三四课堂实践积分冒充学校有效跑步次数。
2. `src/main/capabilities/campus-query.ts` 定义资源、DSL、字段/指针边界、敏感字段拒绝、课程学期、固定查询与续页。资源/schema 是能力说明，不是个人正文已读或许可已取得。完整课程对象、嵌套 `grade/grades`、相关筛选/排序/聚合会触发真实成绩 grant，不能借 courses 名称绕开。
3. `src/main/capabilities/broker.ts` 校验来源、主体/世界、平台、effect、grant、能力版本，控制超时、取消、缓存与在途共享；缓存指纹包含当前权限、用途、来源及版本。受控 CLI 内部的学校网络行为与 Broker 泛 HTTP 请求接口是不同边界，不因前者成功就放开任意出站。
4. `src/main/runtime/coordinator.ts` 在查询前核实际敏感类别与采集范围，GPA 汇总向用途核对提供真实字段含义和“无其它逐科名称/分数”的区别；查询后登记真实来源，下一模型边界/完成前再次核 `verifyCampusSensitiveReads` 与 `verifyCampusReadingProofs`。
5. `src/main/runtime/campus-academic-source.ts` 的 `CampusAcademicSourceService` 绑定本轮本人原话事件/内容版本、sourceVersion、privacyEpoch、policyRevision、sourceBoundary；进程内用途批准不变成全局长期 grant。保留原回复的私人本机显示与把旧回复送进新模型上下文分别处理。
6. `src/main/runtime/campus-model-view.ts` 不把完整宿主 proof 重复塞进模型；普通课程/课次/考试返回 `modelBodyDelivered:false` 的原生文档地址/覆盖，不能说模型已经看完整行。主修地址须同账号、同 bundle、`gpa_overall` 的合法版本，不借其它资源签名。
7. `src/main/runtime/campus-academic.ts` 只投影真实字段，不重算 GPA、不填零、不合并学期、不把分析政策升级为校方结论。`src/shared/campus-academic.ts` 将持久敏感画面降为原 owner 地址；`src/main/runtime/scenes.ts` 核当前 session/scene/revision/source 与可读性，再按原对象显示或选行。
8. `src/main/runtime/context.ts` 和 `src/main/storage/repository.ts` 负责已读地址/收据导航、原授权事件与 carrier 证明，不新建校园事实库。`restore_collaboration(type=conversation, view=references, campus=...)` 可以只找同对话原主修对象元数据，随后按当前用途重新读值；不先读旧敏感回复，也不失效时回退 latest。
9. `src/main/actions/planning-campus.ts` / `src/main/runtime/campus-calendar.ts` / `src/shared/campus-calendar.ts` 是校园时间约束入口；它们读取原学校对象，原生只读查看没有模型调用和日历写入。Agenda 与学校来源始终是不同 owner。

### 当前运行依赖必须讲清

`ZjuAdapter.discoveredRoot()` 优先已选择路径、`ZAICHANG_ZJU_SOURCE`，再发现本机 `~/.codex/skills/zju-student-info` 或项目 `integrations/zju-student-info`。本机现有源码在 `C:/Users/17601/.codex/skills/zju-student-info/scripts/`；本次路径核查未见项目 `integrations/zju-student-info` 目录。`safeRoot` 还要求 scripts/zju.py、references/endpoints.json、SKILL.md、LICENSE。

因此，当前本机能运行不能直接写成新电脑完全自带校园连接器。下一主代理需核部署/打包所需独立依赖与许可、安装来源及配置恢复。不能为“独立运行”复制私人 vault、凭据或 profile；不要把阅读这些源码等同于获得个人数据查询许可。本次没有改动外部 Skill 或其数据。

## 4. bundle、版本、proof、分页与撤回不能混同

- `bundleId` 是实际保存资料身份；`CampusSnapshotProof.version` 包含 bundle、资源与加密文件字节身份。账号/连接根的身份、当前头的身份另存。`savedRevision` 是本机失效标识，绝非学校联网观察。
- `saved_head` 与 `historical` 分开；`readingState` 可为 `same_saved_head`、`historical_snapshot` 或 `unavailable`。原文件或账号换了即不可用。历史读取可继续，`isCurrentSnapshot`/规划/动作仍要求当前头与当前签发条件。
- 固定续页保原 bundle、`expectedSnapshotVersion`、fields、筛选、排序、绝对时间窗与 offset；`refresh:false`。相对“明天/本周”第一次求值后成为固定时刻。动态筛选/排序含 ongoing/ended/minutes_from_now 时属于 evaluation-dependent，不能伪造稳定下一页。
- 页条数、全查询匹配数、原来源完整性、学校接口全部分页采集、模型实际交付与用户看见分别计。空 partial 页、history 过滤后的空目录页、`navigate_required`、截断、source unavailable 不代表不存在。
- 一份原课程行可能含零/一/两场考试；主修 GPA 是单对象。它们不能套一个假的通用“第几条/下一页”。原对象 marker 必须与 pointer/field/版本相符。
- `readOrdinal` 是同回复的实际读取顺序；原消息持久序列是跨回复顺序。最大 offset、数组位置、采集时刻不能补猜“上次看到哪”。导航元数据不增加成绩读取次数，也不证明本轮已重读值。
- 多资源/关联查询如果 CLI 只返回根 bundle，当前 Adapter 明确不签整个组合来源的 proof；不能让根凭据替未识别的关联来源背书。深化时先补每个实际来源的身份与版本，不删掉限制凑“已支持复杂查询”。
- 读取前、返回后、模型请求和父采用前均复核当前范围。撤销授权、删原文、改原请求内容版本、撤回旧回复或 capability contract 改变，不得从已缓存 Scene、准备、子报告或旧导航把正文带回。独立合法来源继续可读；“不刷新”不等于“只准导入来源”，普通修订也不等于永久遗忘。

### 刷新还有一个常被忽略的实际范围

`campusAcademicAcquisition()` 记录窄刷新采集哪些来源。classes 刷新涉及 timetable_first、timetable_second、calendar；GPA/grades 涉及 grades、major；courses 会涉及更多关联源。窄刷新依赖同账号/同学期当前 latest 基线，并在本机读入、重新规范化原完整学业快照，其中仍含旧成绩/专业/实践资料。因此，少量返回字段不等于学校采集范围和本机处理范围只有那两列。宿主应照实际用途核验；没有可核基线不能偷偷整包采集。

## 5. GPA 的准确口径与现存方法边界

真实算法在已配置连接器 `scripts/academic_models.py`；在场的显示与模型说明复用它，不能靠 renderer 另算一份“真 GPA”。

| 概念 | 当前实际含义 |
| --- | --- |
| `fivePoint` | 校方逐科 `jd` 的原返回；异常/缺失有 quality issues，不能补零。 |
| `fourPoint` | 每科 fivePoint 的本机 4.3 兼容映射：5→4.3，4.8→4.2，4.5→4.1，4.2→4.0；≤4 原值；其它 >4 值兜底为4。兜底没有校方换算保证。 |
| `fourPointLegacy` | 每科 `min(4, fivePoint)` 再加权，仅为4.0封顶换算；不是学校历史按百分成绩的出国算法。 |
| `hundredPoint` | 若原分数为数值则保原数值；等级才用连接器等值表，分别标 `numeric_source` / `repository_equivalent`。 |
| GPA 分母 | 只有实际计入、可用绩点、正学分的修读学分；零学分不加分母，缺成绩/学分会让计算不完整。 |
| 全部/首次/最高/来源首条 | 独立分析口径；首次按学期排序，同学期先后仍未知；最高按百分等值选择，来源首条不能冒充第一次修读。体育重复组还保留跨学期区分。 |
| 主修 | 按主修来源匹配的修读集合，自有分母。`major:false` 只是未确认匹配，不是已证非主修；课程替代/审核权重仍需正式规则。 |
| 取得学分 | 与 GPA 分母分开；逐次取得学分相加可能重复计重修，不拿它作为毕业去重学分。 |

同次修读已计入，且其它记录/分母不变时：`G' = G + c × (p − p₀) / C`。新增确会计入、未替换旧修读时：`G' = (G × C + p × c) / (C + c)`。重修/替代先看真实选取规则；未出分课程只是条件试算；不同学期均绩按分母合并，不能算术平均，也不能先把总五分制均绩套单科换算。

已有 GPA 专项核读过浙大发本〔2022〕24号及历史出国换算说明：校内、2022级起出国成绩单、学院评价可能是不同规定。连接器“无效”排除与该文件第十八条不同，必须明确是本机分析，正式主修、推免、评奖、出国应核适用规则。本次没有新上网核对政策变更，不将旧查证写成本次最新政策结论。后续真做这些用途时重新打开实际发布原文，核版本/年级/专业/生效期。

## 6. 考试、课表与规划的不可丢约束

1. 学校排定课次不是出席，也不是用户一定在教室；位置、设备观测、用户自述和课表推测分开。课程地点可以帮助准备路线，但不成为当前 GPS。
2. 原考试时间文字、midterm/final 类型、座位、地点、source_ref 均留原对象。解析不出时间保持 unknown；没有任何时间文字的原课程行仍可沿 exam_course_records 找回，不能被时间窗查询永久吞掉。
3. 有界时间查询报告 `unknown_time_records` 并降低完整性；不能把未进入已知时刻结果的考试说成“没有考试”。即使当页读到末尾，原来源未完整仍保缺口。
4. 规划除课程/考试还读 cancelled_classes、calendar_pending、schedule_quality：待公布补课、未展开规则和未经校历核对的未来日期风险不能消失。已有取消须按原 session/date 对应；不按同名课程误删其它课次。
5. 未知结束保留 `end:null`；原查询把缺结束当时点时，规划会额外读同源缺结束行，避免早于窗口的未知尾部消失，并在本次窗口保守保护。不能为方便排版或腾空档发明结束时刻。
6. 窗口按学校 Asia/Shanghai 学期约定分段，原日期、明确时区和 `[from,to)` 边界保留；用户日账仍按其声明时区。跨学期/夏令时不能凭机器本地日期拍扁。
7. 学校安排只作为同一规划器约束，不复制进 Agenda 形成第二事实库。学校变更须重读/重算；已有计划/日历动作仍各核 planRef、expected revision、来源与实际回执，点击或试算不是写入许可。

## 7. 新主代理必须重读的资料与第一阶段依赖

先遵循总交接的全貌阅读顺序；本表不能被用来跳过用户明确要求的第一阶段全部材料。若某文件过长，沿实际连续行段分批读并登记下一位置；摘要/文件清单/搜索命中/截断输出都不算全文完成。

| 次序 | 文件入口 | 为什么必须读 |
| --- | --- | --- |
| 1 | `AGENTS.md`、`README.md`、`PROJECT_NAVIGATION.md`、`docs/REFACTOR_ROADMAP_2026-10-22.md`、`docs/CURRENT_STATUS.md`、`docs/PRODUCT_CONTRACT.md`、`docs/ARCHITECTURE.md`、`FRONTEND_DESIGN.md`、`docs/CONVERSATION_SCENES.md` | 建立产品/唯一运行链/owner/阶段/视觉与验证全貌。不能一上来仅运行 campus 命令。 |
| 2 | `C:/Users/17601/Downloads/在场-给Opus的深度重构长信-20261021.md`；`docs/source-materials/2026-10-21/user-supplements.md`、`goal-objective-current-20261021.md`；`docs/source-materials/2026-10-22/user-request.md`、`successor-request.md`；`work/successor-20261022/companion-correction-20261022.md` | 第一阶段与总体目标的直接原话；保住人格、理解自由、非工程腔和最新协作授权。 |
| 3 | 原包 `work/deep-refactor-20261022/handoff/在场-Opus深度重构-完整交接包-20261021/` 的 `00–11` 专题；`sources/original/upload/在场的记忆讨论.txt`；`sources/unpacked/gemini/在场-Gemini交接包/00–06`；`docs/ideas/COMPANION_EXPERIENCES_2026-10-18.md` | 必须知道校园能力如何进入同一个人的生活与多轮表达；第一阶段原话和完整包的阅读以总交接逐份清单为准，不只读本文摘出的段。 |
| 4 | `docs/reading/2026-10-22/FILE_GUIDE.md`、`SOURCE_SEGMENTS.md`、`CONVERSATION_REQUIREMENTS.md`、`CONVERSATION_COVERAGE.md`、`conversation-coverage.json`；`work/deep-refactor-20261022/summary/01_requirements.md`、`02_harness_sources.md`、`06_tools_maps.md`及各覆盖 JSON | 用来定位原文和历史确切范围；旧暂停/只本地/单人命令不能复活，摘要不能代替已指定的原文精读。 |
| 5 | 上述原包 `sources/original/upload/在场-生活融合-完整设计与实施交接.md` 全文，重点7.1–7.4、8.1–8.4（路线图坐标 L267–356，行号须回原文核） | 资源释放、培养/学习/实践跨数据价值、只读与写入分开、空间/多模态/隐私与条件帮助。 |
| 6 | `docs/evidence/2026-10-23-stage01.md`；`work/successor-20261022/B05-public-search-evidence.md`、`B05-text-encoding-evidence.md`、`B05-image-evidence.md`、`B05-material-navigation-evidence.md`、`B05-snapshot-boundary-review.md`、`B05-environment-evidence.md`、`B05-map-public-evidence.md`、`B05-spatial-private-evidence.md`及对应阅读账 | 本阶段前的来源/工具/原页与多模态/地点环境底座。共同使用它们不意味着重做已核流程，也不意味着可继承全部通过。 |
| 7 | `docs/evidence/2026-10-23-stage02.md`、`2026-10-23-stage02-academic.md`、`2026-10-23-stage02-gpa.md`、`2026-10-23-stage02-adversarial.md` | 当前实际做了什么、曾失败什么、后来修到了哪；不能从网络失败把正常教务也概括为不可用。 |
| 8 | `docs/reading/2026-10-22/TIYI_READING_PLAN.md`、`work/deep-refactor-20261022/summary/08_zju_tiyi.md`；体艺/设备专项见兄弟审查与总交接 | 教务与体艺来源独立，但需要共享校园生活/地图/运动理解；体艺不止订单查询，不能用教务验收替代体艺完整能力。 |
| 9 | 本文第3节全部代码文件；`src/main/harness.ts`、`src/main/runtime/policy.ts`、`turn-controls.ts`、`prompt-composition.ts`、`tool-surface.ts`、`conversation-rhythm.ts`、`prompts/system.md`、`prompts/working-details.md` | 从第一阶段读懂主模型收到什么、权限何时生效、如何继续查、边做边说与最终接受；不能只看 Adapter 孤岛。 |
| 10 | 已配置连接器 `scripts/zju.py`、`academic_models.py`、`academic_service.py`、`academic_calendar.py`、`student_query.py`、`quick_query.py`、bundle/vault 与接口目录对应源码（不读私人 vault 内容） | GPA/课程/校历/考试的真实算法和数据源在这里。必要时比较 Celechron 原积累，只选真正依赖的源码，不重构另一项目。 |
| 11 | `src/renderer/presentation/CampusAcademicView.tsx`、`campus-academic.css`、`AssistantPresentation.tsx` 中的 `CampusRecords`、`src/renderer/CampusDaySchedule.tsx`；`src/main/preload.ts` 与 `src/main/main.ts` 的 `campus:academic` / 校园日程 IPC 入口 | 追到用户真的打开、选行、续问、退出、重开，而非只停留后端。图稿/页面深化须沿当前设计规范与先图后组件管线。 |

当前 README 仍有“体育有效打卡没有现成认证读取入口”和笼统“GPS仍有独立接入工作”的旧概括；与最新 Stage02/2026-10-24 纯直连专项不完全一致。读全貌时要核时间与具体证据，不能让这些旧句覆盖已实现能力，也不能反向宣布十九项本人业务都已完成。本成员只记录这个冲突，没有改 README。

## 8. 第二阶段从头做深的实质方向与可观察验收

以下供新主代理在用户已授权的第二阶段内组织工作，不能冒充本轮已执行成果，也不替学校写动作签新许可。

| 深挖方向 | 必须得到的真实结果与验收方式 |
| --- | --- |
| 课程/考试完整语义 | 对当前已允许来源，经普通入口读清采集学期、行学期、已知/未知时间、课程原行与逐场考试的不同分母；固定原查询翻页、刷新后历史接续、当前规划重算各自成立。保留失败与实际采集时刻，不用标题/空页替正文。 |
| 面向实际目标的学业推演 | 用户指出一门课时只读必要源行，再核对应尺度、修读政策、计入状态和分母；同次提分、新增、重修替代分别解释。用实际问题看她能否讲清“为什么这门课对主修和总均绩的影响不同”，而非抛整张成绩单。正式用途另核规则原文。 |
| 培养与选择的上下文 | 研究可用的正式培养/先修/年级规则与现有课程 owner 的稳定关联，缺规则时不猜。若做出功能，要能由用户真实问题带回明确适用版本、例外和选择空间；不按 GPA 自动替人决定目标。 |
| 考前准备与跨模块生活帮助 | 沿同一课程/考试来源把复习准备、已有事项、转场与休息放进完整时间窗；未知考试时刻时仍可提供条件帮助，不编排精确考时。试算与日历提交分开，原 planRef/版本/来源贯通，取消或撤源后不复活旧准备。 |
| 原生学业页的连续交谈 | 主代理亲看真实数据下的单科/多学期/不同政策/不完整/未知/错误恢复；选中的原行和尺度回同 composer，重开敏感页从原 owner 读取，权限改变后旧值退出。必须实际操作，截图不能证明选行/恢复。主修单对象如何适合显示应另做产品判断，不套假表格分页。 |
| 资源真正开放而保持可信 | 逐个审视已有资源、schema、组合/聚合/原对象/历史能力是否被主模型自然发现、是否落在真实 owner。复杂组合若缺逐源 proof，补清来源责任再放开，不拿根 bundle 假签整个组合。避免退化成有限模板，也避免为了“全覆盖”一轮向模型读全个人资料。 |
| 安静与人格自然相处 | 工具慢、学校失败、查询被限、用户改口时，角色仍理解实际问题并继续可做部分；复杂证明不因疲惫或短问被截成短句。观察同一多轮任务中的自然差异，不硬编码祥子/睦必须说的台词，也不把调用统计当人格验收。 |
| 独立运行与资料恢复 | 核包内与安装连接器的实际依赖、普通重开后的配置/账号绑定、已保存快照与过期登录的区别。失败可沿原来源恢复；不复制 Codex 私有数据假装项目自带，无授权不导入其它工具资料。 |

验证继续使用正常产品入口、现有命令/API、已有检查与聚焦的 UI 检查。用户禁止新编测试工程；这不允许少验。每个实际缺陷都应修、回到原触发复查，再把源码/外部来源/模型/界面/持久化证据分别写清。没有个人数据或可用设备证据的部分准确保留缺口，不凭“以后再说”宣告阶段通过。

## 9. 本次审查的准确阅读范围

本次完整读取了教务/GPA/独立边界/第一阶段与第二阶段证据文档、`06_tools_maps.md`、即时人格纠正与历史要求摘要；完整读取 `campus-query.ts`、`campus-saved-source.ts`、`planning-campus.ts`、`campus-academic.ts`、`campus-academic-source.ts`、`campus-model-view.ts`、`campus-calendar.ts`、共享 campus 契约、`campus-page-order.ts`、`CampusAcademicView.tsx`。核读了 `academic_models.py` 的逐科/GPA/transcript 与考试解析、`student_query.py` 的时间筛选/覆盖/聚合、`ZjuAdapter` 的资源/刷新/路径发现/原对象/版本/输出链、Coordinator 的用途/来源/显示/再核接缝、ContextCompiler 的地址与主修导航、Repository 的导航原授权证明、Broker 的发现/执行/缓存等相关连续段。

路线图、主基线文档与阅读索引按本专项主题核读；原包《生活融合》实际连续读段为7.1至8.4前段（路线图坐标267–356）；没有声称重读了整个原包、所有第一阶段文件、所有项目文件或全部测试源码。新主代理须完成总交接要求的完整精读，不应把本专项审查当作全项目全读完成证明。

无清理；未删除个人资料、失败诊断或已有运行证据。
