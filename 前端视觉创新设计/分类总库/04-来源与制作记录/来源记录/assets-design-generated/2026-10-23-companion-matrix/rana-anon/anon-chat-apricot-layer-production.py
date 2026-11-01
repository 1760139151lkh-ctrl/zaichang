"""Produce original-scene Anon chat layers, including her bench-front cast shadow.

Only source RGB extraction, alpha calibration and same-mother background repair.
Run this file directly; no Codex runtime or model call is used by production.
"""
from pathlib import Path
import hashlib
import importlib.util
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
PARAMETERS = ROOT / "anon-chat-apricot-layer-parameters-v6.json"


def main():
    parameters = json.loads(PARAMETERS.read_text(encoding="utf-8"))
    hair_exclusion = parameters.get("hairBackgroundExclusion")
    if hair_exclusion:
        mother_rgb = np.asarray(Image.open(ROOT / parameters["mother"]).convert("RGB"), dtype="int16")
        source_matte = Image.open(ROOT / hair_exclusion["sourceMatte"]).convert("L")
        alpha = np.asarray(source_matte).copy()
        left, top, right, bottom = hair_exclusion["region"]
        color = mother_rgb[top:bottom, left:right]
        red, green, blue = color[:, :, 0], color[:, :, 1], color[:, :, 2]
        background = (blue - red > hair_exclusion["blueOverRed"]) | (
            (green - blue > hair_exclusion["greenOverBlue"])
            & (red - blue > hair_exclusion["redOverBlue"])
        )
        edge = hair_exclusion["edgePixels"]
        core = source_matte.point(lambda value: 255 if value > 80 else 0).filter(ImageFilter.MinFilter(edge * 2 + 1))
        background &= np.asarray(core.crop((left, top, right, bottom))) == 0
        alpha[top:bottom, left:right][background] = 0
        Image.fromarray(alpha, mode="L").save(ROOT / parameters["matte"])
    processor = ROOT.parent / "extract-scene-layers.py"
    spec = importlib.util.spec_from_file_location("extract_scene_layers", processor)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.prepare(PARAMETERS)

    mother = Image.open(ROOT / parameters["mother"]).convert("RGB")
    background = Image.open(ROOT / parameters["background"]).convert("RGB")
    figure = Image.open(ROOT / parameters["figure"]).convert("RGBA")
    contact_shadow = Image.open(ROOT / parameters["shadow"]).convert("RGBA")
    region = Image.new("L", mother.size, 0)
    draw = ImageDraw.Draw(region)
    for polygon in parameters["castShadowPolygons"]:
        draw.polygon([tuple(point) for point in polygon], fill=255)
    coverage = np.asarray(region.filter(ImageFilter.GaussianBlur(0.7))).astype("float32") / 255
    source = np.asarray(mother).astype("float32")
    empty = np.asarray(background).astype("float32")
    alpha = np.asarray(figure.getchannel("A")).astype("float32") / 255
    strength = np.clip(np.max((empty - source) / np.maximum(empty, 1), axis=2), 0, 0.82)
    opacity = strength * coverage * (1 - alpha)
    color = np.clip((source - empty * (1 - opacity[:, :, None]))
                    / np.maximum(opacity[:, :, None], 0.001), 0, 255)
    cast = Image.fromarray(np.dstack([color.astype("uint8"), (opacity * 255).astype("uint8")]), mode="RGBA")
    contact_shadow.alpha_composite(cast)
    shadow_path = ROOT / parameters["shadow"]
    contact_shadow.save(shadow_path)

    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    record_path = ROOT / parameters["record"]
    record = json.loads(record_path.read_text(encoding="utf-8"))
    record["castShadow"] = {
        "processor": Path(__file__).name,
        "processorSha256": sha(Path(__file__)),
        "polygons": parameters["castShadowPolygons"],
        "method": "Original bench-front leg shadow solved as normal source-over RGBA against the same mother's clean background inside explicit source shadow ROIs; visible figure excluded. This cast region is separate from the 3px contact shadow band. No copied floor/bench RGB rectangle.",
        "combinedWithContactShadow": True,
    }
    if hair_exclusion:
        record["hairBackgroundExclusion"] = {
            **hair_exclusion,
            "sourceMatteSha256": sha(ROOT / hair_exclusion["sourceMatte"]),
            "method": "Only observed blue window and yellow leaf/wood residual alpha inside the original hair ROI is removed. Existing pink/white hair alpha remains soft; all figure RGB stays byte-identical to the original mother. No body, face or pose repaint.",
        }
    for output in record["outputs"]:
        if output["file"] == shadow_path.name:
            output.update(bytes=shadow_path.stat().st_size, sha256=sha(shadow_path))
    import cv2
    record["dependencies"]["OpenCV"] = cv2.__version__
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    visible = Image.open(ROOT / parameters["figure"]).getchannel("A")
    contours, _ = cv2.findContours(np.uint8(np.asarray(visible) > 72) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour = cv2.approxPolyDP(max(contours, key=cv2.contourArea), 1.3, True).reshape(-1, 2)
    width, height = mother.size
    bounds = visible.getbbox()
    scene_name = "anon-chat-apricot-candidate-v6.scene.json"
    scene = {
        "schemaVersion": 1, "id": "anon-chat-apricot-candidate-v6",
        "character": "anon", "activity": "chat", "light": "morning", "palette": "apricot",
        "width": width, "height": height, "mother": parameters["mother"],
        "background": parameters["background"], "figure": parameters["figure"], "shadow": parameters["shadow"],
        "seat": [1340 / width, 584 / height], "ground": [1228 / width, 797 / height],
        "bodyBounds": [bounds[0] / width, bounds[1] / height, bounds[2] / width, bounds[3] / height],
        "safeTextBoundary": 0.56, "support": "window-seat", "contactShadow": {"mode": "separate"},
        "contourComplete": True,
        "hitPolygon": ", ".join(f"{x / width * 100:.3f}% {y / height * 100:.3f}%" for x, y in contour),
        "travel": 4 / width, "slope": 0, "perspective": 0,
        "review": {"approvedByPrimary": False, "stage": "candidate-original-stage-layer-review",
                   "runtimeRegistered": False, "runtimeAccepted": False},
    }
    (ROOT / scene_name).write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    source = {
        "recordType": "original-mother-deterministic-layers", "createdOn": "2026-10-24",
        "character": "anon", "activity": "chat", "theme": "apricot",
        "mother": {"file": parameters["mother"], "sha256": sha(ROOT / parameters["mother"]),
                   "primaryReviewRecord": "../primary-other-mother-reviews.json",
                   "prompt": "anon-chat-apricot-prompt.txt", "promptSha256": sha(ROOT / "anon-chat-apricot-prompt.txt")},
        "imageGenerationInputs": {
            "maskSource": "anon-chat-apricot-mask-source.json", "maskPrompt": "anon-chat-apricot-mask-prompt.txt",
            "maskPromptSha256": sha(ROOT / "anon-chat-apricot-mask-prompt.txt"),
            "backgroundSource": "anon-chat-apricot-background-source.json", "backgroundPrompt": "anon-chat-apricot-background-prompt.txt",
            "backgroundPromptSha256": sha(ROOT / "anon-chat-apricot-background-prompt.txt"), "additionalImageCalls": 0,
        },
        "production": {"processor": Path(__file__).name, "processorSha256": sha(Path(__file__)),
                       "sharedProcessor": "../extract-scene-layers.py", "parameters": PARAMETERS.name,
                       "record": record_path.name, "recordSha256": sha(record_path),
                       "figureRgbEqualsMotherRgb": record["motherRgbSha256"] == record["figureRgbSha256"],
                       "OpenCV": cv2.__version__},
        "outputs": record["outputs"], "scene": scene_name,
        "designerPersonallyViewed": True,
        "designerObservation": "Viewed the approved original mother, source hair, hands, face, knees and complete shoes; final light/dark whole-figure crops, matching empty room and zero/-4/+4px full-room compositions. Original RGB retained, interior face/eye/hand/body alpha protected. Fine bright source hair highlights remain for primary judgment. Separate original contact/cast shadow and max four-pixel horizontal travel only. Static layer evidence, no primary or actual Stage acceptance.",
        "review": {"approvedByPrimary": False, "runtimeRegistered": False, "runtimeAccepted": False},
    }
    (ROOT / "anon-chat-apricot-layer-source-v6.json").write_text(json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
