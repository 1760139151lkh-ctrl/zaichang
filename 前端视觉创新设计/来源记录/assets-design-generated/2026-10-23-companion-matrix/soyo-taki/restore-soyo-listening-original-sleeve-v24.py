"""Restore original opaque sleeve highlight/cuff pixels cut by the raw matte.

The polygons stay inside the visually inspected real sleeve/cuff contour.
Only alpha is restored; no color, contour, anatomy or hidden body is repainted.
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
config = json.loads((root / "soyo-listening-apricot-layer-parameters-v23.json").read_text(encoding="utf-8"))
config["matte"] = "soyo-listening-apricot-mask-calibrated-v23.png"
config["alphaSource"] = "alpha"
for key in ("figure", "mask", "background", "shadow", "record"):
    config[key] = config[key].replace("-v23.", "-v24.")
config["includePolygons"] = [
    [(1385, 500), (1392, 500), (1394, 505), (1395, 510), (1397, 514),
     (1400, 518), (1402, 522), (1402, 530), (1400, 536), (1397, 539),
     (1398, 544), (1401, 549), (1402, 556), (1396, 559), (1387, 561),
     (1384, 561), (1383, 556), (1382, 551), (1381, 546), (1378, 542),
     (1382, 535), (1385, 528)],
    [(1379, 542), (1382, 544), (1384, 548), (1384, 560), (1382, 558), (1381, 550)],
]
config["reviewNote"] = "Original v23 hair alpha retained. Explicit inside-contour sleeve/cuff polygons restore the actual warm cloth highlights accidentally made transparent by raw generated matte. No RGB change, no hidden contour completion. Primary/runtime pending."
(root / "soyo-listening-apricot-layer-parameters-v24.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("soyo-listening-apricot-layer-parameters-v24.json")
