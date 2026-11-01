# 精选素材与 Prompt 的公开审读

这份记录只说明实际读过的材料，不为仍在生成的新图预填公开结论。

## 四个恢复生产组合

四个恢复背景、对应精确生成 Prompt、原母图与其 Prompt/source 均已逐份读取。它们描绘的角色、房间、纸卡与纸偶属于此项目的生成场景，母图输入为已生成的纯净房间或同角色完整母图；没有复制官方人物立绘、用户照片、私人文档、真实校园定位或账户画面。若麦的文本提到视频创作，但图里没有相机录像、真实个人作品或账户身份。

背景 source 的生成位置使用 `generated_images/<conversation>/<execution>.png` 逻辑地址。原事件 ID、时间与字节 SHA 保真，不复制会话原日志。四个 source 新增的 `recoveredBackground` 均未签发 layer 或 runtime 批准。

`recovery.json` 的号码样式扫描只命中了 SHA-256 中的数字片段；逐字段核对没有真实手机号、电子邮箱或密钥。用户名、浏览器 profile 路径和完整本机日志路径不进入本份公开记录。原生成图片中没有真人身份或私人内容。

## 同轮已读的其他 Prompt

以下条目逐份阅读过正文；新生成或修改的其他版本仍应在采用前继续读。

- `2026-10-24-matrix/openui/openui-local-conflict-recovery-v1/v2/v3-prompt.txt`：波形、公式、局部恢复行与输入草稿都是设计样例，未见私人资料或凭据。v2 的数学错误按原作者的 rejected 记录保留，公开可用性仍沿主代理对 v3 的实际审查。
- `2026-10-24-matrix/settings/personality-review-apricot-v1-prompt.txt`、`personality-recovery-apricot-v1/v2-prompt.txt`：原作者确认没有读取用户 persona、SQLite 或私人记忆。“小灰灰”来自公开源码中的条件式示例，“小灰”是人为缩短的对照。它们只说明两个样例的差别，不宣称用户真实昵称或偏好。相应 source 已记录该边界，并去掉机器专有生成绝对路径。
- `2026-10-24-matrix/sakiko/sakiko-resume-apricot-v1-prompt.txt`、`sakiko-resume-apricot-background-v1-prompt.txt`、`sakiko-resume-apricot-figure-v1/v2-prompt.txt`：内容是人物完整场景与源坐标提取要求，没有个人待办、资料或账户正文。图的结构与提取是否合格由实际视检判断，此处不予预批。
- `2026-10-24-matrix/mygo/anon-study-mist-mother-v1.prompt.txt`：同一生成母图的晨雾照明扩展，仅人物与房间文字规范，无个人信息。

本轮角色头像、穿着、性格的说明属于原作辨识与项目原创陪伴情境。来源说明里公开官方人物网页地址，不等于向仓库复制官方图片；上述四个组合的实际图像输入未包含官方人物像素。

## 精选提交的边界

`publication-scope.json` 列出四恢复背景、原母图、精确 Prompt/source，以及当前输入房间与必要来源文本。PNG 需要逐路径显式加入，不能对 5262 张本地 PNG 强制整目录提交。与它们无关的草稿、失败 mask、淘汰提取、raw sessions、`.test-data`、数据库、cookies、用户 profile 与个人记忆均不在此清单。

这份隐私审读不取代主代理的最终选图、许可范围核对或实际远端回执。它也不把“已在工作目录找到”改写成“已同步 GitHub”。
