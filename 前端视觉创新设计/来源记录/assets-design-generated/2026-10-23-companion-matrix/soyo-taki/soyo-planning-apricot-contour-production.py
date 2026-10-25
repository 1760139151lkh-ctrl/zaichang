"""Produce alpha-only candidates from the observed original Soyo planning contour.
No tests, RGB repaint, anatomy reconstruction, UI or runtime data.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parent
path = root / "soyo-planning-apricot-contour-parameters-v2.json"
config = json.loads(path.read_text(encoding="utf-8"))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
mother = root / config["mother"]
if sha(mother) != config["motherSha256"]:
    raise ValueError("Approved original mother bytes changed")
size = Image.open(mother).size
factor = config["supersampling"]
alpha = Image.new("L", (size[0] * factor, size[1] * factor))
draw = ImageDraw.Draw(alpha)
draw.polygon([(x * factor, y * factor) for x,y in config["outerPolygon"]], fill=255)
for polygon in config["originalBackgroundHoles"]:
    draw.polygon([(x * factor, y * factor) for x,y in polygon], fill=0)
alpha = alpha.resize(size, Image.Resampling.LANCZOS)
output = root / config["output"]
alpha.save(output)
record = {"recordType":"deterministic-observed-original-alpha-production", "processor":Path(__file__).name, "processorSha256":sha(Path(__file__)), "parameters":path.name, "parametersSha256":sha(path), "motherSha256":sha(mother), "output":output.name, "outputSha256":sha(output), "transform":"identity", "rgbRepaint":False, "review":{"approvedByPrimary":False,"runtimeAccepted":False}}
(root / "soyo-planning-apricot-contour-production-v2.json").write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print(json.dumps(record))
