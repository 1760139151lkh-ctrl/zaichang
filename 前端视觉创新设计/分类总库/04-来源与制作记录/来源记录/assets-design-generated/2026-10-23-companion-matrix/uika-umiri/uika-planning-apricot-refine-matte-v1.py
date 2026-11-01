"""Source-local alpha calibration for the approved Uika planning v3 mother.

Asset production only. All RGB remains the original mother's payload.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).parent
mother_path = root / "uika-planning-apricot-mother-candidate-v3.png"
raw_path = root / "uika-planning-apricot-mask-generated-v1.png"
mother = Image.open(mother_path).convert("RGB")
rgb = np.asarray(mother, dtype=np.int16)
alpha = np.array(Image.open(raw_path).convert("L"))
changes = []


def local_remove(name, polygon, colors):
    region = Image.new("L", mother.size, 0)
    ImageDraw.Draw(region).polygon(polygon, fill=255)
    selected = (np.array(region) > 0) & colors
    changes.append({"name": name, "polygon": polygon,
                    "changedPixels": int(np.count_nonzero(selected & (alpha != 0)))})
    alpha[selected] = 0


r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
hair_region = [(741, 315), (765, 315), (785, 337), (773, 384), (741, 384)]
region = Image.new("L", mother.size, 0)
ImageDraw.Draw(region).polygon(hair_region, fill=255)
located = np.array(region) > 0
# Source edge pixels mix hair and window RGB. A continuous alpha confidence
# preserves the actual fine strands rather than punching binary dotted holes.
confidence = np.clip((r - g + 15) / 55, 0, 1)
previous = alpha.copy()
alpha[located] = np.minimum(alpha[located],
                           np.rint(alpha[located] * confidence[located]).astype("uint8"))
changes.append({"name": "Located cool window mixtures between fine left hair strands",
                "polygon": hair_region, "confidence": "clip((R-G+15)/55,0,1)",
                "changedPixels": int(np.count_nonzero(previous != alpha))})
local_remove("Located dark warm wood protruding from back shirt edge",
             [(744, 489), (758, 489), (758, 501), (744, 501)],
             (r - g > 45) & (g - b > 25) & (r - b > 95))
local_remove("Located detached sky/leaf speck above open fingers",
             [(894, 451), (902, 451), (902, 459), (894, 459)],
             np.ones(alpha.shape, dtype=bool))
local_remove("Located wooden drawer triangle between forearm and skirt waist",
             [(816, 516), (850, 516), (850, 537), (816, 537)],
             (r - g > 35) & (g - b > 28) & (r - b > 90))
wood_edge = [(837, 527), (838, 528), (839, 529), (841, 530)]
changes.append({"name": "Four individually viewed brown drawer edge pixels",
                "points": wood_edge,
                "changedPixels": sum(int(alpha[y, x] != 0) for x, y in wood_edge)})
for x, y in wood_edge:
    alpha[y, x] = 0

out = root / "uika-planning-apricot-matte-prepared-v1.png"
Image.fromarray(alpha).save(out)
record = {
    "method": "Explicit source-local alpha removal only; no RGB repaint, body redraw, transform, global erosion or connected-component deletion.",
    "mother": mother_path.name,
    "motherSha256": hashlib.sha256(mother_path.read_bytes()).hexdigest(),
    "rawMatte": raw_path.name,
    "rawMatteSha256": hashlib.sha256(raw_path.read_bytes()).hexdigest(),
    "script": Path(__file__).name,
    "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "regions": changes,
    "output": out.name,
    "outputSha256": hashlib.sha256(out.read_bytes()).hexdigest(),
    "review": "Designer inspecting; primary layer/Stage/runtime pending.",
}
(root / "uika-planning-apricot-matte-refinement-v1.json").write_text(
    json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"regions": changes, "outputSha256": record["outputSha256"]}))
