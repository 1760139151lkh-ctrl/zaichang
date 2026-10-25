"""Remove the second thin mullion line outside the original curved hair edge."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source = root / "soyo-listening-apricot-mask-calibrated-v22.png"
alpha = np.array(Image.open(source).getchannel("A"))
original = alpha.copy()
polygon = [(1404, 425), (1407, 425), (1407, 440), (1400, 440),
           (1400, 439), (1401, 438), (1402, 436), (1403, 433), (1404, 430)]
region = Image.new("L", (1536, 1024), 0)
ImageDraw.Draw(region).polygon(polygon, fill=255)
alpha[np.asarray(region) > 0] = 0
out = root / "soyo-listening-apricot-parent-hair-alpha-v23.png"
Image.fromarray(alpha).save(out)
config = json.loads((root / "soyo-listening-apricot-layer-parameters-v22.json").read_text(encoding="utf-8"))
config.update(matte=out.name)
for key in ("figure", "mask", "background", "shadow", "record"):
    config[key] = config[key].replace("-v22.", "-v23.")
config["reviewNote"] = "Original RGB, original curved hair contour: v23 additionally clears second thin mullion stripe only on the air side of the diagonal real hair edge. v21 rejected, never an input. Primary/runtime pending."
(root / "soyo-listening-apricot-layer-parameters-v23.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
record = {"recordType": "original-coordinate-alpha-production", "processor": Path(__file__).name,
          "processorSha256": sha(Path(__file__)), "input": source.name, "inputSha256": sha(source),
          "output": out.name, "outputSha256": sha(out), "confirmedAirPolygon": polygon,
          "changedAlphaPixels": int(np.count_nonzero(alpha != original)), "rgbModified": False,
          "primaryLayerReview": "pending", "runtimeAccepted": False}
(root / "soyo-listening-parent-hair-alpha-production-v23.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record, ensure_ascii=False))
