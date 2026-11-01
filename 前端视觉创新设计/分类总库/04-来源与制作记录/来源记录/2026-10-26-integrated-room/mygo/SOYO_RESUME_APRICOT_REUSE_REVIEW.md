# 爽世暖杏 resume：复用母图，确缺合格同源层

**人物无需重新生成；现有文件尚不能直接组成合格 exact resume 的同源四件包。** v2原母已经有旧root静态准入，F1/F2确是从它提取；当前F2在书页与书签内部仍有黑线，S和同母移人空景还没有实际PNG。本轮只核来源与艺术/支撑，未调用Image、未登记运行。

## 原母值得保留的东西

已再次亲开完整原母：[soyo-resume-apricot-literary-v2.png](<../../2026-10-25-literary-room/soyo/apricot-wardrobe-correction-v2/soyo-resume-apricot-literary-v2.png>)。她留着自己那页书，薄红书签还在，抬眼的高兴先于嘴角，蓝眼与轻下巴保持少女辨识。手掌、书、膝承托连贯，髋坐软垫、裙沿与膝踝到完整鞋的关系成立。灰蓝结心已是织物，金色校章在左胸。晴日与灯光自然接到脸、手、衣料、坐垫与木地板。这是实际接续阅读的时刻，不能拿attention改名代替，也不必为换运行入口重画人物。

![爽世 resume v2完整原母](<../../2026-10-25-literary-room/soyo/apricot-wardrobe-correction-v2/soyo-resume-apricot-literary-v2.png>)

母SHA `4381d5f5faeeeedf1b84bf9e69bad71fe4a6dc06a7d8653c8b1f88b48c559cbe`，2473344 bytes，1536×1024 RGB。本轮已实际回算一致。

既有 [root-human-mother-primary-review-20261025.json](<../../2026-10-25-integrated-room/root-human-mother-primary-review-20261025.json>) 的 `soyo/resume/apricot` 项精确绑定此SHA，2026-10-25T19:15:18.891Z记为 `approved_static_mother`，输入许可true、layersApproved/runtimeAccepted均false。母自己的producer source仍保早期false字段，不能以那一份早期候选快照抹去独立root记录，也不能把root静态准入扩成层/运行准入。本轮180 ledger已补16张爽世该独立root记录引用，未改原source批准。当前root记录文件SHA为 `6f67fcc8efc9f1a4be5581c9fda78a508a60769ad1362bba8154367cbc977954`；旧层记录的“read时文件SHA”是历史版本，本文不把两者冒称同一文件字节。

## 现有层是真的同源，但不是合格终稿

| 实物 | 准确路径 / 来源 | 本轮亲看与判断 |
|---|---|---|
| F1实际PNG | [figure-step1-marked-v1.png](<../../2026-10-25-literary-room/soyo/resume-layers/apricot/figure-step1-marked-v1.png>)；[source](<../../2026-10-25-literary-room/soyo/resume-layers/apricot/figure-step1-v1.source.json>) | source输入和sourceMother均精确绑定v2母SHA；原位整人、开书、红书签和鞋选区在，书页/书签内部仍有线，只是选区中间稿 |
| F2实际PNG | [figure-mask-v1.png](<../../2026-10-25-literary-room/soyo/resume-layers/apricot/figure-mask-v1.png>)；[source](<../../2026-10-25-literary-room/soyo/resume-layers/apricot/figure-step2-v1.source.json>) | 来源为上述F1，sourceMother仍是v2母；书沿、翻页与书签内部有明显暗/黑线，亮度mask会在真实书内削弱覆盖，不能直接认完整轮廓 |
| S1 / S2 | 目录中没有接触标记/接触mask实际PNG | [contact-step1-v1.prompt.json](<../../2026-10-25-literary-room/soyo/resume-layers/apricot/contact-step1-v1.prompt.json>)明确prepared-not-yet-called；提示词不是生成结果 |
| 同母BG | 没有scene-background-v1.png | [background-v1.prompt.json](<../../2026-10-25-literary-room/soyo/resume-layers/apricot/background-v1.prompt.json>)明确prepared-not-yet-called；不能借chat/attention/neutral空景或最初纯房间图冒充同母恢复 |

F1实际SHA `cd988baff0313725c348bee352cc98dc84a0b5697a00ade072f16fce0fe1a344`；F2实际SHA `ed2360ccaa8010bce7668dbdf639a5edab0d743a78dc7d04825fe62dbcb3b1b5`。两件均已回算，画布1536×1024 RGB。名称看似齐全不等于F合格；原source本来也没有准它们为终稿。

![现有F2：书与红书签内部黑线仍在](<../../2026-10-25-literary-room/soyo/resume-layers/apricot/figure-mask-v1.png>)

此结论来自完整原母、F1、F2实际看图及source输入链。另核过爽世resume目录、全部前端视觉资产中soyo/resume文件名和来源记录中精确母SHA引用；没有发现另套已完成的同源S/BG。本文不冒称已读完该历史专线每一轮raw聊天。

## 可执行的最短复用途径

root解除本次补层暂停后，沿同一张v2母做技术提取：先重新取得没有书页/书签内孔的F；不把当前孔mask喂回。随后从同母取得榻裙/髋压垫和双鞋实际接触区的S1/S2，以及仅移去这人、她的书与书签及相连接触影的同相机BG。保完整房间和人物原坐标、原RGB一次，以 `MAX(L(F),L(S))` 联合；软垫/木纹接触材料固定原位，travel/slope/perspective=0。

同源全套齐后，实际检查浅底、深底、棋盘上的整人和书手红书签、髋与垫、鞋与地板，再交root亲看后登记exact resume。现在不能用硬阈值、手填孔、借attention mask或把完整母图当可移动贴纸绕过缺口。

这仅解决暖杏resume当前回退旧chat的素材前提；旧chat金色结饰以及其他动作的现状仍需如实保留。没有因此声称爽世全角/四光/动态已修好。新人物、mask调用和注册本轮继续为0。

