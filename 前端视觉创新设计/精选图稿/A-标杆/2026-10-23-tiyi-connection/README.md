# 浙大体艺连接卡

2026-10-23，Stage02。内置 GPT Image 局部设计稿，实施前亲看当前 SettingsPanel 连接/校园资料结构，以及 R130 的有效连接布局、R096 的功能基因；新稿无人物，不使用旧稿人物作输入。

- 原稿：[tiyi-connection.png](tiyi-connection.png)，1586×992。
- SHA-256：`640ee80a1b0a886b708693550d2b8202582562d96016fccb7bed010868f47269`。
- 局部 A 采用范围：体艺标题、默认直连检查、逐项反馈、备用 WebVPN 连接与停止操作的留白和主次关系。生成图左侧导航、页面整体结构与示例检查成功结果均不直接采用；不据设计图判断真实登录或个人记录读取。
- 场景：校园资料连接设置；暖杏基准，运行控件复用现有主题；无角色资产。
- 实现：[TiyiConnection.tsx](../../../../src/renderer/TiyiConnection.tsx)、[tiyi-connection.css](../../../../src/renderer/tiyi-connection.css)。真实文字、状态和按钮独立渲染，不将原稿作为界面贴图。
- 本成员及主代理已亲看并批准上述局部采用范围；当前运行验收另行记录。未把账号、凭据、校园记录或个人定位作为生图输入。

## 本次工具 Prompt（原文）

```text
Use case: ui-mockup. Asset type: a localized, implementable settings section for the existing Chinese desktop companion app 在场. Create a refined warm ivory connection settings page fragment, no characters, no decorative illustrations, no charts. This is a small addition to an existing page, not a redesign. An understated page label '校园资料' above a narrow 720px content column. Main section titled '浙大体艺' with one clear warm ochre primary button aligned to the right labelled '检查体艺连接'. A quiet one-line connection result below reads '体艺登录可用。记录会按你的问题再读取。' This is authentication availability only, not proof that all records were read. Below a fine warm-grey separator, show an open progressive disclosure titled '其他连接方式'. Inside, a secondary outlined button labelled '通过学校 WebVPN 连接', and a small sentence '在独立校方窗口完成登录后，再回来检查。' A final low-emphasis text action reads '停止体艺连接'. No account names, IDs, passwords, secret/key fields, internal component labels, technical dashboards, or record counts. Keep typography large enough to read, spacing calm and compact, restrained warm gold accent, gentle ink brown text, thin separators instead of nested card walls. Chinese labels exactly as specified. The UI must look like natural live React settings controls. Render the page fragment on an ivory paper surface with a very faint existing-app background, clean straight-on view, high fidelity, 16:10 landscape. Do not add notifications, permission toggles, network settings, VPN switches, school-upload buttons, success badges, green UI, or a character portrait.
```

未传入参考图片。R130 仅借鉴合格的连接区域关系，R096 仅回收失败恢复、独立账号来源和按需展开的功能，不采用其中的人物或大块开关面板。
