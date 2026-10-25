"""Clear only two 2px confirmed background mullion columns inside the hair air gap."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent
parameter=root/"soyo-listening-apricot-alpha-window-columns-parameters-v17.json"
cfg=json.loads(parameter.read_text(encoding="utf-8"))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if sha(root/cfg["mother"])!=cfg["motherSha256"]:raise ValueError("Approved original mother changed")
alpha=np.asarray(Image.open(root/cfg["sourceAlpha"]).getchannel("A")).copy()
before=alpha.copy()
for x0,y0,x1,y1 in cfg["confirmedRoomColumns"]:alpha[y0:y1,x0:x1]=0
output=root/cfg["output"]
Image.fromarray(alpha,"L").save(output)
record={"recordType":"precise-original-air-gap-alpha-cleanup","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"parameters":parameter.name,"parametersSha256":sha(parameter),"inputs":[{"file":cfg[k],"sha256":sha(root/cfg[k])} for k in ("mother","sourceAlpha")],"output":output.name,"outputSha256":sha(output),"alphaChangedPixels":int(np.count_nonzero(alpha!=before)),"rgbRepaint":False,"geometryTransform":"identity","review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root/cfg["record"]).write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
