"""Three source-bounded East Three courts, with individually placed planting and accessible seats."""
from architecture_primitives import *
from landscape_primitives import broadleaf,shrub

def build_courts(courts):
 for axis,factors in [('X',(.65,32,32)),('Y',(32,.65,32))]:
  name='East Three timber grain '+axis;mat(name,(.38,.28,.18),0,.62)
  tree=M[name].node_tree;nodes=tree.nodes;links=tree.links;bs=nodes.get('Principled BSDF')
  coord=nodes.new('ShaderNodeTexCoord');stretch=nodes.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=factors
  noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1;noise.inputs['Detail'].default_value=2;noise.inputs['Roughness'].default_value=.65
  ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[0].color=(.30,.22,.14,1);ramp.color_ramp.elements[1].position=.82;ramp.color_ramp.elements[1].color=(.46,.35,.23,1)
  bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.10;bump.inputs['Distance'].default_value=.006
  links.new(coord.outputs['Object'],stretch.inputs[0]);links.new(stretch.outputs['Vector'],noise.inputs['Vector']);links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],bs.inputs['Base Color']);links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
 mat('East Three soil',(.18,.14,.09),0,.95)
 mat('East Three pocket limestone',(.64,.60,.52),0,.82)
 mat('East Three notebook charcoal',(.06,.055,.045),0,.70)
 trees=[(-136,263.5,.72),(-118,251,.65),(-89,264,.80),(-69,251.5,.75),(-22,264,.78),(8,251.5,.72),(16,264,.82)]
 shrubs=[(-139,251,.70),(-133,251,.55),(-117,264,.75),(-91,251,.85),(-84,251,.60),(-68,264,.65),(-27,251,.65),(-18,251,.8),(7,264,.8),(14,264,.6)]
 benches=[(-127,257.4),(-81,257.4),(-8,257.4)]
 gardens=[];pavings=[]
 for court in courts:
  cross=LineString([(court.bounds[0],258.5),(court.bounds[2],258.5)]).buffer(2.0,cap_style=2)
  pocket=box(-1,260.0,13,266.4).buffer(-.8).buffer(.8,quad_segs=12).intersection(court.buffer(-1.5)) if court.centroid.x>-40 else Polygon()
  garden=court.buffer(-3).difference(cross.union(pocket));paving=court.difference(garden)
  selected=[(i,x,y,size) for i,(x,y,size) in enumerate(trees) if garden.buffer(-.65).covers(Point(x,y))]
  pits=unary_union([Point(x,y).buffer(.65,quad_segs=24) for i,x,y,size in selected])
  slab('East Three courtyard paving','paving',paving.difference(pocket),0,.15)
  if not pocket.is_empty:slab('East Three pocket paving','East Three pocket limestone',pocket,0,.15)
  slab('East Three planted soil','East Three soil',pits,0,.12)
  slab('East Three courtyard lawn','East Three lawn',garden.difference(pits),0,.12)
  slab('East Three low garden edging','East stone',garden.buffer(.07).difference(garden).intersection(paving),.15,.025)
  for i,x,y,size in selected:broadleaf(x,y,size,seed=7400+i)
  for i,(x,y,size) in enumerate(shrubs):
   if garden.buffer(-.45*size).covers(Point(x,y)):shrub('East Three authored court understory',x,y,.12,size,seed=7440+i)
  for x,y in benches:
   if not paving.covers(box(x-1.5,y-.35,x+1.5,y+.35)):continue
   for j in range(4):cube('East Three courtyard bench seat','East Three timber grain X',(x,y+(j-1.5)*.10,.59),(2.8,.085,.055))
   for z in [.79,.94]:cube('East Three courtyard bench back','East Three timber grain X',(x,y-.23,z),(2.8,.055,.12))
   for xx in [x-1.1,x+1.1]:
    for yy in [y-.18,y+.18]:beam('East Three courtyard bench legs','East bronze',(xx,yy,.15),(xx,yy,.56),.028,sides=6)
    beam('East Three courtyard bench back post','East bronze',(xx,y-.23,.15),(xx,y-.23,1.02),.025,sides=6)
  if not pocket.is_empty:
   # One individually composed quiet corner, joined directly to the main walking strip.
   for x in [1.5,6.0,10.5]:
    for y in [261.5,265.1]:
     cube('East Three east court pergola posts','East bronze',(x,y,1.60),(.12,.12,2.90))
     cube('East Three east court pergola feet','East stone',(x,y,.20),(.26,.26,.10))
   for y in [261.5,265.1]:cube('East Three east court pergola long beams','East bronze',(6,y,3.12),(9.5,.14,.18))
   for x in [1.5,10.5]:cube('East Three east court pergola end beams','East bronze',(x,263.3,3.12),(.14,4.0,.18))
   for j in range(30):cube('East Three east court pergola timber shade','East Three timber grain Y',(1.4+j*.32,263.3,3.25),(.09,4.05,.08))
   for x,y,length,angle in [(6.0,264.65,6.4,0),(2.2,263.05,2.0,math.pi/2)]:
    t=Vector((math.cos(angle),math.sin(angle)));n=Vector((-t.y,t.x));c=Vector((x,y))
    for k in range(4):cube('East Three pocket bench seats','East Three timber grain X' if angle==0 else 'East Three timber grain Y',(*(c+n*(k-1.5)*.105),.60),(length,.09,.055),angle)
    for z in [.81,.96]:cube('East Three pocket bench backs','East Three timber grain X' if angle==0 else 'East Three timber grain Y',(*(c+n*.23),z),(length,.055,.12),angle)
    supports=[-length/2+.3,-length/4,0,length/4,length/2-.3] if length>3 else [-length/2+.3,length/2-.3]
    for d in supports:
     pt=c+t*d
     for off in [-.17,.17]:beam('East Three pocket bench legs','East bronze',(*(pt+n*off),.15),(*(pt+n*off),.5725),.025,sides=6)
     beam('East Three pocket bench back posts','East bronze',(*(pt+n*.23),.15),(*(pt+n*.23),1.03),.022,sides=6)
   cube('East Three pocket shared table','East Three timber grain X',(6,263.05,.90),(2.8,.85,.055))
   for x in [4.9,7.1]:
    for y in [262.75,263.35]:beam('East Three pocket table legs','East bronze',(x,y,.15),(x,y,.8725),.027,sides=6)
   cube('East Three pocket notebook lower cover','East Three notebook charcoal',(5.65,263.05,.94),(.28,.37,.025),.15)
   cube('East Three pocket notebook pages','porcelain',(5.65,263.05,.955),(.265,.355,.005),.15)
   cube('East Three pocket notebook upper cover','East Three notebook charcoal',(5.65,263.05,.960),(.28,.37,.005),.15)
   cup=Point(6.55,263.05).buffer(.045,quad_segs=24)
   slab('East Three pocket ceramic cup base','porcelain',cup,.9275,.007)
   slab('East Three pocket ceramic cup sides','porcelain',cup.difference(Point(6.55,263.05).buffer(.037,quad_segs=24)),.9345,.11)
   handle=[(6.597+.029*math.cos(i*2*math.pi/24),263.05,.987+.038*math.sin(i*2*math.pi/24)) for i in range(25)]
   for a,b in zip(handle,handle[1:]):beam('East Three pocket cup handle','porcelain',a,b,.006,sides=8)
   for x in [5.1,6.9]:
    cube('East Three pocket stools','East Three timber grain X',(x,261.95,.60),(.48,.48,.055))
    for dx in [-.17,.17]:
     for dy in [-.17,.17]:beam('East Three pocket stool legs','East bronze',(x+dx,261.95+dy,.15),(x+dx,261.95+dy,.5725),.018,sides=6)
  gardens.append(garden);pavings.append(paving)
 return gardens,pavings
