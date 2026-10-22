"""An authored walking garden around the source pond and circular paved place.
The pond is not under the gallery, and these paths never alter the navigation graph.
"""
from architecture_primitives import *
from shapely.ops import nearest_points
from landscape_primitives import configure_leaf_materials,broadleaf,shrub
POND_ID='way/504974751';PLAZA_ID='way/504974753'

def plaza_display():
 source=allshapes[PLAZA_ID]
 return source.centroid.buffer(math.sqrt(source.area/math.pi),quad_segs=64)

def build_garden(wet,road,occupied,clip):
 pond=allshapes[POND_ID];plaza=plaza_display();area=box(-164,161,-51,212)
 ring=pond.buffer(3.8,join_style=1).difference(pond.buffer(.45,join_style=1))
 target=nearest_points(Point(-104,180),ring)[1]
 western=LineString([(-104,159.5),(-104,172),(-100,177),(target.x,target.y)]).buffer(1.5,cap_style=1,join_style=1)
 # A gentle curve connects the existing circular place, without a new road crossing.
 a=Vector((plaza.bounds[2]-.5,plaza.centroid.y));b=Vector((-123,plaza.centroid.y));c=Vector((-112,180));d=Vector((-100,177))
 points=[]
 for i in range(41):
  t=i/40;v=a*(1-t)**3+b*3*(1-t)**2*t+c*3*(1-t)*t*t+d*t**3;points.append(tuple(v))
 link=LineString(points).buffer(1.5,cap_style=1,join_style=1)
 paths=unary_union([ring,western,link]).buffer(.35,join_style=1).buffer(-.35,join_style=1).intersection(clip).difference(wet).difference(road).difference(occupied)
 source_walks=[]
 for f in features:
  p=f['properties'];g=plaza if f['id']==PLAZA_ID else allshapes[f['id']]
  if p.get('kind')=='road' and p.get('highway') in ['footway','path','pedestrian','steps'] and g.intersects(area):source_walks.append(g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.6))
 walking=unary_union(source_walks+[paths]);buildings=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='building' and allshapes[f['id']].intersects(area)])
 mat('East south garden lawn',(.28,.32,.22),0,.97);mat('East south garden meadow',(.43,.44,.34),0,.97);mat('East south garden soil',(.20,.16,.11),0,.97)
 # Fine procedural ground detail distinguishes low lawn from smooth stone at walking height.
 lawnmat=M['East south garden lawn'];nodes=lawnmat.node_tree.nodes;links=lawnmat.node_tree.links
 coord=nodes.new('ShaderNodeTexCoord');grain=nodes.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=90;grain.inputs['Detail'].default_value=2
 tint=nodes.new('ShaderNodeValToRGB');tint.color_ramp.elements[0].color=(.23,.28,.19,1);tint.color_ramp.elements[1].color=(.32,.37,.25,1)
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.005
 links.new(coord.outputs['Object'],grain.inputs['Vector']);links.new(grain.outputs['Fac'],tint.inputs['Fac']);links.new(tint.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color']);links.new(grain.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
 forbids=unary_union([wet.buffer(.6),road.buffer(.5),occupied.buffer(.4),walking.buffer(.6),buildings.buffer(1.5)])
 lawn=area.buffer(-3).buffer(3).difference(wet.buffer(.45)).difference(road.buffer(.15)).difference(occupied).difference(walking.buffer(.08)).difference(buildings)
 slab('East south garden legible lawn','East south garden lawn',lawn,0,.08)
 islands=unary_union([Point(-154,198).buffer(8.5),Point(-128,194).buffer(10),Point(-120,167).buffer(6),Point(-69,205).buffer(6)]).intersection(area).difference(forbids)
 configure_leaf_materials();sites=[]
 for j,(x,y,size) in enumerate([(-154,198,.88),(-130,197,.84),(-122,190,.77),(-120,167,.74),(-68,205,.77)]):
  if islands.buffer(-1).covers(Point(x,y)):sites.append((j,x,y,size))
 pits=unary_union([Point(x,y).buffer(.65,quad_segs=24) for j,x,y,size in sites])
 slab('East south garden individual planted islands','East south garden meadow',islands.difference(pits),0,.12)
 slab('East south garden tree pits','East south garden soil',pits,0,.12)
 slab('East south garden island rims','limestone',islands.buffer(.055).difference(islands),.12,.03)
 for j,x,y,size in sites:broadleaf(x,y,size,seed=8600+j)
 for j,(x,y) in enumerate([(-157,194),(-149,201),(-134,190),(-124,201),(-117,166),(-71,207)]):
  if islands.buffer(-.8).covers(Point(x,y)):shrub('East south garden low understory',x,y,.12,.7,seed=8630+j)
 # Small restrained pavers give the source plaza a readable surface, not a road-junction dot.
 mat('East south plaza paver',(.62,.59,.52),0,.82)
 x0,y0,x1,y1=plaza.bounds
 for row in range(math.ceil((y1-y0)/.6)):
  y=y0+row*.6
  for column in range(-1,math.ceil((x1-x0)/1.2)+1):
   x=x0+column*1.2+(row%2)*.6
   tile=box(x+.008,y+.008,x+1.192,y+.592).intersection(plaza)
   if tile.area>.02:slab('East south source plaza paving units','East south plaza paver',tile,.15,.004)
 edge=plaza.difference(plaza.buffer(-.12)).difference(paths.buffer(.1)).difference(allshapes['way/504974752'].buffer(1.8))
 slab('East south plaza edge band','limestone',edge,.154,.002)
 # Seats face inward on the existing circular paved place, leaving its southern mouth open.
 def bench(name,x,y,angle,length=2.4):
  ca,sa=math.cos(angle),math.sin(angle)
  def pt(u,v,z):return (x+u*ca-v*sa,y+u*sa+v*ca,z)
  for k in range(4):cube(name+' timber slats','wood',pt(0,(k-1.5)*.10,.59),(length,.085,.055),angle)
  for z in [.80,.95]:cube(name+' back boards','wood',pt(0,.24,z),(length,.055,.12),angle)
  for u in [-length*.38,length*.38]:
   for v in [-.18,.18]:beam(name+' legs','bronze',pt(u,v,.15),pt(u,v,.56),.026,sides=8)
   beam(name+' back supports','bronze',pt(u,.24,.15),pt(u,.24,1.02),.024,sides=8)
 cx,cy=plaza.centroid.coords[0]
 for angle in [math.radians(v) for v in [45,135,205]]:
  x=cx+6.6*math.cos(angle);y=cy+6.6*math.sin(angle);rotation=angle-math.pi/2
  bench('East south circular plaza seat',x,y,rotation)
 # Pond seats stand on the actual authored ring, never on water or bare lawn.
 for x,y in [(-84,196.0),(-66,198.0)]:
  if ring.covers(box(x-1.4,y-.4,x+1.4,y+.4)):bench('East south pond seat',x,y,0)
 return paths,islands
