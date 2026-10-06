# 在场
在场是本地桌面助手：通过对话处理校园查询、资料阅读、可纠正的记忆和本机安排，并提供紫金港交互地图。本仓库是完整产品的唯一可信源码；GitHub 的 main 与提交 SHA 是后续审查和交接基准。

[在线地图预览](https://1760139151lkh-ctrl.github.io/zaichang/) · [云端审查入口](docs/CLOUD_REVIEW.md) · [架构与文件导航](PROJECT_NAVIGATION.md)

正式桌面入口：`src/main/main.ts` → `src/main/preload.ts` → `src/renderer/main.tsx`。地图位于 `src/renderer/map/`，桌面与 review-web 共用地图组件、相机、路由服务和数据。

Node **24.18.0**，npm **11.16.0**，桌面目标 **Windows x64**。Hermes 使用固定上游提交、Python 3.13 与冻结的 uv.lock；安装 uv 后执行：
```sh
npm ci
npm run setup
npm run dev
```
只查看地图，无账号、密钥或 Hermes 安装要求：
```sh
npm ci
npm run review
# http://127.0.0.1:5174
npm run build:review
npm run preview
# http://127.0.0.1:4173
```

技术栈：Electron / React / TypeScript / Node SQLite / Hermes Python sidecar / MapLibre GL JS；WebGL 不可用时使用同一数据的 OpenLayers 平面视图。本机资料、记忆、账号、原生通知、PDF 工作进程和模型请求属于桌面端；公开预览只包含固定公共地图和本地运行的选点、相机、路径交互。

`npm run check` 类型检查，`npm run build` 构建桌面代码和地图预览，`npm test` 检查 Harness、持久化记忆、隐私与路径机制，`npm run test:hermes` 验证真实 Hermes 引擎与合成宿主通信。Windows 打包：`npm run package`。Linux 能构建代码与 review-web；Windows 原生 PDF 运行时、定位和桌面打包不在 Linux 验收范围。

校园查询需要用户另行安装并授权的学生信息连接器（`ZAICHANG_ZJU_SOURCE`）。模型密钥在桌面连接界面私下输入、按系统机制保存。Windows 已授权的项目凭据也可用 `npm run deepseek:check` 和 `npm run dev:deepseek` 读取系统加密保存。仓库无个人资料；环境变量范例见 [.env.example](.env.example)。开发容器见 [.devcontainer/devcontainer.json](.devcontainer/devcontainer.json)。

已实现的范围和真实限制见 [CURRENT_STATUS](docs/CURRENT_STATUS.md)；运行机制见 [ARCHITECTURE](docs/ARCHITECTURE.md)。原始研究包、旧版本、个人数据库、施工日志、录像、构建输出及原始官方地图素材保留在本地，均未进入仓库。项目代码未授予开源许可；第三方和 OSM 数据许可见 [资产来源](docs/ASSET_PROVENANCE.md) 与 [第三方声明](THIRD_PARTY_NOTICES.md)。
