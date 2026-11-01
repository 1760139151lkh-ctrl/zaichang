"""Produce the two fixed-desk study layers from their approved source mothers.

Usage: python study-cast-shadow-production.py anon|rana
Only explicit original-coordinate body-shadow/contact regions use each mother's
generated empty background. Figure RGB and the remaining room stay original.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json

ROOT = Path(__file__).resolve().parent
SETTINGS = {
    "anon": {
        "base": "anon-study-apricot-layer-parameters-v2.json", "version": 3,
        "shadowRegions": [
            [[880,508],[973,507],[1000,525],[998,543],[882,538]],
            [[886,537],[1054,541],[1052,651],[904,639],[904,586],[886,585]],
            [[795,582],[902,580],[905,607],[787,603]],
            [[912,711],[1037,703],[1046,731],[1070,748],[930,765],[910,744]],
        ],
    },
    "rana": {
        "base": "rana-study-apricot-layer-parameters-v1.json", "version": 2,
        "shadowRegions": [
            [[883,503],[1003,503],[1009,534],[891,540]],
            [[835,569],[956,570],[958,601],[835,596]],
            [[898,705],[1030,699],[1041,731],[1041,753],[902,756],[890,735]],
        ],
    },
}


def produce(character):
    settings = SETTINGS[character]
    parameters = json.loads((ROOT / settings["base"]).read_text(encoding="utf-8"))
    version = settings["version"]
    stem = f"{character}-study-apricot"
    # Figure/mask are byte-identical to the reviewed starting layers. Keep those
    # canonical files instead of publishing duplicate PNGs under a new version.
    for key, suffix in (("background", "background"),):
        parameters[key] = f"{stem}-{suffix}-calibrated-v{version}.png"
    parameters["record"] = f"{stem}-layer-processing-v{version}.json"
    parameters["shadow"] = f"{stem}-shadow-calibrated-v{version}.png"
    parameters["backgroundErasePolygons"] = settings["shadowRegions"]
    parameters["contactShadowPolygons"] = settings["shadowRegions"]
    parameters["contactShadowFeatherPixels"] = 1.2
    parameters["backgroundExpandPixels"] = 3
    parameters["backgroundFeatherPixels"] = 1.5
    parameters["reviewNote"] = (
        "Fixed desk, zero travel. Original character RGB/alpha contract retained. "
        "Explicit observed desk/wall/seat/boot cast-shadow regions use this mother's "
        "generated clean room; original residual darkness/colour is a separate normal "
        "source-over RGBA layer, not a copied wall/floor image or multiply rectangle. "
        "Primary image and actual runtime review remain pending."
    )
    parameter_path = ROOT / f"{stem}-layer-parameters-v{version}.json"
    parameter_path.write_text(json.dumps(parameters, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    processor_path = ROOT.parent / "extract-scene-layers.py"
    spec = importlib.util.spec_from_file_location("extract_scene_layers", processor_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.prepare(parameter_path)
    record_path = ROOT / parameters["record"]
    record = json.loads(record_path.read_text(encoding="utf-8"))
    record["castShadowProduction"] = {
        "processor": Path(__file__).name,
        "processorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "baseParameters": settings["base"],
        "regions": settings["shadowRegions"],
        "identity": "Original desk, wall, seat and boot shadow residuals only inside explicit source-coordinate ROIs; figure pixels excluded.",
        "motion": "travel=0; original desk/hand/chair/foot relation only; no free translation claim",
    }
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("character", choices=SETTINGS)
    produce(parser.parse_args().character)
