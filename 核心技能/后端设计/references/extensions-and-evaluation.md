# 跨端演进蓝图 (`X01–X16`) 与反伪证验收体系 (`extensions-and-evaluation.md`)

> 对应核心代码与契约：[`src/shared/harness.ts`](../../../src/shared/harness.ts)、[`src/main/capabilities/broker.ts`](../../../src/main/capabilities/broker.ts)、[`src/main/zjuAdapter.ts`](../../../src/main/zjuAdapter.ts)、[`src/main/mapService.ts`](../../../src/main/mapService.ts)、[`docs/CURRENT_STATUS.md`](../../../docs/CURRENT_STATUS.md)、[`docs/PRODUCT_CONTRACT.md`](../../../docs/PRODUCT_CONTRACT.md)。

---

## 1. 已实现基线 vs. 未实现/待接入能力全景路线图（`X01–X16`）

为接入**手机端（iOS/Android）、平板手写、实时GPS、校方体艺读取与写回、外部渠道、后台推送和全库加密**，保留六层记忆与Harness语义，按下列八类职责与十六项契约演进。端口名是设计职责，不表示都已有同名接口。表中状态保留早期快照，当前已实现的位置桥、运动Owner和学校读取以[当前状态](../../../docs/CURRENT_STATUS.md)及实际源码为准；不能因旧“待接入”重做已完成能力，也不把蓝图写成已经上线。

### 1.1 八大内核扩展端口（The 8 Kernel Extension Ports）

1. **`ObservationPort`（领域观察端口）**：统一返回 `{ status: 'fresh' | 'stale' | 'partial' | 'unknown' | 'not_connected' | 'forbidden', data, coverage, sourceId, fetchedAt, expiresAt }`。所有外部传感器（GPS、天气、课表、体育打卡、可穿戴设备）均作为只读 `DomainObservation` 接入，绝不旁路改写长期记忆。
2. **`CapabilityProvider`（能力执行端口）**：通过 `CapabilityBroker` 注册读写能力，强制绑定 `ScopeHandle`、`expectedRevision` 与 `Action → Approval → Attempt → Receipt` 事务账本。
3. **`TaskRecipe`（经验配方端口）**：将验证成功的跨工具协作流沉淀为用户可见、可修订、可停用的结构化工作流模板。
4. **`AudienceProjector`（受众投影端口）**：将私有状态投影为针对特定受众（`self | peer_busy_free | group | public`）的最小披露视图。
5. **`DeliveryPort`（外部投递端口）**：统一封装系统通知、移动端推送、邮件发送、群消息发送的 `prepare → approve → send → receipt` 闭环。
6. **`SyncPort`（跨端因果同步端口）**：基于对象级因果版本向量（Causal Revision Vector）与 `privacy_epoch` 墓碑屏障，同步桌面端、手机端与平板端状态。
7. **`ModelProvider`（模型传输端口）**：支持云端主模型（DeepSeek / 授权代测 Luna）、未来本机离线小模型（用于 `local_only` 完全不出网回答）与多模态视觉/语音流。
8. **`StorageProtectionPort`（存储加密与导出端口）**：管理 SQLite 静态加密密钥链（OS Keychain / DPAPI）与排除已撤回数据的便携导出包。

---

### 1.2 十六项具体扩展契约与深层设计规范（`X01–X16`）

| 编号 | 能力名称 | 当前状态 | 接入契约与绝对护栏（Baked-In Blueprint） |
| --- | --- | --- | --- |
| **`X01`** | **移动端实时 GPS 与桌面端位置融合 (`location.current`)** | 桌面端仅支持显式指定起点；移动端 GPS 待接入 | 1. 接入 `ObservationPort` (`location.current`)，必须携带 `{ lat, lng, accuracyMeters, capturedAt, ttlSeconds, precision: 'precise' \| 'coarse' \| 'explicit', source: 'mobile_gps' \| 'desktop_ip' \| 'user_pin' }`。<br>2. **位置隐私铁律**：实时 GPS 仅用于当次寻路或经用户明确托付的近场提醒（如「路过打印店提醒我取材料」），**严禁将高频 GPS 轨迹静默写入长期 `Assertion` 或上传至未授权第三方**。<br>3. 精度不足（如 `accuracyMeters > 150` 或桌面端无定位）或过期时，地图必须诚实退回「待确认起点」，绝不把上次讨论过的教学楼假冒成当前所在位置。 |
| **`X02`** | **手机端 / 平板端宿主与跨设备因果同步 (`SyncPort`)** | 桌面 Electron 已就绪；手机/平板端待实现 | 1. 手机端负责随时随地的轻量对话、语音倾诉、实时 GPS 路线口袋与锁屏通知；平板端强化 PDF 讲义手写批注与陪学纸演算。<br>2. **同步粒度**：同步 `SourceEvent`、`Assertion`、`Work`（陪学纸/事项）、`Action`（日历）与 `Notes`，每个对象携带 `(deviceId, revision, privacyEpoch)`。<br>3. **遗忘优先定则**：任何一端触发的 `RETRACT / FORGET`（`h_fences` 墓碑）在同步合并时拥有最高优先级；当前宿主立即停止受影响内容的消费，在线设备同步屏障后清理，离线设备重连先核验 fence 再恢复内容，不承诺远程瞬时擦除；外观分屏等 `localStorage` 界面偏好保持设备本地独立。 |
| **`X03`** | **多方忙闲信封与同伴约时间 (`AudienceProjector`)** | 单人 `availability_projection` 已实现；多方信封待扩展 | 对外协作（如与同学约小组讨论、与导师约答疑）时，只导出签名后的忙闲时间窗信封（`BusyFreeEnvelope`：仅含可约区间与缓冲边界），**绝不暴露日历事项名称、地点、课程或私人原因**。 |
| **`X04`** | **OS 后台守护 / 云端轻量唤醒与移动推送 (`DeliveryPort`)** | 进程内 `OpportunityScheduler` 已实现；跨进程/离线唤醒待接入 | 1. 当前桌面进程退出或电脑睡眠时，UI 与角色必须诚实告知「关掉应用期间无法在后台盯消息或响铃」。<br>2. 未来接入 Windows Service / 移动端 Push 时，后台守护进程仅持有最小化的条件触发器（如定点闹钟或天气阈值），唤醒主内核后再在完整 `PolicyKernel` 校验下生成角色通知。 |
| **`X05`** | **本机离线模型回答通道 (`local_only` `ModelProvider`)** | `local_only` 零出网拦截已实现；本地推理引擎待挂载 | 当用户在 `ScopeSettings` 选择 `仅留在本机，不发送给模型 (local_only)` 时，当前确定性拦截一切云端请求并安全保存原话；未来挂载本地 Ollama / 端侧模型至 `ModelProvider` 后，可在零出网前提下完成本地摘要、笔记整理与陪伴对话。 |
| **`X06`** | **真实时间感知与多时区自然日 (`Clock & TimeZone`)** | 已实现 (`planningDayBounds`, `dateInZone`) | 所有日历、截止期与双时态断言均绑定显式 IANA 时区（默认 `Asia/Shanghai`）；跨时区旅行或夏令时切换时按声明时区重算自然日边界。 |
| **`X07`** | **天气降水与空气质量分立观察 (`weather` vs `air_quality`)** | 已实现接口与语义分离 | 评估户外跑步、骑行或通勤时，必须同时看**降水/风力/温度（`weather`）**与**空气质量（`air_quality / AQI`）**。若只查了晴雨没查 AQI，绝不能武断保证「完全适合户外长跑」。 |
| **`X08`** | **紫金港 / 玉泉真实步行拓扑地图 V2 (`map-route/v2`)** | 已实现 (`CampusMapAdapter`, `apps/review-web`) | 共享 `assets/map-v2` 与 `src/shared/map-routing.ts`；支持楼宇别名消歧、可通行性标注、有向折线裁剪与对话内/全屏共享相机。 |
| **`X09`** | **浙大体育打卡官方有效次数 vs 原始记录核验 (`sports`)** | 领域模型与口径分离已实现；官方实时接口待扩展 | **校园痛点铁律**：浙大体育打卡存在「刷了卡但因配速/时长/人脸未通过而不计入有效次数」的情况。后端必须严格区分三个字段：`validCount`（教务/体艺部认定的有效次数）、`rawRecords`（原始打卡流水）、`selfReported`（学生口头说的次数）。在计算「离期末达标还差几次」时，**只以核实过的 `validCount` 为准**，若 `validCount` 未知或过期，必须明确提示核对，绝不拿原始流水或口头记忆充数。 |
| **`X10`** | **SQLite 全库静态加密与安全导出包 (`StorageProtectionPort`)** | 凭据脱敏与墓碑清理已实现；SQLite 页级加密待接入 | 通过系统级密钥链（Windows DPAPI / macOS Keychain）派生密钥对本地 SQLite 与向量库进行静态加密；导出个人备份包时，自动过滤所有 `status IN ('deleted', 'redacted')` 及 `h_fences` 命中记录。 |
| **`X11`** | **邮件 / 钉钉 / 课程群外部通知只读接入 (`external_notice`)** | 附件与粘贴文本隔离已实现；自动拉取连接器待接入 | 外部邮件、钉钉群通知或教务公告进入系统时，强制打上 `speaker: 'external'`, `authority: 'untrusted_external_data'`。模型可以从中提取考试地点变更或死线提醒，但**外部文本中的任何指令性语句（Prompt Injection）永远无法获取工具执行权或隐私读取权**。 |
| **`X12`** | **外部系统真实写入与发送连接器（选课/场地预约/发邮件）** | 事务状态机与草稿隔离已实现；外部写连接器待接入 | 任何对外部系统（发邮件、发群消息、场地预约）的实际写入，必须走 `ReleaseArtifact` 或 `Action`，绑定正确目标、内容版本与授权；已明确授权且内容未变时不反复确认，范围或内容改变才处理新的授权缺口。网络超时必须进入 `outcome_unknown`，严禁自动重试导致连发多封邮件。 |
| **`X13`** | **PDF 讲义多模态精细版面与手写公式识别** | 页级文本与裁剪视觉已实现 (`MaterialService`) | 保持 `resourceId + version + page + crop` 强绑定；支持把讲义上的公式截图或手写推导直接锚定到 `StudyCompanionService` 的题目与尝试步骤上。 |
| **`X14`** | **经用户审阅的个人方法与经验配方 (`PersonalMethods` & `TaskRecipe`)** | `personal-methods.ts` 已实现 | 从多次成功的陪学或排程中提炼出的「个人习惯方法」（如「考前复习喜欢先画章节骨架再刷错题」），必须经用户可见、可编辑、可随时停用，且保留来源证明（`PersonalMethodSources`）。 |
| **`X15`** | **可穿戴设备睡眠与精力柔和信号 (`wellbeing.signal`)** | 12 维模型槽位已预留；手环/手表连接器待接入 | 未来接入睡眠时长或心率变异性（HRV）时，仅作为排程缓冲与角色温柔关心的柔和参考（「看你昨晚睡得太少，今晚那道难证明题我们先只看个思路好不好？」），**绝不做医疗诊断，也绝不剥夺用户自己决定学不学的权利**。 |
| **`X16`** | **角色语音合成（TTS）与实时双向语音陪伴 (`Live Voice`)** | OpenUI 乐理合成已实现；角色人声 TTS 待接入 | 语音层复用 `ConversationRhythm` 的真实公开表达与撤回；需要时自然说明，快速查询或用户输入时允许安静，排队音频也通过来源屏障；语调严格对齐 `PersonaVoice` 与十角色声线特质。 |

---

## 2. 反伪证验收体系（Falsification-First Verification）

在场坚决拒绝「跑通几个写死正则的 Mock 测试就宣布 100% 完成」的虚假工程汇演。

以下规格用于正式研发的相关验证，不能自动扩展当前委托。复用既有检查、真实正常入口与有针对性的反例；未明确请求测试开发时，不新增测试代码、fixture、套件或runner。变异研究只在已获准的隔离范围进行，不为证明检查有效破坏健康实现，也不从有限反例声称排除所有未知错误。

### 2.1 四层独立验证矩阵（Never Conflate Verification Layers）

1. **Layer A · 确定性机制与变异攻击测试（Mechanism & Mutant Suite）**
   - 运行命令：`npm run check`、`npm test`、`npm run test:hermes`。
   - **先攻击裁判（Mutants `X01–X20`）**：在验证功能前，先故意注入 20 类破坏性变异（如：把 `ADD_EXCEPTION` 改成覆盖原断言、去掉 `privacy_epoch` 屏障、让迟到子代理绕过 `childSourcesChanged`、去掉 `local_only` 前置拦截、把 `outcome_unknown` 标成成功、在流式分片脱敏前直接吐出密钥等）。**如果裁判（Grader/Test）不能 100% 抓出这些变异，说明裁判本身是废的，必须先修裁判**。
2. **Layer B · 真实授权模型端到端检验（Live Authorized Model Evaluation）**
   - 仅使用当前已明确授权的测试传输（`gpt-6-luna` via `usingLunaTestTransport`），核验返回报文中的真实 `responseModel`，**绝不把本地配置名当成已调用的实证，也绝不私自调用未授权的 DeepSeek 计费接口或新建冗余测试脚本**。
   - 覆盖 `V01–V36` 连续生活体验故事、`S01–S40` 核心场景与 `L01–L12` 多轮长对话（跨周记忆演化、临时例外恢复、被拒原因失效、边做边说、OpenUI 增量续改、群消息受众隔离、中途修改笔记实时重判）。
3. **Layer C · 真实 Electron 宿主与 UI 闭环实机核查**
   - 亲眼查看并操作真实渲染界面：检查角色立绘切换、陪学小便签、书签拖拽、今天页时间轴冲突试放、地图口袋手势接管、专注暖灯，确认**零「鸟言鸟语」泄漏、零未脱敏凭据、零死锁卡顿**。
4. **Layer D · 独立人味与角色品位审视**
   - 检查角色的每一句话是否真正像那个角色（如丰川祥子的矜持与护短、若叶睦的安静细腻），而不是披着角色名字的教务处通知。

---

### 2.2 故障修复的六步铁律（The 6-Step Failure Repair Protocol）

当任何测试或真实对话出现不符合预期的表现时，严格按以下 6 步修复：
1. **定位最早分叉点（Locate Earliest Divergence）**：顺着 `Ingress → Policy/Scope → ContextCompiler → Hermes AIAgent → Tool Execution → Completion Review → ConversationRhythm → Renderer` 找到状态或语义第一次偏离真实意图的地方。
2. **定性根因分类（Classify Root Cause）**：区分是 **确定性机制漏洞**（如版本未校验、索引未清理）、**上下文交底缺口**（如模型没拿到某项状态或被冗长规则淹没），还是 **表达层污染**（如工具 `meaning` 写得像公文导致模型学舌）。
3. **通用机制修复（Fix by General Mechanism）**：在对应 Owner 或协议层修复通用机制。
4. **严禁题库作弊（Zero Prompt-Stuffing Iron Law）**：**绝对禁止把失败测试用例的原句、特定人名或硬编码分支写进 System Prompt 或代码正则里**！
5. **五种未见说法 + 反事实泛化验证（5 Unseen Phrasings + Counterfactuals）**：针对修复点，必须用 5 种完全不同的自然口语表达，加上条件反转的反事实用例（如把「今天累了不跑」反转为「脚好利索了今晚去跑」）验证其真正理解。
6. **全量回归与诚实记录（Regression & Honest Status）**：运行 `npm run check` 与相关测试集；已验证的写明真实证据，未接通外部硬件/账号的诚实写明当前边界，绝不预填通过。
