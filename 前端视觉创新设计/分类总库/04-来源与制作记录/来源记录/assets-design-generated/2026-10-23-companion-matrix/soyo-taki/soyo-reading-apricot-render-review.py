"""Render focused original-scene reading layer review composites; no tests."""
from pathlib import Path
import sys
from PIL import Image
root=Path(__file__).resolve().parent
output=root.parents[3]/"仅本机/2026-10-24-soyo-warm-layer-review/reading"
version=sys.argv[1]
prefix="soyo-reading-apricot-"
figure=Image.open(root/(prefix+"figure-calibrated-"+version+".png")).convert("RGBA")
shadow=Image.open(root/(prefix+"shadow-calibrated-"+version+".png")).convert("RGBA")
background=Image.open(root/(prefix+"background-calibrated-"+version+".png")).convert("RGBA")
for name,base in (("dark",Image.new("RGBA",figure.size,(28,31,38,255))),("light",Image.new("RGBA",figure.size,(246,243,236,255))),("room",Image.alpha_composite(background,shadow))):
    composite=Image.alpha_composite(base,figure)
    composite.save(output/("reading-"+version+"-"+name+".png"))
    composite.crop((1090,265,1450,790)).resize((720,1050)).save(output/("reading-"+version+"-"+name+"-detail.png"))
background.save(output/("reading-"+version+"-empty.png"))
