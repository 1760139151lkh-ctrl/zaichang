# 纯净房间与同景母稿直接观察

本记录来自本轮房间美术子代理亲自打开原图后的观察。它不代替主代理准入，也不把静态母稿、分层和真实运行混作一种完成状态。未修改旧来源记录或旧准入结论。

## 保留的母景

首选空景为 `../../2026-10-25-literary-room/plates/literary-room-clear-day-v1.png`，1536×1024，既有来源记录输出 SHA-256 为 `f9a1a6a33c682a27dd2a8bf40ff361e0c9ceed52bbc7bd811db70694bef8664c`。它的近处窗榻、左后书桌、木椅、瓷灯、窗外湖城和前景植物属于同一透视与光场。没有人物、文字或界面灰块，可继续作为新的完整同景姿态输入。

本轮已逐幅亲看同目录全部8张空景：`clear-day`、`overcast-day`、`rain-day`、`twilight`、`dry-night`、`rain-night`、`time-day`、`time-night`。阴天的冷天光仍保留木材暖色；暮色是整幅天空与室内灯光自然变化；夜雨是完整冷外景、暖灯内景，没有昼夜硬切。日雨的玻璃、远景和地面受光成套变化，干夜没有雨水，闭帘两张只表达中性日夜。自然植物可保留固有色，界面不借其建立绿色强调。

人物母景建议继续锁原1536×1024近机位。四主题可明确对应暖杏clear-day、晨雾蓝overcast-day、暮色紫twilight和夜雨暖金rain-night；中性闭帘单列，天气变体亦单列。它们属于同一房间，不能仅按有几张图推断全角色全部主题已完成。

## 亲近尺度与真实动作

亲看用户选定的 `../../2026-10-25-ambient-redesign/sakiko-reading-literary/sakiko-reading-apricot-literary-v1.png`。她的书、手、目光、座垫和完整鞋属于一个安静阅读瞬间；人物在右侧约三分之一，近处的亲近尺度是这一图的重要价值。

亲看了文学房间中祥子的 chat、play、planning、listening、rest、resume 暖杏母稿，以及真正左书桌位的 study 母稿和新的 neutral-reading-time-day 母稿。chat、play、planning、listening 基本共享右窗榻端坐关系，手里纸鹤或本子不同，不能因文件名不同计为四种主要空间动作。rest 有望窗的转向，但仍是普通端坐。真正左书桌 study 改变了身体与家具关系，应让正文去适合的位置，而不能继续将大纸板盖在人物所在左侧。

旧 `sakiko/pilot-extra-a/sakiko-resume-apricot-literary-pilot-v1.png` 的脸部与衣装气质比新 `sakiko/time-only-neutral-pilot-v1/sakiko-neutral-reading-time-day-v1.png` 成熟；详细护照已说明旧显老 resume 不作新输入，本轮遵守这一排除。新的中性阅读稿表情更年轻，手指、书页和抬眼有关系，但闭帘中性光不代替晴天、暮色和夜雨主题。

## 界面融入方向

亲看 `../../2026-10-25-integrated-room/room/night-shared-light-longchat-v1.png`。烟茶色阅读承托与完整暖灯光场相接，长文字仍清楚，琴键和击弦装置属于同一工作面。这是一张可参考的夜间设计稿，不能将整图贴进产品冒充真实琴键和文本。

`../../2026-10-25-literary-room/ui/home/home-literary-day-v1.png` 中的薄暖纸气泡与输入保留了大部分房间关系。其字号、位置和导航只是本稿安排，不直接当成当前产品已经对齐的事实。

`../../2026-10-25-integrated-room/ui/attachment-tray/night-multiple-reading-desk-v1.png` 将两份原文和取景放到同一房间中，烟茶外壳与夜色相容，真实原文仍是纸张。另一张 `night-attachment-interactions-v1.png` 是多格分镜，只说明拿起、换序和点开等操作关系；不作为母景、身份或光影输入。

运行灰白大矩形与整页白渐变会破坏上述空间。需要按对象设计阅读面、文字墨色和边缘，让完整环境可读；不是把全部控件透明化，也不是将白卡简单换成灰卡。正文与真正 PDF 页像素应保持其对象的阅读约束。

## 超宽候选的边界

亲看 `../../2026-10-25-integrated-room/room/literary-room-clear-day-ultrawide-v1.png`。实际1774×887，干净无UI，但椅子、灯桌、窗框和右景比例被重绘；它是完整的新相机候选，不是旧母景左侧像素扩展。不得直接复用旧1536×1024人物层与锚点，亦不声称旧场景坐标已自动覆盖。近处人物尺度若因超宽而缩小，会损失原标杆的亲近感。

## 本轮两张新母稿

主代理锁定原1536×1024文学机位后，分别仅以clear-day与rain-night空景调用内置ImageGen，人物全部从完整护照与文字建立。两张实际结果均为1536×1024、RGB；原始调用、Prompt与来源SHA分别保存同名`.request.json`、`.prompt.txt`、`.source.json`。

- `sakiko-rest-sidefold-apricot-v1.png`：侧坐靠原格纹枕，双腿折在软垫内，书合在膝上，鞋成对在原地板。侧髋、大腿、小腿与软垫承托可读，目光转向窗外，膝下袜与露膝关系清楚。相较原端坐，身体拓扑确实改变。
- `sakiko-listening-forward-rain-v1.png`：髋部仍在窗榻，躯干从髋处略前倾，前臂向大腿得到支撑，双手将瓷杯放低到膝前，完整双鞋在地面。脸朝画外左侧的人，保持具体倾听的安静与青春辨识。原边桌杯子移到手中，因此后续空底提取须从此母图出发，不能用有杯的旧空景造成一杯两处。

本制作代理与root均已逐幅亲看两张完整母稿，root仅准入这两幅静态母稿，见`root-static-mother-admission-v1.json`。它们补充的是现有稿缺少的身体拓扑，不覆盖因轻微天气差异仍健康可用的旧图；后续创作稳定人物与画风，不据此启动全量重画。

`rest-layers/`已完成对应空底、人物F与接收面S，并以SVG按U=MAX(L(F),L(S))只绘制一次原母RGB。本人亲看原母/合成、浅深棋盘与放大脸发、书手、裙摆、折腿袜脚。root随后用正式IAB亲看原母/合成、棋盘与深底，准入精确v2固定原位included分层；S包含真实软垫、抱枕与毯边，travel/slope/perspective严格为0，不可当纯投影或随身体平移。`rest-layers/root-fixed-included-admission-v1.json`与初值已交空间集成owner；runtime与动态均未签。

`rain-layers/`已生成匹配无人物背景、完整人物/杯/鞋F及原软垫/地面接收面S。杯从桌上移走的关系保持，不在空底补回。本人看过原母/合成并排与深底上半身，后续足部/浅底/棋盘的浏览器截图捕获出现局部失败，页面AX仍可读，保留同一健康会话；不冒称本人完成全部层审。root仍需亲验此候选，当前来源记录保持primaryLayerApproved=false。

两组均有实际Prompt、调用输入、输出SHA和选择记录。没有修改运行注册或公共代码，没有以静态层代签常规动态，没有清理文件。
