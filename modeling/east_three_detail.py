"""East Three's own H-shaped source and three connectors; independent authored work draft."""
import sys,math,hashlib,gc
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
import east_stair_core as stair_core
import east_three_courts as court_details
from landscape_primitives import configure_leaf_materials,foliage_uv
OUT=ROOT/'modeling/east-three-work';OUT.mkdir(exist_ok=True)
IDS=['way/161393058','way/306107365','way/306107366','way/306107367']
main=allshapes[IDS[0]];compound=unary_union([allshapes[i] for i in IDS])
north=main.intersection(Polygon([(-180,269.824),(60,272.363),(60,300),(-180,300)]));south=main.intersection(Polygon([(-180,200),(60,200),(60,245.408),(-180,243.112)]))
spine=main.difference(north.union(south))
parts=[('East Three northern wing',north,5),('East Three southern wing',south,5),('East Three central link',spine,2)]+[('East Three source connector '+fid,allshapes[fid],2) for fid in IDS[1:]]
levels=[.15,3.35,6.55,9.75,12.95,16.15]
mat('East white',(.82,.80,.74),0,.58);mat('East stone',(.66,.64,.57),0,.75)
mat('East bronze',(.31,.29,.24),.55,.42);mat('East glazing',(.12,.15,.16),.35,.22)
mat('East clear glazing',(.73,.78,.79),.03,.09);M['East clear glazing'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.9
mat('East Three identity ink',(.055,.045,.032),0,.62)
mat('East core',(.19,.23,.25),.45,.40);mat('East Three lawn',(.36,.40,.29),0,.95)
clip=box(-176,211,56,298);wet=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='water' and allshapes[f['id']].intersects(clip)]).intersection(clip)
slab('East Three local terrain','ground',clip.difference(wet.buffer(.3)),-1.4,1.4)
slab('East Three source water','water',wet,-1.4,.5);slab('East Three banks','East stone',wet.buffer(.3).difference(wet),-1.4,1.4)
slab('East Three connected ground','paving',compound,0,.15)
cores=[]
for body in [north,south]:
 for x in [-152,-104,-55,33]:
  section=body.intersection(LineString([(x,200),(x,300)]))
  if section.is_empty:continue
  y=section.bounds[1];core=box(x-1.7,y-.3,x+1.7,y+6).intersection(body)
  if core.area>14:cores.append(core)
coremask=unary_union(cores);holes=unary_union([stair_core.floor_opening(p) for p in cores])
# The original central source is wider than the glass corridor. Leave a real ten-metre route.
passage=box(-49,210,-39,300)
transverse=box(-164,256.5,48,260.5);ground_open=passage.union(transverse)
rooflights=[]
for body,y in [(north,277.4),(south,233.7)]:
 for x in range(-145,32,7):
  p=box(x-1.6,y-.75,x+1.6,y+.75)
  if body.buffer(-.5).covers(p) and not coremask.buffer(.4).intersects(p):rooflights.append(p)
roofholes=unary_union(rooflights)
for owner,foot,floors in parts:
 for z in levels[1:floors]:
  upper=foot.difference(holes)
  if owner=='East Three central link':upper=upper.difference(box(-49,246,-40,268))
  slab(owner+' floors','East white',upper,z-.2,.2)
 height=levels[floors];apertures=roofholes if floors==5 else Polygon()
 if owner=='East Three central link':
  slab(owner+' roof edge beam','East white',foot.difference(foot.buffer(-.15)),6.35,.20)
  profile_slab(owner+' curved glass roof','East clear glazing',foot,lambda x,y:6.55+.60*math.sin(math.pi*max(0,min(1,(x+54)/19)))**2,.075,max_segment=.5)
 else:
  slab(owner+' roof','East white',foot.buffer(.18).difference(apertures),height-.2,.24)
  slab(owner+' parapet','East white',foot.difference(foot.buffer(-.15)),height+.04,.25)
 for poly in polygons(foot):
  for ring in [orient(poly,1).exterior,*orient(poly,1).interiors]:
   coords=list(ring.coords)
   for edge_a,edge_b in zip(coords,coords[1:]):
    for i in range(floors):
     lo,hi=levels[i:i+2];run=LineString([edge_a,edge_b]).difference(coremask.buffer(.015))
     if i==0:run=run.difference(ground_open)
     if i==1:run=run.difference(box(-49,280,-41,290).union(box(-49,215,-39,226)))
     segments=[run] if run.geom_type=='LineString' else [g for g in getattr(run,'geoms',[]) if g.geom_type=='LineString']
     for segment in segments:
      if segment.is_empty or segment.length<.1:continue
      a,b=list(segment.coords)[0],list(segment.coords)[-1];t=Vector(b)-Vector(a);length=t.length;t.normalize();n=Vector((t.y,-t.x));rot=math.atan2(t.y,t.x);count=max(1,round(length/3.4));step=length/count
      for j in range(count):
       p=Vector(a)+t*(j+.5)*step;mid=(lo+hi)/2
       if any(other!=owner and levels[nf]>mid and of.buffer(.05).covers(Point(*(p+n*.04))) for other,of,nf in parts):continue
       if floors==5:
        # Solid classroom wings contrast with the transparent low connectors.
        pier=min(.60,step*.28);opening=max(.02,step-pier);z0=lo+.85;z1=lo+2.50
        cube(owner+' classroom piers','East white',(*(p-t*step/2),mid),(pier,.32,hi-lo),rot)
        cube(owner+' classroom sill wall','East white',(*(p+n*.015),lo+.425),(step,.30,.85),rot)
        cube(owner+' classroom head wall','East white',(*(p+n*.015),(z1+hi-.2)/2),(step,.30,hi-.2-z1),rot)
        cube(owner+' recessed classroom windows','East glazing',(*(p-n*.075),(z0+z1)/2),(opening,.08,z1-z0),rot)
        for off in [-opening/2,0,opening/2]:cube(owner+' classroom window frames','East bronze',(*(p+t*off-n*.025),(z0+z1)/2),(.045,.12,z1-z0),rot)
        for z in [z0,z1]:cube(owner+' classroom window rails','East bronze',(*(p-n*.025),z),(opening,.12,.045),rot)
        cube(owner+' classroom projecting sill','East stone',(*(p+n*.10),z0-.045),(opening+.08,.48,.09),rot)
        cube(owner+' classroom shade lintel','East white',(*(p+n*.12),z1+.05),(opening+.12,.52,.10),rot)
       else:
        cube(owner+' piers','East white',(*(p-t*step/2),mid),(.24,.28,hi-lo),rot)
        cube(owner+' sill','East stone',(*(p+n*.015),lo+.34),(step,.20,.68),rot)
        cube(owner+' windows','East clear glazing' if floors==2 else 'East glazing',(*(p+n*.025),lo+.68+(hi-lo-.88)/2),(max(.02,step-.24),.10,hi-lo-.88),rot)
        for off in [-step/2,0,step/2]:cube(owner+' mullions','East bronze',(*(p+t*off+n*.09),lo+.68+(hi-lo-.88)/2),(.04,.13,hi-lo-.88),rot)
        cube(owner+' window rail','East bronze',(*(p+n*.10),lo+1.9),(max(.02,step-.24),.13,.035),rot)
# Guard the actual upper atrium void without closing the two end landings.
void=spine.intersection(box(-49,246,-40,268))
for poly in polygons(void):
 for a,b in zip(list(poly.exterior.coords),list(poly.exterior.coords)[1:]):
  beam('East Three atrium rail','East bronze',(*a,4.45),(*b,4.45),.03,sides=6)
  count=max(1,math.ceil(math.dist(a,b)/.15))
  for j in range(count+1):
   t=j/count;x=a[0]+(b[0]-a[0])*t;y=a[1]+(b[1]-a[1])*t
   beam('East Three atrium guard','East bronze',(x,y,3.35),(x,y,4.45),.015,sides=6)
for y in range(247,269,4):
 seg=spine.intersection(LineString([(-70,y),(-20,y)]))
 if seg.is_empty:continue
 a,b=list(seg.coords)[0],list(seg.coords)[-1]
 pts=[]
 for j in range(25):
  x=a[0]+(b[0]-a[0])*j/24;pts.append((x,y,6.55+.60*math.sin(math.pi*max(0,min(1,(x+54)/19)))**2))
 for aa,bb in zip(pts,pts[1:]):beam('East Three glass roof ribs','East white',aa,bb,.06,sides=6)
 for x,yy in [a,b]:beam('East Three atrium columns','East white',(x,yy,.15),(x,yy,6.55),.10,sides=8)
for p in rooflights:
 x0,y0,x1,y1=p.bounds;cy=(y0+y1)/2
 slab('East Three rooflight curb','East bronze',p.buffer(.05).difference(p),16.19,.11)
 for ya,yb,za,zb in [(y0,cy,16.30,16.66),(cy,y1,16.66,16.30)]:
  face('East Three sloped rooflight glazing','East clear glazing',[(x0,ya,za),(x1,ya,za),(x1,yb,zb),(x0,yb,zb)])
  for x in [x0,x1]:beam('East Three rooflight frames','East bronze',(x,ya,za),(x,yb,zb),.025,sides=6)
 for x in [x0,x1]:face('East Three rooflight end glazing','East clear glazing',[(x,y0,16.30),(x,y1,16.30),(x,cy,16.66)])
lamps=[]
for core in cores:
 cx=core.centroid.x;cy=core.centroid.y
 lamps+=stair_core.build_core(core,levels[:5],entry_offset=.5 if abs(cx+152)<.2 and cy>260 else 0)
courts=[Polygon(r) for r in compound.interiors]
configure_leaf_materials();gardens,court_pavings=court_details.build_courts(courts)
roads=[];walks=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 iswalk=p.get('highway') in ['footway','path','pedestrian','steps'];surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.6 if iswalk else 3.5,cap_style=2,join_style=1)
 (walks if iswalk else roads).append(surface)
road=unary_union(roads).intersection(clip).difference(compound).difference(wet)
walk=unary_union(walks).union(compound.buffer(3)).intersection(clip).difference(compound).difference(unary_union(courts)).difference(wet).difference(road)
slab('East Three source roads','road',road,0,.12);slab('East Three exterior walks','paving',walk,0,.15)
# A suspended identity plate is attached to the real upper-floor underside, never floating.
east_entry=allshapes['way/306107367'].intersection(LineString([(20,258.5),(50,258.5)])).bounds[2]
cube('East Three authored entrance plate','East white',(east_entry-.07,258.5,2.84),(.06,2.4,.38))
for y in [257.6,259.4]:beam('East Three identity plate hangers','East bronze',(east_entry-.07,y,3.03),(east_entry-.07,y,3.15),.008,sides=6)
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  uv=mesh.uv_layers.new(name='Leaf albedo UV')
  for poly,coords in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for idx,co in zip(poly.loop_indices,coords):uv.data[idx].uv=co
 ob=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(M[material]);ob['designRole']=owner
 if owner in ['East Three courtyard bench seat','East Three courtyard bench back','East Three pocket bench seats','East Three pocket bench backs','East Three pocket shared table','East Three pocket stools']:
  bevel=ob.modifiers.new('Soft timber edges','BEVEL');bevel.width=.012;bevel.segments=3
root=bpy.data.objects.new('East Three — source-specific unfinished draft',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=IDS;root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['sourceCommit']='8cdd754f6355de11d9d0d6bb367d6a66cbf7c330';root['status']='WORK_IN_PROGRESS';root['sourceGeometryUnchanged']=True;root['courtyardCount']=len(courts);root['authoredStairCores']=[p.wkt for p in cores];root['unresolved']='Eight ground entrances and top stair views have limited review; courtyard seats and local doorway rays inspected; room details, full road interfaces and southward gallery remain unfinished'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
bpy.ops.object.text_add(location=(east_entry-.0395,258.5,2.84),rotation=(math.pi/2,0,math.pi/2))
sign=bpy.context.object;sign.name='East Three authored entrance identity';sign.data.body='东三教学楼';sign.data.size=1;sign.data.extrude=.004
sign.data.font=bpy.data.fonts.load('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc');sign.data.materials.append(M['East Three identity ink'])
bpy.ops.object.convert(target='MESH')
xs=[v.co.x for v in sign.data.vertices];ys=[v.co.y for v in sign.data.vertices]
cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2;fit=min(1.8/(max(xs)-min(xs)),.24/(max(ys)-min(ys)))
for v in sign.data.vertices:v.co.x=(v.co.x-cx)*fit;v.co.y=(v.co.y-cy)*fit
sign.parent=root

for name,p in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('STAIR_CORE_RECIPE.py',Path(__file__).parent/'east_stair_core.py'),('COURTS_RECIPE.py',Path(__file__).parent/'east_three_courts.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py')]:bpy.data.texts.new(name).write(p.read_text())
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
world=bpy.data.worlds.new('East Three daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
for x,y,z in lamps:
 bpy.ops.object.light_add(type='AREA',location=(x,y,z));lamp=bpy.context.object;lamp.name='East Three stair mounted light';lamp.data.energy=90;lamp.data.shape='RECTANGLE';lamp.data.size=.8;lamp.data.size_y=.2;lamp.data.color=(1,.95,.88)
mat('East Three diffuser',(.95,.92,.83),0,.4);bs=M['East Three diffuser'].node_tree.nodes['Principled BSDF'];bs.inputs['Emission Color'].default_value=(1,.95,.86,1);bs.inputs['Emission Strength'].default_value=3
connector_lights=[]
for fid in IDS[1:]:
 foot=allshapes[fid];cx=foot.centroid.x
 for y in [250,258,266]:
  if foot.buffer(-.3).covers(Point(cx,y)):
   for z in [3.12,6.32]:connector_lights.append((cx,y,z))
for x,y,z in connector_lights+[(-44,227,6.32),(-44,233,6.32),(-44,239,6.32),(-45,281,6.32),(-45,275.5,6.32),(-44,227,3.12),(-44,233,3.12),(-44,240,3.12),(-44,275,3.12),(-44,280,3.12),(-52,250,3.12),(-52,262,3.12),(-37,250,3.12),(-37,262,3.12)]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));ob=bpy.context.object;ob.name='East Three mounted passage fixture';ob.dimensions=(.95,.38,.06);ob.data.materials.append(M['East Three diffuser']);ob.parent=root
 bpy.ops.object.light_add(type='AREA',location=(x,y,z-.04));lamp=bpy.context.object;lamp.name='East Three passage downlight';lamp.data.energy=220;lamp.data.shape='RECTANGLE';lamp.data.size=.9;lamp.data.size_y=.35;lamp.data.color=(1,.95,.88);lamp.parent=root
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=128;scene.cycles.use_denoising=False;scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('east-three-overview',(100,70,160),(-59,253,4),245,30),('east-three-central-ground',(-44,218,1.85),(-44,290,1.85),None,24)]
views.extend([('east-three-west-court',(-123,260.5,1.85),(-127,257.4,.9),None,25),('east-three-middle-court',(-77,261,1.85),(-81,257.4,.9),None,25),('east-three-east-court',(-4,261,1.85),(-8,257.4,.9),None,25)])
for core in cores:
 x0,y0,x1,y1=core.bounds;cx=(x0+x1)/2;offset=.5 if abs(cx+152)<.2 and y0>260 else 0
 name='east-three-'+('north' if y0>260 else 'south')+'-core-'+str(round(cx))+'-entry'
 views.append((name,(cx+offset,y0-4,1.85),(cx+offset,y0+1,1.95),None,24))
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
batches.clear();foliage_uv.clear();gc.collect()
for i,(name,eye,target,ortho,lens) in enumerate(views):
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'east-three-connected.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('EAST THREE WIP: three source courts, original connectors retained; not accepted')
