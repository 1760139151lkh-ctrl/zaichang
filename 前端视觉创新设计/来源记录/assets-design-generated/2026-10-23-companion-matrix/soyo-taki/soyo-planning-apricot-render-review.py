"""Render focused layer review composites only; no tests or runtime fixtures."""
from pathlib import Path
import sys
from PIL import Image
root=Path(__file__).resolve().parent
output=root.parents[3]/"仅本机/2026-10-24-soyo-warm-layer-review/planning"
version=sys.argv[1]
prefix="soyo-planning-apricot-"
figure=Image.open(root/(prefix+"figure-calibrated-"+version+".png")).convert("RGBA")
shadow=Image.open(root/(prefix+"shadow-calibrated-"+version+".png")).convert("RGBA")
background=Image.open(root/(prefix+"background-calibrated-"+version+".png")).convert("RGBA")
for name, base in (("dark",Image.new("RGBA",figure.size,(28,31,38,255))),("light",Image.new("RGBA",figure.size,(246,243,236,255))),("room",Image.alpha_composite(background,shadow))):
    composite=Image.alpha_composite(base,figure)
    composite.save(output/("planning-"+version+"-"+name+".png"))
    composite.crop((620,275,1010,800)).resize((780,1050)).save(output/("planning-"+version+"-"+name+"-detail.png"))
background.save(output/("planning-"+version+"-empty.png"))
