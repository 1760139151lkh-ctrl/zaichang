"""Local original-coordinate hair/air alpha cleanup after second visual review.

The listening hair loop contained bright window-mullion/pillow remnants. The
play outer hair carried small cool sky fragments. Only alpha changes here;
every RGB byte remains the approved full mother image's original payload.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


root = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
entries = []
listening = root / "soyo-listening-apricot-mask-calibrated-v20.png"
alpha = np.array(Image.open(listening).getchannel("A"))
original = alpha.copy()
air_polygons = [
    [(1408, 421), (1410, 424), (1415, 431), (1417, 438), (1418, 445),
     (1418, 452), (1416, 458), (1411, 461), (1406, 462), (1403, 461),
     (1399, 458), (1397, 454), (1397, 450), (1396, 446), (1397, 443),
     (1401, 440), (1404, 435), (1405, 430), (1405, 425)],
    [(1398, 467), (1407, 467), (1411, 465), (1425, 466), (1425, 507),
     (1398, 507)],
]
region = Image.new("L", (1536, 1024), 0)
for polygon in air_polygons:
    ImageDraw.Draw(region).polygon(polygon, fill=255)
alpha[np.asarray(region) > 0] = 0
out = root / "soyo-listening-apricot-parent-hair-alpha-v21.png"
Image.fromarray(alpha).save(out)
entries.append({"activity": "listening", "input": listening.name,
                "inputSha256": sha(listening), "output": out.name,
                "outputSha256": sha(out), "confirmedAirPolygons": air_polygons,
                "changedAlphaPixels": int(np.count_nonzero(alpha != original))})
config = json.loads((root / "soyo-listening-apricot-layer-parameters-v20.json").read_text(encoding="utf-8"))
config.update(matte=out.name, alphaLow=0, alphaHigh=255,
              figure="soyo-listening-apricot-figure-calibrated-v21.png",
              mask="soyo-listening-apricot-mask-calibrated-v21.png",
              background="soyo-listening-apricot-background-calibrated-v21.png",
              shadow="soyo-listening-apricot-shadow-calibrated-v21.png",
              record="soyo-listening-apricot-layer-processing-v21.json",
              reviewNote="Second producer visual review: remove confirmed upper air inside returning hair loop and lower pillow/mullion pixels; preserve actual original curved hair crossings. Alpha only, primary pending.")
(root / "soyo-listening-apricot-layer-parameters-v21.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

play = root / "soyo-play-apricot-mask-calibrated-v12.png"
rgb = np.asarray(Image.open(root / "soyo-play-apricot-mother-candidate-v1.png").convert("RGB"), dtype=np.float32)
alpha = np.asarray(Image.open(play).getchannel("A"), dtype=np.float32)
region = Image.new("L", (1536, 1024), 0)
polygon = [(1169, 265), (1230, 265), (1230, 405), (1169, 405)]
ImageDraw.Draw(region).polygon(polygon, fill=255)
cool = np.clip((rgb[:, :, 2] - rgb[:, :, 0] - 8) / 20, 0, 1)
cool *= np.clip((rgb[:, :, 1] - rgb[:, :, 0] - 4) / 15, 0, 1)
cool *= np.clip((rgb.mean(axis=2) - 95) / 35, 0, 1)
cool *= np.asarray(region) / 255
corrected = np.rint(alpha * (1 - cool)).astype("uint8")
out = root / "soyo-play-apricot-parent-hair-alpha-v14.png"
Image.fromarray(corrected).save(out)
entries.append({"activity": "play", "input": play.name,
                "inputSha256": sha(play), "output": out.name,
                "outputSha256": sha(out), "originalRgbCoolAirRegion": polygon,
                "changedAlphaPixels": int(np.count_nonzero(corrected != alpha))})
config = json.loads((root / "soyo-play-apricot-layer-parameters-v13.json").read_text(encoding="utf-8"))
config.update(matte=out.name, alphaLow=0, alphaHigh=255,
              figure="soyo-play-apricot-figure-calibrated-v14.png",
              mask="soyo-play-apricot-mask-calibrated-v14.png",
              background="soyo-play-apricot-background-calibrated-v14.png",
              shadow="soyo-play-apricot-shadow-calibrated-v14.png",
              record="soyo-play-apricot-layer-processing-v14.json",
              reviewNote="Original warm mother RGB: alpha attenuated only for cool sky pixels in inspected outer-left hair air gap, preserving warm brown strands. Primary/runtime pending.")
(root / "soyo-play-apricot-layer-parameters-v14.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
record = {"recordType": "original-coordinate-alpha-production", "processor": Path(__file__).name,
          "processorSha256": sha(Path(__file__)), "method": __doc__, "entries": entries,
          "rgbModified": False, "primaryLayerReview": "pending", "runtimeAccepted": False}
(root / "soyo-warm-hair-alpha-production.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(entries, ensure_ascii=False))
