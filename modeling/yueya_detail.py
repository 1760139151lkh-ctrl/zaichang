"""Individually authored Yueya building, WIP, based on retained source footprint.
Sloping roof, real open circular forecourt and rectangular light court, not painted holes.
"""
import sys,math,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf,shrub
from shapely.affinity import affine_transform
from yueya_landscape import add_yueya_forecourt
OUT=ROOT/'modeling/yueya-work';OUT.mkdir(exist_ok=True)
source_id='way/411343683';source=allshapes[source_id];coords=list(source.exterior.coords);a=Vector(coords[0]);b=Vector(coords[3]);origin=(a+b)/2;u=(b-a).normalized();v=Vector((-u.y,u.x));angle=math.atan2(u.y,u.x)
def world(x,y,z=0):return (origin.x+x*u.x+y*v.x,origin.y+x*u.y+y*v.y,z)
def local(p):
 d=Vector(p)-origin;return (d.dot(u),d.dot(v))
def G(g):return affine_transform(g,[u.x,v.x,u.y,v.y,origin.x,origin.y])
def S(name,material,g,z,h=0):slab(name,material,G(g),z,h)
def C(name,material,p,size,rotation=0):cube(name,material,world(*p),size,angle+rotation)
def B(name,material,p,q,r=.05,sides=8):beam(name,material,world(*p),world(*q),r,sides=sides)
def F(name,material,pts):face(name,material,[world(*p) for p in pts])
raw=Polygon([local(p) for p in coords]);p0=raw.centroid
# Smooth the curved silhouette through the retained perimeter stations; keep the flat front.
arc=[Vector(local(coords[i])) for i in [3,4,5,6,7,8,12,13,14,15,16,17,18,19]]
curve=[]
for i in range(len(arc)-1):
 p1,p2=arc[i],arc[i+1];p0a=arc[max(0,i-1)];p3=arc[min(len(arc)-1,i+2)]
 for k in range(12):
  t=k/12;q=.5*((2*p1)+(-p0a+p2)*t+(2*p0a-5*p1+4*p2-p3)*t*t+(-p0a+3*p1-3*p2+p3)*t*t*t);curve.append(tuple(q))
curve.append(tuple(arc[-1]));outline=Polygon(curve).difference(box(-13.8,60.2,15.8,75))
# Tiny display-centroid correction preserves the source anchor; source data itself is untouched.
outline=translate(outline,p0.x-outline.centroid.x,p0.y-outline.centroid.y)
print('YUEYA DISPLAY source area',raw.area,'display area',outline.area,'boundary displacement',raw.boundary.hausdorff_distance(outline.boundary),'centroid offset',raw.centroid.distance(outline.centroid))
mat('Yueya white',(.80,.79,.73),.08,.50);mat('Yueya stone',(.62,.60,.54),0,.72)
mat('Yueya glass',(.105,.135,.145),.4,.23);mat('Yueya frame',(.27,.27,.25),.55,.38)
mat('Yueya glazing',(.71,.77,.78),.03,.10);M['Yueya glazing'].node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=.88
mat('Yueya roof',(.66,.65,.60),.16,.58);mat('Yueya soil',(.17,.13,.085),0,.95)
roof=lambda x,y:5.8+.19*max(0,y)
round_court=Point(28,6).buffer(11.0,quad_segs=64)
rect_court=box(-61,14,-23,31)
solid=outline.difference(round_court).difference(rect_court)
foot=G(outline);building=G(solid);clip=G(box(-117,-45,117,115)).envelope
wet=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='water' and allshapes[f['id']].intersects(clip)]).intersection(clip)
wet=wet.union(allshapes['way/288875627'].buffer(3.0,cap_style=1,join_style=1)).intersection(clip)
slab('Yueya ground','ground',clip.difference(wet.buffer(.35)),-1.5,1.5)
slab('Yueya source water','water',wet,-1.4,.5);slab('Yueya retaining banks','Yueya stone',wet.buffer(.35).difference(wet),-1.4,1.4)
S('Yueya continuous ground floor','paving',solid,0,.15)
# Regular floor levels are clipped beneath the continuous inclined roof, not random extrusions.
for z in [3.75,7.35,10.95,14.55]:
 miny=max(0,(z+2.6-5.8)/.19)
 floor=solid.intersection(box(-110,miny,110,75))
 if z==3.75:floor=floor.difference(box(-20.4,5.7,-12.6,12.0))
 S('Yueya internal floorplates','Yueya stone',floor,z-.22,.22)
# Curtain walls follow the single slope and both true voids.
for poly in polygons(solid):
 for ring in [orient(poly,1).exterior,*orient(poly,1).interiors]:
  pts=list(LineString(ring.coords).segmentize(2.5).coords)
  for p,q in zip(pts,pts[1:]):
   z0=roof(*p)-.25;z1=roof(*q)-.25
   # Recessed front entry and the circular court back door are separate from the glass field.
   front_entry=abs((p[1]+q[1])/2)<.5 and -20<(p[0]+q[0])/2<-8
   if front_entry:continue
   mx,my=(p[0]+q[0])/2,(p[1]+q[1])/2
   round_entry=abs(mx-28)<2.5 and my>15 and abs(math.hypot(mx-28,my-6)-11)<.3
   north_entry=abs(mx)<6.5 and 59.7<my<60.7
   base=3.35 if round_entry else 3.35 if north_entry else .15
   F('Yueya curtain glazing','Yueya glass',[(*p,base),(*q,base),(*q,z1),(*p,z0)])
   B('Yueya vertical mullions','Yueya frame',(*p,base),(*p,z0),.045,sides=6)
   for z in [1.5,2.9,3.75,5.15,6.55,7.35,8.75,10.15,10.95,12.35,13.75,14.55,15.95]:
    if base<z<min(z0,z1):B('Yueya continuous transoms','Yueya frame',(*p,z),(*q,z),.035,sides=6)
# White pilasters support the curved facade beneath the roof edge.
outer=outline.exterior
for i in range(math.ceil(outer.length/5)):
 q=outer.interpolate(i*5)
 if (abs(q.y)<.5 and -21<q.x<-7) or round_court.buffer(.5).contains(q) or (abs(q.x)<7 and q.y>59):continue
 C('Yueya facade piers','Yueya white',(q.x,q.y,(roof(q.x,q.y)+.15)/2),(.30,.30,roof(q.x,q.y)-.15))
# Roof apertures are real openings before their glass and vaults are placed.
spine=box(-15,24,15,64).union(box(-15,-1,49,27)).intersection(solid)
vault_specs=[]
for yy in [34,39,44,49]:vault_specs.append((-58,-21,yy))
for yy in [33,38,43,48]:vault_specs.append((20,68,yy))
for yy in [6,11,16,21]:vault_specs.append((53,88,yy))
vault_holes=[]
for left,right,yy in vault_specs:
 area=box(left,yy-1.15,right,yy+1.15).intersection(solid.buffer(-1.5)).difference(spine)
 for pp in polygons(area):
  if pp.area>5:
   x0,y0,x1,y1=pp.bounds
   candidate=box(x0+.15,y0+.02,x1-.15,y1-.02)
   while candidate.area>5 and not solid.buffer(-1.5).covers(candidate):
    x0+=.25;x1-=.25;candidate=box(x0+.15,y0+.02,x1-.15,y1-.02)
   if candidate.area>5:vault_holes.append(candidate)
# Small round lights on the western roof, laid out only where there is solid supported roof.
round_lights=[]
for x in [-85,-78,-71,-64]:
 for y in [6,13,20,27,34,41]:
  circle=Point(x,y).buffer(.78,quad_segs=20)
  if solid.buffer(-2).covers(circle) and not circle.intersects(rect_court.buffer(2)):round_lights.append(circle)
roof_area=solid.difference(spine).difference(unary_union(vault_holes)).difference(unary_union(round_lights))
profile_slab('Yueya inclined roof','Yueya roof',G(roof_area),lambda x,y:roof(*local((x,y))),.28)
profile_slab('Yueya glazed spine','Yueya glazing',G(spine),lambda x,y:roof(*local((x,y)))+.035,.04)
for x in range(-15,50,2):
 for pp in polygons(box(x-.035,-1,x+.035,65).intersection(spine)):
  profile_slab('Spine roof grid','Yueya frame',G(pp),lambda x,y:roof(*local((x,y)))+.10,.07)
for y in range(0,65,2):
 for pp in polygons(box(-16,y-.035,50,y+.035).intersection(spine)):
  profile_slab('Spine roof grid','Yueya frame',G(pp),lambda x,y:roof(*local((x,y)))+.10,.07)
for ring in [r for poly in polygons(solid) for r in [poly.exterior,*poly.interiors]]:
 pts=list(LineString(ring.coords).segmentize(1.2).coords)
 for p,q in zip(pts,pts[1:]):
  if not outline.buffer(.2).covers(Point(*p)):continue
  B('Yueya roof edge','Yueya white',(*p,roof(*p)),(*q,roof(*q)),.15,sides=8)
# Barrel skylights: closed end caps, glazed crown and visible white ribs.
for hole in vault_holes:
 minx,miny,maxx,maxy=hole.bounds;yy=(miny+maxy)/2;half=(maxy-miny)/2
 # Keep ends slightly within the aperture where the curved edge clips a row.
 left,right=minx+.12,maxx-.12
 for j in range(24):
  t0=j*math.pi/24;t1=(j+1)*math.pi/24
  p0=(yy+half*math.cos(t0),.95*math.sin(t0));p1=(yy+half*math.cos(t1),.95*math.sin(t1))
  material='Yueya glazing' if 4<=j<20 else 'Yueya white'
  F('Barrel skylight skin',material,[(left,p0[0],roof(left,p0[0])+p0[1]),(right,p0[0],roof(right,p0[0])+p0[1]),(right,p1[0],roof(right,p1[0])+p1[1]),(left,p1[0],roof(left,p1[0])+p1[1])])
  for xx in [left,right]:
   F('Barrel end glazing','Yueya glazing',[(xx,yy,roof(xx,yy)),(xx,p0[0],roof(xx,p0[0])+p0[1]),(xx,p1[0],roof(xx,p1[0])+p1[1])])
  count=math.ceil((right-left)/3)
  for k in range(count+1):
   xx=left+(right-left)*k/count;B('Barrel skylight ribs','Yueya white',(xx,p0[0],roof(xx,p0[0])+p0[1]+.025),(xx,p1[0],roof(xx,p1[0])+p1[1]+.025),.04,sides=6)
for circle in round_lights:
 q=circle.centroid
 profile_slab('Round rooflight base','Yueya white',G(circle.buffer(.12).difference(circle.buffer(-.04))),lambda x,y:roof(*local((x,y)))+.16,.18)
 # A shallow glass dome sits on a real curb, not a decorative floating dot.
 for k in range(5):
  r0=.78*k/5;r1=.78*(k+1)/5
  for j in range(32):
   aa=j*math.tau/32;bb=(j+1)*math.tau/32
   points=[(q.x+r*math.cos(t),q.y+r*math.sin(t),roof(q.x+r*math.cos(t),q.y+r*math.sin(t))+.18+.3*math.sqrt(max(0,1-(r/.78)**2))) for r,t in [(r0,aa),(r1,aa),(r1,bb),(r0,bb)]]
   F('Round rooflight glass','Yueya glazing',points[:3] if k==0 else points)
# The circular front recess is open to sky and has a walkable ring around a small planted centre.
court=round_court.intersection(outline).union(box(23,-6,33,6))
soil=Point(28,6).buffer(5.1,quad_segs=48)
front_road_surface=unary_union([allshapes[i] for i in ['way/479420775','way/411343661','way/479420776']]).buffer(3.5,cap_style=2,join_style=1)
court_paved=G(court.difference(soil)).difference(front_road_surface)
slab('Circular forecourt paving','paving',court_paved,0,.15)
S('Circular forecourt soil','Yueya soil',soil,.01,.09);S('Circular forecourt lawn','meadow',soil.buffer(-.1),.10,.025)
# Rectangular light court is a true open space with covered upper circulation on each side.
S('Rectangular light court floor','paving',rect_court,0,.15)
for z in [3.75,7.35]:
 gallery=rect_court.buffer(1.8,join_style=2).difference(rect_court).intersection(solid).intersection(box(-110,max(0,(z+2.6-5.8)/.19),110,75))
 S('Light court gallery slab','Yueya white',gallery,z-.18,.18)
 for p,q in zip(list(rect_court.exterior.coords),list(rect_court.exterior.coords)[1:]):
  if roof(*p)<z+1.2 or roof(*q)<z+1.2:continue
  B('Light court gallery rail','Yueya frame',(*p,z+1.1),(*q,z+1.1),.04)
  ll=LineString([p,q])
  for i in range(math.ceil(ll.length/1.2)+1):
   pp=ll.interpolate(min(ll.length,i*1.2));B('Light court gallery posts','Yueya frame',(pp.x,pp.y,z),(pp.x,pp.y,z+1.1),.025)
# Two matched oval service cores, visually coherent, with banded upper windows.
for xx in [-21.5,21.5]:
 cp=scale(Point(xx,53.5).buffer(1,quad_segs=48),4.3,6.1,origin=(xx,53.5));base=roof(xx,53.5)-.2
 S('North paired oval cores','Yueya stone',cp,.15,base+8.6-.15)
 S('North core warm caps','bronze',cp.buffer(.12),base+8.6,.18)
 for z in [base+2.0,base+3.1,base+4.2]:
  S('Oval core glazed bands','Yueya glass',cp.buffer(.035).difference(cp.buffer(-.05)),z,.60)
  S('Oval core white bands','Yueya white',cp.buffer(.13).difference(cp.buffer(-.04)),z+.60,.10)
# Ground entry doors and a canopy with enough clear height above the approach.
for xx in [-17,-11]:
 C('Yueya entrance doors','Yueya glazing',(xx,.30,1.95),(5.7,.12,3.6))
 for dx in [-2.85,-1.2,0,1.2,2.85]:C('Yueya door frames','Yueya frame',(xx+dx,.20,1.95),(.06,.20,3.6))
 for dx in [-.18,.18]:B('Yueya door handles','bronze',(xx+dx,.10,1.1),(xx+dx,.10,1.8),.024)
S('Yueya entrance canopy','Yueya white',box(-22,-4,-6,1.0),4.4,.18)
for xx in [-21,-7]:B('Yueya canopy posts','Yueya frame',(xx,.65,.15),(xx,.65,4.4),.10)
# Close entrance sidelights and transom without laying a second sheet over each door.
for x0,x1 in [(-24,-19.85),(-14.15,-13.85),(-8.15,-5)]:
 F('Yueya entrance sidelights','Yueya glazing',[(x0,.34,.15),(x1,.34,.15),(x1,.34,3.75),(x0,.34,3.75)])
F('Yueya entrance transom','Yueya glazing',[(-24,.34,3.75),(-5,.34,3.75),(-5,.34,5.7),(-24,.34,5.7)])
# Authored two-flight foyer stair; the upper floor has a matching real opening.
for i in range(12):
 y0=6+i*.30;top=.15+(i+1)*.15
 S('Foyer lower stair flight','Yueya white',box(-20,y0,-17,y0+.30),top-.18,.18)
 y1=9.6-i*.30;top=1.95+(i+1)*.15
 S('Foyer return stair flight','Yueya white',box(-16,y1-.30,-13,y1),top-.18,.18)
profile_slab('Lower stair structural waist','Yueya stone',G(box(-20,6,-17,9.6)),lambda x,y:.15+(local((x,y))[1]-6)*.5,.25)
profile_slab('Return stair structural waist','Yueya stone',G(box(-16,6,-13,9.6)),lambda x,y:1.95+(9.6-local((x,y))[1])*.5,.25)
S('Foyer stair middle landing','Yueya white',box(-20,9.6,-13,12),1.75,.20)
for x in [-19.7,-13.3]:
 for y in [10,11.6]:C('Foyer stair landing supports','Yueya stone',(x,y,.95),(.30,.30,1.6))
for x in [-20,-17]:
 B('Foyer stair lower handrails','bronze',(x,6,1.25),(x,9.6,2.90),.035)
 for i in range(0,13,3):B('Foyer stair lower posts','Yueya frame',(x,6+i*.30,.15+min(12,i+1)*.15),(x,6+i*.30,1.25+i*1.65/12),.025)
for x in [-16,-13]:
 B('Foyer stair return handrails','bronze',(x,9.6,3.05),(x,6,4.70),.035)
 for i in range(0,13,3):B('Foyer stair return posts','Yueya frame',(x,9.6-i*.30,1.95+min(12,i+1)*.15),(x,9.6-i*.30,3.05+i*1.65/12),.025)
for aa,bb in [((-20,12,2.90),(-13,12,2.90)),((-20,9.6,2.90),(-20,12,2.90)),((-13,9.6,2.90),(-13,12,2.90))]:B('Foyer landing guards','bronze',aa,bb,.035)
for aa,bb in [((-20,12),(-13,12)),((-20,9.6),(-20,12)),((-13,9.6),(-13,12))]:
 ll=LineString([aa,bb])
 for i in range(math.ceil(ll.length/1.2)+1):
  pp=ll.interpolate(min(ll.length,i*1.2));B('Middle landing guard posts','Yueya frame',(pp.x,pp.y,1.95),(pp.x,pp.y,2.90),.025)
for aa,bb in [((-20.4,5.7),(-16,5.7)),((-20.4,5.7),(-20.4,12)),((-20.4,12),(-12.6,12)),((-12.6,12),(-12.6,5.7))]:
 B('Upper stair opening guard','bronze',(*aa,4.85),(*bb,4.85),.035)
 ll=LineString([aa,bb])
 for i in range(math.ceil(ll.length/1.2)+1):
  pp=ll.interpolate(min(ll.length,i*1.2));B('Upper stair guard posts','Yueya frame',(pp.x,pp.y,3.75),(pp.x,pp.y,4.85),.025)
# A real top landing joins the final tread to the cut upper slab, with continuous rails.
S('Foyer stair top landing','Yueya white',box(-16,5.7,-13,6.0),3.53,.22)
for x in [-16,-13]:
 B('Upper rail landing transition','bronze',(x,6,4.70),(x,5.7,4.85),.035)
 B('Lower rail landing transition','bronze',(x,9.6,3.05),(x,9.9,2.90),.035)
B('Upper right guard return','bronze',(-13,5.7,4.85),(-12.6,5.7,4.85),.035)
for x in [-20,-17]:
 for j in range(24):
  t=(j+.5)/24;y=6+3.6*t;floor=.15+math.ceil(t*12)*.15
  B('Lower stair guard infill','Yueya frame',(x,y,floor+.06),(x,y,1.25+1.65*t),.013,sides=6)
for x in [-16,-13]:
 for j in range(24):
  t=(j+.5)/24;y=9.6-3.6*t;floor=1.95+math.ceil(t*12)*.15
  B('Return stair guard infill','Yueya frame',(x,y,floor+.06),(x,y,3.05+1.65*t),.013,sides=6)
for level,segments in [(1.95,[((-20,12),(-13,12)),((-20,9.6),(-20,12)),((-13,9.6),(-13,12))]),(3.75,[((-20.4,5.7),(-16,5.7)),((-20.4,5.7),(-20.4,12)),((-20.4,12),(-12.6,12)),((-12.6,12),(-12.6,5.7))])]:
 for aa,bb in segments:
  ll=LineString([aa,bb]);count=math.ceil(ll.length/.16)
  for i in range(count):
   pp=ll.interpolate(ll.length*(i+.5)/count);B('Landing guard infill','Yueya frame',(pp.x,pp.y,level+.06),(pp.x,pp.y,level+(.95 if level<3 else 1.1)),.013,sides=6)
# Two distinct, usable secondary entrances: the circular court and the north arrival.
for owner,xx,yy,width,height in [('Round court',28,16.72,4.4,3.2),('North',0,60.38,12.6,3.2)]:
 C(owner+' glazed entrance','Yueya glazing',(xx,yy,.15+height/2),(width,.14,height))
 for off in ([-6.3,-3.15,-1.2,0,1.2,3.15,6.3] if owner=='North' else [-2.2,-1.1,0,1.1,2.2]):
  x=xx+off;C(owner+' doorframes','Yueya frame',(x,yy,.15+height/2),(.06,.22,height))
 for off in [-.18,.18]:B(owner+' door handles','bronze',(xx+off,yy+(.15 if owner=='North' else -.15),1.1),(xx+off,yy+(.15 if owner=='North' else -.15),1.8),.023)
for xx in [25.65,30.35]:C('Round court door jambs','Yueya frame',(xx,16.80,1.75),(.18,.40,3.2))
for x0,x1 in [(-9,-6.3),(6.3,9)]:F('North entrance sidelights','Yueya glazing',[(x0,60.35,.15),(x1,60.35,.15),(x1,60.35,3.35),(x0,60.35,3.35)])
S('Round court threshold','paving',box(25.6,16.5,30.4,17.5).intersection(outline),0,.15)
S('North entrance canopy','Yueya white',box(-8,59.8,8,64.0),4.2,.20)
for x in [-7.5,7.5]:B('North canopy columns','Yueya frame',(x,61,.15),(x,61,4.2),.10)
# A quiet planted court, with benches around but not through the circulation ring.
configure_leaf_materials();mat('Court lawn',(.35,.40,.28),0,.9)
S('Round court grass surface','Court lawn',soil.buffer(-.12),.13,.01)
tree_point=world(28,6);broadleaf(tree_point[0],tree_point[1],.62,1801)
for side in [0,math.pi]:
 for j in range(20):
  t=side+math.radians(-45+j*90/19)
  for strip in range(4):
   rr=5.65+strip*.12;C('Circular court bench slats','wood',(28+rr*math.cos(t),6+rr*math.sin(t),.59),(.40,.105,.075),t+math.pi/2)
 for degrees in [-40,0,40]:
  t=side+math.radians(degrees)
  for rr in [5.67,6.0]:C('Circular court bench legs','Yueya frame',(28+rr*math.cos(t),6+rr*math.sin(t),.35),(.055,.055,.40),t+math.pi/2)
  C('Circular court bench crossbars','Yueya frame',(28+5.835*math.cos(t),6+5.835*math.sin(t),.53),(.06,.43,.06),t+math.pi/2)
# Source road and pedestrian network, including building_passage, remains ground-connected.
roads=[];walks=[]
bridge_id='way/411343571';bridge=allshapes[bridge_id];deck=bridge.buffer(4.9,cap_style=2)
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or f['id']==bridge_id or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 walking=p.get('highway') in ['footway','path','pedestrian','steps'];surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.6 if walking else 3.5,cap_style=2,join_style=1)
 (walks if walking else roads).append(surface.intersection(clip))
road=unary_union(roads).difference(wet).difference(foot).difference(deck)
walk=unary_union(walks).union(foot.buffer(4)).union(G(court)).difference(foot).difference(wet).difference(road).difference(deck).intersection(clip)
walk=walk.difference(court_paved)
walk=add_yueya_forecourt(road,wet,foot,walk,clip,G,world,local)
slab('Yueya source roads','road',road,0,.12);slab('Yueya paths and entrances','paving',walk,0,.15)
for y in [-8.8,-8,-7.2,-6.4,-5.6,-4.8,-4,-3.2,-2.4]:
 slab('Round court pedestrian crossing','mark',G(box(26,y-.20,30,y+.20)).intersection(road),.125)
# Northern source bridge with continuous grade, real deck and parapets, above the water.
ba=Vector(bridge.coords[0]);bb=Vector(bridge.coords[-1]);bu=(bb-ba).normalized();bv=Vector((-bu.y,bu.x));bl=(bb-ba).length
fraction=lambda x,y:max(0,min(1,(Vector((x,y))-ba).dot(bu)/bl))
bz=lambda x,y:.12+.50*math.sin(math.pi*fraction(x,y))**2
profile_slab('Yueya north bridge structure','Yueya stone',deck,bz,.38)
profile_slab('Yueya north bridge road','road',bridge.buffer(3.5,cap_style=2),lambda x,y:bz(x,y)+.02,.03)
for side in [-1,1]:
 strip=LineString([tuple(ba+bv*(side*4.2)),tuple(bb+bv*(side*4.2))]).buffer(.7,cap_style=2)
 profile_slab('Yueya bridge walking strips','paving',strip,lambda x,y:bz(x,y)+.03+.07*math.sin(math.pi*fraction(x,y))**2,.06)
for side in [-1,1]:
 for i in range(math.ceil(bl/1.5)):
  t0=i/math.ceil(bl/1.5);t1=(i+1)/math.ceil(bl/1.5);p=ba+bu*(bl*t0)+bv*(side*4.7);q=ba+bu*(bl*t1)+bv*(side*4.7)
  beam('Yueya bridge handrail','bronze',(*p,bz(*p)+1.15),(*q,bz(*q)+1.15),.045,sides=8)
  beam('Yueya bridge balusters','Yueya white',(*p,bz(*p)+.1),(*p,bz(*p)+1.15),.06,sides=8)
for t in [.05,.35,.65,.95]:
 p=ba+bu*(bl*t)
 for side in [-1,1]:
  q=p+bv*(side*3.7);cube('Yueya north bridge piers','Yueya stone',(*q,(-1.6+bz(*q)-.38)/2),(.70,.70,bz(*q)-.38+1.6))
# Mesh creation and explicit source metadata.
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(M[material]);ob['designRole']=owner
 if (owner,material) in foliage_uv:
  layer=mesh.uv_layers.new(name='Leaf albedo UV')
  for poly,uvs in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for loop,uv in zip(poly.loop_indices,uvs):layer.data[loop].uv=uv
 if owner=='Circular court bench slats':
  modifier=ob.modifiers.new('Soft timber edges','BEVEL');modifier.width=.012;modifier.segments=3
root=bpy.data.objects.new('Yueya building and north bridge — authored WIP',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=[source_id,bridge_id];root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['sourceGeometryUnchanged']=True;root['status']='WORK_IN_PROGRESS';root['displayFootprint']=foot.wkt;root['displayWalk']=walk.wkt;root['bridgeDeckFootprint']=deck.wkt
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'yueya_landscape.py')]:bpy.data.texts.new(name).write(path.read_text())
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
world_mat=bpy.data.worlds.new('Yueya daylight');scene.world=world_mat;world_mat.use_nodes=True;world_mat.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world_mat.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
mat('Yueya diffuser',(.95,.92,.83),0,.4)
shader=M['Yueya diffuser'].node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(1,.95,.85,1);shader.inputs['Emission Strength'].default_value=3
for xx,yy,zz in [(-18,-2,4.34),(-10,-2,4.34),(-14,2,5.85),(-18.5,8,7.0),(-14.5,8,7.0)]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=world(xx,yy,zz));ob=bpy.context.object;ob.name='Yueya foyer luminaire';ob.dimensions=(.70,.35,.04);ob.rotation_euler.z=angle;ob.data.materials.append(M['Yueya diffuser']);ob.parent=root
 bpy.ops.object.light_add(type='AREA',location=world(xx,yy,zz-.04));ob=bpy.context.object;ob.name='Yueya foyer downlight';ob.data.energy=150 if yy<0 else 500;ob.data.shape='RECTANGLE';ob.data.size=.65;ob.data.size_y=.30;ob.data.color=(1,.95,.88);ob.parent=root
bpy.ops.object.text_add(location=world(-14,-.03,3.90),rotation=(math.pi/2,0,angle));ob=bpy.context.object;ob.name='Yueya entrance identity';ob.data.body='月牙楼';ob.data.align_x='CENTER';ob.data.size=.45;ob.data.extrude=.004;ob.data.font=bpy.data.fonts.load('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');ob.data.materials.append(M['bronze']);bpy.ops.object.convert(target='MESH');ob.parent=root
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),64);scene.cycles.use_denoising=False;scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('yueya-overview',world(120,-160,150),world(0,26,8),225,32),('yueya-front-entry',world(-14,-13,1.85),world(-14,3,3),None,24),('yueya-round-court',world(28,-7,1.85),world(28,14,4),None,24),('yueya-north-bridge',tuple(ba+bu*3)+(1.85,),world(0,60,8),None,28)]
views.append(('yueya-front-gardens',world(8,-36,1.85),world(-8,-17,1.5),None,26))
views.append(('yueya-stair-upper-landing',world(-14.5,4.7,5.45),world(-18,10,2.6),None,24))
views.append(('yueya-north-arrival',world(0,72,1.85),world(0,60,3),None,24))
views.extend([('yueya-foyer-stair',world(-23,3,1.85),world(-17,9,2.2),None,24),('yueya-bridge-water',(ba.x+bv.x*9+bu.x*24,ba.y+bv.y*9+bu.y*24,-.40),(ba.x+bu.x*24,ba.y+bu.y*24,-.65),None,28)])
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
for i,(name,eye,target,ortho,lens) in enumerate(views):
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'yueya-and-north-bridge.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('YUEYA INITIAL WORK DRAFT — NOT ACCEPTED; SOURCE AND HUMAN-SCALE REVIEW REMAIN')
