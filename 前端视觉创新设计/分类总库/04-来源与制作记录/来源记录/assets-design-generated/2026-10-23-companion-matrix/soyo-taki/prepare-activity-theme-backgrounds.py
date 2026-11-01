"""Prepare per-cell extraction prompts without generating or approving images.

Execution must still obtain exact-current mother/prompt Primary permission.
Existing submitted prompts and generation records are never overwritten.
"""
import hashlib
import json
from pathlib import Path


root = Path(__file__).resolve().parent
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
index = json.loads((root / "mother-candidates-all-themes-index.json").read_text(encoding="utf-8"))
props = {
    ("soyo", "study"): "Keep the original flat desktop paper/book pages and all real chair parts. Remove anything truly held in her hand with her; do not remove the stationary desktop content.",
    ("soyo", "reading"): "Remove the OPEN BOOK genuinely supported by her hands/lap with the character. Keep the separate original closed desk book, cup and lamp in the room.",
    ("soyo", "planning"): "Keep the original real desk chair, flat desktop sheets and their actual table contact; her pointing hand disappears but the room-owned flat paper remains. Preserve the actual chair position pulled left in this scene, not another activity's bench layout.",
    ("soyo", "listening"): "Keep BOTH EMPTY REMOVED BROWN LOAFERS on the floor exactly where the scene already places them, including their own shoe shadows. Only the socked raised feet and character disappear. Do not remove, relocate or duplicate these two empty room-owned shoes.",
    ("soyo", "rest"): "There is no held prop to keep or invent. Preserve the original pillow, linen seat and throw as stationary room objects.",
    ("soyo", "play"): "Remove the small PAPER BOOKMARK truly held by her presenting hand together with its actual attached tassel if present. Keep all original desk objects. Do not leave the held paper floating alone. The rain mother is its own freshly generated correct pose; do not substitute another palette's person footprint.",
    ("soyo", "attention"): "Keep the small IVORY FOLDED CARD on the DESKTOP as stationary room property. Remove only her actual body and its own shadows; do not remove or relocate that desk card.",
    ("taki", "study"): "Remove the genuinely HAND-HELD PENCIL with her hand. Keep the flat paper/page, table contents and every real chair part, preserving actual furniture occlusion rather than changing the chair shape.",
    ("taki", "reading"): "Remove the UPRIGHT OPEN BOOK held by her hands with the character. Preserve the actual right desk CHAIR and all visible chair-back/legs at their exact original positions. Keep the separate stationary closed desk book/cup/lamp.",
    ("taki", "planning"): "Remove her HAND-HELD PENCIL; keep the OPEN NOTEBOOK lying FLAT on the DESKTOP and the original real turned chair. Her page-steadying fingers disappear while the room-owned notebook remains supported on the table.",
    ("taki", "listening"): "Keep EXACTLY ONE EMPTY REMOVED BROWN LOAFER on the floor in its original position and its own shoe shadow. Her raised SOCKED foot and her other WORN loafer leave with her. Do not erase the empty shoe or leave the worn one as a second empty shoe.",
    ("taki", "rest"): "No held prop is present. Preserve the original window-seat, pillow/throw and desk/chair as stationary room objects.",
    ("taki", "play"): "Remove BOTH genuinely HAND-HELD DRUMSTICKS with her hands. Keep the PRACTICE PAD supported on the desktop and all original closed desk books, cup, lamp and actual chair parts. Never leave a floating stick or remove the stationary pad.",
    ("taki", "attention"): "Remove her HAND-HELD PENCIL only. Keep the flat DESKTOP SHEET and the IVORY FOLDED CARD supported on the BENCH as room property; they are separate original room objects. Preserve the actual right desk geometry and turned chair.",
}
jobs = []
for entry in index["entries"]:
    character, activity, palette = (entry[key] for key in ("character", "activity", "palette"))
    if activity == "chat" or palette == "apricot":
        continue
    stem = f"{character}-{activity}-{palette}"
    prompt_path = root / f"{stem}-background-prompt-v1.txt"
    source_path = root / f"{stem}-background-generation-v1.json"
    if not prompt_path.exists():
        prompt_path.write_text(f"""Use case: precise-object-edit.
Asset type: original-scene clean background, 1536 x 1024. Image1 is the ONLY input and exact editable target: the correct complete {character} {activity} {palette} mother. Primary extraction permission is checked against its exact current bytes before this edit is executed.
Remove only the original character's visible hair, face, body, clothes, hands, legs, socks and actually WORN shoes, plus that person's own local contact/cast shadows. Reconstruct only the room genuinely hidden by the person. No character, hair wisp, limb/cloth smear, shoe ghost, body-shaped shadow, outlined silhouette or replacement person remains.
OWNERSHIP SPECIFIC TO THIS SCENE: {props[(character, activity)]}
Retain the same full canvas, camera, distant scale, room geometry and natural physical lighting. Every visible window corner, curtain, mullion, sill, landscape/skyline, right desk, chair, lamp, cup, stationary books/paper, window-seat, cushion/pillows/throw, floorboards and rug stays exactly where the input places it. Visible original objects must not be substituted from another activity or a generic empty-room template.
Keep {palette}'s exact time, weather, lake/city depth and light direction. For violet, keep the original single sunset disk and its reflection at their current pixel coordinates, without shifting the window/seat. For rain, keep the actual quiet night skyline, rain glass and single right desk-lamp illumination; do not create a new left spotlight, daylight window shadow, global color wash or daylight/normal split. Clothing is removed, not used to tint the room.
No resize, zoom, crop, rotate, perspective warp, furniture move or added person/object, text/UI/grid/arrow/watermark. This produces only the matching clean ROOM layer. Original person RGB will be extracted separately at identity coordinates; do not repaint or correct body anatomy here.
""", encoding="utf-8")
    jobs.append({"character": character, "activity": activity, "palette": palette,
                 "layer": "background", "mother": entry["mother"], "motherSha256": sha(root / entry["mother"]),
                 "prompt": prompt_path.name, "promptSha256": sha(prompt_path),
                 "output": f"{stem}-background-generated-v1.png", "source": source_path.name,
                 "primaryExactMotherPermissionRequiredAtExecution": True,
                 "alreadyGenerated": source_path.exists()})
(root / "activity-theme-background-jobs.json").write_text(json.dumps(jobs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"preparedActivityThemeBackgroundPrompts": len(jobs), "modelCalls": 0}))
