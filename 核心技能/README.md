# 在场 · 三份完整核心技能

| 技能 | 完整入口 | 配套内容 |
| --- | --- | --- |
| 前端设计 | [前端设计/SKILL.md](前端设计/SKILL.md) | 7 份参考：保留原五份，新增共同在场编排与 Gemini/资产制作 |
| 后端设计 | [后端设计/SKILL.md](后端设计/SKILL.md) | 7 份参考：保留原五份，新增在场事件/观察与连续体验 |
| Gemini 视频生成 | [Gemini视频生成/SKILL.md](Gemini视频生成/SKILL.md) | 9 份参考与 setup-status.md：保留网页制作体系，新增在场制作与代码移交 |

三个子目录均保留完整正文和全部配套文件，没有缩写为摘要，也没有省略 references。正文内的仓库链接采用相对路径，技能内的参考链接也可直接在 GitHub 点击。

前后端两份的编辑源位于仓库 [.agents/skills](../.agents/skills/)，此处是便于查找和完整下载的同步副本；更新时同步两处并校验相对路径。Gemini 技能以用户本机已安装版本为基础，2026-10-25 增加项目移交规范；本仓库改动不表示已自动更新本机全局安装。不含账号、密码、Cookie 或 API Key。

需要安装时，完整复制对应子目录，并分别命名为 `zaichang-frontend-director`、`zaichang-backend-director`、`gemini-video`。前后端技能引用本仓库源码，建议与仓库一起使用；Gemini 的登录与配额须在使用时重新核对。

## 2026-10-25 共同基础

- [在场共同契约](../docs/design/PRESENCE_SYSTEM_2026-10-25.md)：真实状态、动作通道、用户纠正与撤回闭环。
- [角色动态制作规范](../docs/design/CHARACTER_MOTION_PIPELINE_2026-10-25.md)：身份/场景/姿态矩阵、GPT Image 与 Gemini 网页协作、代码移交。
- [十二阶段路线图](../docs/REFACTOR_ROADMAP_2026-10-22.md)：每阶段 D01–D12 完整导演设计。
- [本机 Codex 启动说明](../docs/handoff/2026-10-25-presence-design/CODEX_START.md)：保护本地最新成果，按统一顺序继续。
