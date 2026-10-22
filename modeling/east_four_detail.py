"""East Four's own source wings and full eastern return; an unfinished authored campus model."""
import sys,math,hashlib,gc
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
import east_stair_core as stair
from east_four_foyer import build_north_foyers,build_ground_reading_room
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf,shrub
OUT=ROOT/'modeling/east-four-work';OUT.mkdir(exist_ok=True)
IDS=['way/161393066','way/306107349','way/306107350','way/306107351'];main=allshapes[IDS[0]];pts=list(main.exterior.coords)
north=Polygon(pts[0:7]+pts[19:26]);south=Polygon(pts[7:19]);spine=main.difference(north.union(south))
bridges=[allshapes[IDS[1]],allshapes[IDS[2]]];east=allshapes[IDS[3]]
high=unary_union([north,south,east,*bridges]);compound=unary_union([allshapes[fid] for fid in IDS]);courts=[Polygon(r) for r in compound.interiors]
levels=[.15,3.35,6.55,9.75,12.95,16.15]
mat('East white',(.82,.80,.74),0,.58);mat('East stone',(.66,.64,.57),0,.75);mat('East bronze',(.31,.29,.24),.55,.42);mat('East core',(.19,.23,.25),.45,.4)
mat('East clear glazing',(.73,.78,.79),.03,.09);M['East clear glazing'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.9
mat('East Four room glazing',(.12,.15,.16),.35,.22);mat('East Four lawn',(.36,.40,.29),0,.95);mat('East Four soil',(.18,.14,.09),0,.95)
clip=box(-180,57,60,167);wet=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='water' and allshapes[f['id']].intersects(clip)]).intersection(clip)
slab('East Four local ground','ground',clip.difference(wet.buffer(.3)),-1.4,1.4);slab('East Four source water','water',wet,-1.4,.5);slab('East Four banks','limestone',wet.buffer(.3).difference(wet),-1.4,1.4)
slab('East Four connected ground','paving',compound,0,.15)
cores=[]
for body in [north,south]:
 for x in [-156,-106,-55,16]:
  section=body.intersection(LineString([(x,50),(x,170)]))
  if section.is_empty:continue
  y=section.bounds[1];core=box(x-1.7,y-.3,x+1.7,y+6).intersection(body)
  if core.area>14:cores.append(core)
coremask=unary_union(cores);holes=unary_union([stair.floor_opening(c) for c in cores])
axis=box(-49,60,-39,160);cross=box(-180,110.5,40,114.5);ground_open=axis.union(cross)
void=spine.intersection(box(-48,101,-41,124)).difference(box(-55,111,-35,114))
slab('East Four second floor','East white',compound.difference(holes).difference(void),3.15,.20)
for z in [6.55,9.75,12.95]:slab('East Four continuous upper floors','East white',high.difference(holes),z-.2,.2)
# A single high-level roof links the broad eastern return and both classroom wings.
rooflights=[]
for y in [133.7,92.9]:
 for x in range(-147,19,8):
  g=box(x-1.5,y-.65,x+1.5,y+.65)
  if high.buffer(-.4).covers(g) and not coremask.buffer(.4).intersects(g):rooflights.append(g)
for y in [102,110,118,126]:
 g=box(6.5,y-1.5,7.8,y+1.5)
 if high.buffer(-.4).covers(g):rooflights.append(g)
skyholes=unary_union(rooflights)
slab('East Four unified high roof','East white',high.buffer(.16).difference(skyholes),15.95,.24)
slab('East Four high roof parapet','East white',high.difference(high.buffer(-.15)),16.19,.25)
for g in rooflights:
 slab('East Four skylight curbs','East bronze',g.buffer(.05).difference(g),16.19,.11)
 def skylight_height(x,y,g=g):
  x0,y0,x1,y1=g.bounds
  distance=(y-(y0+y1)/2)/((y1-y0)/2) if x1-x0>y1-y0 else (x-(x0+x1)/2)/((x1-x0)/2)
  return 16.30+.30*(1-abs(distance))
 profile_slab('East Four skylight glass','East clear glazing',g,skylight_height,.04,max_segment=.25)

# The central link has a calm, separate low wave roof; its source geometry is unchanged.
y0,y1=spine.bounds[1],spine.bounds[3];roof=lambda x,y:6.55+.35*math.sin(2*math.pi*(y-y0)/(y1-y0))
profile_slab('East Four central wave glazing','East clear glazing',spine,roof,.08,max_segment=.5)
for poly in polygons(spine):
 pts=list(LineString(poly.exterior.coords).segmentize(.5).coords)
 for a,b in zip(pts,pts[1:]):beam('East Four central roof edge','East white',(*a,roof(*a)-.04),(*b,roof(*b)-.04),.065,sides=8)
for y in [100,108,116,124]:
 cut=spine.intersection(LineString([(-70,y),(-20,y)]))
 if not cut.is_empty:
  a,b=list(cut.coords)[0],list(cut.coords)[-1];beam('East Four central roof ribs','East white',(*a,roof(*a)-.08),(*b,roof(*b)-.08),.07,sides=8)
# Facade belongs to the union, not one overlapping strip for every source record.
for poly in polygons(high):
 for ring in [orient(poly,1).exterior,*orient(poly,1).interiors]:
  coords=list(ring.coords)
  for a,b in zip(coords,coords[1:]):
   for i in range(5):
    lo,hi=levels[i:i+2];run=LineString([a,b]).difference(coremask.buffer(.015))
    if i==0:run=run.difference(ground_open)
    if i==1:run=run.difference(box(-49,150,-39,158))
    pieces=[run] if run.geom_type=='LineString' else [g for g in getattr(run,'geoms',[]) if g.geom_type=='LineString']
    for part in pieces:
     if part.is_empty or part.length<.1:continue
     a0=Vector(part.coords[0]);b0=Vector(part.coords[-1]);t=b0-a0;length=t.length;t.normalize();n=Vector((t.y,-t.x));angle=math.atan2(t.y,t.x);count=max(1,round(length/3.4));step=length/count
     for j in range(count):
      p=a0+t*(j+.5)*step
      if i<2 and spine.buffer(.05).covers(Point(*(p+n*.04))):continue
      transparent=any(g.boundary.distance(Point(*p))<.04 for g in bridges)
      pier=.24 if transparent else min(.60,step*.28);z0=lo+(.65 if transparent else .85);z1=hi-.2 if transparent else lo+2.50;opening=max(.02,step-pier)
      # End half-piers finish at the core cut; they neither leave half a bay open nor overlap the core shell.
      left=p-t*step/2
      cube('East Four facade piers','East white',(*(left+t*pier/4 if j==0 else left),(lo+hi)/2),(pier/2 if j==0 else pier,.32,hi-lo),angle)
      if j==count-1:cube('East Four facade end half piers','East white',(*(p+t*step/2-t*pier/4),(lo+hi)/2),(pier/2,.32,hi-lo),angle)
      cube('East Four lower window wall','East white',(*(p+n*.015),(lo+z0)/2),(step,.30,z0-lo),angle)
      if z1<hi-.2:cube('East Four window head wall','East white',(*(p+n*.015),(z1+hi-.2)/2),(step,.30,hi-.2-z1),angle)
      cube('East Four facade glazing','East clear glazing' if transparent or (i==0 and -38.9<p.x<-25 and p.y>152.65) else 'East Four room glazing',(*(p-n*.075),(z0+z1)/2),(opening,.08,z1-z0),angle)
      for off in [-opening/2,0,opening/2]:cube('East Four window frames','East bronze',(*(p+t*off-n*.025),(z0+z1)/2),(.045,.12,z1-z0),angle)
      for z in [z0,z1]:cube('East Four window rails','East bronze',(*(p-n*.025),z),(opening,.12,.045),angle)
      # Fill only the external recess beside the structural slab, never duplicate its coplanar face.
      if i<4:cube('East Four external slab edge infill','East white',(*(p+n*.0825),hi-.1),(opening,.165,.20),angle)
      if not transparent:
       cube('East Four projecting sills','East stone',(*(p+n*.10),z0-.045),(opening+.08,.48,.09),angle)
       cube('East Four shade lintels','East white',(*(p+n*.12),z1+.05),(opening+.12,.52,.10),angle)
for poly in polygons(spine):
 for a,b in zip(list(poly.exterior.coords),list(poly.exterior.coords)[1:]):
  for lo in [.15,3.35]:
   run=LineString([a,b]).difference(high.buffer(.02))
   if lo<1:run=run.difference(ground_open)
   pieces=[run] if run.geom_type=='LineString' else [g for g in getattr(run,'geoms',[]) if g.geom_type=='LineString']
   for part in pieces:
    pp=list(part.segmentize(2).coords)
    for p,q in zip(pp,pp[1:]):
     za=3.15 if lo<1 else roof(*p)-.08;zb=3.15 if lo<1 else roof(*q)-.08
     face('East Four central facade','East clear glazing',[(*p,lo),(*q,lo),(*q,zb),(*p,za)])
     beam('East Four central frames','East bronze',(*p,lo),(*p,za),.025,sides=6)
def guard(a,b):
 beam('East Four atrium handrails','East bronze',(*a,4.45),(*b,4.45),.028,sides=6)
 count=max(1,math.ceil(math.dist(a,b)/.15))
 for j in range(count+1):
  x=a[0]+(b[0]-a[0])*j/count;y=a[1]+(b[1]-a[1])*j/count;beam('East Four atrium infill','East bronze',(x,y,3.35),(x,y,4.45),.015,sides=6)
for poly in polygons(void):
 pp=list(poly.exterior.coords)
 for a,b in zip(pp,pp[1:]):guard(a,b)
lamps=[]
for c in cores:lamps+=stair.build_core(c,levels[:5])
# Three individually bounded courts: source holes are never filled by building mass.
configure_leaf_materials();trees=[(-139,119,.80),(-122,102,.72),(-94,120,.82),(-78,103,.75),(-62,119,.68),(-26,120,.78),(-8,103,.72)]
for court in courts:
 garden=court.buffer(-3).difference(cross);paving=court.difference(garden);chosen=[(i,x,y,z) for i,(x,y,z) in enumerate(trees) if garden.buffer(-.7).covers(Point(x,y))];pits=unary_union([Point(x,y).buffer(.65,quad_segs=24) for i,x,y,z in chosen])
 slab('East Four court paving','paving',paving,0,.15);slab('East Four lawn','East Four lawn',garden.difference(pits),0,.12);slab('East Four tree pits','East Four soil',pits,0,.12)
 slab('East Four garden edge','East stone',garden.buffer(.07).difference(garden).intersection(paving),.15,.025)
 for i,x,y,z in chosen:broadleaf(x,y,z,seed=8100+i)
 for j,(x,y) in enumerate([(-132,102),(-119,120),(-88,103),(-70,120),(-23,103),(-7,120)]):
  if garden.buffer(.0).covers(Point(x,y)):shrub('East Four low court planting',x,y,.12,.65,seed=8140+j)
 x=court.centroid.x;y=111.35
 if paving.covers(box(x-1.4,y-.3,x+1.4,y+.3)):
  for k in range(4):cube('East Four court seats','wood',(x,y+(k-1.5)*.10,.59),(2.6,.085,.055))
  for z in [.79,.94]:cube('East Four court backs','wood',(x,y-.23,z),(2.6,.055,.12))
  for xx in [x-1,x+1]:
   for yy in [y-.18,y+.18]:beam('East Four seat legs','East bronze',(xx,yy,.15),(xx,yy,.56),.028,sides=6)
   beam('East Four seat back posts','East bronze',(xx,y-.23,.15),(xx,y-.23,1.02),.025,sides=6)
roads=[];walks=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 walking=p.get('highway') in ['footway','path','pedestrian','steps'];surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.6 if walking else 3.5,cap_style=2,join_style=1);(walks if walking else roads).append(surface)
road=unary_union(roads).intersection(clip).difference(compound).difference(wet)
others=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='building' and f['id'] not in IDS and allshapes[f['id']].intersects(clip)])
walk=unary_union(walks).union(compound.buffer(3)).intersection(clip).difference(compound).difference(unary_union(courts)).difference(others).difference(wet).difference(road)
slab('East Four source roads','road',road,0,.12);slab('East Four exterior walks','paving',walk,0,.15)
portal_edge=high.buffer(.165).difference(compound).intersection(ground_open).difference(others)
slab('East Four external portal floor headers','East white',portal_edge,3.15,.20)
foyer_lights=build_north_foyers(high,coremask)+build_ground_reading_room(high)
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  uv=mesh.uv_layers.new(name='Leaf albedo UV')
  for poly,coords in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for idx,co in zip(poly.loop_indices,coords):uv.data[idx].uv=co
 ob=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(M[material]);ob['designRole']=owner
root=bpy.data.objects.new('East Four — source-specific unfinished draft',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=IDS;root['sourceCommit']='8cdd754f6355de11d9d0d6bb367d6a66cbf7c330';root['sourceGeometryUnchanged']=True;root['status']='WORK_IN_PROGRESS';root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['courtyardCount']=len(courts);root['authoredStairCores']=[g.wkt for g in cores];root['unresolved']='Five-level high wings/eastern return and transparent western connections are authored interpretation; geometry, stairs, courts and gallery join await local visual review; room details unfinished.'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('STAIR_RECIPE.py',Path(__file__).parent/'east_stair_core.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py'),('FOYER_RECIPE.py',Path(__file__).parent/'east_four_foyer.py')]:bpy.data.texts.new(name).write(path.read_text())
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();world=bpy.data.worlds.new('East Four studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
for x,y,z in lamps:
 bpy.ops.object.light_add(type='AREA',location=(x,y,z));lamp=bpy.context.object;lamp.name='East Four stair downlight';lamp.data.energy=90;lamp.data.shape='RECTANGLE';lamp.data.size=.8;lamp.data.size_y=.2;lamp.data.color=(1,.95,.88)
passage_lights=[(-44,y,z) for y in [77,85,93,136,143,150] for z in [3.12,6.32]]
passage_lights += foyer_lights
passage_lights += [(x,112.5,3.12) for x in [8,14,20]]+[(-44,112.5,3.12)]
for bridge in bridges:
 x=bridge.centroid.x
 for y in [99,107,115,123,128]:
  if bridge.buffer(-.3).covers(Point(x,y)):
   passage_lights.extend((x,y,z) for z in [3.12,6.32,9.52,12.72,15.92])
# Arrival lighting is attached only where the corresponding high floor or roof exists.
for core in cores:
 ax,ay,bx,by=core.bounds;cx=(ax+bx)/2
 for distance in [1.5,4.5]:
  p=Point(cx,ay-distance)
  if high.buffer(-.25).covers(p) and all(math.hypot(cx-x,p.y-y)>2.5 or abs(z-3.12)>.1 for x,y,z in passage_lights):passage_lights.append((cx,p.y,3.12))
 x=bx+1.25;y=ay+.85
 if high.buffer(-.25).covers(Point(x,y)):
  for z in [6.32,9.52,12.72,15.92]:passage_lights.append((x,y,z))
for x,y,z in passage_lights:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));ob=bpy.context.object;ob.name='East Four mounted passage panel';ob.dimensions=(.9,.35,.06);ob.data.materials.append(M['East core diffuser']);ob.parent=root
 bpy.ops.object.light_add(type='AREA',location=(x,y,z-.04));lamp=bpy.context.object;lamp.name='East Four passage downlight';lamp.data.energy=210;lamp.data.shape='RECTANGLE';lamp.data.size=.85;lamp.data.size_y=.3;lamp.data.color=(1,.95,.88);lamp.parent=root
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=1500
scene.render.engine='CYCLES';scene.cycles.samples=int(next((a.split('=',1)[1] for a in sys.argv if a.startswith('--samples=')),96));scene.cycles.use_denoising=False;scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('east-four-overview',(95,-40,155),(-65,112,4),250,30),('east-four-north-arrival',(-44,159,1.85),(-44,137,1.85),None,25),('east-four-east-passage',(33,112.5,1.85),(-20,112.5,1.85),None,25)]
for c in cores:
 x0,y0,x1,y1=c.bounds;cx=(x0+x1)/2;name='east-four-'+('north' if y0>120 else 'south')+'-core-'+str(round(cx))
 views.append((name,(cx,y0-4,1.85),(cx,y0+1,1.95),None,24))
 views.append((name+'-top',(x1-.8,y0+.85,14.65),(x1-.8,y0+3.8,11.8),None,24))
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None);batches.clear();foliage_uv.clear();gc.collect()
for i,(name,eye,target,ortho,lens) in enumerate(views):
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'east-four-connected.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('EAST FOUR WIP',len(cores),'authored stair cores, source courts retained, not accepted')
