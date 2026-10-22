"""Source-anchored East Three–Four gallery; authored spatial draft, not surveyed construction."""
import sys,math,hashlib,gc
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
import east_stair_core as stair
OUT=ROOT/'modeling/east-south-gallery-work';OUT.mkdir(exist_ok=True)
FID='way/306107369';foot=allshapes[FID];clip=box(-105,145,-8,233)
mat('South gallery white',(.82,.80,.74),0,.60);mat('South gallery bronze',(.22,.21,.18),.5,.42)
mat('South gallery glass',(.76,.80,.80),.02,.09);M['South gallery glass'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.92
M['East white']=M['South gallery white']
wet=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='water' and allshapes[f['id']].intersects(clip)]).intersection(clip)
roads=[];walks=[];roadids=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 walking=p.get('highway') in ['footway','path','pedestrian','steps'];surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.6 if walking else 3.5,cap_style=2,join_style=1)
 (walks if walking else roads).append(surface);roadids.append(f['id'])
road=unary_union(roads).intersection(clip).difference(wet)
other_buildings=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='building' and f['id']!=FID and allshapes[f['id']].intersects(clip)])
walk=unary_union(walks).union(foot.buffer(2)).intersection(clip).difference(foot).difference(road).difference(wet).difference(other_buildings)
slab('South gallery local terrain','ground',clip.difference(wet.buffer(.3)),-1.4,1.4)
slab('South gallery source water','water',wet,-1.4,.5);slab('South gallery banks','limestone',wet.buffer(.3).difference(wet),-1.4,1.4)
slab('South gallery source roads','road',road,0,.12)
# Separate the one-metre transition strip so triangulation cannot spread its slope across the whole floor.
for label,area in [('South gallery surrounding walks',walk),('South gallery ground floor',foot.difference(road))]:
 transition=area.intersection(road.buffer(1.0))
 slab(label+' level paving','paving',area.difference(transition),0,.15)
 profile_slab(label+' one metre transition','paving',transition,lambda x,y:.12+.03*min(1,road.distance(Point(x,y))),.15,max_segment=.25)
# Actual upper opening and a continuous clear eastern longitudinal walking strip.
sx,sy=-47.8,181.5;hole=box(sx,sy,sx+3.2,sy+3.9)
slab('South gallery upper floor','South gallery white',foot.difference(hole),3.15,.20)
ymin,ymax=foot.bounds[1],foot.bounds[3]
roof=lambda x,y:6.55+.35*math.sin(2*math.pi*(y-ymin)/(ymax-ymin))
glassroof=foot.buffer(-1.0)
profile_slab('South gallery wave roof glass','South gallery glass',glassroof,roof,.08,max_segment=.5)
profile_slab('South gallery wave roof opaque edge','South gallery white',foot.difference(glassroof),roof,.12,max_segment=.5)
for y in range(156,225,8):
 cut=foot.intersection(LineString([(-80,y),(-20,y)]))
 if cut.is_empty:continue
 a,b=list(cut.coords)[0],list(cut.coords)[-1]
 beam('South gallery roof transverse structure','South gallery white',(*a,roof(*a)-.12),(*b,roof(*b)-.12),.075,sides=8)
 for p in [a,b]:
  if not road.buffer(.15).covers(Point(*p)):beam('South gallery columns','South gallery white',(*p,.15),(*p,roof(*p)-.12),.10,sides=8)
# Glazing segments follow the actual sides, including the slight source skew.
def pane(name,p,q,lo,za,zb):
 d=Vector(q)-Vector(p);d.normalize();n=Vector((-d.y,d.x))*.012
 a=Vector(p);b=Vector(q)
 vv=[(*(a+n),lo),(*(b+n),lo),(*(b+n),zb),(*(a+n),za),(*(a-n),lo),(*(b-n),lo),(*(b-n),zb),(*(a-n),za)]
 for ids in [(0,1,2,3),(7,6,5,4),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2)]:face(name,'South gallery glass',[vv[i] for i in ids])
side_entry=allshapes['way/504974754'].buffer(1.6,cap_style=2).union(box(-55,158.066276,-45,161.266276))
for poly in polygons(foot):
 for a,b in zip(list(poly.exterior.coords),list(poly.exterior.coords)[1:]):
  edge=LineString([a,b])
  if abs(a[1]-b[1])<5:continue # Open at both source building interfaces.
  for lo,top in [(.15,3.12),(3.35,None)]:
   runs=edge.difference(road.buffer(.12).union(side_entry)) if lo<1 else edge
   segments=[runs] if runs.geom_type=='LineString' else [g for g in getattr(runs,'geoms',[]) if g.geom_type=='LineString']
   for run in segments:
    if run.is_empty:continue
    pts=list(run.segmentize(2).coords)
    if lo<1:
     for end in [pts[0],pts[-1]]:beam('South gallery opening jambs','South gallery white',(*end,.15),(*end,3.15),.06,sides=8)
    for p,q in zip(pts,pts[1:]):
     za=top if top is not None else roof(*p)-.12;zb=top if top is not None else roof(*q)-.12
     pane('South gallery lower glazing' if lo<1 else 'South gallery upper glazing',p,q,lo,za,zb)
     beam('South gallery slim window frames','South gallery bronze',(*p,lo),(*p,za),.022,sides=6)
     beam('South gallery window horizontal frames','South gallery bronze',(*p,lo),(*q,lo),.025,sides=6)
     beam('South gallery window top frames','South gallery bronze',(*p,za),(*q,zb),.025,sides=6)
# Two genuine 10-riser flights, not an opaque stair-shaped block.
stair.stair_flight('South gallery rising stair',sx,sx+1.35,sy,.15,.16,1)
stair.stair_flight('South gallery return stair',sx+1.85,sx+3.2,sy+2.6,1.75,.16,-1)
slab('South gallery middle landing','South gallery white',box(sx,sy+2.6,sx+3.2,sy+3.9),1.55,.20)
def guard(name,a,b,z):
 beam(name+' handrail','South gallery bronze',(*a,z+1.1),(*b,z+1.1),.028,sides=6)
 count=max(1,math.ceil(math.dist(a,b)/.15))
 for j in range(count+1):
  x=a[0]+(b[0]-a[0])*j/count;y=a[1]+(b[1]-a[1])*j/count
  beam(name+' verticals','South gallery bronze',(x,y,z),(x,y,z+1.1),.015,sides=6)
for x in [sx+.05,sx+1.30,sx+1.90,sx+3.15]:
 rev=x>sx+1.6;start=sy+2.6 if rev else sy;direction=-1 if rev else 1;base=1.75 if rev else .15
 beam('South gallery stair rail','South gallery bronze',(x,start,base+1.1),(x,start+direction*2.6,base+2.7),.028,sides=6)
 for j in range(11):
  y=start+direction*j*.26;z=base+j*.16
  beam('South gallery stair infill','South gallery bronze',(x,y,z),(x,y,z+1.1),.015,sides=6)
for a,b in [((sx,sy+2.6),(sx,sy+3.9)),((sx,sy+3.9),(sx+3.2,sy+3.9)),((sx+3.2,sy+3.9),(sx+3.2,sy+2.6))]:guard('South gallery middle guard',a,b,1.75)
for a,b in [((sx,sy),(sx,sy+3.9)),((sx,sy+3.9),(sx+3.2,sy+3.9)),((sx+3.2,sy+3.9),(sx+3.2,sy)),((sx,sy),(sx+1.85,sy))]:guard('South gallery upper opening guard',a,b,3.35)
# Close the low headroom under the flights with a fine timber screen; never invite a path beneath it.
for j in range(30):
 y=181.56+j*.13
 if y>185.36:continue
 top=3.35-1.6*max(0,min(1,(y-181.5)/2.6))-.28 if y<184.1 else 1.55
 cube('South gallery return underside screen','wood',(-44.57,y,(.15+top)/2),(.06,.06,top-.15))
for j in range(25):
 x=-47.76+j*.13
 cube('South gallery landing underside screen','wood',(x,185.36,.85),(.06,.06,1.4))
for j in range(30):
 y=181.56+j*.13
 if y>185.36:continue
 top=.15+1.6*max(0,min(1,(y-181.5)/2.6))-.28 if y<184.1 else 1.55
 if top>.27:cube('South gallery first underside screen','wood',(-47.83,y,(.15+top)/2),(.06,.06,top-.15))
for j in range(15):
 x=-46.40+j*.13;top=3.07 if x>-45.95 else 1.2
 cube('South gallery underside front screen','wood',(x,181.47,(.15+top)/2),(.06,.06,top-.15))
# Small benches stay outside the eastern through-route and the transverse road.
for level in [.15,3.35]:
 for y in [170,198]:
  for j in range(4):cube('South gallery bench seats','wood',(-48.1+(j-1.5)*.105,y,level+.45),(.09,2.5,.055))
  for z in [.66,.81]:cube('South gallery bench backs','wood',(-48.33,y,level+z),(.055,2.5,.12))
  for yy in [y-1,y+1]:
   for xx in [-48.27,-47.93]:beam('South gallery bench legs','South gallery bronze',(xx,yy,level),(xx,yy,level+.4225),.025,sides=6)
   beam('South gallery bench back posts','South gallery bronze',(-48.33,yy,level),(-48.33,yy,level+.88),.022,sides=6)
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(M[material]);ob['designRole']=owner
 if 'bench seats' in owner or 'bench backs' in owner:
  mod=ob.modifiers.new('Timber softened edges','BEVEL');mod.width=.012;mod.segments=3
root=bpy.data.objects.new('East Three–Four source gallery — unfinished draft',None);bpy.context.collection.objects.link(root)
root['sourceFeatureIds']=[FID];root['sourceRoadIds']=roadids;root['sourceCommit']='8cdd754f6355de11d9d0d6bb367d6a66cbf7c330';root['status']='WORK_IN_PROGRESS';root['sourceGeometryUnchanged']=True;root['sourceFootprintWKT']=foot.wkt;root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['unresolved']='Authored levels, roof, stair and fixtures; source building_passage retained, clearance not measured; no full-route or structural certification; adjoining East Four not yet modeled.'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('STAIR_RECIPE.py',Path(__file__).parent/'east_stair_core.py')]:bpy.data.texts.new(name).write(path.read_text())
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
world=bpy.data.worlds.new('South gallery daylight');world.use_nodes=True;scene.world=world;nodes=world.node_tree.nodes;sky=nodes.new('ShaderNodeTexSky');sky.sky_type='NISHITA';sky.sun_disc=False;sky.sun_elevation=.65;sky.sun_rotation=2.4;world.node_tree.links.new(sky.outputs['Color'],nodes.get('Background').inputs['Color']);nodes.get('Background').inputs['Strength'].default_value=.2
eye_world=world;eye_world.use_fake_user=True
studio_world=bpy.data.worlds.new('South gallery overview studio');studio_world.use_nodes=True;studio_world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);studio_world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
for y in [158,166,174,182,190,198,206,222]:
 for z in [3.12,roof(-42,y)-.11]:
  bpy.ops.mesh.primitive_cube_add(size=1,location=(-42,y,z));ob=bpy.context.object;ob.name='South gallery mounted ceiling panel';ob.dimensions=(.8,.35,.06);ob.data.materials.append(M['porcelain']);ob.parent=root
  bpy.ops.object.light_add(type='AREA',location=(-42,y,z-.04));lamp=bpy.context.object;lamp.name='South gallery downlight';lamp.data.energy=160;lamp.data.shape='RECTANGLE';lamp.data.size=.75;lamp.data.size_y=.3;lamp.data.color=(1,.95,.88);lamp.parent=root
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=1000
scene.render.engine='CYCLES';scene.cycles.samples=int(next((a.split('=',1)[1] for a in sys.argv if a.startswith('--samples=')),96));scene.cycles.use_denoising=False;scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('south-gallery-overview',(3,124,55),(-48,188,3),100,30),('south-gallery-underpass',(-58,216.39,1.85),(-31,216.28,1.85),None,25),('south-gallery-upper',(-41.5,160,5.05),(-43,196,5.05),None,25),('south-gallery-stair',(-47.125,178.6,1.85),(-47.125,184,2.0),None,24),('south-gallery-stair-upper',(-45.275,178.9,5.05),(-45.275,183,3.8),None,24),('south-gallery-west-footway',(-55,159.6663,1.85),(-42,159.6663,1.85),None,25)]
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
batches.clear();gc.collect()
for i,(name,eye,target,ortho,lens) in enumerate(views):
 scene.world=studio_world if ortho else eye_world
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'east-three-four-gallery.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('SOUTH GALLERY WIP, source passage retained, not accepted')
