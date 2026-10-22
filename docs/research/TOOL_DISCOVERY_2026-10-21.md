# 工具发现与公开图片读取（2026-10-21）

本轮范围是工具面、按需调用和公开资料读取。沿现有 `ToolRegistry → Coordinator → CapabilityBroker` 与锁定 Hermes 主循环实施，没有替换引擎、生产模型或来源权限。

## 原始要求与取舍

完整回读交接包的 `harness讨论(1).md`（502行）、`在场-Harness-完整设计与最终实施提示词.md`（1649行）、`在场-Harness-理解与行动-完整设计与提示词.md`（1533行）、`在场-Harness-广度研究与分支交接-完整稿.md`（1155行）及06/07汇编。工具相关要求集中在完整设计H段、理解与行动8/12节、广度研究8节与E组：主模型可以主动发现、重新查找和组合能力；目录不是意图分类器，方法不是权限。

实际读取的外部源码及采用范围：

- [Hermes `tool_search.py`](https://github.com/NousResearch/hermes-agent/blob/main/tools/tool_search.py) 与 [`tool_search_catalog.py`](https://github.com/NousResearch/hermes-agent/blob/main/tools/tool_search_catalog.py)：采用每次从当前工具契约构建目录、简短能力线索、按需完整说明、回原派发路径的做法。在线main与本项目锁定版本不同，仅借鉴机制；没有开启上游连接器、终端、独立记忆或升级引擎。
- [Pi `skills.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/skills.ts)：读取技能发现与 `formatSkillsForPrompt`。保留方法概览与按需正文的分工，没有复制其文件扫描、脚本执行或外部技能加载权限。
- [IANA IPv4专用地址表](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml)：实际NASA请求揭示原代码误挡 `192.0.66.108`；专用段是 `192.0.0.0/24`，不应扩大到整个 `/16`。修正同时保留私网、链路本地、基准与文档专用段的拒绝。

没有新增三套发现工具或新搜索模型。当前只有23个专门工具，扩展原 `use_tool` 即可提供搜索、分类与分页；保留常用工具直接可见，继续按真实活动状态提升专门工具。搜索只筛说明，不从用户正文决定能力集合。按需精确读取交付宿主完整schema，保留长度、数量、格式与严格字段约束。

## 实际接入

- `src/main/runtime/tool-surface.ts`：`use_tool` 增加 `query/family/offset/limit`；空查询可枚举当前合法专门工具，未命中可再发现。
- `src/main/tools.ts`：目录、完整说明、实际调用分开；取消和当前scope仍有效，实际调用走原执行与回执路径。直接提供的工具仍直接调用；目录失败给回读入口。
- `src/main/capabilities/research.ts`：静态页面图片候选支持同版分页、lazy属性与srcset；排除脚本/注释中的标签，保留真实网址中的逗号。`pageResourceId/pageSha256` 绑定网页版本，取图须核实际候选，句柄区分来源与caption。候选不是已下载、已感知或转载许可。
- `src/main/capabilities/public-network.ts`：修正公网地址范围；非成功HTTP响应保留真实状态，不因错误页类型不同而掩盖403/404等结果。

## 实际观察与证据边界

类型检查通过。既有 `turn-surface` 四项检查通过；没有新增或修改测试。实际 `ToolRegistry.execute('use_tool', …)` 返回了“陪学”的三个匹配工具，`family=study, offset=2, limit=2` 返回后两项，`read_learning` 的完整参数含tuple数量与严格字段约束。现有提示检查命令报告34个模型工具、53633字符；这只是工具面大小，不是模型效果。

通过真实 `ToolRegistry → look_up → research.read` 读取 NASA Image of the Day，首12条与 `view=images, offset=12` 续页保持同一网页SHA。修复srcset后，本次静态页面提取198条真实声明候选（网站内容与候选数可能变化）。同一路径调用 `research.image`，下载并经原生worker解码1850×1823 JPEG，原字节510818、展示字节709669，返回 `fresh`、已核网页归属与 `sceneRef revision=1`。此前旧worker不识别图片操作的失败保留为历史过程，重建材料runtime后已重走成功。

随后以同一图片及网页版本、两句不同caption再次调用，均返回 `fresh`，产生不同图片句柄与各自的sceneRef；相同像素不会覆盖另一份来源/说明。此为直接API观察，不是模型选择或界面验收。

Wikimedia文件页真实返回403，现有公开读取准确保留该HTTP状态。没有换账号、绕过访问拒绝或伪造图片。

以上是初轮目录与公开图片入口的直接API观察，当时尚未运行真实模型、校园或界面。随后正常Luna、真实像素、公开图片续问和校园分页继续沿原流程推进，分层结果见[本轮当前状态](../CURRENT_STATUS.md#deep-refactor-20261021)；早期工具面大小与候选数保留当时范围。

## 同版网页链接导航与物理参数范围补修

后续再次对照原始 `harness讨论(1).md` 全文、完整设计 H2/H3 与理解行动稿 8/12 节，发现一个实际阅读接缝：原 `research.read` 会留下静态正文和图片，却把所有超链接目标丢掉。从官方索引继续查原文因而需要猜网址或重新搜索。现在沿同一个 reader 增加 `view=links`，在原网页缓存里保存实际声明的链接与标签；首段只附目录地址，目录按条数分页，返回原网页 SHA、实际目标和后续 `read`。

实现复用原公共 URL 校验，不加依赖、第二缓存或浏览器执行。相对链接按原页面的首个 `base[href]` 或重定向后的最终 URL 解析；同文档 fragment 保留为位置线索，不假称已经跳到锚点正文。非 HTTPS、显式私人地址、带凭据的网址与不适用的协议不生成公开读取入口；真正读取仍经过原 DNS、重定向、类型与当前范围检查。目录只是这一版静态 HTML 的提取结果，既不保证目标可达，也不把标签当作目标正文。

一手参考为 [HTML 链接语义](https://html.spec.whatwg.org/multipage/links.html#links-created-by-a-and-area-elements)及 [Playwright MCP 的当前快照与按需续读说明](https://github.com/microsoft/playwright.dev/blob/main/mcp/snapshots.mdx)。这里借鉴保留真实导航地址、按当前版本继续的原则，没有把浏览器、任意点击或外部脚本带进产品。真实读取还暴露了带 `>` 的引号属性混入正文；同一静态提取器现按完整引号处理标签，保留真实文中文字与转义后的代码例子。

工具过程名称现在按 `manage_note.operation` 和已登记 capability 的 `displayName` 取得，不再把读笔记统一叫整理笔记，或把取图、读网页都写成找资料。只有 `research.read` 实际交付的分页结果可以完成本次读页步骤；原 `partial`、coverage、续页与业务状态原样返回。校园、地图、天气、调查和动作的部分／未知结果没有被改成完成。

另将 `ToolRegistry` 直接入口与 `use_tool` 的旧 40000 字符门对齐既有 `toolArgumentCharacterLimit`，保留各 owner 的参数、来源、版本与计算校验。`manage_note` 仍是原直接工具，不因 gateway 改动扩大入口。

实际直接 API 观察留在本机忽略目录 `.test-data/tool-navigation-F79WNB/`：

- WHATWG Links 原页提取 604 条链接，目录 0→24 沿同一 SHA，随后按真实 Edits 链接取得另一份原文；网页数量仅为这次来源快照。
- 同范围后页、新 run 的旧句柄拒绝、沿原 URL 重新取得同 SHA 新句柄，以及来源屏障清缓存后拒绝旧句柄，分别保留原输出。显式私网地址被原读取门拒绝。
- Python 文档第一次读取失败；再次原入口实际取得 HTTP 200，最终 URL 为 `/3/`，相对链接以这个地址解析。只确认这次重走成功，没有确认第一次失败的根因。
- 41171 字符原参数、41130 字节源码经原 `present_view`／消息 owner／编译器返回 `presented`，2 条声明、9 个 AST／展开节点。65130 字节源码仍被原 64000 字节 schema 拒绝；确切证据是新有效 scope 下的 `oversize-owner-recheck.json`，其中实际 `interactive_program_input`／`maximum=64000` 与当时未到期范围一并保存。较早 `long-program-results.json` 的后来复读实际是 `scope_expired`，保留为旧观察，不把它当成 schema 拒绝。41024 字符 gateway 请求取得真实 `read_learning` 完整签名；另一份 41039 字符调用到达原 owner 的 `matterId` 校验，没有被物理门截住。

本次没有新增测试、fixture 或 runner。重编既有 `turn-surface` 为 4/4，既有校园 partial/auth 步骤检查为 1/1，最终类型检查通过。上述均为原生产 API、编译与既有检查的限定结果，没有调用模型、读取私人校园正文或核验桌面画面；新的自然工具选择与整合 UI 仍由相应正常对话和界面结果另证。

## 正常主助手的公开调查与同版定位

继续阅读原广度稿 8/9 节、E/F 整组及交叉反例后，补齐大目录和长正文之间的定位：`research.read` v6 的 `view=links,query` 在同版标签／目标地址里字面筛选，保留原条目 `sourceIndex`、筛选数量与全目录数量；下一页携同一 query。`view=find,query` 在实际提取文字中精确定位，按 Unicode 返回有限上下文、原版本和回读地址；未命中与没有相关含义分别保留，PDF 仍按原页文字层查找并通过同一公开 reader 回读。没有增加按话题分支、另一个搜索模型或事实缓存。

同域还发现 Broker 仍在单次合法读取之外，因 scope 累计字节超过 180000 而拒绝后页。现在累计 calls／bytes 继续计量，单次提供方的真实物理大小、schema、来源、版本与取消保持原检查，较早已读字节不再成为后页拒送理由。

两个独立正常主助手回合均从原 `Harness.start` 进入，在独立合成目录先调用 `configureNetwork`，只给自然问题与公开网址，没有提供工具名、标准调用或答案：

- `.test-data/tool-navigation-luna-MV5Pob/`：13 条响应实际为 `gpt-6-luna`。公开搜索候选为空后，她自行读取真实规范并续页，给出了有来源的解释；该样本依靠已知网址，**没有使用新链接目录**，不作为目录自主使用的成功证据。
- `.test-data/tool-navigation-v6-luna-05fSfB/`：17 条响应实际为 `gpt-6-luna`。问题要求找出目录条目实际指向的链接。她先读取有 1272 条实际链接的规范目录，自行以 `The base element` 筛得唯一地址，沿它定位原文；字面查询两次未命中后，自己换词与回读正文，随后又沿同一目录找到两处关联定义，最终交回原链接、条件和解释。`final.json`、`observations.json` 与 `wire-observations.json` 保留原问题、实际参数／结果、回复与返回型号。这是另一条自然问题的限定成功，不以两条不同问题作同句性能对照或概括所有研究行为。

同一 v6 目录另留原 API 观察：`bounded-pages-over-180k.json` 为同 scope／同 SHA 的 12 个连续合法页，累计 213442 字节，均交付实际页和续读范围；`public-pdf-find.json` 保留原公开 PDF 的查找及公开回读，原 SHA 一致，视觉内容仍标未核；`unicode-find.json` 中实际规范字符 `𝔞` 的原地址为 1007–1008，UTF-16 前缀长度为 1008，回读同 SHA，未将代理对当成两个位置。上述不是模型看过 PDF、全部文字已读或桌面交互的证据。

既有 `unit` 原入口在正确隔离配置下 20/20，最终类型检查通过。首次单独调用既有检查时缺少其要求的隔离环境，17 项在建立 fixture 前即拒绝；补齐原项目环境后重走，没有改检查、加 fixture 或增添 runner。本轮没有调用 DeepSeek、写校园账号或发布应用。

## 校园已存课程的重开、续页与当前两项比较

这项接回原先未收口的流程，不重做成绩、课表与全账号刷新。先只读核原 profile：早先首轮已能补上实际学期筛选，下一页也曾固定原 bundle；后来的比较却读取了较早的 offset=0。新观察使用原 SQLite 的原生备份及原来源 fence 作为独立本机工作副本，保留原库，连接仍归原安装连接器和当前已授权账号。

正常重开后的原句“下一页，接着刚才的顺序就好。”又暴露了更早的一处断点。真实控制返回第一份已准确保留 self／real／self 和逐字的局部对象限制；程序仅因有 `scopedSourceLimits`，就强制另做一次广泛身份复判。第二份实际返回把主体改成 other，并把系统说明误放进本人依据，原逐字门正确拒绝，之后只在当前窗口保守处理。这是控制理解失败，不是本人选择临时模式，也不是学校资料不存在。原失败和两次真实返回均保留，没有用成功覆盖。

调整只去掉“单有局部对象限制就再判身份”的触发。每条原话的首次真实语义理解、局部引文逐字检查、宿主保存的限制、实际拟读用途核验仍在；改变主体／受众、整轮 allowlist／exclusions 或存在来源歧义时，原独立复核继续。没有针对“下一页”做关键词放行，也没有从页面端补历史或账号权限。

本机 `.test-data/tool-campus-continuity-pjyj493_/` 留下完整限定结果：

- 原自然首问只查本学期课程，不看成绩或其它个人资料。先取得课程学期标记，再以实际学期条件读取 name／credit 两项；实际逐次顺序是学期目录 `readOrdinal=1`、筛后本页 `readOrdinal=2`，各有原地址，后者的 next 为 offset=2。前台回执实际 13 条 `gpt-6-luna`。
- 结束前一个进程、重开同一 SQLite 后，仍用原“下一页”句。修后按同 bundle／版本、原学期条件、原 name／credit 字段和 limit=2 读取 offset=2，refresh=false；没有把较早学期目录当作当前页。前台回执实际 6 条 `gpt-6-luna`。
- 接着原“这页第一门比第二门学分多吗？先就这两门比较，别翻到下一页。”正常结束。已亲读原第二页两条记录及最终答复，名称、大小关系和差额对应第二页，没有改比首两项、翻到下一页或新增校园查询。采用的旧回复仍带同账号可核的原 `campusReadingSources`；前台回执实际 3 条 `gpt-6-luna`。本机日历与动作表均为零。
- 明确限源的另一条自然语句，沿真实 Luna、原控制函数、Policy 与 Broker 只得到 current／evidence:read；校园调用保持 forbidden，没有进入提供方读取。`explicit-source-control.json` 与原响应分开保存，不把局部范围修复扩成全源许可。

`first-page-observations.json`、`fixed-next-observations.json`、`comparison-observations.json` 和 `completed-continuity-metadata.json` 分别保留实际读取、恢复的逐次顺序、采用及最终持久状态。原临时失败回合另在 `reopened-messages.jsonl`／`control-raw-retry.jsonl`，不冒充已经进入校园查询。私人课程、字段值和回复原文只留本机，本文不复制。后续后台模型计量与上述前台回执分开，不混入三步计数。

修后既有 `turn-surface` 4/4，最终类型检查通过；没有改或新增测试、runner、fixture，没有学校写入或整包刷新。以上是实际模型＋真实已存账号快照及正常进程重开的限定结果，没有据此声称学校当前实时确认、全部校园边界或桌面画面验收。

## 原用户图片的后续回读

原始协作记忆稿与生活融合稿要求压缩或重开后仍可沿原材料取得正文与像素。实际旧上传保存在原用户 `Message.image`，但 `conversationHistory` 只给文字，`read_evidence` 也只有文字入口；主循环不会把以前的上传像素自动带入新回合。既有助手消息因展开用户结构也留有图片副本，但它没有成为独立来源，删除流程的结构白名单会清掉这类语义字段。

正常复核先在原上传 profile 的本机备份中进行：原设置关闭了历史，因此第一次续问只作为限源观察。开启历史后，同一句自然图例问题仍未取得像素，前台回执 26 条实际 `gpt-6-luna`，最终请对方重附图片。旧上传收据只有 hash、没有明确原 event 绑定，不能凭相邻或唯一消息补签。

现在新上传由宿主在原 `EvidenceEvent.imageSource` 记录同一来源版本、SHA、格式和尺寸，像素仍归原用户消息。原历史和文字读取只给轻量图片地址；`read_evidence(view=image,expectedVersion)` 独立核当前用途，按 event 所证明的原 session、用户 Message ID、版本与实际像素 SHA 读取。它不要求当前聊天与原聊天相同，也不扩大当前来源许可。后台授权原话片段不返回整图或图片目录；文字已经读过不能复用为整图许可，旧缺证明不补填。

实际像素仍经原 `toolImages` 传入同一主模型，在传入前、返回后及文字流交付前重核。`imageRequests` 只记本轮真正送出的请求；明确绑定且实际 accepted 后，原 `providedObjectVersions` 的 evidence 项才冻结 `imageSha256`。历史或子报告采用继承这个来源依赖，普通同版文字回读保留它，不复制旧图像请求、图像正文或另建账本。历史准入和模型边界在本机重新核原用户消息的实际像素，而非只比 event 元数据；异版本或 SHA 不静默覆盖。

本机 `.test-data/tool-image-continuity-2jr6fo44/` 保留正常原入口结果：

- 重附原有 JPEG，先问原回复没有涵盖的另一处状态；前台回执 3 条实际 `gpt-6-luna`，真实 upload 收据绑定新 event@1 和原 SHA。
- 正常关闭并新进程重开同一库，不再附图，只给此前原自然图例问题。她自行沿 `read_evidence(view=image)` 回到同版原图，三项颜色与标签和亲看原图相符；前台回执 7 条实际 `gpt-6-luna`。`reread-final.json`、`reread-observations.json` 记录实际调用、accepted tool 像素与原来源依赖，目录不冒充已看见。
- 另一句明确只解释原消息里的一句文字、不读像素或其它旧消息，正常回复只解释词义，前台回执 4 条实际 `gpt-6-luna`，没有图像请求。随后同一实际控制范围下直接调用原读取／用途 API，另 1 条实际 `gpt-6-luna` 拒绝整图，未准备像素；此调用与前台计数分开。

在独立的原库备份 `.test-data/tool-image-source-integrity-n4bo5aun/`，沿原 `Store.putMessage` 更换同一原用户消息的图片字节，保留原 event 版本与元数据，实际原 reader 返回 `image_changed`；依赖这张图的历史变为不可采用，独立旧内容仍可读。恢复原字节后，同一原入口及依赖历史恢复。原合并函数直接回读实际收据，同版本文字项保留 SHA，冲突版本被拒。这些为本机原 API 结果，不是另一个模型评分或全应用删除验收。

最终类型检查和 diff 检查通过；既有后台授权片段／合法其它原文两项检查 2/2。首次运行该既有检查时隔离父目录不存在，检查在创建自身 fixture 前返回 ENOENT；建立正常隔离目录后重走，没有改检查代码。本轮未新增测试、fixture、runner 或视觉模型，未调用 DeepSeek；Luna 的实际传图成功不外推生产 DeepSeek 图像协议或效果。诊断与编译文件继续保留在忽略目录，没有再次尝试此前被自动审批拒绝的清理。

## 体育有效次数的当前外部来源边界

这次复核没有新增体育功能或模拟记录。当前安装连接器的真实 `resources` 返回 23 类资源，字段模型目录有 8 类；`schema practice` 的 18 个字段属于实践项目、本人记点与审核。`practice_summary` 由原 `sztz.profile/extend.myInfo` 取二三四课堂的正式记点、学分、等级和通过状态，以及美育／劳育通过状态；`projects.approved` 是实践项目审核，不能改说成跑步计次。连接器当前 40 个已列端点分属 9 个服务，没有体育计次服务；这只说明现有连接器覆盖，不声称穷尽学校系统。

沿原已配置账号工作副本的 `CapabilityBroker.invoke` 实际调用 `campus.lookup(domain=sports)`，返回 `unsupported`、`recordRead=false`，覆盖为 `complete=false/connector_catalog_only`，附本次真实资源与字段模型目录。四个请求量——已认定次数、要求次数、统计期、计次规则——均未取得。源码目前已没有把 sports 映射到 `practice_summary`，因此没有发现本次需要修复的误接。原 `campus.imported_lookup(domain=sports)` 在这个副本也返回 unsupported 且无 data，不把缺少导入资料写成零次。原结果在本机 `.test-data/tool-sports-boundary-3qa4zu0r/`，没有刷新学业总包、读取其它个人类别或写学校记录。

学校有记录入口与连接器已经能读，是两件事。[公共体育与艺术部 2025-05-13 的活动通知](https://www.tyys.zju.edu.cn/english/redir.php?catalog_id=191753&object_id=215433)明确描述体艺 App 的课外锻炼、锻炼记录和待审核状态；这支持记录／审核模块确有官方出处，不能据此声称已取得本人有效次数或该活动等于普通学期计次。[2023 年体测问答](https://tyys.zju.edu.cn/redir.php?catalog_id=172630&object_id=209366)区分体测与课外锻炼，并给特定课程的学期条件，不能不核适用对象就把旧规则写成这次本人的要求。两份正文来自官方域的搜索缓存；直接 open 的对应网址发生超时，没有据此判学校入口失效。

具体缺口仍是体育平台本人的已认定次数／审核明细、当前学期和适用要求、截止时间及其合法只读认证与分页合同。原教务已认证不授予另一个平台或端点的读取许可，本轮未携凭据试新服务。现有读取能力仍可接本人另行提供的学校页面、截图、导出文件或明确数字，按实际来源作有条件的核对与计算；本次没有取得这些新材料，也不把本人自述或本地勾选当成官方入账。没有修改生产源码、角色台词、默认模型或测试。

## 本次页交付与整体 partial 的步骤状态

根负责人亲查原正常校园回执后发现：首轮两项和重开后的下一页已真正交付，但步骤显示 blocked。原下一页外层为 partial、全局 coverage.complete=false；页内则是 status=ok、完整源覆盖、两条真实记录、同 bundle／版本、offset=2 和 next_offset=4。较早将所有 partial 改为 done 曾破坏缺来源负例；后来只认公开 reader 又遗漏了这类有证明的正常校园页。

本次改为原 `CapabilityResult` 的可选 `delivery={kind:page,complete:true}`，范围只限当前实际交付页，不表示全源覆盖、语义足够或业务完成。可信读取 owner 产生这个标记，ToolRegistry 统一消费，不再按 research 工具名猜测。校园只对 inner ok、完整源覆盖且无缺口、未截断、自洽的原 offset／行数／total／next，以及由原 owner 核过的快照页填标记；缺来源、认证失败、真 partial、未核页和未知结果不填。公开 reader 的实际成功片段、目录、查找和 PDF 页沿同一元数据表达本次交付。原 status、全局 coverage 和 continuation 都不改；旧结果没有标记时不补签，缓存仍保留原值和原来源门。

沿原 ToolRegistry 和已授权的真实已存课程快照直接重查，没有调用模型：第一页 offset=0、两条、next=2，下一页 offset=2、两条、next=4，步骤均为 done；返回仍为 partial，coverage.complete仍为 false，同 bundle／版本和原续页地址保留。本机 `.test-data/tool-campus-page-delivery-z75g84ve/` 的原／最终两组 `*-page-tool-result.json` 保存实际结果和步骤，私人课程正文未复制到本文。既有“校园读取的 partial/auth 状态进入 blocked”负例仍为 1/1，没有改测试或放宽来源门；最终类型检查与 diff 检查通过。没有新增测试、fixture、runner 或模型样本。

## 图片公开前缀、作品与原材料的来源接续

整合审查发现，正常流式正文已经公开时，图片的 accepted 证明原来仍等整个模型调用返回才写入。用户此时停止，新的部分历史入口可保留正文，却缺少实际图片版本依赖。现在主循环在首次非空正文通过当前来源复核后，记录本次实际图片采用；结束时仍复核来源，但不重复计量。仅准备、没有正文或没有模型返回的失败不升为 accepted。取消或来源失效清原协议接续缓存，继承的 imageSha256 只作为原依据，不伪造成本轮重新传图。原作品的 source-free 例外也排除已经证明的图片依赖，继续走实际像素核验；普通独立文字作品保留原例外。

本机 `.test-data/tool-image-adoption-q42gbt8g/` 保存真实过程。前两次手动停止均晚于完成，分别实际得到 1818／7442 字符与各 4 条 gpt-6-luna 回执，按完成记录，不写成取消。最后一次在生成中停止，留下 1925 字符；原 upload 请求已 accepted、event@version 与 SHA 仍在 receipt，部分历史回读保留 cancelled／partial／exposure unknown，旧协议缓存已清。该回合已完成的 verification／control／control 三条响应均实际为 gpt-6-luna；被停止的主生成没有返回最终 responseModel，不用配置名补签其型号。

随后直接调用原 owner，沿实际图片历史编译一份作品，并另建一份独立文字作品；这一步是控制 API 验证，不是 Luna 生成界面。同一原用户 Message 更换实际 JPEG 字节而保留 event@1，图片派生作品由可读变为不可读，部分历史被排除，原 refreshDependencies 返回 image_changed；独立作品仍可读。恢复原图后部分历史再次可读。较晚尝试回读两个控制作品时，原 scope 已过期，真实 scope_expired 另存，没有写成作品恢复通过。

同轮还发现原文件 event 与提交它的 parent 缺少完整删除闭包：另一会话只读文件正文后，派生材料未必包含 parent。最终按独立原文与提交生命周期分别处理：材料 owner 核现存 manifest、原 file／parent 的同 owner、workspace、session、locator、版本与状态；正文根只为 file event，parentEventId 留作生命周期地址。整条 parent 删除归下述 typed 闭包；不把独立文件当 parent 正文的精确副本，不登记泛 parent privacy 边，已登记的这条精确旧边也在同元数据核实后移除，其它依赖保留。`.test-data/tool-material-whole-final-gJWWkx/` 从现有有效原件复用 5,366,959 字节 PDF，经另一会话 read_evidence → present_view → 原消息 owner 实际保存派生作品，确认 parent 泛边为 0、message→file 依赖为 1；遗忘整条 parent 后，file 为 deleted，PDF 字节与清单删除，已存派生作品清除并标 source_changed。独立原 OpenUI-MIT.txt 的 1083 字节及 SHA 保留；冷重开后，原 read_evidence 为 evidence_forbidden，独立 TXT 仍完整可读。该过程是原本机控制 API，没有调用模型或恢复被忘 PDF。

继续核旧批次时，现成 `guardian-materials-sMTnoc` 库确有已 clean 的整条 parent 遗忘，而原 file event 仍 active、原 PDF 的字节和 manifest 已删除。现在原 cleanupFence 另按同 owner／workspace／session、精确 parent+`:file`、file_import／external／quotation 与真实 file locator／material ID 定位其删除闭包；已 clean 的批次只对这些精确 file IDs 复用原清理，不重放原广泛 fence。局部 spans 不成为整附件删除目标，元数据查漏不恢复 bytes、manifest 或读签。该现成库没有原 file 的助手引用，所以这里只证明遗留 active 文件元数据退出，不冒称复现旧跨会话派生泄漏。在其正常备份 `.test-data/tool-material-legacy-gZZjAb/`，打开后 file 变 deleted／正文长度 0，两份独立文件 50074／66 字节与原 SHA 相同；再次正常重开，原 PDF 仍不存在，独立 TXT 的 23 个 Unicode 字符完整可读。

后续又收窄已 clean 的宽来源查漏：按 parent.source 匹配时只补 parent 已 deleted 的旧 file；原 object／source 中明确列出的永久对象 ID 仍绑定同一对象，新 fence 首次清理仍沿当时整源范围。正常在该旧整条 parent fence 之后，经 stageFile／Runtime.begin 提交现有许可证原文，新 parent／file 冷重开仍 active，1083 字节及 SHA 不变，旧 PDF 仍 deleted，见 `later-legitimate-file-reopen.json`。此实际 fence 的 sourceIds 为空；宽来源条件来自精确源码审查，不声称已走过现成宽来源批次。

局部遗忘另外实际暴露了原 owner 的误伤：现成 parent 原文 20 个 Unicode 字符，仅遗忘 4..6 的“独立”二字，fence 的 objectIds／sourceIds 均空，file event 虽仍 active，旧 sweep 却因 parent redacted 删除原附件字节。失败原件保留在 `tool-material-partial-Y1jBUU/`，没有补回其字节。修复后从遗忘前仍有效的现成副本 `tool-material-partial-fixed-H87imp/` 重走：parent 为 redacted，原范围只返“██”，file active、manifest 和 1083 字节／SHA 均保留；原泛 parent 边从 1 移为 0。冷重开后 native reader 完整可读，read_evidence 正常交付原 100 字符，retainedTextIdentityCurrent 核的是 file 自己的完整范围。最终再沿 compile → look_up materials.read → Context.recordTool 读 100 字符，真实 receipt 的根含 file、不含 parent，被忘两字仍不返；parent 地址没有被当成父正文已读。原 file 自己的权限、范围、版本、manifest、取消及整条 parent／source fence 门继续生效，没有扩大局部授权或整图读取。

Curio 新增的原 NoteProof 现由程序来源集合从确切 Work 版本和原 Scene 元数据继承；原 proof 同时进入 receipt 与 Scene provenance，继续由笔记 owner 核 id／revision／SHA／Unicode 范围，不把 Scene 标题或正文当证明。主动域随后在正常原对话生成真实 Note 依赖的 Curio：B 为 6 条、A 为 14 条实际 gpt-6-luna，A 的首次 offer 错误拒绝后正常重试成功，不隐去过程；B 也采用了旧 Note 前情，不能作为独立来源反例。工具域在其 Store 关闭后，只用原 owner API 读取 A 的确切 option，并编译包含真实 Curio SourceSlot 的作品；fresh 对话的初始 noteSources 为空，owner、程序 receipt 和 Scene metadata 均继承原 Note@1／SHA／0..0、0..75 证明。限定元数据见本机 `presence-reminder-luna-Zl3JM9/tool-curio-program-source-adoption.json`。这一步没有调用模型、发表助手消息或验收界面；关闭 Store 后交还主动域继续原撤源／遗忘检查。

主动域完成永久遗忘并冷重开后，工具域用当前 epoch2 的新合法 scope 复核上述实际编译留下的 NoteProof 投影：原 planningMessageReadable=false，recordNoteSources 与 refreshDependencies 均为 note_source_changed，当前 pack 未采用旧 proof。作者式纯文字稿携该原 proof 同样被原 program owner 在发表前拒绝；原 authoredEvidence 的 sourceKeys 继续排除非空 noteSources。复用先前独立作品的原文字 DSL，不携 NoteProof 时仍可正常编译；独立原许可证文件仍完整可读、SHA 不变。`tool-curio-program-after-forget.json` 保存这些限定结果；先前只保存了程序的证明投影、未发表或保存完整 program，本次没有重建已忘正文或冒称完整旧作品重读通过。

最终类型与 diff 检查通过；既有 streaming 检查 1/1，最终相关隐私检查 4/4，含材料预览、重开／遗忘、旧库删除屏障及派生清除。没有新增测试、fixture、runner，没有调用 DeepSeek 或改变生产传输；忽略目录中的实际诊断资料保留，没有重试先前被拒的清理。
