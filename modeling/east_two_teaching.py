"""Source-specific East Two U-shaped teaching building, unfinished authored interior."""
from architecture_primitives import *
import east_stair_core as stair
from landscape_primitives import configure_leaf_materials,broadleaf,shrub
FOOT=allshapes['way/161325385']
STAIRS=[(-35.5,331.4),(-35.5,379.4)]
HOLES=unary_union([box(x,y,x+3.2,y+3.9) for x,y in STAIRS])
PASSAGE=box(-13,310,-7,400).union(box(-48,352,42,358))
COURT=max(polygons(FOOT.convex_hull.difference(FOOT)),key=lambda p:p.area)

def guard(name,a,b,z):
 beam(name+' rail','Culture bronze',(*a,z+1.1),(*b,z+1.1),.03,sides=6)
 n=max(1,math.ceil(math.dist(a,b)/.15))
 for j in range(n+1):
  x=a[0]+(b[0]-a[0])*j/n;y=a[1]+(b[1]-a[1])*j/n
  beam(name+' infill','Culture bronze',(x,y,z),(x,y,z+1.1),.015,sides=6)

def build(gallery):
 lawn=COURT.buffer(-3).difference(PASSAGE)
 slab('East Two connected courtyard paving','paving',COURT.difference(lawn),0,.15)
 slab('East Two authored courtyard lawns','meadow',lawn,0,.12)
 configure_leaf_materials()
 for j,(x,y,size) in enumerate([(-25,346.5,.68),(7,364,.75)]):
  if lawn.buffer(-1).covers(Point(x,y)):broadleaf(x,y,size,seed=7100+j)
 for j,(x,y,size) in enumerate([(-25,364,1.0),(-30,346,1.0),(14,364,1.1),(14,346,1.1)]):
  if lawn.buffer(-.6).covers(Point(x,y)):shrub('East Two courtyard understory '+str(j),x,y,.12,size,seed=7130+j)
 for x,y,back in [(-25,353,-1),(8,357,1)]:
  if not COURT.difference(lawn).covers(box(x-1.1,y-.3,x+1.1,y+.3)):continue
  for k in range(4):cube('East Two court bench seats','wood',(x,y+(k-1.5)*.10,.59),(2.1,.085,.055))
  for z in [.78,.93]:cube('East Two court bench backs','wood',(x,y+back*.20,z),(2.1,.055,.12))
  for xx in [x-.85,x+.85]:
   for yy in [y-.17,y+.17]:beam('East Two court bench legs','Culture bronze',(xx,yy,.15),(xx,yy,.56),.028,sides=6)
   beam('East Two court bench back supports','Culture bronze',(xx,y+back*.20,.15),(xx,y+back*.20,1.0),.025,sides=6)
 slab('East Two third floor','Culture white',FOOT.difference(HOLES),6.35,.20)
 slab('East Two calm roof','Culture white',FOOT.buffer(.18),9.55,.24)
 slab('East Two low parapet','Culture white',FOOT.difference(FOOT.buffer(-.16)),9.79,.22)
 for poly in polygons(FOOT):
  for ring in [orient(poly,1).exterior,*orient(poly,1).interiors]:
   pts=list(ring.coords)
   for a,b in zip(pts,pts[1:]):
    for lo in [.15,3.35,6.55]:
     run=LineString([a,b])
     if lo<1:run=run.difference(PASSAGE)
     pieces=[run] if run.geom_type=='LineString' else [g for g in getattr(run,'geoms',[]) if g.geom_type=='LineString']
     for segment in pieces:
      if segment.length<.08:continue
      a0=Vector(segment.coords[0]);b0=Vector(segment.coords[-1]);v=b0-a0;length=v.length;v.normalize();n=Vector((v.y,-v.x));angle=math.atan2(v.y,v.x);count=max(1,round(length/3.4));step=length/count
      for j in range(count):
       p=a0+v*(j+.5)*step
       if lo<6 and gallery.buffer(.06).covers(Point(*p)):continue
       cube('East Two facade piers','Culture white',(*(p-v*step/2),lo+1.6),(.24,.28,3.2),angle)
       cube('East Two facade sill','limestone',(*(p+n*.015),lo+.30),(step,.22,.60),angle)
       cube('East Two facade glazing','Culture glazing' if (lo>6 and p.x<-38) or (lo<1 and -30<p.x<-18 and p.y<374) else 'Culture opaque glass',(*(p+n*.035),lo+1.80),(max(.02,step-.24),.11,2.40),angle)
       for q in [-step/2,0,step/2]:cube('East Two vertical window frames','Culture bronze',(*(p+v*q+n*.10),lo+1.80),(.04,.14,2.4),angle)
       cube('East Two horizontal window frames','Culture bronze',(*(p+n*.11),lo+1.9),(step-.24,.15,.035),angle)
 lamps=[]
 for x,y in STAIRS:
  for lo in [.15,3.35]:
   stair.stair_flight('East Two first flights',x,x+1.35,y,lo,.16,1)
   stair.stair_flight('East Two returning flights',x+1.85,x+3.2,y+2.6,lo+1.6,.16,-1)
   slab('East Two middle landings','Culture white',box(x,y+2.6,x+3.2,y+3.9),lo+1.4,.20)
   for xx in [x+.05,x+1.30,x+1.90,x+3.15]:
    reverse=xx>x+1.6;start=y+2.6 if reverse else y;direction=-1 if reverse else 1;base=lo+(1.6 if reverse else 0)
    beam('East Two stair handrails','Culture bronze',(xx,start,base+1.1),(xx,start+direction*2.6,base+2.7),.03,sides=6)
    for j in range(11):
     yy=start+direction*j*.26;z=base+j*.16
     beam('East Two stair guards','Culture bronze',(xx,yy,z),(xx,yy,z+1.1),.018,sides=6)
   for a,b in [((x,y+2.6),(x,y+3.9)),((x,y+3.9),(x+3.2,y+3.9)),((x+3.2,y+3.9),(x+3.2,y+2.6))]:guard('East Two middle landing',a,b,lo+1.6)
  for z in [3.35,6.55]:
   for a,b in [((x,y),(x,y+3.9)),((x,y+3.9),(x+3.2,y+3.9)),((x+3.2,y+3.9),(x+3.2,y))]:guard('East Two upper opening',a,b,z)
   guard('East Two landing front', (x if z>6 else x+1.35,y),(x+1.85,y),z)
  for z in [3.12,6.32,9.52]:
   cube('East Two stair ceiling panel','porcelain',(x+1.6,y-.65,z),(.9,.35,.06));lamps.append((x+1.6,y-.65,z-.04,230))
  for z in [4.72,9.52]:
   cube('East Two middle landing ceiling panel','porcelain',(x+1.6,y+3.25,z),(.9,.35,.06));lamps.append((x+1.6,y+3.25,z-.04,230))
 for x,y in [(-10,320),(-10,326),(-10,333),(-10,376),(-10,383),(-10,390),(-39,355)]:
  cube('East Two passage ceiling panel','porcelain',(x,y,3.12),(.9,.35,.06));lamps.append((x,y,3.08,220))
 return lamps


def build_seminar():
 """One authored ten-seat seminar room beside the north stair, not an as-built room plan."""
 floor=.15;ceiling=3.15
 mat('East Two seminar upholstery',(.08,.085,.08),0,.92)
 outer=box(-29.15,369.8,-18.85,386.15);inner=box(-29,369.6,-19,386)
 doorway=box(-29.3,377.5,-28.8,379.0)
 slab('East Two seminar partitions','Culture white',outer.difference(inner).difference(doorway).intersection(FOOT),floor,3.0)
 cube('East Two seminar door lintel','Culture white',(-29.075,378.25,2.80),(.15,1.5,.70))
 hinge=Vector((-29.075,377.5));v=Vector((math.sin(math.radians(80)),math.cos(math.radians(80))))
 cube('East Two seminar open door','wood',(*(hinge+v*.75),1.30),(1.5,.07,2.3),math.atan2(v.y,v.x))
 p=hinge+v*1.3;beam('East Two seminar door handle','Culture bronze',(*p,1.10),(*p,1.35),.02,sides=6)
 # The oval leaves rounded walking corners rather than a desk-grid copy of East One.
 table=scale(Point(-24,378.5).buffer(1,quad_segs=48),1.2,3.0,origin=(-24,378.5))
 slab('East Two seminar oval table','wood',table,floor+.72,.06)
 for y in [377.1,379.9]:
  beam('East Two seminar table pedestals','Culture bronze',(-24,y,floor),(-24,y,floor+.72),.13,sides=16)
  slab('East Two seminar table feet','Culture bronze',Point(-24,y).buffer(.48,quad_segs=32),floor,.035)
 seats=[(x,y) for x in [-25.85,-22.15] for y in [376.2,377.7,379.2,380.7]]+[(-24,374.6),(-24,382.4)]
 for x,y in seats:
  angle=math.atan2(y-378.5,x+24)-math.pi/2;ca,sa=math.cos(angle),math.sin(angle)
  def p(dx,dy,z):return (x+dx*ca-dy*sa,y+dx*sa+dy*ca,z)
  cube('East Two seminar chair seats','East Two seminar upholstery',(x,y,floor+.46),(.52,.50,.07),angle)
  cube('East Two seminar chair backs','East Two seminar upholstery',p(0,.23,floor+.74),(.52,.07,.48),angle)
  for a in [-.20,.20]:
   for b in [-.19,.19]:beam('East Two seminar chair legs','Culture bronze',p(a,b,floor),p(a,b,floor+.425),.022,sides=6)
 cube('East Two seminar board backing','Culture bronze',(-24,385.96,1.85),(3.8,.08,1.4))
 cube('East Two seminar whiteboard','porcelain',(-24,385.9075,1.85),(3.68,.025,1.28))
 cube('East Two seminar marker ledge','Culture bronze',(-24,385.79,1.20),(3.7,.24,.035))
 # A low cabinet and window seat make distinct discussion and pause areas.
 cube('East Two seminar cabinet','wood',(-19.36,383.5,.76),(.55,3.0,1.22))
 for y in [382.4,383.15,383.9,384.65]:
  cube('East Two seminar cabinet door','Culture white',(-19.65,y,.79),(.035,.71,1.13))
  beam('East Two seminar cabinet handle','Culture bronze',(-19.68,y+.20,.75),(-19.68,y+.20,.95),.014,sides=6)
 cube('East Two seminar window bench','wood',(-24,372.3,.62),(3.8,.55,.07))
 for x in [-25.5,-22.5]:cube('East Two seminar window bench legs','Culture bronze',(x,372.3,.37),(.065,.45,.44))
 for y in [377.4,379.3]:
  cube('East Two seminar tabletop notes','Culture bronze',(-24,y,.945),(.3,.4,.03),.12)
  cube('East Two seminar tabletop paper','porcelain',(-24,y,.964),(.285,.385,.008),.12)
 lamps=[]
 for x in [-26.5,-21.5]:
  for y in [375,382]:
   cube('East Two seminar ceiling panels','porcelain',(x,y,ceiling-.035),(1.0,.40,.07));lamps.append((x,y,ceiling-.08,180))
 return lamps
