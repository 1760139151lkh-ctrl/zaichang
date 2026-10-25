"""Original RGB alpha production for the three owned Taki desk-chair scenes.
This is derived asset processing only: no tests, fixtures, app state or runtime.
"""
from pathlib import Path
import json,sys,hashlib
import numpy as np
from scipy.ndimage import distance_transform_edt,label
from PIL import Image,ImageDraw
parameter=Path(sys.argv[1]).resolve()
root=parameter.parent
cfg=json.loads(parameter.read_text(encoding="utf-8"))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for key in ("mother","rawMask","background"):
    if sha(root/cfg[key])!=cfg[key+"Sha256"]:raise ValueError("Recorded original asset bytes changed: "+key)
mother=Image.open(root/cfg["mother"]).convert("RGB")
raw=Image.open(root/cfg["rawMask"]).convert("L")
background=Image.open(root/cfg["background"]).convert("RGB")
if mother.size!=raw.size or mother.size!=background.size:raise ValueError("Original full canvases must match")
rgb=np.asarray(mother).astype("int16")
bg=np.asarray(background).astype("int16")
difference=np.max(np.abs(rgb-bg),axis=2)
values=np.asarray(raw).copy()
values[values<8]=0
values[values>=220]=255
raw_values=values.copy()
confidence=np.clip((difference-7)/21,0,1)
for x0,y0,x1,y1 in cfg["chairDifferenceRegions"]:
    values[y0:y1,x0:x1]=np.rint(values[y0:y1,x0:x1]*confidence[y0:y1,x0:x1]).astype("uint8")
edge=distance_transform_edt(values>=128)<=3
values[edge]=np.rint(values[edge]*confidence[edge]).astype("uint8")
for x0,y0,x1,y1 in cfg.get("preserveHeldObjectRegions",[]):
    values[y0:y1,x0:x1]=raw_values[y0:y1,x0:x1]
alpha=Image.fromarray(values,"L")
draw=ImageDraw.Draw(alpha)
for polygon in cfg.get("explicitRoomPolygons",[]):draw.polygon([tuple(p) for p in polygon],fill=0)
values=np.asarray(alpha).copy()
values[values<12]=0
components,count=label(values>0)
sizes=np.bincount(components.ravel())
values[sizes[components]<4]=0
alpha=Image.fromarray(values,"L")
output=root/cfg["output"]
alpha.save(output)
record={"recordType":"original-coordinate-taki-desk-alpha-production","processor":Path(__file__).name,"processorSha256":sha(Path(__file__)),"parameters":parameter.name,"parametersSha256":sha(parameter),"inputs":[{"file":cfg[key],"sha256":sha(root/cfg[key])} for key in ("mother","rawMask","background")],"output":output.name,"outputSha256":sha(output),"alphaBounds":alpha.getbbox(),"geometryTransform":"identity","rgbRepaint":False,"review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root/cfg["record"]).write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
