"""Individually authored small theatre and connected low wings; source anchors retained."""
import sys,math,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf
OUT=ROOT/'modeling/theatre-work';OUT.mkdir(exist_ok=True)
ids=['way/232499325','way/237808500'];A=allshapes[ids[0]];B=allshapes[ids[1]];cx,cy=A.centroid.x,A.centroid.y
rx,ry=34.4,23.7
mat('theatre_stone',(.70,.66,.57),0,.68);mat('theatre_light',(.85,.82,.74),0,.52)
mat('theatre_glass',(.065,.085,.095),.40,.23);mat('theatre_roof',(.80,.80,.75),.35,.38)
mat('theatre_bronze',(.32,.24,.13),.65,.35);mat('theatre_paving',(.60,.57,.49),0,.82)
def roof_z(nx,ny):return 17.2-5.2*nx+3*(1-nx*nx-ny*ny)
def roof_point(r,t):return (cx+rx*.94*r*math.cos(t),cy+ry*.94*r*math.sin(t),roof_z(r*math.cos(t),r*math.sin(t)))
def wall_point(t,z):
 edge=roof_z(math.cos(t),math.sin(t))-.30;factor=1-.06*max(0,min(1,(z-.15)/(edge-.15)))
 return (cx+rx*factor*math.cos(t),cy+ry*factor*math.sin(t),z)
def ellipse(radius=1):return Polygon([(cx+rx*radius*math.cos(i*math.tau/192),cy+ry*radius*math.sin(i*math.tau/192)) for i in range(192)])
foot=ellipse();clip=box(cx-115,cy-100,cx+115,cy+110)
source_wet=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='water' and allshapes[f['id']].intersects(clip)]).intersection(clip)
# Small authored display fillets, not new water connections or source edits.
wet=source_wet.buffer(.85,quad_segs=12).buffer(-.85,quad_segs=12).buffer(-.85,quad_segs=12).buffer(.85,quad_segs=12).intersection(clip)
print('WATER DISPLAY FILLET', 'source parts',len(polygons(source_wet)), 'display parts',len(polygons(wet)), 'boundary displacement',source_wet.boundary.hausdorff_distance(wet.boundary))
slab('Theatre ground','ground',clip.difference(wet.buffer(.35)),-1.5,1.5);slab('Lake water','water',wet,-1.4,.5)
slab('Lake banks','theatre_stone',wet.buffer(.35).difference(wet),-1.4,1.4)
slab('Main auditorium floor','wood',foot,0,.15)
# Tapered oval curtain wall with three coherent horizontal bands, not random floor heights.
for i in range(160):
 t0=i*math.tau/160;t1=(i+1)*math.tau/160;tm=(t0+t1)/2;opening=abs(math.atan2(math.sin(tm),math.cos(tm)))<.24
 for lo,hi,material in [(.15,.8,'theatre_stone'),(.8,3.5,'theatre_glass'),(3.5,3.9,'theatre_light'),(3.9,7.0,'theatre_glass'),(7.0,7.4,'theatre_light'),(7.4,10.6,'theatre_glass'),(10.6,11.0,'theatre_light')]:
  if opening and hi<=3.5:continue
  face('Oval auditorium facade',material,[wall_point(t0,lo),wall_point(t1,lo),wall_point(t1,hi),wall_point(t0,hi)])
 z0=roof_z(math.cos(t0),math.sin(t0))-.30;z1=roof_z(math.cos(t1),math.sin(t1))-.30
 face('Upper sloping clerestory','theatre_glass',[wall_point(t0,11),wall_point(t1,11),wall_point(t1,z1),wall_point(t0,z0)])
 beam('Oval facade fins','theatre_bronze',wall_point(t0,3.9 if opening else .15),wall_point(t0,z0),.055,sides=6)
# Closed asymmetric shell: low east entrance, raised west rear, smoothly curved crown.
for ring in range(40):
 r0=ring/40;r1=(ring+1)/40
 for i in range(192):
  t0=i*math.tau/192;t1=(i+1)*math.tau/192
  pts=[roof_point(r0,t0),roof_point(r1,t0),roof_point(r1,t1),roof_point(r0,t1)]
  if ring==0:pts=pts[:3]
  face('Asymmetric theatre roof','theatre_roof',pts)
  face('Theatre roof soffit','theatre_stone',[(x,y,z-.30) for x,y,z in reversed(pts)])
for i in range(192):
 p=roof_point(1,i*math.tau/192);q=roof_point(1,(i+1)*math.tau/192)
 face('Continuous roof edge','theatre_light',[p,q,(q[0],q[1],q[2]-.30),(p[0],p[1],p[2]-.30)])
for x in range(-30,31,2):
 nx=x/(rx*.94)
 if abs(nx)>=1:continue
 ymax=ry*.94*math.sqrt(1-nx*nx)
 for j in range(48):
  y0=-ymax+2*ymax*j/48;y1=-ymax+2*ymax*(j+1)/48
  beam('Curved roof standing seams','theatre_bronze',(cx+x,cy+y0,roof_z(nx,y0/(ry*.94))+.015),(cx+x,cy+y1,roof_z(nx,y1/(ry*.94))+.015),.022,sides=5)
# Recessed foyer doors close the opening instead of leaving an unexplained black hole.
entry_x=cx+rx-1.5
for y in [-3.6,-1.2,1.2,3.6]:
 cube('Foyer double doors','theatre_glass',(entry_x,cy+y,1.95),(.15,2.25,3.60))
 for d in [-1.15,0,1.15]:cube('Foyer doorframes','theatre_bronze',(entry_x+.08,cy+y+d,1.95),(.20,.055,3.60))
 for d in [-.20,.20]:beam('Foyer handles','theatre_bronze',(entry_x+.18,cy+y+d,1.1),(entry_x+.18,cy+y+d,1.8),.025,sides=8)
cube('Foyer transom','theatre_glass',(entry_x,cy,3.82),(.16,11,.14))
for sign in [-1,1]:cube('Foyer sidelights','theatre_glass',(entry_x,cy+sign*5.1,1.95),(.16,.70,3.60))
slab('Recessed foyer ceiling','theatre_light',box(entry_x,cy-5.7,cx+rx,cy+5.7),3.85,.15)
for sign in [-1,1]:
 outer=wall_point(sign*.24,.15);cube('Foyer return jambs','theatre_stone',((entry_x+outer[0])/2,cy+sign*5.55,2.0),(abs(outer[0]-entry_x)+.3,.22,3.70))
canopy=Polygon([(cx+rx*r*math.cos(t),cy+ry*r*math.sin(t)) for r,values in [(1.13,[(-.29+i*.58/32) for i in range(33)]),(.97,[(.29-i*.58/32) for i in range(33)])] for t in values])
slab('Curved foyer canopy','theatre_light',canopy,3.95,.22)
for sign in [-1,1]:
 p=(cx+rx*1.08*math.cos(sign*.24),cy+ry*1.08*math.sin(sign*.24));beam('Foyer canopy columns','theatre_bronze',(*p,.15),(*p,3.95),.12,sides=10)

# Keep the B wing continuous: a north bar and a lower curving wing share one real joint.
coords=list(B.exterior.coords)[:-1]
north=Polygon([coords[i] for i in [8,9,10,11,12]])
arc=B.difference(north)
parts=[('North low wing',north,3,10.65),('Curved low wing',arc,2,7.1)]
entry_specs={}
for owner,start,end in [('North low wing',coords[8],coords[9]),('Curved low wing',coords[4],coords[5])]:
 tangent=(Vector(end)-Vector(start)).normalized();normal=Vector((tangent.y,-tangent.x));point=(Vector(start)+Vector(end))*.5
 cut=Polygon([tuple(point+tangent*x+normal*y) for x,y in [(-2.7,-1.5),(2.7,-1.5),(2.7,.5),(-2.7,.5)]])
 entry_specs[owner]=(point,tangent,normal,cut)

for owner,p,floors,height in parts:
 point,et,en,cut=entry_specs[owner]
 slab(owner,'theatre_stone',p.difference(cut),.15,3.20)
 slab(owner,'theatre_stone',p,3.35,height+.15-3.35)
 slab(owner+' recessed entry floor','theatre_paving',p.intersection(cut),0,.15)
 slab(owner+' roof','theatre_roof',p.buffer(-.25),height+.15,.08)
 slab(owner+' continuous cornice','theatre_light',p.buffer(.20,join_style=2).difference(p.buffer(-.3)),height+.05,.35)
 for k in range(1,floors):slab(owner+' floor bands','theatre_light',p.buffer(.08).difference(p),.15+k*height/floors,.14)
 for poly in polygons(p):
  points=list(orient(poly,1).exterior.coords)
  for start,end in zip(points,points[1:]):
   tangent=Vector(end)-Vector(start);length=tangent.length
   if length<.2:continue
   tangent.normalize();normal=Vector((tangent.y,-tangent.x));angle=math.atan2(tangent.y,tangent.x);count=max(1,int(length/2.8));step=length/count
   for bay in range(count):
    point=Vector(start)+tangent*(bay+.5)*step
    for floor in range(floors):
     z=.15+(floor+.53)*height/floors
     if floor==0 and cut.buffer(step/2+.1).contains(Point(*point)):continue
     if any(other!=owner and op.buffer(.05).contains(Point(*point)) and z<oh+.15 for other,op,_,oh in parts):continue
     cube(owner+' glazing','theatre_glass',(*(point+normal*.065),z),(step-.32,.14,height/floors-1.0),angle)
     cube(owner+' mullions','theatre_bronze',(*(point+normal*.15),z),(.045,.16,height/floors-1.0),angle)
     cube(owner+' sills','theatre_light',(*(point+normal*.16),z-(height/floors-1)/2-.07),(step-.20,.28,.12),angle)
for owner,(point,tangent,normal,cut) in entry_specs.items():
 angle=math.atan2(tangent.y,tangent.x);door=point-normal*.95
 cube(owner+' double doors','theatre_glass',(*door,1.65),(4.8,.15,3.0),angle)
 for off in [-2.4,-1.2,0,1.2,2.4]:
  q=door+tangent*off;cube(owner+' doorframes','theatre_bronze',(*q,1.65),(.055,.20,3.0),angle)
 cube(owner+' transom','theatre_glass',(*door,3.25),(4.8,.16,.20),angle)
 for off in [-.2,.2]:
  q=door+tangent*off+normal*.15;beam(owner+' door handles','theatre_bronze',(*q,1.1),(*q,1.75),.025,sides=8)
 canopy=Polygon([tuple(point+tangent*x+normal*y) for x,y in [(-3,-.6),(3,-.6),(3,2.2),(-3,2.2)]])
 slab(owner+' entry canopy','theatre_light',canopy,3.25,.20)
 for off in [-2.6,2.6]:
  q=point+tangent*off+normal*1.8;beam(owner+' entry posts','theatre_bronze',(*q,.15),(*q,3.25),.09,sides=8)
# An authored auditorium, distinct from the round sports bowl; no as-built seat-count claim.
mat('auditorium_carpet',(.23,.225,.205),0,.95);mat('auditorium_seat',(.31,.30,.27),0,.82)
mat('stage_curtain',(.105,.10,.09),0,.97);mat('stage_timber',(.40,.28,.15),0,.70)
mat('auditorium_acoustic',(.26,.25,.22),0,.95)
# Interior acoustic lining is separate from the exterior glazing, with an open foyer sector.
for i in range(160):
 t0=i*math.tau/160;t1=(i+1)*math.tau/160;tm=(t0+t1)/2
 if abs(math.atan2(math.sin(tm),math.cos(tm)))<.60:continue
 def inner(t,z):
  p=Vector(wall_point(t,z));p-=Vector((math.cos(t)*.12,math.sin(t)*.12,0));return tuple(p)
 z0=roof_z(math.cos(t0),math.sin(t0))-.35;z1=roof_z(math.cos(t1),math.sin(t1))-.35
 face('Auditorium acoustic lining','auditorium_acoustic',[inner(t1,.15),inner(t0,.15),inner(t0,z0),inner(t1,z1)])
 if i%4==0:beam('Acoustic wall battens','wood',inner(t0,.15),inner(t0,z0),.045,sides=6)

aisles=unary_union([box(cx-13,cy+y-.85,cx+21,cy+y+.85) for y in [-8,0,8]])
for row in range(18):
 x0=-10+row*1.55;x1=x0+1.55;top=.15+(row+1)*.17
 coords0=[(cx+x0-y*y*.006,cy+y) for y in [-15+j*.5 for j in range(61)]]
 coords1=[(cx+x1-y*y*.006,cy+y) for y in [15-j*.5 for j in range(61)]]
 terrace=Polygon(coords0+coords1).intersection(foot.buffer(-1))
 slab('Auditorium seating terraces','auditorium_carpet',terrace.difference(aisles),.15,top-.15)
 slab('Auditorium aisle steps','theatre_stone',terrace.intersection(aisles),.15,top-.15)
 for seat in range(47):
  y=-14.26+seat*.62
  if any(abs(y-c)<1.08 for c in [-8,0,8]):continue
  x=x0+.78-y*y*.006;point=Vector((cx+x,cy+y));front=(Vector((cx-23,cy))-point).normalized();right=Vector((-front.y,front.x));angle=math.atan2(right.y,right.x)
  cube('Individual auditorium seats','auditorium_seat',(*point,top+.44),(.48,.46,.08),angle)
  back=point-front*.22;cube('Auditorium seat backs','auditorium_seat',(*back,top+.76),(.48,.08,.55),angle)
  for side in [-1,1]:
   q=point+right*(side*.17);cube('Auditorium seat supports','theatre_bronze',(*q,top+.22),(.045,.32,.40),angle)
rear=Polygon([(cx+17.9-y*y*.006,cy+y) for y in [-15+j*.5 for j in range(61)]]+[(cx+19.6,cy+15),(cx+19.6,cy-15)]);slab('Rear auditorium gallery','theatre_stone',rear,3.01,.20)
for side in [-1,1]:
 y=cy+side*8
 for step in range(18):
  x1=cx+29.5-step*.55;x0=x1-.55;top=.15+(step+1)*.17
  slab('Foyer to rear gallery stairs','theatre_stone',box(x0,y-.80,x1,y+.80),max(.15,top-.24),min(.24,top-.15))
  for off in [-.75,.75]:
   beam('Foyer stair handrails','theatre_bronze',(x1,y+off,top+1.0-.17),(x0,y+off,top+1.0),.035,sides=6)
   if step%3==0:beam('Foyer stair balusters','theatre_bronze',(x0,y+off,top),(x0,y+off,top+1.0),.035,sides=6)

for y in [-8,0,8]:
 for side in [-1,1]:
  for row in range(18):
   x0=-10+row*1.55-y*y*.006;x1=x0+1.55;z0=.15+row*.17+1.0;z1=z0+.17
   beam('Auditorium aisle handrails','theatre_bronze',(cx+x0,cy+y+side*.8,z0),(cx+x1,cy+y+side*.8,z1),.032,sides=6)
   if row%2==0:beam('Auditorium aisle rail posts','theatre_bronze',(cx+x1,cy+y+side*.8,z1-1),(cx+x1,cy+y+side*.8,z1),.032,sides=6)
# The gallery itself supplies the stair landing; avoid duplicate coplanar floor plates.
for i in range(60):
 y0=-15+i*.5;y1=y0+.5
 if any(abs((y0+y1)/2-c)<1.0 for c in [-8,8]):continue
 beam('Rear gallery guardrail','theatre_bronze',(cx+19.5,cy+y0,4.26),(cx+19.5,cy+y1,4.26),.035,sides=6)
 beam('Rear gallery balusters','theatre_bronze',(cx+19.5,cy+y0,3.21),(cx+19.5,cy+y0,4.26),.025,sides=6)
for side in [-1,1]:
 beam('Gallery end guardrail','theatre_bronze',(cx+16.55,cy+side*14.9,4.26),(cx+19.5,cy+side*14.9,4.26),.035,sides=6)
 for i in range(7):
  x=cx+16.55+i*(19.5-16.55)/6;beam('Gallery end balusters','theatre_bronze',(x,cy+side*14.9,3.21),(x,cy+side*14.9,4.26),.025,sides=6)
# A stage, side steps and folded curtains give the interior a readable purpose.
stage=box(cx-29,cy-10,cx-15,cy+10).intersection(foot.buffer(-1))
slab('Timber stage','stage_timber',stage,.15,1.0)
for side in [-1,1]:
 for step in range(5):
  x1=cx-12-step*.6;x0=x1-.6;top=.15+(step+1)*.20
  slab('Stage side steps','theatre_stone',box(x0,cy+side*8-.8,x1,cy+side*8+.8),.15,top-.15)
for i in range(160):
 y0=-10+i*.125;y1=y0+.125;x0=cx-28.5+.12*math.cos(y0*math.tau/.5);x1=cx-28.5+.12*math.cos(y1*math.tau/.5)
 face('Folded stage rear curtain','stage_curtain',[(x0,cy+y0,1.15),(x1,cy+y1,1.15),(x1,cy+y1,12.0),(x0,cy+y0,12.0)])
for side in [-1,1]:
 for i in range(104):
  x0=-28.5+i*.125;x1=x0+.125;y0=cy+side*(9.9+.10*math.cos(x0*math.tau/.5));y1=cy+side*(9.9+.10*math.cos(x1*math.tau/.5))
  face('Folded stage side curtains','stage_curtain',[(cx+x0,y0,1.15),(cx+x1,y1,1.15),(cx+x1,y1,12),(cx+x0,y0,12)])
 cube('Proscenium side frame','theatre_bronze',(cx-15,cy+side*10,6.7),(.30,.30,11.1))
cube('Proscenium header','theatre_bronze',(cx-15,cy,12.15),(.35,20.6,.35))
# Transverse roof frames follow the asymmetric shell and meet the perimeter, not the seats.
for x in range(-28,29,4):
 nx=x/(rx*.94);limit=ry*.94*math.sqrt(1-nx*nx)-.30
 for sign in [-1,1]:beam('Auditorium structural columns','theatre_light',(cx+x,cy+sign*limit,.15),(cx+x,cy+sign*limit,roof_z(nx,sign*limit/(ry*.94))-1.1),.16,sides=10)
 for j in range(20):
  y0=-limit+2*limit*j/20;y1=-limit+2*limit*(j+1)/20
  z0=roof_z(nx,y0/(ry*.94));z1=roof_z(nx,y1/(ry*.94))
  beam('Theatre roof upper chord','theatre_light',(cx+x,cy+y0,z0-.35),(cx+x,cy+y1,z1-.35),.075,sides=8)
  beam('Theatre roof lower chord','theatre_light',(cx+x,cy+y0,z0-1.1),(cx+x,cy+y1,z1-1.1),.075,sides=8)
  beam('Theatre roof diagonal','theatre_bronze',(cx+x,cy+y0,z0-.35),(cx+x,cy+y1,z1-1.1),.035,sides=6)
# Courtyard and source roads are separate from the building footprint and lake.
all_foot=foot.union(B);road_parts=[];walk_parts=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 walking=p.get('highway') in ['footway','path','pedestrian','steps']
 surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.4 if walking else 3.5,cap_style=2,join_style=1)
 (walk_parts if walking else road_parts).append(surface.intersection(clip))
roads=unary_union(road_parts).difference(all_foot).difference(wet)
plaza=all_foot.buffer(7,join_style=1).union(all_foot.convex_hull).difference(all_foot).union(unary_union(walk_parts)).difference(roads).difference(wet).intersection(clip)
configure_leaf_materials();mat('Courtyard soil',(.16,.12,.075),0,.95)
tree_x,tree_y=cx-43,cy+5;pit=Point(tree_x,tree_y).buffer(1.45,quad_segs=24)
if plaza.covers(pit.buffer(2.7)) and not pit.buffer(4).intersects(all_foot):
 plaza=plaza.difference(pit.buffer(.12));slab('Courtyard tree soil','Courtyard soil',pit,0,.12);slab('Courtyard tree edging','theatre_light',pit.buffer(.12).difference(pit),.02,.13)
 broadleaf(tree_x,tree_y,.88,970)
 for centre_angle in [math.pi/2,3*math.pi/2]:
  for i in range(12):
   angle=centre_angle+math.radians(-49.5+i*9)
   cube('Curved courtyard bench slats','wood',(tree_x+2.0*math.cos(angle),tree_y+2.0*math.sin(angle),.59),(.28,.45,.08),angle+math.pi/2)
  for off in [-40,0,40]:
   angle=centre_angle+math.radians(off);cube('Courtyard bench supports','theatre_bronze',(tree_x+2*math.cos(angle),tree_y+2*math.sin(angle),.36),(.07,.38,.42),angle+math.pi/2)
slab('Source roads','road',roads,0,.12);slab('Foyer and wing courtyard paving','theatre_paving',plaza,0,.15)
mat('Paving joints',(.46,.44,.39),0,.95)
# Narrow, flush joints make the pedestrian surface legible without adding trip edges.
for x in range(math.floor(clip.bounds[0]),math.ceil(clip.bounds[2]),2):
 slab('Courtyard paving joints','Paving joints',box(x-.008,clip.bounds[1],x+.008,clip.bounds[3]).intersection(plaza),.151)
for y in range(math.floor(clip.bounds[1]),math.ceil(clip.bounds[3]),2):
 slab('Courtyard paving joints','Paving joints',box(clip.bounds[0],y-.008,clip.bounds[2],y+.008).intersection(plaza),.151)

for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  layer=mesh.uv_layers.new(name='Leaf albedo UV')
  for polygon,uvs in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for loop,uv in zip(polygon.loop_indices,uvs):layer.data[loop].uv=uv
 obj=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(M[material]);obj['designRole']=owner
 if owner in ['Individual auditorium seats','Auditorium seat backs']:
  bevel=obj.modifiers.new('Soft auditorium seat edges','BEVEL');bevel.width=.025;bevel.segments=3
root=bpy.data.objects.new('Small theatre A and B — illustrative work in progress',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=ids;root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['status']='WORK_IN_PROGRESS';root['sourceGeometryUnchanged']=True
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
front=cx+rx*1.13-.03
bpy.ops.mesh.primitive_cube_add(size=1,location=(front,cy,4.0));signboard=bpy.context.object;signboard.name='Theatre entrance signboard';signboard.dimensions=(.10,4.6,.60);signboard.data.materials.append(M['theatre_light']);signboard.parent=root
bpy.ops.object.text_add(location=(front+.06,cy,3.84),rotation=(math.pi/2,0,math.pi/2));sign=bpy.context.object;sign.name='Small theatre identification';sign.data.body='小剧场';sign.data.align_x='CENTER';sign.data.size=.43;sign.data.extrude=.006;sign.data.font=bpy.data.fonts.load('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');sign.data.materials.append(M['theatre_bronze']);bpy.ops.object.convert(target='MESH');sign.parent=root
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py')]:bpy.data.texts.new(name).write(path.read_text())
world=bpy.data.worlds.new('Theatre daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
mat('Auditorium diffuser',(.95,.94,.87),0,.4)
shader=M['Auditorium diffuser'].node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(1,.95,.85,1);shader.inputs['Emission Strength'].default_value=4
# Real canopy luminaires illuminate recessed entrances; not inspection-only lighting.
for owner,(point,tangent,normal,cut) in entry_specs.items():
 for side in [-1,1]:
  q=point+tangent*(side*1.35)+normal*.6
  bpy.ops.mesh.primitive_cube_add(size=1,location=(*q,3.22));fixture=bpy.context.object;fixture.name=owner+' canopy diffuser';fixture.dimensions=(.48,.22,.025);fixture.rotation_euler.z=math.atan2(tangent.y,tangent.x);fixture.data.materials.append(M['Auditorium diffuser']);fixture.parent=root
  bpy.ops.object.light_add(type='AREA',location=(*q,3.19));lamp=bpy.context.object;lamp.name=owner+' entry downlight';lamp.data.energy=65;lamp.data.shape='DISK';lamp.data.size=.45;lamp.data.color=(1,.92,.80);lamp.parent=root
for dx,dy in [(-22,0),(-12,-8),(-12,8),(0,-8),(0,8),(12,-8),(12,8),(26,0)]:
 z=roof_z(dx/(rx*.94),dy/(ry*.94))-1.4
 bpy.ops.mesh.primitive_cube_add(size=1,location=(cx+dx,cy+dy,z+.10));fixture=bpy.context.object;fixture.name='Auditorium luminaire housing';fixture.dimensions=(1.6,.45,.12);fixture.data.materials.append(M['theatre_light']);fixture.parent=root
 bpy.ops.mesh.primitive_cube_add(size=1,location=(cx+dx,cy+dy,z+.025));fixture=bpy.context.object;fixture.name='Auditorium luminaire diffuser';fixture.dimensions=(1.5,.35,.02);fixture.data.materials.append(M['Auditorium diffuser']);fixture.parent=root
 for off in [-.60,.60]:
  high=roof_z((dx+off)/(rx*.94),dy/(ry*.94))-.35;low=z+.16
  bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.012,depth=high-low,location=(cx+dx+off,cy+dy,(high+low)/2));hanger=bpy.context.object;hanger.name='Theatre luminaire suspension';hanger.data.materials.append(M['theatre_bronze']);hanger.parent=root
 bpy.ops.object.light_add(type='AREA',location=(cx+dx,cy+dy,z));lamp=bpy.context.object;lamp.name='Auditorium downward luminaire';lamp.data.energy=1200 if dx!=-22 else 2200;lamp.data.shape='RECTANGLE';lamp.data.size=1.5;lamp.data.size_y=.35;lamp.data.color=(1,.95,.85)
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),64);scene.cycles.use_denoising=False;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('theatre-overview',(cx+100,cy-115,100),(cx-15,cy,8),145,32),('foyer-entry',(cx+56,cy-9,1.85),(entry_x,cy,4.0),None,28),('curved-wing-court',(cx-42,cy-5,1.85),(cx-53,cy+12,3.5),None,24)]
views.extend([('auditorium-from-gallery',(cx+18.8,cy,4.91),(cx-22,cy,4),None,24),('stage-to-seating',(cx-18,cy,2.85),(cx+15,cy,4),None,24)])
views.append(('foyer-stair-arrival',(cx+30.5,cy+8,1.85),(cx+18.7,cy+8,4.3),None,24))
for owner,(point,tangent,normal,cut) in entry_specs.items():
 eye=point+normal*3.2+tangent;target=point-normal*.7
 views.append((('north-wing-entry' if owner.startswith('North') else 'arc-wing-entry'),(*eye,1.85),(*target,2.0),None,20))
views.append(('southwest-street',(-387.3,545.9,1.85),(-373,581,1.85),None,28))
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
for i,(name,location,target,ortho,lens) in enumerate(views):
 cam.location=location;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'small-theatre.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('THEATRE DRAFT — ENTRY, COURT AND WHOLE PRECINCT REVIEW REMAIN')
