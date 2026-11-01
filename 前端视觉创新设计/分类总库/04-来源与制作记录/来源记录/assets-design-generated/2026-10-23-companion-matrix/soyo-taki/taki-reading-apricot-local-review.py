"""Focused original-scene asset review rendering for the three owned Taki desk activities.
This writes image diagnostics only, not tests, fixtures, UI state or runtime data.
"""
from pathlib import Path
import json,sys
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent
review=root.parents[3]/"仅本机/2026-10-24-taki-warm-layer-review"
activity=sys.argv[1]
if activity not in ("reading","planning","play"):raise ValueError("Only this delegated asset set is supported")
prefix="taki-"+activity+"-apricot-"
output=review/activity
output.mkdir(parents=True,exist_ok=True)
if sys.argv[2]=="original":
    version="v2" if activity=="reading" else "v1"
    mother=Image.open(root/(prefix+"mother-candidate-"+version+".png"))
    mother.crop((680,285,1075,805)).resize((790,1040)).save(output/"mother-detail.png")
    bounds={"reading":(750,460,970,625),"planning":(715,470,970,625),"play":(690,470,880,625)}[activity]
    x0,y0,x1,y1=bounds
    picture=mother.crop(bounds).resize(((x1-x0)*4,(y1-y0)*4))
    draw=ImageDraw.Draw(picture)
    for x in range(x0,x1,10):
        draw.line(((x-x0)*4,0,(x-x0)*4,(y1-y0)*4),fill=(0,180,180))
        draw.text(((x-x0)*4+1,0),str(x),fill=(0,0,0))
    for y in range(y0,y1,10):
        draw.line((0,(y-y0)*4,(x1-x0)*4,(y-y0)*4),fill=(0,180,180))
        draw.text((0,(y-y0)*4+1),str(y),fill=(0,0,0))
    picture.save(output/"chair-source-coordinate-grid.png")
else:
    version=sys.argv[2]
    config=json.loads((root/(prefix+"layer-parameters-"+version+".json")).read_text(encoding="utf-8"))
    figure=Image.open(root/config["figure"]).convert("RGBA")
    shadow=Image.open(root/config["shadow"]).convert("RGBA")
    background=Image.open(root/config["background"]).convert("RGBA")
    for name,base in (("dark",Image.new("RGBA",figure.size,(28,31,38,255))),("light",Image.new("RGBA",figure.size,(246,243,236,255))),("room",Image.alpha_composite(background,shadow))):
        composite=Image.alpha_composite(base,figure)
        composite.save(output/(activity+"-"+version+"-"+name+".png"))
        composite.crop((680,285,1075,805)).resize((790,1040)).save(output/(activity+"-"+version+"-"+name+"-detail.png"))
    background.save(output/(activity+"-"+version+"-empty.png"))
