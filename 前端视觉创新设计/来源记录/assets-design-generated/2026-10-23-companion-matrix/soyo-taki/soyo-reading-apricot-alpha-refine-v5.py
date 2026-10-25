"""Refine only alpha at observed reading hair air-gaps and real calf boundaries."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent
parameter=root/"soyo-reading-apricot-alpha-refinement-parameters-v5.json"
cfg=json.loads(parameter.read_text(encoding="utf-8"))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother=root/cfg["mother"]
if sha(mother)!=cfg["motherSha256"]:raise ValueError("Approved original mother changed")
rgb=np.asarray(Image.open(mother).convert("RGB")).astype("float32")
alpha=np.asarray(Image.open(root/cfg["baseAlpha"]).getchannel("A")).astype("float32")
for x0,y0,x1,y1 in cfg["backgroundAirGapRegions"]:
    patch=rgb[y0:y1,x0:x1]
    background=(patch[:,:,0]-patch[:,:,2]<32)&(patch.max(axis=2)>85)
    alpha[y0:y1,x0:x1][background]=0
for x0,y0,x1,y1 in cfg["paleWindowRegions"]:
    patch=rgb[y0:y1,x0:x1]
    background=(patch[:,:,0]-patch[:,:,1]<33)&(patch[:,:,0]>180)&(patch[:,:,1]>150)
    alpha[y0:y1,x0:x1][background]=0
points=np.asarray(cfg["legRows"],dtype="float32")
xs=np.arange(alpha.shape[1],dtype="float32")
edge=cfg["edgeWidth"]
for y in range(int(points[0,0]),int(points[-1,0])+1):
    limits=[np.interp(y,points[:,0],points[:,i]) for i in range(1,5)]
    far=np.minimum(np.clip((xs-limits[0])/edge+.5,0,1),np.clip((limits[1]-xs)/edge+.5,0,1))
    near=np.minimum(np.clip((xs-limits[2])/edge+.5,0,1),np.clip((limits[3]-xs)/edge+.5,0,1))
    alpha[y]*=np.maximum(far,near)
out=root/cfg["output"]
Image.fromarray(np.rint(alpha).astype("uint8"),"L").save(out)
record={"recordType":"original-coordinate-alpha-refinement","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"parameters":parameter.name,"parametersSha256":sha(parameter),"inputs":[{"file":cfg[k],"sha256":sha(root/cfg[k])} for k in ("mother","baseAlpha")],"output":out.name,"outputSha256":sha(out),"rgbChanged":False,"geometryTransform":"identity","review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root/cfg["record"]).write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
