"""Bounded display curves on reviewed lake shores, never routing geometry."""
import math
import numpy as np
from shapely.geometry import Polygon,MultiPolygon,MultiLineString,LineString


def shore_ring(ring,budget):
    points=np.asarray(ring.coords)[:-1];out=[]
    for i,p in enumerate(points):
        before=points[i-1];after=points[(i+1)%len(points)]
        a=p-before;b=after-p;la=np.linalg.norm(a);lb=np.linalg.norm(b)
        if min(la,lb)<.2:out.append(p.tolist());continue
        turn=math.acos(float(np.clip(np.dot(a,b)/(la*lb),-1,1)))
        # Square or sharper constructed banks and pointed landforms stay put.
        if not math.radians(2)<turn<math.radians(78):out.append(p.tolist());continue
        distance=min(la*.32,lb*.32,14,budget/max(math.sin(turn/2),.01)*1.35)
        start=p-a/la*distance;end=p+b/lb*distance
        samples=max(5,math.ceil(2*distance/.5))
        for t in np.linspace(0,1,samples):
            out.append(((1-t)**2*start+2*(1-t)*t*p+t*t*end).tolist())
    return out+[out[0]]


def reviewed_shore(poly,max_offset=2):
    # Local curve failures keep the source form; they do not erase islands.
    for budget in [max_offset,max_offset*.7,max_offset*.45]:
        refined=Polygon(shore_ring(poly.exterior,budget),[shore_ring(r,budget) for r in poly.interiors])
        if refined.is_valid and len(refined.interiors)==len(poly.interiors):
            error=poly.boundary.hausdorff_distance(refined.boundary)
            if error<=max_offset and abs(refined.area/poly.area-1)<.012:
                return refined,round(error,3)
    return poly,0


def reviewed_water_surface(merged,reviewed,base_refinement=None):
    polygons=list(merged.geoms) if merged.geom_type=='MultiPolygon' else [merged]
    out=[];records=[]
    for poly in polygons:
        ids=[fid for fid,g in reviewed.items() if poly.intersection(g).area>g.area*.5]
        if ids:
            refined,error=reviewed_shore(poly)
            out.append(refined);records.append({'ids':ids,'maximumDisplayOffsetM':error,'sourceGroundChanged':False,'holesRetained':len(poly.interiors)})
        else:out.append(base_refinement(poly) if base_refinement else poly)
    result=out[0] if len(out)==1 else MultiPolygon(out)
    return (result if result.is_valid else merged),records


def named_water_display(source,surface,max_offset=2):
    """Hits follow visible water; emphasis follows its actual outer rim.

    Named acquisition polygons sometimes end inside a continuous river.
    Their internal edge must not appear as a dam. The mask allowance only
    follows the bounded display interpolation, without editing ground data.
    """
    mask=source.buffer(max_offset+.05)
    hit=surface.intersection(mask)
    rim=surface.boundary.intersection(mask)
    lines=[]
    def collect(g):
        if g.geom_type=='LineString' and g.length>.01:lines.append(g)
        elif hasattr(g,'geoms'):
            for part in g.geoms:collect(part)
    collect(rim)
    shore=lines[0] if len(lines)==1 else MultiLineString(lines)
    return hit,shore


def channel_display(line,width):
    """A bounded cartographic surface on an acquired open-water centreline.

    Width is an explicit illustration estimate, not a recovered bank survey.
    The original line, culvert classification and route topology stay intact.
    """
    ps=np.asarray(line.coords);points=[ps[0]]
    for i in range(1,len(ps)-1):
        before,p,after=ps[i-1],ps[i],ps[i+1]
        a=p-before;b=after-p;la=np.linalg.norm(a);lb=np.linalg.norm(b)
        if min(la,lb)<.2:points.append(p);continue
        turn=math.acos(float(np.clip(np.dot(a,b)/(la*lb),-1,1)))
        if not math.radians(2)<turn<math.radians(65):points.append(p);continue
        length=min(la*.28,lb*.28,5,.8/max(math.sin(turn/2),.01))
        start=p-a/la*length;end=p+b/lb*length
        points.extend((1-t)**2*start+2*(1-t)*t*p+t*t*end for t in np.linspace(0,1,9))
    points.append(ps[-1])
    return LineString(points).buffer(width/2,cap_style='flat',join_style='round',quad_segs=16)
