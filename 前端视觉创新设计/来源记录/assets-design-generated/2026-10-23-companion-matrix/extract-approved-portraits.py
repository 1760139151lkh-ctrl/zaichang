"""Produce identity portraits from the primary-approved original scene RGB.

Production only: no tests, UI setup, runtime data or model requests.
Run from any directory with Pillow installed.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image


root = Path(__file__).resolve().parent
parameter_path = root / "portrait-crops.json"
parameters = json.loads(parameter_path.read_text(encoding="utf-8"))
output = (root / parameters["outputDirectory"]).resolve()
output.mkdir(parents=True, exist_ok=True)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
entries = []
for entry in parameters["entries"]:
    mother = root / entry["mother"]
    approval = json.loads((root / entry["approvalRecord"]).read_text(encoding="utf-8"))
    admitted = next((item for item in approval["entries"] if item["file"] == entry["mother"]
                     and item.get("approvedForExtraction") is True), None)
    if admitted is None or admitted.get("sha256") != sha(mother):
        raise ValueError(f"{entry['character']}: current mother bytes lack matching primary extraction approval.")
    source = Image.open(mother).convert("RGB")
    crop = source.crop(tuple(entry["crop"]))
    target = output / f"{entry['character']}-portrait.png"
    crop.save(target)
    entries.append({**entry, "motherSha256": sha(mother), "output": str(target.relative_to(root.parents[2])).replace("\\", "/"),
                    "outputSha256": sha(target), "width": crop.width, "height": crop.height,
                    "pixelMethod": "Exact original RGB crop; no resize or repaint.",
                    "review": {"primaryPortraitReview": "pending", "integratedVisualReview": "pending"}})
record = {"recordType": "original-scene-portrait-production", "processor": Path(__file__).name,
          "processorSha256": sha(Path(__file__)), "parameters": parameter_path.name,
          "parametersSha256": sha(parameter_path), "entries": entries,
          "scope": parameters["scope"], "doesNotGrantStageAcceptance": True}
(root / "portrait-production.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"portraits": len(entries), "source": "matching primary-approved original mothers", "stageAcceptance": False}))
