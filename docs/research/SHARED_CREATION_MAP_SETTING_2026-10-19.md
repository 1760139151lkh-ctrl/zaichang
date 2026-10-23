# 共同作品在原地图上取景

这一轮选择的是一个具体相处能力：用户想把校园夜游写成能玩的故事，助手已经带来一幕，可以借公共地图上的一个真实地点取景；用户指另一个地方、改路或直接写自己的反应，下一幕要真正接住它。普通谜题、创作与新发现不必都带地图。这里不增加故事引擎、用户人生库、章节管理页、游戏任务或评分。

## 一手参考与工程选择

已读 ink 作者的 [Writing with ink（固定原文版本）](https://github.com/inkle/ink/blob/ff697147c10bf72a5d1339a1406d88f1dc59ab56/Documentation/WritingWithInk.md)，尤其 Choices、Branching and joining、Gathers/Weave。它展示的价值是选过之后有实际后文，并允许不同分支重组、汇合和改写。这里借这个写作判断，不引入 ink 的编译器、变量系统或独立游戏循环；也不把每段共同创作固定成选择题。

项目的选择是让原主模型写作品。宿主只核地点、来源、当前版本、范围和保存关系。用户选择地点只形成临时引用，未写下一幕前不能声称作品已改；点过某条路也不推成用户永久偏好或真实行动。

## 已接入的源码链

- `shared/story-setting.ts` 区分模型请求 `{placeId,mapVersion}`、宿主生成的公共地点快照，以及 MapScene 上的原作品地址。模型不能提交地点名字、位置坐标或来源证明来替代公共地图读取。
- `runtime/story-setting.ts` 只用连接的 `publicView()`，不读取个人别名、个人地点或 Windows 位置。宿主核当前版本与真实 point，再把地点名、ID、地图版本、来源日期/地址作为原 `h_evidence` 的 `source_record`，`infer:false`。这是原作品的来源片段，不是第二份事实库。
- 原 `CuriosityInvitationService` 的 offer/continue/another 可选 `setting`；仍归同一个 frame/option。continue 省略保留原取景，显式 null 回到无地图创作。旧章续作会保留原章地址与来源依赖；后来保存的独立章节不被回滚。地图暂不可用时保住可玩的创作，诚实返回未附取景，不伪造公共事实。
- `present_view.storySetting` 也允许作品尚未选点：先把原作品地址接在当前公共地图上找取景，不强迫先猜一个地点。已有 MapScene 保留同 id、journey 和本地相机连续性，取景关系本身不制造移镜请求；找点默认展开、已保存取景默认收起，收展开是观看状态。新快照及其 Work/原章证明在预算准入后才记入 SceneService/publish；没有另起一张地图或后台故事。
- 原 place/leg `SemanticSelection` 继续是唯一焦点；宿主返的 `VerifiedSelection.storySetting` 才带作品地址。正式 compile 沿原 `resolveReference`、范围、预算和 receipt 处理，不在可见文字塞内部 ID，也不偷偷另恢复一个输入引用。
- `mapStoryReferenceIdentity` 给前置语义解析使用：只取当前 session、原 done message、exact scene ID/revision 的作品指针与来源资格，随后核原作品身份。它不选择故事正文、地图坐标或原 quote，不替代正式读取。
- `creationSourceContextForIngress` 在 control 后按实际 scope 再核同一身份，持久到原 event 的 shared_creation sourceContext。map_place/map_leg 只保存作品与焦点地址；MemoryContext 当前/历史/窗口、recovery 与 extract/reviewer 方法接住这个身份。初次说“想写一个故事”仍可是真实创作愿望，作品内部命题才属虚构；不整条跳过同时出现的真实自述。这些是源码机制，尚未运行记忆模型路径。
- 原 `read_shared_creation` 精确原章会带当时的 setting。它是当时地图版本下的取景资料；重新放在当前地图前仍核版本。虚构事件和第一人称保持作品身份，不成为本人现实经历。

`MapScene.storySetting` 同时受原 WorkSourceBinding 与原章 AssistantWorkSource 读取门保护。当前主模型采用、前后台子调查采用、后续历史继承仍走原 receipt/删除依赖；章节索引不是全文已读或 ACK。遗忘、来源退出与旧许可不会因“故事还在”被恢复。

## 图稿与实际界面范围

后端接入后生成了 [第一版取景构图](../../%E5%89%8D%E7%AB%AF%E8%A7%86%E8%A7%89%E5%88%9B%E6%96%B0%E8%AE%BE%E8%AE%A1/%E7%BB%9F%E4%B8%80%E5%9B%BE%E5%BA%93/%E5%8E%9F%E5%9B%BE/%E7%95%8C%E9%9D%A2%E8%AE%BE%E8%AE%A1-%E5%9C%B0%E5%9B%BE%E4%B8%8E%E5%A4%A9%E6%B0%94/%E6%A0%A1%E5%9B%AD%E5%9C%B0%E5%9B%BE%E5%85%B1%E5%88%9B%E6%95%85%E4%BA%8B-ff76ffcd95ca.png)，权利用途记在同目录 manifest。根负责人亲看后仅选择同图、暖纸、真实正文与原输入的关系，并拒绝其新会话栏/外壳、未核地图几何和湖名。下一版须以当前实际 App、人物与实际 MapSurface 截图为参考：找取景时展开原地图，选定后作品成为主角，地点留在纸边可展开的小取景签；再开地图沿原相机与选择，不一直占半页。运行界面继续使用现有 MapSurface 和公共资产。纸材沿用已经清理外围残影的 manuscript-paper.png，不把整张假 UI 当资产。

本轮地图任务是对话取景关系和选择语义，不修改公共地点目录、地理坐标、路网、建筑、相机/路由算法或地图来源。与其相关的读取/来源与身份关系已按源码核对；不能把它写成新地理数据通过全图验收。新地图 UI 仍须在首波暖夜纸等共享窗口更新结束后接入，并亲看同地图焦点/相机连续、正常续写输入与当前图稿的内容关系。

截至这一记录：上述后端是源码接入，未做模型或业务功能验证，未跑新测试或 runner，未读取用户数据库或账号。GPT Image 是设计输入。原 Curiosity 暖纸/夜色、草稿选句与历史展开的既有观察，范围见 MODEL_GUIDED_UNDERSTANDING 的独立回执，不能升级成取景能力已运行。

## 用户切换阶段后的边界

用户随后要求停止新增扩展，先由唯一共享窗口的 operator 用真实 Luna 经正常对话检查既有日程、成绩、地图、笔记和相关动态 UI，完成后等待用户继续。第二版取景图和新前端因此停止；`ConversationMap` 未加入取景前端。已落后端保留，不重置其他改动，也不把第一版图或普通地图渲染写成取景体验交付。新取景不会阻止日程、成绩、地图、笔记等原能力的正常发现与选择。

本阶段只收原共同作品续作来源的必要正确性：WorkSourceBinding 的直接引用上限仍为 32，未抬高全局契约。已有 exact 保存原章可作为递归依赖，当前 frame/option 只绑定本次真正新增的片段与仍用到的地点资料；通用目录、保存、历史、实际采用及遗忘继续核原章。当前原章通过 exact owner/matter 四版本与完整来源门确定，不用新 seed 充作旧作品。Context 的纯地址记录也继承该证明，直接祖章列表只沿原回执与 exact Scene 实际声明的三字段章节地址递归压缩；不从 message 级 privacy 边或相似正文猜哪个 Scene 被覆盖。同一消息里的独立 Scene 地址仍分别保留，删除与失效继续沿原 privacy/block 依赖。

仅改状态的放下保留宿主在原 option 上记的最后创作版本，避免每次放下再继续都使真实原章失配。继续时仍另核当前 CAS、原关闭状态与当前真实新愿望；引用原章前逐项核正文、完整 binding 和继承 proof 完全相同。这个元数据不是旧状态或旧许可的恢复，也没有为旧库回填版本。

未形成合法保存原章的工作草稿不获得这项压缩例外：它仍保留来源，若直接引用已达边界，眼前创作可 conversation_only 继续，但不声称已经覆盖原作品，并给主助手原呈现地址保住真实原作。没有后台补造章、第二作品库、用户章节管理页或旧许可恢复。这些长链改动仍是源码状态，真实 Luna 和画面观察由本阶段集中检查另记。
