"""Source-traced planning hair alpha, without raw-mask room islands."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother_path=root/"mutsumi-planning-apricot-mother-candidate-v1.png"
prior_path=root/"mutsumi-planning-apricot-mask-calibrated-v1.png"
if sha(mother_path)!="ebcd02b354a1661687afdd2e9a92d6c3b7531bc7555a98eb0563516eff83ddd1" or sha(prior_path)!="8ecf6580870a7e5d6dedf268dfd447d154887566e326e86ad687b019b990b4cc":
 raise ValueError("Source changed; inspect original.")
mother=Image.open(mother_path).convert("RGB");alpha=Image.open(prior_path).getchannel("A")
region=(760,325,943,498)
curves=[[(846,342),(838,360),(829,375),(815,393),(799,415),(784,441),(771,468),(767,484)],[(932,380),(924,393),(924,414),(928,436),(932,451),(931,458)]]
size=(region[2]-region[0],region[3]-region[1]);band=Image.new("L",(size[0]*4,size[1]*4))
for points in curves:ImageDraw.Draw(band).line([((x-region[0])*4,(y-region[1])*4) for x,y in points],fill=255,width=10,joint="curve")
rgb=np.asarray(mother.crop(region),dtype=np.int16);prior=np.asarray(alpha.crop(region),dtype=np.uint8)
hair=(rgb[:,:,0]>=100)&(rgb[:,:,0]-rgb[:,:,1]>=-12)&(rgb[:,:,0]-rgb[:,:,1]<=35)&(rgb[:,:,2]-rgb[:,:,1]>=-65)&(rgb[:,:,2]-rgb[:,:,1]<=10)
extra=np.asarray(band.resize(size,Image.Resampling.LANCZOS),dtype=np.uint8)*np.uint8(hair)
alpha.paste(Image.fromarray(np.maximum(prior,extra),mode="L"),region[:2])
gap=(800,500,837,622);rgb=np.asarray(mother.crop(gap),dtype=np.int16);values=np.asarray(alpha.crop(gap),dtype=np.uint8).copy()
values[(rgb[:,:,0]>=140)&(rgb[:,:,0]-rgb[:,:,1]>=7)&(rgb[:,:,0]-rgb[:,:,2]>=18)]=0
alpha.paste(Image.fromarray(values,mode="L"),gap[:2])
output=root/"mutsumi-planning-apricot-source-alpha-v3.png";alpha.save(output)
record={"recordType":"original-RGB-source-traced-hair-alpha","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"mother":mother_path.name,"motherSha256":sha(mother_path),"priorAlpha":prior_path.name,"priorAlphaSha256":sha(prior_path),"sourceHairRegion":region,"sourceObservedFineCurves":curves,"bandPixels":2.5,"chairForegroundRegion":gap,"method":"v2 raw edge additions included actual room leaves as tiny islands, rejected. v3 starts from stable original-RGB v1 alpha, excludes personally observed foreground chair fabric, and retains only source-visible fine hair in two original-coordinate traced curve bands. No RGB/body/geometry repaint.","outputAlpha":output.name,"outputAlphaSha256":sha(output),"review":{"primary":"pending","runtime":"not registered"}}
(root/"mutsumi-planning-apricot-source-alpha-v3.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
config=json.loads((root/"mutsumi-planning-apricot-layer-parameters-v2.json").read_text(encoding="utf-8"))
for key in ["figure","mask","background","shadow","record"]:config[key]=config[key].replace("-v2.","-v3.")
config["matte"]=output.name;config["matteSha256"]=sha(output)
config["producerNote"]+=" v2 generic raw hair additions retained room-leaf islands, rejected. v3 source-traced narrow fine-hair bands and original stable RGB matte retain only personally observed original strands; no RGB/body paint."
(root/"mutsumi-planning-apricot-layer-parameters-v3.json").write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"alpha":output.name,"sha256":sha(output)}))

