"""Join authored theatre and bridge assets with a single source-anchored ground.
Work-in-progress composition, not a whole-campus deliverable or routing update.
"""
import sys,math,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from shapely.geometry import MultiPoint
from shapely.wkt import loads as load_wkt
from lakeside_amphitheatre import add_lakeside_amphitheatre
from lakeside_planting import add_lakeside_planting
from lakeside_crossings import add_lakeside_crossings,CROSSING_SOURCES
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf,shrub
OUT=ROOT/'modeling/lakeside-work';OUT.mkdir(exist_ok=True)
exclude={
'Theatre ground','Lake water','Lake banks','Source roads','Foyer and wing courtyard paving','Courtyard paving joints',
'Yueya ground','Yueya source water','Yueya retaining banks','Yueya source roads','Yueya paths and entrances',
'Basic library ground','Source lake','Lake bank','Basic library plaza','Plaza flush joints',
'Terrain around bridge','Lake bed','Continuous lake water','Lake bank retaining face','Lake bank coping','Source approach roads','Source approach footpaths'}
for relative in ['theatre-work/small-theatre.blend','yangming-work/yangming-bridge.blend','basic-library-work/basic-library-and-c.blend','yueya-work/yueya-and-north-bridge.blend']:
 path=ROOT/'modeling'/relative
 with bpy.data.libraries.load(str(path),link=False) as (source,target):target.objects=list(source.objects)
 loaded=[ob for ob in target.objects if ob is not None]
 for ob in loaded:
  role=ob.get('designRole',ob.name)
  if role in exclude or ob.type=='CAMERA' or (ob.type=='LIGHT' and ob.data.type!='AREA'):
   bpy.data.objects.remove(ob,do_unlink=True)
  else:bpy.context.collection.objects.link(ob)
 print('IMPORTED COMPONENT',relative,hashlib.sha256(path.read_bytes()).hexdigest())
# A single terrain/water/path layer avoids overlapping independent study floors.
A=allshapes['way/232499325'];B=allshapes['way/237808500'];cx,cy=A.centroid.x,A.centroid.y
foot=Polygon([(cx+34.4*math.cos(i*math.tau/192),cy+23.7*math.sin(i*math.tau/192)) for i in range(192)]);theatre_foot=foot.union(B)
# Use the actual imported C ground-floor outline, not a second approximated silhouette.
tower_floor=bpy.data.objects['Tower arcade floor']
tower_display=MultiPoint([(vertex.co.x,vertex.co.y) for vertex in tower_floor.data.vertices]).convex_hull
library_foot=allshapes['way/237812466'].union(tower_display)
moon_root=bpy.data.objects['Yueya building and north bridge — authored WIP']
moon_foot=load_wkt(moon_root['displayFootprint']);moon_walk=load_wkt(moon_root['displayWalk']);moon_deck=load_wkt(moon_root['bridgeDeckFootprint'])
# Recover the exact authored grass top surfaces, keeping them out of the unified pavement.
moon_lawn_polys=[]
for role in ['Yueya forecourt lawn','Yueya forecourt low edging']:
 moon_lawn=bpy.data.objects[role]
 for face_data in moon_lawn.data.polygons:
  points=[moon_lawn.data.vertices[index].co for index in face_data.vertices]
  if max(p.z for p in points)-min(p.z for p in points)<1e-5 and max(p.z for p in points)>.10:
   moon_lawn_polys.append(Polygon([(p.x,p.y) for p in points]))
moon_gardens=unary_union(moon_lawn_polys).buffer(.002)
all_foot=theatre_foot.union(library_foot).union(moon_foot)
axis=allshapes['way/424012300'];ped=allshapes['way/504974740'];a=Vector(axis.coords[0]);b=Vector(axis.coords[-1]);u=(b-a).normalized();v=Vector((-u.y,u.x));L=(b-a).length
north=LineString([tuple(a-v*4.25),tuple(b-v*4.25)]).buffer(.75,cap_style=2)
deck=unary_union([axis.buffer(3.5,cap_style=2),ped.buffer(1.6,cap_style=2),north]).convex_hull.union(moon_deck)
clip=box(cx-125,cy-125,axis.bounds[2]+70,900)
water=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='water' and allshapes[f['id']].intersects(clip)])
# This mapped stream joins the lake at its recorded endpoint; 6 m display width is authored.
water=water.union(allshapes['way/288875627'].buffer(3.0,cap_style=1,join_style=1)).union(allshapes['way/1032412968'].buffer(2.0,cap_style=1,join_style=1))
source_bridge_water=allshapes['relation/7927357'].union(allshapes['way/288875626']);corridor=axis.buffer(18,cap_style=2)
covered_connection=source_bridge_water.intersection(corridor).convex_hull.intersection(corridor)
wet=water.union(covered_connection).intersection(clip)
# Match the theatre's restrained display fillets, without relocating source geometry.
wet=wet.buffer(.85,quad_segs=12).buffer(-.85,quad_segs=12).buffer(-.85,quad_segs=12).buffer(.85,quad_segs=12).intersection(clip)
extra_decks,extra_road_caps,extra_walk_caps=add_lakeside_crossings(wet)
deck=deck.union(extra_decks)
roads=list(extra_road_caps);walks=list(extra_walk_caps)
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or f['id'] in ['way/424012300','way/504974740','way/1032412967','way/1073557356','way/305829535','way/411343588','way/411343571'] or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 walking=p.get('highway') in ['footway','path','pedestrian','steps']
 surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.6 if walking else 3.5,cap_style=2,join_style=1)
 (walks if walking else roads).append(surface.intersection(clip))
roads.extend([Point(*a).buffer(3.5),Point(*b).buffer(3.5)])
walks.extend([Point(*ped.coords[0]).buffer(1.6),Point(*ped.coords[-1]).buffer(1.6)])
road=unary_union(roads).difference(wet).difference(deck).difference(all_foot)
# Fill each precinct's small court separately; never convex-hull across the whole lake.
plaza=theatre_foot.buffer(7).union(theatre_foot.convex_hull).union(library_foot.buffer(7)).union(library_foot.convex_hull).union(moon_walk).difference(all_foot)
# An authored footway follows the recorded theatre service loop; avoids an unpaved gap at the foyer.
service_loop=allshapes['way/424012289']
sidewalk=service_loop.buffer(5.8,cap_style=2,join_style=1).difference(service_loop.buffer(3.5,cap_style=2,join_style=1))
plaza=plaza.union(sidewalk).difference(all_foot)
# The official oblique map shows a tiered garden/plaza here, not a bare serrated lake edge.
# Position follows the existing peninsula; dimensions and details below are authored.
garden_centre=Vector((-287.0,695.0))
plaza_outline=Polygon([(-318,692),(-265,703),(-264.18,698.81),(-242.79,699.32),(-243.3,687.72),(-247.42,675.36),(-252.07,666.33),(-262.64,654.22),(-271.66,647.52),(-282.23,642.09),(-293.32,639.01),(-297.44,660.27),(-301.9,659.88),(-310,665),(-317,680)])
plaza_outline=plaza_outline.difference(wet.buffer(.4)).difference(road).difference(all_foot)
plaza=plaza.union(plaza_outline).union(box(-288.5,698,-285.5,704.5))
walk=unary_union(walks).union(plaza).difference(road).difference(deck).difference(wet).difference(all_foot).intersection(clip)
# Close residual hairline ground wedges between connected paving pieces before cutting soil pits.
walk=walk.buffer(1.5,quad_segs=12).buffer(-1.5,quad_segs=12).difference(road).difference(deck).difference(wet).difference(all_foot).intersection(clip)
# Seal sub-metre unassigned strips between the walkway and road edge, not the road itself.
# Close the actual narrow road/walk gap as a whole, not just its middle strip.
road_walk_union=road.union(walk)
edge_fill=road_walk_union.buffer(.70,quad_segs=12).buffer(-.70,quad_segs=12).difference(road_walk_union).intersection(road.buffer(1.45)).intersection(walk.buffer(1.45))
walk=walk.union(edge_fill).difference(road).difference(deck).difference(wet).difference(all_foot).intersection(clip)
walk=walk.difference(moon_gardens)
# The retained courtyard tree has a real soil opening in this shared paving layer too.
walk=walk.difference(Point(cx-43,cy+5).buffer(1.57,quad_segs=24))
# Individually seeded planting occupies real soil pockets, never roads, water or retained buildings.
configure_leaf_materials();mat('Lakeside soil',(.16,.12,.075),0,.95)
all_buildings=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='building' and allshapes[f['id']].intersects(clip)])
amphi_allowed=clip.difference(wet.buffer(.4)).difference(road).difference(all_buildings).difference(all_foot).difference(deck)
amphi_plaza=add_lakeside_amphitheatre(amphi_allowed,wet,deck)
walk=walk.union(amphi_plaza)
west_walk=allshapes['way/504974738'];wu=(Vector(west_walk.coords[1])-Vector(west_walk.coords[0])).normalized();wv=Vector((-wu.y,wu.x))
candidates=[]
for fraction in [.18,.40,.62,.84]:
 p=west_walk.interpolate(west_walk.length*fraction);q=Vector((p.x,p.y))+wv*4.4;candidates.append((q,wu))
for fraction in [.57,.65,.73]:
 p=service_loop.interpolate(service_loop.length*fraction);before=service_loop.interpolate(max(0,service_loop.length*fraction-.5));after=service_loop.interpolate(min(service_loop.length,service_loop.length*fraction+.5));t=(Vector((after.x,after.y))-Vector((before.x,before.y))).normalized();n=Vector((t.y,-t.x));q=Vector((p.x,p.y))+n*8;candidates.append((q,t))
planted=[]
for i,(q,t) in enumerate(candidates):
 pit=Point(*q).buffer(1.2,quad_segs=24)
 if not clip.covers(pit.buffer(3)) or pit.buffer(2.3).intersects(wet) or pit.buffer(3).intersects(all_buildings) or pit.buffer(1.3).intersects(road) or pit.intersects(walk):continue
 pocket=Point(*q).buffer(3.0,quad_segs=24).difference(pit.buffer(.12)).difference(road).difference(wet).difference(all_buildings)
 walk=walk.union(pocket).difference(pit.buffer(.12));slab('Lakeside tree soil','Lakeside soil',pit,0,.12);slab('Lakeside tree edging','limestone',pit.buffer(.12).difference(pit),.02,.13)
 broadleaf(q.x,q.y,.84+.035*i,seed=1001+i);planted.append([float(q.x),float(q.y),1001+i])
 # A short timber bench faces the water; supports are modeled rather than floating boards.
 seat=q+t*2.15;angle=math.atan2(t.y,t.x)
 for j in range(4):cube('Lakeside bench slats','wood',(*(seat+Vector((-t.y,t.x))*(j-.5*3)*.12),.59),(1.75,.10,.07),angle)
 for side in [-1,1]:cube('Lakeside bench supports','bronze',(*(seat+t*(side*.65)),.35),(.07,.44,.40),angle)
print('AUTHOR LANDSCAPE',planted)
# Small shade groups on the lower viewing plaza; every pit is cut out of the pavement.
for i,(x,y) in enumerate([(-264,674),(-274,657),(-292,648)]):
 pit=Point(x,y).buffer(1.2,quad_segs=24)
 if not plaza_outline.covers(pit.buffer(2.2)) or pit.buffer(2.3).intersects(wet) or Point(x,y).distance(Point(*garden_centre))<27:continue
 walk=walk.difference(pit.buffer(.12));slab('Viewing plaza tree soil','Lakeside soil',pit,0,.12);slab('Viewing plaza tree edging','limestone',pit.buffer(.12).difference(pit),.02,.13)
 broadleaf(x,y,.68+i*.04,seed=1501+i)
 for j in range(16):cube('Viewing plaza timber bench','wood',(x+2.2,y+(j-7.5)*.13,.59),(.44,.115,.07))
 for off in [-.72,.72]:
  cube('Viewing plaza bench supports','bronze',(x+2.2,y+off,.35),(.40,.07,.40))
  beam('Viewing plaza bench back posts','bronze',(x+2.0,y+off,.15),(x+2.0,y+off,1.0),.025,sides=6)
 for z in [.73,.85,.97]:cube('Viewing plaza back slats','wood',(x+2.0,y,z),(.05,2.06,.10))
# Nested low terraces, planted arcs and an unobstructed centre walk, with a north approach ramp.
def south_sector(radius):
 return Polygon([tuple(garden_centre)]+[(garden_centre.x+radius*math.cos(math.pi+i*math.pi/96),garden_centre.y+radius*math.sin(math.pi+i*math.pi/96)) for i in range(97)])
mat('Garden retaining stone',(.73,.68,.57),0,.75)
terraces=[]
for radius,base in [(24,.15),(18,.33),(12,.51)]:
 area=south_sector(radius).intersection(plaza_outline)
 if radius==12:area=area.union(Point(*garden_centre).buffer(3,quad_segs=32)).union(box(-288.5,697.4,-285.5,698.3))
 top=base+.18
 if radius==12:slab('Inner landing support','paving',area.difference(south_sector(12)),.15,base-.15)
 slab('Lakeside garden terrace','paving',area,base,.18);terraces.append((radius,top))
axis_walk=box(garden_centre.x-1.6,garden_centre.y-30,garden_centre.x+1.6,garden_centre.y+4)
for ri,(radius,top) in enumerate(terraces):
 bed=south_sector(radius-.30).difference(south_sector(radius-1.7)).difference(axis_walk).intersection(plaza_outline)
 soil=bed.buffer(-.16)
 slab('Garden arc retaining edges','Garden retaining stone',bed.difference(soil),top,.28)
 slab('Garden arc soil','Lakeside soil',soil,top+.20,.06)
 count=max(15,math.ceil(math.pi*(radius-1.0)/.72))
 for i in range(count):
  angle=math.pi+(i+.5)*math.pi/count;q=garden_centre+Vector((math.cos(angle),math.sin(angle)))*(radius-1.0)
  if not soil.buffer(.10).covers(Point(*q)) or axis_walk.buffer(.6).contains(Point(*q)):continue
  shrub('Garden shrubs '+str(ri)+' '+str(i),q.x,q.y,ground=top+.26,size=1.10+.10*math.sin(i*2.3),seed=1200+ri*200+i)
# The high inner landing is reachable without stepping through a flower bed.
ramp=[(-288.5,698.3,.69),(-285.5,698.3,.69),(-285.5,702,.15),(-288.5,702,.15)]
face('Garden north approach ramp','paving',ramp)
for i in range(4):
 a0=ramp[i];b0=ramp[(i+1)%4];face('Garden ramp edge','Garden retaining stone',[a0,b0,(b0[0],b0[1],.15),(a0[0],a0[1],.15)])
for x in [-288.45,-285.55]:
 beam('Garden ramp handrail','bronze',(x,698.0,1.59),(x,698.3,1.59),.032,sides=8)
 beam('Garden ramp handrail','bronze',(x,698.3,1.59),(x,702,1.05),.032,sides=8)
 for y in [698.3,700.15,702]:
  level=.69-(y-698.3)*.54/3.7
  beam('Garden ramp balusters','bronze',(x,y,level),(x,y,level+.90),.025,sides=6)
slab('Mast circular base','limestone',Point(*garden_centre).buffer(1.25,quad_segs=32),.69,.15)
beam('Author-designed garden mast','bronze',(*garden_centre,.84),(*garden_centre,12.84),.085,.035,sides=12)
# Keep the lake lower and give the public plaza a readable, slender edge guard.
shore=wet.buffer(.75,quad_segs=12).boundary.intersection(plaza_outline.buffer(.6))
shore_lines=[shore] if shore.geom_type=='LineString' else [g for g in getattr(shore,'geoms',[]) if g.geom_type=='LineString']
for line in shore_lines:
 if line.length<2:continue
 count=math.ceil(line.length/2)
 for i in range(count):
  a0=line.interpolate(line.length*i/count);b0=line.interpolate(line.length*(i+1)/count)
  beam('Plaza lake handrail','bronze',(a0.x,a0.y,1.20),(b0.x,b0.y,1.20),.035,sides=8)
  beam('Plaza lake lower rail','bronze',(a0.x,a0.y,.38),(b0.x,b0.y,.38),.022,sides=6)
  beam('Plaza lake posts','bronze',(a0.x,a0.y,.15),(a0.x,a0.y,1.20),.035,sides=8)

new_tree_records=add_lakeside_planting(clip,wet,road,walk,all_buildings,all_foot,deck)
mat('Lakeside paving',(.60,.57,.49),0,.82);mat('Lakeside bank',(.49,.48,.42),0,.85)
mat('Lakeside water',(.15,.30,.32),.35,.20)
slab('Unified lakeside ground','ground',clip.difference(wet.buffer(.35)),-1.6,1.6)
slab('Unified lake bed','Lakeside bank',wet,-1.6,.10)
slab('Unified lake water','Lakeside water',wet,-1.5,.60)
bank=wet.buffer(.35).difference(wet).intersection(clip)
slab('Unified retaining bank','Lakeside bank',bank,-1.5,1.5)
slab('Unified bank coping','limestone',wet.buffer(.60).difference(wet).difference(deck.buffer(2)).difference(road).difference(walk),0,.12)
slab('Unified roads','road',road,0,.12);slab('Unified footpaths and court','Lakeside paving',walk,0,.15)
# A readable crossing where the recorded bridge footway meets the service loop.
walk_axis=allshapes['way/504974738'];junction=Vector(walk_axis.coords[1]);wu=(Vector(walk_axis.coords[1])-Vector(walk_axis.coords[0])).normalized();wv=Vector((-wu.y,wu.x))
for i in range(-5,6):
 q=junction+wu*(i*.8)
 stripe=Polygon([tuple(q+wu*x+wv*y) for x,y in [(-.2,-1.35),(.2,-1.35),(.2,1.35),(-.2,1.35)]])
 slab('Authored pedestrian crossing','mark',stripe.intersection(road),.125)
# The timber crossing meets the service-road edge, then a marked crossing reaches the opposite walk.
wood_source=allshapes['way/305829535'];wood_junction=Vector(wood_source.coords[-1]);wood_u=(Vector(wood_source.coords[-1])-Vector(wood_source.coords[0])).normalized();wood_v=Vector((-wood_u.y,wood_u.x))
for i in range(-6,7):
 q=wood_junction+wood_u*(i*.8)
 stripe=Polygon([tuple(q+wood_u*x+wood_v*y) for x,y in [(-.2,-1.35),(.2,-1.35),(.2,1.35),(-.2,1.35)]])
 slab('Timber bridge pedestrian crossing','mark',stripe.intersection(road),.125)
mat('Lakeside paving joints',(.46,.44,.39),0,.95)
for x in range(math.floor(clip.bounds[0]),math.ceil(clip.bounds[2]),2):
 slab('Courtyard flush joints','Lakeside paving joints',box(x-.008,clip.bounds[1],x+.008,clip.bounds[3]).intersection(walk.intersection(plaza)),.151)
for y in range(math.floor(clip.bounds[1]),math.ceil(clip.bounds[3]),2):
 slab('Courtyard flush joints','Lakeside paving joints',box(clip.bounds[0],y-.008,clip.bounds[2],y+.008).intersection(walk.intersection(plaza)),.151)
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  layer=mesh.uv_layers.new(name='Leaf albedo UV')
  for polygon,uvs in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for loop,uv in zip(polygon.loop_indices,uvs):layer.data[loop].uv=uv
 ob=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(M[material]);ob['designRole']=owner
 if owner=='Outdoor amphitheatre timber seats':
  bevel=ob.modifiers.new('Soft outdoor seat edges','BEVEL');bevel.width=.018;bevel.segments=3
 for prefix,source_ids in CROSSING_SOURCES.items():
  if owner.startswith(prefix):ob['sourceFeatureIds']=source_ids;ob['sourceGeometryUnchanged']=True
# Meshes now own their geometry and UVs; release construction-only Python arrays.
import gc
batches.clear();foliage_uv.clear();gc.collect()
scene=bpy.context.scene;scene['status']='WORK_IN_PROGRESS';scene['scope']='Theatre, basic library A/C, Yueya building, source-anchored bridges, waterways and authored landscape; surrounding buildings largely unmodeled';scene['sourceGeometryUnchanged']=True
scene['authoredLakesideTrees']=json.dumps(new_tree_records);scene['originWGS84']=[OX,OY];scene['metersPerDegree']=[SX,SY];scene['sourceCommit']=ledger['sourceCommit'];scene['waterwayDisplayWidthsMetres']={'way/288875627':6.0,'way/1032412968':4.0};scene['northwestBridgeDisplayContinuationMetres']=4.0
scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();bpy.data.texts.new('COMPOSITION_RECIPE.py').write(Path(__file__).read_text())
for name in ['lakeside_crossings.py','lakeside_amphitheatre.py','lakeside_planting.py','architecture_primitives.py','landscape_primitives.py']:bpy.data.texts.new('CURRENT_'+name).write((Path(__file__).parent/name).read_text())
world=bpy.data.worlds.new('Lakeside daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),64);scene.cycles.use_denoising=False;scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('lakeside-composition',(-180,375,330),(-266,690,12),510,32),('theatre-toward-bridge',(cx+54,cy+30,1.85),(-230,720,2),None,28),('bridge-toward-theatre',(b.x-10,b.y-6,1.85),(cx+20,cy,7),None,28)]
views.append(('lakeside-garden',(-279,653,1.85),(-287,690,1.2),None,26))
views.extend([('garden-centre-walk',(-287,674,2.03),(-287,692,1.0),None,26),('garden-north-ramp',(-287,703.3,1.85),(-287,695,1.0),None,26)])
views.extend([('west-crossing',(-445,672,1.85),(-477,668,1.85),None,28),('south-footbridge',(-368,595,1.85),(-381,559,1.85),None,28),('stream-to-lake',(-384,566,.1),(-376,561,-.5),None,28)])
views.extend([('northwest-service-crossing',(-482.8,718,1.85),(-482.2,697,1.85),None,28),('tributary-underpass',(-474,703,-.45),(-486,701,-.7),None,28)])
views.extend([('south-footbridge-return',(-387.3,545.9,1.85),(-373,581,1.85),None,28),('west-crossing-return',(-478.5,666.4,1.85),(-450,672,1.85),None,28),('west-stream-underpass',(-463,683,-.45),(-463,663,-.7),None,28)])
views.extend([('outdoor-amphitheatre',(-322,557,1.85),(-322,585,1.2),None,26),('amphitheatre-rear-walk',(-327.8,590,2.75),(-322,568,.8),None,26),('amphitheatre-access',(-334,600.8,1.85),(-328,590,1.6),None,26)])
views.extend([('lake-facing-library',(-286,665,1.85),(-160,608,24),None,28),('library-west-arcade',(-181,580,1.85),(-177,602,2),None,24),('library-court',(-141,611,1.85),(-149,591,3),None,24)])
views.append(('east-shore-garden',(-135,777,1.85),(-184,806,3),None,26))
views.append(('bridge-toward-yueya',(-275,720,1.85),(-316,775,8),None,28))
views.append(('outdoor-seat-detail',(-326.14,583.45,2.45),(-319.4,582.7,1.0),None,32))
cross_eye=junction-wu*9;cross_target=junction+wu*5
views.extend([('bridge-footway-crossing',(*cross_eye,1.85),(*cross_target,1.0),None,26),('foyer-to-sidewalk',(cx+36,cy-1,1.85),(cx+48,cy+4,.3),None,26)])
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
for i,(name,eye,target,ortho,lens) in enumerate(views):
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'lakeside-precinct.blend'),compress=True)
 if selected and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('COMPOSITION ONLY — NO FULL CAMPUS ACCEPTANCE')
