"""Final alpha cleanup for observed desk-hand, sleeve and hair-window boundaries.
All figure RGB remains the exact complete original mother payload.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageFilter
root=Path(__file__).resolve().parent
parameter=root/"soyo-planning-apricot-alpha-refinement-parameters-v5.json"
cfg=json.loads(parameter.read_text(encoding="utf-8"))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother=root/cfg["mother"]
if sha(mother)!=cfg["motherSha256"]:raise ValueError("Approved original mother changed")
rgb=np.asarray(Image.open(mother).convert("RGB")).astype("int16")
alpha=np.asarray(Image.open(root/cfg["baseAlpha"]).getchannel("A")).copy()
for x0,y0,x1,y1 in cfg["blueWindowExclusionRegions"]:
    patch=rgb[y0:y1,x0:x1]
    selected=(patch[:,:,1]>patch[:,:,0])&(patch[:,:,2]>patch[:,:,0])
    alpha[y0:y1,x0:x1][selected]=0
for x0,y0,x1,y1 in cfg["deskWoodExclusionRegions"]:
    patch=rgb[y0:y1,x0:x1]
    selected=(patch[:,:,0]-patch[:,:,1]>20)&(patch[:,:,1]-patch[:,:,2]>15)&(patch[:,:,0]>100)
    alpha[y0:y1,x0:x1][selected]=0
for x0,y0,x1,y1 in cfg["observedFingertipInclusionRegions"]:
    patch=rgb[y0:y1,x0:x1]
    selected=(patch[:,:,0]-patch[:,:,1]>20)&(patch[:,:,1]-patch[:,:,2]>5)&(patch[:,:,1]>140)&(patch[:,:,2]>110)
    alpha[y0:y1,x0:x1][selected]=255
output=root/cfg["output"]
Image.fromarray(alpha,"L").save(output)
record={"recordType":"original-coordinate-alpha-refinement","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"parameters":parameter.name,"parametersSha256":sha(parameter),"inputs":[{"file":cfg[k],"sha256":sha(root/cfg[k])} for k in ("mother","baseAlpha")],"output":output.name,"outputSha256":sha(output),"rgbChanged":False,"geometryTransform":"identity","review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root/cfg["record"]).write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
