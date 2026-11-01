# 乐奈独立左接触竖姿：静态准备

这是原图与新128板均待主代理直接验收的准备成果，不授权copy/register。上游ImageGen新画左爪、身右、尾下弯右，近正面仍观者左金右蓝；绝不是整图flip。此生产只清A0隐藏RGB，不改任何原alpha、可见RGB、画布或轮廓，不新生图、不尾rig。

原图 `../../rana-left-contact-vertical-edge-cat-v1.png`，1070×1470 RGBA，source SHA `1eb313f4e59b4dcc89d0b412a7f2f307912853e734974b3a1a1463d298fbc54e`。实际原alphaBounds `[0,56,993,1425]` 含A1散点；真实可见轮廓alpha≥8 bounds `[146,60,915,1423]`，两个概念分别保留。透明度实际已正常，没有宽可见halo，不做不必要mask或230–250门限。

新 `rana-left-contact-vertical-edge-cat-v1-static-clean.png` SHA `4973c13eaab03924a47bf6718a0107da5ad0c75b9f9aa36402d788b1006bd8fb`；RGB可见差0、alpha差0。

独立实测grip/sourceY `(260,915)`，归一化 `(0.2429906542,0.6224489796)`。原producer粗x231在中/后爪白区外缘，重新亲看原生三爪局部后选x260，三处白色抓握区域均跨线；不是用1070减右姿旧x或复用右姿y935。三爪参考y636/807/1148各自保留，y915只取真实主躯干约670–1160的中点作摆放参考。

亲看证据 `source-contact-coordinate-review.png`、`static-128-light-dark-grip-review.png`。`mirrorSafe=false`；没有独立尾层，不能晃整图称摆尾。原PNG/source、全局runtime/Edge/registry/App均未动，metadata三种准入字段保持false。
