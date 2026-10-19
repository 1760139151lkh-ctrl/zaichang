# 非字面候选召回：本地 CPU 实施选择

## 第五批源码实施进展

以下原研究保留当时“仅研究、未安装”的时间边界；本批已继续实施。`onnxruntime-node@1.30.0`和`@huggingface/tokenizers@0.2.0`已作为精确产品依赖安装（本次关闭安装脚本），固定四文件已在项目`runtime/embedding/model`安装，共24,451,050字节。安装器按原大小/SHA核对；首次遇到JSON对象键顺序误比较，修正稳定对象比较后，同一安装入口成功。没有启动worker、native推理、Luna/DeepSeek、真实个人库、项目检查/构建或打包。因此这些是资产安装和源码状态，不是运行兼容、速度、内存或召回质量结论。

本批实现位于`memory/embedding-contract.ts`、`embedding-runtime.ts`、`embedding-worker.ts`、`semantic-store.ts`和`semantic-recall.ts`。模型/分词/前缀/pooling/分片方式及固定资产身份形成同一method hash；CPU工作在线程内，原文先按原Unicode坐标分片，再核完整token上限，不静默截尾。查询向量只在内存，索引只留原文地址、版本、hash、方法和可删除向量，SQLite源码迁移至schema14，不复制另一份正文或人物事实。

生产`search_context`经异步`prefetchWithSemantic`加入候选，原sync词法/browse入口保持。各词法改写先聚合为一路，再与语义路保留头部、RRF融合；重复查询或片段不变成独立证据。所有向量先核当前scope、来源、精确范围、版本和正文hash，再评分/分页。返回原文预览与实际read入口，不根据相似度判事实；当前理解、例外和业务状态仍沿原来源闭包读取。查询/正文的本地模型输入从原共享读取预算即时计账，不假称原文已交主助手。

索引允许时按固定原文快照、keyset和已提交范围增量推进。原`h_meta`的有界检查点只保存快照/位置/覆盖地址签名，不复制正文、查询或scope；仅在当前权限重新准入后恢复，防止重启反复处理最新一批而饿死旧原文。只读子调查与临时范围只查询当前合法的既存向量，不能写索引或推进索引位置。

排名快照只留进程内地址/hash/score，携`semanticSnapshot`与`semanticOffset`分页；有界候选枚举另给`vectorSearch.nextWindow`/`semanticWindowCursor`继续较早来源或同条原文剩余片段，每个窗口只在自身范围排名。续窗口只查冻结的合法索引集合，不补建或修复索引；来源/范围/集合/方法改变或进程重启后重开，不恢复旧授权。语义合并页与单查询词法深页各有继续入口；受限结果不回显查询文字，`reuseCurrentQuery`要求调用方沿用原查询。索引未覆盖保持partial；限制片段内的预览用原始坐标交给父助手，不把授权quote起点误当命中起点。

语义候选采用的精确范围沿现有`workSourceBindings`传到模型边界、子报告、历史正文、IPC/导出与永久遗忘；纯来源核验不要求额外读取Work对象，真正Work读取仍核其owner。删除与可归因重叠原文在原事务清向量，启动时清恢复库中已失效派生；普通查询不成为新事实。自动打开某事项仍只回读它的来源，不因新增索引扩大为全库检索。

`scripts/embedding-runtime.mjs`仅在明确setup下载；应用运行不访问Hub或个人cache。构建/Windows打包脚本已接worker和asar外`embedding-runtime`，保留win-x64原生文件与完整许可，未实际构建或分发。此机制融入原聊天取证与来源查看，不增加需要用户维护的索引页；第四批原有图像先行界面继续保留。尚不覆盖所有文件正文、任意语言或完整语义关系，现有词法、scan和browse仍是必要路径。

### 由原话找回原事项：第六批接续

下述候选随后进入第六批源码实施：`source-related.ts`经原`restore_collaboration(type=source_related)`接线，来源、分页、原owner资格与未验证范围见[专项记录](SOURCE_RELATED_WORK_2026-10-18.md)。以下保留选择理由；不将第五批安装状态升级为第六批运行证据。

源码定位没有等价反查入口：`relatedWorkPage`只沿已声明的matterId/episodeId向下，`CollaborationService.restore`可恢复已知frame/goal；学习过程和个人方法另有原owner入口。后续可在`restore_collaboration`增加`type=source_related`的有界候选目录，复用原Work，不建立图或第二事实层。首次输入当前原文的精确版本/Unicode范围，后续用仅进程内地址cursor继续；不调用resolveEpisode、不设置焦点、不恢复状态或合并事项。

精确sourceBinding仅在同event/version的区间严格重叠时命中，其全部refs仍须当前可读；已有binding但不重叠不能退回整条eventId。没有范围的旧evidenceIds只能是明确标注范围未知的弱候选；部分quote授权或局部停止时无法证明来源的旧候选不返。隐私/失效用的h_dependencies、标题相似、时间相邻和同会话都不能成为语义关联。目录默认只给ID、版本、类型、关系强弱与原owner可用读取入口，不给正文或新摘要；同条长消息的多个候选保持独立。

入口仍先核self/real、work:self、evidence:read、当前用途/投影与会话边界；仅relevant可跨会话，其他模式只允许宿主当前会话明确成员，缺归属不猜。SQL复用原filter/workSourceFilter/helpSourceFilter与逐证据可读性，rowid固定上界/keyset有界扫描；空partial仍可继续，不把目录算正文已读/ACK。没有可用精确owner入口的类型暂不纳入。后台当前没有新增此目录工具；若以后提供后台学习读取，还需将其当前绝对read_evidence指针按宿主quote base投影，不能用新目录扩大后台工具权限。本轮仍按用户要求不运行验证。

## 实施前研究记录

以下保留2026-10-19 03:58 UTC的研究状态；当时只读官方源码、模型卡与HTTP元数据，没有安装包、下载权重、启动服务或运行模型/测试。“建议”“拟实施”“尚未接通”等时态仅属于这个历史截面；当前源码与安装状态以上方第五批进展为准，运行及效果仍未验证。

## 与已有召回及一手实现的比较

当前 `e4254aa` 已有词法、多查询RRF、scan及无字面条件的原文browse；此候选解决不同措辞的发现成本，不重做现有记忆库。比较实读 [Khoj 固定版本的增量分块](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/khoj/processor/content/text_to_entries.py#L62)及 [Mem0固定版本的本地SQLite向量存储](https://github.com/mem0ai/mem0/blob/0724291bd864cf807e88ee8981c8226644e8fb42/mem0-ts/src/oss/src/vector_stores/memory.ts#L18)：小规模向量可留在原SQLite，不需要接入其整套服务。Khoj的文件/hash删除不能替代精确来源范围；Mem0按空白分词的BM25不能替代现有中文词法路径，其[混合候选](https://github.com/mem0ai/mem0/blob/0724291bd864cf807e88ee8981c8226644e8fb42/mem0-ts/src/oss/src/memory/index.ts#L1425)也不能直接代替当前RRF。

拟实施时，派生表只存原文地址、版本、范围、正文hash、模型/分片方法和向量，不复制原文。索引仅使用当前合法持久来源及 `availableInferenceRanges`，不跨停止片段；异步返回复核取消、版本和屏障，遗忘事务清除受影响向量。检索先核范围/投影再排名，与词法臂复用现有 `fuseRecallRanks`，候选仍须回原文及条件闭包核实。索引不是独立事实或新授权。当前仍是方案，未留下空实现冒称功能。

## 建议

当前中文个人记忆优先选择 **BGE-small-zh-v1.5 的固定 q8 ONNX**。首选最窄的产品依赖是 `onnxruntime-node@1.30.0` + `@huggingface/tokenizers@0.2.0`，沿官方 WordPiece tokenizer JSON，直接执行单一 BERT 图并按官方模型卡取 CLS + L2 归一化；不另写分词器、不设模型服务、不依赖 Python/Hermes/Codex 内部路径。若希望直接复用完整 pipeline，则可用 `@huggingface/transformers@4.3.1`，代码少一些，但默认依赖和打包明显更重。

选择 BGE 是当前中文资料与较小落地成本的工程判断，不是已测得它对本项目优于 E5。两者都只是候选召回模型，不能证明个人事实、接受、完成、因果或独立掌握；词法、scan、browse 和原文复核仍保留。

## 两个实际可取用模型

| 项目 | 中文方案 | 多语方案 |
|---|---|---|
| 原作者模型 | `BAAI/bge-small-zh-v1.5` | `intfloat/multilingual-e5-small` |
| 原模型固定提交 | `7999e1d3359715c523056ef9478215996d62a620` | `614241f622f53c4eeff9890bdc4f31cfecc418b3` |
| 现成 ONNX 导出 | `Xenova/bge-small-zh-v1.5` | `Xenova/multilingual-e5-small` |
| 导出固定提交 | `75c43b069aac4d136ba6bc1122f995fedcfd2781` | `761b726dd34fb83930e26aab4e9ac3899aa1fa78` |
| 适用语言 | 原卡明确中文 | 原卡明确100种语言，含中文；低资源语言可能退化 |
| 架构元数据 | BertModel，4层、hidden 512，最大位置512 | BertModel，12层、hidden 384，最大位置512 |
| 输出向量 | 512维，float32 每条2,048B | 384维，float32 每条1,536B |
| pooling | 第一个 CLS token；L2 归一化 | attention-mask加权mean；L2归一化 |
| 查询/原文格式 | 短查询可加原卡检索指令；原文不加。v1.5也允许无指令，但须固定索引方法 | 查询`query: `，片段`passage: `，非英语也使用这两个前缀 |
| 原模型许可 | 作者模型卡 `license: mit` | 作者模型卡 `license: mit` |

原卡与用法：[BGE作者卡](https://huggingface.co/BAAI/bge-small-zh-v1.5)、[E5作者卡](https://huggingface.co/intfloat/multilingual-e5-small)。BGE的CLS、检索前缀与E5的mean/前缀不能混用；分数只用于相对排序，不能把固定相似度阈值当事实可信度。

Xenova 是 Transformers.js 的 Hugging Face Staff 导出账号；导出卡明确指向上述原模型，现有文件适配 Transformers.js。两个导出仓库目前**没有单独 LICENSE 文件/许可元信息**，因此产品分发需保留原模型MIT许可依据、原作者署名/通知、导出来源与固定提交，不能将“导出卡缺许可字段”写成单独的新许可证。运行库分别为 ORT MIT、HF tokenizers/Transformers.js Apache-2.0。

## 精确文件体积与 hash（只取元数据，没有权重下载）

单位 MB 使用十进制，不能与 MiB 混称；这些不是最终 EXE 压缩体积，也不是推理峰值内存。

| 文件 | BGE字节 | E5字节 |
|---|---:|---:|
| `onnx/model_quantized.onnx`（dtype=q8） | 24,010,842 | 118,308,185 |
| `tokenizer.json` | 439,125 | 17,082,730 |
| `tokenizer_config.json` | 367 | 443 |
| `config.json` | 716 | 658 |
| 四个推理必需文件合计 | **24,451,050（24.45MB）** | **135,392,016（135.39MB）** |
| 可额外保留的原词表 | `vocab.txt`109,540B | `sentencepiece.bpe.model`5,069,051B |

HF JS分词器直接读取完整 `tokenizer.json` 与配置；上述原词表不是这条 JS 路径必需项。仍需附带许可/来源清单，小文本大小未计入四文件合计。

- BGE q8 LFS SHA-256：`15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc`。
- E5 q8 LFS SHA-256：`f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`。
- BGE另有fp32=94,851,877B、fp16=47,497,427B、int8=23,903,394B、q4=52,400,400B；E5 fp32=470,268,533B、fp16=235,336,732B、int8=118,054,593B、q4=398,649,233B。**q4文件实际比q8更大**，不能按位数名称推断下载更小。首轮固定一个q8方法，不让不同dtype混入同一索引。

精确值由官方 Hub tree API 的 `size`/`lfs.oid` 读取：[BGE固定目录](https://huggingface.co/Xenova/bge-small-zh-v1.5/tree/75c43b069aac4d136ba6bc1122f995fedcfd2781)、[E5固定目录](https://huggingface.co/Xenova/multilingual-e5-small/tree/761b726dd34fb83930e26aab4e9ac3899aa1fa78)。元数据 API 为 `https://huggingface.co/api/models/<repo>/tree/<revision>?recursive=true`。

## 当前 Windows/Node/Electron 可运行路径的依据

本机普通元数据命令返回：Node **24.18.0**、Node-API **10**、win32/x64，已安装 Electron package **44.3.0**。项目主进程由 esbuild 打为 Node24 CJS；没有启动 Electron 或模型。

官方当前 npm 发布为 Transformers.js **4.3.1**，依赖 ORT Node **1.30.0**；技能说明中的3.8.1已不是当前版本。4.3.1 固定源码提交是 `511bb61a7c46b73e33f1af3fb308fbd1afe98c02`；ORT v1.30.0 固定源码为 `f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7`。

- [Transformers.js 4.3.1 package](https://github.com/huggingface/transformers.js/blob/4.3.1/packages/transformers/package.json)同时提供Node CJS/ESM导出，不必在 renderer 执行。
- [官方 ONNX 后端源码](https://github.com/huggingface/transformers.js/blob/4.3.1/packages/transformers/src/backends/onnx.js)在Node选择onnxruntime-node，CPU是Node默认provider；仍应明确`device: 'cpu'`，避免依设备自动启用GPU。
- [dtype映射源码](https://github.com/huggingface/transformers.js/blob/4.3.1/packages/transformers/src/utils/dtypes.js)中CPU默认fp32，`q8`才选择`_quantized`。不能只写pipeline然后声称加载24MB模型。
- [FeatureExtraction源码](https://github.com/huggingface/transformers.js/blob/4.3.1/packages/transformers/src/pipelines/feature-extraction.js)支持`cls`/`mean`和normalize；其内部默认截断，故产品必须自行保留全部原文范围并明确分片，不能仅对前512token建索引就说完整。
- [ORT Node官方平台表](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)列出Windows x64 CPU预编译支持；[v1.30 binding源码](https://github.com/microsoft/onnxruntime/blob/v1.30.0/js/node/lib/binding.ts)读取`bin/napi-v6/win32/x64/onnxruntime_binding.node`。Node-API6路径与本机Node-API10兼容是静态依据；没有实际加载证据，不能宣称Electron44兼容已通过。
- [ORT安装元数据](https://github.com/microsoft/onnxruntime/blob/v1.30.0/js/node/script/install-metadata.js)中Windows x64额外下载清单为空，CPU文件已随npm包提供；无需CUDA、Python或另驻留服务。

优先在**同一 Node 进程的 host-owned worker thread**执行模型加载和CPU推理，避免main事件循环承受分词和native同步段；它不是第二代理，也不开端口。产品取消/撤权仍由主机在交付前复验；取消不能假称中断了已经开始的native内核。

## 两种依赖/打包成本

以下均是官方 npm `dist.unpackedSize`，只读registry元数据，未下载包；不能据此声称最终压缩包恰为某大小。

| 依赖 | 版本 | npm解包字节 |
|---|---|---:|
| `@huggingface/tokenizers` | 0.2.0 | 360,962 |
| `onnxruntime-node` | 1.30.0 | 301,068,136（多个平台的预编译文件合计） |
| `onnxruntime-common` | 1.30.0 | 574,567 |
| `@huggingface/transformers` | 4.3.1 | 9,962,435 |
| `onnxruntime-web` | 1.31.0-dev.20260914-8d85527a0 | 144,895,056 |
| `sharp` | 0.35.4 | 960,214（还未算对应native可选包） |

直接 ORT + 官方 tokenizer 的已列三包约 **302.00MB**，另有ORT的adm-zip/global-agent等传递依赖；加BGE四文件约326.45MB，加E5约437.40MB。完整Transformers.js默认还带ORT Web、sharp、jinja与其他传递项；仅表列项合计约457.82MB，故不能把“模型24MB”说成“整套运行时只多24MB”。这些是未裁平台的安装成本，不是最终目标平台成本。

官方 tokenizers 是纯JS/TS、零依赖，使用 `new Tokenizer(tokenizerJson, tokenizerConfig)`，支持BERT规范化、WordPiece及BertProcessing：[官方源码/用法](https://github.com/huggingface/tokenizers.js)。直接ORT路径只实现固定模型的输入tensor与CLS归一化，避免带通用图像/音频pipeline；不新增可执行远程代码。

当前仓库 `scripts/build-electron.mjs` 的external仅覆盖Electron/PDF/canvas，打包采用asar；现有 `material-runtime.mjs` 已有“精确文件清单→独立resources→许可清单”的模式。若实施，应把ORT `.node`/DLL和固定权重放受控 `resources` 或明确asarUnpack目录，保留相对结构，避免esbuild吞入native库。不能只改TS import就声称便携版可用。

目标win-x64最终可只带该平台目录及所需JS/许可证，而不带Linux/macOS二进制；**本轮没有下载包，所以未取得最终win-x64逐DLL尺寸，也不虚报精确瘦身量**。官方C++ Windows CPU发布zip为82,645,522B，但它不是Node npm addon的同一分发物，不能拿它替代Node成本或直接当可用Node插件。

## 本机现有依赖/缓存（限相关元信息）

- 项目依赖及`node_modules`均没有 `@huggingface/transformers`、`@xenova/transformers`、`@huggingface/tokenizers`、`onnxruntime-node`、`onnxruntime-web` 或 tfjs-node。
- 定向 `npm cache ls` 查上述HF/ORT四项，没有条目输出。
- `~/.cache/huggingface/hub`存在，但其一级目录中无这两个候选名称；未列出其它模型、未读取缓存正文。
- `~/.cache/huggingface/transformers`、项目`.cache`、`models`、`assets/models`、`runtime/models`及HF JS默认包内`.cache`均不存在。
- 本机没有设置HF_HOME/HF_HUB_CACHE/TRANSFORMERS_CACHE/XDG_CACHE_HOME；仅检查是否设置，没有输出其它环境变量或凭据。
- 项目常见`.venv/Lib/site-packages`与`runtime/hermes/.venv/Lib/site-packages`不存在。未递归扫个人目录，也没有依赖Codex打包库替代产品依赖。

这只证明已查的标准/项目位置无可直接复用候选，不宣称整台电脑任何位置绝无模型。

## 选定后最小实现范围与尚缺条件

1. 一份固定BGE q8资产清单，包含来源提交、每文件大小/hash、pooling、归一化、query前缀策略、512token边界、MIT/Apache通知；模型身份/方法进入索引版本。只部署这一模型，不同时建设可插拔模型平台。
2. 产品自有Node CPU加载器或worker，只从明确资源目录加载tokenizer/config/ONNX；不使用Hub自动联网、CDN、系统任意模型或用户未选择的模型回退。ORT输入/输出名与类型在加载时读取并核对，不能把猜测的tensor名当模型契约。
3. 只对主机当前允许本地处理的精确原文范围生成可删向量及地址，长文token有界切片且保留Unicode原文映射。向量并非匿名数据，索引权限/删除/撤回由根正在比较的主机边界决定。
4. 在已有召回中加入真实本地向量候选与词法融合，再按同一来源/当前修订展开原文；不可用时明确保留原有召回能力，不用hash/词表向量伪称semantic。
5. 当前缺的是已选模型权重和依赖安装、独立分发文件接入及实际运行证据。本轮任务明确仅研究，尚无本机速度/峰值内存/准确性或Electron加载结论；用户未再要求前不发起模型测试。根已决定本批先推进学习证据，semantic留待下一后端单元完整实施，不留只有接口的假功能。

官方元数据入口：[HF模型API](https://huggingface.co/docs/hub/api)、[Transformers npm元数据](https://registry.npmjs.org/@huggingface/transformers/4.3.1)、[ORT npm元数据](https://registry.npmjs.org/onnxruntime-node/1.30.0)、[HF tokenizer npm元数据](https://registry.npmjs.org/@huggingface/tokenizers/0.2.0)。没有引用二手综述或把公开排行榜当个人记忆效果证明。
