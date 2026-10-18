# 在场

**[下载 Windows 最新版](https://github.com/1760139151lkh-ctrl/zaichang/releases/latest)** · [0.3.0 便携版 EXE](https://github.com/1760139151lkh-ctrl/zaichang/releases/download/v0.3.0/Zaichang-0.3.0-Windows.exe) · [SHA-256 校验文件](https://github.com/1760139151lkh-ctrl/zaichang/releases/download/v0.3.0/SHA256SUMS.txt)

当前桌面发布：**v0.3.0 · 2026-10-18 · Windows x64**，构建源码 `74e099a`。下载 EXE 后直接运行，内含锁定的 Hermes、Python 和 PDF 运行时；版本、检查范围与复现命令见[发布说明](docs/DEPLOYMENT.md#latest-windows-release)。

> **前端视觉设计请先看：[图片来源对话（完整原文）](前端视觉创新设计/图片来源对话.md) · [图像与页面对应](前端视觉创新设计/图像与页面对应.md) · [全部图片与路径](FRONTEND_DESIGN.md)**
>
> 主文档的准确路径：`前端视觉创新设计/图片来源对话.md`。

在场是面向大学生日常生活的本地桌面助手。通过一个持续的对话入口，理解用户当下的目标、承诺、资料和条件，帮助查询、阅读、规划、准备与跟进。学习、休息、朋友、兴趣和校园事务都属于生活；助手不把所有帮助归结为成绩或催促。

项目沿用一个真实的 **Hermes 主循环**：模型理解原话、选择工具、根据结果修订判断；宿主管理资料范围、权限、预算、版本、持久化和实际动作。一次明确的持续托付可以在范围内发现变化、准备材料、等待或停止，用户不必每次点名地图等能力。代码与本地数据分离，`src/` 是桌面和公共地图预览共用的唯一产品实现。

[公共地图预览](https://zaichang-campus-review-20261006.sugary-loom-6961.chatgpt.site/) · [当前功能与证据](docs/CURRENT_STATUS.md) · [项目导航](PROJECT_NAVIGATION.md) · [架构](docs/ARCHITECTURE.md) · [设计理念与约定](docs/PRODUCT_CONTRACT.md)

## 现在能做什么

| 能力 | 当前实现与边界 |
| --- | --- |
| 对话与连续事项 | 处理进展、历史、停止、草稿与附件、继续处理正在商量的事；主回复正文经完成核查后呈现，停止当前运行不取消独立已接受安排。 |
| 资料阅读与学习 | 导入 TXT/MD/PDF、分页读取与检索、原文定位、图片输入及数学排版；扫描件 OCR 尚未接通。资料和图片是否发给模型受本轮范围控制。 |
| 记事本 | 独立原文、搜索、编辑、冲突、版本、撤销和回收站；记下想法不会自动排时段或变成人物事实。 |
| 可纠正的记忆 | 原始证据与带条件的理解分开，更正、停用和遗忘会影响派生使用；关闭记忆与清除资料是不同操作。 |
| 可编辑人格 | 温暖学姐、元气搭档、冷静参谋及自定义角色；本地例句预览、保存、历史恢复、纯角色模板导入导出。角色不改变事实或权限。 |
| 安排与规划 | 事件、待办、截止、提醒、时间块、重复及单次例外；区分固定承诺、可移动块、邀请和未接受方案。接受修改后更新原对象，保留版本与撤销。 |
| 持续帮助 | 获准来源变化、时间节点和有效材料到期触发有界复查；可安静准备、等待、询问、在对话中呈现或依约提醒。暂停、停止、撤权和重启保持有效。 |
| 对话内地图与动态结果 | 助手回复内呈现真实可操作地图和日级天气；内嵌/聚焦共用地图实例，地点、日期和路段选择可接续下一轮。画面选择本身不构成保存或外部执行授权。 |
| 校园空间与天气 | 紫金港公共地理快照、稳定地点、步行候选路线、真实相机控制及无 WebGL 平面回退；天气支持公开参考地点、日期与小时窗口，并说明覆盖与未知。 |
| 校园与公开研究 | 已接宿主查询适配、公共搜索与网页读取；校园账号连接器须另外安装并私下授权，具体资源是否完整要看真实回执。 |
| 缓存与子代理 | 合法等价读取可共享，等待者独立取消；缓存按范围与版本复核。真实子代理获得有界上下文和共享预算，父代理消费结果，迟到结果不能恢复被取消工作。 |
| 结果与恢复 | 区分建议、本机登记、外部执行和未知结果；已展示资料与通知共用版本记录。OS 提交、送达、已看分别记录。 |

现有入口和代码定位见[项目导航](PROJECT_NAVIGATION.md)。当前前端另在演进“聊天／今天／留下”、陪伴形象与学习工作区；已经落盘的组件、完整接线和实际界面验收分别记录在[当前状态](docs/CURRENT_STATUS.md#frontend-evolution)，设计图不作为完成证明。

## 系统组成

Electron main 负责本机数据库、凭据、权限、工具和副作用；React renderer 通过有限 Bridge/IPC 显示内容并提出操作。Hermes Python sidecar 使用锁定的上游 `AIAgent`，模型传输与工具执行仍回到宿主。Node SQLite 保存业务对象、证据、版本、队列与回执；地图的地理事实、显示几何、路线及观看状态各有职责。

技术栈：Electron、React、TypeScript、Node SQLite、Hermes Python、MapLibre GL JS；OpenLayers 提供平面兼容视图；OpenUI 1.0.1 只渲染宿主验证的有限 Scene 组件，不承接第二套聊天或工具执行循环。模块与数据所有者见[架构](docs/ARCHITECTURE.md)。

## 本地运行

当前工具链为 Node **24.18.0**、npm **11.16.0**，桌面目标 **Windows x64**。Hermes 固定为 0.21.2、提交 `d595e636c83aa0b9606d4e914e1140ae9c796897`，使用 Python 3.13 和冻结的上游 `uv.lock`。安装 Python 与 uv 后：

```sh
npm ci
npm run setup
npm run dev
```

普通启动以 DeepSeek 为生产默认。模型密钥从桌面连接界面私下输入并按系统机制保存；项目已授权的 Windows 凭据也可由 `npm run deepseek:check` / `npm run dev:deepseek` 使用。校园连接器位置、独立数据目录见 [.env.example](.env.example)。不要把凭据或运行数据写入仓库。

测试阶段仅使用已有 Codex 账号的 **GPT‑6 Luna Max 临时代测通道**，禁止为测试调用 DeepSeek：

```sh
npm run dev:luna:test
# 构建后，也可运行：
npm run start:luna:test
```

该通道只替换模型传输，仍使用同一 Hermes、权限、天气、校园适配和动作链；它不等于产品已有通用 ChatGPT 登录。Node 请求优先使用显式代理环境变量，Windows 未指定时沿用已开启的系统手动代理；此通道不执行 PAC。

只看公共地图不需要账号、密钥或 Hermes：

```sh
npm ci
npm run review
# http://127.0.0.1:5174
npm run build:review
npm run preview
# http://127.0.0.1:4173
```

公共预览只包含固定公共地图及本地选点、相机和路径交互，不含聊天、记忆、设备定位、账号或模型请求。[云端审查](docs/CLOUD_REVIEW.md)说明确定场景和历史部署版本；本地新增代码不代表线上自动更新。

## 开发、验证与交付

```sh
npm run check
npm test
npm run test:hermes
npm run build
# Windows x64 打包：
npm run package
```

现有检查验证机制，真实模型、服务和界面仍需各自证据。2026-10-18 已完成的学生 Harness 与对话场景联调记录见[学生 Harness](docs/STUDENT_HARNESS.md)和[对话场景](docs/CONVERSATION_SCENES.md)；后续前端变化须另行验收，不继承旧检查的结论。Linux 可构建产品 JavaScript 和 review-web，Windows 原生定位、PDF 运行时及桌面打包须在对应平台核对。开发容器见 [.devcontainer/devcontainer.json](.devcontainer/devcontainer.json)，公开部署见[部署说明](docs/DEPLOYMENT.md)。

## 设计与当前限制

帮助以用户的决定权和当下需要为中心：保留原话与条件，允许不知道、纠正和停止；先做有用准备，已有授权内少问，实际缺口才询问。界面用内容与直接操作解释结果，细节按需展开。地图保留暖灰／金色与空间观看能力，估计接入、静态来源和现场未知如实区分。[产品约定](docs/PRODUCT_CONTRACT.md)维护这些原则。

当前没有手机 GPS／健康／同步及关闭电脑后持续工作的完整链，也没有校园预约、付款、邮件或钉钉外发的生产闭环。桌面进程关闭后轮询停止；OS 通知提交不能证明用户收到；整库尚未加密。动态校园覆盖、真实账户、生产登录和设备能力分别验收，见[当前状态](docs/CURRENT_STATUS.md)与[移动及外部边界](docs/STUDENT_HARNESS.md#t8手机与外部连接的实际边界)。

项目代码未授予开源许可。地图、字体、引擎、原生运行时与其他依赖的来源和许可见[资产来源](docs/ASSET_PROVENANCE.md)、[地图数据说明](assets/map-v2/SOURCE.md)及[第三方声明](THIRD_PARTY_NOTICES.md)。原始研究包、个人数据库、账号、私有地点、截图、录像和构建输出保持本地，不属于可发布源码。
