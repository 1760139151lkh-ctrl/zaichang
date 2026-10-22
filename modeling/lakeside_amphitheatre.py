"""Authored outdoor seating on the retained southern lake promontory.
The official oblique reference informs the type, not surveyed dimensions.
"""
from architecture_primitives import *
from landscape_primitives import shrub

def add_lakeside_amphitheatre(allowed,wet,deck):
 centre=Vector((-322.,568.));start=math.radians(40);end=math.radians(160)
 mat('Amphitheatre stone',(.74,.70,.62),0,.80)
 mat('Amphitheatre timber',(.34,.245,.15),0,.76)
 mat('Amphitheatre centre',(.36,.235,.19),0,.86)
 mat('Amphitheatre dark metal',(.15,.145,.13),.55,.40)
 mat('Amphitheatre soil',(.16,.12,.075),0,.95)
 def arc(radius,a=start,b=end):return [(centre.x+radius*math.cos(a+(b-a)*i/128),centre.y+radius*math.sin(a+(b-a)*i/128)) for i in range(129)]
 def ring(inner,outer):return Polygon(arc(outer)+list(reversed(arc(inner))))
 plaza=Polygon([(-370,588),(-355,596),(-329,608),(-300,610),(-293,589),(-309,575),(-307,568),(-311,558),(-320,552),(-326,552),(-330,554),(-339,546),(-349,558),(-362,562),(-372,566)]).intersection(allowed)
 aisles=[]
 for angle in [65,105,145]:
  t=math.radians(angle);p=centre+Vector((math.cos(t),math.sin(t)))*26
  aisles.append(LineString([tuple(centre),tuple(p)]).buffer(.9,cap_style=2))
 aisle_mask=unary_union(aisles)
 # Six low seating terraces. Adjacent annuli do not overlap as duplicate outer walls.
 for row in range(6):
  r0=10+row*1.8;r1=r0+1.8;top=.15+(row+1)*.15
  terrace=ring(r0,r1).intersection(allowed);slab('Outdoor amphitheatre terrace','Amphitheatre stone',terrace,.15,top-.15)
  seats=ring(r0+.58,r0+1.03).difference(aisle_mask).intersection(allowed)
  for slat in range(4):
   strip=ring(r0+.58+slat*.12,r0+.685+slat*.12).difference(aisle_mask).intersection(allowed)
   slab('Outdoor amphitheatre timber seats','Amphitheatre timber',strip,top+.40,.08)
  for degrees in range(43,160,6):
   angle=math.radians(degrees);p=centre+Vector((math.cos(angle),math.sin(angle)))*(r0+.80)
   if not seats.buffer(.02).covers(Point(*p)):continue
   radial=Vector((math.cos(angle),math.sin(angle)))
   for side in [-1,1]:
    q=p+radial*(side*.14);beam('Outdoor amphitheatre seat legs','Amphitheatre dark metal',(*q,top),(*q,top+.40),.025,sides=8)
   q=p-radial*.18;r=p+radial*.18;beam('Outdoor amphitheatre seat brackets','Amphitheatre dark metal',(*q,top+.37),(*r,top+.37),.025,sides=8)
  # Handrails flank the actual aisle steps, never through a seating bench.
  for angle in [65,105,145]:
   t=math.radians(angle);u=Vector((math.cos(t),math.sin(t)));v=Vector((-u.y,u.x))
   for side in [-1,1]:
    p=centre+u*r0+v*(side*.86);q=centre+u*r1+v*(side*.86)
    beam('Outdoor amphitheatre aisle handrail','bronze',(*p,top+.85),(*q,top+1.0),.028,sides=6)
    beam('Outdoor amphitheatre aisle posts','bronze',(*q,top),(*q,top+1.0),.022,sides=6)
 # Side guards follow the stepped edge instead of leaving the raised end seats exposed.
 for angle in [start,end]:
  u=Vector((math.cos(angle),math.sin(angle)))
  for row in range(6):
   r0=10+row*1.8;r1=r0+1.8;top=.15+(row+1)*.15;p=centre+u*r0;q=centre+u*r1
   beam('Outdoor amphitheatre side guard','bronze',(*p,top+.90),(*q,top+1.05),.03,sides=6)
   beam('Outdoor amphitheatre side guard posts','bronze',(*q,top),(*q,top+1.05),.025,sides=6)
 # Rear circulation has one real ramp landing joined into its footprint, not tangent to a curve.
 angle=math.radians(105);high=centre+Vector((math.cos(angle),math.sin(angle)))*22.4;base=Vector((-334.7,599.8));direction=(base-high).normalized();side=Vector((-direction.y,direction.x));flat_end=high+direction*2.5
 landing=LineString([tuple(high),tuple(flat_end)]).buffer(1.5,cap_style=2)
 rear=ring(20.8,24.5).union(landing).intersection(allowed)
 slab('Outdoor amphitheatre rear circulation','Amphitheatre stone',rear,.15,.90)
 ramp=Polygon([tuple(flat_end-side*1.5),tuple(flat_end+side*1.5),tuple(base+side*1.5),tuple(base-side*1.5)])
 length=(base-flat_end).length
 def ramp_top(x,y):return 1.05-.90*max(0,min(1,(Vector((x,y))-flat_end).dot(direction)/length))
 profile_slab('Outdoor amphitheatre access ramp','Amphitheatre stone',ramp,ramp_top,.90)
 for sign in [-1,1]:
  p=flat_end+side*(sign*1.45);q=base+side*(sign*1.45)
  beam('Outdoor amphitheatre ramp handrails','bronze',(*p,2.0),(*q,1.10),.032,sides=8)
  for t in [0,.5,1]:
   r=p.lerp(q,t);z=ramp_top(*r);beam('Outdoor amphitheatre ramp posts','bronze',(*r,z),(*r,z+.95),.025,sides=6)
 # The round performance paving is flush with the forecourt, not a floating disc.
 stage=Point(*centre).buffer(7.0,quad_segs=64).intersection(allowed)
 slab('Outdoor circular performance paving','Amphitheatre stone',stage,.152)
 slab('Outdoor performance centre inset','Amphitheatre centre',Point(*centre).buffer(2.0,quad_segs=48),.153)
 bed=ring(23.0,24.25).difference(aisle_mask).difference(landing.buffer(.3)).intersection(allowed);soil=bed.buffer(-.14)
 slab('Outdoor amphitheatre planted rim','Amphitheatre stone',bed.difference(soil),1.05,.28)
 slab('Outdoor amphitheatre rim soil','Amphitheatre soil',soil,1.05,.25)
 for i in range(65):
  t=start+(end-start)*(i+.5)/65;p=centre+Vector((math.cos(t),math.sin(t)))*23.6
  if soil.covers(Point(*p)):shrub('Outdoor amphitheatre shrub '+str(i),p.x,p.y,ground=1.30,size=.88,seed=1700+i)
 # Continuous protection at the raised rear edge, with the ramp entrance deliberately open.
 for i in range(80):
  t0=start+(end-start)*i/80;t1=start+(end-start)*(i+1)/80;p=centre+Vector((math.cos(t0),math.sin(t0)))*24.35;q=centre+Vector((math.cos(t1),math.sin(t1)))*24.35
  if landing.buffer(.35).intersects(LineString([tuple(p),tuple(q)])):continue
  beam('Outdoor amphitheatre rear guard','bronze',(*p,2.10),(*q,2.10),.03,sides=6)
  if i%2==0:beam('Outdoor amphitheatre rear guard posts','bronze',(*p,1.05),(*p,2.10),.025,sides=6)
 # The lakeside outer promenade is separate from all raised seating surfaces.
 edge=wet.buffer(.75).boundary.intersection(plaza.buffer(.65)).difference(deck.buffer(1.0))
 lines=[edge] if edge.geom_type=='LineString' else [g for g in getattr(edge,'geoms',[]) if g.geom_type=='LineString']
 for line in lines:
  count=math.ceil(line.length/2)
  if count<1:continue
  for i in range(count):
   p=line.interpolate(line.length*i/count);q=line.interpolate(line.length*(i+1)/count)
   beam('Outdoor amphitheatre shore guard','bronze',(p.x,p.y,1.20),(q.x,q.y,1.20),.035,sides=8)
   beam('Outdoor amphitheatre shore posts','bronze',(p.x,p.y,.15),(p.x,p.y,1.20),.025,sides=6)
   beam('Outdoor amphitheatre shore lower rail','bronze',(p.x,p.y,.35),(q.x,q.y,.35),.022,sides=6)
   for j in range(1,17):
    x=p.x+(q.x-p.x)*j/17;y=p.y+(q.y-p.y)*j/17;beam('Outdoor amphitheatre shore infill','bronze',(x,y,.35),(x,y,1.20),.011,sides=5)
 return plaza.union(ramp).union(rear).intersection(allowed)
