"""Uika reading source-coordinate alpha repairs only; original RGB is read-only."""
from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image, ImageDraw

here = Path(__file__).resolve().parent
mother_path = here / 'uika-reading-apricot-mother-candidate-v1.png'
raw_path = here / 'uika-reading-apricot-mask-generated-v1.png'
mother = Image.open(mother_path).convert('RGB')
raw = Image.open(raw_path).convert('L')
if mother.size != raw.size:
    raise ValueError('Source matte must share the unchanged full mother canvas.')
alpha = np.array(raw)
rgb = np.asarray(mother).astype('int16')
cloth_polygons = [
    [(1210, 649), (1225, 653), (1230, 663), (1226, 678), (1227, 695), (1223, 701), (1216, 699), (1208, 698), (1200, 694), (1201, 678)],
    [(1240, 678), (1254, 683), (1275, 694), (1277, 709), (1271, 717), (1258, 714), (1242, 710), (1237, 698)],
    [(1251, 676), (1254, 677), (1260, 685), (1255, 683), (1251, 682)],
]
cloth = Image.new('L', (mother.width * 4, mother.height * 4), 0)
cloth_draw = ImageDraw.Draw(cloth)
for polygon in cloth_polygons:
    cloth_draw.polygon([(x * 4, y * 4) for x, y in polygon], fill=255)
cloth = cloth.resize(mother.size, Image.Resampling.LANCZOS)
confidence = np.minimum(np.clip((26 - (rgb[:, :, 1] - rgb[:, :, 2])) / 5, 0, 1),
                        np.clip((54 - (rgb[:, :, 0] - rgb[:, :, 1])) / 6, 0, 1))
alpha = np.maximum(alpha, (np.asarray(cloth) * confidence).astype('uint8'))

# These are actual skin-shadow/page pixels between resting fingers, not air.
finger_polygons = [
    [(1294, 499), (1298, 498), (1300, 503), (1297, 506), (1293, 504)],
    [(1301, 492), (1307, 491), (1308, 500), (1305, 504), (1301, 502)],
    [(1308, 492), (1315, 491), (1318, 495), (1316, 503), (1311, 503)],
    [(1320, 499), (1326, 499), (1326, 502), (1321, 504)],
]
prepared = Image.fromarray(alpha)
draw = ImageDraw.Draw(prepared)
for polygon in finger_polygons:
    draw.polygon(polygon, fill=255)
book_hand_lap_seams = [
    {'points': [(1297, 520), (1304, 521), (1310, 523)], 'width': 3},
    {'points': [(1310, 523), (1312, 524), (1320, 527), (1326, 529), (1328, 530), (1330, 531),
                (1334, 532), (1336, 532), (1344, 537), (1352, 541), (1356, 544), (1383, 542),
                (1390, 543), (1403, 542)], 'width': 5},
]
for seam in book_hand_lap_seams:
    draw.line(seam['points'], fill=255, width=seam['width'], joint='curve')
output = here / 'uika-reading-apricot-matte-prepared-v1.png'
prepared.save(output)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
record = {
    'kind': 'per-source-alpha-repair', 'script': Path(__file__).name, 'scriptSha256': sha(Path(__file__)),
    'mother': mother_path.name, 'motherSha256': sha(mother_path), 'rawMatte': raw_path.name, 'rawMatteSha256': sha(raw_path),
    'canvas': list(mother.size), 'transform': 'identity; no resize/translation/warp of source images',
    'rgbOperation': 'none; original RGB read only, never anatomy/hand/book repaint',
    'clothPolygons': cloth_polygons, 'clothCoverage': '4x polygon coverage sampled to original canvas',
    'clothConfidence': 'min(clamp((26-(G-B))/5),clamp((54-(R-G))/6)); excludes warm wood below actual cloth',
    'originalFingerSkinAndPageInclusions': finger_polygons,
    'originalInternalBookHandLapSeams': book_hand_lap_seams,
    'rejectedEarlierSeamStart': 'x1278..1292,y508..519 contains actual orange room air. No added alpha there; original raw alpha restored by fresh source processing.',
    'output': output.name, 'outputSha256': sha(output),
    'review': 'Designer candidate only; original/shallow/dark recomposition inspection still required. No primary/Stage acceptance.',
}
(here / 'uika-reading-apricot-matte-refinement-v1.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'output': output.name, 'sha256': sha(output)}, ensure_ascii=False))
