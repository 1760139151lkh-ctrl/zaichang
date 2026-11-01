"""Keep source-visible front hair attached at its original jaw-side root."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
prior=root/"mutsumi-planning-apricot-source-alpha-v4.png"
if sha(prior)!="52f4cb6415e61acd51017e69c1b7464a48652e1a696d35c2d6154d90fe9260bf":raise ValueError("Source alpha changed.")
alpha=Image.open(prior).convert("L");region=(913,382,925,401);points=[(916,384),(923,384),(920,396),(914,399)]
shape=Image.new("L",(48,76));ImageDraw.Draw(shape).polygon([((x-region[0])*4,(y-region[1])*4)for x,y in points],fill=255)
alpha.paste(Image.fromarray(np.maximum(np.asarray(alpha.crop(region)),np.asarray(shape.resize((12,19),Image.Resampling.LANCZOS))),mode="L"),region[:2])
output=root/"mutsumi-planning-apricot-source-alpha-v5.png";alpha.save(output)
record={"recordType":"source-visible-hair-root-alpha","script":Path(__file__).name,"scriptSha256":sha(Path(__file__)),"inputAlpha":prior.name,"inputAlphaSha256":sha(prior),"sourceObservedRegion":region,"sourceObservedHairRoot":points,"method":"Actual original gold/mint front hair starts beside the original jaw before continuing as the v4 ribbon. Restore only its visible source-coordinate alpha connection, original RGB unmodified.","outputAlpha":output.name,"outputAlphaSha256":sha(output),"review":{"primary":"pending","runtime":"not registered"}}
(root/"mutsumi-planning-apricot-source-alpha-v5.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
config=json.loads((root/"mutsumi-planning-apricot-layer-parameters-v4.json").read_text(encoding="utf-8"))
for key in ["figure","mask","background","shadow","record"]:config[key]=config[key].replace("-v4.","-v5.")
config["matte"]=output.name;config["matteSha256"]=sha(output);config["producerNote"]+=" v5 retains actual original jaw-side root joining the visible front ribbon; all source RGB unchanged."
(root/"mutsumi-planning-apricot-layer-parameters-v5.json").write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"alpha":output.name,"sha256":sha(output)}))
