"""Keep original-canvas hair and cloth; calibrate alpha only in observed gap."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
mother_path = root / "mutsumi-listening-apricot-mother-candidate-v2.png"
alpha_path = root / "mutsumi-listening-apricot-source-alpha-v7.png"
if sha(mother_path) != "eeb2f7953f39ba44844ac05d4b7bcf2b000fca738ecb0bd1a93ca3b614f190dc" or sha(alpha_path) != "de3feda8049d110440fb8c558b9d801905422248d11d6e179ab512ba762126fd":
    raise ValueError("Source changed; inspect original before alpha calibration.")
mother = Image.open(mother_path).convert("RGB")
alpha = Image.open(alpha_path).convert("L")
region = (1385, 420, 1425, 538)
rgb = np.asarray(mother.crop(region), dtype=np.int16)
prior = np.asarray(alpha.crop(region), dtype=np.uint8)
size = (region[2] - region[0], region[3] - region[1])
panel = [(1370,416),(1378,431),(1385,452),(1393,480),(1397,500),(1392,519),(1384,536),(1376,546),(1373,539),(1385,518),(1389,498),(1381,475),(1373,453)]
arc = [(1392,420),(1401,436),(1410,454),(1417,472),(1419,488),(1415,501),(1408,512),(1397,519)]
cloth = [(1385,508),(1388,514),(1394,521),(1399,531),(1399,538),(1385,538)]
def polygon(points):
    im = Image.new("L", (size[0]*4,size[1]*4))
    ImageDraw.Draw(im).polygon([((x-region[0])*4,(y-region[1])*4) for x,y in points],fill=255)
    return np.asarray(im.resize(size,Image.Resampling.LANCZOS),dtype=np.uint8)
panel_mask = polygon(panel)
hair_color = (rgb[:,:,1]-rgb[:,:,2]>=6)&(rgb[:,:,1]-rgb[:,:,2]<=90)&(rgb[:,:,0]-rgb[:,:,1]>=-25)&(rgb[:,:,0]-rgb[:,:,1]<=45)&(rgb[:,:,0]>=90)
bright = (rgb[:,:,0]>=215)&(rgb[:,:,1]>=200)&(rgb[:,:,2]>=145)
replacement = panel_mask * np.uint8(hair_color | bright)
arc_image = Image.new("L",(size[0]*4,size[1]*4))
ImageDraw.Draw(arc_image).line([((x-region[0])*4,(y-region[1])*4) for x,y in arc],fill=255,width=12,joint="curve")
arc_mask = np.asarray(arc_image.resize(size,Image.Resampling.LANCZOS),dtype=np.float32)
# Preserve the source's antialiased lit strand instead of a binary white-only hole pattern.
strand_coverage = np.clip(np.minimum.reduce([(rgb[:,:,0]-175)/45,(rgb[:,:,1]-160)/45,(rgb[:,:,2]-105)/45]),0,1)
replacement = np.maximum(replacement,np.rint(arc_mask*strand_coverage).astype(np.uint8))
# This is source-visible white piping/navy sleeve, not the blue cushion behind it.
cloth_mask = polygon(cloth)
replacement = np.maximum(replacement,np.minimum(prior,cloth_mask))
alpha.paste(Image.fromarray(replacement,mode="L"),region[:2])
output = root / "mutsumi-listening-apricot-source-alpha-v9.png"
alpha.save(output)
record = {"recordType":"original-scene-alpha-only-hair-refinement","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"mother":mother_path.name,"motherSha256":sha(mother_path),"inputAlpha":alpha_path.name,"inputAlphaSha256":sha(alpha_path),"region":list(region),"observedMainHairPanel":panel,"observedFineArc":arc,"preservedOriginalCloth":cloth,"method":"Original source RGB unchanged. Within the observed rear-hair/window gap, discard original orange post/blue cushion contamination, preserve continuous antialiased bright hair and original white piping/navy sleeve. No figure geometry or RGB paint.","outputAlpha":output.name,"outputAlphaSha256":sha(output),"review":{"primary":"pending","runtime":"not registered"}}
(root/"mutsumi-listening-apricot-source-alpha-v9.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
config=json.loads((root/"mutsumi-listening-apricot-layer-parameters-v8.json").read_text(encoding="utf-8"))
for key in ["figure","mask","background","shadow","record"]:
    config[key]=config[key].replace("-v8.","-v9.")
config["matte"]=output.name
config["matteSha256"]=sha(output)
config["producerNote"] += " v8 trial excluded real sleeve highlights; v9 keeps the observed original cloth polygon and source-antialiased bright hair, with original RGB unchanged. Earlier trial not adopted. Primary pending."
(root/"mutsumi-listening-apricot-layer-parameters-v9.json").write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"alpha":output.name,"sha256":sha(output)}))
