"""Registered alpha production: raw fine bob, constrained upper cap, refined body."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent
files = ["nyamu-chat-apricot-mother-candidate-v1.png", "nyamu-chat-apricot-mask-calibrated-v1.png", "nyamu-chat-apricot-mask-calibrated-v2.png"]
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
if sha(root / files[0]) != "4916b887de5b6ce7ba75068b001ede1ca8d51a331b32141b6fb5969ec26bf305":
    raise ValueError("Original approved mother changed; inspect before alpha production.")
mother = Image.open(root / files[0]).convert("RGB")
raw = Image.open(root / files[1]).getchannel("A")
refined = Image.open(root / files[2]).getchannel("A")
if raw.size != mother.size or refined.size != mother.size:
    raise ValueError("Alpha inputs must retain the original full canvas.")
region = (1200, 225, 1385, 390)
head = raw.crop(region)
cap = (1200, 225, 1385, 276)
head.paste(Image.fromarray(np.minimum(np.asarray(raw.crop(cap)), np.asarray(refined.crop(cap))), mode="L"), (0, 0))
result = refined.copy()
result.paste(head, region[:2])
output = root / "nyamu-chat-apricot-matte-calibrated-v4.png"
matte = Image.new("RGBA", mother.size, (255, 255, 255, 0))
matte.putalpha(result)
matte.save(output)
record = {
    "kind": "original-scene-alpha-only-production", "script": Path(__file__).name, "scriptSha256": sha(Path(__file__)),
    "inputs": [{"file": file, "sha256": sha(root / file)} for file in files],
    "region": list(region), "upperCap": list(cap),
    "method": "Original raw fine-hair alpha restored only in the original head region. The upper cap alone intersects the originalRGB constrained refinement to remove misplaced white sky halo. Body/black ankle straps retain separately inspected originalRGB refinement. No RGB repaint, geometry shift, resizing or new anatomy.",
    "output": {"file": output.name, "sha256": sha(output)}, "canvas": list(mother.size),
    "primaryReview": "pending", "runtime": "not registered"
}
(root / "nyamu-chat-apricot-matte-processing-v4.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record["output"]))
