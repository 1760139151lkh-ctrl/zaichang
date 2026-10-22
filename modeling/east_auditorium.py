"""Authored waterfront lecture hall, anchored to way/161325273. Not surveyed interiors."""
import math
from architecture_primitives import *
SOURCE=allshapes['way/161325273'];CX,CY=SOURCE.centroid.coords[0];R=math.sqrt(SOURCE.area/math.pi)
DISPLAY=Point(CX,CY).buffer(R,quad_segs=96)
ENTRY_MASK=box(CX-2.5,CY+20,CX+2.5,449)
PLAZA=DISPLAY.buffer(2.8).union(box(CX-3.2,CY+18,CX+3.2,430))

def fan(r0,r1,a0,a1):
 n=max(2,math.ceil((a1-a0)*32));angles=[a0+(a1-a0)*j/n for j in range(n+1)]
 return Polygon([(CX+10+r1*math.cos(a),CY+r1*math.sin(a)) for a in angles]+[(CX+10+r0*math.cos(a),CY+r0*math.sin(a)) for a in reversed(angles)])

def build_auditorium(main_footprint,water):
 mat('Hall acoustic textile',(.38,.36,.31),0,.85)
 slab('Waterfront hall foundation and deck','East stone',PLAZA.difference(main_footprint),-.10,.25)
 slab('Waterfront hall floor','paving',DISPLAY.buffer(-.2).difference(main_footprint),.151)
 roof=DISPLAY.buffer(1.2).difference(main_footprint.buffer(.12))
 top=lambda x,y:7.25+.38*max(0,1-((x-CX)**2+(y-CY)**2)/(R+1.2)**2)
 profile_slab('Waterfront hall curved white roof','East white',roof,top,.24,max_segment=.70)
 for j in range(144):
  a=j*math.tau/144;b=(j+1)*math.tau/144;mid=(a+b)/2
  # North access leads to the teaching wing; west access opens to the lakeside deck.
  entry_n=abs(mid-math.pi/2)<.105;entry_w=abs(mid-math.pi)<.105
  p=(CX+(R-.8)*math.cos(a),CY+(R-.8)*math.sin(a));q=(CX+(R-.8)*math.cos(b),CY+(R-.8)*math.sin(b))
  if not (entry_n or entry_w):
   material='wood' if abs(math.atan2(math.sin(mid),math.cos(mid)))<.60 else 'East clear glazing'
   remaining=LineString([p,q]).difference(main_footprint)
   pieces=[remaining] if remaining.geom_type=='LineString' else [g for g in getattr(remaining,'geoms',[]) if g.geom_type=='LineString']
   for segment in pieces:
    if segment.is_empty:continue
    pp,qq=list(segment.coords)[0],list(segment.coords)[-1]
    face('Waterfront hall enclosure',material,[(*pp,.15),(*qq,.15),(*qq,6.98),(*pp,6.98)])
    beam('Waterfront hall transoms','East bronze',(*pp,3.1),(*qq,3.1),.03,sides=6)
   if not main_footprint.covers(Point(p)):
    beam('Waterfront hall slender mullions','East bronze',(*p,.15),(*p,6.98),.045,sides=6)
  for rr,zz in [(R+1.2,7.25),(R-.8,6.98)]:
   if main_footprint.buffer(.12).covers(Point(CX+rr*math.cos(mid),CY+rr*math.sin(mid))):continue
   pp=(CX+rr*math.cos(a),CY+rr*math.sin(a),zz);qq=(CX+rr*math.cos(b),CY+rr*math.sin(b),zz)
   beam('Waterfront hall roof edge','East white',pp,qq,.10,sides=8)
 # Splayed exterior supports land on the continuous deck and meet the roof edge.
 for j in range(16):
  a=j*math.tau/16
  if abs(a-math.pi/2)<.15 or abs(a-math.pi)<.15:continue
  foot=(CX+(R+1.9)*math.cos(a),CY+(R+1.9)*math.sin(a));head=(CX+(R+.65)*math.cos(a),CY+(R+.65)*math.sin(a))
  beam('Waterfront hall angled columns','East white',(*foot,.15),(*head,7.05),.14,sides=10)
  beam('Waterfront hall deck supports','East stone',(*foot,-1.4),(*foot,.15),.20,sides=10)
 # Radial roof structure, with explicit supported peripheral and central rings.
 for j in range(20):
  a=j*math.tau/20
  beam('Waterfront hall radial roof ribs','East white',(CX+2.5*math.cos(a),CY+2.5*math.sin(a),6.8),(CX+(R-.9)*math.cos(a),CY+(R-.9)*math.sin(a),6.8),.10,sides=8)
 slab('Waterfront hall roof hub','East white',Point(CX,CY).buffer(2.65,quad_segs=48).difference(Point(CX,CY).buffer(2.4,quad_segs=48)),6.65,.36)
 # A small raised stage and an eight-row fan of actual seats with aisle gaps.
 stage=box(CX+8,CY-6.8,CX+19.4,CY+6.8).intersection(DISPLAY.buffer(-1.2))
 slab('Waterfront hall stage','wood',stage,.15,.55)
 for k in range(3):slab('Waterfront stage access steps','wood',box(CX+6.5+k*.5,CY-3,CX+8,CY+3),.15,k*.1833+.1833)
 cube('Waterfront presentation screen','East white',(CX+18.8,CY,3.7),(.10,11.0,4.0))
 total=0
 for row in range(8):
  inner=7.0+1.7*row;outer=inner+1.7;z=.15+row*.18
  tier=fan(inner,outer,math.radians(110),math.radians(250)).intersection(DISPLAY.buffer(-1.5))
  if row:slab('Waterfront seating terraces','East stone',tier,.15,z-.15)
  r=inner+.95;count=int(math.radians(140)*r/.66)
  for j in range(count):
   a=math.radians(110)+(j+.5)*math.radians(140)/count
   if any(abs(math.sin(a-math.radians(d)))*r<.90 for d in [150,180,210]):continue
   x,y=CX+10+r*math.cos(a),CY+r*math.sin(a)
   if not DISPLAY.buffer(-2).covers(Point(x,y)):continue
   angle=a+math.pi/2;total+=1
   cube('Waterfront upholstered seat pads','Hall acoustic textile',(x,y,z+.46),(.52,.48,.10),angle)
   cube('Waterfront upholstered chair backs','Hall acoustic textile',(x+.23*math.cos(a),y+.23*math.sin(a),z+.77),(.52,.07,.58),angle)
   for side in [-1,1]:
    xx=x+side*.29*math.cos(angle);yy=y+side*.29*math.sin(angle)
    cube('Waterfront chair armrests','wood',(xx,yy,z+.68),(.055,.42,.055),angle)
    beam('Waterfront chair supports','East bronze',(xx,yy,z),(xx,yy,z+.65),.025,sides=6)
 # Solid steps remain in the aisle gaps; landing heights match the corresponding terraces.
 for d in [150,180,210]:
  a=math.radians(d)
  for row in range(8):
   r0=7+1.7*row;half=math.asin(.75/(r0+.85));g=fan(r0,r0+1.7,a-half,a+half).intersection(DISPLAY.buffer(-1.5))
   slab('Waterfront aisle stair treads','paving',g,.15+row*.18,.01)
 # Rear arrival is not a vertical terrace wall: stairs and a curved ramp reach the rear aisle.
 rear_z=.15+7*.18
 rear=fan(20.6,22.1,math.radians(110),math.radians(250)).intersection(DISPLAY.buffer(-1.2))
 slab('Waterfront rear seating aisle','East stone',rear,.15,rear_z-.15)
 for k in range(9):
  x0=CX-15.1+k/3;x1=x0+1/3
  slab('Waterfront rear arrival stair treads','paving',box(x0,CY-1.05,x1,CY+1.05),.15,k*.14+.14)
 for side in [-1,1]:
  beam('Waterfront rear stair handrails','East bronze',(CX-15.1,CY+side*1.02,1.25),(CX-12.1,CY+side*1.02,rear_z+1.1),.035,sides=6)
  for k in range(10):
   x=CX-15.1+k/3;z=.15+k*.14
   beam('Waterfront rear stair balusters','East bronze',(x,CY+side*1.02,z),(x,CY+side*1.02,z+1.1),.022,sides=6)
 ramp_a=math.radians(125);ramp_b=math.radians(170)
 ramp=fan(23.0,24.8,ramp_a,ramp_b)
 def ramp_top(x,y):
  a=math.atan2(y-CY,x-(CX+10))
  return .15+(rear_z-.15)*(a-ramp_a)/(ramp_b-ramp_a)
 profile_slab('Waterfront curved rear access ramp','East stone',ramp,ramp_top,.20,max_segment=.4)
 landing=fan(22.1,24.8,ramp_b,math.radians(174))
 slab('Waterfront ramp upper landing','East stone',landing,rear_z-.20,.20)
 for r in [23.0,24.8]:
  for k in range(100):
   a=ramp_a+(ramp_b-ramp_a)*k/100;b=ramp_a+(ramp_b-ramp_a)*(k+1)/100
   p=(CX+10+r*math.cos(a),CY+r*math.sin(a));q=(CX+10+r*math.cos(b),CY+r*math.sin(b));z=ramp_top(*p);zz=ramp_top(*q)
   beam('Waterfront ramp rails','East bronze',(*p,z+1.1),(*q,zz+1.1),.03,sides=6)
   beam('Waterfront ramp infill','East bronze',(*p,z),(*p,z+1.1),.018,sides=6)
  for a in [ramp_a+(ramp_b-ramp_a)*k/4 for k in range(1,5)]:
   x,y=CX+10+r*math.cos(a),CY+r*math.sin(a);z=ramp_top(x,y)
   if z>.4:beam('Waterfront ramp supporting posts','East stone',(x,y,.15),(x,y,z-.2),.09,sides=8)
 for k in range(24):
  a=ramp_b+math.radians(4)*k/24;b=ramp_b+math.radians(4)*(k+1)/24
  p=(CX+10+24.8*math.cos(a),CY+24.8*math.sin(a));q=(CX+10+24.8*math.cos(b),CY+24.8*math.sin(b))
  beam('Waterfront ramp landing outer rail','East bronze',(*p,rear_z+1.1),(*q,rear_z+1.1),.03,sides=6)
  beam('Waterfront ramp landing infill','East bronze',(*p,rear_z),(*p,rear_z+1.1),.018,sides=6)
 a=math.radians(174)
 for k in range(20):
  r=22.1+2.7*k/20;rr=22.1+2.7*(k+1)/20;p=(CX+10+r*math.cos(a),CY+r*math.sin(a));q=(CX+10+rr*math.cos(a),CY+rr*math.sin(a))
  beam('Waterfront ramp landing end rail','East bronze',(*p,rear_z+1.1),(*q,rear_z+1.1),.03,sides=6)
  beam('Waterfront ramp landing end infill','East bronze',(*p,rear_z),(*p,rear_z+1.1),.018,sides=6)
 for k in range(280):
  a=math.radians(110+140*k/280);b=math.radians(110+140*(k+1)/280);mid=(a+b)/2
  if abs(mid-math.pi)<.05 or math.radians(170)<=mid<=math.radians(174):continue
  p=(CX+10+22.1*math.cos(a),CY+22.1*math.sin(a));q=(CX+10+22.1*math.cos(b),CY+22.1*math.sin(b))
  beam('Waterfront rear aisle guards','East bronze',(*p,rear_z+1.1),(*q,rear_z+1.1),.03,sides=6)
  beam('Waterfront rear aisle infill','East bronze',(*p,rear_z),(*p,rear_z+1.1),.018,sides=6)
 # Clear entrance leaves and real fixed jambs; keep the north route into the main wing open.
 for label,x,y,angle in [('north',CX,CY+R-.8,0),('west',CX-R+.8,CY,math.pi/2)]:
  t=Vector((math.cos(angle),math.sin(angle)));normal=Vector((-t.y,t.x))
  for side in [-1,1]:
   hinge=Vector((x,y))+t*side*1.2;direction=-side*t*math.cos(math.radians(55))+normal*math.sin(math.radians(55));c=hinge+direction*.6
   cube('Waterfront '+label+' open entrance leaves','East clear glazing',(*c,1.50),(1.2,.08,2.7),math.atan2(direction.y,direction.x))
   for p in [hinge,hinge+direction*1.2]:beam('Waterfront door leaf frames','East bronze',(*p,.15),(*p,2.85),.025,sides=6)
   q=hinge+direction;beam('Waterfront door handles','bronze',(*q,1.05),(*q,1.7),.022,sides=8)
  for side in [-1,1]:
   p0=Vector((x,y))+t*side*1.2;p1=Vector((x,y))+t*side*2.35
   face('Waterfront door fixed sidelights','East clear glazing',[(*p0,.15),(*p1,.15),(*p1,2.85),(*p0,2.85)])
  for side in [-1,1]:
   p=Vector((x,y))+t*side*2.35;beam('Waterfront entrance structural jambs','East white',(*p,.15),(*p,6.98),.09,sides=8)
  face('Waterfront entrance upper glazing','East clear glazing',[(x+t.x*-2.35,y+t.y*-2.35,2.85),(x+t.x*2.35,y+t.y*2.35,2.85),(x+t.x*2.35,y+t.y*2.35,6.98),(x+t.x*-2.35,y+t.y*-2.35,6.98)])
 # Covered connector meets the existing teaching building, not a free-floating isolated pavilion.
 connector=box(CX-3.0,CY+R-1.2,CX+3.0,428)
 slab('Waterfront hall linking canopy','East white',connector,3.05,.18)
 for x in [CX-2.8,CX+2.8]:beam('Waterfront hall connector posts','East white',(x,CY+R+.9,.15),(x,CY+R+.9,3.05),.09,sides=8)
 # The waterside deck is guarded; landward access remains open.
 for j in range(180):
  a=j*math.tau/180;b=(j+1)*math.tau/180;mid=(a+b)/2
  if not water.covers(Point(CX+(R+3.0)*math.cos(mid),CY+(R+3.0)*math.sin(mid))):continue
  rr=R+2.55;p=(CX+rr*math.cos(a),CY+rr*math.sin(a));q=(CX+rr*math.cos(b),CY+rr*math.sin(b))
  beam('Waterfront deck handrail','East bronze',(*p,1.25),(*q,1.25),.035,sides=6)
  for k in range(8):
   aa=a+(b-a)*k/8;pp=(CX+rr*math.cos(aa),CY+rr*math.sin(aa))
   beam('Waterfront deck guard infill','East bronze',(*pp,.15),(*pp,1.25),.018,sides=6)
 mat('Waterfront diffuser',(.95,.92,.83),0,.4);bs=M['Waterfront diffuser'].node_tree.nodes['Principled BSDF'];bs.inputs['Emission Color'].default_value=(1,.95,.86,1);bs.inputs['Emission Strength'].default_value=3
 for j in range(8):
  a=j*math.tau/8;x=CX+12*math.cos(a);y=CY+12*math.sin(a)
  beam('Waterfront pendant stems','East bronze',(x,y,6.70),(x,y,top(x,y)-.24),.015,sides=6)
  slab('Waterfront pendant diffusers','Waterfront diffuser',Point(x,y).buffer(.40,quad_segs=24),6.64,.06)
 print('WATERFRONT HALL authored seats',total,'source centroid retained',DISPLAY.centroid.distance(SOURCE.centroid),'display boundary shift',DISPLAY.boundary.hausdorff_distance(SOURCE.boundary))
 return PLAZA
