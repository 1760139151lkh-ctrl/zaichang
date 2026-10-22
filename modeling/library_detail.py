"""Main-library asset study: source-anchored volume, authored facade/roof detail.
No new factual entrances, routes, or claim of surveyed architectural fidelity.
"""
import sys,math,json,hashlib
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf
OUT=ROOT/'modeling/library-work';OUT.mkdir(exist_ok=True)
fid='way/1208408934';source=allshapes[fid];center=Vector((source.centroid.x,source.centroid.y))
q=list(source.minimum_rotated_rectangle.exterior.coords)[:4]
a,b=max(zip(q,q[1:]+q[:1]),key=lambda pair:math.dist(*pair));angle=math.atan2(b[1]-a[1],b[0]-a[0])
if math.cos(angle)<0:angle+=math.pi
u=Vector((math.cos(angle),math.sin(angle)));v=Vector((-u.y,u.x))
def xy(x,y):return tuple(center+u*x+v*y)
def poly(x0,y0,x1,y1):return Polygon([xy(x0,y0),xy(x1,y0),xy(x1,y1),xy(x0,y1)])
def block(owner,material,x,y,z,L,W,H):cube(owner,material,(*xy(x,y),z),(L,W,H),angle)
mat('library_stone',(.70,.66,.56),0,.72);mat('library_light',(.86,.82,.72),0,.55)
mat('library_glass',(.06,.085,.095),.45,.20);mat('library_bronze',(.30,.23,.13),.65,.32)
mat('library_roof',(.16,.175,.18),.35,.50);mat('library_paving',(.58,.55,.47),0,.85)
mat('atrium_glass',(.16,.21,.23),.40,.20);mat('library_water',(.13,.27,.30),.35,.2)
mat('library_warm_light',(.95,.78,.52),0,.4)
light_shader=M['library_warm_light'].node_tree.nodes.get('Principled BSDF');light_shader.inputs['Emission Color'].default_value=(1,.78,.50,1);light_shader.inputs['Emission Strength'].default_value=5
clip=box(-1045,350,-680,680)
water_parts=[];culverts=[]
channel_review=json.loads((ROOT/'assets/map-v2/fidelity-observations.json').read_text()).get('channelDisplay',{})
channel_widths={item['id']:item['illustrativeWidthM'] for item in channel_review.get('segments',[])}
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')=='waterway' and g.intersects(clip):
  radius=channel_widths.get(f['id'],8.0 if p.get('waterway')=='canal' else 6.4)/2
  if f['id']=='way/1032412971':radius=6.0 # maintain the reviewed 12 m channel through its covered crossing
  water_parts.append(g.buffer(radius))
  if p.get('tunnel')=='culvert':culverts.append((f['id'],g,radius))
wet=unary_union(water_parts).buffer(.7).buffer(-.7).intersection(clip)
slab('Ground','ground',clip.difference(wet),-1.25,1.25)
slab('Continuous water bed','shadow',wet,-1.25,.15)
slab('Continuous water','library_water',wet,-1.10,.30)
slab('Canal retaining sides','library_stone',wet.buffer(.35).difference(wet),-1.1,1.1)
# Canal coping is emitted after roads, so crossings do not have coplanar caps.
for name,g,radius in culverts:
 cover=g.buffer(radius+.35,cap_style=2).intersection(clip).intersection(wet)
 slab(name+' cover','ground',cover,-.15,.15)
 for mouth,inside in [(list(g.coords)[0],list(g.coords)[1]),(list(g.coords)[-1],list(g.coords)[-2])]:
  direction=Vector(inside)-Vector(mouth);direction.normalize();across=Vector((-direction.y,direction.x))
  for side in [-1,1]:
   point=Vector(mouth)+across*(side*(radius+.15))
   cube(name+' portal piers','library_stone',(*point,-.51),(.55,.75,1.18),math.atan2(across.y,across.x))
  cube(name+' lintel','library_light',(*mouth,.025),(2*radius+.85,.8,.25),math.atan2(across.y,across.x))

north=poly(-52,19,52,49);south=poly(-52,-49,52,-19);west=poly(-52,-19,-36,19);east=poly(36,-19,52,19)
parts=[('North reading wing',north,6),('South reading wing',south,6),('West connecting wing',west,4),('East connecting wing',east,4)]
footprint=unary_union([p for _,p,_ in parts]);entry_voids=unary_union([poly(-53,-4,-49,4),poly(49,-4,53,4)])
arcade=poly(-50,-49,50,-45.8);arcade_cut=poly(-50,-49.5,50,-45.8);ground_voids=entry_voids.union(arcade_cut)
for owner,p,floors in parts:
 top=.15+floors*4.3
 slab(owner+' base','library_stone',p.difference(ground_voids),-.05,.20)
 slab(owner,'library_stone',p.difference(ground_voids),.15,4.05)
 slab(owner,'library_stone',p,4.2,top-4.2)
 slab(owner+' entry floor','library_paving',p.intersection(ground_voids),0,.15)
 slab(owner+' cornice','library_light',p.buffer(.25,join_style=2),top,.22)
 for floor in range(1,floors):
  slab(owner+' horizontal courses','library_light',p.buffer(.12,join_style=2).difference(p),.15+floor*4.3,.13)
 for ring in polygons(p):
  points=list(orient(ring,1).exterior.coords)
  for a,b in zip(points,points[1:]):
   vector=Vector(b)-Vector(a);length=vector.length;tangent=vector.normalized();normal=Vector((tangent.y,-tangent.x));rot=math.atan2(tangent.y,tangent.x)
   count=max(1,int(length/4.15));step=length/count
   for bay in range(count):
    point=Vector(a)+tangent*((bay+.5)*step);width=step-.55
    for floor in range(floors):
     z=.15+floor*4.3+2.25
     if floor==0 and ground_voids.buffer(width/2+.1).contains(Point(*point)):continue
     if any(other!=owner and other_p.buffer(.05).contains(Point(*point)) and z<.15+other_floors*4.3 for other,other_p,other_floors in parts):continue
     cube(owner+' glazing','library_glass',(*(point+normal*.055),z),(width,.12,3.30),rot)
     cube(owner+' window mullions','library_bronze',(*(point+normal*.16),z),(.055,.16,3.30),rot)
     cube(owner+' transoms','library_bronze',(*(point+normal*.16),z+.85),(width,.16,.055),rot)
     cube(owner+' sill','library_light',(*(point+normal*.20),z-1.72),(width+.15,.32,.12),rot)
    # Fin rhythm is shared across floors, not separate arbitrary boxes at each floor.
    point=Vector(a)+tangent*(bay*step+.20)
    if not any(other!=owner and other_p.buffer(.05).contains(Point(*point)) for other,other_p,_ in parts):
     bottom=4.20 if arcade.buffer(.10).contains(Point(*point)) else .30
     cube(owner+' vertical fins','library_bronze',(*(point+normal*.28),(top+bottom)/2),(.09,.48,top-bottom),rot)
 if floors==4:
  slab(owner+' roof','library_roof',p.buffer(-.30),top+.23,.05)
  slab(owner+' parapet','library_light',p.buffer(.15).difference(p.buffer(-.25)),top+.22,.48)

# A true shaded ground-floor arcade, not a painted path across a solid wall.
slab('South arcade ceiling','library_light',arcade,4.05,.15)
for x in range(-48,49,6):
 block('South arcade columns','library_stone',x,-48.45,2.05,.45,.45,3.80)
 block('South arcade capitals','library_light',x,-48.45,4.00,.65,.65,.25)
 block('South arcade column bases','library_light',x,-48.45,.20,.60,.60,.10)
block('South arcade front beam','library_bronze',0,-48.45,3.95,97,.25,.30)
for i in range(165):block('South arcade soffit ribs','wood',-49.2+i*.60,-47.15,4.0,.055,2.6,.10)
for x in range(-47,48,4):
 block('Recessed arcade glazing','library_glass',x,-45.85,2.20,3.65,.12,3.50)
 block('Recessed arcade mullions','library_bronze',x,-45.94,2.20,.06,.15,3.50)
for x in range(-45,46,6):
 block('Arcade linear lighting','library_warm_light',x,-47.2,3.93,2.0,.055,.025)
 bpy.ops.object.light_add(type='AREA',location=(*xy(x,-47.2),3.88))
 lamp=bpy.context.object;lamp.name='Arcade downlight';lamp.data.energy=22;lamp.data.color=(1,.79,.56);lamp.data.shape='RECTANGLE';lamp.data.size=2.0;lamp.data.size_y=.15
for x in [-30,30]:
 for row in range(5):block('Arcade reading bench','wood',x,-46.55+(row-2)*.095,.59,2.1,.08,.08)
 for offset in [-.85,.85]:block('Arcade bench legs','library_bronze',x+offset,-46.55,.36,.07,.40,.42)

# Two balanced hipped roofs, observed as an ensemble, with authored seam spacing.
for label,yc in [('North',34),('South',-34)]:
 z=.15+6*4.3+.22;peak=z+6.50;L=53.5;D=16.5
 A=(*xy(-L,yc-D),z);B=(*xy(L,yc-D),z);C=(*xy(L,yc+D),z);Dpt=(*xy(-L,yc+D),z)
 R1=(*xy(-L+12,yc),peak);R2=(*xy(L-12,yc),peak)
 for points in [[A,B,R2,R1],[Dpt,R1,R2,C],[Dpt,A,R1],[B,C,R2],[Dpt,C,B,A]]:face(label+' hipped roof','library_roof',points)
 for x in range(-40,41,2):
  beam(label+' roof seams','library_bronze',(*xy(x,yc-16.5),z+.018),(*xy(x,yc),peak+.018),.020,sides=5)
  beam(label+' roof seams','library_bronze',(*xy(x,yc),peak+.018),(*xy(x,yc+16.5),z+.018),.020,sides=5)
 beam(label+' ridge cap','library_roof',R1,R2,.13,sides=8)

# Lower glazed lightwell; it is not flattened into a supposed ground-level road.
slab('Atrium floor','library_paving',poly(-36,-19,36,19),0,.15)
def glass_z(x,y):return 14.3+.55*math.cos(x/36*math.pi/2)*math.cos(y/19*math.pi/2)
x_grid=[-36+i*4 for i in range(19)];y_grid=[-19+i*3.8 for i in range(11)]
for x0,x1 in zip(x_grid,x_grid[1:]):
 for y0,y1 in zip(y_grid,y_grid[1:]):
  points=[(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
  top=[(*xy(a,b),glass_z(a,b)) for a,b in points];bottom=[(a,b,z-.04) for a,b,z in top]
  face('Atrium glazed roof','atrium_glass',top);face('Atrium glazed roof','atrium_glass',list(reversed(bottom)))
  for j in range(4):
   k=(j+1)%4;face('Atrium glazed roof','atrium_glass',[top[j],bottom[j],bottom[k],top[k]])
for x in x_grid:
 for j in range(38):
  y=-19+j;beam('Atrium mullions','library_bronze',(*xy(x,y),glass_z(x,y)),(*xy(x,y+1),glass_z(x,y+1)),.055,sides=6)
for y in y_grid:
 for x in range(-36,36,2):beam('Atrium mullions','library_bronze',(*xy(x,y),glass_z(x,y)),(*xy(x+2,y),glass_z(x+2,y)),.055,sides=6)

# Side entries are recessed and closed by doors, not advertised indoor routes.
for side in [-1,1]:
 x=side*50.1
 block('Entry glazing','library_glass',x,0,1.85,.18,7.6,3.40)
 for off in [-3.8,-1.1,0,1.1,3.8]:block('Entry doorframes','library_bronze',x,off,1.85,.30,.065,3.40)
 block('Entry transom','library_bronze',x,0,2.70,.30,7.6,.065)
 for off in [-.30,.30]:block('Entry handles','library_bronze',x+side*.18,off,1.35,.09,.04,.65)
 block('Entry canopy','library_light',side*53.3,0,4.05,3.2,11.5,.25)
 for off in [-5.3,5.3]:block('Entry columns','library_stone',side*54.5,off,2.05,.34,.34,3.80)
 for off in range(-10,11):block('Entry soffit battens','wood',side*53.2,off*.48,3.87,3.0,.07,.10)
 block('Entry sign fascia','library_light',side*54.95,0,4.05,.12,11.5,.50)
 bpy.ops.object.text_add(location=(*xy(side*55.025,0),3.87),rotation=(math.pi/2,0,angle+side*math.pi/2))
 sign=bpy.context.object;sign.name='Main library entry identification';sign.data.body='主图书馆';sign.data.align_x='CENTER';sign.data.size=.65;sign.data.extrude=.008;sign.data.font=bpy.data.fonts.load('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');sign.data.materials.append(M['library_bronze']);bpy.ops.object.convert(target='MESH')

# Real source roads remain separate from the not-yet-resolved surface avenue.
roads=[];walks=[];bridges=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 iswalk=p.get('highway') in ['footway','path','pedestrian','steps'];width=2.4 if iswalk else 6.5
 surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(width/2,cap_style=2,join_style=2)
 (walks if iswalk else roads).append(surface.intersection(clip))
 if p.get('bridge')=='yes':bridges.append((f['id'],surface.intersection(clip)))
road=unary_union(roads).difference(footprint);walk=unary_union(walks).difference(footprint).difference(road)
forecourts=unary_union([poly(-70,-16,-52,16),poly(52,-16,71,16),poly(-60,-61,60,-49)]).difference(wet).difference(road)
walk=walk.union(forecourts)
slab('Canal edge','library_light',wet.buffer(.6).difference(wet).difference(road),0,.12)
slab('Source road surface','road',road.difference(wet),0,.12)
# Four individually grown trees frame entries; their pits never occupy the central approach.
configure_leaf_materials()
mat('library_soil',(.16,.12,.075),0,.95)
pits=[]
for i,(tx,ty,scale_value) in enumerate([(61,-11,.88),(61,11,.96),(-25,-57,1.05),(25,-57,.92)]):
 px,py=xy(tx,ty);pit=Point(px,py).buffer(1.45,resolution=24)
 if not walk.covers(pit.buffer(.2)) or pit.buffer(3.0).intersects(wet.union(road).union(footprint)):continue
 pits.append(pit);slab('Library tree pit soil','library_soil',pit,0,.12)
 slab('Library tree pit edging','library_light',pit.buffer(.12).difference(pit),.02,.13)
 broadleaf(px,py,scale_value,710+i)
pit_union=unary_union(pits)
paved=walk.difference(wet).difference(pit_union.buffer(.12))

slab('Pedestrian paving','library_paving',paved,0,.15)
# A shallow continuous edge transition, rather than a 15 cm trip at every plaza edge.
# Kept out of water, vehicle surfaces and the building; display landscaping only.
apron=paved.buffer(1.8,join_style=2).difference(paved).difference(wet.buffer(.6)).difference(road).difference(footprint).difference(pit_union.buffer(.12)).intersection(clip)
for part in polygons(apron):
 for triangle in constrained_delaunay_triangles(part.segmentize(.60)).geoms:
  if triangle.difference(part).area>1e-6:continue
  points=list(orient(triangle,1).exterior.coords)[:3]
  face('Walk edge graded transition','library_paving',[(x,y,max(.005,.15*(1-Point(x,y).distance(paved)/1.8))) for x,y in points])
# Recessed entry luminaires remain above the clear doorway and avoid fake floor spots.
for side in [-1,1]:
 for off in [-3.5,3.5]:
  block('Entry linear light','library_warm_light',side*53.0,off,3.81,1.8,.06,.025)
# Subtle joints break up the broad forecourt without changing source walk geometry.
for side in [-1,1]:
 for off in range(-14,15,2):
  seam=LineString([xy(side*55,off),xy(side*(70 if side<0 else 71),off)]).buffer(.009,cap_style=2).intersection(paved)
  slab('Forecourt stone joints','library_bronze',seam,.151,0)

for name,g,radius in culverts:
 slab(name+' roadway cover','road',road.intersection(g.buffer(radius+.6)).intersection(wet),0,.12)
for name,deck in bridges:slab(name+' deck','library_light',deck,.02,.18)
# Guard the exposed sides of each road-over-water crossing, never across its lane.
for name,g,radius in culverts:
 exposed=road.boundary.intersection(wet.buffer(.45)).intersection(g.buffer(radius+.8))
 segments=[exposed] if exposed.geom_type=='LineString' else list(getattr(exposed,'geoms',[]))
 for segment in segments:
  if segment.geom_type!='LineString' or segment.length<.3:continue
  n=max(1,math.ceil(segment.length/1.5));points=[segment.interpolate(segment.length*i/n) for i in range(n+1)]
  for point in points:
   cube(name+' railing posts','library_bronze',(point.x,point.y,.69),(.075,.075,1.14))
  for a,b in zip(points,points[1:]):
   beam(name+' handrail','library_bronze',(a.x,a.y,1.25),(b.x,b.y,1.25),.04,sides=8)
   beam(name+' lower rail','library_bronze',(a.x,a.y,.30),(b.x,b.y,.30),.025,sides=6)
   for j in range(1,11):
    t=j/11;x=a.x+(b.x-a.x)*t;y=a.y+(b.y-a.y)*t
    beam(name+' railing infill','library_bronze',(x,y,.30),(x,y,1.23),.012,sides=5)


for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner+' '+material);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  layer=mesh.uv_layers.new(name='Leaf albedo UV')
  for polygon,coords in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for loop,uv in zip(polygon.loop_indices,coords):layer.data[loop].uv=uv
 obj=bpy.data.objects.new(owner+' | '+material,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(M[material]);obj['designRole']=owner
 if any(word in owner for word in ['reading wing','connecting wing','hipped roof','Entry','Atrium']):obj['sourceFeatureIds']=[fid]
root=bpy.data.objects.new('Main library — illustrative source-anchored asset',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=[fid];root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['status']='WORK_IN_PROGRESS'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();scene['status']='work in progress'
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py')]:bpy.data.texts.new(name).write(path.read_text())
world=bpy.data.worlds.new('Library daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.65);sun.data.energy=2.5;sun.data.angle=.16
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=3000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),48);scene.cycles.use_denoising=False;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('library-overview',(-740,340,230),(-903,538,10),190,28),('east-entry',(-828,538,1.75),(-851,538,5),None,28),('library-rooflight',(-826,452,70),(-903,538,16),None,32)]
views.append(('north-canal-crossing',(-773,594,4.5),(-792,617,-.2),None,32))
views.append(('entry-approach',(*xy(76,-13),1.80),(*xy(50,0),2.3),None,30))
views.append(('south-arcade',(*xy(-40,-47.1),1.85),(*xy(38,-47.1),2.0),None,24))
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
for i,(name,pos,target,ortho,lens) in enumerate(views):
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'main-library.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('LIBRARY ASSET DRAFT — AVENUE STILL UNRESOLVED')
