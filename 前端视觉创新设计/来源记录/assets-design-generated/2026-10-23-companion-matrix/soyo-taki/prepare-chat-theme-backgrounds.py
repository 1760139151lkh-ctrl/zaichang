"""Prepare exact-source background extraction prompts for approved chat gates."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
gates = json.loads((root / "chat-theme-gates-index.json").read_text(encoding="utf-8"))["entries"]
jobs = []
for entry in gates:
    character, theme = entry["character"], entry["theme"]
    stem = f"{character}-chat-{theme}"
    prompt_path = root / f"{stem}-background-prompt-v1.txt"
    prompt = f"""Use case: precise-object-edit.
Asset type: exact same-canvas clean background from this primary-reviewed correct complete {character} chat {theme} mother. Image1 is the ONLY input and exact editable target, full1536x1024.
Remove only the original visible character, hair, clothes, hands, legs, socks and both WORN shoes, plus their local contact/cast shadows. Reconstruct the room genuinely hidden by the person. Keep the original bench cushion, bench front, pillow/throw, floorboards and floor/rug boundary in the exact original perspective and position. No remaining hair strand, body/cloth/shoe ghost, shadow footprint, brown limb streak or fake painted outline.
Preserve all existing visible room geometry, camera and physical lighting: every window corner, curtain/muntin/sill, right desk/chair/lamp/cup/book and rear-left small table/shelves/flowers/art. In violet keep the exact original sunset disk and lake-column coordinates; in rain retain the exact quiet night skyline and natural single right desk-lamp lighting, no new independent left spotlight or daytime shadow. Do not move any furniture or skyline, crop/zoom/rotate/resize, change the time/weather, replace the occupied scene with a generic room, add a person/object/UI/text/line/grid/watermark or apply a uniform filter.
This is only the clean room layer of the already-correct full scene. The original person will later be extracted from original RGB at identity transform; do not draw a replacement person or alter anatomy.
"""
    if prompt_path.exists():
        raise ValueError(f"Refusing to overwrite a submitted layer prompt: {prompt_path.name}")
    prompt_path.write_text(prompt, encoding="utf-8")
    jobs.append({"character": character, "activity": "chat", "palette": theme,
                 "layer": "background", "mother": entry["file"], "motherSha256": entry["sha256"],
                 "prompt": prompt_path.name, "output": f"{stem}-background-generated-v1.png",
                 "source": f"{stem}-background-generation-v1.json"})
(root / "chat-theme-background-jobs.json").write_text(json.dumps(jobs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"preparedBackgroundPrompts": len(jobs), "modelCalls": 0}))
