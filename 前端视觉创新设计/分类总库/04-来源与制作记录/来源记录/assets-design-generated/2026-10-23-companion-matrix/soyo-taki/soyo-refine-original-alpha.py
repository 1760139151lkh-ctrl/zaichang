"""Scoped original-coordinate alpha cleanup; original RGB is never edited.

Room-color predicates apply only to personally inspected exact source ROIs.
This produces derived asset alpha and provenance, not functional test cases.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

config_path = Path(sys.argv[1]).resolve()
config = json.loads(config_path.read_text(encoding="utf-8"))
root = config_path.parent
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
mother_path, source_path = root / config["mother"], root / config["sourceAlpha"]
if digest(mother_path) != config["motherSha256"] or digest(source_path) != config["sourceAlphaSha256"]:
    raise ValueError("Recorded original or alpha bytes changed")
mother = Image.open(mother_path).convert("RGB")
source = Image.open(source_path).convert("RGBA")
if mother.size != source.size:
    raise ValueError("Full original canvas required")
alpha = np.asarray(source.convert("L") if config.get("sourceAlphaMode") == "luminance" else source.getchannel("A")).copy()
rgb = np.asarray(mother).astype("int16")
if config.get("edgeDifference"):
    from scipy.ndimage import distance_transform_edt
    item = config["edgeDifference"]
    background_path = root / item["background"]
    if digest(background_path) != item["backgroundSha256"]:
        raise ValueError("Matching background cue bytes changed")
    background = np.asarray(Image.open(background_path).convert("RGB")).astype("int16")
    difference = np.max(np.abs(rgb-background),axis=2)
    boundary = distance_transform_edt(alpha >= item.get("insideThreshold",100)) <= item["edgePixels"]
    confidence = np.clip((difference-item["differenceLow"])/(item["differenceHigh"]-item["differenceLow"]),0,1)
    alpha[boundary] = np.rint(alpha[boundary]*confidence[boundary]).astype("uint8")
for item in config.get("roomColorExclusions", []):
    selected = Image.new("L", mother.size)
    ImageDraw.Draw(selected).polygon([tuple(p) for p in item["polygon"]], fill=255)
    selected = np.asarray(selected) > 0
    selected &= rgb[:, :, 2] <= item["maxBlue"]
    selected &= rgb[:, :, 0] >= item["minRed"]
    selected &= rgb[:, :, 0] - rgb[:, :, 2] >= item["redOverBlue"]
    selected &= rgb[:, :, 1] - rgb[:, :, 2] >= item["greenOverBlue"]
    alpha[selected] = 0
for polygon in config.get("originalPixelInclusions", []):
    selected = Image.new("L", mother.size)
    ImageDraw.Draw(selected).polygon([tuple(p) for p in polygon], fill=255)
    alpha[np.asarray(selected) > 0] = 255
for polygon in config.get("softOriginalPixelInclusions", []):
    left = max(0,min(p[0] for p in polygon)-2); top = max(0,min(p[1] for p in polygon)-2)
    right = min(mother.width,max(p[0] for p in polygon)+3); bottom = min(mother.height,max(p[1] for p in polygon)+3)
    selected = Image.new("L", ((right-left)*4,(bottom-top)*4))
    ImageDraw.Draw(selected).polygon([((x-left)*4,(y-top)*4) for x,y in polygon],fill=255)
    selected = selected.resize((right-left,bottom-top),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.2))
    alpha[top:bottom,left:right] = np.maximum(alpha[top:bottom,left:right],np.asarray(selected))
for polygon in config.get("explicitRoomExclusions", []):
    selected = Image.new("L", mother.size)
    ImageDraw.Draw(selected).polygon([tuple(p) for p in polygon], fill=255)
    alpha[np.asarray(selected) > 0] = 0
if config.get("fillInteriorHolesWithin"):
    from scipy.ndimage import binary_fill_holes
    filled = binary_fill_holes(alpha > 0)
    for left, top, right, bottom in config["fillInteriorHolesWithin"]:
        patch = alpha[top:bottom, left:right]
        patch[filled[top:bottom, left:right]] = 255
if config.get("minimumVisibleAlpha"):
    alpha[alpha < config["minimumVisibleAlpha"]] = 0
if config.get("removeIslandsSmallerThan"):
    from scipy.ndimage import label
    components,_ = label(alpha > 0)
    sizes = np.bincount(components.ravel())
    alpha[sizes[components] < config["removeIslandsSmallerThan"]] = 0
out = root / config["output"]
Image.fromarray(alpha, "L").save(out)
record = {"recordType": "deterministic-original-alpha-cleanup", "processor": Path(__file__).name,
          "processorSha256": digest(Path(__file__)), "parameters": config_path.name,
          "parametersSha256": digest(config_path), "mother": mother_path.name, "motherSha256": digest(mother_path),
          "sourceAlpha": source_path.name, "sourceAlphaSha256": digest(source_path),
          "output": out.name, "outputSha256": digest(out), "originalRgbModified": False,
          "geometryTransform": "identity", "review": {"primary": "pending", "runtimeAccepted": False}}
(root / config["record"]).write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"output": out.name, "alphaBounds": Image.fromarray(alpha).getbbox()}))
