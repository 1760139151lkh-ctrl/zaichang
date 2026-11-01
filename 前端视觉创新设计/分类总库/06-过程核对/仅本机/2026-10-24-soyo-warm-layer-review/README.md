# Soyo 暖杏六活动原景分层

此目录为局部校准与亲看记录。来源层包均在 `来源记录/assets-design-generated/2026-10-23-companion-matrix/soyo-taki`，不构成产品第二实现。Root 已批准正确完整母图及实际 Prompt，层包仍须 Root 主审、原 Stage 实际查看和运行验收。

当前候选：

| 活动 | 人物 / mask | 空房 / 接触暗影 | 亲看入口 |
|---|---|---|---|
| reading | v8 | v10 | `soyo-reading-parent-final-{dark-detail,light-detail,room,empty}.png` |
| planning | v7 | v8 | `soyo-planning-parent-final-{dark-detail,light-detail,room,empty}.png` |
| rest | v9 | v9 | `soyo-rest-parent-final-{dark-detail,light-detail,room,empty}.png` |
| play | v14 | v14 | `soyo-play-parent-final-{dark-detail,light-detail,room,empty}.png` |
| attention | v8 | v8 | `soyo-attention-parent-final-{dark-detail,light-detail,room,empty}.png` |
| listening | v24 | v24 | `soyo-listening-parent-final-{dark-detail,light-detail,room,empty}.png` |

`role_matrix_settings` 已亲看六套深浅底、完整空景及完整重合成，并在子交付后继续修正 listening/play；层仍须 Root 主审，未签运行。统一 `parent-final` 文件按实际选定 scene 生成。原 v20 listening、v12/v13 play 与子诊断保为过程证据，不是当前选定层。

第二轮校准只改 alpha：listening v23 进一步清掉发环中剩余的两条亮窗框及靠垫碎片，保持原发环；v24 恢复原蒙版误删的 239 个真实袖子高光／袖口像素。parent v21 空气多边形误达真发环，已拒绝且没有作为后续输入。play v14 只在亲看确认的左外发空气区域衰减原蓝天像素的 alpha，保棕发原 RGB。参数和原像素处理脚本、SHA 均在来源目录，当前六项 RGB changed pixels 仍为 0。

已对最终六项亲看原母图、完整实际母图 Prompt、透明层深浅底、去人空房和原坐标全房合成；读取现有 SceneRegistration 契约，窗座采用 `window-seat`，安排采用 `desk-chair`。各项独立 seat/ground/bodyBounds/safeTextBoundary；planning 原左缘 x640，边界 0.40。所有当前姿态保真实坐面／桌手／撑手／鞋底接触，travel/slope/perspective 为 0；端点即同一固定位置，不制作假平移端点图，不宣称已验证拖拽或原 Stage。

每张正确母图各自用 built-in Imagegen 生成 matching clean BG，只把原人完整足迹及原人投影范围的同景空房接回；其余保原母 RGB。倾听地上两只脱鞋、桌上纸和留意卡始终属于房间；阅读书与玩耍手持书签随人物。人物全部 RGB 原样来自原母，只有 alpha 改变可见性，完整画布 1536×1024。原生成 Prompt、唯一正确母图输入、输入/输出 SHA、实际执行 ID 和处理参数均保留。

自动差异分割的第一轮肤色、白领、书页和金币错误透明、腿后房间木条与空房旧人投影都逐处打回修正。play 手描发束 v9、attention v5 不贴原发束，已拒绝；play v10、attention v6 全局 GrabCut 删细发，已拒绝。最终采用另一次同坐标 Imagegen 原景 mask，经原景差异局部边缘 alpha 校准及细小噪声清理；始终不改人物颜色，不重画脸／身体／头发，不把失败候选垫图。

listening 的位移 mask v8 明确拒绝、未作输入；正确原母再次生成的同坐标 mask 经局部 alpha 校准，v20 是子交付候选，之后由父代理继续修正至当前 v24。v14–18 的误切／丢发试版未进入最终链。当前六项的实际文件 SHA、尺寸与 RGB 逐像素变化量已直接读取，均为 1536×1024、RGB changed pixels=0；清单在来源目录 `soyo-warm-layer-package.json`。RGB 一致不代替几何与细发判断，所有层仍需 Root 亲审。

没有修改 `src`、9222、main、人格、全局矩阵或 Primary 记录，没有添加测试代码、fixture 或 runner，没有调用 DeepSeek。Scene 源候选 `approvedByPrimary:false`、运行待审。

只清理已确认完全重复且引用已回归 v12 的两份 play BG 升版副产物：`soyo-play-apricot-figure-calibrated-v13.png`（2,472,349 bytes，约 2.47 MB）和 `soyo-play-apricot-mask-calibrated-v13.png`（43,373 bytes，约 43.4 KB）。这是文件逻辑大小，不声称磁盘释放量。原 mask、参数及处理依赖保留。
