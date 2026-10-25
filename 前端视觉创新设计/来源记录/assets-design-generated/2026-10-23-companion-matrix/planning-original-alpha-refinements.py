"""Original-pixel alpha repair for two source-reviewed planning assets, not a test runner."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
profiles=[
 {"who":"nyamu","motherV":"v2","maskV":"v2","motherSha":"2520ef07069e0ec07b4cc2de51181f072626ce9f8f06a83ddf401c7e4ac24c27","priorSha":"d94135514729c3fa3083de50809ba04412f575591b7b4616a6ca2e350d1c78de","hairRegion":[849,310,973,426],"lakeGap":[900,391,950,426]},
 {"who":"mutsumi","motherV":"v1","maskV":"v1","motherSha":"ebcd02b354a1661687afdd2e9a92d6c3b7531bc7555a98eb0563516eff83ddd1","priorSha":"8ecf6580870a7e5d6dedf268dfd447d154887566e326e86ad687b019b990b4cc","hairRegion":[764,284,959,503],"chairRegion":[800,500,837,622]}
]
for p in profiles:
 prefix=p["who"]+"-planning-apricot"
 mother_path=root/(prefix+"-mother-candidate-"+p["motherV"]+".png")
 prior_path=root/(prefix+"-mask-calibrated-v1.png")
 raw_path=root/(prefix+"-mask-candidate-"+p["maskV"]+".png")
 if sha(mother_path)!=p["motherSha"] or sha(prior_path)!=p["priorSha"]:
  raise ValueError("Original source changed; inspect before alpha production.")
 mother=Image.open(mother_path).convert("RGB")
 alpha=Image.open(prior_path).getchannel("A")
 raw=Image.open(raw_path).convert("L")
 region=tuple(p["hairRegion"])
 rgb=np.asarray(mother.crop(region),dtype=np.int16)
 prior=np.asarray(alpha.crop(region),dtype=np.uint8)
 edge=np.asarray(raw.crop(region),dtype=np.uint8)
 if p["who"]=="nyamu":
  hair=(rgb[:,:,0]-rgb[:,:,1]>=5)&(rgb[:,:,2]-rgb[:,:,1]>=-20)&(rgb[:,:,2]-rgb[:,:,1]<=95)
 else:
  hair=(rgb[:,:,0]>=105)&(rgb[:,:,0]-rgb[:,:,1]>=-10)&(rgb[:,:,0]-rgb[:,:,1]<=25)&(rgb[:,:,2]-rgb[:,:,1]>=-45)&(rgb[:,:,2]-rgb[:,:,1]<=5)
 gold=(rgb[:,:,0]>=230)&(rgb[:,:,1]>=220)&(rgb[:,:,2]>=180)&(rgb[:,:,0]>=rgb[:,:,1])&(rgb[:,:,0]>=rgb[:,:,2])
 alpha.paste(Image.fromarray(np.maximum(prior,edge*np.uint8(hair|gold)),mode="L"),region[:2])
 if p.get("lakeGap"):
  gap=tuple(p["lakeGap"]);rgb=np.asarray(mother.crop(gap),dtype=np.int16);values=np.asarray(alpha.crop(gap),dtype=np.uint8).copy()
  values[(rgb[:,:,1]-rgb[:,:,0]>=5)&(rgb[:,:,2]>=rgb[:,:,1])]=0
  alpha.paste(Image.fromarray(values,mode="L"),gap[:2])
 if p.get("chairRegion"):
  gap=tuple(p["chairRegion"]);rgb=np.asarray(mother.crop(gap),dtype=np.int16);values=np.asarray(alpha.crop(gap),dtype=np.uint8).copy()
  values[(rgb[:,:,0]>=140)&(rgb[:,:,0]-rgb[:,:,1]>=7)&(rgb[:,:,0]-rgb[:,:,2]>=18)]=0
  alpha.paste(Image.fromarray(values,mode="L"),gap[:2])
 output=root/(prefix+"-source-alpha-v2.png");alpha.save(output)
 record={"recordType":"original-RGB-alpha-only-planning-calibration","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"profile":p,"mother":mother_path.name,"motherSha256":sha(mother_path),"priorAlpha":prior_path.name,"priorAlphaSha256":sha(prior_path),"registeredRawMask":raw_path.name,"registeredRawMaskSha256":sha(raw_path),"outputAlpha":output.name,"outputAlphaSha256":sha(output),"method":"Retain original-color hair within personally inspected original head/hair ROI. Remove only source blue lake in Nyamu chin/neck gap or warm chair fabric in Mutsumi original foreground-chair ROI. Original RGB/body/face/geometry never repainted.","review":{"primary":"pending","runtime":"not registered"}}
 (root/(prefix+"-source-alpha-v2.json")).write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 config=json.loads((root/(prefix+"-layer-parameters-v1.json")).read_text(encoding="utf-8"))
 for key in ["figure","mask","background","shadow","record"]:config[key]=config[key].replace("-v1.","-v2.")
 config["matte"]=output.name;config["matteSha256"]=sha(output)
 config.pop("localColorMatteRefinement",None);config["includePolygons"]=[];config["excludePolygons"]=[]
 config["producerNote"]+=" v2 keeps source original fine hair via recorded color/ROI alpha repair, excludes exact original lake gap/foreground-chair contamination. Original RGB unchanged. Primary pending."
 (root/(prefix+"-layer-parameters-v2.json")).write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({"alpha":output.name,"sha256":sha(output)}))

