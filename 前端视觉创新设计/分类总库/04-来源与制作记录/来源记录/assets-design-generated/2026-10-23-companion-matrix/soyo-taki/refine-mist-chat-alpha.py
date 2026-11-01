"""Remove confirmed bright window-blue fragments from two original hair mattes.

Only alpha in the inspected outer-hair ROIs changes. Original RGB is untouched;
dark uniform/hair and warm skin do not meet the room-blue condition.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


root = Path(__file__).resolve().parent
records = []
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
for character, polygon in (
    ("soyo", [(1200, 320), (1250, 320), (1250, 470), (1200, 470)]),
    ("taki", [(1160, 315), (1210, 315), (1210, 550), (1160, 550)]),
):
    stem = character + "-chat-mist"
    mother_path = root / (stem + "-mother-candidate-v1.png")
    matte_path = root / (stem + "-mask-calibrated-v1.png")
    rgb = np.asarray(Image.open(mother_path).convert("RGB"), dtype=np.float32)
    alpha = np.asarray(Image.open(matte_path).getchannel("A"), dtype=np.float32)
    region = Image.new("L", (1536, 1024), 0)
    ImageDraw.Draw(region).polygon(polygon, fill=255)
    blue = np.clip((rgb[:, :, 2] - rgb[:, :, 0] - 12) / 20, 0, 1)
    blue *= np.clip((rgb[:, :, 1] - rgb[:, :, 0] - 6) / 15, 0, 1)
    blue *= np.clip((rgb.mean(axis=2) - 95) / 35, 0, 1)
    blue *= np.asarray(region) / 255
    corrected = np.rint(alpha * (1 - blue)).astype("uint8")
    output = root / (stem + "-original-blue-gap-alpha-v2.png")
    Image.fromarray(corrected, mode="L").save(output)
    records.append({"character": character, "mother": mother_path.name,
                    "motherSha256": sha(mother_path), "inputMatte": matte_path.name,
                    "inputMatteSha256": sha(matte_path), "output": output.name,
                    "outputSha256": sha(output), "polygon": polygon,
                    "changedAlphaPixels": int(np.count_nonzero(corrected != alpha)),
                    "rgbModified": False, "primaryLayerReview": "pending"})
record = {"recordType": "original-coordinate-alpha-production", "processor": Path(__file__).name,
          "processorSha256": sha(Path(__file__)), "method": __doc__, "entries": records}
(root / "mist-chat-alpha-production-v2.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(records, ensure_ascii=False))
