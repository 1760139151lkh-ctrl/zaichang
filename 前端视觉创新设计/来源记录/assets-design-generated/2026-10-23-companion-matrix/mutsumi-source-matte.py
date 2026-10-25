"""Produce alpha from approved original RGB plus matching empty-room trimap.
No RGB is changed, no body is redrawn, and no displaced Imagegen mask is used.
Usage: python mutsumi-source-matte.py parameters.json
"""
from pathlib import Path
import hashlib
import json
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

path = Path(sys.argv[1]).resolve()
base = path.parent
p = json.loads(path.read_text(encoding="utf-8"))
sha = lambda f: hashlib.sha256(f.read_bytes()).hexdigest()
mother_path, background_path = base / p["mother"], base / p["matchingBackground"]
if sha(mother_path) != p["motherSha256"] or sha(background_path) != p["matchingBackgroundSha256"]:
    raise ValueError("Recorded original asset bytes changed.")
mother = Image.open(mother_path).convert("RGB")
background = Image.open(background_path).convert("RGB")
if mother.size != (1536, 1024) or background.size != mother.size:
    raise ValueError("Only original equal full-canvas inputs are supported.")
shape = Image.new("L", mother.size)
draw = ImageDraw.Draw(shape)
for polygon in p["originalObservedContourPolygons"]:
    draw.polygon([tuple(v) for v in polygon], fill=255)
for polygon in p.get("originalObservedRoomHoles", []):
    draw.polygon([tuple(v) for v in polygon], fill=0)
binary = np.asarray(shape)
radius = p["uncertainBandPixels"]
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
outside = cv2.dilate(binary, kernel)
inside = cv2.erode(binary, kernel)
rgb = np.asarray(mother)
difference = np.max(np.abs(rgb.astype(np.int16) - np.asarray(background).astype(np.int16)), axis=2)
labels = np.full(binary.shape, cv2.GC_BGD, np.uint8)
labels[outside > 0] = cv2.GC_PR_BGD
labels[binary > 0] = cv2.GC_PR_FGD
labels[(inside > 0) & (difference >= p["interiorDifferenceThreshold"])] = cv2.GC_FGD
labels[(outside > 0) & (difference < p["matchingBackgroundSeedThreshold"])] = cv2.GC_PR_BGD
for polygon in p.get("sureRoomPolygons", []):
    room = Image.new("L", mother.size)
    ImageDraw.Draw(room).polygon([tuple(v) for v in polygon], fill=255)
    labels[np.asarray(room) > 0] = cv2.GC_BGD
for polygon in p.get("sureBodyPolygons", []):
    body = Image.new("L", mother.size)
    ImageDraw.Draw(body).polygon([tuple(v) for v in polygon], fill=255)
    labels[np.asarray(body) > 0] = cv2.GC_FGD
cv2.setRNGSeed(0)
cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), labels, None,
    np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
    p["iterations"], cv2.GC_INIT_WITH_MASK)
alpha = np.uint8((labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)) * 255
alpha = Image.fromarray(alpha, "L")
if p.get("edgeFeatherPixels"):
    alpha = alpha.filter(ImageFilter.GaussianBlur(p["edgeFeatherPixels"]))
alpha.save(base / p["matteOutput"])
record = {"recordType": "deterministic-original-rgb-trimap-production",
    "script": Path(__file__).name, "scriptSha256": sha(Path(__file__)),
    "parameters": path.name, "parametersSha256": sha(path),
    "inputs": [{"file": mother_path.name, "sha256": sha(mother_path), "role": "primary-approved sole original body RGB/geometry"},
        {"file": background_path.name, "sha256": sha(background_path), "role": "matching empty background for original-position difference/trimap only"}],
    "output": {"file": p["matteOutput"], "sha256": sha(base / p["matteOutput"])},
    "canvas": list(mother.size), "alphaBounds": alpha.getbbox(),
    "method": "Observed original-coordinate visible contour and room-hole trimap with original RGB/matching BG difference seeds; no erroneous generated mask, body/RGB transform, repaint or hidden-anatomy completion.",
    "review": {"primaryLayer": "pending", "runtime": "not registered or accepted"}}
(base / p["record"]).write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record, ensure_ascii=False))

