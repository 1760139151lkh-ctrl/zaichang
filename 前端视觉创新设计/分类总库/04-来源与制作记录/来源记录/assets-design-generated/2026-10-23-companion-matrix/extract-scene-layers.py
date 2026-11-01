"""Reproducible asset production for approved scene mothers; not a test runner.

Usage: python extract-scene-layers.py <parameters.json>
Dependencies: Pillow, NumPy; optional OpenCV for explicit local matte refinement.
No model calls, geometry transforms or RGB repaint.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np
import PIL
from PIL import Image, ImageDraw, ImageFilter


def sha_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(config_path):
    config = json.loads(config_path.read_text(encoding="utf-8"))
    root = config_path.parent
    mother_path = root / config["mother"]
    matte_path = root / config["matte"]
    mother = Image.open(mother_path).convert("RGB")
    matte = Image.open(matte_path).convert("RGBA")
    if matte.size != mother.size:
        raise ValueError("Matte and mother must already share the same full canvas; no resize is performed.")
    if sha_file(mother_path) != config["motherSha256"]:
        raise ValueError("Approved mother bytes changed; inspect the source before processing.")
    mode = config["alphaSource"]
    if mode not in ("alpha", "luminance"):
        raise ValueError("alphaSource must explicitly be alpha or luminance.")
    raw_alpha = matte.getchannel("A") if mode == "alpha" else matte.convert("L")
    matte_overrides = []
    for override in config.get("matteRegionOverrides", []):
        override_path = root / override["file"]
        override_image = Image.open(override_path).convert("RGBA")
        if override_image.size != mother.size or sha_file(override_path) != override["sha256"]:
            raise ValueError("An explicit matte override must match its recorded bytes and full canvas.")
        if override["alphaSource"] not in ("alpha", "luminance"):
            raise ValueError("A matte override must explicitly select alpha or luminance.")
        override_alpha = override_image.getchannel("A") if override["alphaSource"] == "alpha" else override_image.convert("L")
        region = tuple(override["region"])
        raw_alpha.paste(override_alpha.crop(region), region[:2])
        matte_overrides.append(override)
    values = np.array(raw_alpha, dtype=np.uint8)
    low, high = config.get("alphaLow", 0), config.get("alphaHigh", 255)
    values[values <= low] = 0
    values[values >= high] = 255
    alpha = Image.fromarray(values, mode="L")
    draw = ImageDraw.Draw(alpha)
    for polygon in config.get("excludePolygons", []):
        draw.polygon([tuple(point) for point in polygon], fill=0)
    for polygon in config.get("includePolygons", []):
        draw.polygon([tuple(point) for point in polygon], fill=255)
    for item in config.get("excludeWarmRoomRegions", []):
        region = Image.new("L", mother.size, 0)
        ImageDraw.Draw(region).polygon([tuple(point) for point in item["polygon"]], fill=255)
        rgb = np.array(mother, dtype=np.int16)
        selected = (np.array(region) > 0) & (rgb[:, :, 0] >= item["redMin"])
        selected &= rgb[:, :, 0] - rgb[:, :, 1] >= item["redOverGreen"]
        selected &= rgb[:, :, 0] - rgb[:, :, 2] >= item["redOverBlue"]
        current = np.array(alpha)
        current[selected] = 0
        alpha = Image.fromarray(current, mode="L")
    for repair in config.get("alphaPolygonRepairs", []):
        left, top, right, bottom = repair["region"]
        scale = 4
        shape = Image.new("L", ((right - left) * scale, (bottom - top) * scale), 0)
        ImageDraw.Draw(shape).polygon([((x - left) * scale, (y - top) * scale) for x, y in repair["polygon"]], fill=255)
        shape = shape.resize((right - left, bottom - top), Image.Resampling.LANCZOS)
        if repair.get("featherPixels"):
            shape = shape.filter(ImageFilter.GaussianBlur(repair["featherPixels"]))
        shape = shape.point(lambda value: 0 if value <= low else 255 if value >= high else value)
        repair_mode = repair.get("mode", "replace")
        if repair_mode not in ("replace", "intersect", "subtract"):
            raise ValueError("An alpha polygon repair mode must be replace, intersect or subtract.")
        if repair_mode == "intersect":
            shape = Image.fromarray(np.minimum(np.asarray(alpha.crop((left, top, right, bottom))), np.asarray(shape)), mode="L")
        elif repair_mode == "subtract":
            original = np.asarray(alpha.crop((left, top, right, bottom)), dtype=np.float32)
            coverage = np.asarray(shape, dtype=np.float32) / 255
            shape = Image.fromarray(np.rint(original * (1 - coverage)).astype(np.uint8), mode="L")
        alpha.paste(shape, (left, top))
    refinement = config.get("localColorMatteRefinement")
    if refinement:
        import cv2
        cv2.setRNGSeed(0)
        refinement_region = tuple(refinement.get("region", (0, 0, *mother.size)))
        working_alpha = alpha.crop(refinement_region)
        working_rgb = np.array(mother.crop(refinement_region))
        binary = np.uint8(np.array(working_alpha) > refinement.get("seedThreshold", 80))
        radius = refinement.get("uncertainBandPixels", 3)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
        outside = cv2.dilate(binary, kernel)
        inside = cv2.erode(binary, kernel)
        labels = np.full(binary.shape, cv2.GC_BGD, dtype=np.uint8)
        labels[outside > 0] = cv2.GC_PR_BGD
        labels[binary > 0] = cv2.GC_PR_FGD
        labels[inside > 0] = cv2.GC_FGD
        cv2.grabCut(cv2.cvtColor(working_rgb, cv2.COLOR_RGB2BGR), labels, None,
                    np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
                    refinement.get("iterations", 3), cv2.GC_INIT_WITH_MASK)
        refined_alpha = Image.fromarray(np.uint8((labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)) * 255, mode="L")
        feather = refinement.get("edgeFeatherPixels", 0)
        if feather:
            refined_alpha = refined_alpha.filter(ImageFilter.GaussianBlur(feather))
        alpha.paste(refined_alpha, refinement_region[:2])
    final_values = np.array(alpha, dtype=np.uint8)
    figure = mother.copy().convert("RGBA")
    figure.putalpha(alpha)
    white_mask = Image.new("RGBA", mother.size, (255, 255, 255, 0))
    white_mask.putalpha(alpha)
    figure_path, mask_path = root / config["figure"], root / config["mask"]
    figure.save(figure_path)
    white_mask.save(mask_path)
    outputs = [figure_path, mask_path]
    background_note = None
    shadow_note = None
    if config.get("backgroundCandidate"):
        candidate_path = root / config["backgroundCandidate"]
        candidate = Image.open(candidate_path).convert("RGB")
        if candidate.size != mother.size:
            raise ValueError("Background and mother must share the same full canvas.")
        radius = config.get("backgroundExpandPixels", 0)
        patch = alpha.point(lambda value: 255 if value else 0)
        patch_draw = ImageDraw.Draw(patch)
        for polygon in config.get("backgroundErasePolygons", []):
            patch_draw.polygon([tuple(point) for point in polygon], fill=255)
        if radius:
            patch = patch.filter(ImageFilter.MaxFilter(radius * 2 + 1))
        blur = config.get("backgroundFeatherPixels", 0)
        if blur:
            patch = patch.filter(ImageFilter.GaussianBlur(blur))
        if config.get("backgroundPreservePolygons"):
            preserve_draw = ImageDraw.Draw(patch)
            for polygon in config["backgroundPreservePolygons"]:
                preserve_draw.polygon([tuple(point) for point in polygon], fill=0)
        background = Image.composite(candidate, mother, patch)
        background_path = root / config["background"]
        background.save(background_path)
        outputs.append(background_path)
        background_note = {
            "candidate": config["backgroundCandidate"], "candidateSha256": sha_file(candidate_path),
            "expandPixels": radius, "featherPixels": blur,
            "additionalErasePolygons": config.get("backgroundErasePolygons", []),
            "originalPixelPreservePolygons": config.get("backgroundPreservePolygons", []),
            "changedPixels": int(np.any(np.array(background) != np.array(mother), axis=2).sum()),
            "method": "Mother RGB retained outside the explicitly grown/feathered character patch; only that patch uses this mother's generated clean background.",
        }
        if config.get("contactShadowPolygons"):
            contact = Image.new("L", mother.size, 0)
            contact_draw = ImageDraw.Draw(contact)
            for polygon in config["contactShadowPolygons"]:
                contact_draw.polygon([tuple(point) for point in polygon], fill=255)
            source_rgb = np.asarray(mother).astype("float32")
            empty_rgb = np.asarray(background).astype("float32")
            strength = np.clip(np.max((empty_rgb - source_rgb) / np.maximum(empty_rgb, 1), axis=2), 0, 0.82)
            coverage = np.asarray(contact.filter(ImageFilter.GaussianBlur(config.get("contactShadowFeatherPixels", 1.2)))).astype("float32") / 255
            edge_pixels = config.get("contactShadowEdgePixels")
            if edge_pixels is not None:
                near_figure = alpha.filter(ImageFilter.MaxFilter(edge_pixels * 2 + 1))
                coverage *= np.asarray(near_figure).astype("float32") / 255
            opacity = strength * coverage * (1 - final_values.astype("float32") / 255)
            color = np.clip((source_rgb - empty_rgb * (1 - opacity[:, :, None])) / np.maximum(opacity[:, :, None], 0.001), 0, 255)
            shadow = Image.fromarray(np.dstack([color.astype("uint8"), (opacity * 255).astype("uint8")]), mode="RGBA")
            shadow_path = root / config["shadow"]
            shadow.save(shadow_path)
            outputs.append(shadow_path)
            shadow_note = {"mode": "normal source-over RGBA residual", "polygons": config["contactShadowPolygons"],
                           "featherPixels": config.get("contactShadowFeatherPixels", 1.2),
                           "maximumDistanceFromFigurePixels": edge_pixels,
                           "method": "Source contact darkness/color solved against matching empty RGB inside explicit source contact ROIs only; figure pixels excluded; no multiply or floor RGB patch."}
    rgb_sha = hashlib.sha256(mother.tobytes()).hexdigest()
    record = {
        "recordType": "deterministic-scene-layer-production", "parameters": config_path.name,
        "processor": Path(__file__).name, "processorSha256": sha_file(Path(__file__)),
        "dependencies": {"Pillow": PIL.__version__, "NumPy": np.__version__, "OpenCV": cv2.__version__ if refinement else None},
        "authorization": "User explicitly allowed precise original-scene layering on 2026-10-23; alpha/matte, background noise and registration only, no anatomy/face/pose repaint.",
        "mother": config["mother"], "motherSha256": sha_file(mother_path),
        "matte": config["matte"], "matteSha256": sha_file(matte_path),
        "matteRegionOverrides": matte_overrides,
        "canvas": list(mother.size), "transform": "identity; no resize/translation/warp",
        "alphaSource": mode, "alphaLow": low, "alphaHigh": high,
        "includePolygons": config.get("includePolygons", []),
        "excludePolygons": config.get("excludePolygons", []),
        "excludeWarmRoomRegions": config.get("excludeWarmRoomRegions", []),
        "alphaPolygonRepairs": config.get("alphaPolygonRepairs", []),
        "localColorMatteRefinement": refinement,
        "alphaChangedPixels": int((np.array(raw_alpha) != final_values).sum()),
        "alphaNonzeroPixels": int((final_values > 0).sum()), "alphaBounds": alpha.getbbox(),
        "rgbMethod": "Entire RGB payload taken from original mother; only alpha changes visibility.",
        "motherRgbSha256": rgb_sha, "figureRgbSha256": hashlib.sha256(figure.convert("RGB").tobytes()).hexdigest(),
        "background": background_note,
        "contactShadow": shadow_note,
        "outputs": [{"file": os.path.relpath(path, root).replace("\\", "/"), "bytes": path.stat().st_size, "sha256": sha_file(path)} for path in outputs],
        "review": {"primaryLayerReview": "pending", "integrated": False, "runtimeAccepted": False},
    }
    (root / config["record"]).write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"parameters": config_path.name, "alphaBounds": record["alphaBounds"], "alphaChangedPixels": record["alphaChangedPixels"], "outputs": record["outputs"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parameters", type=Path)
    prepare(parser.parse_args().parameters.resolve())
