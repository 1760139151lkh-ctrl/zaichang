"""Individually authored basic library A and information tower C.
Source anchors and identities are retained. Reference appearance is not an as-built survey.
"""
import sys,math,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf,shrub
OUT=ROOT/'modeling/basic-library-work';OUT.mkdir(exist_ok=True)
ids=['way/161324040','way/237812466'];C0=allshapes[ids[0]];A=allshapes[ids[1]]
cx,cy=C0.centroid.x,C0.centroid.y
mat('library_glass',(.075,.09,.098),.52,.25);mat('library_frame',(.24,.235,.215),.55,.38)
mat('library_white',(.83,.81,.75),.15,.45);mat('library_roof',(.51,.36,.21),.25,.65)
mat('library_wall',(.62,.59,.52),0,.72);mat('library_floor',(.65,.61,.54),0,.8)
mat('library_soil',(.16,.13,.09),0,.95)
mat('entry_glass',(.72,.77,.77),.05,.10)
M['entry_glass'].node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=.90
# Opposite rounded corners, not a cylinder. NW/SE cores stay square.
x0,y0,x1,y1=C0.bounds;r=18.0
pts=[(x0,y1),(x1-r,y1)]
pts += [(x1-r+r*math.cos(math.radians(90-i*90/36)),y1-r+r*math.sin(math.radians(90-i*90/36))) for i in range(37)]
pts += [(x1,y0),(x0+r,y0)]
pts += [(x0+r+r*math.cos(math.radians(270-i*90/36)),y0+r+r*math.sin(math.radians(270-i*90/36))) for i in range(37)]
C=Polygon(pts);C=translate(C,cx-C.centroid.x,cy-C.centroid.y);C=orient(C,1)
print('C DISPLAY centre displacement',C.centroid.distance(C0.centroid),'outline Hausdorff',C.boundary.hausdorff_distance(C0.boundary))
clip=box(-214,539,-38,693)
wet=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='water' and allshapes[f['id']].intersects(clip)]).intersection(clip)
roads=[];walks=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 walk=p.get('highway') in ['footway','path','pedestrian','steps']
 surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.5 if walk else 3.5,cap_style=2,join_style=1)
 (walks if walk else roads).append(surface.intersection(clip))
foot=A.union(C);road=unary_union(roads).difference(foot).difference(wet)
plaza=foot.buffer(7,join_style=2).union(unary_union(walks)).difference(foot).difference(road).difference(wet).intersection(clip)
slab('Basic library ground','ground',clip.difference(wet.buffer(.35)),-1.5,1.5)
slab('Source lake','water',wet,-1.4,.5);slab('Lake bank','library_wall',wet.buffer(.35).difference(wet),-1.4,1.4)
slab('Source roads','road',road,0,.12);slab('Basic library plaza','paving',plaza,0,.15)
# C has a walkable ground arcade with a smaller enclosed core.
slab('Tower arcade floor','library_floor',C,0,.15)
core=box(cx-8,cy-8,cx+8,cy+8)
lobby_shell=core.difference(core.buffer(-.35)).difference(box(cx-6,cy-8.5,cx+6,cy-7.5).union(box(cx-6,cy+7.5,cx+6,cy+8.5)))
slab('Tower lobby walls','library_wall',lobby_shell,.15,4.05)
slab('Tower central core','library_wall',core,4.38,48.27)
# Lobby entry glazing and actual doors, placed on the core rather than blocking arcade.
for side in [-1,1]:
 y=cy+side*8.04
 cube('Tower lobby glazing','entry_glass',(cx,y,2.1),(12,.12,3.9))
 for dx in [-6,-3,0,3,6]:cube('Tower lobby doorframes','library_frame',(cx+dx,y+side*.09,2.1),(.065,.16,3.9))
 for dx in [-1.65,-1.35,1.35,1.65]:beam('Tower door handles','bronze',(cx+dx,y+side*.18,1.1),(cx+dx,y+side*.18,1.8),.023,sides=8)
# Evenly spaced perimeter columns stop at the underside of the occupied floors.
perimeter=C.buffer(-1.1).exterior
for i in range(28):
 q=perimeter.interpolate(i*perimeter.length/28)
 cube('Tower arcade columns','library_white',(q.x,q.y,2.175),(.58,.58,4.05))
for k in range(18):
 z=4.2+k*2.85
 slab('Tower structural floor rims','library_frame',C,z,.18)
 if k==17:break
 # The structural floor is already a full slab; no overlapping duplicate plate.
 points=list(C.segmentize(1.85).exterior.coords)
 for p,q in zip(points,points[1:]):
  d=Vector(q)-Vector(p);n=Vector((d.y,-d.x)).normalized();a=Vector(p);b=Vector(q)
  face('Tower glazing panels','library_glass',[(*a,z+.18),(*b,z+.18),(*b,z+2.85),(*a,z+2.85)])
  beam('Tower vertical mullions','library_frame',(*(a+n*.025),z+.18),(*(a+n*.025),z+2.85),.035,sides=6)
  for dz in [1.10,2.0]:beam('Tower horizontal transoms','library_frame',(*(a+n*.03),z+dz),(*(b+n*.03),z+dz),.025,sides=6)
# Crown: open white outer ribbon and inner ring, real spokes and support columns.
roof_z=52.65;inner=Point(cx,cy).buffer(7.0,quad_segs=64)
slab('Tower roof courtyard','library_roof',C.buffer(-.4),roof_z,.16)
outer_ring=C.buffer(.9).difference(C.buffer(-2.0));inner_ring=inner.buffer(.65).difference(inner.buffer(-.65))
slab('Crown outer ribbon','library_white',outer_ring,54.55,.30)
slab('Crown inner ribbon','library_white',inner_ring,54.55,.30)
# The diagonal square cores are coherent elements rising above the crown.
cores=[box(x0+.2,y1-8.5,x0+8.5,y1-.2),box(x1-8.5,y0+.2,x1-.2,y0+8.5)]
for cp in cores:
 cp=cp.intersection(C)
 slab('Diagonal square lift towers','library_frame',cp,4.38,51.12)
 slab('Square crown caps','library_roof',cp.buffer(.25),55.5,.25)
 for p,q in zip(list(cp.exterior.coords),list(cp.exterior.coords)[1:]):
  for z in [4.2+k*2.85 for k in range(18)]:line('Square core level joints','library_wall',[p,q],.045,z,.025)
for i in range(24):
 t=i*math.tau/24;u=Vector((math.cos(t),math.sin(t)));a=Vector((cx,cy))+u*7.6
 ray=LineString([(cx,cy),tuple(Vector((cx,cy))+u*40)])
 end=ray.intersection(C.buffer(-1).boundary)
 if end.is_empty or end.geom_type!='Point':continue
 b=Vector((end.x,end.y));mid=(a+b)/2
 if any(cp.buffer(.1).contains(Point(*mid)) for cp in cores):continue
 beam('Crown radial beams','library_white',(*a,54.62),(*b,54.62),.12,sides=4)
 beam('Crown perimeter supports','library_white',(*b,roof_z+.16),(*b,54.55),.11,sides=8)
# Safety railing inside the crown, not an unprotected roof edge.
for poly in [C.buffer(-.45),inner.buffer(-.85)]:
 pts=list(poly.segmentize(1.8).exterior.coords)
 for a,b in zip(pts,pts[1:]):
  beam('Crown guard top','library_frame',(*a,53.91),(*b,53.91),.035,sides=6)
  beam('Crown guard posts','library_frame',(*a,roof_z+.16),(*a,53.91),.025,sides=6)
# A preserves its whole L footprint; four uniform floors, not seven uneven blocks.
slab('A library plinth','library_white',A,0,.75)

# Glass-roof reading hall is an authored subdivision of the existing footprint.
hall=box(-113,620,-81,649).intersection(A.buffer(-1.2))
hall_void=box(-113,620,-74,649).intersection(A)
slab('A roof support','library_wall',A.buffer(-.45).difference(hall),15.85,.15)
for k in range(4):
 z=.75+k*3.75
 if k:slab('A floor edge','library_white',A.difference(A.buffer(-.25)).difference(hall_void),z,.18)
 if k>0:slab('A reading floor','library_floor',A.difference(hall_void).buffer(-.15),z,.15)
points=list(orient(A,1).exterior.coords)
for p,q in zip(points,points[1:]):
 d=Vector(q)-Vector(p);length=d.length;d.normalize();n=Vector((d.y,-d.x));count=max(1,round(length/3.8));step=length/count
 for j in range(count):
  a=Vector(p)+d*(j*step);b=Vector(p)+d*((j+1)*step)
  # East hall front remains an open entrance colonnade, with doors recessed inside.
  is_hall_front=(a.x>-82 and b.x>-82 and 620<(a.y+b.y)/2<649)
  if is_hall_front:continue
  for k in range(4):
   z=.93+k*3.75
   face('A library windows','library_glass',[(*a,z),(*b,z),(*b,z+3.42),(*a,z+3.42)])
   for t in [0,.5]:
    pos=a+(b-a)*t+n*.025;beam('A vertical window frames','library_frame',(*pos,z),(*pos,z+3.42),.045,sides=6)
   for dz in [1.1,2.4]:beam('A horizontal window frames','library_frame',(*(a+n*.03),z+dz),(*(b+n*.03),z+dz),.035,sides=6)
  pos=a+n*.10;cube('A structural facade pilasters','library_white',(*pos,8.25),(.22,.30,15.0),math.atan2(d.y,d.x))
# Tall recessed entrance glazing above the doors keeps the atrium weather-enclosed.
for y0 in [620,625,630,635,640,645]:
 y1=min(649,y0+5)
 face('Hall high entrance glazing','entry_glass',[(-87,y0,4.25),(-87,y1,4.25),(-87,y1,15.8),(-87,y0,15.8)])
 beam('Hall tall entrance mullions','library_white',(-86.9,y0,4.25),(-86.9,y0,15.8),.065,sides=6)
 for z in [8.0,11.75]:beam('Hall high transoms','library_frame',(-86.9,y0,z),(-86.9,y1,z),.05,sides=6)
# Continuous roof perimeter and subtly ribbed tan panels.
roof=A.buffer(.65,join_style=2).difference(hall)
slab('A warm metal roof','library_roof',roof,16.0,.18)
slab('A white roof fascia','library_white',A.buffer(.85,join_style=2).difference(A.buffer(.5,join_style=2)),15.85,.4)
for x in range(-173,-76,2):
 line_g=LineString([(x,590),(x,662)]).buffer(.018).intersection(roof)
 slab('A fine standing seams','bronze',line_g,16.18,.035)
# Shallow glass roof over an airy hall with real columns and roof grid.
mat('Skylight glass',(.80,.85,.86),0,.08)
M['Skylight glass'].node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=.94
slab('Hall glazed roof','Skylight glass',hall,15.95,.08)
for x in range(-113,-80,4):
 for pp in polygons(box(x-.07,619,x+.07,650).intersection(hall)):slab('Hall roof grid','library_white',pp,15.85,.24)
for y in range(620,650,4):slab('Hall roof grid','library_white',box(-114,y-.07,-80,y+.07).intersection(hall),15.85,.24)
for x in [-111,-83]:
 for y in [622,630,638,646]:cube('Hall slender columns','library_white',(x,y,8.35),(.40,.40,15.2))
# Solid side returns close the atrium to adjacent occupied floors without pinching the entry.
for y in [620,649]:
 cube('Hall deep entrance jambs','library_white',(-82.3,y,8.3),(9.4,.24,15.1))
face('Hall ground sidelights','entry_glass',[(-87.08,620,.75),(-87.08,649,.75),(-87.08,649,4.25),(-87.08,620,4.25)])
# Recessed glazed entrance west of the colonnade. Doors have frames and handles.
for y in [626,631,636,641]:
 cube('Hall entrance glazing','entry_glass',(-87,y,2.5),(.12,4.8,3.5))
 for dy in [-2.4,0,2.4]:cube('Hall door frames','library_frame',(-86.90,y+dy,2.5),(.18,.06,3.5))
 for dy in [-.18,.18]:beam('Hall door handles','bronze',(-86.80,y+dy,1.7),(-86.80,y+dy,2.4),.022,sides=8)
# Four shallow steps and a separate side ramp, cut to dry pedestrian land.
entry=box(-78.4,622,-73.8,646).difference(road).difference(wet).difference(A)
for k in range(4):slab('Hall arrival steps','library_white',entry.intersection(box(-78.4,622,-73.8-k*1.0,646)),.15,.15*(k+1))
landing=box(-78.4,646,-73.5,648.4).difference(A).difference(road).difference(wet)
slab('Hall ramp top landing','library_floor',landing,.15,.60)
ramp=box(-75.9,648.4,-73.5,656.4).difference(road).difference(wet).difference(A)
profile_slab('Hall side accessible ramp','library_floor',ramp,lambda x,y:.75-.60*max(0,min(1,(y-648.4)/8)),.75)
for x in [-75.85,-73.55]:
 for i in range(8):
  y=648.4+i;z=.75-.60*i/8
  beam('Hall ramp handrail','bronze',(x,y,z+.95),(x,y+1,z+.95-.60/8),.035,sides=8)
  beam('Hall ramp rail posts','bronze',(x,y,z),(x,y,z+.95),.025,sides=8)
# An individually furnished double-height reading hall under the glazed roof.
for x in [-105,-96]:
 for y in [626,634,642]:
  cube('Hall reading table tops','wood',(x,y,1.50),(3.6,1.15,.07))
  for dx in [-1.45,1.45]:
   for dy in [-.38,.38]:cube('Hall table legs','library_frame',(x+dx,y+dy,1.13),(.07,.07,.70))
  for dx in [-1.15,0,1.15]:
   for side in [-1,1]:
    yy=y+side*1.05
    cube('Hall reading chairs','wood',(x+dx,yy,1.20),(.48,.48,.07))
    cube('Hall chair backs','wood',(x+dx,yy+side*.21,1.47),(.48,.065,.50))
    for sx in [-.18,.18]:
     for sy in [-.18,.18]:cube('Hall chair legs','library_frame',(x+dx+sx,yy+sy,.98),(.035,.035,.43))
  cube('Hall table cable spine','bronze',(x,y,1.56),(3.1,.11,.04))
for y in [623,631,639,647]:
 cube('Hall shelving backs','library_wall',(-110.5,y,1.8),(.12,3.2,2.1))
 for z in [1.0,1.45,1.9,2.35,2.8]:cube('Hall bookshelf shelves','wood',(-110.15,y,z),(.65,3.2,.055))
 for j in range(32):
  for row in range(4):
   yy=y-1.48+j*.092;zz=1.18+row*.45
   cube('Hall individual books',('library_roof' if j%3==0 else 'library_frame' if j%3==1 else 'library_white'),(-110.13,yy,zz),(.40,.07,.27+.04*(j%3)))
# Upper reading galleries have actual guards along the atrium, not exposed slab edges.
for z in [4.5,8.25,12.0]:
 for a,b in [((-113,620),(-113,649)),((-113,620),(-87,620)),((-113,649),(-87,649))]:
  path=LineString([a,b]);beam('Atrium gallery handrails','library_frame',(*a,z+1.1),(*b,z+1.1),.04,sides=8)
  for i in range(math.ceil(path.length/1.2)+1):
   q=path.interpolate(min(path.length,i*1.2));beam('Gallery guard posts','library_frame',(q.x,q.y,z+.15),(q.x,q.y,z+1.1),.025,sides=6)
  # Light neutral lower panel keeps the gallery edges legible.
  face('Atrium gallery guard panels','library_white',[(*a,z+.15),(*b,z+.15),(*b,z+.80),(*a,z+.80)])
# Limited specimen trees, with explicit clearance from roads, water and buildings.
configure_leaf_materials();all_buildings=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='building'])
for idx,(x,y) in enumerate([(-123,581),(-99,580),(-53,649),(-192,626),(-161,679)]):
 pit=Point(x,y).buffer(1.4,quad_segs=24)
 if not clip.covers(pit.buffer(3)) or pit.buffer(2.6).intersects(all_buildings.union(road).union(wet)):continue
 # Trees are in non-paved dry land; no hidden planter across a walking path.
 if pit.buffer(.5).intersects(plaza):continue
 slab('Library specimen tree soil','library_soil',pit,.01,.035)
 slab('Library planter edge','library_white',pit.buffer(.10).difference(pit),.01,.13)
 broadleaf(x,y,.85,1200+idx)
 print('LIBRARY TREE',idx,x,y)
for side in [-1,1]:
 for yoff in [-4,4]:
  x=cx+side*9.25;y=cy+yoff
  cube('Tower arcade bench seat','wood',(x,y,.61),(.50,2.4,.08))
  for dy in [-.9,.9]:cube('Tower bench legs','library_frame',(x,y+dy,.37),(.36,.07,.44))
 for yoff in range(-7,8):
  cube('Tower core vertical battens','wood',(cx+side*8.05,cy+yoff,.15+2.0),(.10,.075,3.7))
# Near-ground joints, not raised obstacles.
for x in range(-214,-37,2):slab('Plaza flush joints','library_wall',box(x-.008,539,x+.008,693).intersection(plaza),.151)
for y in range(539,694,2):slab('Plaza flush joints','library_wall',box(-214,y-.008,-38,y+.008).intersection(plaza),.151)
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(M[material]);obj['designRole']=owner
 if (owner,material) in foliage_uv:
  layer=mesh.uv_layers.new(name='Leaf albedo UV')
  for polygon,uvs in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for loop,uv in zip(polygon.loop_indices,uvs):layer.data[loop].uv=uv
 if owner in ['Hall reading chairs','Hall chair backs','Hall reading table tops']:
  bevel=obj.modifiers.new('Soft furniture edges','BEVEL');bevel.width=.018;bevel.segments=3
root=bpy.data.objects.new('Basic library A and tower C — authored WIP',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=ids;root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['sourceGeometryUnchanged']=True;root['displayFootprintC']=C.wkt;root['displayFootprintA']=A.wkt;root['status']='WORK_IN_PROGRESS'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py')]:bpy.data.texts.new(name).write(path.read_text())
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
world=bpy.data.worlds.new('Basic library daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
# Permanent recessed downlights brighten the arcade, rather than a camera-only lamp.
mat('Library light diffuser',(.95,.91,.80),0,.4)
shader=M['Library light diffuser'].node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(1,.93,.80,1);shader.inputs['Emission Strength'].default_value=4
for x,y,z in [(cx+dx,cy+dy,4.08) for dx,dy in [(-12,-7),(-12,7),(12,-7),(12,7),(-5,-12),(5,12)]]+[(-83,y,15.6) for y in [624,634,644]]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));ob=bpy.context.object;ob.name='Recessed arcade luminaire';ob.dimensions=(.45,.45,.035);ob.data.materials.append(M['Library light diffuser']);ob.parent=root
 bpy.ops.object.light_add(type='AREA',location=(x,y,z-.03));light=bpy.context.object;light.name='Arcade downlight';light.data.energy=120 if z<5 else 600;light.data.shape='DISK';light.data.size=.43;light.data.color=(1,.93,.83);light.parent=root
# Suspended reading luminaires with actual support cables, warm but neutral daylight.
for x in [-105,-96]:
 for y in [626,634,642]:
  for dx in [-1.35,1.35]:
   bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.016,depth=11.22,location=(x+dx,y,10.21));ob=bpy.context.object;ob.name='Reading luminaire suspension';ob.data.materials.append(M['library_frame']);ob.parent=root
  bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,4.54));ob=bpy.context.object;ob.name='Reading pendant housing';ob.dimensions=(3.2,.48,.16);ob.data.materials.append(M['library_frame']);ob.parent=root
  bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,4.45));ob=bpy.context.object;ob.name='Reading pendant diffuser';ob.dimensions=(3.05,.36,.025);ob.data.materials.append(M['Library light diffuser']);ob.parent=root
  bpy.ops.object.light_add(type='AREA',location=(x,y,4.42));ob=bpy.context.object;ob.name='Reading table downlight';ob.data.energy=900;ob.data.shape='RECTANGLE';ob.data.size=3.05;ob.data.size_y=.36;ob.data.color=(1,.95,.88);ob.parent=root
# Roof-mounted indirect atrium fill is a physical installed luminaire.
for x,y in [(-110,624),(-110,645),(-89,624),(-89,645)]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,14.90));ob=bpy.context.object;ob.name='Atrium ceiling fixture';ob.dimensions=(.8,.8,.10);ob.data.materials.append(M['Library light diffuser']);ob.parent=root
 bpy.ops.object.light_add(type='AREA',location=(x,y,14.84));ob=bpy.context.object;ob.name='Atrium ceiling downlight';ob.data.energy=1900;ob.data.shape='DISK';ob.data.size=.75;ob.data.color=(1,.96,.90);ob.parent=root
# Human-readable entrance identities, not floating geographic labels.
for label,position,size in [('基础图书馆',(-86.72,634,4.80),.60),('图书信息 C 楼',(cx,cy-8.18,3.65),.32)]:
 rotation=(math.pi/2,0,math.pi/2) if label=='基础图书馆' else (math.pi/2,0,0)
 bpy.ops.object.text_add(location=position,rotation=rotation);ob=bpy.context.object;ob.name='Building entrance identity';ob.data.body=label;ob.data.align_x='CENTER';ob.data.size=size;ob.data.extrude=.004;ob.data.font=bpy.data.fonts.load('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');ob.data.materials.append(M['bronze']);bpy.ops.object.convert(target='MESH');ob.parent=root
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),64);scene.cycles.use_denoising=False;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('basic-library-overview',(-260,490,135),(-129,619,17),175,32),('tower-arcade',(-181,580,1.85),(-177,602,2.0),None,24),('east-library-entry',(-55,632,1.85),(-89,634,4),None,26),('tower-crown',(-220,541,98),(cx,cy,53),70,35)]
views.extend([('hall-reading-room',(-89,624,2.45),(-104,637,3.0),None,24),('hall-ramp-arrival',(-73,658,1.85),(-76,644,2.2),None,24)])
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
for i,(name,location,target,ortho,lens) in enumerate(views):
 cam.location=location;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'basic-library-and-c.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('BASIC LIBRARY A/C INITIAL DRAFT — NOT ACCEPTED; ACTUAL VIEWS REQUIRE REVIEW')
