"""Two authored north-arrival foyers, with open side doors and real furnishings."""
from architecture_primitives import *

def build_north_foyers(high,coremask):
 mat('East Four foyer oak',(.42,.31,.20),0,.7)
 mat('East Four foyer fabric',(.36,.34,.30),0,.93)
 mat('East Four book ivory',(.72,.68,.57),0,.85)
 mat('East Four book charcoal',(.17,.18,.18),0,.85)
 mat('East Four book clay',(.36,.25,.19),0,.85)
 m=M['East Four foyer oak'];nodes=m.node_tree.nodes;links=m.node_tree.links
 coord=nodes.new('ShaderNodeTexCoord');stretch=nodes.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=(30,.7,30)
 noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1;noise.inputs['Detail'].default_value=2
 ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.30,.22,.14,1);ramp.color_ramp.elements[1].color=(.47,.35,.22,1)
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.1;bump.inputs['Distance'].default_value=.005
 links.new(coord.outputs['Object'],stretch.inputs[0]);links.new(stretch.outputs['Vector'],noise.inputs['Vector']);links.new(noise.outputs['Fac'],ramp.inputs['Fac']);links.new(ramp.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color']);links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
 for floor in [.15,3.35]:
  # The side walls stop short of the inner cross-corridor and the source gallery seam.
  for x in [-49.10,-38.90]:
   wall=box(x-.09,136.5,x+.09,152.65).intersection(high).difference(coremask)
   door=box(x-.2,141.9,x+.2,144.1)
   window=box(x-.2,137.5,x+.2,140.3)
   slab('East Four foyer solid side partitions','East white',wall.difference(door).difference(window),floor,3.0)
   slab('East Four foyer side door headers','East white',wall.intersection(door),floor+2.45,.55)
   slab('East Four foyer window sill walls','East white',wall.intersection(window),floor,.80)
   slab('East Four foyer window head walls','East white',wall.intersection(window),floor+2.4,.60)
   cube('East Four foyer fixed inner glazing','East clear glazing',(x,138.9,floor+1.60),(.03,2.8,1.6))
   for y in [137.5,138.9,140.3]:cube('East Four foyer inner window uprights','East bronze',(x,y,floor+1.60),(.10,.045,1.6))
   for z in [.80,2.4]:cube('East Four foyer inner window rails','East bronze',(x,138.9,floor+z),(.10,2.8,.045))
   for y in [141.9,144.1]:cube('East Four foyer open door jambs','East Four foyer oak',(x,y,floor+1.225),(.21,.09,2.45))
   cube('East Four foyer open door lintel','East Four foyer oak',(x,143,floor+2.45),(.21,2.29,.09))
   # The ground and upper thresholds stay at their own existing floor levels.
   side=1 if x<-44 else -1
   cube('East Four foyer skirting','East stone',(x+side*.105,149.2,floor+.065),(.03,6.7,.13))
  # A seated waiting place stays completely outside the central walking strip.
  x=-48.42;y=149.25
  base=box(x-.34,y-1.8,x+.34,y+1.8).buffer(-.08).buffer(.08,quad_segs=8)
  slab('East Four foyer rounded bench base','East Four foyer oak',base,floor+.35,.09)
  for j in range(3):
   yy=y+(j-1)*1.17;cushion=box(x-.29,yy-.56,x+.29,yy+.56).buffer(-.06).buffer(.06,quad_segs=8)
   slab('East Four foyer separate cushions','East Four foyer fabric',cushion,floor+.44,.09)
  cube('East Four foyer bench back','East Four foyer oak',(x-.31,y,floor+.76),(.06,3.6,.65))
  for yy in [y-1.5,y,y+1.5]:
   for xx in [x-.24,x+.24]:beam('East Four foyer bench supports','East bronze',(xx,yy,floor),(xx,yy,floor+.35),.025,sides=8)
  # A shallow reading shelf, not a wall of decorative control panels.
  cube('East Four foyer bookcase back','East Four foyer oak',(-39.025,149.25,floor+1.2),(.07,3.6,2.2))
  for height in [.65,1.15,1.65]:
   cube('East Four foyer book shelves','East Four foyer oak',(-39.16,149.25,floor+height),(.28,3.6,.055))
   for j in range(12):
    yy=147.75+j*.11;h=.22+.035*(j%4)
    cube('East Four foyer individual books',['East Four book ivory','East Four book charcoal','East Four book clay'][j%3],(-39.15,yy,floor+height+.0275+h/2),(.18,.065,h))
  for y in [138.0,140.5,145.5,147.0]:
   cube('East Four foyer ceiling baffles','East Four foyer oak',(-44,y,floor+2.93),(9.6,.08,.14))
 return [(-47.2,149.25,3.12),(-40.7,149.25,3.12),(-47.2,149.25,6.32),(-40.7,149.25,6.32)]

def build_ground_reading_room(high):
 """One illustrative 24-seat room beside the east foyer door; other rooms remain unfinished."""
 floor=.15
 south=box(-38.81,136.41,-25,136.59).difference(box(-32.6,136.3,-30.4,136.7))
 east=box(-25.09,136.5,-24.91,154)
 slab('East Four reading room partitions','East white',south.union(east).intersection(high),floor,3.0)
 cube('East Four reading south door header','East white',(-31.5,136.5,2.875),(2.2,.18,.55))
 for x in [-32.6,-30.4]:cube('East Four reading south door jambs','East Four foyer oak',(x,136.5,1.375),(.09,.21,2.45))
 for x in [-34.5,-28.4]:
  for y in [140.5,147.0]:
   top=box(x-1.35,y-.5,x+1.35,y+.5).buffer(-.12).buffer(.12,quad_segs=12)
   slab('East Four reading rounded tables','East Four foyer oak',top,floor+.72,.055)
   for xx in [x-1.1,x+1.1]:
    for yy in [y-.32,y+.32]:beam('East Four reading table legs','East bronze',(xx,yy,floor),(xx,yy,floor+.72),.035,sides=8)
   for xx in [x-.90,x,x+.90]:
    for side in [-1,1]:
     yy=y+side*.95
     seat=box(xx-.24,yy-.235,xx+.24,yy+.235).buffer(-.055).buffer(.055,quad_segs=8)
     slab('East Four reading chair seat shells','East Four foyer oak',seat,floor+.40,.045)
     slab('East Four reading seat pads','East Four foyer fabric',seat.buffer(-.015),floor+.445,.035)
     cube('East Four reading chair backs','East Four foyer oak',(xx,yy+side*.22,floor+.73),(.48,.055,.42))
     for dx in [-.18,.18]:
      for dy in [-.17,.17]:beam('East Four reading chair legs','East bronze',(xx+dx,yy+dy,floor),(xx+dx,yy+dy,floor+.40),.019,sides=8)
      beam('East Four reading back supports','East bronze',(xx+dx,yy+side*.20,floor+.40),(xx+dx,yy+side*.20,floor+.90),.018,sides=8)
   # A few actual layered notebooks, not a photographic decal.
   for j in [-1,1]:
    cube('East Four reading notebook covers','East Four book charcoal',(x+j*.75,y,.934),(.32,.42,.018),j*.09)
    cube('East Four reading notebook pages','East Four book ivory',(x+j*.75,y,.947),(.30,.40,.008),j*.09)
 # A blank writing surface is intentionally not invented campus information.
 cube('East Four reading board frame','East bronze',(-25.135,143.5,1.65),(.055,3.0,1.3))
 cube('East Four reading whiteboard','porcelain',(-25.169,143.5,1.65),(.016,2.90,1.20))
 cube('East Four reading pen tray','East bronze',(-25.22,143.5,1.015),(.14,2.90,.035))
 return [(x,y,3.12) for x in [-34.5,-28.4] for y in [140.5,147.0]]+[(-31.5,134.8,3.12)]
