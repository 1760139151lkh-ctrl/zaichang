"""Apply recorded original-pixel alpha inclusions/exclusions in observed ROIs.
Only alpha is produced. Original body RGB is never repainted or transformed.
Usage: python mutsumi-observed-alpha-repairs.py parameters.json
"""
from pathlib import Path
import hashlib
import json
import sys
import numpy as np
from PIL import Image, ImageDraw

path = Path(sys.argv[1]).resolve()
base = path.parent
p = json.loads(path.read_text(encoding="utf-8"))
sha = lambda f: hashlib.sha256(f.read_bytes()).hexdigest()
mother_path, raw_path = base / p["mother"], base / p["inputAlpha"]
if sha(mother_path) != p["motherSha256"] or sha(raw_path) != p["inputAlphaSha256"]:
    raise ValueError("Recorded original/matte bytes differ.")
mother = Image.open(mother_path).convert("RGB")
alpha = np.asarray(Image.open(raw_path).convert("L")).copy()
rgb = np.asarray(mother).astype(np.int16)
for rule in p["observedOriginalColorRules"]:
    region = Image.new("L", mother.size)
    ImageDraw.Draw(region).polygon([tuple(v) for v in rule["polygon"]], fill=255)
    selected = np.asarray(region) > 0
    for channel, low, high in rule.get("channels", []):
        selected &= (rgb[:, :, channel] >= low) & (rgb[:, :, channel] <= high)
    for first, second, low, high in rule.get("differences", []):
        delta = rgb[:, :, first] - rgb[:, :, second]
        selected &= (delta >= low) & (delta <= high)
    alpha[selected] = 255 if rule["mode"] == "include" else 0
for polygon in p.get("explicitOriginalRoomExclusions", []):
    region = Image.new("L", mother.size)
    ImageDraw.Draw(region).polygon([tuple(v) for v in polygon], fill=255)
    alpha[np.asarray(region) > 0] = 0
Image.fromarray(alpha, "L").save(base / p["outputAlpha"])
record = {"recordType":"deterministic-observed-source-alpha-repair",
    "script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),
    "parameters":path.name,"parametersSha256":sha(path),
    "mother":mother_path.name,"motherSha256":sha(mother_path),
    "inputAlpha":raw_path.name,"inputAlphaSha256":sha(raw_path),
    "outputAlpha":p["outputAlpha"],"outputAlphaSha256":sha(base/p["outputAlpha"]),
    "rules":p["observedOriginalColorRules"],
    "explicitOriginalRoomExclusions":p.get("explicitOriginalRoomExclusions",[]),
    "method":"Only original-canvas alpha visibility corrected inside personally observed RGB/room ROIs; no body/RGB redraw, warp or hidden anatomy completion.",
    "review":{"primaryLayer":"pending","runtime":"not registered or exercised"}}
(base/p["record"]).write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"output":p["outputAlpha"],"alphaBounds":Image.fromarray(alpha).getbbox(),"record":p["record"]}))

