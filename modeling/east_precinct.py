"""Compose existing East One and cultural-gallery/East Two work without moving their source anchors.
A work-in-progress shared ground and interface review, never a campus completion claim.
"""
import sys,math,hashlib,json,gc
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf,shrub
from east_south_garden import build_garden,plaza_display
OUT=ROOT/'modeling/east-precinct-work';OUT.mkdir(exist_ok=True)
exclude={'East study terrain','East source water','East water banks','East original roads','East exterior walking space','Culture local ground','Culture source water','Culture water bank','Culture surrounding approach','East Three local terrain','East Three source water','East Three banks','East Three source roads','East Three exterior walks','South gallery local terrain','South gallery source water','South gallery banks','South gallery source roads','East Four local ground','East Four source water','East Four banks','East Four source roads','East Four exterior walks'}
walk_parts=[];road_parts=[];occupied_parts=[];component_hashes={};component_roots=[]

def flat_surfaces(ob,levels):
 if ob.type!='MESH':return []
 result=[]
 for f in ob.data.polygons:
  pts=[ob.matrix_world@ob.data.vertices[i].co for i in f.vertices]
  if not pts:continue
  z=pts[0].z
  if not any(abs(z-v)<.0001 for v in levels) or max(p.z for p in pts)-min(p.z for p in pts)>.0001:continue
  p=Polygon([(v.x,v.y) for v in pts])
  if p.is_valid and p.area>1e-7:result.append(p)
 return result

for relative in ['east-teaching-work/east-one-connected.blend','east-culture-work/east-cultural-gallery.blend','east-three-work/east-three-connected.blend','east-south-gallery-work/east-three-four-gallery.blend','east-four-work/east-four-connected.blend']:
 path=ROOT/'modeling'/relative;component_hashes[relative]=hashlib.sha256(path.read_bytes()).hexdigest()
 with bpy.data.libraries.load(str(path),link=False) as (source,target):
  target.objects=list(source.objects);target.texts=list(source.texts)
 for recipe in target.texts:
  if recipe is not None:
   recipe.name=path.stem+'__'+recipe.name;recipe.use_fake_user=True
 loaded=[ob for ob in target.objects if ob is not None]
 for ob in loaded:bpy.context.collection.objects.link(ob)
 bpy.context.view_layer.update()
 for ob in loaded:
  role=ob.get('designRole',ob.name)
  if role in ['East exterior walking space','Culture surrounding approach','East Three exterior walks','East Four exterior walks']:walk_parts.extend(flat_surfaces(ob,[.15]))
  if role in ['East original roads','East Three source roads','East Four source roads']:road_parts.extend(flat_surfaces(ob,[.12]))
  if role not in exclude and any(k in role.lower() for k in ['floor','ground','paving','lawn','soil','edging','deck']):occupied_parts.extend(flat_surfaces(ob,[.12,.135,.15]))
  if 'one metre transition' in role and ob.type=='MESH':
   for f in ob.data.polygons:
    pts=[ob.matrix_world@ob.data.vertices[i].co for i in f.vertices]
    if pts and min(v.z for v in pts)>=.1199 and max(v.z for v in pts)<=.1501 and f.normal.z>.5:
     patch=Polygon([(v.x,v.y) for v in pts])
     if patch.is_valid and patch.area>1e-7:occupied_parts.append(patch)
  if role in exclude or ob.type=='CAMERA' or (ob.type=='LIGHT' and ob.data.type!='AREA'):
   bpy.data.objects.remove(ob,do_unlink=True)
  else:
   ob['componentSource']=relative
   if ob.type=='EMPTY' and 'sourceFeatureIds' in ob:component_roots.append(ob)
 print('IMPORTED',relative,component_hashes[relative],flush=True)
occupied=unary_union(occupied_parts);clip=box(-188,57,115,531)
water=[];source_walks=[];source_roads=[];legacy_roads=[];ground_ids=[]
paired_road_ids=['way/411343696','way/411343700']
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if not g.intersects(clip):continue
 if p.get('kind')=='water':
  water.append(g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(3.0,cap_style=1,join_style=1));ground_ids.append(f['id'])
 if p.get('kind')=='road' and p.get('tunnel') not in ['yes','culvert']:
  walking=p.get('highway') in ['footway','path','pedestrian','steps'];halfwidth=1.6 if walking else (3.0 if f['id'] in paired_road_ids else 3.5)
  surface=plaza_display() if f['id']=='way/504974753' else (g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(halfwidth,cap_style=2,join_style=1))
  if not walking:legacy_roads.append(g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(3.5,cap_style=2,join_style=1))
  (source_walks if walking else source_roads).append(surface);ground_ids.append(f['id'])
wet=unary_union(water).intersection(clip)
ornamental_ids=['way/504974720','way/504974721','way/504974724','way/504974725','way/504974751']
ornamental=unary_union([allshapes[fid] for fid in ornamental_ids]).intersection(clip)
# Retain authored parking, not the old source-road buffers that would widen some stretches again.
authored_road=unary_union(road_parts).difference(unary_union(legacy_roads).buffer(.002))
road=unary_union(source_roads+[authored_road]).intersection(clip).difference(wet).difference(occupied)
garden_walk,garden_islands=build_garden(wet,road,occupied,clip)
crossing=LineString([(40,258.5),(74.2,258.5)]).buffer(1.5,cap_style=2)
walk=unary_union(walk_parts+source_walks+[crossing,garden_walk]).intersection(clip).difference(wet).difference(road).difference(occupied)
slab('East precinct shared terrain','ground',clip.difference(wet.buffer(.3)),-1.4,1.4)
slab('East precinct shared water','water',wet.difference(ornamental),-1.4,.5)
slab('East precinct authored shallow water courts','water',ornamental,-1.4,1.15)
slab('East precinct shared banks','limestone',wet.buffer(.3).difference(wet).intersection(clip),-1.4,1.4)
slab('East precinct connected roads','road',road,0,.12)
slab('East precinct connected exterior walks','paving',walk.difference(crossing),0,.15)
cross_approach=walk.intersection(crossing);cross_transition=cross_approach.intersection(road.buffer(1.0))
slab('East precinct authored crossing level areas','paving',cross_approach.difference(cross_transition),0,.15)
profile_slab('East precinct authored crossing approaches','paving',cross_transition,lambda x,y:.12+.03*min(1,road.distance(Point(x,y))),.15,max_segment=.25)
for x in range(42,74):
 paint=box(x,257.1,x+.45,259.9).intersection(road)
 for part in polygons(paint):
  if part.area>.2:slab('East precinct authored zebra paint','mark',part,.121,.002)
# Source-aligned paired carriageways: display width is authored, never a measured lane count.
lane_curves=[allshapes[fid].intersection(clip) for fid in paired_road_ids]
edges=[]
for g in lane_curves:
 pts=list(g.coords)
 if pts[0][1]>pts[-1][1]:pts.reverse()
 edges.append(pts)
median=Polygon(edges[0]+list(reversed(edges[1]))).buffer(0).difference(road.buffer(.10)).difference(walk.buffer(.35)).difference(occupied).difference(wet)
mat('East precinct median planting',(.35,.39,.28),0,.95)
slab('East precinct median curb','limestone',median.buffer(.10).difference(median).intersection(clip),0,.24)
slab('East precinct low planted median','East precinct median planting',median,0,.215)
for g in lane_curves:
 for start in range(4,int(g.length)-4,8):
  a=g.interpolate(start);b=g.interpolate(start+3.5)
  stripe=LineString([a,b])
  if stripe.intersects(unary_union(source_walks+[crossing])):continue
  line('East precinct authored lane dashes','mark',list(stripe.coords),.08,.121,.002)
# A source-aligned planting strip stays outside the eastern pedestrian path.
pedestrian=allshapes['way/411343660'].intersection(clip)
pc=list(pedestrian.coords)
if pc[0][1]>pc[-1][1]:pc.reverse()
plant_axis=LineString(pc).offset_curve(-4.0)
source_buildings=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='building' and allshapes[f['id']].intersects(clip)])
slab('East precinct water court stone coping','limestone',ornamental.buffer(.45,join_style=2).difference(ornamental).difference(source_buildings),0,.18)
street_bed=plant_axis.buffer(2.3,cap_style=1,join_style=1).intersection(clip.buffer(-.5)).difference(source_buildings.buffer(1.5)).difference(wet.buffer(.5)).difference(road.buffer(.3)).difference(walk.buffer(.08))
tree_sites=[]
for j,y in enumerate([230,270,310,350,390,430,470,510]):
 point=plant_axis.intersection(LineString([(-50,y),(120,y)]))
 if point.geom_type=='Point' and street_bed.buffer(-.8).covers(point):tree_sites.append((j,point.x,point.y,[.72,.78,.68,.80,.73,.76,.70,.77][j]))
pits=unary_union([Point(x,y).buffer(.7,quad_segs=24) for j,x,y,size in tree_sites])
mat('East precinct street soil',(.18,.14,.09),0,.95)
slab('East precinct street tree pits','East precinct street soil',pits,0,.12)
slab('East precinct street planted verge','East precinct median planting',street_bed.difference(pits),0,.135)
slab('East precinct street verge edging','limestone',street_bed.buffer(.07).difference(street_bed).intersection(clip),0,.15)
configure_leaf_materials()
for j,x,y,size in tree_sites:broadleaf(x,y,size,seed=7700+j)
for j,y in enumerate([250,290,330,370,410,450,490]):
 point=plant_axis.intersection(LineString([(-50,y),(120,y)]))
 if point.geom_type=='Point' and street_bed.buffer(-.5).covers(point):shrub('East precinct low street understory',point.x,point.y,.135,.75,seed=7740+j)
root=bpy.data.objects.new('East teaching precinct — interface work draft',None);bpy.context.collection.objects.link(root)
root['status']='WORK_IN_PROGRESS';root['sourceCommit']='8cdd754f6355de11d9d0d6bb367d6a66cbf7c330';root['componentFileSHA256']=json.dumps(component_hashes);root['sourceGroundFeatureIds']=ground_ids;root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['unresolved']='Two gallery interfaces have limited local review; authored road presentation under inspection, other rooms and full route inspection remain unfinished';root['authoredPlazaDisplay']=plaza_display().wkt;root['authoredGardenWalkingArea']=garden_walk.wkt;root['authoredGardenSourceIds']=['way/504974751','way/504974753'];root['authoredCrossingDisplayOnly']=crossing.wkt;root['routingGraphUnchanged']=True;root['authoredSmallWaterSurfaceLevel']=-.25;root['smallWaterSourceIds']=ornamental_ids;root['authoredStreetPlanting']=street_bed.wkt;root['authoredStreetTreeCount']=len(tree_sites);root['authoredRoadWidths']='Paired Oufang Road source centrelines retained, each displayed six metres wide; no traffic direction or measured lane count claimed'
# Fine normal detail makes water legible without changing its source-plan geometry.
nodes=M['water'].node_tree.nodes;links=M['water'].node_tree.links;bs=nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.18
coord=nodes.new('ShaderNodeTexCoord');noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=8;noise.inputs['Detail'].default_value=2
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.015
links.new(coord.outputs['Object'],noise.inputs['Vector']);links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  uv=mesh.uv_layers.new(name='Leaf albedo UV')
  for poly,coords in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for idx,co in zip(poly.loop_indices,coords):uv.data[idx].uv=co
 ob=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(M[material]);ob['designRole']=owner;ob.parent=root
for name,path in [('PRECINCT_BUILD_RECIPE.py',Path(__file__)),('PRECINCT_PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('PRECINCT_LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py'),('SOUTH_GARDEN_RECIPE.py',Path(__file__).parent/'east_south_garden.py')]:bpy.data.texts.new(name).write(path.read_text())
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
world=bpy.data.worlds.new('East precinct daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
studio_world=world
eye_world=bpy.data.worlds.new('East precinct immersive soft daylight');eye_world.use_nodes=True;eye_world.use_fake_user=True
nodes=eye_world.node_tree.nodes;links=eye_world.node_tree.links;sky=nodes.new('ShaderNodeTexSky');sky.sky_type='NISHITA';sky.sun_disc=False;sky.sun_elevation=.65;sky.sun_rotation=2.4;sky.air_density=1;sky.dust_density=1.3
links.new(sky.outputs['Color'],nodes.get('Background').inputs['Color']);nodes.get('Background').inputs['Strength'].default_value=.2
root['previewLighting']='Studio world for overview; separately retained soft daylight world for eye-level previews. Not a real-time weather or app integration claim.'
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=int(next((a.split('=',1)[1] for a in sys.argv if a.startswith('--samples=')),192));scene.cycles.use_denoising=False;scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('east-precinct-overview',(225,-42,360),(-45,294,4),570,30),('east-interface-ground',(-47,418,1.85),(-47,439,1.85),None,24),('east-interface-upper',(-52,418,5.05),(-47,427,5.05),None,24),('east-interface-upper-return',(-47,430,5.05),(-47,418,5.05),None,24)]
views.extend([('east-three-gallery-ground',(-47,290,1.85),(-45,276,1.85),None,24),('east-three-gallery-upper',(-52,290,5.05),(-46,281,5.05),None,24)])
views.extend([('east-road-north-walk',(34,485,1.85),(51,410,1.5),None,26),('east-road-south-walk',(76,250,1.85),(63,335,1.5),None,26)])
views.append(('east-roadside-water',(79,275,1.85),(97,290,0),None,26))
views.extend([('east-three-authored-crossing',(44.5,253,1.85),(67,258.5,.25),None,26),('east-three-crossing-return',(73.5,263,1.85),(42,258.5,1.5),None,26)])
views.append(('east-three-east-court-seated',(8.3,264.60,1.40),(5.5,260,1.2),None,26))
views.extend([('east-three-east-court-pocket',(9,258.3,1.85),(5.5,263.6,1.6),None,25),('east-three-east-portal-sign',(47,258.5,1.85),(40,258.5,2.0),None,26)])
views.extend([('south-gallery-east3-ground',(-44,218,1.85),(-44,232,1.85),None,24),('south-gallery-east3-upper',(-44,218,5.05),(-44,232,5.05),None,24),('south-gallery-east3-return',(-44,229,5.05),(-44,217,5.05),None,24),('south-gallery-source-underpass',(-59,216.4,1.85),(-30,216.3,1.85),None,25)])
views.extend([('south-gallery-east4-ground',(-44,160,1.85),(-44,143,1.85),None,24),('south-gallery-east4-upper',(-44,160,5.05),(-44,143,5.05),None,24),('south-gallery-east4-return',(-44,145,5.05),(-44,161,5.05),None,24)])
views.extend([('east-four-reading-room',(-37.2,143.0,1.85),(-29.2,147.3,1.3),None,23),('east-four-reading-room-seated',(-34.5,147.95,1.35),(-31.5,143.0,1.05),None,25)])
views.append(('east-precinct-top',(-40,294,700),(-40,294,0),560,30))
views.extend([('east-south-pond-walk',(-103,180,1.85),(-77,187,1.1),None,25),('east-south-circle-place',(-147.5,167,1.85),(-147.5,178,1.1),None,25),('east-south-garden-overview',(-180,128,90),(-108,187,0),150,30)])
views.append(('east-south-garden-junction',(-112,178,1.85),(-98,179,1.1),None,25))
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
batches.clear();foliage_uv.clear();gc.collect()
for i,(name,eye,target,ortho,lens) in enumerate(views):
 scene.render.resolution_x,scene.render.resolution_y=(1000,1600) if name=='east-precinct-top' else (1600,1000)
 scene.world=studio_world if ortho else eye_world
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'east-teaching-precinct.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('EAST PRECINCT WIP: components retained, upper interface requires local review, not a campus acceptance')
