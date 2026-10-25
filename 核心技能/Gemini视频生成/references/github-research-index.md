# GitHub 研究索引与迁移范围

研究日期：2026-10-24。按循环、网页素材、人物接触、产品镜头、分镜时序、后期、提示案例、质量八个方向检索。优先原作者仓库、上游实现和官方说明，不将 awesome 列表、星数或宣传样片当作效果保证。主代理核读了下列被纳入技巧的关键原文／实现；未安装或运行这些模型，未用用户 Gemini 配额实测这些模板。

## 能力依据与创作经验分层

- **当前网页能力**：由 Google Gemini Apps 帮助与现场真实控件确认。上传参考、模板、画幅和编辑的可用范围仍受账号／地区与当前产品变化影响。
- **可迁移创作方法**：锁定主次运动、身份锚点、周期设计、裁切留白和局部编辑，供 Gemini 提示与成片诊断使用。
- **专用算法／工程实现**：latent shift、相机轨迹条件、骨骼约束、帧索引引导和配准，只能在实现它们的工具里使用。不能改写为“Gemini 网页已支持”或暗中安装依赖。
- **作者经验**：项目样片、阈值和提示格式仅对其上下文成立。保留方法并解释边界，不照抄专属标签、seed、LoRA、节点或词数上限。

## 纳入的 GitHub 原始来源

| 原始来源 | 核读内容与可用结论 | 迁移边界 |
| --- | --- | --- |
| [google-gemini/gemini-skills：视频脚本](https://github.com/google-gemini/gemini-skills/blob/main/skills/gemini-omni-flash-api/scripts/video/generate_video.py) | API 输入构造、首／末帧角色及相同资产复用的示例。 | API 脚本不是 Gemini 网页控件合同；端点参考不等于速度和内容完全闭合。 |
| [WeChatCV/Loopy](https://github.com/WeChatCV/Loopy) | 原作者 README、周期生成方法和推理配置。 | 位置编码移位与适配权重属于该系统；不当作提示咒语或网页透明视频能力。 |
| [YisuiTT/Mobius](https://github.com/YisuiTT/Mobius) | 原作者 latent-shift 方案与配置。 | 专用循环算法说明闭环有模型机制支持；不能保证通用生成器只凭一句话同样实现。 |
| [MiniMax H3 Loop 提示指南](https://github.com/pxl-pshr/ComfyUI-MiniMaxH3-Loop/blob/main/PROMPTING.md) | 持续状态、周期主体、固定机位与随机纹理风险；区分作者测试／未测试示例。 | 实践者经验，运行于专用 Loop 节点。其音频标签、图片占位符、帧长和禁止时序的约定不套用 Gemini。 |
| [comfyui-seamless-loop](https://github.com/amagicai/comfyui-seamless-loop) | ORB/RANSAC、全局 affine／similarity 配准、插值变换和端点处理。 | 可改善取景漂移，不能修复局部形变、视差或复杂接触；未经本机处理验证。 |
| [scroll-frame-sequence](https://github.com/tangyistudio/scroll-frame-sequence) | 滚动进度控制、停留循环、首尾采样与移动端资源权衡。 | 作者测量不是普适阈值；帧序列不总比视频省内存或带宽。 |
| [ImageKit 背景视频示例](https://github.com/imagekit-samples/nextjs-video-background/blob/main/app/imagekit/page.tsx) | poster、reduced-motion 静图、独立标题层及裁切。 | 借鉴交付关系，不默认要求此框架／服务，也不据示例证明真实加载性能。 |
| [Godot 动画树文档](https://github.com/godotengine/godot-docs/blob/master/tutorials/animation/animation_tree.rst) | Root motion 及骨骼运动与地面步态匹配。 | 用于理解根位移／脚滑；网页没有因此获得骨骼参数。 |
| [Unity Animation Jobs Samples](https://github.com/Unity-Technologies/animation-jobs-samples) | LookAt、TwoBoneIK、FullBodyIK 与分部混合示例。 | 用于接触、注视和局部动作的规划／检查，不声称 Gemini 执行 IK。 |
| [CameraCtrl](https://github.com/hehao13/CameraCtrl) | 相机轨迹文件、每帧机位条件和示例。 | 真实轨迹输入与文字“绕拍 30 度”不同；不迁移它的 seed／配置。 |
| [WebRotate Blender Turntable](https://github.com/webrotate360/turntable-animator-for-blender) | 旋转物体、固定相机与棚光的产品转台结构。 | 真实 3D 资产可提供确定几何；Gemini 单图不能确定未知背面。 |
| [Scene Machine walkthrough](https://github.com/google-marketing-solutions/scene-machine/blob/main/docs/walkthrough.md) | 分镜、分镜候选、裁切、时间线、叠加层与成片步骤。 | Google 组织内开源项目，自述非正式支持产品；使用的模型与配置不等于网页开放项。 |
| [LTX conditioning](https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/docs/conditioning.md) | 图像 guide／replace 与真实帧索引条件。 | 具体关键帧机制依赖它的管线和权重；Gemini 上传多图不等同于此接口。 |
| [VBench](https://github.com/Vchitect/VBench) | 一致性、闪烁、运动平滑和运动量等分维度评价。 | 借鉴检查维度，不安装基准、不编分数，不以静止高一致性代替完成动作。 |
| [MoviePy TimeMirror](https://github.com/Zulko/moviepy/blob/master/moviepy/video/fx/TimeMirror.py) | 时间反转同时作用于画面、音频和 mask。 | 正反拼接需处理重复端点；倒放不保证物理自然。 |
| [FFmpeg 上游滤镜文档](https://github.com/FFmpeg/FFmpeg/blob/master/doc/filters.texi) | trim、reverse、xfade、acrossfade、tpad、minterpolate。 | 区分修剪、淡化、冻结、混合和光流；版本和输入条件须按本机核对。 |

## 网页能力和交付规范的官方补充

- [Gemini Apps 视频帮助](https://support.google.com/gemini/answer/16126339?hl=en)：当前入口、参考素材、编辑与账号条件；作为网页能力依据。
- [Gemini Omni API 与提示指南](https://ai.google.dev/gemini-api/docs/omni)：提示连续镜头、简短聚焦编辑、普通描述中写排除项；API 字段另行区分。
- [Google DeepMind Veo 提示指南](https://deepmind.google/models/veo/prompt-guide/)：镜头、场景、动作、光线与声音的创作语言；旧模型教程的规格不直接迁移。
- [Gemini API 视频模型迁移说明](https://ai.google.dev/gemini-api/docs/video)：模型状态和入口会变；旧 Veo 预览 ID 不作为当前网页模型证明。
- [MDN video](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video)、[自动播放](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)：poster、loop、内联与播放策略。循环属性不改写视频内容。
- [Adobe 导出设置](https://helpx.adobe.com/premiere/desktop/render-and-export/export-files/basic-video-settings.html)：帧采样、混合与光流的不同用途；实际伪影仍须审片。

## 维护与验证边界

在用户账号只核对过登录、视频入口与横竖画幅，尚未跑通 Gemini 成片。此次研究没有生成视频、上传素材、消耗配额、安装 GitHub 项目或验证它们的性能。模板为原创组合；“零瑕疵”“精确闭环”必须经实际输出和回接播放验收，不能作为已知能力写入状态。

链接中的 main／master 会变化。遇到参数或功能变更，重新读官方入口与原始实现，窄幅更新相关参考；不因作者改了 README 就改用户账号已验证记录。
