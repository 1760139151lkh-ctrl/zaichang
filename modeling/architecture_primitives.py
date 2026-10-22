"""Shared mesh primitives and read-only geodata for the focused precinct.
This module does not generate campus-wide building templates.
"""
import sys, os, json, math, random, hashlib, argparse
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parent/'.deps'))
import bpy
from mathutils import Vector
from shapely.geometry import shape, Polygon, LineString, Point, box
from shapely.ops import transform, unary_union, triangulate
from shapely.affinity import rotate, translate, scale
from shapely.geometry.polygon import orient
from shapely import constrained_delaunay_triangles
from collections import defaultdict, Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'modeling'/'output'; OUT.mkdir(exist_ok=True)
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
SAMPLE='--sample' in args
OX,OY=120.085,30.3005
SX=111320*math.cos(math.radians(OY)); SY=111320
random.seed(27)
features=json.loads((ROOT/'assets/map-v2/geography.geojson').read_text())['features']
project=lambda g: transform(lambda x,y:((x-OX)*SX,(y-OY)*SY),shape(g))
allshapes={f['id']:project(f['geometry']) for f in features}
underground_ids={f['id'] for f in features if f['properties'].get('building')=='train_station' and float(f['properties'].get('layer',0))<0}
# All source identities stay in the coverage ledger, including non-rendered context.
ledger={'sourceCommit':'8cdd754f6355de11d9d0d6bb367d6a66cbf7c330','geographySha256':hashlib.sha256((ROOT/'assets/map-v2/geography.geojson').read_bytes().rstrip(b'\n')).hexdigest(),'originWGS84':[OX,OY],'metersPerDegree':[SX,SY],'status':'WORK_IN_PROGRESS','scope':'illustrative display only','objects':[]}
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
M={}
def mat(name,c,metal=0,rough=.5):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
 M[name]=m;return m
mat('limestone',(.76,.72,.64),0,.6);mat('porcelain',(.91,.88,.80),0,.38)
mat('roof',(.60,.58,.53),.1,.55);mat('bronze',(.43,.29,.12),.65,.28)
mat('glass',(.09,.145,.16),.45,.22);mat('shadow',(.055,.065,.065),0,.65)
mat('paving',(.67,.63,.55),0,.8);mat('road',(.23,.235,.23),0,.8)
mat('edge',(.84,.79,.67),0,.6);mat('water',(.22,.34,.37),.38,.23)
mat('meadow',(.48,.49,.40),0,.85);mat('leaf',(.35,.38,.29),0,.85)
mat('goldleaf',(.54,.44,.25),0,.8);mat('wood',(.26,.19,.12),0,.8)
mat('mark',(.87,.80,.61),0,.7);mat('ground',(.78,.75,.68),0,.85)
mat('track',(.39,.29,.22),0,.75);mat('turf',(.40,.43,.34),0,.85)
# Mesh batches keep geometry editable without thousands of tiny Blender objects.
batches={}
def batch(owner,material):
 return batches.setdefault((owner,material),[[],[]])
def face(owner,material,pts):
 v,f=batch(owner,material); start=len(v);v.extend(pts);f.append(tuple(range(start,start+len(pts))))
def cube(owner,material,center,size,angle=0):
 x,y,z=center;a,b,c=[k/2 for k in size];ca,sa=math.cos(angle),math.sin(angle)
 pts=[(x+u*ca-v*sa,y+u*sa+v*ca,z+w) for u,v,w in [(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]]
 vs,fs=batch(owner,material);n=len(vs);vs.extend(pts)
 fs.extend(tuple(n+i for i in f) for f in [(3,2,1,0),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)])
def polygons(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return [g]
 return [p for p in getattr(g,'geoms',[]) if p.geom_type=='Polygon']
def slab(owner,material,g,z,thickness=0):
 for p in polygons(g):
  p=orient(p,sign=1)
  for t in constrained_delaunay_triangles(p).geoms:
   if not p.covers(t.representative_point()) or t.difference(p).area>1e-5:continue
   coords=list(orient(t,sign=1).exterior.coords)[:3];face(owner,material,[(x,y,z+thickness) for x,y in coords])
   if thickness:face(owner,material,[(x,y,z) for x,y in reversed(coords)])
  if thickness:
   for ring in [p.exterior,*p.interiors]:
    pts=list(ring.coords)
    for (x,y),(u,v) in zip(pts,pts[1:]):face(owner,material,[(x,y,z),(u,v,z),(u,v,z+thickness),(x,y,z+thickness)])
def line(owner,material,coords,width,z,thickness=.06):
 if len(coords)>1:slab(owner,material,LineString(coords).buffer(width/2,cap_style=2,join_style=1),z,thickness)
def beam(owner,material,a,b,r=.12,r2=None,sides=8):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
 if u.length<.1:u=axis.cross(Vector((0,1,0)))
 u.normalize();v=axis.cross(u);r2=r if r2 is None else r2
 vv,ff=batch(owner,material);start=len(vv)
 for c,radius in [(a,r),(b,r2)]:
  for j in range(sides):vv.append(tuple(c+radius*(u*math.cos(2*math.pi*j/sides)+v*math.sin(2*math.pi*j/sides))))
 for j in range(sides):ff.append((start+j,start+(j+1)%sides,start+sides+(j+1)%sides,start+sides+j))
 ff.append(tuple(start+i for i in range(sides-1,-1,-1)));ff.append(tuple(start+sides+i for i in range(sides)))



def profile_slab(owner,material,geometry,top,depth,max_segment=1.2):
 """Closed source-plan slab; densification may return several valid surface pieces."""
 for original in polygons(geometry):
  if original.area<1e-6:continue
  for polygon in polygons(orient(original,1).segmentize(max_segment)):
   if polygon.area<1e-6:continue
   polygon=orient(polygon,1)
   for triangle in constrained_delaunay_triangles(polygon).geoms:
    if triangle.difference(polygon).area>1e-6:continue
    points=list(orient(triangle,1).exterior.coords)[:3]
    face(owner,material,[(x,y,top(x,y)) for x,y in points])
    face(owner,material,[(x,y,top(x,y)-depth) for x,y in reversed(points)])
   for ring in [polygon.exterior,*polygon.interiors]:
    points=list(ring.coords)
    for (x,y),(qx,qy) in zip(points,points[1:]):
     face(owner,material,[(x,y,top(x,y)),(x,y,top(x,y)-depth),(qx,qy,top(qx,qy)-depth),(qx,qy,top(qx,qy))])
