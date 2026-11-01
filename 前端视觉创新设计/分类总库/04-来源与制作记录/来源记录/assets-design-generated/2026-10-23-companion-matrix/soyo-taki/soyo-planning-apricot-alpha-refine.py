"""Refine original Soyo planning alpha only, with exact hand and air-gap coordinates."""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent
parameter=root/"soyo-planning-apricot-alpha-refinement-parameters-v4.json"
cfg=json.loads(parameter.read_text(encoding="utf-8"))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother_path=root/cfg["mother"]
if sha(mother_path)!=cfg["motherSha256"]: raise ValueError("Original mother changed")
rgb=np.asarray(Image.open(mother_path).convert("RGB")).astype("float32")
alpha=np.asarray(Image.open(root/cfg["baseAlpha"]).getchannel("A")).copy()
hand=Image.open(root/cfg["originalHandAlpha"]).getchannel("A")
x0,y0,x1,y1=cfg["handRegion"]
alpha[y0:y1,x0:x1]=np.asarray(hand)[y0:y1,x0:x1]
for x0,y0,x1,y1 in cfg["blueWindowExclusionRegions"]:
    local=rgb[y0:y1,x0:x1]
    background=np.clip(np.minimum((local[:,:,1]-local[:,:,0]-4)/8,(local[:,:,2]-local[:,:,0]-2)/8),0,1)
    alpha[y0:y1,x0:x1]=np.rint(alpha[y0:y1,x0:x1]*(1-background)).astype("uint8")
for x0,y0,x1,y1 in cfg["warmLeafExclusionRegions"]:
    local=rgb[y0:y1,x0:x1]
    background=np.clip(np.minimum((local[:,:,0]-210)/12,(local[:,:,1]-170)/12),0,1)
    alpha[y0:y1,x0:x1]=np.rint(alpha[y0:y1,x0:x1]*(1-background)).astype("uint8")
out=root/cfg["output"]
Image.fromarray(alpha,"L").save(out)
record={"recordType":"original-coordinate-alpha-refinement","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"parameters":parameter.name,"parametersSha256":sha(parameter),"inputs":[{"file":cfg[k],"sha256":sha(root/cfg[k])} for k in ("mother","baseAlpha","originalHandAlpha")],"output":out.name,"outputSha256":sha(out),"rgbChanged":False,"geometryTransform":"identity","review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root/cfg["record"]).write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
