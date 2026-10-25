"""Calibrate only original listening head/hair alpha; source RGB is untouched."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent
parameter=root/"soyo-listening-apricot-alpha-refinement-parameters-v7.json"
cfg=json.loads(parameter.read_text(encoding="utf-8"))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother=root/cfg["mother"]
if sha(mother)!=cfg["motherSha256"]:raise ValueError("Approved original mother changed")
original_base=np.asarray(Image.open(root/cfg["baseAlpha"]).getchannel("A"))
base=original_base.copy()
complete=np.asarray(Image.open(root/cfg["completeHeadAlpha"]).getchannel("A"))
x0,y0,x1,y1=cfg["headRegion"]
base[y0:y1,x0:x1]=complete[y0:y1,x0:x1]
x0,y0,x1,y1=cfg["crownRegion"]
base[y0:y1,x0:x1]=original_base[y0:y1,x0:x1]
x0,y0,x1,y1=cfg["hairRegion"]
base[y0:y1,x0:x1]=complete[y0:y1,x0:x1]
rows=np.asarray(cfg["hairRightRows"])
xs=np.arange(x0,x1)
for y in range(y0,y1):
    boundary=np.interp(y,rows[:,0],rows[:,1])
    keep=np.clip((boundary-xs)/cfg["edgeWidth"]+.5,0,1)
    base[y,x0:x1]=np.rint(base[y,x0:x1]*keep).astype("uint8")
factor=cfg["supersampling"]
x0,y0,x1,y1=(1360,355,1428,475)
line=Image.new("L",((x1-x0)*factor,(y1-y0)*factor))
ImageDraw.Draw(line).line([((x-x0)*factor,(y-y0)*factor) for x,y in cfg["observedWispPath"]],fill=255,width=round(cfg["wispWidth"]*factor),joint="curve")
line=line.resize((x1-x0,y1-y0),Image.Resampling.LANCZOS)
base[y0:y1,x0:x1]=np.maximum(base[y0:y1,x0:x1],np.asarray(line))
output=root/cfg["output"]
Image.fromarray(base,"L").save(output)
record={"recordType":"original-coordinate-alpha-refinement","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"parameters":parameter.name,"parametersSha256":sha(parameter),"inputs":[{"file":cfg[k],"sha256":sha(root/cfg[k])} for k in ("mother","baseAlpha","completeHeadAlpha")],"output":output.name,"outputSha256":sha(output),"rgbChanged":False,"transform":"identity","review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root/cfg["record"]).write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
