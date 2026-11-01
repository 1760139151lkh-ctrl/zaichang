"""Remove only personally confirmed bright window-line pixels from original alpha.
No rectangle cut, RGB change, body redraw, geometry transform or runtime writes.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent
parameter=root/"soyo-listening-apricot-alpha-window-lines-parameters-v16.json"
cfg=json.loads(parameter.read_text(encoding="utf-8"))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother=root/cfg["mother"]
if sha(mother)!=cfg["motherSha256"]:raise ValueError("Approved original mother changed")
alpha=np.asarray(Image.open(root/cfg["sourceAlpha"]).getchannel("A")).copy()
rgb=np.asarray(Image.open(mother).convert("RGB"))
x0,y0,x1,y1=cfg["observedWindowLineRegion"]
patch=rgb[y0:y1,x0:x1]
selected=np.all(patch>=np.asarray(cfg["minimumRgb"]),axis=2)
before=alpha.copy()
alpha[y0:y1,x0:x1][selected]=0
out=root/cfg["output"]
Image.fromarray(alpha,"L").save(out)
record={"recordType":"precise-original-coordinate-window-line-alpha-cleanup","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"parameters":parameter.name,"parametersSha256":sha(parameter),"inputs":[{"file":cfg[k],"sha256":sha(root/cfg[k])} for k in ("mother","sourceAlpha")],"output":out.name,"outputSha256":sha(out),"alphaChangedPixels":int(np.count_nonzero(alpha!=before)),"rgbRepaint":False,"geometryTransform":"identity","review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root/cfg["record"]).write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
