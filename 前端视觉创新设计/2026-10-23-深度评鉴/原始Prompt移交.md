# GPT Image 原始 Prompt 移交：可追溯全文、风险分析与新重绘处方

本档分为三层：本次核查结论、明确标为新建议的重绘处方、从仓库逐字收录的原始记录。新建议绝不冒充历史工具调用。原记录中的“reviewed/approved”等字段是旧记录本身的陈述，不能代替这一轮图像复核。

## 可核查范围与缺失

- 本次完整读过 `前端视觉创新设计/图片来源对话.md` 第 1–744 行；第一行是用户最初要求。
- 找到 2026-10-18 背景、成人原创立绘与补图提示词，以及 2026-10-23 四角色母图、动作扩展、主题和蒙版原始提示词。后文保留全文与原路径。
- 最初 22 张（用户常称“最初20张”）界面稿的每次工具调用完整 Prompt，未在当前可见记录中找到；不能声称做过逐词的完整正反比较。第一行用户 brief 与后续对话可用于比较设计意图。
- `root-image-prompts.json` 有 `prompt:null` 的背景板条目。空值就是缺失，不能依据图像补造“原始 Prompt”。
- 新增 2026-10-23 记录对输出使用 `exec-*.png`、projectPath 及 SHA-256 关联；请将评鉴档案里的最终图像哈希与这里输出哈希对应，不能仅凭显示名认图。

## 发现的具体问题与可解释边界

| 原记录用语或策略 | 可据此确认什么 | 对下一轮的改法 |
|---|---|---|
| 2026-10-18 澪的 `Preserve the original adult anime woman's identity` | 这不是只写了青春原作人物而模型偶然画老；Prompt 明确要求保留成人原创形象。 | 不再用该成人脸作身份参考；以原作角色身份与合格青春脸样张为准。 |
| `upper body and lap visible`、`No chair`、独立抠出人物后再放在房间 | 提示词没有建立完整双腿、座面和地面的联合约束；它适合头像/上半身，不能直接证明坐在任意家具上成立。 | 先在空房中生成有完整支撑关系的整幅人物场景，验证后同画布分离；不把半身素材硬拉成全身。 |
| 最新母图只规定 `both legs and feet FULLY VISIBLE` | 可见不等于结构正确；它未逐段定义髋、膝、踝与承重/悬空关系。 | 用文字明确哪条腿承重、哪条腿搭在膝上、哪只鞋离地；看过完整下肢才过关。 |
| 读书/夜景/换人时 `Keep ... leg angles ... both complete shoes at exactly the master positions` | 生成策略明确冻结原母图下肢；若母图错误，就有把错误传播到所有动作/角色的风险。单凭这些词不能证明每张图都错。 | 错误姿态母图禁作后续输入；先以空背景重建一个结构通过的母图，再扩展。 |
| 扩展休息姿态 `both feet naturally on the original floor`、Tomori 夜景 `both legs and complete shoes grounded` | 这与标准无外部支撑的交腿姿势可能冲突；不能把“无悬空贴纸”错误等同“两只鞋必须同时着地”。 | 接触是髋部与座面、承重脚与地面；搭腿那只鞋可以且应自然悬空。 |
| `Change ONLY action/expression` 且维持同一腿位 | 能维持一致构图，却把动作矩阵限制为手、头、道具变化。 | 至少建立侧坐共读、床沿坐、抱膝倾听、桌边探头等不同合法空间母姿态，每个母姿态独立通过透视检查。 |
| 记录说 alpha=253/254、外部低透明晕边 | 当前已有蒙版质量限制记录，不能把RGBA或同尺寸等同于精准抠图。 | 主代理在深浅两背景检查轮廓、地板残块与鞋边；不能用阈值掩掉肢体错误。 |

上述属于对真实 Prompt 的工程风险分析；“哪些词必然导致某个脸/某条腿错误”没有受控实验，不能说成已证明因果。

## 操作禁令与技术事实须分开

**操作禁令（本项目硬约束）：绝对禁止把“翘二郎腿却双脚着地”、腿长异常、骨架错误或任何带有角色动作/结构错误的图像直接传给 GPT Image 垫图修改。必须使用不含错误人物的纯净空背景底图，以精准纯文字重新描绘坐姿和空间关系，再在验收合格的整幅场景上做原景分离。错误人物母图不能作为身份、姿态、光影或动作模板被下一次调用暗中带入。**

技术核对：不能把“GPT Image 底层全部是扩散模型、只能局部像素合理化、根本不具备全局人体纠错能力”当作已证实架构。OpenAI 公开的 2025-03-25 原生4o图像系统卡明确区分：DALL·E 为 diffusion，4o图像为 autoregressive。当前内置工具未向本任务公布实际模型标识与架构，不能从工具名外推。官方图像文档也承认跨图角色一致性及精确构图等限制。用户已实测错误图反复锁构图的项目经验足以支持上面的强制工作流，无须给它编造底层理论。

可复核官方来源：

- [OpenAI 4o native image system card, 2025-03-25](https://cdn.openai.com/11998be9-5319-4302-bfbf-1167e093f1fb/Native_Image_Generation_System_Card.pdf)，§2.1。
- [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation)，limitations。
- [OpenAI image prompting guide](https://developers.openai.com/api/docs/guides/image-prompting)，指定对象、构图、保留与改变的约束并实际检查。

## 新拟重绘 Prompt：不是旧调用

以下仅为下一轮可用新处方，须结合最终通过的空房底图与角色身份重新填写；以下新拟处方不代表此前调用；本轮后续实际生成见《本轮重绘原始Prompt.json》和《执行结果.md》。

### 1. 空房建筑与家具母版

```text
Use the supplied CLEAN EMPTY ROOM as the sole spatial reference. There is no person in the input. Create one coherent warm ivory window-side room, one fixed camera and one lighting time. Complete the left jamb, right jamb, sill and top lintel of the window in one consistent architectural perspective. An upholstered bench runs parallel to the window wall, its seat plane and wooden support clearly readable. A small warm wooden desk sits left of the bench in the room's usable zone, never inside the live-text safe zone. Sparse natural foliage stays behind its right-hand furniture edge. Reserve the left text-safe area with quiet warm light, without reducing the whole left room to lifeless void. Render no interface or letters. No day/night split. Keep full canvas and camera specified by the shared layout grid.
```

### 2. 以空背景纯文字重建标准交腿坐姿

```text
Input is only the approved clean empty room. Add Sakiko Togawa (豊川祥子), recognizable youthful original 2D anime character from BanG Dream! Ave Mujica, with her canonical pale-blue hair, dark low ribbons, amber eyes and modest school clothing. Do not use any defective character image as an input.
Place her pelvis naturally ON the right bench seat with visible cushion compression and a contact shadow. The torso, pelvis and seat share the same perspective. Her anatomical LEFT thigh extends from the left hip to the left knee; the left shin descends naturally to the floor; the left shoe is the only weight-bearing shoe on the wooden floor. Her anatomical RIGHT thigh crosses over the left thigh at knee height. The right shin descends from that raised right knee at a natural angle; its right ankle and complete right shoe remain visibly ABOVE the floor, with clear empty air below the sole. No second shoe touches the floor; no stretched shin, no hidden extra limb. The two femurs and two shins have plausible matched anatomical lengths after perspective. Make the knee overlap and each lower leg's continuity legible. Viewer's left/right must not substitute for the character's anatomical left/right.
Show head, both hands, pelvis, both knees, ankles and complete shoes inside frame. Natural relaxed attention, youthful compact face and crisp hand-drawn anime linework; no adult photorealistic face or exaggerated body. One coherent room and lighting, no sticker edges. Keep the fixed canvas, seat contact anchor and live text-safe boundary. No UI or text.
```

此处明确选择“右腿搭左腿”；如另选反向，就将整段左右全部互换，不能只改一句“让脚离地”。读书/抱膝/侧坐分别写新的支撑关系，不沿用交腿脚位。

### 3. 验收通过后原景分离

```text
Use the anatomically approved complete room scene as the edit target. Extract only the character and objects actually held by her into true RGBA, preserving the entire original canvas, exact pixel position, silhouette and scale. This is extraction only, not a pose repair. Do not add or remove limbs, alter face or relocate feet. Preserve transparent gaps between limbs and furniture. Remove the room pixels and floor patches. Keep the separate clean room plate registered to the same full canvas.
```

## 原始记录全文（按原文件保留）

以下内容为核查时仓库文件原文，包含历史输入/输出路径、哈希和旧评审字段，便于新代理回溯。历史路径在资产归宗后可能变化，应以图片 SHA-256 匹配新的评鉴 ID。

核查工作树起点 HEAD：`2155a0e861e4bc49126fab82382f82da0c0633bd`。原始来源文件共 36 份。

### O01 · `docs/implementation/2026-10-23-unified/additional-poses-anon.json`

来源文件 SHA-256：`f4dee4cbab4ab58bf56a13bccb381d47b1d9186381b1cf1d590997e98c5c425f`。以下为文件全文。

```json
{
  "date": "2026-10-23",
  "tool": "image_gen__imagegen",
  "mode": "built-in EDIT",
  "pathEncoding": "Repository paths are relative; generatedPath preserves only the original generated source basename. Exact prompt strings are those actually sent to Image.",
  "canvas": [
    1536,
    1024
  ],
  "records": [
    {
      "id": "anon-planning-mother",
      "prompt": "Use case: identity-preserve. EDIT INPUT IMAGE 1, the approved full-frame scene and exact pose. INPUT IMAGE 2 is ONLY the Chihaya Anon character-identity reference. Replace Sakiko in IMAGE 1 with Chihaya Anon from BanG Dream! It's MyGO!!!!! while preserving the original complete 1536x1024 canvas, fixed camera, room, window frame, cushion front edge, seat, bookshelf, plants, floor, perspective and lighting. Keep the exact torso location, seated pelvis contact, leg angles and both complete shoes at the pixel positions in IMAGE 1. No crop, no zoom, no recentering, no camera or room movement. Anon identity comes from IMAGE 2: very long soft pink hair, large gray-blue eyes, youthful lively delicate anime face, gray school blazer with white piping and gold buttons, white shirt, green striped necktie, gray plaid skirt, dark knee socks, brown loafers. Do not retain Sakiko's blue hair/navy cardigan. Preserve youthful anime age and light airy original painting, never a mature realistic woman. Keep the large quiet left wall/floor negative space exactly clear, no new plants, furniture, UI or lettering. Complete feet naturally contact the floor; seated body naturally contacts the cushion. No stickers, cutout outlines, halo, floating, extra characters, collage, borders, logos or watermarks. Output a complete coherent mother scene, same original 1536x1024 framing. Planning action from IMAGE 1: she holds an OPEN notebook over her lap with one hand, the other hand uses a pencil/index finger to point gently at a place on the open page as if thinking through an arrangement together. A thoughtful interested slight smile, not generic waving. Preserve notebook/pencil anatomy and perspective. Notebook pages have subtle blank lines only, no readable text.",
      "transparent_background": false,
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
          "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39"
        },
        {
          "path": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
          "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/anon-planning-mother.png",
        "generatedPath": "exec-19027179-800e-4ead-b2e1-e31728088cce.png",
        "sha256": "40869ee240a3c3a64f716d71cb282c08056630349707a64584fc37028449b006",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGB",
        "bytes": 1918799
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      },
      "disposition": "selected"
    },
    {
      "id": "anon-rest-mother",
      "prompt": "Use case: identity-preserve. EDIT INPUT IMAGE 1, the approved full-frame scene and exact pose. INPUT IMAGE 2 is ONLY the Chihaya Anon character-identity reference. Replace Sakiko in IMAGE 1 with Chihaya Anon from BanG Dream! It's MyGO!!!!! while preserving the original complete 1536x1024 canvas, fixed camera, room, window frame, cushion front edge, seat, bookshelf, plants, floor, perspective and lighting. Keep the exact torso location, seated pelvis contact, leg angles and both complete shoes at the pixel positions in IMAGE 1. No crop, no zoom, no recentering, no camera or room movement. Anon identity comes from IMAGE 2: very long soft pink hair, large gray-blue eyes, youthful lively delicate anime face, gray school blazer with white piping and gold buttons, white shirt, green striped necktie, gray plaid skirt, dark knee socks, brown loafers. Do not retain Sakiko's blue hair/navy cardigan. Preserve youthful anime age and light airy original painting, never a mature realistic woman. Keep the large quiet left wall/floor negative space exactly clear, no new plants, furniture, UI or lettering. Complete feet naturally contact the floor; seated body naturally contacts the cushion. No stickers, cutout outlines, halo, floating, extra characters, collage, borders, logos or watermarks. Output a complete coherent mother scene, same original 1536x1024 framing. Rest action from IMAGE 1: she turns her head naturally toward the window and looks outside, quietly taking a breather. Her hands rest gently over a CLOSED book on her lap. Preserve that resting pose and all lower-body positions from IMAGE 1; soft calm youthful profile, no eyes staring at viewer, no new gestures.",
      "transparent_background": false,
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
          "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0"
        },
        {
          "path": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
          "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/anon-rest-mother.png",
        "generatedPath": "exec-1e0fc67f-1fd4-45cf-aa70-ae2c3280e9ce.png",
        "sha256": "0efb7ba53e3da497ee27750b026a10a162a3b9dbb65bd36e891d8a0d1b53dca2",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGB",
        "bytes": 1888290
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      },
      "disposition": "selected"
    },
    {
      "id": "anon-play-mother",
      "prompt": "Use case: identity-preserve. EDIT INPUT IMAGE 1, the approved full-frame scene and exact pose. INPUT IMAGE 2 is ONLY the Chihaya Anon character-identity reference. Replace Sakiko in IMAGE 1 with Chihaya Anon from BanG Dream! It's MyGO!!!!! while preserving the original complete 1536x1024 canvas, fixed camera, room, window frame, cushion front edge, seat, bookshelf, plants, floor, perspective and lighting. Keep the exact torso location, seated pelvis contact, leg angles and both complete shoes at the pixel positions in IMAGE 1. No crop, no zoom, no recentering, no camera or room movement. Anon identity comes from IMAGE 2: very long soft pink hair, large gray-blue eyes, youthful lively delicate anime face, gray school blazer with white piping and gold buttons, white shirt, green striped necktie, gray plaid skirt, dark knee socks, brown loafers. Do not retain Sakiko's blue hair/navy cardigan. Preserve youthful anime age and light airy original painting, never a mature realistic woman. Keep the large quiet left wall/floor negative space exactly clear, no new plants, furniture, UI or lettering. Complete feet naturally contact the floor; seated body naturally contacts the cushion. No stickers, cutout outlines, halo, floating, extra characters, collage, borders, logos or watermarks. Output a complete coherent mother scene, same original 1536x1024 framing. Playful action from IMAGE 1: she holds a SMALL folded paper bird delicately between both hands near her chest, showing it with a small fresh lively smile and a little spark of amusement. Keep the gesture modest and natural, not broad flailing, exaggerated adult expression or generic wave. Preserve the exact seated pose and full leg/shoe positions from IMAGE 1.",
      "transparent_background": false,
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
          "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808"
        },
        {
          "path": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
          "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/anon-play-mother.png",
        "generatedPath": "exec-d9498719-8fef-46f0-b980-43a079cc7391.png",
        "sha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGB",
        "bytes": 1896581
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      },
      "disposition": "selected"
    },
    {
      "id": "anon-planning-figure",
      "prompt": "Use case: background-extraction. Produce a precise FULL-CANVAS RGBA ALPHA MASK for the exact seated character in this source image, not a newly composed illustration. Preserve EXACT original 1536x1024 framing and every original character x/y position, head/hair outline, pose, torso, skirt, both complete legs and both full shoes. No cropping, centering, scaling, moving or pose change. The person's entire silhouette and held objects must be a SOLID FULLY OPAQUE charcoal silhouette; interior face/cloth colors are not needed, because software uses only this alpha to reveal the ORIGINAL mother-image RGB pixels. Do NOT render a new face or outfit. The room, seat/cushions, window, floor, wall, plants, bookshelf, blanket and all background/contact shadows must become genuinely transparent alpha=0. The original large empty left portion stays transparent. Trace the true silhouette with at most a 1-pixel antialiased edge; no soft mask cloud, no low-opacity halo, no glow, no broad feathering, no matte border, no shadow or background object included. Exact original 1536x1024 full canvas, complete feet preserved. Include the open notebook, all its pages/covers, and the thin pencil in the character's hands inside the opaque silhouette. Do not include the separate cup sitting on the cushion.",
      "transparent_background": true,
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/anon-planning-mother.png",
          "sha256": "40869ee240a3c3a64f716d71cb282c08056630349707a64584fc37028449b006"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/anon-planning-figure.png",
        "generatedPath": "exec-7ffcd7c6-851b-48c2-855e-82c007e4e926.png",
        "sha256": "aef11fd261ef1d858a2e64ec99a5591c5ebef08b6a0adaa6dedc52867e74cfb2",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGBA",
        "bytes": 777386
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "use": "Alpha mask only to reveal original mother RGB; extracted RGB is intentionally a flat charcoal silhouette, never a visible sticker.",
        "limitation": "Raw low-alpha fringe exists on planning/rest extraction and must be suppressed in the existing compositor. It is not accepted as a visible character halo."
      },
      "disposition": "selected"
    },
    {
      "id": "anon-rest-figure",
      "prompt": "Use case: background-extraction. Produce a precise FULL-CANVAS RGBA ALPHA MASK for the exact seated character in this source image, not a newly composed illustration. Preserve EXACT original 1536x1024 framing and every original character x/y position, head/hair outline, pose, torso, skirt, both complete legs and both full shoes. No cropping, centering, scaling, moving or pose change. The person's entire silhouette and held objects must be a SOLID FULLY OPAQUE charcoal silhouette; interior face/cloth colors are not needed, because software uses only this alpha to reveal the ORIGINAL mother-image RGB pixels. Do NOT render a new face or outfit. The room, seat/cushions, window, floor, wall, plants, bookshelf, blanket and all background/contact shadows must become genuinely transparent alpha=0. The original large empty left portion stays transparent. Trace the true silhouette with at most a 1-pixel antialiased edge; no soft mask cloud, no low-opacity halo, no glow, no broad feathering, no matte border, no shadow or background object included. Exact original 1536x1024 full canvas, complete feet preserved. Include the closed book on the character's lap and both resting hands inside the opaque silhouette. Preserve the exact window-facing head/hair silhouette.",
      "transparent_background": true,
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/anon-rest-mother.png",
          "sha256": "0efb7ba53e3da497ee27750b026a10a162a3b9dbb65bd36e891d8a0d1b53dca2"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/anon-rest-figure.png",
        "generatedPath": "exec-c3f134e7-36c0-475b-b1f3-a06c66bedfd1.png",
        "sha256": "2bfed206f6736453655e2e2bbedf633b386765c1e36ed0ce8a25a918e00bc956",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGBA",
        "bytes": 713788
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "use": "Alpha mask only to reveal original mother RGB; extracted RGB is intentionally a flat charcoal silhouette, never a visible sticker.",
        "limitation": "Raw low-alpha fringe exists on planning/rest extraction and must be suppressed in the existing compositor. It is not accepted as a visible character halo."
      },
      "disposition": "selected"
    },
    {
      "id": "anon-play-figure",
      "prompt": "Use case: background-extraction. Make an RGBA alpha extraction mask from this exact source. MANDATORY OUTPUT SIZE IS 1536 pixels wide by 1024 pixels high, identical to the input. Keep every full-frame transparent column and row, including the empty leftmost columns. Do not auto-trim even ONE pixel, do not crop to 1535, do not recenter, resize, zoom or shift. The exact original seated Anon silhouette remains at its source x/y coordinates: long hair, head, torso, uniform/skirt, both hands with the small folded paper bird, complete legs/socks and BOTH complete loafers. Represent only the person and held paper bird as a fully opaque solid charcoal silhouette; interior face/colors are irrelevant because software uses ONLY this alpha mask with the ORIGINAL mother RGB. Every room, seat, cushion, blanket, wall, window, plant, floor and shadow pixel is genuinely transparent alpha=0. No background cloud, glow, halo, drop shadow, broad feathering or matte; only a crisp silhouette with minimal single-pixel antialiasing on its true edge. The whole large left negative-space region remains empty transparent, but its full pixel canvas width must be preserved. Exact original 1536x1024 RGBA, no trim, no repositioning.",
      "transparent_background": true,
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/anon-play-mother.png",
          "sha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/anon-play-figure.png",
        "generatedPath": "exec-a8e2fc6b-e09c-461f-8e5e-4204a497a979.png",
        "sha256": "6eea00deeee69aec76ee14bcc2f601be465b382a022c6f2357d1acbbee26135a",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGBA",
        "bytes": 724376
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "use": "Alpha mask only to reveal original mother RGB; extracted RGB is intentionally a flat charcoal silhouette, never a visible sticker.",
        "limitation": "Raw low-alpha fringe must be suppressed by the existing compositor; this is a mask, not accepted direct-display character RGB."
      },
      "disposition": "selected"
    },
    {
      "id": "anon-play-figure-discarded-1535",
      "prompt": "Use case: background-extraction. Produce a precise FULL-CANVAS RGBA ALPHA MASK for the exact seated character in this source image, not a newly composed illustration. Preserve EXACT original 1536x1024 framing and every original character x/y position, head/hair outline, pose, torso, skirt, both complete legs and both full shoes. No cropping, centering, scaling, moving or pose change. The person's entire silhouette and held objects must be a SOLID FULLY OPAQUE charcoal silhouette; interior face/cloth colors are not needed, because software uses only this alpha to reveal the ORIGINAL mother-image RGB pixels. Do NOT render a new face or outfit. The room, seat/cushions, window, floor, wall, plants, bookshelf, blanket and all background/contact shadows must become genuinely transparent alpha=0. The original large empty left portion stays transparent. Trace the true silhouette with at most a 1-pixel antialiased edge; no soft mask cloud, no low-opacity halo, no glow, no broad feathering, no matte border, no shadow or background object included. Exact original 1536x1024 full canvas, complete feet preserved. Include the small folded paper bird held between both hands inside the opaque silhouette, preserving its pointed folds exactly.",
      "transparent_background": true,
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/anon-play-mother.png",
          "sha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163"
        }
      ],
      "output": {
        "projectPath": "",
        "generatedPath": "exec-998aafcc-5101-43bf-9f99-9dc742cdbe09.png",
        "sha256": "c6b3c9595da873387ed2ace7e4249d5e74c6ce1e92b1cff05e9ef1ddcfcd143c",
        "dimensions": [
          1535,
          1024
        ],
        "mode": "RGBA",
        "bytes": 341095
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": false,
        "use": "Alpha mask only to reveal original mother RGB; extracted RGB is intentionally a flat charcoal silhouette, never a visible sticker.",
        "limitation": "Raw low-alpha fringe exists on planning/rest extraction and must be suppressed in the existing compositor. It is not accepted as a visible character halo.",
        "rejection": "Output width 1535 differs from the required 1536 full-frame registration. Discarded and replaced by the selected retry."
      },
      "disposition": "discarded"
    }
  ]
}
```

### O02 · `docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json`

来源文件 SHA-256：`4be62fb1f2ba2aad5e1d7f9ce19fe82bf3dcee288e5d361fdaf3b060f20396e4`。以下为文件全文。

```json
{
  "schemaVersion": 1,
  "generator": "image_gen.imagegen (built-in)",
  "createdAt": "2026-10-23",
  "purpose": "Three independent Wakaba Mutsumi actions, identity expansion from approved Sakiko action mother canvases. Figure assets are generated alpha only; renderer should retain original mother RGB. No programmatic image extraction or pixel edits.",
  "records": [
    {
      "id": "mutsumi-planning-mother",
      "sourceExec": "exec-2610e87c-b0a9-4ef7-b462-8229282a6379",
      "prompt": "Use case: identity-preserve.\nAsset type: full scene mother illustration for a character already seated in an interactive room.\nInput image 1 is the EDIT TARGET, its EXACT 1536x1024 canvas, entire room, composition, wall, window mullions, bench, cushion, plant silhouettes, outside campus view, perspective, lighting, shadows, sitting support and character foot and knee coordinates are locked. Input image 2 is the CHARACTER IDENTITY and CLOTHING reference only, NOT a pose or layout reference.\nPrimary request: Replace ONLY the blue-haired girl in image 1 with Wakaba Mutsumi (若叶睦) from Ave Mujica, exactly recognizable from image 2: long straight pale grey-green hair, neat bangs and two small gold X hairpins, soft amber eyes, youthful fine 2D anime face, pale blue ruffled blouse with bow and blue plaid skirt as image 2. Preserve the exact leg pose and all shoe/foot positions of Image 1; dark stockings and dark brown loafers, both complete shoes remain in frame on the same floor contact points. Do not copy image 2's different leg pose. Keep the planning pose from Image 1: a small OPEN BLANK notebook in her lap, one hand supporting it and the other gently pointing to a blank page with a pencil, quietly considering a thought. Calm attentive look toward the viewer.\nStyle: beautifully drawn youthful delicate 2D anime, clean fine lines and cel-painted face, airy warm daylight and softly detailed environmental light, consistent with both inputs. No adult realism or mature photorealistic face. Natural hands with five fingers.\nComposition constraints: do not crop, zoom, recenter, resize or move the room or girl. Keep FULL 1536x1024 canvas. Keep the LEFT 60% as the same quiet empty warm wall for interface content. No plant enters left content region. Her entire head, held object, skirt, legs and complete shoes must fit exactly in original right-side sitting envelope, hip on the cushion, not floating.\nOnly change character identity/clothing and requested subtle expression; preserve action. No UI, no text, no typography, no watermark. Output one complete opaque scene.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
          "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39"
        },
        {
          "path": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/mutsumi-planning-mother.png",
        "generatedPath": "exec-2610e87c-b0a9-4ef7-b462-8229282a6379.png",
        "sha256": "da6e1e09beee1e7f1a08dbb63ae7880423187fb1b1899c853d86886afb6f0055"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "size": [
          1536,
          1024
        ],
        "mode": "RGB",
        "note": "Viewed full mother: youthful 2D identity, same room/window/seat/feet and empty left content area; action matches requested planning/rest/play state."
      }
    },
    {
      "id": "mutsumi-planning-figure",
      "sourceExec": "exec-fb693d5b-d213-4d35-82fc-bfea7129dd73",
      "prompt": "Use case: background-extraction.\nAsset type: character alpha silhouette/cutout aligned to its existing mother illustration.\nInput image is the EDIT TARGET and the ONLY source. Extract EXACTLY the already drawn seated Wakaba Mutsumi and her held object from this image; remove every background pixel to genuine transparency.\nCRITICAL exact canvas registration: output FULL 1536 x 1024 RGBA PNG, same canvas bounds, no cropping, no trimming, no recentering, no zooming and no resizing. Keep ALL character pixels in the EXACT SAME original x,y coordinates, scale, facial identity, pose and shape. Do not redraw, beautify, move, change expression, or invent the character.\nInclude ALL pale grey-green hair strands, hairpins, face, blouse, all arms/hands/fingers, blue plaid skirt, complete legs, dark socks and BOTH COMPLETE BROWN SHOES at the original floor-contact coordinates. Include the ENTIRE object she is holding (open notebook and pencil / closed book / small paper bird as actually present in this source). Treat held object and hands as part of the same foreground. Do not detach or omit any part.\nErase the complete room: wall, floor, window, light, outside view, bench, seat cushion, plants, pillows, blanket, shelf, other books and floor shadow. Background, floor contact shadow and holes around/between hair, arms and legs must be TRUE alpha=0, not a fake checkerboard, white paint or grey backdrop. Keep fine antialiased hair boundaries without opaque room-colored halo. Preserve the original character RGB wherever possible; this output's alpha will mask the original mother RGB. No new ground shadow, no text, no watermark. One transparent aligned cutout.",
      "inputs": [
        {
          "path": "exec-2610e87c-b0a9-4ef7-b462-8229282a6379.png",
          "sha256": "da6e1e09beee1e7f1a08dbb63ae7880423187fb1b1899c853d86886afb6f0055"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/mutsumi-planning-figure.png",
        "generatedPath": "exec-fb693d5b-d213-4d35-82fc-bfea7129dd73.png",
        "sha256": "b673a787dff886d0ac21ca8d7a1c2760dfb26cc587682275924555b663475b9d"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "size": [
          1536,
          1024
        ],
        "mode": "RGBA",
        "alphaExtrema": [
          0,
          254
        ],
        "note": "Viewed full canvas: same seated registration, full held object and both complete shoes. Generated alpha has faint low-alpha fringe; existing renderer uses its alpha threshold and the original mother RGB. No image pixels edited."
      }
    },
    {
      "id": "mutsumi-rest-mother",
      "sourceExec": "exec-7023f7d3-d4ce-493d-9429-7e5d4c12d40b",
      "prompt": "Use case: identity-preserve.\nAsset type: full scene mother illustration for a character already seated in an interactive room.\nInput image 1 is the EDIT TARGET, its EXACT 1536x1024 canvas, entire room, composition, wall, window mullions, bench, cushion, plant silhouettes, outside campus view, perspective, lighting, shadows, sitting support and character foot and knee coordinates are locked. Input image 2 is the CHARACTER IDENTITY and CLOTHING reference only, NOT a pose or layout reference.\nPrimary request: Replace ONLY the blue-haired girl in image 1 with Wakaba Mutsumi (若叶睦) from Ave Mujica, exactly recognizable from image 2: long straight pale grey-green hair, neat bangs and two small gold X hairpins, soft amber eyes, youthful fine 2D anime face, pale blue ruffled blouse with bow and blue plaid skirt as image 2. Preserve the exact leg pose and all shoe/foot positions of Image 1; dark stockings and dark brown loafers, both complete shoes remain in frame on the same floor contact points. Do not copy image 2's different leg pose. Keep the restful pose from Image 1: a small CLOSED book held on her lap by both relaxed hands, shoulders resting naturally, head turned toward the window, quietly gazing outside.\nStyle: beautifully drawn youthful delicate 2D anime, clean fine lines and cel-painted face, airy warm daylight and softly detailed environmental light, consistent with both inputs. No adult realism or mature photorealistic face. Natural hands with five fingers.\nComposition constraints: do not crop, zoom, recenter, resize or move the room or girl. Keep FULL 1536x1024 canvas. Keep the LEFT 60% as the same quiet empty warm wall for interface content. No plant enters left content region. Her entire head, held object, skirt, legs and complete shoes must fit exactly in original right-side sitting envelope, hip on the cushion, not floating.\nOnly change character identity/clothing and requested subtle expression; preserve action. No UI, no text, no typography, no watermark. Output one complete opaque scene.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
          "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0"
        },
        {
          "path": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/mutsumi-rest-mother.png",
        "generatedPath": "exec-7023f7d3-d4ce-493d-9429-7e5d4c12d40b.png",
        "sha256": "1fa4d53d689abcc729067dd2c523df38f115df91ab96e88384e0f4c537f3af56"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "size": [
          1536,
          1024
        ],
        "mode": "RGB",
        "note": "Viewed full mother: youthful 2D identity, same room/window/seat/feet and empty left content area; action matches requested planning/rest/play state."
      }
    },
    {
      "id": "mutsumi-rest-figure",
      "sourceExec": "exec-2779cebf-649c-48e5-b579-79332521a61f",
      "prompt": "Use case: background-extraction.\nAsset type: character alpha silhouette/cutout aligned to its existing mother illustration.\nInput image is the EDIT TARGET and the ONLY source. Extract EXACTLY the already drawn seated Wakaba Mutsumi and her held object from this image; remove every background pixel to genuine transparency.\nCRITICAL exact canvas registration: output FULL 1536 x 1024 RGBA PNG, same canvas bounds, no cropping, no trimming, no recentering, no zooming and no resizing. Keep ALL character pixels in the EXACT SAME original x,y coordinates, scale, facial identity, pose and shape. Do not redraw, beautify, move, change expression, or invent the character.\nInclude ALL pale grey-green hair strands, hairpins, face, blouse, all arms/hands/fingers, blue plaid skirt, complete legs, dark socks and BOTH COMPLETE BROWN SHOES at the original floor-contact coordinates. Include the ENTIRE object she is holding (open notebook and pencil / closed book / small paper bird as actually present in this source). Treat held object and hands as part of the same foreground. Do not detach or omit any part.\nErase the complete room: wall, floor, window, light, outside view, bench, seat cushion, plants, pillows, blanket, shelf, other books and floor shadow. Background, floor contact shadow and holes around/between hair, arms and legs must be TRUE alpha=0, not a fake checkerboard, white paint or grey backdrop. Keep fine antialiased hair boundaries without opaque room-colored halo. Preserve the original character RGB wherever possible; this output's alpha will mask the original mother RGB. No new ground shadow, no text, no watermark. One transparent aligned cutout.",
      "inputs": [
        {
          "path": "exec-7023f7d3-d4ce-493d-9429-7e5d4c12d40b.png",
          "sha256": "1fa4d53d689abcc729067dd2c523df38f115df91ab96e88384e0f4c537f3af56"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/mutsumi-rest-figure.png",
        "generatedPath": "exec-2779cebf-649c-48e5-b579-79332521a61f.png",
        "sha256": "09aa0d89edd6b3dcfd12c7fa0e7acb43be07fcc804790c5599a7578ac609715d"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "size": [
          1536,
          1024
        ],
        "mode": "RGBA",
        "alphaExtrema": [
          0,
          254
        ],
        "note": "Viewed full canvas: same seated registration, full held object and both complete shoes. Generated alpha has faint low-alpha fringe; existing renderer uses its alpha threshold and the original mother RGB. No image pixels edited."
      }
    },
    {
      "id": "mutsumi-play-mother",
      "sourceExec": "exec-8845f75f-04ca-4473-a857-6a3a4b40d240",
      "prompt": "Use case: identity-preserve.\nAsset type: full scene mother illustration for a character already seated in an interactive room.\nInput image 1 is the EDIT TARGET, its EXACT 1536x1024 canvas, entire room, composition, wall, window mullions, bench, cushion, plant silhouettes, outside campus view, perspective, lighting, shadows, sitting support and character foot and knee coordinates are locked. Input image 2 is the CHARACTER IDENTITY and CLOTHING reference only, NOT a pose or layout reference.\nPrimary request: Replace ONLY the blue-haired girl in image 1 with Wakaba Mutsumi (若叶睦) from Ave Mujica, exactly recognizable from image 2: long straight pale grey-green hair, neat bangs and two small gold X hairpins, soft amber eyes, youthful fine 2D anime face, pale blue ruffled blouse with bow and blue plaid skirt as image 2. Preserve the exact leg pose and all shoe/foot positions of Image 1; dark stockings and dark brown loafers, both complete shoes remain in frame on the same floor contact points. Do not copy image 2's different leg pose. Keep the play pose from Image 1: both hands delicately holding a small pale folded paper bird at chest height. Mutsumi has a quiet tiny self-satisfied smile, closed or barely parted lips, subtle pride in what she made, not an exaggerated excited open-mouth grin.\nStyle: beautifully drawn youthful delicate 2D anime, clean fine lines and cel-painted face, airy warm daylight and softly detailed environmental light, consistent with both inputs. No adult realism or mature photorealistic face. Natural hands with five fingers.\nComposition constraints: do not crop, zoom, recenter, resize or move the room or girl. Keep FULL 1536x1024 canvas. Keep the LEFT 60% as the same quiet empty warm wall for interface content. No plant enters left content region. Her entire head, held object, skirt, legs and complete shoes must fit exactly in original right-side sitting envelope, hip on the cushion, not floating.\nOnly change character identity/clothing and requested subtle expression; preserve action. No UI, no text, no typography, no watermark. Output one complete opaque scene.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
          "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808"
        },
        {
          "path": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/mutsumi-play-mother.png",
        "generatedPath": "exec-8845f75f-04ca-4473-a857-6a3a4b40d240.png",
        "sha256": "1ec0bbc66e6da81c9bd8ecc7ccb0987372fa63b6b5f84906dc57eab8cf51c625"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "size": [
          1536,
          1024
        ],
        "mode": "RGB",
        "note": "Viewed full mother: youthful 2D identity, same room/window/seat/feet and empty left content area; action matches requested planning/rest/play state."
      }
    },
    {
      "id": "mutsumi-play-figure",
      "sourceExec": "exec-b2600493-b7db-4cdf-a150-a53271aa30ae",
      "prompt": "Use case: background-extraction.\nAsset type: character alpha silhouette/cutout aligned to its existing mother illustration.\nInput image is the EDIT TARGET and the ONLY source. Extract EXACTLY the already drawn seated Wakaba Mutsumi and her held object from this image; remove every background pixel to genuine transparency.\nCRITICAL exact canvas registration: output FULL 1536 x 1024 RGBA PNG, same canvas bounds, no cropping, no trimming, no recentering, no zooming and no resizing. Keep ALL character pixels in the EXACT SAME original x,y coordinates, scale, facial identity, pose and shape. Do not redraw, beautify, move, change expression, or invent the character.\nInclude ALL pale grey-green hair strands, hairpins, face, blouse, all arms/hands/fingers, blue plaid skirt, complete legs, dark socks and BOTH COMPLETE BROWN SHOES at the original floor-contact coordinates. Include the ENTIRE object she is holding (open notebook and pencil / closed book / small paper bird as actually present in this source). Treat held object and hands as part of the same foreground. Do not detach or omit any part.\nErase the complete room: wall, floor, window, light, outside view, bench, seat cushion, plants, pillows, blanket, shelf, other books and floor shadow. Background, floor contact shadow and holes around/between hair, arms and legs must be TRUE alpha=0, not a fake checkerboard, white paint or grey backdrop. Keep fine antialiased hair boundaries without opaque room-colored halo. Preserve the original character RGB wherever possible; this output's alpha will mask the original mother RGB. No new ground shadow, no text, no watermark. One transparent aligned cutout.",
      "inputs": [
        {
          "path": "exec-8845f75f-04ca-4473-a857-6a3a4b40d240.png",
          "sha256": "1ec0bbc66e6da81c9bd8ecc7ccb0987372fa63b6b5f84906dc57eab8cf51c625"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/mutsumi-play-figure.png",
        "generatedPath": "exec-b2600493-b7db-4cdf-a150-a53271aa30ae.png",
        "sha256": "dda6e81d2f88c1d909e4f662aac41e57586a7643300474637a796d8e5b8d7230"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "size": [
          1536,
          1024
        ],
        "mode": "RGBA",
        "alphaExtrema": [
          0,
          254
        ],
        "note": "Viewed full canvas: same seated registration, full held object and both complete shoes. Generated alpha has faint low-alpha fringe; existing renderer uses its alpha threshold and the original mother RGB. No image pixels edited."
      }
    }
  ]
}
```

### O03 · `docs/implementation/2026-10-23-unified/additional-poses-sakiko.json`

来源文件 SHA-256：`21bdaf9945bfe6641e4b1dd6a70e5c72af8c7dab1af991c05303a7f366b4c8b7`。以下为文件全文。

```json
{
  "tool": "built-in GPT Image",
  "pipeline": "Additional activity classification → same core character approval → remaining character extension → registered same-canvas layers",
  "records": [
    {
      "id": "sakiko-planning-mother",
      "prompt": "Production EDIT of the approved complete mother scene. Preserve the EXACT 1536x1024 full canvas, camera, room/furniture/window/bench geometry, character identity and youthful crisp 2D anime style. No UI, no letters or watermark. Sakiko Togawa, light blue hair and low dark ribbons, golden eyes, navy uniform and plaid skirt. Same seated hip contact around (86%,63%), all head/hair and both complete legs/shoes inside frame. LEFT 60% is empty ivory reading wall, natural plants only far-right. Keep original warm airy sunlight, realistic scene contact and directional light without making face photorealistic or adult. Change ONLY character's action/expression (and a small object in her hands); no room changes, no new occluders, no floating feet, no cutout/sticker outline. Planning together: her pose is distinct from chatting; sit upright slightly inclined toward the viewer, hold a small open cream notebook on her lap with one hand, the other hand thoughtfully points at the notebook. Quiet focused, perceptive youthful face with a tiny encouraging smile. The notebook has blank subtle rule lines only, no text. She is genuinely thinking with the user, not gesturing at an invisible button.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
        "generatedPath": "exec-c79ac814-d0a2-43a2-af17-d56f4e5cd75f.png",
        "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      }
    },
    {
      "id": "sakiko-rest-mother",
      "prompt": "Production EDIT of the approved complete mother scene. Preserve the EXACT 1536x1024 full canvas, camera, room/furniture/window/bench geometry, character identity and youthful crisp 2D anime style. No UI, no letters or watermark. Sakiko Togawa, light blue hair and low dark ribbons, golden eyes, navy uniform and plaid skirt. Same seated hip contact around (86%,63%), all head/hair and both complete legs/shoes inside frame. LEFT 60% is empty ivory reading wall, natural plants only far-right. Keep original warm airy sunlight, realistic scene contact and directional light without making face photorealistic or adult. Change ONLY character's action/expression (and a small object in her hands); no room changes, no new occluders, no floating feet, no cutout/sticker outline. Quiet rest together: she leans her shoulder comfortably against the right cushion, hands relaxed on a closed book on her lap, gazes out the window to the left with a serene thoughtful expression. Natural relaxed seated posture, shoulders lower, mouth gently at rest. Clearly distinct from the hand-at-cheek chat pose and from reading. Modest school clothing and both feet naturally on the original floor.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
        "generatedPath": "exec-c8295e6d-2bc9-416e-9457-437e33c608f1.png",
        "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      }
    },
    {
      "id": "sakiko-play-mother",
      "prompt": "Production EDIT of the approved complete mother scene. Preserve the EXACT 1536x1024 full canvas, camera, room/furniture/window/bench geometry, character identity and youthful crisp 2D anime style. No UI, no letters or watermark. Sakiko Togawa, light blue hair and low dark ribbons, golden eyes, navy uniform and plaid skirt. Same seated hip contact around (86%,63%), all head/hair and both complete legs/shoes inside frame. LEFT 60% is empty ivory reading wall, natural plants only far-right. Keep original warm airy sunlight, realistic scene contact and directional light without making face photorealistic or adult. Change ONLY character's action/expression (and a small object in her hands); no room changes, no new occluders, no floating feet, no cutout/sticker outline. A little shared creative delight: she holds a small warm-ivory origami bird at chest height, offering it toward the viewer with a shy but lively pleased smile, eyebrows softly lifted. Both hands anatomically correct and youthful face recognizable, small lively gesture rather than an exaggerated comic distortion. Same naturally seated lower body, complete shoes and room contact. This is her quietly proud playful moment after making something together.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
        "generatedPath": "exec-6a538478-3238-4d7b-8ec0-552113466130.png",
        "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      }
    },
    {
      "id": "sakiko-planning-figure",
      "useCase": "background-extraction",
      "usage": "Alpha mask only; original mother RGB is rendered by frontend. No crop, recenter, resize or pixel editing was performed.",
      "prompt": "Use case: background-extraction.\nAsset type: exact-position full-canvas RGBA alpha mask for the supplied approved mother illustration, NOT a new character illustration.\nInput image 1 is the edit target, sakiko-planning-mother.png.\nExtract ONLY the complete visible girl and the object held in her hands (the open cream notebook and pencil). Output a flat solid WHITE silhouette of precisely those pixels on a genuinely transparent background. No face details, color, scene, shadows, glow, checkerboard or outline. Opaque white inside the selected girl and held object, transparent outside, clean antialiased outer edge. Preserve small transparent gaps between hair strands, limbs and object.\nRegistration is mandatory: preserve EXACT 1536x1024 landscape canvas and the subject's original x/y position, shape, scale, seated pose and complete silhouette from the mother. The large left area stays transparent. Do NOT center, crop, enlarge, rotate, resize, redesign or re-pose anything. Retain every outer hair strand, both ribbons, all clothing, legs and both complete shoes in their original positions. The white region must follow the mother's visible contour, including held object. Exclude the room, bench, cushion, blanket, flowers, floor and the cast shadow.\nThis output is used ONLY as an alpha mask; frontend displays original mother pixels through the mask. Accuracy of original subject footprint and transparency matters, never add decorative RGB or a replacement character.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
          "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-planning-figure.png",
        "generatedPath": "exec-4436d18d-2a53-475e-9ef0-6bd02bb06773.png",
        "sha256": "6e16ba47e91b43c98e4abad9ff46f7619c212514ead32350507eb36ebe5465ed",
        "width": 1536,
        "height": 1024,
        "mode": "RGBA",
        "alphaExtrema": [
          0,
          254
        ]
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "notes": "Complete original-canvas white silhouette with complete shoes and held object area. Generated low-alpha halo is visible; requires primary composite inspection with existing frontend threshold before approval."
      }
    },
    {
      "id": "sakiko-rest-figure",
      "useCase": "background-extraction",
      "usage": "Alpha mask only; original mother RGB is rendered by frontend. No crop, recenter, resize or pixel editing was performed.",
      "prompt": "Use case: background-extraction.\nAsset type: exact-position full-canvas RGBA alpha mask for the supplied approved mother illustration, NOT a new character illustration.\nInput image 1 is the edit target, sakiko-rest-mother.png.\nExtract ONLY the complete visible girl and the object held in her hands (the closed book on her lap). Output a flat solid WHITE silhouette of precisely those pixels on a genuinely transparent background. No face details, color, scene, shadows, glow, checkerboard or outline. Opaque white inside the selected girl and held object, transparent outside, clean antialiased outer edge. Preserve small transparent gaps between hair strands, limbs and object.\nRegistration is mandatory: preserve EXACT 1536x1024 landscape canvas and the subject's original x/y position, shape, scale, seated pose and complete silhouette from the mother. The large left area stays transparent. Do NOT center, crop, enlarge, rotate, resize, redesign or re-pose anything. Retain every outer hair strand, both ribbons, all clothing, legs and both complete shoes in their original positions. The white region must follow the mother's visible contour, including held object. Exclude the room, bench, cushion, blanket, flowers, floor and the cast shadow.\nThis output is used ONLY as an alpha mask; frontend displays original mother pixels through the mask. Accuracy of original subject footprint and transparency matters, never add decorative RGB or a replacement character.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
          "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-rest-figure.png",
        "generatedPath": "exec-a513bbd0-6bc2-404b-9f95-f899dc467c69.png",
        "sha256": "2dfdfae7ef61f685bb9c0c337072b23dedb931d37f534f9986b8551cc38e6510",
        "width": 1536,
        "height": 1024,
        "mode": "RGBA",
        "alphaExtrema": [
          0,
          254
        ]
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "notes": "Complete original-canvas white silhouette with complete shoes and held object area. Generated low-alpha halo is visible; requires primary composite inspection with existing frontend threshold before approval."
      }
    },
    {
      "id": "sakiko-play-figure",
      "useCase": "background-extraction",
      "usage": "Alpha mask only; original mother RGB is rendered by frontend. No crop, recenter, resize or pixel editing was performed.",
      "prompt": "Use case: background-extraction.\nAsset type: exact-position full-canvas RGBA alpha mask for the supplied approved mother illustration, NOT a new character illustration.\nInput image 1 is the edit target, sakiko-play-mother.png.\nExtract ONLY the complete visible girl and the object held in her hands (the small cream origami bird). Output a flat solid WHITE silhouette of precisely those pixels on a genuinely transparent background. No face details, color, scene, shadows, glow, checkerboard or outline. Opaque white inside the selected girl and held object, transparent outside, clean antialiased outer edge. Preserve small transparent gaps between hair strands, limbs and object.\nRegistration is mandatory: preserve EXACT 1536x1024 landscape canvas and the subject's original x/y position, shape, scale, seated pose and complete silhouette from the mother. The large left area stays transparent. Do NOT center, crop, enlarge, rotate, resize, redesign or re-pose anything. Retain every outer hair strand, both ribbons, all clothing, legs and both complete shoes in their original positions. The white region must follow the mother's visible contour, including held object. Exclude the room, bench, cushion, blanket, flowers, floor and the cast shadow.\nThis output is used ONLY as an alpha mask; frontend displays original mother pixels through the mask. Accuracy of original subject footprint and transparency matters, never add decorative RGB or a replacement character.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
          "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-play-figure.png",
        "generatedPath": "exec-bb57f094-0b35-454d-ba8e-1557bc261f99.png",
        "sha256": "1ecd4199c5b040eeca5c1c1f44f158ca70f3c2847fe6a69b9b30af16852daa1f",
        "width": 1536,
        "height": 1024,
        "mode": "RGBA",
        "alphaExtrema": [
          0,
          254
        ]
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true,
        "notes": "Complete original-canvas white silhouette with complete shoes and held object area. Generated low-alpha halo is visible; requires primary composite inspection with existing frontend threshold before approval."
      }
    }
  ]
}
```

### O04 · `docs/implementation/2026-10-23-unified/additional-poses-tomori.json`

来源文件 SHA-256：`82deeafa23fa367c6cda724e25373c8137ef5a46cf826dc20a8877380799e5b7`。以下为文件全文。

```json
{
  "tool": "built-in GPT Image",
  "pipeline": "Approved Sakiko activity mother and Tomori identity reference → complete activity mothers → same-canvas alpha silhouettes",
  "records": [
    {
      "id": "tomori-planning-mother",
      "prompt": "Use case: identity-preserve. Production scene EDIT, not a new composition. INPUT IMAGE 1 is the approved activity mother scene: preserve its exact 1536x1024 full landscape canvas, room, window, outside campus lake view, curtains, bench, cushion, floor, lighting, camera, perspective, character seat contact, complete legs and both shoes positions. Keep the LEFT 60% an empty warm ivory wall, no UI, no words or watermark. INPUT IMAGE 2 supplies ONLY the new character identity and clothing: Tomori Takamatsu from BanG Dream! MyGO!!!!!, short grey-brown bob hair with soft side bangs, amber-brown eyes, youthful clean 2D anime high-school face, grey school blazer with white piping, white shirt, green striped tie, dark pleated skirt, navy knee socks and brown loafers. Replace Sakiko in image1 with Tomori; no long blue hair, no ribbons, no blue Sakiko uniform. Lock image1 lower-body placement and room geometry, not image2's different pose. Preserve crisp elegant 2D anime linework and warm airy light, youthful proportions and original character recognition, not realistic skin, adult face, mature modelling or chibi. Full head, hair, hands, clothing, legs and shoes remain inside the canvas with the same natural room contact. Planning together: retain image1's seated planning action, small open blank cream notebook resting on her lap. One hand supports it and the other index finger lightly points thoughtfully at an empty page. Tomori's reserved, quietly attentive expression: a small concentrated smile, gently lowered eyebrows, thoughtfully considering the page and the person with her. Distinct from chatting; no stone or extra object from identity image2. Notebook pages may have faint blank rule lines but absolutely no writing.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
          "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39"
        },
        {
          "path": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
          "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/tomori-planning-mother.png",
        "generatedPath": "exec-ff8f7c05-8ae1-441f-8672-feab2daf3b17.png",
        "sha256": "04ad6b0bbb10a7a837f1d78297f9812f821c7aa0a072075099fd3492f6431e4e"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      }
    },
    {
      "id": "tomori-rest-mother",
      "prompt": "Use case: identity-preserve. Production scene EDIT, not a new composition. INPUT IMAGE 1 is the approved activity mother scene: preserve its exact 1536x1024 full landscape canvas, room, window, outside campus lake view, curtains, bench, cushion, floor, lighting, camera, perspective, character seat contact, complete legs and both shoes positions. Keep the LEFT 60% an empty warm ivory wall, no UI, no words or watermark. INPUT IMAGE 2 supplies ONLY the new character identity and clothing: Tomori Takamatsu from BanG Dream! MyGO!!!!!, short grey-brown bob hair with soft side bangs, amber-brown eyes, youthful clean 2D anime high-school face, grey school blazer with white piping, white shirt, green striped tie, dark pleated skirt, navy knee socks and brown loafers. Replace Sakiko in image1 with Tomori; no long blue hair, no ribbons, no blue Sakiko uniform. Lock image1 lower-body placement and room geometry, not image2's different pose. Preserve crisp elegant 2D anime linework and warm airy light, youthful proportions and original character recognition, not realistic skin, adult face, mature modelling or chibi. Full head, hair, hands, clothing, legs and shoes remain inside the canvas with the same natural room contact. Quiet rest together: retain image1's relaxed seated pose leaning gently into the right cushion, both hands relaxed on a small closed book on her lap; Tomori gazes out toward the left-hand window with a serene shy reflective face and soft closed mouth. Shoulders lowered and relaxed. No hand-to-cheek chat gesture, no rock or extra notebook from image2. Preserve the original complete legs, shoes and comfortable seat contact.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
          "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0"
        },
        {
          "path": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
          "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/tomori-rest-mother.png",
        "generatedPath": "exec-7fcdd8fc-a436-423a-9faa-ef05b9521904.png",
        "sha256": "b486e0a57a0c2849c5bb8724995e876cbf2a5722be901667a57a6016caf46f16"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      }
    },
    {
      "id": "tomori-play-mother",
      "prompt": "Use case: identity-preserve. Production scene EDIT, not a new composition. INPUT IMAGE 1 is the approved activity mother scene: preserve its exact 1536x1024 full landscape canvas, room, window, outside campus lake view, curtains, bench, cushion, floor, lighting, camera, perspective, character seat contact, complete legs and both shoes positions. Keep the LEFT 60% an empty warm ivory wall, no UI, no words or watermark. INPUT IMAGE 2 supplies ONLY the new character identity and clothing: Tomori Takamatsu from BanG Dream! MyGO!!!!!, short grey-brown bob hair with soft side bangs, amber-brown eyes, youthful clean 2D anime high-school face, grey school blazer with white piping, white shirt, green striped tie, dark pleated skirt, navy knee socks and brown loafers. Replace Sakiko in image1 with Tomori; no long blue hair, no ribbons, no blue Sakiko uniform. Lock image1 lower-body placement and room geometry, not image2's different pose. Preserve crisp elegant 2D anime linework and warm airy light, youthful proportions and original character recognition, not realistic skin, adult face, mature modelling or chibi. Full head, hair, hands, clothing, legs and shoes remain inside the canvas with the same natural room contact. A tiny shared creative moment: retain image1's naturally seated lower body and both hands at chest height holding a little warm-ivory origami bird. Tomori looks cautiously proud and a little happy: shy small smile, gently brightened amber eyes, careful hands protecting her small paper bird, no exaggerated open-mouthed Sakiko expression. The paper bird is clearly readable but small and delicate. No stone from identity image2. Preserve all complete fingers, lower body and shoes and the original room.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
          "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808"
        },
        {
          "path": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
          "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/tomori-play-mother.png",
        "generatedPath": "exec-903e3ebe-f072-40dd-8a3a-0d28cb14e0bf.png",
        "sha256": "564dc8ab57902326f7959bae49d5dd6882c7821bad6234493d6f5ec13dfab4c2"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      }
    },
    {
      "id": "tomori-planning-canvas-figure",
      "prompt": "Use case: background-extraction. Production RGBA SEGMENTATION MATTE / alpha silhouette extracted from the supplied approved complete scene. Exact output canvas 1536x1024, same pixel registration as this source image. Keep ONLY Tomori's entire seated character silhouette AND the small open notebook held on her lap as ONE natural foreground mask in the exact source positions. Include the complete head and every short hair edge, both hands and all fingers, every item of clothing, both full legs, socks and both complete shoes; preserve the original pose, scale, proportions and location exactly. Output inside the silhouette as pure WHITE RGB with opaque alpha; outside it must be truly transparent alpha=0, including the whole left wall and the spaces between limbs. Only narrow antialiasing on the exact silhouette edge. This is a full-canvas reusable mask, not a centered standalone portrait: NEVER crop, reposition, enlarge, redraw the pose, add padding or change the canvas aspect. Remove all room, window, bench, cushions, blanket, floor, background plants, light patches and all cast shadows from the mask. No background checkerboard painted in, no grey rectangle, no furniture, no labels, no drop shadow and no glow. The small held object is part of the mask; the bench and anything not held are NOT part. The character must remain at the exact far-right original seated position with the same complete shoes touching the original source floor coordinates.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/tomori-planning-mother.png",
          "sha256": "04ad6b0bbb10a7a837f1d78297f9812f821c7aa0a072075099fd3492f6431e4e"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/tomori-planning-figure.png",
        "generatedPath": "exec-a39d304f-6715-447d-827e-2c0936564aac.png",
        "sha256": "4411b3420da4f9762095226f68e34464e44bd3b9ef641970ab7ebf3fb31152cf"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      }
    },
    {
      "id": "tomori-rest-canvas-figure",
      "prompt": "Use case: background-extraction. Production RGBA SEGMENTATION MATTE / alpha silhouette extracted from the supplied approved complete scene. Exact output canvas 1536x1024, same pixel registration as this source image. Keep ONLY Tomori's entire seated character silhouette AND the small closed book held on her lap as ONE natural foreground mask in the exact source positions. Include the complete head and every short hair edge, both hands and all fingers, every item of clothing, both full legs, socks and both complete shoes; preserve the original pose, scale, proportions and location exactly. Output inside the silhouette as pure WHITE RGB with opaque alpha; outside it must be truly transparent alpha=0, including the whole left wall and the spaces between limbs. Only narrow antialiasing on the exact silhouette edge. This is a full-canvas reusable mask, not a centered standalone portrait: NEVER crop, reposition, enlarge, redraw the pose, add padding or change the canvas aspect. Remove all room, window, bench, cushions, blanket, floor, background plants, light patches and all cast shadows from the mask. No background checkerboard painted in, no grey rectangle, no furniture, no labels, no drop shadow and no glow. The small held object is part of the mask; the bench and anything not held are NOT part. The character must remain at the exact far-right original seated position with the same complete shoes touching the original source floor coordinates.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/tomori-rest-mother.png",
          "sha256": "b486e0a57a0c2849c5bb8724995e876cbf2a5722be901667a57a6016caf46f16"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/tomori-rest-figure.png",
        "generatedPath": "exec-afe05aa3-ed6b-499b-966f-ee62fedfcc88.png",
        "sha256": "9923490024439750cd0804934f12d88b3a1016c4ae69b6affb471608f4351bfc"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      }
    },
    {
      "id": "tomori-play-canvas-figure",
      "prompt": "Use case: background-extraction. Production RGBA SEGMENTATION MATTE / alpha silhouette extracted from the supplied approved complete scene. Exact output canvas 1536x1024, same pixel registration as this source image. Keep ONLY Tomori's entire seated character silhouette AND the small origami bird held between her hands as ONE natural foreground mask in the exact source positions. Include the complete head and every short hair edge, both hands and all fingers, every item of clothing, both full legs, socks and both complete shoes; preserve the original pose, scale, proportions and location exactly. Output inside the silhouette as pure WHITE RGB with opaque alpha; outside it must be truly transparent alpha=0, including the whole left wall and the spaces between limbs. Only narrow antialiasing on the exact silhouette edge. This is a full-canvas reusable mask, not a centered standalone portrait: NEVER crop, reposition, enlarge, redraw the pose, add padding or change the canvas aspect. Remove all room, window, bench, cushions, blanket, floor, background plants, light patches and all cast shadows from the mask. No background checkerboard painted in, no grey rectangle, no furniture, no labels, no drop shadow and no glow. The small held object is part of the mask; the bench and anything not held are NOT part. The character must remain at the exact far-right original seated position with the same complete shoes touching the original source floor coordinates.",
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/tomori-play-mother.png",
          "sha256": "564dc8ab57902326f7959bae49d5dd6882c7821bad6234493d6f5ec13dfab4c2"
        }
      ],
      "output": {
        "projectPath": "src/renderer/assets/companion/scenes/tomori-play-figure.png",
        "generatedPath": "exec-d7e17e9e-bc38-4541-a296-4e17e0edcb99.png",
        "sha256": "e3f3e5d3aaf4aeef9ad1f804d6f7fd40225f1c6138e42520a8ac8fe4024a654d"
      },
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      }
    }
  ]
}
```

### O05 · `docs/implementation/2026-10-23-unified/asset-provenance.json`

来源文件 SHA-256：`233cd39bfd9cbe2a39f9578f24e2f5db17a4cba44300cfddad38a26a6c38ba12`。以下为文件全文。

```json
{
  "schemaVersion": 1,
  "date": "2026-10-23",
  "purpose": "Current private repository companion scene artwork provenance and generation choices.",
  "policy": {
    "tool": "Built-in GPT Image; no Python cutouts or hidden substitute generation.",
    "rgb": "Only integrated mother-scene RGB supplies visible character colors; figure/mask RGB is not used as replacement art.",
    "alpha": "Same-canvas masks may include low-opacity raw exterior pixels; runtime alpha transfer and actual composite review remain necessary.",
    "cleanPlate": "Generative inpainting reconstructs occluded surfaces; it is not a photograph or guaranteed pixel-identical original room.",
    "geography": "The imagined campus view is atmospheric illustration, not real map/navigation data.",
    "scope": "User-authorized source synchronization to current repository; no additional mobile app, deployment, private user text, account data, credentials or secret included.",
    "review": "Image review confirmation is bound to an explicit primary-agent approval and matching output SHA-256, or to the earlier primary-agent review snapshot. It does not certify every runtime composition or drag combination."
  },
  "assets": [
    {
      "path": "src/renderer/assets/companion/scenes/anon-chat-figure.png",
      "sourceName": "anon-chat-figure.png",
      "sha256": "52e9e9afcb1350ed697990948f1f72b01e6e61721972c96a5aec01e129defa78",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "anon-chatFigureMask"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-70fe6e01-6a30-4164-bf6d-68b1ecd2ad90.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
      "sourceName": "anon-chat-mother.png",
      "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "anon-chat-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-c2ff7bed-9f63-437c-b150-76c3d5c7946d.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-night-figure.png",
      "sourceName": "anon-night-figure.png",
      "sha256": "0c69505500b0c520d53da14912dc2e8fcea82778a778bf528374d6f9e74e3149",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "anon-nightFigureMask"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-c76314b4-1cc3-405f-9cb7-4b071a74249e.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-night-mother.png",
      "sourceName": "anon-night-mother.png",
      "sha256": "b9e305ff5ffa70172e4b82356827fe5f1cdc8d6169938babdc6c92f672e3da51",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "anon-nightMother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-d4f6e82a-8506-436e-9fde-feda603c5aac.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-planning-figure.png",
      "sourceName": "anon-planning-figure.png",
      "sha256": "aef11fd261ef1d858a2e64ec99a5591c5ebef08b6a0adaa6dedc52867e74cfb2",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-anon-anon-planning-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-7ffcd7c6-851b-48c2-855e-82c007e4e926.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
        "sha256": "aef11fd261ef1d858a2e64ec99a5591c5ebef08b6a0adaa6dedc52867e74cfb2"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-planning-mother.png",
      "sourceName": "anon-planning-mother.png",
      "sha256": "40869ee240a3c3a64f716d71cb282c08056630349707a64584fc37028449b006",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-anon-anon-planning-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-19027179-800e-4ead-b2e1-e31728088cce.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
        "sha256": "40869ee240a3c3a64f716d71cb282c08056630349707a64584fc37028449b006"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-play-figure.png",
      "sourceName": "anon-play-figure.png",
      "sha256": "6eea00deeee69aec76ee14bcc2f601be465b382a022c6f2357d1acbbee26135a",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-anon-anon-play-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-a8e2fc6b-e09c-461f-8e5e-4204a497a979.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
        "sha256": "6eea00deeee69aec76ee14bcc2f601be465b382a022c6f2357d1acbbee26135a"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-play-mother.png",
      "sourceName": "anon-play-mother.png",
      "sha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-anon-anon-play-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-d9498719-8fef-46f0-b980-43a079cc7391.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
        "sha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-reading-figure.png",
      "sourceName": "anon-reading-figure.png",
      "sha256": "7057de629858711a94073e4acaf1e98e7467d010b48f2a390ad765208a6e35a0",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "anon-readingFigureMask"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-9354a59e-a3d1-4178-b01a-09ba67b161b1.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-reading-mother.png",
      "sourceName": "anon-reading-mother.png",
      "sha256": "0c00d0e9986c055f0cc0c82dc17924be4fbb3ac58b99238b0db9d06e1b21dee9",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "anon-readingMother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-020559ab-4e31-46a4-aefe-172fb488c93b.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-rest-figure.png",
      "sourceName": "anon-rest-figure.png",
      "sha256": "2bfed206f6736453655e2e2bbedf633b386765c1e36ed0ce8a25a918e00bc956",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-anon-anon-rest-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-c3f134e7-36c0-475b-b1f3-a06c66bedfd1.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
        "sha256": "2bfed206f6736453655e2e2bbedf633b386765c1e36ed0ce8a25a918e00bc956"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/anon-rest-mother.png",
      "sourceName": "anon-rest-mother.png",
      "sha256": "0efb7ba53e3da497ee27750b026a10a162a3b9dbb65bd36e891d8a0d1b53dca2",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-anon-anon-rest-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-1e0fc67f-1fd4-45cf-aa70-ae2c3280e9ce.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
        "sha256": "0efb7ba53e3da497ee27750b026a10a162a3b9dbb65bd36e891d8a0d1b53dca2"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-chat-mask.png",
      "sourceName": "mutsumi-chat-mask.png",
      "sha256": "4d362ecccd08097d158c069066f54a426005de35e9a4e2e1ea1902ae19e38498",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "mutsumi-chat-mask"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-aa7b491c-73bb-430b-931e-9b5babb9d4ab.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
      "sourceName": "mutsumi-chat-mother.png",
      "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "mutsumi-chat-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-7cafbef7-3f75-4cfa-82ac-e0bbe20e1108.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-night-mask.png",
      "sourceName": "mutsumi-night-mask.png",
      "sha256": "af225812d2b06bea83371cd4c9ca58c865eea12b2c321809cfcac87865abd113",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "mutsumi-night-mask"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-153ba82d-cdfc-4ccb-ac16-5e4e7f232a13.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-night-mother.png",
      "sourceName": "mutsumi-night-mother.png",
      "sha256": "540250b1471009162ea06d18a02383617dd9217384b397802e5d703bbd472b0c",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "mutsumi-night-mother-initial"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-450f4c9f-6040-4639-8952-1590a3cbac8a.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-planning-figure.png",
      "sourceName": "mutsumi-planning-figure.png",
      "sha256": "b673a787dff886d0ac21ca8d7a1c2760dfb26cc587682275924555b663475b9d",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-mutsumi-mutsumi-planning-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-fb693d5b-d213-4d35-82fc-bfea7129dd73.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
        "sha256": "b673a787dff886d0ac21ca8d7a1c2760dfb26cc587682275924555b663475b9d"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-planning-mother.png",
      "sourceName": "mutsumi-planning-mother.png",
      "sha256": "da6e1e09beee1e7f1a08dbb63ae7880423187fb1b1899c853d86886afb6f0055",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-mutsumi-mutsumi-planning-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-2610e87c-b0a9-4ef7-b462-8229282a6379.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
        "sha256": "da6e1e09beee1e7f1a08dbb63ae7880423187fb1b1899c853d86886afb6f0055"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-play-figure.png",
      "sourceName": "mutsumi-play-figure.png",
      "sha256": "dda6e81d2f88c1d909e4f662aac41e57586a7643300474637a796d8e5b8d7230",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-mutsumi-mutsumi-play-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-b2600493-b7db-4cdf-a150-a53271aa30ae.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
        "sha256": "dda6e81d2f88c1d909e4f662aac41e57586a7643300474637a796d8e5b8d7230"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-play-mother.png",
      "sourceName": "mutsumi-play-mother.png",
      "sha256": "1ec0bbc66e6da81c9bd8ecc7ccb0987372fa63b6b5f84906dc57eab8cf51c625",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-mutsumi-mutsumi-play-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-8845f75f-04ca-4473-a857-6a3a4b40d240.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
        "sha256": "1ec0bbc66e6da81c9bd8ecc7ccb0987372fa63b6b5f84906dc57eab8cf51c625"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-reading-mask.png",
      "sourceName": "mutsumi-reading-mask.png",
      "sha256": "1c86b6383a2ac1f08108165d023ac1db9a6dc0d831bbfa3fb7101fa461643046",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "mutsumi-reading-mask"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-998bd87e-d2d9-464b-8f28-2517ad7d6bbe.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-reading-mother.png",
      "sourceName": "mutsumi-reading-mother.png",
      "sha256": "37d8ab16d454f67df285cb49e235a0be8c2636db2e7aa78ce8d30dc88b6c4295",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "mutsumi-reading-mother-initial"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-03c08984-f84a-42b4-a72d-ad7d9a1c4098.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-rest-figure.png",
      "sourceName": "mutsumi-rest-figure.png",
      "sha256": "09aa0d89edd6b3dcfd12c7fa0e7acb43be07fcc804790c5599a7578ac609715d",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-mutsumi-mutsumi-rest-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-2779cebf-649c-48e5-b579-79332521a61f.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
        "sha256": "09aa0d89edd6b3dcfd12c7fa0e7acb43be07fcc804790c5599a7578ac609715d"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/mutsumi-rest-mother.png",
      "sourceName": "mutsumi-rest-mother.png",
      "sha256": "1fa4d53d689abcc729067dd2c523df38f115df91ab96e88384e0f4c537f3af56",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-mutsumi-mutsumi-rest-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-7023f7d3-d4ce-493d-9429-7e5d4c12d40b.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
        "sha256": "1fa4d53d689abcc729067dd2c523df38f115df91ab96e88384e0f4c537f3af56"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/room-dusk-violet-background.png",
      "sourceName": "room-dusk-violet-background.png",
      "sha256": "72899c0eed17adb92851e7b49d90ca6dd7dfd0f24d893794ad6078934cb11028",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "clean-plate",
      "use": "Same-canvas empty room for layered interaction.",
      "generationRecordIds": [
        "theme-room-dusk-violet-background"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-5d8d9282-d26d-4333-b294-3c5e34759590.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/room-morning-mist-background.png",
      "sourceName": "room-morning-mist-background.png",
      "sha256": "f939241a81e28702192a28b64a43b7482ec34ced069fbc28c446fdbc72f8b315",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "clean-plate",
      "use": "Same-canvas empty room for layered interaction.",
      "generationRecordIds": [
        "theme-room-morning-mist-background"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-625bd31c-a667-4344-af8b-da7237288751.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-chat-background.png",
      "sourceName": "sakiko-chat-background.png",
      "sha256": "a7fba9c5a616bbde1e988dad41c11aa06c95ee44d7ef0c1271b9ec6913c26608",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "clean-plate",
      "use": "Same-canvas empty room for layered interaction.",
      "generationRecordIds": [
        "sakiko-chat-clean-plate"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-765896d3-c769-46f8-a024-17b4b4769fce.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-chat-figure.png",
      "sourceName": "sakiko-chat-figure.png",
      "sha256": "39e594b7a163fc0c5fa401ff1ede2f56914d7af727c64f81a83782dc15edc488",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "root-sakiko-chat-mask"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-5fe73896-fd30-4cae-8ff0-3aa2bad1e035.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-chat-mist-mother.png",
      "sourceName": "sakiko-chat-mist-mother.png",
      "sha256": "b8907f7b3e25803a114755f5d0a6b5d06926742e5a7a1d06ba77daab7766fa63",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "root-theme-sakiko-chat-mist-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-a680df45-1cab-4db1-bb6e-28093c51471d.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
      "sourceName": "sakiko-chat-mother.png",
      "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "root-sakiko-chat-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-93ace784-4d66-4b27-893c-176c2051cbe6.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-chat-violet-mother.png",
      "sourceName": "sakiko-chat-violet-mother.png",
      "sha256": "98cf42e8fe09d2972cb7702c1f52967117f938a3e8868e3f01fc15dfe459f419",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "root-theme-sakiko-chat-violet-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-92f5a813-e96a-4f4c-93a2-af3730b35db7.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-night-background.png",
      "sourceName": "sakiko-night-background.png",
      "sha256": "c16a88c90c0bcdb4a03e42e80f1d39101837a4eacd12423f03803fbe74f375b4",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "clean-plate",
      "use": "Same-canvas empty room for layered interaction.",
      "generationRecordIds": [
        "sakiko-record-sakiko-night-background"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-9a342e10-1732-4f0c-9ccf-e6165ce45ab3.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-night-figure.png",
      "sourceName": "sakiko-night-figure.png",
      "sha256": "2f6464ba9ec52d61ebee1221bec44801024644040a8c64ce109fe1a094fecb19",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "sakiko-record-sakiko-night-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-6cbbb5af-6b83-45c9-915d-30e234522c2a.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
      "sourceName": "sakiko-night-mother.png",
      "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "sakiko-record-sakiko-night-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-9cd29833-2c21-464c-8a9d-60286e8c9ae8.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-planning-figure.png",
      "sourceName": "sakiko-planning-figure.png",
      "sha256": "6e16ba47e91b43c98e4abad9ff46f7619c212514ead32350507eb36ebe5465ed",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-sakiko-sakiko-planning-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-4436d18d-2a53-475e-9ef0-6bd02bb06773.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
        "sha256": "6e16ba47e91b43c98e4abad9ff46f7619c212514ead32350507eb36ebe5465ed"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
      "sourceName": "sakiko-planning-mother.png",
      "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-sakiko-sakiko-planning-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-c79ac814-d0a2-43a2-af17-d56f4e5cd75f.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
        "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-play-figure.png",
      "sourceName": "sakiko-play-figure.png",
      "sha256": "1ecd4199c5b040eeca5c1c1f44f158ca70f3c2847fe6a69b9b30af16852daa1f",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-sakiko-sakiko-play-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-bb57f094-0b35-454d-ba8e-1557bc261f99.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
        "sha256": "1ecd4199c5b040eeca5c1c1f44f158ca70f3c2847fe6a69b9b30af16852daa1f"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
      "sourceName": "sakiko-play-mother.png",
      "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-sakiko-sakiko-play-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-6a538478-3238-4d7b-8ec0-552113466130.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
        "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-reading-background.png",
      "sourceName": "sakiko-reading-background.png",
      "sha256": "ddaa0510c865611a61756d72219996d8a6b5f0bb5cb46f2c5c129fc9801b371d",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "clean-plate",
      "use": "Same-canvas empty room for layered interaction.",
      "generationRecordIds": [
        "sakiko-record-sakiko-reading-background"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-79ba2da0-782e-4076-a3da-cb885ce85742.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-reading-figure.png",
      "sourceName": "sakiko-reading-figure.png",
      "sha256": "cd602ca369fe3b2446808daa1ba2bdc7b49d8e321d1ebd2ddfdc1254bbf49f3f",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "sakiko-record-sakiko-reading-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-d6cd92e5-54fa-4a82-bd5e-89ed8acf45b0.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
      "sourceName": "sakiko-reading-mother.png",
      "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "sakiko-record-sakiko-reading-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-9763b601-0a64-414f-b385-4c2aadabd1e1.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-rest-figure.png",
      "sourceName": "sakiko-rest-figure.png",
      "sha256": "2dfdfae7ef61f685bb9c0c337072b23dedb931d37f534f9986b8551cc38e6510",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-sakiko-sakiko-rest-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-a513bbd0-6bc2-404b-9f95-f899dc467c69.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
        "sha256": "2dfdfae7ef61f685bb9c0c337072b23dedb931d37f534f9986b8551cc38e6510"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
      "sourceName": "sakiko-rest-mother.png",
      "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-sakiko-sakiko-rest-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-c8295e6d-2bc9-416e-9457-437e33c608f1.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
        "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-chat-figure.png",
      "sourceName": "tomori-chat-figure.png",
      "sha256": "212026b8b235c6538b4edd11526ae75f854dfd9f2266c44004dfe8672886dcc2",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "tomori-chat-mask"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-25ded132-92be-41a4-bfdd-17b2d3edd09d.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
      "sourceName": "tomori-chat-mother.png",
      "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "tomori-chat-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-abeaa66c-6a32-4c40-a1ee-c60d54751315.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-night-figure.png",
      "sourceName": "tomori-night-figure.png",
      "sha256": "8b7e2bad87450ebe07c0aa8ca340738151eb1785e62054f54a03dec69ec8e276",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "tomori-night-mask"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-fc42192a-0a86-4eab-98d9-cef372dba816.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-night-mother.png",
      "sourceName": "tomori-night-mother.png",
      "sha256": "9b4ec44b0a0aa307a95525ad47be65627251fd8ed04e4fa53f6430d9f5f7aaa3",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "tomori-night-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-75d1c63e-ca03-4936-a074-16ead33c0720.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-planning-figure.png",
      "sourceName": "tomori-planning-figure.png",
      "sha256": "4411b3420da4f9762095226f68e34464e44bd3b9ef641970ab7ebf3fb31152cf",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-tomori-tomori-planning-canvas-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-a39d304f-6715-447d-827e-2c0936564aac.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
        "sha256": "4411b3420da4f9762095226f68e34464e44bd3b9ef641970ab7ebf3fb31152cf"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-planning-mother.png",
      "sourceName": "tomori-planning-mother.png",
      "sha256": "04ad6b0bbb10a7a837f1d78297f9812f821c7aa0a072075099fd3492f6431e4e",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-tomori-tomori-planning-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-ff8f7c05-8ae1-441f-8672-feab2daf3b17.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
        "sha256": "04ad6b0bbb10a7a837f1d78297f9812f821c7aa0a072075099fd3492f6431e4e"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-play-figure.png",
      "sourceName": "tomori-play-figure.png",
      "sha256": "e3f3e5d3aaf4aeef9ad1f804d6f7fd40225f1c6138e42520a8ac8fe4024a654d",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-tomori-tomori-play-canvas-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-d7e17e9e-bc38-4541-a296-4e17e0edcb99.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
        "sha256": "e3f3e5d3aaf4aeef9ad1f804d6f7fd40225f1c6138e42520a8ac8fe4024a654d"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-play-mother.png",
      "sourceName": "tomori-play-mother.png",
      "sha256": "564dc8ab57902326f7959bae49d5dd6882c7821bad6234493d6f5ec13dfab4c2",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-tomori-tomori-play-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-903e3ebe-f072-40dd-8a3a-0d28cb14e0bf.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
        "sha256": "564dc8ab57902326f7959bae49d5dd6882c7821bad6234493d6f5ec13dfab4c2"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-reading-figure.png",
      "sourceName": "tomori-reading-figure.png",
      "sha256": "15118e336a357e314b2ec5b769dba16aa07674cfe6d8d6fd254d0afb0c8a0b73",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "tomori-reading-mask"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-d966d4fd-ffa3-44cf-a366-d9e34e60e53f.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-reading-mother.png",
      "sourceName": "tomori-reading-mother.png",
      "sha256": "f9a88876e460e0cc12db6e20a737cd43502403162f1709da1196a79227720d59",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "tomori-reading-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-054362a4-c55f-430b-bf4a-f24328891f8a.png"
      ]
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-rest-figure.png",
      "sourceName": "tomori-rest-figure.png",
      "sha256": "9923490024439750cd0804934f12d88b3a1016c4ae69b6affb471608f4351bfc",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGBA",
      "role": "alpha-mask",
      "use": "Only alpha is sampled; original matching mother supplies all visible character RGB.",
      "generationRecordIds": [
        "additional-additional-poses-tomori-tomori-rest-canvas-figure"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "alphaExtrema": [
        0,
        254
      ],
      "generatedSourceNames": [
        "exec-afe05aa3-ed6b-499b-966f-ee62fedfcc88.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
        "sha256": "9923490024439750cd0804934f12d88b3a1016c4ae69b6affb471608f4351bfc"
      }
    },
    {
      "path": "src/renderer/assets/companion/scenes/tomori-rest-mother.png",
      "sourceName": "tomori-rest-mother.png",
      "sha256": "b486e0a57a0c2849c5bb8724995e876cbf2a5722be901667a57a6016caf46f16",
      "dimensions": [
        1536,
        1024
      ],
      "mode": "RGB",
      "role": "mother-scene",
      "use": "Integrated original character/room RGB and pose source.",
      "generationRecordIds": [
        "additional-additional-poses-tomori-tomori-rest-mother"
      ],
      "primaryReview": "confirmed",
      "validation": "Image existence and byte metadata only; same dimensions do not establish contour or compositing correctness.",
      "generatedSourceNames": [
        "exec-7fcdd8fc-a436-423a-9faa-ef05b9521904.png"
      ],
      "primaryReviewEvidence": {
        "kind": "explicit-generation-record",
        "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
        "sha256": "b486e0a57a0c2849c5bb8724995e876cbf2a5722be901667a57a6016caf46f16"
      }
    }
  ],
  "generationRecords": [
    {
      "id": "mutsumi-chat-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "multi-character-chat-generation.json",
      "prompt": "Use case: identity-preserve / precise-object-edit. Image 1 is the locked full room EDIT TARGET. Image 2 is ONLY the replacement character's identity, youthful anime face, hair, and uniform reference; ignore its black/transparent backing, colored edge artifacts, and its original blank-space framing. Replace ONLY the blue-haired Sakiko in image 1 with the character specified below, illustrated natively inside the SAME room. This is a complete integrated mother scene, NOT a cutout or collage. LOCKED INVARIANTS: exactly 1536x1024 full frame, same camera and perspective, same wall/window/seat/floor positions, same campus tower/water/sky, same soft late-morning sunlight, same sparse upper-right plants and unchanged lower-right knitted throw/table/books. Keep entire LEFT 53% as the same clean safe pale wall with soft shadows; no plants, hair, furniture, or extra props in this reading/text area. Match source clean, precise youthful 2D anime linework, luminous air and warm natural room lighting, NOT adult realism, NOT mature fashion portrait. Character hips/contact point remain at normalized (0.86,0.63) on the same window-seat cushion, head/overall body scale consistent with original Sakiko, complete lower legs and both shoes visibly rest on the floor; retain human anatomy and natural seated weight/contact shadows. No floating, no chopped feet, no sticker outlines, no new person, no UI, no text, no layout or scene redesign. Make only small natural pose differences within the existing right-side character footprint. Replacement identity: Wakaba Mutsumi (若叶睦), Ave Mujica / BanG Dream. Her distinctly PALE GREEN long straight hair, tidy bangs, small gold barrettes at one side, soft golden eyes, youthful gentle reserved face, pale lavender school blouse with a delicate matching bow and blue plaid skirt, charcoal tights, dark brown school loafers as in image 2. She sits quietly with knees naturally together and both hands resting on a closed green book on her lap, a very subtle tranquil smile. Do not reuse Sakiko's blue hair, side ribbons or navy cardigan; she must clearly be Mutsumi. Preserve the youthful anime proportions from image 2, not an adult woman.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "actual source bytes"
        },
        {
          "sourceName": "all-images(3).zip/06_codex-clipboard-24b18d3e-5e43-46a8-ae0b-248724d1df7a.png",
          "role": "edit/reference source",
          "sha256": "6022d232392a92d436bd77b6e9f15e956a78a8bcd9d034164d44c55c14e9ca55",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-7cafbef7-3f75-4cfa-82ac-e0bbe20e1108.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
      "outputSha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1924237,
      "primaryReview": "confirmed"
    },
    {
      "id": "anon-chat-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "multi-character-chat-generation.json",
      "prompt": "Use case: identity-preserve / precise-object-edit. Image 1 is the locked full room EDIT TARGET. Image 2 is ONLY the replacement character's identity, youthful anime face, hair, and uniform reference; ignore its black/transparent backing, colored edge artifacts, and its original blank-space framing. Replace ONLY the blue-haired Sakiko in image 1 with the character specified below, illustrated natively inside the SAME room. This is a complete integrated mother scene, NOT a cutout or collage. LOCKED INVARIANTS: exactly 1536x1024 full frame, same camera and perspective, same wall/window/seat/floor positions, same campus tower/water/sky, same soft late-morning sunlight, same sparse upper-right plants and unchanged lower-right knitted throw/table/books. Keep entire LEFT 53% as the same clean safe pale wall with soft shadows; no plants, hair, furniture, or extra props in this reading/text area. Match source clean, precise youthful 2D anime linework, luminous air and warm natural room lighting, NOT adult realism, NOT mature fashion portrait. Character hips/contact point remain at normalized (0.86,0.63) on the same window-seat cushion, head/overall body scale consistent with original Sakiko, complete lower legs and both shoes visibly rest on the floor; retain human anatomy and natural seated weight/contact shadows. No floating, no chopped feet, no sticker outlines, no new person, no UI, no text, no layout or scene redesign. Make only small natural pose differences within the existing right-side character footprint. Replacement identity: Chihaya Anon (千早爱音), MyGO!!!!! / BanG Dream. Bright LONG PINK hair with side-swept bangs, lively GREY-BLUE eyes, youthful cheerful anime face, GREY blazer with white piping, white shirt and GREEN STRIPED necktie, grey pleated school skirt, dark knee socks, brown loafers exactly retaining reference identity. She gives a SMALL friendly wave with the hand nearest the center, held near her own shoulder entirely inside the existing right-side footprint, while her other hand holds a small closed lavender notebook on her lap. Natural seated legs with ankles close together and both shoes on the floor, small friendly smile; energetic but relaxed. No blue-haired character, no mature woman.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "actual source bytes"
        },
        {
          "sourceName": "all-images(3).zip/08_codex-clipboard-5ae5f691-8c1c-4982-a006-873cf5a9de95.png",
          "role": "edit/reference source",
          "sha256": "be765b9a627234629bd83a540e430b3f13c2d7adfca2d7804afeab8aef3b7026",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-c2ff7bed-9f63-437c-b150-76c3d5c7946d.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
      "outputSha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1930402,
      "primaryReview": "confirmed"
    },
    {
      "id": "tomori-chat-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "multi-character-chat-generation.json",
      "prompt": "Use case: identity-preserve / precise-object-edit. Image 1 is the locked full room EDIT TARGET. Image 2 is ONLY the replacement character's identity, youthful anime face, hair, and uniform reference; ignore its black/transparent backing, colored edge artifacts, and its original blank-space framing. Replace ONLY the blue-haired Sakiko in image 1 with the character specified below, illustrated natively inside the SAME room. This is a complete integrated mother scene, NOT a cutout or collage. LOCKED INVARIANTS: exactly 1536x1024 full frame, same camera and perspective, same wall/window/seat/floor positions, same campus tower/water/sky, same soft late-morning sunlight, same sparse upper-right plants and unchanged lower-right knitted throw/table/books. Keep entire LEFT 53% as the same clean safe pale wall with soft shadows; no plants, hair, furniture, or extra props in this reading/text area. Match source clean, precise youthful 2D anime linework, luminous air and warm natural room lighting, NOT adult realism, NOT mature fashion portrait. Character hips/contact point remain at normalized (0.86,0.63) on the same window-seat cushion, head/overall body scale consistent with original Sakiko, complete lower legs and both shoes visibly rest on the floor; retain human anatomy and natural seated weight/contact shadows. No floating, no chopped feet, no sticker outlines, no new person, no UI, no text, no layout or scene redesign. Make only small natural pose differences within the existing right-side character footprint. Replacement identity: Takamatsu Tomori (高松灯), MyGO!!!!! / BanG Dream. Original SHORT grey-brown hair with a muted purple tone and asymmetrical side-swept bangs, golden-brown eyes, petite youthful bashful face, GREY school blazer with WHITE piping and GREEN striped necktie, dark plaid pleated skirt, dark knee socks and dark loafers as in image 2. Her pose is shy, shoulders subtly rounded, knees naturally together: she looks quietly at a small smooth grey stone resting on the palm of one hand near her lap, while her other hand holds a small cream spiral notebook. Small careful smile, authentic Tomori expression. Do not turn her into a long-haired character or adult woman; retain the distinctive short haircut, flat youthful anime linework and reserved personality.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "actual source bytes"
        },
        {
          "sourceName": "all-images(3).zip/09_codex-clipboard-8fd3d39e-0544-475f-b306-a141dba6c80d.png",
          "role": "edit/reference source",
          "sha256": "a7d48e9962d21144832dee9de6291f2b4d40c9e3a816efd844746458d6fd4076",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-abeaa66c-6a32-4c40-a1ee-c60d54751315.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
      "outputSha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1914704,
      "primaryReview": "confirmed"
    },
    {
      "id": "sakiko-chat-clean-plate",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "sakiko-chat-background-generation.json",
      "prompt": "Use case: precise-object-edit. Input image 1 is the EDIT TARGET, a fixed 1536 × 1024 room illustration. Produce its precisely registered EMPTY BACKGROUND CLEAN PLATE for a layered interactive scene. Remove ONLY the seated blue-haired girl in her entirety (hair, body, all clothing, both legs and both shoes), the single dark blue book she holds, and all shadows cast specifically by her and her shoes. Reconstruct the room surfaces she occluded: the same plaid window-seat cushion continuing naturally, wood seat front, window/curtain behind her, and floorboards below, with the same perspective and lighting. Keep the empty window seat in place. CRITICAL INVARIANTS: the complete original frame and camera are locked; no cropping, no zoom, no reframing, no shift, no new border. Preserve the exact pixel positions and appearance of all existing unaffected room geometry, all left-wall negative space, floorboard perspective, sunlight and window/leaf shadows not cast by the person, the river/campus/clock tower seen through the window, plants at upper right, bookshelf at right, pillows, cream knitted blanket, lower-right bedside table and its separate stack of books. The books on the table MUST remain; remove only the book held in her arms. Do not add a replacement person, clothing, cushion decoration, furniture, objects, text, UI, or symbols. The result should look like the SAME illustration with the person carefully inpainted out, suitable to composite her original full-canvas transparent cutout back in at exactly the same coordinates.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-765896d3-c769-46f8-a024-17b4b4769fce.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-chat-background.png",
      "outputSha256": "a7fba9c5a616bbde1e988dad41c11aa06c95ee44d7ef0c1271b9ec6913c26608",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1837314,
      "primaryReview": "confirmed"
    },
    {
      "id": "mutsumi-reading-mother-initial",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "mutsumi-matrix-generation.json",
      "prompt": "Use case: precise-object-edit. Image 1 is the EDIT TARGET and locked Mutsumi identity/room. Image 2 is ONLY a pose/reading-activity and fixed same-room daylight reference; do NOT copy its blue-haired Sakiko. Preserve Wakaba Mutsumi's youthful Ave Mujica / BanG Dream identity exactly from image 1: long pale-green straight hair with neat bangs and small gold side barrettes, gold-brown eyes, reserved gentle youthful anime face, pale lavender ruffled school blouse with matching bow, blue plaid skirt, charcoal tights and brown loafers. No change to age, facial proportions, uniform identity or body scale. LOCKED registration: 1536x1024 complete canvas, no crop/reframe/zoom, identical camera/window/seat/floor geometry, hips remain at (0.86,0.63) on same cushion, knees and full lower legs/both loafers keep exactly image 1 positions on floor, same full-body size. Keep left 53% as empty safe wall, no plants/text/props over the reading area. Same youthful crisp 2D anime linework, room depth and softly luminous light as approved masters. No collage, no sticker edges, no extra person, no UI or writing. Change ONLY Mutsumi's upper-body activity slightly: both hands now hold her same GREEN BOOK OPEN just above her lap; gaze falls gently to its pages, head tipped down a little, peaceful concentration. Keep Mutsumi's closed-knee leg/feet placement from image 1 rather than Sakiko's crossed-leg pose. Preserve EVERY unaffected room pixel and its daytime sunlight as in image 1. No lamp added, no time-of-day or layout change.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
          "hashEvidence": "actual source bytes"
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
          "role": "edit/reference source",
          "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-03c08984-f84a-42b4-a72d-ad7d9a1c4098.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-reading-mother.png",
      "outputSha256": "37d8ab16d454f67df285cb49e235a0be8c2636db2e7aa78ce8d30dc88b6c4295",
      "disposition": "selected",
      "notes": "selected mother",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1868840
    },
    {
      "id": "mutsumi-night-mother-initial",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "mutsumi-matrix-generation.json",
      "prompt": "Use case: lighting-weather / identity-preserve. Image 1 is the EDIT TARGET and Mutsumi identity/body/room. Image 2 is the exact same-room NIGHT lighting template only; NEVER copy Sakiko's identity or outfit. Preserve Wakaba Mutsumi's youthful Ave Mujica / BanG Dream identity exactly from image 1: long pale-green straight hair with neat bangs and small gold side barrettes, gold-brown eyes, reserved gentle youthful anime face, pale lavender ruffled school blouse with matching bow, blue plaid skirt, charcoal tights and brown loafers. No change to age, facial proportions, uniform identity or body scale. LOCKED registration: 1536x1024 complete canvas, no crop/reframe/zoom, identical camera/window/seat/floor geometry, hips remain at (0.86,0.63) on same cushion, knees and full lower legs/both loafers keep exactly image 1 positions on floor, same full-body size. Keep left 53% as empty safe wall, no plants/text/props over the reading area. Same youthful crisp 2D anime linework, room depth and softly luminous light as approved masters. No collage, no sticker edges, no extra person, no UI or writing. Turn this registered room to the rainy dark-blue night from image 2: rainy window glass, dark campus and clocktower with warm little lights reflected on water, warm amber lamp at the same upper-right position as image 2, gentle warm rim light on Mutsumi. The entire left wall becomes the same calm muted indigo/charcoal shade as image 2, uniformly night with no daylight division. Mutsumi now cradles the small blue-floral warm ceramic mug with BOTH hands near her chest/lap, quietly looking toward us with a reserved, very slight caring smile; remove her green book from her hands for this night state. Keep her original closed-knee legs and both shoes from image 1 fixed at same floor positions. Change lighting/hand-held object and subtle upper-body pose ONLY; preserve room geometry, bedding, curtain, bookshelf and camera. Youthful 2D anime facial linework, NOT mature adult portrait, NOT glamour.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
          "hashEvidence": "actual source bytes"
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
          "role": "edit/reference source",
          "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-450f4c9f-6040-4639-8952-1590a3cbac8a.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-night-mother.png",
      "outputSha256": "540250b1471009162ea06d18a02383617dd9217384b397802e5d703bbd472b0c",
      "disposition": "selected",
      "notes": "selected mother",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1911981
    },
    {
      "id": "mutsumi-chat-figure-initial",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "mutsumi-matrix-generation.json",
      "prompt": "Use case: background-extraction. Input image is the EDIT TARGET. Extract ONLY Wakaba Mutsumi and the book she is touching from this exact mother scene onto a GENUINELY TRANSPARENT RGBA background, retaining the entire ORIGINAL 1536x1024 CANVAS. Critical: preserve her EXACT pixel position, scale, pose, silhouette, hair wisps, face, uniform, legs and both shoes, with the head, hip and feet at exactly the same coordinates as the source. Do NOT recenter, crop, zoom, rotate, move or redraw the character. Remove every pixel of room/background, cushion, pillows, blanket, sunlight, furniture, walls, floor and all cast shadows. Keep the green book as part of her foreground. Outside her silhouette alpha must be 0, inside body/clothes/book alpha must be solid opaque except natural anti-aliased edge/hair wisps. No colored matte, no halos or white/black/cyan outline, no checkerboard baked into pixels. This is a precise same-canvas foreground ALPHA MASK used to reveal original mother-scene RGB, not an opportunity to redraw her or rearrange the composition.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-04f393b2-21d9-462a-aee6-7458d09feaf7.png",
      "outputPath": null,
      "outputSha256": "fe1e7c827f3add33ac156edb5928eea5838bb25c6a41488a626c1801ef14b874",
      "disposition": "discarded",
      "notes": "discarded: initial RGB cutout expanded top contour and has low-opacity mist; not copied into active scene files",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1152361
    },
    {
      "id": "mutsumi-chat-mask",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "mutsumi-matrix-generation.json",
      "prompt": "Use case: background-extraction. Produce a PRECISE SEGMENTATION ALPHA MASK, not another illustration. Input image 1 is the original full 1536x1024 scene. On the EXACT SAME 1536x1024 canvas, TRACE the EXACT original silhouette of ONLY the seated green-haired girl Mutsumi and the object held in her hands. Fill that traced person/object silhouette completely with solid WHITE (fully opaque alpha); make the entire rest of the original scene truly TRANSPARENT (alpha zero). NO face, hair, fabric or color detail should be drawn inside; just one flat white cut shape, with naturally anti-aliased contour and individual visible hair wisps. This image is exclusively an alpha mask to clip the ORIGINAL RGB image; do not redraw, recompose, rescale, recenter, shift or reinterpret the person. Her head top, back hair outer curve, hands, skirt edge, knees, legs and BOTH full shoes must follow the exact original pixel coordinates. Start with original image coordinates, never create a new centered cutout. Mask must include her full long hair and held object, all limbs, clothing and shoes; exclude every bit of room/wall/window/cushion/pillow/blanket/floor, furniture and every cast shadow. Do NOT include glow, aura, mist, shadow gradient, halo, vignette or colored matte: outside the precisely traced contour there is immediately transparent background, no broad soft edge. No extra parts, no crop, no text, no border. Character remains in original RIGHT-side position; left 55% remains entirely transparent. Exact canvas registration and contour accuracy take priority over everything. Include her GREEN book, whether closed or open, as one foreground with her hands.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-aa7b491c-73bb-430b-931e-9b5babb9d4ab.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-chat-mask.png",
      "outputSha256": "4d362ecccd08097d158c069066f54a426005de35e9a4e2e1ea1902ae19e38498",
      "disposition": "selected",
      "notes": "RGBA mask RGB is flat white and is never displayed; apply existing alpha threshold then reveal original mother RGB. Raw exterior low-alpha pixels are retained in the file. Composite and drag must be checked by primary agent.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 901407
    },
    {
      "id": "mutsumi-reading-mask",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "mutsumi-matrix-generation.json",
      "prompt": "Use case: background-extraction. Produce a PRECISE SEGMENTATION ALPHA MASK, not another illustration. Input image 1 is the original full 1536x1024 scene. On the EXACT SAME 1536x1024 canvas, TRACE the EXACT original silhouette of ONLY the seated green-haired girl Mutsumi and the object held in her hands. Fill that traced person/object silhouette completely with solid WHITE (fully opaque alpha); make the entire rest of the original scene truly TRANSPARENT (alpha zero). NO face, hair, fabric or color detail should be drawn inside; just one flat white cut shape, with naturally anti-aliased contour and individual visible hair wisps. This image is exclusively an alpha mask to clip the ORIGINAL RGB image; do not redraw, recompose, rescale, recenter, shift or reinterpret the person. Her head top, back hair outer curve, hands, skirt edge, knees, legs and BOTH full shoes must follow the exact original pixel coordinates. Start with original image coordinates, never create a new centered cutout. Mask must include her full long hair and held object, all limbs, clothing and shoes; exclude every bit of room/wall/window/cushion/pillow/blanket/floor, furniture and every cast shadow. Do NOT include glow, aura, mist, shadow gradient, halo, vignette or colored matte: outside the precisely traced contour there is immediately transparent background, no broad soft edge. No extra parts, no crop, no text, no border. Character remains in original RIGHT-side position; left 55% remains entirely transparent. Exact canvas registration and contour accuracy take priority over everything. Include her GREEN book, whether closed or open, as one foreground with her hands.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/mutsumi-reading-mother.png",
          "role": "edit/reference source",
          "sha256": "37d8ab16d454f67df285cb49e235a0be8c2636db2e7aa78ce8d30dc88b6c4295",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-998bd87e-d2d9-464b-8f28-2517ad7d6bbe.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-reading-mask.png",
      "outputSha256": "1c86b6383a2ac1f08108165d023ac1db9a6dc0d831bbfa3fb7101fa461643046",
      "disposition": "selected",
      "notes": "RGBA mask RGB is flat white and is never displayed; apply existing alpha threshold then reveal original mother RGB. Raw exterior low-alpha pixels are retained in the file. Composite and drag must be checked by primary agent.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 859777
    },
    {
      "id": "mutsumi-night-mask",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "mutsumi-matrix-generation.json",
      "prompt": "Use case: background-extraction. Produce a PRECISE SEGMENTATION ALPHA MASK, not another illustration. Input image 1 is the original full 1536x1024 scene. On the EXACT SAME 1536x1024 canvas, TRACE the EXACT original silhouette of ONLY the seated green-haired girl Mutsumi and the object held in her hands. Fill that traced person/object silhouette completely with solid WHITE (fully opaque alpha); make the entire rest of the original scene truly TRANSPARENT (alpha zero). NO face, hair, fabric or color detail should be drawn inside; just one flat white cut shape, with naturally anti-aliased contour and individual visible hair wisps. This image is exclusively an alpha mask to clip the ORIGINAL RGB image; do not redraw, recompose, rescale, recenter, shift or reinterpret the person. Her head top, back hair outer curve, hands, skirt edge, knees, legs and BOTH full shoes must follow the exact original pixel coordinates. Start with original image coordinates, never create a new centered cutout. Mask must include her full long hair and held object, all limbs, clothing and shoes; exclude every bit of room/wall/window/cushion/pillow/blanket/floor, furniture and every cast shadow. Do NOT include glow, aura, mist, shadow gradient, halo, vignette or colored matte: outside the precisely traced contour there is immediately transparent background, no broad soft edge. No extra parts, no crop, no text, no border. Character remains in original RIGHT-side position; left 55% remains entirely transparent. Exact canvas registration and contour accuracy take priority over everything. In this night scene include the ceramic mug in her hands, exclude the background lamp.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/mutsumi-night-mother.png",
          "role": "edit/reference source",
          "sha256": "540250b1471009162ea06d18a02383617dd9217384b397802e5d703bbd472b0c",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-153ba82d-cdfc-4ccb-ac16-5e4e7f232a13.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-night-mask.png",
      "outputSha256": "af225812d2b06bea83371cd4c9ca58c865eea12b2c321809cfcac87865abd113",
      "disposition": "selected",
      "notes": "RGBA mask RGB is flat white and is never displayed; apply existing alpha threshold then reveal original mother RGB. Raw exterior low-alpha pixels are retained in the file. Composite and drag must be checked by primary agent.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 896257
    },
    {
      "id": "anon-readingMother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23/anon-scene-source-prompts.json",
      "prompt": "Use case: identity-preserve. EDIT INPUT IMAGE 1 (Anon chat mother), using IMAGE 2 ONLY as an action/reading-state template. Exact original 1536x1024 canvas, same camera, room, window geometry, cushion, seat, bookshelf and floor. IMAGE 1 defines the ONE character identity: Chihaya Anon from BanG Dream! It's MyGO!!!!!, youthful teenage anime face with large gray-blue eyes, very long pale pink hair, gray school blazer with white piping and gold buttons, WHITE shirt and GREEN striped necktie, gray plaid skirt, dark knee socks, brown loafers. Preserve this exact identity and school outfit; do not copy Sakiko's blue hair or navy cardigan from image 2. Change ONLY Anon's action: lower her eyes gently toward a naturally OPEN book held in BOTH hands over her lap, quietly engaged with a slight interested smile. Preserve her head scale, torso and pelvis positions, original seat contact, complete leg angles and BOTH complete shoe positions from IMAGE 1; no repositioning. Light remains the same warm airy afternoon. Maintain fresh youthful hand-drawn anime proportions and detailed illustrated environmental light; not an adult realistic woman. The left safe area remains quiet cream wall and floor, no plants or added objects. Foliage remains only on far right in source positions. No UI, text, logos, borders, split image, glowing edge or floating/cropped feet. Complete coherent mother scene, exact same 1536x1024 framing.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db",
          "hashEvidence": "actual source bytes"
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
          "role": "edit/reference source",
          "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-020559ab-4e31-46a4-aefe-172fb488c93b.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-reading-mother.png",
      "outputSha256": "0c00d0e9986c055f0cc0c82dc17924be4fbb3ac58b99238b0db9d06e1b21dee9",
      "disposition": "selected",
      "notes": "Reference roles follow the agent prompt record; RGBA figure assets supply alpha only, not generated RGB.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1893392
    },
    {
      "id": "anon-nightMother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23/anon-scene-source-prompts.json",
      "prompt": "Use case: lighting-weather and identity-preserve. EDIT INPUT IMAGE 1 (Anon chat mother), using IMAGE 2 only as the rainy-night LIGHTING and mug-action template. Output original 1536x1024 full canvas, same camera, window frame, seat cushion edge, bookshelf and floor geometry. Keep the exact youthful teenage ANON identity from IMAGE 1: long pale pink hair, gray-blue eyes, expressive delicate anime face, gray school blazer with white piping and gold buttons, white shirt, GREEN striped necktie, gray plaid skirt, dark knee socks and BOTH brown loafers. No Sakiko blue hair or navy cardigan. Keep Anon's torso, pelvis, seat contact, leg angles and complete shoe positions from IMAGE 1. Change arms to cradle a small porcelain mug with BOTH hands in front of her chest/lap, attentive friendly slightly playful youthful expression toward viewer. Transform the ENTIRE environment into continuous rainy nighttime, all window sky dark blue-violet, rain droplets and quiet campus/lake reflections, a small warm gold shaded lamp on far right in same position as IMAGE 2. Coherent soft amber interior light and cool rainy fill across whole image. Left clear wall becomes quiet deep warm charcoal-violet with no added plants/objects. No daylight, no sunbeams, no daytime/night boundary, no collage. Natural grounded shadows, no floating, no cropped feet, no white halo, no UI, no lettering. Same delicate high-end anime painting as inputs, never mature photorealism. Complete mother scene, no crop or reframing.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db",
          "hashEvidence": "actual source bytes"
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
          "role": "edit/reference source",
          "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-d4f6e82a-8506-436e-9fde-feda603c5aac.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-night-mother.png",
      "outputSha256": "b9e305ff5ffa70172e4b82356827fe5f1cdc8d6169938babdc6c92f672e3da51",
      "disposition": "selected",
      "notes": "Reference roles follow the agent prompt record; RGBA figure assets supply alpha only, not generated RGB.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1886398
    },
    {
      "id": "anon-chatFigureMask",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23/anon-scene-source-prompts.json",
      "prompt": "Use case: background-extraction. Create a precise FULL-CANVAS ALPHA MASK of only the seated anime girl and the book she holds in the source. This is a technical silhouette asset, NOT a new illustration. EXACT original 1536x1024 canvas; preserve every original x/y location, head scale, long hair silhouette, hands/book, skirt, complete legs and both complete shoes. DO NOT CROP, CENTER, RESIZE OR REPOSITION. All person and held-book pixels should be fully OPAQUE, with a plain flat solid charcoal RGB fill (interior details and face colors are unnecessary because software will use only the alpha channel to show ORIGINAL source pixels). Every room/background pixel must be alpha=0, including seat, cushions, floor, wall, window, bookshelf, plants and shadows. Preserve fine original outer hair silhouette with only a 1-pixel antialias edge. ABSOLUTELY NO white/colored halo, soft glow, fog, drop shadow, wide feathering or visible backdrop; sharp clean opaque silhouette against real transparency. Leave the entire original empty left region transparent. Output RGBA transparency, exact 1536x1024 full frame.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-70fe6e01-6a30-4164-bf6d-68b1ecd2ad90.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-chat-figure.png",
      "outputSha256": "52e9e9afcb1350ed697990948f1f72b01e6e61721972c96a5aec01e129defa78",
      "disposition": "selected",
      "notes": "Reference roles follow the agent prompt record; RGBA figure assets supply alpha only, not generated RGB.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 764305
    },
    {
      "id": "anon-readingFigureMask",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23/anon-scene-source-prompts.json",
      "prompt": "Use case: background-extraction. This output is a technical ALPHA SILHOUETTE, not an illustration. Extract the exact original outer silhouette of ONLY Anon and the object held in both hands. Output the EXACT ORIGINAL 1536x1024 canvas with every x/y position and scale UNCHANGED: head, long pink-hair outline, arms/hands, gray uniform, skirt, complete legs, dark socks and both entire loafers remain exactly where they were. NO crop, NO recenter, NO zoom or reframing. Fill the complete person-and-held-object silhouette with one solid fully opaque charcoal color, no interior face or texture is needed; software uses ONLY alpha over ORIGINAL mother-image pixels. Everything outside the silhouette must be genuinely transparent alpha=0, including wall, floor, seat, cushions, plants, window, lamp, bookshelf and shadows. Preserve fine hair silhouette with minimal 1-pixel antialiasing. No low-opacity fog, no feathering, no halo, no glow, no backdrop, no drop shadow, no extra shape around the shoes. The large left original safe region is entirely transparent. Keep full original framing, true RGBA output. The held object is the open book; include both open covers and pages inside the opaque silhouette.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-reading-mother.png",
          "role": "edit/reference source",
          "sha256": "0c00d0e9986c055f0cc0c82dc17924be4fbb3ac58b99238b0db9d06e1b21dee9",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-9354a59e-a3d1-4178-b01a-09ba67b161b1.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-reading-figure.png",
      "outputSha256": "7057de629858711a94073e4acaf1e98e7467d010b48f2a390ad765208a6e35a0",
      "disposition": "selected",
      "notes": "Reference roles follow the agent prompt record; RGBA figure assets supply alpha only, not generated RGB.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 737840
    },
    {
      "id": "anon-nightFigureMask",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23/anon-scene-source-prompts.json",
      "prompt": "Use case: background-extraction. This output is a technical ALPHA SILHOUETTE, not an illustration. Extract the exact original outer silhouette of ONLY Anon and the object held in both hands. Output the EXACT ORIGINAL 1536x1024 canvas with every x/y position and scale UNCHANGED: head, long pink-hair outline, arms/hands, gray uniform, skirt, complete legs, dark socks and both entire loafers remain exactly where they were. NO crop, NO recenter, NO zoom or reframing. Fill the complete person-and-held-object silhouette with one solid fully opaque charcoal color, no interior face or texture is needed; software uses ONLY alpha over ORIGINAL mother-image pixels. Everything outside the silhouette must be genuinely transparent alpha=0, including wall, floor, seat, cushions, plants, window, lamp, bookshelf and shadows. Preserve fine hair silhouette with minimal 1-pixel antialiasing. No low-opacity fog, no feathering, no halo, no glow, no backdrop, no drop shadow, no extra shape around the shoes. The large left original safe region is entirely transparent. Keep full original framing, true RGBA output. The held object is the small porcelain mug; include mug and handle with the hands, but DO NOT include the separate mug on the room cushion.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-night-mother.png",
          "role": "edit/reference source",
          "sha256": "b9e305ff5ffa70172e4b82356827fe5f1cdc8d6169938babdc6c92f672e3da51",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-c76314b4-1cc3-405f-9cb7-4b071a74249e.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-night-figure.png",
      "outputSha256": "0c69505500b0c520d53da14912dc2e8fcea82778a778bf528374d6f9e74e3149",
      "disposition": "selected",
      "notes": "Reference roles follow the agent prompt record; RGBA figure assets supply alpha only, not generated RGB.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 788091
    },
    {
      "id": "tomori-reading-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/tomori-prompts.json",
      "prompt": "Use case: identity-preserve. Edit target Image 1 is the approved 1536x1024 reading-room master. Image 2 is the exact character identity reference for Takamatsu Tomori (高松灯) from BanG Dream! It's MyGO!!!!!. Produce ONE full-canvas 1536x1024 anime scene, same camera, crop, window, pale blank left wall, lake and campus clock tower, window bench, cushions, floor, shelves, plants, and daylight as Image 1. Replace ONLY Sakiko, the long blue-haired girl, with the exact Tomori from Image 2: SHORT muted gray-purple bob, warm gold-brown eyes, soft clearly youthful original anime face, gray school blazer with white piping, white shirt, dark green striped necktie, dark pleated skirt, dark knee socks, brown loafers. No blue long hair, no adult or photorealistic face, no generic character. Match Image 1's seated reading pose, spatial footprint, hip contact on the bench, legs and complete shoes, book held naturally at lap, gentle absorbed reading expression. Tomori is leaning toward the open book while keeping the entire left 55% clear. Preserve the approved room and its warm soft anime linework and light exactly; do not redesign furniture, move the sitter, zoom, crop, add interface, text, logos, or extra people. Whole character physically seated with matched perspective, contact shadow and sunlight, no floating feet or sticker look.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
          "role": "edit/reference source",
          "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
          "hashEvidence": "actual source bytes"
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-054362a4-c55f-430b-bf4a-f24328891f8a.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-reading-mother.png",
      "outputSha256": "f9a88876e460e0cc12db6e20a737cd43502403162f1709da1196a79227720d59",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1872303
    },
    {
      "id": "tomori-night-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/tomori-prompts.json",
      "prompt": "Use case: identity-preserve. Edit target Image 1 is the approved 1536x1024 rainy-night room master. Image 2 is the exact character identity reference for Takamatsu Tomori (高松灯) from BanG Dream! It's MyGO!!!!!. Produce ONE full-canvas 1536x1024 anime scene at the identical camera, crop, window, clear left wall, rainy lake and campus clock tower, bench, cushions, floor, bookshelf and warm table lamp of Image 1. Change ONLY the long blue-haired Sakiko into the exact youthful Tomori of Image 2: short muted gray-purple bob haircut, warm gold-brown eyes, small soft original anime face, gray blazer with white piping, white shirt, dark green striped necktie, pleated dark skirt, dark knee socks and brown loafers. Preserve her canonical teen anime proportions, no mature adult face or realism and no generic substitute. Keep the same seated footprint and bench hip contact as Image 1, both legs and complete shoes grounded; naturally cup a small warm ceramic mug in both hands at chest/lap level, with a quiet curious reassuring look. Match the warm lamp lighting on her right side, cool rainy window light and contact shadow. The left 55% remains an uninterrupted dark warm-plum wall for reading. Do not change the room, camera, scene geometry, lamp, weather, furniture, crop, or layout. No text, UI, logos, extra people, image borders, floating feet or cutout sticker edges.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
          "role": "edit/reference source",
          "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
          "hashEvidence": "actual source bytes"
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-75d1c63e-ca03-4936-a074-16ead33c0720.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-night-mother.png",
      "outputSha256": "9b4ec44b0a0aa307a95525ad47be65627251fd8ed04e4fa53f6430d9f5f7aaa3",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1841965
    },
    {
      "id": "tomori-chat-mask",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/tomori-prompts.json",
      "prompt": "Use case: background-extraction. Edit target is the attached 1536x1024 complete Tomori room master. Create ONE genuine transparent RGBA extraction at EXACTLY the same FULL 1536x1024 canvas size. Keep the girl Takamatsu Tomori and all items she is holding (her small notebook and the small stone in her hand), including every hair edge, hands, blazer, skirt, complete knee socks, and both complete shoes. Preserve her exact original image coordinates, size, pose, tilt and perspective. The head, hip contact point, knees and shoe soles must be at their original pixels. REMOVE every room/background pixel, bench, cushions, floor, window, plants, wall, lamp and furniture to alpha=0. No cast floor shadow. Keep ONLY the original character silhouette and held object opaque; allow anti-alias alpha only along edges. This is an extraction, NOT a redraw or character restyling. Absolutely do NOT crop, recenter, zoom, resize the character, shift her, change her anatomy, close gaps between legs, omit shoes, fill the background with white/gray/checkerboard, or add anything. The left roughly 55 percent of the image must remain completely transparent exactly as in the source framing. The alpha channel of this output will be used as a full-canvas mask over the ORIGINAL mother image pixels; exact source alignment is essential. Preserve transparent background in the actual PNG.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-25ded132-92be-41a4-bfdd-17b2d3edd09d.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-chat-figure.png",
      "outputSha256": "212026b8b235c6538b4edd11526ae75f854dfd9f2266c44004dfe8672886dcc2",
      "disposition": "selected",
      "notes": "Only alpha reveals original mother RGB; exact contour/composite review not inferred from the prompt.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1068463
    },
    {
      "id": "tomori-reading-mask",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/tomori-prompts.json",
      "prompt": "Use case: background-extraction. Edit target is the attached 1536x1024 complete Tomori room master. Create ONE genuine transparent RGBA extraction at EXACTLY the same FULL 1536x1024 canvas size. Keep the girl Takamatsu Tomori and all items she is holding (the open book in both hands), including every hair edge, hands, blazer, skirt, complete knee socks, and both complete shoes. Preserve her exact original image coordinates, size, pose, tilt and perspective. The head, hip contact point, knees and shoe soles must be at their original pixels. REMOVE every room/background pixel, bench, cushions, floor, window, plants, wall, lamp and furniture to alpha=0. No cast floor shadow. Keep ONLY the original character silhouette and held object opaque; allow anti-alias alpha only along edges. This is an extraction, NOT a redraw or character restyling. Absolutely do NOT crop, recenter, zoom, resize the character, shift her, change her anatomy, close gaps between legs, omit shoes, fill the background with white/gray/checkerboard, or add anything. The left roughly 55 percent of the image must remain completely transparent exactly as in the source framing. The alpha channel of this output will be used as a full-canvas mask over the ORIGINAL mother image pixels; exact source alignment is essential. Preserve transparent background in the actual PNG.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-reading-mother.png",
          "role": "edit/reference source",
          "sha256": "f9a88876e460e0cc12db6e20a737cd43502403162f1709da1196a79227720d59",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-d966d4fd-ffa3-44cf-a366-d9e34e60e53f.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-reading-figure.png",
      "outputSha256": "15118e336a357e314b2ec5b769dba16aa07674cfe6d8d6fd254d0afb0c8a0b73",
      "disposition": "selected",
      "notes": "Only alpha reveals original mother RGB; exact contour/composite review not inferred from the prompt.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1054027
    },
    {
      "id": "tomori-night-mask",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/tomori-prompts.json",
      "prompt": "Use case: background-extraction. Edit target is the attached 1536x1024 complete Tomori room master. Create ONE genuine transparent RGBA extraction at EXACTLY the same FULL 1536x1024 canvas size. Keep the girl Takamatsu Tomori and all items she is holding (the warm ceramic mug in both hands), including every hair edge, hands, blazer, skirt, complete knee socks, and both complete shoes. Preserve her exact original image coordinates, size, pose, tilt and perspective. The head, hip contact point, knees and shoe soles must be at their original pixels. REMOVE every room/background pixel, bench, cushions, floor, window, plants, wall, lamp and furniture to alpha=0. No cast floor shadow. Keep ONLY the original character silhouette and held object opaque; allow anti-alias alpha only along edges. This is an extraction, NOT a redraw or character restyling. Absolutely do NOT crop, recenter, zoom, resize the character, shift her, change her anatomy, close gaps between legs, omit shoes, fill the background with white/gray/checkerboard, or add anything. The left roughly 55 percent of the image must remain completely transparent exactly as in the source framing. The alpha channel of this output will be used as a full-canvas mask over the ORIGINAL mother image pixels; exact source alignment is essential. Preserve transparent background in the actual PNG.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-night-mother.png",
          "role": "edit/reference source",
          "sha256": "9b4ec44b0a0aa307a95525ad47be65627251fd8ed04e4fa53f6430d9f5f7aaa3",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-fc42192a-0a86-4eab-98d9-cef372dba816.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-night-figure.png",
      "outputSha256": "8b7e2bad87450ebe07c0aa8ca340738151eb1785e62054f54a03dec69ec8e276",
      "disposition": "selected",
      "notes": "Only alpha reveals original mother RGB; exact contour/composite review not inferred from the prompt.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1021732
    },
    {
      "id": "root-pilot-cross-scenes",
      "inputBinding": "unknown original image-reference binding; no source is inferred",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/root-image-prompts.json",
      "prompt": "Use case: ui-mockup. Create the FIRST STANDARDIZATION PILOT for 在场, a warm Chinese companion desktop app. Input image is the approved STYLE/CHARACTER reference, NOT a pasted UI template. Keep its youthful 2D anime Sakiko Togawa from BanG Dream Ave Mujica: light blue long hair, two low side ribbons, golden eyes, modest navy school sweater and white bow, youthful compact facial structure, crisp anime linework, airy light, never mature photorealistic woman. Design one high-resolution 2-by-2 comparison sheet of FOUR desktop views all with EXACT identical 1440x900 layout grid, same 72px topbar, door outline 在场 top-left, central three-item pill 聊天 今天 留下 same coordinates, avatar/search same top-right. Each panel framed cleanly, no overlapping windows. Panel 1: daylight home, Sakiko naturally seated on real window bench at right x=83%, hips on bench y=68%, both legs/feet anatomically visible, warm cream left reading safe zone x=6-61%, title 回来啦。 and single composer. Panel 2: real reading workspace: document/chat 58:42 with slim functional divider, Sakiko SMALL in a scene inset at far right, not stealing content. Use very short correct math x'=a(t)x+f(t). Panel 3: night conversation SAME ROOM CAMERA and character identity, rain window with warm golden lamp, dark slate-plum left safe zone; her relaxed mug-holding seated pose is distinct. No daytime strip. Panel 4: today timeline minimal paper, real card trial at 17:15, previous time dotted, one small collision popover; Sakiko SMALL at window beyond content, looking at notebook. The role naturally yields space during work. Plants ONLY at the far right/top beyond x72%, NONE near left text. All buttons, headers, composers align across corresponding classes, restrained gold, no green UI. Warm modern Apple-level restraint and tactile paper, soft natural light and convincing spatial continuity. IMPORTANT: one coherent aesthetic, no extra sidebars, no crowded labels, no engineering status text, no unnecessary helper slogans. This is a real implementable design specification with distinct activity poses and comfortable whitespace. Produce an elegant and legible cohesive 2x2 sheet, not a marketing collage.",
      "inputs": [],
      "generatedSourceName": "exec-0db66a15-87b4-4b08-be46-388983f341ec.png",
      "outputPath": null,
      "outputSha256": "f848c07da27a123e68a29e04b832925846fb14bdfb268cafedbfceae4948b678",
      "disposition": "selected",
      "notes": "design reference; UI copy/math is not runtime data",
      "promptRecorded": true,
      "outputDimensions": [
        1586,
        992
      ],
      "outputMode": "RGB",
      "outputBytes": 1998339,
      "primaryReview": "confirmed"
    },
    {
      "id": "root-sakiko-chat-mother",
      "inputBinding": "unknown original image-reference binding; no source is inferred",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/root-image-prompts.json",
      "prompt": "Production mother-scene illustration for an interactive layered companion room, NO UI and NO text. Wide landscape 1536x1024, fixed straight eye-level camera. Match the youthful clear-lined 2D anime Sakiko Togawa in reference image2 exactly, not a mature realistic woman. Reference1 is the APPROVED shared application style sheet, reference2 supplies crisp character design. A believable warm sunlit cream window nook overlooking a generic Chinese campus lake, small clock tower, gauze curtain, a long upholstered window bench at right, wooden bench base, patterned blue cushion, cream throw and a small side table with closed books. Sakiko with light blue hair, twin dark low side ribbons, amber-gold eyes, navy school sweater, white bow, gray-blue plaid pleated skirt, navy knee socks and brown loafers. She sits naturally at x=82% of image, hips visibly pressing cushion at y=63%, both legs and feet FULLY VISIBLE inside frame ending by y=94%, upper body y=21-63%. Relaxed affectionate-but-subtle smile, one hand lightly at cheek and one hand holding closed book on lap. Young anime face, compact gentle features, normal six-seven head anatomy. LEFT 60% of entire canvas is calm warm ivory wall with delicate natural window-light shadows, absolutely no characters, plants, objects, letters or interface; right window begins at x=64%. Sparse small natural leaves only top-right 12% and far right. No foreground plants intruding toward center. Elegant airy cinematic sunlight, warm ivory and gold, soft blue outdoors; consistent perspective and directional light. The complete person must be part of the original environment with accurate seating contact shadows. Image will be split into matching background and transparent figure layers after approval; avoid occluders crossing her body. All furniture geometry and feet remain readable. Do not crop head, legs or shoes. No sticker outline, glow, cyan edge, photorealism, adult face, oversized bust, green UI, watermark. Make this a finished exquisite anime film still whose generous negative-space composition supports real text over the left side.",
      "inputs": [],
      "generatedSourceName": "exec-93ace784-4d66-4b27-893c-176c2051cbe6.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
      "outputSha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
      "disposition": "selected",
      "notes": "approved production mother",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1975042,
      "primaryReview": "confirmed"
    },
    {
      "id": "root-sakiko-chat-mask",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/root-image-prompts.json",
      "prompt": "Precise background-extraction production EDIT. Target is the attached approved mother scene, 1536x1024. Extract ONLY Sakiko Togawa AND the closed book she holds on her lap onto a truly transparent RGBA canvas, keeping the EXACT FULL 1536x1024 canvas and EXACT original pixel position, scale, face, body, pose and complete shoes from the input. Character occupies approximately x58%-99%, head near x81% y14%, seated hips x87% y61%, feet near x65%-77% y94%. Do NOT recenter, do NOT enlarge, do NOT crop tightly, do NOT redraw her, do NOT change face, clothes, hair, pose or lighting. Everything else — ivory wall, window, campus, cushions, throw, floor, furniture, plants, cup, books on side table — must become fully transparent. Preserve only the character's original contact shadow if directly under her hips or shoes as a very subtle alpha shadow, not background patches. Fine natural hair alpha, crisp original anime lines, no cyan/fringe/magenta/white halo, no glow, no new outline, no visible checkerboard. This layer must composite over the mother-scene background at top-left (0,0) without any independent fitting or geometry adjustment. Preserve the exact original source geometry.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-5fe73896-fd30-4cae-8ff0-3aa2bad1e035.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-chat-figure.png",
      "outputSha256": "39e594b7a163fc0c5fa401ff1ede2f56914d7af727c64f81a83782dc15edc488",
      "disposition": "selected",
      "notes": "alpha only; generated RGB and halo rejected as visible artwork; runtime alpha table removes low-opacity halo and displays original mother pixels",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1167768,
      "primaryReview": "confirmed"
    },
    {
      "id": "root-sakiko-chat-mask-retry-rejected",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/root-image-prompts.json",
      "prompt": null,
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-e1d70060-b7ad-4256-8c73-30525265cc39.png",
      "outputPath": null,
      "outputSha256": "da2343af2b085f54bd47bb531040a66af68e84793440343464dacd242a2aeba7",
      "disposition": "discarded",
      "notes": "Primary agent inspected and rejected: extraction shifted/redrew the original person. Not copied into runtime. Exact retry prompt was not preserved; no reconstructed prompt is presented as original.",
      "promptRecorded": false,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1199972,
      "primaryReview": "confirmed"
    },
    {
      "id": "root-theme-sakiko-chat-mist-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/root-theme-prompts.json",
      "prompt": "EDIT the approved mother illustration. Exact same 1536x1024 camera, room geometry, character pixel placement, seated pose and scale, window bench, fully visible legs and shoes, youthful Sakiko identity. No UI, no letters. Preserve anime crisp linework and original face, navy uniform. No plants inside left text safe zone, keep far-right plants. Change ONLY lighting/color/time atmosphere, not geometry or person. Create 晨雾蓝 morning mist palette: clear airy blue-white diffused early daylight, soft cool sky and a faint lakeside morning haze outside; ivory wall remains softly warm and readable, shadows gentler. The room should feel cool fresh and calm, not icy or desaturated. Skin naturally peach, golden eyes recognizable. Cohesive luminous blue and ivory, restrained warm honey wood. No green UI, no green tint. This is a finished production scene asset, not a side-by-side comparison.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-a680df45-1cab-4db1-bb6e-28093c51471d.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-chat-mist-mother.png",
      "outputSha256": "b8907f7b3e25803a114755f5d0a6b5d06926742e5a7a1d06ba77daab7766fa63",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1977015,
      "primaryReview": "confirmed"
    },
    {
      "id": "root-theme-sakiko-chat-violet-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/root-theme-prompts.json",
      "prompt": "EDIT the approved mother illustration. Exact same 1536x1024 camera, room geometry, character pixel placement, seated pose and scale, window bench, fully visible legs and shoes, youthful Sakiko identity. No UI, no letters. Preserve anime crisp linework and original face, navy uniform. No plants inside left text safe zone, keep far-right plants. Change ONLY lighting/color/time atmosphere, not geometry or person. Create 暮色紫 golden dusk palette: sunset behind campus lake, warm peach clouds blending soft lavender sky, pale rosy-violet room shadows, small warm highlight on hair and hands, same furniture and youthful face. Left wall remains light cream-lilac, useful for dark reading text. All of the scene is one coherent dusk, never split day/night. Elegant lavender and rose-gold atmosphere, no strong saturated purple wash, no new lamp or geometry. Finished production scene asset.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-92f5a813-e96a-4f4c-93a2-af3730b35db7.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-chat-violet-mother.png",
      "outputSha256": "98cf42e8fe09d2972cb7702c1f52967117f938a3e8868e3f01fc15dfe459f419",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1964300,
      "primaryReview": "confirmed"
    },
    {
      "id": "sakiko-record-sakiko-reading-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/sakiko-scene-source-prompts.json",
      "prompt": "Use case: identity-preserve. Asset type: production mother scene for Zaichang companion, reading state. EDIT the provided approved 1536x1024 master image, preserve its full exact canvas framing, camera, room perspective, window, window-seat cushion, bookshelf and floor geometry. This is the SAME room, SAME shot and SAME teenage anime Toyokawa Sakiko (BanG Dream! Ave Mujica/MyGO universe) with SAME youthful delicate face, amber eyes, long wavy pale blue hair with navy bows, navy cardigan, white ribbon, plaid skirt, knee socks and loafers. Change only her reading action: her head/eyes gently lowered to a naturally OPEN book held with BOTH hands in front of her lap. Keep her seated pelvis, torso location, seat contact, leg angles, both complete legs and both complete shoes at exactly the master positions. She quietly concentrates, age-appropriate anime facial proportions, fresh and alive, not a mature realistic woman. Retain airy warm afternoon light and soft illustrated light/shadows, high-end detailed anime environmental painting, not 3D or photorealism. Left 60% stays a quiet clear cream wall and floor safe area with NO plant objects, NO books, NO new furniture, NO UI, NO writing or lettering. Existing natural soft window light/shadow may remain. Any foliage remains only at far right/window edge in its original position. Preserve high quality hand anatomy and book perspective. No cropped feet, no floating, no outline glow, no added border, no text, no UI, no split scene. The output is a complete coherent scene, NOT a cutout or transparent figure. Exact original 1536x1024 canvas.",
      "inputs": [
        {
          "sourceName": "exec-93ace784-4d66-4b27-893c-176c2051cbe6.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "generation record SHA-256, checked against source bytes when available"
        }
      ],
      "generatedSourceName": "exec-9763b601-0a64-414f-b385-4c2aadabd1e1.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
      "outputSha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
      "disposition": "selected",
      "notes": "Exact generation prompt and references transcribed by responsible agent.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1923288,
      "primaryReview": "confirmed"
    },
    {
      "id": "sakiko-record-sakiko-night-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/sakiko-scene-source-prompts.json",
      "prompt": "Use case: lighting-weather and identity-preserve. Asset type: production mother scene for Zaichang companion, warm rainy NIGHT state. EDIT the approved input master, exact original 1536x1024 full canvas, same camera, room layout, window frame coordinates, window-seat cushion, bookshelf, perspective and body/seating footprint. This is the SAME youthful teenage anime Toyokawa Sakiko with the SAME delicate youthful facial design, amber eyes, pale blue long wavy hair, navy bows, navy cardigan, white ribbon, plaid skirt, knee socks and complete brown loafers. Change the entire scene coherently from daytime to rainy night: all window sky is deep blue-violet rainy nighttime, rain droplets on glass, quiet soft distant campus lights reflected on the lake. NO daytime blue sky, NO sunbeams, NO daylight/night dividing line, NO split-screen. A small warm-gold shaded table lamp on the far right bookshelf/side table is the natural warm key light. Soft cool rain fill, warm amber face and cushion light, grounded contact shadows, graceful detailed anime background, no photorealistic adult face. Her pelvis, torso placement, seated position, complete legs and both complete shoes remain in exactly the input positions. Change her arms naturally to cradle a small white porcelain mug in BOTH hands around her chest/lap; head angled gently toward the viewer, calm friendly interested expression, youthful anime proportions. Remove the book from her hands; keep the rest of room fixed. Left 60% is quiet uncluttered deep warm charcoal-violet wall and floor, clear safe area for future interface, no plant objects, no furniture, no text, no UI. Foliage stays only at the far right/window edge in the original locations. Avoid mature middle-aged realism, cropped shoes, floating body, sticker look, outlines, glow edges, text, watermark, collage. The output is the complete single continuous mother scene, not a cutout. Keep exact 1536x1024 framing.",
      "inputs": [
        {
          "sourceName": "exec-93ace784-4d66-4b27-893c-176c2051cbe6.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "generation record SHA-256, checked against source bytes when available"
        }
      ],
      "generatedSourceName": "exec-9cd29833-2c21-464c-8a9d-60286e8c9ae8.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
      "outputSha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
      "disposition": "selected",
      "notes": "Exact generation prompt and references transcribed by responsible agent.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1975126,
      "primaryReview": "confirmed"
    },
    {
      "id": "sakiko-record-sakiko-reading-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/sakiko-scene-source-prompts.json",
      "prompt": "Use case: background-extraction. Extract ONLY Sakiko and the open book held in BOTH of her hands from this exact image onto genuinely transparent RGBA. CRITICAL REGISTRATION: output EXACT full original 1536x1024 canvas; leave the girl at EXACT original x/y coordinates, scale, seating pose, complete leg and both shoe positions. The left area stays fully transparent and empty. DO NOT CROP, DO NOT RECENTER, DO NOT resize/reframe. Preserve precisely the youthful face, all pale blue hair strands, bows, cardigan, skirt, skin, socks, both complete loafers, both hands and held open book from this input. Remove ALL room pixels: wall, floor, seat, cushions, blankets, lamp, plants, bookshelf, window, and contact shadows, making those pixels alpha=0. No backdrop of any color. Clean natural antialiased silhouette without any white halo, white outline, glow rim, matte contamination, shadow cloud, or feathered white border. Do not redraw or beautify her face or change body contour. Think of an exact full-frame alpha extraction aligned to the source image. The result will be used as a registration mask over ORIGINAL source pixels, so position, scale and silhouette accuracy are paramount.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
          "role": "edit/reference source",
          "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
          "hashEvidence": "generation record SHA-256, checked against source bytes when available"
        }
      ],
      "generatedSourceName": "exec-d6cd92e5-54fa-4a82-bd5e-89ed8acf45b0.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-reading-figure.png",
      "outputSha256": "cd602ca369fe3b2446808daa1ba2bdc7b49d8e321d1ebd2ddfdc1254bbf49f3f",
      "disposition": "selected",
      "notes": "The generated RGBA contains a low-alpha halo. Its RGB is not accepted for direct character rendering; the compositor must remove the fringe and display the mother image's original pixels. Dominant body alpha is 253, not 255.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1160901,
      "primaryReview": "confirmed"
    },
    {
      "id": "sakiko-record-sakiko-night-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/sakiko-scene-source-prompts.json",
      "prompt": "Use case: background-extraction. Extract ONLY Sakiko and the warm mug held in BOTH hands from this exact rainy-night image onto genuinely transparent RGBA. CRITICAL REGISTRATION: output EXACT full original 1536x1024 canvas, keep figure at EXACT source pixel x/y coordinates, original scale, head, torso, seat footprint, complete leg angles and both shoe positions. Leave large left portion fully transparent. DO NOT CROP, DO NOT RECENTER, DO NOT resize/reframe. Keep the precise youthful face, all pale blue hair, navy bows, cardigan, skirt, complete skin/socks/both full loafers, hands and held mug. Remove all room, seat, cushions, blankets, floor, wall, window, rain, light, plants, lamp, bookshelf and background shadows to alpha=0. Only the person and held mug remain. No white halo, white or black fringe, glow outline, matte contamination or drop shadow. No redrawing face/body, no invented edges. This will be a full-frame alpha registration mask over ORIGINAL source pixels, so exact position and silhouette matter more than creative rendering.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
          "role": "edit/reference source",
          "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
          "hashEvidence": "generation record SHA-256, checked against source bytes when available"
        }
      ],
      "generatedSourceName": "exec-6cbbb5af-6b83-45c9-915d-30e234522c2a.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-night-figure.png",
      "outputSha256": "2f6464ba9ec52d61ebee1221bec44801024644040a8c64ce109fe1a094fecb19",
      "disposition": "selected",
      "notes": "The generated RGBA contains a low-alpha halo. Its RGB is not accepted for direct character rendering; the compositor must remove the fringe and display the mother image's original pixels. Dominant body alpha is 253, not 255.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1123607,
      "primaryReview": "confirmed"
    },
    {
      "id": "sakiko-record-sakiko-reading-background",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/sakiko-scene-source-prompts.json",
      "prompt": "Use case: precise-object-edit. Create a clean BACKGROUND PLATE from the input image by removing ONLY the entire seated anime girl and the open book she is holding. Inpaint the room naturally where the girl covered it: continuous original window seat with the same beige check cushion and supporting woodwork, original pillows, original warm wood floor under where both shoes were. Preserve the EXACT full 1536x1024 canvas, same fixed camera/perspective, and every existing window frame line, sill, window-seat cushion edge, bookshelf, throw blanket, wall and floor geometry at the SAME pixel positions. DO NOT crop, recenter, zoom, shift the window/seat, or redesign the room. Preserve original daytime lighting and original image everywhere outside the removed girl/book. The separate porcelain mug already on the cushion is part of the room and MUST remain at its original location. Left 60% stays the exact quiet clear cream wall/floor area without plants, writing or any added object. No girl or ghost silhouette, no human shadow left behind, no extra people, no UI, no text, no borders. Complete coherent empty room, original 1536x1024 framing.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
          "role": "edit/reference source",
          "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
          "hashEvidence": "generation record SHA-256, checked against source bytes when available"
        }
      ],
      "generatedSourceName": "exec-79ba2da0-782e-4076-a3da-cb885ce85742.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-reading-background.png",
      "outputSha256": "ddaa0510c865611a61756d72219996d8a6b5f0bb5cb46f2c5c129fc9801b371d",
      "disposition": "selected",
      "notes": "Seat, pillow and floor areas hidden by the original character are generated reconstruction, not recovered original pixels.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1881443,
      "primaryReview": "confirmed"
    },
    {
      "id": "sakiko-record-sakiko-night-background",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/sakiko-scene-source-prompts.json",
      "prompt": "Use case: precise-object-edit. Create a clean rainy-NIGHT BACKGROUND PLATE by removing ONLY the seated anime girl and mug held in her hands. Naturally reconstruct the beige check window-seat cushion, original pillows, woodwork and warm wooden floor hidden by her body and both shoes. CRITICAL: preserve EXACT original full 1536x1024 canvas, fixed camera, perspective, same window frame pixel lines, SAME window-seat cushion edge and position, same right bookshelf and warm gold table lamp, blanket and all room objects. NO crop, recenter, zoom or layout movement. Keep continuous coherent rainy nighttime across the whole window, cool dark blue-violet rain outside and the same warm amber indoor lamp light. Preserve the input image outside the removed person/held mug. Left quiet deep charcoal-violet wall/floor stays uncluttered with no plants or objects added. No ghost girl, no remaining body/shoe shadow, no people, no text, no UI, no dividing line. Output exact 1536x1024 original framing.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
          "role": "edit/reference source",
          "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
          "hashEvidence": "generation record SHA-256, checked against source bytes when available"
        }
      ],
      "generatedSourceName": "exec-9a342e10-1732-4f0c-9ccf-e6165ce45ab3.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-night-background.png",
      "outputSha256": "c16a88c90c0bcdb4a03e42e80f1d39101837a4eacd12423f03803fbe74f375b4",
      "disposition": "selected",
      "notes": "Seat, pillow and floor areas hidden by the original character are generated reconstruction, not recovered original pixels.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1867337,
      "primaryReview": "confirmed"
    },
    {
      "id": "theme-room-morning-mist-background",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/theme-scene-assets.json",
      "prompt": "Use case: precise-object-edit / clean background extraction.\nEdit target: the attached approved 1536×1024 complete room scene.\nRemove ONLY the seated girl and the book she is holding, including all her hair, uniform, legs, shoes and body contact shadows. Reveal the empty padded window seat and the wooden floor naturally behind those removed pixels. Preserve the checked cushion, wooden frame, nearby pillows and blanket, window, curtain, plant, books, left wall, exact camera and perspective, object placement, and the entire approved cool airy morning mist blue, gentle daylight lighting unchanged. This is a same-canvas background layer for the original scene, not a new room. Output exactly the full 1536×1024 frame with no crop, no zoom, no reframing, no extra objects, no character, no human shadow, no text. Outside the girl's former silhouette preserve the target composition and lighting as faithfully as possible. The resulting clean plate must align with the target's full-canvas mother image.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mist-mother.png",
          "role": "edit/reference source",
          "sha256": "b8907f7b3e25803a114755f5d0a6b5d06926742e5a7a1d06ba77daab7766fa63",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-625bd31c-a667-4344-af8b-da7237288751.png",
      "outputPath": "src/renderer/assets/companion/scenes/room-morning-mist-background.png",
      "outputSha256": "f939241a81e28702192a28b64a43b7482ec34ced069fbc28c446fdbc72f8b315",
      "disposition": "selected",
      "notes": "mother pixels supply all character RGB; reused original chat alpha only after direct geometry comparison; background inpainting reconstructs occluded surfaces and is not a pixel-identical original background",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1841938
    },
    {
      "id": "theme-room-dusk-violet-background",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/theme-scene-assets.json",
      "prompt": "Use case: precise-object-edit / clean background extraction.\nEdit target: the attached approved 1536×1024 complete room scene.\nRemove ONLY the seated girl and the book she is holding, including all her hair, uniform, legs, shoes and body contact shadows. Reveal the empty padded window seat and the wooden floor naturally behind those removed pixels. Preserve the checked cushion, wooden frame, nearby pillows and blanket, window, curtain, plant, books, left wall, exact camera and perspective, object placement, and the entire approved lavender violet dusk wall, warm orange low sun and sunset window lighting unchanged. This is a same-canvas background layer for the original scene, not a new room. Output exactly the full 1536×1024 frame with no crop, no zoom, no reframing, no extra objects, no character, no human shadow, no text. Outside the girl's former silhouette preserve the target composition and lighting as faithfully as possible. The resulting clean plate must align with the target's full-canvas mother image.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-violet-mother.png",
          "role": "edit/reference source",
          "sha256": "98cf42e8fe09d2972cb7702c1f52967117f938a3e8868e3f01fc15dfe459f419",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-5d8d9282-d26d-4333-b294-3c5e34759590.png",
      "outputPath": "src/renderer/assets/companion/scenes/room-dusk-violet-background.png",
      "outputSha256": "72899c0eed17adb92851e7b49d90ca6dd7dfd0f24d893794ad6078934cb11028",
      "disposition": "selected",
      "notes": "mother pixels supply all character RGB; reused original chat alpha only after direct geometry comparison; background inpainting reconstructs occluded surfaces and is not a pixel-identical original background",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1853868
    },
    {
      "id": "additional-additional-poses-anon-anon-planning-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
      "prompt": "Use case: identity-preserve. EDIT INPUT IMAGE 1, the approved full-frame scene and exact pose. INPUT IMAGE 2 is ONLY the Chihaya Anon character-identity reference. Replace Sakiko in IMAGE 1 with Chihaya Anon from BanG Dream! It's MyGO!!!!! while preserving the original complete 1536x1024 canvas, fixed camera, room, window frame, cushion front edge, seat, bookshelf, plants, floor, perspective and lighting. Keep the exact torso location, seated pelvis contact, leg angles and both complete shoes at the pixel positions in IMAGE 1. No crop, no zoom, no recentering, no camera or room movement. Anon identity comes from IMAGE 2: very long soft pink hair, large gray-blue eyes, youthful lively delicate anime face, gray school blazer with white piping and gold buttons, white shirt, green striped necktie, gray plaid skirt, dark knee socks, brown loafers. Do not retain Sakiko's blue hair/navy cardigan. Preserve youthful anime age and light airy original painting, never a mature realistic woman. Keep the large quiet left wall/floor negative space exactly clear, no new plants, furniture, UI or lettering. Complete feet naturally contact the floor; seated body naturally contacts the cushion. No stickers, cutout outlines, halo, floating, extra characters, collage, borders, logos or watermarks. Output a complete coherent mother scene, same original 1536x1024 framing. Planning action from IMAGE 1: she holds an OPEN notebook over her lap with one hand, the other hand uses a pencil/index finger to point gently at a place on the open page as if thinking through an arrangement together. A thoughtful interested slight smile, not generic waving. Preserve notebook/pencil anatomy and perspective. Notebook pages have subtle blank lines only, no readable text.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
          "role": "edit/reference source",
          "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-19027179-800e-4ead-b2e1-e31728088cce.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-planning-mother.png",
      "outputSha256": "40869ee240a3c3a64f716d71cb282c08056630349707a64584fc37028449b006",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1918799,
      "declaredOutputSha256": "40869ee240a3c3a64f716d71cb282c08056630349707a64584fc37028449b006",
      "transparentBackground": false,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-anon-anon-rest-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
      "prompt": "Use case: identity-preserve. EDIT INPUT IMAGE 1, the approved full-frame scene and exact pose. INPUT IMAGE 2 is ONLY the Chihaya Anon character-identity reference. Replace Sakiko in IMAGE 1 with Chihaya Anon from BanG Dream! It's MyGO!!!!! while preserving the original complete 1536x1024 canvas, fixed camera, room, window frame, cushion front edge, seat, bookshelf, plants, floor, perspective and lighting. Keep the exact torso location, seated pelvis contact, leg angles and both complete shoes at the pixel positions in IMAGE 1. No crop, no zoom, no recentering, no camera or room movement. Anon identity comes from IMAGE 2: very long soft pink hair, large gray-blue eyes, youthful lively delicate anime face, gray school blazer with white piping and gold buttons, white shirt, green striped necktie, gray plaid skirt, dark knee socks, brown loafers. Do not retain Sakiko's blue hair/navy cardigan. Preserve youthful anime age and light airy original painting, never a mature realistic woman. Keep the large quiet left wall/floor negative space exactly clear, no new plants, furniture, UI or lettering. Complete feet naturally contact the floor; seated body naturally contacts the cushion. No stickers, cutout outlines, halo, floating, extra characters, collage, borders, logos or watermarks. Output a complete coherent mother scene, same original 1536x1024 framing. Rest action from IMAGE 1: she turns her head naturally toward the window and looks outside, quietly taking a breather. Her hands rest gently over a CLOSED book on her lap. Preserve that resting pose and all lower-body positions from IMAGE 1; soft calm youthful profile, no eyes staring at viewer, no new gestures.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
          "role": "edit/reference source",
          "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-1e0fc67f-1fd4-45cf-aa70-ae2c3280e9ce.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-rest-mother.png",
      "outputSha256": "0efb7ba53e3da497ee27750b026a10a162a3b9dbb65bd36e891d8a0d1b53dca2",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1888290,
      "declaredOutputSha256": "0efb7ba53e3da497ee27750b026a10a162a3b9dbb65bd36e891d8a0d1b53dca2",
      "transparentBackground": false,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-anon-anon-play-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
      "prompt": "Use case: identity-preserve. EDIT INPUT IMAGE 1, the approved full-frame scene and exact pose. INPUT IMAGE 2 is ONLY the Chihaya Anon character-identity reference. Replace Sakiko in IMAGE 1 with Chihaya Anon from BanG Dream! It's MyGO!!!!! while preserving the original complete 1536x1024 canvas, fixed camera, room, window frame, cushion front edge, seat, bookshelf, plants, floor, perspective and lighting. Keep the exact torso location, seated pelvis contact, leg angles and both complete shoes at the pixel positions in IMAGE 1. No crop, no zoom, no recentering, no camera or room movement. Anon identity comes from IMAGE 2: very long soft pink hair, large gray-blue eyes, youthful lively delicate anime face, gray school blazer with white piping and gold buttons, white shirt, green striped necktie, gray plaid skirt, dark knee socks, brown loafers. Do not retain Sakiko's blue hair/navy cardigan. Preserve youthful anime age and light airy original painting, never a mature realistic woman. Keep the large quiet left wall/floor negative space exactly clear, no new plants, furniture, UI or lettering. Complete feet naturally contact the floor; seated body naturally contacts the cushion. No stickers, cutout outlines, halo, floating, extra characters, collage, borders, logos or watermarks. Output a complete coherent mother scene, same original 1536x1024 framing. Playful action from IMAGE 1: she holds a SMALL folded paper bird delicately between both hands near her chest, showing it with a small fresh lively smile and a little spark of amusement. Keep the gesture modest and natural, not broad flailing, exaggerated adult expression or generic wave. Preserve the exact seated pose and full leg/shoe positions from IMAGE 1.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
          "role": "edit/reference source",
          "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-d9498719-8fef-46f0-b980-43a079cc7391.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-play-mother.png",
      "outputSha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1896581,
      "declaredOutputSha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163",
      "transparentBackground": false,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-anon-anon-planning-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
      "prompt": "Use case: background-extraction. Produce a precise FULL-CANVAS RGBA ALPHA MASK for the exact seated character in this source image, not a newly composed illustration. Preserve EXACT original 1536x1024 framing and every original character x/y position, head/hair outline, pose, torso, skirt, both complete legs and both full shoes. No cropping, centering, scaling, moving or pose change. The person's entire silhouette and held objects must be a SOLID FULLY OPAQUE charcoal silhouette; interior face/cloth colors are not needed, because software uses only this alpha to reveal the ORIGINAL mother-image RGB pixels. Do NOT render a new face or outfit. The room, seat/cushions, window, floor, wall, plants, bookshelf, blanket and all background/contact shadows must become genuinely transparent alpha=0. The original large empty left portion stays transparent. Trace the true silhouette with at most a 1-pixel antialiased edge; no soft mask cloud, no low-opacity halo, no glow, no broad feathering, no matte border, no shadow or background object included. Exact original 1536x1024 full canvas, complete feet preserved. Include the open notebook, all its pages/covers, and the thin pencil in the character's hands inside the opaque silhouette. Do not include the separate cup sitting on the cushion.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-planning-mother.png",
          "role": "edit/reference source",
          "sha256": "40869ee240a3c3a64f716d71cb282c08056630349707a64584fc37028449b006",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-7ffcd7c6-851b-48c2-855e-82c007e4e926.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-planning-figure.png",
      "outputSha256": "aef11fd261ef1d858a2e64ec99a5591c5ebef08b6a0adaa6dedc52867e74cfb2",
      "disposition": "selected",
      "notes": "Raw low-alpha fringe exists on planning/rest extraction and must be suppressed in the existing compositor. It is not accepted as a visible character halo.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 777386,
      "declaredOutputSha256": "aef11fd261ef1d858a2e64ec99a5591c5ebef08b6a0adaa6dedc52867e74cfb2",
      "transparentBackground": true,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-anon-anon-rest-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
      "prompt": "Use case: background-extraction. Produce a precise FULL-CANVAS RGBA ALPHA MASK for the exact seated character in this source image, not a newly composed illustration. Preserve EXACT original 1536x1024 framing and every original character x/y position, head/hair outline, pose, torso, skirt, both complete legs and both full shoes. No cropping, centering, scaling, moving or pose change. The person's entire silhouette and held objects must be a SOLID FULLY OPAQUE charcoal silhouette; interior face/cloth colors are not needed, because software uses only this alpha to reveal the ORIGINAL mother-image RGB pixels. Do NOT render a new face or outfit. The room, seat/cushions, window, floor, wall, plants, bookshelf, blanket and all background/contact shadows must become genuinely transparent alpha=0. The original large empty left portion stays transparent. Trace the true silhouette with at most a 1-pixel antialiased edge; no soft mask cloud, no low-opacity halo, no glow, no broad feathering, no matte border, no shadow or background object included. Exact original 1536x1024 full canvas, complete feet preserved. Include the closed book on the character's lap and both resting hands inside the opaque silhouette. Preserve the exact window-facing head/hair silhouette.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-rest-mother.png",
          "role": "edit/reference source",
          "sha256": "0efb7ba53e3da497ee27750b026a10a162a3b9dbb65bd36e891d8a0d1b53dca2",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-c3f134e7-36c0-475b-b1f3-a06c66bedfd1.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-rest-figure.png",
      "outputSha256": "2bfed206f6736453655e2e2bbedf633b386765c1e36ed0ce8a25a918e00bc956",
      "disposition": "selected",
      "notes": "Raw low-alpha fringe exists on planning/rest extraction and must be suppressed in the existing compositor. It is not accepted as a visible character halo.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 713788,
      "declaredOutputSha256": "2bfed206f6736453655e2e2bbedf633b386765c1e36ed0ce8a25a918e00bc956",
      "transparentBackground": true,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-anon-anon-play-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
      "prompt": "Use case: background-extraction. Make an RGBA alpha extraction mask from this exact source. MANDATORY OUTPUT SIZE IS 1536 pixels wide by 1024 pixels high, identical to the input. Keep every full-frame transparent column and row, including the empty leftmost columns. Do not auto-trim even ONE pixel, do not crop to 1535, do not recenter, resize, zoom or shift. The exact original seated Anon silhouette remains at its source x/y coordinates: long hair, head, torso, uniform/skirt, both hands with the small folded paper bird, complete legs/socks and BOTH complete loafers. Represent only the person and held paper bird as a fully opaque solid charcoal silhouette; interior face/colors are irrelevant because software uses ONLY this alpha mask with the ORIGINAL mother RGB. Every room, seat, cushion, blanket, wall, window, plant, floor and shadow pixel is genuinely transparent alpha=0. No background cloud, glow, halo, drop shadow, broad feathering or matte; only a crisp silhouette with minimal single-pixel antialiasing on its true edge. The whole large left negative-space region remains empty transparent, but its full pixel canvas width must be preserved. Exact original 1536x1024 RGBA, no trim, no repositioning.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-play-mother.png",
          "role": "edit/reference source",
          "sha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-a8e2fc6b-e09c-461f-8e5e-4204a497a979.png",
      "outputPath": "src/renderer/assets/companion/scenes/anon-play-figure.png",
      "outputSha256": "6eea00deeee69aec76ee14bcc2f601be465b382a022c6f2357d1acbbee26135a",
      "disposition": "selected",
      "notes": "Raw low-alpha fringe must be suppressed by the existing compositor; this is a mask, not accepted direct-display character RGB.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 724376,
      "declaredOutputSha256": "6eea00deeee69aec76ee14bcc2f601be465b382a022c6f2357d1acbbee26135a",
      "transparentBackground": true,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-anon-anon-play-figure-discarded-1535",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
      "prompt": "Use case: background-extraction. Produce a precise FULL-CANVAS RGBA ALPHA MASK for the exact seated character in this source image, not a newly composed illustration. Preserve EXACT original 1536x1024 framing and every original character x/y position, head/hair outline, pose, torso, skirt, both complete legs and both full shoes. No cropping, centering, scaling, moving or pose change. The person's entire silhouette and held objects must be a SOLID FULLY OPAQUE charcoal silhouette; interior face/cloth colors are not needed, because software uses only this alpha to reveal the ORIGINAL mother-image RGB pixels. Do NOT render a new face or outfit. The room, seat/cushions, window, floor, wall, plants, bookshelf, blanket and all background/contact shadows must become genuinely transparent alpha=0. The original large empty left portion stays transparent. Trace the true silhouette with at most a 1-pixel antialiased edge; no soft mask cloud, no low-opacity halo, no glow, no broad feathering, no matte border, no shadow or background object included. Exact original 1536x1024 full canvas, complete feet preserved. Include the small folded paper bird held between both hands inside the opaque silhouette, preserving its pointed folds exactly.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-play-mother.png",
          "role": "edit/reference source",
          "sha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-998aafcc-5101-43bf-9f99-9dc742cdbe09.png",
      "outputPath": null,
      "outputSha256": "c6b3c9595da873387ed2ace7e4249d5e74c6ce1e92b1cff05e9ef1ddcfcd143c",
      "disposition": "discarded",
      "notes": "Raw low-alpha fringe exists on planning/rest extraction and must be suppressed in the existing compositor. It is not accepted as a visible character halo.",
      "promptRecorded": true,
      "outputDimensions": [
        1535,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 341095,
      "declaredOutputSha256": "c6b3c9595da873387ed2ace7e4249d5e74c6ce1e92b1cff05e9ef1ddcfcd143c",
      "transparentBackground": true,
      "agentViewed": true,
      "primaryReview": "not-yet-recorded"
    },
    {
      "id": "additional-additional-poses-mutsumi-mutsumi-planning-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
      "prompt": "Use case: identity-preserve.\nAsset type: full scene mother illustration for a character already seated in an interactive room.\nInput image 1 is the EDIT TARGET, its EXACT 1536x1024 canvas, entire room, composition, wall, window mullions, bench, cushion, plant silhouettes, outside campus view, perspective, lighting, shadows, sitting support and character foot and knee coordinates are locked. Input image 2 is the CHARACTER IDENTITY and CLOTHING reference only, NOT a pose or layout reference.\nPrimary request: Replace ONLY the blue-haired girl in image 1 with Wakaba Mutsumi (若叶睦) from Ave Mujica, exactly recognizable from image 2: long straight pale grey-green hair, neat bangs and two small gold X hairpins, soft amber eyes, youthful fine 2D anime face, pale blue ruffled blouse with bow and blue plaid skirt as image 2. Preserve the exact leg pose and all shoe/foot positions of Image 1; dark stockings and dark brown loafers, both complete shoes remain in frame on the same floor contact points. Do not copy image 2's different leg pose. Keep the planning pose from Image 1: a small OPEN BLANK notebook in her lap, one hand supporting it and the other gently pointing to a blank page with a pencil, quietly considering a thought. Calm attentive look toward the viewer.\nStyle: beautifully drawn youthful delicate 2D anime, clean fine lines and cel-painted face, airy warm daylight and softly detailed environmental light, consistent with both inputs. No adult realism or mature photorealistic face. Natural hands with five fingers.\nComposition constraints: do not crop, zoom, recenter, resize or move the room or girl. Keep FULL 1536x1024 canvas. Keep the LEFT 60% as the same quiet empty warm wall for interface content. No plant enters left content region. Her entire head, held object, skirt, legs and complete shoes must fit exactly in original right-side sitting envelope, hip on the cushion, not floating.\nOnly change character identity/clothing and requested subtle expression; preserve action. No UI, no text, no typography, no watermark. Output one complete opaque scene.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
          "role": "edit/reference source",
          "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-2610e87c-b0a9-4ef7-b462-8229282a6379.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-planning-mother.png",
      "outputSha256": "da6e1e09beee1e7f1a08dbb63ae7880423187fb1b1899c853d86886afb6f0055",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1914482,
      "declaredOutputSha256": "da6e1e09beee1e7f1a08dbb63ae7880423187fb1b1899c853d86886afb6f0055",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-mutsumi-mutsumi-planning-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
      "prompt": "Use case: background-extraction.\nAsset type: character alpha silhouette/cutout aligned to its existing mother illustration.\nInput image is the EDIT TARGET and the ONLY source. Extract EXACTLY the already drawn seated Wakaba Mutsumi and her held object from this image; remove every background pixel to genuine transparency.\nCRITICAL exact canvas registration: output FULL 1536 x 1024 RGBA PNG, same canvas bounds, no cropping, no trimming, no recentering, no zooming and no resizing. Keep ALL character pixels in the EXACT SAME original x,y coordinates, scale, facial identity, pose and shape. Do not redraw, beautify, move, change expression, or invent the character.\nInclude ALL pale grey-green hair strands, hairpins, face, blouse, all arms/hands/fingers, blue plaid skirt, complete legs, dark socks and BOTH COMPLETE BROWN SHOES at the original floor-contact coordinates. Include the ENTIRE object she is holding (open notebook and pencil / closed book / small paper bird as actually present in this source). Treat held object and hands as part of the same foreground. Do not detach or omit any part.\nErase the complete room: wall, floor, window, light, outside view, bench, seat cushion, plants, pillows, blanket, shelf, other books and floor shadow. Background, floor contact shadow and holes around/between hair, arms and legs must be TRUE alpha=0, not a fake checkerboard, white paint or grey backdrop. Keep fine antialiased hair boundaries without opaque room-colored halo. Preserve the original character RGB wherever possible; this output's alpha will mask the original mother RGB. No new ground shadow, no text, no watermark. One transparent aligned cutout.",
      "inputs": [
        {
          "sourceName": "exec-2610e87c-b0a9-4ef7-b462-8229282a6379.png",
          "role": "edit/reference source",
          "sha256": "da6e1e09beee1e7f1a08dbb63ae7880423187fb1b1899c853d86886afb6f0055",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-fb693d5b-d213-4d35-82fc-bfea7129dd73.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-planning-figure.png",
      "outputSha256": "b673a787dff886d0ac21ca8d7a1c2760dfb26cc587682275924555b663475b9d",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1098866,
      "declaredOutputSha256": "b673a787dff886d0ac21ca8d7a1c2760dfb26cc587682275924555b663475b9d",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-mutsumi-mutsumi-rest-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
      "prompt": "Use case: identity-preserve.\nAsset type: full scene mother illustration for a character already seated in an interactive room.\nInput image 1 is the EDIT TARGET, its EXACT 1536x1024 canvas, entire room, composition, wall, window mullions, bench, cushion, plant silhouettes, outside campus view, perspective, lighting, shadows, sitting support and character foot and knee coordinates are locked. Input image 2 is the CHARACTER IDENTITY and CLOTHING reference only, NOT a pose or layout reference.\nPrimary request: Replace ONLY the blue-haired girl in image 1 with Wakaba Mutsumi (若叶睦) from Ave Mujica, exactly recognizable from image 2: long straight pale grey-green hair, neat bangs and two small gold X hairpins, soft amber eyes, youthful fine 2D anime face, pale blue ruffled blouse with bow and blue plaid skirt as image 2. Preserve the exact leg pose and all shoe/foot positions of Image 1; dark stockings and dark brown loafers, both complete shoes remain in frame on the same floor contact points. Do not copy image 2's different leg pose. Keep the restful pose from Image 1: a small CLOSED book held on her lap by both relaxed hands, shoulders resting naturally, head turned toward the window, quietly gazing outside.\nStyle: beautifully drawn youthful delicate 2D anime, clean fine lines and cel-painted face, airy warm daylight and softly detailed environmental light, consistent with both inputs. No adult realism or mature photorealistic face. Natural hands with five fingers.\nComposition constraints: do not crop, zoom, recenter, resize or move the room or girl. Keep FULL 1536x1024 canvas. Keep the LEFT 60% as the same quiet empty warm wall for interface content. No plant enters left content region. Her entire head, held object, skirt, legs and complete shoes must fit exactly in original right-side sitting envelope, hip on the cushion, not floating.\nOnly change character identity/clothing and requested subtle expression; preserve action. No UI, no text, no typography, no watermark. Output one complete opaque scene.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
          "role": "edit/reference source",
          "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-7023f7d3-d4ce-493d-9429-7e5d4c12d40b.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-rest-mother.png",
      "outputSha256": "1fa4d53d689abcc729067dd2c523df38f115df91ab96e88384e0f4c537f3af56",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1901924,
      "declaredOutputSha256": "1fa4d53d689abcc729067dd2c523df38f115df91ab96e88384e0f4c537f3af56",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-mutsumi-mutsumi-rest-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
      "prompt": "Use case: background-extraction.\nAsset type: character alpha silhouette/cutout aligned to its existing mother illustration.\nInput image is the EDIT TARGET and the ONLY source. Extract EXACTLY the already drawn seated Wakaba Mutsumi and her held object from this image; remove every background pixel to genuine transparency.\nCRITICAL exact canvas registration: output FULL 1536 x 1024 RGBA PNG, same canvas bounds, no cropping, no trimming, no recentering, no zooming and no resizing. Keep ALL character pixels in the EXACT SAME original x,y coordinates, scale, facial identity, pose and shape. Do not redraw, beautify, move, change expression, or invent the character.\nInclude ALL pale grey-green hair strands, hairpins, face, blouse, all arms/hands/fingers, blue plaid skirt, complete legs, dark socks and BOTH COMPLETE BROWN SHOES at the original floor-contact coordinates. Include the ENTIRE object she is holding (open notebook and pencil / closed book / small paper bird as actually present in this source). Treat held object and hands as part of the same foreground. Do not detach or omit any part.\nErase the complete room: wall, floor, window, light, outside view, bench, seat cushion, plants, pillows, blanket, shelf, other books and floor shadow. Background, floor contact shadow and holes around/between hair, arms and legs must be TRUE alpha=0, not a fake checkerboard, white paint or grey backdrop. Keep fine antialiased hair boundaries without opaque room-colored halo. Preserve the original character RGB wherever possible; this output's alpha will mask the original mother RGB. No new ground shadow, no text, no watermark. One transparent aligned cutout.",
      "inputs": [
        {
          "sourceName": "exec-7023f7d3-d4ce-493d-9429-7e5d4c12d40b.png",
          "role": "edit/reference source",
          "sha256": "1fa4d53d689abcc729067dd2c523df38f115df91ab96e88384e0f4c537f3af56",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-2779cebf-649c-48e5-b579-79332521a61f.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-rest-figure.png",
      "outputSha256": "09aa0d89edd6b3dcfd12c7fa0e7acb43be07fcc804790c5599a7578ac609715d",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1088821,
      "declaredOutputSha256": "09aa0d89edd6b3dcfd12c7fa0e7acb43be07fcc804790c5599a7578ac609715d",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-mutsumi-mutsumi-play-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
      "prompt": "Use case: identity-preserve.\nAsset type: full scene mother illustration for a character already seated in an interactive room.\nInput image 1 is the EDIT TARGET, its EXACT 1536x1024 canvas, entire room, composition, wall, window mullions, bench, cushion, plant silhouettes, outside campus view, perspective, lighting, shadows, sitting support and character foot and knee coordinates are locked. Input image 2 is the CHARACTER IDENTITY and CLOTHING reference only, NOT a pose or layout reference.\nPrimary request: Replace ONLY the blue-haired girl in image 1 with Wakaba Mutsumi (若叶睦) from Ave Mujica, exactly recognizable from image 2: long straight pale grey-green hair, neat bangs and two small gold X hairpins, soft amber eyes, youthful fine 2D anime face, pale blue ruffled blouse with bow and blue plaid skirt as image 2. Preserve the exact leg pose and all shoe/foot positions of Image 1; dark stockings and dark brown loafers, both complete shoes remain in frame on the same floor contact points. Do not copy image 2's different leg pose. Keep the play pose from Image 1: both hands delicately holding a small pale folded paper bird at chest height. Mutsumi has a quiet tiny self-satisfied smile, closed or barely parted lips, subtle pride in what she made, not an exaggerated excited open-mouth grin.\nStyle: beautifully drawn youthful delicate 2D anime, clean fine lines and cel-painted face, airy warm daylight and softly detailed environmental light, consistent with both inputs. No adult realism or mature photorealistic face. Natural hands with five fingers.\nComposition constraints: do not crop, zoom, recenter, resize or move the room or girl. Keep FULL 1536x1024 canvas. Keep the LEFT 60% as the same quiet empty warm wall for interface content. No plant enters left content region. Her entire head, held object, skirt, legs and complete shoes must fit exactly in original right-side sitting envelope, hip on the cushion, not floating.\nOnly change character identity/clothing and requested subtle expression; preserve action. No UI, no text, no typography, no watermark. Output one complete opaque scene.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
          "role": "edit/reference source",
          "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-8845f75f-04ca-4473-a857-6a3a4b40d240.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-play-mother.png",
      "outputSha256": "1ec0bbc66e6da81c9bd8ecc7ccb0987372fa63b6b5f84906dc57eab8cf51c625",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1912357,
      "declaredOutputSha256": "1ec0bbc66e6da81c9bd8ecc7ccb0987372fa63b6b5f84906dc57eab8cf51c625",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-mutsumi-mutsumi-play-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
      "prompt": "Use case: background-extraction.\nAsset type: character alpha silhouette/cutout aligned to its existing mother illustration.\nInput image is the EDIT TARGET and the ONLY source. Extract EXACTLY the already drawn seated Wakaba Mutsumi and her held object from this image; remove every background pixel to genuine transparency.\nCRITICAL exact canvas registration: output FULL 1536 x 1024 RGBA PNG, same canvas bounds, no cropping, no trimming, no recentering, no zooming and no resizing. Keep ALL character pixels in the EXACT SAME original x,y coordinates, scale, facial identity, pose and shape. Do not redraw, beautify, move, change expression, or invent the character.\nInclude ALL pale grey-green hair strands, hairpins, face, blouse, all arms/hands/fingers, blue plaid skirt, complete legs, dark socks and BOTH COMPLETE BROWN SHOES at the original floor-contact coordinates. Include the ENTIRE object she is holding (open notebook and pencil / closed book / small paper bird as actually present in this source). Treat held object and hands as part of the same foreground. Do not detach or omit any part.\nErase the complete room: wall, floor, window, light, outside view, bench, seat cushion, plants, pillows, blanket, shelf, other books and floor shadow. Background, floor contact shadow and holes around/between hair, arms and legs must be TRUE alpha=0, not a fake checkerboard, white paint or grey backdrop. Keep fine antialiased hair boundaries without opaque room-colored halo. Preserve the original character RGB wherever possible; this output's alpha will mask the original mother RGB. No new ground shadow, no text, no watermark. One transparent aligned cutout.",
      "inputs": [
        {
          "sourceName": "exec-8845f75f-04ca-4473-a857-6a3a4b40d240.png",
          "role": "edit/reference source",
          "sha256": "1ec0bbc66e6da81c9bd8ecc7ccb0987372fa63b6b5f84906dc57eab8cf51c625",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-b2600493-b7db-4cdf-a150-a53271aa30ae.png",
      "outputPath": "src/renderer/assets/companion/scenes/mutsumi-play-figure.png",
      "outputSha256": "dda6e81d2f88c1d909e4f662aac41e57586a7643300474637a796d8e5b8d7230",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1082459,
      "declaredOutputSha256": "dda6e81d2f88c1d909e4f662aac41e57586a7643300474637a796d8e5b8d7230",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-sakiko-sakiko-planning-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
      "prompt": "Production EDIT of the approved complete mother scene. Preserve the EXACT 1536x1024 full canvas, camera, room/furniture/window/bench geometry, character identity and youthful crisp 2D anime style. No UI, no letters or watermark. Sakiko Togawa, light blue hair and low dark ribbons, golden eyes, navy uniform and plaid skirt. Same seated hip contact around (86%,63%), all head/hair and both complete legs/shoes inside frame. LEFT 60% is empty ivory reading wall, natural plants only far-right. Keep original warm airy sunlight, realistic scene contact and directional light without making face photorealistic or adult. Change ONLY character's action/expression (and a small object in her hands); no room changes, no new occluders, no floating feet, no cutout/sticker outline. Planning together: her pose is distinct from chatting; sit upright slightly inclined toward the viewer, hold a small open cream notebook on her lap with one hand, the other hand thoughtfully points at the notebook. Quiet focused, perceptive youthful face with a tiny encouraging smile. The notebook has blank subtle rule lines only, no text. She is genuinely thinking with the user, not gesturing at an invisible button.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-c79ac814-d0a2-43a2-af17-d56f4e5cd75f.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
      "outputSha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1913685,
      "declaredOutputSha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-sakiko-sakiko-rest-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
      "prompt": "Production EDIT of the approved complete mother scene. Preserve the EXACT 1536x1024 full canvas, camera, room/furniture/window/bench geometry, character identity and youthful crisp 2D anime style. No UI, no letters or watermark. Sakiko Togawa, light blue hair and low dark ribbons, golden eyes, navy uniform and plaid skirt. Same seated hip contact around (86%,63%), all head/hair and both complete legs/shoes inside frame. LEFT 60% is empty ivory reading wall, natural plants only far-right. Keep original warm airy sunlight, realistic scene contact and directional light without making face photorealistic or adult. Change ONLY character's action/expression (and a small object in her hands); no room changes, no new occluders, no floating feet, no cutout/sticker outline. Quiet rest together: she leans her shoulder comfortably against the right cushion, hands relaxed on a closed book on her lap, gazes out the window to the left with a serene thoughtful expression. Natural relaxed seated posture, shoulders lower, mouth gently at rest. Clearly distinct from the hand-at-cheek chat pose and from reading. Modest school clothing and both feet naturally on the original floor.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-c8295e6d-2bc9-416e-9457-437e33c608f1.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
      "outputSha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1927013,
      "declaredOutputSha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-sakiko-sakiko-play-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
      "prompt": "Production EDIT of the approved complete mother scene. Preserve the EXACT 1536x1024 full canvas, camera, room/furniture/window/bench geometry, character identity and youthful crisp 2D anime style. No UI, no letters or watermark. Sakiko Togawa, light blue hair and low dark ribbons, golden eyes, navy uniform and plaid skirt. Same seated hip contact around (86%,63%), all head/hair and both complete legs/shoes inside frame. LEFT 60% is empty ivory reading wall, natural plants only far-right. Keep original warm airy sunlight, realistic scene contact and directional light without making face photorealistic or adult. Change ONLY character's action/expression (and a small object in her hands); no room changes, no new occluders, no floating feet, no cutout/sticker outline. A little shared creative delight: she holds a small warm-ivory origami bird at chest height, offering it toward the viewer with a shy but lively pleased smile, eyebrows softly lifted. Both hands anatomically correct and youthful face recognizable, small lively gesture rather than an exaggerated comic distortion. Same naturally seated lower body, complete shoes and room contact. This is her quietly proud playful moment after making something together.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-6a538478-3238-4d7b-8ec0-552113466130.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
      "outputSha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1940752,
      "declaredOutputSha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-sakiko-sakiko-planning-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
      "prompt": "Use case: background-extraction.\nAsset type: exact-position full-canvas RGBA alpha mask for the supplied approved mother illustration, NOT a new character illustration.\nInput image 1 is the edit target, sakiko-planning-mother.png.\nExtract ONLY the complete visible girl and the object held in her hands (the open cream notebook and pencil). Output a flat solid WHITE silhouette of precisely those pixels on a genuinely transparent background. No face details, color, scene, shadows, glow, checkerboard or outline. Opaque white inside the selected girl and held object, transparent outside, clean antialiased outer edge. Preserve small transparent gaps between hair strands, limbs and object.\nRegistration is mandatory: preserve EXACT 1536x1024 landscape canvas and the subject's original x/y position, shape, scale, seated pose and complete silhouette from the mother. The large left area stays transparent. Do NOT center, crop, enlarge, rotate, resize, redesign or re-pose anything. Retain every outer hair strand, both ribbons, all clothing, legs and both complete shoes in their original positions. The white region must follow the mother's visible contour, including held object. Exclude the room, bench, cushion, blanket, flowers, floor and the cast shadow.\nThis output is used ONLY as an alpha mask; frontend displays original mother pixels through the mask. Accuracy of original subject footprint and transparency matters, never add decorative RGB or a replacement character.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
          "role": "edit/reference source",
          "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-4436d18d-2a53-475e-9ef0-6bd02bb06773.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-planning-figure.png",
      "outputSha256": "6e16ba47e91b43c98e4abad9ff46f7619c212514ead32350507eb36ebe5465ed",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 875526,
      "declaredOutputSha256": "6e16ba47e91b43c98e4abad9ff46f7619c212514ead32350507eb36ebe5465ed",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-sakiko-sakiko-rest-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
      "prompt": "Use case: background-extraction.\nAsset type: exact-position full-canvas RGBA alpha mask for the supplied approved mother illustration, NOT a new character illustration.\nInput image 1 is the edit target, sakiko-rest-mother.png.\nExtract ONLY the complete visible girl and the object held in her hands (the closed book on her lap). Output a flat solid WHITE silhouette of precisely those pixels on a genuinely transparent background. No face details, color, scene, shadows, glow, checkerboard or outline. Opaque white inside the selected girl and held object, transparent outside, clean antialiased outer edge. Preserve small transparent gaps between hair strands, limbs and object.\nRegistration is mandatory: preserve EXACT 1536x1024 landscape canvas and the subject's original x/y position, shape, scale, seated pose and complete silhouette from the mother. The large left area stays transparent. Do NOT center, crop, enlarge, rotate, resize, redesign or re-pose anything. Retain every outer hair strand, both ribbons, all clothing, legs and both complete shoes in their original positions. The white region must follow the mother's visible contour, including held object. Exclude the room, bench, cushion, blanket, flowers, floor and the cast shadow.\nThis output is used ONLY as an alpha mask; frontend displays original mother pixels through the mask. Accuracy of original subject footprint and transparency matters, never add decorative RGB or a replacement character.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
          "role": "edit/reference source",
          "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-a513bbd0-6bc2-404b-9f95-f899dc467c69.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-rest-figure.png",
      "outputSha256": "2dfdfae7ef61f685bb9c0c337072b23dedb931d37f534f9986b8551cc38e6510",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 865682,
      "declaredOutputSha256": "2dfdfae7ef61f685bb9c0c337072b23dedb931d37f534f9986b8551cc38e6510",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-sakiko-sakiko-play-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
      "prompt": "Use case: background-extraction.\nAsset type: exact-position full-canvas RGBA alpha mask for the supplied approved mother illustration, NOT a new character illustration.\nInput image 1 is the edit target, sakiko-play-mother.png.\nExtract ONLY the complete visible girl and the object held in her hands (the small cream origami bird). Output a flat solid WHITE silhouette of precisely those pixels on a genuinely transparent background. No face details, color, scene, shadows, glow, checkerboard or outline. Opaque white inside the selected girl and held object, transparent outside, clean antialiased outer edge. Preserve small transparent gaps between hair strands, limbs and object.\nRegistration is mandatory: preserve EXACT 1536x1024 landscape canvas and the subject's original x/y position, shape, scale, seated pose and complete silhouette from the mother. The large left area stays transparent. Do NOT center, crop, enlarge, rotate, resize, redesign or re-pose anything. Retain every outer hair strand, both ribbons, all clothing, legs and both complete shoes in their original positions. The white region must follow the mother's visible contour, including held object. Exclude the room, bench, cushion, blanket, flowers, floor and the cast shadow.\nThis output is used ONLY as an alpha mask; frontend displays original mother pixels through the mask. Accuracy of original subject footprint and transparency matters, never add decorative RGB or a replacement character.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
          "role": "edit/reference source",
          "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-bb57f094-0b35-454d-ba8e-1557bc261f99.png",
      "outputPath": "src/renderer/assets/companion/scenes/sakiko-play-figure.png",
      "outputSha256": "1ecd4199c5b040eeca5c1c1f44f158ca70f3c2847fe6a69b9b30af16852daa1f",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 884789,
      "declaredOutputSha256": "1ecd4199c5b040eeca5c1c1f44f158ca70f3c2847fe6a69b9b30af16852daa1f",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-tomori-tomori-planning-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
      "prompt": "Use case: identity-preserve. Production scene EDIT, not a new composition. INPUT IMAGE 1 is the approved activity mother scene: preserve its exact 1536x1024 full landscape canvas, room, window, outside campus lake view, curtains, bench, cushion, floor, lighting, camera, perspective, character seat contact, complete legs and both shoes positions. Keep the LEFT 60% an empty warm ivory wall, no UI, no words or watermark. INPUT IMAGE 2 supplies ONLY the new character identity and clothing: Tomori Takamatsu from BanG Dream! MyGO!!!!!, short grey-brown bob hair with soft side bangs, amber-brown eyes, youthful clean 2D anime high-school face, grey school blazer with white piping, white shirt, green striped tie, dark pleated skirt, navy knee socks and brown loafers. Replace Sakiko in image1 with Tomori; no long blue hair, no ribbons, no blue Sakiko uniform. Lock image1 lower-body placement and room geometry, not image2's different pose. Preserve crisp elegant 2D anime linework and warm airy light, youthful proportions and original character recognition, not realistic skin, adult face, mature modelling or chibi. Full head, hair, hands, clothing, legs and shoes remain inside the canvas with the same natural room contact. Planning together: retain image1's seated planning action, small open blank cream notebook resting on her lap. One hand supports it and the other index finger lightly points thoughtfully at an empty page. Tomori's reserved, quietly attentive expression: a small concentrated smile, gently lowered eyebrows, thoughtfully considering the page and the person with her. Distinct from chatting; no stone or extra object from identity image2. Notebook pages may have faint blank rule lines but absolutely no writing.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
          "role": "edit/reference source",
          "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-ff8f7c05-8ae1-441f-8672-feab2daf3b17.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-planning-mother.png",
      "outputSha256": "04ad6b0bbb10a7a837f1d78297f9812f821c7aa0a072075099fd3492f6431e4e",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1855589,
      "declaredOutputSha256": "04ad6b0bbb10a7a837f1d78297f9812f821c7aa0a072075099fd3492f6431e4e",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-tomori-tomori-rest-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
      "prompt": "Use case: identity-preserve. Production scene EDIT, not a new composition. INPUT IMAGE 1 is the approved activity mother scene: preserve its exact 1536x1024 full landscape canvas, room, window, outside campus lake view, curtains, bench, cushion, floor, lighting, camera, perspective, character seat contact, complete legs and both shoes positions. Keep the LEFT 60% an empty warm ivory wall, no UI, no words or watermark. INPUT IMAGE 2 supplies ONLY the new character identity and clothing: Tomori Takamatsu from BanG Dream! MyGO!!!!!, short grey-brown bob hair with soft side bangs, amber-brown eyes, youthful clean 2D anime high-school face, grey school blazer with white piping, white shirt, green striped tie, dark pleated skirt, navy knee socks and brown loafers. Replace Sakiko in image1 with Tomori; no long blue hair, no ribbons, no blue Sakiko uniform. Lock image1 lower-body placement and room geometry, not image2's different pose. Preserve crisp elegant 2D anime linework and warm airy light, youthful proportions and original character recognition, not realistic skin, adult face, mature modelling or chibi. Full head, hair, hands, clothing, legs and shoes remain inside the canvas with the same natural room contact. Quiet rest together: retain image1's relaxed seated pose leaning gently into the right cushion, both hands relaxed on a small closed book on her lap; Tomori gazes out toward the left-hand window with a serene shy reflective face and soft closed mouth. Shoulders lowered and relaxed. No hand-to-cheek chat gesture, no rock or extra notebook from image2. Preserve the original complete legs, shoes and comfortable seat contact.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
          "role": "edit/reference source",
          "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-7fcdd8fc-a436-423a-9faa-ef05b9521904.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-rest-mother.png",
      "outputSha256": "b486e0a57a0c2849c5bb8724995e876cbf2a5722be901667a57a6016caf46f16",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1878304,
      "declaredOutputSha256": "b486e0a57a0c2849c5bb8724995e876cbf2a5722be901667a57a6016caf46f16",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-tomori-tomori-play-mother",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
      "prompt": "Use case: identity-preserve. Production scene EDIT, not a new composition. INPUT IMAGE 1 is the approved activity mother scene: preserve its exact 1536x1024 full landscape canvas, room, window, outside campus lake view, curtains, bench, cushion, floor, lighting, camera, perspective, character seat contact, complete legs and both shoes positions. Keep the LEFT 60% an empty warm ivory wall, no UI, no words or watermark. INPUT IMAGE 2 supplies ONLY the new character identity and clothing: Tomori Takamatsu from BanG Dream! MyGO!!!!!, short grey-brown bob hair with soft side bangs, amber-brown eyes, youthful clean 2D anime high-school face, grey school blazer with white piping, white shirt, green striped tie, dark pleated skirt, navy knee socks and brown loafers. Replace Sakiko in image1 with Tomori; no long blue hair, no ribbons, no blue Sakiko uniform. Lock image1 lower-body placement and room geometry, not image2's different pose. Preserve crisp elegant 2D anime linework and warm airy light, youthful proportions and original character recognition, not realistic skin, adult face, mature modelling or chibi. Full head, hair, hands, clothing, legs and shoes remain inside the canvas with the same natural room contact. A tiny shared creative moment: retain image1's naturally seated lower body and both hands at chest height holding a little warm-ivory origami bird. Tomori looks cautiously proud and a little happy: shy small smile, gently brightened amber eyes, careful hands protecting her small paper bird, no exaggerated open-mouthed Sakiko expression. The paper bird is clearly readable but small and delicate. No stone from identity image2. Preserve all complete fingers, lower body and shoes and the original room.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
          "role": "edit/reference source",
          "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        },
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-903e3ebe-f072-40dd-8a3a-0d28cb14e0bf.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-play-mother.png",
      "outputSha256": "564dc8ab57902326f7959bae49d5dd6882c7821bad6234493d6f5ec13dfab4c2",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGB",
      "outputBytes": 1827369,
      "declaredOutputSha256": "564dc8ab57902326f7959bae49d5dd6882c7821bad6234493d6f5ec13dfab4c2",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-tomori-tomori-planning-canvas-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
      "prompt": "Use case: background-extraction. Production RGBA SEGMENTATION MATTE / alpha silhouette extracted from the supplied approved complete scene. Exact output canvas 1536x1024, same pixel registration as this source image. Keep ONLY Tomori's entire seated character silhouette AND the small open notebook held on her lap as ONE natural foreground mask in the exact source positions. Include the complete head and every short hair edge, both hands and all fingers, every item of clothing, both full legs, socks and both complete shoes; preserve the original pose, scale, proportions and location exactly. Output inside the silhouette as pure WHITE RGB with opaque alpha; outside it must be truly transparent alpha=0, including the whole left wall and the spaces between limbs. Only narrow antialiasing on the exact silhouette edge. This is a full-canvas reusable mask, not a centered standalone portrait: NEVER crop, reposition, enlarge, redraw the pose, add padding or change the canvas aspect. Remove all room, window, bench, cushions, blanket, floor, background plants, light patches and all cast shadows from the mask. No background checkerboard painted in, no grey rectangle, no furniture, no labels, no drop shadow and no glow. The small held object is part of the mask; the bench and anything not held are NOT part. The character must remain at the exact far-right original seated position with the same complete shoes touching the original source floor coordinates.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-planning-mother.png",
          "role": "edit/reference source",
          "sha256": "04ad6b0bbb10a7a837f1d78297f9812f821c7aa0a072075099fd3492f6431e4e",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-a39d304f-6715-447d-827e-2c0936564aac.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-planning-figure.png",
      "outputSha256": "4411b3420da4f9762095226f68e34464e44bd3b9ef641970ab7ebf3fb31152cf",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 854057,
      "declaredOutputSha256": "4411b3420da4f9762095226f68e34464e44bd3b9ef641970ab7ebf3fb31152cf",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-tomori-tomori-rest-canvas-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
      "prompt": "Use case: background-extraction. Production RGBA SEGMENTATION MATTE / alpha silhouette extracted from the supplied approved complete scene. Exact output canvas 1536x1024, same pixel registration as this source image. Keep ONLY Tomori's entire seated character silhouette AND the small closed book held on her lap as ONE natural foreground mask in the exact source positions. Include the complete head and every short hair edge, both hands and all fingers, every item of clothing, both full legs, socks and both complete shoes; preserve the original pose, scale, proportions and location exactly. Output inside the silhouette as pure WHITE RGB with opaque alpha; outside it must be truly transparent alpha=0, including the whole left wall and the spaces between limbs. Only narrow antialiasing on the exact silhouette edge. This is a full-canvas reusable mask, not a centered standalone portrait: NEVER crop, reposition, enlarge, redraw the pose, add padding or change the canvas aspect. Remove all room, window, bench, cushions, blanket, floor, background plants, light patches and all cast shadows from the mask. No background checkerboard painted in, no grey rectangle, no furniture, no labels, no drop shadow and no glow. The small held object is part of the mask; the bench and anything not held are NOT part. The character must remain at the exact far-right original seated position with the same complete shoes touching the original source floor coordinates.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-rest-mother.png",
          "role": "edit/reference source",
          "sha256": "b486e0a57a0c2849c5bb8724995e876cbf2a5722be901667a57a6016caf46f16",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-afe05aa3-ed6b-499b-966f-ee62fedfcc88.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-rest-figure.png",
      "outputSha256": "9923490024439750cd0804934f12d88b3a1016c4ae69b6affb471608f4351bfc",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 862983,
      "declaredOutputSha256": "9923490024439750cd0804934f12d88b3a1016c4ae69b6affb471608f4351bfc",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-tomori-tomori-play-canvas-figure",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
      "prompt": "Use case: background-extraction. Production RGBA SEGMENTATION MATTE / alpha silhouette extracted from the supplied approved complete scene. Exact output canvas 1536x1024, same pixel registration as this source image. Keep ONLY Tomori's entire seated character silhouette AND the small origami bird held between her hands as ONE natural foreground mask in the exact source positions. Include the complete head and every short hair edge, both hands and all fingers, every item of clothing, both full legs, socks and both complete shoes; preserve the original pose, scale, proportions and location exactly. Output inside the silhouette as pure WHITE RGB with opaque alpha; outside it must be truly transparent alpha=0, including the whole left wall and the spaces between limbs. Only narrow antialiasing on the exact silhouette edge. This is a full-canvas reusable mask, not a centered standalone portrait: NEVER crop, reposition, enlarge, redraw the pose, add padding or change the canvas aspect. Remove all room, window, bench, cushions, blanket, floor, background plants, light patches and all cast shadows from the mask. No background checkerboard painted in, no grey rectangle, no furniture, no labels, no drop shadow and no glow. The small held object is part of the mask; the bench and anything not held are NOT part. The character must remain at the exact far-right original seated position with the same complete shoes touching the original source floor coordinates.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/tomori-play-mother.png",
          "role": "edit/reference source",
          "sha256": "564dc8ab57902326f7959bae49d5dd6882c7821bad6234493d6f5ec13dfab4c2",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-d7e17e9e-bc38-4541-a296-4e17e0edcb99.png",
      "outputPath": "src/renderer/assets/companion/scenes/tomori-play-figure.png",
      "outputSha256": "e3f3e5d3aaf4aeef9ad1f804d6f7fd40225f1c6138e42520a8ac8fe4024a654d",
      "disposition": "selected",
      "notes": "Only source and generation metadata; runtime checks remain separate.",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 854204,
      "declaredOutputSha256": "e3f3e5d3aaf4aeef9ad1f804d6f7fd40225f1c6138e42520a8ac8fe4024a654d",
      "transparentBackground": null,
      "agentViewed": true,
      "primaryReview": "confirmed"
    }
  ],
  "discardedCandidates": [
    {
      "id": "mutsumi-chat-figure-initial",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "mutsumi-matrix-generation.json",
      "prompt": "Use case: background-extraction. Input image is the EDIT TARGET. Extract ONLY Wakaba Mutsumi and the book she is touching from this exact mother scene onto a GENUINELY TRANSPARENT RGBA background, retaining the entire ORIGINAL 1536x1024 CANVAS. Critical: preserve her EXACT pixel position, scale, pose, silhouette, hair wisps, face, uniform, legs and both shoes, with the head, hip and feet at exactly the same coordinates as the source. Do NOT recenter, crop, zoom, rotate, move or redraw the character. Remove every pixel of room/background, cushion, pillows, blanket, sunlight, furniture, walls, floor and all cast shadows. Keep the green book as part of her foreground. Outside her silhouette alpha must be 0, inside body/clothes/book alpha must be solid opaque except natural anti-aliased edge/hair wisps. No colored matte, no halos or white/black/cyan outline, no checkerboard baked into pixels. This is a precise same-canvas foreground ALPHA MASK used to reveal original mother-scene RGB, not an opportunity to redraw her or rearrange the composition.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-04f393b2-21d9-462a-aee6-7458d09feaf7.png",
      "outputPath": null,
      "outputSha256": "fe1e7c827f3add33ac156edb5928eea5838bb25c6a41488a626c1801ef14b874",
      "disposition": "discarded",
      "notes": "discarded: initial RGB cutout expanded top contour and has low-opacity mist; not copied into active scene files",
      "promptRecorded": true,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1152361
    },
    {
      "id": "root-sakiko-chat-mask-retry-rejected",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/root-image-prompts.json",
      "prompt": null,
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
          "role": "edit/reference source",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "hashEvidence": "actual source bytes"
        }
      ],
      "generatedSourceName": "exec-e1d70060-b7ad-4256-8c73-30525265cc39.png",
      "outputPath": null,
      "outputSha256": "da2343af2b085f54bd47bb531040a66af68e84793440343464dacd242a2aeba7",
      "disposition": "discarded",
      "notes": "Primary agent inspected and rejected: extraction shifted/redrew the original person. Not copied into runtime. Exact retry prompt was not preserved; no reconstructed prompt is presented as original.",
      "promptRecorded": false,
      "outputDimensions": [
        1536,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 1199972,
      "primaryReview": "confirmed"
    },
    {
      "id": "additional-additional-poses-anon-anon-play-figure-discarded-1535",
      "inputBinding": "recorded",
      "tool": "built-in image_gen",
      "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
      "prompt": "Use case: background-extraction. Produce a precise FULL-CANVAS RGBA ALPHA MASK for the exact seated character in this source image, not a newly composed illustration. Preserve EXACT original 1536x1024 framing and every original character x/y position, head/hair outline, pose, torso, skirt, both complete legs and both full shoes. No cropping, centering, scaling, moving or pose change. The person's entire silhouette and held objects must be a SOLID FULLY OPAQUE charcoal silhouette; interior face/cloth colors are not needed, because software uses only this alpha to reveal the ORIGINAL mother-image RGB pixels. Do NOT render a new face or outfit. The room, seat/cushions, window, floor, wall, plants, bookshelf, blanket and all background/contact shadows must become genuinely transparent alpha=0. The original large empty left portion stays transparent. Trace the true silhouette with at most a 1-pixel antialiased edge; no soft mask cloud, no low-opacity halo, no glow, no broad feathering, no matte border, no shadow or background object included. Exact original 1536x1024 full canvas, complete feet preserved. Include the small folded paper bird held between both hands inside the opaque silhouette, preserving its pointed folds exactly.",
      "inputs": [
        {
          "sourceName": "src/renderer/assets/companion/scenes/anon-play-mother.png",
          "role": "edit/reference source",
          "sha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163",
          "hashEvidence": "Actual generation record SHA-256; compared with source bytes whenever locally available."
        }
      ],
      "generatedSourceName": "exec-998aafcc-5101-43bf-9f99-9dc742cdbe09.png",
      "outputPath": null,
      "outputSha256": "c6b3c9595da873387ed2ace7e4249d5e74c6ce1e92b1cff05e9ef1ddcfcd143c",
      "disposition": "discarded",
      "notes": "Raw low-alpha fringe exists on planning/rest extraction and must be suppressed in the existing compositor. It is not accepted as a visible character halo.",
      "promptRecorded": true,
      "outputDimensions": [
        1535,
        1024
      ],
      "outputMode": "RGBA",
      "outputBytes": 341095,
      "declaredOutputSha256": "c6b3c9595da873387ed2ace7e4249d5e74c6ce1e92b1cff05e9ef1ddcfcd143c",
      "transparentBackground": true,
      "agentViewed": true,
      "primaryReview": "not-yet-recorded"
    }
  ],
  "missingGenerationMetadata": [
    {
      "asset": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
      "missing": "source input binding/hash"
    }
  ],
  "additionalSourceParsingIssues": [],
  "reviewSummary": {
    "sceneAssetCount": 55,
    "primaryConfirmed": 55,
    "notYetRecorded": 0
  },
  "legacyReferenceLedger": "image-ledger.json",
  "primarySceneImageReview": {
    "date": "2026-10-23",
    "evidence": "Primary agent explicitly confirmed individually viewing all 55 selected scene mothers, masks and clean plates. The original 31 hashes are bound to the earlier review snapshot; the additional 24 are bound to approved source logs with matching output hashes. Image review does not certify every runtime composition or drag combination.",
    "images": [
      {
        "path": "src/renderer/assets/companion/scenes/anon-chat-figure.png",
        "sha256": "52e9e9afcb1350ed697990948f1f72b01e6e61721972c96a5aec01e129defa78",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
        "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-night-figure.png",
        "sha256": "0c69505500b0c520d53da14912dc2e8fcea82778a778bf528374d6f9e74e3149",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-night-mother.png",
        "sha256": "b9e305ff5ffa70172e4b82356827fe5f1cdc8d6169938babdc6c92f672e3da51",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-planning-figure.png",
        "sha256": "aef11fd261ef1d858a2e64ec99a5591c5ebef08b6a0adaa6dedc52867e74cfb2",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
          "sha256": "aef11fd261ef1d858a2e64ec99a5591c5ebef08b6a0adaa6dedc52867e74cfb2"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-planning-mother.png",
        "sha256": "40869ee240a3c3a64f716d71cb282c08056630349707a64584fc37028449b006",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
          "sha256": "40869ee240a3c3a64f716d71cb282c08056630349707a64584fc37028449b006"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-play-figure.png",
        "sha256": "6eea00deeee69aec76ee14bcc2f601be465b382a022c6f2357d1acbbee26135a",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
          "sha256": "6eea00deeee69aec76ee14bcc2f601be465b382a022c6f2357d1acbbee26135a"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-play-mother.png",
        "sha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
          "sha256": "1d56312c5a35986d0d72cf0e881a47dc2bf47b7f72fe7877331cb88141a35163"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-reading-figure.png",
        "sha256": "7057de629858711a94073e4acaf1e98e7467d010b48f2a390ad765208a6e35a0",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-reading-mother.png",
        "sha256": "0c00d0e9986c055f0cc0c82dc17924be4fbb3ac58b99238b0db9d06e1b21dee9",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-rest-figure.png",
        "sha256": "2bfed206f6736453655e2e2bbedf633b386765c1e36ed0ce8a25a918e00bc956",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
          "sha256": "2bfed206f6736453655e2e2bbedf633b386765c1e36ed0ce8a25a918e00bc956"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-rest-mother.png",
        "sha256": "0efb7ba53e3da497ee27750b026a10a162a3b9dbb65bd36e891d8a0d1b53dca2",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-anon.json",
          "sha256": "0efb7ba53e3da497ee27750b026a10a162a3b9dbb65bd36e891d8a0d1b53dca2"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-chat-mask.png",
        "sha256": "4d362ecccd08097d158c069066f54a426005de35e9a4e2e1ea1902ae19e38498",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
        "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-night-mask.png",
        "sha256": "af225812d2b06bea83371cd4c9ca58c865eea12b2c321809cfcac87865abd113",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-night-mother.png",
        "sha256": "540250b1471009162ea06d18a02383617dd9217384b397802e5d703bbd472b0c",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-planning-figure.png",
        "sha256": "b673a787dff886d0ac21ca8d7a1c2760dfb26cc587682275924555b663475b9d",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
          "sha256": "b673a787dff886d0ac21ca8d7a1c2760dfb26cc587682275924555b663475b9d"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-planning-mother.png",
        "sha256": "da6e1e09beee1e7f1a08dbb63ae7880423187fb1b1899c853d86886afb6f0055",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
          "sha256": "da6e1e09beee1e7f1a08dbb63ae7880423187fb1b1899c853d86886afb6f0055"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-play-figure.png",
        "sha256": "dda6e81d2f88c1d909e4f662aac41e57586a7643300474637a796d8e5b8d7230",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
          "sha256": "dda6e81d2f88c1d909e4f662aac41e57586a7643300474637a796d8e5b8d7230"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-play-mother.png",
        "sha256": "1ec0bbc66e6da81c9bd8ecc7ccb0987372fa63b6b5f84906dc57eab8cf51c625",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
          "sha256": "1ec0bbc66e6da81c9bd8ecc7ccb0987372fa63b6b5f84906dc57eab8cf51c625"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-reading-mask.png",
        "sha256": "1c86b6383a2ac1f08108165d023ac1db9a6dc0d831bbfa3fb7101fa461643046",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-reading-mother.png",
        "sha256": "37d8ab16d454f67df285cb49e235a0be8c2636db2e7aa78ce8d30dc88b6c4295",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-rest-figure.png",
        "sha256": "09aa0d89edd6b3dcfd12c7fa0e7acb43be07fcc804790c5599a7578ac609715d",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
          "sha256": "09aa0d89edd6b3dcfd12c7fa0e7acb43be07fcc804790c5599a7578ac609715d"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-rest-mother.png",
        "sha256": "1fa4d53d689abcc729067dd2c523df38f115df91ab96e88384e0f4c537f3af56",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-mutsumi.json",
          "sha256": "1fa4d53d689abcc729067dd2c523df38f115df91ab96e88384e0f4c537f3af56"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/room-dusk-violet-background.png",
        "sha256": "72899c0eed17adb92851e7b49d90ca6dd7dfd0f24d893794ad6078934cb11028",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/room-morning-mist-background.png",
        "sha256": "f939241a81e28702192a28b64a43b7482ec34ced069fbc28c446fdbc72f8b315",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-chat-background.png",
        "sha256": "a7fba9c5a616bbde1e988dad41c11aa06c95ee44d7ef0c1271b9ec6913c26608",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-chat-figure.png",
        "sha256": "39e594b7a163fc0c5fa401ff1ede2f56914d7af727c64f81a83782dc15edc488",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-chat-mist-mother.png",
        "sha256": "b8907f7b3e25803a114755f5d0a6b5d06926742e5a7a1d06ba77daab7766fa63",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
        "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-chat-violet-mother.png",
        "sha256": "98cf42e8fe09d2972cb7702c1f52967117f938a3e8868e3f01fc15dfe459f419",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-night-background.png",
        "sha256": "c16a88c90c0bcdb4a03e42e80f1d39101837a4eacd12423f03803fbe74f375b4",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-night-figure.png",
        "sha256": "2f6464ba9ec52d61ebee1221bec44801024644040a8c64ce109fe1a094fecb19",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
        "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-planning-figure.png",
        "sha256": "6e16ba47e91b43c98e4abad9ff46f7619c212514ead32350507eb36ebe5465ed",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
          "sha256": "6e16ba47e91b43c98e4abad9ff46f7619c212514ead32350507eb36ebe5465ed"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-planning-mother.png",
        "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
          "sha256": "7c576d9d394a547b1246458bf43dad2b9b51e81501a0b956b3d9a8e5fb64ba39"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-play-figure.png",
        "sha256": "1ecd4199c5b040eeca5c1c1f44f158ca70f3c2847fe6a69b9b30af16852daa1f",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
          "sha256": "1ecd4199c5b040eeca5c1c1f44f158ca70f3c2847fe6a69b9b30af16852daa1f"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-play-mother.png",
        "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
          "sha256": "2d2d4af4f844324cb4eef5e0be2a1f740af603a34e86e85e071ae0c1dedce808"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-reading-background.png",
        "sha256": "ddaa0510c865611a61756d72219996d8a6b5f0bb5cb46f2c5c129fc9801b371d",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-reading-figure.png",
        "sha256": "cd602ca369fe3b2446808daa1ba2bdc7b49d8e321d1ebd2ddfdc1254bbf49f3f",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
        "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-rest-figure.png",
        "sha256": "2dfdfae7ef61f685bb9c0c337072b23dedb931d37f534f9986b8551cc38e6510",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
          "sha256": "2dfdfae7ef61f685bb9c0c337072b23dedb931d37f534f9986b8551cc38e6510"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-rest-mother.png",
        "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-sakiko.json",
          "sha256": "b81dc3b83282748936d31478262972719576c1f4a58097b9c0d0619ab86c2aa0"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-chat-figure.png",
        "sha256": "212026b8b235c6538b4edd11526ae75f854dfd9f2266c44004dfe8672886dcc2",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
        "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-night-figure.png",
        "sha256": "8b7e2bad87450ebe07c0aa8ca340738151eb1785e62054f54a03dec69ec8e276",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-night-mother.png",
        "sha256": "9b4ec44b0a0aa307a95525ad47be65627251fd8ed04e4fa53f6430d9f5f7aaa3",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-planning-figure.png",
        "sha256": "4411b3420da4f9762095226f68e34464e44bd3b9ef641970ab7ebf3fb31152cf",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
          "sha256": "4411b3420da4f9762095226f68e34464e44bd3b9ef641970ab7ebf3fb31152cf"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-planning-mother.png",
        "sha256": "04ad6b0bbb10a7a837f1d78297f9812f821c7aa0a072075099fd3492f6431e4e",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
          "sha256": "04ad6b0bbb10a7a837f1d78297f9812f821c7aa0a072075099fd3492f6431e4e"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-play-figure.png",
        "sha256": "e3f3e5d3aaf4aeef9ad1f804d6f7fd40225f1c6138e42520a8ac8fe4024a654d",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
          "sha256": "e3f3e5d3aaf4aeef9ad1f804d6f7fd40225f1c6138e42520a8ac8fe4024a654d"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-play-mother.png",
        "sha256": "564dc8ab57902326f7959bae49d5dd6882c7821bad6234493d6f5ec13dfab4c2",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
          "sha256": "564dc8ab57902326f7959bae49d5dd6882c7821bad6234493d6f5ec13dfab4c2"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-reading-figure.png",
        "sha256": "15118e336a357e314b2ec5b769dba16aa07674cfe6d8d6fd254d0afb0c8a0b73",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-reading-mother.png",
        "sha256": "f9a88876e460e0cc12db6e20a737cd43502403162f1709da1196a79227720d59",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "earlier-primary-review-snapshot"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-rest-figure.png",
        "sha256": "9923490024439750cd0804934f12d88b3a1016c4ae69b6affb471608f4351bfc",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
          "sha256": "9923490024439750cd0804934f12d88b3a1016c4ae69b6affb471608f4351bfc"
        }
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-rest-mother.png",
        "sha256": "b486e0a57a0c2849c5bb8724995e876cbf2a5722be901667a57a6016caf46f16",
        "primaryReview": "confirmed",
        "evidence": {
          "kind": "explicit-generation-record",
          "sourceRecord": "docs/implementation/2026-10-23-unified/additional-poses-tomori.json",
          "sha256": "b486e0a57a0c2849c5bb8724995e876cbf2a5722be901667a57a6016caf46f16"
        }
      }
    ]
  },
  "earlierSceneImageReviewSnapshot": {
    "date": "2026-10-23",
    "evidence": "Primary agent explicitly confirmed individually viewing all 31 current scene mothers, masks and clean plates through audit/new-scenes contact sheets. This confirms image review only, not every runtime composition or drag combination.",
    "images": [
      {
        "path": "src/renderer/assets/companion/scenes/anon-chat-figure.png",
        "sha256": "52e9e9afcb1350ed697990948f1f72b01e6e61721972c96a5aec01e129defa78"
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
        "sha256": "9613b668aa0cf1aad0fb928168fffaa50e04c8009184e155dfb5d9bffe4ae3db"
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-night-figure.png",
        "sha256": "0c69505500b0c520d53da14912dc2e8fcea82778a778bf528374d6f9e74e3149"
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-night-mother.png",
        "sha256": "b9e305ff5ffa70172e4b82356827fe5f1cdc8d6169938babdc6c92f672e3da51"
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-reading-figure.png",
        "sha256": "7057de629858711a94073e4acaf1e98e7467d010b48f2a390ad765208a6e35a0"
      },
      {
        "path": "src/renderer/assets/companion/scenes/anon-reading-mother.png",
        "sha256": "0c00d0e9986c055f0cc0c82dc17924be4fbb3ac58b99238b0db9d06e1b21dee9"
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-chat-mask.png",
        "sha256": "4d362ecccd08097d158c069066f54a426005de35e9a4e2e1ea1902ae19e38498"
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-chat-mother.png",
        "sha256": "c5403ee5a0543234f87e419bbe65c49e031cf55e922008f2d50d4619f86ed788"
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-night-mask.png",
        "sha256": "af225812d2b06bea83371cd4c9ca58c865eea12b2c321809cfcac87865abd113"
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-night-mother.png",
        "sha256": "540250b1471009162ea06d18a02383617dd9217384b397802e5d703bbd472b0c"
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-reading-mask.png",
        "sha256": "1c86b6383a2ac1f08108165d023ac1db9a6dc0d831bbfa3fb7101fa461643046"
      },
      {
        "path": "src/renderer/assets/companion/scenes/mutsumi-reading-mother.png",
        "sha256": "37d8ab16d454f67df285cb49e235a0be8c2636db2e7aa78ce8d30dc88b6c4295"
      },
      {
        "path": "src/renderer/assets/companion/scenes/room-dusk-violet-background.png",
        "sha256": "72899c0eed17adb92851e7b49d90ca6dd7dfd0f24d893794ad6078934cb11028"
      },
      {
        "path": "src/renderer/assets/companion/scenes/room-morning-mist-background.png",
        "sha256": "f939241a81e28702192a28b64a43b7482ec34ced069fbc28c446fdbc72f8b315"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-chat-background.png",
        "sha256": "a7fba9c5a616bbde1e988dad41c11aa06c95ee44d7ef0c1271b9ec6913c26608"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-chat-figure.png",
        "sha256": "39e594b7a163fc0c5fa401ff1ede2f56914d7af727c64f81a83782dc15edc488"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-chat-mist-mother.png",
        "sha256": "b8907f7b3e25803a114755f5d0a6b5d06926742e5a7a1d06ba77daab7766fa63"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-chat-mother.png",
        "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-chat-violet-mother.png",
        "sha256": "98cf42e8fe09d2972cb7702c1f52967117f938a3e8868e3f01fc15dfe459f419"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-night-background.png",
        "sha256": "c16a88c90c0bcdb4a03e42e80f1d39101837a4eacd12423f03803fbe74f375b4"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-night-figure.png",
        "sha256": "2f6464ba9ec52d61ebee1221bec44801024644040a8c64ce109fe1a094fecb19"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
        "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-reading-background.png",
        "sha256": "ddaa0510c865611a61756d72219996d8a6b5f0bb5cb46f2c5c129fc9801b371d"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-reading-figure.png",
        "sha256": "cd602ca369fe3b2446808daa1ba2bdc7b49d8e321d1ebd2ddfdc1254bbf49f3f"
      },
      {
        "path": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
        "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569"
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-chat-figure.png",
        "sha256": "212026b8b235c6538b4edd11526ae75f854dfd9f2266c44004dfe8672886dcc2"
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-chat-mother.png",
        "sha256": "3e9477a7e42c5751d396ef838938b679b3cccffef459353afaa0c6d65b26d120"
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-night-figure.png",
        "sha256": "8b7e2bad87450ebe07c0aa8ca340738151eb1785e62054f54a03dec69ec8e276"
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-night-mother.png",
        "sha256": "9b4ec44b0a0aa307a95525ad47be65627251fd8ed04e4fa53f6430d9f5f7aaa3"
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-reading-figure.png",
        "sha256": "15118e336a357e314b2ec5b769dba16aa07674cfe6d8d6fd254d0afb0c8a0b73"
      },
      {
        "path": "src/renderer/assets/companion/scenes/tomori-reading-mother.png",
        "sha256": "f9a88876e460e0cc12db6e20a737cd43502403162f1709da1196a79227720d59"
      }
    ]
  },
  "unknownOriginalReferenceBindings": [
    {
      "recordId": "root-pilot-cross-scenes",
      "outputSourceName": "exec-0db66a15-87b4-4b08-be46-388983f341ec.png",
      "boundary": "Original reference image input was not captured in the available record; no filename or hash has been guessed."
    },
    {
      "recordId": "root-sakiko-chat-mother",
      "outputSourceName": "exec-93ace784-4d66-4b27-893c-176c2051cbe6.png",
      "boundary": "Original reference image input was not captured in the available record; no filename or hash has been guessed."
    }
  ]
}
```

### O06 · `docs/implementation/2026-10-23-unified/root-image-prompts.json`

来源文件 SHA-256：`c184dabbc3f6955619c47d80e4cae99ba067f7f8164eb794bd0e7c5373c7cd4d`。以下为文件全文。

```json
{
  "tool": "built-in image_gen",
  "purpose": "在场统一场景，主代理指定与审查",
  "items": [
    {
      "name": "pilot-cross-scenes",
      "output": "exec-0db66a15-87b4-4b08-be46-388983f341ec.png",
      "prompt": "Use case: ui-mockup. Create the FIRST STANDARDIZATION PILOT for 在场, a warm Chinese companion desktop app. Input image is the approved STYLE/CHARACTER reference, NOT a pasted UI template. Keep its youthful 2D anime Sakiko Togawa from BanG Dream Ave Mujica: light blue long hair, two low side ribbons, golden eyes, modest navy school sweater and white bow, youthful compact facial structure, crisp anime linework, airy light, never mature photorealistic woman. Design one high-resolution 2-by-2 comparison sheet of FOUR desktop views all with EXACT identical 1440x900 layout grid, same 72px topbar, door outline 在场 top-left, central three-item pill 聊天 今天 留下 same coordinates, avatar/search same top-right. Each panel framed cleanly, no overlapping windows. Panel 1: daylight home, Sakiko naturally seated on real window bench at right x=83%, hips on bench y=68%, both legs/feet anatomically visible, warm cream left reading safe zone x=6-61%, title 回来啦。 and single composer. Panel 2: real reading workspace: document/chat 58:42 with slim functional divider, Sakiko SMALL in a scene inset at far right, not stealing content. Use very short correct math x'=a(t)x+f(t). Panel 3: night conversation SAME ROOM CAMERA and character identity, rain window with warm golden lamp, dark slate-plum left safe zone; her relaxed mug-holding seated pose is distinct. No daytime strip. Panel 4: today timeline minimal paper, real card trial at 17:15, previous time dotted, one small collision popover; Sakiko SMALL at window beyond content, looking at notebook. The role naturally yields space during work. Plants ONLY at the far right/top beyond x72%, NONE near left text. All buttons, headers, composers align across corresponding classes, restrained gold, no green UI. Warm modern Apple-level restraint and tactile paper, soft natural light and convincing spatial continuity. IMPORTANT: one coherent aesthetic, no extra sidebars, no crowded labels, no engineering status text, no unnecessary helper slogans. This is a real implementable design specification with distinct activity poses and comfortable whitespace. Produce an elegant and legible cohesive 2x2 sheet, not a marketing collage.",
      "status": "design reference; UI copy/math is not runtime data"
    },
    {
      "name": "sakiko-chat-mother",
      "output": "exec-93ace784-4d66-4b27-893c-176c2051cbe6.png",
      "prompt": "Production mother-scene illustration for an interactive layered companion room, NO UI and NO text. Wide landscape 1536x1024, fixed straight eye-level camera. Match the youthful clear-lined 2D anime Sakiko Togawa in reference image2 exactly, not a mature realistic woman. Reference1 is the APPROVED shared application style sheet, reference2 supplies crisp character design. A believable warm sunlit cream window nook overlooking a generic Chinese campus lake, small clock tower, gauze curtain, a long upholstered window bench at right, wooden bench base, patterned blue cushion, cream throw and a small side table with closed books. Sakiko with light blue hair, twin dark low side ribbons, amber-gold eyes, navy school sweater, white bow, gray-blue plaid pleated skirt, navy knee socks and brown loafers. She sits naturally at x=82% of image, hips visibly pressing cushion at y=63%, both legs and feet FULLY VISIBLE inside frame ending by y=94%, upper body y=21-63%. Relaxed affectionate-but-subtle smile, one hand lightly at cheek and one hand holding closed book on lap. Young anime face, compact gentle features, normal six-seven head anatomy. LEFT 60% of entire canvas is calm warm ivory wall with delicate natural window-light shadows, absolutely no characters, plants, objects, letters or interface; right window begins at x=64%. Sparse small natural leaves only top-right 12% and far right. No foreground plants intruding toward center. Elegant airy cinematic sunlight, warm ivory and gold, soft blue outdoors; consistent perspective and directional light. The complete person must be part of the original environment with accurate seating contact shadows. Image will be split into matching background and transparent figure layers after approval; avoid occluders crossing her body. All furniture geometry and feet remain readable. Do not crop head, legs or shoes. No sticker outline, glow, cyan edge, photorealism, adult face, oversized bust, green UI, watermark. Make this a finished exquisite anime film still whose generous negative-space composition supports real text over the left side.",
      "status": "approved production mother"
    },
    {
      "name": "sakiko-chat-mask",
      "output": "exec-5fe73896-fd30-4cae-8ff0-3aa2bad1e035.png",
      "prompt": "Precise background-extraction production EDIT. Target is the attached approved mother scene, 1536x1024. Extract ONLY Sakiko Togawa AND the closed book she holds on her lap onto a truly transparent RGBA canvas, keeping the EXACT FULL 1536x1024 canvas and EXACT original pixel position, scale, face, body, pose and complete shoes from the input. Character occupies approximately x58%-99%, head near x81% y14%, seated hips x87% y61%, feet near x65%-77% y94%. Do NOT recenter, do NOT enlarge, do NOT crop tightly, do NOT redraw her, do NOT change face, clothes, hair, pose or lighting. Everything else — ivory wall, window, campus, cushions, throw, floor, furniture, plants, cup, books on side table — must become fully transparent. Preserve only the character's original contact shadow if directly under her hips or shoes as a very subtle alpha shadow, not background patches. Fine natural hair alpha, crisp original anime lines, no cyan/fringe/magenta/white halo, no glow, no new outline, no visible checkerboard. This layer must composite over the mother-scene background at top-left (0,0) without any independent fitting or geometry adjustment. Preserve the exact original source geometry.",
      "status": "alpha only; generated RGB and halo rejected as visible artwork; runtime alpha table removes low-opacity halo and displays original mother pixels",
      "inputs": [
        "src/renderer/assets/companion/scenes/sakiko-chat-mother.png"
      ]
    },
    {
      "name": "sakiko-chat-mask-retry-rejected",
      "output": "exec-e1d70060-b7ad-4256-8c73-30525265cc39.png",
      "prompt": null,
      "inputs": [
        "src/renderer/assets/companion/scenes/sakiko-chat-mother.png"
      ],
      "disposition": "discarded",
      "status": "Primary agent inspected and rejected: extraction shifted/redrew the original person. Not copied into runtime. Exact retry prompt was not preserved; no reconstructed prompt is presented as original."
    }
  ]
}
```

### O07 · `docs/implementation/2026-10-23-unified/root-theme-prompts.json`

来源文件 SHA-256：`836318b63d2aaedf9f07690b1027b7993bfa27a0c20ba93163e1c7b909ad921c`。以下为文件全文。

```json
{
  "tool": "built-in image_gen",
  "input": "sakiko-chat-mother.png",
  "items": [
    {
      "output": "exec-a680df45-1cab-4db1-bb6e-28093c51471d.png",
      "canonical": "sakiko-chat-mist-mother.png",
      "prompt": "EDIT the approved mother illustration. Exact same 1536x1024 camera, room geometry, character pixel placement, seated pose and scale, window bench, fully visible legs and shoes, youthful Sakiko identity. No UI, no letters. Preserve anime crisp linework and original face, navy uniform. No plants inside left text safe zone, keep far-right plants. Change ONLY lighting/color/time atmosphere, not geometry or person. Create 晨雾蓝 morning mist palette: clear airy blue-white diffused early daylight, soft cool sky and a faint lakeside morning haze outside; ivory wall remains softly warm and readable, shadows gentler. The room should feel cool fresh and calm, not icy or desaturated. Skin naturally peach, golden eyes recognizable. Cohesive luminous blue and ivory, restrained warm honey wood. No green UI, no green tint. This is a finished production scene asset, not a side-by-side comparison."
    },
    {
      "output": "exec-92f5a813-e96a-4f4c-93a2-af3730b35db7.png",
      "canonical": "sakiko-chat-violet-mother.png",
      "prompt": "EDIT the approved mother illustration. Exact same 1536x1024 camera, room geometry, character pixel placement, seated pose and scale, window bench, fully visible legs and shoes, youthful Sakiko identity. No UI, no letters. Preserve anime crisp linework and original face, navy uniform. No plants inside left text safe zone, keep far-right plants. Change ONLY lighting/color/time atmosphere, not geometry or person. Create 暮色紫 golden dusk palette: sunset behind campus lake, warm peach clouds blending soft lavender sky, pale rosy-violet room shadows, small warm highlight on hair and hands, same furniture and youthful face. Left wall remains light cream-lilac, useful for dark reading text. All of the scene is one coherent dusk, never split day/night. Elegant lavender and rose-gold atmosphere, no strong saturated purple wash, no new lamp or geometry. Finished production scene asset."
    }
  ]
}
```

### O08 · `docs/implementation/2026-10-23-unified/sakiko-scene-source-prompts.json`

来源文件 SHA-256：`21b0c99277e9f38bdd7495c73df1993757aea9d034eaa8bfced8c1213e6e4089`。以下为文件全文。

```json
{
  "date": "2026-10-23",
  "tool": "image_gen__imagegen",
  "mode": "built-in EDIT",
  "recordMeaning": "Exact prompt strings transcribed from this agent's actual tool calls. Input/output files are identified by hashes and normalized references; no inferred or replacement prompts.",
  "canvas": [
    1536,
    1024
  ],
  "records": [
    {
      "id": "sakiko-reading-mother",
      "prompt": "Use case: identity-preserve. Asset type: production mother scene for Zaichang companion, reading state. EDIT the provided approved 1536x1024 master image, preserve its full exact canvas framing, camera, room perspective, window, window-seat cushion, bookshelf and floor geometry. This is the SAME room, SAME shot and SAME teenage anime Toyokawa Sakiko (BanG Dream! Ave Mujica/MyGO universe) with SAME youthful delicate face, amber eyes, long wavy pale blue hair with navy bows, navy cardigan, white ribbon, plaid skirt, knee socks and loafers. Change only her reading action: her head/eyes gently lowered to a naturally OPEN book held with BOTH hands in front of her lap. Keep her seated pelvis, torso location, seat contact, leg angles, both complete legs and both complete shoes at exactly the master positions. She quietly concentrates, age-appropriate anime facial proportions, fresh and alive, not a mature realistic woman. Retain airy warm afternoon light and soft illustrated light/shadows, high-end detailed anime environmental painting, not 3D or photorealism. Left 60% stays a quiet clear cream wall and floor safe area with NO plant objects, NO books, NO new furniture, NO UI, NO writing or lettering. Existing natural soft window light/shadow may remain. Any foliage remains only at far right/window edge in its original position. Preserve high quality hand anatomy and book perspective. No cropped feet, no floating, no outline glow, no added border, no text, no UI, no split scene. The output is a complete coherent scene, NOT a cutout or transparent figure. Exact original 1536x1024 canvas.",
      "referenced_image_paths": [
        "exec-93ace784-4d66-4b27-893c-176c2051cbe6.png"
      ],
      "transparent_background": false,
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      },
      "inputs": [
        {
          "path": "exec-93ace784-4d66-4b27-893c-176c2051cbe6.png",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "dimensions": [
            1536,
            1024
          ],
          "mode": "RGB",
          "bytes": 1975042
        }
      ],
      "output": {
        "generatedPath": "exec-9763b601-0a64-414f-b385-4c2aadabd1e1.png",
        "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGB",
        "bytes": 1923288,
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
        "projectSha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569"
      }
    },
    {
      "id": "sakiko-night-mother",
      "prompt": "Use case: lighting-weather and identity-preserve. Asset type: production mother scene for Zaichang companion, warm rainy NIGHT state. EDIT the approved input master, exact original 1536x1024 full canvas, same camera, room layout, window frame coordinates, window-seat cushion, bookshelf, perspective and body/seating footprint. This is the SAME youthful teenage anime Toyokawa Sakiko with the SAME delicate youthful facial design, amber eyes, pale blue long wavy hair, navy bows, navy cardigan, white ribbon, plaid skirt, knee socks and complete brown loafers. Change the entire scene coherently from daytime to rainy night: all window sky is deep blue-violet rainy nighttime, rain droplets on glass, quiet soft distant campus lights reflected on the lake. NO daytime blue sky, NO sunbeams, NO daylight/night dividing line, NO split-screen. A small warm-gold shaded table lamp on the far right bookshelf/side table is the natural warm key light. Soft cool rain fill, warm amber face and cushion light, grounded contact shadows, graceful detailed anime background, no photorealistic adult face. Her pelvis, torso placement, seated position, complete legs and both complete shoes remain in exactly the input positions. Change her arms naturally to cradle a small white porcelain mug in BOTH hands around her chest/lap; head angled gently toward the viewer, calm friendly interested expression, youthful anime proportions. Remove the book from her hands; keep the rest of room fixed. Left 60% is quiet uncluttered deep warm charcoal-violet wall and floor, clear safe area for future interface, no plant objects, no furniture, no text, no UI. Foliage stays only at the far right/window edge in the original locations. Avoid mature middle-aged realism, cropped shoes, floating body, sticker look, outlines, glow edges, text, watermark, collage. The output is the complete single continuous mother scene, not a cutout. Keep exact 1536x1024 framing.",
      "referenced_image_paths": [
        "exec-93ace784-4d66-4b27-893c-176c2051cbe6.png"
      ],
      "transparent_background": false,
      "review": {
        "agentViewed": true,
        "primaryAgentViewedAndApproved": true
      },
      "inputs": [
        {
          "path": "exec-93ace784-4d66-4b27-893c-176c2051cbe6.png",
          "sha256": "a04225b4e42780032029f89f7eb786a87407d1731fcc5d494fdef14d121b6882",
          "dimensions": [
            1536,
            1024
          ],
          "mode": "RGB",
          "bytes": 1975042
        }
      ],
      "output": {
        "generatedPath": "exec-9cd29833-2c21-464c-8a9d-60286e8c9ae8.png",
        "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGB",
        "bytes": 1975126,
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
        "projectSha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b"
      }
    },
    {
      "id": "sakiko-reading-figure",
      "prompt": "Use case: background-extraction. Extract ONLY Sakiko and the open book held in BOTH of her hands from this exact image onto genuinely transparent RGBA. CRITICAL REGISTRATION: output EXACT full original 1536x1024 canvas; leave the girl at EXACT original x/y coordinates, scale, seating pose, complete leg and both shoe positions. The left area stays fully transparent and empty. DO NOT CROP, DO NOT RECENTER, DO NOT resize/reframe. Preserve precisely the youthful face, all pale blue hair strands, bows, cardigan, skirt, skin, socks, both complete loafers, both hands and held open book from this input. Remove ALL room pixels: wall, floor, seat, cushions, blankets, lamp, plants, bookshelf, window, and contact shadows, making those pixels alpha=0. No backdrop of any color. Clean natural antialiased silhouette without any white halo, white outline, glow rim, matte contamination, shadow cloud, or feathered white border. Do not redraw or beautify her face or change body contour. Think of an exact full-frame alpha extraction aligned to the source image. The result will be used as a registration mask over ORIGINAL source pixels, so position, scale and silhouette accuracy are paramount.",
      "referenced_image_paths": [
        "src/renderer/assets/companion/scenes/sakiko-reading-mother.png"
      ],
      "transparent_background": true,
      "review": {
        "agentViewed": true,
        "use": "alpha mask only over original mother pixels",
        "limitation": "The generated RGBA contains a low-alpha halo. Its RGB is not accepted for direct character rendering; the compositor must remove the fringe and display the mother image's original pixels. Dominant body alpha is 253, not 255."
      },
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
          "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
          "dimensions": [
            1536,
            1024
          ],
          "mode": "RGB",
          "bytes": 1923288
        }
      ],
      "output": {
        "generatedPath": "exec-d6cd92e5-54fa-4a82-bd5e-89ed8acf45b0.png",
        "sha256": "cd602ca369fe3b2446808daa1ba2bdc7b49d8e321d1ebd2ddfdc1254bbf49f3f",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGBA",
        "bytes": 1160901,
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-reading-figure.png",
        "projectSha256": "cd602ca369fe3b2446808daa1ba2bdc7b49d8e321d1ebd2ddfdc1254bbf49f3f"
      }
    },
    {
      "id": "sakiko-night-figure",
      "prompt": "Use case: background-extraction. Extract ONLY Sakiko and the warm mug held in BOTH hands from this exact rainy-night image onto genuinely transparent RGBA. CRITICAL REGISTRATION: output EXACT full original 1536x1024 canvas, keep figure at EXACT source pixel x/y coordinates, original scale, head, torso, seat footprint, complete leg angles and both shoe positions. Leave large left portion fully transparent. DO NOT CROP, DO NOT RECENTER, DO NOT resize/reframe. Keep the precise youthful face, all pale blue hair, navy bows, cardigan, skirt, complete skin/socks/both full loafers, hands and held mug. Remove all room, seat, cushions, blankets, floor, wall, window, rain, light, plants, lamp, bookshelf and background shadows to alpha=0. Only the person and held mug remain. No white halo, white or black fringe, glow outline, matte contamination or drop shadow. No redrawing face/body, no invented edges. This will be a full-frame alpha registration mask over ORIGINAL source pixels, so exact position and silhouette matter more than creative rendering.",
      "referenced_image_paths": [
        "src/renderer/assets/companion/scenes/sakiko-night-mother.png"
      ],
      "transparent_background": true,
      "review": {
        "agentViewed": true,
        "use": "alpha mask only over original mother pixels",
        "limitation": "The generated RGBA contains a low-alpha halo. Its RGB is not accepted for direct character rendering; the compositor must remove the fringe and display the mother image's original pixels. Dominant body alpha is 253, not 255."
      },
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
          "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
          "dimensions": [
            1536,
            1024
          ],
          "mode": "RGB",
          "bytes": 1975126
        }
      ],
      "output": {
        "generatedPath": "exec-6cbbb5af-6b83-45c9-915d-30e234522c2a.png",
        "sha256": "2f6464ba9ec52d61ebee1221bec44801024644040a8c64ce109fe1a094fecb19",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGBA",
        "bytes": 1123607,
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-night-figure.png",
        "projectSha256": "2f6464ba9ec52d61ebee1221bec44801024644040a8c64ce109fe1a094fecb19"
      }
    },
    {
      "id": "sakiko-reading-background",
      "prompt": "Use case: precise-object-edit. Create a clean BACKGROUND PLATE from the input image by removing ONLY the entire seated anime girl and the open book she is holding. Inpaint the room naturally where the girl covered it: continuous original window seat with the same beige check cushion and supporting woodwork, original pillows, original warm wood floor under where both shoes were. Preserve the EXACT full 1536x1024 canvas, same fixed camera/perspective, and every existing window frame line, sill, window-seat cushion edge, bookshelf, throw blanket, wall and floor geometry at the SAME pixel positions. DO NOT crop, recenter, zoom, shift the window/seat, or redesign the room. Preserve original daytime lighting and original image everywhere outside the removed girl/book. The separate porcelain mug already on the cushion is part of the room and MUST remain at its original location. Left 60% stays the exact quiet clear cream wall/floor area without plants, writing or any added object. No girl or ghost silhouette, no human shadow left behind, no extra people, no UI, no text, no borders. Complete coherent empty room, original 1536x1024 framing.",
      "referenced_image_paths": [
        "src/renderer/assets/companion/scenes/sakiko-reading-mother.png"
      ],
      "transparent_background": false,
      "review": {
        "agentViewed": true,
        "limitation": "Seat, pillow and floor areas hidden by the original character are generated reconstruction, not recovered original pixels."
      },
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-reading-mother.png",
          "sha256": "de81d55db3281322bba7bcdd5f1263bebfe03efeeb5ccb12a37b9baec406a569",
          "dimensions": [
            1536,
            1024
          ],
          "mode": "RGB",
          "bytes": 1923288
        }
      ],
      "output": {
        "generatedPath": "exec-79ba2da0-782e-4076-a3da-cb885ce85742.png",
        "sha256": "ddaa0510c865611a61756d72219996d8a6b5f0bb5cb46f2c5c129fc9801b371d",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGB",
        "bytes": 1881443,
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-reading-background.png",
        "projectSha256": "ddaa0510c865611a61756d72219996d8a6b5f0bb5cb46f2c5c129fc9801b371d"
      }
    },
    {
      "id": "sakiko-night-background",
      "prompt": "Use case: precise-object-edit. Create a clean rainy-NIGHT BACKGROUND PLATE by removing ONLY the seated anime girl and mug held in her hands. Naturally reconstruct the beige check window-seat cushion, original pillows, woodwork and warm wooden floor hidden by her body and both shoes. CRITICAL: preserve EXACT original full 1536x1024 canvas, fixed camera, perspective, same window frame pixel lines, SAME window-seat cushion edge and position, same right bookshelf and warm gold table lamp, blanket and all room objects. NO crop, recenter, zoom or layout movement. Keep continuous coherent rainy nighttime across the whole window, cool dark blue-violet rain outside and the same warm amber indoor lamp light. Preserve the input image outside the removed person/held mug. Left quiet deep charcoal-violet wall/floor stays uncluttered with no plants or objects added. No ghost girl, no remaining body/shoe shadow, no people, no text, no UI, no dividing line. Output exact 1536x1024 original framing.",
      "referenced_image_paths": [
        "src/renderer/assets/companion/scenes/sakiko-night-mother.png"
      ],
      "transparent_background": false,
      "review": {
        "agentViewed": true,
        "limitation": "Seat, pillow and floor areas hidden by the original character are generated reconstruction, not recovered original pixels."
      },
      "inputs": [
        {
          "path": "src/renderer/assets/companion/scenes/sakiko-night-mother.png",
          "sha256": "fb122ec18512c7ae20f0a6bc65750138676f6a4619958cbb3bd91ad22036fc3b",
          "dimensions": [
            1536,
            1024
          ],
          "mode": "RGB",
          "bytes": 1975126
        }
      ],
      "output": {
        "generatedPath": "exec-9a342e10-1732-4f0c-9ccf-e6165ce45ab3.png",
        "sha256": "c16a88c90c0bcdb4a03e42e80f1d39101837a4eacd12423f03803fbe74f375b4",
        "dimensions": [
          1536,
          1024
        ],
        "mode": "RGB",
        "bytes": 1867337,
        "projectPath": "src/renderer/assets/companion/scenes/sakiko-night-background.png",
        "projectSha256": "c16a88c90c0bcdb4a03e42e80f1d39101837a4eacd12423f03803fbe74f375b4"
      }
    }
  ],
  "pathEncoding": "Repository input/output paths are repository-relative. Generated source inputs/outputs are their original exec-*.png basenames. Host workspace directories are intentionally omitted; hashes identify the exact files used."
}
```

### O09 · `docs/implementation/2026-10-23-unified/tomori-prompts.json`

来源文件 SHA-256：`b7b41758efc11fcb9f929c71722b9d7ebf53e54a4305672a3e5027b361fa88bf`。以下为文件全文。

```json
{
  "mother": {
    "reading": "Use case: identity-preserve. Edit target Image 1 is the approved 1536x1024 reading-room master. Image 2 is the exact character identity reference for Takamatsu Tomori (高松灯) from BanG Dream! It's MyGO!!!!!. Produce ONE full-canvas 1536x1024 anime scene, same camera, crop, window, pale blank left wall, lake and campus clock tower, window bench, cushions, floor, shelves, plants, and daylight as Image 1. Replace ONLY Sakiko, the long blue-haired girl, with the exact Tomori from Image 2: SHORT muted gray-purple bob, warm gold-brown eyes, soft clearly youthful original anime face, gray school blazer with white piping, white shirt, dark green striped necktie, dark pleated skirt, dark knee socks, brown loafers. No blue long hair, no adult or photorealistic face, no generic character. Match Image 1's seated reading pose, spatial footprint, hip contact on the bench, legs and complete shoes, book held naturally at lap, gentle absorbed reading expression. Tomori is leaning toward the open book while keeping the entire left 55% clear. Preserve the approved room and its warm soft anime linework and light exactly; do not redesign furniture, move the sitter, zoom, crop, add interface, text, logos, or extra people. Whole character physically seated with matched perspective, contact shadow and sunlight, no floating feet or sticker look.",
    "night": "Use case: identity-preserve. Edit target Image 1 is the approved 1536x1024 rainy-night room master. Image 2 is the exact character identity reference for Takamatsu Tomori (高松灯) from BanG Dream! It's MyGO!!!!!. Produce ONE full-canvas 1536x1024 anime scene at the identical camera, crop, window, clear left wall, rainy lake and campus clock tower, bench, cushions, floor, bookshelf and warm table lamp of Image 1. Change ONLY the long blue-haired Sakiko into the exact youthful Tomori of Image 2: short muted gray-purple bob haircut, warm gold-brown eyes, small soft original anime face, gray blazer with white piping, white shirt, dark green striped necktie, pleated dark skirt, dark knee socks and brown loafers. Preserve her canonical teen anime proportions, no mature adult face or realism and no generic substitute. Keep the same seated footprint and bench hip contact as Image 1, both legs and complete shoes grounded; naturally cup a small warm ceramic mug in both hands at chest/lap level, with a quiet curious reassuring look. Match the warm lamp lighting on her right side, cool rainy window light and contact shadow. The left 55% remains an uninterrupted dark warm-plum wall for reading. Do not change the room, camera, scene geometry, lamp, weather, furniture, crop, or layout. No text, UI, logos, extra people, image borders, floating feet or cutout sticker edges."
  },
  "figure": {
    "chat": "Use case: background-extraction. Edit target is the attached 1536x1024 complete Tomori room master. Create ONE genuine transparent RGBA extraction at EXACTLY the same FULL 1536x1024 canvas size. Keep the girl Takamatsu Tomori and all items she is holding (her small notebook and the small stone in her hand), including every hair edge, hands, blazer, skirt, complete knee socks, and both complete shoes. Preserve her exact original image coordinates, size, pose, tilt and perspective. The head, hip contact point, knees and shoe soles must be at their original pixels. REMOVE every room/background pixel, bench, cushions, floor, window, plants, wall, lamp and furniture to alpha=0. No cast floor shadow. Keep ONLY the original character silhouette and held object opaque; allow anti-alias alpha only along edges. This is an extraction, NOT a redraw or character restyling. Absolutely do NOT crop, recenter, zoom, resize the character, shift her, change her anatomy, close gaps between legs, omit shoes, fill the background with white/gray/checkerboard, or add anything. The left roughly 55 percent of the image must remain completely transparent exactly as in the source framing. The alpha channel of this output will be used as a full-canvas mask over the ORIGINAL mother image pixels; exact source alignment is essential. Preserve transparent background in the actual PNG.",
    "reading": "Use case: background-extraction. Edit target is the attached 1536x1024 complete Tomori room master. Create ONE genuine transparent RGBA extraction at EXACTLY the same FULL 1536x1024 canvas size. Keep the girl Takamatsu Tomori and all items she is holding (the open book in both hands), including every hair edge, hands, blazer, skirt, complete knee socks, and both complete shoes. Preserve her exact original image coordinates, size, pose, tilt and perspective. The head, hip contact point, knees and shoe soles must be at their original pixels. REMOVE every room/background pixel, bench, cushions, floor, window, plants, wall, lamp and furniture to alpha=0. No cast floor shadow. Keep ONLY the original character silhouette and held object opaque; allow anti-alias alpha only along edges. This is an extraction, NOT a redraw or character restyling. Absolutely do NOT crop, recenter, zoom, resize the character, shift her, change her anatomy, close gaps between legs, omit shoes, fill the background with white/gray/checkerboard, or add anything. The left roughly 55 percent of the image must remain completely transparent exactly as in the source framing. The alpha channel of this output will be used as a full-canvas mask over the ORIGINAL mother image pixels; exact source alignment is essential. Preserve transparent background in the actual PNG.",
    "night": "Use case: background-extraction. Edit target is the attached 1536x1024 complete Tomori room master. Create ONE genuine transparent RGBA extraction at EXACTLY the same FULL 1536x1024 canvas size. Keep the girl Takamatsu Tomori and all items she is holding (the warm ceramic mug in both hands), including every hair edge, hands, blazer, skirt, complete knee socks, and both complete shoes. Preserve her exact original image coordinates, size, pose, tilt and perspective. The head, hip contact point, knees and shoe soles must be at their original pixels. REMOVE every room/background pixel, bench, cushions, floor, window, plants, wall, lamp and furniture to alpha=0. No cast floor shadow. Keep ONLY the original character silhouette and held object opaque; allow anti-alias alpha only along edges. This is an extraction, NOT a redraw or character restyling. Absolutely do NOT crop, recenter, zoom, resize the character, shift her, change her anatomy, close gaps between legs, omit shoes, fill the background with white/gray/checkerboard, or add anything. The left roughly 55 percent of the image must remain completely transparent exactly as in the source framing. The alpha channel of this output will be used as a full-canvas mask over the ORIGINAL mother image pixels; exact source alignment is essential. Preserve transparent background in the actual PNG."
  }
}
```

### O10 · `docs/implementation/2026-10-23/anon-scene-source-prompts.json`

来源文件 SHA-256：`3ab7ca31cf42bcb9c81d1d7ce507ed4357a262e5a57fa479dbd2ac7157b0e9f3`。以下为文件全文。

```json
{
  "date": "2026-10-23",
  "mode": "built-in image_gen",
  "identitySource": "src/renderer/assets/companion/scenes/anon-chat-mother.png",
  "prompts": {
    "reading": "Use case: identity-preserve. EDIT INPUT IMAGE 1 (Anon chat mother), using IMAGE 2 ONLY as an action/reading-state template. Exact original 1536x1024 canvas, same camera, room, window geometry, cushion, seat, bookshelf and floor. IMAGE 1 defines the ONE character identity: Chihaya Anon from BanG Dream! It's MyGO!!!!!, youthful teenage anime face with large gray-blue eyes, very long pale pink hair, gray school blazer with white piping and gold buttons, WHITE shirt and GREEN striped necktie, gray plaid skirt, dark knee socks, brown loafers. Preserve this exact identity and school outfit; do not copy Sakiko's blue hair or navy cardigan from image 2. Change ONLY Anon's action: lower her eyes gently toward a naturally OPEN book held in BOTH hands over her lap, quietly engaged with a slight interested smile. Preserve her head scale, torso and pelvis positions, original seat contact, complete leg angles and BOTH complete shoe positions from IMAGE 1; no repositioning. Light remains the same warm airy afternoon. Maintain fresh youthful hand-drawn anime proportions and detailed illustrated environmental light; not an adult realistic woman. The left safe area remains quiet cream wall and floor, no plants or added objects. Foliage remains only on far right in source positions. No UI, text, logos, borders, split image, glowing edge or floating/cropped feet. Complete coherent mother scene, exact same 1536x1024 framing.",
    "night": "Use case: lighting-weather and identity-preserve. EDIT INPUT IMAGE 1 (Anon chat mother), using IMAGE 2 only as the rainy-night LIGHTING and mug-action template. Output original 1536x1024 full canvas, same camera, window frame, seat cushion edge, bookshelf and floor geometry. Keep the exact youthful teenage ANON identity from IMAGE 1: long pale pink hair, gray-blue eyes, expressive delicate anime face, gray school blazer with white piping and gold buttons, white shirt, GREEN striped necktie, gray plaid skirt, dark knee socks and BOTH brown loafers. No Sakiko blue hair or navy cardigan. Keep Anon's torso, pelvis, seat contact, leg angles and complete shoe positions from IMAGE 1. Change arms to cradle a small porcelain mug with BOTH hands in front of her chest/lap, attentive friendly slightly playful youthful expression toward viewer. Transform the ENTIRE environment into continuous rainy nighttime, all window sky dark blue-violet, rain droplets and quiet campus/lake reflections, a small warm gold shaded lamp on far right in same position as IMAGE 2. Coherent soft amber interior light and cool rainy fill across whole image. Left clear wall becomes quiet deep warm charcoal-violet with no added plants/objects. No daylight, no sunbeams, no daytime/night boundary, no collage. Natural grounded shadows, no floating, no cropped feet, no white halo, no UI, no lettering. Same delicate high-end anime painting as inputs, never mature photorealism. Complete mother scene, no crop or reframing.",
    "chatFigureMask": "Use case: background-extraction. Create a precise FULL-CANVAS ALPHA MASK of only the seated anime girl and the book she holds in the source. This is a technical silhouette asset, NOT a new illustration. EXACT original 1536x1024 canvas; preserve every original x/y location, head scale, long hair silhouette, hands/book, skirt, complete legs and both complete shoes. DO NOT CROP, CENTER, RESIZE OR REPOSITION. All person and held-book pixels should be fully OPAQUE, with a plain flat solid charcoal RGB fill (interior details and face colors are unnecessary because software will use only the alpha channel to show ORIGINAL source pixels). Every room/background pixel must be alpha=0, including seat, cushions, floor, wall, window, bookshelf, plants and shadows. Preserve fine original outer hair silhouette with only a 1-pixel antialias edge. ABSOLUTELY NO white/colored halo, soft glow, fog, drop shadow, wide feathering or visible backdrop; sharp clean opaque silhouette against real transparency. Leave the entire original empty left region transparent. Output RGBA transparency, exact 1536x1024 full frame.",
    "readingFigureMask": "Use case: background-extraction. This output is a technical ALPHA SILHOUETTE, not an illustration. Extract the exact original outer silhouette of ONLY Anon and the object held in both hands. Output the EXACT ORIGINAL 1536x1024 canvas with every x/y position and scale UNCHANGED: head, long pink-hair outline, arms/hands, gray uniform, skirt, complete legs, dark socks and both entire loafers remain exactly where they were. NO crop, NO recenter, NO zoom or reframing. Fill the complete person-and-held-object silhouette with one solid fully opaque charcoal color, no interior face or texture is needed; software uses ONLY alpha over ORIGINAL mother-image pixels. Everything outside the silhouette must be genuinely transparent alpha=0, including wall, floor, seat, cushions, plants, window, lamp, bookshelf and shadows. Preserve fine hair silhouette with minimal 1-pixel antialiasing. No low-opacity fog, no feathering, no halo, no glow, no backdrop, no drop shadow, no extra shape around the shoes. The large left original safe region is entirely transparent. Keep full original framing, true RGBA output. The held object is the open book; include both open covers and pages inside the opaque silhouette.",
    "nightFigureMask": "Use case: background-extraction. This output is a technical ALPHA SILHOUETTE, not an illustration. Extract the exact original outer silhouette of ONLY Anon and the object held in both hands. Output the EXACT ORIGINAL 1536x1024 canvas with every x/y position and scale UNCHANGED: head, long pink-hair outline, arms/hands, gray uniform, skirt, complete legs, dark socks and both entire loafers remain exactly where they were. NO crop, NO recenter, NO zoom or reframing. Fill the complete person-and-held-object silhouette with one solid fully opaque charcoal color, no interior face or texture is needed; software uses ONLY alpha over ORIGINAL mother-image pixels. Everything outside the silhouette must be genuinely transparent alpha=0, including wall, floor, seat, cushions, plants, window, lamp, bookshelf and shadows. Preserve fine hair silhouette with minimal 1-pixel antialiasing. No low-opacity fog, no feathering, no halo, no glow, no backdrop, no drop shadow, no extra shape around the shoes. The large left original safe region is entirely transparent. Keep full original framing, true RGBA output. The held object is the small porcelain mug; include mug and handle with the hands, but DO NOT include the separate mug on the room cushion."
  },
  "constraints": {
    "canvas": [
      1536,
      1024
    ],
    "registration": "original full canvas; no crop or recenter",
    "figureUse": "alpha mask only over original mother pixels",
    "background": "shared Sakiko clean plates"
  },
  "outputs": {
    "readingMother": {
      "file": "src/renderer/assets/companion/scenes/anon-reading-mother.png",
      "generated": "exec-020559ab-4e31-46a4-aefe-172fb488c93b.png"
    },
    "nightMother": {
      "file": "src/renderer/assets/companion/scenes/anon-night-mother.png",
      "generated": "exec-d4f6e82a-8506-436e-9fde-feda603c5aac.png"
    },
    "chatFigureMask": {
      "file": "src/renderer/assets/companion/scenes/anon-chat-figure.png",
      "generated": "exec-70fe6e01-6a30-4164-bf6d-68b1ecd2ad90.png"
    },
    "readingFigureMask": {
      "file": "src/renderer/assets/companion/scenes/anon-reading-figure.png",
      "generated": "exec-9354a59e-a3d1-4178-b01a-09ba67b161b1.png"
    },
    "nightFigureMask": {
      "file": "src/renderer/assets/companion/scenes/anon-night-figure.png",
      "generated": "exec-c76314b4-1cc3-405f-9cb7-4b071a74249e.png"
    }
  },
  "review": {
    "agentViewedAllFive": true,
    "rootReview": "pending",
    "figureUse": "RGBA alpha mask only; RGB intentionally flat charcoal. Source mother's original pixels supply the rendered character. Raw low-alpha fringe must be removed by the compositor and is not accepted as a visible character halo.",
    "alpha": "Main body peaks 253/254, not 255; all three masks have genuinely transparent alpha-0 exterior."
  }
}
```

### O11 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-campus-day/manifest.json`

来源文件 SHA-256：`c533bd71014f4dc13807feb1093d5da3f6afae896d567384d1d30e9841de4097`。以下为文件全文。

```json
{
  "date": "2026-10-18",
  "generator": "OpenAI built-in image_gen",
  "use": "Private design reference for the existing Today view; not a runtime background, real user facts, external account observation, public review asset, app package asset, or proof of validation.",
  "selected": "前端视觉创新设计/统一图库/原图/界面设计-日程与今天/今日安排方案A-39562ed91be0.png",
  "files": [
    {
      "file": "前端视觉创新设计/统一图库/原图/界面设计-日程与今天/今日安排方案A-39562ed91be0.png",
      "bytes": 1655536,
      "sha256": "39562ed91be07555e5194030ec1847731295e5d2167ba6f214bc31c1da33b8f6",
      "originalFile": "assets/design/generated/2026-10-18-campus-day/campus-day-a.png"
    },
    {
      "file": "前端视觉创新设计/统一图库/原图/界面设计-日程与今天/今日安排方案B-ee59cd9a9cdc.png",
      "bytes": 1657785,
      "sha256": "ee59cd9a9cdcc7c241466c61cb7699ab076083b05cbc308c35b42e86585fe819",
      "originalFile": "assets/design/generated/2026-10-18-campus-day/campus-day-b.png"
    }
  ],
  "decision": "A keeps one continuous chronological list on wide and narrow layouts. Campus records are read-only with book marks; personal actions preserve their existing controls. B's dual lanes become separate narrow groups and its campus completion circles misrepresent the domain.",
  "implementationStatus": "Source implementation follows image generation; user requested deferring validation. No current rendering or interaction outcome claimed.",
  "prompts": [
    {
      "file": "前端视觉创新设计/统一图库/原图/界面设计-日程与今天/今日安排方案A-39562ed91be0.png",
      "prompt": "Use case: ui-mockup. Asset type: design study A for the existing Zaichang Windows personal companion app Today page, desktop plus a narrow-window inset. Create an elegant high fidelity Chinese interface mockup, warm ivory and warm grey, restrained muted gold, airy paper-like surfaces, calm serif heading with modern legible Chinese UI text. Existing light header: 在场, tabs 聊天 今天 留下, subtle avatar, Windows window controls. Heading 今天，慢慢安排。 and date 10月19日 周一, quiet week date strip. MAIN INNOVATION: one continuous chronological day spine combines campus classes/exams (thin warm-grey stripe and a small book icon, clearly labelled 课程 or 考试, no completion circles/no remove) and the person's own accepted plans (hollow completion circle, slightly warmer paper treatment). Real example content for layout only: 08:00–09:35 线性代数 东1-201 / 课程; 10:30–11:15 把上次的证明接着想 / 我的安排; 14:00–15:30 物理实验 东4实验楼 / 课程; 18:20 去东区食堂 / 我的安排, end unknown shown as 结束未定, no invented end. The page shows a concise enabled control 课表一起看 near the date, a discreet 看来源 expander, and a single 接着聊这一天 action below the timeline. Preserve blank space with no free-time amount, progress bar, productivity score or suggested sleep. Course rows are read-only; campus records are not copied into the personal calendar. No permanent sidebar, memory dashboard, long disclaimer, technical status, scope/hash/API/receipt, fake save confirmation, or notification. The narrow 500px inset uses the same single spine, wraps long course titles and location; actions remain comfortable. Other existing filters 全部 还没定时间 做过的事 and 搜索 can be quiet secondary controls. Keep the atmosphere of a familiar sunlit window with only a very subtle ambient wash, no huge character illustration, no heavy cards or crowded toolbar. Design a usable existing-product evolution, not a new dashboard.",
      "originalFile": "assets/design/generated/2026-10-18-campus-day/campus-day-a.png"
    },
    {
      "file": "前端视觉创新设计/统一图库/原图/界面设计-日程与今天/今日安排方案B-ee59cd9a9cdc.png",
      "prompt": "Use case: ui-mockup. Asset type: competing design study B for the EXISTING Zaichang personal companion Today page. Chinese desktop app plus narrow-window inset, warm ivory/warm gray, gentle window light, restrained muted gold, elegant serif heading and readable modern Chinese controls, no large character illustration. Header 在场 with 聊天 今天 留下 tabs. Title 今天，慢慢安排。 date 10月19日 周一 and the established week date strip. Explore an ALTERNATIVE to a single interleaved timeline: two adjacent quiet synchronized lanes, one shared time gutter, lane labels 学校里的安排 and 自己的安排. Campus class blocks read only with book icon, personal plan blocks with hollow completion circle. Example day for layout: 08:00–09:35 线性代数 东1-201 in campus lane; 10:30–11:15 把上次的证明接着想 in personal lane; 14:00–15:30 物理实验 东4实验楼 in campus lane; 18:20 去东区食堂 结束未定 in personal lane. No free/busy fill, no productivity numbers, no claim of free time. Control 课表一起看 and a concise 看来源 disclosure. Preserve existing personal editing/delete, calendar export and search as small quiet secondary controls, no task dashboard or permanent new sidebar. On narrow screen the lanes become two labelled groups while preserving clear date/time, avoiding tiny type. One simple 接着聊这一天 action. Keep the view calm and honest: no fake save/sync confirmation, engineering vocabulary, database identifiers, progress reports, empty-state tutorial, or long disclaimers. This is a design image with invented layout content, not runtime facts.",
      "originalFile": "assets/design/generated/2026-10-18-campus-day/campus-day-b.png"
    }
  ],
  "distribution": "Private project design reference only. Generated from text without source images or real student data; no new third-party redistribution license asserted.",
  "originalSelected": "assets/design/generated/2026-10-18-campus-day/campus-day-a.png"
}
```

### O12 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-chosen-windows/prompts.txt`

来源文件 SHA-256：`d7e4ef9d502742f3086543ff232455f58b9eca0877dd50b3a6676275aefdb630`。以下为文件全文。

```text
Built-in image_gen__imagegen. Both calls used transparent_background:false.

A — references: reference-current.png and ../2026-10-18-personal-memory/daily-rhythm-a.png

Create a high-fidelity UI design proposal for the existing Chinese personal companion desktop app 在场. Use case ui-mockup. The two attached images are design references: image 1 is the ACTUAL current running interface, keep its warm ivory windowlight background, small gold details, existing chat/today/keepsake navigation and ordinary conversation composer. Image 2 is prior planning visual direction; preserve its calm readable rhythm but avoid its decorative right column and overly large heading. This proposal implements a real backend ability: arrange ONLY explicitly chosen portions of several days, with the rest of life outside the plan. Design A: keep two date tabs and one selected day expanded, make the actual arranged windows elegantly visible on each tab and in the day heading. Main real example: 10月19日 周一 and 10月20日 周二; each has ONLY 14:00–17:00 as the chosen window. Monday actual rows:14:00–14:15 准备,14:15–15:45 读一章，再写几行想法,15:45–15:55 收尾,15:55–17:00 尚未安排. Monday work90 minutes, occupied115, free65. Tuesday work90, occupied135, free45. Do NOT display midnight or the next morning as available/free, do NOT make an all-day productivity dashboard. The content is inside the chat, not a new page. Title: 这几天，慢慢安排。 Exact concise Chinese labels: 安排 1小时30分 · 1小时5分 还没排 for Monday; 14:00 — 17:00 for day header. Add a small secondary narrow inset illustrating two disjoint chosen windows 09:00–10:00 and 11:00–12:00 with two distinct elegant scope marks, never joining the gap or calling it free. Thoughtful typography, comfortable whitespace, thin warm rules, pale lavender task blocks, no status chips, memory-engineering controls, progress scores, fake approval buttons, extra feature buttons, marketing/disclaimer copy or characters. Actual interactions remain selecting a date, selecting a time block to continue talking, and source details in quiet footer. Show a coherent final polished desktop screen with a small matching 430px mobile-width detail inset, readable Chinese content and retained composer. Let the image express a gentle relationship to time, not a paper productivity form.

B — reference: reference-current.png

Use case ui-mockup. Generate a second competitive design for the existing 在场 warm Chinese personal companion app. The attached current screenshot is the actual app; preserve warm windowlight, restrained gold accent, chat/today/keepsake navigation, translucent ivory conversation setting, and bottom composer. This version B must have a genuinely different temporal composition: two compact accordion day folds one above the other, rather than a horizontal two-date tab bar. Monday is open with one afternoon 14:00–17:00, Tuesday is folded but shows its chosen 14:00–17:00 range and accurate work/free balance. Show how separate permitted windows are two distinct spans without treating the gap/night as free. No full-day timetable, auto-filled week, progress meters, editing sidebar or memory engineering panel. Monday actual detailed rows:14:00–14:15 准备,14:15–15:45 读一章，再写几行想法,15:45–15:55 收尾,15:55–17:00 尚未安排. Monday balance 安排1小时30分 · 1小时5分还没排. Tuesday balance 安排1小时30分 · 45分钟还没排. The user said only these afternoon windows; the unchosen rest of life is not part of planning. Use typographic fold lines and quiet open space to express care for their own time; pale lavender work blocks, small gold markers, precise text. Title 这几天，慢慢安排。. This is inside the original chat, no new page or extra navigation, no unrelated right column, no inspirational slogan, no success badges/engineering status. Include a small narrow-width inset with the same day-fold structure and retained text/composer. Deliver a high-quality coherent UI concept with readable Chinese, understated editorial detail, and clear real interactions: open a day, select a time block and keep talking.
```

### O13 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-companion-evolution/prompts.md`

来源文件 SHA-256：`f97e08b90cfb839420c47e96ebe24e4f4924155b11a894041f584c1db3c0d72e`。以下为文件全文。

```text
# GPT Image design prompts · 2026-10-18

Built-in GPT Image. Four design references generated after the backend phase; exact prompts follow. Real content comes from the application, not these representative images.

## planning

Use case: ui-mockup. Generate a beautifully crafted high-fidelity desktop app design for the existing Chinese personal companion app 在场. Warm ivory, muted champagne gold, brown-gray text, extremely restrained Apple-inspired softness and subtle window light. A single desktop window with top brand 在场 and centered navigation 聊天 今天 留下. The current scene is a conversation with an inline interactive planning timeline, not a dashboard. User says 下午想读一会儿书，也想出去走走. Assistant says 留出一段完整的时间，也给散步留个位置. Small anime avatar in the message margin; content is the focus. Main elegant ivory paper panel titled 一段属于自己的时间. Design a graceful vertical time ribbon: 14:00 准备好书和笔记 for15min;14:15 读书 for90min with soft lavender accent;15:45 收一收 for10min;15:55 歇一会儿 for20min;16:15 给自己留白 for45min outlined and airy, never styled as task. Show exact start/end labels, ample reading room, no progress percentages. One selected block has a warm gold hairline and below panel a compact selection chip 14:15—15:45 · 读书 with close icon preceding the normal message composer 接着说…. Footer subtle sources 本机安排 · 今天14:00 with expand chevron, not engineering badges. Include compact second inset of same timeline narrowed to mobile width at bottom right of board to show wrapping (not a claim of a phone app). No giant character, no opaque dark modal, no sidebar service cards. Chinese labels readable, realistic implementable layout. This is a new design reference only, representative schedule content not real user data.

## environment

Use case: ui-mockup. Create a high-fidelity warm Chinese desktop companion app 在场 interface. Preserve a calm ivory paper, soft window light, restrained champagne-gold accent, dark warm legible typography and small anime-avatar margin. Top app brand 在场, centered navigation 聊天 今天 留下. Show a conversation asking 傍晚出去走走，哪个时候合适？ Under a brief human reply, a refined inline environmental time window titled 看看傍晚的天气, subtitle 紫金港 · 杭州时间. Selectable horizontally scrollable hourly columns 17:00 18:00 19:00 20:00, each with small sun/cloud icon, real-looking but representative temperatures 23°22°21°20°. Use a very subtle thin temperature curve with ample whitespace; selected18:00 gold outline. Under it a clear compact detail:18:00 ·22°C; 17:00—18:00 降水0.2mm ·概率35%. Never mix time instant with previous-hour rain. A second quieter section below is a separate air observation titled 空气，再看一眼 with PM2.5 12μg/m³ and US AQI42 individually named; separate source and retrieved time. No health recommendations. Footer provenance disclosure 查看时间与来源. Bottom chat composer has selection chip18:00·杭州 and placeholder 接着说…. Avoid dense metric dashboard or bright traffic light chips. Show warm human integrated information as shared conversational object, optional small anime avatar only, no huge heroine, no large disclaimer. Landscape desktop design, precise typography and spacing.

## persona

Use case: ui-mockup. Produce an exquisite high-fidelity existing personal desktop app 在场 companion settings design, warm ivory, window light, champagne accents, clear brown-black typography, quietly Apple-like. Full window with top nav 聊天 今天 留下. Title 陪伴的样子. Left55%: attractive thumbnail gallery of anime 丰川祥子 (long lavender hair, dignified), 若叶睦 (long pale green hair, quiet), an original male illustrated companion, a realistic companion and 只留一束光. Right45% tall warm window artwork of selected lavender-haired Sakiko reading (fully clothed knit top) with small bottom choices 窗边陪着 留在页角 暂时收起. Under left gallery, an elegant integrated short personality panel titled 聊起来，也像她. Two clear choices: 用祥子的相处方式 (端正、坚定，把关心落在细节里) and 保留我们现在的约定 (只换形象，留住你写过的性格). Compact primary button 采用这个角色 and quiet 编辑相处方式. This must feel like an intentional selection, no giant confirmation dialog and no technical details. Lower area quiet text link 带来一份角色设定. Include a small second inset showing that link opens a tasteful editable character-card preview sheet titled 先看看，再决定 with name, short personality prose, two fields 说话的方式 and 虚构背景, actions 放进编辑草稿 / 先不换. Readable Chinese labels, no rawJSON, no engines/configuration jargon, no feature checklist. Design for real rendering, ample whitespace. This image is a design reference, not an automatic import.

## calendar

Use case: ui-mockup. Create a high-fidelity warm desktop design for Chinese personal companion app 在场, existing Today page. Ivory paper, soft morning window light, muted gold, dark warm gray text, very restrained Apple-like polish. Brand 在场 top left, centered tabs 聊天 今天 留下. Heading 今天，慢慢安排。 subtitle 把重要的做完，也留一点属于自己的时间. Gentle week strip and two genuine-looking representative agenda rows 14:00 把常微分作业理一理 /18:20 去东区食堂. At top right of agenda toolbar a quiet calendar-arrow action 带到日历里. Show its opened small anchored ivory sheet without obscuring the entire page, around350px wide. Title 把安排带在身边. Short line 选一段日期，放进常用的日历。. Two neatly aligned date controls 从10月18日 到10月25日, clearly inclusive last day. Checkbox unchecked 包括我写的备注. One discreet factual line 这是一份当前安排的副本；以后有调整，可以再导出。. Primary warm gold button 保存日历文件; secondary 先不带走. A lower small alternate-state inset shows inline outcome 日历文件放好了，共2项安排 with a quiet secondary line 还有1项结束时间未确定，暂时没有放入. No fake cloud sync, no phone pairing, no QR code, no claims of account connection, no to-do score, no giant character on functional page. New image-first design board, not real personal calendar data. Beautiful balanced spacing and Chinese readability.
```

### O14 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-companion-session/prompt.md`

来源文件 SHA-256：`6cc6f693cd7b5914d224d23483c085f3ca66a312122e1310f43a37c8a39e97b7`。以下为文件全文。

```text
# 共同做事：原消息中的回来起点

工具：内置 GPT Image。后端生命周期与专用owner读取接通之后生成。A/B在同一合成内容下比较；采用A。图稿是设计输入，不是产品截图或体验验证。未计算文件哈希。

## 完整生成提示词

Use case: ui-mockup. Create a polished wide design comparison board for an existing Chinese personal desktop companion app named 在场. It is a calm place to return to, warm gray/ivory, restrained muted gold, generous whitespace, clear Chinese typography, translucent layered paper and window light. The design belongs INSIDE ONE EXISTING CHAT MESSAGE / discussion page, not a new dashboard, no permanent sidebars of features. Produce two genuinely different comparable layouts, A on left and B on right, both with the same realistic synthetic content and both showing a paused shared working session. Above each layout the tiny A/B label belongs to the presentation board, not product UI. Existing subtle navigation is only 聊天 / 今天 / 留下. User message: 我先去上课，下次接着吧。 Task title: 实验报告 · 讨论部分. Main remembered working explanation: 结果已经列好了，我们停在解释第二组数据为什么偏低。 Return point: 先把可能影响测量的条件挑出来，不急着重写整段。 Source materials: 实验记录.pdf · 第 3 页, 你刚才写的两句解释. Primary action text 接着这里, secondary text 先放着. Layout A: continuation within prose, a slender warm gold margin mark, the next starting sentence is the focal point, materials as understated expandable inline references; no nested cards. Layout B: an open notebook/paper passage relationship, original excerpt glimpsed beside an airy current working margin, with the continuation action tucked naturally at the bottom; still one coherent message, no box grid. Both must feel personal, unhurried, warm and ready to use; content takes priority over decoration. A very small abstract window-light motif may appear, no large character illustration. Precisely show the same short Chinese content, legible text, genuine reading hierarchy, comfortable desktop and a small narrow-window inset for each. Avoid timers, progress bars, task trees, completion percentages, engineering fields, source hashes, permissions panels, emotional scoring, notifications counts, literal memory management, checklists, arbitrary icons, loud gradients, fake metrics. Do not show any claim of completed learning or mastery. This is an original AI-generated UI design concept, not a screenshot of a running product.

## 采用关系

保留A的连续阅读和轻量原材料入口，把动作留在本段内容末尾。刚离开时不突出召回；回来明确继续时才强调起点。实际原资料打开后吸收B的双纸对照。材料、尝试和状态来自宿主owner投影；续接回到普通输入框，带精确owner引用，由原主模型继续处理。未实现图稿中的全局新窗口或合成示例数据。当前已获必要视觉启动／对照授权，隔离渲染与动效比较仍待完成。

## 透明纸张艺术素材：2026-10-19

参考为本目录已亲看A/B原图，工具为内置GPT Image edit，`transparent_background=true`。输出只提取空白纸面、页边和阴影，保存到 `assets/ui/companion-session-paper.png`。实际文字、材料和操作由应用渲染，未贴整张假UI。已读取艺术文件的RGBA与透明周边像素元数据，没有对图像使用Python编辑。

完整编辑提示词：

Edit the provided original AI-generated 在场 UI concept, using only the warm fibrous paper surfaces and page edges in the right-hand B notebook as material reference. Create a clean production UI ART ASSET: one single blank ivory-warm gray writing sheet, almost perfectly front-facing and rectangular, upright portrait, subtle handmade paper fibers, quiet natural corner irregularities, delicate layered bottom edge and very soft realistic translucent shadow. No text, no UI, no controls, no screen, no room, no objects, no clip, no icons, no drawn handwriting. The sheet surface must be evenly lit, pale warm neutral, with ample empty center suitable for real selectable HTML text placed on top. Keep paper texture tactile but extremely subtle, not yellow or dirty. The entire surrounding background must be genuinely transparent alpha, with the translucent shadow on alpha. Isolate only the sheet and its soft shadow; do not retain any part of the app window or room. This is a texture and page-edge asset that will be used behind REAL app content, never a screenshot or placeholder UI.
```

### O15 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-curiosity-invitation/manifest.json`

来源文件 SHA-256：`c5321eee95b11024f9c4601e041d2d50d9bc98bf41d163358f4d706b61fef8a7`。以下为文件全文。

```json
{
  "date": "2026-10-18",
  "purpose": "Private design reference for one content-first curiosity experience inside the existing conversation.",
  "generator": "Built-in GPT Image tool",
  "image": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/失物招领故事-7e1609c433e3.png",
  "source": "Generated in this task; no external reference image supplied.",
  "rights": "Generated for the user's private project. No third-party reference image or real user history was used. The design image is not redistributable runtime artwork.",
  "prompt": "Use case: ui-mockup.\nAsset type: private design reference for a new message-inside-conversation experience in the existing Chinese personal companion desktop app 在场.\nPrimary request: Make an intriguing, playful, genuinely content-first shared creative moment. The assistant has already brought one surprising little thing to play with, rather than asking the user to pick an interest or category. This is not a task dashboard, recommendation feed, questionnaire, rest reminder, or comfort card.\nScene/backdrop: A realistic straight-on desktop app screenshot, landscape 1536x1024, warm-grey stone and window-light atmosphere with restrained muted gold, familiar slender top navigation 聊天 / 今天 / 留下. No sidebar. Generous central conversation column and a quiet normal composer at bottom. Existing elegant literary typography and calm spacing, with an alive, slightly mischievous tone.\nComposition: The previous user line is visible. Below, the assistant's message contains one substantial open paper manuscript, not nested cards. The creative text is the main event: a strong short title, two highly readable story paragraphs, then one immediate playful question. A tiny quiet 创作 marker sits with the title. Below the text, three subdued inline actions 接着玩, 换个新东西, 今天先放下. Only the first has a fine muted gold arrow, none are giant CTA buttons. The paper uses editorial hierarchy, playful line breaks and wide margins, not a decorative illustration that dominates reading. Bottom composer remains normal and clearly continuous with the conversation.\nExact Chinese text:\nUser: 今天别按我以前喜欢的来，带我玩个新东西。\nAssistant opening: 好，给你一家只营业三分钟的奇怪小店。\nSmall marker: 一起编的 · 创作\nTitle: 失物招领处，今天收声音\nMain story paragraph 1: 你推开门，柜台上摆着一声“差点笑出来”、半句没说完的道歉，还有一只把雷声误吞掉的保温杯。\nMain story paragraph 2: 店员递给你一个空信封：“有人落下了一声喂。它已经在这儿等了三年，一听见脚步，就自己站起来。”\nFirst move: 你要先打开信封，还是把自己的声音借给它？\nBottom actions: 接着玩 ↗    换个新东西    今天先放下\nComposer placeholder: 接着说，我在听\nConstraints: Main body must take more space than controls. It should look usable and exciting enough to answer immediately. Restrained warm-grey/gold product style; no pastel sticker cards, excessive rounded boxes, source IDs, engineering status, labels about user personality, interest categories, activity schedule, streaks, reward stars, explanatory disclaimer wall or recommendation list. No real user data; all text is a synthetic creative design example only. No real-person or copyrighted character portrait.",
  "selected": "A ready creative piece is the main event; readable title and body lead into an immediately answerable invitation; small continue/another/put-aside actions belong at the end.",
  "not_adopted": "Room objects, generated avatar, app chrome and synthetic story text are not runtime assets or hardcoded user content. The paper's real grain, edges and light/shadow were extracted separately as a transparent runtime asset, documented in paper-asset.json. Stories, discoveries, puzzles, observations and co-creation remain equally possible; no fixed two-choice form.",
  "integration": "CuriosityInvitationView.tsx renders the current original Work option through the source-bound CuriosityScene factory. The image is design material only.",
  "verification": "Design and cleaned alpha art were inspected. In the shared isolated Electron, the normal owner/present_view output was observed on warm and dark surfaces; continue-to-composer, free draft text, exact selected passage, draft preservation after reopening the same conversation, and historical paper open/close motion were exercised. The first pass found narrow visible-paper margins and an initial scroll position below the heading. Wider typesetting, first-content anchoring, and the later selected low-light warm-paper/dark-ink night treatment are source updates still awaiting the next renderer observation. No business model, Luna, old-chapter functional check or new test runner was used.",
  "distribution": "Private design reference only; excluded from public review and application packaging. No user database was opened.",
  "originalImage": "assets/design/generated/2026-10-18-curiosity-invitation/content-first-play.png"
}
```

### O16 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-curiosity-invitation/paper-asset.json`

来源文件 SHA-256：`f1d7a704e0db62cd8c597cc31560ad6a6f50d39ba91de70bdd7e1de9fb31fded`。以下为文件全文。

```json
{
  "date": "2026-10-18",
  "generator": "Built-in GPT Image edit",
  "source": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/失物招领故事-7e1609c433e3.png, generated in the same private project; no external imagery or real user data.",
  "prompt": "Edit target: the attached generated 在场 app design. Extract the warm ivory paper manuscript material as a production UI art asset, not a screenshot.\nKeep only the large central paper's tactile fibers, very subtle warm natural grain, softly irregular cut edges, one barely visible offset second sheet and soft realistic cast shadow. Remove ALL Chinese letters, text, gold ornaments, icons, actions, borders, app chrome, room, people and background. The center must be completely blank, suitable for live HTML text. Preserve the original paper's quiet warm-grey and ivory look, tactile but not yellow or brown vintage parchment. Straight-on orthographic flat paper, no perspective distortion. Fill a portrait-oriented rectangle roughly 4:5 with generous transparent margin for the soft shadow. True alpha transparency around the whole paper and shadow; no checkerboard baked in, no solid background. This will be stretched behind a live multiline manuscript and must read as the same paper material as the original design. The asset must contain no UI, no content, no text whatsoever.",
  "runtimeAsset": "前端视觉创新设计/统一图库/原图/素材-纸面与装饰/手稿纸面-f476ae610e4c.png",
  "purpose": "Blank alpha manuscript material behind live accessible HTML. This contains no text, controls or fake UI.",
  "rights": "Generated derivative of the user's task-generated design image; reviewed visually for use as original redistributable application art. No third-party source content.",
  "adopted": "Real warm paper grain, irregular edges, slight second-sheet offset and cast shadow. The image is used by the actual component; Chinese story and controls remain live HTML.",
  "status": "Generated asset inspected. Current integrated rendering and motion comparison pending; no model or business tests.",
  "originalRuntimeAsset": "src/renderer/assets/curiosity/manuscript-paper.png",
  "originalSource": "content-first-play.png, generated in the same private project; no external imagery or real user data.",
  "originalSourceFilePath": "assets/design/generated/2026-10-18-curiosity-invitation/content-first-play.png",
  "canonicalSourceFile": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/失物招领故事-7e1609c433e3.png"
}
```

### O17 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-curiosity-invitation/paper-cleanup.json`

来源文件 SHA-256：`b4b9c197182ea51a3eb6608b4bf1af3b08252eef49dbd960622eb9b505e2d453`。以下为文件全文。

```json
{
  "generator": "Built-in GPT Image edit",
  "source": "Previous generated blank paper cutout; original design was generated for this same task.",
  "prompt": "Remove the entire shadow, glow, fringe and stray pixels around this paper. Output ONLY the physical blank ivory paper sheets as a clean cutout with absolutely no surrounding shadow at all. Keep the internal fibers and naturally uneven physical sheet edges and thin offset second sheet. The transparent area must contain zero isolated fragments, zero colored pixels, zero white chips, zero grey glow. The outer silhouette must be crisp anti-aliased neutral ivory-to-transparent. No chromatic red/yellow/green edge anywhere. Do not add a new shadow; a neutral CSS drop-shadow will be added later in the application. True transparent alpha outside the physical paper, completely blank center, no letters/symbols/UI/background. Preserve the paper's warm quiet material and shape.",
  "runtimeAsset": "前端视觉创新设计/统一图库/原图/素材-纸面与装饰/手稿纸面-f476ae610e4c.png",
  "change": "Removed the surrounding baked shadow/fringe instead of keeping colored halos. The actual component applies a neutral CSS drop-shadow. Physical sheet texture, irregular edges and thin second-sheet offset remain.",
  "rights": "Same task-generated original art, reviewed for private application redistribution; no third-party images or real user content.",
  "status": "Edited cutout and actual shared isolated Electron warm/night composites inspected. Detached debris and chromatic outer fringe no longer appeared. Subsequent visible-paper typesetting and warm night-light refinements remain pending the next renderer observation.",
  "originalRuntimeAsset": "src/renderer/assets/curiosity/manuscript-paper.png"
}
```

### O18 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-personal-memory/daily-rhythm-prompts.txt`

来源文件 SHA-256：`71467363b1570f7989ebcf9e3a7a7d9a7c8056888b4a4dbe9f23a1aa3e3887be`。以下为文件全文。

```text
Built-in image_gen prompts. Generated 2026-10-18. Image compositions only; representative planning content, not implementation evidence.

===== daily-rhythm-a.png =====
Use case: ui-mockup
Asset type: high-fidelity desktop product interface concept, Variant A, for the existing Chinese personal companion app 在场.
Primary request: Recompose the supplied planning reference into a polished multi-day planning rhythm interface. Preserve its warm windowlight, ivory paper, muted brown text and quiet gold interaction language. The second image is the identity/layout reference for the existing 今天 section. This is a genuine interface composition, not a marketing poster.

Input images: Image 1 is the existing planning screen, used as edit target and visual/material reference. Image 2 is the existing 今天 screen, used only as the navigation/identity reference. Rebuild the body for the new task; do not reproduce the old single-day chat card.

Canvas/composition: landscape 1536 by 1024. A large elegant desktop window on a very softly blurred warm sunlit desk background, with the actual app filling most of the image. Crisp, readable Chinese text and deliberate roomy spacing. No perspective distortion. Main app header shows a simple outlined door mark and 在场 at left, centered existing navigation 聊天 / 今天 / 留下, with 今天 selected in quiet gold, simple search and a tiny circular companion avatar at upper right. No large character illustration.

Content-led structure, Variant A: a quiet horizontal two-date strip is the primary navigation beneath the title. The main content is ONE chosen day's spacious vertical timeline, with dates never mixed into a long list. At top left show the small date range 10月19日—20日 and the page title 这两天，慢慢安排。 Below it place two date choices: 周一 19 is selected using a warm gold circle and a fine underline, 周二 20 is unselected. Under each date show the compact factual summary 读书90分钟 · 未安排1小时45分. These are text facts, not KPI cards or rings.

Chosen-day heading: 10月19日 周一. A quiet subline says 下午 14:00—18:00. Another small inline line says 读书90分钟 · 连同准备与休息2小时15分.
The chosen day timeline uses five clearly separated rows along a fine vertical thread, with all exact intervals and labels:
14:00—14:15, 准备好书和笔记, 15分钟.
14:15—15:45, 读书, 90分钟.
15:45—15:55, 收一收, 10分钟.
15:55—16:15, 歇一会儿, 20分钟.
16:15—18:00, 还未安排, 1小时45分.
Selected 读书 row: subtle lavender-warm paper fill, thin quiet gold outline. Other occupied rows: pale oat paper, low boundaries. Rest: pale sage. Last unarranged interval: airy open cream area with a light dashed edge, not a task with a completion checkbox. Keep the times visible and aligned with the rows. Do not imply free time equals guaranteed availability or energy; use the accurate label 未安排 only.
A restrained right-hand companion area can carry a single warm sentence 留下一段完整的时间，慢慢读。 and a tiny leaf drawing. It should remain mostly empty breathing room and must not become a sidebar of controls.
At the bottom of the app, the selected object is attached to conversation as a small contextual chip: 10月19日 14:15—15:45 · 读书 followed by a tiny x. Immediately below is the normal message composer with paperclip, placeholder 接着说…… and a gold send arrow. The chip proves that a real time block can be selected and continued in chat; do not add an explanatory tooltip or instructions.

Visual craft: tactile ivory paper, gentle windowlight at the edges, muted ink, warm gold, a small amount of lavender/sage, subtle grain, restrained hairline borders and soft shadows, elegant Chinese typography combining a delicate serif heading with clean highly readable body text. Content contrast must stay strong enough to read. Similar warmth and quiet intimacy as the reference; keep the original product's calm spaciousness.
Constraints: show only the exact requested real content, no developer terms, no API, queue, version, verified, pending, no memory-management controls, no permanent tool controls, no work scores, no progress bars, no checklists, no dashboard cards, no disclaimer paragraphs, no device mockup, no mobile service, no added slogan, no watermark. Do not label the image Variant A.

===== daily-rhythm-b.png =====
Use case: ui-mockup
Asset type: high-fidelity desktop product interface concept, Variant B, for the existing Chinese personal companion app 在场.
Primary request: Recompose the supplied planning reference into a polished multi-day planning rhythm interface using an intimate paper-spread composition. Preserve its warm windowlight, ivory paper, muted brown text and quiet gold interaction language. The second image is the identity/layout reference for the existing 今天 section. This must be a genuinely different information structure from a date-strip plus one timeline, while supporting the same actual content and task.

Input images: Image 1 is the existing planning screen, used as edit target and visual/material reference. Image 2 is the existing 今天 screen, used only as the navigation/identity reference. Rebuild the body for the new task; do not reproduce the old single-day chat card.

Canvas/composition: landscape 1536 by 1024. A large elegant desktop app window occupies most of a softly blurred warm sunlit desk setting. The UI is front-on, crisp, legible, with no perspective distortion. Main app header shows a simple outlined door mark and 在场 at left, centered existing navigation 聊天 / 今天 / 留下, with 今天 selected in quiet gold, simple search and a tiny circular companion avatar at upper right. No large character illustration.

Content-led structure, Variant B: two days appear together as a compact open paper spread with a fine central fold-like rule and generous whitespace, not separate dashboard cards and not a chronological soup. The selected Monday page is about two thirds of the content width and is expanded; the adjacent Tuesday page is about one third and is a legible compact day overview that can be selected. At top left show 10月19日—20日 and the title 这两天，慢慢安排。 A very small two-day leaf-shaped tab treatment or page-edge selection can indicate Monday selected, rather than a separate date strip.
Both day headings must be prominent: 10月19日 周一 on the expanded left, 10月20日 周二 on the compact right. Both have the same factual budget 下午 14:00—18:00. A fine short gold underline marks the selected Monday page.
Each day's quiet inline summary is 读书90分钟 · 未安排1小时45分. No statistics tiles, charts, rings, ratios or scores.

Expanded Monday page shows a clean vertical rhythm with exact content:
14:00—14:15, 准备好书和笔记, 15分钟.
14:15—15:45, 读书, 90分钟.
15:45—15:55, 收一收, 10分钟.
15:55—16:15, 歇一会儿, 20分钟.
16:15—18:00, 还未安排, 1小时45分.
The selected 读书 row has a subtle lavender-warm paper fill and a fine quiet gold outline. Preparation and tidying are pale oat, rest pale sage, the final unarranged interval is open airy ivory with a very subtle dashed boundary and sufficient visual space. No checkboxes.

Compact Tuesday page shows the SAME five real intervals and titles in a much lighter editorial treatment with aligned small times and generous readable text, not a fully duplicated set of boxed cards:
14:00—14:15 准备好书和笔记
14:15—15:45 读书 · 90分钟
15:45—15:55 收一收
15:55—16:15 歇一会儿
16:15—18:00 还未安排 · 1小时45分
The Tuesday overview is structurally distinct from Monday's expanded timeline: a quiet paper margin and slender rhythm thread, simple text rows, no selected row. All content fits without truncation. Keep the two days grouped by day, never alternating dates.
Show the full occupied span through the block structure; if space permits include the tiny factual line 连同准备与休息2小时15分 beneath each day's date, without creating a metric panel.
Do not imply that unarranged time guarantees real availability or energy; use the accurate label 未安排 only.

At the bottom, continuous across the spread, show the small selected-object conversation chip 10月19日 14:15—15:45 · 读书 followed by a tiny x, then the ordinary message composer with paperclip, placeholder 接着说…… and a gold send arrow. This expresses selecting a concrete time block to continue in chat without any instruction text. Keep the companion tiny/corner if present, with no extra side panel.

Visual craft: tactile ivory paper, warm edge windowlight, muted ink, quiet gold, restrained lavender and sage. Elegant Chinese headings, clean readable Chinese body text, refined aligned numerals. Subtle fine grain and shadows, no heavy nested cards. The paper-spread metaphor comes from proportions and shared page surface, not photorealistic notebook props. Calm, personal, literary, human; preserve existing 在场 identity and generous breathing room.
Constraints: no developer terms, no API, queue, version, verified, pending, no memory controls, no permanent tools or settings, no work scores, no progress bars, no checklists, no disclaimer paragraphs, no mobile mockup/service, no added slogan, no watermark. Do not label the image Variant B.
```

### O19 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-planning-comparison/prompt-v2.txt`

来源文件 SHA-256：`bed00aa226c0749fb38a8abebbc7fb701c9b9a9a3cdd016cf410b7ee6dc06620`。以下为文件全文。

```text
Edit target: the supplied 在场 planning-comparison UI mockup. Preserve every aspect of the existing image: the exact warm ivory paper, calm anime companion at the top, composition, full desktop layout, delicate Chinese serif typography, branch positions, tiny gold focus and shared horizontal timeline. Make ONLY TWO copy corrections, preserving all other image content and layout. 1) Replace the assistant speech '晚饭先留着。我把复习前后挪了挪，看看哪版更舒服。' with the exact Chinese sentence '先把晚饭留住，给你看两种改法。' This is a proposal for discussion, never a claim that any calendar was changed. 2) In the 17:20—18:00 open-paper timeline block, replace '还没安排' with the exact words '留给自己'. The open paper should feel intentionally free, not unfinished work. Keep all other activities, real time labels, one shared horizontal timeline, unchanged dinner anchor, gold 17:00 → 19:15 movement cue, two alternative cards, collapsed undecided item, and normal composer as-is. This is a private synthetic design reference, not a live product screenshot. Do not add disclaimers or new copy. Full readable Chinese glyphs.
```

### O20 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-planning-comparison/prompt.txt`

来源文件 SHA-256：`3387461a6f0a7b3c32ea9e1e444efb09543175a5ed44b556e98faa55b342f722`。以下为文件全文。

```text
Use case: ui-mockup. Edit the supplied mockup into ONE polished desktop conversation screen for 在场; use the right-hand B panel as the style reference and keep its warm ivory paper, restrained gold, generous breathing room, quiet anime companion in the upper corner, delicate Chinese typography, soft window light and existing 聊天 / 今天 / 留下 navigation. Remove the A/B split and all story illustrations. This is a design exploration with synthetic sample content, not a screenshot of a working product.
Primary request: “一条今天，两种改法” — the user immediately understands what stays, what moves, and what time is kept for themselves, without reading two repeated calendars. Show TWO compact, genuinely different planning branches at the top and ONLY ONE shared timeline beneath, for the currently viewed branch. The first branch has a delicate gold focus, the second is quieter; thin reversible branch curves converge into the same timeline and continuing conversation. No execution/approval button.
Exact Chinese copy:
User: “临时加了节课，今晚还想见朋友，复习别被挤没了。”
Assistant: “晚饭先留着。我把复习前后挪了挪，看看哪版更舒服。”
Heading: “同一条今天，两种改法”
Date: “10月18日 · 周日”
First branch title: “保住一整段复习”
First branch sentence: “晚饭不动，复习移到饭后连着做。”
First branch small facts: “调整1处 · 连续90分钟”
Second branch title: “晚上轻一点”
Second branch sentence: “晚饭不动，复习分两段，晚点留给自己。”
Second branch small facts: “调整2处 · 留40分钟空白”
Shared timeline for the first branch, with restrained real time labels: 16:00—17:00 “临时课程”; 17:00—17:20 “路上与缓一缓”; 17:20—18:00 “还没安排”; 18:00—19:00 “和朋友吃饭”; 19:00—19:15 “准备和歇一歇”; 19:15—20:45 “复习”; 20:45—21:00 “收尾”.
Visually preserve the dinner as a quiet unchanged anchor; highlight ONLY the shifted review span and its actual small before/after cue “17:00 → 19:15”. Keep preparation and rest clearly present yet secondary. The empty time is open paper, not another task. Below: a small collapsed line “还有一件事，留着再商量”. The one conversational continuation button says “从这一版接着聊”. The normal composer below carries a temporary topic chip and a text cursor, not save/execute controls.
Constraints: Use only one timeline. Do not make a project management dashboard, gauges, scores, progress bars, source IDs, model metadata, legal disclaimers, “校验/已提交/验证通过/待测试” labels, duplicate calendars, giant mascots, illustration panels, heavy shadows, dark blue surfaces or fake active timers. Maintain the existing product personality and intimacy. Clean Chinese glyphs, full readable words, no arbitrary extra prose.
```

### O21 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-planning-continuity/prompts.txt`

来源文件 SHA-256：`90f7b6f795669b923ad251dd80919de85ba95a8cbc5b7478ae6a03af53214dbb`。以下为文件全文。

```text
Built-in image_gen. Local reference image is the existing app screenshot. Generated after backend verification.

VARIANT A (selected)
Use case: ui-mockup. Edit the supplied screenshot of the Chinese personal companion app 在场, preserving its actual window composition, warm ivory window-light room background, top navigation, avatar, conversation, generous white space, existing timeline interaction and bottom composer. This is a design exploration for a real existing app, not a dashboard or marketing site. Show a full high-fidelity desktop UI, legible sophisticated Chinese typesetting. The real backend has verified 30 minutes already saved to calendar, and a new draft proposes another 30 minutes with a 10-minute rest. Saved is not completed. The timeline contents are: 10月20日周二, 14:00—16:00; 14:00—14:30 慢慢写一段 (existing saved busy row), 14:30—14:40 休息 (new draft), 14:40—15:10 复看刚写的一段 (new draft), 15:10—16:00 尚未安排. Retain the quiet warm gray existing row and muted lavender proposed work, thin amber timeline, all real times. No checkmarks/progress bars implying completion, no new action buttons, no memory management dashboard, no new sidebar, no illustrations, no decorative badges, no engineering terms. Footer remains “一起商量 · 尚未保存” and a discreet “安排与依据” disclosure. The saved 30-minute part must be clearly distinguished from the proposed new 30-minute part without pressure or duplicated statistics. Variant A: use one integrated editorial heading and a very light continuation line above the existing single continuous vertical timeline. Exact heading: “接着上次的安排”. Beneath it, a discreet line: “已在日历 30分钟 · 这次续排 30分钟”. Keep the date and declared window as the primary temporal orientation. Do not add a bordered callout around this line. Preserve the single continuous timeline with the previously saved segment remaining in context. Let typography, a tiny fine thread and spacing carry the sense of picking up something gently. Remove redundant generic “安排30分钟” if repeated; keep the real free amount subtle near the date if useful.

VARIANT B (comparison)
Use case: ui-mockup. Edit the supplied screenshot of the Chinese personal companion app 在场, preserving its actual window composition, warm ivory window-light room background, top navigation, avatar, conversation, generous white space, existing timeline interaction and bottom composer. This is a design exploration for a real existing app, not a dashboard or marketing site. Show a full high-fidelity desktop UI, legible sophisticated Chinese typesetting. The real backend has verified 30 minutes already saved to calendar, and a new draft proposes another 30 minutes with a 10-minute rest. Saved is not completed. The timeline contents are: 10月20日周二, 14:00—16:00; 14:00—14:30 慢慢写一段 (existing saved busy row), 14:30—14:40 休息 (new draft), 14:40—15:10 复看刚写的一段 (new draft), 15:10—16:00 尚未安排. Retain the quiet warm gray existing row and muted lavender proposed work, thin amber timeline, all real times. No checkmarks/progress bars implying completion, no new action buttons, no memory management dashboard, no new sidebar, no illustrations, no decorative badges, no engineering terms. Footer remains “一起商量 · 尚未保存” and a discreet “安排与依据” disclosure. The saved 30-minute part must be clearly distinguished from the proposed new 30-minute part without pressure or duplicated statistics. Variant B: explore a different structure inside the same scene: a small calm unboxed prior-calendar line for the already saved 14:00—14:30 segment connects via the timeline to the proposed rest and next work. Heading “接着上次的安排”. Label the prior portion “已在日历”, and the following proposal portion “这次接着商量”. Keep the specific saved task title and its full real time visible; do not collapse useful content or invent expand controls. Compare how a quiet horizontal temporal seam between prior and proposed changes the relationship, without separate cards or statistics. Make the scene emotionally warm and restrained.
```

### O22 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-reflective-letter/manifest.json`

来源文件 SHA-256：`ad271d846ec4c473cde147cbdc07b557e7356060f8d506d9408825247ef61e97`。以下为文件全文。

```json
{
  "date": "2026-10-18",
  "purpose": "Private design reference for a reflective letter in the existing conversation and preparation shelf.",
  "generator": "Built-in GPT Image tool",
  "image": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/陪伴来信界面-b49351945cc9.png",
  "bytes": 1792002,
  "source": "Generated in this task; no external reference image supplied.",
  "rights": "Generated with the built-in tool for this user-requested private design reference. No third-party reference image was used; it is not approved as distributable runtime artwork.",
  "prompt": "Use case: ui-mockup.\nAsset type: private design reference for an existing Chinese desktop companion app called 在场. Generate one high fidelity desktop interface design, not a poster, not a product advertisement.\nPrimary request: A personal letter from the assistant appears naturally INSIDE the existing conversation. This is a quiet reading moment: warm grey, restrained muted gold, diffuse window light, transparent spatial atmosphere. The main content must be the actual Chinese letter with generous readable line height. It feels intimate and grounded, never a productivity report. The app has only familiar top navigation 聊天 / 今天 / 留下 and an unobtrusive bottom composer. No sidebar, no new dashboard.\nComposition: straight-on desktop screenshot, landscape. A slender app header at top. A short preceding user message in the conversation. One editorial warm grey paper letter occupies the center of the conversation, softly defined edges rather than several nested cards, slight fine warm line on one side, subtle natural paper tint, mostly typography and whitespace. Assistant presence is a tiny understated avatar beside the letter margin, no large character illustration. A small date range is top right. The text is dark warm ink, gold only for very small source indices and one quiet action. Keep the letter source details collapsed: a small entry 那时的话 at the bottom. Continue/dismiss actions are genuine text links, not a giant call to action. Nearby ordinary chat text should be visible to show this really belongs to a conversation.\nExact Chinese content:\nUser message: 周末了，写封信陪我看看这一周吧。\nSmall letter eyebrow: 写给你\nSmall date: 10月12日—10月18日\nLetter heading: 这一周，也有一些轻轻发亮的事\nLetter paragraph 1: 我还记得周三晚上，你说想把那段时间留给自己。后来，我们没有再把它填满。¹\nLetter paragraph 2: 周五聊到那个小项目时，你又开始讲起新的想法。我想先替你把这份好奇留在这里，不急着把它变成下一张清单。²\nLetter paragraph 3: 这一周并不需要被收成一个漂亮的结论。那些还没有说清的，我们下次慢慢接着聊。\nSmall collapsed source entry: 那时的话\nActions: 接着聊聊 / 先收好\nComposer placeholder: 你想说什么，都可以从这里开始\nThese are SYNTHETIC DESIGN EXAMPLES only, not real user history or production hardcoded content.\nConstraints: Realistically usable app typography, warm grey and restrained muted gold aligned with an existing elegant desktop companion. No productivity score, no statistics, no badges for memory/reflection/care, no internal source IDs, no feature checklist, no generic enterprise dashboard, no unnecessary instructional copy. Beautiful understated reading surface.",
  "selected": "One paper surface, readable prose, small date range, discreet source footnotes and an expandable 那时的话 entry.",
  "not_adopted": "Generated macOS window controls, background room objects, avatar imagery and synthetic example experiences.",
  "integration": "LetterMessage.tsx in the existing PreparationShelf; the image is not a runtime asset.",
  "verification": "Design image inspected. Application, UI, build, runtime, model and Luna verification deferred by the current user request.",
  "distribution": "Private project design material only. Excluded from public review and app packaging. Not user history.",
  "originalImage": "assets/design/generated/2026-10-18-reflective-letter/letter-conversation.png"
}
```

### O23 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-18-study-paper/manifest.json`

来源文件 SHA-256：`f98ef78036c705459369ea1ddf3599fe2f55a9cd7a0e638a5931f6ae58f88e74`。以下为文件全文。

```json
{
  "title": "同一纸面的学习书桌",
  "createdAt": "2026-10-18",
  "tool": "built-in GPT Image",
  "use": "Private project design reference for the message-inline StudyScene; not a runtime background, source document or learner record.",
  "sources": "Generated from the user's product direction; no reference images supplied.",
  "prompt": "Use case: ui-mockup\nAsset type: high-fidelity desktop message-inline learning workspace design for the Chinese personal companion app 在场.\nPrimary request: Design one beautiful, usable \"同一纸面的学习书桌\" embedded in a conversation. The learner is working on ONE actual calculus exercise. The layout must make the relationship among the original question, the learner's own one-line handwritten attempt, and ONE currently requested small hint perceptible at a glance. A quiet side-by-side double-paper relationship, not a dashboard or a pile of chat bubbles. The original problem occupies a narrower paper on the left; the learner's draft is the larger working paper on the right. A small warm marginal teacher annotation belongs next to the exact written line, with a subtle pencil-like linking stroke. Spacious blank writing room below with an actual textarea-like invitation and one modest send-arrow control.\nScene/backdrop: front-facing app screenshot with a restrained warm grey conversation canvas and soft window light. Paper is near-white, faint warm edges, subtle fold/shadow, a little muted gold emphasis. This is implementable UI, not a physical notebook photograph.\nText verbatim: small heading \"把这一步想通\"; source \"示例讲义 · 第 3 页\"; problem label \"这一题\"; problem \"求不定积分\"; clear mathematical display \"∫ x cos(x²) dx\"; learner label \"我想到这里\"; learner's handwritten line \"令 u = x²，du = 2x dx\"; short teacher annotation \"先把 x dx 看作一整块。它和 du 能怎样换过来？\"; writing placeholder \"我接下来想到的是…\"; small primary action \"再给一点提示\"; unobtrusive text action \"直接讲清楚\"; tiny source access \"看看原页\".\nTypography: excellent Chinese typesetting, readable 15–18px equivalents, real mathematical typesetting, learner line has a restrained cursive handwritten quality but remains fully legible.\nCharacter presence: at most a soft cropped companion silhouette at the far page margin, under 8% of total space, entirely secondary to the question and student's work; no giant avatar, no speech-balloon UI.\nConstraints: show only this one small hint, no final antiderivative, no complete solution, no hidden-answer panel, no answer chips, no test score, mastery meter, progress bar, badges, ability label, hint/mode/steps metadata, status dashboard, timestamps row, tool names, engineering text, or extra sections. Current teaching stance is expressed through the content and the \"直接讲清楚\" action, never status tags. Keep a coherent quiet paper composition with ordinary accessible controls and generous space. No background wallpaper image and no flashy gradients.",
  "file": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/推导与提问-561c072a0963.png",
  "decision": "Use narrower original-question paper beside a larger learner working paper; one current small teaching annotation relates to the real learner line. Keep direct explanation available. Implement as responsive CSS and real text, not a bitmap interface.",
  "status": "Design image personally inspected; runtime UI and interactions not run or verified at the user's request.",
  "originalFile": "assets/design/generated/2026-10-18-study-paper/study-paper.png"
}
```

### O24 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-19-campus-academic/prompt.md`

来源文件 SHA-256：`e8ee2a836eb0c2476072c40c3e3e7d4f56f6a583a341a65f772d7ca0398cf713`。以下为文件全文。

```text
The built-in GPT Image edit retained the original desktop shell, warm grey/ivory restrained gold, window light and single composer. It replaced the large co-work papers with one semantic semester table in the assistant message: course, credits, original grade and five-point grade point. Four synthetic records (mathematics, physics, writing, PE) demonstrated numbers, a letter grade and a pass/fail exclusion. A selected row used a thin gold rule and a quiet continuation link; source and calculation basis were collapsed. No overall GPA was invented from these rows. No ranking, mastery label, second input or management dashboard was requested.

The image is a design reference. Runtime uses text, semantic HTML and CSS, not a screenshot or Codex-hosted asset. Real account data was not supplied to image generation.
```

### O25 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-19-explorable-study/manifest.json`

来源文件 SHA-256：`7226f057a8cc1c9ec33bfca0f9c34ddfb9a88d3706f10858c452b135d7a58511`。以下为文件全文。

```json
{
  "createdAt": "2026-10-19",
  "generator": "OpenAI built-in image_gen",
  "purpose": "Design-only proposal for explorable quadratic explanation inside existing Study paper. Runtime uses real HTML/SVG calculations and existing blank alpha paper asset, never this screenshot.",
  "reference": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/推导与提问-561c072a0963.png",
  "image": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/积分题分步讲解-4c7708d8eef4.png",
  "source": "C:/Users/17601/.codex/generated_images/01a1527b-9fed-75a2-9847-06dee3416bf6/exec-134eb8f1-ec31-4a95-ab75-c6f9ad48018f.png",
  "prompt": "Edit the referenced Zaichang study-paper design into a faithful, implementable desktop UI proposal for an explorable explanation INSIDE THE SAME STUDY PAPER, not a separate app or dashboard. Preserve the warm gray window light, quiet gold accents, authentic cotton paper grain, narrow left original-question paper, larger right working paper, and only one actual writing composer on the right paper. Existing selected companion can be a very small blue-haired girl cutout at the far right paper edge; she does not obscure mathematics.\n\nUse real, legible Chinese and mathematically consistent content. Left narrow paper: source heading 微积分练习.md, quiet 看看原文, 这一题, original integral ∫ x cos(x²) dx. Never change this original problem into the graph example. Right heading 把这一步想通, quiet bookmark 先放一放. Two authentic learner-reported handwritten lines under 我想到这里: u=x², du=2x dx; next line x dx=½du. These remain in place. After them one short current authored explanation: 先用一小段二次关系，分清同一个点的两种读法。点的高度告诉我们这一处的位置，切线的倾斜告诉我们此刻往哪、变多快。 This is an explicitly illustrative example, not the original integral secretly changed.\n\nBelow that explanation embed a real coherent pencil/SVG-style coordinate graph of f(x)=a x². The graph lives directly on the paper, about 220 CSS px high, NOT in a rounded card. The current temporary choice is a=2, x=1. Display this in one natural sentence above the graph with only the two numbers delicately gold-underlined as editable text: 试着让 a = 2，在 x = 1 这一点看. The dark graphite current parabola is y=2x². A very quiet thin dashed gray original curve y=x² appears only as context, labelled 原条件 a=1 in tiny writing near its curve. Do not give it a competing legend or readout. Coordinate axes with restrained labels: x from -2 to 2, y from -1 to 8. One warm gold point at (1,2). A thin vertical graphite dashed guide from (1,0) to (1,2) makes the actual height legible. A short warm gold tangent passing through (1,2), slope 4; draw it correctly, e.g. from (.65,.6) to (1.35,3.4). A tiny point/handle on the x axis lets the reader drag x, no big control bars.\n\nImmediately below the graph one ordinary linked-reading sentence, not tiles: 这一点的高度是 2，切线斜率是 4。切线向右上倾。 The values and graph are linked, but do not animate a static image or present a performance score. A very quiet text action 接着这个变化问 can attach this temporary hypothesis to the one composer. The author has provided an understandable explanation first; this is not a blank sandbox or an exam.\n\nAt bottom of the right paper retain ONE true writing area with natural handwritten placeholder 我接下来想到的是… and the existing small attachment/control icons plus a single gold send arrow. There is no second global chat composer. No mode badges, progress bars, mastery labels, engineering fields, charts dashboard, slider panel, lesson navigation, duplicate answers, fake PDF URL, or giant avatar. Keep the plotted point and tangent mathematically exact. Show the full pair of papers at comfortable desktop reading scale; it is fine for paper to extend vertically, but the graph, the two learner lines, explanation and one writing input must form one coherent working surface.",
  "notes": [
    "Illustrative math and synthetic study content; no student personal facts or mastery claim.",
    "Generated plot is design guidance only. Runtime point, curve, tangent and numbers must come from the same finite quadratic calculation.",
    "Keep original question, learner reports, assistant explanation and temporary user-selected conditions distinct.",
    "Do not change selected companion/presence preference to match the illustrative character."
  ],
  "originalReference": "assets/design/generated/2026-10-18-study-paper/study-paper.png",
  "originalImage": "assets/design/generated/2026-10-19-explorable-study/explorable-study.png"
}
```

### O26 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-19-explorable-study/selected.json`

来源文件 SHA-256：`1fbe04fba19ec1705a907f92719dc7b05597abfe925bfae689c11811afc54212`。以下为文件全文。

```json
{
  "createdAt": "2026-10-19",
  "generator": "OpenAI built-in image_gen",
  "selected": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/一步步想清积分-28da817d2379.png",
  "reference": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/积分题分步讲解-4c7708d8eef4.png",
  "purpose": "Standalone first real quadratic example; original source and learner report now correspond to the function graph. Design only, not a runtime screenshot or mathematical authority.",
  "prompt": "Revise the referenced explorable-study UI design to match the honest standalone first learning task chosen for implementation. Preserve its same warm cotton study papers, quiet window light, gold-underlined numbers embedded in the explanation, one accurate linked function graph, one actual composer, and unobtrusive companion at the far page edge.\n\nIMPORTANT: the left original problem must now genuinely correspond to the graph, not the unrelated integral. Change its source heading to 函数与变化率.md. Under 这一题 use: 函数值和这里的变化率，有什么不同？ Then the large original formula f(x)=x². Add small actual source wording: 从 x=1 附近看一看。 Do not show any integral anywhere.\n\nRight page heading: 同一个点，两种读法. Under 我想到这里 show ONE learner-reported handwritten line: x=1 时，f(1)=1. Do NOT pretend computed slope is a learner's own result. The current readable teacher explanation is: 点的高度告诉我们这一处的函数值，切线的倾斜告诉我们此处的变化率。先在同一个 x 上读它们，再轻改 a 或挪动 x。 Do not call x time or rate speed/velocity.\n\nKeep the inline adjustable sentence 试着让 a = 2，在 x = 1 这一点看。 with a=2 and x=1 subtly gold-underlined as editable text. Current curve is exactly y=2x², quiet original dashed curve y=x², main true point (1,2), height guide from (1,0) to (1,2). Make the x-axis foot point a tiny quiet gray mark, secondary to the actual gold point (1,2). Tangent must be a STRAIGHT LINE of slope 4 through (1,2), for example endpoints (.65,.6) and (1.35,3.4), never a curved gold annotation. Axes x=-2..2 and y=-1..8. Do not create two competing sets of readouts. One natural sentence below reads: 这一点的高度是 2，切线斜率是 4。切线向右上倾。 Quiet action 接着这个变化问, and only one writing composer.\n\nThis is a focused finite quadratic explanation, not a general simulator or dashboard. Preserve open paper space, meaningful formula size, controlled handwriting/book typography and real readable relationships; no mode badges, mastery/progress, category chips, hidden answers or large slider panel.",
  "notes": [
    "Use the real synthetic material 函数与变化率.md and its actual owner/read credential when demonstrating.",
    "Only the literal learner report x=1时，f(1)=1 belongs under learner attempts; model-computed slope remains an assistant calculation.",
    "Runtime tangent is a true straight line from the finite closed-form derivative, independent of the drawing.",
    "The selected companion remains the real existing profile choice."
  ],
  "originalSelected": "assets/design/generated/2026-10-19-explorable-study/explorable-study-function.png",
  "originalReference": "assets/design/generated/2026-10-19-explorable-study/explorable-study.png"
}
```

### O27 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-19-expression-rehearsal/manifest.json`

来源文件 SHA-256：`6119e071ad42642ba1f54a5e70b52e03ae8392688a45205a0d5d8b26751676a5`。以下为文件全文。

```json
{
  "createdDate": "2026-10-19",
  "generator": "Built-in GPT Image",
  "status": "Image-first private design; not running UI verification",
  "asset": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/对话故事纸页-ed1436fee01c.png",
  "source": "Generated from the current synthetic isolated app conversation screen; no user evidence, actual relationship report or third-party image",
  "prompt": "Create one polished realistic desktop app design screenshot for the existing Chinese companion app 在场, using the supplied current app screenshot as the strict outer-frame/background reference. Preserve the existing in-app logo at top left, 聊天/今天/留下 pill top center, right small profile/search/window controls, existing very faint warm window-and-ivy background with the user's illustrated blue-haired companion at the right edge, and ordinary bottom composer. No extra OS/mac window chrome. Design the actual new in-conversation experience \"先替我演一下\": this is an intimate private place to try saying a boundary to a friend, not theatre or a management dashboard. One warm cream, tactile cotton-paper message centered within the conversation column; paper lightly irregular edges, real fine grain, warm side light, soft lifted-paper shadow, restrained antique gold ink accents. Current actual conversation width around 800px relative to app 1500px; leave comfortable warm gray space around it. Do not obscure the page behind excessive glass white. Text content is the main art. Chinese typesetting elegant but easy to read, readable medium-size Noto serif for spoken lines, light sans for tiny captions. This paper should visually match a personal letter's paper material, while dialog turns stay clearly differentiated.\n\nAbove paper an ordinary short assistant line: \"我先演一种可能。你可以随时说：他不会这样回答。\" On paper top small quiet caption \"先试着说\", then the user's central intention in one small line \"愿意帮忙，但不替他全部重写\". Not a list of goals. The spoken exchange flows top to bottom with generous breathing room: first small label \"你\" at the right, your text on a very faint warm wash aligned slightly right: “我可以帮你看结构，但没法把整篇重新写一遍。” Then small quiet label left \"对方，也许会说\", his possible reply as a left-indented ink quotation near a fine gold margin: “可你不是说会帮我改吗？” Then your next turn right: “我会帮你改，但我能做的是提建议，不是替你写。” Then final possible reply left: “那你能先告诉我，最要紧的两处在哪吗？” The distinction must be clear through indentation, tiny speaker names and subtle paper tone, no oversized chat bubbles and no engineering badges. Do not claim these are real messages from the other person.\nBelow the latest possible reply, a tiny understated inline action \"换一种可能 ↗\". At foot of paper a hairline gold rule, then \"先整理成一句 ↗\" and small quiet \"先停在这里\". No scores, levels, completion bars, personality tags, method panels, tabs, record inspector, stage set, or two competing draft columns. No big green action buttons.\nBottom existing composer is normal current app composer with placeholder “试着说一句，也可以直接改主意…” and a tiny removable contextual chip “接着这段试说 ×”. Single send arrow. A tiny soft note near paper foot \"只是一次试说，还没有发给对方。\" Only example text, no backend data field names.\nRender one coherent high-craft finished desktop screen at landscape ratio, all art and text relationships feasible as real React/CSS with extracted paper material. Don't add fonts or decorative photographs that can't be replicated. No multiple mockups or device objects.",
  "intendedUse": "Private implementation reference for the existing in-conversation relationship-rehearsal Scene; not packaged or public map deployment",
  "relationships": "Keep the current actual app shell and user-selected portrayal, one paper carrying the actual conversational turns, own practice distinct from an explicitly possible reply, alternatives and collect at any point",
  "omissions": "Example dialogue is synthetic visual content, never production copy, user profile, actual conversation or control policy. Generated text is not a runtime UI image.",
  "productDecision": "Root personally inspected this image on 2026-10-19 and selected one paper, own turns at the right, possible replies at the left, and alternative only beneath the current possible reply. Remove the image's extra unsent disclaimer line. The opening comes from the actual exchange rather than fixed teaching copy. Uncertainty and a difficult or unfinished reply are valid; do not force the counterpart into quick agreement. Use the existing shared user-chosen companion portrayal, not a separate rehearsal character.",
  "implementation": "RehearsalMessage.tsx/rehearsal.css use real live dialogue and actions with extracted transparent paper and sprig assets; central Scene integration and current rendering checks are pending.",
  "originalAsset": "assets/design/generated/2026-10-19-expression-rehearsal/rehearsal-conversation.png"
}
```

### O28 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-19-openui-composition/prompt-v1.txt`

来源文件 SHA-256：`4be547aacb87f94c7c646468957a61923682e890b4c03b7fbac2dda52324650a`。以下为文件全文。

```text
Use case: precise-object-edit, ui-mockup with a scientifically accurate plot.
Edit target: the supplied actual 在场 desktop screenshot from the project's isolated synthetic Note conversation. This is a localized product design edit, not a new app screenshot from scratch.

Preserve the exact existing application shell, aspect ratio and landscape camera, top navigation “聊天 / 今天 / 留下”, warm off-white and restrained muted-gold palette, soft room light, existing room backdrop, current blue-haired character illustration and her upper-right position, generous clear space to her left, and the single existing bottom composer. Preserve the existing bottom composer's geometry, original free draft and note-focus cue; do not create another input or chat panel. Do not add a side bar, device mockup, browser frame or extra character. Only replace the central current note paper and its contents. The current character must not overlap plot, labels, controls or reading text.

Replace that central note with one beautiful, continuous, usable conversation paper for a live work made in the moment. Reuse the reference's soft ivory paper material, faint fibers, delicate paper edge and believable shallow shadow. Do not exaggerate roughness. Keep typography clear and large at normal desktop size. Remove the old note title, note body, selected-note marking, timestamp and “打开原笔记” from inside this paper. The new work is a design example; no visible “OpenUI”, “program”, “demo”, internal IDs or implementation labels.

Inside the paper:
1. Large clear Chinese title, exactly: “让两条波相遇”.
2. One short natural companion sentence, exactly: “我们把它们错开半圈，看看金色的那条会去哪里。”
3. The main visual is a large, rigorous, clean SVG-like scientific line graph, not hand-drawn waves and not an illustration of water. Plot x from 0 to 2π and y approximately -1.2 to 1.2. Clear light horizontal zero axis; discreet amplitude ticks 1, 0, -1; x-axis labels exactly 0, π, 2π. No coarse grid or decorative graph paper.
   Exact mathematical state: φ = 180° = π. y₁ = sin(x), y₂ = sin(x + π) = -sin(x), y₁ + y₂ = 0 everywhere.
   At x=0 both originals are at 0. The dark thin ink-gray original y₁ rises to +1 at π/2, crosses 0 at π, falls to -1 at 3π/2, and returns to 0 at 2π.
   The other original is a thin light warm-gray curve, precisely the vertical opposite: -1 at π/2 and +1 at 3π/2.
   The sum is a slightly stronger, restrained gold STRAIGHT HORIZONTAL LINE on y=0 for the entire graph. It MUST NOT be another sinusoid. Both original waves are visible and clearly distinguishable, visually secondary to the gold result.
   A small legible legend ties gray line to “sin(x)”, light warm-gray line to “sin(x + φ)”, and gold line to “两条波的和”. Keep labels separate and readable; do not cover the curves.
4. Under the graph, a slim readable live phase control. Its label/value exactly “相位差 180°”. A long elegant slider runs from 0° at left to 360° at right, with its thumb precisely halfway at 180°. It belongs to the same paper, not an inset card collection.
5. A light ON toggle labelled exactly “看原来的两条”; a small restrained play affordance labelled “慢慢看”; a quiet text reset entry “回到原来的样子”. They communicate finite local adjustment/play/reset without a dashboard or many tool cards.
6. The state explanation is readable, exactly: “现在每一处都刚好相反，所以相加回到了零。再拨一点，它们就不再完全抵消。”
   A compact optional mathematical line may read exactly “sin(x) + sin(x + π) = 0”; do not introduce another equation.
7. On the paper edge, one single understated conversational continuation entry, exactly “接着这个变化聊 ↗”. It returns to the existing shared composer; no second chat box, survey or floating toolbar.

Use the reference's existing quiet spacing and readable Chinese typography. Let the graph be the paper's visual focus, with enough room for all controls and explanation above the composer. Do not fill the whole page with microcopy or decorative labels. No badge rows, audit/permission disclaimers, lesson checklist, score, new notebook manager, fake progress or generic engineering dashboard. Output one polished, realistic landscape desktop design image.
```

### O29 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-19-reading-room/prompt.md`

来源文件 SHA-256：`707fe88f0d94357a9d7c8e45d9d5823771ea9497665d1380aff2089340c44154`。以下为文件全文。

```text
# Reading room derivative prompts

Built-in GPT Image edits, 2026-10-19. Each matching original room was inspected before editing, and each generated result was personally inspected. `transparent_background` was false. The three final outputs were copied into the repository; runtime imports do not depend on Codex files.

Shared prompt:

> Use case: precise-object-edit. Asset type: opaque room background behind an independently selected character cutout in a real app. Image 1 is the exact edit target. Keep the existing wide composition, wall on the left, lakeside campus view through the tall window on the right, ivy, thin curtain, bookshelf, small side table, books and ceramic blue-flower mug, camera, realistic painterly texture and color identity. Change only the large upholstered/knitted foreground at the lower right: remove the thick cream and blue knitted throw and ALL the piled cushions completely, so there is no large sweater-like texture or person-shaped fabric silhouette. Seamlessly reconstruct a simple empty wooden window-seat/low bench and a little clean wall or plain linen seat with a calm flat surface, following the exact room perspective and illumination. A clearly unoccupied clean room; no people, faces, bodies, hair, clothes, character shadows or ghost figures anywhere. Do not add any new decorative objects. Do not apply a white overlay, fog or overall desaturation; preserve actual rich window detail and natural shadows. No text or UI, no border, no collage. Opaque background, preserve the overall aspect ratio and composition of the original room.

Variant clauses, inserted after “color identity”:

- Morning: Preserve the fresh clear morning light, blue sky, green campus lakeside and pale warm wall.
- Dusk: Preserve the sunset amber-pink sky, golden low window light and warm peach wall exactly as this existing dusk scene.
- Night: Preserve the deep blue rainy night view, lit distant tower and the warm small lamp lighting the interior.

Product selection: these are the quieter working/reading derivatives only. The original textiles remain part of the welcoming room; they were furniture, not a second person. Character image identity and preference are unchanged.
```

### O30 · `前端视觉创新设计/来源记录/assets-design-generated/2026-10-21-explorable-mechanisms/manifest.json`

来源文件 SHA-256：`ec43b835365d62feb8c7f759cf6e04ccb6e1f41a80b29204b2310a7fe6508a20`。以下为文件全文。

```json
{
  "created": "2026-10-21",
  "generator": "built-in GPT Image",
  "useCase": "ui-mockup",
  "reference": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/在场｜标量方程学习界面-18-9c6131000bc8.png",
  "referenceUse": "User-provided project design reference; private design study.",
  "selected": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/钢琴交互设计B-8a33bbbdc7b2.png",
  "decision": "B keeps ordinary explanation interleaved with two related papers in one conversation. Adopt composition, warm ivory, restrained gold, typography and spacing, using live SVG/HTML and shared local state. Neither image is a runtime background.",
  "knownErrors": "Generated key counts/grouping and action geometry are imperfect. Mechanical causality and exactly eight white/five black keys must follow actual implementation and source review, not generated pixels.",
  "distribution": "Local design reference only; no public redistribution claim or application bundle inclusion.",
  "entries": [
    {
      "file": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/钢琴交互设计A-6b451b0beb3c.png",
      "bytes": 1933313,
      "sha256": "6b451b0beb3cffa6601f9d2030e17a079038f2647fe20345ffbacf99cb3b1941",
      "prompt": "Use case: ui-mockup. Make a new high-fidelity desktop conversation UI design for the Chinese companion app 在场, using the supplied app image only as the reference for its restrained warm ivory, soft window light, quiet gold, Chinese typography, generous content spacing, simple top navigation and small anime avatar. This is a design study, not a screenshot of a functioning app. Do not copy its two-column PDF layout. Create an integrated, editorially beautiful interactive explanation of how a GRAND PIANO makes and stops a sound, within an ordinary conversation. 1536x1024 landscape composition. Keep the actual app chrome: small door logo and 在场 upper left, subtle 聊天 / 今天 / 留下 pill centered, tiny companion avatar upper right; a compact conversational composer at the bottom. No large character covers the learning content. No developer labels or dashboard badges.\nDesign direction A: one continuous warm paper as an instrument, NOT a black/blue technical dashboard, no boxes inside boxes. At the top of the conversation show a small avatar with the name 澪, then one friendly short line '先轻轻按一下，再松开。'. Below is an ample softly textured off-white paper with the quiet serif heading '一枚琴键，怎样留住一个声音'. The main content is a beautiful, precise, readable vector-like side cutaway mechanism occupying most of the paper width: horizontal ivory key acting on a fulcrum, warm wooden wippen and jack, angled wooden hammer shank with rounded felt hammer head rising toward a horizontal string above, a separate felt damper resting above the string, and a bridge/soundboard at the right. Keep the lever connections and labels readable, mechanical details simplified clearly, not fantastical. Show the hammer detached and in flight just before striking, with one delicate gold motion arc; string turquoise/slate line, damper charcoal, wood honey gold. Small nearby Chinese labels '琴键', '顶杆', '琴槌', '琴弦', '制音器', '琴桥' with fine restrained leader lines. No dense Cartesian graph grid.\nImmediately beneath this cutaway, on the SAME paper, place a playable-looking full C4 to C5 one-octave piano keyboard: eight ivory white keys, five matte charcoal black keys grouped correctly in two and three. The pressed C4 has a subtle gold edge and soft depressed depth. Keep the keyboard physically close to the mechanism so they feel causally related, not another disconnected card. Beside the keys, a small frequency reading 'C4 · 261.6 Hz', and a small restrained waveform trace. Beneath, a single slim control row with a '力度' gold slider, a '慢慢看' play control, a compact '延音' switch, and a quiet reset icon; a subtle speaker icon enables sound. At the active mechanism position place one short margin note '琴槌已经离开顶杆，继续向琴弦飞去。' in normal readable text, without a large status panel. Include a discreet four-stop process line '按下  ·  脱开  ·  击弦  ·  回弹', current stage highlighted naturally, no big progress percentage.\nAfter the paper, the conversation continues with one short readable paragraph about releasing the key with the pedal off versus on; include the formula f₁ = (1/2L) √(T/μ) in elegant mathematical typography. The design must feel welcoming, calm, beautiful, intellectually serious, and genuinely touchable. Preserve clear text contrast, no text over the mechanism, no huge English headline, no extra permanent help banners, no boilerplate disclaimers, no AI implementation details. Show a realistic amount of content at usable desktop size, not an empty decorative hero. The cutaway and keys should be the visual focus, with the app identity felt through materials and spacing.",
      "transparentBackground": false,
      "width": 1536,
      "height": 1024,
      "originalFile": "assets/design/generated/2026-10-21-explorable-mechanisms/concept-a.png"
    },
    {
      "file": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/钢琴交互设计B-8a33bbbdc7b2.png",
      "bytes": 1667834,
      "sha256": "8a33bbbdc7b2329b144d1869d7220361921a37fdd89085aca51ac2dc48f80de1",
      "prompt": "Use case: ui-mockup. Create a second substantially different, implementable design study for the Chinese desktop companion app 在场. Use the attached app image as the style reference: warm ivory, natural window light, muted gold, beautiful legible Chinese serif learning text, refined sparse controls, small avatar, calm app navigation. A 1536x1152 landscape app screen. This study is a CONVERSATIONAL EXPLORABLE EXPLANATION, with two genuinely interactive paper sections separated by the companion's prose. Keep the small 在场 door logo upper left and 聊天 / 今天 / 留下 navigation at the top, small avatar top right, compact composer at the bottom. The drawings must look like precise, elegant SVG illustrations that can actually move and be recalculated, not photorealistic renders or painted assets. No black/blue dashboard, no dark cards, no full character illustration, no decorative status panels.\nDirection B: an open illustrated notebook. One quiet prose line from 澪 introduces the first experiment. First paper section heading '先看琴槌怎样碰到琴弦'. The generous flat diagram shows a simplified grand piano action side view, correctly separated into key lever on fulcrum, wippen/jack linkage, angled hammer shank and felt hammer head BELOW a horizontal string, separate felt damper ABOVE that string, and bridge at right. Clean honey wood strokes, warm gray outlines, small teal/slate vibrating string, subtle amber accent on the currently moving lever. Plenty of white paper between parts; no dense grid. The jack stops pushing BEFORE impact and the hammer head is in free flight below the string. Tiny labels with leader lines only at the relevant parts. Directly below this diagram are a small scrubbable timeline and quiet controls '慢慢看', '下一步', '复位'; a single-key lever at the left looks pressable, not a row of explanatory cards. One small in-paper margin sentence explains the current stage. This is a visual explanation of force and release, not a decorative full piano.\nBetween the two paper sections, ordinary companion prose says '再听听看：松开琴键以后，声音为什么还在？' in the same reading flow, with no extra author bubble border. Second paper section is compact and tactile: a playable C4–C5 keyboard beneath an elegant thin wave/envelope line, followed by a single row '力度' slider, '延音' switch and small sound toggle. EXACT KEY GEOMETRY: 8 white keys labeled C4 D4 E4 F4 G4 A4 B4 C5. EXACTLY 5 black keys: C-sharp BETWEEN white C4 and D4, D-sharp BETWEEN D4 and E4, then NO black between E4/F4; F-sharp BETWEEN F4/G4, G-sharp BETWEEN G4/A4, A-sharp BETWEEN A4/B4, then NO black between B4/C5. Two-black group then three-black group, never a black key on every gap. Keys are quiet ivory and warm charcoal, one C4 white key softly pressed with a muted gold lower edge. Normal note readout 'C4 · 261.6 Hz' is small. No giant labels or simulation scores.\nThe lower conversation can continue with a small formula f₁ = (1/2L) √(T/μ) and one brief explanation, visually part of the conversation rather than a third card. Keep mechanical diagram, keyboard, controls and narration all readable at realistic desktop scale; the first experiment explains mechanism, the second lets the person hear the sustain distinction. Soft paper texture should be almost imperceptible. Gentle fine borders and tiny shadows, warm coherent neutrals, clear contrast. Preserve the feeling of sitting together at a study desk. No software implementation language, no arbitrary code blocks, no repeated helper text for each control, no title saying Interactive Lab. Do not create photorealistic mechanical hardware; this design must be feasible as live vector geometry and native controls.",
      "transparentBackground": false,
      "width": 1448,
      "height": 1086,
      "originalFile": "assets/design/generated/2026-10-21-explorable-mechanisms/concept-b.png"
    }
  ],
  "originalReference": "前端视觉创新设计/图片/在场｜标量方程学习界面-18.png",
  "originalSelected": "assets/design/generated/2026-10-21-explorable-mechanisms/concept-b.png"
}
```

### O31 · `前端视觉创新设计/来源记录/assets-ui/study/source.json`

来源文件 SHA-256：`612cb47a54afff8fb7269a4a04e78aceefc525cfabecc44fe03a1d98da326abd`。以下为文件全文。

```json
{
  "asset": "前端视觉创新设计/统一图库/原图/素材-纸面与装饰/竖版学习纸张-3f5166ef6846.png",
  "date": "2026-10-19",
  "tool": "built-in GPT Image",
  "operation": "Image edit/extraction from the project-generated study-paper design; transparent_background=true",
  "input": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/推导与提问-561c072a0963.png",
  "prompt": "Use case: background-extraction / precise-object-edit\nInput image: the referenced study workspace mockup, serving as the target paper material.\nPrimary request: isolate the original blank warm-white paper material from that image as ONE reusable transparent PNG interface asset. Keep the beautiful delicate cotton fibers, slight natural deckled edges, very subtle thickness and window-light softness of the source sheet. Output ONE tall rectangular blank paper sheet, front-facing and almost orthographic, filling most of a portrait canvas with a small transparent margin on every side. Real alpha background is required.\nRemove every letter, mathematical mark, underline, ruled line, note, character, UI control, window, desk, background, object and cast shadow beyond the immediate fine paper edge. The inside of the sheet must be completely blank and naturally near-white with fine fibers, low contrast, no yellow aging and no stains. Make all four softly irregular paper edges visible; avoid strong perspective, dramatic curls or folds. Keep the silhouette nearly rectangular so it can scale behind real HTML text. No typography or decorative symbols. Do not return the whole screenshot or a collage. This is the paper cutout itself, not a mockup preview; outside the sheet is transparent.",
  "use": "Runtime alpha paper surface behind genuine question, learner writing and current teaching text. No source content, character, typography or UI pixels are baked into this asset.",
  "source": "Generated from the user's project design direction; no third-party source image.",
  "licenseNote": "AI-generated design asset created for this project; no separate third-party license or attribution claim.",
  "alpha": "RGBA; transparent outside the isolated sheet, personally inspected. Not a screenshot used as an interface.",
  "originalAsset": "assets/ui/study/paper-texture.png",
  "originalInput": "assets/design/generated/2026-10-18-study-paper/study-paper.png"
}
```

### O32 · `前端视觉创新设计/来源记录/renderer-assets/discussion/source.json`

来源文件 SHA-256：`009e70f2c5e6eb56519246cc449afb400839921fcd26c6502526c457af0bb90b`。以下为文件全文。

```json
{
  "kind": "generated_narrative_illustration",
  "tool": "built-in image_gen, transparent image edit",
  "reference": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/共写故事方案A-B-2afbad0dab9d.png",
  "assets": [
    {
      "file": "前端视觉创新设计/统一图库/原图/素材-人物与窗景/校园桥夜景-df6a2e7e0971.png",
      "origin": "exec-a35ff082-6020-4db9-8b85-a75e8d99e43f.png",
      "prompt": "Extract only the soft watercolor night-campus footbridge from left A. Preserve grey-blue water, warm lamplight, bridge and trees, genuinely transparent softly feathered edges. Remove UI, text, page rectangles, borders, avatars and other illustration. Imaginary narrative art, not a real campus map or observation.",
      "originalFile": "src/renderer/assets/discussion/night-bridge.png"
    },
    {
      "file": "前端视觉创新设计/统一图库/原图/素材-人物与窗景/雨夜伞下人影-390b7e90c36d.png",
      "origin": "exec-a8c477f5-37c5-4e0b-a27e-c7cf775df0c3.png",
      "prompt": "Extract only the second watercolor story illustration in left A: a mysterious umbrella figure under a golden lamp, imaginary grey-blue campus night, wet pavement and trees. Wide transparent watercolor with no UI, words, page, border or bridge. Imaginary narrative art, not a user portrait or real location observation.",
      "originalFile": "src/renderer/assets/discussion/lamp-letter.png"
    }
  ],
  "use": "Optional host-allowlisted narrative accents in a source-bound discussion. The model chooses an existing illustration; no keyword routing, arbitrary image URLs or runtime image-generation claim. The app uses copied project assets without Codex directories.",
  "rights": "Generated for this project from its generated design reference; no third-party image was copied.",
  "originalReference": "assets/design/generated/2026-10-18-shared-discussion/discussion-ab.png"
}
```

### O33 · `前端视觉创新设计/来源记录/renderer-assets/letter/manifest.json`

来源文件 SHA-256：`9bc562c01c10706708baf378fd2a775bde40f1ffe0be4a80b353b3499ac2852d`。以下为文件全文。

```json
{
  "createdDate": "2026-10-19",
  "file": "前端视觉创新设计/统一图库/原图/素材-纸面与装饰/横向手稿纸-4930e2aa38e8.png",
  "bytes": 2050315,
  "generator": "Built-in GPT Image edit, transparent_background=true",
  "input": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/陪伴来信界面-b49351945cc9.png",
  "prompt": "Use case: background-extraction.\nEdit target / material reference: the supplied 在场 letter-in-conversation design. Extract ONLY the actual softly textured ivory/warm-grey writing paper material used by the central letter. Remove ALL text, glyphs, source numbers, rules, icons, buttons, people, avatars, furniture, window, app chrome and interface. This output will be a real background skin behind live editable/rendered text, not a screenshot.\nCreate a perfectly front-facing blank paper sheet, filling about 98 percent of the canvas, with the same warm grey ivory tone, subtle fine paper grain and diffuse window-light falloff as the selected design. Rounded corners matching the original sheet, a very faint realistic soft shadow immediately around the edge. The sheet must be genuinely opaque; everything outside the sheet and its soft edge/shadow must be a true transparent alpha background. Do not place the sheet at an angle. No folded corner, no ornament, no ruled lines, no watermark, no text or imitation UI. Keep the paper calm enough for long reading. Landscape rectangular material approximately 3:2; tiny transparent margin only. Preserve the tactile paper feeling of the actual reference, not a flat vector block.",
  "purpose": "Actual paper/grain/light material behind live letter text; no screenshot UI or text is embedded.",
  "alphaObservation": "PNG is RGBA with alpha range 0..254; read-only image metadata inspection. No Python image editing was used.",
  "rights": "Generated for this user-authorized project from this task's synthetic design image. No external artwork supplied. May ship with the local desktop implementation; excluded from the public map preview.",
  "implementation": "Referenced by renderer/letter.css; live text, sources and controls remain normal React/OpenUI content.",
  "verification": "2026-10-19: personally inspected this real material in the shared healthy isolated desktop app, then opened the actual owner footnote, observed its close fade, selected the original paragraph into the one composer while preserving a typed draft, cancelled the focus without changing that draft, dismissed the opportunity and reopened the same immutable letter from its original message. Root inspected the current rendering against the design and retained its continuous prose, paper, type and footnote relationship. No model request was sent. The observed source-panel bottom occlusion has a scoped scroll-margin source fix awaiting the next renderer update and targeted recheck; the new persistent selected-text mark is also pending that update.",
  "originalFile": "src/renderer/assets/letter/paper-surface.png",
  "originalInput": "assets/design/generated/2026-10-18-reflective-letter/letter-conversation.png"
}
```

### O34 · `前端视觉创新设计/来源记录/renderer-assets/rehearsal/manifest.json`

来源文件 SHA-256：`c88bdfdb594d1a8b4e40e85180aeb39db224e4f345726b86e5d27a1c656dcabb`。以下为文件全文。

```json
{
  "createdDate": "2026-10-19",
  "generator": "Built-in GPT Image edits, transparent_background:true",
  "source": "Own generated private synthetic rehearsal design 前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/对话故事纸页-ed1436fee01c.png",
  "assets": [
    {
      "path": "前端视觉创新设计/统一图库/原图/素材-纸面与装饰/横向纸张素材备选-33b44ee86889.png",
      "purpose": "Actual paper grain, deckled edge, light and shadow behind live message text",
      "prompt": "Extract only the single blank cream cotton-paper sheet from the supplied generated UI design as a reusable production graphic. Preserve the exact soft ivory paper color, fine tactile fiber grain, slightly irregular deckled edges, shallow lifted-paper warm shadow, and gentle side light. Remove ALL words, Chinese letters, labels, rules, quotation marks, bubbles, buttons, branches, gold sprig, all UI controls, app frame, room and background. The sheet itself must stay fully opaque warm ivory; everything outside the ragged paper edge is genuine transparent alpha including around the subtle soft shadow. Show just this one clean blank rectangular sheet, filling about90% canvas, landscape ratio around1.35:1. No backdrop/checkerboard printed in pixels, no text, no watermark. This is the real paper material we will place live React text on, so preserve the exact paper appearance from the reference.",
      "originalPath": "src/renderer/assets/rehearsal/paper-surface.png"
    },
    {
      "path": "前端视觉创新设计/统一图库/原图/素材-纸面与装饰/金色枝叶-c0ce2a81e776.png",
      "purpose": "Small gold botanical ink ornament in the paper heading",
      "prompt": "Extract only the tiny delicate antique-gold botanical sprig at the top-left corner of the cream rehearsal paper in the supplied generated app UI. Make this one small fine graceful golden dried wildflower / wheat sprig into a real transparent-alpha production ornament. Preserve the exact hand-drawn gold ink shape and warm muted ochre color, its slight paper-ink texture, fine leaves and stems. Remove EVERYTHING else: no paper, no words, no app UI, no bars, no background, no frame. Tightly center the single sprig filling about80% of a tall narrow canvas, with transparent padding. Transparent alpha around and between every stem and leaf. No checkerboard printed in pixels. No extra elements, no labels. This asset will be placed at the exact top-left of the real live paper UI; not a screenshot.",
      "originalPath": "src/renderer/assets/rehearsal/gold-sprig.png"
    }
  ],
  "permission": "Generated for this user-authorized local desktop implementation from synthetic project design; no external artwork or actual private conversation. Do not include in public map review deployment.",
  "implementation": "Artwork contains no dialogue or controls; all words, branches, actions and focus remain live React/OpenUI owner projections.",
  "visualStatus": "Generated assets personally inspected. Current integrated rendering and motion still awaiting same-profile visual check.",
  "originalSource": "Own generated private synthetic rehearsal design assets/design/generated/2026-10-19-expression-rehearsal/rehearsal-conversation.png",
  "canonicalSourceFile": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/对话故事纸页-ed1436fee01c.png",
  "originalSourceFilePath": "assets/design/generated/2026-10-19-expression-rehearsal/rehearsal-conversation.png"
}
```

### O35 · `前端视觉创新设计/来源记录/素材/生成记录.json`

来源文件 SHA-256：`9a3e1da6ac7c7089e1023447f362fe58d038ac62bf5a98fd3502f3e8cd9df95a`。以下为文件全文。

```json
{
  "tool": "GPT Image (built-in)",
  "date": "2026-10-18",
  "items": [
    {
      "id": "morning",
      "name": "窗景-晨光.png",
      "product": "morning.png",
      "prompt": "Edit this provided 在场 desktop design image into a clean, reusable BACKGROUND ART ASSET. Remove ALL interface chrome, logo, text, buttons, input box, and the anime woman completely. Reconstruct a beautifully coherent empty cozy window room in the same detailed soft painted-anime illustration style and warm colors. Landscape 1600x1000 composition. Left 55 percent is a softly illuminated ivory plaster wall with exceptionally calm negative space and a subtle diagonal window shadow, suitable for live application text laid over it later. Right 45 percent contains the tall window with linen curtains, a comfortable empty cream window seat, small wooden desk, plain unmarked books, ceramic cup, and leafy plant; outside the window a tranquil lake and faraway campus-like rooftops, no readable signs or precise geographical claims. Morning sunlight, gentle highlights, soft depth, warm and restful, not blurry or washed out. The scene should feel inviting even without a character. No people, no UI, no letters, no symbols, no logos, no watermark. Preserve rich illustrative quality on the right and unobtrusive text-safe space on the left. Opaque background.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-28be50c2-0963-4d72-8a72-709828a17db6.png",
      "originalFile": "前端视觉创新设计/素材/窗景-晨光.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/素材-人物与窗景/晨光窗景-e304ff26879b.png"
    },
    {
      "id": "dusk",
      "name": "窗景-暮色.png",
      "product": "dusk.png",
      "prompt": "Edit this exact empty cozy room background asset. Change ONLY the time of day and lighting from morning to warm late-afternoon dusk. Preserve the camera, wall, window, bench, curtains, desk, plants, cup and book positions precisely so an app can transition smoothly between the images. The left 55% remains calm uncluttered ivory-plaster negative space, now softly touched by peach and amber sunset light with delicate window shadows, still light enough for dark readable interface text. Through the right window, tranquil lake and campus-like rooftops under a muted rose-gold and lavender evening sky; warm reflected light on the same cream fabrics, elegant soft anime-painted detail. No people, no new objects, no UI, no text or readable book lettering, no logos, no watermark. Opaque landscape background, maintain the exact aspect ratio and composition.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-e9aed088-a385-4ffb-951f-670afe3fa8f2.png",
      "originalFile": "前端视觉创新设计/素材/窗景-暮色.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/素材-人物与窗景/暮色窗景-e818d1dc8c2c.png"
    },
    {
      "id": "night",
      "name": "窗景-夜灯.png",
      "product": "night.png",
      "prompt": "Edit this exact empty cozy room background asset into its quiet NIGHT version. Preserve the camera, room architecture, window, bench, desk, plants, cup and book placement exactly for a seamless app mood change. Same beautiful detailed soft anime-painted illustration style. Left 55% is now deep warm charcoal #272529, a calm dark plaster wall with only very subtle reflected amber light, suitable for ivory interface text; keep it unobstructed. At right the same window shows a deep indigo rainy evening, fine rain droplets on glass, distant soft campus-like window lights reflected on the lake. A small warm reading lamp softly lights the cream cushions and wooden desk from near the far-right edge, inviting and serene, not gloomy or threatening. Keep the visual focus and cozy texture on the right. No people, no readable letters on books, no UI, no icons, no logos, no watermark. Opaque landscape, same aspect ratio and composition.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-dd25c510-fafd-4534-a9cb-192c826c0520.png",
      "originalFile": "前端视觉创新设计/素材/窗景-夜灯.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/素材-人物与窗景/夜灯窗景-dab8185e3ca4.png"
    },
    {
      "id": "mio",
      "name": "人物-澪.png",
      "product": "mio.png",
      "prompt": "Edit the provided reference into one isolated character illustration asset with a TRUE transparent alpha background. Preserve the original adult anime woman's identity: long softly flowing blue-lavender hair with a dark ribbon, warm amber eyes, gentle natural expression, cream knitted cardigan over a modest dark blue dress with tiny pale flowers. Remove every part of the app interface, all text, all logos, the room, window, furniture, cup and books. Depict just the same fully clothed character, seated comfortably in a three-quarter pose, upper body and lap visible, one hand relaxed near her cheek and the other resting naturally in her lap, softly smiling without exaggerated pose. Keep the beautifully detailed soft painted anime aesthetic, warm diffused window light, delicate linework, realistic fabric knitting detail. Character centered with generous transparent margin on every side, complete hair and arms, no clipped head or hands. Her silhouette should compose naturally on the right of a cozy desktop app background and also crop well into a circular avatar. No chair, no room, no solid color background, no haze or drop-shadow rectangle, no text, no watermark. Actual transparency is required.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-111fa686-3524-4e0d-ba6c-868954d9936f.png",
      "originalFile": "前端视觉创新设计/素材/人物-澪.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/素材-人物与窗景/澪的角色立绘-eabf255e455d.png"
    },
    {
      "id": "haruka_r",
      "name": "人物-遥.png",
      "product": "haruka.png",
      "prompt": "Precise background-extraction edit of this character image. Keep the woman herself exactly as she is: face, hair, light blue shirt, pose, hands and cream trousers. Remove ALL of the remaining grey/brown studio gradient, glow, haze and shadow surrounding her silhouette. The output must have fully transparent alpha outside the figure and opaque natural color inside the figure, with clean delicate hair edges. Do not make the character semi-transparent and do not keep a halo or feathered rectangle. Do not change the art style, facial features, clothing or pose. A clean reusable PNG cutout for compositing over a light or dark cozy room, no background, no furniture, no text, no watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-ce52f4d8-e606-4bae-9f1f-d90457c394e4.png",
      "originalFile": "前端视觉创新设计/素材/人物-遥.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/素材-人物与窗景/遥立绘备选-186ebcbb1d2a.png"
    },
    {
      "id": "saku",
      "name": "人物-朔.png",
      "product": "saku.png",
      "prompt": "Edit this reference design image into one clean isolated character illustration asset: ONLY the original adult silver-haired anime man reading a book from the large preview on the right. Preserve his gentle facial features, softly tousled silver-grey hair, warm grey-green eyes, cream/beige knitted sweater and dark comfortable trousers. Keep the same relaxed seated pose, looking down at a small open book in his hands, upper body and lap visible. Match the beautifully detailed soft painted-anime aesthetic, warm diffused window light, delicate rendering, natural hands, fine knit texture, calm companionable presence. Remove the entire room, window seat, plants, cup, interface, all other portraits, every text and logo. TRUE transparent alpha background. Center the full upper body/lap character with transparent margin all around, no cropped head, arms, hands or book. No chair, no rectangular haze, no solid backdrop, no drop-shadow box, no text on the book cover, no watermark. It must layer naturally on an app background and also crop well as a face avatar. Fully clothed, modest adult figure.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-ffc76d1e-0c63-42b9-8fc1-a59906ed2c4a.png",
      "originalFile": "前端视觉创新设计/素材/人物-朔.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/素材-人物与窗景/读书的朔-3d4adef6c2f2.png"
    }
  ]
}
```

### O36 · `前端视觉创新设计/来源记录/补充图稿/生成记录.json`

来源文件 SHA-256：`499fa3b79d04d5eaff3d8eacf75d8e94d18d939b5d5723c902c494cf6556952f`。以下为文件全文。

```json
{
  "tool": "GPT Image (built-in)",
  "date": "2026-10-18",
  "items": [
    {
      "id": "23r",
      "name": "23-留下的资料.png",
      "prompt": "Edit this exact 在场 materials library interface. Preserve the beautiful warm ivory/champagne-gold palette, crisp refined typography, document list, selected paper preview, and the centered top navigation 聊天 今天 留下. ONE targeted correction: remove the entire unnecessary left vertical global navigation column (首页/课程/日程/笔记/资料/生活), including its decorative quote and flowers. Expand the actual 留下 content into that freed space with generous margins and a balanced 40% document list / 60% paper preview. The only global navigation is the small top pill. Make the application full bleed edge to edge with no outer desktop/tabletop surround or dropped-shadow computer-window frame. Retain a subtle hint of warm window light only in empty outer margins. No new controls, no new cards, no extra categories. Keep the real tabs 笔记 资料 对话 immediately below 留下, the search 找一份资料 and 添加资料 action, and current reading actions. No engineering badges, slogans, disclaimers or watermark. A calm actual app interface, landscape.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-b4fc539d-ed78-4b02-b5d6-0d7d2016ae53.png",
      "originalFile": "前端视觉创新设计/补充图稿/23-留下的资料.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/一阶方程资料预览-05db65be83bb.png"
    },
    {
      "id": "24r2",
      "name": "24-天气与接着聊.png",
      "prompt": "Edit this exact 在场 daily-weather conversation screen. Preserve the layout, colors, Chinese typography, seven-day forecast, conversation, Windows controls and composer. Targeted factual-scope correction: the selected-day detail must contain ONLY information already shown by the forecast: heading 周三 · 10月21日, condition 多云, temperature 19–25°C, 降雨概率 20%, and the small 天气来源 link. REMOVE the 风速 and 日落 fields entirely, do not replace them with any new weather data or chart. Redistribute the remaining condition, temperature and rain into a spacious quiet horizontal detail row; reduce the panel's height accordingly. Restore the small removable selected-date chip 周三 · 10月21日 immediately above the composer text, with a small x. Keep the 启真湖 row and 看看怎么走 action unchanged. Do not add any text explaining missing fields, no disclaimers, technical labels, demo notices, progress counters, badges or watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-514c4e42-cc8a-43e7-81a1-92979cfcad07.png",
      "originalFile": "前端视觉创新设计/补充图稿/24-天气与接着聊.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-地图与天气/天气对话-b2a9cd45b236.png"
    },
    {
      "id": "25",
      "name": "25-你交给我的事.png",
      "prompt": "Use case: ui-mockup. Design page 25 of the Chinese desktop personal companion 在场, one high fidelity 1600x1000 landscape app screen, titled 你交给我的事. Match 窗边的在场: Apple-inspired quiet, warm ivory ground, paper white, muted champagne gold accents, deep warm grey readable Chinese sans-serif, very soft window light at outer edge, refined spacing and thin dividers, no large anime portrait in work area. Top tiny doorway logo 在场, centered navigation 聊天 / 今天 / 留下 with 今天 selected, search and small interchangeable anime avatar right. Below the heading 今天，慢慢安排。, two discreet tabs 安排 / 帮我留意, second selected. Left 32% width is a calm list of entrusted things with a single selected row 线代课前的路; a second row 周末的天气. Avoid counts, urgency pills, completion scores. Right large unboxed detail has heading 线代课前的路, sentence 地点有变化时，帮我重新看看怎么走。 Inline quiet metadata 到10月25日 and 可参考：课程安排、校园地图. A warm white paper containing currently useful prepared content: 下次上课，换到东4了 with small line 周三 14:00 · 东4教学楼, an understated mini map of a short campus path, and natural text 从东3出发，沿着教学楼间的小路过去。 Under it actions 一起看看 and 先收起来. Bottom of the detail holds small actions 暂停这件事 / 不再留意. A smaller inset within the same design shows the paused version with label 想继续时再叫我 and button 继续留意, but no overlapping contradictory status on the active main object. It should feel like a thoughtful companion keeping a useful page for you, not project management, monitoring telemetry or task queues. No reminders that pressure the user, no red badges, no engineering or validation terms, no disclaimers, no canned success tags, no watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-cb5eb2e5-c978-4a83-8a63-878336a7cddb.png",
      "originalFile": "前端视觉创新设计/补充图稿/25-你交给我的事.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-日程与今天/接着上次安排-fc337e58f213.png"
    },
    {
      "id": "26",
      "name": "26-这次按你的意思来.png",
      "prompt": "Use case: ui-mockup. Create a refined two-panel interaction design image for 在场, Chinese personal companion, page 26, 1600x1000 landscape. Both panels are actual interface crops in the same warm ivory, near-white paper, champagne-gold, soft warm graphite style, Apple-inspired calm precision and Chinese sans serif. No device shells, outer promotional headings or numbered steps. LEFT panel: the normal quiet chat stays in the background while a rounded compact sheet opens directly above the privacy icon beside the composer. Sheet heading 这次，按你的意思来. Three clear rows with compact choices: 参考什么 with 相关资料 / 只看这条 / 不用记忆; 留下什么 with 留下这段话 / 仅这一次; 给谁看 with 自己 / 写给别人. A small final action 就这样聊 and a close icon. Current selection 只看这条 and 仅这一次 in pale gold. Under selected retention a single short factual line 结束这段对话后，不留聊天记录. Keep the composer draft visible and unchanged under the sheet. RIGHT panel: full connected-sources preferences view with heading 你愿意分享的资料, sparse list rows 课表 / 成绩 / 校园卡 / 选过的文件, each with a fine icon, simple toggle and expandable source link; selected expanded row 课表 shows 仅这次使用 / 以后也可以 plus action 收回允许. Top discreet back link 返回偏好. A tiny optional character portrait is only at the top right. Strong readable text and generous spacing, hardly any nested boxes. Visually warm through daylight, paper and proportion, not syrupy wording. No false safety promises, no system diagnostic terms, no approval counts, no demo/example labels, no validation or test text, no status dashboard, no permanent categories sidebar, no watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-2fdedfd6-edf5-47b2-a068-aa848b3b1bec.png",
      "originalFile": "前端视觉创新设计/补充图稿/26-这次按你的意思来.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-设置与人格/资料分享设置-744d13a1bc8b.png"
    },
    {
      "id": "27",
      "name": "27-陪伴的样子.png",
      "prompt": "Use case: ui-mockup. Create a gorgeous high fidelity Chinese desktop app page for 在场, page 27, 1600x1000 wide: personal choice of companionship appearance, matching an existing 窗边的在场 suite. Full-bleed app screenshot, no device frame. Warm ivory #f8f5ef, warm charcoal typography, clean paper, champagne-gold active accents and subtle daylight. Tiny doorway logo 在场 top left, centered pill 聊天 今天 留下, search and tiny avatar at top right. Within the page a small back arrow and 偏好, then headline 让这里，更像你喜欢的地方。. Main area divided 63% controls left and 37% elegant live portrait preview right with softly rounded corners, sunlight and a cozy window. Left uses local tabs 陪伴的样子 / 怎么相处 / 阅读与节奏 / 连接与资料, first selected. Four equal illustrated choice tiles: 澪 (original adult blue-lavender long-haired anime woman, cream knit cardigan), 遥 (original adult short dark-haired anime woman, loose light blue shirt), 朔 (original adult soft silver-haired anime man, beige knit), and 只留一束光 (sunlit empty window, no person). Clear option 使用喜欢的人物图片 with small plus icon; nearby small unobtrusive file thumbnail 我的角色.png and action 换一张, showing user-selected artwork can be used. Under tiles a quiet row 出现的方式 with 窗边陪着 / 留在页角 / 暂时收起. Then light choices 晨光 / 暮色 / 夜灯 as small atmospheric landscape swatches, and a reduce motion switch labeled 少一点动态. Right preview shows the selected silver-haired male character gently reading a book, not staring or posing, in the same detailed soft anime art style as a warm cozy window scene. A small bottom control 自己调整位置 with a simple position/scale slider in the preview footer, no crop tool clutter. No character personality locked into the image choices, no gamified affinity, no points, no progress or verification terms, no explanatory disclaimers, no watermark. Emotionally warm, freely personal, highly polished and usable.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-fd3e97d6-9cda-4238-86dd-a60d59bc5964.png",
      "originalFile": "前端视觉创新设计/补充图稿/27-陪伴的样子.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-设置与人格/陪伴外观选择-e035a560f3c8.png"
    },
    {
      "id": "28",
      "name": "28-笔记找回与继续.png",
      "prompt": "Use case: ui-mockup. Create a coherent interaction design board, page 28, for the Chinese 在场 personal notebook, 1600x1000 landscape, with two large equally detailed side-by-side actual app views, no device frames, no promotional headings or numbered step labels. All UI is warm ivory, paper white, champagne gold fine accents, dark warm charcoal text, Chinese sans serif, softly rounded reading surfaces, quiet Apple-like typography and spacing; matching 窗边的在场. Tiny doorway logo 在场 and simple centered 聊天 今天 留下 navigation in each view. LEFT VIEW shows 留下 / 笔记, a quiet list of notes on the left and a beautiful readable white note paper titled 今天卡住的地方, with actual short text 今天终于意识到，困住我的不是计算，而是那一步为什么成立。 A subtle drawer attached to the paper's right edge is titled 以前写下的, shows three dated versions, selected 10月18日 20:46 with its text and a gold outline button 用这个版本, plus 返回现在. Original note remains visible. RIGHT VIEW shows the same notebook with a small tab 最近收起的, one selected deleted note 周末想去的地方 and a clear action 放回笔记, no red trash imagery. At the bottom of the right view, an expanded quiet contextual note represents a simultaneous edit: 这页有了新的修改，你刚写的还在。, with two readable text excerpts side by side and actions 保留我的文字 / 看看新内容. All controls connected to the note, calm and reversible. No progress counts, no save-success toasts, no schema/revision/validation language, no demo disclaimers, no metrics, no big character or wallpaper behind writing, no watermark. Focus on continuity, readable writing and easy recovery, not engineering.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-5102ff9e-d4f8-4eef-be65-4832c37fec02.png",
      "originalFile": "前端视觉创新设计/补充图稿/28-笔记找回与继续.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/日程与笔记并列-d618bb8f1492.png"
    },
    {
      "id": "29r",
      "name": "29-给别人看与回到私聊.png",
      "prompt": "Edit this exact two-view 在场 draft-and-presentation design board. Keep the entire right presentation view unchanged. Keep the left editable letter, its actions and attached confirmation sheet unchanged in meaning and visual style. ONE targeted layout correction in the left view: remove the redundant left vertical navigation rail containing 聊天 / 今天 / 留下 and bottom settings/moon icons. Only the top centered navigation should exist. Move the existing small doorway logo to the top left alongside 在场 and let the private-chat content use the freed width, preserving generous margins. Use a clean warm ivory full app background, readable sans-serif Chinese UI type. Do not add any new content, panels, explanations, badges, disclaimer language or watermark. The two states must retain the same warm paper/champagne-gold visual language.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-fa1748fc-680d-4526-aeb7-64531ad77cfb.png",
      "originalFile": "前端视觉创新设计/补充图稿/29-给别人看与回到私聊.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-学习与阅读/学习小组讨论-a058672654dc.png"
    },
    {
      "id": "30",
      "name": "30-把安排挪一挪.png",
      "prompt": "Use case: ui-mockup. Create page 30 for the warm Chinese personal companion 在场, a single 1600x1000 full-bleed desktop interface showing an actual daily plan with an attached editing sheet. Continue the 窗边的在场 aesthetic: warm ivory background, crisp paper white, muted gold active states, warm dark typography, refined Apple-like layout, gentle window light at the outer edge, no wallpaper behind text. Top compact doorway mark 在场 and centered 聊天 今天 留下 with 今天 selected. Main left portion heading 今天，慢慢安排。, quiet actual date 10月21日 · 周三 and a narrow seven-day date strip with Wednesday selected. Below, a simple spacious timeline, 14:00 常微分方程 · 东3教学楼, 18:20 去东区食堂, and unfilled space with no task pressure. Small bottom action 记一件事. The 14:00 item is selected and its contextual sheet at right is headed 把这件事，挪一挪. Form fields: 这件事 (常微分方程), 时间 (2026年10月21日 15:00), 留多久 (90 分钟), 地点 (东3教学楼), 重复 (每周三). Large comfortable fields with fine understated borders, no engineering details. Bottom actions 保存修改 and 先不改. Near the original timeline item, show a subtle single-row alternate result of the moved time as 15:00 with action 撤销, but visually separated as a small distinct state inset rather than duplicate active events. Show a tiny optional avatar only in top bar. Avoid progress counts, completion badges, red overdue warnings, demo or validation labels, technical state codes, or fictional notification-delivery claims. Calm, spacious, practical, reversible, no watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-9b96de9d-73cc-44f3-b423-63b122244288.png",
      "originalFile": "前端视觉创新设计/补充图稿/30-把安排挪一挪.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-日程与今天/今日安排编辑-3fa0d60ceba9.png"
    },
    {
      "id": "31",
      "name": "31-关于你的理解与来源.png",
      "prompt": "Use case: ui-mockup. Create page 31 of the 窗边的在场 desktop app concept suite, 1600x1000 wide, warm ivory near-white paper, restrained champagne-gold, warm charcoal, Chinese sans serif, soft sunlight and precise Apple-like spacing. Actual app screen with tiny doorway logo 在场, centered navigation 聊天 今天 留下, tiny optional anime avatar right. Page heading 关于你 with a relaxed sentence 有变化，随时改。 Main left 58% contains three editable personal understanding rows, no card grid: 解释时，先说清为什么; 学习时，想留出完整的时间; 喜欢温暖、安静的界面. Each has small quiet actions 修改 / 暂停使用 and expandable 来自我们的对话. First source is expanded inline with the actual quoted sentence “先说这一步为什么成立，再接着推导。” and date 10月18日, plus 回到那段对话. At right an attached paper editing sheet titled 这次，把它说得更准确, a generously sized text area reading 我希望先弄懂动机，再慢慢展开完整推导。, a simple optional row 在什么时候 with choice 一直如此 / 只在学习时, and bottom actions 留下这个说法 / 暂时不改. Below the rows, a discreet collapsed section 暂时不用的理解 and small button 忘记这条 associated with the selected object, no warning banner. A small separated inset shows the empty version: heading 关于你, an open doorway light motif, action 写下一点偏好, with no analytics. Privacy and user control expressed by actual choices, not slogans. No confidence percentages, no source counters, no revision or policy codes, no demo labels, no validation/testing jargon, no giant character, no watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-5a94ffb5-c554-4d08-aa7d-959cc3e5c10e.png",
      "originalFile": "前端视觉创新设计/补充图稿/31-关于你的理解与来源.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-设置与人格/关于你的理解-1ec59dc8ce4c.png"
    },
    {
      "id": "32",
      "name": "32-日夜安静阅读.png",
      "prompt": "Use case: ui-mockup. Create page 32 of the 在场 Chinese companion app, 1600x1000 landscape two-panel design board comparing the same calm conversation in daylight and at night. No device mockups, no promotional headings, no technical annotations. Full interface in each panel: tiny doorway logo 在场, centered compact pill 聊天 今天 留下, small optional character avatar at top right. Left palette warm ivory #f8f5ef with white paper and muted champagne gold. Right palette deep warm ink #282528, soft ivory text and muted amber, subtle small lamplight only in the far edge; no low-contrast grey on grey. Content is long-form readable conversation, not chat bubbles around every paragraph. Small user bubble 我想弄懂这一步，为什么可以这样定义？ Assistant tiny character avatar then strong headline 从已知的解出发。, two natural paragraphs, an elegant displayed scalar formula c(t)=x(t)/u(t) and x(t)=u(t)c(t). Add a compact code block below with just two lines def greet(name): and return f'你好，{name}', copy icon in code corner, retaining monospace typography. Beneath the answer are discreet copy and 引用 controls and a collapsed 来自这份讲义 link. Show a short selected phrase highlighted pale gold and a small contextual button 接着问这句, keeping typography and line spacing stable. Composer anchored at bottom with plus, unobtrusive privacy icon and gold send arrow; placeholder 接着说… . No oversized character in reading area; dark right panel has only a tiny portrait. The design must support genuinely long reading through comfortable line lengths, hierarchy and breathing room, no whole-screen card wall, no metadata parade, no progress counter, no verification statuses, no disclaimer or demo labels, no watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-a8b9c080-b082-4e35-8309-4656a8b4204d.png",
      "originalFile": "前端视觉创新设计/补充图稿/32-日夜安静阅读.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/对话明暗主题-1ca5e1e65705.png"
    },
    {
      "id": "33",
      "name": "33-回来与继续.png",
      "prompt": "Use case: ui-mockup. Create page 33 of the Chinese desktop companion 在场, a tasteful four-state design board 1600x1000 landscape with four clearly separate equally sized app fragments. These are calm recoverable interface situations, not a dashboard or infographic; no external titles, numbering or device shells. Same 窗边的在场 style in all: warm ivory, soft white paper, champagne gold, readable warm charcoal Chinese sans serif, understated doorway mark, gentle window light, no large character. TOP LEFT: empty search overlay 我们聊过的 with input containing 湖边, simple text 这次还没找到, small actions 换个词 / 回到聊天, generous breathing room. TOP RIGHT: chat loading failed with a preserved actual draft 我想把今天的事情慢慢理一理 in the composer, compact message 这次没能打开。 and useful actions 再试一次 / 先写下来; no red alarm imagery. BOTTOM LEFT: elegant close-window sheet titled 还有没说完的话。, a readable draft preview 明天想问老师的那个问题…, main action 留着，下次接着写, secondary 继续写, small distinct destructive action 不保留，退出, no count of drafts. BOTTOM RIGHT: conversation during a long reply with a subtle three-dot amber activity mark and natural line 让我看看这份讲义…, a clear small 停止 button; beneath, a separate narrow inset showing the stopped state text 我们先停在这里。 and action 接着来, preserving the prior content. No process lists, no validation badges, no percentages, no generic engineering status, no false success, no demo labels, no apology essay and no watermark. The warmth comes from stable context and gentle choices.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-48676988-80cb-4425-9dae-e558cda7c0c0.png",
      "originalFile": "前端视觉创新设计/补充图稿/33-回来与继续.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/对话状态卡-608f46b85c51.png"
    },
    {
      "id": "34",
      "name": "34-窄窗口里的在场.png",
      "prompt": "Use case: ui-mockup. Create page 34 of 在场, a responsive design board with THREE tall narrow app viewports side by side at equal scale, 1600x1000 landscape. No physical phone devices, no promotional headlines, no scene numbering, just clear complete app views. Coherent 窗边的在场 art direction: warm ivory, clean white paper, muted champagne-gold, warm dark readable Chinese sans-serif, fine shadows, quiet Apple-like layout and tiny doorway mark. All three use the same compact top header 在场 with small search and companion avatar, and the same bottom navigation 聊天 今天 留下. LEFT viewport: 今天 active, heading 今天，慢慢安排。, a horizontally compact seven-day strip, simple readable timeline with 14:00 常微分方程 / 东3教学楼 and 18:20 去东区食堂. A small action 记一件事 and ample clear space, no pressure or counts. MIDDLE viewport: 留下 active, local tabs 笔记 资料 对话; open note 今天卡住的地方 with a slim back link 我的笔记, short editable paragraphs and gold quote margin, small toolbar at bottom 保存 / 以前写下的. Note body gets full width instead of a squeezed desktop sidebar. RIGHT viewport: companion settings, headline 陪伴的样子; four image options in a 2x2 grid with original adult blue-haired woman, short dark-haired woman, silver-haired man and sunlit empty window; action 使用喜欢的图片; choices 窗边陪着 / 留在页角 / 暂时收起; small preview and 少一点动态 switch. Controls sized comfortably for touch, consistent spacing and readable text. No native service claims, no sync icons, no fake completed states, no validation words or disclaimers, no oversized character behind text, no watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-66fe4698-9ce7-47af-a466-a5e836a8ef1f.png",
      "originalFile": "前端视觉创新设计/补充图稿/34-窄窗口里的在场.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-对话与动态内容/窄窗界面组-25369b96d9a0.png"
    },
    {
      "id": "35r",
      "name": "35-路线地点与平面地图.png",
      "prompt": "Edit Image 1, the three-state campus-map interface board, using Image 2 ONLY as the cartographic STYLE reference. Keep Image 1's route strip, selected leg, compact route controls, place sheet and lower-right flat-map layout. Replace its overly photographic miniature-city rendering with the restrained technical map material of Image 2: translucent pale warm-grey building volumes, fine outlines and visible courtyard holes, flat muted grey water, mostly ivory and very restrained pale olive land, extremely subtle shadows, no trees rendered as individual photoreal objects, no facade photographs, no satellite texture. Remove the photo thumbnail from the selected building card, leaving a precise text-only place card and its three actions. Keep the warm-gold road-following route, small readable stop labels and full viewing area. The result should feel like a calm transparent spatial map in a polished personal app, not aerial photography or a game environment. No additional sidebars, metrics, demo notices, validation or engineering labels, disclaimers, and no watermark. Exact Chinese UI text remains readable. Both spatial and flat states must use the same quiet color language.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-baea157a-ac40-463e-80d2-aa6bd25b1a7c.png",
      "originalFile": "前端视觉创新设计/补充图稿/35-路线地点与平面地图.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-地图与天气/校园地图路线-821979dba711.png"
    },
    {
      "id": "36",
      "name": "36-先坐一会儿.png",
      "prompt": "Use case: ui-mockup. Create page 36, a quiet resting state of the Chinese personal companion desktop app 在场, 1600x1000 landscape, complete actual app screen with no device frame or explanatory text. It belongs to the warm elegant 窗边的在场 suite. A beautifully detailed soft anime / painterly sunlight scene: cozy window seat on the right, linen curtains, a wooden desk and cup, leafy plants, distant lake and campus-like rooftops through the window, late afternoon amber light. An original adult blue-lavender-haired anime woman in a cream knit cardigan sits comfortably reading a small book, looking down at it instead of staring at the user. Her expression is peaceful, natural posture; tasteful, fully clothed, not sexualized. Left two-thirds naturally fade into warm ivory with subtle window shadows, spacious and tranquil. The app's only visible UI: very small doorway mark and 在场 top left; a small quiet circular 关闭休息 icon at upper right; near the bottom left a soft white rounded button 回到聊天 with a left arrow. Above that button, just one short gently typeset sentence 先坐一会儿。. No composer, task list, clock, timer, breathing instructions, reminders, progress, achievement, diagnostics, validation words, demo labels, disclaimers or watermark. The beautiful room and presence carry the warmth; do not crowd it with slogans. Keep composition compatible with switching to no character so the room itself remains welcoming.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-91958a11-422d-4d52-aa81-66e32c6e148f.png",
      "originalFile": "前端视觉创新设计/补充图稿/36-先坐一会儿.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/素材-人物与窗景/窗边陪伴场景-f1d210f53971.png"
    },
    {
      "id": "37",
      "name": "37-怎样相处.png",
      "prompt": "Use case: ui-mockup. Create page 37 for the Chinese personal companion desktop 在场, 1600x1000 full bleed, an actual editable companion-personality page titled 怎么相处. Same 窗边的在场 art direction: warm ivory, readable white paper, warm graphite, subtle champagne-gold highlights, refined Chinese sans-serif, beautifully balanced Apple-like spacing, fine borders and gentle natural light. Tiny doorway logo 在场 top left; centered segmented navigation 聊天 今天 留下; small optional avatar right. Local settings tabs 陪伴的样子 / 怎么相处 / 阅读与节奏 / 连接与资料 with 怎么相处 selected. Left 60% is a calm human-written editor: four small choice pills 温暖学姐 / 元气搭档 / 冷静参谋 / 自己来; labeled 叫什么 with text 在场; labeled 你希望怎样相处 with a generous editable paragraph 我希望你温柔但坦诚，先听我说，也愿意陪我把困难的事想清楚。; a collapsed row 再写细一点 for detailed preferences. Button 留下这些约定, secondary 先不改. Right 40% is an elegant little paper showing a user-written example in context, heading 试着这样说, tabs 闲聊 / 出门前 / 心情低落; current user sentence 今天好像什么都没做好。 and editable companion response 听起来，今天已经很耗力气了。先坐一会儿，我们慢慢说。 A small pencil icon conveys editable example; do not present it as an actual AI reply or completed action. Below a quiet collapsed section 以前的约定 and two text actions 带走这份设置 / 放入我的设置, with no raw JSON or version numbers. A small avatar may sit beside the example but no large figure. No locked character gender or personality, no affinity scores, diagnostics, validation labels, disclaimer text, engineering language, long help paragraphs or watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-cbad3b75-bc71-485f-911d-f2bfebc1ac9e.png",
      "originalFile": "前端视觉创新设计/补充图稿/37-怎样相处.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-设置与人格/怎么相处设置-80ec65760ad7.png"
    },
    {
      "id": "38",
      "name": "38-留在这台电脑里的.png",
      "prompt": "Use case: ui-mockup. Create page 38 for 在场, a warm Chinese desktop companion settings page dealing with the user's own saved content, 1600x1000 landscape. Real app interface, no device mockup or big promotional heading. Style must match 窗边的在场: ivory background, clean white paper, restrained champagne-gold, warm dark grey text in Noto Sans SC / PingFang-like SANS SERIF (no Song/serif UI font), very subtle sunlight, small fine icons, Apple-like generous but practical spacing. Tiny doorway logo 在场 top left, compact centered tabs 聊天 今天 留下, small avatar right. Page back link 偏好, headline 留在这台电脑里的 and a narrow quiet list of actual content categories 对话 / 关于你的理解 / 安排 / 笔记 / 选过的资料 with last-used dates, not numeric dashboards. Two clear actions 带走我的资料 and 清空这台电脑里的资料, separated so the destructive choice is not prominent. On the right, a small expanded confirmation paper attached to the clear action, title 要从这里清空吗？, concise factual text 这台电脑里的对话、记忆、安排、笔记和连接信息会被删除，无法找回。, strong safe default 先留着 and smaller muted terracotta 清空本机资料. Include a small export destination row 保存到… with a folder icon beneath the export choice; no fake completed export message. No engineering privacy-epoch codes, database discussion, verification badges, demo labels or broad safety promises. No large character. Clear human consequences expressed without alarmism, no watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-e670166c-8827-4847-bfe0-490dc6ebc783.png",
      "originalFile": "前端视觉创新设计/补充图稿/38-留在这台电脑里的.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-设置与人格/留在本机的资料-c40a35e34ccb.png"
    },
    {
      "id": "39",
      "name": "39-连接与校园资料.png",
      "prompt": "Use case: ui-mockup. Create page 39 of 在场, 1600x1000 landscape, two side-by-side actual settings views for first connection and later account management. Match the 窗边的在场 suite: warm ivory, white paper, muted champagne-gold, warm graphite, Noto Sans SC / PingFang-like Chinese SANS SERIF (no Song/serif UI type), fine line icons, comfortable precise Apple-like layout. No device frame, no promotion headline, no outer captions. Top small doorway logo 在场 and centered pill 聊天 今天 留下 in each view, tiny portrait right. LEFT: heading 连接，让我们聊起来, quiet local tabs 陪伴 / 交流 / 阅读 / 连接 with 连接 active. A single elegant primary section DeepSeek with a password field 你的密钥, masked dots only, actions 留下密钥 / 试着连接, and small 更换或移除 link. Beneath, a separate slim row 校园资料 with icon and action 需要时再连接, plus another row 本机文件 with 选一份资料. No environment/configuration jargon, endpoint strings or model benchmark information. RIGHT: heading 校园资料, back link 返回连接. A clear primary row 浙大账号 with action 登录, a discreet source entry 选择校园连接方式, and a lower already-connected state inset containing 浙大账号, 更新登录 / 断开连接. Under it actual privacy choices 可以参考课表 / 可以参考校园卡 with understandable toggles, and a single link 这次怎么使用. No invented account numbers, no visible keys or personal credentials. Warmth through calm clarity and softly lit paper, not excessive reassuring slogans. No validation/demo/test badges, fake success receipts, progress counters, disclaimers, large character or watermark.",
      "source": "C:\\Users\\17601\\.codex\\generated_images\\01a14ed0-bc5b-7403-9599-b0c0f3c19589\\exec-a1105e9b-c9be-49b2-938e-2d146593035a.png",
      "originalFile": "前端视觉创新设计/补充图稿/39-连接与校园资料.png",
      "canonicalFile": "前端视觉创新设计/统一图库/原图/界面设计-设置与人格/校园账号与资料连接-d3d4954f31c2.png"
    }
  ]
}
```


## R01 · 旧工作区恢复记录（不冒充当前远端已存）

本条来自其他代理提供的确切恢复路径，已实际打开。记录本身说明原PNG字节曾丢失，不能把恢复的调用文本当成图像已找回。源路径：`/workspace/scratch/cf86653dcd1a/recovery/zaichang/assets/design/generated/2026-10-23-youthful-presence/manifest.json`，SHA-256：`5529f159ba8f201516623970328a758487e33ae28e7bffde181fa1084cc46043`。归仓时可保存为来源文本，图片是否仍缺失须由当前全量哈希清单核验。

```json
{
  "status": "recovered_source_with_missing_original_images",
  "original_local_commit": "50b7c3b22f68c86f960da749e605df0024d564ad",
  "original_local_tree": "d9c63165f2b73cec2568e6d0ae2f24f0162ea790",
  "recovery_base": "6d5dcc1dd4b3bab7053a333366c6661a21e1b571",
  "missing_original_images": [
    "sakiko-welcome.png",
    "sakiko-reading.png",
    "mutsumi-welcome.png",
    "mutsumi-reading.png",
    "anon-welcome.png",
    "anon-reading.png",
    "tomori-welcome.png",
    "tomori-reading.png",
    "01-window-a.png",
    "02-paper-b.png",
    "03-continuity.png",
    "04-companion-states.png"
  ],
  "missing_image_policy": "Original PNG bytes were removed by workspace maintenance before the interrupted upload finished. They were not recovered from the later archive or regenerated. Runtime uses existing portraits until original assets return; old screenshots remain evidence of the pre-cleanup implementation only.",
  "recovered_window_assets": [
    {
      "path": "src/renderer/assets/companion/youthful/dusk.png",
      "bytes": 1819244,
      "sha256": "9ea62937f649f7816d0a423d8606ad070b43465ffa5ee13eb8987977035bcf78",
      "source": "user all-images(2).zip; same original 10/14/15 members as used before cleanup"
    },
    {
      "path": "src/renderer/assets/companion/youthful/morning.png",
      "bytes": 2119216,
      "sha256": "cabb4f65b1926d35de29f3f0ac0203a9fcac75cc45f105bc9b6c4063511f0227",
      "source": "user all-images(2).zip; same original 10/14/15 members as used before cleanup"
    },
    {
      "path": "src/renderer/assets/companion/youthful/night.png",
      "bytes": 1894484,
      "sha256": "b04c2bade8a902665516936cda1eefdf4b80081cf0443dded987aa8e705611da",
      "source": "user all-images(2).zip; same original 10/14/15 members as used before cleanup"
    }
  ],
  "recovered_character_invocations": [
    {
      "id": "mutsumi-welcome-bust",
      "path": "/workspace/scratch/cf86653dcd1a/generated_images/exec-2b2238a0-11fa-4e7e-b93f-202583d8f87f.png",
      "candidatePath": "/workspace/scratch/cf86653dcd1a/character-candidates/mutsumi-welcome-bust.png",
      "prompt": "Use case: identity-preserve. This is a very precise composition correction of the supplied character illustration. Keep the exact same character identity, youthful anime face, expression, hair, uniform, hand pose, prop, color and fine soft cel-shaded drawing style. Change ONLY the framing and canvas layout. FINAL OUTPUT MUST be a WAIST-UP BUST: from the waist to the full crown, with no thighs, no legs, and no visible skirt. Keep the entire head, both hands, elbows and prop inside the image. Fit the complete upper body with at least 8 percent empty transparent margin above the head and at both sides. Use a square or near-square canvas suitable for an upper-body portrait, not a tall full-body canvas. Preserve full hair where possible without having it touch canvas edges. Transparent background with real alpha, nothing else: remove any opaque or semitransparent glow, shadow, vignette or background outside the character. Do not alter her pose, mood or identity. Do not add furniture, extra objects, text, frames or other characters.",
      "referenced_image_paths": [
        "/workspace/scratch/cf86653dcd1a/character-candidates/mutsumi-welcome.png"
      ],
      "transparent_background": true,
      "generator": "built-in image_gen",
      "last_verified_before_prune": {
        "mode": "RGBA",
        "size": [
          1254,
          1254
        ],
        "alphaRange": [
          0,
          255
        ],
        "transparentPixelCount": 727168
      },
      "recovery_status": "Exact invocation and original filenames recovered from agent conversation; image bytes are not yet recovered."
    },
    {
      "id": "anon-welcome-bust",
      "path": "/workspace/scratch/cf86653dcd1a/generated_images/exec-e5aa2771-a668-401f-af92-19d60d9571b2.png",
      "candidatePath": "/workspace/scratch/cf86653dcd1a/character-candidates/anon-welcome-bust.png",
      "prompt": "Use case: identity-preserve. This is a very precise composition correction of the supplied character illustration. Keep the exact same character identity, youthful anime face, expression, hair, uniform, hand pose, prop, color and fine soft cel-shaded drawing style. Change ONLY the framing and canvas layout. FINAL OUTPUT MUST be a WAIST-UP BUST: from the waist to the full crown, with no thighs, no legs, and no visible skirt. Keep the entire head, both hands, elbows and prop inside the image. Fit the complete upper body with at least 8 percent empty transparent margin above the head and at both sides. Use a square or near-square canvas suitable for an upper-body portrait, not a tall full-body canvas. Preserve full hair where possible without having it touch canvas edges. Transparent background with real alpha, nothing else: remove any opaque or semitransparent glow, shadow, vignette or background outside the character. Do not alter her pose, mood or identity. Do not add furniture, extra objects, text, frames or other characters.",
      "referenced_image_paths": [
        "/workspace/scratch/cf86653dcd1a/character-candidates/anon-welcome.png"
      ],
      "transparent_background": true,
      "generator": "built-in image_gen",
      "last_verified_before_prune": {
        "mode": "RGBA",
        "size": [
          1254,
          1254
        ],
        "alphaRange": [
          0,
          255
        ],
        "transparentPixelCount": 647644
      },
      "recovery_status": "Exact invocation and original filenames recovered from agent conversation; image bytes are not yet recovered."
    },
    {
      "id": "tomori-welcome-bust",
      "path": "/workspace/scratch/cf86653dcd1a/generated_images/exec-a3b74dca-65bc-4779-be5e-ce4ea8eda438.png",
      "candidatePath": "/workspace/scratch/cf86653dcd1a/character-candidates/tomori-welcome-bust.png",
      "prompt": "Use case: identity-preserve. This is a very precise composition correction of the supplied character illustration. Keep the exact same character identity, youthful anime face, expression, hair, uniform, hand pose, prop, color and fine soft cel-shaded drawing style. Change ONLY the framing and canvas layout. FINAL OUTPUT MUST be a WAIST-UP BUST: from the waist to the full crown, with no thighs, no legs, and no visible skirt. Keep the entire head, both hands, elbows and prop inside the image. Fit the complete upper body with at least 8 percent empty transparent margin above the head and at both sides. Use a square or near-square canvas suitable for an upper-body portrait, not a tall full-body canvas. Preserve full hair where possible without having it touch canvas edges. Transparent background with real alpha, nothing else: remove any opaque or semitransparent glow, shadow, vignette or background outside the character. Do not alter her pose, mood or identity. Do not add furniture, extra objects, text, frames or other characters.",
      "referenced_image_paths": [
        "/workspace/scratch/cf86653dcd1a/character-candidates/tomori-welcome.png"
      ],
      "transparent_background": true,
      "generator": "built-in image_gen",
      "last_verified_before_prune": {
        "mode": "RGBA",
        "size": [
          1254,
          1254
        ],
        "alphaRange": [
          0,
          255
        ],
        "transparentPixelCount": 859538
      },
      "recovery_status": "Exact invocation and original filenames recovered from agent conversation; image bytes are not yet recovered."
    },
    {
      "id": "mutsumi-reading",
      "path": "/workspace/scratch/cf86653dcd1a/generated_images/exec-b7559b4e-af34-4034-965b-2f1b21b7c1c5.png",
      "candidatePath": "/workspace/scratch/cf86653dcd1a/character-candidates/mutsumi-reading.png",
      "prompt": "Use case: identity-preserve. Asset type: transparent production character cutout for Zaichang. Make a new READING pose of exactly the same anime girl shown in the reference. Preserve identity, face, hair color, eye color, school uniform, youthful 15–16-year-old high-school appearance, delicate clean lines and refined soft cel shading. Pure 2D Japanese anime, not realism, not mature older-sister face, not sexualized. Change only pose and framing as requested. IMPORTANT framing: waist-up BUST only, from the waist to above the entire head. Do not include legs or skirt. All of the head, hands, elbows, and the small book must be fully visible; leave generous empty transparent margin on left, right, and top. Slight three-quarter side turn toward viewer's left (content side), gently bowed head, eyes looking down at the page with absorbed but approachable expression. Truly transparent alpha PNG. NO background, wall, desk, chair, window, floor, halo, glow, colored gradient, vignette, painted checkerboard, frame, text or other characters. Warm soft daylight from the left affects the character only.\nWakaba Mutsumi 若叶睦: long straight pale green hair, restrained face, golden-brown eyes, two gold hairclips retained. Replace the guitar pick with a small open cream-paged navy book held comfortably in both hands at mid-chest. Quiet three-quarter side view reading, head slightly lowered, faint calm interest; keep face identifiable. Do not add guitar or other props.",
      "referenced_image_paths": [
        "/workspace/scratch/cf86653dcd1a/generated_images/exec-2a8c6312-ea3f-4d40-9e5a-9f823c4db290.png"
      ],
      "transparent_background": true,
      "generator": "built-in image_gen",
      "last_verified_before_prune": {
        "mode": "RGBA",
        "size": [
          1024,
          1536
        ],
        "alphaRange": [
          0,
          254
        ],
        "transparentPixelCount": 487189
      },
      "recovery_status": "Exact invocation and original filenames recovered from agent conversation; image bytes are not yet recovered."
    },
    {
      "id": "anon-reading",
      "path": "/workspace/scratch/cf86653dcd1a/generated_images/exec-2a130d99-3b0c-4245-9191-82236becf4da.png",
      "candidatePath": "/workspace/scratch/cf86653dcd1a/character-candidates/anon-reading.png",
      "prompt": "Use case: identity-preserve. Asset type: transparent production character cutout for Zaichang. Make a new READING pose of exactly the same anime girl shown in the reference. Preserve identity, face, hair color, eye color, school uniform, youthful 15–16-year-old high-school appearance, delicate clean lines and refined soft cel shading. Pure 2D Japanese anime, not realism, not mature older-sister face, not sexualized. Change only pose and framing as requested. IMPORTANT framing: waist-up BUST only, from the waist to above the entire head. Do not include legs or skirt. All of the head, hands, elbows, and the small book must be fully visible; leave generous empty transparent margin on left, right, and top. Slight three-quarter side turn toward viewer's left (content side), gently bowed head, eyes looking down at the page with absorbed but approachable expression. Truly transparent alpha PNG. NO background, wall, desk, chair, window, floor, halo, glow, colored gradient, vignette, painted checkerboard, frame, text or other characters. Warm soft daylight from the left affects the character only.\nChihaya Anon 千早爱音: long pink hair, gray eyes, pale blue uniform ribbon retained. Pose: reading attentively, a small open book supported by one hand near mid-chest, index finger of the other hand lightly touches one point on the page as if noticing an interesting detail. Smaller focused smile, slight forward engagement, no waving and no exaggerated surprise. Correctly rendered hand and index finger.",
      "referenced_image_paths": [
        "/workspace/scratch/cf86653dcd1a/generated_images/exec-834086ad-9183-4e46-972b-da4ee393e099.png"
      ],
      "transparent_background": true,
      "generator": "built-in image_gen",
      "last_verified_before_prune": {
        "mode": "RGBA",
        "size": [
          1024,
          1536
        ],
        "alphaRange": [
          0,
          254
        ],
        "transparentPixelCount": 531609
      },
      "recovery_status": "Exact invocation and original filenames recovered from agent conversation; image bytes are not yet recovered."
    },
    {
      "id": "tomori-reading",
      "path": "/workspace/scratch/cf86653dcd1a/generated_images/exec-6463ecfe-ae79-47c7-8d70-1c6c43782496.png",
      "candidatePath": "/workspace/scratch/cf86653dcd1a/character-candidates/tomori-reading.png",
      "prompt": "Use case: identity-preserve. Asset type: transparent production character cutout for Zaichang. Make a new READING pose of exactly the same anime girl shown in the reference. Preserve identity, face, hair color, eye color, school uniform, youthful 15–16-year-old high-school appearance, delicate clean lines and refined soft cel shading. Pure 2D Japanese anime, not realism, not mature older-sister face, not sexualized. Change only pose and framing as requested. IMPORTANT framing: waist-up BUST only, from the waist to above the entire head. Do not include legs or skirt. All of the head, hands, elbows, and the small book must be fully visible; leave generous empty transparent margin on left, right, and top. Slight three-quarter side turn toward viewer's left (content side), gently bowed head, eyes looking down at the page with absorbed but approachable expression. Truly transparent alpha PNG. NO background, wall, desk, chair, window, floor, halo, glow, colored gradient, vignette, painted checkerboard, frame, text or other characters. Warm soft daylight from the left affects the character only.\nTakamatsu Tomori 高松灯: short gray-brown bob, reddish-brown eyes, blue school ribbon retained. Pose: small open book at mid-chest held by one hand, other hand gently turning a single page; gaze follows the page, quiet concentration with soft natural face. Remove the pebble in this reading pose. No extra props.",
      "referenced_image_paths": [
        "/workspace/scratch/cf86653dcd1a/generated_images/exec-3320b2f0-0c1c-48ac-9a89-a2cf3b3b6b43.png"
      ],
      "transparent_background": true,
      "generator": "built-in image_gen",
      "last_verified_before_prune": {
        "mode": "RGBA",
        "size": [
          1024,
          1536
        ],
        "alphaRange": [
          0,
          254
        ],
        "transparentPixelCount": 573180
      },
      "recovery_status": "Exact invocation and original filenames recovered from agent conversation; image bytes are not yet recovered."
    }
  ],
  "recovered_welcome_reframes": [
    {
      "id": "mutsumi-welcome-bust",
      "path": "/workspace/scratch/cf86653dcd1a/generated_images/exec-2b2238a0-11fa-4e7e-b93f-202583d8f87f.png",
      "candidatePath": "/workspace/scratch/cf86653dcd1a/character-candidates/mutsumi-welcome-bust.png",
      "prompt": "Use case: identity-preserve. This is a very precise composition correction of the supplied character illustration. Keep the exact same character identity, youthful anime face, expression, hair, uniform, hand pose, prop, color and fine soft cel-shaded drawing style. Change ONLY the framing and canvas layout. FINAL OUTPUT MUST be a WAIST-UP BUST: from the waist to the full crown, with no thighs, no legs, and no visible skirt. Keep the entire head, both hands, elbows and prop inside the image. Fit the complete upper body with at least 8 percent empty transparent margin above the head and at both sides. Use a square or near-square canvas suitable for an upper-body portrait, not a tall full-body canvas. Preserve full hair where possible without having it touch canvas edges. Transparent background with real alpha, nothing else: remove any opaque or semitransparent glow, shadow, vignette or background outside the character. Do not alter her pose, mood or identity. Do not add furniture, extra objects, text, frames or other characters.",
      "referenced_image_paths": [
        "/workspace/scratch/cf86653dcd1a/character-candidates/mutsumi-welcome.png"
      ],
      "transparent_background": true,
      "generator": "built-in image_gen",
      "last_verified_before_prune": {
        "mode": "RGBA",
        "size": [
          1254,
          1254
        ],
        "alphaRange": [
          0,
          255
        ],
        "transparentPixelCount": 727168
      },
      "recovery_status": "Exact invocation and original filenames recovered from agent conversation; image bytes are not yet recovered."
    },
    {
      "id": "anon-welcome-bust",
      "path": "/workspace/scratch/cf86653dcd1a/generated_images/exec-e5aa2771-a668-401f-af92-19d60d9571b2.png",
      "candidatePath": "/workspace/scratch/cf86653dcd1a/character-candidates/anon-welcome-bust.png",
      "prompt": "Use case: identity-preserve. This is a very precise composition correction of the supplied character illustration. Keep the exact same character identity, youthful anime face, expression, hair, uniform, hand pose, prop, color and fine soft cel-shaded drawing style. Change ONLY the framing and canvas layout. FINAL OUTPUT MUST be a WAIST-UP BUST: from the waist to the full crown, with no thighs, no legs, and no visible skirt. Keep the entire head, both hands, elbows and prop inside the image. Fit the complete upper body with at least 8 percent empty transparent margin above the head and at both sides. Use a square or near-square canvas suitable for an upper-body portrait, not a tall full-body canvas. Preserve full hair where possible without having it touch canvas edges. Transparent background with real alpha, nothing else: remove any opaque or semitransparent glow, shadow, vignette or background outside the character. Do not alter her pose, mood or identity. Do not add furniture, extra objects, text, frames or other characters.",
      "referenced_image_paths": [
        "/workspace/scratch/cf86653dcd1a/character-candidates/anon-welcome.png"
      ],
      "transparent_background": true,
      "generator": "built-in image_gen",
      "last_verified_before_prune": {
        "mode": "RGBA",
        "size": [
          1254,
          1254
        ],
        "alphaRange": [
          0,
          255
        ],
        "transparentPixelCount": 647644
      },
      "recovery_status": "Exact invocation and original filenames recovered from agent conversation; image bytes are not yet recovered."
    },
    {
      "id": "tomori-welcome-bust",
      "path": "/workspace/scratch/cf86653dcd1a/generated_images/exec-a3b74dca-65bc-4779-be5e-ce4ea8eda438.png",
      "candidatePath": "/workspace/scratch/cf86653dcd1a/character-candidates/tomori-welcome-bust.png",
      "prompt": "Use case: identity-preserve. This is a very precise composition correction of the supplied character illustration. Keep the exact same character identity, youthful anime face, expression, hair, uniform, hand pose, prop, color and fine soft cel-shaded drawing style. Change ONLY the framing and canvas layout. FINAL OUTPUT MUST be a WAIST-UP BUST: from the waist to the full crown, with no thighs, no legs, and no visible skirt. Keep the entire head, both hands, elbows and prop inside the image. Fit the complete upper body with at least 8 percent empty transparent margin above the head and at both sides. Use a square or near-square canvas suitable for an upper-body portrait, not a tall full-body canvas. Preserve full hair where possible without having it touch canvas edges. Transparent background with real alpha, nothing else: remove any opaque or semitransparent glow, shadow, vignette or background outside the character. Do not alter her pose, mood or identity. Do not add furniture, extra objects, text, frames or other characters.",
      "referenced_image_paths": [
        "/workspace/scratch/cf86653dcd1a/character-candidates/tomori-welcome.png"
      ],
      "transparent_background": true,
      "generator": "built-in image_gen",
      "last_verified_before_prune": {
        "mode": "RGBA",
        "size": [
          1254,
          1254
        ],
        "alphaRange": [
          0,
          255
        ],
        "transparentPixelCount": 859538
      },
      "recovery_status": "Exact invocation and original filenames recovered from agent conversation; image bytes are not yet recovered."
    }
  ]
}
```


## 本轮后续实际重绘

[完整两次实际调用原文](本轮重绘原始Prompt.json)：先以无人物空房为唯一参考重画并腿祥子，再仅对通过人体观察的新母图提取alpha。没有把旧错误交腿人物输入重绘。母图SHA与当前采用范围见catalog的N001/N002；并非完整矩阵已经补齐。
