"""Cartographic water surfaces and bounded shore curves, never routing geometry."""
import math
import copy
import numpy as np
from shapely.geometry import Polygon,MultiPolygon,MultiLineString,LineString,Point
from shapely.ops import unary_union,transform
from shapely.strtree import STRtree

CHANNEL_DISPLAY_POLICY={
    'basis':'All explicitly open acquired waterways receive a source-width or bounded cartographic ribbon. Existing interpreted widths take precedence; source water islands, buildings and retained island paving stay protected.',
    'defaultWidthsM':{'stream':8,'canal':12,'river':16},
    'proxyMaximumDefaultFactor':2,'sourceInteriorSamplingSpacingM':20,
    'roadDryMarginMaximumM':1.5,
    'roadMarginBasis':'Preserve a cartographic dry margin along recorded non-bridge surface roads without an acquired open-water centreline crossing. This does not establish road width, access or a new crossing.',
    'mouthTransitionLengthWidths':2,
    'mouthBasis':'Outside acquired water polygons, blend illustrative channel banks into the adjoining recorded water cross-section. Only existing centreline intersections form mouths; no new water connection is inferred.',
    'actualBankSurveyed':False,'groundOrRoutingChanged':False,
}


def open_channel_records(features,geometries,observations):
    """Bind every open source channel to a stated display-width basis.

    Existing individually interpreted widths remain authoritative for display.
    Elsewhere a source width wins; unmeasured channels use a restrained proxy,
    informed by their own source centreline's clearance inside recorded water.
    These are rendering dimensions, never new routing or surveyed bank facts.
    """
    water=unary_union([geometries[f['id']] for f in features if f['properties']['kind']=='water'])
    boundary=water.boundary
    overrides={r['id']:r for r in observations.get('segments',[])}
    records=[]
    for feature in features:
        prop=feature['properties'];fid=feature['id']
        if prop['kind']!='waterway' or prop.get('tunnel') in ('culvert','yes'):continue
        if fid in overrides:
            records.append({**overrides[fid],'basis':observations['basis']});continue
        line=geometries[fid]
        try:source_width=float(str(prop.get('width','')).strip().removesuffix('m').strip())
        except ValueError:source_width=0
        if not math.isfinite(source_width) or source_width<=0:source_width=0
        typical=CHANNEL_DISPLAY_POLICY['defaultWidthsM'].get(prop.get('waterway'),8)
        spacing=CHANNEL_DISPLAY_POLICY['sourceInteriorSamplingSpacingM']
        stations=np.arange(spacing/2,line.length,spacing) if line.length>spacing else [line.length/2]
        points=[line.interpolate(distance) for distance in stations]
        diameters=[2*p.distance(boundary) for p in points if water.contains(p)]
        inferred=float(np.median(diameters)) if diameters else typical
        width=source_width or round(max(typical,min(typical*CHANNEL_DISPLAY_POLICY['proxyMaximumDefaultFactor'],inferred))/2)*2
        records.append({'id':fid,'illustrativeWidthM':width,
            'widthBasis':'source-tag' if source_width else 'cartographic-proxy',
            'sourceWidthM':source_width or None,'actualWidthM':None,
            'sourceInteriorSamples':len(diameters),
            'basis':'沿既有水道中线保持连续河面。来源宽度优先；其余宽度按水道类别与相邻已记录水面概化，未测定实际岸线。'})
    return records


def channel_road_margins(features,geometries,records):
    """Inferred banks yield to recorded roads that do not cross a channel.

    A small dry margin is cartographic separation, not a road-width survey.
    The distance limit keeps the mask off every source channel centreline.
    Bridge traces and explicitly underground roads are not dry-bank masks.
    """
    lines=[geometries[r['id']] for r in records]
    tree=STRtree(lines);radius=max(r['illustrativeWidthM'] for r in records)/2
    maximum_margin=CHANNEL_DISPLAY_POLICY['roadDryMarginMaximumM']
    masks=[];ids=[]
    for feature in features:
        p=feature['properties'];road=geometries[feature['id']]
        if p['kind']!='road' or road.geom_type!='LineString' or p.get('bridge') not in (None,'','no') or p.get('tunnel') in ('yes','culvert'):continue
        if len(tree.query(road,predicate='intersects')):continue
        distance=road.distance(lines[int(tree.nearest(road))])
        if not 0<distance<radius+maximum_margin:continue
        margin=min(maximum_margin,distance/2)
        masks.append(road.buffer(margin,cap_style='flat',join_style='round',quad_segs=8));ids.append(feature['id'])
    return unary_union(masks),ids


def geographic_water_surface(surface,to_wgs):
    """Retain union topology in the final coordinate frame.

    Point-touching metric polygons can gain a tiny overlap when their straight
    edges are transformed nonlinearly. Union the individually valid projected
    parts again; do not snap coordinates or repair malformed component rings.
    """
    projected=transform(to_wgs,surface)
    if projected.geom_type!='MultiPolygon':return projected
    if any(not part.is_valid for part in projected.geoms):
        raise ValueError('Projected water component has an invalid ring')
    return unary_union(list(projected.geoms))


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


def channel_display(line,width,water=None):
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
    curve=LineString(points)
    if water is None or water.is_empty or not curve.intersects(water):
        return curve.buffer(width/2,cap_style='flat',join_style='round',quad_segs=16)

    # A constant-width strip unioned with a wider source polygon leaves a
    # square step at the acquisition boundary. Build only the exposed parts,
    # easing their banks into the adjoining water instead of widening it.
    exposed=curve.difference(water)
    pieces=[exposed] if exposed.geom_type=='LineString' else list(exposed.geoms)
    ribbons=[]
    for segment in pieces:
        if segment.geom_type!='LineString' or segment.is_empty:continue
        ends=[]
        for station,direction in [(0,1),(segment.length,-1)]:
            point=segment.interpolate(station)
            if point.distance(water)>1e-7:
                ends.append(None);continue
            p=np.asarray(point.coords[0])
            inward=np.asarray(segment.interpolate(station+direction*min(1,segment.length/2)).coords[0])-p
            inward/=np.linalg.norm(inward)
            tangent=inward*direction
            normal=np.array([-tangent[1],tangent[0]])
            probe=p-inward*min(1,width/4)
            cut=LineString([probe-normal*width*2,probe+normal*width*2]).intersection(water)
            cuts=[cut] if cut.geom_type=='LineString' else list(cut.geoms) if hasattr(cut,'geoms') else []
            enclosing=[g for g in cuts if g.geom_type=='LineString' and g.distance(Point(probe))<1e-7]
            if not enclosing:
                ends.append(None);continue
            offsets=[np.dot(np.asarray(q)-probe,normal) for q in enclosing[0].coords]
            radii=(max(offsets),-min(offsets))
            ends.append(radii)
            # The acquisition edge need not be perpendicular to the stream.
            # Carry the mouth into the recorded surface so the two diagonal
            # cross-sections cannot leave a hairline triangular land sliver.
            left,right=p+normal*radii[0],p-normal*radii[1]
            overlap=inward*width/2
            ribbons.append(Polygon([left,right,right-overlap,left-overlap]))
        if not any(ends):
            ribbons.append(segment.buffer(width/2,cap_style='flat',join_style='round',quad_segs=16));continue

        stations={0.,segment.length}
        stations.update(segment.project(Point(p)) for p in segment.coords)
        stations.update(np.arange(0,segment.length,2))
        section=[]
        for station in sorted(stations):
            p=np.asarray(segment.interpolate(station).coords[0])
            radii=np.array([width/2,width/2])
            for end,distance in zip(ends,[station,segment.length-station]):
                if end is None:continue
                length=min(segment.length/2,CHANNEL_DISPLAY_POLICY['mouthTransitionLengthWidths']*max(width,sum(end)))
                t=max(0,1-distance/length);weight=t*t*(3-2*t)
                radii+=(np.asarray(end)-width/2)*weight
            section.append((p,radii))
        # Segment trapezoids and their joins retain the centreline even at a
        # sharp source bend. Union handles overlap without repairing bad rings.
        strips=[];previous=None
        for (a,ar),(b,br) in zip(section,section[1:]):
            tangent=b-a;length=np.linalg.norm(tangent)
            if length==0:continue
            normal=np.array([-tangent[1],tangent[0]])/length
            left,right=a+normal*ar[0],a-normal*ar[1]
            far_left,far_right=b+normal*br[0],b-normal*br[1]
            strips.append(Polygon([left,right,far_right,far_left]))
            if previous is not None:
                strips.extend(p for p in [Polygon([a,previous[0],left]),Polygon([a,right,previous[1]])] if p.area>0)
            previous=(far_left,far_right)
        ribbons.append(unary_union(strips))
    return unary_union(ribbons)


def water_display_surface(features,geometries,observations,protected_land,base_refinement=None):
    """One water composition for a full build or a current-snapshot refresh."""
    polygons=[geometries[f['id']] for f in features if f['properties']['kind']=='water']
    water=unary_union(polygons)
    islands=unary_union([Polygon(ring) for g in polygons
        for p in (g.geoms if g.geom_type=='MultiPolygon' else [g]) for ring in p.interiors])
    records=open_channel_records(features,geometries,observations)
    road_margin,road_ids=channel_road_margins(features,geometries,records)
    buildings=unary_union([geometries[f['id']] for f in features if f['properties']['kind']=='building'])
    protected=unary_union([islands,road_margin,buildings,protected_land])
    ribbons=[];generated=[]
    for record in records:
        ribbon=channel_display(geometries[record['id']],record['illustrativeWidthM'],water)
        surface=ribbon.difference(protected)
        ribbons.append(surface)
        generated.append({**record,'bankSurveyed':False,'routingSourceChanged':False,
            'protectedLandOverlapM2':round(ribbon.area-surface.area,2)})
    merged=unary_union([water,*ribbons]).difference(protected_land)
    smooth,shore_records=reviewed_water_surface(merged,
        {fid:geometries[fid] for fid in ['relation/9772853','relation/7927357']},base_refinement)
    # Refinement must not erase the land/road protection used by the ribbons.
    smooth=smooth.difference(protected.difference(water))
    return smooth,generated,road_ids,shore_records,copy.deepcopy(CHANNEL_DISPLAY_POLICY)
