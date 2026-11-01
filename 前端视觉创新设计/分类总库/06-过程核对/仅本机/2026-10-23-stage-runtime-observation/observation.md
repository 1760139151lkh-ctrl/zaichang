# 原Stage两格实际操作记录（子代理观察，非主代理运行验收）

日期：2026-10-23。沿已有 Electron 原实例的 `app://zaichang/index.html`、9222 精确调试目标进入正常设置；不发送模型，不重开进程，不改 Message/Scene 业务数据。主代理保留最终验收，两个 .scene.json 的 runtimeAccepted 未改。

## 命中与画布

- 设置“小发现”命中 `sakiko-play-apricot-v4`，母图/完整BG/原RGB figure/同源shadow均1536×1024。实际 transform-origin = 85.612% 58.1055%，对应新seat(1315,595)。
- 设置“新对象”命中 `sakiko-attention-apricot-v4`，同四层1536×1024。实际 transform-origin = 86.5885% 56.4453%，对应新seat(1330,578)。
- 1220×768时预览Stage648.594×432.396，完整同一camera scale .422256。背景/人物/影共享canvas，不独立cover。
- 已亲看 `play-stage-full-view.png`、`attention-stage-full-view.png`：髋与座面、撑手、完整双鞋和背景家具可见。实际移动中没有发现旧鞋/人物黑轮廓残留；这不扩称其他资产或任意跨家具运动。

## 普通鼠标与取消

- play于身体热区按下，指针从(1055,440)到(1060,441)，value约+65，人物世界dx12.0203px×camera .422256≈5.08px；即时跟手。
- 同一抓取反向到(1050,439)，value约-65；canvas transform保持不变。
- 抓取中Esc后连续回原位：即时保留负速度约-70，随后停在0。持久scenePositions仍{}，没有旧起点闪跳。
- 再次松手途中立即重抓：released value74、regrab75，约0.08px自然前进；新抓取接手当前位置，没有跳回0。反向再松手形成内存预览，持久仍{}。
- attention从(1080,520)到(1084,521)，value约70、dx9.6311px；反向松手value约-61，Esc随后回0，未增加attention持久值。
- 实际动作采用正常Playwright鼠标/键盘输入；读取DOM只用于观察，未用dispatchEvent或修改DOM制造过程。

## 键盘、预览与保存

- Tab可从预览取消按钮到真实角色slider，焦点仍在slider。方向键预览8时不持久；Esc回原值。
- attention End合法端value100、world dx13.824；Esc回0，保存不变。
- preview release/Enter只改内存草稿。实际采用后play .3462867645036616、attention .08写入原companion偏好。
- 正常reload后读取同一localStorage owner，两值完整保留。
- “先不换”取消整份试坐；之后通过正常“坐在哪里→回到原处→采用”把两格恢复零位。
- 零位后独立再核整份预览取消：End→Enter预览100，再点“先不换”即时value87且采用按钮禁用，随后连续停在0；持久两个零值不变。
- 结束时character=sakiko、presence=window、light=morning、暖杏、reducedMotion=false；scenePositions保留两个显式零键（原来为{}），没有遗留试坐偏移。
- “少一点动态”在设置草稿内开启后，End→Esc同回合立即回到已保存.08，没有回弹尾程；未把该预览冒称已提交全局设置，最后恢复关闭。

## 窄视口

- 原renderer实际600×768：Stage555×370、scale .361328、页面宽600，无横向溢出，完整人物与家具同比缩放。亲看 `attention-preview-600.png`。
- 原renderer实际390×768：Stage345×230、scale .224609、页面宽390，无横向溢出，完整头脚在同Stage内。亲看 `attention-preview-390.png`。
- 最后恢复1220×768。
- 这是原renderer窄viewport观察，不冒称Windows物理窗口边框拖动通过。Electron调试不提供Browser.getWindowForTarget；Sky两个同exe句柄均返回另一WebVPN窗口画面，未用这些错截图坐标拖动或触碰登录。

## 仍需主代理处理/亲操

- Settings预览卡总高758px大于1220×768下可视696px；点击下方“小发现”自动滚动后，sticky action header曾盖住较高的play头顶。正常向上滚动可完整看图。已交persona设置CSS负责人；本线未擅改其文件。
- 当前b7最近助手0dada…没有companion hint，旧9a4…的play hint没有抢最新视觉，主界面合法地选择reading缺格；没有伪造当前消息hint。新两格在主聊天正文旁的quiet退让、真实语义切换与真实物理窄窗仍由根接实际入口亲操，不能用Settings预览代签。
- 无新测试代码/runner，无模型请求，无sidecar runtime true，无Stage源码改动。

