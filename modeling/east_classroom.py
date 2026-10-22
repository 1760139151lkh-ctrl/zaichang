"""One authored second-storey teaching room, beside the inspected stair core."""
from architecture_primitives import *

def build_room(foot):
 floor=3.35;ceiling=6.35
 outer=box(-101.15,486.85,-89.85,505.0)
 inner=box(-101,487,-90,505.2)
 walls=outer.difference(inner).difference(box(-93.5,486.7,-92.2,487.2)).intersection(foot)
 slab('East sample classroom partitions','East white',walls,floor,3.0)
 cube('East sample classroom door lintel','East white',(-92.85,486.925,floor+2.65),(1.3,.15,.70))
 # Door opens into the room, away from the corridor walking strip.
 hinge=Vector((-93.5,486.95));v=Vector((math.cos(math.radians(80)),math.sin(math.radians(80))));end=hinge+v*1.3
 cube('East sample classroom open door','wood',(*(hinge+v*.65),floor+1.15),(1.3,.07,2.3),math.radians(80))
 for p in [hinge,end]:beam('East classroom door edge','East bronze',(*p,floor+.02),(*p,floor+2.28),.018,sides=6)
 p=hinge+v*1.12;beam('East classroom door handle','East bronze',(*p,floor+.95),(*p,floor+1.2),.02,sides=6)
 for j in range(115):
  y=487.3+j*.14
  cube('East classroom low timber wall slats','wood',(-100.94,y,floor+.40),(.08,.115,.80))
 cube('East classroom whiteboard backing','East bronze',(-100.89,495.1,5.1),(.08,6.0,1.45))
 cube('East classroom whiteboard face','porcelain',(-100.837,495.1,5.1),(.025,5.88,1.33))
 cube('East classroom marker ledge','East bronze',(-100.72,495.1,4.4),(.25,5.9,.035))
 # Desks look west towards the board. A wider central aisle separates the rows.
 for x in [-98.2,-96.5,-94.8,-93.1,-91.4]:
  for y in [489,491,493,496,498,500,502]:
   if x>-94 and y<490:continue # Keep a real clear arrival zone behind the inward-opening door.
   cube('East classroom individual desktops','wood',(x,y,floor+.755),(.65,1.16,.045))
   for dx in [-.25,.25]:
    for dy in [-.48,.48]:beam('East classroom desk legs','East bronze',(x+dx,y+dy,floor),(x+dx,y+dy,floor+.73),.022,sides=6)
   cx=x+.64
   cube('East classroom chair seats','wood',(cx,y,floor+.46),(.46,.46,.045))
   cube('East classroom chair backs','wood',(cx+.22,y,floor+.69),(.045,.46,.42))
   for dx in [-.18,.18]:
    for dy in [-.18,.18]:beam('East classroom chair legs','East bronze',(cx+dx,y+dy,floor),(cx+dx,y+dy,floor+.44),.018,sides=6)
 cube('East classroom teaching desk','wood',(-99.8,495.1,floor+.86),(.65,1.35,.06))
 for y in [494.55,495.65]:cube('East classroom teaching desk supports','East bronze',(-99.8,y,floor+.42),(.5,.055,.84))
 lamps=[]
 for x in [-98,-93]:
  for y in [491,499]:
   cube('East classroom ceiling panels','porcelain',(x,y,ceiling-.035),(1.2,.45,.07));lamps.append((x,y,ceiling-.08,220))
 for x in [-103,-98,-93]:
  cube('East classroom approach ceiling panels','porcelain',(x,485.2,ceiling-.035),(.9,.35,.07));lamps.append((x,485.2,ceiling-.08,180))
 return lamps


def build_study_room(foot):
 # An authored group-study room, not a claim about the real room's use or plan.
 floor=3.35;ceiling=6.35
 mat('East study charcoal fabric',(.055,.065,.07),0,.90)
 mat('East study book ink',(.075,.08,.09),0,.75)
 mat('East study book sand',(.46,.36,.22),0,.80)
 outer=box(-89.85,486.85,-73.85,505)
 inner=box(-89.85,487,-74,505.2)
 opening=box(-86.6,486.7,-85.3,487.2)
 slab('East group study partitions','East white',outer.difference(inner).difference(opening).intersection(foot),floor,3)
 cube('East group study door lintel','East white',(-85.95,486.925,floor+2.65),(1.3,.15,.70))
 hinge=Vector((-86.6,486.95));v=Vector((math.cos(math.radians(80)),math.sin(math.radians(80))))
 cube('East group study open door','wood',(*(hinge+v*.65),floor+1.15),(1.3,.07,2.3),math.radians(80))
 handle=hinge+v*1.1;beam('East group study door handle','East bronze',(*handle,floor+.95),(*handle,floor+1.2),.02,sides=6)
 # Shelving has actual depth, shelves and varied books; its fronts face the room.
 for y in [492,499]:
  cube('East study bookcase back','wood',(-89.55,y,floor+1.0),(.06,2.8,2.0))
  for yy in [y-1.4,y+1.4]:cube('East study bookcase ends','wood',(-89.30,yy,floor+1.0),(.5,.06,2.0))
  for z in [.10,.55,1.0,1.45,1.95]:cube('East study bookcase shelves','wood',(-89.30,y,floor+z),(.5,2.74,.045))
  for row,z in enumerate([.1225,.5725,1.0225,1.4725]):
   for j in range(15):
    yy=y-1.25+j*.15;h=.25+.035*((j+row)%4)
    cube('East study shelf volumes',['East white','East study book ink','East study book sand'][(j+row)%3],(-89.28,yy,floor+z+h/2),(.30,.09,h))
 lamps=[]
 for x in [-85.6,-78.3]:
  for y in [492,499]:
   cube('East study shared tabletops','wood',(x,y,floor+.755),(2.4,1.45,.05))
   cube('East study table notebook cover','East study book ink',(x-.55,y+.08,floor+.792),(.29,.38,.024),.12)
   cube('East study table notebook pages','porcelain',(x-.55,y+.08,floor+.806),(.275,.365,.008),.12)
   for dx in [-1.02,1.02]:
    for dy in [-.55,.55]:beam('East study table legs','East bronze',(x+dx,y+dy,floor),(x+dx,y+dy,floor+.73),.025,sides=6)
   for side in [-1,1]:
    for dx in [-.65,.65]:
     cx=x+dx;cy=y+side*1.17
     cube('East study chair seats','East study charcoal fabric',(cx,cy,floor+.46),(.48,.46,.05))
     cube('East study chair backs','East study charcoal fabric',(cx,cy+side*.22,floor+.70),(.48,.045,.43))
     for a in [-.18,.18]:
      for b in [-.18,.18]:beam('East study chair legs','East bronze',(cx+a,cy+b,floor),(cx+a,cy+b,floor+.44),.018,sides=6)
   cube('East study ceiling panels','porcelain',(x,y,ceiling-.035),(1.5,.5,.07));lamps.append((x,y,ceiling-.08,260))
 # Low window-side bench leaves the northern circulation strip clear of table chairs.
 for x in [-85.5,-78.5]:
  cube('East study window bench','wood',(x,503.0,floor+.46),(2.5,.55,.06))
  for xx in [x-1,x+1]:cube('East study window bench supports','East bronze',(xx,503.0,floor+.215),(.06,.45,.43))
 cube('East study pinboard frame','East bronze',(-74.09,495.2,5.1),(.06,3.0,1.5))
 cube('East study pinboard','wood',(-74.13,495.2,5.1),(.035,2.9,1.4))
 for y in [488.8,495.4]:
  cube('East study entry ceiling panels','porcelain',(-85.95,y,ceiling-.035),(.9,.35,.07));lamps.append((-85.95,y,ceiling-.08,130))
 return lamps
