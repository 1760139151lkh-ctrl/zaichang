"""Small planting sized to the narrow eastern court; never blocks its door path."""
from architecture_primitives import *
from landscape_primitives import shrub

def build_narrow_court(courts,planted):
 court=next(c for c in courts if c.covers(Point(-8,470)));garden=unary_union(planted).intersection(court);paving=court.difference(garden)
 for j,(x,y,size) in enumerate([(-5.85,469,1.10),(-5.85,473,1.35),(-5.85,477,1.0),(-9.62,468,.5),(-9.62,471,.5),(-9.62,474,.5),(-9.62,477,.5)]):
  if garden.buffer(-.38*size).covers(Point(x,y)):shrub('East narrow court layered shrub '+str(j),x,y,.12,size,seed=6700+j)
 x,y=-2.8,473
 if paving.covers(box(x-.3,y-.85,x+.3,y+.85)):
  for k in range(4):cube('East narrow court bench seat','wood',(x+(k-1.5)*.1,y,.59),(.085,1.6,.055))
  for z in [.78,.93]:cube('East narrow court bench back','wood',(x+.20,y,z),(.055,1.6,.12))
  for yy in [y-.65,y+.65]:
   for xx in [x-.17,x+.17]:beam('East narrow court bench legs','East bronze',(xx,yy,.15),(xx,yy,.56),.028,sides=6)
   beam('East narrow court bench back supports','East bronze',(x+.20,yy,.15),(x+.20,yy,1.0),.025,sides=6)


def build_canopy_seats(spine):
 # Four small rest points stay outside the central and cross-court walking axes.
 for x,back_sign in [(-53.0,-1),(-41.8,1)]:
  for y in [453.5,473.5]:
   if not spine.covers(box(x-.35,y-1.15,x+.35,y+1.15)):continue
   for k in range(4):cube('East canopy bench seat','wood',(x+(k-1.5)*.10,y,.59),(.085,2.1,.055))
   for z in [.78,.93]:cube('East canopy bench back','wood',(x+back_sign*.20,y,z),(.055,2.1,.12))
   for yy in [y-.85,y+.85]:
    for xx in [x-.17,x+.17]:beam('East canopy bench legs','East bronze',(xx,yy,.15),(xx,yy,.56),.028,sides=6)
    beam('East canopy bench back supports','East bronze',(x+back_sign*.20,yy,.15),(x+back_sign*.20,yy,1.0),.025,sides=6)
