"""Two separately designed short crossings, using three retained bridge source lines.
Shapes/materials are authored; no source routing or geography is overwritten.
"""
from architecture_primitives import *
CROSSING_SOURCES={'West short bridge':['way/1032412967','way/1073557356'],'South timber footbridge':['way/305829535'],'Northwest service crossing':['way/411343588','way/411343677']}

def add_lakeside_crossings(wet):
 mat('Crossing sandstone',(.74,.69,.59),0,.72)
 mat('Crossing timber',(.32,.235,.15),0,.76)
 mat('Crossing metal',(.18,.17,.15),.55,.40)
 decks=[];road_caps=[];walk_caps=[]
 # The west road and parallel footway are one low structure, not disconnected strips.
 car_axis=allshapes['way/1032412967'];foot_axis=allshapes['way/1073557356']
 a=Vector(car_axis.coords[0]);b=Vector(car_axis.coords[-1]);u=(b-a).normalized();v=Vector((-u.y,u.x));length=(b-a).length
 car=car_axis.buffer(3.5,cap_style=2);foot=foot_axis.buffer(1.6,cap_style=2);deck=car.union(foot).convex_hull
 car=LineString([tuple(a-u),tuple(b+u)]).buffer(3.5,cap_style=2).intersection(deck)
 foot=foot.difference(car.buffer(.002));median=deck.difference(car.buffer(.002)).difference(foot.buffer(.002))
 slab('West short bridge structural deck','Crossing sandstone',deck,-.32,.40)
 slab('West short bridge asphalt','road',car,.08,.04)
 slab('West short bridge walking surface','paving',foot.union(median),.08,.07)
 # Edge beams and separate pairs of modest abutments leave the channel open beneath.
 for axis,offset in [(car_axis,-3.40),(foot_axis,1.50)]:
  aa=Vector(axis.coords[0]);bb=Vector(axis.coords[-1]);uu=(bb-aa).normalized();vv=Vector((-uu.y,uu.x));count=math.ceil((bb-aa).length/1.6)
  for i in range(count):
   p=aa.lerp(bb,i/count)+vv*offset;q=aa.lerp(bb,(i+1)/count)+vv*offset
   beam('West short bridge top rail','bronze',(*p,1.23),(*q,1.23),.04,sides=8)
   beam('West short bridge lower rail','bronze',(*p,.35),(*q,.35),.025,sides=6)
   cube('West short bridge stone posts','Crossing sandstone',(*p,.69),(.13,.13,1.08))
   for j in range(1,10):
    r=p.lerp(q,j/10);beam('West short bridge balusters','bronze',(*r,.35),(*r,1.23),.012,sides=5)
  p=bb+vv*offset;cube('West short bridge stone posts','Crossing sandstone',(*p,.69),(.13,.13,1.08))
 for t in [.12,.88]:
  centre=a.lerp(b,t)+v*2.0
  if not wet.covers(Point(*centre)):cube('West short bridge abutments','Crossing sandstone',(*centre,-.55),(1.0,11.0,1.30),math.atan2(u.y,u.x))
 for offset in [0,5.5]:cube('West short bridge underside girders','Crossing metal',(*((a+b)*.5+v*offset),-.23),(length,.25,.22),math.atan2(u.y,u.x))
 for station in range(3,int(length)-2,6):
  strip=LineString([tuple(a+u*station),tuple(a+u*(station+2))]).buffer(.035,cap_style=2)
  slab('West short bridge centre markings','mark',strip.intersection(car),.126)
 decks.append(deck);road_caps.extend([Point(*a).buffer(3.5),Point(*b).buffer(3.5)])
 walk_caps.extend([Point(*foot_axis.coords[0]).buffer(1.6),Point(*foot_axis.coords[-1]).buffer(1.6)])
 # The south pedestrian crossing uses a warm timber deck with a gentle continuous rise.
 source_axis=allshapes['way/305829535']
 # A routing node lies on the service-road centreline, not at the physical road edge.
 road_surface=allshapes['way/424012289'].buffer(3.5,cap_style=2,join_style=1)
 remaining=source_axis.difference(road_surface)
 axis=remaining if remaining.geom_type=='LineString' else max((g for g in remaining.geoms if g.geom_type=='LineString'),key=lambda g:g.length)
 a=Vector(axis.coords[0]);b=Vector(axis.coords[-1]);u=(b-a).normalized();v=Vector((-u.y,u.x));length=(b-a).length
 deck=source_axis.buffer(1.6,cap_style=2).difference(road_surface)
 def xy(x,y):return tuple(a+u*x+v*y)
 def height(x,y):
  t=max(0,min(1,(Vector((x,y))-a).dot(u)/length));return .15-.03*t+.70*math.sin(math.pi*t)**2
 profile_slab('South timber footbridge substructure','Crossing metal',deck,lambda x,y:height(x,y)-.07,.18)
 extent=max((Vector(p)-a).dot(u) for polygon in polygons(deck) for p in polygon.exterior.coords)
 count=math.ceil(extent/.22)
 for i in range(count):
  x0=extent*i/count+.006;x1=extent*(i+1)/count-.006
  board=Polygon([xy(x0,-1.6),xy(x1,-1.6),xy(x1,1.6),xy(x0,1.6)])
  profile_slab('South timber footbridge deck boards','Crossing timber',board.intersection(deck),height,.07)
 for side in [-1,1]:
  edge=LineString([tuple(Vector(source_axis.coords[0])+v*(side*1.5)),tuple(Vector(source_axis.coords[-1])+v*(side*1.5))]).difference(road_surface)
  if edge.geom_type!='LineString':edge=max((g for g in edge.geoms if g.geom_type=='LineString'),key=lambda g:g.length)
  count=math.ceil(edge.length/1.7)
  for i in range(count):
   pp=edge.interpolate(edge.length*i/count);qq=edge.interpolate(edge.length*(i+1)/count);p=Vector((pp.x,pp.y));q=Vector((qq.x,qq.y));zp=height(*p);zq=height(*q)
   beam('South timber footbridge handrails','Crossing timber',(*p,zp+1.12),(*q,zq+1.12),.05,sides=8)
   beam('South timber footbridge lower rails','Crossing metal',(*p,zp+.22),(*q,zq+.22),.025,sides=6)
   beam('South timber footbridge posts','Crossing metal',(*p,zp-.10),(*p,zp+1.12),.045,sides=8)
   for j in range(1,12):
    r=p.lerp(q,j/12);z=height(*r);beam('South timber footbridge balusters','Crossing metal',(*r,z+.22),(*r,z+1.12),.012,sides=5)
  p=Vector(edge.coords[-1]);z=height(*p);beam('South timber footbridge posts','Crossing metal',(*p,z-.10),(*p,z+1.12),.045,sides=8)
 for t in [.2,.4,.6,.8]:
  p=a.lerp(b,t)
  for side in [-1,1]:
   q=p+v*(side*1.0);z=height(*q);base=-1.6 if wet.covers(Point(*q)) else -.15
   beam('South timber footbridge piers','Crossing sandstone',(*q,base),(*q,z-.25),.18,sides=10)
 decks.append(deck);walk_caps.extend([Point(*a).buffer(1.6),Point(*b).buffer(1.6)])
 # The source bridge tag ends at the tributary centreline. Follow the connected road for 4 m
 # so the displayed structure reaches the far bank, without editing that source node or route.
 source_axis=allshapes['way/411343588'];continuation=allshapes['way/411343677'];end=continuation.interpolate(4.0)
 axis=LineString([*source_axis.coords,(end.x,end.y)]);deck=axis.buffer(3.5,cap_style=2,join_style=1)
 slab('Northwest service crossing deck','Crossing sandstone',deck,-.32,.40)
 slab('Northwest service crossing road','road',deck,.08,.04)
 aa=Vector(axis.coords[0]);bb=Vector(axis.coords[-1]);uu=(bb-aa).normalized();vv=Vector((-uu.y,uu.x));count=math.ceil((bb-aa).length/1.8)
 for side in [-1,1]:
  for i in range(count):
   p=aa.lerp(bb,i/count)+vv*(side*3.45);q=aa.lerp(bb,(i+1)/count)+vv*(side*3.45)
   beam('Northwest service crossing handrail','bronze',(*p,1.22),(*q,1.22),.035,sides=8)
   beam('Northwest service crossing lower rail','bronze',(*p,.32),(*q,.32),.025,sides=6)
   cube('Northwest service crossing posts','Crossing sandstone',(*p,.67),(.12,.12,1.10))
   for j in range(1,12):
    r=p.lerp(q,j/12);beam('Northwest service crossing infill','bronze',(*r,.32),(*r,1.22),.012,sides=5)
  p=bb+vv*(side*3.45);cube('Northwest service crossing posts','Crossing sandstone',(*p,.67),(.12,.12,1.10))
 for t in [.10,.90]:
  p=aa.lerp(bb,t)
  if wet.buffer(.4).covers(Point(*p)):continue
  cube('Northwest service crossing abutments','Crossing sandstone',(*p,-.65),(.85,7.0,1.46),math.atan2(uu.y,uu.x))
 decks.append(deck);road_caps.extend([Point(*aa).buffer(3.5),Point(*bb).buffer(3.5)])
 return unary_union(decks),road_caps,walk_caps
