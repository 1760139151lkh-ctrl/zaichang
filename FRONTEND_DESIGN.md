# 前端视觉设计入口

2026-10-19 统一入口：[项目基线](docs/PROJECT_BASELINE.md)、[当前动态场景](docs/CONVERSATION_SCENES.md#companion-experience)、[第七批实际观察](docs/CURRENT_STATUS.md#personal-memory-round7)。下文第四批“暂不验证”保留当时范围；之后已授权必要视觉／交互观察及正常Luna动态呈现。设计图、运行资产、实际画面、动效和模型效果分别记录，不能互相代替。

第四批按[新目标](docs/source-materials/2026-10-18/goal-objective-current-20261018.md)先完成所选后端源码，再用内置GPT Image生成并查看[校园安排与个人日视图A/B](assets/design/generated/2026-10-18-campus-day/manifest.json)，选择A的连续时间线。实现沿既有“今天”接只读课表，不新增记忆工程看板；[对应与取舍](docs/DESIGN_IMAGE_COVERAGE.md)及[未验证状态](docs/CURRENT_STATUS.md#personal-memory-round4)分别记录。用户要求暂不验证，因此没有沿用旧界面观察宣称本批通过。

**主文档：[图片来源对话.md — 完整原始对话](前端视觉创新设计/图片来源对话.md)**

准确的仓库相对路径是 `前端视觉创新设计/图片来源对话.md`。

配套说明：[图像与页面对应.md](前端视觉创新设计/图像与页面对应.md)，包括体验方向、原图编号、功能落点和补充场景。

当前逐图对应与续作：[DESIGN_IMAGE_COVERAGE](docs/DESIGN_IMAGE_COVERAGE.md)。新增查找、托付详情和理解变化三张图：[窗边续作](assets/design/generated/2026-10-18-windowlight/)。

## 第三批：接着上次的安排

本批后端整合检查完成后生成并查看[继续商量A/B](assets/design/generated/2026-10-18-planning-continuity/manifest.json)，选A的连续时间线与轻量关系文字，沿原Planning Scene区分“已在日历／这次续排”。没有完成进度、新批准按钮或独立台账；原日历背景、日期条与精确引用保留。提示词、生成图哈希及私人分发边界见manifest，改前实际截图只留本机。宽窄／晨光夜色、切日、选择、草稿保存与reload／resume操作及最终审查状态见[第三批状态](docs/CURRENT_STATUS.md#personal-memory-round3)。

## 前两批：每天的余地

第二批在完整后端检查之后补了[安排时窗A/B比较](assets/design/generated/2026-10-18-chosen-windows/manifest.json)。采用A的日期条＋单日，吸收真实时窗和分窗表达；弃B重复折叠容器，也不照搬A的演示说明／全天灰色进度轨。当前规划沿宿主明确窗口显示，夜晚与间隙不是待填空白；旧无窗口Scene保留原语义。图稿、精确提示词、合成资料的改前实际截图均在同目录作为私人设计来源，非运行时依赖或手机完成证明。

第一批从已合并的 `4edd922` 继续，先完成记忆／主动性／日程后端，再生成两版日节奏图，比较后采用[日期条＋单日展开](assets/design/generated/2026-10-18-personal-memory/daily-rhythm-a.png)。[双日纸页](assets/design/generated/2026-10-18-personal-memory/daily-rhythm-b.png)保留为比较来源；不照搬重复时间轴、右侧暖句或示例数据。提示词、哈希、尺寸与选用记录见[manifest](assets/design/generated/2026-10-18-personal-memory/daily-rhythm-manifest.json)。

日节奏沿用原对话与输入，按真实宿主日账选择日期，时段可接着聊；角色卡可先编辑再放入草稿，环境旧快照与缺测保持准确呈现。记忆仍在后台工作，不新增常驻记忆工程面板。实际宽窄、主题、草稿、冲突与来源边界见[当前状态](docs/CURRENT_STATUS.md#personal-memory-continuity)，图片不作为功能或手机产品完成证明。

## 上一批：个人陪伴、日程与对话场景

上一批从当时未合并的 `c7cff22884fe9a3050879067dd49012f685d8cfd` 继续；这些成果现在已合入main。其顺序是先后端合并检查，再生成以下四张 GPT Image 设计图，随后实施前端。本批已接续并实际观察相关界面；设计图本身不代表功能完成，范围以 [CURRENT_STATUS](docs/CURRENT_STATUS.md) 为准。需求与历史资料关系见[来源归档](docs/source-materials/2026-10-18/README.md)。

| 设计依据 | 交互落点 |
| --- | --- |
| [planning.png](assets/design/generated/2026-10-18-companion-evolution/planning.png) | 对话内可选择的安排时间带、休息与留白、选中后接着说 |
| [environment.png](assets/design/generated/2026-10-18-companion-evolution/environment.png) | 按真实小时展开天气；空气读数保留自己的来源与时间 |
| [persona.png](assets/design/generated/2026-10-18-companion-evolution/persona.png) | 选择形象时明确是否采用角色性格；角色卡先预览再进入编辑草稿 |
| [calendar.png](assets/design/generated/2026-10-18-companion-evolution/calendar.png) | “今天”的日期范围导出、可选备注、由实际保存结果决定完成状态 |

原始提示词与文件身份：[prompts.md](assets/design/generated/2026-10-18-companion-evolution/prompts.md) · [manifest.json](assets/design/generated/2026-10-18-companion-evolution/manifest.json)。逐图采用和舍弃的细节见 [图像与实现对应](docs/DESIGN_IMAGE_COVERAGE.md)，归档用途见 [素材来源](docs/ASSET_PROVENANCE.md)。沿用现有导航，不照搬生成图的额外侧栏、示例数据、角色传记或错误日期；窄屏缩略图只是布局参考，手机版和平板版仍属后续产品工作。

## 图片与素材

- [图片/](前端视觉创新设计/图片/)：22 张原始视觉图，图号在文件名末尾。
- [补充图稿/](前端视觉创新设计/补充图稿/)：23–39 号补充界面图，共 17 张。
- [素材/](前端视觉创新设计/素材/)：3 张窗景和 3 位人物，共 6 张。
- [补充图稿生成记录](前端视觉创新设计/补充图稿/生成记录.json) · [素材生成记录](前端视觉创新设计/素材/生成记录.json)。

原文中的“只留本地、不进远程仓库”属于历史记录；用户随后已明确授权将本目录上传当前私有 GitHub 仓库。原文保持原样。原始设计资料已进入 `main`；本轮新增图稿与实现应以当前续作分支及 [CURRENT_STATUS](docs/CURRENT_STATUS.md) 的保存点为准，不能仅检查 `main` 判断它们是否存在。

若云端工作区找不到原始资料，请核对其 checkout 是否已同步相应分支。以下命令只用于读取已经进入 `main` 的原始对话，不会包含尚未合并的续作；有正在进行的改动时，保留当前工作：

```sh
git fetch origin
git show 'origin/main:前端视觉创新设计/图片来源对话.md'
```

仓库搜索尚未收录时，可按上面的完整路径直接读取。当前实现与检查记录见 [CURRENT_STATUS](docs/CURRENT_STATUS.md)。
