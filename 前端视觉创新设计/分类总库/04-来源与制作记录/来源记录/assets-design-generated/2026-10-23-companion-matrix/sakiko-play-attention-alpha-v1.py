"""Bounded source-asset preparation, not a test or application runtime.

Keep the approved mother's RGB unchanged. Calibrate only the generated alpha:
discard almost transparent noise, keep the connected real silhouette, and
make its near-opaque interior opaque. No erosion, growth, filling, resampling,
registration transform, RGB recoloring, anatomy correction or painting.
"""
from pathlib import Path
import hashlib
import json
import os

import cv2
import numpy as np
from PIL import Image, __version__ as pillow_version


ROOT = Path(__file__).resolve().parent
ALPHA_NOISE_MAX = 8
ALPHA_OPAQUE_MIN = 250
ITEMS = [
    ("play", "../../../运行素材/companion/scenes/sakiko-play-apricot-v4-mother.png", "sakiko-play-apricot-mask-generated-v1.png"),
    ("attention", "../../../运行素材/companion/scenes/sakiko-attention-apricot-v4-mother.png", "sakiko-attention-apricot-mask-generated-v2.png"),
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


records = []
for activity, mother_name, raw_name in ITEMS:
    mother_path, raw_path = ROOT / mother_name, ROOT / raw_name
    mother = Image.open(mother_path).convert("RGB")
    raw = Image.open(raw_path).convert("RGBA")
    if raw.size != mother.size:
        raise ValueError(f"Different canvas sizes for {activity}")
    alpha = np.array(raw.getchannel("A"), copy=True)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        (alpha > ALPHA_NOISE_MAX).astype(np.uint8), 8
    )
    if count < 2:
        raise ValueError(f"No usable original alpha for {activity}")
    retained = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    detached_pixels = int(np.count_nonzero((labels != 0) & (labels != retained)))
    alpha[(alpha <= ALPHA_NOISE_MAX) | (labels != retained)] = 0
    alpha[alpha >= ALPHA_OPAQUE_MIN] = 255
    alpha_image = Image.fromarray(alpha)
    figure = mother.convert("RGBA")
    figure.putalpha(alpha_image)
    matte = Image.new("RGBA", mother.size, (255, 255, 255, 0))
    matte.putalpha(alpha_image)
    stem = f"sakiko-{activity}-apricot"
    figure_path = ROOT.parents[2] / "运行素材/companion/scenes" / f"{stem}-v4-figure.png"
    matte_path = ROOT / f"{stem}-mask-calibrated-v1.png"
    figure.save(figure_path)
    matte.save(matte_path)
    reloaded_rgb = Image.open(figure_path).convert("RGB")
    records.append({
        "activity": activity,
        "mother": {"file": mother_name, "sha256": digest(mother_path)},
        "rawMask": {"file": raw_name, "sha256": digest(raw_path)},
        "width": mother.width,
        "height": mother.height,
        "alphaBounds": alpha_image.getbbox(),
        "retainedComponentPixels": int(stats[retained, cv2.CC_STAT_AREA]),
        "discardedDetachedPixels": detached_pixels,
        "motherRgbSha256": hashlib.sha256(mother.tobytes()).hexdigest(),
        "figureRgbSha256": hashlib.sha256(reloaded_rgb.tobytes()).hexdigest(),
        "figure": {"file": os.path.relpath(figure_path, ROOT).replace("\\", "/"), "sha256": digest(figure_path), "bytes": figure_path.stat().st_size},
        "mask": {"file": matte_path.name, "sha256": digest(matte_path), "bytes": matte_path.stat().st_size},
        "review": "candidate; per-pose light/dark and full-background review required; no primary or runtime acceptance",
    })

record = {
    "recordType": "deterministic-alpha-calibration",
    "authorization": "User explicitly permitted precise same-scene extraction; original RGB only, no anatomy/face repainting.",
    "script": Path(__file__).name,
    "scriptSha256": digest(Path(__file__)),
    "parameters": {
        "alphaNoiseMax": ALPHA_NOISE_MAX,
        "alphaOpaqueMin": ALPHA_OPAQUE_MIN,
        "connectivity": 8,
        "selection": "largest connected alpha>8 component; actual fine hair remains connected at this threshold",
        "otherAlphaValues": "unchanged",
        "morphology": "none",
        "rgbOperation": "unmodified full-canvas approved-mother RGB with calibrated alpha",
    },
    "libraries": {"Pillow": pillow_version, "numpy": np.__version__, "OpenCV": cv2.__version__},
    "items": records,
}
(ROOT / "sakiko-play-attention-alpha-calibration-v1.json").write_text(
    json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps(records, indent=2))
