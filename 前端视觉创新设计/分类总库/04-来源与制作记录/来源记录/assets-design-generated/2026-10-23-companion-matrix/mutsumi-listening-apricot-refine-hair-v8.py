"""Original-pixel hair alpha refinement in the observed rear-hair/window gap."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
mother_path = root / "mutsumi-listening-apricot-mother-candidate-v2.png"
alpha_path = root / "mutsumi-listening-apricot-source-alpha-v7.png"
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
if sha(mother_path) != "eeb2f7953f39ba44844ac05d4b7bcf2b000fca738ecb0bd1a93ca3b614f190dc" or sha(alpha_path) != "de3feda8049d110440fb8c558b9d801905422248d11d6e179ab512ba762126fd":
    raise ValueError("Original source/matte bytes changed; inspect before extraction.")
mother = Image.open(mother_path).convert("RGB")
alpha = Image.open(alpha_path).convert("L")
region = (1385, 420, 1425, 538)
rgb = np.asarray(mother.crop(region), dtype=np.int16)
prior = np.asarray(alpha.crop(region), dtype=np.uint8)
panel = [(1370,416),(1378,431),(1385,452),(1393,480),(1397,500),(1392,519),(1384,536),(1376,546),(1373,539),(1385,518),(1389,498),(1381,475),(1373,453)]
arc = [(1392,420),(1401,436),(1410,454),(1417,472),(1419,488),(1415,501),(1408,512),(1397,519)]
scale = 4
panel_image = Image.new("L", (40*scale,118*scale))
ImageDraw.Draw(panel_image).polygon([((x-region[0])*scale,(y-region[1])*scale) for x,y in panel], fill=255)
panel_mask = np.asarray(panel_image.resize((40,118),Image.Resampling.LANCZOS),dtype=np.uint8)
arc_image = Image.new("L", (40*scale,118*scale))
ImageDraw.Draw(arc_image).line([((x-region[0])*scale,(y-region[1])*scale) for x,y in arc], fill=255, width=3*scale, joint="curve")
arc_mask = np.asarray(arc_image.resize((40,118),Image.Resampling.LANCZOS),dtype=np.uint8)
hair_color = (rgb[:,:,1]-rgb[:,:,2]>=15)&(rgb[:,:,1]-rgb[:,:,2]<=85)&(rgb[:,:,0]-rgb[:,:,1]>=-25)&(rgb[:,:,0]-rgb[:,:,1]<=30)&(rgb[:,:,0]>=90)
bright_strand = (rgb[:,:,0]>=225)&(rgb[:,:,1]>=210)&(rgb[:,:,2]>=150)
navy_cloth = (rgb[:,:,0]-rgb[:,:,1]>=-4)&(rgb[:,:,0]-rgb[:,:,1]<=30)&(rgb[:,:,2]-rgb[:,:,1]>=0)&(rgb[:,:,2]-rgb[:,:,1]<=30)&(rgb[:,:,0]<=145)
replacement = np.maximum(panel_mask*np.uint8(hair_color),arc_mask*np.uint8(bright_strand))
replacement = np.maximum(replacement,np.where(navy_cloth,prior,0).astype(np.uint8))
alpha.paste(Image.fromarray(replacement,mode="L"),region[:2])
output = root / "mutsumi-listening-apricot-source-alpha-v8.png"
alpha.save(output)
record={"recordType":"original-scene-alpha-only-hair-refinement","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"mother":mother_path.name,"motherSha256":sha(mother_path),"inputAlpha":alpha_path.name,"inputAlphaSha256":sha(alpha_path),"region":list(region),"observedMainHairPanel":panel,"observedFineArc":arc,"arcBandPixels":3,"method":"Only the observed rear hair/window/pillow gap is rematted using original RGB inside the source-traced main hair panel and fine bright arc. Orange window post and blue cushion remain background. Original navy cloth alpha retained; no body or hair RGB painted, shifted or resized.","outputAlpha":output.name,"outputAlphaSha256":sha(output),"review":{"primary":"pending","runtime":"not registered"}}
(root/"mutsumi-listening-apricot-source-alpha-v8.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"file":output.name,"sha256":sha(output)}))
