# 在场地图 · Blender 工作工程

2026-10-23：本目录已通过 d618ef1 合入 main，16个Git LFS模型从远端独立下载后哈希一致并逐一打开成功。后续沿同一路径更新，不另建每轮目录；此项只证明文件保存与可打开，不是全图验收。较早Library包保留为历史安全副本。


本目录是持续更新的同一份地图建模工程，不是每轮另建的备份目录。后续沿相同源码和模型路径更新；Git 历史记录各轮变化。当前16份可编辑模型均是工作稿，未完成整张校园，也未接入在场应用的实时2D/3D。

## 打开模型

本目录的 `.blend` 通过 Git LFS 保存。克隆仓库后运行 `git lfs pull`，再用 Blender 4.3.2 或兼容新版打开。不要把只有几行文字的 LFS 指针当成模型。直接打开保存工程无需运行生成脚本；重新生成还需要 Blender Python 的 Shapely/NumPy、字体和依赖路径，见各局部说明。

优先查看：
- [农业／生工／动物科学楼群](agriculture-a-work/agricultural-precinct.blend)：相连建筑体、实际楼板和三处楼梯、连廊房间及小型室内场景，仍在精修。
- [东部教学区组合](east-precinct-work/east-teaching-precinct.blend)：东一、东二／文化连廊、东三、东四、南连接廊及池边小花园。
- [湖畔组合](lakeside-work/lakeside-precinct.blend)：既有湖畔局部工程组合，不能代表全校园通过。

其余独立模型：
- [东一](east-teaching-work/east-one-connected.blend)
- [东二／文化连廊](east-culture-work/east-cultural-gallery.blend)
- [东三](east-three-work/east-three-connected.blend)
- [东四](east-four-work/east-four-connected.blend)
- [东三—东四南长廊](east-south-gallery-work/east-three-four-gallery.blend)
- [基础图书馆A/C](basic-library-work/basic-library-and-c.blend)
- [主图书馆](library-work/main-library.blend)
- [蒙民伟B](mengminwei-work/mengminwei-b.blend)
- [体育馆](sports-hall-work/sports-hall.blend)
- [双操场](sports-work/dual-tracks.blend)
- [小剧场](theatre-work/small-theatre.blend)
- [阳明桥](yangming-work/yangming-bridge.blend)
- [月牙楼及北桥](yueya-work/yueya-and-north-bridge.blend)

## 边界与来源

具体版本、实际查看过的视角、问题及未完成项见各工程README和[当前建模说明](README.zh-CN.md)。可打开、局部射线观察与整体验收分开；不作消防、结构、无障碍或真实开放路线声明。

原地理数据仍来自仓库 `assets/map-v2` 的固定来源，完整3013地物身份顺序保留，accepted0；[冻结范围](FROZEN_SOURCE_SCOPE.json)、[来源覆盖](SOURCE_COVERAGE.md)、`textures/SOURCE.md` 及仓库许可证保留。字体的随附许可见 [Noto CJK 版权与OFL条款](licenses/Noto-CJK-copyright.txt)。位置和相对关系用于锚定，室内、门窗、树木、材质、楼高及局部显示修整为作者化设计，不冒充实测。地图专项目标附件和部分显示几何仍有缺项。

不要将旧GLB或某张历史预览当成最新完整模型。没有通过此目录修改运行时地图、用户电脑未提交文件或现有应用源码。
