"""Source-observed front hair/arm separation; only original alpha visibility."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
prior=root/"mutsumi-rest-apricot-mask-calibrated-v4.png"
if sha(prior)!="2fbe7fa8a70fa056c88460b2abedcb61fdba937b3fa7245dcbac409a1619372d":raise ValueError("Source matte changed; inspect original.")
alpha=Image.open(prior).getchannel("A");region=(1295,380,1355,479);size=(60,99)
body=[(1355,380),(1355,479),(1313,479),(1320,470),(1324,460),(1330,450),(1328,440),(1334,430),(1340,420),(1344,405),(1348,392)]
strands=[[(1344,380),(1334,391),(1327,406),(1333,421)]]
keep=Image.new("L",(240,396));draw=ImageDraw.Draw(keep);draw.polygon([((x-region[0])*4,(y-region[1])*4)for x,y in body],fill=255)
for points in strands:draw.line([((x-region[0])*4,(y-region[1])*4)for x,y in points],fill=255,width=9,joint="curve")
coverage=np.asarray(keep.resize(size,Image.Resampling.LANCZOS));alpha.paste(Image.fromarray(np.minimum(np.asarray(alpha.crop(region)),coverage),mode="L"),region[:2])
output=root/"mutsumi-rest-apricot-source-alpha-v5.png";alpha.save(output)
record={"recordType":"source-observed-front-hair-arm-gap-alpha","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"inputAlpha":prior.name,"inputAlphaSha256":sha(prior),"originalSourceRegion":region,"observedActualBodyBoundary":body,"observedActualFineStrands":strands,"method":"Original source coordinate-grid shows cream/yellow window leaves around the thin front hair and real navy arm. Intersect only that local alpha with actual source body boundary plus narrow original fine strand bands, excluding room between them. Entire original RGB unchanged, no new body or strand RGB painted.","outputAlpha":output.name,"outputAlphaSha256":sha(output),"review":{"primary":"pending","runtime":"not registered"}}
(root/"mutsumi-rest-apricot-source-alpha-v5.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
config=json.loads((root/"mutsumi-rest-apricot-layer-parameters-v4.json").read_text(encoding="utf-8"))
for key in ["figure","mask","background","shadow","record"]:config[key]=config[key].replace("-v4.","-v5.")
config["matte"]=output.name;config["matteSha256"]=sha(output);config["matteRegionOverrides"]=[];config["alphaPolygonRepairs"]=[]
config["producerNote"]+=" v5 retains completed v4 body/skin/arm and uses source-observed front arm+fine-hair union only to exclude remaining cream leaf fragments. RGB unchanged, no hidden anatomy repair."
(root/"mutsumi-rest-apricot-layer-parameters-v5.json").write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"alpha":output.name,"sha256":sha(output)}))

