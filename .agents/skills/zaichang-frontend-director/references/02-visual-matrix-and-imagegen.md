# 02 · 视觉资产与生图管线层：先比对、先分类、四步同景生成与多维矩阵

> **核心位置**：第二优先级（视觉生产力与审美防线）。彻底终结“生成一张塞一张”、“把人物做成悬空贴纸”以及“死调丑图”的历史顽疾。

---

## 一、生图前的铁律：先比对 20+ 张黄金标杆，再动手创作

任何生图或界面重构任务启动前，**主代理必须亲自打开并比对仓库内的黄金标杆图像**，将以下审美基因固化为不可妥协的视觉标准：

1. **为什么黄金标杆（`U01–U31`、`R146–R166`）好看？**
   - **空间整体感**：人物不是后贴上去的剪纸，而是真实坐在洒满阳光或台灯暖光的房间床沿、窗台、书桌旁；人物受光面、背光面、衣褶阴影与房间光源完全一致。
   - **材质通透感**：UI 卡片采用温暖的奶油磨砂半透明玻璃质感（Warm Frosted Glass），边缘有极细腻的高光描边（1px 半透明暖白），既能看清卡片文字，又能隐约透出背后的居室木纹与光影。
   - **角色青春感**：严格保持日系高品质青春动画剧场版的美术水准（清澈眼眸、细腻发丝、自然柔和的赛璐珞结合柔光渲染），绝不掺杂欧美写实风、油腻厚涂或成熟违和的面部比例。

2. **为什么之前的劣质图会被打回？（三大绝对禁区）**
   - ❌ **禁区一：先画人再往背景里硬塞（Cut-and-Paste Floating）** —— 导致透视灭点不一致、光影割裂、人物像悬在半空的贴纸。
   - ❌ **禁区二：下肢与支撑结构崩坏（Broken Support & Missing Feet）** —— 人物看似坐着但屁股下面没有椅面/床沿，或者小腿截断、没有脚部、双脚悬空乱翘。
   - ❌ **禁区三：在残次图上反复微调（Debugging Ugly Outputs）** —— 一旦生成出风格走样、比例失调或成熟违和的图，必须**立即作废丢弃**，绝不允许拿它当 `input_image` 继续局部重绘或写 CSS 强行拉扯。

---

## 二、四步系统化同景生图管线（The 4-Step In-Situ Image Pipeline）

### 第一步：先清点类别，锁定纯净空场景底图（Clean Room Baseline）
在生成任何角色之前，先按 `S1–S9` 九大场景类别，准备好**不含任何人物的纯净居室/校园空间底图**：
- 明确标注**三大物理支撑面（Physical Support Planes）**：
  1. `Bed-Edge Plane`（床沿坐面高度与透视角度）
  2. `Chair-Seat Plane`（书桌椅/窗边软椅坐面与靠背倾角）
  3. `Floor & Footrest Plane`（地面透视网格与脚踏落点）
- 锁死主光源位置（左侧或右后侧大窗自然光 + 桌面暖色台灯点光源）。

### 第二步：单角色跨类别同景整体打样（Single-Character In-Situ Prototyping）
以 **丰川祥子 (`sakiko`)** 或 **若叶睦 (`mutsumi`)** 为探路标杆，使用**纯净空背景底图 + 精准结构化文字 Prompt**，在**同一张画布里将背景与角色一次性整体生成**：
- **姿态与物理支撑强制校验清单（主代理亲看）**：
  - [ ] **坐骨锚点**：臀部与大腿后侧是否真实压在床沿软垫或椅面上，并产生自然的布料凹陷与接触阴影（Contact Shadow）？
  - [ ] **下肢与足部完整性**：膝盖弯曲角度是否符合人体工学？小腿长度是否正常？**双脚是否完整绘出并稳稳踩在地面/脚踏/地毯上（或有明确支撑的床沿自然垂落）**？
  - [ ] **视线与重心**：在 `S1 首页` 视线柔和注视镜头；在 `S2–S5 工作台` 角色位于画面右侧 1/3 处，身体与视线自然朝向左侧内容区。
  - [ ] **画风与年龄感**：是否 100% 契合 MyGO!!!!! / Ave Mujica 原作青春少女神韵？

### 第三步：十角色 × 九场景 × 四时主题矩阵扩展（Multi-Dimensional Matrix）
单角色打样全数通过后，按固定槽位与统一焦段扩展为完整覆盖矩阵：
- **维度 A（角色轴 · 10 人）**：`sakiko`, `mutsumi`, `anon`, `tomori`, `uika`, `umiri`, `nyamu`, `rana`, `soyo`, `taki`。
- **维度 B（场景动作轴 · 核心姿态族）**：
  1. `pose_home_companionship`（窗边/床沿日常静坐陪伴，全身含完整脚部）
  2. `pose_study_co_reading`（右侧书桌/椅畔伴读倾听，视线朝左，全身/七分身含稳固坐姿）
  3. `pose_agenda_planning`（持手账/茶杯审视日程或轻托下巴思考）
  4. `pose_map_guiding`（窗边远眺或伴游指路姿态）
  5. `pose_welcome_resume`（从读书/抱琴状态抬头微笑迎候）
  6. `avatar_bust_standard`（同源提取或同焦段生成的统一规格高清头像矩阵）
- **维度 C（主题光影轴 · 4 主题）**：
  - `apricot`（午后暖杏阳光）、`mist`（清晨雾蓝微光）、`violet`（傍晚暮色紫霞）、`rain`（夜雨窗外植物与室内琥珀暖金灯光）。

### 第四步：同画布原景分离与前端 Stage 同坐标锁死（Same-Canvas Extraction & Stage Lock）
为什么之前的背景和人物分离后，拖动窗口时人依然稳稳坐在床上？**因为人是从那张包含床的原图里同画布分离出来的！**
1. **同源三层提取**：
   - `Layer 0 (bg_clean.webp)`：同画布纯净房间背景。
   - `Layer 1 (char_in_situ.webp)`：从同一张生成图中精确抠出的角色层，**必须保留脚底、臀部与家具接触处的环境闭塞阴影（Ambient Occlusion / Contact Shadow）**，且画布尺寸（如 `1920×1080` 或标准比例）与背景层 **100% 等大，绝不裁边缩图**！
   - `Layer 2 (fg_occlusion.webp)`：可选的桌面边缘、茶杯或前景光晕层。
2. **前端 `Stage` 容器同矩阵绑定**：
   - 在 CSS/DOM 中，`Layer 0`、`Layer 1`、`Layer 2` 必须放在同一个定比 `Stage` 容器内，全部使用 `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center bottom;`。
   - 当角色执行水平或沿家具切线拖动时，只对同一个家具支撑平面轨迹做受控偏移（沿床沿切线向量 $(\Delta x, k \cdot \Delta x)$ 移动），绝不允许脱离支撑平面向上漂浮。

---

## 三、标准 GPT Image (`imagegen`) 结构化 Prompt 模板

调用生图工具时，必须将以下结构化要素写入 Prompt（严禁只写模糊的一句话）：

```text
[Art Style & Canon Identity]
High-end anime feature film aesthetic matching BanG Dream! It's MyGO!!!!! and Ave Mujica official art style. Youthful high school band girl [Character Name & Canon Appearance: hair color, hairstyle, eye color, signature school uniform or cozy cardigan]. Crisp linework, soft cel-shading blended with warm atmospheric lighting, expressive gentle eyes, genuine personality.

[Spatial Composition & Camera]
Wide 16:9 interior shot, eye-level camera at 35mm focal length. Cozy sunlit student study room by a large window. [For S1 Home: Character positioned slightly right of center; For S2-S5 Workbench: Character positioned in the right third of the frame, leaving the left two-thirds spacious and calm for study workspace].

[Physical Grounding & Full-Body Posture — CRITICAL]
Full-body seated posture with complete, anatomically accurate lower body and both feet clearly visible. She is sitting naturally and firmly on the [wooden chair / soft bed edge / window bench] with clear weight distribution, subtle fabric compression on the cushion beneath her sit bones, and natural contact shadow. Both feet rest stably on the [warm wooden floor / woven rug / footrest], never floating or cropped at the ankles.

[Atmosphere & Palette]
[Apricot: Warm afternoon golden-hour sunlight, creamy apricot walls, natural wood grain, soft warm shadows / Mist: Clear morning sky blue-grey light, airy and calm / Violet: Sunset lavender and rose-gold glow / Rain: Deep evening blue window with natural green foliage outside in gentle rain, warm amber desk lamp illuminating the interior]. Strictly no harsh neon green lighting or split-screen dividers.
```

---

## 四、资产登记与质量审计台账规范

每生成或选定一张图像，必须在 `前端视觉创新设计` 的对应清单中建立确定性索引：
- **SHA-256 指纹** + **真实画布分辨率** + **所属角色 ID** + **所属场景类别 (`S1–S9`)** + **所属主题 (`apricot/mist/violet/rain`)** + **主代理亲看验收结论（A级标杆 / B级微调 / D级作废）**。
- 凡被评为 D 级的历史废图（悬空、缺脚、成熟违和、绿屏），从活跃引用中彻底清除。
