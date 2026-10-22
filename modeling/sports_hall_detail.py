"""Source-centred sports hall, individually composed schematic architecture.
The circular roof, cable expression and authored interiors are not surveyed dimensions.
"""
import sys,math,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from architecture_primitives import *
from landscape_primitives import configure_leaf_materials,foliage_uv,broadleaf
OUT=ROOT/'modeling/sports-hall-work';OUT.mkdir(exist_ok=True)
fid='way/161417065';source=allshapes[fid];cx,cy=source.centroid.x,source.centroid.y
R=min(source.bounds[2]-source.bounds[0],source.bounds[3]-source.bounds[1])/2
mat('hall_stone',(.72,.69,.61),0,.68);mat('hall_metal',(.79,.79,.74),.42,.35)
mat('hall_glass',(.07,.105,.115),.40,.24);mat('hall_bronze',(.33,.25,.14),.7,.3)
mat('hall_dark',(.17,.18,.17),.15,.56);mat('hall_timber',(.45,.29,.15),0,.65)
def pos(r,a,z):return (cx+r*math.cos(a),cy+r*math.sin(a),z)
def circle(radius):return Point(cx,cy).buffer(radius,quad_segs=64)
foot=circle(R);base=circle(R+7)
clip=box(cx-105,cy-105,cx+105,cy+105)
slab('Surrounding ground','ground',clip,-.5,.5)
def rounded_ring_centerline(g):
 # Centripetal interpolation passes through every retained source/junction point.
 points=[Vector(p) for p in list(g.coords)[:-1]];out=[]
 for i in range(len(points)):
  p0,p1,p2,p3=[points[j%len(points)] for j in [i-1,i,i+1,i+2]]
  t0=0;t1=t0+(p1-p0).length**.5;t2=t1+(p2-p1).length**.5;t3=t2+(p3-p2).length**.5
  if min(t1-t0,t2-t1,t3-t2)<1e-8:return g
  count=max(4,math.ceil((p2-p1).length/.75))
  for k in range(count):
   t=t1+(t2-t1)*k/count
   A1=p0*((t1-t)/(t1-t0))+p1*((t-t0)/(t1-t0));A2=p1*((t2-t)/(t2-t1))+p2*((t-t1)/(t2-t1));A3=p2*((t3-t)/(t3-t2))+p3*((t-t2)/(t3-t2))
   B1=A1*((t2-t)/(t2-t0))+A2*((t-t0)/(t2-t0));B2=A2*((t3-t)/(t3-t1))+A3*((t-t1)/(t3-t1))
   out.append(tuple(B1*((t2-t)/(t2-t1))+B2*((t-t1)/(t2-t1))))
 smooth=LineString(out+[out[0]]);offset=smooth.hausdorff_distance(g)
 print('Sports hall display ring offset metres',offset,'source unchanged')
 return smooth if smooth.is_simple and offset<=2.0 else g
road_parts=[];walk_parts=[]
for feature in features:
 props=feature['properties'];g=allshapes[feature['id']]
 if props.get('kind')!='road' or not g.intersects(clip) or props.get('tunnel') in ['yes','culvert'] or props.get('indoor')=='yes':continue
 if feature['id']=='way/305832013':g=rounded_ring_centerline(g)
 pedestrian=props.get('highway') in ['footway','pedestrian','path','steps']
 geometry=g if g.geom_type in ['Polygon','MultiPolygon'] else g.buffer(1.2 if pedestrian else 3.25,cap_style=2,join_style=2)
 (walk_parts if pedestrian else road_parts).append(geometry.intersection(clip))
roads=unary_union(road_parts).difference(foot)
concourse=base.union(unary_union(walk_parts)).difference(foot).difference(roads).intersection(clip)
configure_leaf_materials();mat('Hall tree soil',(.16,.12,.075),0,.95)
pits=[]
neighbor_buildings=unary_union([allshapes[f['id']] for f in features if f['properties'].get('kind')=='building' and f['id']!=fid and allshapes[f['id']].intersects(clip)])
source_walk_lines=unary_union([allshapes[f['id']].buffer(3) for f in features if f['properties'].get('kind')=='road' and f['properties'].get('highway') in ['footway','path'] and allshapes[f['id']].geom_type=='LineString' and allshapes[f['id']].intersects(clip)])
for i,a in enumerate([math.pi/4,3*math.pi/4,5*math.pi/4,7*math.pi/4]):
 x,y,_=pos(R+22,a,0);pit=Point(x,y).buffer(1.45,quad_segs=24)
 if pit.buffer(3).intersects(roads) or pit.intersects(source_walk_lines) or pit.buffer(3).intersects(neighbor_buildings):continue
 pits.append(pit);slab('Entry grove soil','Hall tree soil',pit,0,.12);slab('Entry grove edging','hall_stone',pit.buffer(.12).difference(pit),.02,.13)
 broadleaf(x,y,.98+i*.035,810+i)
pit_union=unary_union(pits)
concourse=concourse.difference(pit_union.buffer(.12))

slab('Source vehicle roads','road',roads,0,.12)
slab('Public entrance concourse','paving',concourse,0,.15)
# Soft grade transitions connect the raised finish to the surrounding level.
apron=concourse.buffer(3,join_style=2).difference(concourse).difference(foot).difference(roads).difference(pit_union.buffer(.12)).intersection(clip)
for p in polygons(apron):
 for triangle in constrained_delaunay_triangles(p.segmentize(.75)).geoms:
  if triangle.difference(p).area>1e-6:continue
  face('Concourse graded edge','paving',[(x,y,max(.005,.15*(1-Point(x,y).distance(concourse)/3))) for x,y in list(orient(triangle,1).exterior.coords)[:3]])

slab('Main hall floor','hall_timber',circle(R-1.2),0,.15)
# Continuous ring facade: four recessed door groups interrupt the lower shell.
entry_angles=[0,math.pi/2,math.pi,3*math.pi/2]
entry_cuts=[]
for a in entry_angles:
 u=Vector((math.cos(a),math.sin(a)));v=Vector((-u.y,u.x));c=Vector((cx,cy))+u*(R-.4)
 entry_cuts.append(Polygon([tuple(c+u*x+v*y) for x,y in [(-2,-5),(2,-5),(2,5),(-2,5)]]))
entries=unary_union(entry_cuts)
wall=circle(R).difference(circle(R-.55))
slab('Stone ground plinth','hall_stone',wall.difference(entries),.15,.65)
slab('Entry lintel ring','hall_stone',wall,4.0,.45)
slab('Upper facade cornice','hall_metal',circle(R+.3).difference(circle(R-.9)),8.8,.90)
N=160
for i in range(N):
 a=i*math.tau/N;b=(i+1)*math.tau/N;mid=(a+b)/2
 door_sector=min(abs(math.atan2(math.sin(mid-e),math.cos(mid-e))) for e in entry_angles)<.087
 if not door_sector:
  face('Lower glass facade','hall_glass',[pos(R-.25,a,.80),pos(R-.25,b,.80),pos(R-.25,b,4.0),pos(R-.25,a,4.0)])
 face('Upper glass facade','hall_glass',[pos(R-.25,a,4.45),pos(R-.25,b,4.45),pos(R-.25,b,8.8),pos(R-.25,a,8.8)])
 beam('Facade mullions','hall_bronze',pos(R,a,.15 if not door_sector else 4.45),pos(R,a,8.8),.05,sides=6)
 if i%4==0:
  beam('Perimeter structural columns','hall_stone',pos(R-.8,a,.15),pos(R-.8,a,9.1),.23,sides=10)
# Four sheltering, recessed entrances retain a genuinely open approach.
for k,a in enumerate(entry_angles):
 u=Vector((math.cos(a),math.sin(a)));v=Vector((-u.y,u.x));c=Vector((cx,cy))+u*(R-1.0)
 for y in [-3.6,-1.2,1.2,3.6]:
  p=c+v*y;cube('Recessed double doors','hall_glass',(*p,1.95),(.14,2.25,3.60),a)
  for d in [-1.15,0,1.15]:
   q=p+v*d;cube('Door frames','hall_bronze',(*q,1.95),(.23,.055,3.60),a)
  for d in [-.20,.20]:
   q=p+v*d+u*.13;beam('Entry pull handles','hall_bronze',(*q,1.1),(*q,1.8),.025,sides=8)
 cube('Entry upper transom','hall_glass',(*c,3.88),(.16,10.8,.26),a)
 for y in [-5.05,5.05]:
  q=c+v*y;cube('Entry sidelights','hall_glass',(*q,1.95),(.16,.5,3.60),a)
  cube('Entry return jambs','hall_stone',(*q,2.08),(1.35,.15,3.86),a)
 p=Vector((cx,cy))+u*(R+1.5)
 cube('Entrance canopy','hall_metal',(*p,4.2),(5.0,12.0,.22),a)
 q=Vector((cx,cy))+u*(R+4.0);cube('Entrance sign fascia','hall_metal',(*q,4.2),(.12,12.0,.65),a)
 for y in [-5.5,5.5]:
  q=p+u*1.8+v*y;beam('Canopy columns','hall_bronze',(*q,.15),(*q,4.10),.12,sides=8)
# Quiet resting places stay between the entrance axes, never across the doors.
for k in range(4):
 a=math.pi/4+k*math.pi/2;p=Vector((cx,cy))+Vector((math.cos(a),math.sin(a)))*(R+3.7);tangent=a+math.pi/2
 for row in range(5):
  q=p+Vector((math.cos(a),math.sin(a)))*(row-2)*.095
  cube('Concourse bench timber','hall_timber',(*q,.59),(2.2,.08,.08),tangent)
 for off in [-.85,.85]:
  q=p+Vector((-math.sin(a),math.cos(a)))*off
  cube('Concourse bench legs','hall_bronze',(*q,.36),(.08,.4,.42),tangent)
# A continuous shallow radial roof. Source height remains unchanged in source data.
def roof_z(r):return 9.25+4.75*(1-(r/(R+1.6))**2)
roof_radius=R+1.6
for radial in range(24):
 r0=roof_radius*radial/24;r1=roof_radius*(radial+1)/24
 for i in range(192):
  a=i*math.tau/192;b=(i+1)*math.tau/192
  pts=[pos(r0,a,roof_z(r0)),pos(r1,a,roof_z(r1)),pos(r1,b,roof_z(r1)),pos(r0,b,roof_z(r0))]
  if radial==0:pts=pts[:3]
  face('Shallow roof shell','hall_metal',pts)
  face('Roof underside','hall_dark',[(x,y,z-.22) for x,y,z in reversed(pts)])
for i in range(192):
 a=i*math.tau/192;b=(i+1)*math.tau/192
 face('Roof edge fascia','hall_metal',[pos(roof_radius,a,roof_z(roof_radius)),pos(roof_radius,a,roof_z(roof_radius)-.22),pos(roof_radius,b,roof_z(roof_radius)-.22),pos(roof_radius,b,roof_z(roof_radius))])
 if i%2==0:
  for j in range(16):
   r0=4+(roof_radius-4)*j/16;r1=4+(roof_radius-4)*(j+1)/16
   beam('Radial roof standing seams','hall_stone',pos(r0,a,roof_z(r0)+.015),pos(r1,a,roof_z(r1)+.015),.025,sides=5)
# A light central lens is raised above the main roof, not a painted oval.
# Its geometry is an authored interpretation of the official bird's-eye ensemble.
for i in range(64):
 x0=-40+80*i/64;x1=-40+80*(i+1)/64
 w0=14*max(0,1-(x0/40)**2);w1=14*max(0,1-(x1/40)**2)
 for sign in [-1,1]:
  z0=roof_z(abs(x0))+.45+1.35*max(0,1-(x0/40)**2);z1=roof_z(abs(x1))+.45+1.35*max(0,1-(x1/40)**2)
  pts=[(cx+x0,cy,z0),(cx+x1,cy,z1),(cx+x1,cy+sign*w1,roof_z(math.hypot(x1,w1))+.45),(cx+x0,cy+sign*w0,roof_z(math.hypot(x0,w0))+.45)]
  if sign<0:pts.reverse()
  face('Central lens canopy','hall_metal',pts)
  face('Central lens underside','hall_dark',[(x,y,z-.12) for x,y,z in reversed(pts)])
  edge0=(cx+x0,cy+sign*w0,roof_z(math.hypot(x0,w0))+.45);edge1=(cx+x1,cy+sign*w1,roof_z(math.hypot(x1,w1))+.45)
  face('Lens fascia','hall_metal',[edge0,edge1,(edge1[0],edge1[1],edge1[2]-.12),(edge0[0],edge0[1],edge0[2]-.12)])
  beam('Lens edge structure','hall_dark',(cx+x0,cy+sign*w0,roof_z(math.hypot(x0,w0))+.4),(cx+x1,cy+sign*w1,roof_z(math.hypot(x1,w1))+.4),.10,sides=8)
# Radial space-frame chords meet the perimeter ring and a central compression ring.
# These supports are designed for visual coherence, not a structural certification.
for i in range(24):
 a=i*math.tau/24
 for j in range(18):
  r0=5+(R-5)*j/18;r1=5+(R-5)*(j+1)/18
  top0=pos(r0,a,roof_z(r0)-.30);top1=pos(r1,a,roof_z(r1)-.30)
  low0=pos(r0,a,roof_z(r0)-(.9+1.8*(1-r0/R)));low1=pos(r1,a,roof_z(r1)-(.9+1.8*(1-r1/R)))
  beam('Roof radial upper chords','hall_metal',top0,top1,.09,sides=8)
  beam('Roof radial lower chords','hall_metal',low0,low1,.09,sides=8)
  beam('Roof truss diagonals','hall_dark',top0,low1,.04,sides=6)
  beam('Roof truss verticals','hall_dark',top0,low0,.04,sides=6)
for zoff in [-.30,-(.9+1.8*(1-5/R))]:
 for i in range(96):
  beam('Roof central compression ring','hall_metal',pos(5,i*math.tau/96,roof_z(5)+zoff),pos(5,(i+1)*math.tau/96,roof_z(5)+zoff),.12,sides=8)
# Two external masts with visibly anchored support stays, authorial dimensions.
for side in [-1,1]:
 anchor=Vector((cx+side*(R+5),cy+side*11,.15));top=Vector((cx+side*(R+2),cy+side*11,26))
 beam('Cable mast','hall_metal',anchor,top,.32,.18,sides=12)
 slab('Mast footing','hall_stone',Point(anchor.x,anchor.y).buffer(1.2),0,.40)
 for theta in [-.65,-.35,0,.35,.65]:
  a=(0 if side>0 else math.pi)+theta
  end=Vector(pos(roof_radius*.83,a,roof_z(roof_radius*.83)+.02))
  beam('Roof suspension stays','hall_dark',top,end,.026,sides=6)
# Interior study: a coherent multipurpose spectator bowl, not an as-built seat inventory.
mat('hall_seats',(.26,.27,.25),.06,.50)
radial_aisles=unary_union([LineString([pos(30,i*math.tau/12,0)[:2],pos(50,i*math.tau/12,0)[:2]]).buffer(.95,cap_style=2) for i in range(12)])
for row in range(16):
 r0=31+row*1.1;r1=r0+1.1;level=.15+(row+1)*.35
 terrace=circle(r1).difference(circle(r0)).difference(radial_aisles)
 slab('Spectator terraces','hall_stone',terrace,.15,level-.15)
 count=int(math.tau*(r0+.55)/.62)
 for seat in range(count):
  a=seat*math.tau/count;p=Point(*pos(r0+.55,a,0)[:2])
  if radial_aisles.buffer(.28).contains(p):continue
  center=pos(r0+.55,a,level+.44);angle=a+math.pi/2
  cube('Individual spectator seats','hall_seats',center,(.46,.44,.07),angle)
  cube('Individual seat backs','hall_seats',pos(r0+.75,a,level+.70),(.46,.07,.46),angle)
  for side in [-1,1]:
   t=a+side*.15/(r0+.55)
   cube('Seat pedestal supports','hall_dark',pos(r0+.55,t,level+.22),(.04,.28,.40),angle)
# Two comfortable half-steps per seating row; aisles are not solid ramps through seats.
for aisle in range(12):
 a=aisle*math.tau/12
 for step in range(32):
  r0=31+step*.55;r1=r0+.55;top=.15+(step+1)*.175
  tile=circle(r1).difference(circle(r0)).intersection(radial_aisles).intersection(Polygon([pos(0,a,0)[:2],pos(60,a-.05,0)[:2],pos(60,a+.05,0)[:2]]))
  slab('Spectator aisle steps','hall_stone',tile,.15,top-.15)
  beam('Stair tread nosing','hall_dark',pos(r0,a-.8/r0,top+.008),pos(r0,a+.8/r0,top+.008),.015,sides=4)
for aisle in range(12):
 a=aisle*math.tau/12
 for side in [-1,1]:
  for j in range(16):
   r0=31+j*1.1;r1=r0+1.1;z0=.15+j*.35+1.0;z1=z0+.35
   beam('Bowl aisle handrail','hall_bronze',pos(r0,a+side*.9/r0,z0),pos(r1,a+side*.9/r1,z1),.035,sides=6)
   beam('Bowl aisle handrail posts','hall_bronze',pos(r1,a+side*.9/r1,z1-1.0),pos(r1,a+side*.9/r1,z1),.035,sides=6)
# Upper concourse and eight turning stair flights connect back to the real ground level.
upper=circle(54).difference(circle(48.6));slab('Upper spectator concourse','hall_stone',upper,5.55,.20)
for i in range(8):
 a0=(i//2)*math.pi/2+(.05 if i%2==0 else -.05);direction=1 if i%2==0 else -1
 for step in range(33):
  a=a0+direction*step*.33/55;b=a0+direction*(step+1)*.33/55;top=.15+(step+1)*5.60/33
  tile=Polygon([pos(54,a,0)[:2],pos(56,a,0)[:2],pos(56,b,0)[:2],pos(54,b,0)[:2]])
  slab('Concourse access stair','hall_stone',tile,max(.15,top-.25),min(.25,top-.15))
  for radius in [54.15,55.85]:beam('Access stair side stringers','hall_stone',pos(radius,a,max(.15,top-.25-5.60/33)),pos(radius,b,max(.15,top-.25)),.11,sides=6)
  if step%3==0:
   beam('Access stair balusters','hall_bronze',pos(55.9,a,top),pos(55.9,a,top+1.05),.035,sides=6)
  beam('Access stair handrails','hall_bronze',pos(55.9,a,top+1.05-5.60/33),pos(55.9,b,top+1.05),.035,sides=6)
  beam('Access stair inner handrails','hall_bronze',pos(54.1,a,top+1.05-5.60/33),pos(54.1,b,top+1.05),.035,sides=6)
  if step%3==0:beam('Access stair inner balusters','hall_bronze',pos(54.1,a,top),pos(54.1,a,top+1.05),.035,sides=6)
for i in range(8):
 direction=1 if i%2==0 else -1;a0=(i//2)*math.pi/2+direction*(.05+33*.33/55);a1=a0+direction*1.30/55
 landing=Polygon([pos(54,a0,0)[:2],pos(56,a0,0)[:2],pos(56,a1,0)[:2],pos(54,a1,0)[:2]])
 slab('Stair turning landings','hall_stone',landing,5.55,.20)
 beam('Landing support column','hall_stone',pos(55.5,(a0+a1)/2,.15),pos(55.5,(a0+a1)/2,5.55),.18,sides=10)
 beam('Landing outer guardrail','hall_bronze',pos(55.9,a0,6.80),pos(55.9,a1,6.80),.035,sides=6)
 beam('Landing end post','hall_bronze',pos(55.9,a1,5.75),pos(55.9,a1,6.80),.035,sides=6)
 beam('Landing end guardrail','hall_bronze',pos(54.0,a1,6.80),pos(55.9,a1,6.80),.035,sides=6)
 for j in range(17):
  r=54+j*1.9/16;beam('Landing end infill','hall_bronze',pos(r,a1,5.85),pos(r,a1,6.78),.012,sides=5)
for i in range(24):
 a=i*math.tau/24;beam('Upper concourse supports','hall_stone',pos(52.5,a,.15),pos(52.5,a,5.55),.24,sides=10)
landing_angles=[(i//2)*math.pi/2+(1 if i%2==0 else -1)*(.05+33*.33/55+.65/55) for i in range(8)]
for i in range(256):
 a=i*math.tau/256;b=(i+1)*math.tau/256
 if any(abs(math.atan2(math.sin((a+b)/2-e),math.cos((a+b)/2-e)))<.014 for e in landing_angles):continue
 beam('Upper concourse guardrail','hall_bronze',pos(53.9,a,6.80),pos(53.9,b,6.80),.035,sides=6)
 beam('Upper concourse guardrail posts','hall_bronze',pos(53.9,a,5.75),pos(53.9,a,6.80),.035,sides=6)
 for k in range(1,10):
  angle=a+(b-a)*k/10;beam('Concourse guard infill','hall_bronze',pos(53.9,angle,5.85),pos(53.9,angle,6.78),.012,sides=5)
# Floor marking is an illustrative basketball layout, not a claim of current installed paint.
for index,c in enumerate([(.46,.31,.18),(.48,.33,.20),(.45,.30,.17),(.47,.32,.19)]):mat('Court maple '+str(index),c,0,.72)
for row in range(116):
 y0=cy-10.44+row*.18;y1=y0+.176
 for column in range(15):
  x0=cx-18+column*2.4+(1.2 if row%2 else 0);x1=x0+2.394
  x0=max(cx-17,x0);x1=min(cx+17,x1)
  if x1<=x0:continue
  slab('Individual court floorboards','Court maple '+str((row*7+column*3)%4),box(x0,y0,x1,y1),.1505,.001)
court=box(cx-14,cy-7.5,cx+14,cy+7.5)
slab('Court border','porcelain',court.boundary.buffer(.025),.153,0)
line('Court centre line','porcelain',[(cx,cy-7.5),(cx,cy+7.5)],.05,.153,0)
slab('Court centre circle','porcelain',Point(cx,cy).buffer(1.8).boundary.buffer(.025),.153,0)
for side in [-1,1]:
 x=cx+side*14
 line('Court key','porcelain',[(x,cy-2.45),(x-side*5.8,cy-2.45),(x-side*5.8,cy+2.45),(x,cy+2.45)],.05,.153,0)
 anchor=(cx+side*17,cy,.15)
 cube('Basket padded base','hall_dark',(anchor[0],cy,.65),(2.5,1.8,1.0))
 beam('Basket stanchion','hall_metal',(anchor[0],cy,1.0),(cx+side*12.8,cy,3.65),.16,sides=10)
 cube('Backboard','porcelain',(cx+side*12.8,cy,3.575),(.055,1.8,1.05))
 ring=Point(cx+side*12.425,cy).buffer(.225,quad_segs=24).boundary.buffer(.015)
 slab('Basket hoop','hall_bronze',ring,3.185,.03)
# Complete the authored playing-line layout and actual open basket nets.
for side in [-1,1]:
 x=cx+side*14;hoop_x=cx+side*12.425;free_x=x-side*5.8
 theta=math.asin(6.6/6.75);arc=[]
 for i in range(97):
  a=-theta+2*theta*i/96;arc.append((hoop_x-side*6.75*math.cos(a),cy+6.75*math.sin(a)))
 line('Three point arc','porcelain',arc,.05,.153,0)
 for sign in [-1,1]:line('Three point corners','porcelain',[(x,cy+sign*6.6),(arc[0][0],cy+sign*6.6)],.05,.153,0)
 line('Free throw semicircle','porcelain',[(free_x-side*1.8*math.cos(-math.pi/2+i*math.pi/48),cy+1.8*math.sin(-math.pi/2+i*math.pi/48)) for i in range(49)],.05,.153,0)
 for strand in range(16):
  a=strand*math.tau/16;b=a+.25
  beam('Basket net strands','porcelain',(hoop_x+.225*math.cos(a),cy+.225*math.sin(a),3.18),(hoop_x+.14*math.cos(b),cy+.14*math.sin(b),2.72),.004,sides=4)
 for tier in range(1,5):
  z=3.18-tier*.092;r=.225-tier*.017
  for strand in range(32):
   a=strand*math.tau/32;b=(strand+1)*math.tau/32
   beam('Basket net ties','porcelain',(hoop_x+r*math.cos(a),cy+r*math.sin(a),z),(hoop_x+r*math.cos(b),cy+r*math.sin(b),z),.003,sides=4)
# Team benches and a compact officials' desk live outside the marked playing area.
for side in [-1,1]:
 for seat in range(8):
  x=cx+side*(5+seat*.62)
  cube('Sideline seating','hall_seats',(x,cy+10.5,.59),(.46,.46,.07))
  cube('Sideline seat backs','hall_seats',(x,cy+10.72,.85),(.46,.07,.46))
  cube('Sideline seat supports','hall_dark',(x,cy+10.5,.36),(.10,.34,.42))
cube('Officials desk top','hall_timber',(cx,cy+10.5,.90),(3.6,.80,.08))
for off in [-1.4,1.4]:cube('Officials desk legs','hall_dark',(cx+off,cy+10.5,.51),(.08,.65,.72))
# Close-up entry camera uses a human eye level; roofs also get an independent view.
for (owner,material),(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(owner);mesh.from_pydata(verts,[],faces);mesh.update()
 if (owner,material) in foliage_uv:
  layer=mesh.uv_layers.new(name='Leaf albedo UV')
  for polygon,coords in zip(mesh.polygons,foliage_uv[(owner,material)]):
   for loop,uv in zip(polygon.loop_indices,coords):layer.data[loop].uv=uv
 obj=bpy.data.objects.new(owner,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(M[material]);obj['designRole']=owner
 if owner in ['Individual spectator seats','Individual seat backs','Sideline seating','Sideline seat backs']:
  bevel=obj.modifiers.new('Rounded seating edges','BEVEL');bevel.width=.025;bevel.segments=3
root=bpy.data.objects.new('Sports hall — illustrative work in progress',None);bpy.context.collection.objects.link(root)
root['sourceFeatureIds']=[fid];root['originWGS84']=[OX,OY];root['metersPerDegree']=[SX,SY];root['sourceCommit']='8cdd754f6355de11d9d0d6bb367d6a66cbf7c330';root['modelRole']='illustrative authored architecture and interior; not a surveyed building or certified structure';root['sourceGeometryUnchanged']=True;root['status']='WORK_IN_PROGRESS';root['footprintTreatment']='Circular display interpretation around the retained source centroid; original source polygon is unchanged'
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':obj.parent=root
for a in entry_angles:
 sign_position=pos(R+4.075,a,4.05)
 bpy.ops.object.text_add(location=sign_position,rotation=(math.pi/2,0,a+math.pi/2))
 sign=bpy.context.object;sign.name='Sports hall entrance identification';sign.data.body='体育馆';sign.data.align_x='CENTER';sign.data.size=.45;sign.data.extrude=.006;sign.data.font=bpy.data.fonts.load('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');sign.data.materials.append(M['hall_bronze']);bpy.ops.object.convert(target='MESH');sign.parent=root
scene=bpy.context.scene;scene['buildScriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
for name,path in [('BUILD_RECIPE.py',Path(__file__)),('PRIMITIVES_RECIPE.py',Path(__file__).parent/'architecture_primitives.py'),('LANDSCAPE_RECIPE.py',Path(__file__).parent/'landscape_primitives.py')]:bpy.data.texts.new(name).write(path.read_text())
world=bpy.data.worlds.new('Sports hall daylight');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.84,.88,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.4,-.4,-.5);sun.data.energy=2.5;sun.data.angle=.15
for i in range(8):
 a=i*math.tau/8;bpy.ops.object.light_add(type='AREA',location=pos(32,a,roof_z(32)-1.5));lamp=bpy.context.object;lamp.name='Hall interior luminaire';lamp.data.energy=1800;lamp.data.shape='DISK';lamp.data.size=2.0;lamp.data.color=(1,.96,.88)
mat('Hall luminaire diffuser',(.95,.93,.86),0,.4)
shader=M['Hall luminaire diffuser'].node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(1,.96,.88,1);shader.inputs['Emission Strength'].default_value=4
for dx in [-8,8]:
 for dy in [-5,5]:
  bpy.ops.mesh.primitive_cube_add(size=1,location=(cx+dx,cy+dy,10.55));fixture=bpy.context.object;fixture.name='Court luminaire housing';fixture.dimensions=(1.6,.8,.14);fixture.data.materials.append(M['hall_metal']);fixture.parent=root
  bpy.ops.mesh.primitive_cube_add(size=1,location=(cx+dx,cy+dy,10.47));fixture=bpy.context.object;fixture.name='Court luminaire diffuser';fixture.dimensions=(1.5,.70,.02);fixture.data.materials.append(M['Hall luminaire diffuser']);fixture.parent=root
  for ox in [-.60,.60]:
   high=roof_z(math.hypot(dx+ox,dy))-.30;low=10.62
   bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.012,depth=high-low,location=(cx+dx+ox,cy+dy,(high+low)/2));hanger=bpy.context.object;hanger.name='Luminaire suspension rod';hanger.data.materials.append(M['hall_dark']);hanger.parent=root
  bpy.ops.object.light_add(type='AREA',location=(cx+dx,cy+dy,10.44));lamp=bpy.context.object;lamp.name='Court downlight';lamp.data.energy=1800;lamp.data.shape='RECTANGLE';lamp.data.size=1.5;lamp.data.size_y=.7;lamp.data.color=(1,.96,.88)
for i in range(24):
 a=i*math.tau/24;location=pos(58,a,8.35)
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);fixture=bpy.context.object;fixture.name='Outer concourse light housing';fixture.dimensions=(1.8,.45,.12);fixture.rotation_euler[2]=a+math.pi/2;fixture.data.materials.append(M['hall_metal']);fixture.parent=root
 bpy.ops.mesh.primitive_cube_add(size=1,location=(location[0],location[1],8.28));fixture=bpy.context.object;fixture.name='Outer concourse diffuser';fixture.dimensions=(1.7,.38,.02);fixture.rotation_euler[2]=a+math.pi/2;fixture.data.materials.append(M['Hall luminaire diffuser']);fixture.parent=root
 bpy.ops.object.light_add(type='AREA',location=(location[0],location[1],8.25));lamp=bpy.context.object;lamp.name='Outer concourse downward light';lamp.rotation_euler[2]=a+math.pi/2;lamp.data.energy=600;lamp.data.shape='RECTANGLE';lamp.data.size=1.7;lamp.data.size_y=.38;lamp.data.color=(1,.96,.88)
 for offset in [-.65,.65]:
  x=location[0]-math.sin(a)*offset;y=location[1]+math.cos(a)*offset;high=roof_z(math.hypot(x-cx,y-cy))-.30;low=8.41
  bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.012,depth=high-low,location=(x,y,(high+low)/2));hanger=bpy.context.object;hanger.name='Concourse luminaire hanger';hanger.data.materials.append(M['hall_dark']);hanger.parent=root
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.clip_end=2000
scene.render.engine='CYCLES';scene.cycles.samples=next((int(a.split('=',1)[1]) for a in sys.argv if a.startswith('--samples=')),48);scene.cycles.use_denoising=False
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=85;scene.view_settings.view_transform='AgX'
views=[('hall-overview',(cx+150,cy-150,130),(cx,cy,8),170,32),('hall-entry',(cx+R+22,cy-12,1.8),(cx+R,cy,3.8),None,30),('roof-structure',(cx+110,cy+10,29),(cx,cy,12),None,28)]
views.append(('stair-top-turn',pos(55,.26,7.5),pos(48,.27,6.4),None,24))
views.append(('concourse-stair',(cx+59,cy+1,1.8),(cx+54,cy+9,3.8),None,22))
views.append(('court-eye-level',(cx+19,cy-18,1.85),(cx,cy,2.0),None,22))
views.append(('interior-bowl',(cx+40,cy-25,7.3),(cx,cy,1.4),None,20))
views.append(('roof-understructure',(cx,cy,1.8),(cx+25,cy+35,11),None,18))
selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--views=')),None)
for i,(name,location,target,ortho,lens) in enumerate(views):
 cam.location=location;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
 if ortho:cam.data.ortho_scale=ortho
 if i==0:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'sports-hall.blend'),compress=True)
 if selected is not None and name not in selected:continue
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('SPORTS HALL DRAFT — NOT ACCEPTED OR INTEGRATED')
