"""East One teaching group: preserve named and unnamed connecting source bodies.
Author-designed details. Not a campus completion or as-built claim.
"""
import sys,math,hashlib,gc
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf,shrub
import east_auditorium as auditorium
import east_stair_core as stair_core
import east_classroom as classroom
import east_forecourt as forecourt
import east_court_garden as court_garden
import east_lobby as lobby
OUT=ROOT/'modeling/east-teaching-work';OUT.mkdir(exist_ok=True)
IDS=['way/161325315','way/306107372','way/306107373','way/306107374','way/306107375']
source=allshapes[IDS[0]];compound=unary_union([allshapes[i] for i in IDS])
north=source.intersection(box(-180,481,30,520));south=source.intersection(box(-180,410,30,447.3));spine=source.difference(north.union(south))
levels=[.15,3.35,6.55,9.75,12.95,16.15]
parts=[('East One north teaching wing',north,5),('East One south teaching wing',south,5)]
for fid in IDS[1:]:parts.append(('East One connecting body '+fid,allshapes[fid],2 if fid=='way/306107374' else 3))
clip=box(-188,365,45,531)
mat('East white',(.82,.80,.74),0,.58);mat('East stone',(.66,.64,.57),0,.75)
mat('East bronze',(.31,.29,.24),.55,.42);mat('East glazing',(.12,.15,.16),.35,.22)
mat('East clear glazing',(.73,.78,.79),.03,.09);M['East clear glazing'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.9
mat('East core',(.19,.23,.25),.45,.40);mat('East lawn',(.36,.40,.29),0,.95);mat('East soil',(.18,.14,.09),0,.95)
wet=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='water' and allshapes[f['id']].intersects(clip)]).intersection(clip)
slab('East study terrain','ground',clip.difference(wet.buffer(.3)),-1.4,1.4)
slab('East source water','water',wet,-1.4,.5);slab('East water banks','East stone',wet.buffer(.3).difference(wet),-1.4,1.4)
slab('East connected ground floors','paving',compound,0,.15)
# Cross-court passages are an authored pedestrian design, not new routing graph edges.
passage=box(-52,410,-42,520).union(box(-175,459,25,467))
cores=[];core_facade_masks=[];core_recesses=[]
for x,body in [(-151,north),(-106,north),(-55,north),(-8,north),(-151,south),(-106,south),(-55,south),(0,south)]:
 section=body.intersection(LineString([(x,400),(x,520)]))
 if section.is_empty:continue
 y=section.bounds[1]
 core=box(x-1.7,y-.4,x+1.7,y+6.0).intersection(body)
 if core.area>12:
  core_facade_masks.append(core)
  if x==-55 and body is north:
   raw_core=core;core=core.intersection(box(x-1.7,481.30,x+1.7,core.bounds[3]));core_recesses.append((x-1.7,x+1.7,raw_core.difference(core)))
  if x==-151 and body is south:
   raw_core=core;core=core.intersection(box(x-1.7,425.34,x+1.7,core.bounds[3]));core_recesses.append((x-1.7,x+1.7,raw_core.difference(core)))
  cores.append(core)
core_mask=unary_union(core_facade_masks)
prototype_core=next(p for p in cores if abs(p.centroid.x+106)<.1 and p.centroid.y>470)
south_core=next(p for p in cores if abs(p.centroid.x+106)<.1 and p.centroid.y<450)
west_core=next(p for p in cores if abs(p.centroid.x+151)<.1 and p.centroid.y>470)
central_core=next(p for p in cores if abs(p.centroid.x+55)<.1 and p.centroid.y>470)
east_core=next(p for p in cores if abs(p.centroid.x+8)<.1 and p.centroid.y>470)
south_central_core=next(p for p in cores if abs(p.centroid.x+55)<.1 and p.centroid.y<450)
south_east_core=next(p for p in cores if abs(p.centroid.x)<.1 and p.centroid.y<450)
south_west_core=next(p for p in cores if abs(p.centroid.x+151)<.1 and p.centroid.y<450)
detailed_cores=[prototype_core,south_core,west_core,central_core,east_core,south_central_core,south_east_core,south_west_core]
prototype_hole=unary_union([stair_core.floor_opening(p) for p in detailed_cores])
skylights=[]
for y,body in [(500,north),(425.7,south)]:
 for x in range(-147,4,6):
  r=box(x,y,x+4.8,y+1.8)
  if body.buffer(-.2).covers(r) and not core_mask.buffer(.2).intersects(r):skylights.append(r)
roof_apertures=unary_union(skylights)
def facade_run(owner,a,b,lo,hi):
 t=Vector(b)-Vector(a);length=t.length
 if length<.08:return
 t.normalize();n=Vector((t.y,-t.x));rot=math.atan2(t.y,t.x);count=max(1,round(length/3.5));step=length/count;mid=(lo+hi)/2
 for j in range(count):
  p=Vector(a)+t*(j+.5)*step
  if any(other!=owner and levels[nf]>mid and of.buffer(.06).covers(Point(*(p+n*.04))) for other,of,nf in parts):continue
  cube(owner+' facade piers','East white',(*(p-t*step/2),mid),(.28,.30,hi-lo),rot)
  cube(owner+' opaque sill bands','East stone',(*(p+n*.015),lo+.37),(step,.23,.74),rot)
  cube(owner+' glazing panels','East clear glazing' if abs(lo-3.35)<.01 and ((-104<p.x<-73 and p.y>480) or (owner=='East One south teaching wing' and -53<p.x<-41 and p.y>440)) else 'East glazing',(*(p+n*.035),lo+.74+(hi-lo-.94)/2),(max(.02,step-.28),.12,hi-lo-.94),rot)
  # The real floor slab already supplies this band; a second coplanar fascia made black interior seams.
  for off in [-step/2,0,step/2]:cube(owner+' window vertical frames','East bronze',(*(p+t*off+n*.11),lo+.74+(hi-lo-.94)/2),(.045,.15,hi-lo-.94),rot)
  cube(owner+' window horizontal frame','East bronze',(*(p+n*.12),lo+1.95),(max(.02,step-.28),.16,.04),rot)
for owner,foot,floors in parts:
 height=levels[floors]
 for z in levels[1:floors]:slab(owner+' upper floors','East white',foot.difference(prototype_hole),z-.20,.20)
 slab(owner+' roof slab','East white',foot.buffer(.22).difference(roof_apertures),height-.22,.26)
 slab(owner+' parapet','East white',foot.difference(foot.buffer(-.17)),height+.04,.25)
 for poly in polygons(foot):
  for ring in [orient(poly,1).exterior,*orient(poly,1).interiors]:
   pts=list(ring.coords)
   for a,b in zip(pts,pts[1:]):
    for floor in range(floors):
     lo,hi=levels[floor:floor+2];run=LineString([a,b]).difference(core_mask.buffer(.015))
     if floor==0:run=run.difference(passage.union(auditorium.ENTRY_MASK))
     if floor==1 and owner=='East One south teaching wing':run=run.difference(box(-49,420,-45,429))
     segments=[run] if run.geom_type=='LineString' else [g for g in getattr(run,'geoms',[]) if g.geom_type=='LineString']
     for segment in segments:
      if segment.is_empty:continue
      coords=list(segment.coords);facade_run(owner,coords[0],coords[-1],lo,hi)
 # Ground portals have explicit side supports outside their clear walking width.
 for poly in polygons(foot.intersection(passage)):
  for a,b in zip(list(poly.exterior.coords),list(poly.exterior.coords)[1:]):
   m=Point((a[0]+b[0])/2,(a[1]+b[1])/2)
   if passage.boundary.distance(m)<.05:line(owner+' portal flank','East white',[a,b],.22,.15,2.97)
# Authored second-floor portal meets the cultural gallery's northern landing.
for x in [-49.08,-44.92]:
 y=south.boundary.intersection(LineString([(x,420),(x,429)])).y
 cube('East cultural upper portal jamb','East bronze',(x,y,4.75),(.16,.30,2.8))
cube('East cultural upper portal lintel','East bronze',(-47,424.6233,6.23),(4.32,.30,.24))
for recess_x0,recess_x1,recess in core_recesses:
 for x in [recess_x0,recess_x1]:
  slab('East recessed portal side reveals','East stone',recess.intersection(box(x-.09,400,x+.09,520)),.15,16.0)
# Repeated core heights are coherent; no arbitrary sawtooth stack of unrelated blocks.
core_lamps=[]
for core in cores:
 if any(core.equals(p) for p in detailed_cores):
  core_lamps.extend(stair_core.build_core(core,levels[:5],entry_offset=-.5 if core.equals(west_core) else 0,ground_side_entry=core.equals(south_west_core)));continue
 slab('East stair and lift core enclosures','East core',core,.15,18.0)
 slab('East core roof caps','East bronze',core.buffer(.15),18.15,.18)
 for poly in polygons(core):
  pts=list(orient(poly,1).exterior.coords)
  for a,b in zip(pts,pts[1:]):
   t=Vector(b)-Vector(a);length=t.length
   if length<.15:continue
   t.normalize();n=Vector((t.y,-t.x));count=max(1,math.ceil(length/1.1))
   for j in range(count+1):
    p=Vector(a)+t*length*j/count+n*.025
    beam('East core vertical fins','East bronze',(*p,.15),(*p,18.15),.025,sides=6)
   for z in levels[1:]:beam('East core horizontal fins','East bronze',(*(Vector(a)+n*.025),z),(*(Vector(b)+n*.025),z),.022,sides=6)
# Real roof apertures, pitched glass and supporting frames, not a stripe painted on a roof.
for rect in skylights:
 slab('East roof monitor curbs','East white',rect.buffer(.08).difference(rect.buffer(-.04)),16.19,.03)
 x0,y0,x1,y1=rect.bounds;ym=(y0+y1)/2;z0=16.22;zr=17.12
 face('East roof monitor glazing','East clear glazing',[(x0,y0,z0),(x1,y0,z0),(x1,ym,zr),(x0,ym,zr)])
 face('East roof monitor glazing','East clear glazing',[(x0,ym,zr),(x1,ym,zr),(x1,y1,z0),(x0,y1,z0)])
 for x in [x0,x1]:
  face('East roof monitor end glazing','East clear glazing',[(x,y0,z0),(x,y1,z0),(x,ym,zr)])
  beam('East roof monitor rafters','East white',(x,y0,z0),(x,ym,zr),.055,sides=6);beam('East roof monitor rafters','East white',(x,ym,zr),(x,y1,z0),.055,sides=6)
 for y,z in [(y0,z0),(ym,zr),(y1,z0)]:beam('East roof monitor longitudinal frames','East white',(x0,y,z),(x1,y,z),.05,sides=6)
# The central linking space is a low glazed canopy; it never separates the teaching wings.
roof_z=lambda x,y:6.0+1.0*math.sin(math.pi*(y-447.3)/(481-447.3))
profile_slab('East central glazed linking roof','East clear glazing',spine,roof_z,.08,max_segment=.65)
for y in range(449,481,3):
 cut=spine.intersection(LineString([(-60,y),(-35,y)]))
 if cut.geom_type!='LineString' or cut.length<1:continue
 a,b=list(cut.coords)[0],list(cut.coords)[-1]
 beam('East central canopy ribs','East white',(*a,roof_z(*a)),(*b,roof_z(*b)),.075,sides=8)
 for p in [a,b]:beam('East central canopy supports','East white',(*p,.15),(*p,roof_z(*p)),.10,sides=8)
for poly in polygons(spine):
 for a,b in zip(list(poly.exterior.coords),list(poly.exterior.coords)[1:]):
  if abs(a[1]-b[1])<2:continue
  n=max(1,math.ceil(math.dist(a,b)/.8))
  for j in range(n):
   p=(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n);q=(a[0]+(b[0]-a[0])*(j+1)/n,a[1]+(b[1]-a[1])*(j+1)/n)
   beam('East central canopy edge beams','East bronze',(*p,roof_z(*p)),(*q,roof_z(*q)),.065,sides=8)
auditorium_plaza=auditorium.build_auditorium(compound,wet)
# Keep the closed courts created by all five source footprints, including unnamed links.
courts=[]
for poly in polygons(compound):courts.extend(Polygon(r) for r in poly.interiors)
configure_leaf_materials();planted=[]
for i,court in enumerate(sorted(courts,key=lambda p:p.centroid.x)):
 c=court.centroid
 garden=court.buffer(-3.0).difference(box(-180,460.8,30,465.2).union(box(auditorium.CX-1.3,440,auditorium.CX+1.3,465)).union(box(-9.25,463,-6.75,483)))
 if garden.is_empty:continue
 seat_pads=[]
 for j,patch in enumerate(sorted(polygons(garden),key=lambda p:p.area,reverse=True)[:2]):
  if patch.area<35:continue
  p=patch.representative_point();size=min(.95,max(.50,math.sqrt(patch.area)/18))
  broadleaf(p.x,p.y,size,seed=6100+i*10+j)
  # Each court has separate seating placed beside, not across, its east-west path.
  x,y=p.x,p.y+(3 if p.y<463 else -3)
  if not court.covers(Point(x,y).buffer(1.6)):continue
  destination_y=465.2 if y>463 else 460.8
  seat_pads.append(box(x-1.65,y-.70,x+1.65,y+.70).union(LineString([(x,y),(x,destination_y)]).buffer(.75,cap_style=2)).intersection(court))
  back_sign=1 if y>463 else -1
  for k in range(5):cube('East court timber benches','wood',(x,y+(k-2)*.11,.60),(2.6,.095,.07))
  for z in [.80,.96]:cube('East court timber bench backs','wood',(x,y+back_sign*.25,z),(2.6,.06,.12))
  for xx in [x-1,x+1]:beam('East court bench back supports','East bronze',(xx,y+back_sign*.25,.15),(xx,y+back_sign*.25,1.03),.03,sides=6)
  for xx in [x-1,x+1]:
   for yy in [y-.18,y+.18]:beam('East court bench legs','East bronze',(xx,yy,.15),(xx,yy,.57),.03,sides=6)
 garden=garden.difference(unary_union(seat_pads))
 planted.append(garden);slab('East individual courtyard lawns','East lawn',garden,0,.12)
slab('East courtyard pedestrian paving','paving',unary_union(courts).difference(unary_union(planted)),0,.15)
roads=[];walks=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 walking=p.get('highway') in ['footway','path','pedestrian','steps'];surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.6 if walking else 3.5,cap_style=2,join_style=1)
 (walks if walking else roads).append(surface.intersection(clip))
# The source service-road endpoint is a parking arrival, not an unexplained square cut.
service_end=Point(allshapes['way/411343564'].coords[-1])
parking=box(-89.5,379,-74.0,411.5).union(service_end.buffer(6.0,quad_segs=48)).difference(compound).difference(wet)
road=unary_union(roads).union(parking).difference(compound).difference(wet)
for j in range(9):
 y=381.8+j*2.7
 line('East authored parking bay marks','mark',[(-80,y),(-75,y)],.08,.121,.008)
line('East authored parking bay backs','mark',[(-75,381.8),(-75,403.4)],.08,.121,.008)
# Low planting beside the parking area keeps the entrance axis legible.
for j,y in enumerate([386,405]):
 bed=Point(-69,y).buffer(2.4,quad_segs=32);slab('East parking tree soil','East soil',bed,0,.12);slab('East parking tree edging','East white',bed.buffer(.1).difference(bed),0,.15)
 broadleaf(-69,y,.75,seed=6250+j)

parking_walk=LineString([(-85.8,411.5),(-85.8,419),(-47,419),(-47,425)]).buffer(1.3,cap_style=1,join_style=1)
parking_walk=parking_walk.union(LineString([(-85.8,419),(-106,419),(-106,423.4)]).buffer(1.3,cap_style=1,join_style=1))
walk=unary_union(walks).union(parking_walk).union(compound.buffer(4).difference(compound)).difference(road).difference(wet).difference(unary_union(courts)).difference(auditorium_plaza).difference(compound)
slab('East original roads','road',road,0,.12);slab('East exterior walking space','paving',walk,0,.15)
court_garden.build_narrow_court(courts,planted)
court_garden.build_canopy_seats(spine)
forecourt_bed=forecourt.build_forecourt(walk,road,wet,compound,auditorium_plaza)
classroom_lamps=classroom.build_room(north)+classroom.build_study_room(north)
lobby.build_upper_lobby(south)
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  uv=mesh.uv_layers.new(name='Leaf albedo UV')
  for poly,coords in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for idx,co in zip(poly.loop_indices,coords):uv.data[idx].uv=co
 ob=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(M[material]);ob['designRole']=owner
 if owner in ['East forecourt timber bench seats','East forecourt timber bench backs','East narrow court bench seat','East narrow court bench back','East canopy bench seat','East canopy bench back','East court timber benches','East court timber bench backs','East study shared tabletops','East study chair seats','East study chair backs','East study window bench','East upper lobby bench base','East upper lobby bench back','East upper lobby bench cushion']:
  bevel=ob.modifiers.new('Soft timber edges','BEVEL');bevel.width=.012;bevel.segments=3
root=bpy.data.objects.new('East One connected teaching group — work draft',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=IDS+['way/161325273'];root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['sourceGeometryUnchanged']=True;root['status']='WORK_IN_PROGRESS';root['displayFootprint']=compound.union(auditorium.DISPLAY).wkt;root['courtyardCount']=len(courts);root['authoredForecourtPlanting']=forecourt_bed.wkt;root['prototypeStairCore']=prototype_core.wkt;root['detailedStairCores']=[p.wkt for p in detailed_cores];root['stairCoreStatus']='Eight display cores have stair geometry and limited local views reviewed; south-west porch and ground-side connections reviewed; no whole-building accessibility claim'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py'),('AUDITORIUM_RECIPE.py',Path(__file__).parent/'east_auditorium.py'),('STAIR_CORE_RECIPE.py',Path(__file__).parent/'east_stair_core.py'),('CLASSROOM_RECIPE.py',Path(__file__).parent/'east_classroom.py'),('FORECOURT_RECIPE.py',Path(__file__).parent/'east_forecourt.py'),('COURT_GARDEN_RECIPE.py',Path(__file__).parent/'east_court_garden.py'),('LOBBY_RECIPE.py',Path(__file__).parent/'east_lobby.py')]:bpy.data.texts.new(name).write(path.read_text())
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();scene['sourceCommit']='8cdd754f6355de11d9d0d6bb367d6a66cbf7c330'
world=bpy.data.worlds.new('East teaching daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
for x,y,z,energy in classroom_lamps:
 bpy.ops.object.light_add(type='AREA',location=(x,y,z));lamp=bpy.context.object;lamp.name='East classroom mounted downlight';lamp.data.energy=energy;lamp.data.shape='RECTANGLE';lamp.data.size=1.1;lamp.data.size_y=.4;lamp.data.color=(1,.95,.88);lamp.parent=root
for x,y,z in core_lamps:
 bpy.ops.object.light_add(type='AREA',location=(x,y,z));lamp=bpy.context.object;lamp.name='East prototype stair landing light';lamp.data.energy=90;lamp.data.shape='RECTANGLE';lamp.data.size=.8;lamp.data.size_y=.20;lamp.data.color=(1,.95,.88);lamp.parent=root
mat('East diffuser',(.95,.92,.83),0,.4);bs=M['East diffuser'].node_tree.nodes['Principled BSDF'];bs.inputs['Emission Color'].default_value=(1,.95,.86,1);bs.inputs['Emission Strength'].default_value=3
# Ceiling-mounted light makes the real upper connection legible, not a black opening.
for x,y in [(-47,427),(-47,433),(-47,439),(-47,445),(-51,426.5)]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,6.32));fixture=bpy.context.object;fixture.name='East cultural upper lobby fixture';fixture.dimensions=(1.1,.45,.06);fixture.data.materials.append(M['East diffuser']);fixture.parent=root
 bpy.ops.object.light_add(type='AREA',location=(x,y,6.275));lamp=bpy.context.object;lamp.name='East cultural upper lobby downlight';lamp.data.energy=220;lamp.data.shape='RECTANGLE';lamp.data.size=1.05;lamp.data.size_y=.40;lamp.data.color=(1,.95,.88);lamp.parent=root
for x,y in [(-146.5,426.2),(-148.0,426.2),(-47,428),(-47,435),(-47,442),(-47,486),(-47,493),(-47,500),(-153,463),(-106,463),(-106,469),(-106,474),(-106,479),(-152.7,469),(-152.7,474),(-152.7,479),(-15,463),(3,463),(auditorium.CX,425),(auditorium.CX,427),(auditorium.CX,432),(auditorium.CX,437),(auditorium.CX,443)]:
 if not any(foot.covers(Point(x,y)) for _,foot,_ in parts):continue
 z=3.02 if abs(x-auditorium.CX)<.1 and y<428 else 3.12
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));lamp=bpy.context.object;lamp.name='East portal ceiling fixture';lamp.dimensions=(.95,.38,.06);lamp.data.materials.append(M['East diffuser']);lamp.parent=root
 bpy.ops.object.light_add(type='AREA',location=(x,y,z-.04));lamp=bpy.context.object;lamp.name='East portal downlight';lamp.data.energy=240;lamp.data.shape='RECTANGLE';lamp.data.size=.9;lamp.data.size_y=.35;lamp.data.color=(1,.95,.88);lamp.parent=root
for j in range(8):
 a=j*math.tau/8;x=auditorium.CX+12*math.cos(a);y=auditorium.CY+12*math.sin(a)
 bpy.ops.object.light_add(type='AREA',location=(x,y,6.60));lamp=bpy.context.object;lamp.name='Waterfront hall pendant light';lamp.data.energy=300;lamp.data.shape='DISK';lamp.data.size=.78;lamp.data.color=(1,.95,.88);lamp.parent=root
for title,position,rotation in [('东一教学楼',(-47,424.43,6.12),(math.pi/2,0,0)),('东一教学楼',(-47,504.66,3.72),(math.pi/2,0,math.pi)),('临水报告厅',(auditorium.CX-auditorium.R+.65,auditorium.CY,3.18),(math.pi/2,0,-math.pi/2))]:
 bpy.ops.object.text_add(location=position,rotation=rotation);ob=bpy.context.object;ob.name='East teaching entrance identity';ob.data.body=title;ob.data.align_x='CENTER';ob.data.size=.12 if position[2]>6 else .30;ob.data.extrude=.004;ob.data.font=bpy.data.fonts.load('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');ob.data.materials.append(M['East bronze']);bpy.ops.object.convert(target='MESH');ob.parent=root
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),128);scene.cycles.use_denoising=False;scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('east-one-overview',(75,295,195),(-77,450,6),235,30),('east-one-central-walk',(-47,414,1.85),(-47,505,2),None,26),('east-one-court-crossing',(-133,463,1.85),(-65,463,2),None,26),('east-one-roof-monitors',(-120,514,22),(-105,491,15),None,28)]
views.extend([('waterfront-to-west-court',(auditorium.CX,442,1.85),(auditorium.CX,468,1.85),None,24),('waterfront-hall-north-foyer',(auditorium.CX-1,auditorium.CY+21,1.85),(auditorium.CX-4,auditorium.CY+19.5,1.85),None,24),('waterfront-hall-rear-arrival',(auditorium.CX-18,auditorium.CY,1.85),(auditorium.CX-10,auditorium.CY,2.0),None,24),('waterfront-hall-exterior',(-199,357,16),(auditorium.CX,auditorium.CY,4),None,27),('waterfront-hall-interior',(auditorium.CX-11.5,auditorium.CY,3.11),(auditorium.CX+14,auditorium.CY,3.1),None,20),('waterfront-hall-connector',(auditorium.CX,auditorium.CY+auditorium.R+1.0,1.85),(auditorium.CX,432,1.85),None,24)])
sx0,sy0,sx1,sy1,scx,sfront=stair_core.dimensions(prototype_core)
views.extend([('east-core-first-flight',(sx0+.6,sy0+.65,1.85),(sx0+.6,sy0+4.3,2.4),None,20),('east-core-upper-arrival',(sx1-.6,sy0+.65,5.05),(scx,sy0+4.0,4.4),None,20),('east-core-side-door',(prototype_core.bounds[2]+2,prototype_core.bounds[1]+.85,5.05),(scx,prototype_core.bounds[1]+.85,4.8),None,22)])
views.extend([('east-classroom-approach',(-103,485.1,5.05),(-92.8,487,5),None,24),('east-classroom-interior',(-90.7,495.0,5.05),(-100.7,495,5.0),None,22)])
views.extend([('east-classroom-seated',(-92.46,496,4.59),(-100.7,495,5.0),None,28),('east-classroom-doorway',(-92.85,485.9,5.05),(-94,490,5.0),None,24)])
views.extend([('east-core-ground-entrance',(-106,479.6,1.85),(-106,485.0,1.9),None,22),('east-core-top-landing',(sx1-.6,sy0+.65,14.65),(scx,sy0+3.7,13.5),None,22)])
tx0,ty0,tx1,ty1,tcx,tfront=stair_core.dimensions(south_core)
views.extend([('east-south-core-entry',(-106,419,1.85),(-106,425,1.9),None,24),('east-south-core-first-flight',(tx0+.6,ty0+.65,1.85),(tx0+.6,ty0+4.3,2.4),None,22),('east-south-core-upper-door',(south_core.bounds[2]+2,south_core.bounds[1]+.85,5.05),(tcx,south_core.bounds[1]+.85,4.8),None,24)])
views.extend([('east-south-core-approach',(-87,419,1.85),(-106,423,1.5),None,25),('east-south-core-return',(-105.4,422,1.85),(-85.8,419,1.5),None,25)])
views.extend([('east-forecourt-bench',(-107.5,421.9,1.65),(-110.5,420.0,.75),None,25)])
wx0,wy0,wx1,wy1,wcx,wfront=stair_core.dimensions(west_core)
views.extend([('east-west-core-entry',(-151.5,480.8,1.85),(-151.5,486.5,1.9),None,24),('east-west-core-upper-flight',(wx1-.6,wy0+.65,5.05),(wcx,wy0+4,4.4),None,22),('east-west-core-side-door',(west_core.bounds[2]+2,west_core.bounds[1]+.85,5.05),(wcx,west_core.bounds[1]+.85,4.8),None,24)])
views.extend([('east-west-core-exit',(-151.5,484.65,1.85),(-151.5,478,1.85),None,24)])
cx0,cy0,cx1,cy1,ccx,cfront=stair_core.dimensions(central_core)
views.extend([('east-central-core-entry',(-55,477.5,1.85),(-55,484.0,1.9),None,24),('east-central-core-upper',(cx1-.6,cy0+.65,5.05),(ccx,cy0+4.0,4.4),None,22),('east-central-core-side-door',(central_core.bounds[2]+2,central_core.bounds[1]+.85,5.05),(ccx,central_core.bounds[1]+.85,4.8),None,24)])
ex0,ey0,ex1,ey1,ecx,efront=stair_core.dimensions(east_core)
views.extend([('east-eastern-core-entry',(-5,480.5,1.85),(-8,483,1.8),None,22),('east-eastern-core-upper',(ex1-.6,ey0+.65,5.05),(ecx,ey0+4,4.4),None,22),('east-eastern-core-court-path',(-8,466,1.85),(-8,482.5,1.85),None,24)])
views.extend([('east-narrow-court-seat',(-3.3,469,1.65),(-2.8,473,.75),None,25)])
qx0,qy0,qx1,qy1,qcx,qfront=stair_core.dimensions(south_central_core)
views.extend([('east-south-central-entry',(-55,421,1.85),(-55,426.5,1.9),None,24),('east-south-central-top',(qx1-.6,qy0+.65,14.65),(qcx,qy0+3.7,13.5),None,22),('east-south-central-side',(south_central_core.bounds[2]+2,south_central_core.bounds[1]+.85,5.05),(qcx,south_central_core.bounds[1]+.85,4.8),None,24)])
rx0,ry0,rx1,ry1,rcx,rfront=stair_core.dimensions(south_east_core)
views.extend([('east-south-east-entry',(0,421.5,1.85),(0,427,1.9),None,24),('east-south-east-upper',(rx1-.6,ry0+.65,5.05),(rcx,ry0+4,4.4),None,22),('east-south-east-side',(south_east_core.bounds[2]+2,south_east_core.bounds[1]+.85,5.05),(rcx,south_east_core.bounds[1]+.85,4.8),None,24)])
ux0,uy0,ux1,uy1,ucx,ufront=stair_core.dimensions(south_west_core)
views.extend([('east-south-west-porch',(-154,424,1.85),(-151,425.6,1.85),None,24),('east-south-west-first-flight',(ux0+.6,uy0+.65,1.85),(ux0+.6,uy0+4.3,2.4),None,22),('east-south-west-side',(south_west_core.bounds[2]+2,south_west_core.bounds[1]+.85,5.05),(ucx,south_west_core.bounds[1]+.85,4.8),None,24)])
views.extend([('east-south-west-ground-side',(-145,426.2,1.85),(-150,426.2,1.85),None,24)])
views.extend([('east-south-west-porch-near',(-150.8,423.7,1.85),(-151,425.8,1.85),None,24),('east-south-west-porch-wide',(-157,421.5,1.85),(-149,425,2),None,25)])
views.extend([('east-central-canopy-walk',(-47,452,1.85),(-47,477,2.2),None,25),('east-canopy-seat-near',(-49.8,452.0,1.65),(-53,453.5,.75),None,25)])
views.extend([('east-court-seat-approach',(-85,463,1.85),(-78.85,468.75,.9),None,25),('east-court-seat-ground',(-78.85,465.5,1.65),(-78.85,469.3,.75),None,25)])
views.extend([('east-group-study-entry',(-85.95,485.6,5.05),(-83,493,4.7),None,24),('east-group-study-interior',(-75.2,488.2,5.05),(-84,498,4.8),None,24)])
views.extend([('east-study-seated',(-77.65,493.17,4.59),(-78.3,491.5,4.3),None,26),('east-study-shelf-aisle',(-87.5,488.8,5.05),(-88.7,495.2,4.8),None,26)])
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None);batches.clear();foliage_uv.clear();gc.collect()
for i,(name,eye,target,ortho,lens) in enumerate(views):
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'east-one-connected.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('EAST ONE INITIAL DRAFT: source bodies',IDS,'courts',len(courts),'NOT ACCEPTED; auditorium authored; cultural upper portal authored; see separate east precinct for combined review')
