"""Rana chat asset production from the approved original; no image/model redraw.

Coordinates are a local alpha seed traced on the original mother. The generated
unregistered silhouette is deliberately not read. Run from any working directory.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
from PIL import Image, ImageDraw, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parent
MOTHER = "rana-chat-apricot-mother-candidate-v1.png"
EXPECTED = "26bf57f84c03de99efad34ec75a6abd759d484d29933b1830b36c15cabbff812"
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()

# Outline of visible original RGB only, in the original 1536 x 1024 coordinates.
OUTLINE = [
    (1307,285),(1320,288),(1334,295),(1347,308),(1356,321),
    (1365,341),(1370,354),(1369,364),(1365,375),(1357,384),
    (1352,388),(1367,389),(1378,397),(1385,414),(1391,438),
    (1396,451),(1404,466),(1407,470),(1402,473),(1395,479),
    (1390,484),(1391,499),(1394,518),(1396,532),(1403,542),
    (1404,549),(1399,554),(1403,562),(1407,568),(1417,568),
    (1429,573),(1440,581),(1447,584),(1449,587),(1443,589),
    (1432,583),(1423,579),(1429,585),(1435,589),(1430,591),
    (1413,583),(1401,580),(1396,581),(1383,577),(1377,568),
    (1368,568),(1363,573),(1350,576),(1337,579),(1327,580),
    (1322,575),(1306,576),(1292,575),(1273,574),(1255,574),
    (1247,574),(1249,588),(1258,611),(1265,631),(1272,651),
    (1277,660),(1286,658),(1290,664),(1288,674),(1295,694),
    (1299,711),(1306,729),(1307,745),(1303,751),(1291,756),
    (1287,761),(1275,767),(1257,771),(1242,770),(1238,766),
    (1238,757),(1243,745),(1251,735),(1256,723),(1255,707),
    (1251,695),(1247,693),(1249,685),(1254,679),(1253,669),
    (1250,657),(1245,638),(1240,620),(1234,600),(1228,583),
    (1225,574),(1226,565),(1223,573),(1218,591),(1210,614),
    (1202,633),(1194,646),(1192,651),(1193,660),(1190,677),
    (1185,697),(1182,705),(1182,715),(1179,724),(1168,728),
    (1165,733),(1148,737),(1130,738),(1117,735),(1113,731),
    (1114,723),(1118,714),(1126,705),(1136,695),(1144,685),
    (1148,671),(1150,656),(1156,651),(1156,643),(1160,639),
    (1165,624),(1173,602),(1181,578),(1190,553),(1198,534),
    (1208,526),(1220,521),(1227,516),(1235,509),(1239,500),
    (1241,492),(1247,485),(1250,475),(1249,470),(1254,463),
    (1259,448),(1266,426),(1270,412),(1277,403),(1273,404),
    (1265,400),(1261,392),(1258,379),(1255,363),(1255,345),
    (1258,325),(1265,307),(1277,294),(1291,288),
]


def main():
    mother = Image.open(ROOT / MOTHER).convert("RGB")
    if sha(ROOT / MOTHER) != EXPECTED or mother.size != (1536, 1024):
        raise ValueError("Approved source identity changed; no production performed")
    scale = 4
    seed = Image.new("L", (1536 * scale, 1024 * scale), 0)
    ImageDraw.Draw(seed).polygon([(x * scale, y * scale) for x, y in OUTLINE], fill=255)
    seed.resize(mother.size, Image.Resampling.LANCZOS).save(ROOT / "rana-chat-apricot-alpha-seed-v3.png")
    params = {
        "mother": MOTHER, "motherSha256": EXPECTED,
        "matte": "rana-chat-apricot-alpha-seed-v3.png", "alphaSource": "luminance",
        "alphaLow": 5, "alphaHigh": 250,
        "figure": "rana-chat-apricot-figure-candidate-v3.png",
        "mask": "rana-chat-apricot-mask-candidate-v3.png",
        "record": "rana-chat-apricot-layer-production-v3.json",
        "localColorMatteRefinement": {
            "region": [1100,275,1460,785], "seedThreshold": 127,
            "uncertainBandPixels": 5, "iterations": 5, "edgeFeatherPixels": 0.32,
        },
        "backgroundCandidate": "rana-chat-apricot-background-generated-v1.png",
        "background": "rana-chat-apricot-background-candidate-v3.png",
        "backgroundExpandPixels": 6, "backgroundFeatherPixels": 1.2,
        "backgroundErasePolygons": [],
        "contactShadowPolygons": [
            [[1108,721],[1177,712],[1193,723],[1184,740],[1110,744]],
            [[1232,754],[1278,744],[1311,744],[1316,766],[1240,780]],
            [[1250,570],[1330,568],[1387,566],[1410,579],[1342,588],[1250,582]],
        ],
        "contactShadowEdgePixels": 3, "contactShadowFeatherPixels": 1.1,
        "shadow": "rana-chat-apricot-shadow-candidate-v3.png",
    }
    parameter_file = ROOT / "rana-chat-apricot-layer-parameters-v3.json"
    parameter_file.write_text(json.dumps(params, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    processor = ROOT.parent / "extract-scene-layers.py"
    spec = importlib.util.spec_from_file_location("extract_scene_layers", processor)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.prepare(parameter_file)
    # Refine only explicit original-coordinate regions AFTER GrabCut. Putting
    # these holes in its colour-model seed made it delete the supporting palm.
    alpha = Image.open(ROOT / params["mask"]).getchannel("A")
    sleeve_region = (1210, 465, 1266, 522)
    sleeve_outline = [
        (1265,465),(1265,474),(1261,475),(1258,478),(1257,481),(1257,484),
        (1256,486),(1255,488),(1253,490),(1252,492),(1250,495),(1248,498),
        (1245,500),(1240,502),(1238,504),(1237,507),(1237,510),(1233,512),
        (1229,514),(1225,515),(1218,519),(1210,522),(1266,522),(1266,465),
    ]
    left, top, right, bottom = sleeve_region
    shape = Image.new("L", ((right-left)*4, (bottom-top)*4), 0)
    ImageDraw.Draw(shape).polygon([((x-left)*4,(y-top)*4) for x,y in sleeve_outline], fill=255)
    shape = shape.resize((right-left,bottom-top), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(0.25))
    alpha.paste(ImageChops.darker(alpha.crop(sleeve_region), shape), (left,top))
    hole = [
        (1370,537),(1375,536),(1378,544),(1379,551),(1379,557),(1383,560),
        (1388,565),(1390,571),(1391,575),(1380,575),(1372,574),(1368,573),
        (1369,570),(1376,566),(1374,562),(1370,559),(1370,552),(1374,545),(1373,540),
    ]
    erase = Image.new("L", (1536*4,1024*4),0)
    ImageDraw.Draw(erase).polygon([(x*4,y*4) for x,y in hole],fill=255)
    erase = erase.resize(mother.size,Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(0.2))
    alpha = ImageChops.subtract(alpha, erase)
    # The source shin has a pale highlight next to the warm bench. Colour-only
    # refinement treated it as bench. Restore its original visible contour.
    shin_region = (1223, 562, 1288, 665)
    shin_outline = [
        (1223,562),(1253,562),(1254,569),(1257,575),(1261,582),(1265,589),
        (1267,598),(1269,609),(1271,622),(1274,638),(1278,653),(1279,659),
        (1281,662),(1273,665),(1258,665),(1254,658),(1251,647),(1246,632),
        (1241,617),(1237,606),(1233,595),(1229,584),(1225,576),(1223,570),
    ]
    left,top,right,bottom=shin_region
    shin=Image.new("L",((right-left)*4,(bottom-top)*4),0)
    ImageDraw.Draw(shin).polygon([((x-left)*4,(y-top)*4) for x,y in shin_outline],fill=255)
    shin=shin.resize((right-left,bottom-top),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(0.25))
    alpha.paste(ImageChops.lighter(alpha.crop(shin_region),shin),(left,top))
    alpha.save(ROOT / "rana-chat-apricot-alpha-calibrated-v9.png")
    rough_record = json.loads((ROOT / params["record"]).read_text(encoding="utf-8"))
    params = {key: value for key, value in params.items() if key != "localColorMatteRefinement"}
    for key in ("figure", "mask", "record", "background", "shadow"):
        params[key] = params[key].replace("-v3", "-v9")
    params["matte"] = "rana-chat-apricot-alpha-calibrated-v9.png"
    params["backgroundErasePolygons"] = [
        [[1190,550],[1390,550],[1398,621],[1190,621]],
    ]
    params["excludeWarmRoomRegions"] = [{
        "polygon": [[1225,477],[1263,477],[1263,488],[1240,510],[1225,510]],
        "redMin": 150, "redOverGreen": 35, "redOverBlue": 65,
    }]
    params["excludePolygons"] = [
        [[1248,474],[1256,474],[1260,476],[1257,480],[1248,480]],
        [[1368,575],[1391,575],[1391,578],[1368,578]],
        [[1251,684],[1254,683],[1254,687],[1252,690],[1249,691],[1249,687]],
        [[1257,695],[1259,693],[1260,697],[1261,703],[1260,707],[1257,709]],
    ]
    parameter_file = ROOT / "rana-chat-apricot-layer-parameters-v9.json"
    parameter_file.write_text(json.dumps(params,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    module.prepare(parameter_file)
    record_file = ROOT / params["record"]
    record = json.loads(record_file.read_text(encoding="utf-8"))
    record["seedProduction"] = {
        "processor": Path(__file__).name, "processorSha256": sha(Path(__file__)),
        "method": "Manually calibrated original-canvas alpha outline, supersampled 4x, then narrow-band source-RGB GrabCut; no generated unregistered silhouette used.",
        "outline": OUTLINE,
        "generatedMaskV1Used": False,
        "roughExtraction": rough_record,
        "postMatteCalibration": {"sleeveRegion": sleeve_region, "sleeveOutline": sleeve_outline,
                                  "backgroundHolePolygon": hole, "shinRegion": shin_region,
                                  "shinOutline": shin_outline},
    }
    record_file.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
