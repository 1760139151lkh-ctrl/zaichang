"""Produce a registered alpha patch from visible original wool fringe pixels.

Only this inspected wooden-bench ROI is used. No body pixels are drawn,
recolored, moved or completed; the room is separated by original RGB contrast.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent
MOTHER = ROOT / "umiri-listening-apricot-mother-candidate-v1.png"
SHA = "14542cd757d285f6c2d89e98466e2e2bac75d2601aa0fe61d768996ae679b171"
REGION = (1194, 609, 1237, 652)

if hashlib.sha256(MOTHER.read_bytes()).hexdigest() != SHA:
    raise ValueError("Approved source bytes changed; inspect before producing a matte.")
mother = Image.open(MOTHER).convert("RGB")
rgb = np.asarray(mother.crop(REGION), dtype=np.float32)
blue = np.clip((rgb[:, :, 2] - 82) / 32, 0, 1)
green = np.clip((rgb[:, :, 1] - 118) / 30, 0, 1)
coverage = np.rint(np.minimum(blue, green) * 255).astype(np.uint8)
alpha = Image.new("L", mother.size, 0)
alpha.paste(Image.fromarray(coverage), REGION[:2])
matte = Image.new("RGBA", mother.size, (255, 255, 255, 0))
matte.putalpha(alpha)
output = ROOT / "umiri-listening-apricot-fringe-alpha-v1.png"
matte.save(output)
record = {
    "recordType": "original-pixel-local-alpha-production",
    "mother": MOTHER.name,
    "motherSha256": SHA,
    "region": REGION,
    "method": "min(clamp((B-82)/32), clamp((G-118)/30)); only observed beige wool against darker wooden bench below cushion",
    "scope": "Visible original lower knit fringes only; not applied to skin, hair, clothing body or hidden anatomy.",
    "processor": Path(__file__).name,
    "processorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "output": {"file": output.name, "sha256": hashlib.sha256(output.read_bytes()).hexdigest()},
    "review": "Candidate alpha patch; original RGB extraction and light/dark/source-room review remain separate.",
}
(ROOT / "umiri-listening-apricot-fringe-alpha-v1.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record))
