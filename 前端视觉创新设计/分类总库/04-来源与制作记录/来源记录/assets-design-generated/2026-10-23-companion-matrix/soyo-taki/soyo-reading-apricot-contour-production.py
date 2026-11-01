"""Produce original-coordinate reading alpha from the observed complete figure/book contour.
No RGB modification, anatomy synthesis, tests, UI state or runtime data.
"""
from pathlib import Path
import json,hashlib
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent
parameter=root/"soyo-reading-apricot-contour-parameters-v3.json"
cfg=json.loads(parameter.read_text(encoding="utf-8"))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mother=root/cfg["mother"]
if sha(mother)!=cfg["motherSha256"]:raise ValueError("Approved mother changed")
size=Image.open(mother).size
factor=cfg["supersampling"]
mask=Image.new("L",(size[0]*factor,size[1]*factor))
draw=ImageDraw.Draw(mask)
draw.polygon([(x*factor,y*factor) for x,y in cfg["outerPolygon"]],fill=255)
for polygon in cfg["holes"]:draw.polygon([(x*factor,y*factor) for x,y in polygon],fill=0)
mask=mask.resize(size,Image.Resampling.LANCZOS)
output=root/cfg["output"]
mask.save(output)
record={"recordType":"original-coordinate-alpha-production","processor":Path(__file__).name,"processorSha256":sha(Path(__file__)),"parameters":parameter.name,"parametersSha256":sha(parameter),"mother":mother.name,"motherSha256":sha(mother),"output":output.name,"outputSha256":sha(output),"rgbRepaint":False,"geometryTransform":"identity","review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root/cfg["record"]).write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
