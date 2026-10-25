"""Register generated matte proposals to approved source pixels; asset production only.

Usage: python tomori-matte-registration.py parameters.json
Only the alpha proposal is transformed. Source character RGB is never changed.
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

path = Path(sys.argv[1]).resolve()
config = json.loads(path.read_text(encoding="utf-8"))
root = path.parent
registration = config["matteRegistration"]
proposal_path = root / registration["proposal"]
proposal = Image.open(proposal_path).convert("L")
if hashlib.sha256(proposal_path.read_bytes()).hexdigest() != registration["proposalSha256"]:
    raise ValueError("The recorded matte proposal changed.")
source = tuple(registration["sourceBounds"])
target = tuple(registration["targetBounds"])
alpha = Image.new("L", proposal.size, 0)
aligned = proposal.crop(source).resize((target[2] - target[0], target[3] - target[1]), Image.Resampling.LANCZOS)
alpha.paste(aligned, target[:2])
refinement = config.get("registeredRefinement")
if refinement:
    import cv2
    import numpy as np

    mother_path = root / config["mother"]
    if hashlib.sha256(mother_path.read_bytes()).hexdigest() != config["motherSha256"]:
        raise ValueError("The primary-reviewed original changed.")
    image = np.asarray(Image.open(mother_path).convert("RGB"))
    binary = np.uint8(np.asarray(alpha) > 80)
    radius = refinement["uncertainBandPixels"]
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1))
    labels = np.full(binary.shape, cv2.GC_BGD, dtype=np.uint8)
    labels[cv2.dilate(binary, kernel) > 0] = cv2.GC_PR_BGD
    labels[binary > 0] = cv2.GC_PR_FGD
    labels[cv2.erode(binary, kernel) > 0] = cv2.GC_FGD
    for name, label in [("foregroundPolygons", cv2.GC_FGD), ("backgroundPolygons", cv2.GC_BGD)]:
        for polygon in refinement.get(name, []):
            seed = Image.new("L", alpha.size, 0)
            ImageDraw.Draw(seed).polygon([tuple(point) for point in polygon], fill=255)
            labels[np.asarray(seed) > 0] = label
    cv2.setRNGSeed(0)
    cv2.grabCut(cv2.cvtColor(image, cv2.COLOR_RGB2BGR), labels, None,
                np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 4, cv2.GC_INIT_WITH_MASK)
    alpha = Image.fromarray(np.uint8((labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)) * 255)
    alpha = alpha.filter(ImageFilter.GaussianBlur(refinement["edgeFeatherPixels"]))
for item in config.get("alphaRegionCaps", []):
    import numpy as np

    region = Image.new("L", alpha.size, 0)
    ImageDraw.Draw(region).polygon([tuple(point) for point in item["polygon"]], fill=255)
    values = np.asarray(alpha).copy()
    selected = np.asarray(region) > 0
    values[selected] = np.minimum(values[selected], item["maximumAlpha"])
    alpha = Image.fromarray(values)
alpha.save(root / config["matte"])
print(config["matte"])
