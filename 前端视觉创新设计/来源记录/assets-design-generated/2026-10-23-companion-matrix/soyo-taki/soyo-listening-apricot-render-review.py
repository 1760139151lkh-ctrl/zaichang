"""Render original listening-scene layers on light/dark/room for focused visual review."""
from pathlib import Path
import sys
from PIL import Image
root=Path(__file__).resolve().parent
output=root.parents[3]/"仅本机/2026-10-24-soyo-warm-layer-review/listening"
version=sys.argv[1]
background_version=sys.argv[2] if len(sys.argv)>2 else version
prefix="soyo-listening-apricot-"
figure=Image.open(root/(prefix+"figure-calibrated-"+version+".png")).convert("RGBA")
shadow=Image.open(root/(prefix+"shadow-calibrated-"+background_version+".png")).convert("RGBA")
background=Image.open(root/(prefix+"background-calibrated-"+background_version+".png")).convert("RGBA")
for name,base in (("dark",Image.new("RGBA",figure.size,(28,31,38,255))),("light",Image.new("RGBA",figure.size,(246,243,236,255))),("room",Image.alpha_composite(background,shadow))):
    composite=Image.alpha_composite(base,figure)
    composite.save(output/("listening-"+version+"-"+name+".png"))
    composite.crop((1180,260,1450,605)).resize((810,1035)).save(output/("listening-"+version+"-"+name+"-detail.png"))
background.save(output/("listening-"+version+"-empty.png"))
