"""Meng Minwei / information building B. Connected wings, two real courts and a source building passage.
Author-designed architectural detail; source identity/anchors remain unchanged.
"""
import sys,math,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf,shrub
from mengminwei_forum import gallery_geometry,build_forum
OUT=ROOT/'modeling/mengminwei-work';OUT.mkdir(exist_ok=True)
source_id='way/255623995';source=allshapes[source_id]
circle=Point(44.7,633).buffer(28.0,quad_segs=64)
outline=source.union(circle)
west_court=box(56,593,87,635).difference(circle.buffer(2.0))
east_court=box(105,595,142,637)
courts=west_court.union(east_court)
east=outline.intersection(box(87,550,180,680)).difference(courts)
west=outline.difference(east).difference(circle).difference(courts)
# Remove narrow boolean ribbons before deciding which facade is genuinely shared.
west=west.buffer(-.30,join_style=2).buffer(.30,join_style=2)
solid=east.union(west).union(circle)
print('MENGMINWEI DISPLAY','centroid offset',outline.centroid.distance(source.centroid),'boundary displacement',outline.boundary.hausdorff_distance(source.boundary),'source area',source.area,'display area',outline.area)
passage_id='way/479437312';passage_source=allshapes[passage_id]
passage_continuation=allshapes['way/479437311']
# The tunnel tag ends at an internal routing node; keep clearance along the connected road until outside the north wing.
passage_axis=LineString(list(passage_source.coords)+list(passage_continuation.coords)[1:])
passage_road=passage_axis.buffer(3.5,cap_style=2,join_style=1);passage_clear=passage_axis.buffer(5.0,cap_style=2,join_style=1)
clip=box(-8,540,184,687)
wet=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='water' and allshapes[f['id']].intersects(clip)]).union(allshapes['way/161418385'].buffer(3,cap_style=1,join_style=1)).intersection(clip)
mat('Meng warm plaster',(.68,.64,.54),0,.75);mat('Meng white',(.83,.80,.72),0,.52)
mat('Meng glazing',(.085,.105,.115),.42,.24);mat('Meng frame',(.26,.255,.23),.55,.38)
mat('Meng roof',(.61,.48,.33),.20,.65);mat('Meng paving',(.63,.60,.52),0,.85)
mat('Meng clear glass',(.75,.79,.79),.03,.09);M['Meng clear glass'].node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=.9
mat('Meng soil',(.17,.13,.085),0,.95);mat('Meng lawn',(.36,.40,.29),0,.95)
slab('Meng study ground','ground',clip.difference(wet.buffer(.35)),-1.5,1.5)
slab('Meng source stream','water',wet,-1.4,.5);slab('Meng stream banks','Meng warm plaster',wet.buffer(.35).difference(wet),-1.4,1.4)
slab('Meng ground floors','Meng paving',solid.difference(passage_clear),0,.15)
# Ground vehicle passage is genuinely open; upper connected floorplates remain overhead.
levels=[.15,4.5,7.6,10.7,13.8,16.9,20.0]
parts=[('East information wing',east,6,20.0),('West connected wing',west,5,16.9)]
entries=[('East main entrance',Vector((158.82,617)),Vector((0,1)),Vector((1,0)),6.0),('West court entrance',Vector((87,610)),Vector((0,1)),Vector((-1,0)),5.0),('North main entrance',Vector((122,654.29)),Vector((1,0)),Vector((0,1)),6.0)]
entries.extend([('Court west entrance',Vector((105,617)),Vector((0,1)),Vector((1,0)),4.0),('Court north entrance',Vector((123,637)),Vector((1,0)),Vector((0,-1)),4.0)])
for owner,foot,floors,height in parts:
 for z in levels[1:floors]:slab(owner+' floorplates','Meng white',foot,z-.20,.20)
 slab(owner+' structural roof','Meng white',foot,height-.25,.25)
 slab(owner+' warm roof surface','Meng roof',foot.buffer(-.12),height,.08)
 slab(owner+' restrained parapet','Meng white',foot.difference(foot.buffer(-.18)),height,.30)
 for poly in polygons(foot):
  for ring in [orient(poly,1).exterior,*orient(poly,1).interiors]:
   points=list(ring.coords)
   for a,b in zip(points,points[1:]):
    tangent=Vector(b)-Vector(a);length=tangent.length
    if length<.05:continue
    tangent.normalize();normal=Vector((tangent.y,-tangent.x));rotation=math.atan2(tangent.y,tangent.x);count=max(1,round(length/3.5));step=length/count
    for j in range(count):
     p=Vector(a)+tangent*(j+.5)*step
     for floor in range(floors):
      lo=levels[floor];hi=levels[floor+1];middle=(lo+hi)/2
      shared=(owner.startswith('East') and west.buffer(.06).contains(Point(*p)) and middle<16.9) or (owner.startswith('West') and east.buffer(.06).contains(Point(*p))) or circle.buffer(.05).contains(Point(*p))
      if shared:continue
      in_passage=floor==0 and passage_clear.buffer(step/2).contains(Point(*p))
      is_entry=floor==0 and any(abs((p-ep).dot(et))<ew/2+step/2 and abs((p-ep).dot(en))<.4 for _,ep,et,en,ew in entries)
      if in_passage or is_entry:continue
      frame_mat='Meng warm plaster' if owner.startswith('West') else 'Meng white'
      cube(owner+' facade piers',frame_mat,(*(p-tangent*(step/2)),middle),(.30,.32,hi-lo),rotation)
      cube(owner+' lower spandrels',frame_mat,(*(p+normal*.02),lo+.33),(step,.25,.65),rotation)
      cube(owner+' window panels','Meng glazing',(*(p+normal*.03),lo+.65+(hi-lo-.90)/2),(step-.30,.12,hi-lo-.90),rotation)
      cube(owner+' upper lintels',frame_mat,(*(p+normal*.02),hi-.10),(step,.28,.20),rotation)
      for off in [-step/2,0,step/2]:cube(owner+' window mullions','Meng frame',(*(p+tangent*off+normal*.11),lo+.65+(hi-lo-.90)/2),(.045,.16,hi-lo-.90),rotation)
      cube(owner+' glazing transoms','Meng frame',(*(p+normal*.12),middle+.3),(step-.30,.17,.045),rotation)
# The source building_passage stays below real floor beams, not through a solid wall.
passage_inside=passage_clear.intersection(solid)
for poly in polygons(passage_inside):
 for a,b in zip(list(poly.exterior.coords),list(poly.exterior.coords)[1:]):
  midpoint=Point((a[0]+b[0])/2,(a[1]+b[1])/2)
  if passage_axis.distance(midpoint)<4.8:continue
  line('Passage side retaining walls','Meng warm plaster',[a,b],.25,.15,3.85)
slab('Passage overhead structural beams','Meng white',passage_inside,4.15,.15)
# Slender ground columns at each portal flank, never in the car or walking lane.
for y in [580,590,636,648,652]:
 axis=passage_axis.interpolate(passage_axis.project(Point(77.7,y)));u=(Vector(passage_source.coords[-1])-Vector(passage_source.coords[0])).normalized();n=Vector((-u.y,u.x))
 for side in [-1,1]:
  q=Vector((axis.x,axis.y))+n*(side*5.15)
  if solid.buffer(.5).contains(Point(*q)):cube('Passage portal piers','Meng white',(*q,2.15),(.42,.42,4.0))
# Circular west forum: coherent curved glazing, real columns, flat terrace and an open central volume.
cx,cy=44.7,633;radius=28.0
for z in [4.5,10.7]:slab('Circular forum gallery floors','Meng white',gallery_geometry(z,circle),z-.22,.22)
slab('Circular forum roof','Meng white',circle,16.65,.25);slab('Circular forum warm terrace','Meng roof',circle.buffer(-.16),16.9,.08)
for j in range(128):
 t0=j*math.tau/128;t1=(j+1)*math.tau/128;tm=(t0+t1)/2
 p=(cx+radius*math.cos(t0),cy+radius*math.sin(t0));q=(cx+radius*math.cos(t1),cy+radius*math.sin(t1));mid=Point(cx+radius*math.cos(tm),cy+radius*math.sin(tm))
 if west.buffer(.08).contains(mid) or east.buffer(.08).contains(mid):continue
 entry=abs(math.atan2(math.sin(tm-math.pi),math.cos(tm-math.pi)))<.14
 for lo,hi in [(.15,4.5),(4.5,7.6),(7.6,10.7),(10.7,13.8),(13.8,16.9)]:
  if entry and lo<4:continue
  face('Circular forum glazing','Meng clear glass',[(*p,lo+.20),(*q,lo+.20),(*q,hi-.15),(*p,hi-.15)])
  beam('Circular forum mullions','Meng frame',(*p,lo+.2),(*p,hi-.15),.045,sides=6)
  beam('Circular forum transoms','Meng frame',(*p,(lo+hi)/2),(*q,(lo+hi)/2),.03,sides=6)
 for z in [.15,4.5,7.6,10.7,13.8,16.9]:
  if not (entry and z<4.5):line('Circular forum level bands','Meng white',[p,q],.20,z-.08,.16)
 # A terrace guard follows only the exposed roof edge; no rail across its wing connection.
 beam('Circular terrace handrail','Meng frame',(*p,18.05),(*q,18.05),.035,sides=6)
 beam('Circular terrace guard posts','Meng frame',(*p,16.98),(*p,18.05),.022,sides=6)
for j in range(24):
 t=j*math.tau/24;p=(cx+26.8*math.cos(t),cy+26.8*math.sin(t))
 if abs(math.atan2(math.sin(t-math.pi),math.cos(t-math.pi)))<.18:continue
 beam('Circular forum support columns','Meng white',(*p,.15),(*p,16.65),.18,sides=10)
for z in [4.5,10.7]:
 for j in range(96):
  t0=j*math.tau/96;t1=(j+1)*math.tau/96;p=(cx+19*math.cos(t0),cy+19*math.sin(t0));q=(cx+19*math.cos(t1),cy+19*math.sin(t1))
  beam('Forum gallery handrail','Meng frame',(*p,z+1.1),(*q,z+1.1),.035,sides=6)
  for k in range(12):
   a=t0+(t1-t0)*k/12;r=(cx+19*math.cos(a),cy+19*math.sin(a))
   beam('Forum gallery posts','Meng frame',(*r,z),(*r,z+1.1),.018,sides=6)
# Wing floors at the intermediate heights overlook the forum; guard those actual floor edges.
for j in range(256):
 a=j*math.tau/256;b=(j+1)*math.tau/256;mid=Point(cx+28*math.cos((a+b)/2),cy+28*math.sin((a+b)/2))
 if not west.buffer(.08).contains(mid):continue
 for z in [7.6,13.8]:
  p=(cx+28*math.cos(a),cy+28*math.sin(a));q=(cx+28*math.cos(b),cy+28*math.sin(b))
  beam('Wing forum overlook guards','Meng frame',(*p,z+1.1),(*q,z+1.1),.03,sides=6)
  for k in range(6):
   t=a+(b-a)*k/6;r=(cx+28*math.cos(t),cy+28*math.sin(t))
   beam('Wing forum overlook infill','Meng frame',(*r,z),(*r,z+1.1),.018,sides=6)
build_forum()
# Front and courtyard entries are recessed into actual facade openings.
for owner,p,t,n,width in entries:
 rot=math.atan2(t.y,t.x);door=p-n*.20
 if owner.startswith('Court'):
  for side in [-1,1]:
   hinge=door+t*(side*1.2);direction=-side*t*math.cos(math.radians(55))+n*math.sin(math.radians(55));centre=hinge+direction*.6
   angle=math.atan2(direction.y,direction.x)
   cube(owner+' opened door leaves','Meng clear glass',(*centre,1.50),(1.2,.08,2.7),angle)
   for end in [0,1.2]:
    q=hinge+direction*end;beam(owner+' leaf jambs','Meng frame',(*q,.15),(*q,2.85),.025,sides=6)
   for z in [.15,2.85]:beam(owner+' leaf rails','Meng frame',(*hinge,z),(*(hinge+direction*1.2),z),.025,sides=6)
   q=hinge+direction*1.0+n*.06;beam(owner+' leaf handles','bronze',(*q,1.1),(*q,1.75),.022,sides=8)
   q=door+t*(side*(1.2+width/2)/2);cube(owner+' fixed side glazing','Meng clear glass',(*q,2.05),(width/2-1.2,.10,3.8),rot)
  cube(owner+' door transom','Meng clear glass',(*door,3.40),(2.4,.10,1.10),rot)
  cube(owner+' door head','Meng frame',(*door,2.85),(2.4,.13,.055),rot)
 else:
  cube(owner+' glazing','Meng clear glass',(*door,2.05),(width,.14,3.8),rot)
 for off in ([-width/2,-1.2,1.2,width/2] if owner.startswith('Court') else [-width/2,-1.2,0,1.2,width/2]):cube(owner+' frames','Meng frame',(*(door+t*off+n*.08),2.05),(.055,.20,3.8),rot)
 if not owner.startswith('Court'):
  for off in [-.18,.18]:q=door+t*off+n*.15;beam(owner+' handles','bronze',(*q,1.1),(*q,1.8),.024,sides=8)
 # Side/transom glass closes any bay-size remainder; it does not cross the door leaves.
 for lo,hi in [(-width/2-3,-width/2),(width/2,width/2+3)]:
  q=door+t*((lo+hi)/2);cube(owner+' sidelights','Meng clear glass',(*q,2.05),(hi-lo,.10,3.8),rot)
 cube(owner+' transom','Meng clear glass',(*door,4.12),(width+6,.12,.34),rot)
 canopy=Polygon([tuple(p+t*x+n*y) for x,y in [(-width/2-1,-.5),(width/2+1,-.5),(width/2+1,2.5),(-width/2-1,2.5)]])
 slab(owner+' canopy','Meng white',canopy,4.10,.20)
# Circular west entrance is not a black mark on an otherwise closed cylinder.
entry_x=cx-radius+1.1
cube('Circular forum doors','Meng clear glass',(entry_x,cy,2.05),(.14,6.0,3.8))
for dy in [-3,-1.2,0,1.2,3]:cube('Circular forum doorframes','Meng frame',(entry_x-.08,cy+dy,2.05),(.20,.055,3.8))
for dy in [-.18,.18]:beam('Circular forum handles','bronze',(entry_x-.18,cy+dy,1.1),(entry_x-.18,cy+dy,1.8),.024,sides=8)
for ya,yb in [(cy-3.9,cy-3),(cy+3,cy+3.9)]:cube('Circular entry sidelights','Meng clear glass',(entry_x,(ya+yb)/2,2.05),(.12,yb-ya,3.8))
cube('Circular entrance transom','Meng clear glass',(entry_x,cy,4.225),(.12,7.8,.55))
for yy in [cy-3.9,cy+3.9]:cube('Circular entrance return jambs','Meng white',((cx-radius+entry_x)/2,yy,2.15),(entry_x-(cx-radius),.16,4.0))
slab('Circular entry threshold','Meng paving',box(cx-radius-.15,cy-3.8,entry_x,cy+3.8),0,.15)
slab('Circular entry canopy','Meng white',box(cx-radius-2,cy-4.0,entry_x+.2,cy+4),4.1,.20)
# True inner gardens, with a route through the west court left clear for the source passage.
configure_leaf_materials();pits=[]
for seed,(x,y,r) in enumerate([(62,600,2.6),(115,607,3.3),(132,625,3.3)],start=5100):
 bed=Point(x,y).buffer(r,quad_segs=32)
 if not courts.covers(bed) or bed.buffer(1).intersects(passage_clear):continue
 pits.append(bed);slab('Meng courtyard soil','Meng soil',bed,0,.12);slab('Meng courtyard edging','Meng white',bed.buffer(.10).difference(bed),0,.15)
 broadleaf(x,y,1.05 if seed==5100 else 1.15,seed=seed)
 for side in [-1,1]:
  for j in range(15):cube('Meng courtyard timber seats','wood',(x+side*(r+1.0),y+(j-7)*.13,.59),(.45,.115,.075))
  for dy in [-.7,.7]:
   for dx in [-.15,.15]:cube('Meng bench legs','Meng frame',(x+side*(r+1)+dx,y+dy,.35),(.05,.05,.40))
# Two low planting pockets leave a broad direct route between the courtyard doors.
for j,(x,y,rx,ry) in enumerate([(111,629,2.7,4.0),(135,603,2.8,3.8)]):
 bed=scale(Point(x,y).buffer(1,quad_segs=32),xfact=rx,yfact=ry,origin=(x,y))
 if not courts.covers(bed.buffer(.10)):continue
 pits.append(bed);slab('Meng low garden soil','Meng soil',bed,0,.12);slab('Meng low garden edging','Meng white',bed.buffer(.10).difference(bed),0,.15)
 for k,(dx,dy) in enumerate([(-.9,-1.5),(.8,-1.2),(-.8,.6),(.8,1.5),(0,0)]):shrub('Meng low garden shrubs',x+dx,y+dy,ground=.12,size=.75,seed=5300+j*10+k)
court_paving=courts.difference(unary_union([p.buffer(.10) for p in pits])).difference(passage_clear)
slab('Meng courtyard paving','Meng paving',court_paving,0,.15)
for x in range(56,143,2):slab('Meng flush courtyard joints','Meng warm plaster',box(x-.008,590,x+.008,640).intersection(court_paving),.151)
for y in range(594,638,2):slab('Meng flush courtyard joints','Meng warm plaster',box(54,y-.008,144,y+.008).intersection(court_paving),.151)
# Read-only source network: the tagged passage is retained even inside the building outline.
roads=[];walks=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p.get('kind')!='road' or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 walking=p.get('highway') in ['footway','path','pedestrian','steps'];surface=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.6 if walking else 3.5,cap_style=2,join_style=1)
 (walks if walking else roads).append(surface.intersection(clip))
road=unary_union(roads).difference(solid.difference(passage_clear)).difference(wet).intersection(clip)
walk=unary_union(walks).union(outline.buffer(7)).difference(outline).union(passage_clear.difference(passage_road)).difference(wet).difference(road).difference(court_paving).intersection(clip)
slab('Meng source roads and passage','road',road,0,.12);slab('Meng surrounding footpaths','Meng paving',walk,0,.15)
print('SOURCE PASSAGE',passage_id,'ground road preserved','underside nominal 4.15m, road .12m')
# Waiting benches belong to the connecting halls, outside the courtyard-to-entry walking line.
for x,y,angle in [(96,602,0),(96,629,0),(132,646,math.pi/2)]:
 for k in range(5):cube('Meng hall bench timber','wood',(x-(k-2)*.11*math.sin(angle),y+(k-2)*.11*math.cos(angle),.60),(2.8,.095,.07),angle)
 for dx in [-1.05,1.05]:
  for dy in [-.18,.18]:
   xx=x+dx*math.cos(angle)-dy*math.sin(angle);yy=y+dx*math.sin(angle)+dy*math.cos(angle)
   beam('Meng hall bench legs','Meng frame',(xx,yy,.15),(xx,yy,.57),.035,sides=8)
# Meshes retain editable geometric detail and packed foliage UVs.
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  layer=mesh.uv_layers.new(name='Leaf albedo UV')
  for poly,uvs in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for loop,uv in zip(poly.loop_indices,uvs):layer.data[loop].uv=uv
 ob=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(M[material]);ob['designRole']=owner
root=bpy.data.objects.new('Meng Minwei B — connected authored work draft',None);bpy.context.collection.objects.link(root);root['sourceFeatureIds']=[source_id,passage_id,'way/479437311'];root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['sourceGeometryUnchanged']=True;root['status']='WORK_IN_PROGRESS';root['displayFootprint']=outline.wkt;root['displayWalk']=walk.wkt;root['passageRoad']=passage_road.wkt
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':ob.parent=root
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py'),('FORUM_RECIPE.py',Path(__file__).parent/'mengminwei_forum.py')]:bpy.data.texts.new(name).write(path.read_text())
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
world=bpy.data.worlds.new('Meng daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.45,-.35,-.6);sun.data.energy=2.5;sun.data.angle=.16
# Actual portal lighting under the connected wings.
mat('Meng diffuser',(.95,.92,.83),0,.4);shader=M['Meng diffuser'].node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(1,.95,.85,1);shader.inputs['Emission Strength'].default_value=4
for x,y,z in [(77.4,582,4.05),(77.5,589,4.05),(77.85,636.2,4.05),(77.95,646,4.05),(78.0,651,4.05),(121,650,3.85),(155.8,617,3.85),(106.3,617,3.85),(123,635.7,3.85),(91,610,3.95),(96,613,3.95),(101,617,3.95),(123,641,3.95),(123,646,3.95),(123,651,3.95)]:
 if x<90 and not passage_inside.buffer(-.1).covers(Point(x,y)):continue
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));ob=bpy.context.object;ob.name='Meng entry luminaire';ob.dimensions=(1.0,.40,.04);ob.data.materials.append(M['Meng diffuser']);ob.parent=root
 roof_z=4.15 if passage_inside.covers(Point(x,y)) else (4.3 if solid.covers(Point(x,y)) else 4.1)
 if roof_z>z+.025:
  bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=.018,depth=roof_z-z-.02,location=(x,y,(roof_z+z+.02)/2));mount=bpy.context.object;mount.name='Meng fixture ceiling stem';mount.data.materials.append(M['Meng frame']);mount.parent=root
 bpy.ops.object.light_add(type='AREA',location=(x,y,z-.04));ob=bpy.context.object;ob.name='Meng entry downlight';ob.data.energy=420 if z==3.95 else 220;ob.data.shape='RECTANGLE';ob.data.size=.95;ob.data.size_y=.35;ob.data.color=(1,.95,.88);ob.parent=root
for title,position,rotation in [('蒙民伟楼',(159.05,617,3.78),(math.pi/2,0,math.pi/2)),('图书信息 B 楼',(122,654.5,3.78),(math.pi/2,0,math.pi))]:
 bpy.ops.object.text_add(location=position,rotation=rotation);ob=bpy.context.object;ob.name='Meng building entrance identity';ob.data.body=title;ob.data.align_x='CENTER';ob.data.size=.29;ob.data.extrude=.004;ob.data.font=bpy.data.fonts.load('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');ob.data.materials.append(M['bronze']);bpy.ops.object.convert(target='MESH');ob.parent=root
# Suspended forum fixtures hang from the real truss nodes.
for j in range(8):
 a=j*math.tau/8;x=cx+10*math.cos(a);y=cy+10*math.sin(a)
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.015,depth=2.2,location=(x,y,14.10));ob=bpy.context.object;ob.name='Forum pendant suspension';ob.data.materials.append(M['Meng frame']);ob.parent=root
 bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.65,depth=.08,location=(x,y,12.96));ob=bpy.context.object;ob.name='Forum pendant diffuser';ob.data.materials.append(M['Meng diffuser']);ob.parent=root
 bpy.ops.object.light_add(type='AREA',location=(x,y,12.90));ob=bpy.context.object;ob.name='Forum pendant light';ob.data.energy=1100;ob.data.shape='DISK';ob.data.size=1.25;ob.data.color=(1,.95,.88);ob.parent=root
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),64);scene.cycles.use_denoising=False;scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('meng-overview',(220,470,190),(87,612,7),210,32),('meng-through-passage',(77.3,574,1.85),(77.8,639,2.0),None,28),('meng-east-court',(110,599,1.85),(134,628,4),None,24),('meng-circular-entry',(10,632,1.85),(25,633,3),None,24),('meng-east-entry',(176,617,1.85),(157,617,3),None,26)]
views.append(('meng-passage-return',(78.0,660,1.85),(77.3,575,1.85),None,28))
views.extend([('meng-court-link-hall',(100,617,1.85),(88,610,1.85),None,24),('meng-court-west-arrival',(111,617,1.85),(104,617,1.85),None,24),('meng-court-north-arrival',(123,630,1.85),(123,639,1.85),None,24),('meng-forum-interior',(23,632,1.85),(48,633,7),None,20),('meng-forum-stair',(39,620,1.85),(40,610,4),None,22),('meng-forum-gallery',(52,611,6.2),(44,633,6),None,22)])
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
import gc
batches.clear();foliage_uv.clear();gc.collect()
for i,(name,eye,target,ortho,lens) in enumerate(views):
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mengminwei-b.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--interior-samples=')),128) if name=='meng-forum-interior' else next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),64)
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('MENG MINWEI INITIAL DRAFT — NOT ACCEPTED; ALL APPROACHES AND INTERIORS STILL REQUIRE REVIEW')
