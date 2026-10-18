"""Exact structural normalization; no snapping, buffering or positional fit."""
import copy
import math
from shapely.geometry import MultiPolygon, Polygon, LinearRing, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union


def nonzero_surface_vertices(vertices):
    """Keep every nonzero triangle; no area tolerance or coordinate changes."""
    if len(vertices)%3:
        raise ValueError('Surface vertices must contain complete triangles')
    result=[]
    for i in range(0,len(vertices),3):
        face=vertices[i:i+3]
        if any(len(p)!=3 or not all(math.isfinite(v) for v in p) for p in face):
            raise ValueError('Surface coordinates must be finite XYZ positions')
        a,b,c=face;u=[b[j]-a[j] for j in range(3)];v=[c[j]-a[j] for j in range(3)]
        if any(u[j]*v[(j+1)%3]-u[(j+1)%3]*v[j]!=0 for j in range(3)):
            result.extend(face)
    return result


def geojson_right_hand_rule(geometry):
    """Order exported rings without changing any position or occupied region.

    RFC7946 exterior rings are counterclockwise and holes clockwise. This is
    an output contract; compatible readers may still accept older ring order.
    Invalid input needs its own source/geometry repair, not silent make-valid.
    """
    if geometry['type'] not in ['Polygon', 'MultiPolygon']:
        return geometry
    if not shape(geometry).is_valid:
        raise ValueError('Invalid polygon cannot be normalized by output ring order')
    result=copy.deepcopy(geometry)
    polygons=geometry['coordinates'] if geometry['type']=='MultiPolygon' else [geometry['coordinates']]
    output=[]
    for polygon in polygons:
        rings=[]
        for i,ring in enumerate(polygon):
            if len(ring)<4 or ring[0]!=ring[-1]:
                raise ValueError('Export ring must already be closed with at least four positions')
            ordered=list(copy.deepcopy(ring))
            if LinearRing(ring).is_ccw != (i==0):
                ordered.reverse()
            rings.append(ordered)
        output.append(rings)
    result['coordinates']=output if geometry['type']=='MultiPolygon' else output[0]
    return result


def vertices(geometry):
    parts=list(geometry.geoms) if geometry.geom_type=='MultiPolygon' else [geometry]
    return {tuple(p) for part in parts for ring in [part.exterior,*part.interiors] for p in ring.coords}


def merge_shared_boundary(geometry):
    """A union of individually valid, nonoverlapping polygons sharing lines.

    Valid disjoint/point-touch MultiPolygons and every other representation are
    untouched. Positive-area overlap and bad component rings are not repaired.
    Source member IDs/coordinates must remain available in the caller's source.
    """
    if geometry.geom_type!='MultiPolygon' or geometry.is_valid:
        return geometry,{'result':'UNCHANGED','reason':'not an invalid MultiPolygon'}
    parts=list(geometry.geoms)
    if not all(p.is_valid and not p.is_empty for p in parts):
        return geometry,{'result':'BLOCKED','reason':'invalid/empty component needs source review'}
    shared=[]
    for i,a in enumerate(parts):
        for j,b in enumerate(parts[i+1:],i+1):
            intersection=a.intersection(b)
            if intersection.area!=0:
                return geometry,{'result':'BLOCKED','reason':'positive-area overlap is not an internal seam','pair':[i,j]}
            common=a.boundary.intersection(b.boundary)
            if common.length>0:shared.append({'pair':[i,j],'boundary':common.wkt})
    if not shared:
        return geometry,{'result':'BLOCKED','reason':'no exact shared-line defect'}
    combined=unary_union(parts)
    if combined.geom_type not in ['Polygon','MultiPolygon'] or not combined.is_valid:
        return geometry,{'result':'BLOCKED','reason':'union did not yield valid polygonal occupancy'}
    # Check occupation, not the invalid MultiPolygon's set-operation behavior.
    if any(p.difference(combined).area!=0 for p in parts):
        raise ValueError('Source occupancy lost during normalization')
    remaining=combined
    for p in parts:remaining=remaining.difference(p)
    if remaining.area!=0:raise ValueError('New occupied area introduced')
    if vertices(combined)-vertices(geometry):raise ValueError('New coordinates introduced')
    combined=orient(combined,sign=1.0) if isinstance(combined,Polygon) else MultiPolygon([orient(p,sign=1.0) for p in combined.geoms])
    return combined,{'result':'NORMALIZED','shared_boundaries':shared,'parts_before':len(parts),
        'parts_after':len(combined.geoms) if combined.geom_type=='MultiPolygon' else 1,
        'holes_before':sum(len(p.interiors) for p in parts),
        'holes_after':sum(len(p.interiors) for p in combined.geoms) if combined.geom_type=='MultiPolygon' else len(combined.interiors),
        'new_vertices':0,'removed_internal_vertices':len(vertices(geometry)-vertices(combined)),
        'claim_limit':'Exact representation of the same source occupancy, not measured ground truth or height/shape acceptance'}
