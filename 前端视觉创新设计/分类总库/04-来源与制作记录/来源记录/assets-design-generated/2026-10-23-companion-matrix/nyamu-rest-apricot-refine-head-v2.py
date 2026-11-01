"""Original source purple bob and real rear arm/pillow gap alpha."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother_path=root/"nyamu-rest-apricot-mother-candidate-v1.png";prior_path=root/"nyamu-rest-apricot-mask-calibrated-v1.png";raw_path=root/"nyamu-rest-apricot-mask-candidate-v2.png"
if sha(mother_path)!="c6264d37f43bef35ee7aad4108a49b6cc977b3bba98c74233ea4aff967926fd8" or sha(prior_path)!="e40e25cbd1fa494ce8ae33e34135846306d22887d616c2579c42ed64d305f0e5":raise ValueError("Original source changed.")
mother=Image.open(mother_path).convert("RGB");alpha=Image.open(prior_path).getchannel("A");raw=Image.open(raw_path).convert("L")
region=(1278,288,1405,406);rgb=np.asarray(mother.crop(region),dtype=np.int16);prior=np.asarray(alpha.crop(region),dtype=np.uint8);edge=np.asarray(raw.crop(region),dtype=np.uint8)
purple=(rgb[:,:,0]-rgb[:,:,1]>=3)&(rgb[:,:,2]-rgb[:,:,1]>=-20)&(rgb[:,:,2]-rgb[:,:,1]<=95)
alpha.paste(Image.fromarray(np.maximum(prior,edge*np.uint8(purple)),mode="L"),region[:2])
gap=(1359,488,1400,580);rgb=np.asarray(mother.crop(gap),dtype=np.int16);values=np.asarray(alpha.crop(gap),dtype=np.uint8).copy()
values[(rgb[:,:,1]-rgb[:,:,0]>=5)&(rgb[:,:,2]>=rgb[:,:,1])]=0;alpha.paste(Image.fromarray(values,mode="L"),gap[:2])
output=root/"nyamu-rest-apricot-source-alpha-v2.png";alpha.save(output)
record={"recordType":"original-RGB-purple-bob-and-arm-gap-alpha","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"mother":mother_path.name,"motherSha256":sha(mother_path),"inputAlpha":prior_path.name,"inputAlphaSha256":sha(prior_path),"registeredMask":raw_path.name,"registeredMaskSha256":sha(raw_path),"originalHairRegion":region,"originalPillowGapRegion":gap,"method":"Stable original-RGB full body alpha retains fine bob only where exact original RGB is purple/pink and excludes actual blue check pillow in rear arm/torso air gap. No source skin/body/pose/color painted or moved.","outputAlpha":output.name,"outputAlphaSha256":sha(output),"review":{"primary":"pending","runtime":"not registered"}}
(root/"nyamu-rest-apricot-source-alpha-v2.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
config=json.loads((root/"nyamu-rest-apricot-layer-parameters-v1.json").read_text(encoding="utf-8"))
for key in ["figure","mask","background","shadow","record"]:config[key]=config[key].replace("-v1.","-v2.")
config["matte"]=output.name;config["matteSha256"]=sha(output);config.pop("localColorMatteRefinement",None);config["producerNote"]+=" v2 source purple bob fine edge retained and real blue-pillow rear-arm air gap excluded, original RGB unchanged."
(root/"nyamu-rest-apricot-layer-parameters-v2.json").write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"alpha":output.name,"sha256":sha(output)}))

