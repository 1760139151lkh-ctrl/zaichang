"""Prepare distinct complete-scene lighting prompts; makes no model/API calls."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
index = json.loads((root / "mother-candidates-index.json").read_text(encoding="utf-8"))
mothers = {(character["id"], item["activity"]): item for character in index["characters"] for item in character["mothers"]}
identity = {}
for character in ("soyo", "taki"):
    text = (root / f"{character}-chat-violet-prompt.txt").read_text(encoding="utf-8")
    identity[character] = text[text.index("Character:"):text.index("Lock the CHAT")].strip()
activities = {
    ("soyo", "study"): "Soyo remains in the original side/back desk-chair working pose, body inclined toward the same paper, actual forearm/hand contact on the desktop and original supported seat. Keep the precise visible hair, collar, skirt, leg and shoe contours and every real chair-back/front-leg occlusion; do not invent or expose a hidden far hand or shin. This fixed writing/contact pose is distinct from her reclined bench reading.",
    ("taki", "study"): "Taki remains in the original focused side/back writing posture at her real desk chair, eyes on the pencil point and same page, with actual hands/forearms supported by the desk. Keep her tan uniform/red ribbon and the exact original visible skirt, knees, socks and shoes. Preserve every real chair-back/front-leg occlusion, never complete a hidden far limb. This fixed forward writing pose is distinct from her upright book-reading pose.",
    ("soyo", "planning"): "Soyo sits on the actual pulled-out desk chair LEFT of the original right working desk, one finger pointing to the supported paper and the other hand resting low on her knee. Keep this original chair and its unusually far-left placement, both complete floor loafers, supported hips and turned planning attention exactly as in image1. The desk and lamp stay fixed. Do not move her back onto the bench or shrink her independently to make a standard right-side slot.",
    ("soyo", "reading"): "Soyo is genuinely reclined against the right bench cushion, pelvis and both knees/legs angled left, eyes down on the open book supported by her lap and both hands. Keep her precise book grip, modest skirt, both complete floor loafers and the full supported diagonal silhouette. This is not her upright chat posture.",
    ("soyo", "listening"): "Soyo has both knees gently drawn up on the bench, both socked feet supported by the cushion, one forearm softly draped over the knees and the other palm supporting her on the bench. Exactly two real hands. The two removed brown loafers stay separately on the FLOOR in their original locations; they are room props, not extra feet. Her attentive gaze and quiet head tilt remain toward the person.",
    ("soyo", "rest"): "Soyo's whole pelvis, torso, shoulders and head remain turned in a real back/side view toward the lake window, with relaxed hands supported by her lap/bench and both original floor loafers. She is looking out of the window, not posing toward the viewer or holding a new task prop.",
    ("soyo", "play"): "Soyo genuinely leans forward from the supported bench hips to offer her small blank paper bookmark with the near hand; the other hand is planted on the real cushion. Preserve the distinct forward balance, one nearer complete shoe on the rug and the other complete shoe near the bench. The bookmark stays actually held, with no text or fabricated business result.",
    ("soyo", "attention"): "Soyo sits supported on the right bench, torso/head and gaze actually turned toward the small stationary blank card beside the desk lamp. Her rear palm supports her on the cushion, other hand rests low on her knee; both complete shoes remain grounded. The desk card remains stationary in the ROOM, not in her hand.",
    ("taki", "reading"): "Taki sits upright but relaxed in the actual working desk chair, facing right in side view, eyes down on the OPEN BOOK supported by both hands and the desk. Preserve this calm book-reading silhouette, different from her forward-writing study pose. Original chair rotation, back/seat contact, two knees and two complete loafers remain exactly as in image 1.",
    ("taki", "planning"): "Taki is half-turned toward the person while seated on the real desk chair, holding a pencil over the supported open planning notebook and keeping the other hand low on the same page. Preserve her upright conversational shoulder turn, actual desk/hand contact, chair seat support, separate proportional legs and both complete floor loafers; do not replace it with a front-facing bench chat pose.",
    ("taki", "listening"): "Taki sits on the bench with exactly ONE knee drawn onto the cushion and its SOCKED foot supported there, one forearm resting naturally on that knee, the other palm planted on the bench. Her other leg extends to its WORN brown loafer on the floor. Exactly one removed empty brown shoe stays separately on the floor beside the bench in its original room location. Do not put a second shoe on the raised socked foot or turn the empty shoe into another foot.",
    ("taki", "rest"): "Taki's complete torso, shoulders and head remain in a real back/side view toward the lake window, both hands resting naturally on the cushion/lap, supported bench hips and two complete floor loafers. Preserve the relaxed away-from-work gaze and long purple-black hair falling down her back; no new book, pencil or gesture.",
    ("taki", "play"): "Taki is seated at her real desk chair, body genuinely leaning toward the small stationary practice DRUM PAD on the desk. She holds exactly TWO actual drumsticks, one raised and one close to the pad, with readable real hands. Preserve original knees, separate complete floor loafers, chair support and pad/desk contact. Pad/books/cup/lamp remain ROOM props; only the held sticks follow her hands. Do not substitute a bench pose or add a full drum kit.",
    ("taki", "attention"): "Taki pauses at the desk, torso/head and eyes turned to the small stationary blank card on the right BENCH. Her hands remain low on the actual desk paper and her one held pencil, hips supported by the real desk chair, both knees and complete floor loafers intact. Preserve this rightward object-attention relation, not her downward-writing study pose. The bench card remains a room object.",
}
themes = {
    "mist": ("morning", "../room-mist-candidate.png", "Complete MIST morning: match image 2's pale blue-white daylight, soft lake mist and restrained cool room air. Keep natural skin and honest warm wood, with the desk lamp unlit as in image 2. Match the same light axis and same distant sky, no cyan filter and no daytime hard spotlight added from another direction."),
    "violet": ("dusk", "../room-violet-candidate.png", "Complete VIOLET dusk: exactly match image 2's rose-gold sunset and lavender-gray room shadows, with the same small warm desk lamp. CRITICAL: keep the physical sun disk centered near x1007,y302 and the lake reflection axis near x1003; these locations belong to the room, so they must not move toward the character or between activities. Keep the exact sunset horizon and coherent low light. No morning-blue sky, no purple tint filter."),
    "rain": ("night", "../room-rain-candidate-v2.png", "Complete RAIN night: match image 2's cold blue rainy window, quiet dark town and warm desk lamp. The RIGHT desk lamp is the room's one local warm light source. The left rear flower/table/wall remain quiet and low-exposure exactly as in image 2; do not add an independent bright left-wall spotlight, extra glowing floor island, daylight leaf shadow, sun or moon. Character face, hands, socks/shoes and furniture receive physically coherent lamp falloff and cool window bounce, not a dark filter."),
}
prepared_path = root / "theme-extension-prepared.json"
entries = json.loads(prepared_path.read_text(encoding="utf-8")) if prepared_path.exists() else []
existing = {(item["character"], item["activity"], item["palette"]) for item in entries}
added = 0
for (character, activity), lock in activities.items():
    mother = mothers[character, activity]
    for theme, (light, plate, lighting) in themes.items():
        if (character, activity, theme) in existing:
            continue
        prompt = f"""Use case: lighting-weather.
Asset type: complete same-room relighting mother, exactly 1536 x 1024.
Image 1 is the ONLY editable target and primary-approved correct complete {character} {activity} warm mother. Image 2 is the primary-approved EMPTY {theme} room lighting/sky reference ONLY. Keep image 1's camera, entire character identity/body/pose, exact scale and silhouette, actual chair position/rotation, furniture, held objects and all body/furniture occlusions. Never copy the empty plate's different chair in place of image 1's actual occupied chair. Only redraw the complete physical illumination and outdoor time/weather according to image 2. No pasted character, isolated cutout or filter.

{identity[character]}

ACTIVITY LOCK — preserve the already correct complete source body, never fix or change anatomy: {lock}

{lighting}

Keep the full original 1536x1024 canvas and all four window corners, shelves, rear-left living corner, original right desk/lamp/cup, bench/pillows/throw, floor and rug. Preserve the exact original hip/seat pressure, original knees/ankles and visible shoe/foot contacts under the new light. Every actually visible body end stays in frame with its original margin; no guessed completion of naturally occluded limbs. No extra person, changed face, mature makeup, costume/color replacement, crossed legs, larger head, elongated shin, extra hand/foot, new prop, readable text, UI, arrow, border, collage, watermark or decorative fog inside the room.
"""
        prompt_path = root / f"{character}-{activity}-{theme}-prompt.txt"
        if prompt_path.exists():
            raise ValueError(f"Refusing to overwrite an existing submitted prompt: {prompt_path.name}")
        prompt_path.write_text(prompt, encoding="utf-8")
        entries.append({"character": character, "activity": activity, "palette": theme, "light": light,
                        "mother": mother["file"], "motherSha256": mother["sha256"], "plate": plate,
                        "prompt": prompt_path.name, "source": f"{character}-{activity}-{theme}-source.json",
                        "output": f"{character}-{activity}-{theme}-mother-candidate-v1.png",
                        "stage": "prepared prompt, not yet generated or primary-reviewed"})
        added += 1
(root / "theme-extension-prepared.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"preparedPrompts": len(entries), "addedPrompts": added, "modelCalls": 0, "primaryReview": "not inferred"}))
