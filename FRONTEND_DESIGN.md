# 前端视觉设计入口

**主文档：[图片来源对话.md — 完整原始对话](前端视觉创新设计/图片来源对话.md)**

准确的仓库相对路径是 `前端视觉创新设计/图片来源对话.md`。

配套说明：[图像与页面对应.md](前端视觉创新设计/图像与页面对应.md)，包括体验方向、原图编号、功能落点和补充场景。

当前逐图对应与续作：[DESIGN_IMAGE_COVERAGE](docs/DESIGN_IMAGE_COVERAGE.md)。新增查找、托付详情和理解变化三张图：[窗边续作](assets/design/generated/2026-10-18-windowlight/)。

## 当前续作：个人陪伴、日程与对话场景

本轮从尚未合并的 `c7cff22884fe9a3050879067dd49012f685d8cfd` 继续。先完成后端合并检查（258 项通过），再生成并逐张查看以下四张 GPT Image 设计图，随后实施前端。当前页面正在接线与实际窗口观察；设计图本身不代表功能已完成，最终范围以 [CURRENT_STATUS](docs/CURRENT_STATUS.md) 为准。最新用户要求与历史资料的关系见 [本轮需求整理](docs/source-materials/2026-10-18/continuation-requirements.md)。

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
