# 睦与若麦 · 新文学居室创作编排

本包只有创作 brief。若叶睦、祐天寺若麦各 9 情境 × 4 光线，共 **72 格待放行 prompt，生成图片 0 张**。不登记资产，不声明母图、分层或运行准入。旧 room4 的静态准入记录保留为历史，不迁入新空间。

## 阅读入口

| 角色 | 情绪、动作和光线编排 | 36 格完整 prompt |
|---|---|---|
| 若叶睦 | [mutsumi-creative-brief.md](mutsumi-creative-brief.md) | [mutsumi-prompt-plan.json](mutsumi-prompt-plan.json) |
| 祐天寺若麦 | [nyamu-creative-brief.md](nyamu-creative-brief.md) | [nyamu-prompt-plan.json](nyamu-prompt-plan.json) |

九情境为 chat、study、reading、planning、listening、rest、play、attention、resume；四光线为 apricot、mist、violet、rain。它们是幕后创作维度，不产生供用户导演姿态的九个按钮。

## 亲看的新基准

[用户选定原图](../../../2026-10-25-ambient-redesign/sakiko-reading-literary/sakiko-reading-apricot-literary-v1.png)，1536 × 1024；SHA-256：`e9d41849151b5678082567ed80cada650ab47e7955dd6061dbd2251a5c03a9fd`。

这张图的关系是亲近的窗边阅读：相机比旧房间更近，完整人物靠在右侧长软榻，木窗、织物、书架、左后方书桌木椅和陶瓷灯形成有人生活的层次。湖山窗景是插画环境，不作为真实校园或天气事实。手、眼、刘海与书的关系清楚，暖光真实落在皮肤、衣物和木面上。

本包承接这些空间情绪，不把祥子的身体当换人模板，也不沿用旧 room4 坐标。相机、家具、人物尺度和可用留白须等 root 的新空房 plate 与单祥子跨情境打样确定。基本姿势围绕真实座垫、书页或纸张支撑展开；attention 用自然转向，不为动作标签强迫近景人物站起或缩小。

睦的区别在于少言却具体的注意、自己的喜好与轻微幽默；若麦的区别在于想出彩、肯练习、能收住表现欲，也愿意把不完美的一遍交给亲近的人。光线改变受光和可见细节，不把两人统一换成笑脸、伤感或困倦。雨夜标签不生成天气事实，干夜或雨夜须由未来批准的 plate 与真实环境 owner 决定。

## 只读来源

仅使用下列本地角色公开定义及既有身份文字；未读取私人记忆。公开身份与角色性格是创作依据，新的共读、倾听和接续叙述是项目原创情境，不能被当成原作履历或真实用户经历。

| 来源 | 本次使用范围 | 文件 SHA-256 |
|---|---|---|
| `src/shared/persona-portrayals.ts` | mutsumi / nyamu 的公开身份、性格及项目改编边界 | `3bdf835f844731fa46100f0755bfa30d7e57926b1ca801862144df1f4b43f025` |
| `src/shared/persona-performance.ts` | 两角色注意、倾听、开始、创作、取舍和分享兴趣的文字 | `22d8efd42e5b83326ffd9e4b407ac085492d3206850954ef4c30f73654765238` |
| `前端视觉创新设计/来源记录/assets-design-generated/2026-10-23-companion-matrix/mutsumi-identity.txt` | 身份与衣装文字；没有复用旧人物图或姿势 | `e4e9843700b50e805ee37c50accf3f8ec98ab2f309e5881dbc6753eb03d89dbe` |
| `前端视觉创新设计/来源记录/assets-design-generated/2026-10-23-companion-matrix/nyamu-identity.txt` | 身份与衣装文字；没有复用旧人物图或姿势 | `11c2a032eeb68e2a5c4d7ec50fa5b0894504c0b2ed4361b59cd09f5ddaf31564` |

## 放行条件与核对边界

两个 JSON 的 `release.state` 均为 `hold_no_generation`；新空房和单祥子打样引用保持 `null`。每格 `output`、`primaryReview` 均为 `null`，`runtimeAccepted` 均为 `false`。root 明确 release 后，先依批准的新空房和本角色文字创作；同角色同情境新母图通过后，才用于四光线整体重照。结构错误图不得继续作垫图。

本次直接读取两份 JSON 核对：每角色 36 格，每活动 4 格，每光线 9 格，合计 72 个唯一 key；72 格均待放行，输出与运行准入均为 0。原图 PNG 尺寸及 SHA 已核对，并亲看原图。此处只证明 brief 的完整编排与来源，不证明尚未生成的图像质量。
