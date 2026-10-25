"""Original-scene alpha production only; no subject RGB or geometry edits."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent
files = {
    "mother": "nyamu-chat-apricot-mother-candidate-v1.png",
    "raw": "nyamu-chat-apricot-mask-calibrated-v1.png",
    "refined": "nyamu-chat-apricot-mask-calibrated-v2.png",
}
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
if sha(root / files["mother"]) != "4916b887de5b6ce7ba75068b001ede1ca8d51a331b32141b6fb5969ec26bf305":
    raise ValueError("Original approved mother changed; inspect it before alpha production.")
mother = Image.open(root / files["mother"]).convert("RGB")
raw = Image.open(root / files["raw"]).getchannel("A")
refined = Image.open(root / files["refined"]).getchannel("A")
if raw.size != mother.size or refined.size != mother.size:
    raise ValueError("Alpha inputs must retain original full-canvas registration.")
region = (1200, 225, 1385, 390)
rgb = np.asarray(mother.crop(region), dtype=np.int16)
purple_or_pink_hair = (rgb[:, :, 0] - rgb[:, :, 1] >= 6) & (rgb[:, :, 2] - rgb[:, :, 1] >= -3)
raw_head = np.asarray(raw.crop(region), dtype=np.uint8)
refined_head = np.asarray(refined.crop(region), dtype=np.uint8)
head = np.minimum(raw_head, np.maximum(refined_head, np.uint8(purple_or_pink_hair) * 255))
result = refined.copy()
result.paste(Image.fromarray(head, mode="L"), region[:2])
output = root / "nyamu-chat-apricot-matte-calibrated-v3.png"
matte = Image.new("RGBA", mother.size, (255, 255, 255, 0))
matte.putalpha(result)
matte.save(output)
record = {
    "kind": "original-rgb-constrained-alpha-only-production",
    "script": Path(__file__).name,
    "scriptSha256": sha(Path(__file__)),
    "inputs": [{"role": key, "file": value, "sha256": sha(root / value)} for key, value in files.items()],
    "headRegion": list(region),
    "method": "Head alpha = raw intersect (refined union original-RGB purple/pink fine-hair support). Body/ankles retain the separately inspected originalRGB GrabCut alpha. This keeps the raw visible hair gaps, restores actual colored fine hair, and excludes white sky halo; no RGB repaint, resize, warp or inferred anatomy.",
    "hairColorSupport": {"redMinusGreenMin": 6, "blueMinusGreenMin": -3},
    "output": {"file": output.name, "sha256": sha(output)},
    "canvas": list(mother.size),
    "primaryReview": "pending",
    "runtime": "not registered",
}
(root / "nyamu-chat-apricot-matte-processing-v3.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record["output"]))
