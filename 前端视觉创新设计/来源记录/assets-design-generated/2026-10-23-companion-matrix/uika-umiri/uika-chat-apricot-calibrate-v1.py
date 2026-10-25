"""Produce Uika chat candidate layers from source-registered mask and original RGB.

Authorized pixel work only: alpha noise calibration and original-RGB extraction.
No person RGB, anatomy, canvas size, scale or placement is changed.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

here = Path(__file__).resolve().parent
mother_path = here / 'uika-chat-apricot-mother-candidate-v1.png'
mask_path = here / 'uika-chat-apricot-mask-generated-v1.png'
mother = Image.open(mother_path).convert('RGB')
raw = np.asarray(Image.open(mask_path).convert('L'))

# Retain independent real hair/cloth pixels too. No largest-component filter:
# only threshold raw background noise and the explicitly viewed room regions.
alpha = raw.copy()
alpha[alpha <= 8] = 0
alpha[alpha >= 250] = 255
room_exclusions = [
    [(0, 0), (1080, 0), (1080, 1023), (0, 1023)],
    [(1436, 0), (1535, 0), (1535, 1023), (1436, 1023)],
    [(1080, 0), (1436, 0), (1436, 244), (1080, 244)],
    [(1080, 784), (1436, 784), (1436, 1023), (1080, 1023)],
    [(1207, 710), (1212, 710), (1212, 717), (1207, 717)],
    [(1209, 726), (1215, 726), (1215, 733), (1209, 733)],
    [(1155, 771), (1166, 771), (1166, 774), (1155, 774)],
]
room_region = Image.new('L', mother.size, 0)
room_draw = ImageDraw.Draw(room_region)
for polygon in room_exclusions:
    room_draw.polygon(polygon, fill=255)
removed_room = int(np.count_nonzero((np.asarray(room_region) > 0) & (alpha > 0)))
alpha[np.asarray(room_region) > 0] = 0
rgb = np.asarray(mother).astype('int16')
arm_gap_region = np.zeros(raw.shape, dtype=bool)
arm_gap_region[470:479, 1257:1265] = True
arm_gap_room = arm_gap_region & ((rgb[:, :, 1] - rgb[:, :, 0] > 2)
    | ((rgb[:, :, 1] - rgb[:, :, 2] > 50) & (rgb[:, :, 0] - rgb[:, :, 2] > 70)))
alpha[arm_gap_room] = 0
# The raw generated matte carries a few blue lake/sky pixels through gaps
# beside the blonde hair. Only alpha of that source-background color changes;
# the original warm hair, face/eyes and every RGB value remain untouched.
hair_region = np.zeros(raw.shape, dtype=bool)
hair_region[250:395, 1220:1390] = True
blue_background = hair_region & (rgb[:, :, 1] - rgb[:, :, 0] >= 2) & (rgb[:, :, 2] - rgb[:, :, 0] >= 4)
removed_blue = int(np.count_nonzero(blue_background & (alpha > 0)))
alpha[blue_background] = 0
outer_hair = np.zeros(raw.shape, dtype=bool)
outer_hair[285:380, 1220:1250] = True
outer_hair[280:380, 1350:1390] = True
outer_sky = outer_hair & (rgb[:, :, 2] - rgb[:, :, 0] > 8)
gold_leaf = hair_region & (rgb[:, :, 1] - rgb[:, :, 2] > 60) & (rgb[:, :, 0] - rgb[:, :, 2] > 80)
removed_outer = int(np.count_nonzero((outer_sky | gold_leaf) & (alpha > 0)))
alpha[outer_sky | gold_leaf] = 0
# Original-mother coordinate review shows the remaining gold flecks left of
# the lower bob are leaves, outside the actual source hair contour. This
# narrow exclusion follows that source border; it changes alpha only.
left_hair_border = [(328, 1234), (340, 1237), (350, 1240), (360, 1244), (370, 1249), (380, 1254)]
removed_leaf_border = 0
for row in range(left_hair_border[0][0], left_hair_border[-1][0] + 1):
    border = int(np.interp(row, [point[0] for point in left_hair_border], [point[1] for point in left_hair_border]))
    removed_leaf_border += int(np.count_nonzero(alpha[row, 1220:border]))
    alpha[row, 1220:border] = 0
# Three narrow original cloth folds were gray/black in the generated matte.
# Restore their alpha from the visible source skirt only. The tight source
# polygons and cool-cloth criterion exclude the warmer wood behind them.
cloth_polygons = [
    [(1122, 676), (1150, 670), (1152, 680), (1145, 690), (1140, 697), (1127, 689), (1121, 682)],
    [(1160, 660), (1180, 662), (1184, 673), (1176, 693), (1172, 703), (1158, 700), (1147, 697), (1153, 679)],
    [(1206, 681), (1237, 692), (1226, 699), (1247, 713), (1251, 725), (1234, 727), (1226, 717), (1208, 710), (1199, 700)],
]
cloth_region = Image.new('L', (mother.width * 4, mother.height * 4), 0)
cloth_draw = ImageDraw.Draw(cloth_region)
for polygon in cloth_polygons:
    cloth_draw.polygon([(x * 4, y * 4) for x, y in polygon], fill=255)
cloth_region = cloth_region.resize(mother.size, Image.Resampling.LANCZOS)
cloth_confidence = np.minimum(np.clip((26 - (rgb[:, :, 1] - rgb[:, :, 2])) / 5, 0, 1),
                              np.clip((54 - (rgb[:, :, 0] - rgb[:, :, 1])) / 6, 0, 1))
cloth_alpha = (np.asarray(cloth_region) * cloth_confidence).astype('uint8')
restored_cloth = int(np.count_nonzero(cloth_alpha > alpha))
alpha = np.maximum(alpha, cloth_alpha)
matte = Image.fromarray(alpha)
figure_path = here / 'uika-chat-apricot-figure-calibrated-v1.png'
matte_path = here / 'uika-chat-apricot-mask-calibrated-v1.png'
prepared_matte_path = here / 'uika-chat-apricot-matte-prepared-v1.png'
white_mask = Image.new('RGBA', mother.size, (255, 255, 255, 0))
white_mask.putalpha(matte)
white_mask.save(prepared_matte_path)
generated_background_path = here / 'uika-chat-apricot-background-generated-v1.png'
contact_regions = [(1082, 746, 1242, 789), (1185, 565, 1438, 602)]
background_path = here / 'uika-chat-apricot-background-calibrated-v1.png'
shoe_contact_polygons = [
    [(1093, 748), (1120, 745), (1163, 753), (1164, 764), (1124, 768), (1095, 759)],
    [(1132, 760), (1165, 757), (1214, 763), (1224, 774), (1184, 781), (1143, 778)],
]
shadow_path = here / 'uika-chat-apricot-shadow-calibrated-v1.png'
parameters_path = here / 'uika-chat-apricot-layer-parameters-v1.json'
production_path = here / 'uika-chat-apricot-layer-processing-v1.json'
shared_script = here.parent / 'extract-scene-layers.py'
parameters = {
    'mother': mother_path.name,
    'motherSha256': '4677f8f984cf6f62666c9ae652854803992fca6f77223b4572243a7c878fb44c',
    'matte': prepared_matte_path.name, 'alphaSource': 'alpha', 'alphaLow': 8, 'alphaHigh': 250,
    'includePolygons': [], 'excludePolygons': [],
    'figure': figure_path.name, 'mask': matte_path.name,
    'backgroundCandidate': generated_background_path.name, 'backgroundExpandPixels': 9, 'backgroundFeatherPixels': 2,
    'backgroundErasePolygons': [
        [[1091, 755], [1233, 755], [1233, 780], [1091, 780]],
        [[1194, 574], [1429, 574], [1429, 593], [1194, 593]],
    ],
    'background': background_path.name, 'record': production_path.name,
    'contactShadowPolygons': shoe_contact_polygons, 'contactShadowFeatherPixels': 1.2, 'shadow': shadow_path.name,
    'reviewNote': 'Per-source alpha preparation is reproduced by uika-chat-apricot-calibrate-v1.py; no connected-component deletion. Final figure/mask/BG use the shared production tool and original mother RGB.',
}
parameters_path.write_text(json.dumps(parameters, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
subprocess.run([sys.executable, str(shared_script), str(parameters_path)], check=True)
figure = Image.open(figure_path).convert('RGBA')
matte = figure.getchannel('A')
alpha = np.asarray(matte)
background = Image.open(background_path).convert('RGB')
shadow = Image.open(shadow_path).convert('RGBA')

# These scoped inspection crops are evidence only, never design references or
# runtime assets. Both use the identical unscaled original figure pixels.
review = here.parents[4] / '.test-data' / 'uika-umiri-layer-review'
review.mkdir(parents=True, exist_ok=True)
crop = (1070, 235, 1450, 795)
for name, color in [('light', '#f5f0e8'), ('dark', '#1c1a23')]:
    composite = Image.new('RGBA', mother.size, color)
    composite.alpha_composite(figure)
    composite.convert('RGB').crop(crop).resize((760, 1120)).save(review / f'uika-chat-v1-{name}-detail.png')
mother.crop(crop).resize((760, 1120)).save(review / 'uika-chat-v1-mother-detail.png')
recombined = background.convert('RGBA')
recombined.alpha_composite(shadow)
recombined.alpha_composite(figure)
recombined.convert('RGB').save(review / 'uika-chat-v1-recombined.png')
recombined.convert('RGB').crop(crop).resize((760, 1120)).save(review / 'uika-chat-v1-recombined-detail.png')
offset = background.convert('RGBA')
offset.alpha_composite(shadow, dest=(20, 0))
offset.alpha_composite(figure, dest=(20, 0))
offset.convert('RGB').save(review / 'uika-chat-v1-offset20.png')

sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
record = {
    'schemaVersion': 1,
    'kind': 'deterministic-alpha-calibration-candidate',
    'character': 'uika', 'activity': 'chat', 'theme': 'apricot',
    'authorization': 'Explicit user permission for exact same-scene mask/original-RGB calibration only.',
    'script': Path(__file__).name, 'scriptSha256': sha(Path(__file__)),
    'input': {'mother': mother_path.name, 'motherSha256': sha(mother_path),
              'rawMask': mask_path.name, 'rawMaskSha256': sha(mask_path),
              'preparedMatte': prepared_matte_path.name, 'preparedMatteSha256': sha(prepared_matte_path)},
    'sharedProduction': {'script': '../extract-scene-layers.py', 'scriptSha256': sha(shared_script),
                         'parameters': parameters_path.name, 'parametersSha256': sha(parameters_path), 'record': production_path.name},
    'parameters': {'alphaNoiseMax': 8, 'alphaOpaqueMin': 250,
                   'selection': 'all source pixels retained except explicit viewed background regions; no connected-component deletion',
                   'roomBackgroundExclusions': {'polygons': room_exclusions, 'pixels': removed_room},
                   'armGapBackgroundExclusion': {'rect': [1257, 470, 1265, 479],
                                                 'sourceColors': 'G-R>2 or (G-B>50 and R-B>70); skin is retained',
                                                 'operation': 'alpha zero only for confirmed gap room colors, not a rectangular body cut'},
                   'morphology': 'none', 'otherAlphaValues': 'unchanged',
                   'hairBackgroundExclusion': {'rect': [1220, 250, 1390, 395], 'greenMinusRedMin': 2, 'blueMinusRedMin': 4,
                                               'operation': 'set source lake/sky-color alpha to zero only', 'pixels': removed_blue},
                   'outerHairBackgroundExclusion': {'rects': [[1220, 285, 1250, 380], [1350, 280, 1390, 380]],
                                                   'skyBlueMinusRedMinExclusive': 8,
                                                   'goldLeafGreenMinusBlueMinExclusive': 60, 'goldLeafRedMinusBlueMinExclusive': 80,
                                                   'operation': 'alpha zero only for source sky/leaf colors next to actual blonde contour', 'pixels': removed_outer},
                   'lowerBobLeftLeafExclusion': {'rowAndFirstPossibleHairX': left_hair_border,
                                                'operation': 'remove alpha left of actual source lower-bob border only', 'pixels': removed_leaf_border},
                   'originalSkirtFoldInclusions': {'polygons': cloth_polygons, 'polygonAntialias': '4x coverage sampled back to original canvas',
                                                  'clothConfidence': 'min(clamp((26-(G-B))/5),clamp((54-(R-G))/6))',
                                                  'operation': 'restore original visible cloth alpha only; preserve source-mixed soft edge',
                                                  'pixels': restored_cloth},
                   'rgbOperation': 'unmodified original full-canvas mother RGB with calibrated alpha'},
    'canvas': list(mother.size), 'alphaBounds': list(matte.getbbox()),
    'alphaNonzeroPixels': int(np.count_nonzero(alpha)),
    'motherRgbSha256': hashlib.sha256(mother.tobytes()).hexdigest(),
    'figureRgbSha256': hashlib.sha256(figure.convert('RGB').tobytes()).hexdigest(),
    'figure': {'path': figure_path.name, 'sha256': sha(figure_path), 'bytes': figure_path.stat().st_size},
    'mask': {'path': matte_path.name, 'sha256': sha(matte_path), 'bytes': matte_path.stat().st_size},
    'background': {'path': background_path.name, 'sha256': sha(background_path), 'bytes': background_path.stat().st_size,
                   'generatedInput': generated_background_path.name, 'generatedInputSha256': sha(generated_background_path),
                   'repairMask': 'shared tool: explicit alpha plus erase polygons, expanded 9px, feather 2px',
                   'contactRegions': contact_regions, 'outsideRepair': 'unmodified mother RGB',
                   'registration': 'same full canvas and coordinates; no transform, resize or crop'},
    'shadow': {'path': shadow_path.name, 'sha256': sha(shadow_path), 'bytes': shadow_path.stat().st_size,
               'source': 'original-mother shoe-floor darkening relative to matching empty background',
               'rgb': 'source-pair residual C=(motherRGB-emptyRGB*(1-A))/A; figure RGB unchanged', 'contactPolygons': shoe_contact_polygons,
               'alphaFormula': 'clamp(maxChannels((emptyRGB-sourceRGB)/emptyRGB),0,.82) * selectedSourceFloor * (1-figureAlpha)',
               'edgeFilter': '1.2px feather on selected source-floor boundary only',
               'bodyPixels': 'excluded by figure alpha', 'review': 'candidate; contact/double-shadow and finite-translation review pending'},
    'inspectionEvidence': '.test-data/uika-umiri-layer-review/',
    'review': 'Candidate only. Light/dark and matching-background inspection required; no primary layer or runtime acceptance.',
}
(here / 'uika-chat-apricot-calibration-v1.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: record[key] for key in ['alphaBounds', 'alphaNonzeroPixels', 'motherRgbSha256', 'figureRgbSha256']}, indent=2))
