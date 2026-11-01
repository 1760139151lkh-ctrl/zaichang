"""Complete the original source's visible outer hair arc; alpha only."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother_path=root/"mutsumi-listening-apricot-mother-candidate-v2.png"
alpha_path=root/"mutsumi-listening-apricot-source-alpha-v9.png"
if sha(mother_path)!="eeb2f7953f39ba44844ac05d4b7bcf2b000fca738ecb0bd1a93ca3b614f190dc" or sha(alpha_path)!="c21a80db897c93a3282606a701a5d36d3f346c1238c8f73b56886eae6a61783e":
    raise ValueError("Source changed; inspect original first.")
mother=Image.open(mother_path).convert("RGB")
alpha=Image.open(alpha_path).convert("L")
region=(1360,380,1425,522)
arc=[(1365,383),(1374,392),(1380,400),(1386,410),(1392,420),(1399,430),(1405,440),(1410,450),(1414,460),(1418,470),(1419,480),(1419,488),(1415,501),(1408,512),(1397,519)]
size=(region[2]-region[0],region[3]-region[1])
rgb=np.asarray(mother.crop(region),dtype=np.float32)
prior=np.asarray(alpha.crop(region),dtype=np.uint8)
curve=Image.new("L",(size[0]*4,size[1]*4))
ImageDraw.Draw(curve).line([((x-region[0])*4,(y-region[1])*4) for x,y in arc],fill=255,width=9,joint="curve")
coverage=np.clip(np.minimum.reduce([(rgb[:,:,0]-130)/80,(rgb[:,:,1]-120)/80,(rgb[:,:,2]-90)/65]),0,1)
strand=np.rint(np.asarray(curve.resize(size,Image.Resampling.LANCZOS))*coverage).astype(np.uint8)
alpha.paste(Image.fromarray(np.maximum(prior,strand),mode="L"),region[:2])
output=root/"mutsumi-listening-apricot-source-alpha-v10.png"
alpha.save(output)
record={"recordType":"original-scene-alpha-only-hair-arc-completion","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"mother":mother_path.name,"motherSha256":sha(mother_path),"inputAlpha":alpha_path.name,"inputAlphaSha256":sha(alpha_path),"region":list(region),"sourceObservedArc":arc,"method":"Add only source-visible fine hair along the traced original arc, including its connection behind the shoulder. Original antialiased RGB is retained unchanged; coverage uses source brightness within a 2.25px band. No body/color repaint or geometry transform.","outputAlpha":output.name,"outputAlphaSha256":sha(output),"review":{"primary":"pending","runtime":"not registered"}}
(root/"mutsumi-listening-apricot-source-alpha-v10.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
config=json.loads((root/"mutsumi-listening-apricot-layer-parameters-v9.json").read_text(encoding="utf-8"))
for key in ["figure","mask","background","shadow","record"]:config[key]=config[key].replace("-v9.","-v10.")
config["matte"]=output.name
config["matteSha256"]=sha(output)
config["producerNote"]+=" v10 completes only the source-visible outer hair arc from its original shoulder connection, using exact original RGB, while retaining v9 sleeve/room separation. Primary pending."
(root/"mutsumi-listening-apricot-layer-parameters-v10.json").write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"alpha":output.name,"sha256":sha(output)}))
