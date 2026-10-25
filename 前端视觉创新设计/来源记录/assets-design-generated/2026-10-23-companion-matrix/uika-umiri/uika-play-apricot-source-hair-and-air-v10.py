"""Produce only the inspected original hair/visible-air alpha calibration.

No model call, RGB repaint, geometry transform or runtime/test operation.
The two small regions are the source-visible peach hair beneath the left bob;
cool water/tree pixels in the adjoining visible openings remain room-owned.
"""
from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
MOTHER = ROOT / "uika-play-apricot-mother-candidate-v1.png"
INPUT = ROOT / "uika-play-apricot-figure-calibrated-v9.png"
MOTHER_SHA = "5217e87de50ac8ff072d231a2cc07d985303cbc4f034a97355f0d98bb6a53454"
INPUT_SHA = "adad7038f833e595063b02f4d41b4a46dcc61368b7a50bbbd55fe2a101e70f9e"
if hashlib.sha256(MOTHER.read_bytes()).hexdigest() != MOTHER_SHA or hashlib.sha256(INPUT.read_bytes()).hexdigest() != INPUT_SHA:
    raise ValueError("The inspected original or registered alpha changed; inspect before processing.")
rgb = np.asarray(Image.open(MOTHER).convert("RGB"), dtype=np.float32)
original_alpha = np.asarray(Image.open(INPUT).getchannel("A"))
alpha = original_alpha.copy()
regions = [(1262, 360, 1285, 397), (1286, 367, 1302, 390)]
for left, top, right, bottom in regions:
    source = rgb[top:bottom, left:right]
    confidence = np.minimum(np.clip((source[:, :, 0] - source[:, :, 1] + 2) / 8, 0, 1),
                            np.clip((source[:, :, 0] - source[:, :, 2] + 6) / 25, 0, 1))
    confidence[source[:, :, 1] - source[:, :, 2] > 63] = 0
    alpha[top:bottom, left:right] = np.maximum(alpha[top:bottom, left:right], np.rint(confidence * 255).astype(np.uint8))
matte = Image.new("RGBA", (rgb.shape[1], rgb.shape[0]), (255, 255, 255, 0))
matte.putalpha(Image.fromarray(alpha))
matte_path = ROOT / "uika-play-apricot-matte-source-gap-repaired-v10.png"
matte.save(matte_path)

# Every preserved source pixel lies in the observed cool visible window opening.
# Warm peach strands are excluded both by their RGB and their repaired alpha.
left, top, right, bottom = (1248, 377, 1290, 397)
source = rgb[top:bottom, left:right]
cool = ((source[:, :, 2] >= source[:, :, 0] + 5) | (source[:, :, 1] >= source[:, :, 0] + 10))
cool &= alpha[top:bottom, left:right] < 32
preserve = []
for row in range(cool.shape[0]):
    starts = np.flatnonzero(np.diff(np.r_[False, cool[row], False].astype(np.int8)) == 1)
    ends = np.flatnonzero(np.diff(np.r_[False, cool[row], False].astype(np.int8)) == -1) - 1
    for start, end in zip(starts, ends):
        x0, x1, y = int(left + start), int(left + end), int(top + row)
        preserve.append([[x0, y], [x1, y], [x1, y + .49], [x0, y + .49]])
parameters = json.loads((ROOT / "uika-play-apricot-layer-parameters-v9.json").read_text(encoding="utf-8"))
parameters["matte"] = matte_path.name
parameters["alphaLow"], parameters["alphaHigh"] = 0, 255
parameters["backgroundPreservePolygons"] = preserve
for key in ("figure", "mask", "background", "shadow", "record"):
    parameters[key] = parameters[key].replace("-v9.", "-v10.")
parameters["reviewNote"] = "v10 expands only the directly inspected source-peach hair regions beneath the left bob; v9 omitted the lower strands and two small internal hair openings. Preserve only source-cool air pixels with alpha<32 within the adjoining observed visible opening, as literal per-row original-pixel ROIs. No hair/person held in BG, no hidden background inferred, RGB/geometry unchanged. Primary/runtime pending."
parameter_path = ROOT / "uika-play-apricot-layer-parameters-v10.json"
parameter_path.write_text(json.dumps(parameters, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
record = {"recordType": "original-pixel-hair-and-visible-air-production", "processor": Path(__file__).name,
          "processorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          "mother": MOTHER.name, "motherSha256": MOTHER_SHA, "input": INPUT.name, "inputSha256": INPUT_SHA,
          "restoredHairRegions": regions, "hairConfidence": "min(clamp((R-G+2)/8),clamp((R-B+6)/25)); exclude G-B>63",
          "airRegion": [left, top, right, bottom], "airSelection": "(B>=R+5 or G>=R+10) and repaired alpha<32; only inspected visible water/tree opening",
          "preservedAirPixels": int(cool.sum()), "alphaChangedPixels": int((alpha != original_alpha).sum()),
          "output": {"file": matte_path.name, "sha256": hashlib.sha256(matte_path.read_bytes()).hexdigest()},
          "parameters": parameter_path.name, "review": "producer candidate only; primary/runtime pending"}
(ROOT / "uika-play-apricot-source-gap-calibration-v10.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record))
