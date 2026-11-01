"""Restore original visible front hair ribbon only; alpha, never RGB."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
prior_path=root/"mutsumi-planning-apricot-source-alpha-v3.png";stable_path=root/"mutsumi-planning-apricot-mask-calibrated-v1.png"
if sha(prior_path)!="0020251d34abe797ea237e1329314dcde80a37d7bccf1e16d6b3e12d198eee4a" or sha(stable_path)!="8ecf6580870a7e5d6dedf268dfd447d154887566e326e86ad687b019b990b4cc":raise ValueError("Source alpha changed.")
alpha=Image.open(prior_path).convert("L");stable=Image.open(stable_path).getchannel("A")
region=(913,392,937,461);alpha.paste(stable.crop(region),region[:2])
panel=[(916,393),(921,394),(918,415),(919,429),(921,444),(925,454),(921,452),(917,441),(914,423),(913,407)]
size=(region[2]-region[0],region[3]-region[1]);shape=Image.new("L",(size[0]*4,size[1]*4))
ImageDraw.Draw(shape).polygon([((x-region[0])*4,(y-region[1])*4)for x,y in panel],fill=255)
alpha.paste(Image.fromarray(np.maximum(np.asarray(alpha.crop(region)),np.asarray(shape.resize(size,Image.Resampling.LANCZOS))),mode="L"),region[:2])
output=root/"mutsumi-planning-apricot-source-alpha-v4.png";alpha.save(output)
record={"recordType":"original-visible-hair-ribbon-alpha","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"inputAlpha":prior_path.name,"inputAlphaSha256":sha(prior_path),"stableAlpha":stable_path.name,"stableAlphaSha256":sha(stable_path),"sourceObservedRegion":region,"sourceObservedHairRibbon":panel,"method":"Source 8x original coordinate crop identified the actual continuous front mint/gold hair ribbon at x913..925, not the v3 trial's sparse room-colored x924..932 curve. Reset only that small ROI to stable source matte and retain the actual original visible ribbon with antialiased alpha. Original RGB and anatomy unchanged.","outputAlpha":output.name,"outputAlphaSha256":sha(output),"review":{"primary":"pending","runtime":"not registered"}}
(root/"mutsumi-planning-apricot-source-alpha-v4.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
config=json.loads((root/"mutsumi-planning-apricot-layer-parameters-v3.json").read_text(encoding="utf-8"))
for key in ["figure","mask","background","shadow","record"]:config[key]=config[key].replace("-v3.","-v4.")
config["matte"]=output.name;config["matteSha256"]=sha(output);config["producerNote"]+=" v4 source 8x fine-grid restores the actual continuous front visible hair ribbon, replacing the v3 misplaced thin trial curve. All original RGB unchanged."
(root/"mutsumi-planning-apricot-layer-parameters-v4.json").write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"alpha":output.name,"sha256":sha(output)}))

