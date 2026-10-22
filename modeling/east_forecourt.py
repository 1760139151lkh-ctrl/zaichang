"""Authored planting in the previously bare forecourt; no new source-geography claim."""
from architecture_primitives import *
from landscape_primitives import broadleaf,shrub

def build_forecourt(walk,road,wet,compound,plaza):
 bed=box(-117,410,-95,417).buffer(1.2,quad_segs=24).difference(walk.buffer(.15)).difference(road.buffer(.3)).difference(wet.buffer(.5)).difference(compound).difference(plaza.buffer(.2))
 slab('East authored forecourt planted soil','East soil',bed,0,.12)
 tree_pits=unary_union([Point(x,y).buffer(.65,quad_segs=24) for x,y in [(-112,413),(-103,413),(-96,414)]])
 groundcover=bed.difference(tree_pits)
 slab('East authored forecourt low groundcover','East lawn',groundcover,.12,.015)
 rng=random.Random(6681)
 for j in range(1600):
  x=rng.uniform(-118.2,-93.8);y=rng.uniform(408.8,418.2)
  if not groundcover.buffer(-.08).covers(Point(x,y)):continue
  for k in range(7):
   a=rng.random()*math.tau;h=rng.uniform(.018,.045);w=.0035
   u=Vector((math.cos(a),math.sin(a)));v=Vector((-u.y,u.x));base=Vector((x,y))+u*rng.uniform(0,.018);tip=base+u*h*.45
   face('East forecourt low grass blades','East lawn',[(*(base-v*w),.135),(*(base+v*w),.135),(*tip,.135+h)])
 slab('East authored forecourt low edging','East stone',bed.buffer(.08).difference(bed),0,.15)
 for j,(x,y,size) in enumerate([(-112,413,.68),(-103,413,.78),(-96,414,.65)]):
  if not bed.buffer(-.45).covers(Point(x,y)):continue
  broadleaf(x,y,size,seed=6600+j)
 for j,(x,y) in enumerate([(-115,415.5),(-108,415.8),(-100,415.9),(-110,411.1),(-102,410.8),(-97,411.0)]):
  if bed.buffer(-.65).covers(Point(x,y)):shrub('East authored forecourt understory',x,y,.12,.60,seed=6630+j)
 for x,y in [(-110.5,420.0),(-101.5,418.05)]:
  if not walk.covers(box(x-1.1,y-.30,x+1.1,y+.30)):continue
  for k in range(4):cube('East forecourt timber bench seats','wood',(x,y+(k-1.5)*.10,.59),(2.1,.085,.055))
  for z in [.78,.93]:cube('East forecourt timber bench backs','wood',(x,y-.20,z),(2.1,.055,.12))
  for xx in [x-.85,x+.85]:
   for yy in [y-.17,y+.17]:beam('East forecourt bench supports','East bronze',(xx,yy,.15),(xx,yy,.56),.028,sides=6)
   beam('East forecourt bench back supports','East bronze',(xx,y-.20,.15),(xx,y-.20,1.0),.025,sides=6)
 return bed
