"""Publish selected source-only Soyo warm layer metadata and visual previews.

This writes production asset records and focused static alpha/composite previews.
It does not operate the application or sign Primary/runtime acceptance.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


root = Path(__file__).resolve().parent
workspace = next(parent for parent in root.parents if (parent / "package.json").exists())
diagnostics = workspace / "前端视觉创新设计/仅本机/2026-10-24-soyo-warm-layer-review"
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for activity, version, note in [
    ("listening", 24, "Second producer review confirmed source-coordinate upper mullion and lower pillow pieces inside the true hair loop; original actual outer loop retained. Alpha v24 restores 239 original opaque sleeve highlight/cuff pixels incorrectly cut by the raw matte. Parent v21 overbroad cut rejected, never an adopted input. Two empty floor shoes remain room-owned."),
    ("play", 14, "Second producer review attenuated only cool original sky fragments inside the inspected outer-left hair gap. Held bookmark stays actor-owned; original RGB unchanged."),
]:
    path = root / f"soyo-{activity}-apricot.scene.json"
    scene = json.loads(path.read_text(encoding="utf-8"))
    for role in ("figure", "mask", "background", "shadow"):
        scene[role] = f"soyo-{activity}-apricot-{role}-calibrated-v{version}.png"
    scene["production"] = f"soyo-{activity}-apricot-layer-processing-v{version}.json"
    scene["review"]["producerNote"] = note + " All source candidates remain Primary/runtime pending; fixed original support travel0."
    scene["review"]["producerVisualReview"] = "Original full mother, source-coordinate detail, selected light/dark alpha, complete empty room and original-coordinate full-room recomposition personally inspected by role_matrix_settings; normal Stage/runtime pending."
    path.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

package_path = root / "soyo-warm-layer-package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["secondProducerReview"] = "role_matrix_settings personally inspected all six selected deep/light alpha, complete empty rooms and complete recompositions; final listening24 and play14 reviewed after narrow original-coordinate alpha corrections. Primary and runtime pending."
for entry in package["entries"]:
    scene_path = root / entry["scene"]
    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    entry["sceneSha256"] = sha(scene_path)
    entry["production"] = scene["production"]
    entry["layers"] = []
    for role in ("mother", "background", "figure", "mask", "shadow"):
        path = root / scene[role]
        with Image.open(path) as im:
            canvas = list(im.size)
        entry["layers"].append({"role": role, "file": path.name, "sha256": sha(path), "bytes": path.stat().st_size, "canvas": canvas})
    mother = Image.open(root / scene["mother"]).convert("RGB")
    figure = Image.open(root / scene["figure"]).convert("RGBA")
    entry["rgbChangedPixels"] = int(np.any(np.asarray(mother) != np.asarray(figure.convert("RGB")), axis=2).sum())
    entry["motherRgbPayloadSha256"] = hashlib.sha256(mother.tobytes()).hexdigest()
    entry["figureRgbPayloadSha256"] = hashlib.sha256(figure.convert("RGB").tobytes()).hexdigest()
    stem = f"soyo-{entry['activity']}-parent-final"
    body = figure.getchannel("A").getbbox()
    crop = (max(0, body[0] - 10), max(0, body[1] - 10), min(1536, body[2] + 10), min(1024, body[3] + 10))
    for label, color in (("light", "#f8f6f0"), ("dark", "#1d2027")):
        preview = Image.new("RGBA", figure.size, color)
        preview.alpha_composite(figure)
        preview.convert("RGB").save(diagnostics / (stem + f"-{label}.png"))
        preview.crop(crop).convert("RGB").save(diagnostics / (stem + f"-{label}-detail.png"))
    background = Image.open(root / scene["background"]).convert("RGBA")
    background.convert("RGB").save(diagnostics / (stem + "-empty.png"))
    background.alpha_composite(Image.open(root / scene["shadow"]).convert("RGBA"))
    background.alpha_composite(figure)
    background.convert("RGB").save(diagnostics / (stem + "-room.png"))
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"package": package_path.name, "candidates": [{"activity": x["activity"], "rgbChangedPixels": x["rgbChangedPixels"], "production": x["production"]} for x in package["entries"]]}, ensure_ascii=False))
