# 陪伴设置：保留清楚的默认关系

本轮文件边界为`src/renderer/CompanionSettings.tsx`与`companion-settings.css`。`appearance.ts`、`companion.tsx`、人物映射、场景与外层Settings均由原owner维护，本线只读。不生成新人像或人物分层，不把运行截图、原始导出或审核板送入Image。

## 对应Image与实际采用范围

- [B2日间](../2026-10-24-matrix/settings/appearance-redesign-b2-day-v1.png)，SHA-256 `bde815dd4fb0d6ba09096527a3689d55740aae058561d81a8a608e61c48abf0f`。
- [B2夜间](../2026-10-24-matrix/settings/appearance-redesign-b2-night-v1.png)，SHA-256 `1bae4c58e9dae55b5b1e589755e108c8004f3cdff3395b1f51a21d884ace5982`。

已亲看两图及同名source记录。主代理原准入仅含默认两行“伙伴/光线”、每行一个展开入口、角色与自动/四手选光场按需显现、完整同房间预览。图内旧房间、人物、示例台词及天气不成为当前运行素材或实际事实。

旧[角色与主题预览](../assets-design-generated/2026-10-23-character-settings/角色与主题预览-方案.png)仅提供十角色与同屋预览、试看后明确采用/取消的关系；不恢复它的大标题说明、固定台词、常驻主题卡或旧头像。

当前十角色均沿独立v3原PNG与已核圆头像参数，祥子保原选定soft-youth-v3。用途边界见[原主审](../2026-10-25-literary-room/portrait-youth-v3-review/root-purpose-admission.md)：圆头像不等于任意立绘或房间准入。

## 当前真实观察

本线与主代理均亲看本地`companion-settings-before.png`：默认两行的标签、头像/当前值与单入口清楚，头像与顶栏同源，完整文学房间预览连贯，没有灰色控件墙、重复采用或常驻色板。该关系保留，外层白页不凭空重构。实际截图留在`.test-data/source-recovery-20261025/current-ui`，不作为Image输入或公开资产。

切到灯后的`companion-tomori-preview-empty.png`曾表现为空房。本线最初只凭图片猜为缺图降级；实际DOM证明该推断错误，已撤回。主代理核到合法registered `tomori-chat-apricot-literary-v1`，purpose=activity、resume请求沿原chat回退、四图完整1536、scene表示正确。因此不增加“暂缺画面”文案或禁用身份来掩盖错误，也不恢复撤回素材。

只读源码核到具体切换原因：祥子`sakiko-resume-apricot-recognition-v2`与灯上述chat场景共用`literary-room-clear-day-v1.png`；背景img无场景key，加载后标记绑整个imageKey，src相同的切换不重发load，让新人物被旧openedBackground标记挡住。场景线已补background key并build，主代理以同一切换trigger复核旧健康灯chat完整出现。本线随后亲看`companion-tomori-preview-ready-fixed.png`：灯、书、坐面与完整房间确实可见，和empty前图的同一设置结构一致。本线没有改Settings/fallback，也没有用文案或新人物替代加载修复。

主代理与本线随后均亲看`companion-character-picker.png`：十张独立青春头像按2×5排列，名字、当前勾选、自定义图片、只留一束光与折叠的更多选择清楚，头像没有被当成新房间分层。采用/取消留在左侧选择关系内，右侧整房预览不漂移，无须把默认态扩成角色墙。本线同时亲看`companion-mutsumi-preview.png`，身份头像与睦的完整房间预览一致。此处不代签尚未展开的更多控制或四光场操作。

伙伴与光线展开、四光场试看/取消/采用、窄窗和其它不同状态继续按真实画面审查，不由默认态代签。没有新增测试、runner或清理删除。
