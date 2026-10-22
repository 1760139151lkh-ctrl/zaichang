"""Yangming bridge: one coherent bridge deck with source-aligned vehicle/foot paths.
Geometry details are authored display choices, not a surveyed bridge or routing edit.
"""
import sys,math,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import willow
OUT=ROOT/'modeling/yangming-work';OUT.mkdir(exist_ok=True)
bridge_id='way/424012300';foot_id='way/504974740'
axis=allshapes[bridge_id];ped_axis=allshapes[foot_id]
a=Vector(axis.coords[0]);b=Vector(axis.coords[-1]);u=(b-a).normalized();v=Vector((-u.y,u.x));L=(b-a).length
center=axis.centroid;clip=box(center.x-160,center.y-115,center.x+160,center.y+115)
mat('bridge_stone',(.76,.72,.62),0,.70);mat('bridge_paving',(.67,.64,.56),0,.80)
mat('bridge_asphalt',(.22,.23,.23),0,.88);mat('bridge_bronze',(.32,.25,.14),.65,.35)
mat('bridge_water',(.15,.30,.32),.35,.20);mat('bridge_bank',(.49,.48,.42),0,.85)
mat('willow',(.25,.34,.17),0,.85);mat('willow_light',(.40,.46,.25),0,.85)
nodes=M['bridge_water'].node_tree.nodes;links=M['bridge_water'].node_tree.links
coords=nodes.new('ShaderNodeTexCoord');noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=.8;noise.inputs['Detail'].default_value=2
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.20;bump.inputs['Distance'].default_value=.025
links.new(coords.outputs['Object'],noise.inputs['Vector']);links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])

def xy(x,y):return tuple(a+u*x+v*y)
def local_x(x,y):return (Vector((x,y))-a).dot(u)
def deck_z(x,y):
 t=max(0,min(1,local_x(x,y)/L));return .12+1.20*math.sin(math.pi*t)**2

def variable_slab(owner,material,g,top,depth):
 for p in polygons(g):
  if p.area<1e-6:continue
  p=orient(p,1).segmentize(1.2)
  for triangle in constrained_delaunay_triangles(p).geoms:
   if triangle.difference(p).area>1e-6:continue
   coords=list(orient(triangle,1).exterior.coords)[:3]
   face(owner,material,[(x,y,top(x,y)) for x,y in coords])
   face(owner,material,[(x,y,top(x,y)-depth) for x,y in reversed(coords)])
  for ring in [p.exterior,*p.interiors]:
   for (x,y),(q,r) in zip(list(ring.coords),list(ring.coords)[1:]):
    face(owner,material,[(x,y,top(x,y)),(x,y,top(x,y)-depth),(q,r,top(q,r)-depth),(q,r,top(q,r))])

carriageway=axis.buffer(3.5,cap_style=2)
pedway=ped_axis.buffer(1.6,cap_style=2)
north_walk=LineString([xy(0,-4.25),xy(L,-4.25)]).buffer(.75,cap_style=2)
deck=unary_union([carriageway,pedway,north_walk]).convex_hull
# The physical end is shared: let asphalt reach that edge instead of exposing a pale transverse wedge.
carriageway=LineString([xy(-2,0),xy(L+2,0)]).buffer(3.5,cap_style=2).intersection(deck)
pedway=pedway.difference(carriageway)
# The source water polygons stop at the recorded bridge: join only its covered corridor.
water_ids=['relation/7927357','way/288875626']
source_water=unary_union([allshapes[f] for f in water_ids])
corridor=axis.buffer(18,cap_style=2)
under_bridge=source_water.intersection(corridor).convex_hull.intersection(corridor)
wet=source_water.union(under_bridge).intersection(clip)
slab('Terrain around bridge','ground',clip.difference(wet),-1.6,1.6)
slab('Lake bed','bridge_bank',wet,-1.6,.10)
slab('Continuous lake water','bridge_water',wet,-1.50,.60)
# Bank walls never cut across the bridge's water passage.
banks=wet.buffer(.35).difference(wet).difference(deck.buffer(2.0))
slab('Lake bank retaining face','bridge_bank',banks,-1.5,1.5)
# Coping is drawn after approach masks, so it never lies across a road.
road_parts=[];walk_parts=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or f['id'] in [bridge_id,foot_id] or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 walking=p.get('highway') in ['footway','path','pedestrian','steps']
 surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.6 if walking else 3.5,cap_style=2,join_style=1)
 (walk_parts if walking else road_parts).append(surface.intersection(clip))
# Join the turning approach and bridge cap before meshing: butt caps at different angles leave wedges.
road_parts.extend([Point(*a).buffer(3.5),Point(*b).buffer(3.5)])
walk_parts.extend([Point(*ped_axis.coords[0]).buffer(1.6),Point(*ped_axis.coords[-1]).buffer(1.6)])
roads=unary_union(road_parts).difference(wet).difference(deck)
walks=unary_union(walk_parts).difference(wet).difference(roads).difference(deck)
slab('Lake bank coping','bridge_stone',wet.buffer(.60).difference(wet).difference(deck.buffer(2)).difference(roads).difference(walks),0,.12)
slab('Source approach roads','bridge_asphalt',roads,0,.12)
slab('Source approach footpaths','bridge_paving',walks,0,.15)
variable_slab('Continuous structural deck','bridge_stone',deck,lambda x,y:deck_z(x,y)-.04,.38)
variable_slab('Vehicle bridge surface','bridge_asphalt',carriageway,deck_z,.04)
def pedestrian_z(x,y):
 t=max(0,min(1,local_x(x,y)/L));return deck_z(x,y)+.03+.09*math.sin(math.pi*t)**2
variable_slab('South pedestrian bridge surface','bridge_paving',pedway,pedestrian_z,.12)
variable_slab('North pedestrian edge','bridge_paving',north_walk,pedestrian_z,.12)
# Expand subtractors by 2 mm so a zero-width boolean residue cannot become a vertical wall across a lane.
median=deck.difference(carriageway.buffer(.002)).difference(pedway.buffer(.002)).difference(north_walk.buffer(.002))
variable_slab('Continuous bridge kerbs','bridge_stone',median,pedestrian_z,.15)
# Longitudinal structural girders follow the same profile as the top, no floating plank.
for offset in [-3.5,3.5,5.3]:
 girder=LineString([xy(0,offset),xy(L,offset)]).buffer(.22,cap_style=2)
 variable_slab('Longitudinal bridge girders','bridge_stone',girder,lambda x,y:deck_z(x,y)-.38,.52)
for fraction in [.25,.5,.75]:
 x=L*fraction;z=deck_z(*xy(x,0))-.38
 for y in [-2.6,5.0]:
  px,py=xy(x,y);beam('Bridge piers','bridge_stone',(px,py,-1.8),(px,py,z-.22),.45,sides=12)
 cube('Pier crossheads','bridge_stone',(*xy(x,.9),deck_z(*xy(x,0))-.92),(10.8,.70,.50),math.atan2(v.y,v.x))
# Parapets along the actual outer deck edges, kept clear of both approach openings.
for side in ['north','south']:
 def edge(t):
  if side=='north':return Vector(xy(L*t,-4.90))
  p=Vector(ped_axis.coords[0]).lerp(Vector(ped_axis.coords[-1]),t);return p+v*1.50
 count=math.ceil(L/2.0)
 for i in range(count):
  p=edge(i/count);q=edge((i+1)/count);zp=pedestrian_z(*p);zq=pedestrian_z(*q)
  cube(side+' parapet posts','bridge_stone',(*p,zp+.55),(.16,.16,1.10),math.atan2(u.y,u.x))
  beam(side+' warm handrail','bridge_bronze',(*p,zp+1.12),(*q,zq+1.12),.045,sides=8)
  beam(side+' lower rail','bridge_bronze',(*p,zp+.20),(*q,zq+.20),.035,sides=6)
  for j in range(1,14):
   r=p.lerp(q,j/14);z=pedestrian_z(*r)
   beam(side+' balusters','bridge_bronze',(*r,z+.20),(*r,z+1.10),.012,sides=5)
 p=edge(1);z=pedestrian_z(*p);cube(side+' parapet posts','bridge_stone',(*p,z+.55),(.16,.16,1.10),math.atan2(u.y,u.x))
# Restrained road markings distinguish asphalt from the lower lake, not bright colour blocks.
for i in range(5,int(L)-5,9):
 marking=LineString([xy(i,0),xy(min(i+3,L-5),0)]).buffer(.035,cap_style=2)
 variable_slab('Bridge centre dashes','porcelain',marking,lambda x,y:deck_z(x,y)+.006,.006)
for y in [-3.15,3.15]:
 marking=LineString([xy(1,y),xy(L-1,y)]).buffer(.035,cap_style=2)
 variable_slab('Bridge edge marking','porcelain',marking,lambda x,y:deck_z(x,y)+.006,.006)
# Small expansion joints stay flush with their own carriageway/pedestrian levels.
for station in [1.2,L-1.2]:
 strip=LineString([xy(station,-5.2),xy(station,8.0)]).buffer(.014,cap_style=2)
 variable_slab('Vehicle expansion joints','bridge_bronze',strip.intersection(carriageway),lambda x,y:deck_z(x,y)+.007,.006)
 variable_slab('Footway expansion joints','bridge_bronze',strip.intersection(pedway.union(north_walk)),lambda x,y:pedestrian_z(x,y)+.007,.006)
# Authored bankside planting stays off roads, mapped footpaths and every retained footprint.
neighbor_buildings=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='building' and allshapes[f['id']].intersects(clip)])
for i,(station,offset) in enumerate([(-14,-17),(-14,17),(L+14,-17),(L+14,17)]):
 x,y=xy(station,offset);point=Point(x,y)
 if point.buffer(2.0).intersects(wet) or point.buffer(4.0).intersects(roads.union(walks)) or point.buffer(4.0).intersects(neighbor_buildings):continue
 willow(x,y,.95+i*.04,seed=910+i)
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(M[material]);obj['designRole']=owner
root=bpy.data.objects.new('Yangming bridge — source anchored display study',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=[bridge_id,foot_id];root['waterSourceIds']=water_ids;root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['status']='WORK_IN_PROGRESS';root['modelRole']='author-designed bridge detail; source routing and geography unchanged'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py')]:bpy.data.texts.new(name).write(path.read_text())
world=bpy.data.worlds.new('Bridge daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),64);scene.cycles.use_denoising=False;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('bridge-overview',(center.x+90,center.y-120,95),(center.x,center.y,0),150,32),('bridge-walk',(*xy(5,5.6),pedestrian_z(*xy(5,5.6))+1.7),(*xy(L-5,5.4),1.9),None,28),('water-under-bridge',(*xy(L*.45,25),.3),(*xy(L*.55,-10),.3),None,30)]
views.extend([('east-approach',(*xy(-12,5.5),1.85),(*xy(20,5.5),1.85),None,28),('west-approach',(*xy(L+12,5.0),1.85),(*xy(L-20,5.0),1.85),None,28)])
east_path=allshapes['way/504974741'];west_path=allshapes['way/504974738']
east_eye=east_path.interpolate(max(0,east_path.length-12));west_eye=west_path.interpolate(12)
east_target=ped_axis.interpolate(6);west_target=ped_axis.interpolate(ped_axis.length-6)
views.extend([('east-footway-turn',(east_eye.x,east_eye.y,1.85),(east_target.x,east_target.y,1.85),None,28),('west-footway-turn',(west_eye.x,west_eye.y,1.85),(west_target.x,west_target.y,1.85),None,28)])
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
for i,(name,location,target,ortho,lens) in enumerate(views):
 cam.location=location;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'yangming-bridge.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('YANGMING BRIDGE DRAFT — FULL APPROACH AND WATER REVIEW REMAINS')
