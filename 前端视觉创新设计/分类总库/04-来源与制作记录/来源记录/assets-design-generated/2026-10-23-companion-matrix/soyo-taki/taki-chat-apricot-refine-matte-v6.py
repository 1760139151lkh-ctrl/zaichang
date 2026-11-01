"""Produce the original-coordinate soft alpha of the approved Taki chat mother.

Only explicit room gaps between the original hair strands are calibrated.
This changes alpha, never the mother RGB or the character's shape/anatomy.
Run from any directory; outputs live beside this production source.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


root = Path(__file__).resolve().parent
mother_path = root / "taki-chat-apricot-mother-candidate-v1.png"
input_path = root / "taki-chat-apricot-mask-calibrated-v2.png"
rgb = np.asarray(Image.open(mother_path).convert("RGB"), dtype=np.float32)
alpha = np.asarray(Image.open(input_path).getchannel("A")).copy()
polygons = [
    [(1159, 440), (1193, 440), (1191, 476), (1187, 500), (1190, 524), (1159, 524)],
    [(1331, 451), (1327, 493), (1336, 511), (1345, 535), (1361, 535), (1361, 451)],
    [(1222, 497), (1235, 501), (1235, 526), (1228, 535), (1219, 537), (1225, 524), (1220, 514)],
]
region = Image.new("L", (1536, 1024), 0)
draw = ImageDraw.Draw(region)
for polygon in polygons:
    draw.polygon(polygon, fill=255)
warm_gap = (np.asarray(region) > 0) & (rgb[:, :, 0] - rgb[:, :, 2] >= 50)
warm_gap &= rgb[:, :, 0] - rgb[:, :, 1] >= 20
soft_visibility = np.clip((230 - rgb[:, :, 0]) / 95, 0, 1) * 255
before = alpha.copy()
alpha[warm_gap] = np.minimum(alpha[warm_gap], soft_visibility[warm_gap].astype("uint8"))
output_path = root / "taki-chat-apricot-soft-gap-matte-v6.png"
Image.fromarray(alpha, mode="L").save(output_path)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
record = {
    "recordType": "original-coordinate-alpha-production",
    "processor": Path(__file__).name,
    "processorSha256": sha(Path(__file__)),
    "mother": mother_path.name,
    "motherSha256": sha(mother_path),
    "inputMatte": input_path.name,
    "inputMatteSha256": sha(input_path),
    "outputMatte": output_path.name,
    "outputMatteSha256": sha(output_path),
    "polygons": polygons,
    "method": "Only known warm room RGB in explicit hair-gap coordinates attenuates alpha; original dark hair and all pixels outside those gaps retain the calibrated v2 alpha.",
    "changedAlphaPixels": int(np.count_nonzero(before != alpha)),
    "rgbModified": False,
    "primaryLayerReview": "pending",
    "runtimeAccepted": False,
}
(root / "taki-chat-apricot-soft-gap-matte-production-v6.json").write_text(
    json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps(record, ensure_ascii=False))
