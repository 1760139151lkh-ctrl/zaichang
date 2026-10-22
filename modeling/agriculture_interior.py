"""Authored six-level stairs, arrival halls and connector side rooms.
Other internal rooms are still unfinished; this is not an as-built or code-compliance model.
"""
from architecture_primitives import *
from east_stair_core import stair_flight

def build_stair_structure(prefix,anchor,angle=0):
 starts={key:len(data[0]) for key,data in batches.items()}
 M['East white']=M['facade_white']
 x0,x1,start,mid_y,back=92.2,95.6,12.2,14.8,17.3
 levels=[.15+3.8*i for i in range(6)]
 def rail(name,a,b,z):
  beam(name+' handrail','bronze_dark',(*a,z+1.1),(*b,z+1.1),.028,sides=8)
  count=max(1,math.ceil(math.dist(a,b)/.14))
  for k in range(count+1):
   t=k/count;x=a[0]+(b[0]-a[0])*t;y=a[1]+(b[1]-a[1])*t
   beam(name+' infill','bronze_dark',(x,y,z),(x,y,z+1.1),.015,sides=6)
 for lo,hi in zip(levels,levels[1:]):
  rise=(hi-lo)/20;middle=(hi+lo)/2
  stair_flight(prefix+' entrance actual ascending stairs',x0,x0+1.2,start,lo,rise)
  stair_flight(prefix+' entrance actual returning stairs',x1-1.2,x1,mid_y,middle,rise,-1)
  slab(prefix+' entrance actual mid landings','facade_white',box(x0,mid_y,x1,back),middle-.2,.2)
  for x,base,direction in [(x0+.035,lo,1),(x0+1.165,lo,1),(x1-1.165,middle,-1),(x1-.035,middle,-1)]:
   origin=start if direction==1 else mid_y
   for j in range(20):
    y=origin+direction*j*.13;yy=y+direction*.13;z=base+j*rise/2;zz=z+rise/2
    beam(prefix+' entrance sloping handrails','bronze_dark',(x,y,z+1.1),(x,yy,zz+1.1),.028,sides=8)
    beam(prefix+' entrance sloping infill','bronze_dark',(x,y,z),(x,y,z+1.1),.015,sides=6)
  rail(prefix+' middle landing outer edge',(x0,mid_y),(x0,back),middle)
  rail(prefix+' middle landing far edge',(x0,back),(x1,back),middle)
  rail(prefix+' middle landing outer edge',(x1,back),(x1,mid_y),middle)
  rail(prefix+' middle landing central gap',(x0+1.2,mid_y),(x1-1.2,mid_y),middle)
 for z in levels[1:]:
  rail(prefix+' occupied floor opening west',(x0,start),(x0,back),z)
  rail(prefix+' occupied floor opening north',(x0,back),(x1,back),z)
  rail(prefix+' occupied floor opening east',(x1,back),(x1,start),z)
  rail(prefix+' occupied floor opening central gap',(x0+1.2,start),(x1-1.2,start),z)
 rail(prefix+' highest floor closed ascending edge',(x0,start),(x0+1.2,start),levels[-1])
 # The low-headroom space under the bottom flights is physically screened off.
 for x in [92.4+i*.16 for i in range(20)]:cube(prefix+' stair undercroft timber screen','wood',(x,17.4,.95),(.075,.075,1.6))
 for x in [92.1,95.7]:
  for j in range(32):cube(prefix+' stair undercroft side screen','wood',(x,12.4+j*.16,.95),(.075,.075,1.6))
 lamps=[]
 for lo in levels:
  z=lo+3.57;cube(prefix+' occupied landing fixtures','D interior diffuser',(93.9,11.5,z),(.9,.35,.06));lamps.append((93.9,11.5,z-.04))
 # Mid-landing lights belong under the next mid-landing, not in the open floor well.
 for i in range(len(levels)-1):
  support=(levels[i+1]+levels[i+2])/2-.2 if i<len(levels)-2 else 22.75
  z=support-.03;cube(prefix+' mid landing supported fixtures','D interior diffuser',(93.9,16.2,z),(.9,.35,.06));lamps.append((93.9,16.2,z-.04))
 ca,sa=math.cos(angle),math.sin(angle)
 def positioned(x,y,z):
  x-=92;y-=11
  return (anchor[0]+x*ca-y*sa,anchor[1]+x*sa+y*ca,z)
 for key,(vertices,faces) in batches.items():
  begin=starts.get(key,0)
  for i in range(begin,len(vertices)):vertices[i]=positioned(*vertices[i])
 return [positioned(*p) for p in lamps]

def stair_opening(anchor,angle=0):
 return translate(rotate(box(.2,1.2,3.6,6.3),math.degrees(angle),origin=(0,0)),*anchor)

def build_d_stair(envelope):
 levels=[.15+3.8*i for i in range(6)]
 stair_lamps=build_stair_structure('D',(92,11))
 # Define this entrance hall without pretending that all the other rooms are finished.
 walls=unary_union([box(79,0,79.18,20.1),box(99.82,0,100,20.1),box(79,19.92,100,20.1)]).intersection(envelope)
 openings=unary_union([box(85.8,19.8,88.2,20.2),box(99.7,14,100.1,16),box(78.9,11.75,79.3,14.35)])
 for lo in levels:
  slab('D entrance hall actual partitions','facade_white',walls.difference(openings),lo,3.6)
  slab('D entrance hall door headers','facade_white',walls.intersection(openings),lo+2.5,1.1)
  for x in [85.8,88.2]:cube('D hall north door jambs','wood',(x,20.0,lo+1.25),(.09,.24,2.5))
  for y in [11.75,14.35]:cube('D hall west door jambs','wood',(79.09,y,lo+1.25),(.24,.09,2.5))
  for y in [14,16]:cube('D hall east door jambs','wood',(99.91,y,lo+1.25),(.24,.09,2.5))
 mat('D waiting seat fabric',(.32,.30,.26),0,.94)
 cube('D ground waiting bench base','wood',(79.58,16.5,.54),(.75,3.4,.12))
 for y in [15.4,16.5,17.6]:cube('D ground waiting bench cushions','D waiting seat fabric',(79.58,y,.645),(.68,1.04,.09))
 cube('D ground waiting bench back','wood',(79.24,16.5,.92),(.06,3.4,.72))
 for y in [15.1,16.5,17.9]:
  for x in [79.33,79.83]:beam('D waiting bench legs','bronze_dark',(x,y,.15),(x,y,.48),.025,sides=8)
 mat('D interior diffuser',(.95,.92,.84),0,.45);b=M['D interior diffuser'].node_tree.nodes['Principled BSDF'];b.inputs['Emission Color'].default_value=(1,.95,.85,1);b.inputs['Emission Strength'].default_value=3
 lamps=list(stair_lamps)
 for lo in levels:
  for x,y in [(87,10),(85,17),(80.8,13),(80.8,17),(98,13),(87,21.5)]:
   z=lo+3.8-.23;cube('D interior ceiling fixtures','D interior diffuser',(x,y,z),(.9,.35,.06));lamps.append((x,y,z-.04))
 return lamps

CONNECTION_AXES=[('west',(29.2646566,8.9836106),(58.7117537,11.3910065)),('A-C',(191.1068392,-101.3642824),(204.6015786,-151.1051499))]
def build_connection_lights(envelope):
 lamps=[]
 for name,a,b in CONNECTION_AXES:
  line=LineString([a,b]);count=max(1,math.ceil(line.length/5));angle=math.atan2(b[1]-a[1],b[0]-a[0])
  stations=[(j+.5)*line.length/count for j in range(count)]+[-6,-2]+[line.length+d for d in ([2,6,10,14,18,22] if name=='west' else [2,6])]
  direction=Vector(b)-Vector(a);direction.normalize()
  for distance in stations:
   p=Point(*(Vector(a)+direction*distance))
   if not envelope.covers(p.buffer(.5)):continue
   for level in [7.75,11.55,15.35]:
    z=level+3.57;cube('Academic connection mounted ceiling fixtures','D interior diffuser',(p.x,p.y,z),(.9,.35,.06),angle);lamps.append((p.x,p.y,z-.04))
 return lamps

def build_west_corridor(foot):
 """One four-metre circulation spine and four side rooms per bridge level.
 This is an authored academic-room layout, not a surveyed campus floor plan.
 """
 _,a,b=CONNECTION_AXES[0];u=(Vector(b)-Vector(a)).normalized();v=Vector((-u.y,u.x));length=math.dist(a,b);angle=math.atan2(u.y,u.x)
 def point(s,t,z):return (a[0]+u.x*s+v.x*t,a[1]+u.y*s+v.y*t,z)
 def area(s0,t0,s1,t1):return translate(rotate(box(s0,t0,s1,t1),math.degrees(angle),origin=(0,0)),*a).intersection(foot)
 lamps=[]
 for lo in [7.75,11.55,15.35]:
  for side in [-1,1]:
   t=side*2;wall=area(.6,t-.08,length-.6,t+.08)
   openings=unary_union([area(s-.6,t-.2,s+.6,t+.2) for s in [length*.25,length*.75]])
   solid=wall.difference(openings)
   slab('West connection corridor low walls','facade_white',solid,lo,.95)
   slab('West connection corridor head walls','facade_white',wall,lo+2.5,1.1)
   glass=area(.6,t-.025,length-.6,t+.025).difference(openings)
   slab('West connection internal fixed glazing','interior clear glazing',glass,lo+.95,1.55)
   # Bottom rails stop at each door; the high rail becomes the door lintel.
   beam('West corridor continuous upper rails','bronze_dark',point(.6,t,lo+2.5),point(length-.6,t,lo+2.5),.024,sides=8)
   spans=[(.6,length*.25-.6),(length*.25+.6,length*.75-.6),(length*.75+.6,length-.6)]
   for start,end in spans:
    beam('West corridor interrupted sill rails','bronze_dark',point(start,t,lo+.95),point(end,t,lo+.95),.024,sides=8)
    count=max(1,math.ceil((end-start)/3))
    for k in range(count+1):
     station=start+(end-start)*k/count;beam('West corridor window uprights','bronze_dark',point(station,t,lo+.95),point(station,t,lo+2.5),.024,sides=8)
   for station in [length*.25,length*.75]:
    for offset in [-.6,.6]:beam('West side room actual door jambs','bronze_dark',point(station+offset,t,lo),point(station+offset,t,lo+2.5),.035,sides=8)
    hinge=Vector(point(station-.55,t,lo)[:2]);direction=u*math.cos(math.radians(80))+v*side*math.sin(math.radians(80));middle=hinge+direction*.55;rot=math.atan2(direction.y,direction.x)
    cube('West side room open leaves','interior clear glazing',(*middle,lo+1.23),(1.1,.06,2.42),rot)
    for end in [0,1.1]:
     q=hinge+direction*end;beam('West side room moving stiles','bronze_dark',(*q,lo+.02),(*q,lo+2.44),.023,sides=8)
    for z in [lo+.02,lo+2.44]:beam('West side room moving rails','bronze_dark',(*hinge,z),(*(hinge+direction*1.1),z),.023,sides=8)
    q=hinge+direction*.90;beam('West side room door handle','bronze_dark',(*q,lo+.95),(*q,lo+1.4),.018,sides=8)
    x,y,_=point(station,side*5.8,lo)
    if foot.covers(Point(x,y).buffer(.6)):
     z=lo+3.57;cube('West side room ceiling fixtures','D interior diffuser',(x,y,z),(1.1,.45,.06),angle);lamps.append((x,y,z-.04))
   divider=area(length/2-.08,2.08 if side>0 else -40,length/2+.08,40 if side>0 else -2.08)
   slab('West connection actual room separators','facade_white',divider,lo,3.6)
 return lamps


def build_a_stair(envelope):
 lamps=build_stair_structure('A north',(177.8,-169.5),math.pi)
 for lo in [.15+3.8*i for i in range(6)]:
  sites=[(205,y) for y in [-155,-161,-168.7]]+[(x,-168.7) for x in [198,191,184,177,163,156]]+[(170,-168)]
  for x,y in sites:
   if not envelope.covers(Point(x,y).buffer(.6)):continue
   z=lo+3.57;cube('A north arrival ceiling fixtures','D interior diffuser',(x,y,z),(.9,.35,.06));lamps.append((x,y,z-.04))
 for k in range(4):cube('A north waiting bench seat','wood',(166,-179.9+(k-1.5)*.10,.59),(2.6,.085,.055))
 for z in [.80,.95]:cube('A north waiting bench back','wood',(166,-180.14,z),(2.6,.055,.12))
 for x in [165,167]:
  for y in [-180.08,-179.72]:beam('A north waiting bench legs','bronze_dark',(x,y,.15),(x,y,.56),.026,sides=8)
  beam('A north waiting bench back supports','bronze_dark',(x,-180.14,.15),(x,-180.14,1.02),.024,sides=8)
 return lamps

def build_b_stair(envelope):
 lamps=build_stair_structure('B street',(16,-19),math.pi/2)
 levels=[.15+3.8*i for i in range(6)]
 walls=unary_union([box(8,-24,8.18,-10),box(8,-24,22,-23.82),box(8,-10.18,22,-10)]).intersection(envelope)
 opening=box(16.15,-10.3,18.85,-9.9)
 for lo in levels:
  slab('B street lobby actual partitions','facade_white',walls.difference(opening),lo,3.6)
  slab('B street lobby north header','facade_white',walls.intersection(opening),lo+2.5,1.1)
  for x in [16.15,18.85]:cube('B lobby north jambs','wood',(x,-10.09,lo+1.25),(.09,.24,2.5))
  for x,y in [(17.5,y) for y in [-17,-10,-3,4,9]]+[(11.7,-11.6)]:
   if envelope.covers(Point(x,y).buffer(.6)):
    z=lo+3.57;cube('B street arrival ceiling fixtures','D interior diffuser',(x,y,z),(.9,.35,.06));lamps.append((x,y,z-.04))
 # Two seats and a shared low table belong to this smaller street foyer.
 for x in [10.4,12.4]:
  y=-10.65;cube('B lobby chair wood bases','wood',(x,y,.465),(.74,.76,.05))
  cube('B lobby chair cushions','D waiting seat fabric',(x,y,.57),(.70,.70,.16))
  cube('B lobby chair backs','D waiting seat fabric',(x,y+.32,.88),(.74,.15,.60))
  for dx in [-.36,.36]:cube('B lobby chair arms','wood',(x+dx,y,.79),(.10,.76,.16))
  for dx in [-.27,.27]:
   for dy in [-.27,.27]:beam('B lobby chair supports','bronze_dark',(x+dx,y+dy,.15),(x+dx,y+dy,.44),.025,sides=8)
 table=Point(11.4,-11.1).buffer(.32,quad_segs=32)
 slab('B lobby small round table','wood',table,.57,.04)
 slab('B lobby table foot','bronze_dark',Point(11.4,-11.1).buffer(.25,quad_segs=24),.15,.03)
 beam('B lobby table stem','bronze_dark',(11.4,-11.1,.18),(11.4,-11.1,.57),.045,sides=12)
 cube('B lobby book cover','bronze_dark',(11.4,-11.1,.6175),(.25,.32,.015),.12)
 cube('B lobby book pages','porcelain',(11.4,-11.1,.631),(.23,.30,.012),.12)
 return lamps


def build_a_arrival_rooms(envelope):
 """A north arm: a lit public corridor with rooms, not an unbroken empty hall."""
 lamps=[]
 # The staircase gets its own wide opening; room doors open away from the public corridor.
 spans=[(163.5,171.6),(180,211.5)]
 doors=[168,187.5,201]
 for lo in [.15+3.8*i for i in range(6)]:
  wall=unary_union([box(x0,-170.78,x1,-170.62) for x0,x1 in spans]).intersection(envelope)
  doorcuts=unary_union([box(x-.6,-171,x+.6,-170.4) for x in doors])
  windows=unary_union([box(x-.9,-171,x+.9,-170.4) for x in [165.2,170,182.2,184.7,190.7,193.4,197,204.2,207.5,210]])
  slab('A north room sill walls','facade_white',wall.difference(doorcuts),lo,.95)
  slab('A north room piers','facade_white',wall.difference(doorcuts).difference(windows),lo+.95,1.55)
  slab('A north room head walls','facade_white',wall,lo+2.5,1.1)
  slab('A north room fixed glass','interior clear glazing',wall.intersection(windows).difference(doorcuts),lo+.95,1.55)
  for x in doors:
   for dx in [-.6,.6]:cube('A room doorway jambs','wood',(x+dx,-170.70,lo+1.25),(.07,.25,2.5))
   hinge=Vector((x-.55,-170.70));u=Vector((math.cos(math.radians(80)),-math.sin(math.radians(80))))
   q=hinge+u*.55;cube('A room open door leaves','wood',(*q,lo+1.23),(1.1,.055,2.42),-math.radians(80))
   q=hinge+u*.92;beam('A room door handles','bronze_dark',(*q,lo+1),(*q,lo+1.4),.018,sides=8)
  # These separators stop at the actual north-arm shell, and do not intrude into the stair well.
  divider=unary_union([box(163.42,-181,163.58,-170.78),box(171.52,-181,171.68,-170.78),box(179.82,-181,180,-170.78),box(195.32,-181,195.48,-170.78)]).intersection(envelope)
  slab('A north room separators','facade_white',divider,lo,3.6)
  for x,y in [(166.5,-175),(187.5,-176),(202,-176)]:
   if envelope.covers(Point(x,y).buffer(.6)):
    z=lo+3.57;cube('A room ceiling lights','D interior diffuser',(x,y,z),(1.2,.4,.06));lamps.append((x,y,z-.04))
 # One ground-floor study room is furnished individually; upper rooms remain unfinished.
 tabletop=box(165.5,-176,167.5,-175).buffer(-.12).buffer(.12)
 slab('A small study rounded tabletop','wood',tabletop,.90,.05)
 for x in [165.72,167.28]:
  for y in [-175.78,-175.22]:cube('A small study table legs','bronze_dark',(x,y,.525),(.055,.055,.75))
 for x in [165.95,167.05]:
  for side in [-1,1]:
   y=-175.5+side*.95
   cube('A small study chair seat','wood',(x,y,.60),(.50,.47,.055))
   cube('A small study chair cushion','D waiting seat fabric',(x,y,.645),(.45,.42,.035))
   cube('A small study chair back','wood',(x,y+side*.23,.89),(.50,.065,.48))
   for dx in [-.19,.19]:
    for dy in [-.17,.17]:beam('A small study chair legs','bronze_dark',(x+dx,y+dy,.15),(x+dx,y+dy,.57),.02,sides=8)
    beam('A small study back supports','bronze_dark',(x+dx,y+side*.23,.57),(x+dx,y+side*.23,1.10),.018,sides=8)
 cube('A study notebook lower cover','bronze_dark',(166.45,-175.5,.956),(.30,.42,.012),.08)
 cube('A study notebook pages','porcelain',(166.45,-175.5,.967),(.28,.40,.010),.08)
 cube('A study notebook upper cover','bronze_dark',(166.45,-175.5,.978),(.30,.42,.012),.08)

 return lamps


def build_b_arrival_corridor(envelope):
 """An L-shaped approach preserves the bridge-to-stair turn inside B's own footprint."""
 lamps=[]
 wall=unary_union([box(15.42,-10,15.58,11.1),box(15.5,11.02,30,11.18),box(19.5,6.82,30,6.98)]).intersection(envelope)
 doorcuts=unary_union([box(15.2,y-.6,15.8,y+.6) for y in [-4,3.5]]+[box(22.4,10.8,23.6,11.4),box(24.4,6.6,25.6,7.2)])
 win=unary_union([box(15.2,y-.9,15.8,y+.9) for y in [-7.5,0,7.5]]+[box(x-.9,10.8,x+.9,11.4) for x in [18,20.5,26,28.5]]+[box(x-.9,6.6,x+.9,7.2) for x in [21.5,28]])
 for lo in [.15+3.8*i for i in range(6)]:
  slab('B arrival corridor low walls','facade_white',wall.difference(doorcuts),lo,.95)
  slab('B arrival corridor piers','facade_white',wall.difference(doorcuts).difference(win),lo+.95,1.55)
  slab('B arrival corridor headers','facade_white',wall,lo+2.5,1.1)
  slab('B arrival corridor interior windows','interior clear glazing',wall.intersection(win).difference(doorcuts),lo+.95,1.55)
  for x,y,ang in [(15.5,-4,math.pi/2),(15.5,3.5,math.pi/2),(23,11.1,0),(25,6.9,math.pi)]:
   u=Vector((math.cos(ang),math.sin(ang)));v=Vector((-u.y,u.x));center=Vector((x,y))
   for off in [-.6,.6]:q=center+u*off;cube('B arrival room door jambs','wood',(*q,lo+1.25),(.07,.24,2.5),ang)
   hinge=center-u*.55;direction=u*math.cos(math.radians(80))+v*math.sin(math.radians(80));q=hinge+direction*.55
   cube('B arrival room open door','wood',(*q,lo+1.23),(1.1,.055,2.42),math.atan2(direction.y,direction.x))
   q=hinge+direction*.92;beam('B arrival room handles','bronze_dark',(*q,lo+1),(*q,lo+1.4),.018,sides=8)
  for x,y in [(23.8,9),(11,-5),(11,4),(23,15),(25,2.5)]:
   if envelope.covers(Point(x,y).buffer(.6)):
    z=lo+3.57;cube('B arrival room supported lights','D interior diffuser',(x,y,z),(.9,.4,.06));lamps.append((x,y,z-.04))
 return lamps
