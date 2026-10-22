"""A single, deliberately authored agricultural / biosystems precinct.
Observed connections and source geometry are separate from designed facade detail.
No routing facts are changed. This is a work-in-progress scene, not acceptance.
"""
import sys, math, json, random
import hashlib
from pathlib import Path
from datetime import datetime, timezone
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import configure_leaf_materials,foliage_uv,textured_leaf,willow,broadleaf
from shapely.ops import nearest_points
from agriculture_interior import build_d_stair,build_connection_lights,build_west_corridor,build_a_stair,build_b_stair,build_a_arrival_rooms,build_b_arrival_corridor,stair_opening,CONNECTION_AXES
INCLUDE_A='--include-a' in sys.argv
OUT=ROOT/'modeling'/('agriculture-a-work' if INCLUDE_A else 'compound-work');OUT.mkdir(exist_ok=True)
random.seed(20261020)
build_recipe=Path(__file__).read_text()
support_recipe=(Path(__file__).parent/'architecture_primitives.py').read_text()
landscape_recipe=(Path(__file__).parent/'landscape_primitives.py').read_text()
build_script_sha256=hashlib.sha256(build_recipe.encode()).hexdigest()
support_script_sha256=hashlib.sha256(support_recipe.encode()).hexdigest()
ids=['way/411343678','way/504974811','way/504974812','way/504974813','way/504974815','way/504974816','way/504974817']
all_source_ids=ids+(['way/504974789'] if INCLUDE_A else [])
raw={i:allshapes[i].buffer(0) for i in ids}
west=raw['way/411343678'].simplify(.6,preserve_topology=True)
d_body=unary_union([raw[i] for i in ids[-3:]]).simplify(.45,preserve_topology=True)
south=unary_union([raw[i] for i in ids[1:4]]).simplify(.45,preserve_topology=True)
# These original polygons share sides. Do not replace only one of them and break the ensemble.
assert d_body.geom_type=='Polygon' and south.geom_type=='Polygon'
link=Polygon([(28.8,-.65),(29.0,19.0),(58.2,21.0),(60.0,1.6)])
# Join the whole local interface, not a narrow plug that leaves an implausible slit.
# This bounded transition is authored display geometry; source footprints stay intact.
join_zone=box(176,-1,214,18)
east_joint=unary_union([south.intersection(join_zone),d_body.intersection(join_zone)]).convex_hull
clip=box(-100,-310 if INCLUDE_A else -180,285,170)
south=unary_union([south,east_joint]).difference(d_body)
a_body=allshapes['way/504974789'].buffer(0).simplify(.45,preserve_topology=True) if INCLUDE_A else Polygon()
a_north_link=Polygon([(180,-94),(200,-97),(214,-153),(196,-153)])
footprints=unary_union([west,d_body,south,a_body])
# Existing pedestrian traces cross these wings. Their precise architectural treatment
# is uncertain in the reference: use designed covered passages, never erase the trace.
passage_ids=['way/411343624','way/504974718','way/504974808']
def extend_display_passage(g):
 coords=list(g.coords);first=Vector(coords[0]);second=Vector(coords[1]);last=Vector(coords[-1]);before=Vector(coords[-2])
 coords[0]=tuple(first+(first-second).normalized()*3)
 coords[-1]=tuple(last+(last-before).normalized()*3)
 return LineString(coords)
passage_lines={i:extend_display_passage(allshapes[i]) for i in passage_ids}
ped_passages=unary_union([g.buffer(1.8,cap_style=2,join_style=2) for g in passage_lines.values()])
passage_cuts=ped_passages.intersection(footprints)
gallery_edge=LineString([(114.0,10.5),(138.6,62.6)])
gallery=gallery_edge.buffer(-2.7,single_sided=True,cap_style=2).difference(footprints.buffer(.03))
mat('warm_stone',(.65,.60,.51),0,.7)
mat('facade_white',(.85,.81,.73),0,.42)
mat('roof_zinc',(.16,.18,.18),.25,.50)
mat('window',(.075,.085,.09),.40,.21)
mat('pale_paving',(.69,.64,.54),0,.78)
mat('bronze_dark',(.22,.16,.09),.6,.32)
mat('water_deep',(.12,.27,.29),.45,.18)
mat('willow',(.25,.34,.17),0,.8)
mat('willow_light',(.40,.46,.25),0,.78)
mat('grass',(.19,.24,.12),0,.85)
mat('stone_dark',(.28,.30,.28),0,.85)
mat('skin',(.55,.40,.29),0,.8)
mat('canopy_olive',(.09,.15,.055),0,.85)
mat('canopy_gold',(.32,.26,.10),0,.83)
mat('groundcover',(.22,.28,.105),0,.85)
mat('passage_light',(.90,.72,.43),0,.35)
configure_leaf_materials()
light_bsdf=M['passage_light'].node_tree.nodes.get('Principled BSDF')
light_bsdf.inputs['Emission Color'].default_value=(1.0,.78,.49,1)
light_bsdf.inputs['Emission Strength'].default_value=4.0
entrances=[(87,5.2,math.radians(6),5.6),(100,-70.06,math.radians(180.96),4.8),(20,-17,math.pi/2,4.8)]
if INCLUDE_A:
 entrances.extend([(170.1579,-165.121,math.pi,6.4),(183.8155,-251.6166,math.radians(-.6),5.0),(188,-180.8505,0,6.0)])
entrance_voids=unary_union([translate(rotate(box(-w/2-.15,-1,w/2+.15,1.9),math.degrees(a),origin=(0,0)),x,y) for x,y,a,w in entrances])

# Floor plates are owned once at each elevation, including the shared bridge joins.
floor_regions={}
stair_openings=unary_union([stair_opening((92,11)),stair_opening((16,-19),math.pi/2)]+([stair_opening((177.8,-169.5),math.pi)] if INCLUDE_A else []))
def body(owner,poly,base,floors,bridge=False):
 top=base+floors*3.8
 shell=poly.difference(poly.buffer(-.30))
 bays=[]
 for pp in polygons(poly):
  pp=orient(pp,1)
  for ring in [pp.exterior,*pp.interiors]:
   coords=list(ring.coords)
   for a,b in zip(coords,coords[1:]):
    dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
    if length<2:continue
    tx,ty=dx/length,dy/length;nx,ny=ty,-tx;ang=math.atan2(dy,dx)
    count=max(1,int((length-.9)/3.3));step=(length-.9)/count
    for bay in range(count):
     t=.45+(bay+.5)*step;x,y=a[0]+tx*t,a[1]+ty*t;w=max(.5,min(2.7,step-.42))
     bays.append((x,y,nx,ny,ang,w))
 windows=unary_union([translate(rotate(box(-w/2,-.65,w/2,.65),math.degrees(ang),origin=(0,0)),x,y) for x,y,nx,ny,ang,w in bays])
 for floor in range(floors):
  lo=base+floor*3.8;hi=lo+3.8;key=round(lo,4)
  plate=poly.difference(floor_regions.get(key,Polygon()))
  floor_regions[key]=unary_union([floor_regions.get(key,Polygon()),poly])
  if lo>.2:plate=plate.difference(stair_openings)
  if floor==0 and base<1:
   slab(owner+' grounded floor','warm_stone',plate.difference(ped_passages).difference(entrance_voids),-.08,base+.08)
   slab(owner+' recessed entry floors','pale_paving',plate.intersection(entrance_voids),-.02,.17)
  else:slab(owner+' actual floor slabs','facade_white',plate,lo-.20,.20)
  neighbours=unary_union([g.buffer(.025) for name,g,z,n in building_volumes if name!=owner and z<=lo+.5<z+n*3.8])
  wall=shell.difference(neighbours)
  if floor==0 and base<1:wall=wall.difference(ped_passages).difference(entrance_voids)
  slab(owner+' actual sill walls','warm_stone',wall,lo,.91)
  slab(owner+' actual window piers','warm_stone',wall.difference(windows),lo+.91,2.22)
  slab(owner+' actual head walls','warm_stone',wall,lo+3.13,.47)
  for x,y,nx,ny,ang,w in bays:
   if neighbours.covers(Point(x,y)):continue
   if floor==0 and base<1 and (entrance_voids.buffer(w/2+.15).contains(Point(x,y)) or ped_passages.buffer(w/2+.2).contains(Point(x,y))):continue
   z=lo+2.02;clear=bridge or (owner.startswith('D/C') and 78<x<101 and y<13) or (owner.startswith('B —') and x>13) or (owner.startswith('A —') and (y>-167 or (163<x<172 and -182<y<-179)))
   if not clear:cube(owner,'shadow',(x+nx*.025,y+ny*.025,z),(w+.18,.10,2.48),ang)
   cube(owner,'interior clear glazing' if clear else 'window',(x+nx*.09,y+ny*.09,z),(w,.12,2.22),ang)
   cube(owner,'facade_white',(x+nx*.22,y+ny*.22,z-1.21),(w+.32,.42,.14),ang)
   cube(owner,'facade_white',(x+nx*.18,y+ny*.18,z+1.21),(w+.32,.34,.14),ang)
   cube(owner,'bronze_dark',(x+nx*.17,y+ny*.17,z),(.055,.16,2.23),ang)
   cube(owner,'bronze_dark',(x+nx*.17,y+ny*.17,z+.61),(w,.14,.055),ang)
  if floor>0:slab(owner+' external floor bands','facade_white',poly.buffer(.11,join_style=2).difference(poly).difference(neighbours),lo,.14)
 blocked_roof=unary_union([g for name,g,z,n in building_volumes if name!=owner and z<=top<z+n*3.8])
 slab(owner+' actual roof slab','facade_white',poly.buffer(.18,join_style=2).difference(blocked_roof),top-.20,.44)
 slab(owner,'roof_zinc',poly.buffer(-.40,join_style=2).difference(blocked_roof),top+.25,.04)
 rim=poly.buffer(.12,join_style=2).difference(poly.buffer(-.24,join_style=2)).difference(blocked_roof)
 slab(owner,'facade_white',rim,top+.24,.44)
 if owner=='A — agricultural courtyard':
  for pp in polygons(poly):
   for ring in [orient(pp,1).exterior,*orient(pp,1).interiors]:
    coords=list(ring.coords)
    for a,b in zip(coords,coords[1:]):
     dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
     if length<=12:continue
     tx,ty=dx/length,dy/length;nx,ny=ty,-tx;count=max(1,int((length-.9)/3.3));step=(length-.9)/count;ang=math.atan2(dy,dx)
     for bay in range(0,count+1,2):
      t=.45+bay*step;x,y=a[0]+tx*t,a[1]+ty*t
      cube(owner+' vertical screens','bronze_dark',(x+nx*.32,y+ny*.32,(top+base+4.1)/2),(.10,.38,top-base-4.3),ang)
 if bridge:
  for pp in polygons(poly):
   for a,b in zip(pp.exterior.coords,list(pp.exterior.coords)[1:]):
    if math.dist(a,b)>25:line(owner,'bronze_dark',[a,b],.20,base-.45,.45)
 return top

east_ensemble=unary_union([d_body,south])
building_volumes=[('D/C — continuous east academic ensemble',east_ensemble,.15,6),('B — west wing',west,.15,6),('West — elevated cross-road connection',link,7.75,3)]
if INCLUDE_A:building_volumes.extend([('A — agricultural courtyard',a_body,.15,6),('A/C — elevated road crossing',a_north_link,7.75,3)])
mat('interior clear glazing',(.72,.77,.78),.03,.10);M['interior clear glazing'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.92
for name,g,z,n in building_volumes:body(name,g,z,n,z>1)
if INCLUDE_A:
 for x,y in [(195,-131.8591),(204,-131.8132)]:
  cube('A/C — median support piers','warm_stone',(x,y,3.835),(1.1,1.1,7.83))
  cube('A/C — pier capitals','facade_white',(x,y,7.48),(2.3,1.5,.55))

interior_lamps=build_d_stair(east_ensemble)+build_b_stair(west)+build_b_arrival_corridor(west)+build_connection_lights(unary_union([g for name,g,z,n in building_volumes]))+build_west_corridor(link)
if INCLUDE_A:interior_lamps+=build_a_stair(a_body)+build_a_arrival_rooms(a_body)

# An authored courtyard gallery gives the long facade a sheltered human-scale base.
# It is a design addition, not a claim about the real building.
slab('D courtyard gallery — canopy','facade_white',gallery,3.52,.16)
gallery_outer=gallery_edge.offset_curve(-2.50)
line('D courtyard gallery — edge beam','bronze_dark',list(gallery_outer.coords),.12,3.32,.20)
for d in range(0,int(gallery_outer.length),6):
 q=gallery_outer.interpolate(d+.5)
 if not footprints.buffer(.2).contains(q):
  cube('D courtyard gallery — columns','bronze_dark',(q.x,q.y,1.83),(.14,.14,3.38))
for d in range(1,int(gallery_edge.length)):
 p=gallery_edge.interpolate(d);q=gallery_edge.interpolate(min(d+.1,gallery_edge.length))
 angle=math.atan2(q.y-p.y,q.x-p.x);nx,ny=math.sin(angle),-math.cos(angle)
 cube('D courtyard gallery — soffit ribs','wood',(p.x+nx*1.35,p.y+ny*1.35,3.46),(.075,2.55,.10),angle)

# Warm slatted soffits and continuous recessed light make the designed passages
# read as inhabitable covered circulation, rather than accidental holes in a mass.
slab('Covered passages — soffit backing','bronze_dark',passage_cuts.buffer(-.12),3.59,.045)
for fid in passage_ids:
 sections=passage_lines[fid].intersection(footprints)
 for section in ([sections] if sections.geom_type=='LineString' else getattr(sections,'geoms',[])):
  if section.geom_type!='LineString' or section.length<1:continue
  for d in range(int(section.length/.48)):
   q=section.interpolate((d+.5)*.48);p=section.interpolate(max(0,(d+.5)*.48-.1));r=section.interpolate(min(section.length,(d+.5)*.48+.1))
   angle=math.atan2(r.y-p.y,r.x-p.x)
   cube(fid+' ceiling slats','wood',(q.x,q.y,3.55),(.07,3.25,.09),angle)
  for side in [-1,1]:
   rail=section.offset_curve(side*1.40)
   if rail.geom_type=='LineString':
    line(fid+' recessed ceiling light','passage_light',list(rail.coords),.055,3.49,.025)

# A source-shaped roof lantern for the west wing, not an arbitrary repeated rooftop box.
rooflight=Polygon([(-22,0),(-12,1),(-9,11),(-19,10)]).intersection(west.buffer(-1))
slab('B rooflight','facade_white',rooflight,23.0,.35)
slab('B rooflight','window',rooflight.buffer(-.3),23.36,1.15)

# Hydraulic continuity includes both recorded culverts. Their roofs cover flowing water.
streams=[];culverts=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p['kind']!='waterway' or not g.intersects(clip):continue
 # Soften only the southern visible bend, retaining original channel endpoints
 # and the untouched factual source. Maximum local rounding radius is 4 m.
 if INCLUDE_A and f['id']=='way/288875636':
  coords=list(g.coords);rounded=[coords[0]]
  for before,corner,after in zip(coords,coords[1:],coords[2:]):
   if corner[1]>-280:rounded.append(corner);continue
   a,b,c=Vector(before),Vector(corner),Vector(after)
   radius=min(4.0,(b-a).length*.22,(c-b).length*.22)
   enter=b+(a-b).normalized()*radius;leave=b+(c-b).normalized()*radius
   rounded.extend([tuple(enter*(1-t)**2+b*(2*(1-t)*t)+leave*t*t) for t in [i/12 for i in range(13)]])
  rounded.append(coords[-1]);g=LineString(rounded)
 channel=g.buffer(2.9,cap_style=1,join_style=1)
 streams.append(channel)
 if p.get('tunnel')=='culvert':culverts.append((f['id'],g,channel))
wet=unary_union(streams).intersection(clip)
slab('Terrain','ground',clip.difference(wet),-1.6,1.6)
slab('Water — river bed','stone_dark',wet,-1.65,.15)
slab('Water — continuous channel','water_deep',wet,-1.50,.755)
slab('Water — bank cap','warm_stone',wet.buffer(.65).difference(wet).intersection(clip),-.01,.18)
# The banks descend to the bed. A dark hole isn't painted on a flat surface.
slab('Water — retaining sides','warm_stone',wet.buffer(.32).difference(wet).intersection(clip),-1.5,1.5)
for fid,g,channel in culverts:
 slab(fid+' cover','ground',g.buffer(3.2,cap_style=2,join_style=1),-.16,.20)
 coords=list(g.coords)
 for mouth,inside in [(coords[0],coords[1]),(coords[-1],coords[-2])]:
  x,y=mouth;dx,dy=inside[0]-x,inside[1]-y;ang=math.atan2(dy,dx)+math.pi/2
  # 4.8 m clear width, water continuing below a load-bearing cap.
  for t in [-2.85,2.85]:
   xx=x+math.cos(ang)*t;yy=y+math.sin(ang)*t
   cube(fid+' mouth','warm_stone',(xx,yy,-.65),(.85,.9,1.7),ang)
  cube(fid+' lintel','facade_white',(x,y,.02),(6.6,1.0,.28),ang)
  # Side markers stand on the bank, not across the flowing opening.
  for t in [-3.35,3.35]:
   cube(fid+' bank','warm_stone',(x+math.cos(ang)*t,y+math.sin(ang)*t,.22),(.45,.6,.45),ang)

roads=[];walks=[];road_lines=[]
for f in features:
 p=f['properties'];g=allshapes[f['id']]
 if p['kind']!='road' or not g.intersects(clip) or p.get('tunnel') in ['yes','culvert']:continue
 hw=p.get('highway');iswalk=hw in ['footway','path','pedestrian','steps','cycleway']
 width=2.4 if iswalk else (11 if p.get('name')=='藕舫路' else 6.0)
 if p.get('service')=='parking_aisle':width=3.5
 surf=g.buffer(width/2,cap_style=1,join_style=1) if g.geom_type=='LineString' else g
 (walks if iswalk else roads).append(surf)
 if p.get('name')=='藕舫路' and g.geom_type=='LineString':road_lines.append(g)
road=unary_union(roads).intersection(clip).difference(footprints)
walk=unary_union(walks).intersection(clip).difference(footprints.difference(ped_passages))
slab('Street — continuous paving','edge',road.buffer(.6).difference(wet),-.02,.13)
slab('Street — carriageway','road',road.difference(wet),.10,.065)
pedestrian_pieces=[walk,gallery,ped_passages.intersection(footprints)]
for fid in passage_ids:
 sections=passage_lines[fid].intersection(footprints)
 for section in ([sections] if sections.geom_type=='LineString' else getattr(sections,'geoms',[])):
  if section.geom_type!='LineString' or section.length<1:continue
  coords=list(section.coords)
  for mouth,inside in [(coords[0],coords[1]),(coords[-1],coords[-2])]:
   q=Vector(mouth);direction=(q-Vector(inside)).normalized();normal=Vector((-direction.y,direction.x));far=q+direction*3
   apron=Polygon([tuple(q-normal*1.8),tuple(q+normal*1.8),tuple(far+normal*1.2),tuple(far-normal*1.2)])
   pedestrian_pieces.append(apron.difference(footprints))
# A low planted bank behind the stone edge, kept clear of paths and road crossings.
bank_garden=wet.buffer(3.0).difference(wet.buffer(.75)).intersection(clip).difference(road.buffer(.7)).difference(walk.buffer(.3)).difference(footprints.buffer(1))
slab('Riverbank planting','grass',bank_garden,-.02,.067)
# Keep the road surface on top of the culvert roof; a culvert is not a broken road.
for fid,g,channel in culverts:
 slab(fid+' road deck','road',road.intersection(channel.buffer(.65)),.035,.13)
 slab(fid+' path deck','pale_paving',walk.intersection(channel.buffer(.65)).difference(road),.035,.105)
for fid,width in [('way/411343575',6.0),('way/411343600',2.4)]:
 g=allshapes[fid];deck=g.buffer(width/2+.2,cap_style=2,join_style=1)
 slab(fid+' deck','facade_white',deck,.12,.22)
 slab(fid+' surface','pale_paving',g.buffer(width/2,cap_style=2),.34,.045)
 for side in [-1,1]:
  rail=g.offset_curve(side*(width/2+.06))
  if rail.geom_type=='LineString':
   line(fid+' rail','bronze_dark',list(rail.coords),.065,1.48,.065)
   line(fid+' lower rail','bronze_dark',list(rail.coords),.045,.58,.045)
   for d in range(0,int(rail.length)+1,2):
    q=rail.interpolate(d);beam(fid+' posts','bronze_dark',(q.x,q.y,.38),(q.x,q.y,1.51),.035)
   for d in range(1,int(rail.length*8)):
    q=rail.interpolate(d/8);beam(fid+' infill','bronze_dark',(q.x,q.y,.60),(q.x,q.y,1.48),.013,sides=5)
 coords=list(g.coords)
 for end,inside in [(coords[0],coords[1]),(coords[-1],coords[-2])]:
  u=(Vector(end)-Vector(inside)).normalized();n=Vector((-u.y,u.x))*(width/2+.2);e=Vector(end);far=e+u*2
  landing=.14 if width<3 else .165
  corners=[(e.x-n.x,e.y-n.y,.385),(e.x+n.x,e.y+n.y,.385),(far.x+n.x,far.y+n.y,landing),(far.x-n.x,far.y-n.y,landing)]
  corners.reverse()
  face(fid+' ramp','pale_paving',corners)
  # Close the ramp sides and underside: no paper-thin floating triangle.
  bottom=[(p[0],p[1],-.02) for p in corners]
  face(fid+' ramp','facade_white',list(reversed(bottom)))
  for j in range(4):
   k=(j+1)%4
   face(fid+' ramp','facade_white',[corners[j],bottom[j],bottom[k],corners[k]])
  for sign in [-1,1]:
   offset=n.normalized()*sign*(width/2+.06)
   p=e+offset;q=far+offset
   beam(fid+' sloped handrail','bronze_dark',(p.x,p.y,1.51),(q.x,q.y,landing+1.125),.033)
   beam(fid+' ramp endpost','bronze_dark',(q.x,q.y,landing),(q.x,q.y,landing+1.125),.035)
# A restrained lane guide along the existing main street, no invented route connection.
for g in road_lines:
 for d in range(0,int(g.length),9):
  a=g.interpolate(d);b=g.interpolate(min(d+3.5,g.length))
  mark=LineString([a,b]).buffer(.055,cap_style=2).intersection(road)
  slab('Street markings','mark',mark,.169,.007)

# The principal garden is composed as one connected place, not a scatter of filler trees.
plaza_segments=[[(75,-36),(87,5)],[(75,-36),(20,-17)],[(75,-36),(100,-70.06)],[(75,-36),(174,-28)]]
def garden_curve(a,control,b):
 return LineString([((1-t)**2*a[0]+2*(1-t)*t*control[0]+t*t*b[0],(1-t)**2*a[1]+2*(1-t)*t*control[1]+t*t*b[1]) for t in [i/32 for i in range(33)]])
garden_controls=[(81,-16),(48,-35),(97,-49),(124,-39)]
plaza=unary_union([garden_curve(p[0],c,p[1]).buffer(2.2,cap_style=1,join_style=1) for p,c in zip(plaza_segments,garden_controls)]).buffer(1.2).buffer(-1.2)
inner_garden_loop=LineString([(155+13*math.cos(i*math.tau/96),31+20*math.sin(i*math.tau/96)) for i in range(97)])
inner_garden_link=garden_curve((150,-31),(140,-3),(155,11))
plaza=unary_union([plaza,inner_garden_loop.buffer(1.35),inner_garden_link.buffer(1.5)])
gallery_start=gallery_outer.interpolate(0);gallery_end=gallery_outer.interpolate(gallery_outer.length)
gallery_target=inner_garden_link.interpolate(inner_garden_link.length*.40)
gallery_links=[
 garden_curve((gallery_start.x,gallery_start.y),(126,-1),(gallery_target.x,gallery_target.y)),
 garden_curve((gallery_end.x,gallery_end.y),(150,55),(161.52,58))]
plaza=unary_union([plaza,*[g.buffer(1.25) for g in gallery_links]])
if INCLUDE_A:
 # A quieter west-side garden gallery, distinct from the D entrance treatment.
 a_gallery=box(162.89,-229.5,166.2,-182.0).difference(footprints)
 slab('A garden gallery — canopy','facade_white',a_gallery,3.45,.16)
 for y in [-226,-218,-210,-202,-194,-186]:
  cube('A garden gallery — columns','bronze_dark',(165.95,y,1.79),(.12,.12,3.30))
  cube('A garden gallery — crossbeams','bronze_dark',(164.52,y,3.36),(3.1,.12,.16))
 for i in range(94):
  cube('A garden gallery — timber ribs','wood',(164.5,-229+i*.50,3.36),(3.10,.055,.12))
 pedestrian_pieces.append(a_gallery)
 a_loop=box(176,-222,203,-193).buffer(3).boundary
 a_routes=[
  LineString([(170.1579,-155.425),(170,-145),(220,-145),(221,-203),(188,-205),(188,-182)]),
  LineString([(170.1579,-155.425),(138,-155),(138,-261),(183.556,-264.686)]),
  LineString([(170,-145),nearest_points(walk,Point(170,-145))[0].coords[0]]),
  LineString([(164.5,-183),(174,-183),(188,-182)]),
  LineString([(164.5,-229),(175,-229),(176,-225)])]
 plaza=unary_union([plaza,a_loop.buffer(1.25),*[g.buffer(1.6,cap_style=1,join_style=1) for g in a_routes]])
plaza=plaza.difference(footprints).difference(road).difference(wet)
pedestrian_pieces.append(plaza)
lawn_envelope=box(5,-285 if INCLUDE_A else -108,235 if INCLUDE_A else 211,54)
if INCLUDE_A:lawn_envelope=lawn_envelope.union(box(120,-310,247,-145))
open_space=lawn_envelope.difference(footprints.buffer(1)).difference(road.buffer(.9)).difference(walk.buffer(.6)).difference(plaza.buffer(.5)).difference(wet.buffer(1))
slab('Courtyard lawns','grass',open_space,-.02,.07)

crossing=garden_curve(plaza_segments[1][0],garden_controls[1],plaza_segments[1][1]).intersection(road)
for section in ([crossing] if crossing.geom_type=='LineString' else getattr(crossing,'geoms',[])):
 if section.geom_type!='LineString' or section.length<1:continue
 a,b=section.coords[0],section.coords[-1];theta=math.atan2(b[1]-a[1],b[0]-a[0])
 for d in range(0,int(section.length*2)):
  q=section.interpolate(d*.5)
  stripe=translate(rotate(box(-.13,-1.8,.13,1.8),math.degrees(theta),origin=(0,0)),q.x,q.y).intersection(road)
  slab('Courtyard crossing — illustrative markings','mark',stripe,.17,.007)
# Ground-floor portals at deliberate courtyard-facing locations.
def portal(owner,x,y,angle,width=5.6):
 open_entry=owner in ['D courtyard entrance','A entrance 1','B street entrance']
 nx,ny=math.sin(angle),-math.cos(angle)
 # Doors sit inside the actual cut-back vestibule, not over a solid facade.
 dx,dy=x-nx*1.65,y-ny*1.65
 if open_entry:
  tx,ty=math.cos(angle),math.sin(angle);inward=Vector((-nx,-ny));tangent=Vector((tx,ty))
  for left,right in [(-width/2,-1.05),(1.05,width/2)]:
   mid=(left+right)/2;cube(owner+' fixed side glazing','interior clear glazing',(dx+tx*mid,dy+ty*mid,1.85),(right-left,.12,3.40),angle)
  cube(owner+' upper transom','interior clear glazing',(dx,dy,3.10),(2.10,.12,.90),angle)
  for side in [-1,1]:
   hinge=Vector((dx,dy))+tangent*(side*1.025);direction=tangent*(-side*math.cos(math.radians(80)))+inward*math.sin(math.radians(80));p=hinge+direction*.5125;rot=math.atan2(direction.y,direction.x)
   cube(owner+' open door leaves','interior clear glazing',(*p,1.40),(1.025,.08,2.46),rot)
   for end in [0,1.025]:
    q=hinge+direction*end;beam(owner+' open door stiles','bronze_dark',(*q,.17),(*q,2.63),.025,sides=8)
   for z in [.17,2.63]:beam(owner+' open door rails','bronze_dark',(*hinge,z),(*(hinge+direction*1.025),z),.025,sides=8)
   q=hinge+direction*.85;beam(owner+' actual open door handles','bronze_dark',(*q,1.05),(*q,1.50),.02,sides=8)
 else:cube(owner,'window',(dx,dy,1.85),(width,.24,3.40),angle)
 cube(owner+' solid portal header','facade_white',(dx,dy,3.65),(width,.24,.20),angle)
 for off in ([-width/2,-1.05,1.05,width/2] if open_entry else [-width/2,-1.05,0,1.05,width/2]):cube(owner,'bronze_dark',(dx+math.cos(angle)*off,dy+math.sin(angle)*off,1.85),(.075,.3,3.40),angle)
 cube(owner,'bronze_dark',(dx,dy,2.65),(width,.3,.075),angle)
 for off in ([] if open_entry else [-.32,.32]):
  cube(owner,'bronze_dark',(dx+math.cos(angle)*off+nx*.18,dy+math.sin(angle)*off+ny*.18,1.35),(.04,.08,.65),angle)
 cube(owner,'facade_white',(x+nx*.9,y+ny*.9,3.95),(width+1.4,2.3,.22),angle)
 if owner in ['D courtyard entrance','A entrance 1','B street entrance']:
  cube(owner+' sign fascia','facade_white',(x+nx*2.0,y+ny*2.0,3.91),(width+1.4,.13,.40),angle)
 if owner.startswith('A entrance'):
  for k in range(int((width+1.1)/.28)):
   off=-(width+1.1)/2+(k+.5)*.28
   cube(owner+' canopy slats','wood',(x+nx*.85+math.cos(angle)*off,y+ny*.85+math.sin(angle)*off,3.79),(.055,2.12,.10),angle)
  for off in [-width*.37,width*.37]:
   cube(owner+' canopy lighting','passage_light',(x+nx*.82+math.cos(angle)*off,y+ny*.82+math.sin(angle)*off,3.73),(.045,1.8,.025),angle)
 for off in [-(width/2+.45),width/2+.45]:cube(owner,'bronze_dark',(x+nx*1.7+math.cos(angle)*off,y+ny*1.7+math.sin(angle)*off,1.93),(.13,.13,3.86))
portal('D courtyard entrance',87,5.2,math.radians(6))
portal('C courtyard entrance',100,-70.06,math.radians(180.96),4.8)
portal('B street entrance',20,-17,math.pi/2,4.8)
if INCLUDE_A:
 for i,(x,y,angle,width) in enumerate(entrances[3:]):
  portal(f'A entrance {i+1}',x,y,angle,width)
 for number,x in enumerate([163.5,176.7]):
  planter=translate(box(-1.15,-.55,1.15,.55),x,-163.5)
  slab('A entry planters','warm_stone',planter.difference(planter.buffer(-.10)),-.02,.54)
  soil=planter.buffer(-.10);slab('A entry planter soil','wood',soil,0,.47)
  rng=random.Random(800+number)
  for stem in range(36):
   root=Vector((x+rng.uniform(-.96,.96),-163.5+rng.uniform(-.35,.35),.47))
   top=root+Vector((rng.uniform(-.08,.08),rng.uniform(-.08,.08),rng.uniform(.18,.40)))
   beam('A entry shrub stems','wood',root,top,.006,.002,5)
   for leaf in range(24):
    t=rng.uniform(.2,1);p=root.lerp(top,t);az=rng.random()*math.tau;length=rng.uniform(.075,.13)
    u=Vector((math.cos(az)*length,math.sin(az)*length,rng.uniform(-.025,.05)))
    v=Vector((-math.sin(az)*length*.282,math.cos(az)*length*.282,0))
    textured_leaf('A entry shrub leaves','canopy_olive',p,u,v)

# The D entrance is a composed threshold, not just a door pasted onto a window grid.
# Its position follows the existing courtyard edge; the detailing is an authored design.
entrance_angle=math.radians(6)
for k in range(19):
 off=(k-9)*.34
 cube('D entrance canopy battens','wood',(87+math.cos(entrance_angle)*off+.10,5.2+math.sin(entrance_angle)*off-.95,3.79),(.075,2.15,.12),entrance_angle)

# Timber slats, narrow legs and clear seating space are modeled individually.
def bench(x,y,angle=0):
 for k in range(6):cube('Courtyard benches','wood',(x,y+(k-2.5)*.11,.43),(2.4,.085,.09),angle)
 for t in [-.9,.9]:cube('Courtyard benches','bronze_dark',(x+t,y,.21),(.12,.55,.42),angle)
bench_positions=[(66,-49),(94,-31),(54,-22),(166,-66),(155,14),(155,48)]
if INCLUDE_A:bench_positions.extend([(180,-219),(199,-195)])
for pt in bench_positions:
 bench(*pt);x,y=pt
 pad=box(x-1.8,y-.9,x+1.8,y+.9).difference(footprints)
 pedestrian_pieces.append(pad)
 for z in [.76,.91,1.06]:cube('Courtyard benches','wood',(x,y+.31,z),(2.4,.09,.11))
 for t in [-.95,.95]:cube('Courtyard benches','bronze_dark',(x+t,y+.30,.67),(.09,.10,.95))
 near=nearest_points(walk if pt==(166,-66) else plaza,Point(x,y))[0]
 pedestrian_pieces.append(LineString([(x,y),(near.x,near.y)]).buffer(.6,cap_style=2).difference(footprints))

# One shared elevation and merged surface remove overlapping plates at intersections.
pedestrian_surface=unary_union(pedestrian_pieces).buffer(.35).buffer(-.35).difference(footprints.difference(ped_passages)).difference(wet).difference(road).intersection(clip)
slab('Pedestrian paving — continuous joined surface','pale_paving',pedestrian_surface,-.02,.16)

# A bounded garden edge is worked at ground scale, rather than tinting the whole map.
groundcover_bed=inner_garden_loop.buffer(2.15).difference(inner_garden_loop.buffer(1.55)).intersection(box(135,7,174,29)).intersection(open_space).difference(pedestrian_surface.buffer(.18))
grass_rng=random.Random(916)
if not groundcover_bed.is_empty:
 xmin,ymin,xmax,ymax=groundcover_bed.bounds
 for candidate in range(int((xmax-xmin)*(ymax-ymin)*250)):
  x=grass_rng.uniform(xmin,xmax);y=grass_rng.uniform(ymin,ymax)
  if not groundcover_bed.contains(Point(x,y)):continue
  for blade in range(9):
   az=grass_rng.random()*math.tau;height=grass_rng.uniform(.07,.15);width=grass_rng.uniform(.003,.006)
   root=Vector((x,y,.05));side=Vector((-math.sin(az),math.cos(az),0))
   def blade_point(t):return root+Vector((math.cos(az)*height*.5*t*t,math.sin(az)*height*.5*t*t,height*t))
   for segment in range(4):
    t=segment/4;u=(segment+1)/4;p=blade_point(t);q=blade_point(u)
    blade_vertices=[tuple(p-side*width*(1-t)),tuple(p+side*width*(1-t)),tuple(q+side*width*(1-u))]
    if u<1:blade_vertices.append(tuple(q-side*width*(1-u)))
    face('Courtyard groundcover — individual blades','groundcover',blade_vertices)

# Chosen locations respect the bank, paths and facade clearances.
tree_positions=[(221,-105),(219,-75),(216,-42),(214,-8),(213,28),(210,62),(216,104),(194,118),(164,111),(133,107),(108,90),(78,40),(18,40),(-12,39),(-43,38),(-78,33),(60,-21),(87,-61),(38,-54),(156,-22),(145,-48),(48,-83),(173,-72),(60,-42),(60,-60),(90,-38),(100,-24),(145,-10),(78,-64),(88,-54),(116,-15),(147,2)]
tree_positions.extend([(153,31),(151,40)])
if INCLUDE_A:tree_positions.extend([(185,-207),(197,-215),(132,-187),(132,-219),(172,-270),(193,-278),(227,-181),(229,-211),(228,-242),(226,-282),(210,-290),(171,-289)])
for i,(x,y) in enumerate(tree_positions):
 if footprints.buffer(2.3).contains(Point(x,y)) or road.buffer(1).contains(Point(x,y)) or wet.buffer(1).contains(Point(x,y)) or plaza.buffer(.65).contains(Point(x,y)):continue
 if (y<0 and x<180) or (140<x<170 and 15<y<48) or (INCLUDE_A and x<215 and y<-150):
  if footprints.buffer(5).contains(Point(x,y)):continue
  broadleaf(x,y,1.45+(i%3)*.10,i+1)
 else:willow(x,y,.85+(i%4)*.07,i+1)

# Individual groundcover beds and a light pergola in the north-side garden seen in the reference.
for k in range(6):
 bed=LineString([(103+k*10,103),(110+k*10,113)]).buffer(.95,cap_style=2).difference(wet.buffer(1)).difference(footprints)
 slab('North garden beds','warm_stone',bed.buffer(.22),.08,.18)
 slab('North garden planting','grass',bed,.27,.16)
for x in [145,151,157]:
 for y in [98,103]:cube('Garden pergola','wood',(x,y,1.4),(.14,.14,2.8))
for x in range(144,159):cube('Garden pergola','wood',(x,100.5,2.85),(.10,6,.12))

watermat=M['water_deep'];nodes=watermat.node_tree.nodes;links=watermat.node_tree.links
noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1.8;noise.inputs['Detail'].default_value=2
water_coords=nodes.new('ShaderNodeTexCoord');links.new(water_coords.outputs['Object'],noise.inputs['Vector'])
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.035
links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])

# A few physically scaled people are size references, not inhabitants or saved locations.
def person(x,y,h=1.72):
 beam('Scale figures','stone_dark',(x,y,.1),(x-.12,y,.85),.07,.07)
 beam('Scale figures','stone_dark',(x+.2,y,.1),(x+.05,y,.85),.07,.07)
 cube('Scale figures','porcelain',(x,y,1.15),(.40,.22,.65))
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=(x,y,h-.12));head=bpy.context.object;head.name='Scale figure head';head.scale=(.13,.13,.16);head.data.materials.append(M['skin']);head['designRole']='Scale figures'
for x,y in [(34,-2),(59,29),(79,-35)]:person(x,y)

# Build the scene as editable grouped meshes, preserving the seven source identities in metadata.
for (owner,material),(verts,faces) in batches.items():
 if not faces:continue
 # Share exactly identical vertices, with no rounding, simplification or face removal.
 # This keeps the folded leaf geometry but avoids storing each corner four times.
 unique=[];indices={};remap=[]
 for vertex in verts:
  key=tuple(vertex)
  if key not in indices:indices[key]=len(unique);unique.append(key)
  remap.append(indices[key])
 mesh=bpy.data.meshes.new(owner+' '+material);mesh.from_pydata(unique,[],[tuple(remap[i] for i in face_indices) for face_indices in faces]);mesh.update()
 if (owner,material) in foliage_uv:
  uv_layer=mesh.uv_layers.new(name='Leaf albedo UV')
  for polygon,coordinates in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for loop_index,uv in zip(polygon.loop_indices,coordinates):uv_layer.data[loop_index].uv=uv
 obj=bpy.data.objects.new(owner+' | '+material,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(M[material]);obj['designRole']=owner
 if owner.startswith('D/C — continuous east academic ensemble'):obj['sourceFeatureIds']=ids[1:]
 elif owner.startswith('B — west wing'):obj['sourceFeatureIds']=[ids[0]]
 elif owner.startswith('A —'):obj['sourceFeatureIds']=['way/504974789']
 elif owner.startswith('A/C —'):obj['sourceFeatureIds']=['way/504974789','way/504974813']
 if owner=='Courtyard benches':
  obj.location.z=.14
  bevel=obj.modifiers.new('Comfortable softened edges','BEVEL');bevel.width=.015 if material=='wood' else .005;bevel.segments=3;bevel.limit_method='ANGLE'
 if material in ['willow','willow_light']:
  for f in mesh.polygons:f.use_smooth=True
 if material=='wood' and (owner.startswith('Courtyard shade tree') or owner.startswith('Willow')):
  for f in mesh.polygons:
   if len(f.vertices)==4:f.use_smooth=True
# Small architectural identification at the door, rather than a floating map label.
def architectural_sign(owner,label,x,y,angle):
 bpy.ops.object.text_add(location=(x+math.sin(angle)*2.075,y-math.cos(angle)*2.075,3.79),rotation=(math.pi/2,0,angle))
 sign=bpy.context.object;sign.name=owner
 sign.data.body=label;sign.data.font=bpy.data.fonts.load('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
 sign.data.align_x='CENTER';sign.data.size=.35;sign.data.extrude=.008;sign.data.materials.append(M['bronze_dark'])
 bpy.ops.object.convert(target='MESH');bpy.context.object['designRole']=owner
architectural_sign('D entrance architectural sign','农生环 D 座',87,5.2,math.radians(6))
if INCLUDE_A:architectural_sign('A entrance architectural sign','农学院 A 座',170.1579,-165.121,math.pi)
scene=bpy.context.scene;scene['sourceFeatureIds']=all_source_ids;scene['originWGS84']=[OX,OY];scene['status']='work in progress — focused precinct';scene['includeA']=INCLUDE_A
scene['buildScriptSHA256']=build_script_sha256
scene['supportScriptSHA256']=support_script_sha256
scene['landscapeScriptSHA256']=hashlib.sha256(landscape_recipe.encode()).hexdigest()
root=bpy.data.objects.new('Agricultural precinct — WGS84 anchored design',None);bpy.context.collection.objects.link(root)
root['authoredStairOpenings']=stair_openings.wkt;root['sourceFeatureIds']=all_source_ids;root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY]
root['sourceCommit']='8cdd754f6355de11d9d0d6bb367d6a66cbf7c330';root['status']='WORK_IN_PROGRESS';root['buildScriptSHA256']=build_script_sha256
root['supportScriptSHA256']=support_script_sha256
root['landscapeScriptSHA256']=hashlib.sha256(landscape_recipe.encode()).hexdigest()
for ob in list(scene.objects):
 if ob.type=='MESH':ob.parent=root
world=bpy.data.worlds.new('Soft daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.80,.83,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(math.radians(28),math.radians(-22),math.radians(-36));sun.data.energy=2.5;sun.data.angle=math.radians(10)
for x,y,z in interior_lamps:
 bpy.ops.object.light_add(type='AREA',location=(x,y,z));lamp=bpy.context.object;lamp.name='D real interior light';lamp.data.energy=220;lamp.data.shape='RECTANGLE';lamp.data.size=.85;lamp.data.size_y=.30;lamp.data.color=(1,.95,.86)
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),32 if '--preview' in sys.argv else 64);scene.cycles.use_denoising=False;scene.render.resolution_x=1800;scene.render.resolution_y=1250;scene.render.resolution_percentage=67 if '--preview' in sys.argv else 100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
def aim(name,position,target,ortho=None,lens=28):
 cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP'
 if ortho:cam.data.ortho_scale=ortho
 else:cam.data.lens=lens
 scene.render.filepath=str(OUT/(name+'.png'))

aim('connected-precinct',(420,-650,410) if INCLUDE_A else (420,-470,350),(100,-70,8) if INCLUDE_A else (90,0,5),480 if INCLUDE_A else 360)
for name,content in [('BUILD_RECIPE.py',build_recipe),('PRIMITIVES_RECIPE.py',support_recipe),('LANDSCAPE_RECIPE.py',landscape_recipe),('INTERIOR_RECIPE.py',(Path(__file__).parent/'agriculture_interior.py').read_text()),('STAIR_FLIGHT_RECIPE.py',(Path(__file__).parent/'east_stair_core.py').read_text())]:
 text_block=bpy.data.texts.new(name);text_block.write(content)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'agricultural-precinct.blend'),compress=True)
views=[
 ('connected-precinct',(420,-470,350),(90,0,5),360,28),
 ('under-the-connection',(46,-34,1.75),(44,27,10),None,24),
 ('north-culvert',(19,57,.5),(37,57,-.4),None,40),
 ('D-connected-courtyard',(162,-7,1.75),(153,36,5.5),None,28),
 ('west-footbridge',(-90,-19,1.75),(-83,-5,1.0),None,28),
 ('D-entrance-garden',(75,-21,1.75),(87,5,3.0),None,28)]
views.append(('north-pedestrian-passage',(161.5,57,1.7),(161.7,94,1.7),None,28))
views.append(('C-pedestrian-passage',(143,-109,1.7),(157,-43,1.7),None,28))
views.append(('D-sheltered-gallery',(121.5,23,1.7),(135.5,53,1.9),None,24))
views.append(('D-garden-detail',(163,7,1.45),(154,18,1.5),None,35))
views.append(('C-inner-courtyard',(143,-68,1.75),(166,-66,1.7),None,28))
views.append(('north-back-elevation',(90,145,1.75),(145,71,8),None,28))
views.append(('east-bank-elevation',(253,12,1.75),(197,8,5),None,28))
if INCLUDE_A:
 views[0]=('connected-precinct',(420,-650,410),(100,-70,8),480,28)
 views.extend([
  ('A-overall',(390,-450,270),(175,-205,6),200,28),
  ('A-road-underpass',(160,-126,1.75),(220,-126,6),None,28),
  ('A-courtyard',(219,-212,1.75),(180,-207,4),None,28),
  ('A-garden-gallery',(164.5,-225,1.7),(164.5,-184,1.9),None,24),
  ('A-north-entrance',(170,-153,1.75),(170,-166,3),None,28),
  ('A-south-river',(239,-285,1.65),(246,-298,-.4),None,24)])
views.extend([('D-entry-inside',(87,2,1.85),(87,12,1.85),None,25),('D-stair-ground',(93.9,9.3,1.85),(93.9,14,2.7),None,24),('D-stair-top',(95,11.6,20.85),(95,15,18),None,24)])
for name,a,b in CONNECTION_AXES:
 for level in [7.75,15.35]:
  eye=(a[0]+(b[0]-a[0])*.05,a[1]+(b[1]-a[1])*.05,level+1.7);views.append(('connection-'+name+'-'+str(level),eye,(*b,level+1.7),None,24))
if INCLUDE_A:views.extend([('A-north-stair-ground',(175.9,-167.4,1.85),(175.9,-173,2.7),None,24),('A-north-stair-top',(174.8,-170.1,20.85),(174.8,-173.6,18),None,24),('A-upper-arrival',(205,-168.7,9.45),(176,-168.7,9.45),None,24)])
views.extend([('B-street-stair-ground',(18.5,-17.1,1.85),(12,-17.1,2.7),None,24),('B-street-stair-top',(15.4,-16,20.85),(12.5,-16,18),None,24),('B-bridge-arrival',(27,9,9.45),(17.5,9,9.45),None,24)])
views.append(('B-upper-turn',(17.5,7,9.45),(17.5,-12,9.45),None,24))
views.extend([('B-foyer-seating',(18.5,-12.5,1.75),(11.4,-10.8,.85),None,28),('A-small-study',(169.8,-172.2,1.75),(166,-176.7,1),None,24)])
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
receipt_file=OUT/'render-receipts.json'
receipts=json.loads(receipt_file.read_text()) if receipt_file.exists() else {}
for view in views:
 if selected is not None and view[0] not in selected:continue
 aim(*view);bpy.ops.render.render(write_still=True)
 receipts[view[0]]={'buildScriptSHA256':build_script_sha256,'renderedAtUTC':datetime.now(timezone.utc).isoformat(),'imageSHA256':hashlib.sha256((OUT/(view[0]+'.png')).read_bytes()).hexdigest(),'samples':scene.cycles.samples,'resolutionPercentage':scene.render.resolution_percentage,'status':'rendered, requires visual review'}
 receipt_file.write_text(json.dumps(receipts,ensure_ascii=False,indent=2))
for ob in scene.objects:ob.select_set(ob.type=='MESH' or ob==root)
if '--export-glb' in sys.argv:bpy.ops.export_scene.gltf(filepath=str(OUT/'agricultural-precinct.glb'),export_format='GLB',use_selection=True,export_extras=True,export_apply=True)
(OUT/'design-record.json').write_text(json.dumps({'status':'work in progress','sourceIds':all_source_ids,'includeA':INCLUDE_A,'reference':'https://map.zju.edu.cn/index','referenceImageDate':'2022-10-28','observed':['joined D wings','west cross-road connection','east continuation','waterside planting'],'sourceRecorded':['north culvert way/839277219','southeast culvert way/1083073683',*passage_ids],'inferredDesign':['covered ground-floor passages along existing pedestrian traces; exact real form unverified'],'undergroundExcluded':['way/504974806 tunnel parking aisle'],'AObserved':(['northward cross-road connection on official 2.5D map','separate western life-sciences complex'] if INCLUDE_A else []),'ASourceDoorAnchors':(['way/504974787','way/504974788'] if INCLUDE_A else []),'leafTextureSource':'modeling/textures/SOURCE.md','designed':['floor module and clearance','facade detail','culvert mouth dimensions','garden planting','benches and pergola'],'notClaimed':['measured heights','confirmed indoor routes','full-campus completion','runtime integration']},ensure_ascii=False,indent=2))
print('FOCUSED PRECINCT RENDERED',flush=True)
