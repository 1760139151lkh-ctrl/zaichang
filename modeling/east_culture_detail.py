"""East cultural gallery, source-anchored authored spatial draft, not an as-built survey."""
import sys,math,hashlib,gc
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
import east_stair_core as stair
import east_culture_furniture as furniture
import east_two_teaching as east_two
from landscape_primitives import foliage_uv
OUT=ROOT/'modeling/east-culture-work';OUT.mkdir(exist_ok=True)
IDS=['way/1122111924','way/1122109341','way/161325385'];gallery=allshapes[IDS[0]];source_pavilion=allshapes[IDS[1]]
# Smooth only the authored western silhouette, retaining the source centroid and source data.
source_coords=list(source_pavilion.exterior.coords);arc=[Vector(source_coords[i]) for i in [4,3,2,1,0,7,6]];outline=[]
for i in range(len(arc)-1):
 p1,p2=arc[i],arc[i+1];p0=arc[max(0,i-1)];p3=arc[min(len(arc)-1,i+2)]
 for j in range(20):
  t=j/20;outline.append(tuple(.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)))
outline.extend([tuple(arc[-1]),source_coords[5]]);pavilion=Polygon(outline)
pavilion=translate(pavilion,source_pavilion.centroid.x-pavilion.centroid.x,source_pavilion.centroid.y-pavilion.centroid.y)
if not pavilion.is_valid:raise ValueError('Authored pavilion silhouette is invalid')
print('PAVILION_DISPLAY_BOUNDARY_SHIFT',pavilion.boundary.hausdorff_distance(source_pavilion.boundary),'CENTROID_OFFSET',pavilion.centroid.distance(source_pavilion.centroid))
teaching=allshapes['way/161325385'];north_context=allshapes['way/161325315'];south_context=allshapes['way/161393058']
# Source layer values are relative ordering, not a measured underground elevation.
mat('Culture white',(.80,.78,.72),0,.58);mat('Culture bronze',(.26,.25,.22),.5,.38)
mat('Culture glazing',(.72,.77,.78),.03,.08);M['Culture glazing'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.9
mat('Culture opaque glass',(.10,.13,.14),.35,.25)
clip=box(-98,276,49,432);wet=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='water' and allshapes[f['id']].intersects(clip)]).intersection(clip)
slab('Culture local ground','ground',clip.difference(wet.buffer(.3)),-1.4,1.4)
slab('Culture source water','water',wet,-1.4,.5);slab('Culture water bank','limestone',wet.buffer(.3).difference(wet),-1.4,1.4)
# The narrow source gap is closed by a separately identified display infill, not by moving source outlines.
joins=box(-55.4,pavilion.bounds[1],-53.0,pavilion.bounds[3])
compound=gallery.union(pavilion).union(joins).union(teaching);slab('Culture connected ground','paving',compound,0,.15)
# Keep the entire source gallery, with two narrow upper galleries around a real central void.
upper=gallery.intersection(box(-100,270,-51,440).union(box(-44,270,0,440)))
# Cross-gallery bridges are at actual authored circulation bays, not full infill floors.
for y in [301,330,380,413]:upper=upper.union(gallery.intersection(box(-100,y-1.4,0,y+1.4)))
# A full-width north landing joins both side galleries to East One's authored portal.
upper=upper.union(gallery.intersection(box(-100,421.4,0,430)))
# South arrival platform connects both upper side galleries to East Three.
upper=upper.union(gallery.intersection(box(-100,280,0,287.2)))
# Upper slab is emitted once after the pavilion joins and stair openings are known.
roof=lambda x,y:6.25+.55*math.sin(math.pi*(y-283.84)/(424.64-283.84))**2
roof_foot=gallery.difference(teaching)
profile_slab('Culture continuous glass roof','Culture glazing',roof_foot,roof,.075,max_segment=.75)
entries=[301,330,355,380,413]
for y in range(287,424,4):
 seg=roof_foot.intersection(LineString([(-90,y),(-20,y)]))
 if seg.is_empty:continue
 a,b=list(seg.coords)[0],list(seg.coords)[-1]
 beam('Culture roof transverse ribs','Culture white',(*a,roof(*a)),(*b,roof(*b)),.075,sides=8)
 if not any(abs(y-v)<2.3 for v in entries):
  for p in [a,b]:beam('Culture full height columns','Culture white',(*p,.15),(*p,roof(*p)),.105,sides=8)
for y in [v+d for v in entries for d in [-2.3,2.3]]:
 seg=roof_foot.intersection(LineString([(-90,y),(-20,y)]))
 if seg.is_empty:continue
 for p in [list(seg.coords)[0],list(seg.coords)[-1]]:beam('Culture passage side columns','Culture white',(*p,.15),(*p,roof(*p)),.105,sides=8)
for poly in polygons(roof_foot):
 pts=list(LineString(poly.exterior.coords).segmentize(.75).coords)
 for p,q in zip(pts,pts[1:]):beam('Culture continuous roof edges','Culture white',(*p,roof(*p)),(*q,roof(*q)),.065,sides=8)
# A few broad ground-level side openings preserve transverse movement.
entries=[301,330,355,380,413]
for poly in polygons(gallery):
 for a,b in zip(list(poly.exterior.coords),list(poly.exterior.coords)[1:]):
  if abs(a[1]-b[1])<5:continue # Both north/south ends remain genuinely open.
  for seg in [LineString([a,b]).segmentize(2.0)]:
   pts=list(seg.coords)
   for p,q in zip(pts,pts[1:]):
    mx,my=(p[0]+q[0])/2,(p[1]+q[1])/2
    # Do not put glass inside the neighbouring teaching/pavilion source footprint.
    if teaching.buffer(.02).covers(Point(mx,my)) or pavilion.buffer(.10).covers(Point(mx,my)):continue
    portal=any(abs(my-y)<2.3 for y in entries)
    if not portal:face('Culture gallery ground glazing','Culture glazing',[(*p,.15),(*q,.15),(*q,3.10),(*p,3.10)])
    west_join=mx<-50 and any(abs(my-y)<2.3 for y in [330,380])
    if not west_join:face('Culture gallery upper glazing','Culture glazing',[(*p,3.40),(*q,3.40),(*q,roof(*q)-.05),(*p,roof(*p)-.05)])
    if not portal:beam('Culture glazing verticals','Culture bronze',(*p,.15),(*p,roof(*p)-.05),.025,sides=6)
    beam('Culture glazing floor band','Culture bronze',(*p,3.35),(*q,3.35),.04,sides=6)
# The source west pavilion keeps its curved wedge, with a single calm roof, not stepped boxes.
stair_positions=[(-65.5,331.4),(-59.5,371.4)]
openings=unary_union([box(x,y,x+3.2,y+3.9) for x,y in stair_positions])
upper=upper.union(pavilion).union(joins).union(teaching).difference(openings.union(east_two.HOLES))
slab('Culture unified upper floor','Culture white',upper,3.15,.20)
def join_roof(x,y):
 cut=LineString([(-90,y),(-20,y)]);p=pavilion.intersection(cut);g=gallery.intersection(cut)
 if p.is_empty or g.is_empty:return roof(x,y)
 a=p.bounds[2];b=g.bounds[0];t=max(0,min(1,(x-a)/max(.01,b-a)))
 return (1-t)*(6.55+.30*math.sin(math.pi*(y-301)/106))+t*roof(x,y)
profile_slab('Culture west join roof','Culture glazing',joins.difference(gallery).difference(pavilion),join_roof,.075,max_segment=.4)
M['East white']=M['Culture white']
for x,y in stair_positions:
 stair.stair_flight('Culture west first stair flights',x,x+1.35,y,.15,.16,1)
 stair.stair_flight('Culture west returning stair flights',x+1.85,x+3.2,y+2.6,1.75,.16,-1)
 slab('Culture west middle landings','Culture white',box(x,y+2.6,x+3.2,y+3.9),1.55,.20)
 for xx in [x+.05,x+1.30,x+1.90,x+3.15]:
  reverse=xx>x+1.6
  start=y+2.6 if reverse else y; direction=-1 if reverse else 1;base=1.75 if reverse else .15
  beam('Culture stair handrails','Culture bronze',(xx,start,base+1.1),(xx,start+direction*2.6,base+2.7),.03,sides=6)
  for j in range(11):
   yy=start+direction*j*.26;z=base+j*.16
   beam('Culture stair vertical guards','Culture bronze',(xx,yy,z),(xx,yy,z+1.1),.018,sides=6)
 for a,b in [((x,y+2.6),(x,y+3.9)),((x,y+3.9),(x+3.2,y+3.9)),((x+3.2,y+3.9),(x+3.2,y+2.6))]:
  beam('Culture middle landing handrail','Culture bronze',(*a,2.85),(*b,2.85),.03,sides=6)
  n=max(1,math.ceil(math.dist(a,b)/.15))
  for j in range(n+1):
   xx=a[0]+(b[0]-a[0])*j/n;yy=a[1]+(b[1]-a[1])*j/n
   beam('Culture middle landing infill','Culture bronze',(xx,yy,1.75),(xx,yy,2.85),.015,sides=6)
 for a,b in [((x,y),(x,y+3.9)),((x,y+3.9),(x+3.2,y+3.9)),((x+3.2,y+3.9),(x+3.2,y)),((x,y),(x+1.85,y))]:
  beam('Culture stair floor opening guard','Culture bronze',(*a,4.45),(*b,4.45),.03,sides=6)
  n=max(1,math.ceil(math.dist(a,b)/.15))
  for j in range(n+1):
   xx=a[0]+(b[0]-a[0])*j/n;yy=a[1]+(b[1]-a[1])*j/n
   beam('Culture stair floor opening infill','Culture bronze',(xx,yy,3.35),(xx,yy,4.45),.015,sides=6)
profile_slab('Culture west pavilion quiet roof','Culture white',pavilion,lambda x,y:6.55+.30*math.sin(math.pi*(y-301)/106),.22,max_segment=.65)
for ring in [pavilion.exterior]:
 boundary=LineString(ring.coords);count=max(1,math.ceil(boundary.length/2.8));pts=[boundary.interpolate(boundary.length*j/count).coords[0] for j in range(count+1)]
 for p,q in zip(pts,pts[1:]):
  mx,my=(p[0]+q[0])/2,(p[1]+q[1])/2
  if mx>-55.1:continue # Interior connection to long gallery is left open for later fit-out.
  for lo,hi in [(.15,3.15),(3.35,6.45)]:
   if lo<1 and any(abs(my-y)<2.3 for y in [330,380]):continue
   face('Culture west pavilion glazing','Culture glazing',[(*p,lo+.40),(*q,lo+.40),(*q,hi),(*p,hi)])
   beam('Culture west pavilion posts','Culture bronze',(*p,lo),(*p,hi),.045,sides=6)
   line('Culture west pavilion sill','Culture white',[p,q],.14,lo,.40)
# Guard the upper-level void, leaving the crossing bridges continuous.
void=gallery.difference(upper)
for poly in polygons(void):
 pts=list(poly.exterior.coords)
 for a,b in zip(pts,pts[1:]):
  if gallery.boundary.distance(LineString([a,b]).interpolate(.5,normalized=True))<.05:continue
  beam('Culture upper void handrail','Culture bronze',(*a,4.45),(*b,4.45),.032,sides=6)
  n=max(1,math.ceil(math.dist(a,b)/.15))
  for j in range(n+1):
   p=(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n)
   beam('Culture upper void infill','Culture bronze',(*p,3.35),(*p,4.45),.015,sides=6)
# Approach paving is an authored display surface, not a routing network write.
walk=compound.buffer(2).difference(compound).difference(teaching).difference(north_context).difference(south_context).difference(wet).difference(east_two.COURT)
slab('Culture surrounding approach','paving',walk,0,.15)
teaching_lamps=east_two.build(gallery)+east_two.build_seminar()
reading_lamps=furniture.build_reading_nook()
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  uv=mesh.uv_layers.new(name='Leaf albedo UV')
  for poly,coords in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for idx,co in zip(poly.loop_indices,coords):uv.data[idx].uv=co
 ob=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(M[material]);ob['designRole']=owner
 if owner in ['Culture reading sofa cushions','Culture reading sofa back','Culture reading sofa arms','Culture reading single chair seat','Culture reading single chair back','Culture reading shared low table','East Two court bench seats','East Two court bench backs','East Two seminar chair seats','East Two seminar chair backs','East Two seminar window bench']:
  mod=ob.modifiers.new('Soft furniture corners','BEVEL');mod.width=.04 if 'table' not in owner else .018;mod.segments=3
root=bpy.data.objects.new('East cultural gallery — unfinished spatial draft',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=IDS;root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['sourceGeometryUnchanged']=True;root['status']='WORK_IN_PROGRESS';root['unresolved']='West joins have limited local checks; East Two source-specific structure and stair cores newly built, rooms and complete routes unfinished; East One/Three context not integrated';root['sourcePavilionFootprint']=source_pavilion.wkt;root['authoredPavilionFootprint']=pavilion.wkt;root['pavilionDisplayBoundaryDisplacement']=pavilion.boundary.hausdorff_distance(source_pavilion.boundary);root['pavilionDisplayCentroidOffset']=pavilion.centroid.distance(source_pavilion.centroid);root['authoredSourceGapInfill']=joins.difference(gallery).difference(pavilion).wkt;root['layerInterpretation']='Source -1/+1 retained as relative source metadata, not asserted as surveyed elevation'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('STAIR_RECIPE.py',Path(__file__).parent/'east_stair_core.py'),('FURNITURE_RECIPE.py',Path(__file__).parent/'east_culture_furniture.py'),('EAST_TWO_RECIPE.py',Path(__file__).parent/'east_two_teaching.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py')]:bpy.data.texts.new(name).write(path.read_text())
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();scene['sourceCommit']='8cdd754f6355de11d9d0d6bb367d6a66cbf7c330'
world=bpy.data.worlds.new('Culture daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
for y in range(292,421,8):
 for x in [-52.0,-42.7]:
  bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,3.12));ob=bpy.context.object;ob.name='Culture gallery ceiling fixture';ob.dimensions=(.32,1.1,.06);ob.data.materials.append(M['porcelain']);ob.parent=root
  bpy.ops.object.light_add(type='AREA',location=(x,y,3.08));lamp=bpy.context.object;lamp.data.energy=180;lamp.data.shape='RECTANGLE';lamp.data.size=.3;lamp.data.size_y=1.05;lamp.data.color=(1,.95,.88);lamp.parent=root
for x,y in stair_positions:
 for xx,yy,z,energy in [(x+.675,y-.6,3.12,240),(x+1.6,y+3.1,6.55+.30*math.sin(math.pi*(y+3.1-301)/106)-.22-.03,420)]:
  bpy.ops.mesh.primitive_cube_add(size=1,location=(xx,yy,z));ob=bpy.context.object;ob.name='Culture stair ceiling fixture';ob.dimensions=(.85,.30,.06);ob.data.materials.append(M['porcelain']);ob.parent=root
  bpy.ops.object.light_add(type='AREA',location=(xx,yy,z-.04));lamp=bpy.context.object;lamp.data.energy=energy;lamp.data.shape='RECTANGLE';lamp.data.size=.8;lamp.data.size_y=.28;lamp.data.color=(1,.95,.88);lamp.parent=root
for x,y,z,energy in reading_lamps+teaching_lamps:
 bpy.ops.object.light_add(type='AREA',location=(x,y,z));lamp=bpy.context.object;lamp.data.energy=energy;lamp.data.shape='RECTANGLE';lamp.data.size=.95;lamp.data.size_y=.33;lamp.data.color=(1,.95,.88);lamp.parent=root
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=192;scene.cycles.use_denoising=False;scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('culture-gallery-overview',(-165,233,125),(-53,356,3),175,30),('culture-gallery-ground',(-47,302,1.85),(-47,409,2),None,24),('culture-west-stair',(-64.825,330.6,1.85),(-64.825,334.5,2.0),None,22),('culture-west-upper-join',(-57,330,5.05),(-49,330,5.0),None,24),('culture-north-stair',(-58.825,370.6,1.85),(-58.825,374.5,2.0),None,22),('culture-north-upper-join',(-57,380,5.05),(-49,380,5.0),None,24),('culture-west-upper-edge',(-56.5,344,5.05),(-54.6,368,4.6),None,25),('culture-reading-nook',(-57.0,340.5,5.05),(-63,348,4.1),None,24),('culture-reading-seated',(-64.8,348,4.57),(-60,348,4.1),None,26),('east-two-source-overview',(105,260,95),(-24,353,4),150,30),('east-two-court-passage',(10,355,1.85),(-48,355,1.9),None,24),('east-two-south-stair',(-34.825,330.6,1.85),(-34.825,334.5,2.0),None,22),('east-two-north-stair',(-32.975,378.6,5.05),(-34,383.0,4.4),None,22),('culture-west-pavilion-exterior',(-90,324,1.85),(-66,345,3),None,26),('culture-east-two-west-overview',(-150,310,55),(-40,355,3),150,30),('east-two-seminar-entry',(-31.5,378.25,1.85),(-23,378.25,1.7),None,24),('east-two-seminar-interior',(-20,384.7,1.85),(-24,377,1.5),None,24),('east-two-seminar-seated',(-24,374.6,1.39),(-24,385.8,1.8),None,28),('east-two-seminar-cabinet',(-21,380.8,1.65),(-19.5,383.5,.9),None,25),('east-two-court-west-seat',(-22,357,1.65),(-25,353,.8),None,25),('east-two-court-east-seat',(11,353,1.65),(8,357,.8),None,25)]
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
batches.clear();foliage_uv.clear();gc.collect()
for i,(name,eye,target,ortho,lens) in enumerate(views):
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'east-cultural-gallery.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('CULTURE INITIAL SPATIAL DRAFT, not accepted; upstairs access and adjoining buildings unfinished')
