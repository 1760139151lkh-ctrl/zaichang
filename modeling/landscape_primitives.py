"""Shared, individually seeded trees with explicit leaf meshes and packed albedo."""
from architecture_primitives import *

def configure_leaf_materials():
 for name,color in [("canopy_olive",(.09,.15,.055)),("canopy_gold",(.32,.26,.10)),("willow",(.25,.34,.17)),("willow_light",(.40,.46,.25))]:
  if name not in M:mat(name,color,0,.85)
 leaf_image=bpy.data.images.load(str(ROOT/'modeling/textures/courtyard-leaf-albedo.png'));leaf_image.pack()
 for material_name in ['canopy_olive','canopy_gold']:
  material=M[material_name];nodes=material.node_tree.nodes;links=material.node_tree.links
  texture=nodes.new('ShaderNodeTexImage');texture.image=leaf_image
  alpha_clip=nodes.new('ShaderNodeMath');alpha_clip.operation='GREATER_THAN';alpha_clip.inputs[1].default_value=.5
  bsdf=nodes.get('Principled BSDF')
  links.new(texture.outputs['Color'],bsdf.inputs['Base Color'])
  links.new(texture.outputs['Alpha'],alpha_clip.inputs[0]);links.new(alpha_clip.outputs[0],bsdf.inputs['Alpha'])
  material.surface_render_method='DITHERED';material.use_transparent_shadow=True
 M['canopy_gold']=M['canopy_olive']

foliage_uv={}
def textured_leaf(owner,material,p,u,v):
 corners=[p-v,p+v,p+u+v,p+u-v];uvs=[(0,0),(1,0),(1,1),(0,1)]
 center=p+u*.5+Vector((0,0,.008))
 for j in range(4):
  face(owner,material,[tuple(corners[(j+1)%4]),tuple(corners[j]),tuple(center)])
  foliage_uv.setdefault((owner,material),[]).append([uvs[(j+1)%4],uvs[j],(.5,.5)])

def willow(x,y,size=1,seed=1):
 owner=f'Willow {seed:02d}';rng=random.Random(seed)
 beam(owner,'wood',(x,y,0),(x+.22*size,y,3.9*size),.23*size,.12*size)
 for branch in range(8):
  angle=branch*2*math.pi/8+seed*.31;r=(1.6+rng.random()*.9)*size
  end=Vector((x+math.cos(angle)*r,y+math.sin(angle)*r,(4.6+rng.random()*.8)*size))
  beam(owner,'wood',(x+.15*size,y,2.9*size),end,.11*size,.027*size)
  for spray in range(18):
   a=angle+(spray-8.5)*.11
   start=Vector((x+.15*size,y,3.2*size)).lerp(end,.45+.55*(spray/17))
   extension=(.8+rng.random()*.7)*size
   drop=(1.6+rng.random()*1.6)*size
   def strand(t):
    return start+Vector((math.cos(a)*extension*math.sin(t*math.pi/2),math.sin(a)*extension*math.sin(t*math.pi/2),.28*math.sin(t*math.pi)-drop*t*t))
   for j in range(6):beam(owner,'wood',strand(j/6),strand((j+1)/6),.011*size,.006*size,sides=5)
   for j in range(70):
    t=(j+.35)/70;stem=strand(t)
    for side in [-1,1]:
     az=a+side*(.65+rng.random()*.6);length=(.11+rng.random()*.07)*size;width=.018*size
     v=Vector((math.cos(az)*length,math.sin(az)*length,-length*.7));cross=Vector((-math.sin(az)*width,math.cos(az)*width,0))
     root=stem+Vector((side*.025,0,0));tip=root+v;mid=root+v*.53
     material='willow_light' if (j+spray+branch)%4==0 else 'willow'
     # Narrow, folded lanceolate leaves rather than balloon-like crown blobs.
     face(owner,material,[tuple(root),tuple(mid+cross),tuple(mid+Vector((0,0,.015*size)))])
     face(owner,material,[tuple(mid+cross),tuple(tip),tuple(mid+Vector((0,0,.015*size)))])
     face(owner,material,[tuple(tip),tuple(mid-cross),tuple(mid+Vector((0,0,.015*size)))])
     face(owner,material,[tuple(mid-cross),tuple(root),tuple(mid+Vector((0,0,.015*size)))])

def broadleaf(x,y,scale,seed):
 """Branch-and-leaf geometry: a spreading garden tree, distinct from riverside willows."""
 owner=f'Courtyard shade tree {seed}';rng=random.Random(seed)
 beam(owner,'wood',(x,y,.12),(x+.12,y,3.4*scale),.26*scale,.12*scale)
 beam(owner,'wood',(x+.12,y,3.3*scale),(x+.28,y+.16,5.15*scale),.12*scale,.025*scale)
 for branch in range(9):
  az=branch*math.tau/9+rng.uniform(-.2,.2)
  reach=1.4+rng.random()*1.6
  end=Vector((x+math.cos(az)*reach*scale,y+math.sin(az)*reach*scale,(6.2-.7*reach+rng.random()*.6)*scale))
  root=Vector((x+.12,y,(2.1+rng.random()*.6)*scale))
  control=root.lerp(end,.45)+Vector((0,0,.55*scale))
  def branch_point(t):return root*(1-t)**2+control*(2*t*(1-t))+end*t*t
  for segment in range(4):
   t=segment/4;u=(segment+1)/4
   beam(owner,'wood',branch_point(t),branch_point(u),(.12-.096*t)*scale,(.12-.096*u)*scale)
  for shoot in range(10):
   a=az+rng.uniform(-1.0,1.0)
   center=branch_point(.45+shoot*.055)+Vector((math.cos(a)*1.1*scale,math.sin(a)*1.1*scale,rng.uniform(.3,1.2)*scale))
   beam(owner,'wood',branch_point(.65),center,.023*scale,.006*scale,5)
   for j in range(180):
    theta=rng.random()*math.tau;r=rng.random()**.5*1.15*scale
    p=center+Vector((math.cos(theta)*r,math.sin(theta)*r,rng.uniform(-.5,.5)*scale))
    a=rng.random()*math.tau;length=rng.uniform(.18,.32)*scale
    u=Vector((math.cos(a)*length,math.sin(a)*length,rng.uniform(-.10,.15)))
    v=Vector((-math.sin(a)*length*.282,math.cos(a)*length*.282,0))
    material='canopy_gold' if (j+branch)%7==0 else 'canopy_olive'
    textured_leaf(owner,material,p,u,v)
 if seed%2 or seed in [33,34]:
  for cluster in range(5):
   center=Vector((x+rng.uniform(-.8,.8)*scale,y+rng.uniform(-.8,.8)*scale,(5.3+rng.random()*.65)*scale))
   beam(owner,'wood',(x+.28,y+.16,5.0*scale),center,.025*scale,.006*scale,6)
   for leaf in range(200):
    angle=rng.random()*math.tau;radius=math.sqrt(rng.random())*.95*scale
    p=center+Vector((math.cos(angle)*radius,math.sin(angle)*radius,rng.uniform(-.4,.4)*scale))
    az=rng.random()*math.tau;length=rng.uniform(.18,.30)*scale
    u=Vector((math.cos(az)*length,math.sin(az)*length,rng.uniform(-.12,.12)))
    v=Vector((-math.sin(az)*length*.282,math.cos(az)*length*.282,0))
    textured_leaf(owner,'canopy_olive',p,u,v)


def shrub(owner,x,y,ground=.0,size=1.0,seed=1):
 """Rounded, branching shrub; leaves grow along twigs, never a solid green blob."""
 rng=random.Random(seed)
 for branch in range(8):
  angle=branch*math.tau/8+rng.uniform(-.18,.18)
  root=Vector((x+rng.uniform(-.03,.03),y+rng.uniform(-.03,.03),ground))
  core=root+Vector((math.cos(angle)*.12*size,math.sin(angle)*.12*size,.40*size))
  beam(owner+' stems','wood',root,core,.012*size,.005*size,6)
  for twig in range(7):
   az=angle+rng.uniform(-1.0,1.0);height=rng.uniform(.10,.77)
   radius=.34*math.sqrt(max(.02,1-((height-.43)/.38)**2))*rng.uniform(.72,1.10)
   tip=Vector((x+math.cos(az)*radius*size,y+math.sin(az)*radius*size,ground+height*size))
   start=root.lerp(core,rng.uniform(.50,1.0));beam(owner+' twigs','wood',start,tip,.004*size,.0015*size,5)
   for leaf in range(8):
    t=.30+.70*(leaf+.4)/8;p=start.lerp(tip,t)
    for side in [-1,1]:
     direction=az+side*rng.uniform(.55,1.45);length=rng.uniform(.075,.12)*size
     u=Vector((math.cos(direction)*length,math.sin(direction)*length,rng.uniform(-.035,.045)*size))
     v=Vector((-math.sin(direction)*length*.282,math.cos(direction)*length*.282,0))
     textured_leaf(owner+' leaves','canopy_olive',p,u,v)
