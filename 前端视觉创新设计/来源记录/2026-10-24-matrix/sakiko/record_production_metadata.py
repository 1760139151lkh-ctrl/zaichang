"""Record provenance bytes for this production pass; never edits image pixels."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json

from PIL import Image

OWN = Path(__file__).resolve().parent
DESIGN = OWN.parents[2]
LEGACY = DESIGN / "来源记录/assets-design-generated/2026-10-23-companion-matrix"
GENERATED = Path.home() / ".codex/generated_images"
THREAD = "01a16fb4-beb3-75e2-8677-73edb8072aa0"
NOW = datetime.now(timezone.utc).isoformat()


def write(name, value):
    (OWN / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def image_bytes(path):
    with Image.open(path) as im:
        return {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "width": im.width, "height": im.height, "mode": im.mode}


def prompt_bytes(name):
    return {"file": name, "sha256": hashlib.sha256((OWN / name).read_bytes()).hexdigest(),
            "submission": "UTF-8 file contents with leading/trailing whitespace trimmed"}


outputs = [
    ("background-v1", "33070c99-0e1c-4c64-85dd-92cd49abaa74", "sakiko-resume-apricot-background-v1.png", "candidate", "Root viewed background structure as a usable candidate; layers remain unaccepted."),
    ("figure-v1", "a189a55e-d686-4297-8aae-e742f2a109f1", "sakiko-resume-apricot-figure-v1-rejected.png", "rejected", "Figure enlarged and moved upward; broad luminous alpha halo."),
    ("figure-v2", "fed342d8-e73d-4164-b09e-ec5b8f787a36", None, "rejected", "Explicit landmarks still yielded enlarged figure and broad luminous alpha halo."),
    ("mask-v1", "61108110-bfa9-4f32-8282-5f86d0dfab0f", "sakiko-resume-apricot-mask-v1.png", "candidate", "Opaque grayscale silhouette retained source coordinates; viewed with original RGB on light/dark/room. No contact-shadow fringe."),
    ("mask-v2", "3fe5381e-4044-4025-9b8d-d7e6d32ef529", "sakiko-resume-apricot-mask-v2.png", "rejected", "Primary rejected pale cushion strip beneath skirt/palm and wide grey shoe fringes in actual dark-ground rendering."),
    ("figure-v3", "db5df652-30dc-4ed8-8031-80ffea5c1672", None, "rejected", "Using mask as edit target preserved approximate scale, but broad luminous alpha halo remained; not used."),
    ("shadow-v1", "d6088ee3-00b6-4d4f-83fa-78d1deebcf06", "sakiko-resume-apricot-shadow-v1.png", "rejected", "Actual browser composite showed seat/palm shadows shifted upward and shoe shadows offset; not registered."),
    ("shadow-mask-v1", "785da272-03fa-4130-8f1a-d7b4729ea7a9", "sakiko-resume-apricot-shadow-mask-v1-rejected.png", "rejected", "Opaque shadow-only map still shifted the upper contact zone; not used. Existing figure mask v2 is being considered only as a dark shadow mask below clean figure mask v1."),
]
artifacts = []
for kind, execution, local, status, note in outputs:
    original = GENERATED / THREAD / f"exec-{execution}.png"
    data = image_bytes(OWN / local if local else original)
    artifacts.append({"kind": kind, "tool": "image_gen.imagegen", "mode": "built-in",
                      "executionId": execution,
                      "sourceOutput": f"generated_images/{THREAD}/exec-{execution}.png",
                      "projectFile": local, "bytes": data,
                      "prompt": prompt_bytes(f"sakiko-resume-apricot-{kind}-prompt.txt"),
                      "inputs": ([{"file": "sakiko-resume-apricot-mother-v1.png", "role": "source of contact geometry"},
                                  {"file": "sakiko-resume-apricot-mask-v1.png", "role": "registered silhouette coordinate guide"}]
                                 if kind == "shadow-mask-v1" else
                                 [{"file": "sakiko-resume-apricot-mask-v1.png", "role": "technical mask edit target"},
                                  {"file": "sakiko-resume-apricot-mother-v1.png", "role": "original RGB and registration guide"}]
                                 if kind in ["mask-v2", "figure-v3"] else
                                 [{"file": "sakiko-resume-apricot-mother-v1.png", "role": "sole approved full-scene edit target"}]),
                      "transparentBackground": kind.startswith("figure") or kind == "shadow-v1",
                      "status": status, "producerPersonallyViewed": True,
                      "approvedByPrimary": False, "runtimeAccepted": False, "observation": note})
write("resume-layer-production.json", {"schemaVersion": 1, "recordedAtUtc": NOW,
      "scope": "ImageGen outputs and actual observations; no image pixels edited by this script",
      "sourceMother": "sakiko-resume-apricot-mother-v1.png", "artifacts": artifacts})

for theme, plate, execution in [
    ("mist", "room-mist-candidate.png", "143c676c-43b9-46d0-9ba8-f529369765cf"),
    ("violet", "room-violet-candidate.png", "e626969b-5418-44f9-8279-0d197ac028c8"),
    ("rain", "room-rain-candidate-v2.png", "a390b34a-abad-40c5-9517-cc18573abc08"),
]:
    mother = f"sakiko-resume-{theme}-mother-v1.png"
    write(f"sakiko-resume-{theme}-v1-source.json", {
        "schemaVersion": 1, "character": "sakiko", "activity": "resume", "sceneCategory": "S9_RESUME",
        "palette": theme, "light": "night" if theme == "rain" else "dusk" if theme == "violet" else "morning",
        "tool": "image_gen.imagegen", "mode": "built-in", "recordedAtUtc": NOW,
        "promptFile": f"sakiko-resume-{theme}-v1-prompt.txt",
        "prompt": f"sakiko-resume-{theme}-v1-prompt.txt",
        "promptFileSha256": prompt_bytes(f"sakiko-resume-{theme}-v1-prompt.txt")["sha256"],
        "promptSha256": prompt_bytes(f"sakiko-resume-{theme}-v1-prompt.txt")["sha256"],
        "submittedPrompt": "UTF-8 file contents with leading/trailing whitespace trimmed",
        "width": 1536, "height": 1024,
        "inputs": [{"path": f"前端视觉创新设计/来源记录/assets-design-generated/2026-10-23-companion-matrix/{plate}",
                    "file": plate,
                    "role": "sole clean empty theme room; identity and pose supplied as text", **image_bytes(LEGACY / plate)}],
        "output": {"file": mother, "executionId": execution,
                   "sourceOutput": f"generated_images/{THREAD}/exec-{execution}.png", **image_bytes(OWN / mother)},
        "producerPersonallyViewed": True, "motherApprovedByPrimary": False,
        "approvedByPrimary": False, "runtimeAccepted": False,
        "status": "complete-mother-awaiting-primary-review-and-same-canvas-layers",
        "observation": "Youthful identity, real cushion/hip and complete knees/shoes, restrained lifted gaze; light matches the corresponding whole-room plate. No layers or runtime admission implied."
    })

source_path = OWN / "sakiko-resume-apricot-v1-source.json"
source = json.loads(source_path.read_text(encoding="utf-8"))
if not any(a.get("executionId") == "8bf66064-0f04-4221-82c3-4be216a2eeaf" for a in source["attempts"]):
    source["attempts"].append({"recordedAtUtc": NOW, "status": "successful-image-output",
                              "performedBy": "root", "tool": "image_gen.imagegen",
                              "executionId": "8bf66064-0f04-4221-82c3-4be216a2eeaf",
                              "sourceOutput": source["output"]["sourceOutput"],
                              "outputFile": source["output"]["file"],
                              "sha256": source["output"]["sha256"],
                              "note": "Recording time, not asserted generation time. Root retried the same full saved prompt after routing repair; first 404 remains independent."})
write(source_path.name, source)

bundles = []
for theme in ["mist", "violet", "rain"]:
    scene_name = f"sakiko-chat-{theme}.scene.json"
    scene = json.loads((LEGACY / scene_name).read_text(encoding="utf-8"))
    files = [{"role": role,
              "path": f"前端视觉创新设计/来源记录/assets-design-generated/2026-10-23-companion-matrix/{scene[role]}",
              **image_bytes(LEGACY / scene[role])} for role in ["mother", "background", "figure", "mask", "shadow"]]
    original_source = json.loads((LEGACY / f"sakiko-chat-{theme}-v1-source.json").read_text(encoding="utf-8"))
    bundles.append({"character": "sakiko", "activity": "chat", "palette": theme,
                    "existingScene": f"前端视觉创新设计/来源记录/assets-design-generated/2026-10-23-companion-matrix/{scene_name}",
                    "producerPersonallyViewed": True, "approvedByPrimary": False, "runtimeAccepted": False,
                    "promptFullyRead": True, "actualPromptSha256": hashlib.sha256((LEGACY / original_source["prompt"]).read_bytes()).hexdigest(),
                    "sourceRecordedPromptSha256": original_source["promptSha256"], "files": files})
write("existing-chat-layer-bundles.json", {"schemaVersion": 1, "recordedAtUtc": NOW,
      "scope": "unchanged existing files; candidate bundles only", "bundles": bundles})
print("Recorded 8 layer attempts, 3 theme mother sources, successful apricot retry, and 3 existing chat bundles.")
