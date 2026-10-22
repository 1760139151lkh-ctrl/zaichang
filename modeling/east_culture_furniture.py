"""One authored upper-floor reading nook, not a claim about an existing campus business."""
from architecture_primitives import *

def build_reading_nook():
 mat('Culture warm upholstery',(.28,.27,.25),0,.92)
 mat('Culture woven rug',(.31,.29,.26),0,.96)
 mat('Culture book charcoal',(.055,.065,.07),0,.8)
 floor=3.357
 slab('Culture reading rug','Culture woven rug',box(-66.1,343.7,-58.9,352.1),3.35,.007)
 for x,side in [(-65,-1),(-60,1)]:
  cube('Culture reading sofa base','wood',(x,348,floor+.28),(.86,3.0,.22))
  for y in [347.10,348,348.90]:cube('Culture reading sofa cushions','Culture warm upholstery',(x,y,floor+.46),(.82,.84,.20))
  cube('Culture reading sofa back','Culture warm upholstery',(x+side*.37,348,floor+.77),(.18,2.72,.68))
  for y in [346.55,349.45]:cube('Culture reading sofa arms','Culture warm upholstery',(x,y,floor+.65),(.92,.18,.48))
  for dx in [-.30,.30]:
   for dy in [-1.3,1.3]:beam('Culture reading sofa legs','Culture bronze',(x+dx,348+dy,floor),(x+dx,348+dy,floor+.22),.035,sides=6)
 cube('Culture reading shared low table','wood',(-62.5,348,floor+.43),(1.65,2.15,.07))
 for dx in [-.65,.65]:
  for dy in [-.85,.85]:beam('Culture reading low table legs','Culture bronze',(-62.5+dx,348+dy,floor),(-62.5+dx,348+dy,floor+.395),.035,sides=6)
 for y,side in [(345.1,-1),(351.0,1)]:
  cube('Culture reading single chair seat','Culture warm upholstery',(-62.5,y,floor+.47),(.72,.70,.18))
  cube('Culture reading single chair back','Culture warm upholstery',(-62.5,y+side*.28,floor+.77),(.72,.15,.60))
  for dx in [-.27,.27]:
   for dy in [-.25,.25]:beam('Culture reading single chair legs','Culture bronze',(-62.5+dx,y+dy,floor),(-62.5+dx,y+dy,floor+.39),.028,sides=6)
 # Low shelving is away from the passage mouths and does not become a partition.
 x,y=-56.1,348.5
 cube('Culture reading low shelf back','wood',(x+.22,y,3.99),(.05,3.0,1.28))
 for yy in [y-1.5,y+1.5]:cube('Culture reading low shelf ends','wood',(x,yy,3.99),(.48,.05,1.28))
 for z in [3.42,3.82,4.22,4.61]:cube('Culture reading low shelf boards','wood',(x,y,z),(.48,2.95,.04))
 for row,z in enumerate([3.44,3.84,4.24]):
  for j in range(17):
   h=.24+.025*((j+row)%4)
   cube('Culture reading shelf books',['porcelain','Culture book charcoal','wood'][(j+row)%3],(x-.03,y-1.35+j*.16,z+h/2),(.30,.10,h))
 cube('Culture reading table book','Culture book charcoal',(-62.5,348.2,floor+.48),(.36,.50,.03),.18)
 cube('Culture reading table pages','porcelain',(-62.5,348.2,floor+.499),(.34,.48,.008),.18)
 lamps=[]
 for x in [-65.0,-60.0]:
  for y in [345.5,350.5]:
   z=6.55+.30*math.sin(math.pi*(y-301)/106)-.22-.035
   cube('Culture reading ceiling panels','porcelain',(x,y,z),(1.0,.38,.07));lamps.append((x,y,z-.04,190))
 return lamps
