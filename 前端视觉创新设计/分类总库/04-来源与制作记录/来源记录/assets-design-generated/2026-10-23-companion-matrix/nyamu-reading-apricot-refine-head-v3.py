"""Alpha-only head edge and real neck/lake gap calibration from original RGB."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother_path=root/"nyamu-reading-apricot-mother-candidate-v1.png"
prior_path=root/"nyamu-reading-apricot-mask-calibrated-v2.png"
raw_path=root/"nyamu-reading-apricot-mask-candidate-v1.png"
if sha(mother_path)!="679651a0af996b08b6be27a01aff2dd5d4ce21f7ee03cd41db8f0231329e903b" or sha(prior_path)!="a9f7c73abcd91a485859d18751960dcf7d357b4a8c9565b092a9974539db6832":
    raise ValueError("Source changed; inspect before extracting.")
mother=Image.open(mother_path).convert("RGB")
alpha=Image.open(prior_path).getchannel("A")
raw=Image.open(raw_path).convert("L")
region=(780,329,919,444)
rgb=np.asarray(mother.crop(region),dtype=np.int16)
prior=np.asarray(alpha.crop(region),dtype=np.uint8)
edge=np.asarray(raw.crop(region),dtype=np.uint8)
purple=(rgb[:,:,0]-rgb[:,:,1]>=5)&(rgb[:,:,2]-rgb[:,:,1]>=-20)&(rgb[:,:,2]-rgb[:,:,1]<=95)
gold=(rgb[:,:,0]>=230)&(rgb[:,:,1]>=215)&(rgb[:,:,2]>=180)&(rgb[:,:,0]>=rgb[:,:,1])&(rgb[:,:,0]>=rgb[:,:,2])
alpha.paste(Image.fromarray(np.maximum(prior,edge*np.uint8(purple|gold)),mode="L"),region[:2])
gap=(846,414,873,438)
rgb=np.asarray(mother.crop(gap),dtype=np.int16)
values=np.asarray(alpha.crop(gap),dtype=np.uint8).copy()
values[(rgb[:,:,1]-rgb[:,:,0]>=5)&(rgb[:,:,2]>=rgb[:,:,1])]=0
alpha.paste(Image.fromarray(values,mode="L"),gap[:2])
output=root/"nyamu-reading-apricot-source-alpha-v3.png"
alpha.save(output)
record={"recordType":"original-RGB-alpha-only-head-calibration","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"mother":mother_path.name,"motherSha256":sha(mother_path),"inputAlpha":prior_path.name,"inputAlphaSha256":sha(prior_path),"registeredRawMask":raw_path.name,"registeredRawMaskSha256":sha(raw_path),"originalFineHairRegion":region,"originalLakeGapRegion":gap,"method":"Original purple/gold hair RGB retains the registered fine raw edge outside the stable body matte; source blue lake pixels in the actual chin/neck gap are excluded. No original figure RGB, body geometry or colors changed.","outputAlpha":output.name,"outputAlphaSha256":sha(output),"review":{"primary":"pending","runtime":"not registered"}}
(root/"nyamu-reading-apricot-source-alpha-v3.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
config=json.loads((root/"nyamu-reading-apricot-layer-parameters-v2.json").read_text(encoding="utf-8"))
for key in ["figure","mask","background","shadow","record"]:config[key]=config[key].replace("-v2.","-v3.")
config["matte"]=output.name
config["matteSha256"]=sha(output)
config.pop("localColorMatteRefinement",None)
config["includePolygons"]=[]
config["producerNote"]+=" v3 retains original purple/gold bob fine edges from registered raw mask while keeping the full original-RGB body refinement and clearing actual blue-lake chin/neck gap. All source RGB remains unchanged."
(root/"nyamu-reading-apricot-layer-parameters-v3.json").write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"alpha":output.name,"sha256":sha(output)}))
