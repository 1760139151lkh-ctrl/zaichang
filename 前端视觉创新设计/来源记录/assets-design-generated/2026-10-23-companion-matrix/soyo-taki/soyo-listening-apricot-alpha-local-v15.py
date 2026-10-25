"""Refine only the observed hair/window seam, preserving original figure RGB and all other alpha."""
from pathlib import Path
import json,hashlib
import numpy as np
import cv2
from PIL import Image,ImageFilter
root=Path(__file__).resolve().parent
parameter=root/"soyo-listening-apricot-alpha-local-parameters-v15.json"
cfg=json.loads(parameter.read_text(encoding="utf-8"))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother=root/cfg["mother"]
if sha(mother)!=cfg["motherSha256"]:raise ValueError("Approved original mother changed")
original=Image.open(mother).convert("RGB")
alpha=Image.open(root/cfg["sourceAlpha"]).getchannel("A")
x0,y0,x1,y1=cfg["region"]
rgb=np.asarray(original.crop((x0,y0,x1,y1)))
values=np.asarray(alpha.crop((x0,y0,x1,y1)))
labels=np.where(values>100,cv2.GC_PR_FGD,cv2.GC_PR_BGD).astype("uint8")
labels[:,:5]=cv2.GC_FGD
for x,y in cfg["foregroundPoints"]:cv2.circle(labels,(x-x0,y-y0),1,cv2.GC_FGD,-1)
for x,y in cfg["backgroundPoints"]:cv2.circle(labels,(x-x0,y-y0),1,cv2.GC_BGD,-1)
cv2.setRNGSeed(0)
cv2.grabCut(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),labels,None,np.zeros((1,65)),np.zeros((1,65)),8,cv2.GC_INIT_WITH_MASK)
patch=Image.fromarray(np.uint8((labels==cv2.GC_FGD)|(labels==cv2.GC_PR_FGD))*255,"L").filter(ImageFilter.GaussianBlur(.35))
alpha.paste(patch,(x0,y0))
output=root/cfg["output"]
alpha.save(output)
record={"recordType":"local-original-coordinate-alpha-refinement","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"parameters":parameter.name,"parametersSha256":sha(parameter),"inputs":[{"file":cfg[k],"sha256":sha(root/cfg[k])} for k in ("mother","sourceAlpha")],"output":output.name,"outputSha256":sha(output),"region":cfg["region"],"rgbRepaint":False,"geometryTransform":"identity","review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root/cfg["record"]).write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
