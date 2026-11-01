"""Replace only the defective alpha at the observed original head and hair.
No RGB paint, anatomy correction, geometry changes, tests or runtime writes.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent
parameter=root/"soyo-listening-apricot-head-parameters-v4.json"
cfg=json.loads(parameter.read_text(encoding="utf-8"))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother=root/cfg["mother"]
if sha(mother)!=cfg["motherSha256"]:raise ValueError("Approved original mother changed")
base=Image.open(root/cfg["baseAlpha"]).getchannel("A")
factor=cfg["supersampling"]
x0,y0,x1,y1=cfg["headRegion"]
patch=Image.new("L",((x1-x0)*factor,(y1-y0)*factor))
draw=ImageDraw.Draw(patch)
draw.polygon([((x-x0)*factor,(y-y0)*factor) for x,y in cfg["mainPolygon"]],fill=255)
draw.line([((x-x0)*factor,(y-y0)*factor) for x,y in cfg["observedWispPath"]],fill=255,width=round(cfg["wispWidth"]*factor),joint="curve")
patch=patch.resize((x1-x0,y1-y0),Image.Resampling.LANCZOS)
base.paste(patch,(x0,y0))
out=root/cfg["output"]
base.save(out)
record={"recordType":"original-coordinate-alpha-head-replacement","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"parameters":parameter.name,"parametersSha256":sha(parameter),"inputs":[{"file":cfg[k],"sha256":sha(root/cfg[k])} for k in ("mother","baseAlpha")],"output":out.name,"outputSha256":sha(out),"transform":"identity","rgbRepaint":False,"review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root/cfg["record"]).write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
