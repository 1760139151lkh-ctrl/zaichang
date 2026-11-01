"""Original-coordinate purple bob edge/gaps only; original RGB unchanged."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother_path=root/"nyamu-listening-apricot-mother-candidate-v1.png";prior_path=root/"nyamu-listening-apricot-mask-calibrated-v1.png";raw_path=root/"nyamu-listening-apricot-mask-candidate-v1.png"
if sha(mother_path)!="823f7606e5add858c9834ea290822cc78e0b0c3ae1309f367bd2a2bf1d862b6e" or sha(prior_path)!="2833e27c38d5f0d06ec3e5f9cd7037604e26c01d8013b7aecf75d04f96f376b9":raise ValueError("Original source changed.")
mother=Image.open(mother_path).convert("RGB");alpha=Image.open(prior_path).getchannel("A");raw=Image.open(raw_path).convert("L")
region=(1230,280,1356,405);rgb=np.asarray(mother.crop(region),dtype=np.int16);prior=np.asarray(alpha.crop(region),dtype=np.uint8);edge=np.asarray(raw.crop(region),dtype=np.uint8)
purple=(rgb[:,:,0]-rgb[:,:,1]>=3)&(rgb[:,:,2]-rgb[:,:,1]>=-20)&(rgb[:,:,2]-rgb[:,:,1]<=95)
alpha.paste(Image.fromarray(np.maximum(prior,edge*np.uint8(purple)),mode="L"),region[:2])
gap=(1238,365,1349,410);rgb=np.asarray(mother.crop(gap),dtype=np.int16);values=np.asarray(alpha.crop(gap),dtype=np.uint8).copy()
values[(rgb[:,:,1]-rgb[:,:,0]>=5)&(rgb[:,:,2]>=rgb[:,:,1])]=0;alpha.paste(Image.fromarray(values,mode="L"),gap[:2])
output=root/"nyamu-listening-apricot-source-alpha-v2.png";alpha.save(output)
record={"recordType":"original-RGB-purple-bob-alpha-calibration","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"mother":mother_path.name,"motherSha256":sha(mother_path),"inputAlpha":prior_path.name,"inputAlphaSha256":sha(prior_path),"registeredMask":raw_path.name,"registeredMaskSha256":sha(raw_path),"originalHairRegion":region,"originalWindowGapRegion":gap,"method":"Stable original-RGB full body alpha retains original purple hair fine edge from registered raw mask only where original source color is purple/pink. Remove actual blue window in bob/neck gap, not real skin/black choker. RGB/body/pose never painted or moved.","outputAlpha":output.name,"outputAlphaSha256":sha(output),"review":{"primary":"pending","runtime":"not registered"}}
(root/"nyamu-listening-apricot-source-alpha-v2.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
config=json.loads((root/"nyamu-listening-apricot-layer-parameters-v1.json").read_text(encoding="utf-8"))
for key in ["figure","mask","background","shadow","record"]:config[key]=config[key].replace("-v1.","-v2.")
config["matte"]=output.name;config["matteSha256"]=sha(output);config.pop("localColorMatteRefinement",None);config["producerNote"]+=" v2 source-purple fine bob edge retained; actual blue window in bob/neck gap excluded. Original RGB unchanged."
(root/"nyamu-listening-apricot-layer-parameters-v2.json").write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"alpha":output.name,"sha256":sha(output)}))

