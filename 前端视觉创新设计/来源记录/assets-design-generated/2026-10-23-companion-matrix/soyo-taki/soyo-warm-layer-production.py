"""Original RGB scene-layer asset production for five approved Soyo mothers.

This is asset processing, not a test runner. Backgrounds are generated separately
with the built-in Image tool. Only original-coordinate alpha is computed here.
"""
import argparse
import hashlib
import json
import shutil
import runpy
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
REVIEW = ROOT.parents[3] / "仅本机/2026-10-24-soyo-warm-layer-review"
VERSIONS = {"reading": 2, "listening": 2, "rest": 1, "play": 1, "attention": 1}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def prepare():
    navigation = read(ROOT / "mother-candidates-index.json")
    mothers = next(x for x in navigation["characters"] if x["id"] == "soyo")["mothers"]
    for activity in VERSIONS:
        entry = next(x for x in mothers if x["activity"] == activity)
        mother = ROOT / entry["file"]
        if digest(mother) != entry["sha256"]:
            raise ValueError("Approved mother bytes changed")
        object_note = {
            "reading": "Remove the open book held in her lap together with the person; it is held actor content. Keep the separate closed book and cup on the desk.",
            "listening": "Keep EXACTLY BOTH existing removed brown loafers on the floor at their original positions. They are room objects. Remove both socked feet, both legs, all navy skirt and both hands with the person. Restore the linen cushion behind them.",
            "rest": "Remove her entire person including both brown shoes that she is wearing. Restore the bench cushion, bench wood and floor behind her.",
            "play": "Remove the small ivory bookmark from her offering hand together with the person. Keep the desk book, cup and lamp. Restore the original cushion and floor behind both worn brown shoes.",
            "attention": "Keep the small IVORY FOLDED CARD on the desk beside the lamp completely unchanged at its original coordinates. It belongs to the room. Remove her entire person including both worn brown shoes."
        }[activity]
        prompt = f"""Use case: precise-object-edit.
Asset type: matching clean empty-background layer for a primary-approved full original scene, 1536 x 1024.
Input image 1 is the ONLY edit target: the correct complete Soyo {activity} apricot mother. Remove only the ONE anime person and any held actor object, including all hair, head, face, uniform, hands, limbs and worn footwear. Remove her cast/contact shadow while retaining the room's existing lighting and room shadows. {object_note}
Reconstruct only the small formerly occluded room area. Preserve this exact full 1536 x 1024 canvas, original camera and crop, all four window edges/corners, every window mullion, lake/city/trees/sky, warm apricot illumination, shelves, small rear desk/chair, large right desk, upholstered chair, lamp/cup/closed desk book, bench wooden seams and linen cushion, patterned blue pillows and ivory throw at their EXACT original coordinates. No zoom, perspective change, furniture motion, different color grade, invented furniture, changed skyline or added object. Do not replace the whole image with a similar empty room. No person or ghost silhouette/hair/limb/shoe remnants; no face or anatomy editing. Opaque RGB empty room, no transparency, text, watermark, UI or collage.
"""
        prefix = f"soyo-{activity}-apricot"
        prompt_path = ROOT / f"{prefix}-background-prompt-v1.txt"
        if prompt_path.exists() and prompt_path.read_text(encoding="utf-8") != prompt:
            raise ValueError("An existing actual generation prompt must not be overwritten")
        if not prompt_path.exists():
            prompt_path.write_text(prompt, encoding="utf-8")
        generation_path = ROOT / f"{prefix}-background-generation-v1.json"
        if generation_path.exists():
            if read(generation_path)["inputSha256"] != digest(mother):
                raise ValueError("Existing generation belongs to different mother bytes")
            continue
        write(generation_path, {
            "recordType": "built-in-image-generation-source", "operation": "precise-object-edit",
            "input": mother.name, "inputSha256": digest(mother),
            "prompt": f"{prefix}-background-prompt-v1.txt", "promptSha256": digest(ROOT / f"{prefix}-background-prompt-v1.txt"),
            "inputRole": "sole original correct primary-approved mother; remove person, preserve same room",
            "generatedOutput": None, "producerVisualReview": "pending", "primaryReview": "pending"
        })


def register(activity, source):
    prefix = f"soyo-{activity}-apricot"
    target = ROOT / f"{prefix}-background-candidate-v1.png"
    if target.exists():
        raise FileExistsError(target)
    shutil.copyfile(source, target)
    record_path = ROOT / f"{prefix}-background-generation-v1.json"
    record = read(record_path)
    parts = Path(source).parts
    index = next((i for i, p in enumerate(parts) if p == "generated_images"), None)
    record.update({"generatedOutput": target.name, "outputSha256": digest(target), "bytes": target.stat().st_size,
                   "toolDefaultOutput": "/".join(parts[index:]) if index is not None else Path(source).name})
    write(record_path, record)
    print(json.dumps({"output": target.name, "sha256": digest(target)}))


def alpha(activity, parameters):
    config = read(Path(parameters))
    mother_path = ROOT / config["mother"]
    background_path = ROOT / config["background"]
    if digest(mother_path) != config["motherSha256"] or digest(background_path) != config["backgroundSha256"]:
        raise ValueError("Original mother or matching background bytes changed")
    mother = Image.open(mother_path).convert("RGB")
    rgb = np.asarray(mother)
    background = np.asarray(Image.open(background_path).convert("RGB"))
    if mother.size != (1536, 1024) or rgb.shape != background.shape:
        raise ValueError("Inputs must retain the original full canvas")
    region = Image.new("L", mother.size, 0)
    ImageDraw.Draw(region).polygon([tuple(p) for p in config["outerPolygon"]], fill=255)
    inside = np.asarray(region) > 0
    difference = np.max(np.abs(rgb.astype("int16") - background.astype("int16")), axis=2)
    labels = np.full(inside.shape, cv2.GC_BGD, dtype="uint8")
    labels[inside] = cv2.GC_PR_BGD
    labels[inside & (difference > config.get("foregroundDifference", 24))] = cv2.GC_PR_FGD
    labels[inside & (difference < config.get("backgroundDifference", 8))] = cv2.GC_PR_BGD
    for polygon in config.get("foregroundPolygons", []):
        zone = np.zeros(labels.shape, dtype="uint8")
        cv2.fillPoly(zone, [np.asarray(polygon, dtype="int32")], 1)
        labels[zone > 0] = cv2.GC_FGD
    for polygon in config.get("backgroundPolygons", []):
        zone = np.zeros(labels.shape, dtype="uint8")
        cv2.fillPoly(zone, [np.asarray(polygon, dtype="int32")], 1)
        labels[zone > 0] = cv2.GC_BGD
    for x, y in config.get("foregroundPoints", []):
        cv2.circle(labels, (x, y), 2, cv2.GC_FGD, -1)
    for x, y in config.get("backgroundPoints", []):
        cv2.circle(labels, (x, y), 2, cv2.GC_BGD, -1)
    cv2.setRNGSeed(0)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), labels, None,
                np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    visible = np.uint8((labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)) * 255
    out = ROOT / config["output"]
    Image.fromarray(visible, "L").filter(ImageFilter.GaussianBlur(config.get("feather", .35))).save(out)
    write(ROOT / config["record"], {"recordType": "deterministic-original-coordinate-alpha-production",
        "processor": Path(__file__).name, "processorSha256": digest(Path(__file__)),
        "parameters": Path(parameters).name, "parametersSha256": digest(Path(parameters)), "OpenCV": cv2.__version__,
        "mother": mother_path.name, "motherSha256": digest(mother_path),
        "backgroundCue": background_path.name, "backgroundCueSha256": digest(background_path),
        "alpha": out.name, "alphaSha256": digest(out),
        "geometryTransform": "identity", "rgbRepaint": False, "primaryLayerReview": "pending", "runtimeAccepted": False})
    print(json.dumps({"activity": activity, "alpha": out.name}))


def layers(activity, version):
    """Produce chosen alpha/room/shadow layers and scoped visual inspection files."""
    prefix = f"soyo-{activity}-apricot"
    version = int(version)
    params = read(ROOT / f"{prefix}-alpha-parameters-v1.json")
    contact = {
        "reading": [[[1170, 548], [1440, 548], [1440, 634], [1170, 634]], [[1095, 720], [1225, 720], [1225, 780], [1095, 780]]],
        "listening": [[[1190, 530], [1450, 530], [1450, 600], [1190, 600]]],
        "rest": [[[1160, 540], [1445, 540], [1445, 620], [1160, 620]], [[1060, 700], [1230, 700], [1230, 765], [1060, 765]]],
        "play": [[[1125, 560], [1450, 560], [1450, 660], [1125, 660]], [[1045, 755], [1260, 755], [1260, 910], [1045, 910]]],
        "attention": [[[1160, 540], [1455, 540], [1455, 635], [1160, 635]], [[1120, 710], [1290, 710], [1290, 790], [1120, 790]]],
    }[activity]
    config_path = ROOT / f"{prefix}-layer-parameters-v{version}.json"
    if not config_path.exists():
        write(config_path, {"mother": params["mother"], "motherSha256": params["motherSha256"],
            "matte": params["output"], "alphaSource": "luminance", "alphaLow": 3, "alphaHigh": 252,
            "figure": f"{prefix}-figure-calibrated-v{version}.png", "mask": f"{prefix}-mask-calibrated-v{version}.png",
            "backgroundCandidate": params["background"], "background": f"{prefix}-background-calibrated-v{version}.png",
            "backgroundExpandPixels": 4, "backgroundFeatherPixels": 1,
            "backgroundErasePolygons": [params["outerPolygon"]],
            "shadow": f"{prefix}-shadow-calibrated-v{version}.png", "contactShadowPolygons": contact,
            "contactShadowFeatherPixels": 1.2, "contactShadowEdgePixels": 3,
            "record": f"{prefix}-layer-processing-v{version}.json"})
    runpy.run_path(str(ROOT.parent / "extract-scene-layers.py"))["prepare"](config_path)
    config = read(config_path)
    figure = Image.open(ROOT / config["figure"]).convert("RGBA")
    background = Image.open(ROOT / config["background"]).convert("RGBA")
    shadow = Image.open(ROOT / config["shadow"]).convert("RGBA")
    REVIEW.mkdir(parents=True, exist_ok=True)
    for name, color in [("light", (248, 246, 240, 255)), ("dark", (24, 31, 40, 255))]:
        canvas = Image.new("RGBA", figure.size, color)
        canvas.alpha_composite(figure)
        canvas.convert("RGB").save(REVIEW / f"soyo-{activity}-v{version}-{name}.png")
        bounds = figure.getchannel("A").getbbox()
        canvas.crop((max(0, bounds[0]-15), max(0, bounds[1]-15), min(1536, bounds[2]+15), min(1024, bounds[3]+15))).convert("RGB").save(REVIEW / f"soyo-{activity}-v{version}-{name}-detail.png")
    room = background.copy()
    room.alpha_composite(shadow)
    room.alpha_composite(figure)
    room.convert("RGB").save(REVIEW / f"soyo-{activity}-v{version}-room.png")
    background.convert("RGB").save(REVIEW / f"soyo-{activity}-v{version}-empty.png")
    seat, ground = {
        "reading": ((1325, 594), (1170, 758)), "listening": ((1355, 567), (1237, 580)),
        "rest": ((1325, 583), (1165, 744)), "play": ((1325, 614), (1093, 884)),
        "attention": ((1340, 589), (1246, 767))
    }[activity]
    bounds = figure.getchannel("A").getbbox()
    write(ROOT / f"{prefix}.scene.json", {"schemaVersion": 1, "id": f"{prefix}-room4", "character": "soyo", "activity": activity,
        "light": "morning", "palette": "apricot", "width": 1536, "height": 1024,
        "mother": config["mother"], "background": config["background"], "figure": config["figure"], "mask": config["mask"], "shadow": config["shadow"],
        "seat": [seat[0]/1536, seat[1]/1024], "ground": [ground[0]/1536, ground[1]/1024],
        "bodyBounds": [bounds[0]/1536, bounds[1]/1024, bounds[2]/1536, bounds[3]/1024],
        "safeTextBoundary": max(0, (bounds[0]-15)/1536), "support": "window-seat", "contactShadow": {"mode": "separate"},
        "contourComplete": True, "hitPolygon": ", ".join(f"{x/1536*100:.2f}% {y/1024*100:.2f}%" for x,y in params["outerPolygon"]),
        "travel": 0, "slope": 0, "perspective": 0, "production": config["record"],
    "review": {"approvedByPrimary": False, "motherApprovalRecord": "../primary-other-mother-reviews.json", "layerReview": "pending", "runtimeAccepted": False,
            "producerNote": "Original RGB and exact seated/hand/sole contacts retained. Fixed support position (travel 0); no unobserved hidden contour or arbitrary repositioning is promised.",
            "runtimeReviewRecord": "前端视觉创新设计/来源记录/assets-design-generated/2026-10-23-companion-matrix/primary-runtime-reviews.json"}})


def details(activity, version):
    prefix = f"soyo-{activity}-apricot"
    params = read(ROOT / f"{prefix}-alpha-parameters-v1.json")
    regions = {"rest": (1060, 510, 1240, 770), "play": (1100, 570, 1280, 740),
               "listening": (1330, 335, 1430, 490), "attention": (1350, 340, 1430, 490)}
    rect = regions[activity]
    crop = Image.open(ROOT / params["mother"]).convert("RGB").crop(rect).resize(((rect[2]-rect[0])*3, (rect[3]-rect[1])*3))
    draw = ImageDraw.Draw(crop)
    for x in range(rect[0], rect[2], 10):
        xx = (x-rect[0])*3
        draw.line((xx, 0, xx, crop.height), fill=(125, 50, 190), width=1)
        draw.text((xx+1, 0), str(x), fill=(20, 10, 30))
    for y in range(rect[1], rect[3], 10):
        yy = (y-rect[1])*3
        draw.line((0, yy, crop.width, yy), fill=(125, 50, 190), width=1)
        draw.text((1, yy+1), str(y), fill=(20, 10, 30))
    crop.save(REVIEW / f"soyo-{activity}-coordinate-detail.png")


def hair(activity, version):
    prefix = f"soyo-{activity}-apricot"
    scene = read(ROOT / f"{prefix}.scene.json")
    rect = {"play": (1300, 270, 1430, 530), "attention": (1300, 285, 1430, 520), "rest": (1250, 280, 1410, 515)}[activity]
    mother = Image.open(ROOT / scene["mother"]).convert("RGB").crop(rect)
    fg = Image.open(ROOT / scene["figure"]).convert("RGBA").crop(rect)
    matte = Image.new("RGBA", fg.size, (24, 31, 40, 255))
    matte.alpha_composite(fg)
    pair = Image.new("RGB", (mother.width*2, mother.height))
    pair.paste(mother, (0,0)); pair.paste(matte.convert("RGB"), (mother.width,0))
    pair.resize((pair.width*3,pair.height*3)).save(REVIEW / f"soyo-{activity}-hair-source-alpha-pair.png")
    grid = mother.resize((mother.width*4,mother.height*4))
    draw = ImageDraw.Draw(grid)
    for x in range(rect[0],rect[2],10):
        xx=(x-rect[0])*4; draw.line((xx,0,xx,grid.height), fill=(125,50,190), width=1); draw.text((xx+1,0),str(x),fill=(20,10,30))
    for y in range(rect[1],rect[3],10):
        yy=(y-rect[1])*4; draw.line((0,yy,grid.width,yy), fill=(125,50,190), width=1); draw.text((1,yy+1),str(y),fill=(20,10,30))
    grid.save(REVIEW / f"soyo-{activity}-hair-source-grid.png")


def raw_mask(activity, version):
    prefix=f"soyo-{activity}-apricot"
    mother=Image.open(ROOT/f"{prefix}-mother-candidate-v1.png").convert("RGB")
    mask=Image.open(ROOT/f"{prefix}-mask-candidate-v1.png").convert("L")
    figure=mother.convert("RGBA"); figure.putalpha(mask)
    for name,color in [("light",(248,246,240,255)),("dark",(24,31,40,255))]:
        canvas=Image.new("RGBA",mother.size,color); canvas.alpha_composite(figure)
        canvas.convert("RGB").save(REVIEW/f"soyo-{activity}-raw-mask-{name}.png")
        canvas.crop((1050,230,1465,905)).convert("RGB").save(REVIEW/f"soyo-{activity}-raw-mask-{name}-detail.png")


def package():
    """Write a source asset package from the six selected scene references."""
    entries=[]
    for activity in ["reading","planning","listening","rest","play","attention"]:
        scene_path=ROOT/f"soyo-{activity}-apricot.scene.json"
        scene=read(scene_path)
        mother=np.asarray(Image.open(ROOT/scene["mother"]).convert("RGB"))
        figure=np.asarray(Image.open(ROOT/scene["figure"]).convert("RGB"))
        entries.append({"activity":activity,"scene":scene_path.name,"sceneSha256":digest(scene_path),
            "layers":[{"role":role,"file":scene[role],"sha256":digest(ROOT/scene[role]),
                       "bytes":(ROOT/scene[role]).stat().st_size,"canvas":list(Image.open(ROOT/scene[role]).size)}
                      for role in ["mother","background","figure","mask","shadow"]],
            "rgbChangedPixels":int(np.any(mother!=figure,axis=2).sum()),
            "motherRgbPayloadSha256":hashlib.sha256(mother.tobytes()).hexdigest(),
            "figureRgbPayloadSha256":hashlib.sha256(figure.tobytes()).hexdigest(),
            "support":scene["support"],"seat":scene["seat"],"ground":scene["ground"],"bodyBounds":scene["bodyBounds"],
            "safeTextBoundary":scene["safeTextBoundary"],"travel":scene["travel"],"production":scene["production"],
            "layerReview":"pending primary review","runtimeAccepted":False})
    write(ROOT/"soyo-warm-layer-package.json",{"recordType":"original-scene-layer-asset-package",
        "character":"soyo","palette":"apricot","activities":[e["activity"] for e in entries],
        "producer":"soyo_warm_layers","method":"Original full-canvas RGB payload plus calibrated alpha; same-mother generated clean background only inside original person/cast-shadow patch.",
        "stage":"source candidates for primary review; not runtime registration", "entries":entries})
    print(json.dumps([{ "activity":e["activity"],"rgbChangedPixels":e["rgbChangedPixels"],"scene":e["scene"],"support":e["support"]} for e in entries]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["prepare", "register", "alpha", "layers", "details", "hair", "raw-mask", "package"])
    parser.add_argument("activity", nargs="?")
    parser.add_argument("file", nargs="?")
    args = parser.parse_args()
    if args.operation == "prepare": prepare()
    elif args.operation == "register": register(args.activity, args.file)
    elif args.operation == "alpha": alpha(args.activity, args.file)
    elif args.operation == "layers": layers(args.activity, args.file)
    elif args.operation == "details": details(args.activity, args.file)
    elif args.operation == "hair": hair(args.activity, args.file)
    elif args.operation == "raw-mask": raw_mask(args.activity, args.file)
    else: package()
