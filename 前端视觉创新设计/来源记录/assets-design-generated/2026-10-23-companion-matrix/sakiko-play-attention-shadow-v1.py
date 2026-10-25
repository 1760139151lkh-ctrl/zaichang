"""Extract source-pair contact residuals for two approved mothers only.

This is asset preparation, not a test runner. It paints no shadow color: the
RGBA residual is solved from the original mother and its matching empty BG,
inside separately inspected shoe/seat/palm contact domains. Body and figure
RGB are never changed. Both output canvases remain 1536 x 1024.
"""
from pathlib import Path
import hashlib
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, __version__ as pillow_version


ROOT = Path(__file__).resolve().parent
ITEMS = [
    {
        "activity": "play",
        "mother": "../../../运行素材/companion/scenes/sakiko-play-apricot-v4-mother.png",
        "background": "../../../运行素材/companion/scenes/sakiko-play-apricot-v4-background.png",
        "figure": "../../../运行素材/companion/scenes/sakiko-play-apricot-v4-figure.png",
        "contacts": {
            "frontShoeFloor": [(1090, 827), (1123, 826), (1165, 835), (1173, 845), (1160, 856), (1121, 858), (1084, 848)],
            "rearShoeFloor": [(1190, 794), (1210, 790), (1258, 799), (1273, 809), (1270, 819), (1235, 825), (1191, 816)],
            "hipCushion": [(1144, 585), (1200, 580), (1300, 594), (1364, 594), (1366, 611), (1295, 619), (1180, 607), (1140, 598)],
            "palmCushion": [(1353, 582), (1435, 585), (1446, 600), (1405, 608), (1355, 601)],
        },
    },
    {
        "activity": "attention",
        "mother": "../../../运行素材/companion/scenes/sakiko-attention-apricot-v4-mother.png",
        "background": "../../../运行素材/companion/scenes/sakiko-attention-apricot-v4-background.png",
        "figure": "../../../运行素材/companion/scenes/sakiko-attention-apricot-v4-figure.png",
        "contacts": {
            "leftShoeFloor": [(1122, 754), (1148, 751), (1184, 758), (1196, 769), (1178, 780), (1138, 779), (1118, 769)],
            "rightShoeFloor": [(1178, 771), (1210, 767), (1258, 774), (1275, 784), (1265, 800), (1218, 802), (1181, 790)],
            "hipCushion": [(1175, 572), (1210, 566), (1350, 583), (1380, 591), (1380, 607), (1310, 618), (1190, 599)],
            "palmCushion": [(1370, 570), (1445, 570), (1455, 588), (1415, 598), (1375, 589)],
        },
    },
]
FEATHER_PIXELS = 1.2
MAX_OPACITY = 0.82


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


records = []
for item in ITEMS:
    mother_path, background_path, figure_path = [ROOT / item[key] for key in ("mother", "background", "figure")]
    mother = Image.open(mother_path).convert("RGB")
    background = Image.open(background_path).convert("RGB")
    figure = Image.open(figure_path).convert("RGBA")
    if mother.size != background.size or mother.size != figure.size:
        raise ValueError("All source-pair layers must already share the original canvas.")
    selected = Image.new("L", mother.size, 0)
    draw = ImageDraw.Draw(selected)
    for polygon in item["contacts"].values():
        draw.polygon(polygon, fill=255)
    coverage = np.asarray(selected.filter(ImageFilter.GaussianBlur(FEATHER_PIXELS)), dtype=np.float32) / 255
    m = np.asarray(mother, dtype=np.float32)
    b = np.asarray(background, dtype=np.float32)
    body_alpha = np.asarray(figure.getchannel("A"), dtype=np.float32) / 255
    measured_darkening = np.clip(np.max((b - m) / np.maximum(b, 1), axis=2), 0, MAX_OPACITY)
    alpha = measured_darkening * coverage * (1 - body_alpha)
    alpha_bytes = np.rint(alpha * 255).astype(np.uint8)
    actual_alpha = alpha_bytes.astype(np.float32) / 255
    color = np.clip((m - b * (1 - actual_alpha[:, :, None])) / np.maximum(actual_alpha[:, :, None], 0.001), 0, 255)
    rgba = np.dstack((np.rint(color).astype(np.uint8), alpha_bytes))
    rgba[alpha_bytes == 0] = 0
    output_path = ROOT.parents[2] / "运行素材/companion/scenes" / f"sakiko-{item['activity']}-apricot-v4-shadow.png"
    Image.fromarray(rgba).save(output_path)
    record = {
        "activity": item["activity"],
        "inputs": [{"file": os.path.relpath(path, ROOT).replace("\\", "/"), "sha256": sha(path)} for path in (mother_path, background_path, figure_path)],
        "registration": "identity on original full canvas; matching room/camera manually compared; no body or image transform",
        "contactPolygons": item["contacts"],
        "formula": "A=clamp(maxChannels((B-M)/max(B,1)),0,.82)*localSourceContact*(1-figureAlpha); C=clip((M-B*(1-A))/A,0,255)",
        "rgbaMeaning": "normal source-over source-pair residual, not multiply or a painted black ellipse",
        "featherPixels": FEATHER_PIXELS,
        "maxOpacity": MAX_OPACITY,
        "nonzeroAlphaPixels": int(np.count_nonzero(alpha_bytes)),
        "alphaBounds": Image.fromarray(alpha_bytes).getbbox(),
        "output": {"file": os.path.relpath(output_path, ROOT).replace("\\", "/"), "sha256": sha(output_path), "bytes": output_path.stat().st_size},
        "review": "candidate only; light/dark and matching-background endpoints need actual review; no primary/runtime signature",
    }
    records.append(record)

result = {
    "recordType": "deterministic-original-contact-shadow-extraction",
    "authorization": "Explicit user permission for precise same-scene layering; only measured source-pair residuals, no body/face/pose repaint.",
    "script": Path(__file__).name,
    "scriptSha256": sha(Path(__file__)),
    "methodReference": "uika-umiri/uika-chat-apricot-calibrate-v1.py source-pair residual method; no borrowed contact coordinates",
    "canvas": [1536, 1024],
    "libraries": {"Pillow": pillow_version, "numpy": np.__version__},
    "renderOrder": "matching full generated BG, transformed shadow, same transformed original-RGB RGBA figure",
    "items": records,
}
(ROOT / "sakiko-play-attention-shadow-calibration-v1.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(records, indent=2))
