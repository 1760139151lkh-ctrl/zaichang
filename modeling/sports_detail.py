"""Hand-composed dual-track precinct, source anchored; no routing edits or acceptance claim."""
import sys, math, json, hashlib
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf,shrub
from shapely.ops import nearest_points
OUT=ROOT/'modeling/sports-work';OUT.mkdir(exist_ok=True)
mat('track_clay',(.38,.22,.15),0,.88)
mat('turf_soft',(.19,.24,.135),0,.90)
mat('turf_stripe',(.215,.265,.16),0,.90)
mat('runoff',(.41,.43,.37),0,.86)
mat('ivory',(.82,.80,.71),0,.56)
mat('paving',(.52,.50,.44),0,.83)
mat('planting_soil',(.14,.10,.065),0,.95)
soil_nodes=M['planting_soil'].node_tree.nodes;soil_links=M['planting_soil'].node_tree.links
soil_position=soil_nodes.new('ShaderNodeTexCoord');soil_noise=soil_nodes.new('ShaderNodeTexNoise');soil_noise.inputs['Scale'].default_value=60;soil_noise.inputs['Detail'].default_value=3
soil_ramp=soil_nodes.new('ShaderNodeValToRGB');soil_ramp.color_ramp.elements[0].color=(.07,.045,.025,1);soil_ramp.color_ramp.elements[1].color=(.19,.14,.09,1)
soil_bump=soil_nodes.new('ShaderNodeBump');soil_bump.inputs['Strength'].default_value=.20;soil_bump.inputs['Distance'].default_value=.005
soil_links.new(soil_position.outputs['Object'],soil_noise.inputs['Vector']);soil_links.new(soil_noise.outputs['Fac'],soil_ramp.inputs['Fac']);soil_links.new(soil_ramp.outputs['Color'],soil_nodes.get('Principled BSDF').inputs['Base Color']);soil_links.new(soil_noise.outputs['Fac'],soil_bump.inputs['Height']);soil_links.new(soil_bump.outputs['Normal'],soil_nodes.get('Principled BSDF').inputs['Normal'])
mat('concrete',(.61,.60,.54),0,.82)
mat('stair_edge',(.38,.36,.30),0,.8)
mat('seating',(.26,.27,.24),.05,.54)
mat('bronze',(.29,.22,.12),.6,.35)
mat('roof_white',(.86,.84,.77),.15,.42)
mat('glass',(.07,.09,.10),.3,.24)
ids=['way/161322822','relation/14296233','way/817997262','way/817997263','way/255623996','way/478006668','way/478006669']
clip=box(-850,640,-535,920)
slab('Ground','paving',clip,-.5,.5)

def source_frame(poly):
 points=list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
 a,b=max(zip(points,points[1:]+points[:1]),key=lambda pair:math.dist(*pair))
 u=Vector((b[0]-a[0],b[1]-a[1]));u.normalize()
 if u.y<0:u=-u
 v=Vector((u.y,-u.x)) # right side of a northward axis is east.
 c=Vector((poly.centroid.x,poly.centroid.y))
 return c,u,v

def framed(c,u,v,coords):return [(c.x+u.x*x+v.x*y,c.y+u.y*x+v.y*y) for x,y in coords]
def rect(c,u,v,L,W):return Polygon(framed(c,u,v,[(-L/2,-W/2),(L/2,-W/2),(L/2,W/2),(-L/2,W/2)]))

def goal(owner,c,u,v,sign):
 # Illustrative adult-size goal, with real rear supports and separate net strands.
 center=c+u*(sign*52.5);rear=center+u*(sign*2.0)
 for lateral in [-3.66,3.66]:
  a=center+v*lateral;b=rear+v*lateral
  beam(owner,'ivory',(*a,.15),(*a,2.59),.055,sides=10)
  beam(owner,'ivory',(*a,2.59),(*b,1.95),.045,sides=8)
  beam(owner,'ivory',(*b,.15),(*b,1.95),.040,sides=8)
 beam(owner,'ivory',(*(center-v*3.66),2.59),(*(center+v*3.66),2.59),.055,sides=10)
 beam(owner,'ivory',(*(rear-v*3.66),.15),(*(rear+v*3.66),.15),.035,sides=8)
 beam(owner,'ivory',(*(rear-v*3.66),1.95),(*(rear+v*3.66),1.95),.035,sides=8)
 for side in [-1,1]:beam(owner,'ivory',(*(center+v*(side*3.66)),.15),(*(rear+v*(side*3.66)),.15),.035,sides=8)
 # Transverse cords close the top and side net grids, not parallel strings only.
 for depth in range(1,14):
  t=depth/14;mid=center+u*(sign*2*t);z=2.59-.64*t
  beam(owner+' net','ivory',(*(mid-v*3.66),z),(*(mid+v*3.66),z),.003,sides=4)
 for side in [-1,1]:
  for row in range(1,17):
   z=.15+row*.15;reach=min(1.0,max(0,(2.59-z)/.64));a=center+v*(side*3.66);b=a+u*(sign*2*reach)
   if reach>0:beam(owner+' net','ivory',(*a,z),(*b,z),.003,sides=4)

 for i in range(50):
  lateral=-3.66+i*7.32/49;a=center+v*lateral;b=rear+v*lateral
  beam(owner+' net','ivory',(*a,2.59),(*b,1.95),.003,sides=4)
  beam(owner+' net','ivory',(*b,.15),(*b,1.95),.003,sides=4)
 for j in range(1,13):
  z=.15+j*1.80/12
  beam(owner+' net','ivory',(*(rear-v*3.66),z),(*(rear+v*3.66),z),.003,sides=4)
 for side in [-1,1]:
  for j in range(1,14):
   t=j/14;a=center+u*(sign*2*t)+v*(side*3.66)
   beam(owner+' net','ivory',(*a,.15),(*a,2.59-.64*t),.003,sides=4)

frames={}
track_footprints=[]
for name,track_id,pitch_id in [('West','way/161322822','way/817997262'),('East','relation/14296233','way/817997263')]:
 source=allshapes[track_id];pitch=allshapes[pitch_id]
 c,u,v=source_frame(pitch);frames[name]=(c,u,v)
 # Smooth common construction; different original anchors and orientations retained.
 # Eight west lanes are illustrative, not an assertion about surveyed paint/count.
 axis=LineString(framed(c,u,v,[(-42.2,0),(42.2,0)]))
 inner=axis.buffer(36.5,quad_segs=64);outer=axis.buffer(36.5+8*1.22,quad_segs=64)
 track_footprints.append(outer)
 playing=rect(c,u,v,105,68)
 slab(name+' track base','concrete',outer.buffer(1.2),-.02,.10)
 slab(name+' track','track_clay',outer.difference(inner),.08,.065)
 slab(name+' infield runoff','runoff',inner.difference(playing),.08,.065)
 playing=rect(c,u,v,105,68)
 slab(name+' football turf','turf_soft',playing,.08,.065)
 for stripe in range(14):
  if stripe%2:
   center=c+u*(-52.5+(stripe+.5)*7.5)
   slab(name+' mowing bands','turf_stripe',rect(center,u,v,7.5,68),.145,.002)
 for lane in range(9):
  boundary=axis.buffer(36.5+lane*1.22,quad_segs=64).boundary.buffer(.025)
  slab(name+' lane markings','ivory',boundary,.148,.006)
 def marking(points,closed=False):
  xy=framed(c,u,v,points)
  if closed:xy.append(xy[0])
  slab(name+' pitch markings','ivory',LineString(xy).buffer(.055,cap_style=2),.148,.006)
 marking([(-52.5,-34),(52.5,-34),(52.5,34),(-52.5,34)],True)
 marking([(0,-34),(0,34)])
 circle=LineString(framed(c,u,v,[(9.15*math.cos(i*math.tau/96),9.15*math.sin(i*math.tau/96)) for i in range(97)]))
 slab(name+' center circle','ivory',circle.buffer(.055),.148,.006)
 slab(name+' center spot','ivory',Point(c.x,c.y).buffer(.12),.148,.006)
 for sign in [-1,1]:
  for depth,width in [(16.5,40.32),(5.5,18.32)]:
   marking([(sign*52.5,-width/2),(sign*(52.5-depth),-width/2),(sign*(52.5-depth),width/2),(sign*52.5,width/2)])
  spot=c+u*(sign*41.5);slab(name+' penalty spot','ivory',Point(*spot).buffer(.12),.148,.006)
  # Only the part outside the penalty box, not an entire circle painted through it.
  arc=Point(*spot).buffer(9.15,quad_segs=48).boundary.buffer(.055)
  penalty=rect(c+u*(sign*(52.5-8.25)),u,v,16.5,40.32)
  slab(name+' penalty arc','ivory',arc.difference(penalty),.148,.006)
  goal(name+' goal '+str(sign),c,u,v,sign)
 for end in [-1,1]:
  for side in [-1,1]:
   corner=c+u*(end*52.5)+v*(side*34)
   beam(name+' corner flags','ivory',(*corner,.15),(*corner,1.65),.018,sides=8)
   face(name+' corner pennants','bronze',[(*corner,1.65),(*(corner+v*(side*.36)),1.51),(*corner,1.32)])
   arc=LineString(framed(c,u,v,[(end*(52.5-math.cos(i*math.pi/2/24)),side*(34-math.sin(i*math.pi/2/24))) for i in range(25)]))
   slab(name+' corner arcs','ivory',arc.buffer(.055),.148,.006)
 # Finish line on the long straight, connected across the full eight-lane band.
 marking([(-32,36.5),(-32,46.26)])
 for i in range(8):
  q=c+u*(-35)+v*(36.5+(i+.5)*1.22)
  bpy.ops.object.text_add(location=(*q,.158),rotation=(0,0,math.atan2(v.y,v.x)))
  text=bpy.context.object;text.name=name+' lane '+str(i+1);text.data.body=str(i+1);text.data.size=.65;text.data.align_x='CENTER';text.data.materials.append(M['ivory']);bpy.ops.object.convert(target='MESH')

# Two distinct source footprints; rows descend toward the west field.
for fid in ['way/478006668','way/478006669']:
 p=allshapes[fid];c,u,v=source_frame(p);q=[Vector(x)-c for x in p.exterior.coords]
 lo=min(x.dot(u) for x in q);hi=max(x.dot(u) for x in q);left=min(x.dot(v) for x in q);right=max(x.dot(v) for x in q)
 row_depth=(right-left-1.8)/8
 for row in range(8):
  near=left+row*row_depth;far=near+row_depth;z=.16+(row+1)*.34
  step=Polygon(framed(c,u,v,[(lo,near),(hi,near),(hi,far),(lo,far)])).intersection(p)
  aisles=unary_union([Polygon(framed(c,u,v,[(t-.825,left),(t+.825,left),(t+.825,right),(t-.825,right)])) for t in [lo+(hi-lo)*.33,lo+(hi-lo)*.67]])
  slab(fid+' stepped terraces','concrete',step.difference(aisles),-.02,z+.02)
  # Two clear stair aisles; seating never fills the entire row across them.
  for station in range(int((hi-lo-1.8)/.62)):
   t=lo+.9+station*.62
   if abs(t-(lo+(hi-lo)*.33))<.9 or abs(t-(lo+(hi-lo)*.67))<.9:continue
   xy=c+u*t+v*(near+row_depth*.46)
   if not p.buffer(-.32).contains(Point(*xy)):continue
   angle=math.atan2(u.y,u.x)
   cube(fid+' seats','seating',(*xy,z+.44),(.48,.43,.08),angle)
   back=xy+v*.18;cube(fid+' seat backs','seating',(*back,z+.67),(.48,.07,.40),angle)
   cube(fid+' seat feet','bronze',(*xy,z+.20),(.08,.28,.40),angle)
  for t in [lo+(hi-lo)*.33,lo+(hi-lo)*.67]:
   for half in range(2):
    low=near+row_depth*half/2;high=low+row_depth/2
    stair=Polygon(framed(c,u,v,[(t-.825,low),(t+.825,low),(t+.825,high),(t-.825,high)])).intersection(p)
    top=.16+row*.34+(half+1)*.17
    slab(fid+' aisle steps','concrete',stair,-.02,top+.02)
    edge=LineString(framed(c,u,v,[(t-.80,low+.035),(t+.80,low+.035)])).buffer(.018,cap_style=2)
    slab(fid+' step nosings','stair_edge',edge,top+.001,.004)
 for t in [lo+(hi-lo)*.33,lo+(hi-lo)*.67]:
  a=c+u*t+v*left;b=c+u*t+v*(right-1.8)
  beam(fid+' aisle handrail','bronze',(*a,1.06),(*b,3.78),.032,sides=10)
  for row in [0,3,6,7]:
   depth=left+(row+.5)*row_depth;xy=c+u*t+v*depth;level=.16+(row+1)*.34
   railheight=1.06+(depth-left)/(right-1.8-left)*2.72
   beam(fid+' aisle rail posts','bronze',(*xy,level),(*xy,railheight),.022,sides=8)
 for t in [lo+.5,hi-.5]:
  front=c+u*t+v*left;back=c+u*t+v*(right-1.8)
  beam(fid+' side edge rails','bronze',(*front,1.60),(*back,3.98),.032,sides=10)
  for i in range(int((right-left-1.8)/.16)+1):
   depth=left+i*.16;row=min(7,int((depth-left)/row_depth));xy=c+u*t+v*depth
   if not p.contains(Point(*xy)):continue
   floor=.16+(row+1)*.34;rail=1.60+(depth-left)/(right-left-1.8)*2.38
   beam(fid+' side infill','bronze',(*xy,floor),(*xy,rail),.012,sides=5)
 backwalk=Polygon(framed(c,u,v,[(lo,right-1.8),(hi,right-1.8),(hi,right),(lo,right)])).intersection(p)
 slab(fid+' back concourse','concrete',backwalk,-.02,2.90)
 for t in range(math.ceil(lo+1),math.floor(hi),2):
  xy=c+u*t+v*(right-.15)
  beam(fid+' back rail','bronze',(*xy,2.88),(*xy,3.98),.025,sides=8)
 a=c+u*(lo+.5)+v*(right-.15);b=c+u*(hi-.5)+v*(right-.15)
 beam(fid+' handrail','bronze',(*a,3.98),(*b,3.98),.035,sides=8)
 beam(fid+' midrail','bronze',(*a,3.38),(*b,3.38),.022,sides=8)
 for n in range(int((hi-lo-1)/.16)):
  xy=c+u*(lo+.5+n*.16)+v*(right-.15)
  beam(fid+' railing infill','bronze',(*xy,3.02),(*xy,3.96),.010,sides=5)

# Independent open canopy. It must never become a solid building blocking its ground.
fid='way/255623996';p=allshapes[fid].segmentize(.5);c,u,v=source_frame(p)
# The shared concourse below provides this canopy floor; no duplicate coplanar slab.
coords=[Vector(x)-c for x in p.exterior.coords];L=max(abs(x.dot(u)) for x in coords);W=max(abs(x.dot(v)) for x in coords)
def roofheight(x,y):
 q=Vector((x,y))-c;return 7.5+.65*math.cos(q.dot(u)/L*math.pi)+.40*math.cos(q.dot(v)/W*math.pi)
xmin,ymin,xmax,ymax=p.bounds
for ix in range(math.floor(xmin),math.ceil(xmax)):
 for iy in range(math.floor(ymin),math.ceil(ymax)):
  cell=p.intersection(box(ix,iy,ix+1,iy+1))
  if cell.is_empty:continue
  for poly in polygons(cell):
   for tri in constrained_delaunay_triangles(poly).geoms:
    xy=list(orient(tri,1).exterior.coords)[:-1]
    face('Central canopy','roof_white',[(x,y,roofheight(x,y)) for x,y in xy])
    face('Central canopy soffit','ivory',[(x,y,roofheight(x,y)-.18) for x,y in reversed(xy)])
for a,b in zip(p.exterior.coords,list(p.exterior.coords)[1:]):
 face('Central canopy fascia','roof_white',[(a[0],a[1],roofheight(*a)),(a[0],a[1],roofheight(*a)-.18),(b[0],b[1],roofheight(*b)-.18),(b[0],b[1],roofheight(*b))])
for along in [-L*.65,0,L*.65]:
 for across in [-W*.52,W*.52]:
  xy=c+u*along+v*across
  if p.buffer(-1).contains(Point(*xy)):
   beam('Central canopy columns','ivory',(*xy,.16),(*xy,roofheight(*xy)-.18),.22,.16,12)

for along in [-L*.65,0,L*.65]:
 points=[c+u*along+v*(-W*.84+i*W*1.68/28) for i in range(29)]
 for a,b in zip(points,points[1:]):
  if p.contains(Point(*a)) and p.contains(Point(*b)):
   beam('Canopy curved underside ribs','ivory',(*a,roofheight(*a)-.30),(*b,roofheight(*b)-.30),.13,sides=10)

# A level shared concourse meets the first half-step at the same datum.
# This is authored display circulation, not a new factual network connection.
stand_shapes=unary_union([allshapes[i] for i in ['way/255623996','way/478006668','way/478006669']])
track_surfaces=unary_union(track_footprints)
concourse=stand_shapes.convex_hull.buffer(3.0,join_style=1).difference(track_surfaces.buffer(.12))
slab('Shared stand concourse','concrete',concourse,-.02,.18)
transition=concourse.buffer(1.5).difference(concourse).difference(track_surfaces.buffer(.12))
for piece in polygons(transition):
 for tri in constrained_delaunay_triangles(piece).geoms:
  coords=list(orient(tri,1).exterior.coords)[:-1]
  top=[(x,y,.16-.07*min(1,Point(x,y).distance(concourse)/1.5)) for x,y in coords]
  bottom=[(x,y,0) for x,y in coords]
  face('Concourse gently graded edge','concrete',top)
  face('Concourse gently graded edge','concrete',list(reversed(bottom)))
  for j in range(3):
   k=(j+1)%3;face('Concourse gently graded edge','concrete',[top[j],bottom[j],bottom[k],top[k]])

# Merge junction surfaces; never stack flat round-capped path ribbons.
road_pieces=[];path_pieces=[]
for f in features:
 if f['properties'].get('kind')!='road':continue
 g=allshapes[f['id']];p=f['properties']
 if not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 hw=p.get('highway');walking=hw in ['footway','path','pedestrian','cycleway','steps']
 width=2.4 if walking else {'primary':12,'secondary':10,'tertiary':8,'service':4}.get(hw,6)
 (path_pieces if walking else road_pieces).append(g.buffer(width/2).intersection(clip))
streets=unary_union(road_pieces);paths=unary_union(path_pieces).difference(streets)
slab('Source streets — merged junctions','seating',streets,0,.09)
slab('Source paths — merged junctions','ivory',paths,0,.09)
# A declared design-only link from the retained east-side footway to the field edge.
ec,eu,ev=frames['East'];target=Point(*(ec+eu*20+ev*54))
a=nearest_points(allshapes['way/1073557352'],target)[0]
b=nearest_points(track_footprints[1].buffer(1.75).boundary,a)[0]
access_paving=LineString([a,b]).buffer(1.2,cap_style=1).difference(track_surfaces).difference(streets).difference(paths)
slab('Designed east field access — not a factual routing edge','ivory',access_paving,0,.09)


# Continuous, recognizable planted borders rather than anonymous green blocks.
configure_leaf_materials()
mat('border_grass',(.26,.29,.19),0,.9)
landscape_border=track_surfaces.buffer(8).difference(track_surfaces.buffer(2.4)).difference(concourse.buffer(.25)).difference(streets.buffer(.6)).difference(paths.union(access_paving).buffer(.3)).intersection(clip)
slab('Trackside planted border','border_grass',landscape_border,0,.065)
perimeter_walk=track_surfaces.buffer(2.4).difference(track_surfaces.buffer(1.15)).difference(concourse).difference(streets).difference(paths).difference(access_paving).intersection(clip)
slab('Trackside walking edge','ivory',perimeter_walk,0,.09)
# Planted beds belong behind the stands, not in the spectators' view of the field.
for index,fid in enumerate(['way/478006668','way/478006669']):
 p=allshapes[fid];center,axis,rightward=source_frame(p);q=[Vector(x)-center for x in p.exterior.coords]
 lo=min(x.dot(axis) for x in q);hi=max(x.dot(axis) for x in q);back=max(x.dot(rightward) for x in q)
 bed=Polygon(framed(center,axis,rightward,[(lo+.8,back+.4),(hi-.8,back+.4),(hi-.8,back+1.5),(lo+.8,back+1.5)])).buffer(.12).intersection(concourse)
 soil=bed.buffer(-.10)
 slab(fid+' planted bed rim','concrete',bed.difference(soil),.16,.32)
 slab(fid+' planted bed soil','planting_soil',soil,.16,.27)
 for j in range(int((hi-lo-2)/1.15)):
  pnt=center+axis*(lo+1.4+j*1.15)+rightward*(back+.95)
  if soil.contains(Point(*pnt)):shrub(fid+' shrub '+str(j),pnt.x,pnt.y,.43,.92+(j%3)*.06,400+index*100+j)

seed=201
for name,(center,axis,rightward) in frames.items():
 for along,across in [(-25,-54),(25,-54),(-25,54),(25,54),(-95,0),(95,0)]:
  q=center+axis*along+rightward*across;point=Point(*q)
  if not landscape_border.contains(point) or concourse.buffer(1).contains(point) or (name=='West' and across>0) or not clip.buffer(-4).contains(point) or point.distance(track_surfaces)<3.5 or point.distance(stand_shapes)<4.5 or streets.buffer(3.0).contains(point) or paths.union(access_paving).buffer(2).contains(point):continue
  broadleaf(q.x,q.y,.95+(seed%3)*.08,seed);seed+=1

# Synthetic height reference: a 1.75 m person, not a surveyed campus object.
mat('reference_coat',(.16,.18,.19),0,.8);mat('reference_skin',(.53,.37,.26),0,.8)
fc,fu,fv=source_frame(allshapes['way/478006668']);q=[Vector(x)-fc for x in allshapes['way/478006668'].exterior.coords]
flo=min(x.dot(fu) for x in q);fhi=max(x.dot(fu) for x in q);fl=min(x.dot(fv) for x in q);ft=flo+(fhi-flo)*.33+1.6
base=.16
def human_point(a,b,z):
 xy=fc+fu*(ft+a)+fv*(fl-1.5+b);return (xy.x,xy.y,z+base)
angle=math.atan2(fu.y,fu.x)
cube('Scale reference — 1.75m','reference_coat',human_point(0,0,1.19),(.42,.23,.55),angle)
for side in [-1,1]:
 beam('Scale reference — 1.75m','reference_coat',human_point(side*.10,0,.94),human_point(side*.10,side*.12,.50),.065,sides=8)
 beam('Scale reference — 1.75m','reference_coat',human_point(side*.10,side*.12,.50),human_point(side*.10,side*.18,.10),.05,sides=8)
 cube('Scale reference — shoes','reference_coat',human_point(side*.10,side*.18+.04,.045),(.12,.25,.09),angle)
 beam('Scale reference — arms','reference_coat',human_point(side*.23,0,1.41),human_point(side*.25,-side*.08,1.14),.05,sides=8)
 beam('Scale reference — hands','reference_skin',human_point(side*.25,-side*.08,1.14),human_point(side*.27,-side*.13,.99),.037,sides=8)
beam('Scale reference — neck','reference_skin',human_point(0,0,1.44),human_point(0,0,1.56),.055,sides=10)
bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.11,location=human_point(0,0,1.64))
bpy.context.object.name='Scale reference head';bpy.context.object.data.materials.append(M['reference_skin'])

for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner+' '+material);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  layer=mesh.uv_layers.new(name='Leaf albedo UV')
  for polygon,coords in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for loop,uv in zip(polygon.loop_indices,coords):layer.data[loop].uv=uv
 obj=bpy.data.objects.new(owner+' | '+material,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(M[material]);obj['designRole']=owner
 if owner.startswith('West'):obj['sourceFeatureIds']=['way/161322822','way/817997262']
 elif owner.startswith('East'):obj['sourceFeatureIds']=['relation/14296233','way/817997263']
 elif owner.startswith('way/478006668'):obj['sourceFeatureIds']=['way/478006668']
 elif owner.startswith('way/478006669'):obj['sourceFeatureIds']=['way/478006669']
 elif 'canopy' in owner.lower():obj['sourceFeatureIds']=['way/255623996']
 if 'seats' in owner or 'seat backs' in owner:
  bevel=obj.modifiers.new('Soft seat edges','BEVEL');bevel.width=.035;bevel.segments=3
root=bpy.data.objects.new('Dual tracks — source anchored illustrative detail',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=ids;root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['sourceCommit']='8cdd754f6355de11d9d0d6bb367d6a66cbf7c330';root['modelRole']='illustrative authored detail, not a surveyed route or facade';root['status']='WORK_IN_PROGRESS'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
scene=bpy.context.scene;scene['status']='work in progress';scene['sourceFeatureIds']=ids;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py')]:bpy.data.texts.new(name).write(path.read_text())
world=bpy.data.worlds.new('Daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.65);sun.data.energy=2.5;sun.data.angle=.16
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=3000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=')[1]) for a in sys.argv if a.startswith('--samples=')),32);scene.cycles.use_denoising=False;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100 if '--full' in sys.argv else 75;scene.view_settings.view_transform='AgX'
views=[('sports-overview',(-430,430,350),(-695,780,0),300,28),('west-track-ground',(-755,697,1.7),(-700,777,4),None,28),('stand-terraces',(-716,732,1.7),(-686,750,2),None,28),('canopy-underneath',(-700,762,1.7),(-698,793,4),None,24),('stand-aisle-close',(-691.64,726.99,1.86),(-678.93,729.37,2.5),None,28),('stand-approach',(-701,723,1.75),(-686,729,1.1),None,28),('north-stand-approach',(-722,865,1.75),(-704,828,1.9),None,28),('east-field-access',(-565,812,1.75),(-594,811,1),None,28)]
sc,su,sv=source_frame(allshapes['way/478006668'])
back=max((Vector(q)-sc).dot(sv) for q in allshapes['way/478006668'].exterior.coords)
camxy=sc-su*10+sv*(back+5);look=sc-su*5+sv*(back+.9)
views.append(('stand-back-planting',(*camxy,1.6),(*look,1.0),None,35))
wc,wu,wv=frames['West'];goalcam=wc+wu*60+wv*7;goaltarget=wc+wu*52.5
views.append(('west-goal-detail',(*goalcam,1.745),(*goaltarget,1.25),None,40))
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
for i,(name,pos,target,ortho,lens) in enumerate(views):
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'dual-tracks.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
 receipt_path=OUT/'render-receipts.json'
 receipts=json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
 receipts[name]={'renderedAtUTC':datetime.now(timezone.utc).isoformat(),'buildScriptSHA256':scene['buildScriptSHA256'],'imageSHA256':hashlib.sha256((OUT/(name+'.png')).read_bytes()).hexdigest(),'status':'rendered, requires actual visual review'}
 receipt_path.write_text(json.dumps(receipts,ensure_ascii=False,indent=2))
print('SPORTS DRAFT SAVED — NOT ACCEPTED')
