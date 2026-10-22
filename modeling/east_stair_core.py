"""One authored, inspectable East One stair core. Actual stairs and floor openings, not an as-built claim."""
import math
from architecture_primitives import *

def dimensions(foot):
 x0,y0,x1,y1=foot.bounds;cx=(x0+x1)/2
 front=foot.intersection(LineString([(cx,y0-1),(cx,y1+1)])).bounds[1]
 return x0+.20,y0+.25,x1-.20,y1-.20,cx,front

def floor_opening(foot):
 x0,y0,x1,y1,_,_=dimensions(foot)
 return box(x0,y0+1.2,x1,y1)

def stair_flight(owner,xa,xb,start,base,rise,direction=1):
 # One closed stair profile avoids overlapping tread/waist side faces.
 points=[(0,base-.28),(0,base)]
 for j in range(10):
  points.extend([(j*.26,base+(j+1)*rise),((j+1)*.26,base+(j+1)*rise)])
 points.append((2.6,base+10*rise-.28))
 profile=orient(Polygon([(start+direction*t,z) for t,z in points]),1)
 for triangle in constrained_delaunay_triangles(profile).geoms:
  if triangle.difference(profile).area>1e-7:continue
  yz=list(orient(triangle,1).exterior.coords)[:3]
  face(owner,'East white',[(xb,y,z) for y,z in yz])
  face(owner,'East white',[(xa,y,z) for y,z in reversed(yz)])
 coords=list(profile.exterior.coords)
 for (y,z),(yy,zz) in zip(coords,coords[1:]):
  face(owner,'East white',[(xa,y,z),(xa,yy,zz),(xb,yy,zz),(xb,y,z)])

def build_core(foot,levels,entry_offset=0,ground_side_entry=False):
 x0,y0,x1,y1,cx,front=dimensions(foot);outer_x0,outer_y0,outer_x1,outer_y1=foot.bounds
 start=y0+1.2;mid_y=start+2.6;door_y=outer_y0+.85;door_cx=cx+entry_offset
 shell=foot.difference(foot.buffer(-.15));front_window=box(x0,outer_y0-.1,x1,front+.18)
 side_door=box(outer_x1-.25,door_y-.5,outer_x1+.15,door_y+.5)
 glazing_y=front+.05
 lining=foot.buffer(-.12).difference(foot.buffer(-.15))
 def wall(owner,g,z,height):
  slab(owner,'East core',g.difference(lining),z,height)
  slab(owner+' warm inner finish','East white',g.intersection(lining),z,height)
 # Occupied floors remain aligned with the teaching wing. The roof plant cap is not a claimed public floor.
 for i,(lo,hi) in enumerate(zip(levels,levels[1:]+[16.15])):
  # Low sill and upper lintel close the real window opening, but the ground entrance has no sill across it.
  low_shell=shell
  if i==0:low_shell=low_shell.difference(box(door_cx-.65,outer_y0-.1,door_cx+.65,front+.2))
  else:low_shell=low_shell.difference(side_door)
  if i==0 and ground_side_entry:low_shell=low_shell.difference(side_door)
  wall('East prototype core low wall bands',low_shell,lo,.20)
  middle=shell.difference(front_window)
  if i>0 or ground_side_entry:middle=middle.difference(side_door)
  wall('East prototype core wall sides',middle,lo+.20,2.10)
  wall('East prototype core door headers',shell.difference(front_window),lo+2.30,hi-lo-2.50)
  # The existing teaching-wing floor/roof slab already closes this top band.
  # Do not duplicate its outer face with another core lintel slab.
  if i==0:
   for xa,xb in [(x0,door_cx-.65),(door_cx+.65,x1)]:cube('East core fixed entrance glazing','East clear glazing',((xa+xb)/2,glazing_y,(lo+.2+hi-.2)/2),(xb-xa,.08,hi-lo-.4))
   cube('East core entrance transom','East clear glazing',(door_cx,glazing_y,(lo+2.3+hi-.2)/2),(1.3,.08,hi-lo-2.5))
   hinge=Vector((door_cx-.625,glazing_y));v=Vector((math.cos(math.radians(80)),-math.sin(math.radians(80))));p=hinge+v*.625
   cube('East core open ground door','East clear glazing',(*p,lo+1.15),(1.25,.08,2.26),-math.radians(80))
   for end in [0,1.25]:
    q=hinge+v*end;beam('East core ground door frame','East bronze',(*q,lo+.02),(*q,lo+2.28),.025,sides=6)
   for z in [lo+.02,lo+2.28]:beam('East core ground door rails','East bronze',(*hinge,z),(*(hinge+v*1.25),z),.025,sides=6)
   q=hinge+v*1.05;beam('East core ground door handle','bronze',(*q,lo+.95),(*q,lo+1.5),.02,sides=6)
  else:
   cube('East core upper front glazing','East clear glazing',(cx,glazing_y,(lo+hi)/2),(x1-x0,.08,hi-lo-.4))
  if i>0 or ground_side_entry:
   # Side door opens onto the existing full-level teaching-wing floor, not into the stair void.
   hinge=Vector((outer_x1-.04,door_y-.5));v=Vector((math.sin(math.radians(80)),math.cos(math.radians(80))));p=hinge+v*.5
   cube('East core open upper side door','East clear glazing',(*p,lo+1.15),(1.0,.08,2.26),math.atan2(v.y,v.x))
   for end in [0,1.0]:
    q=hinge+v*end;beam('East core upper door frames','East bronze',(*q,lo+.02),(*q,lo+2.28),.025,sides=6)
   for z in [lo+.02,lo+2.28]:beam('East core upper door rails','East bronze',(*hinge,z),(*(hinge+v),z),.025,sides=6)
   q=hinge+v*.85;beam('East core side door handles','East bronze',(*q,lo+.95),(*q,lo+1.45),.018,sides=6)
  frame_cx=door_cx if i==0 else cx
  for x in [x0,frame_cx-.65,frame_cx+.65,x1]:beam('East core front vertical glazing frames','East bronze',(x,glazing_y,lo+.2),(x,glazing_y,hi-.2),.028,sides=6)
  for z in [lo+.2,hi-.2]:
   runs=[(x0,door_cx-.65),(door_cx+.65,x1)] if i==0 and z==lo+.2 else [(x0,x1)]
   for xa,xb in runs:beam('East core front horizontal glazing frames','East bronze',(xa,glazing_y,z),(xb,glazing_y,z),.028,sides=6)
 # Keep the existing coherent core height and roof cap; do not imply roof access from these occupied-storey stairs.
 slab('East prototype core roof plant shell','East core',shell,16.15,2.0)
 slab('East prototype core roof cap','East bronze',foot.buffer(.15),18.15,.18)
 for lo,hi in zip(levels,levels[1:]):
  rise=(hi-lo)/20;middle=lo+10*rise
  slab('East core mid landings','East white',box(x0,mid_y,x1,y1),middle-.20,.20)
  stair_flight('East core continuous ascending flights',x0,x0+1.2,start,lo,rise)
  stair_flight('East core continuous returning flights',x1-1.2,x1,mid_y,middle,rise,-1)
  for x,base,direction in [(x0+.035,lo,1),(x0+1.165,lo,1),(x1-1.165,middle,-1),(x1-.035,middle,-1)]:
   for j in range(20):
    y=start+j*.13 if direction==1 else mid_y-j*.13;yy=y+direction*.13;z=base+j*rise/2;zz=z+rise/2
    beam('East core stair handrails','East bronze',(x,y,z+1.1),(x,yy,zz+1.1),.03,sides=6)
    beam('East core stair infill','East bronze',(x,y,z),(x,y,z+1.1),.017,sides=6)
  # Guard the central gap without blocking either flight's arrival.
  for y,z in [(mid_y,middle),(start,hi)]:
   for k in range(6):
    x=x0+1.2+(x1-x0-2.4)*k/6;xx=x0+1.2+(x1-x0-2.4)*(k+1)/6
    beam('East core landing gap rails','East bronze',(x,y,z+1.1),(xx,y,z+1.1),.03,sides=6)
    beam('East core landing gap infill','East bronze',(x,y,z),(x,y,z+1.1),.017,sides=6)
 # At the highest occupied level there is no further upward flight: close its front edge.
 hi=levels[-1]
 for k in range(12):
  x=x0+1.2*k/12;xx=x0+1.2*(k+1)/12
  beam('East core top-level well guard','East bronze',(x,start,hi+1.1),(xx,start,hi+1.1),.03,sides=6)
  beam('East core top-level well infill','East bronze',(x,start,hi),(x,start,hi+1.1),.017,sides=6)
 mat('East core diffuser',(.95,.92,.83),0,.4);bs=M['East core diffuser'].node_tree.nodes['Principled BSDF'];bs.inputs['Emission Color'].default_value=(1,.95,.86,1);bs.inputs['Emission Strength'].default_value=3
 lamps=[]
 for underside in [z-.20 for z in levels[1:]]+[15.93]:
  z=underside-.03;cube('East core landing ceiling luminaires','East core diffuser',(cx,y0+.60,z),(.85,.23,.06));lamps.append((cx,y0+.60,z-.04))
 return lamps
