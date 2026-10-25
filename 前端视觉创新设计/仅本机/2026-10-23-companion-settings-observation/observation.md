# 陪伴设置原入口实际观察

日期：2026-10-23 本地工作日（原 owner 保存时间采用其 UTC 时间）。本记录由 persona 子代理写入，主代理保留最终集成验收。沿既有 Electron 的 `app://zaichang/index.html`、9222 精确目标进入正常菜单与设置，未发模型请求，未创建测试代码或 runner，未替换 Bridge 或直接编辑数据库文件。

## 活动切换与布局

- 原缺陷：1220×768 中预览卡约 758px，底部时刻按钮滚入可视区后，第二层 sticky 工具栏覆盖房间上缘。已亲看空间线原实机证据，再做改动。
- 现在右卡仅包含原工具栏、完整 3:2 房间和八时刻；主题、出现方式及可展开调整移至左选择列。工具栏为普通流，整卡统一 sticky；标题、文字与按钮标尺未缩小。
- 1220×768 选择“小发现”后：卡 y=72、高 593.396、底 665.396；工具栏 y=73、高 64；舞台 648.594×432.396、y=137。完整头、髋与座垫、两鞋、原房间可见。见 `play-after-activity-1220x768.png` 与最终构建的 `final-play-layout-1220x768.png`。
- 1220×570 选择“新对象”后：卡 y=72、高 431、底 503；房间 405×270，保持 3:2，完整头脚与家具可见，采用/取消及八时刻同时可见。见 `attention-after-activity-1220x570.png`。
- 初次600宽复核发现相关窄栏缺陷：原有滚动位置使整卡 y=-66.854，时刻本身可见但工具栏/上缘出屏。已修为时刻点击后只在必要时把整卡 nearest 揭示，不重建草稿、不做滚动动画。
- 同原流程重查600×768：卡 y=100.146、高531、底631.146，房间555×370；390×768：卡 y=99.922、高391、底490.922，房间345×230；采用/取消、人物头脚与八时刻完整可见，两者 document scrollWidth 均等于 viewport 宽。见 `play-after-activity-600x768-fixed.png`、`attention-after-activity-390x768-fixed.png`。失败前图 `play-after-activity-600x768.png` 保留为诊断，不当通过证据。
- 以上窄窗为原 renderer 真实 viewport 调整与截图，不冒称 Windows 原生窗口边框拖动。

## 原设置 owner、草稿与取消

- 在“怎么称呼这个形象”输入 `祥子·未保存`，随后正常点“收藏祥子”。输入仍完整保留，已保存 names 仍为空；原缺陷的无关对象变更重置输入已消除。见 `nickname-draft-survives-favorite.png`。之后恢复输入并取消收藏，未保存试验称呼。
- 小发现 End→Enter 预览100，新对象 Home→Enter 预览-100，再切回小发现仍100；原 scenePositions 仍两个0。点“先不换”后动画连续收敛0，采用按钮禁用，两个持久0不变。
- 再沿同流程采用两个时刻，原 owner 实际保存 play=1、attention=-1；正常 reload 后重开设置，两个实际 slider 分别100/-100。随后各自正常“坐在哪里→回到原处→采用”，持久两个值均恢复0。没有通过 localStorage 注入制造结果。
- 晨雾蓝缺少当前可消费姿态时只预览空房，采用按钮禁用；保存 palette 仍为暖杏，未把缺格或其他姿态当当前覆盖。
- 媒体查询使用 Playwright 真实浏览器 `emulateMedia(colorScheme=dark)` 触发，非手工派发事件。事件后的 React 效果收敛后：媒体dark=true、当前选择/DOM palette 均mist，已保存palette仍apricot。取消后恢复暖杏；最后清除了媒体模拟。见 `palette-preview-media-settled.png`。立即读取出现过事件尚未收敛的apricot值，不把该瞬间当最终结果。没有声称实际改变了Windows系统设置或验证了另一原生窗口。
- 图片通过原 file input 选择现有生成空房资产，同时立即执行“先不换”；异步操作结束后，预览仍Sakiko、图片集合仍0、原保存选择不变。没有捕捉到“正在打开图片”文案（解码很快），故不把慢解码状态的视觉可达性写成已验证；没有造大文件、延迟或替代解码器。

## 人格 CAS、保留与恢复

- 正常进入“编辑相处方式”，保留未提交名 `丰川祥子·草稿`。为重现真实并发保存，使用同一原 `window.zaichang.saveSettings` owner 以当前revision0保存 `丰川祥子·另一处`，得到revision1；没有直接改SQLite或绕 expectedRevision。
- 旧编辑器点击“留下这些约定”被原owner拒绝，实际保存仍另一处，未提交草稿完整保留，保存按钮禁用且出现“继续使用这份草稿”。见 `persona-real-cas-conflict.png`。
- 点继续使用并正常保存，得到revision2且名为草稿；在“以前的约定与随身带走”选择最初revision0并“回到这份约定”，得到revision3，完整core与初始逐字段一致。
- 实操发现旧宿主文案“请重新打开设置”与当前可继续草稿入口矛盾。编辑器现在识别已刷新的revision冲突，提示文字仍在并保留继续路径；再沿同原owner重现revision3→4冲突，页面显示新反馈而不要求关闭设置。见 `persona-real-cas-human-feedback-fixed.png`。
- 第二次用正常“先不改了”和历史revision3恢复，最终revision5、source=undo，完整core与最初revision0相同，name=丰川祥子、address为空。历史按原owner保留5次真实保存/撤回，不删除或伪造旧记录。仅此隔离运行数据发生这些修订，不触碰用户生产数据库。
- 共享冲突错误源的旧“重新打开”措辞也已改成先看新约定再决定，守卫/版本逻辑不变；该宿主字串待主代理下一次main构建后生效。本轮已实际重查的是编辑器当前构建的反馈分支。

## 交还状态与范围

- 原窗口交还：1220×768、Settings小发现、Sakiko/window/morning/暖杏/light；reducedMotion=false，scale1/position50/vertical100，pictures/favorites/names均空，scenePositions play=0/attention=0，slider0。
- 人格revision5但完整core等于起初revision0，称呼/自称/语气/例句均未被改写；试验变化仅留原owner合法历史。媒体模拟已清除。
- 最新类型检查及renderer构建通过；构建只有既有Vite loader/chunk提示。本轮没有重启Electron main、停止健康会话或模型运行，没有新测试/fixture/runner。
- 角色矩阵新三格随最新renderer构建进入资源图，但本线没有代签这些场景的runtime，也不以设置观察替代主聊天退让或新姿态运行验收。主代理随后亲核最终集成。
