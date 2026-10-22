"""Authored forecourt gardens fitted between the existing Yueya service lanes."""
from architecture_primitives import *
from landscape_primitives import broadleaf,shrub

def add_yueya_forecourt(road,wet,foot,walk,clip,G,world,local):
 mat('Yueya lawn',(.34,.39,.27),0,.95)
 nodes=M['Yueya lawn'].node_tree.nodes;links=M['Yueya lawn'].node_tree.links
 noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=180;noise.inputs['Detail'].default_value=2
 ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.30,.35,.235,1);ramp.color_ramp.elements[1].color=(.38,.42,.29,1)
 links.new(noise.outputs['Fac'],ramp.inputs['Fac']);links.new(ramp.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.15;bump.inputs['Distance'].default_value=.018;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
 mat('Yueya garden soil',(.17,.135,.09),0,.95)
 mat('Yueya garden edging',(.72,.69,.60),0,.75)
 allowed=G(box(-90,-34,90,-8)).difference(road.buffer(1.0)).difference(wet.buffer(.6)).difference(foot.buffer(.5)).difference(walk.buffer(.1)).intersection(clip)
 parcels=sorted([p for p in polygons(allowed) if p.area>60],key=lambda p:local((p.centroid.x,p.centroid.y))[0])
 beds=[];paths=[]
 for index,parcel in enumerate(parcels):
  bed=parcel.buffer(-2.0,join_style=1)
  if bed.is_empty or bed.area<20:continue
  q=local((bed.centroid.x,bed.centroid.y))
  # Each garden has a different open walking layout, connected to its surrounding paving.
  if index==0:
   path=G(LineString([(q[0]-30,q[1]-4),(q[0]-9,q[1]+2),(q[0]+7,q[1]-2),(q[0]+30,q[1]+5)]).buffer(.95,cap_style=2,join_style=1))
  elif index==1:
   path=unary_union([G(LineString([(q[0],-35),(q[0]+off,-7)]).buffer(.75,cap_style=2)) for off in [-15,0,15]])
  else:
   path=Point(bed.centroid.x,bed.centroid.y).buffer(4.2,quad_segs=32).difference(Point(bed.centroid.x,bed.centroid.y).buffer(2.5,quad_segs=32))
   path=path.union(G(LineString([(q[0]-25,q[1]),(q[0]+25,q[1])]).buffer(.85,cap_style=2)))
  grass=bed.difference(path);beds.append(grass);paths.append(parcel.difference(grass))
  slab('Yueya forecourt garden soil','Yueya garden soil',grass,0,.09)
  slab('Yueya forecourt lawn','Yueya lawn',grass.buffer(-.08),.09,.035)
  slab('Yueya forecourt low edging','Yueya garden edging',grass.difference(grass.buffer(-.08)),0,.15)
  # A few low, individually seeded groups rather than a continuous wall of hedges.
  boundary=bed.buffer(-.65).boundary
  for j in range(max(1,math.floor(boundary.length/6))):
   pt=boundary.interpolate((j+.3)*6)
   if not grass.buffer(.2).covers(pt.buffer(.38)) or pt.distance(path)<1.3:continue
   shrub('Yueya low planting '+str(index)+' '+str(j),pt.x,pt.y,ground=.125,size=.80+.10*math.sin(j),seed=2100+index*100+j)
  print('YUEYA AUTHOR GARDEN',index,round(parcel.area,2),round(grass.area,2))
 for index,bed in enumerate(beds):
  candidates=[];x0,y0,x1,y1=bed.bounds
  for xx in range(math.ceil(x0),math.floor(x1),2):
   for yy in range(math.ceil(y0),math.floor(y1),2):
    point=Point(xx,yy)
    if bed.covers(point):candidates.append((point.distance(bed.boundary),point))
  if not candidates:continue
  clearance,point=max(candidates,key=lambda p:p[0])
  if clearance<2.1:continue
  broadleaf(point.x,point.y,.66+.035*index,seed=2301+index)
  print('YUEYA FORECOURT TREE',index,point.x,point.y,'clearance',clearance)
 return walk.union(unary_union(paths)).difference(road).difference(wet).difference(foot)
