"""Deterministic asset separation for two primary-approved original mothers.

This edits only derived alpha. All figure RGB bytes come from the mother.
It does not draw anatomy, change geometry, process model/runtime data or test UI.
Run from any cwd: python listening-rest-layer-calibration.py <parameters.json>
"""
from pathlib import Path
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parameter_file = Path(sys.argv[1]).resolve()
base = parameter_file.parent
parameters = json.loads(parameter_file.read_text(encoding="utf-8"))
mother_path = base / parameters["mother"]
raw_path = base / parameters["rawMask"]
if digest(mother_path) != parameters["motherSha256"] or digest(raw_path) != parameters["rawMaskSha256"]:
    raise ValueError("The original mother or generated raw mask differs from the recorded input.")
mother = Image.open(mother_path).convert("RGB")
raw = Image.open(raw_path).convert("L")
if mother.size != (1536, 1024) or raw.size != mother.size:
    raise ValueError("The input layers must retain the original full 1536 x 1024 canvas.")
rgb = np.asarray(mother).astype(np.int16)
alpha = np.asarray(raw).astype(np.float32)
low, high = parameters["noiseRange"]
alpha = np.clip((alpha - low) * 255 / (high - low), 0, 255)
left, top, right, bottom = parameters["outerNoiseBounds"]
alpha[:top] = 0
alpha[bottom:] = 0
alpha[:, :left] = 0
alpha[:, right:] = 0

for addition in parameters.get("originalClothInclusions", []):
    region = Image.new("L", mother.size)
    ImageDraw.Draw(region).polygon([tuple(point) for point in addition["polygon"]], fill=255)
    selected = np.asarray(region) > 0
    selected &= rgb.max(axis=2) <= addition["maxRgb"]
    selected &= rgb[:, :, 2] >= rgb[:, :, 1] - addition["blueBelowGreenLimit"]
    alpha[selected] = 255

for polygon in parameters.get("solidOriginalClothInclusions", []) + parameters.get("solidOriginalPixelInclusions", []):
    region = Image.new("L", mother.size)
    ImageDraw.Draw(region).polygon([tuple(point) for point in polygon], fill=255)
    alpha[np.asarray(region) > 0] = 255

for exclusion in parameters.get("warmBackgroundExclusions", []):
    x0, y0, x1, y1 = exclusion["rect"]
    patch = rgb[y0:y1, x0:x1]
    warm = (patch[:, :, 1] - patch[:, :, 2] >= exclusion["greenMinusBlue"])
    warm &= patch[:, :, 0] - patch[:, :, 2] >= exclusion["redMinusBlue"]
    local = alpha[y0:y1, x0:x1]
    local[warm] = 0

for polygon in parameters.get("explicitRoomExclusions", []):
    region = Image.new("L", mother.size)
    ImageDraw.Draw(region).polygon([tuple(point) for point in polygon], fill=255)
    alpha[np.asarray(region) > 0] = 0

for edge in parameters.get("pillowBoundaryExclusions", []):
    points = np.asarray(edge["rowAndLastBodyX"], dtype=np.float64)
    for y in range(int(points[0, 0]), int(points[-1, 0]) + 1):
        boundary = np.interp(y, points[:, 0], points[:, 1])
        x = np.arange(mother.width)
        keep = np.clip((boundary + edge["edgeWidth"] / 2 - x) / edge["edgeWidth"], 0, 1)
        alpha[y] *= keep

for inclusion in parameters.get("softOriginalPixelInclusions", []):
    points = inclusion["polygon"]
    factor = inclusion["supersampling"]
    x0 = max(0, min(point[0] for point in points) - 2)
    y0 = max(0, min(point[1] for point in points) - 2)
    x1 = min(mother.width, max(point[0] for point in points) + 3)
    y1 = min(mother.height, max(point[1] for point in points) + 3)
    patch = Image.new("L", ((x1 - x0) * factor, (y1 - y0) * factor))
    ImageDraw.Draw(patch).polygon([((x - x0) * factor, (y - y0) * factor) for x, y in points], fill=255)
    patch = patch.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
    alpha[y0:y1, x0:x1] = np.maximum(alpha[y0:y1, x0:x1], np.asarray(patch))

for cap in parameters.get("observedBoundaryAlphaCaps", []):
    x0, y0, x1, y1 = cap["rect"]
    alpha[y0:y1, x0:x1] = np.minimum(alpha[y0:y1, x0:x1], cap["maxAlpha"])

if parameters.get("removeIslandsSmallerThan", 0):
    from scipy.ndimage import label
    components, count = label(alpha > 0)
    sizes = np.bincount(components.ravel())
    alpha[sizes[components] < parameters["removeIslandsSmallerThan"]] = 0

alpha = np.rint(alpha).astype(np.uint8)
alpha_image = Image.fromarray(alpha, "L")
figure = mother.convert("RGBA")
figure.putalpha(alpha_image)
mask = Image.new("RGBA", mother.size, (255, 255, 255, 0))
mask.putalpha(alpha_image)
figure_path = base / parameters["figureOutput"]
mask_path = base / parameters["maskOutput"]
figure.save(figure_path)
if parameters.get("maskFormat") == "L":
    alpha_image.save(mask_path)
else:
    mask.save(mask_path)
background_result = None
if parameters.get("backgroundRegistration"):
    from scipy.ndimage import gaussian_filter, maximum_filter
    registration = parameters["backgroundRegistration"]
    background_input = base / registration["input"]
    if digest(background_input) != registration["inputSha256"]:
        raise ValueError("The generated clean background differs from its recorded input.")
    generated_background = Image.open(background_input).convert("RGB")
    if generated_background.size != mother.size:
        raise ValueError("The generated background must retain the full original canvas.")
    replacement_alpha = alpha.copy()
    for polygon in registration.get("additionalInpaintPolygons", []):
        region = Image.new("L", mother.size)
        ImageDraw.Draw(region).polygon([tuple(point) for point in polygon], fill=255)
        replacement_alpha[np.asarray(region) > 0] = 255
    width = registration["dilationPixels"] * 2 + 1
    inpaint = maximum_filter(replacement_alpha.astype(np.float32), size=width, mode="constant")
    inpaint = gaussian_filter(inpaint, sigma=registration["featherSigma"], truncate=3)
    blend = np.clip(inpaint / 255, 0, 1)[:, :, None]
    original_rgb = np.asarray(mother).astype(np.float32)
    generated_rgb = np.asarray(generated_background).astype(np.float32)
    background_rgb = np.rint(original_rgb * (1 - blend) + generated_rgb * blend).astype(np.uint8)
    background_path = base / registration["output"]
    Image.fromarray(background_rgb, "RGB").save(background_path)
    background_result = {"background": os.path.relpath(background_path, base).replace("\\", "/"), "backgroundSha256": digest(background_path)}
report = {"parameters": parameter_file.name, "figure": os.path.relpath(figure_path, base).replace("\\", "/"),
    "figureSha256": digest(figure_path), "mask": os.path.relpath(mask_path, base).replace("\\", "/"), "maskSha256": digest(mask_path),
    "fullCanvas": list(mother.size), "alphaBounds": alpha_image.getbbox(),
    "alphaNonzero": int(np.count_nonzero(alpha)), "rgbSource": os.path.relpath(mother_path, base).replace("\\", "/"),
    "registeredBackground": background_result}
if parameters.get("processingSourceOutput"):
    report.update({"recordType": "deterministic-companion-layer-source",
        "script": Path(__file__).name, "scriptSha256": digest(Path(__file__)),
        "parametersSha256": digest(parameter_file),
        "motherSha256": digest(mother_path), "rawMaskSha256": digest(raw_path),
        "identityTransform": [1, 0, 0, 1, 0, 0],
        "rgbByteSha256": hashlib.sha256(np.asarray(mother).tobytes()).hexdigest(),
        "figureRgbByteSha256": hashlib.sha256(np.asarray(figure)[:, :, :3].tobytes()).hexdigest(),
        "rgbChangedPixels": int(np.any(np.asarray(figure)[:, :, :3] != np.asarray(mother), axis=2).sum()),
        "alphaChangedPixelsFromRawLuminance": int(np.count_nonzero(alpha != np.asarray(raw))),
        "alphaFormat": "L" if parameters.get("maskFormat") == "L" else "RGBA white RGB + alpha",
        "originalInputsUnmodified": True,
        "review": {"primaryLayer": "pending; producer cannot approve", "runtime": "not registered or accepted"}})
    (base / parameters["processingSourceOutput"]).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
