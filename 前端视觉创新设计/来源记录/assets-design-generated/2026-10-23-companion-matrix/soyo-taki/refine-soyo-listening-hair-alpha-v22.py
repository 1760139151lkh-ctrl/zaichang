"""Clear confirmed room pixels inside the original Soyo hair loop only.

The previous parent v21 polygon reached the real returning outer hair and was
rejected. This production starts again from the unchanged selected v20 mask;
the rejected v21 is not an input. All original RGB remains untouched.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


root = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source = root / "soyo-listening-apricot-mask-calibrated-v20.png"
alpha = np.array(Image.open(source).getchannel("A"))
original = alpha.copy()
polygons = [
    [(1404, 424), (1407, 424), (1407, 440), (1404, 440)],
    [(1412, 441), (1415, 441), (1415, 445), (1412, 445)],
    [(1412, 448), (1414, 448), (1414, 451), (1412, 451)],
    [(1400, 465), (1404, 465), (1404, 468), (1400, 468)],
    [(1406, 465), (1421, 465), (1421, 470), (1406, 470)],
]
region = Image.new("L", (1536, 1024), 0)
for polygon in polygons:
    ImageDraw.Draw(region).polygon(polygon, fill=255)
alpha[np.asarray(region) > 0] = 0
out = root / "soyo-listening-apricot-parent-hair-alpha-v22.png"
Image.fromarray(alpha).save(out)
config = json.loads((root / "soyo-listening-apricot-layer-parameters-v20.json").read_text(encoding="utf-8"))
config.update(matte=out.name, alphaLow=0, alphaHigh=255,
              figure="soyo-listening-apricot-figure-calibrated-v22.png",
              mask="soyo-listening-apricot-mask-calibrated-v22.png",
              background="soyo-listening-apricot-background-calibrated-v22.png",
              shadow="soyo-listening-apricot-shadow-calibrated-v22.png",
              record="soyo-listening-apricot-layer-processing-v22.json",
              reviewNote="Original source-coordinate inspection: clear only narrow bright mullion at x1404..1407/y424..440 and tiny explicit air/pillow pieces. Actual outer curved hair remains. Parent v21 rejected for reaching real hair; not an input. Primary/runtime pending.")
(root / "soyo-listening-apricot-layer-parameters-v22.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
record = {"recordType": "original-coordinate-alpha-production", "processor": Path(__file__).name,
          "processorSha256": sha(Path(__file__)), "method": __doc__,
          "input": source.name, "inputSha256": sha(source),
          "output": out.name, "outputSha256": sha(out), "confirmedAirPolygons": polygons,
          "changedAlphaPixels": int(np.count_nonzero(alpha != original)),
          "rgbModified": False, "primaryLayerReview": "pending", "runtimeAccepted": False}
(root / "soyo-listening-parent-hair-alpha-production-v22.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record, ensure_ascii=False))
