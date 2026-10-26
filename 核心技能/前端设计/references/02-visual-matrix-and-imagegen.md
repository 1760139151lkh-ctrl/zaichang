# 02 · 视觉资产、动态视频生成与角色矩阵层：Gemini Omni Flash + GPT Image 协同管线与解剖物理律法

> **核心位置**：第二优先级（视觉生产力与动态防线）。彻底终结“生成一张塞一张”、“做出的界面死板静态”、“人体结构错误或缺少可信支撑”以及“角色矩阵未对齐、拼接错位”的历史顽疾。

2026-10-25制作入口补全：每次完整读取[相关人物护照](characters/README.md)、该幅衣装与[人物创作方法](character-art-direction.md)。先判断同一身份、青春、真实情感与此刻动作的来由，再核结构和空间；“无错肢”不能签美术通过。官方立绘只辨识参考→二维同景重画。头像、简笔猫等小形态独立设计，不能从背景裁头，也不以毛绒写实替代表情包式人物头＋完整横趴猫身。

覆盖必须区分页面、活动、真实姿态、主题/环境与表现形态：下面S1—S9是页面/任务类别，运行中的chat/study/reading/planning/rest/listening/play/attention/resume是活动，两者不能互相当作九种姿态。全身、独立头像、边缘小猫分别登记。镜像不是新增动作，一只猫不代签人形360格；同一端坐换道具也不增加主要空间拓扑。缺项继续实际生图，已合格可兼容复用项说明适用范围；不能用fallback、brief齐全或旧approved凑100%。

---

## 一、双引擎协同管线：网页版 Gemini 视觉/视频生成 + GPT Image

下游模型（GPT/Codex）写前端时天然倾向于做死板僵硬的静态页面，缺乏呼吸感与空间张力。为了破局，必须在设计源头打通 **Motion Designer 级分镜引导 $\rightarrow$ Gemini Omni Flash 1.1 动态视频参考 + Nano Banana 2.1/Pro 视觉参考 $\rightarrow$ GPT Image 整体生图 $\rightarrow$ GPT/Codex 前端活代码还原** 的协同管线：

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                        Gemini 动态视频与 GPT Image 双引擎协同管线流水线                                  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Motion Designer 视觉分镜语言：运用时间轴张力、机位动力学与光影时码，撰写高精度 Prompt                    │
│ 2. Gemini 网页（按当次实际入口；API能力另核）：                                                          │
│    - 无缝呼吸微循环 (Looping Video)：明确待机起态、终态与运动相位，3–5s作剪辑目标  │
│    - 首尾帧时空转场 (First/Last Frame)：以书桌与操场参考设计承接，网页未提供硬关键帧时不声称精确控制   │
│    - 运动动力学参考 (Video Reference)：以有来源的运动视频研究动作节奏，不将生成画面视为测得受力                      │
│ 3. Gemini Nano Banana 2.1 / Pro (gemini-3-pro-image)：按实际入口可用参考数量与一致性组织，不能沿用API上限冒充网页能力，锁定 MyGO/Ave 动漫辨识度与四主题光影 │
│ 4. GPT Image (imagegen)：执行四步同景整体生图，按目标画幅设计空景与同景母图，实际像素由工具输出和后续制作核对                   │
│ 5. 同画布三层原景提取：Layer 0 (空背景) + Layer 1 (角色带接触阴影 RGBA) + Layer 2 (桌角被角遮挡)               │
│ 6. 前端 Stage 容器绝对锁死：CSS 弹簧物理 + Canvas 粒子 + WebAudio 声学，提取动作重音、方向和停留，用代码实现真实状态与接管；适用环境片段可保留为视频    │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 三类动态导演需求与实际调用边界
默认使用用户已登录的Gemini网页，按当前视频Skill与实际控件制作。以下保留三类镜头创意；API插件中的Python脚本是真实的另一条路线，但不是本仓库命令或网页版操作，只有明确选用API时才读取其实际参数与授权。

1. **无缝呼吸微循环视频（用于伴读发丝微动、窗外细雨、台灯光斑脉动）**：
   ```text
   In a single continuous shot. No scene cuts. A seamless looping animation of youthful anime girl Sakiko sitting firmly on the wooden study chair by the sunlit window. Subtle chest breathing motion, soft hair strands swaying naturally in the gentle window breeze. Warm afternoon apricot light filtering through curtains. Seamless loop.
   固定合格参考、身份、支撑与机位；以实际网页控件设置画幅，下载后核规格与运动。
   ```
2. **首尾帧时空转场视频（用于书桌自习室 $\rightarrow$ 紫金港东田径场黄昏无痕过渡）**：
   ```text
   A smooth, cinematic spatial transition. [0-2s] The camera slowly pulls back from the cozy wooden study desk with amber lamp; [2-4s] The warm indoor light smoothly dissolves into the twilight evening haze of the ZJU East Stadium running track with Sakiko waiting by the track fence in her sports cardigan.
   固定合格参考、身份、支撑与机位；以实际网页控件设置画幅，下载后核规格与运动。
   ```
3. **伴跑步频与生物声学剥离（生成纯净运动力学视频）**：
   ```text
   Japanese anime high school girl running on an outdoor track in rhythmic cadence 172 SPM. Fluid arm swings, natural foot strike from midfoot to toe-off. Keep everything natural.
   固定合格参考、身份、支撑与机位；以实际网页控件设置画幅，下载后核规格与运动。
   ```

---

## 二、角色矩阵（Character Matrix）全覆盖规格与对齐法则

为了杜绝“角色矩阵未对齐、场景残缺、角色拼接错位”，必须建立严格的**全维度坐标矩阵**：
- **维度 1（角色 · 10 人）**：`sakiko`, `mutsumi`, `anon`, `tomori`, `uika`, `umiri`, `nyamu`, `rana`, `soyo`, `taki`。
- **维度 2（场景类别 · 9 大类）**：`S1_HOME`, `S2_STUDY`, `S3_PDF`, `S4_AGENDA`, `S5_NOTES`, `S6_MAP`, `S7_CAST`, `S8_THEME`, `S9_RESUME`。
- **维度 3（主题光影 · 4 套）**：`apricot`（暖杏）, `mist`（晨雾蓝）, `violet`（暮色紫）, `rain`（夜雨暖金）。
- **维度 4（核心姿态族 · 6 种）**：
  1. `pose_home_companionship`（窗边/床沿静坐，按构图展示合理身体范围、支撑与接触，不强制双脚着地）；
  2. `pose_study_co_reading`（右侧伴读位，视线朝向左侧工作台，手扶桌面）；
  3. `pose_agenda_planning`（持手账本/笔审视日程，或轻托下巴思考）；
  4. `pose_map_guiding`（窗边远眺或伴跑轻盈守候姿态）；
  5. `pose_welcome_resume`（抬头微笑迎候，接续上次停顿）；
  6. `avatar_bust_standard`（统一焦段、统一头肩比的高清同源头像）。

### 角色矩阵覆盖审计与槽位锁定表

表中点名人物用于首批打样和个性分镜，最终仍须覆盖十角色、九类页面构图与四主题的有效组合及所需动态。空间占比/焦段是候选构图起点，按真实内容与屏幕精修；兼容复用经核验可减少重复资产，不能把其余角色或必要动作改成不适用。首个样片和资源失败静态替代不能代签完整矩阵。

| 场景类别 | 核心角色槽位 | 空间占比与机位焦段 | 物理家具锚点（Furniture Anchor） | 状态与对齐规范 |
| :--- | :--- | :--- | :--- | :--- |
| `S1_HOME` | 10 角色全部覆盖 | 角色 65% / 输入 35%，35mm 等效 | 床沿坐面 / 窗台软垫 / 实木椅面 | 座面、重心、腿部与脚位相容；软硬材质分别处理 |
| `S2_STUDY` | 祥子 / 睦 / 爱音等 | 角色 28% / 题卡 72%，50mm 等效 | 右侧木椅伴读位，手扶讲义边缘 | 视线锁定左侧推导行，纸角留白 |
| `S3_PDF` | 10 角色全部覆盖 | 角色 25% / PDF 75%，50mm 等效 | 右侧桌角伴读位，视线朝左 | 随翻页微调视线，手持铜质书签 |
| `S4_AGENDA` | 海铃 / 祥子 / 爽世 | 角色 30% / 日程 70%，35mm 等效 | 桌侧手账位，手持钢笔与时间轴 | 协助权衡两种过法，留白保护 |
| `S5_NOTES` | 灯 / 睦 / 祥子 | 角色 30% / 笔记 70%，35mm 等效 | 捧创可贴手账或活页纸 | 支持书签托盘拖拽摘录 |
| `S6_MAP` | 10 角色伴跑 HUD | 桌面极细边缘微光 + 小视窗 | 操场看台 / 跑道边绿荫下 | 荧光轨迹跟随，递水与拉伸指导 |
| `S7_CAST` | 10 角色画廊 | 角色 55% / 设定 45%，50mm 等效 | 专属居室/练习室中央自然站/坐姿 | 人格卡编辑，换装不改灵魂 |
| `S8_THEME` | 祥子 / 睦 四主题 | 全幅居室预览，35mm 等效 | 窗前原木大书桌与床沿 | 晨雾蓝/暖杏/暮色紫/夜雨全场景 |
| `S9_RESUME` | 10 角色全部覆盖 | 角色 50% / 恢复卡 50%，35mm 等效 | 从翻书状态抬头微笑 | 一键续接，无亏欠感重逢 |

---

## 三、四步系统化生图铁律与解剖物理防线

必须严格遵守以下四步流水线，任何跳步或违规操作一律打回：

### 第一步：统一网格与纯净空场景打样（Clean Stage & Spatial Grid）
- 先生成或锁定**不含任何人物的纯净居室/窗边背景底图**；
- 在底图上明确标定三大物理基准面：
  1. `Bed-Edge Plane`（床沿坐面高度线与透视灭点）；
  2. `Chair-Seat Plane`（书桌椅坐面水平线与靠背倾角）；
  3. `Floor & Footrest Plane`（地面透视网格与地毯落脚区）；
- 锁定主光源方向（左侧落地窗自然光 + 桌面 2700K 琥珀台灯漫反射）。

### 第二步：单角色跨类别同景整体打样并亲验（Single-Character In-Situ Prototyping）
- 选定标杆角色（`sakiko` 或 `mutsumi`），以**纯净空背景 + 精准文字 Prompt** 在**同一张画布中一次性整体生成背景与角色**；
- **主代理亲眼审核解剖物理指标（四大一票否决项）**：
  - [ ] **坐骨承重与接触阴影**：检查臀/腿与支撑面关系和遮挡；软垫可压陷、硬椅不必形变，接触影符合实际光照。不能以固定1像素、外露坐骨或统一压痕代替整体判断。
  - [ ] **具体脚位与肢体连续**：区分膝上搭腿、踝部交叠、蜷坐、抱膝与垂腿。双脚着地、一脚或双脚离地均可合理；按已选姿态检查髋膝踝、透视与重心，不强求脚踝和足弓同时可见。
  - [ ] **腿部与躯干比例**：按人物设定、相机透视与肢体遮挡检查整体比例；透视缩短不按固定屏幕腿长比判错。全身构图避免意外截足，经过设计的半身或近景不强制露脚。
  - [ ] **光影色温一致性**：角色受光面色温与窗外日光完全一致，背光面带有木桌与室内台灯的暖黄色漫反射（Bounce Light）。
- **失败母版退出扩展**：发现肢体/交腿结构错误、无可信支撑的浮坐或比例失调，立即退出合格候选，记录失败原因并按资产分类处理，严禁继续作垫图扩散。保留必要原始来源和诊断证据；从纯净空背景重新建立正确姿态。脚自然悬垂不等于无支撑浮坐。

### 第三步：十角色 × 场景类别 × 四主题矩阵扩展（Matrix Expansion）
- 单角色打样全数通过并锁定相机视口（35mm/50mm）后，横向扩展至 MyGO!!!!! / Ave Mujica 其余角色，纵向扩展四套主题（暖杏、晨雾蓝、暮色紫、夜雨暖金）；
- 头像（Avatar）须独立设计与生图：完整读取角色护照与本幅衣装，单独设计头肩比例、眼神、背景或透明边缘及实际小尺寸可读性，并与全身场景保持身份、画风和光线的一致性。不得从房间或场景母图裁头充数，也不把场景裁剪计入独立头像矩阵覆盖。

### 第四步：同画布原景分离与 Stage 坐标绝对锁死（Same-Canvas Extraction & Stage Lock）
- **同源三层分离提取**：
  - `Layer 0 (bg_clean.webp)`：同画布纯净背景；
  - `Layer 1 (char_in_situ.webp)`：从同一合格母图分离的人物RGBA；接触影按具体支撑与动作保留或单独管理，脚没有触地就不补足底落地影。默认保母版画布；若裁切，须保存偏移和共同变换，不各层独立缩放。
  - `Layer 2 (fg_occlusion.webp)`：可选的前景桌面边缘、台灯罩或茶杯遮挡层。
- **前端 Stage 容器同矩阵锁死**：
  - CSS 中：三层全部置于同一个定比容器内：
    ```css
    .companion-stage {
      position: relative;
      width: 100%;
      height: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
    }
    .stage-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center bottom;
      pointer-events: none;
    }
    ```
  - 母版各层共享从母版到屏幕的变换；独立手、眼、道具与合法位移另有受控局部变换。缩放和拖动时亲看接触稳定，不以“恒等0像素”或同尺寸自证光学贴合。

---

## 四、Motion Designer 级标准 Prompt 模板库

生图与视频分镜必须使用以下高表现力结构化 Prompt 模板：

### 4.1 首页窗边静坐陪伴母图模板（S1_HOME · 暖杏 Apricot · 丰川祥子）
```text
[Art Style & Canon Identity]
High-end Kyoto Animation feature film aesthetic matching BanG Dream! It's MyGO!!!!! and Ave Mujica official art style. Youthful original anime character Togawa Sakiko (丰川祥子). Elegant silver-blue long hair with signature neat bangs and half-up style, clear dignified golden eyes with tender intelligence. Wearing her refined school uniform with neat ribbon tie and cozy cream knit cardigan. Crisp clean linework, soft cel-shading blended with warm natural cinematic lighting.

[Spatial Composition & Furniture Anchor — CRITICAL]
Wide 16:9 interior shot, eye-level camera at 35mm focal length. Cozy sunlit student study room with wooden flooring and a large paned window on the left. Sakiko is seated gracefully on the solid wooden study chair by the sunlit desk on the right side of the frame. Her hips and thighs rest firmly on the wooden seat cushion, creating visible natural fabric compression and subtle ambient contact shadow beneath her sit bones. Her spine is upright yet relaxed, legs gracefully slanting together, with both feet shod in dark school loafers resting stably and firmly on the warm wooden floor. Both feet and ankles are fully rendered and clearly visible, never cropped, floating, or disjointed.

[Atmosphere, Lighting & Props]
Afternoon golden-hour sunlight streams through sheer white curtains, casting soft, warm apricot shadows and dappled foliage patterns across the wooden floor and desk. On the desk sits a clean ceramic teacup with faint steam rising and a neat sheet music book. Pure warm apricot color palette (creamy walls, honey oak furniture, amber accents). Strictly NO neon green UI lighting, NO floating stickers, NO anatomical deformities, NO split-screen line dividers.
```

### 4.2 伴跑结束·操场暮色手账封印分镜模板（S6_MAP · 暮色紫 Violet · 若叶睦）
```text
[Art Style & Canon Identity]
Official BanG Dream! Ave Mujica high-end theatrical anime aesthetic. Youthful original anime character Wakaba Mutsumi (若叶睦). Hair, eyes and accessories match the approved original-character reference passport, calm and quiet expression. Wearing a navy zip-up running warm-up jacket over her school sports tee.

[Setting & Spatial Anchor]
Wide 16:9 outdoor dusk shot of Zhejiang University Zijingang East Track & Field stadium. Mutsumi stands peacefully near the red synthetic running track rail beneath a large whispering camphor tree. Sunset lavender and rose-gold dusk sky reflecting in the puddles on the track. In her hands, she holds open a traveler's leather notebook (running journal) with a small ink stamp in her slender fingers, ready to stamp a clover seal.

[Cinematic Motion Design Reference]
Camera at 50mm, gentle shallow depth of field. Soft twilight breeze sways her hair tips and jacket hem. Warm stadium twilight floodlights starting to glow in soft bokeh behind her. Peaceful, deeply caring companion atmosphere. Fully visible legs in running leggings and trainers grounded firmly on the track asphalt.
```
