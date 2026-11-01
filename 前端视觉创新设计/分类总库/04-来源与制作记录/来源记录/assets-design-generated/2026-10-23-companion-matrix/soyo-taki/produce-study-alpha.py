"""Produce two original-coordinate study alpha candidates from approved RGB.

The generated mask with altered scale is deliberately not an input. Matching
clean-room RGB supplies only a segmentation cue; original mother RGB is retained.
No tests, fixtures, UI state or anatomy reconstruction are created.
"""
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


root = Path(__file__).resolve().parent
parameters_path = root / "study-alpha-parameters-v1.json"
parameters = json.loads(parameters_path.read_text(encoding="utf-8"))
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
outputs = []
for entry in parameters["entries"]:
    mother_path, background_path = root / entry["mother"], root / entry["background"]
    if sha(mother_path) != entry["motherSha256"] or sha(background_path) != entry["backgroundSha256"]:
        raise ValueError("Recorded mother/background bytes changed before alpha production.")
    mother = Image.open(mother_path).convert("RGB")
    rgb = np.asarray(mother)
    background = np.asarray(Image.open(background_path).convert("RGB"))
    if rgb.shape != background.shape:
        raise ValueError("Matching background must retain the original full canvas.")
    region = Image.new("L", mother.size, 0)
    ImageDraw.Draw(region).polygon([tuple(p) for p in entry["outerPolygon"]], fill=255)
    inside = np.asarray(region) > 0
    difference = np.max(np.abs(rgb.astype("int16") - background.astype("int16")), axis=2)
    labels = np.full(inside.shape, cv2.GC_BGD, dtype="uint8")
    labels[inside] = cv2.GC_PR_BGD
    labels[inside & (difference > 24)] = cv2.GC_PR_FGD
    labels[inside & (difference < 10)] = cv2.GC_BGD
    for x, y in entry["foregroundPoints"]:
        cv2.circle(labels, (x, y), 2, cv2.GC_FGD, -1)
    for x, y in entry["backgroundPoints"]:
        cv2.circle(labels, (x, y), 2, cv2.GC_BGD, -1)
    cv2.setRNGSeed(0)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), labels, None,
                np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    visible = np.uint8((labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)) * 255
    alpha = Image.fromarray(visible, mode="L").filter(ImageFilter.GaussianBlur(0.35))
    target = root / entry["output"]
    alpha.save(target)
    outputs.append({"character": entry["character"], "mother": mother_path.name,
                    "motherSha256": sha(mother_path), "background": background_path.name,
                    "backgroundSha256": sha(background_path), "alpha": target.name,
                    "alphaSha256": sha(target), "alphaBounds": alpha.getbbox(),
                    "primaryLayerReview": "pending", "runtimeAccepted": False})
record = {"recordType": "deterministic-original-coordinate-alpha-production",
          "processor": Path(__file__).name, "processorSha256": sha(Path(__file__)),
          "parameters": parameters_path.name, "parametersSha256": sha(parameters_path),
          "OpenCV": cv2.__version__, "method": parameters["method"], "outputs": outputs,
          "bodyRgbModified": False, "geometryTransform": "identity"}
(root / "study-alpha-production-v1.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(outputs, ensure_ascii=False))
