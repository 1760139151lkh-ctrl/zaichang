"""Source-anchored lawn parcels and individually placed study trees, not surveyed tree positions."""
from architecture_primitives import *
from landscape_primitives import broadleaf,willow
PARCELS=[('way/306110518',6),('way/306110519',4),('way/306110520',2),('way/562767221',2)]

def add_lakeside_planting(clip,wet,road,walk,all_buildings,all_foot,deck):
 mat('Lakeside lawn',(.35,.40,.28),0,.96);mat('Lakeside lawn soil',(.20,.16,.11),0,.95)
 nodes=M['Lakeside lawn'].node_tree.nodes;links=M['Lakeside lawn'].node_tree.links
 noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=170;noise.inputs['Detail'].default_value=2
 ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.30,.35,.24,1);ramp.color_ramp.elements[1].color=(.38,.42,.30,1)
 links.new(noise.outputs['Fac'],ramp.inputs['Fac']);links.new(ramp.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.018;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
 occupied=[]
 for ob in bpy.data.objects:
  role=ob.get('designRole',ob.name)
  if ob.type!='MESH' or not (role.startswith('Courtyard shade tree') or role.startswith('Willow')) or not ob.data.materials or not ob.data.materials[0].name.startswith('wood'):continue
  points=[ob.matrix_world @ vertex.co for vertex in list(ob.data.vertices)[:8]]
  if points:occupied.append(Point(sum(p.x for p in points)/len(points),sum(p.y for p in points)/len(points)))
 for (owner,material),(vertices,faces) in list(batches.items()):
  if material=='wood' and (owner.startswith('Courtyard shade tree') or owner.startswith('Willow')) and vertices:
   points=vertices[:8];occupied.append(Point(sum(p[0] for p in points)/len(points),sum(p[1] for p in points)/len(points)))
 records=[]
 for parcel_index,(source_id,limit) in enumerate(PARCELS):
  source=allshapes[source_id]
  lawn=source.intersection(clip).difference(wet.buffer(.6)).difference(road.buffer(.002)).difference(walk.buffer(.002)).difference(all_buildings.buffer(.3)).difference(all_foot).difference(deck.buffer(.3))
  if lawn.is_empty:continue
  slab('Source lawn soil '+source_id,'Lakeside lawn soil',lawn,0,.08)
  slab('Source lawn surface '+source_id,'Lakeside lawn',lawn,.08,.04)
  rng=random.Random(4100+parcel_index);x0,y0,x1,y1=lawn.bounds;candidates=[]
  for x in range(math.ceil(x0),math.floor(x1),6):
   for y in range(math.ceil(y0),math.floor(y1),6):
    p=Point(x+rng.uniform(-1.8,1.8),y+rng.uniform(-1.8,1.8))
    if not lawn.covers(p.buffer(2.5)) or p.distance(walk)<4.5 or p.distance(road)<5 or p.distance(all_buildings)<6:continue
    candidates.append(p)
  rng.shuffle(candidates);placed=[]
  # Choose visually separated trees within the already-known lawn boundaries.
  for point in candidates:
   if any(point.distance(old)<12 for old in occupied+placed):continue
   kind='willow' if 3<point.distance(wet)<10 and len(placed)%2==0 else 'broadleaf'
   seed=4100+parcel_index*100+len(placed)
   size=.78+rng.random()*.18
   if kind=='willow':willow(point.x,point.y,size=size,seed=seed)
   else:broadleaf(point.x,point.y,size,seed=seed)
   placed.append(point);records.append({'parcel':source_id,'x':point.x,'y':point.y,'kind':kind,'seed':seed,'authoredNotSurveyed':True})
   if len(placed)>=limit:break
  occupied.extend(placed)
  print('SOURCE LAWN DISPLAY',source_id,'source area',round(source.area,2),'visible modeled area',round(lawn.area,2),'trees',len(placed),'partial',not clip.covers(source))
 print('AUTHOR LAKESIDE TREE POSITIONS',json.dumps(records,ensure_ascii=False))
 return records
